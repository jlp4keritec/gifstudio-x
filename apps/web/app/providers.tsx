'use client';

import type { ReactNode } from 'react';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { ThemeProvider } from '@/lib/theme-context';
import { AuthProvider } from '@/lib/auth-context';
import { DraftProvider } from '@/lib/draft-context';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ key: 'mui' }}>
      <ThemeProvider>
        <AuthProvider>
          <DraftProvider>{children}</DraftProvider>
        </AuthProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
