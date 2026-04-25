'use client';

import { Box } from '@mui/material';
import { useAuth } from '@/lib/auth-context';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace(user.mustChangePassword ? '/change-password' : '/dashboard');
    }
  }, [user, loading, router]);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      {children}
    </Box>
  );
}
