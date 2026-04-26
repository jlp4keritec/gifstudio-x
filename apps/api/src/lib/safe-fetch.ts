// ============================================================================
// safe-fetch.ts - Wrapper axios anti-SSRF (HX-02 + HX-03)
// ============================================================================
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { assertPublicUrlAsync } from './url-security';

const MAX_REDIRECTS = 5;

interface SafeFetchOptions extends Omit<AxiosRequestConfig, 'maxRedirects'> {
  maxRedirects?: number;
}

/**
 * GET sur dans une URL : valide l'URL + suit les redirections en re-validant
 * chaque hop pour empecher SSRF via 302 vers host prive.
 */
export async function safeAxiosGet<T = unknown>(
  url: string,
  options: SafeFetchOptions = {},
): Promise<AxiosResponse<T>> {
  return safeFetch<T>('GET', url, options, 0);
}

/**
 * HEAD : meme principe que GET.
 */
export async function safeAxiosHead<T = unknown>(
  url: string,
  options: SafeFetchOptions = {},
): Promise<AxiosResponse<T>> {
  return safeFetch<T>('HEAD', url, options, 0);
}

/**
 * GET en stream (pour images/videos).
 */
export async function safeAxiosStream(
  url: string,
  options: SafeFetchOptions = {},
): Promise<AxiosResponse> {
  return safeFetch('GET', url, { ...options, responseType: 'stream' }, 0);
}

async function safeFetch<T = unknown>(
  method: 'GET' | 'HEAD',
  url: string,
  options: SafeFetchOptions,
  attempt: number,
): Promise<AxiosResponse<T>> {
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;

  if (attempt > maxRedirects) {
    throw new Error(`Trop de redirections (max ${maxRedirects})`);
  }

  // Validation anti-SSRF (DNS lookup + IP check)
  await assertPublicUrlAsync(url);

  // Pour gerer les redirections manuellement
  const response = await axios.request<T>({
    ...options,
    url,
    method,
    maxRedirects: 0,
    validateStatus: () => true,
    timeout: options.timeout ?? 10_000,
  });

  // Suivi manuel des redirections avec re-validation
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers['location'];
    if (!location) return response;

    const nextUrl = new URL(location as string, url).toString();
    return safeFetch<T>(method, nextUrl, options, attempt + 1);
  }

  // Si user demande validateStatus strict, on l'applique APRES avoir suivi les redirections
  if (options.validateStatus && !options.validateStatus(response.status)) {
    const error = new Error(`HTTP ${response.status}`) as Error & { response?: AxiosResponse };
    error.response = response;
    throw error;
  }

  return response;
}