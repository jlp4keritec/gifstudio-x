'use client';

import Link from 'next/link';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  CardActionArea,
  Stack,
  Chip,
} from '@mui/material';
import MovieCreationIcon from '@mui/icons-material/MovieCreation';
import CollectionsIcon from '@mui/icons-material/Collections';
import ExploreIcon from '@mui/icons-material/Explore';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import { useAuth } from '@/lib/auth-context';

interface DashboardCard {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  disabled?: boolean;
  adminOnly?: boolean;
}

const CARDS: DashboardCard[] = [
  {
    title: 'Créer un GIF',
    description: 'Uploader une vidéo et la transformer en GIF animé.',
    href: '/create',
    icon: <MovieCreationIcon fontSize="large" />,
  },
  {
    title: 'Import URL / Upload',
    description: 'Importer des vidéos (URL directe ou fichiers en lot).',
    href: '/import',
    icon: <CloudDownloadIcon fontSize="large" />,
  },
  {
    title: 'Bibliothèque',
    description: 'Parcourir les vidéos importées avec filtres avancés.',
    href: '/library',
    icon: <VideoLibraryIcon fontSize="large" />,
  },
  {
    title: 'Mes collections',
    description: 'Organiser vos GIFs dans des collections thématiques.',
    href: '/collections',
    icon: <CollectionsIcon fontSize="large" />,
  },
  {
    title: 'Explorer',
    description: 'Découvrir les GIFs et les tendances.',
    href: '/explore',
    icon: <ExploreIcon fontSize="large" />,
  },
  {
    title: 'Crawler',
    description: 'Agent de veille : sources automatiques à reviewer.',
    href: '/admin/crawler',
    icon: <TravelExploreIcon fontSize="large" />,
    adminOnly: true,
  },
  {
    title: 'Gestion utilisateurs',
    description: 'Créer, modifier et désactiver les comptes utilisateurs.',
    href: '/admin/users',
    icon: <AdminPanelSettingsIcon fontSize="large" />,
    adminOnly: true,
  },
];

export default function DashboardPage() {
  const { user } = useAuth();

  const visibleCards = CARDS.filter((card) => !card.adminOnly || user?.role === 'admin');

  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      <Stack spacing={4}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Bienvenue 👋
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {user?.email}
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gap: 3,
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
            },
          }}
        >
          {visibleCards.map((card) => (
            <Card
              key={card.title}
              sx={{
                height: '100%',
                opacity: card.disabled ? 0.6 : 1,
              }}
            >
              <CardActionArea
                component={card.disabled ? 'div' : Link}
                href={card.disabled ? undefined : card.href}
                disabled={card.disabled}
                sx={{ height: '100%' }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Stack spacing={2}>
                    <Box sx={{ color: 'primary.main' }}>{card.icon}</Box>
                    <Box>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {card.title}
                        </Typography>
                        {card.disabled && <Chip label="Bientôt" size="small" />}
                        {card.adminOnly && (
                          <Chip label="Admin" size="small" color="error" variant="outlined" />
                        )}
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {card.description}
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      </Stack>
    </Container>
  );
}
