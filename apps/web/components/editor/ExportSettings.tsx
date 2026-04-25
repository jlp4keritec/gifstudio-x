'use client';

import {
  Paper,
  Stack,
  Typography,
  MenuItem,
  TextField,
  Box,
  Chip,
} from '@mui/material';
import { GIF_CONSTRAINTS, type GifResolution, type GifFps } from '@gifstudio-x/shared';

interface ExportSettingsProps {
  resolution: GifResolution;
  fps: GifFps;
  rangeDuration: number;
  onResolutionChange: (resolution: GifResolution) => void;
  onFpsChange: (fps: GifFps) => void;
}

function estimateSize(width: number, fps: number, duration: number): string {
  // Estimation grossière, très variable selon le contenu
  const bytesPerFrame = (width * (width * 9) / 16) * 0.15;
  const totalBytes = bytesPerFrame * fps * duration;
  if (totalBytes < 1024 * 1024) return `~${(totalBytes / 1024).toFixed(0)} Ko`;
  return `~${(totalBytes / 1024 / 1024).toFixed(1)} Mo`;
}

export function ExportSettings({
  resolution,
  fps,
  rangeDuration,
  onResolutionChange,
  onFpsChange,
}: ExportSettingsProps) {
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Paramètres d&apos;export
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            select
            label="Résolution (largeur)"
            size="small"
            value={resolution}
            onChange={(e) => onResolutionChange(Number(e.target.value) as GifResolution)}
            sx={{ flex: 1 }}
          >
            {GIF_CONSTRAINTS.resolutions.map((r) => (
              <MenuItem key={r} value={r}>
                {r}p
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Images par seconde (FPS)"
            size="small"
            value={fps}
            onChange={(e) => onFpsChange(Number(e.target.value) as GifFps)}
            sx={{ flex: 1 }}
          >
            {GIF_CONSTRAINTS.fpsOptions.map((f) => (
              <MenuItem key={f} value={f}>
                {f} fps
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <Box>
          <Typography variant="caption" color="text.secondary">
            Estimation du poids final
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
            <Chip
              label={`${resolution}p × ${fps}fps × ${rangeDuration.toFixed(1)}s`}
              size="small"
              variant="outlined"
            />
            <Chip
              label={estimateSize(resolution, fps, rangeDuration)}
              size="small"
              color="info"
              variant="outlined"
            />
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
}
