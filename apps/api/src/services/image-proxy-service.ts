import axios, { type AxiosResponse } from 'axios';
import type { Readable } from 'node:stream';

/**
 * Proxy pour récupérer des thumbnails distantes (Rule34, Reddit, etc.)
 * qui bloquent le hotlink direct via Referer/CORS.
 *
 * Le backend joue l'intermediaire : il telecharge avec UA navigateur
 * et un Referer cohérent, puis stream l'image au client.
 */

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface FetchedImage {
  stream: Readable;
  contentType: string;
  contentLength: number | null;
}

/**
 * Choisit un Referer plausible selon le hostname de l'image.
 */
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
  // Validation basique de l'URL pour eviter les SSRF
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    throw new Error('URL invalide');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Protocole non autorise');
  }
  // Refus localhost / 127.0.0.1 / 10.x / 172.x / 192.168.x
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('169.254.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
  ) {
    throw new Error('Hote prive non autorise');
  }

  const headers: Record<string, string> = {
    'User-Agent': BROWSER_UA,
    Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  const referer = pickReferer(imageUrl);
  if (referer) headers.Referer = referer;

  const response: AxiosResponse<Readable> = await axios.get<Readable>(imageUrl, {
    responseType: 'stream',
    timeout: 10_000,
    maxRedirects: 5,
    headers,
    validateStatus: (s) => s >= 200 && s < 400,
  });

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
