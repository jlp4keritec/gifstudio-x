'use client';

import { Box, Slider, Stack, Typography, Chip } from '@mui/material';
import { GIF_CONSTRAINTS } from '@gifstudio-x/shared';

interface TimelineProps {
  duration: number;
  range: [number, number];
  currentTime: number;
  onRangeChange: (range: [number, number]) => void;
  onSeek: (time: number) => void;
}

function formatTime(seconds: number): string {
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60);
  const ms = Math.floor((seconds * 10) % 10);
  return `${mm}:${ss.toString().padStart(2, '0')}.${ms}`;
}

export function Timeline({ duration, range, currentTime, onRangeChange, onSeek }: TimelineProps) {
  const [start, end] = range;
  const rangeDuration = end - start;
  const valid =
    rangeDuration >= GIF_CONSTRAINTS.minDurationSeconds &&
    rangeDuration <= GIF_CONSTRAINTS.maxDurationSeconds;

  function handleRangeChange(_: Event, value: number | number[]) {
    if (!Array.isArray(value)) return;
    const [newStart, newEnd] = value as [number, number];

    // Contraindre la durée entre min et max
    const newDuration = newEnd - newStart;
    if (newDuration < GIF_CONSTRAINTS.minDurationSeconds) {
      // Étendre à la durée min
      const target = GIF_CONSTRAINTS.minDurationSeconds;
      if (newStart !== start) {
        onRangeChange([Math.max(0, newEnd - target), newEnd]);
      } else {
        onRangeChange([newStart, Math.min(duration, newStart + target)]);
      }
      return;
    }
    if (newDuration > GIF_CONSTRAINTS.maxDurationSeconds) {
      const target = GIF_CONSTRAINTS.maxDurationSeconds;
      if (newStart !== start) {
        onRangeChange([newEnd - target, newEnd]);
      } else {
        onRangeChange([newStart, newStart + target]);
      }
      return;
    }

    onRangeChange([newStart, newEnd]);
  }

  function handleSeekChange(_: Event, value: number | number[]) {
    if (typeof value !== 'number') return;
    onSeek(value);
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <Chip
          label={`Début : ${formatTime(start)}`}
          size="small"
          color="primary"
          variant="outlined"
        />
        <Chip
          label={`Fin : ${formatTime(end)}`}
          size="small"
          color="primary"
          variant="outlined"
        />
        <Chip
          label={`Durée : ${rangeDuration.toFixed(1)}s`}
          size="small"
          color={valid ? 'success' : 'error'}
        />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          Plage autorisée : {GIF_CONSTRAINTS.minDurationSeconds}s à{' '}
          {GIF_CONSTRAINTS.maxDurationSeconds}s
        </Typography>
      </Stack>

      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          Sélection de la plage (glissez les poignées)
        </Typography>
        <Slider
          value={range}
          onChange={handleRangeChange}
          min={0}
          max={duration}
          step={0.1}
          disableSwap
          sx={{
            '& .MuiSlider-thumb': { width: 14, height: 24, borderRadius: 1 },
            '& .MuiSlider-track': { height: 8 },
            '& .MuiSlider-rail': { height: 8, opacity: 0.3 },
          }}
        />
      </Box>

      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          Curseur de lecture : {formatTime(currentTime)} / {formatTime(duration)}
        </Typography>
        <Slider
          value={currentTime}
          onChange={handleSeekChange}
          min={0}
          max={duration}
          step={0.05}
          size="small"
          color="secondary"
        />
      </Box>
    </Stack>
  );
}
