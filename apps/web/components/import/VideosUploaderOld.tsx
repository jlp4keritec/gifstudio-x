'use client';

import { useCallback, useRef, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  LinearProgress,
  Chip,
  IconButton,
  Alert,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { videosService } from '@/lib/videos-service';
import { ApiError } from '@/lib/api-client';

const ACCEPTED_EXTENSIONS = ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.ogv'];
const MAX_PARALLEL = 3;

type JobStatus = 'queued' | 'uploading' | 'ready' | 'failed';

interface UploadJob {
  id: string; // client-side uuid
  file: File;
  status: JobStatus;
  progress: number;
  errorMessage?: string;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

interface VideosUploaderProps {
  /** Appele a chaque fichier termine avec succes pour rafraichir la liste parente */
  onSuccess?: () => void;
}

export function VideosUploader({ onSuccess }: VideosUploaderProps) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const runningCountRef = useRef(0);
  const jobsRef = useRef<UploadJob[]>([]);
  jobsRef.current = jobs;

  const updateJob = useCallback((id: string, patch: Partial<UploadJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const runNext = useCallback(() => {
    if (runningCountRef.current >= MAX_PARALLEL) return;
    const next = jobsRef.current.find((j) => j.status === 'queued');
    if (!next) return;

    runningCountRef.current += 1;
    updateJob(next.id, { status: 'uploading', progress: 0 });

    videosService
      .upload(next.file, (percent) => {
        updateJob(next.id, { progress: percent });
      })
      .then(() => {
        updateJob(next.id, { status: 'ready', progress: 100 });
        onSuccess?.();
      })
      .catch((err) => {
        const msg =
          err instanceof ApiError ? err.message : err?.message ?? 'Erreur inconnue';
        updateJob(next.id, { status: 'failed', errorMessage: msg });
      })
      .finally(() => {
        runningCountRef.current -= 1;
        // Essayer de demarrer un autre job en attente
        setTimeout(() => runNext(), 0);
      });

    // Si on peut encore en lancer un autre en parallele
    if (runningCountRef.current < MAX_PARALLEL) {
      setTimeout(() => runNext(), 0);
    }
  }, [onSuccess, updateJob]);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      const newJobs: UploadJob[] = list
        .filter((f) => {
          const name = f.name.toLowerCase();
          return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
        })
        .map((f) => ({
          id: uid(),
          file: f,
          status: 'queued' as const,
          progress: 0,
        }));

      if (newJobs.length === 0) return;

      setJobs((prev) => [...prev, ...newJobs]);

      // Lancer le traitement
      setTimeout(() => {
        for (let i = 0; i < MAX_PARALLEL; i++) {
          runNext();
        }
      }, 0);
    },
    [runNext],
  );

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length) {
      addFiles(e.dataTransfer.files);
    }
  };

  const removeJob = (id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const clearFinished = () => {
    setJobs((prev) => prev.filter((j) => j.status === 'queued' || j.status === 'uploading'));
  };

  const hasFinished = jobs.some((j) => j.status === 'ready' || j.status === 'failed');
  const stats = {
    total: jobs.length,
    ready: jobs.filter((j) => j.status === 'ready').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
    inProgress: jobs.filter((j) => j.status === 'uploading' || j.status === 'queued').length,
  };

  return (
    <Stack spacing={3}>
      <Paper
        sx={{
          p: 4,
          border: '2px dashed',
          borderColor: dragActive ? 'primary.main' : 'divider',
          bgcolor: dragActive ? 'action.hover' : 'transparent',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color 0.2s, background-color 0.2s',
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(',')}
          hidden
          onChange={handleFilesSelected}
        />
        <Stack spacing={2} alignItems="center">
          <CloudUploadIcon sx={{ fontSize: 64, color: 'primary.main', opacity: 0.8 }} />
          <Typography variant="h6">
            Glisser-deposer vos videos ici
          </Typography>
          <Typography variant="body2" color="text.secondary">
            ou cliquer pour selectionner depuis votre ordinateur
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {ACCEPTED_EXTENSIONS.join(' / ')} — max 500 Mo / fichier, 10 min /
            video — {MAX_PARALLEL} uploads en parallele
          </Typography>
        </Stack>
      </Paper>

      {jobs.length > 0 && (
        <Paper sx={{ p: 3 }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ mb: 2 }}
          >
            <Typography variant="h6">
              File d&apos;attente ({stats.total})
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              {stats.ready > 0 && (
                <Chip size="small" color="success" label={`${stats.ready} OK`} />
              )}
              {stats.failed > 0 && (
                <Chip size="small" color="error" label={`${stats.failed} echec`} />
              )}
              {stats.inProgress > 0 && (
                <Chip size="small" color="warning" label={`${stats.inProgress} en cours`} />
              )}
              {hasFinished && (
                <Button size="small" onClick={clearFinished}>
                  Effacer termines
                </Button>
              )}
            </Stack>
          </Stack>

          <Stack spacing={1.5}>
            {jobs.map((job) => (
              <Box
                key={job.id}
                sx={{
                  p: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                }}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1.5}
                  sx={{ mb: job.status === 'uploading' ? 1 : 0 }}
                >
                  {job.status === 'ready' && (
                    <CheckCircleIcon color="success" fontSize="small" />
                  )}
                  {job.status === 'failed' && (
                    <ErrorIcon color="error" fontSize="small" />
                  )}
                  {(job.status === 'queued' || job.status === 'uploading') && (
                    <CloudUploadIcon
                      color={job.status === 'uploading' ? 'primary' : 'disabled'}
                      fontSize="small"
                    />
                  )}

                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {job.file.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatBytes(job.file.size)}
                      {job.status === 'queued' && ' — en attente'}
                      {job.status === 'uploading' && ` — ${job.progress}%`}
                      {job.status === 'ready' && ' — importe avec succes'}
                      {job.status === 'failed' && ` — echec : ${job.errorMessage ?? 'erreur'}`}
                    </Typography>
                  </Box>

                  {(job.status === 'ready' || job.status === 'failed') && (
                    <IconButton
                      size="small"
                      onClick={() => removeJob(job.id)}
                      color="default"
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  )}
                </Stack>

                {job.status === 'uploading' && (
                  <LinearProgress
                    variant="determinate"
                    value={job.progress}
                    sx={{ height: 6, borderRadius: 3 }}
                  />
                )}
              </Box>
            ))}
          </Stack>

          {stats.failed > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Certains fichiers ont echoue. Clique sur l&apos;icone de suppression pour les
              retirer de la file, puis reessaie en les re-glissant.
            </Alert>
          )}
        </Paper>
      )}
    </Stack>
  );
}
