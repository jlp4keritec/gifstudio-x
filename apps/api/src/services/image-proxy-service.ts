import type { AxiosResponse } from 'axios';
import type { Readable } from 'node:stream';
import { safeAxiosStream } from '../lib/safe-fetch';

/**
 * Proxy pour recuperer des thumbnails distantes (Rule34, Reddit, etc.)
 * qui bloquent le hotlink direct via Referer/CORS.
 *
 * [Patch HX-02/03/04] : utilise safeAxiosStream qui :
 *   - Valide l'URL (assertPublicUrl)
 *   - Resout le DNS et bloque les IPs privees (anti-rebinding)
 *   - Suit les redirections en re-validant chaque hop
 */

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface FetchedImage {
  stream: Readable;
  contentType: string;
  contentLength: number | null;
}

function pickReferer(imageUrl: string): string | undefined {
  try {
    const u = new URL(imageUrl);
    const host = u.hostname.toLowerCase();

    if (host.endsWith('rule34.xxx')) return 'https://rule34.xxx/';
    if (host.endsWith('redd.it') || host.endsWith('reddit.com'))
      return 'https://www.reddit.com/';
    if (host.endsWith('redgifs.com')) return 'https://www.redgifs.com/';
    if (host.endsWith('e621.net')) return 'https://e621.net/';

    return undefined;
  } catch {
    return undefined;
  }
}

export async function fetchRemoteImage(imageUrl: string): Promise<FetchedImage> {
  const headers: Record<string, string> = {
    'User-Agent': BROWSER_UA,
    Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  const referer = pickReferer(imageUrl);
  if (referer) headers.Referer = referer;

  const response: AxiosResponse<Readable> = await safeAxiosStream(imageUrl, {
    timeout: 10_000,
    maxRedirects: 5,
    headers,
    validateStatus: (s) => s >= 200 && s < 400,
  }) as AxiosResponse<Readable>;

  const contentType =
    response.headers['content-type']?.toString().split(';')[0] ?? 'image/jpeg';
  const cl = response.headers['content-length'];
  const contentLength = cl ? Number(cl) : null;

  return {
    stream: response.data,
    contentType,
    contentLength,
  };
}