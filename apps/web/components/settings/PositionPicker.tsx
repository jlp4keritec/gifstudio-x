'use client';

import { Box, Tooltip } from '@mui/material';
import type { WatermarkPosition } from '@gifstudio-x/shared';
import { WATERMARK_POSITIONS } from '@gifstudio-x/shared';

const LABELS: Record<WatermarkPosition, string> = {
  'top-left': 'Haut-gauche',
  'top-center': 'Haut-centre',
  'top-right': 'Haut-droite',
  'middle-left': 'Milieu-gauche',
  'middle-center': 'Centre',
  'middle-right': 'Milieu-droite',
  'bottom-left': 'Bas-gauche',
  'bottom-center': 'Bas-centre',
  'bottom-right': 'Bas-droite',
};

interface PositionPickerProps {
  value: WatermarkPosition;
  onChange: (pos: WatermarkPosition) => void;
}

export function PositionPicker({ value, onChange }: PositionPickerProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 48px)',
        gridTemplateRows: 'repeat(3, 32px)',
        gap: 0.5,
        p: 1,
        bgcolor: 'action.hover',
        borderRadius: 1,
        width: 'fit-content',
      }}
    >
      {WATERMARK_POSITIONS.map((pos) => {
        const active = pos === value;
        return (
          <Tooltip key={pos} title={LABELS[pos]} placement="top">
            <Box
              onClick={() => onChange(pos)}
              sx={{
                cursor: 'pointer',
                bgcolor: active ? 'primary.main' : 'background.paper',
                border: '1px solid',
                borderColor: active ? 'primary.main' : 'divider',
                borderRadius: 0.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: active ? 'primary.contrastText' : 'text.secondary',
                fontSize: 14,
                fontWeight: 700,
                transition: 'all 0.12s',
                '&:hover': {
                  borderColor: 'primary.main',
                  color: active ? 'primary.contrastText' : 'primary.main',
                },
              }}
            >
              {active ? '●' : ''}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
