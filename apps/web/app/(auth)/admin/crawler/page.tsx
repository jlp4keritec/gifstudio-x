'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Paper,
  Button,
  Stack,
  Tabs,
  Tab,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TablePagination,
  Snackbar,
  Popper,
  Paper as MuiPaper,
  Fade,
  Checkbox,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckIcon from '@mui/icons-material/Check';
import BlockIcon from '@mui/icons-material/Block';
import ReplayIcon from '@mui/icons-material/Replay';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import BrokenImageIcon from '@mui/icons-material/BrokenImage';
import type {
  CrawlerSource,
  CrawlerResult,
  CrawlerAdapterInfo,
  CrawlerResultStatus,
} from '@gifstudio-x/shared';
import { crawlerService } from '@/lib/crawler-service';
import { useAuth } from '@/lib/auth-context';
import { CrawlerSourceDialog } from '@/components/crawler/CrawlerSourceDialog';
import { BulkActionBar, BulkActionButton } from '@/components/library/BulkActionBar';
import { useConfirm } from '@/components/ui/ConfirmDialog';

type TabKey = 'sources' | 'results';

const POLL_INTERVAL_MS = 10_000;

function statusColor(s: string): 'default' | 'success' | 'warning' | 'error' | 'info' {
  switch (s) {
    case 'success':
    case 'imported':
    case 'approved':
      return 'success';
    case 'running':
    case 'pending':
    case 'pending_review':
      return 'warning';
    case 'failed':
    case 'import_failed':
    case 'rejected':
      return 'error';
    default:
      return 'default';
  }
}

function ResultThumbnail({ resultId, hasThumbnail }: { resultId: string; hasThumbnail: boolean }) {
  const [errored, setErrored] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const url = crawlerService.thumbnailUrl(resultId);

  if (!hasThumbnail || errored) {
    return (
      <Box
        sx={{
          width: 80,
          height: 50,
          bgcolor: 'action.hover',
          borderRadius: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'text.disabled',
        }}
      >
        <BrokenImageIcon fontSize="small" />
      </Box>
    );
  }

  return (
    <>
      <Box
        component="span"
        sx={{ display: 'inline-block', cursor: 'zoom-in' }}
        onMouseEnter={(e) => setAnchorEl(e.currentTarget)}
        onMouseLeave={() => setAnchorEl(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          crossOrigin="use-credentials"
          onError={() => setErrored(true)}
          style={{
            width: 80,
            height: 50,
            objectFit: 'cover',
            borderRadius: 4,
            display: 'block',
          }}
        />
      </Box>

      <Popper
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        placement="right-start"
        transition
        sx={{ zIndex: 1300, pointerEvents: 'none' }}
      >
        {({ TransitionProps }) => (
          <Fade {...TransitionProps} timeout={120}>
            <MuiPaper elevation={8} sx={{ overflow: 'hidden', borderRadius: 1 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                crossOrigin="use-credentials"
                style={{ display: 'block', maxWidth: 480, maxHeight: 360 }}
              />
            </MuiPaper>
          </Fade>
        )}
      </Popper>
    </>
  );
}

export default function CrawlerAdminPage() {
  const router = useRouter();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [tab, setTab] = useState<TabKey>('sources');

  const [adapters, setAdapters] = useState<CrawlerAdapterInfo[]>([]);

  const [sources, setSources] = useState<CrawlerSource[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<CrawlerSource | null>(null);

  const [results, setResults] = useState<CrawlerResult[]>([]);
  const [resultsTotal, setResultsTotal] = useState(0);
  const [resultsLoading, setResultsLoading] = useState(true);
  const [resultsFilter, setResultsFilter] = useState<{
    status?: CrawlerResultStatus;
    sourceId?: string;
    search?: string;
    offset: number;
    limit: number;
  }>({ offset: 0, limit: 25 });

  const [selectedResultIds, setSelectedResultIds] = useState<Set<string>>(new Set());
  const [selectAllFilteredResults, setSelectAllFilteredResults] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [snack, setSnack] = useState<string | null>(null);

  const fetchSources = useCallback(async () => {
    setSourcesLoading(true);
    try {
      const items = await crawlerService.listSources();
      setSources(items);
    } catch (err) {
      console.error(err);
    } finally {
      setSourcesLoading(false);
    }
  }, []);

  const fetchResults = useCallback(async () => {
    setResultsLoading(true);
    try {
      const data = await crawlerService.listResults(resultsFilter);
      setResults(data.items);
      setResultsTotal(data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setResultsLoading(false);
    }
  }, [resultsFilter]);

  const refreshResultsCount = useCallback(async () => {
    try {
      const data = await crawlerService.listResults({ limit: 1, offset: 0 });
      setResultsTotal(data.total);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    crawlerService.listAdapters().then(setAdapters).catch(console.error);
  }, []);

  useEffect(() => {
    void fetchSources();
    void refreshResultsCount();
  }, [fetchSources, refreshResultsCount]);

  useEffect(() => {
    if (tab === 'results') void fetchResults();
  }, [tab, fetchResults]);

  useEffect(() => {
    if (!selectAllFilteredResults) {
      setSelectedResultIds(new Set());
    }
  }, [resultsFilter.status, resultsFilter.sourceId, resultsFilter.search, selectAllFilteredResults]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void fetchSources();
      if (tab === 'results') {
        void fetchResults();
      } else {
        void refreshResultsCount();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [tab, fetchSources, fetchResults, refreshResultsCount]);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const handleRunNow = async (id: string) => {
    try {
      await crawlerService.triggerRun(id);
      setSnack('Run enqueued');
      setTimeout(() => {
        void fetchSources();
        void refreshResultsCount();
      }, 3000);
    } catch (err) {
      setSnack(`Erreur : ${(err as Error).message}`);
    }
  };

  const handleToggleEnabled = async (src: CrawlerSource) => {
    try {
      await crawlerService.updateSource(src.id, { enabled: !src.enabled });
      await fetchSources();
    } catch (err) {
      setSnack(`Erreur : ${(err as Error).message}`);
    }
  };

  const handleDeleteSource = async (src: CrawlerSource) => {
    const ok = await confirm({
      title: 'Supprimer la source',
      message: `Supprimer la source "${src.name}" ? Les resultats associes seront aussi supprimes (les videos deja importees restent).`,
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await crawlerService.deleteSource(src.id);
      await fetchSources();
      await refreshResultsCount();
    } catch (err) {
      setSnack(`Erreur : ${(err as Error).message}`);
    }
  };

  const handleApprove = async (id: string) => {
    setSnack('Import en cours (peut prendre du temps)...');
    try {
      await crawlerService.approveResult(id);
      setSnack('Video importee');
      await fetchResults();
    } catch (err) {
      setSnack(`Erreur import : ${(err as Error).message}`);
      await fetchResults();
    }
  };

  const handleReject = async (id: string) => {
    try {
      await crawlerService.rejectResult(id);
      await fetchResults();
    } catch (err) {
      setSnack(`Erreur : ${(err as Error).message}`);
    }
  };

  const handleReopen = async (id: string) => {
    try {
      await crawlerService.reopenResult(id);
      await fetchResults();
    } catch (err) {
      setSnack(`Erreur : ${(err as Error).message}`);
    }
  };

  const handleDeleteResult = async (id: string) => {
    const ok = await confirm({
      message: 'Supprimer ce resultat ? La video importee (si elle existe) ne sera pas supprimee.',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await crawlerService.deleteResult(id);
      await fetchResults();
    } catch (err) {
      setSnack(`Erreur : ${(err as Error).message}`);
    }
  };

  const visibleResultIds = useMemo(() => results.map((r) => r.id), [results]);
  const allVisibleSelected =
    visibleResultIds.length > 0 && visibleResultIds.every((id) => selectedResultIds.has(id));
  const someVisibleSelected =
    !allVisibleSelected && visibleResultIds.some((id) => selectedResultIds.has(id));

  const toggleResultOne = (id: string) => {
    setSelectAllFilteredResults(false);
    setSelectedResultIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectAllFilteredResults(false);
    setSelectedResultIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleResultIds.forEach((id) => next.delete(id));
      } else {
        visibleResultIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const selectAllFiltered = async () => {
    setBulkBusy(true);
    try {
      const data = await crawlerService.listResults({
        ...resultsFilter,
        offset: 0,
        limit: 500,
      });
      setSelectedResultIds(new Set(data.items.map((i) => i.id)));
      setSelectAllFilteredResults(true);
      if (data.total > 500) {
        setSnack(`Selection limitee aux 500 premiers resultats (sur ${data.total})`);
      }
    } catch (err) {
      setSnack(`Erreur : ${(err as Error).message}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const clearResultsSelection = () => {
    setSelectedResultIds(new Set());
    setSelectAllFilteredResults(false);
  };

  const runBulkAction = async (action: 'delete' | 'reject' | 'approve') => {
    const ids = Array.from(selectedResultIds);
    if (ids.length === 0) return;

    const labels: Record<typeof action, { title: string; verb: string; tone: 'danger' | 'default' }> = {
      delete: { title: 'Suppression en lot', verb: 'Supprimer', tone: 'danger' },
      reject: { title: 'Rejet en lot', verb: 'Rejeter', tone: 'default' },
      approve: { title: 'Import en lot', verb: 'Approuver et importer', tone: 'default' },
    };
    const cfg = labels[action];

    let warning = '';
    if (action === 'approve' && ids.length > 5) {
      warning = ` (${ids.length} telechargements lances en parallele)`;
    }

    const ok = await confirm({
      title: cfg.title,
      message: `${cfg.verb} ${ids.length} resultat${ids.length > 1 ? 's' : ''} ?${warning}`,
      tone: cfg.tone,
      confirmLabel: `${cfg.verb} ${ids.length}`,
    });
    if (!ok) return;

    setBulkBusy(true);
    try {
      if (action === 'approve') {
        setSnack(`Import en cours (${ids.length} videos, peut prendre plusieurs minutes)...`);
      }
      const result = await crawlerService.bulkAction(ids, action);
      const baseMsg = `${result.succeeded} OK`;
      const errMsg = result.failed > 0 ? ` / ${result.failed} echec${result.failed > 1 ? 's' : ''}` : '';
      setSnack(`${cfg.verb} : ${baseMsg}${errMsg}`);
      clearResultsSelection();
      await fetchResults();
      await refreshResultsCount();
    } catch (err) {
      setSnack(`Erreur : ${(err as Error).message}`);
    } finally {
      setBulkBusy(false);
    }
  };

  if (user && user.role !== 'admin') return null;

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
              Crawler
            </Typography>
          </Stack>
        </Box>

        <Paper>
          <Tabs value={tab} onChange={(_, v) => setTab(v as TabKey)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Tab value="sources" label={`Sources (${sources.length})`} />
            <Tab value="results" label={`Resultats (${resultsTotal})`} />
          </Tabs>

          {tab === 'sources' && (
            <Box sx={{ p: 3 }}>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="h6">Sources configurees</Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => {
                      setEditingSource(null);
                      setDialogOpen(true);
                    }}
                  >
                    Nouvelle source
                  </Button>
                  <IconButton
                    onClick={() => {
                      void fetchSources();
                      void refreshResultsCount();
                    }}
                  >
                    <RefreshIcon />
                  </IconButton>
                </Stack>
              </Stack>

              {sourcesLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : sources.length === 0 ? (
                <Alert severity="info">
                  Aucune source configuree. Cliquer sur <strong>Nouvelle source</strong> pour en creer une.
                </Alert>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Nom</TableCell>
                      <TableCell>Adapter</TableCell>
                      <TableCell>Cron</TableCell>
                      <TableCell>Max / run</TableCell>
                      <TableCell>Etat</TableCell>
                      <TableCell>Dernier run</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sources.map((s) => (
                      <TableRow key={s.id} hover>
                        <TableCell>{s.name}</TableCell>
                        <TableCell>
                          <Chip label={s.adapter} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {s.cronExpression}
                          </Typography>
                        </TableCell>
                        <TableCell>{s.maxResultsPerRun}</TableCell>
                        <TableCell>
                          <Chip
                            label={s.enabled ? 'Active' : 'Desactivee'}
                            size="small"
                            color={s.enabled ? 'success' : 'default'}
                            onClick={() => void handleToggleEnabled(s)}
                            clickable
                          />
                        </TableCell>
                        <TableCell sx={{ maxWidth: 260 }}>
                          {s.lastRunAt ? (
                            <Stack spacing={0.5}>
                              <Chip
                                label={s.lastRunStatus ?? '?'}
                                size="small"
                                color={statusColor(s.lastRunStatus ?? '')}
                              />
                              <Typography variant="caption" color="text.secondary" noWrap>
                                {new Date(s.lastRunAt).toLocaleString('fr-FR')}
                                {s.lastRunMessage ? ` — ${s.lastRunMessage}` : ''}
                              </Typography>
                            </Stack>
                          ) : (
                            <Typography variant="caption" color="text.secondary">Jamais</Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Lancer maintenant">
                            <IconButton size="small" onClick={() => void handleRunNow(s.id)} color="primary">
                              <PlayArrowIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Editer">
                            <IconButton
                              size="small"
                              onClick={() => {
                                setEditingSource(s);
                                setDialogOpen(true);
                              }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Supprimer">
                            <IconButton size="small" onClick={() => void handleDeleteSource(s)} color="error">
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Box>
          )}

          {tab === 'results' && (
            <Box sx={{ p: 3 }}>
              <Stack direction="row" spacing={2} sx={{ mb: 2 }} alignItems="center">
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>Statut</InputLabel>
                  <Select
                    value={resultsFilter.status ?? ''}
                    label="Statut"
                    onChange={(e) =>
                      setResultsFilter({
                        ...resultsFilter,
                        status: (e.target.value as CrawlerResultStatus) || undefined,
                        offset: 0,
                      })
                    }
                  >
                    <MenuItem value="">Tous</MenuItem>
                    <MenuItem value="pending_review">A reviewer</MenuItem>
                    <MenuItem value="imported">Importes</MenuItem>
                    <MenuItem value="rejected">Rejetes</MenuItem>
                    <MenuItem value="import_failed">Echecs import</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 220 }}>
                  <InputLabel>Source</InputLabel>
                  <Select
                    value={resultsFilter.sourceId ?? ''}
                    label="Source"
                    onChange={(e) =>
                      setResultsFilter({
                        ...resultsFilter,
                        sourceId: e.target.value || undefined,
                        offset: 0,
                      })
                    }
                  >
                    <MenuItem value="">Toutes</MenuItem>
                    {sources.map((s) => (
                      <MenuItem key={s.id} value={s.id}>
                        {s.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  placeholder="Rechercher (titre, URL)..."
                  value={resultsFilter.search ?? ''}
                  onChange={(e) =>
                    setResultsFilter({
                      ...resultsFilter,
                      search: e.target.value || undefined,
                      offset: 0,
                    })
                  }
                  sx={{ flexGrow: 1, maxWidth: 400 }}
                />
                <IconButton onClick={() => void fetchResults()}>
                  <RefreshIcon />
                </IconButton>
              </Stack>

              <BulkActionBar
                selectedCount={selectedResultIds.size}
                totalCount={resultsTotal}
                visibleCount={visibleResultIds.length}
                allFilteredSelected={selectAllFilteredResults}
                onSelectAllFiltered={selectAllFiltered}
                onClear={clearResultsSelection}
                actions={
                  <>
                    <BulkActionButton
                      onClick={() => void runBulkAction('approve')}
                      disabled={bulkBusy}
                      color="success"
                      startIcon={<CheckIcon fontSize="small" />}
                    >
                      Approuver
                    </BulkActionButton>
                    <BulkActionButton
                      onClick={() => void runBulkAction('reject')}
                      disabled={bulkBusy}
                      color="warning"
                      startIcon={<BlockIcon fontSize="small" />}
                    >
                      Rejeter
                    </BulkActionButton>
                    <BulkActionButton
                      onClick={() => void runBulkAction('delete')}
                      disabled={bulkBusy}
                      color="error"
                      startIcon={<DeleteIcon fontSize="small" />}
                    >
                      Supprimer
                    </BulkActionButton>
                  </>
                }
              />

              {resultsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : results.length === 0 ? (
                <Alert severity="info">Aucun resultat.</Alert>
              ) : (
                <>
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
                        <TableCell width={100}>Preview</TableCell>
                        <TableCell>Titre</TableCell>
                        <TableCell>Source</TableCell>
                        <TableCell>Statut</TableCell>
                        <TableCell>Decouvert</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {results.map((r) => {
                        const isSelected = selectedResultIds.has(r.id);
                        return (
                          <TableRow key={r.id} hover selected={isSelected}>
                            <TableCell padding="checkbox">
                              <Checkbox
                                checked={isSelected}
                                onChange={() => toggleResultOne(r.id)}
                              />
                            </TableCell>
                            <TableCell>
                              <ResultThumbnail
                                resultId={r.id}
                                hasThumbnail={Boolean(r.thumbnailUrl)}
                              />
                            </TableCell>
                            <TableCell sx={{ maxWidth: 320 }}>
                              <Stack spacing={0.5}>
                                <Typography variant="body2" noWrap>
                                  {r.title || '—'}
                                </Typography>
                                <Tooltip title={r.sourceUrl}>
                                  <Typography variant="caption" color="text.secondary" noWrap>
                                    {r.sourceUrl}
                                  </Typography>
                                </Tooltip>
                                {r.importErrorMessage && (
                                  <Typography variant="caption" color="error" noWrap>
                                    {r.importErrorMessage}
                                  </Typography>
                                )}
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={r.crawlerSource?.name ?? '—'}
                                size="small"
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={r.status}
                                size="small"
                                color={statusColor(r.status)}
                              />
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption">
                                {new Date(r.discoveredAt).toLocaleString('fr-FR', {
                                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                                })}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Tooltip title="Ouvrir l'URL">
                                <IconButton size="small" component="a" href={r.sourceUrl} target="_blank" rel="noreferrer">
                                  <OpenInNewIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              {r.status === 'pending_review' && (
                                <>
                                  <Tooltip title="Approuver et telecharger">
                                    <IconButton size="small" color="success" onClick={() => void handleApprove(r.id)}>
                                      <CheckIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Rejeter">
                                    <IconButton size="small" color="warning" onClick={() => void handleReject(r.id)}>
                                      <BlockIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </>
                              )}
                              {(r.status === 'rejected' || r.status === 'import_failed') && (
                                <Tooltip title="Rouvrir">
                                  <IconButton size="small" color="primary" onClick={() => void handleReopen(r.id)}>
                                    <ReplayIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}
                              <Tooltip title="Supprimer">
                                <IconButton size="small" color="error" onClick={() => void handleDeleteResult(r.id)}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <TablePagination
                    component="div"
                    count={resultsTotal}
                    page={Math.floor(resultsFilter.offset / resultsFilter.limit)}
                    onPageChange={(_, p) =>
                      setResultsFilter({ ...resultsFilter, offset: p * resultsFilter.limit })
                    }
                    rowsPerPage={resultsFilter.limit}
                    onRowsPerPageChange={(e) =>
                      setResultsFilter({
                        ...resultsFilter,
                        limit: Number(e.target.value),
                        offset: 0,
                      })
                    }
                    rowsPerPageOptions={[10, 25, 50, 100]}
                    labelRowsPerPage="Lignes :"
                  />
                </>
              )}
            </Box>
          )}
        </Paper>
      </Stack>

      <CrawlerSourceDialog
        open={dialogOpen}
        source={editingSource}
        adapters={adapters}
        onClose={(refreshed) => {
          setDialogOpen(false);
          setEditingSource(null);
          if (refreshed) {
            void fetchSources();
            void refreshResultsCount();
          }
        }}
      />

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
