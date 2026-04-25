import type { User, UserRole } from '@gifstudio-x/shared';
import { apiFetch } from './api-client';

export interface CreateUserInput {
  email: string;
  password: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export interface UpdateUserInput {
  email?: string;
  role?: UserRole;
  isActive?: boolean;
  resetPassword?: string;
}

export const usersService = {
  async list(): Promise<User[]> {
    const { users } = await apiFetch<{ users: User[] }>('/admin/users');
    return users;
  },

  async get(id: string): Promise<User> {
    const { user } = await apiFetch<{ user: User }>(`/admin/users/${id}`);
    return user;
  },

  async create(input: CreateUserInput): Promise<User> {
    const { user } = await apiFetch<{ user: User }>('/admin/users', {
      method: 'POST',
      json: input,
    });
    return user;
  },

  async update(id: string, input: UpdateUserInput): Promise<User> {
    const { user } = await apiFetch<{ user: User }>(`/admin/users/${id}`, {
      method: 'PATCH',
      json: input,
    });
    return user;
  },

  async deactivate(id: string): Promise<User> {
    const { user } = await apiFetch<{ user: User }>(`/admin/users/${id}`, {
      method: 'DELETE',
    });
    return user;
  },
};
