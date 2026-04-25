'use client';

import {
  Paper,
  Box,
  Typography,
  Stack,
  Button,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import type { UploadedVideo } from '@gifstudio-x/shared';
import { getStorageUrl } from '@/lib/upload-service';

interface VideoPreviewProps {
  video: UploadedVideo;
  onDelete: () => void;
  onContinue: () => void;
  deleting?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function VideoPreview({ video, onDelete, onContinue, deleting = false }: VideoPreviewProps) {
  const videoUrl = getStorageUrl(video.url);

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={3}>
        <Stack direction="row" spacing={2} alignItems="center">
          <CheckCircleIcon color="success" />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="body1" noWrap sx={{ fontWeight: 500 }}>
              {video.originalName}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
              <Chip label={formatSize(video.size)} size="small" variant="outlined" />
              <Chip label={video.mimeType} size="small" variant="outlined" />
              <Chip
                label="Prêt"
                size="small"
                color="success"
                icon={<CheckCircleIcon />}
              />
            </Stack>
          </Box>
          <Tooltip title="Supprimer et recommencer">
            <span>
              <IconButton onClick={onDelete} disabled={deleting} color="error">
                <DeleteIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>

        <Box
          sx={{
            bgcolor: 'black',
            borderRadius: 1,
            overflow: 'hidden',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <video
            src={videoUrl}
            controls
            style={{
              maxWidth: '100%',
              maxHeight: '60vh',
              display: 'block',
            }}
          />
        </Box>

        <Stack direction="row" spacing={1.5} justifyContent="flex-end">
          <Button variant="outlined" onClick={onDelete} disabled={deleting}>
            Annuler
          </Button>
          <Button
            variant="contained"
            size="large"
            startIcon={<ContentCutIcon />}
            onClick={onContinue}
            disabled={deleting}
          >
            Découper et créer le GIF
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
