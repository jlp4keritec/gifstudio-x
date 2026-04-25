'use client';

import { useState } from 'react';
import { Box, Popper, Paper, Fade } from '@mui/material';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import ImageNotSupportedIcon from '@mui/icons-material/ImageNotSupported';

interface ThumbnailHoverProps {
  videoId: string;
  hasThumbnail: boolean;
  thumbnailUrl: string;
  width?: number;
  height?: number;
}

/**
 * Affiche une petite icone video qui, au hover, declenche un popper
 * avec la thumbnail en taille 320px (ce que ffmpeg genere).
 * Les images sont protegees par auth (cookie via fetch credentials: include).
 */
export function ThumbnailHover({
  videoId,
  hasThumbnail,
  thumbnailUrl,
  width = 28,
  height = 28,
}: ThumbnailHoverProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [errored, setErrored] = useState(false);

  const iconColor = !hasThumbnail
    ? 'text.disabled'
    : errored
      ? 'error.main'
      : 'primary.main';

  return (
    <>
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width,
          height,
          color: iconColor,
          cursor: hasThumbnail ? 'zoom-in' : 'default',
        }}
        onMouseEnter={(e) => {
          if (hasThumbnail && !errored) setAnchorEl(e.currentTarget);
        }}
        onMouseLeave={() => setAnchorEl(null)}
      >
        {!hasThumbnail ? (
          <ImageNotSupportedIcon fontSize="small" />
        ) : (
          <VideoFileIcon fontSize="small" />
        )}
      </Box>

      <Popper
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        placement="right-start"
        transition
        sx={{ zIndex: 1300, pointerEvents: 'none' }}
      >
        {({ TransitionProps }) => (
          <Fade {...TransitionProps} timeout={120}>
            <Paper
              elevation={8}
              sx={{
                overflow: 'hidden',
                borderRadius: 1,
                maxWidth: 360,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbnailUrl}
                alt="Preview"
                crossOrigin="use-credentials"
                onError={() => setErrored(true)}
                style={{
                  display: 'block',
                  maxWidth: 360,
                  maxHeight: 240,
                  width: 'auto',
                  height: 'auto',
                }}
              />
            </Paper>
          </Fade>
        )}
      </Popper>
    </>
  );
}
