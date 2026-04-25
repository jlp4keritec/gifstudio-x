import type { UploadedVideo, UploadProgress } from '@gifstudio-x/shared';
import { API_BASE_URL } from './api-client';

export interface UploadVideoOptions {
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

/**
 * Upload une vidéo avec progression (XMLHttpRequest car fetch ne fournit pas
 * nativement la progression d'upload au moment de l'écriture de ce code).
 */
export function uploadVideo(
  file: File,
  options: UploadVideoOptions = {},
): Promise<UploadedVideo> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('video', file);

    xhr.open('POST', `${API_BASE_URL}/upload/video`);
    xhr.withCredentials = true;

    if (options.onProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          options.onProgress!({
            loaded: event.loaded,
            total: event.total,
            percentage: Math.round((event.loaded / event.total) * 100),
          });
        }
      });
    }

    xhr.addEventListener('load', () => {
      const contentType = xhr.getResponseHeader('content-type') ?? '';
      const isJson = contentType.includes('application/json');
      let parsed: unknown = null;
      try {
        parsed = isJson ? JSON.parse(xhr.responseText) : null;
      } catch {
        parsed = null;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        const response = parsed as { success: true; data: { video: UploadedVideo } };
        resolve(response.data.video);
      } else {
        const error = parsed as { success: false; error?: string };
        reject(new Error(error?.error ?? `HTTP ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Erreur réseau')));
    xhr.addEventListener('abort', () => reject(new Error('Upload annulé')));

    if (options.signal) {
      options.signal.addEventListener('abort', () => xhr.abort());
    }

    xhr.send(formData);
  });
}

export async function deleteUploadedVideo(filename: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/upload/video/${filename}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Erreur lors de la suppression');
  }
}

/**
 * Retourne l'URL absolue d'un fichier stocké (ex: "/storage/videos/xxx.mp4")
 */
export function getStorageUrl(path: string): string {
  const origin = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
  return `${origin}${path}`;
}
