'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from '@/lib/auth-context';
import { Topbar } from '@/components/Topbar';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    if (user.mustChangePassword && pathname !== '/change-password') {
      router.replace('/change-password');
    }
  }, [user, loading, pathname, router]);

  if (loading || !user) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (user.mustChangePassword && pathname !== '/change-password') {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Topbar />
      <Box component="main" sx={{ flexGrow: 1 }}>
        {children}
      </Box>
    </Box>
  );
}
