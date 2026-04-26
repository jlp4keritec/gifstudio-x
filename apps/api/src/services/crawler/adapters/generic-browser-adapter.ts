import type { Browser, BrowserContext, Page, Request as PwRequest } from 'playwright';
import type {
  CrawlerAdapter,
  CrawlerAdapterContext,
  CrawlerItem,
} from '../adapter';

/**
 * generic_browser : crawler base sur Playwright (Chromium headless).
 * Capable de scraper des sites JS-rendered.
 *
 * Modes de capture combines :
 * - DOM final (selecteurs CSS appliques apres rendu JS)
 * - Network intercept (capture les .mp4/.m3u8 dans les requetes faites par la page)
 *
 * Config :
 *   {
 *     url: string,                         // URL a charger (requis)
 *     waitForSelector?: string,            // attendre que cet element apparaisse (optionnel)
 *     waitForTimeout?: number,             // timeout d'attente en ms (defaut: 30000)
 *     scrollToBottom?: boolean,            // scroller jusqu'en bas pour declencher lazy-load
 *     scrollPasses?: number,               // nb de passes de scroll (defaut: 3)
 *     videoSelectors?: string[],           // selecteurs CSS pour extraire URLs videos
 *     videoRegex?: string,                 // regex sur le HTML final + sur les URLs interceptees
 *     thumbnailSelectors?: string[],       // selecteurs pour la thumbnail
 *     titleSelectors?: string[],
 *     interceptNetwork?: boolean,          // capturer les requetes .mp4/.m3u8 (defaut: true)
 *     allowedExtensions?: string[],        // defaut: ["mp4","webm","mov","m3u8"]
 *     userAgent?: string,                  // UA personnalise (defaut: Chromium)
 *     viewport?: { width: number, height: number },  // defaut: 1280x720
 *     baseUrl?: string,
 *   }
 */

const DEFAULT_VIDEO_EXTS = ['mp4', 'webm', 'mov', 'mkv', 'm3u8'];
const DEFAULT_TIMEOUT_MS = 30_000;
const HARD_PAGE_TIMEOUT_MS = 60_000;
const FETCH_NAV_TIMEOUT_MS = 30_000;

// ============================================================================
// Securite : refus des hosts prives (anti-SSRF)
// ============================================================================

function assertPublicUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('URL invalide');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Protocole non autorise (http/https uniquement)');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('169.254.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
    host.startsWith('::1') ||
    host.startsWith('fe80:') ||
    host.startsWith('fc00:') ||
    host.startsWith('fd00:')
  ) {
    throw new Error(`Host prive non autorise : ${host}`);
  }
  return parsed;
}

// ============================================================================
// Singleton Playwright (browser partage entre runs pour gagner du temps)
// ============================================================================

let cachedBrowser: Browser | null = null;
let cachedBrowserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (cachedBrowser && cachedBrowser.isConnected()) {
    return cachedBrowser;
  }
  if (cachedBrowserPromise) return cachedBrowserPromise;

  cachedBrowserPromise = (async () => {
    // Import dynamique pour eviter de planter au boot si playwright n'est pas installe
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
      ],
    });
    cachedBrowser = browser;
    cachedBrowserPromise = null;
    return browser;
  })();

  return cachedBrowserPromise;
}

export async function shutdownPlaywright(): Promise<void> {
  if (cachedBrowser) {
    try {
      await cachedBrowser.close();
    } catch (err) {
      console.warn('[generic_browser] erreur close browser:', err);
    }
    cachedBrowser = null;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function resolveUrl(base: URL, raw: string): string | null {
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

function urlHasAllowedExtension(url: string, exts: string[]): boolean {
  try {
    const u = new URL(url);
    const pathname = u.pathname.toLowerCase();
    return exts.some((ext) => pathname.endsWith(`.${ext.toLowerCase()}`));
  } catch {
    return false;
  }
}

function extractRegexMatches(text: string, pattern: string): string[] {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, 'gi');
  } catch (err) {
    throw new Error(`Regex invalide : ${(err as Error).message}`);
  }
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    found.add(match[1] ?? match[0]);
    if (found.size > 1000) break;
  }
  return Array.from(found);
}

// ============================================================================
// Capture sur la page : scroll + selecteurs + intercept network
// ============================================================================

interface CapturedData {
  finalUrl: string;
  pageTitle: string;
  htmlFinal: string;
  cssVideoUrls: string[];
  thumbnailUrls: string[];
  titleTexts: string[];
  networkUrls: string[];
}

async function capturePage(
  page: Page,
  config: Record<string, unknown>,
): Promise<CapturedData> {
  const url = String(config.url);
  const waitForSelector = (config.waitForSelector as string | undefined) ?? null;
  const waitForTimeout =
    (config.waitForTimeout as number | undefined) ?? DEFAULT_TIMEOUT_MS;
  const scrollToBottom = (config.scrollToBottom as boolean | undefined) ?? false;
  const scrollPasses = (config.scrollPasses as number | undefined) ?? 3;
  const videoSelectors = (config.videoSelectors as string[] | undefined) ?? [];
  const thumbnailSelectors =
    (config.thumbnailSelectors as string[] | undefined) ?? [];
  const titleSelectors = (config.titleSelectors as string[] | undefined) ?? [];
  const interceptNetwork =
    (config.interceptNetwork as boolean | undefined) ?? true;
  const allowedExts =
    (config.allowedExtensions as string[] | undefined) ?? DEFAULT_VIDEO_EXTS;

  const networkUrls = new Set<string>();

  // Capture des requetes reseau (avant navigation pour ne rien rater)
  if (interceptNetwork) {
    page.on('request', (req: PwRequest) => {
      const reqUrl = req.url();
      try {
        if (urlHasAllowedExtension(reqUrl, allowedExts)) {
          networkUrls.add(reqUrl);
        }
      } catch {
        /* ignore */
      }
    });
    // Capturer aussi les "media" responses (parfois sans extension visible)
    page.on('response', async (resp) => {
      const ct = resp.headers()['content-type'] ?? '';
      if (
        ct.startsWith('video/') ||
        ct.includes('mpegurl') /* hls */
      ) {
        networkUrls.add(resp.url());
      }
    });
  }

  // Navigation
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: FETCH_NAV_TIMEOUT_MS,
  });

  // Attente d'un selecteur si demande (mais ne bloque pas si timeout)
  if (waitForSelector) {
    try {
      await page.waitForSelector(waitForSelector, { timeout: waitForTimeout });
    } catch {
      // On continue meme si pas trouve : l'utilisateur verra
    }
  } else {
    // Sinon, attendre que le reseau soit a peu pres calme
    try {
      await page.waitForLoadState('networkidle', { timeout: 10_000 });
    } catch {
      /* ignore */
    }
  }

  // Auto-scroll pour declencher les lazy-loads
  if (scrollToBottom) {
    for (let i = 0; i < scrollPasses; i++) {
      await page.evaluate(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });
      });
      await page.waitForTimeout(800);
    }
    // Remonter en haut puis attendre un dernier coup
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
    await page.waitForTimeout(500);
  }

  // Recuperer le HTML final (pour la regex et les selecteurs)
  const htmlFinal = await page.content();
  const pageTitle = await page.title();
  const finalUrl = page.url();

  // Appliquer les selecteurs CSS sur le DOM final
  const cssVideoUrls = await runSelectors(page, videoSelectors, [
    'src', 'href', 'data-src', 'data-url', 'data-video', 'data-mp4',
  ]);
  const thumbnailUrls = await runSelectors(page, thumbnailSelectors, [
    'src', 'data-src', 'href',
  ]);
  const titleTexts = await runSelectors(page, titleSelectors, ['alt', 'title'], true);

  return {
    finalUrl,
    pageTitle,
    htmlFinal,
    cssVideoUrls,
    thumbnailUrls,
    titleTexts,
    networkUrls: Array.from(networkUrls),
  };
}

async function runSelectors(
  page: Page,
  selectors: string[],
  attrs: string[],
  fallbackToText = false,
): Promise<string[]> {
  if (selectors.length === 0) return [];

  return await page.evaluate(
    ({ selectors, attrs, fallbackToText }) => {
      const out = new Set<string>();
      for (const sel of selectors) {
        try {
          const els = document.querySelectorAll(sel);
          els.forEach((el) => {
            for (const attr of attrs) {
              const v = (el as HTMLElement).getAttribute(attr);
              if (v && v.trim()) {
                out.add(v.trim());
                return;
              }
            }
            if (fallbackToText) {
              const t = (el as HTMLElement).textContent?.trim();
              if (t) out.add(t);
            }
          });
        } catch {
          /* selector invalide */
        }
      }
      return Array.from(out);
    },
    { selectors, attrs, fallbackToText },
  );
}

// ============================================================================
// Adapter
// ============================================================================

export class GenericBrowserAdapter implements CrawlerAdapter {
  readonly name = 'generic_browser';

  validateConfig(config: Record<string, unknown>): void {
    const url = config.url;
    if (typeof url !== 'string' || !url.trim()) {
      throw new Error('config.url requis');
    }
    assertPublicUrl(url);

    // Au moins une source de capture doit etre active
    const videoSelectors = config.videoSelectors;
    const videoRegex = config.videoRegex;
    const interceptNetwork = config.interceptNetwork ?? true;

    const hasSelectors =
      Array.isArray(videoSelectors) && (videoSelectors as unknown[]).length > 0;
    const hasRegex = typeof videoRegex === 'string' && (videoRegex as string).trim().length > 0;

    if (!hasSelectors && !hasRegex && !interceptNetwork) {
      throw new Error(
        'Au moins une source : videoSelectors, videoRegex, ou interceptNetwork=true',
      );
    }

    if (hasSelectors) {
      for (const s of videoSelectors as unknown[]) {
        if (typeof s !== 'string' || !s.trim()) {
          throw new Error('videoSelectors : chaque selecteur doit etre une string');
        }
      }
    }
    if (hasRegex) {
      try {
        new RegExp(videoRegex as string);
      } catch (err) {
        throw new Error(`videoRegex invalide : ${(err as Error).message}`);
      }
    }

    const tSelectors = config.thumbnailSelectors;
    if (tSelectors !== undefined && !Array.isArray(tSelectors)) {
      throw new Error('thumbnailSelectors doit etre un array');
    }
    const titleSelectors = config.titleSelectors;
    if (titleSelectors !== undefined && !Array.isArray(titleSelectors)) {
      throw new Error('titleSelectors doit etre un array');
    }
    const exts = config.allowedExtensions;
    if (exts !== undefined && !Array.isArray(exts)) {
      throw new Error('allowedExtensions doit etre un array');
    }
  }

  async fetch(ctx: CrawlerAdapterContext): Promise<CrawlerItem[]> {
    this.validateConfig(ctx.config);
    const result = await this.runWithBrowser(ctx.config, ctx.maxResults);
    return result.items;
  }

  /**
   * Mode "tester" : execute le crawl et renvoie un detail debug complet.
   */
  async testRun(config: Record<string, unknown>): Promise<{
    pageTitle: string;
    finalUrl: string;
    htmlSize: number;
    cssMatchCount: number;
    regexMatchCount: number;
    networkCaptureCount: number;
    rawUrls: string[];
    filteredUrls: string[];
    items: CrawlerItem[];
    warnings: string[];
  }> {
    this.validateConfig(config);
    return await this.runWithBrowser(config, 10, /* debug */ true);
  }

  private async runWithBrowser(
    config: Record<string, unknown>,
    maxResults: number,
    debug = false,
  ): Promise<{
    pageTitle: string;
    finalUrl: string;
    htmlSize: number;
    cssMatchCount: number;
    regexMatchCount: number;
    networkCaptureCount: number;
    rawUrls: string[];
    filteredUrls: string[];
    items: CrawlerItem[];
    warnings: string[];
  }> {
    const url = String(config.url);
    assertPublicUrl(url);
    const baseUrl = assertPublicUrl((config.baseUrl as string | undefined) ?? url);

    const allowedExts =
      (config.allowedExtensions as string[] | undefined) ?? DEFAULT_VIDEO_EXTS;
    const videoSelectors = (config.videoSelectors as string[] | undefined) ?? [];
    const videoRegex = config.videoRegex as string | undefined;
    const userAgent =
      (config.userAgent as string | undefined) ??
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const viewport =
      (config.viewport as { width: number; height: number } | undefined) ?? {
        width: 1280,
        height: 720,
      };

    const browser = await getBrowser();

    let context: BrowserContext | null = null;
    let page: Page | null = null;
    const warnings: string[] = [];

    try {
      context = await browser.newContext({
        userAgent,
        viewport,
        // Bloquer les resources lourdes inutiles pour le scraping
        // (mais on garde les requetes reseau pour les .mp4)
      });
      page = await context.newPage();

      // Hard timeout total
      page.setDefaultTimeout(HARD_PAGE_TIMEOUT_MS);

      const captured = await capturePage(page, config);

      // Resolution + filtrage
      const allRaw = [
        ...captured.cssVideoUrls,
        ...captured.networkUrls,
      ];
      if (videoRegex) {
        const fromHtml = extractRegexMatches(captured.htmlFinal, videoRegex);
        allRaw.push(...fromHtml);
        // Aussi appliquer le regex sur les URLs reseau (au cas ou)
        for (const nu of captured.networkUrls) {
          const m = extractRegexMatches(nu, videoRegex);
          allRaw.push(...m);
        }
      }

      const resolved = new Set<string>();
      for (const raw of allRaw) {
        const abs = resolveUrl(baseUrl, raw);
        if (!abs) continue;
        if (!urlHasAllowedExtension(abs, allowedExts)) continue;
        resolved.add(abs);
      }

      // Thumbnails (1ere trouvee resolue)
      let firstThumbnail: string | null = null;
      for (const t of captured.thumbnailUrls) {
        const abs = resolveUrl(baseUrl, t);
        if (abs) {
          firstThumbnail = abs;
          break;
        }
      }

      const titleText =
        captured.titleTexts[0] ??
        captured.pageTitle ??
        'Page sans titre';

      const filtered = Array.from(resolved);

      // Warnings utiles
      if (videoSelectors.length > 0 && captured.cssVideoUrls.length === 0) {
        warnings.push('Selecteurs CSS : aucun match');
      }
      if (videoRegex && extractRegexMatches(captured.htmlFinal, videoRegex).length === 0) {
        warnings.push('Regex : aucun match dans le HTML final');
      }
      if (
        (config.interceptNetwork ?? true) &&
        captured.networkUrls.length === 0
      ) {
        warnings.push('Network intercept : aucune URL video capturee dans le trafic');
      }

      const items: CrawlerItem[] = [];
      const limit = debug ? Math.min(filtered.length, 10) : maxResults;
      for (let i = 0; i < filtered.length && items.length < limit; i++) {
        const v = filtered[i];
        items.push({
          sourceUrl: v,
          thumbnailUrl: firstThumbnail,
          title: filtered.length === 1 ? titleText : `${titleText} (${i + 1})`,
          externalId: null,
          metadata: {
            pageUrl: captured.finalUrl,
            via: 'generic_browser',
            extractedFromSelectors: captured.cssVideoUrls.length,
            extractedFromNetwork: captured.networkUrls.length,
            totalFound: filtered.length,
          },
        });
      }

      return {
        pageTitle: captured.pageTitle,
        finalUrl: captured.finalUrl,
        htmlSize: captured.htmlFinal.length,
        cssMatchCount: captured.cssVideoUrls.length,
        regexMatchCount: videoRegex
          ? extractRegexMatches(captured.htmlFinal, videoRegex).length
          : 0,
        networkCaptureCount: captured.networkUrls.length,
        rawUrls: allRaw.slice(0, 50),
        filteredUrls: filtered,
        items,
        warnings,
      };
    } finally {
      try {
        if (page) await page.close();
      } catch {
        /* ignore */
      }
      try {
        if (context) await context.close();
      } catch {
        /* ignore */
      }
    }
  }
}
