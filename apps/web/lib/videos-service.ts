import type {
  VideoAsset,
  VideoAssetFilters,
  VideoAssetListResponse,
} from '@gifstudio-x/shared';
import { apiFetch, API_BASE_URL, ApiError } from './api-client';

function buildQueryString(filters: VideoAssetFilters = {}): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      params.set(k, String(v));
    }
  });
  const s = params.toString();
  return s ? `?${s}` : '';
}

export const videosService = {
  async listAdvanced(filters?: VideoAssetFilters): Promise<VideoAssetListResponse> {
    return apiFetch<VideoAssetListResponse>(`/videos${buildQueryString(filters)}`);
  },

  async list(
    status?: 'pending' | 'downloading' | 'ready' | 'failed',
  ): Promise<VideoAsset[]> {
    const data = await apiFetch<VideoAssetListResponse>(
      `/videos${buildQueryString({ status })}`,
    );
    return data.items;
  },

  async importUrl(url: string): Promise<VideoAsset> {
    const data = await apiFetch<{ video: VideoAsset }>('/videos/import-url', {
      method: 'POST',
      json: { url },
    });
    return data.video;
  },

  upload(file: File, onProgress?: (percent: number) => void): Promise<VideoAsset> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const form = new FormData();
      form.append('file', file, file.name);

      xhr.open('POST', `${API_BASE_URL}/videos/upload`, true);
      xhr.withCredentials = true;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onerror = () => reject(new ApiError(0, 'Erreur reseau lors de l\'upload'));
      xhr.onload = () => {
        try {
          const payload = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && payload?.success) {
            resolve(payload.data.video as VideoAsset);
          } else {
            reject(
              new ApiError(
                xhr.status,
                payload?.error ?? `HTTP ${xhr.status}`,
                payload?.code,
              ),
            );
          }
        } catch {
          reject(new ApiError(xhr.status, `HTTP ${xhr.status}`));
        }
      };
      xhr.send(form);
    });
  },

  async regenerateThumbnail(id: string): Promise<VideoAsset> {
    const data = await apiFetch<{ video: VideoAsset; thumbnailGenerated: boolean }>(
      `/videos/${id}/regenerate-thumbnail`,
      { method: 'POST' },
    );
    return data.video;
  },

  async regenerateAllThumbnails(): Promise<{
    processed: number;
    generated: number;
    failed: number;
  }> {
    return apiFetch<{ processed: number; generated: number; failed: number }>(
      '/videos/regenerate-all-thumbnails',
      { method: 'POST' },
    );
  },

  async remove(id: string): Promise<void> {
    await apiFetch<{ deleted: boolean }>(`/videos/${id}`, { method: 'DELETE' });
  },

  thumbnailUrl(id: string): string {
    return `${API_BASE_URL}/videos/${id}/thumbnail`;
  },

  /**
   * Genere ou recupere le slug de partage pour cette video.
   * Renvoie le slug + l'asset mis a jour.
   */
  async createShareSlug(id: string): Promise<{ shareSlug: string; video: VideoAsset }> {
    return apiFetch<{ shareSlug: string; video: VideoAsset }>(
      `/videos/${id}/share`,
      { method: 'POST' },
    );
  },

  async revokeShareSlug(id: string): Promise<void> {
    await apiFetch<{ revoked: boolean }>(`/videos/${id}/share`, { method: 'DELETE' });
  },

  /**
   * URL publique du fichier video (utilisable dans <video> ou en fetch sans auth).
   * Necessite un slug genere via createShareSlug.
   */
  fileUrlBySlug(slug: string): string {
    return `${API_BASE_URL}/videos/file/${slug}`;
  },
};
