'use client';

import {
  Paper,
  Box,
  Typography,
  LinearProgress,
  Stack,
  IconButton,
  Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

interface UploadProgressCardProps {
  filename: string;
  fileSize: number;
  percentage: number;
  onCancel: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function UploadProgressCard({
  filename,
  fileSize,
  percentage,
  onCancel,
}: UploadProgressCardProps) {
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <InsertDriveFileIcon color="primary" />
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="body1" noWrap sx={{ fontWeight: 500 }}>
            {filename}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatSize(fileSize)} — Upload en cours...
          </Typography>
        </Box>
        <Tooltip title="Annuler">
          <IconButton onClick={onCancel} size="small">
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <LinearProgress variant="determinate" value={percentage} sx={{ height: 8, borderRadius: 4 }} />
        </Box>
        <Typography variant="body2" sx={{ minWidth: 40, fontWeight: 600 }}>
          {percentage}%
        </Typography>
      </Box>
    </Paper>
  );
}
