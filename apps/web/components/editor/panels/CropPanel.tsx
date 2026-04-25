'use client';

import {
  Stack,
  Typography,
  Button,
  Box,
  Slider,
  Alert,
} from '@mui/material';
import type { CropRatio, EditorCrop } from '@gifstudio-x/shared';
import { CROP_PRESETS } from '@gifstudio-x/shared';
import { useEditor } from '@/lib/editor-context';

function cropFromRatio(ratio: CropRatio, gifRatio: number): EditorCrop {
  if (ratio === 'free') {
    return { ratio, x: 10, y: 10, width: 80, height: 80 };
  }

  const preset = CROP_PRESETS.find((p) => p.id === ratio);
  const target = preset?.ratio ?? 1;

  // On centre un rectangle au ratio demandé dans le canvas
  if (target >= gifRatio) {
    // Cadre plus large → full width, hauteur réduite
    const h = (gifRatio / target) * 100;
    return { ratio, x: 0, y: (100 - h) / 2, width: 100, height: h };
  } else {
    const w = (target / gifRatio) * 100;
    return { ratio, x: (100 - w) / 2, y: 0, width: w, height: 100 };
  }
}

interface CropPanelProps {
  gifWidth: number;
  gifHeight: number;
}

export function CropPanel({ gifWidth, gifHeight }: CropPanelProps) {
  const { state, setCrop } = useEditor();
  const gifRatio = gifWidth / gifHeight;

  function applyPreset(ratio: CropRatio) {
    setCrop(cropFromRatio(ratio, gifRatio));
  }

  function clearCrop() {
    setCrop(null);
  }

  function updateCrop(patch: Partial<EditorCrop>) {
    if (!state.crop) return;
    setCrop({ ...state.crop, ...patch });
  }

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        Recadrage
      </Typography>

      <Stack spacing={1}>
        {CROP_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            variant={state.crop?.ratio === preset.id ? 'contained' : 'outlined'}
            onClick={() => applyPreset(preset.id as CropRatio)}
            size="small"
            fullWidth
          >
            {preset.label}
          </Button>
        ))}
      </Stack>

      {state.crop && (
        <>
          <Typography variant="overline" color="text.secondary">
            Ajustement fin
          </Typography>

          <Box>
            <Typography variant="caption">Position X : {state.crop.x.toFixed(0)}%</Typography>
            <Slider
              size="small"
              value={state.crop.x}
              min={0}
              max={100 - state.crop.width}
              onChange={(_, v) => updateCrop({ x: v as number })}
            />
          </Box>
          <Box>
            <Typography variant="caption">Position Y : {state.crop.y.toFixed(0)}%</Typography>
            <Slider
              size="small"
              value={state.crop.y}
              min={0}
              max={100 - state.crop.height}
              onChange={(_, v) => updateCrop({ y: v as number })}
            />
          </Box>
          <Box>
            <Typography variant="caption">Largeur : {state.crop.width.toFixed(0)}%</Typography>
            <Slider
              size="small"
              value={state.crop.width}
              min={10}
              max={100 - state.crop.x}
              onChange={(_, v) => updateCrop({ width: v as number })}
            />
          </Box>
          <Box>
            <Typography variant="caption">Hauteur : {state.crop.height.toFixed(0)}%</Typography>
            <Slider
              size="small"
              value={state.crop.height}
              min={10}
              max={100 - state.crop.y}
              onChange={(_, v) => updateCrop({ height: v as number })}
            />
          </Box>

          <Button size="small" onClick={clearCrop} color="error">
            Supprimer le recadrage
          </Button>
        </>
      )}

      {!state.crop && (
        <Alert severity="info" variant="outlined">
          <Typography variant="caption">
            Choisissez un ratio pour commencer à recadrer votre GIF.
          </Typography>
        </Alert>
      )}
    </Stack>
  );
}
