import axios, { type AxiosInstance } from 'axios';

/**
 * Client Redgifs avec gestion auto du token temporaire.
 * API publique : https://api.redgifs.com/docs
 *
 * Token obtenu via GET /v2/auth/temporary -> valable ~24h.
 * On le met en cache module-scope et on renouvelle avant expiration.
 */

const API_BASE = 'https://api.redgifs.com/v2';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface TokenCache {
  token: string;
  expiresAt: number; // timestamp ms
}

let tokenCache: TokenCache | null = null;

async function fetchNewToken(): Promise<TokenCache> {
  const { data } = await axios.get<{ token: string; addr?: string; session?: string }>(
    `${API_BASE}/auth/temporary`,
    {
      timeout: 10_000,
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'application/json',
      },
    },
  );
  if (!data?.token) {
    throw new Error('Redgifs : token vide dans la reponse /auth/temporary');
  }
  // Token valable 24h, on renouvelle a 23h pour marge
  return {
    token: data.token,
    expiresAt: Date.now() + 23 * 3600 * 1000,
  };
}

async function getToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }
  tokenCache = await fetchNewToken();
  return tokenCache.token;
}

/**
 * Retourne un axios instance configure avec le token + UA.
 */
export async function getRedgifsClient(): Promise<AxiosInstance> {
  const token = await getToken();
  return axios.create({
    baseURL: API_BASE,
    timeout: 15_000,
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': BROWSER_UA,
      Accept: 'application/json',
    },
  });
}

/**
 * Force le renouvellement du token (ex: apres 401).
 */
export function invalidateToken(): void {
  tokenCache = null;
}

// ============================================================================
// Types reponses Redgifs (partiels, seulement ce qu'on utilise)
// ============================================================================

export interface RedgifsUrls {
  hd?: string;
  sd?: string;
  poster?: string;
  thumbnail?: string;
  vthumbnail?: string;
}

export interface RedgifsGif {
  id: string;
  urls: RedgifsUrls;
  width?: number;
  height?: number;
  duration?: number;
  views?: number;
  tags?: string[];
  userName?: string;
  createDate?: number;
  description?: string | null;
  title?: string | null;
  likes?: number;
}

export interface RedgifsListResponse {
  gifs: RedgifsGif[];
  page: number;
  pages: number;
  total: number;
}

/**
 * Recherche via tag simple (endpoint /gifs/search).
 */
export async function searchByTag(params: {
  tag: string;
  order?: 'trending' | 'new' | 'top' | 'best';
  count?: number;
}): Promise<RedgifsListResponse> {
  const client = await getRedgifsClient();
  const { data } = await client.get<RedgifsListResponse>('/gifs/search', {
    params: {
      search_text: params.tag,
      order: params.order ?? 'trending',
      count: params.count ?? 40,
      page: 1,
    },
  });
  return data;
}

/**
 * Recherche libre (mots-cles) via /gifs/search.
 */
export async function searchQuery(params: {
  query: string;
  order?: 'trending' | 'new' | 'top' | 'best';
  count?: number;
}): Promise<RedgifsListResponse> {
  const client = await getRedgifsClient();
  const { data } = await client.get<RedgifsListResponse>('/gifs/search', {
    params: {
      search_text: params.query,
      order: params.order ?? 'trending',
      count: params.count ?? 40,
      page: 1,
    },
  });
  return data;
}

/**
 * Recupere un gif par son ID (utilise pour resolution d'URL).
 * Ex: https://redgifs.com/watch/xyz -> id=xyz -> GET /gifs/xyz
 */
export async function getGifById(id: string): Promise<RedgifsGif> {
  try {
    const client = await getRedgifsClient();
    const { data } = await client.get<{ gif: RedgifsGif }>(`/gifs/${id}`);
    return data.gif;
  } catch (err) {
    // Token peut-etre expire -> retry une fois
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      invalidateToken();
      const client = await getRedgifsClient();
      const { data } = await client.get<{ gif: RedgifsGif }>(`/gifs/${id}`);
      return data.gif;
    }
    throw err;
  }
}

/**
 * Extrait l'ID Redgifs depuis une URL.
 * Supporte :
 *   https://redgifs.com/watch/awesomerabbit
 *   https://www.redgifs.com/watch/awesomerabbit
 *   https://redgifs.com/ifr/awesomerabbit
 *   https://thumbs4.redgifs.com/AwesomeRabbit-mobile.mp4  (thumb direct)
 *   https://v.redgifs.com/awesomerabbit.mp4
 */
export function extractRedgifsId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/redgifs\.com$/i.test(u.hostname) && !/\.redgifs\.com$/i.test(u.hostname)) {
      return null;
    }

    // Pattern /watch/xxx ou /ifr/xxx
    const pathMatch = u.pathname.match(/^\/(watch|ifr)\/([A-Za-z0-9]+)/i);
    if (pathMatch) return pathMatch[2].toLowerCase();

    // Pattern fichier type AwesomeRabbit-mobile.mp4 ou awesomerabbit.mp4
    const fileMatch = u.pathname.match(/^\/([A-Za-z0-9]+)(?:-(?:mobile|sd|hd|poster))?\.(?:mp4|webm|jpg|png)$/i);
    if (fileMatch) return fileMatch[1].toLowerCase();

    return null;
  } catch {
    return null;
  }
}

/**
 * Selectionne l'URL video selon prefere HD / SD avec fallback.
 */
export function pickVideoUrl(
  urls: RedgifsUrls,
  quality: 'hd' | 'sd' = 'hd',
): string | null {
  if (quality === 'hd') {
    return urls.hd ?? urls.sd ?? null;
  }
  return urls.sd ?? urls.hd ?? null;
}
