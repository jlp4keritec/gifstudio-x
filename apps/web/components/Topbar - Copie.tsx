'use client';

import Link from 'next/link';
import { AppBar, Toolbar, Typography, Box } from '@mui/material';
import MovieFilterIcon from '@mui/icons-material/MovieFilter';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { APP_NAME } from '@gifstudio-x/shared';

export function Topbar() {
  return (
    <AppBar position="sticky" elevation={0}>
      <Toolbar>
        <Box
          component={Link}
          href="/dashboard"
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
          <UserMenu />
        </Box>
      </Toolbar>
    </AppBar>
  );
}
