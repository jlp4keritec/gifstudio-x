'use client';

import { Box, IconButton, Stack, Tooltip, Divider } from '@mui/material';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import CropIcon from '@mui/icons-material/Crop';
import TuneIcon from '@mui/icons-material/Tune';
import SpeedIcon from '@mui/icons-material/Speed';
import { useEditor, type ToolType } from '@/lib/editor-context';

interface ToolDef {
  id: ToolType;
  icon: React.ReactNode;
  label: string;
}

const TOOLS: ToolDef[] = [
  { id: 'text', icon: <TextFieldsIcon />, label: 'Texte' },
  { id: 'crop', icon: <CropIcon />, label: 'Recadrage' },
  { id: 'filter', icon: <TuneIcon />, label: 'Filtres' },
  { id: 'speed', icon: <SpeedIcon />, label: 'Vitesse' },
];

export function EditorToolbar() {
  const { activeTool, setActiveTool, addText } = useEditor();

  function handleToolClick(tool: ToolType) {
    if (tool === 'text') {
      setActiveTool('text');
      addText();
      return;
    }
    setActiveTool(activeTool === tool ? null : tool);
  }

  return (
    <Box
      sx={{
        width: 64,
        flexShrink: 0,
        bgcolor: 'background.paper',
        borderRight: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        py: 1.5,
      }}
    >
      <Stack spacing={0.5}>
        {TOOLS.map((tool) => (
          <Tooltip key={tool.id} title={tool.label} placement="right">
            <IconButton
              onClick={() => handleToolClick(tool.id)}
              color={activeTool === tool.id ? 'primary' : 'default'}
              sx={{
                borderRadius: 1,
                bgcolor: activeTool === tool.id ? 'action.selected' : 'transparent',
              }}
            >
              {tool.icon}
            </IconButton>
          </Tooltip>
        ))}
      </Stack>
      <Divider sx={{ width: '60%', my: 1 }} />
    </Box>
  );
}
