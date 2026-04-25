'use client';

import Link from 'next/link';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Button,
  IconButton,
  Tooltip,
} from '@mui/material';
import MovieFilterIcon from '@mui/icons-material/MovieFilter';
import LoginIcon from '@mui/icons-material/Login';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { useAuth } from '@/lib/auth-context';
import { APP_NAME } from '@gifstudio-x/shared';

export function PublicTopbar() {
  const { user, loading } = useAuth();

  return (
    <AppBar position="sticky" elevation={0}>
      <Toolbar>
        <Box
          component={Link}
          href="/explore"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            color: 'inherit',
            textDecoration: 'none',
            flexGrow: 1,
          }}
        >
          <MovieFilterIcon />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {APP_NAME}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ThemeToggle />
          {!loading && user ? (
            <>
              <Tooltip title="Tableau de bord">
                <Button
                  component={Link}
                  href="/dashboard"
                  color="inherit"
                  size="small"
                >
                  Tableau de bord
                </Button>
              </Tooltip>
              <UserMenu />
            </>
          ) : !loading ? (
            <Button
              component={Link}
              href="/login"
              color="inherit"
              variant="outlined"
              size="small"
              startIcon={<LoginIcon />}
            >
              Se connecter
            </Button>
          ) : null}
        </Box>
      </Toolbar>
    </AppBar>
  );
}
