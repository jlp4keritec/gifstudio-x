'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Paper,
  Button,
  Stack,
  Alert,
  Chip,
  TextField,
  CircularProgress,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LinkIcon from '@mui/icons-material/Link';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import type { VideoAsset } from '@gifstudio-x/shared';
import { videosService } from '@/lib/videos-service';
import { ApiError } from '@/lib/api-client';
import { VideosUploader } from '@/components/import/VideosUploader';

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

function statusChipColor(
  status: string,
): 'default' | 'primary' | 'success' | 'warning' | 'error' {
  switch (status) {
    case 'ready':
      return 'success';
    case 'downloading':
      return 'warning';
    case 'pending':
      return 'default';
    case 'failed':
      return 'error';
    default:
      return 'default';
  }
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'url_import':
      return 'URL';
    case 'file_upload':
      return 'Upload';
    case 'crawler':
      return 'Crawler';
    default:
      return source;
  }
}

type TabKey = 'url' | 'upload';

export default function ImportPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('url');

  // URL tab state
  const [url, setUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  // Table state
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVideos = useCallback(async () => {
    try {
      const items = await videosService.list();
      setVideos(items);
    } catch (err) {
      console.error('[import] fetch videos failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchVideos();
  }, [fetchVideos]);

  const handleImportUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setImporting(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      const video = await videosService.importUrl(url);
      setImportSuccess(`Video importee : ${video.id}`);
      setUrl('');
      await fetchVideos();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Erreur inconnue';
      setImportError(msg);
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette video ?')) return;
    try {
      await videosService.remove(id);
      await fetchVideos();
    } catch (err) {
      console.error('[import] delete failed', err);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Box
          sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Stack direction="row" alignItems="center" spacing={2}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => router.push('/dashboard')}
              variant="outlined"
            >
              Dashboard
            </Button>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              Import de videos
            </Typography>
          </Stack>
          <Tooltip title="Rafraichir la liste">
            <IconButton onClick={() => void fetchVideos()}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>

        <Paper>
          <Tabs
            value={tab}
            onChange={(_e, v) => setTab(v as TabKey)}
            sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
          >
            <Tab
              value="url"
              label="URL"
              icon={<LinkIcon fontSize="small" />}
              iconPosition="start"
            />
            <Tab
              value="upload"
              label="Upload"
              icon={<CloudUploadIcon fontSize="small" />}
              iconPosition="start"
            />
          </Tabs>

          <Box sx={{ p: 3 }}>
            {tab === 'url' && (
              <form onSubmit={handleImportUrl}>
                <Stack spacing={2}>
                  <Typography variant="h6">Nouvelle importation par URL</Typography>
                  <TextField
                    label="URL de la video"
                    placeholder="https://example.com/video.mp4"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                    fullWidth
                    autoFocus
                    disabled={importing}
                    helperText="URL directe .mp4 / .webm / .mov / .mkv / .avi — max 500 Mo, 10 min"
                  />
                  {importError && <Alert severity="error">{importError}</Alert>}
                  {importSuccess && <Alert severity="success">{importSuccess}</Alert>}
                  <Box>
                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      disabled={importing || !url}
                      startIcon={importing ? <CircularProgress size={20} /> : undefined}
                    >
                      {importing ? 'Telechargement…' : 'Importer'}
                    </Button>
                  </Box>
                </Stack>
              </form>
            )}

            {tab === 'upload' && (
              <Stack spacing={2}>
                <Typography variant="h6">Upload depuis mon ordinateur</Typography>
                <VideosUploader onSuccess={() => void fetchVideos()} />
              </Stack>
            )}
          </Box>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Videos importees
          </Typography>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : videos.length === 0 ? (
            <Alert severity="info">Aucune video importee pour l&apos;instant.</Alert>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Statut</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>Origine</TableCell>
                  <TableCell>Duree</TableCell>
                  <TableCell>Dim.</TableCell>
                  <TableCell>Taille</TableCell>
                  <TableCell>Codec</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {videos.map((v) => (
                  <TableRow key={v.id} hover>
                    <TableCell>
                      <Chip
                        label={v.status}
                        color={statusChipColor(v.status)}
                        size="small"
                      />
                      {v.errorMessage && (
                        <Tooltip title={v.errorMessage}>
                          <Typography
                            variant="caption"
                            color="error"
                            sx={{ ml: 1, cursor: 'help' }}
                          >
                            ⓘ
                          </Typography>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip label={sourceLabel(v.source)} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 250 }}>
                      <Tooltip title={v.sourceUrl || v.originalFilename || ''}>
                        <Typography
                          variant="body2"
                          sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
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
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={() => void handleDelete(v.id)}
                        color="error"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>
      </Stack>
    </Container>
  );
}
