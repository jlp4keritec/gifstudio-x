'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Container,
  Typography,
  Stack,
  Box,
  Card,
  CardActionArea,
  CardContent,
  CardMedia,
  Button,
  Chip,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  FormControlLabel,
  Snackbar,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CollectionsIcon from '@mui/icons-material/Collections';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PublicIcon from '@mui/icons-material/Public';
import LockIcon from '@mui/icons-material/Lock';
import type { CollectionWithPreview } from '@gifstudio-x/shared';
import { collectionsService } from '@/lib/collections-service';
import { getStorageUrl } from '@/lib/upload-service';
import { ApiError } from '@/lib/api-client';

export default function CollectionsPage() {
  const [collections, setCollections] = useState<CollectionWithPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CollectionWithPreview | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ el: HTMLElement; col: CollectionWithPreview } | null>(null);
  const [toDelete, setToDelete] = useState<CollectionWithPreview | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await collectionsService.list();
      setCollections(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete() {
    if (!toDelete) return;
    try {
      await collectionsService.remove(toDelete.id);
      setCollections((prev) => prev.filter((c) => c.id !== toDelete.id));
      setSnackbar(`Collection "${toDelete.name}" supprimée`);
    } catch (err) {
      setSnackbar(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setToDelete(null);
    }
  }

  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      <Stack spacing={3}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              Mes collections
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {collections.length} collection{collections.length > 1 ? 's' : ''}
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
            Nouvelle collection
          </Button>
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : collections.length === 0 ? (
          <Card variant="outlined" sx={{ py: 8, textAlign: 'center' }}>
            <Stack spacing={2} alignItems="center">
              <CollectionsIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
              <Typography variant="h6">Aucune collection pour le moment</Typography>
              <Typography variant="body2" color="text.secondary">
                Créez votre première collection pour organiser vos GIFs.
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setCreateOpen(true)}
              >
                Créer une collection
              </Button>
            </Stack>
          </Card>
        ) : (
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
            {collections.map((c) => (
              <Card key={c.id} sx={{ position: 'relative' }}>
                <Tooltip title="Plus d'options">
                  <IconButton
                    size="small"
                    onClick={(e) => setMenuAnchor({ el: e.currentTarget, col: c })}
                    sx={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      zIndex: 1,
                      bgcolor: 'rgba(0,0,0,0.5)',
                      color: 'white',
                      '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
                    }}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <CardActionArea component={Link} href={`/collections/${c.id}`}>
                  {c.previewGifUrl ? (
                    <CardMedia
                      component="img"
                      image={getStorageUrl(c.previewGifUrl)}
                      alt={c.name}
                      sx={{ height: 180, objectFit: 'cover', bgcolor: 'black' }}
                    />
                  ) : (
                    <Box
                      sx={{
                        height: 180,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: 'action.hover',
                      }}
                    >
                      <CollectionsIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
                    </Box>
                  )}
                  <CardContent>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, flexGrow: 1 }} noWrap>
                        {c.name}
                      </Typography>
                      {c.isPublic ? (
                        <Tooltip title="Publique">
                          <PublicIcon fontSize="small" color="action" />
                        </Tooltip>
                      ) : (
                        <Tooltip title="Privée">
                          <LockIcon fontSize="small" color="action" />
                        </Tooltip>
                      )}
                    </Stack>
                    <Stack direction="row" spacing={1}>
                      <Chip label={`${c.gifCount} GIF${c.gifCount > 1 ? 's' : ''}`} size="small" />
                    </Stack>
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </Box>
        )}
      </Stack>

      <Menu
        anchorEl={menuAnchor?.el ?? null}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            if (menuAnchor) setEditing(menuAnchor.col);
            setMenuAnchor(null);
          }}
        >
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Modifier</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuAnchor) setToDelete(menuAnchor.col);
            setMenuAnchor(null);
          }}
        >
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>Supprimer</ListItemText>
        </MenuItem>
      </Menu>

      <CollectionFormDialog
        open={createOpen || Boolean(editing)}
        mode={editing ? 'edit' : 'create'}
        collection={editing}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onSaved={(msg) => {
          load();
          setSnackbar(msg);
        }}
      />

      <Dialog open={Boolean(toDelete)} onClose={() => setToDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Supprimer la collection</DialogTitle>
        <DialogContent>
          <Typography>
            Êtes-vous sûr de vouloir supprimer la collection &quot;{toDelete?.name}&quot; ?
            <br /><br />
            Les GIFs qu&apos;elle contient ne seront pas supprimés, ils seront juste retirés de la collection.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setToDelete(null)}>Annuler</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>
            Supprimer
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

// ============================================================================
// Dialog création/édition collection
// ============================================================================

interface CollectionFormDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  collection: CollectionWithPreview | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

function CollectionFormDialog({ open, mode, collection, onClose, onSaved }: CollectionFormDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(collection?.name ?? '');
      setDescription(collection?.description ?? '');
      setIsPublic(collection?.isPublic ?? false);
      setError(null);
    }
  }, [open, collection]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'edit' && collection) {
        await collectionsService.update(collection.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          isPublic,
        });
        onSaved('Collection mise à jour');
      } else {
        await collectionsService.create({
          name: name.trim(),
          description: description.trim() || undefined,
          isPublic,
        });
        onSaved('Collection créée');
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {mode === 'edit' ? 'Modifier la collection' : 'Nouvelle collection'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              label="Nom"
              fullWidth
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              inputProps={{ maxLength: 255 }}
            />

            <TextField
              label="Description"
              fullWidth
              multiline
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              placeholder="(optionnel)"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  disabled={submitting}
                />
              }
              label={isPublic ? 'Collection publique' : 'Collection privée'}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={submitting}>Annuler</Button>
          <Button type="submit" variant="contained" disabled={submitting || !name.trim()}>
            {mode === 'edit' ? 'Enregistrer' : 'Créer'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
