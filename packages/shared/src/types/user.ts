export type UserRole = 'admin' | 'moderator' | 'user';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
}
