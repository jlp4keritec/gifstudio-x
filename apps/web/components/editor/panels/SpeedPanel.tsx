'use client';

import { Stack, Typography, Button, Alert } from '@mui/material';
import { SPEED_OPTIONS } from '@gifstudio-x/shared';
import { useEditor } from '@/lib/editor-context';

export function SpeedPanel() {
  const { state, setSpeed } = useEditor();

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        Vitesse de lecture
      </Typography>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {SPEED_OPTIONS.map((speed) => (
          <Button
            key={speed}
            variant={state.speed === speed ? 'contained' : 'outlined'}
            onClick={() => setSpeed(speed)}
            size="small"
            sx={{ minWidth: 64 }}
          >
            x{speed}
          </Button>
        ))}
      </Stack>

      <Alert severity="info" variant="outlined">
        <Typography variant="caption">
          L&apos;aperçu se joue en temps réel à la vitesse sélectionnée.
        </Typography>
      </Alert>
    </Stack>
  );
}
