'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppBar, Toolbar, Typography, Box, Button, Stack, Tooltip } from '@mui/material';
import MovieFilterIcon from '@mui/icons-material/MovieFilter';
import DashboardIcon from '@mui/icons-material/Dashboard';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import MovieCreationIcon from '@mui/icons-material/MovieCreation';
import CollectionsIcon from '@mui/icons-material/Collections';
import ExploreIcon from '@mui/icons-material/Explore';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { APP_NAME } from '@gifstudio-x/shared';
import { useAuth } from '@/lib/auth-context';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** True si actif quand pathname commence par href */
  prefix?: boolean;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: <DashboardIcon fontSize="small" /> },
  { href: '/create', label: 'Créer un GIF', icon: <MovieCreationIcon fontSize="small" />, prefix: true },
  { href: '/import', label: 'Import', icon: <CloudDownloadIcon fontSize="small" /> },
  { href: '/library', label: 'Bibliothèque', icon: <VideoLibraryIcon fontSize="small" /> },
  { href: '/collections', label: 'Collections', icon: <CollectionsIcon fontSize="small" /> },
  { href: '/explore', label: 'Explorer', icon: <ExploreIcon fontSize="small" /> },
  {
    href: '/admin/crawler',
    label: 'Crawler',
    icon: <TravelExploreIcon fontSize="small" />,
    adminOnly: true,
  },
  {
    href: '/admin/users',
    label: 'Utilisateurs',
    icon: <AdminPanelSettingsIcon fontSize="small" />,
    adminOnly: true,
  },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.prefix) return pathname === item.href || pathname.startsWith(`${item.href}/`);
  return pathname === item.href;
}

export function Topbar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const visibleItems = NAV_ITEMS.filter((i) => !i.adminOnly || user?.role === 'admin');

  return (
    <AppBar position="sticky" elevation={0}>
      <Toolbar sx={{ gap: 2 }}>
        <Box
          component={Link}
          href="/dashboard"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            color: 'inherit',
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          <MovieFilterIcon />
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              display: { xs: 'none', md: 'block' },
            }}
          >
            {APP_NAME}
          </Typography>
        </Box>

        <Stack
          direction="row"
          spacing={0.5}
          sx={{
            flexGrow: 1,
            ml: 2,
            overflowX: 'auto',
            // Sur mobile : icones seulement
            '& .nav-label': {
              display: { xs: 'none', lg: 'inline' },
            },
          }}
        >
          {visibleItems.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Tooltip key={item.href} title={item.label} disableHoverListener={undefined}>
                <Button
                  component={Link}
                  href={item.href}
                  size="small"
                  startIcon={item.icon}
                  sx={{
                    color: 'inherit',
                    px: 1.5,
                    py: 0.75,
                    minWidth: 'auto',
                    fontWeight: active ? 700 : 400,
                    bgcolor: active ? 'rgba(255,255,255,0.16)' : 'transparent',
                    borderBottom: active ? '2px solid currentColor' : '2px solid transparent',
                    borderRadius: 1,
                    textTransform: 'none',
                    whiteSpace: 'nowrap',
                    '&:hover': {
                      bgcolor: active ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.08)',
                    },
                    '& .MuiButton-startIcon': {
                      mr: { xs: 0, lg: 1 },
                    },
                  }}
                >
                  <span className="nav-label">{item.label}</span>
                </Button>
              </Tooltip>
            );
          })}
        </Stack>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          <ThemeToggle />
          <UserMenu />
        </Box>
      </Toolbar>
    </AppBar>
  );
}
