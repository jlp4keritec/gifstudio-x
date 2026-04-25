'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import {
  Container,
  Box,
  Typography,
  Stack,
  Chip,
  Alert,
  CircularProgress,
  Paper,
  Button,
  Snackbar,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import ShareIcon from '@mui/icons-material/Share';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PersonIcon from '@mui/icons-material/Person';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import type { PublicGif } from '@gifstudio-x/shared';
import { exploreService } from '@/lib/explore-service';
import { getStorageUrl } from '@/lib/upload-service';
import { ApiError } from '@/lib/api-client';
import { PublicTopbar } from '@/components/PublicTopbar';
import { ShareDialog } from '@/components/share/ShareDialog';

interface PageProps {
  params: Promise<{ slug: string }>;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function GifDetailPage({ params }: PageProps) {
  const { slug } = use(params);
  const [gif, setGif] = useState<PublicGif | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    setLoading(true);
    exploreService
      .getBySlug(slug)
      .then((g) => {
        setGif(g);
        setError(null);
      })
      .catch((err) => {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('Erreur de chargement');
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  async function handleDownload() {
    if (!gif) return;
    try {
      const response = await fetch(getStorageUrl(gif.filePath));
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${gif.slug}.gif`;
      link.click();
      URL.revokeObjectURL(link.href);
      setDownloaded(true);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <PublicTopbar />

      <Container maxWidth="md" sx={{ py: 4 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {error && !loading && (
          <>
            <Alert severity="error">{error}</Alert>
            <Button component={Link} href="/explore" sx={{ mt: 2 }} startIcon={<ArrowBackIcon />}>
              Retour à Explorer
            </Button>
          </>
        )}

        {gif && !loading && (
          <Stack spacing={3}>
            <Box>
              <Button
                component={Link}
                href="/explore"
                startIcon={<ArrowBackIcon />}
                size="small"
              >
                Retour
              </Button>
            </Box>

            <Paper
              elevation={2}
              sx={{
                bgcolor: 'black',
                borderRadius: 2,
                overflow: 'hidden',
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <Box
                component="img"
                src={getStorageUrl(gif.filePath)}
                alt={gif.title}
                sx={{
                  maxWidth: '100%',
                  maxHeight: '75vh',
                  display: 'block',
                }}
              />
            </Paper>

            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                {gif.title}
              </Typography>
              {gif.description && (
                <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
                  {gif.description}
                </Typography>
              )}
            </Box>

            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <PersonIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                  {gif.ownerEmail.split('@')[0]}
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                • {formatDate(gif.createdAt)}
              </Typography>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <VisibilityIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                  {gif.views} vue{gif.views > 1 ? 's' : ''}
                </Typography>
              </Stack>
            </Stack>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip label={`${gif.width}×${gif.height}`} size="small" variant="outlined" />
              <Chip label={`${gif.fps} fps`} size="small" variant="outlined" />
              <Chip
                label={`${(gif.durationMs / 1000).toFixed(1)}s`}
                size="small"
                variant="outlined"
              />
              {gif.categories.map((c) => (
                <Chip key={c.id} label={c.name} size="small" color="primary" variant="outlined" />
              ))}
              {gif.tags.map((tag) => (
                <Chip key={tag} label={`#${tag}`} size="small" />
              ))}
            </Stack>

            <Stack direction="row" spacing={1.5}>
              <Button
                variant="contained"
                startIcon={<ShareIcon />}
                onClick={() => setShareOpen(true)}
              >
                Partager
              </Button>
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={handleDownload}
              >
                Télécharger
              </Button>
            </Stack>
          </Stack>
        )}
      </Container>

      {gif && (
        <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} gif={gif} />
      )}

      <Snackbar
        open={downloaded}
        autoHideDuration={2000}
        onClose={() => setDownloaded(false)}
        message="Téléchargement démarré"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
