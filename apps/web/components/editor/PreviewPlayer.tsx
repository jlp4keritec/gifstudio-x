'use client';

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Box, IconButton, Stack } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import ReplayIcon from '@mui/icons-material/Replay';

export interface PreviewPlayerHandle {
  play: () => Promise<void>;
  pause: () => void;
  seekTo: (time: number) => void;
  getVideoElement: () => HTMLVideoElement | null;
}

interface PreviewPlayerProps {
  src: string;
  range: [number, number];
  onTimeUpdate: (time: number) => void;
  onDurationLoaded: (duration: number) => void;
  onPlayStateChange: (playing: boolean) => void;
  playing: boolean;
}

export const PreviewPlayer = forwardRef<PreviewPlayerHandle, PreviewPlayerProps>(
  function PreviewPlayer(
    { src, range, onTimeUpdate, onDurationLoaded, onPlayStateChange, playing },
    ref,
  ) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useImperativeHandle(ref, () => ({
      play: async () => {
        if (videoRef.current) await videoRef.current.play();
      },
      pause: () => videoRef.current?.pause(),
      seekTo: (time: number) => {
        if (videoRef.current) videoRef.current.currentTime = time;
      },
      getVideoElement: () => videoRef.current,
    }));

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      function handleTimeUpdate() {
        if (!video) return;
        onTimeUpdate(video.currentTime);

        // Boucler dans la plage sélectionnée
        if (video.currentTime >= range[1]) {
          video.currentTime = range[0];
          if (!playing) video.pause();
        }
      }

      function handleLoadedMetadata() {
        if (!video) return;
        onDurationLoaded(video.duration);
      }

      function handlePlay() {
        onPlayStateChange(true);
      }

      function handlePause() {
        onPlayStateChange(false);
      }

      video.addEventListener('timeupdate', handleTimeUpdate);
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);

      return () => {
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
      };
    }, [range, playing, onTimeUpdate, onDurationLoaded, onPlayStateChange]);

    async function togglePlay() {
      const video = videoRef.current;
      if (!video) return;
      if (playing) {
        video.pause();
      } else {
        // Si on est hors plage, revenir au début
        if (video.currentTime < range[0] || video.currentTime >= range[1]) {
          video.currentTime = range[0];
        }
        await video.play();
      }
    }

    function rewindToStart() {
      if (videoRef.current) videoRef.current.currentTime = range[0];
    }

    return (
      <Stack spacing={1} alignItems="center">
        <Box
          sx={{
            width: '100%',
            bgcolor: 'black',
            borderRadius: 1,
            overflow: 'hidden',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <video
            ref={videoRef}
            src={src}
            style={{
              maxWidth: '100%',
              maxHeight: '50vh',
              display: 'block',
            }}
            playsInline
            muted
          />
        </Box>
        <Stack direction="row" spacing={1}>
          <IconButton onClick={togglePlay} color="primary">
            {playing ? <PauseIcon /> : <PlayArrowIcon />}
          </IconButton>
          <IconButton onClick={rewindToStart}>
            <ReplayIcon />
          </IconButton>
        </Stack>
      </Stack>
    );
  },
);
