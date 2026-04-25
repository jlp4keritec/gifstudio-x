'use client';

import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Button,
  Stack,
  Chip,
  Alert,
  CircularProgress,
  Typography,
  Switch,
  FormControlLabel,
  Box,
  Autocomplete,
  LinearProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { CollectionWithPreview, Category } from '@gifstudio-x/shared';
import { collectionsService } from '@/lib/collections-service';
import { exploreService } from '@/lib/explore-service';
import { saveGif } from '@/lib/gifs-service';

interface SaveGifDialogProps {
  open: boolean;
  onClose: () => void;
  blob: Blob;
  durationMs: number;
  fps: number;
  onSaved: () => void;
}

export function SaveGifDialog({
  open,
  onClose,
  blob,
  durationMs,
  fps,
  onSaved,
}: SaveGifDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [collections, setCollections] = useState<CollectionWithPreview[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<CollectionWithPreview[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string>('');
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoadingData(true);
    Promise.all([collectionsService.list(), exploreService.categories()])
      .then(([cols, cats]) => {
        setCollections(cols);
        setCategories(cats);
      })
      .catch(console.error)
      .finally(() => setLoadingData(false));
  }, [open]);

  function handleClose() {
    if (submitting) return;
    setTitle('');
    setDescription('');
    setTags([]);
    setTagInput('');
    setIsPublic(false);
    setSelectedCollections([]);
    setCategoryId('');
    setError(null);
    setCreatingCollection(false);
    setNewCollectionName('');
    setUploadProgress(0);
    onClose();
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase();
    if (!t || tags.includes(t)) return;
    if (tags.length >= 20) return;
    setTags([...tags, t]);
    setTagInput('');
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  }

  async function handleCreateCollection() {
    if (!newCollectionName.trim()) return;
    try {
      const created = await collectionsService.create({
        name: newCollectionName.trim(),
        isPublic: false,
      });
      setCollections((prev) => [created, ...prev]);
      setSelectedCollections((prev) => [...prev, created]);
      setNewCollectionName('');
      setCreatingCollection(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur création collection');
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError('Le titre est obligatoire');
      return;
    }

    setSubmitting(true);
    setUploadProgress(0);
    try {
      await saveGif(
        {
          blob,
          title: title.trim(),
          description: description.trim() || undefined,
          tags,
          isPublic,
          collectionIds: selectedCollections.map((c) => c.id),
          categoryIds: categoryId ? [categoryId] : [],
          durationMs,
          fps,
        },
        (p) => setUploadProgress(p),
      );
      onSaved();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Enregistrer le GIF</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              label="Titre"
              fullWidth
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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

            <TextField
              select
              label="Catégorie"
              fullWidth
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={submitting || loadingData}
              helperText="Classement pour faciliter la découverte (optionnel)"
            >
              <MenuItem value="">
                <em>Aucune</em>
              </MenuItem>
              {categories.map((cat) => (
                <MenuItem key={cat.id} value={cat.id}>
                  {cat.name}
                </MenuItem>
              ))}
            </TextField>

            <Box>
              <Typography variant="caption" color="text.secondary">
                Tags (max 20) — appuyez sur Entrée ou virgule pour ajouter
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                {tags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    onDelete={submitting ? undefined : () => removeTag(tag)}
                  />
                ))}
                <TextField
                  size="small"
                  placeholder="Nouveau tag..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  disabled={submitting || tags.length >= 20}
                  sx={{ width: 160 }}
                />
              </Stack>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                Collections
              </Typography>
              <Autocomplete
                multiple
                size="small"
                options={collections}
                value={selectedCollections}
                onChange={(_, v) => setSelectedCollections(v)}
                getOptionLabel={(o) => o.name}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                loading={loadingData}
                disabled={submitting}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder={selectedCollections.length === 0 ? 'Choisir...' : ''}
                  />
                )}
                sx={{ mt: 0.5 }}
              />

              {!creatingCollection ? (
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setCreatingCollection(true)}
                  disabled={submitting}
                  sx={{ mt: 1 }}
                >
                  Créer une nouvelle collection
                </Button>
              ) : (
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <TextField
                    size="small"
                    placeholder="Nom de la collection"
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    autoFocus
                    fullWidth
                  />
                  <Button size="small" variant="contained" onClick={handleCreateCollection}>
                    Créer
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setCreatingCollection(false);
                      setNewCollectionName('');
                    }}
                  >
                    Annuler
                  </Button>
                </Stack>
              )}
            </Box>

            <FormControlLabel
              control={
                <Switch
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  disabled={submitting}
                />
              }
              label={
                <Stack>
                  <Typography variant="body2">
                    {isPublic ? 'GIF public' : 'GIF privé'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {isPublic
                      ? 'Visible dans Explorer, lien partageable publiquement'
                      : 'Visible uniquement par vous'}
                  </Typography>
                </Stack>
              }
            />

            {submitting && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Envoi en cours... {uploadProgress}%
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={uploadProgress}
                  sx={{ mt: 0.5, height: 6, borderRadius: 3 }}
                />
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={submitting}>
            Annuler
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={submitting || !title.trim()}
            startIcon={submitting ? <CircularProgress size={18} /> : null}
          >
            {submitting ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
