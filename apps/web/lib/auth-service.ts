import type { User } from '@gifstudio-x/shared';
import { apiFetch } from './api-client';

export const authService = {
  async login(identifier: string, password: string): Promise<User> {
    const { user } = await apiFetch<{ user: User }>('/auth/login', {
      method: 'POST',
      json: { identifier, password },
    });
    return user;
  },

  async logout(): Promise<void> {
    await apiFetch<{ message: string }>('/auth/logout', {
      method: 'POST',
    });
  },

  async me(): Promise<User> {
    const { user } = await apiFetch<{ user: User }>('/auth/me');
    return user;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<User> {
    const { user } = await apiFetch<{ user: User }>('/auth/change-password', {
      method: 'POST',
      json: { currentPassword, newPassword },
    });
    return user;
  },
};
