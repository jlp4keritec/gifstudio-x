'use client';

import {
  Dialog,
  DialogContent,
  Stack,
  LinearProgress,
  Typography,
  Box,
  CircularProgress,
} from '@mui/material';

export type GenerationStage =
  | 'loading-ffmpeg'
  | 'converting'
  | 'done'
  | 'error';

interface GenerationProgressProps {
  open: boolean;
  stage: GenerationStage;
  loadingStage?: 'downloading-core' | 'downloading-wasm' | 'initializing' | 'ready';
  conversionProgress?: number;
  errorMessage?: string;
}

const LOADING_LABELS: Record<string, string> = {
  'downloading-core': 'Téléchargement du moteur FFmpeg...',
  'downloading-wasm': 'Téléchargement du module WebAssembly...',
  initializing: 'Initialisation...',
  ready: 'Prêt',
};

export function GenerationProgress({
  open,
  stage,
  loadingStage,
  conversionProgress,
  errorMessage,
}: GenerationProgressProps) {
  const percentage =
    stage === 'converting' && conversionProgress !== undefined
      ? Math.round(conversionProgress * 100)
      : null;

  return (
    <Dialog open={open} maxWidth="sm" fullWidth disableEscapeKeyDown>
      <DialogContent sx={{ p: 5 }}>
        <Stack spacing={3} alignItems="center" textAlign="center">
          {stage === 'loading-ffmpeg' && (
            <>
              <CircularProgress size={48} />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Préparation du moteur de conversion
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {LOADING_LABELS[loadingStage ?? 'initializing']}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                  Ce chargement n&apos;a lieu qu&apos;une fois (~30 Mo).
                </Typography>
              </Box>
              <LinearProgress sx={{ width: '100%' }} />
            </>
          )}

          {stage === 'converting' && (
            <>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Création du GIF en cours...
              </Typography>
              <Box sx={{ width: '100%' }}>
                <LinearProgress
                  variant={percentage !== null ? 'determinate' : 'indeterminate'}
                  value={percentage ?? 0}
                  sx={{ height: 10, borderRadius: 5 }}
                />
                {percentage !== null && (
                  <Typography variant="body2" sx={{ mt: 1, fontWeight: 600 }}>
                    {percentage}%
                  </Typography>
                )}
              </Box>
              <Typography variant="caption" color="text.secondary">
                La conversion se fait dans votre navigateur, aucune donnée n&apos;est envoyée sur
                Internet.
              </Typography>
            </>
          )}

          {stage === 'error' && (
            <>
              <Typography variant="h6" color="error" sx={{ fontWeight: 600 }}>
                Erreur de conversion
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {errorMessage ?? 'Une erreur inattendue est survenue.'}
              </Typography>
            </>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
