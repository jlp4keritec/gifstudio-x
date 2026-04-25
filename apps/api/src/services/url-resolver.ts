import {
  extractRedgifsId,
  getGifById,
  pickVideoUrl,
} from '../lib/redgifs-client';

/**
 * Resolver d'URLs "indirectes" (pages web contenant une video) vers
 * l'URL du fichier video directement telechargeable.
 *
 * Utilise par importVideoFromUrl pour supporter les URLs non-directes
 * (ex: https://redgifs.com/watch/xxx).
 *
 * Retourne l'URL originale si aucun resolver n'applique.
 */

export interface ResolveResult {
  /** URL finale (.mp4/.webm direct) */
  directUrl: string;
  /** Thumbnail eventuelle recuperee en bonus */
  thumbnailUrl?: string | null;
  /** Titre eventuel */
  title?: string | null;
  /** Source du resolver qui a matche */
  resolver: 'redgifs' | 'passthrough';
  /** Metadata bonus (duree, dim, etc.) pour eviter ffprobe redondant si on voulait */
  hints?: {
    width?: number;
    height?: number;
    durationSec?: number;
  };
}

export async function resolveVideoUrl(url: string): Promise<ResolveResult> {
  // --- Redgifs ---
  const redgifsId = extractRedgifsId(url);
  if (redgifsId) {
    try {
      const gif = await getGifById(redgifsId);
      const directUrl = pickVideoUrl(gif.urls, 'hd');
      if (!directUrl) {
        throw new Error(`Redgifs ${redgifsId} : aucune URL video disponible`);
      }
      return {
        directUrl,
        thumbnailUrl: gif.urls.poster ?? gif.urls.thumbnail ?? null,
        title: gif.title ?? gif.description ?? null,
        resolver: 'redgifs',
        hints: {
          width: gif.width,
          height: gif.height,
          durationSec: gif.duration,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Resolution Redgifs echouee pour ${url} : ${msg}`);
    }
  }

  // --- Passthrough (URL deja directe, on ne touche pas) ---
  return { directUrl: url, resolver: 'passthrough' };
}

/**
 * Teste si une URL est "indirecte" (necessite resolution) sans faire d'appel reseau.
 */
export function needsResolution(url: string): boolean {
  return extractRedgifsId(url) !== null;
}
