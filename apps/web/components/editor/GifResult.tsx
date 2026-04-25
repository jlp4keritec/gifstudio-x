'use client';

import { useEffect, useState } from 'react';
import {
  Paper,
  Box,
  Typography,
  Stack,
  Button,
  Chip,
  Alert,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DownloadIcon from '@mui/icons-material/Download';
import CollectionsIcon from '@mui/icons-material/Collections';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { SaveGifDialog } from '@/components/collections/SaveGifDialog';

interface GifResultProps {
  blob: Blob;
  width: number;
  fps: number;
  duration: number;
  onRestart: () => void;
  onContinue: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

export function GifResult({ blob, width, fps, duration, onRestart, onContinue }: GifResultProps) {
  const [url, setUrl] = useState<string>('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  function handleDownload() {
    const link = document.createElement('a');
    link.href = url;
    link.download = `gifstudio-${Date.now()}.gif`;
    link.click();
  }

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={3}>
        <Alert
          severity="success"
          icon={<CheckCircleIcon />}
          sx={{ '.MuiAlert-message': { width: '100%' } }}
        >
          GIF généré avec succès !
          {saved && ' Il a été sauvegardé dans votre bibliothèque.'}
        </Alert>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip label={`${width}p`} size="small" variant="outlined" />
          <Chip label={`${fps} fps`} size="small" variant="outlined" />
          <Chip label={`${duration.toFixed(1)}s`} size="small" variant="outlined" />
          <Chip
            label={formatSize(blob.size)}
            size="small"
            color="info"
            variant="outlined"
          />
          {saved && (
            <Chip
              label="Sauvegardé"
              size="small"
              color="success"
              icon={<CheckCircleIcon />}
            />
          )}
        </Stack>

        <Box
          sx={{
            bgcolor: 'black',
            borderRadius: 1,
            overflow: 'hidden',
            display: 'flex',
            justifyContent: 'center',
            p: 1,
          }}
        >
          {url && (
            <Box
              component="img"
              src={url}
              alt="GIF généré"
              sx={{ maxWidth: '100%', maxHeight: '50vh', display: 'block' }}
            />
          )}
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between">
          <Button variant="outlined" startIcon={<RestartAltIcon />} onClick={onRestart}>
            Refaire
          </Button>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownload}>
              Télécharger
            </Button>
            <Button
              variant="outlined"
              startIcon={<CollectionsIcon />}
              onClick={() => setSaveOpen(true)}
              disabled={saved}
            >
              {saved ? 'Sauvegardé' : 'Enregistrer'}
            </Button>
            <Button variant="contained" onClick={onContinue}>
              Continuer
            </Button>
          </Stack>
        </Stack>
      </Stack>

      <SaveGifDialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        blob={blob}
        durationMs={Math.round(duration * 1000)}
        fps={fps}
        onSaved={() => setSaved(true)}
      />
    </Paper>
  );
}
