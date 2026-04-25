'use client';

import {
  Box,
  Typography,
  Button,
  IconButton,
  Tooltip,
  Divider,
  Stack,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useEditor } from '@/lib/editor-context';

interface EditorTopbarProps {
  title: string;
  onBack: () => void;
  onExport: () => void;
  exportLoading?: boolean;
}

export function EditorTopbar({ title, onBack, onExport, exportLoading }: EditorTopbarProps) {
  const { reset } = useEditor();

  return (
    <Box
      sx={{
        px: 2,
        py: 1,
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Tooltip title="Retour">
        <IconButton onClick={onBack} size="small">
          <ArrowBackIcon />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem />

      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Éditeur de GIF
        </Typography>
      </Box>

      <Stack direction="row" spacing={1}>
        <Tooltip title="Réinitialiser toutes les modifications">
          <IconButton onClick={reset} size="small">
            <RestartAltIcon />
          </IconButton>
        </Tooltip>
        <Button
          variant="contained"
          startIcon={<DownloadIcon />}
          onClick={onExport}
          disabled={exportLoading}
          size="small"
        >
          Exporter le GIF
        </Button>
      </Stack>
    </Box>
  );
}
