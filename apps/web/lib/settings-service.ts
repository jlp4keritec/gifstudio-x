import type { UserSettings } from '@gifstudio-x/shared';
import { apiFetch, API_BASE_URL, ApiError } from './api-client';

export const settingsService = {
  async get(): Promise<UserSettings> {
    const data = await apiFetch<{ settings: UserSettings }>('/settings');
    return data.settings;
  },

  async update(patch: Partial<UserSettings>): Promise<UserSettings> {
    const data = await apiFetch<{ settings: UserSettings }>('/settings', {
      method: 'PATCH',
      json: patch,
    });
    return data.settings;
  },

  uploadLogo(file: File): Promise<UserSettings> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const form = new FormData();
      form.append('file', file, file.name);

      xhr.open('POST', `${API_BASE_URL}/settings/watermark/logo`, true);
      xhr.withCredentials = true;
      xhr.onerror = () => reject(new ApiError(0, 'Erreur reseau lors de l\'upload'));
      xhr.onload = () => {
        try {
          const payload = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && payload?.success) {
            resolve(payload.data.settings as UserSettings);
          } else {
            reject(new ApiError(xhr.status, payload?.error ?? `HTTP ${xhr.status}`, payload?.code));
          }
        } catch {
          reject(new ApiError(xhr.status, `HTTP ${xhr.status}`));
        }
      };
      xhr.send(form);
    });
  },

  async deleteLogo(): Promise<UserSettings> {
    const data = await apiFetch<{ deleted: boolean; settings: UserSettings }>(
      '/settings/watermark/logo',
      { method: 'DELETE' },
    );
    return data.settings;
  },

  /** URL avec cache-buster pour forcer le re-fetch quand le logo change */
  logoUrl(cacheBuster?: string | number): string {
    const cb = cacheBuster ?? Date.now();
    return `${API_BASE_URL}/settings/watermark/logo?cb=${cb}`;
  },
};
