'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type { User } from '@gifstudio-x/shared';
import { authService } from './auth-service';
import { ApiError } from './api-client';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<User>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await authService.me();
      setUser(me);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setUser(null);
      } else {
        throw err;
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const loggedIn = await authService.login(email, password);
    setUser(loggedIn);
    return loggedIn;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const updated = await authService.changePassword(currentPassword, newPassword);
      setUser(updated);
      return updated;
    },
    [],
  );

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh, changePassword }),
    [user, loading, login, logout, refresh, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
