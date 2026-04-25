'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Typography,
  Stack,
  Box,
  Card,
  CardMedia,
  CardContent,
  Chip,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Button,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PublicIcon from '@mui/icons-material/Public';
import LockIcon from '@mui/icons-material/Lock';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import type { CollectionDetail } from '@/lib/collections-service';
import { collectionsService } from '@/lib/collections-service';
import { getStorageUrl } from '@/lib/upload-service';
import { ApiError } from '@/lib/api-client';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CollectionDetailPage({ params }: PageProps) {
  const router = useRouter();
  const { id } = use(params);

  const [data, setData] = useState<CollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ gifId: string; title: string } | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await collectionsService.get(id);
      setData(d);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRemoveGif() {
    if (!confirmRemove || !data) return;
    try {
      await collectionsService.removeGif(data.collection.id, confirmRemove.gifId);
      setSnackbar('GIF retiré de la collection');
      load();
    } catch (err) {
      setSnackbar(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setConfirmRemove(null);
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Container maxWidth="md" sx={{ py: 6 }}>
        <Alert severity="error">{error ?? 'Collection introuvable'}</Alert>
        <Button sx={{ mt: 2 }} onClick={() => router.push('/collections')}>
          Retour aux collections
        </Button>
      </Container>
    );
  }

  const { collection, gifs } = data;

  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      <Stack spacing={3}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Tooltip title="Retour">
            <IconButton onClick={() => router.push('/collections')}>
              <ArrowBackIcon />
            </IconButton>
          </Tooltip>
          <Box sx={{ flexGrow: 1 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                {collection.name}
              </Typography>
              {collection.isPublic ? <PublicIcon color="action" /> : <LockIcon color="action" />}
            </Stack>
            {collection.description && (
              <Typography variant="body2" color="text.secondary">
                {collection.description}
              </Typography>
            )}
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Chip label={`${gifs.length} GIF${gifs.length > 1 ? 's' : ''}`} size="small" />
              <Chip
                label={collection.isPublic ? 'Publique' : 'Privée'}
                size="small"
                variant="outlined"
              />
            </Stack>
          </Box>
        </Stack>

        {gifs.length === 0 ? (
          <Card variant="outlined" sx={{ py: 8, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
              Cette collection est vide.
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Créez un GIF et ajoutez-le à cette collection.
            </Typography>
          </Card>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: 'repeat(2, 1fr)',
                sm: 'repeat(3, 1fr)',
                md: 'repeat(4, 1fr)',
              },
            }}
          >
            {gifs.map((gif) => (
              <Card key={gif.id} sx={{ position: 'relative' }}>
                <Tooltip title="Retirer de la collection">
                  <IconButton
                    size="small"
                    onClick={() => setConfirmRemove({ gifId: gif.id, title: gif.title })}
                    sx={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      zIndex: 1,
                      bgcolor: 'rgba(0,0,0,0.6)',
                      color: 'white',
                      '&:hover': { bgcolor: 'rgba(255,0,0,0.8)' },
                    }}
                  >
                    <RemoveCircleOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <CardMedia
                  component="img"
                  image={getStorageUrl(gif.filePath)}
                  alt={gif.title}
                  sx={{ aspectRatio: '1 / 1', objectFit: 'cover', bgcolor: 'black' }}
                />
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                    {gif.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {gif.width}×{gif.height}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Stack>

      <Dialog open={Boolean(confirmRemove)} onClose={() => setConfirmRemove(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Retirer le GIF</DialogTitle>
        <DialogContent>
          <Typography>
            Retirer &quot;{confirmRemove?.title}&quot; de cette collection ?
            <br /><br />
            Le GIF reste dans votre bibliothèque.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmRemove(null)}>Annuler</Button>
          <Button variant="contained" color="error" onClick={handleRemoveGif}>
            Retirer
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(snackbar)}
        autoHideDuration={3000}
        onClose={() => setSnackbar(null)}
        message={snackbar ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      />
    </Container>
  );
}
