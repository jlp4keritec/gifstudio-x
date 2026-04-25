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
  Checkbox,
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
import { BulkActionBar, BulkActionButton } from '@/components/library/BulkActionBar';
import { useDraft } from '@/lib/draft-context';
import { useConfirm } from '@/components/ui/ConfirmDialog';

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

function ShareSlugCell({
  video,
  onChanged,
  onError,
}: {
  video: VideoAsset;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const confirm = useConfirm();
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
    const ok = await confirm({
      title: 'Revoquer le lien',
      message: 'Toute personne ayant deja l\'URL perdra l\'acces a la video. Continuer ?',
      tone: 'danger',
      confirmLabel: 'Revoquer',
    });
    if (!ok) return;
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
  const confirm = useConfirm();
  const [items, setItems] = useState<VideoAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<VideoAssetFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [regenLoading, setRegenLoading] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllFiltered, setSelectAllFiltered] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

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

  useEffect(() => {
    if (!selectAllFiltered) {
      setSelectedIds(new Set());
    }
  }, [filters.search, filters.status, filters.source, filters.dateFrom, filters.dateTo,
      filters.durationMin, filters.durationMax, filters.minWidth, filters.minHeight,
      filters.sort, selectAllFiltered]);

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const ok = await confirm({
      message: 'Supprimer cette video ? Le fichier sera definitivement supprime du disque.',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await videosService.remove(id);
      await fetchList();
    } catch (err) {
      console.error('[library] delete failed', err);
    }
  };

  const handleRegenerateAll = async () => {
    const ok = await confirm({
      title: 'Regenerer les thumbnails',
      message: 'Regenerer les thumbnails manquantes pour toutes les videos eligibles ?',
    });
    if (!ok) return;
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
        const relativePath = `/api/v1/videos/file/${slug}`;
        const uploaded: UploadedVideo = {
          id: video.id,
          filename: slug,
          originalName: video.originalFilename || `video-${video.id.slice(0, 8)}.mp4`,
          mimeType: video.mimeType ?? 'video/mp4',
          size: video.fileSizeBytes ?? 0,
          path: video.localPath,
          url: relativePath,
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

  const toggleOne = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectAllFiltered(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visibleIds = useMemo(() => items.map((i) => i.id), [items]);

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = !allVisibleSelected && visibleIds.some((id) => selectedIds.has(id));

  const toggleAllVisible = () => {
    setSelectAllFiltered(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const selectAllFilteredItems = async () => {
    setBulkBusy(true);
    try {
      const data = await videosService.listAdvanced({
        ...filters,
        offset: 0,
        limit: 500,
      });
      setSelectedIds(new Set(data.items.map((i) => i.id)));
      setSelectAllFiltered(true);
      if (data.total > 500) {
        setSnack(`Selection limitee aux 500 premiers resultats (sur ${data.total})`);
      }
    } catch (err) {
      setSnack(`Erreur : ${(err as Error).message}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectAllFiltered(false);
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const ok = await confirm({
      title: 'Suppression en lot',
      message: `Supprimer ${ids.length} video${ids.length > 1 ? 's' : ''} ? Les fichiers seront definitivement supprimes du disque.`,
      tone: 'danger',
      confirmLabel: `Supprimer ${ids.length}`,
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      const result = await videosService.bulkDelete(ids);
      const baseMsg = `${result.succeeded} supprimee${result.succeeded > 1 ? 's' : ''}`;
      const errMsg = result.failed > 0 ? ` / ${result.failed} echec${result.failed > 1 ? 's' : ''}` : '';
      setSnack(baseMsg + errMsg);
      clearSelection();
      await fetchList();
    } catch (err) {
      setSnack(`Erreur : ${(err as Error).message}`);
    } finally {
      setBulkBusy(false);
    }
  };

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

        <BulkActionBar
          selectedCount={selectedIds.size}
          totalCount={total}
          visibleCount={visibleIds.length}
          allFilteredSelected={selectAllFiltered}
          onSelectAllFiltered={selectAllFilteredItems}
          onClear={clearSelection}
          actions={
            <BulkActionButton
              onClick={() => void handleBulkDelete()}
              disabled={bulkBusy}
              color="error"
              startIcon={<DeleteIcon fontSize="small" />}
            >
              Supprimer
            </BulkActionButton>
          }
        />

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
                      <TableCell padding="checkbox">
                        <Checkbox
                          indeterminate={someVisibleSelected}
                          checked={allVisibleSelected}
                          onChange={toggleAllVisible}
                        />
                      </TableCell>
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
                      const isSelected = selectedIds.has(v.id);
                      return (
                        <TableRow
                          key={v.id}
                          hover
                          selected={isSelected}
                          onClick={isReady ? () => void openInEditor(v) : undefined}
                          sx={{
                            cursor: isReady ? 'pointer' : 'default',
                          }}
                        >
                          <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              onChange={(e) => toggleOne(v.id, e as unknown as React.MouseEvent)}
                            />
                          </TableCell>
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
        autoHideDuration={5000}
        onClose={() => setSnack(null)}
        message={snack}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      />
    </Container>
  );
}
