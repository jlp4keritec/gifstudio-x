import type { Gif } from '@gifstudio-x/shared';
import { API_BASE_URL, apiFetch } from './api-client';

export interface SaveGifPayload {
  blob: Blob;
  title: string;
  description?: string;
  tags?: string[];
  isPublic: boolean;
  collectionIds: string[];
  categoryIds: string[];
  durationMs: number;
  fps: number;
}

export function saveGif(
  payload: SaveGifPayload,
  onProgress?: (percent: number) => void,
): Promise<Gif> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    formData.append('gif', payload.blob, `${payload.title || 'gif'}.gif`);
    formData.append('title', payload.title);
    if (payload.description) formData.append('description', payload.description);
    formData.append('tags', JSON.stringify(payload.tags ?? []));
    formData.append('isPublic', String(payload.isPublic));
    formData.append('collectionIds', JSON.stringify(payload.collectionIds));
    formData.append('categoryIds', JSON.stringify(payload.categoryIds));
    formData.append('durationMs', String(payload.durationMs));
    formData.append('fps', String(payload.fps));

    xhr.open('POST', `${API_BASE_URL}/gifs`);
    xhr.withCredentials = true;

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }

    xhr.addEventListener('load', () => {
      let parsed: unknown = null;
      try { parsed = JSON.parse(xhr.responseText); } catch { /* ignore */ }

      if (xhr.status >= 200 && xhr.status < 300) {
        const { data } = parsed as { data: { gif: Gif } };
        resolve(data.gif);
      } else {
        const err = parsed as { error?: string };
        reject(new Error(err?.error ?? `HTTP ${xhr.status}`));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Erreur réseau')));
    xhr.send(formData);
  });
}

export const gifsService = {
  async listMine(): Promise<Gif[]> {
    const { gifs } = await apiFetch<{ gifs: Gif[] }>('/gifs/mine');
    return gifs;
  },
  async get(id: string): Promise<Gif> {
    const { gif } = await apiFetch<{ gif: Gif }>(`/gifs/${id}`);
    return gif;
  },
  async remove(id: string): Promise<void> {
    await apiFetch(`/gifs/${id}`, { method: 'DELETE' });
  },
  save: saveGif,
};
