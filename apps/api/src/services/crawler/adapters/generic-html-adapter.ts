import axios from 'axios';
import * as cheerio from 'cheerio';
import type {
  CrawlerAdapter,
  CrawlerAdapterContext,
  CrawlerItem,
} from '../adapter';

/**
 * GenericHTML : adapter universel pour scrapper n'importe quel site.
 *
 * Config :
 *   {
 *     url: string,                  // URL de la page a crawler
 *
 *     // Mode CSS (au moins l'un des 2 modes doit etre actif)
 *     videoSelectors?: string[],    // ex: ["video source[src]", "a[href$='.mp4']"]
 *     thumbnailSelectors?: string[],// ex: ["img.thumb"]
 *     titleSelectors?: string[],    // ex: ["h2.title"]
 *
 *     // Mode regex (applique sur le HTML brut)
 *     videoRegex?: string,          // ex: "https?://[^\"'\\s]+\\.mp4"
 *
 *     // Pour resolutions des URLs relatives ; sinon deduit de l'URL
 *     baseUrl?: string,
 *
 *     // Filtres optionnels
 *     allowedExtensions?: string[]  // defaut: ["mp4","webm","mov"]
 *   }
 */

const DEFAULT_VIDEO_EXTS = ['mp4', 'webm', 'mov', 'mkv'];
const MAX_HTML_BYTES = 5 * 1024 * 1024; // 5 Mo
const FETCH_TIMEOUT_MS = 15_000;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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
// Fetch HTML avec limite de taille + timeout
// ============================================================================

async function fetchHtmlPage(url: string): Promise<string> {
  const response = await axios.get<string>(url, {
    timeout: FETCH_TIMEOUT_MS,
    maxRedirects: 5,
    maxContentLength: MAX_HTML_BYTES,
    responseType: 'text',
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    validateStatus: (s) => s < 500,
  });

  if (response.status >= 400) {
    throw new Error(`HTTP ${response.status} sur ${url}`);
  }

  const body = typeof response.data === 'string' ? response.data : String(response.data);
  if (body.length > MAX_HTML_BYTES) {
    throw new Error(`Reponse HTML trop volumineuse (> ${MAX_HTML_BYTES / 1024 / 1024} Mo)`);
  }
  return body;
}

// ============================================================================
// Helpers extraction URLs
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

/**
 * Extrait les URLs depuis les selecteurs CSS appliques sur cheerio.
 * Pour chaque selecteur, on regarde l'attribut `src` si present, sinon `href`.
 * Si le selecteur cible un attribut explicite (ex: "a[href$='.mp4']"),
 * on lit src puis href.
 */
function extractFromSelectors(
  $: cheerio.CheerioAPI,
  selectors: string[],
  attrPriority: string[] = ['src', 'href', 'data-src', 'data-url'],
): string[] {
  const found = new Set<string>();
  for (const sel of selectors) {
    try {
      $(sel).each((_, el) => {
        for (const attr of attrPriority) {
          const v = $(el).attr(attr);
          if (v && v.trim()) {
            found.add(v.trim());
            return;
          }
        }
        // Si pas d'attribut, prendre le texte (utile pour title)
        const text = $(el).text().trim();
        if (text) found.add(text);
      });
    } catch (err) {
      console.warn(`[generic_html] selector "${sel}" failed:`, err);
    }
  }
  return Array.from(found);
}

function extractRegexMatches(html: string, pattern: string): string[] {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, 'gi');
  } catch (err) {
    throw new Error(`Regex invalide : ${(err as Error).message}`);
  }
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    // Si le regex a des groupes de capture, prendre le 1er groupe ; sinon le match complet
    found.add(match[1] ?? match[0]);
    // Securite contre regex catastrophique
    if (found.size > 1000) break;
  }
  return Array.from(found);
}

// ============================================================================
// Adapter
// ============================================================================

export class GenericHtmlAdapter implements CrawlerAdapter {
  readonly name = 'generic_html';

  validateConfig(config: Record<string, unknown>): void {
    const url = config.url;
    if (typeof url !== 'string' || !url.trim()) {
      throw new Error('config.url requis');
    }
    assertPublicUrl(url);

    const videoSelectors = config.videoSelectors;
    const videoRegex = config.videoRegex;

    const hasSelectors =
      Array.isArray(videoSelectors) && videoSelectors.length > 0;
    const hasRegex = typeof videoRegex === 'string' && videoRegex.trim().length > 0;

    if (!hasSelectors && !hasRegex) {
      throw new Error(
        'Au moins un mode requis : videoSelectors (CSS) ou videoRegex (regex)',
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

    const url = String(ctx.config.url);
    const baseUrlStr = (ctx.config.baseUrl as string | undefined) ?? url;
    const baseUrl = assertPublicUrl(baseUrlStr);
    assertPublicUrl(url); // recheck

    const allowedExts =
      (ctx.config.allowedExtensions as string[] | undefined) ?? DEFAULT_VIDEO_EXTS;

    const videoSelectors = (ctx.config.videoSelectors as string[] | undefined) ?? [];
    const thumbnailSelectors =
      (ctx.config.thumbnailSelectors as string[] | undefined) ?? [];
    const titleSelectors = (ctx.config.titleSelectors as string[] | undefined) ?? [];
    const videoRegex = ctx.config.videoRegex as string | undefined;

    const html = await fetchHtmlPage(url);
    const $ = cheerio.load(html);

    // 1. Extraction des URLs videos
    const cssVideoUrls = extractFromSelectors($, videoSelectors);
    const regexVideoUrls = videoRegex ? extractRegexMatches(html, videoRegex) : [];

    // 2. Resolution + filtre extensions
    const allRaw = [...cssVideoUrls, ...regexVideoUrls];
    const resolved = new Set<string>();
    for (const raw of allRaw) {
      const abs = resolveUrl(baseUrl, raw);
      if (!abs) continue;
      if (!urlHasAllowedExtension(abs, allowedExts)) continue;
      resolved.add(abs);
    }

    // 3. Thumbnails (1 seule, on prend la 1ere trouvee)
    const thumbnails = extractFromSelectors($, thumbnailSelectors);
    let firstThumbnail: string | null = null;
    if (thumbnails.length > 0) {
      firstThumbnail = resolveUrl(baseUrl, thumbnails[0]);
    }

    // 4. Titre (1 seul)
    const titles = extractFromSelectors($, titleSelectors, ['alt', 'title']);
    const pageTitle =
      titles[0] ??
      $('title').text().trim() ??
      'Page sans titre';

    // 5. Construction des items
    const items: CrawlerItem[] = [];
    const videos = Array.from(resolved);
    for (let i = 0; i < videos.length && items.length < ctx.maxResults; i++) {
      const v = videos[i];
      items.push({
        sourceUrl: v,
        thumbnailUrl: firstThumbnail,
        title: videos.length === 1 ? pageTitle : `${pageTitle} (${i + 1})`,
        externalId: null,
        metadata: {
          pageUrl: url,
          extractedFromSelectors: cssVideoUrls.length,
          extractedFromRegex: regexVideoUrls.length,
          totalFound: videos.length,
        },
      });
    }

    return items;
  }

  /**
   * Mode "tester" : meme execution que fetch() mais sans limite stricte
   * et avec retour detaille pour debug. Utilise par l'endpoint de test.
   */
  async testRun(config: Record<string, unknown>): Promise<{
    pageTitle: string;
    htmlSize: number;
    cssMatchCount: number;
    regexMatchCount: number;
    rawUrls: string[];
    filteredUrls: string[];
    items: CrawlerItem[];
    warnings: string[];
  }> {
    this.validateConfig(config);

    const url = String(config.url);
    const baseUrlStr = (config.baseUrl as string | undefined) ?? url;
    const baseUrl = assertPublicUrl(baseUrlStr);
    assertPublicUrl(url);

    const allowedExts =
      (config.allowedExtensions as string[] | undefined) ?? DEFAULT_VIDEO_EXTS;
    const videoSelectors = (config.videoSelectors as string[] | undefined) ?? [];
    const thumbnailSelectors =
      (config.thumbnailSelectors as string[] | undefined) ?? [];
    const titleSelectors = (config.titleSelectors as string[] | undefined) ?? [];
    const videoRegex = config.videoRegex as string | undefined;

    const warnings: string[] = [];
    const html = await fetchHtmlPage(url);
    const $ = cheerio.load(html);

    const cssVideoUrls = extractFromSelectors($, videoSelectors);
    if (videoSelectors.length > 0 && cssVideoUrls.length === 0) {
      warnings.push('Selecteurs CSS : aucun match');
    }

    const regexVideoUrls = videoRegex ? extractRegexMatches(html, videoRegex) : [];
    if (videoRegex && regexVideoUrls.length === 0) {
      warnings.push('Regex : aucun match');
    }

    const allRaw = [...cssVideoUrls, ...regexVideoUrls];
    const resolved = new Set<string>();
    for (const raw of allRaw) {
      const abs = resolveUrl(baseUrl, raw);
      if (!abs) continue;
      if (!urlHasAllowedExtension(abs, allowedExts)) continue;
      resolved.add(abs);
    }

    const thumbnails = extractFromSelectors($, thumbnailSelectors);
    let firstThumbnail: string | null = null;
    if (thumbnails.length > 0) {
      firstThumbnail = resolveUrl(baseUrl, thumbnails[0]);
    }

    const titles = extractFromSelectors($, titleSelectors, ['alt', 'title']);
    const pageTitle = titles[0] ?? $('title').text().trim() ?? '';

    const filtered = Array.from(resolved);
    const items: CrawlerItem[] = filtered.slice(0, 10).map((v, i) => ({
      sourceUrl: v,
      thumbnailUrl: firstThumbnail,
      title: filtered.length === 1 ? pageTitle : `${pageTitle} (${i + 1})`,
      externalId: null,
      metadata: { pageUrl: url },
    }));

    return {
      pageTitle,
      htmlSize: html.length,
      cssMatchCount: cssVideoUrls.length,
      regexMatchCount: regexVideoUrls.length,
      rawUrls: allRaw.slice(0, 50),
      filteredUrls: filtered,
      items,
      warnings,
    };
  }
}
