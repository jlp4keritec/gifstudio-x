'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Paper,
  Stack,
  Button,
  TextField,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  Chip,
  IconButton,
  Tooltip,
  TablePagination,
  CircularProgress,
  Alert,
  Collapse,
  Snackbar,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import FilterListIcon from '@mui/icons-material/FilterList';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import ClearIcon from '@mui/icons-material/Clear';
import MovieFilterIcon from '@mui/icons-material/MovieFilter';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import type {
  VideoAsset,
  VideoAssetFilters,
  VideoAssetSource,
  VideoAssetStatus,
  VideoAssetSort,
  UploadedVideo,
} from '@gifstudio-x/shared';
import { videosService } from '@/lib/videos-service';
import { ThumbnailHover } from '@/components/library/ThumbnailHover';
import { useDraft } from '@/lib/draft-context';

const EMPTY_FILTERS: VideoAssetFilters = {
  sort: 'date_desc',
  offset: 0,
  limit: 25,
};

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function statusChipColor(s: string): 'default' | 'success' | 'warning' | 'error' {
  switch (s) {
    case 'ready': return 'success';
    case 'downloading': return 'warning';
    case 'failed': return 'error';
    default: return 'default';
  }
}

function sourceLabel(s: string): string {
  switch (s) {
    case 'url_import': return 'URL';
    case 'file_upload': return 'Upload';
    case 'crawler': return 'Crawler';
    default: return s;
  }
}

function SourceChip({ video }: { video: VideoAsset }) {
  let tooltip = '';
  if (video.source === 'crawler' && video.crawlerOrigin) {
    tooltip = `${video.crawlerOrigin.sourceName} (${video.crawlerOrigin.adapter})`;
  } else if (video.source === 'crawler') {
    tooltip = 'Crawler (source supprimee)';
  } else if (video.source === 'url_import') {
    tooltip = video.sourceUrl ?? 'URL';
  } else if (video.source === 'file_upload') {
    tooltip = video.originalFilename ?? 'Upload local';
  }

  return (
    <Tooltip title={tooltip} placement="top" arrow>
      <Chip
        label={sourceLabel(video.source)}
        size="small"
        variant="outlined"
        sx={{ cursor: tooltip ? 'help' : 'default' }}
      />
    </Tooltip>
  );
}

/**
 * Petit composant pour afficher / gerer le slug de partage d'une video.
 * - Si pas de slug : icone "lien" pour en generer un
 * - Si slug present : icone copie + icone revocation, tooltip avec le slug
 */
function ShareSlugCell({
  video,
  onChanged,
  onError,
}: {
  video: VideoAsset;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  if (video.status !== 'ready') {
    return <Typography variant="caption" color="text.disabled">—</Typography>;
  }

  const handleCreate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      await videosService.createShareSlug(video.id);
      onChanged();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Revoquer ce lien de partage ? Toute personne ayant l\'URL perdra l\'acces.')) return;
    setBusy(true);
    try {
      await videosService.revokeShareSlug(video.id);
      onChanged();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!video.shareSlug) return;
    const fullUrl = videosService.fileUrlBySlug(video.shareSlug);
    try {
      await navigator.clipboard.writeText(fullUrl);
      onError('Lien copie dans le presse-papiers');
    } catch {
      onError('Impossible de copier');
    }
  };

  if (!video.shareSlug) {
    return (
      <Tooltip title="Generer un lien de partage">
        <span>
          <IconButton size="small" onClick={handleCreate} disabled={busy}>
            <LinkOffIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    );
  }

  return (
    <Stack direction="row" spacing={0} alignItems="center">
      <Tooltip title={`Slug : ${video.shareSlug} — copier l'URL`}>
        <span>
          <IconButton size="small" onClick={handleCopy} disabled={busy} color="primary">
            <LinkIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Copier l'URL complete">
        <span>
          <IconButton size="small" onClick={handleCopy} disabled={busy}>
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Revoquer le lien">
        <span>
          <IconButton size="small" onClick={handleRevoke} disabled={busy} color="warning">
            <LinkOffIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
}

export default function LibraryPage() {
  const router = useRouter();
  const { setSourceVideo } = useDraft();
  const [items, setItems] = useState<VideoAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<VideoAssetFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [regenLoading, setRegenLoading] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput || undefined, offset: 0 }));
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await videosService.listAdvanced(filters);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      console.error('[library] fetch failed', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm('Supprimer cette video ?')) return;
    try {
      await videosService.remove(id);
      await fetchList();
    } catch (err) {
      console.error('[library] delete failed', err);
    }
  };

  const handleRegenerateAll = async () => {
    if (!confirm('Regenerer les thumbnails manquantes ?')) return;
    setRegenLoading(true);
    try {
      const r = await videosService.regenerateAllThumbnails();
      setSnack(
        `${r.generated} thumbnails generees / ${r.processed} candidates (${r.failed} echecs)`,
      );
      await fetchList();
    } catch (err) {
      setSnack(`Erreur : ${(err as Error).message}`);
    } finally {
      setRegenLoading(false);
    }
  };

  /**
   * Cree (ou reutilise) un slug pour la video, puis route vers /create/edit
   * en injectant la video dans le DraftContext sous forme d'UploadedVideo.
   */
  const openInEditor = useCallback(
    async (video: VideoAsset) => {
      if (video.status !== 'ready' || !video.localPath) {
        setSnack('Video non prete pour l\'editeur');
        return;
      }
      setSnack('Preparation de la video...');
      try {
        let slug = video.shareSlug;
        if (!slug) {
          const r = await videosService.createShareSlug(video.id);
          slug = r.shareSlug;
        }
        const fileUrl = videosService.fileUrlBySlug(slug);
        const uploaded: UploadedVideo = {
          id: video.id,
          filename: slug,
          originalName: video.originalFilename || `video-${video.id.slice(0, 8)}.mp4`,
          mimeType: video.mimeType ?? 'video/mp4',
          size: video.fileSizeBytes ?? 0,
          path: video.localPath,
          url: fileUrl,
          uploadedAt: video.createdAt,
        };
        setSourceVideo(uploaded);
        router.push('/create/edit');
      } catch (err) {
        setSnack(`Erreur : ${(err as Error).message}`);
      }
    },
    [router, setSourceVideo],
  );

  const resetFilters = () => {
    setSearchInput('');
    setFilters(EMPTY_FILTERS);
  };

  const hasActiveFilters = useMemo(() => {
    const { sort, offset, limit, ...rest } = filters;
    return Object.values(rest).some((v) => v !== undefined && v !== '');
  }, [filters]);

  const updateFilter = <K extends keyof VideoAssetFilters>(
    key: K,
    value: VideoAssetFilters[K],
  ) => {
    setFilters((f) => ({ ...f, [key]: value, offset: 0 }));
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => router.push('/dashboard')}
              variant="outlined"
            >
              Dashboard
            </Button>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              Bibliotheque
            </Typography>
            <Chip
              label={`${total} video${total > 1 ? 's' : ''}`}
              size="small"
              color="primary"
              variant="outlined"
            />
          </Stack>
          <Stack direction="row" spacing={1}>
            <Tooltip title="Regenerer les thumbnails manquantes">
              <span>
                <Button
                  onClick={handleRegenerateAll}
                  variant="outlined"
                  size="small"
                  startIcon={regenLoading ? <CircularProgress size={16} /> : <AutorenewIcon />}
                  disabled={regenLoading}
                >
                  Thumbnails
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="Rafraichir">
              <IconButton onClick={() => void fetchList()}><RefreshIcon /></IconButton>
            </Tooltip>
          </Stack>
        </Box>

        <Paper sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField
              placeholder="Rechercher (nom de fichier, URL)..."
              size="small"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              sx={{ flexGrow: 1, maxWidth: 400 }}
              InputProps={{
                endAdornment: searchInput ? (
                  <IconButton size="small" onClick={() => setSearchInput('')}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                ) : undefined,
              }}
            />
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Tri</InputLabel>
              <Select
                value={filters.sort ?? 'date_desc'}
                label="Tri"
                onChange={(e) => updateFilter('sort', e.target.value as VideoAssetSort)}
              >
                <MenuItem value="date_desc">Recentes</MenuItem>
                <MenuItem value="date_asc">Anciennes</MenuItem>
                <MenuItem value="duration_desc">Durée +</MenuItem>
                <MenuItem value="duration_asc">Durée -</MenuItem>
                <MenuItem value="size_desc">Taille +</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant={filtersOpen ? 'contained' : 'outlined'}
              startIcon={<FilterListIcon />}
              onClick={() => setFiltersOpen((o) => !o)}
              size="small"
            >
              Filtres {hasActiveFilters && '●'}
            </Button>
            {hasActiveFilters && (
              <Button onClick={resetFilters} size="small" color="warning">
                Effacer
              </Button>
            )}
          </Stack>

          <Collapse in={filtersOpen}>
            <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 2 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Source</InputLabel>
                <Select
                  value={filters.source ?? ''}
                  label="Source"
                  onChange={(e) => updateFilter('source', (e.target.value || undefined) as VideoAssetSource)}
                >
                  <MenuItem value="">Toutes</MenuItem>
                  <MenuItem value="url_import">URL</MenuItem>
                  <MenuItem value="file_upload">Upload</MenuItem>
                  <MenuItem value="crawler">Crawler</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small" fullWidth>
                <InputLabel>Statut</InputLabel>
                <Select
                  value={filters.status ?? ''}
                  label="Statut"
                  onChange={(e) => updateFilter('status', (e.target.value || undefined) as VideoAssetStatus)}
                >
                  <MenuItem value="">Tous</MenuItem>
                  <MenuItem value="ready">Ready</MenuItem>
                  <MenuItem value="downloading">Downloading</MenuItem>
                  <MenuItem value="failed">Failed</MenuItem>
                  <MenuItem value="pending">Pending</MenuItem>
                </Select>
              </FormControl>

              <TextField type="date" size="small" label="Date debut"
                InputLabelProps={{ shrink: true }}
                value={filters.dateFrom?.slice(0, 10) ?? ''}
                onChange={(e) => updateFilter('dateFrom', e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined)}
              />
              <TextField type="date" size="small" label="Date fin"
                InputLabelProps={{ shrink: true }}
                value={filters.dateTo?.slice(0, 10) ?? ''}
                onChange={(e) => updateFilter('dateTo', e.target.value ? `${e.target.value}T23:59:59.999Z` : undefined)}
              />

              <TextField type="number" size="small" label="Duree min (s)"
                value={filters.durationMin ?? ''}
                onChange={(e) => updateFilter('durationMin', e.target.value ? Number(e.target.value) : undefined)}
                inputProps={{ min: 0 }} />
              <TextField type="number" size="small" label="Duree max (s)"
                value={filters.durationMax ?? ''}
                onChange={(e) => updateFilter('durationMax', e.target.value ? Number(e.target.value) : undefined)}
                inputProps={{ min: 0 }} />
              <TextField type="number" size="small" label="Largeur min (px)"
                value={filters.minWidth ?? ''}
                onChange={(e) => updateFilter('minWidth', e.target.value ? Number(e.target.value) : undefined)}
                inputProps={{ min: 0 }} />
              <TextField type="number" size="small" label="Hauteur min (px)"
                value={filters.minHeight ?? ''}
                onChange={(e) => updateFilter('minHeight', e.target.value ? Number(e.target.value) : undefined)}
                inputProps={{ min: 0 }} />
            </Box>
          </Collapse>
        </Paper>

        <Paper>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : items.length === 0 ? (
            <Alert severity="info" sx={{ m: 2 }}>Aucune video ne correspond a ces filtres.</Alert>
          ) : (
            <>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell width={40}></TableCell>
                      <TableCell>Statut</TableCell>
                      <TableCell>Source</TableCell>
                      <TableCell>Origine</TableCell>
                      <TableCell>Duree</TableCell>
                      <TableCell>Dim.</TableCell>
                      <TableCell>Taille</TableCell>
                      <TableCell>Codec</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell align="center">Lien</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {items.map((v) => {
                      const isReady = v.status === 'ready';
                      return (
                        <TableRow
                          key={v.id}
                          hover
                          onClick={isReady ? () => void openInEditor(v) : undefined}
                          sx={{
                            cursor: isReady ? 'pointer' : 'default',
                          }}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <ThumbnailHover
                              videoId={v.id}
                              hasThumbnail={Boolean(v.thumbnailPath) && v.status === 'ready'}
                              thumbnailUrl={videosService.thumbnailUrl(v.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip label={v.status} color={statusChipColor(v.status)} size="small" />
                            {v.errorMessage && (
                              <Tooltip title={v.errorMessage}>
                                <Typography variant="caption" color="error" sx={{ ml: 1, cursor: 'help' }}>ⓘ</Typography>
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell><SourceChip video={v} /></TableCell>
                          <TableCell sx={{ maxWidth: 260 }}>
                            <Tooltip title={v.sourceUrl || v.originalFilename || ''}>
                              <Typography variant="body2" noWrap>
                                {v.originalFilename || v.sourceUrl || '—'}
                              </Typography>
                            </Tooltip>
                          </TableCell>
                          <TableCell>{formatDuration(v.durationSec)}</TableCell>
                          <TableCell>
                            {v.width && v.height ? `${v.width}×${v.height}` : '—'}
                          </TableCell>
                          <TableCell>{formatBytes(v.fileSizeBytes)}</TableCell>
                          <TableCell>{v.videoCodec || '—'}</TableCell>
                          <TableCell>
                            {new Date(v.createdAt).toLocaleString('fr-FR', {
                              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                            })}
                          </TableCell>
                          <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                            <ShareSlugCell
                              video={v}
                              onChanged={() => void fetchList()}
                              onError={(msg) => setSnack(msg)}
                            />
                          </TableCell>
                          <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                            {isReady && (
                              <Tooltip title="Creer un GIF">
                                <IconButton
                                  size="small"
                                  color="primary"
                                  onClick={() => void openInEditor(v)}
                                >
                                  <MovieFilterIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            <IconButton size="small" onClick={(e) => void handleDelete(v.id, e)} color="error">
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={total}
                page={Math.floor((filters.offset ?? 0) / (filters.limit ?? 25))}
                onPageChange={(_e, p) =>
                  setFilters((f) => ({ ...f, offset: p * (f.limit ?? 25) }))
                }
                rowsPerPage={filters.limit ?? 25}
                onRowsPerPageChange={(e) =>
                  setFilters((f) => ({ ...f, limit: Number(e.target.value), offset: 0 }))
                }
                rowsPerPageOptions={[10, 25, 50, 100]}
                labelRowsPerPage="Lignes :"
              />
            </>
          )}
        </Paper>
      </Stack>

      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        message={snack}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      />
    </Container>
  );
}
