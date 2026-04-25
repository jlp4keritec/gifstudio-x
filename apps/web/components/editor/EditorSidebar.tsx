'use client';

import { Box, Typography, Stack } from '@mui/material';
import { useEditor } from '@/lib/editor-context';
import { TextPanel } from './panels/TextPanel';
import { FilterPanel } from './panels/FilterPanel';
import { SpeedPanel } from './panels/SpeedPanel';
import { CropPanel } from './panels/CropPanel';

interface EditorSidebarProps {
  gifUrl: string;
  gifWidth: number;
  gifHeight: number;
}

export function EditorSidebar({ gifUrl, gifWidth, gifHeight }: EditorSidebarProps) {
  const { activeTool } = useEditor();

  return (
    <Box
      sx={{
        width: 320,
        flexShrink: 0,
        bgcolor: 'background.paper',
        borderLeft: 1,
        borderColor: 'divider',
        overflowY: 'auto',
        p: 2,
      }}
    >
      {!activeTool && (
        <Stack spacing={1} alignItems="center" sx={{ pt: 6, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            👈 Sélectionnez un outil dans la barre latérale pour commencer.
          </Typography>
        </Stack>
      )}

      {activeTool === 'text' && <TextPanel />}
      {activeTool === 'filter' && <FilterPanel gifUrl={gifUrl} />}
      {activeTool === 'speed' && <SpeedPanel />}
      {activeTool === 'crop' && <CropPanel gifWidth={gifWidth} gifHeight={gifHeight} />}
    </Box>
  );
}
