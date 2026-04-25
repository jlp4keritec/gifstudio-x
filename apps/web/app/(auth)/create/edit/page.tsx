'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Typography,
  Stack,
  Box,
  Paper,
  Button,
  Stepper,
  Step,
  StepLabel,
  Alert,
  IconButton,
  Tooltip,
  Snackbar,
  Chip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import type { GifResolution, GifFps } from '@gifstudio-x/shared';
import { GIF_CONSTRAINTS } from '@gifstudio-x/shared';
import { useDraft } from '@/lib/draft-context';
import { getStorageUrl } from '@/lib/upload-service';
import {
  getFFmpeg,
  convertVideoToGif,
  type FFmpegLoadProgress,
} from '@/lib/ffmpeg-service';
import { useKeyboardShortcuts } from '@/lib/use-keyboard-shortcuts';
import { PreviewPlayer, type PreviewPlayerHandle } from '@/components/editor/PreviewPlayer';
import { Timeline } from '@/components/editor/Timeline';
import { ExportSettings } from '@/components/editor/ExportSettings';
import {
  GenerationProgress,
  type GenerationStage,
} from '@/components/editor/GenerationProgress';
import { GifResult } from '@/components/editor/GifResult';

const STEPS = ['Uploader une vidéo', 'Découper', 'Éditer & Exporter'];

const SEEK_STEP = 0.1; // secondes

export default function EditPage() {
  const router = useRouter();
  const { draft, setTrim, setGifResult, clearGifResult } = useDraft();
  const playerRef = useRef<PreviewPlayerHandle>(null);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [range, setRange] = useState<[number, number]>([0, 5]);
  const [playing, setPlaying] = useState(false);
  const [resolution, setResolution] = useState<GifResolution>(480);
  const [fps, setFps] = useState<GifFps>(15);

  const [genStage, setGenStage] = useState<GenerationStage | null>(null);
  const [loadingStage, setLoadingStage] =
    useState<FFmpegLoadProgress['stage']>('downloading-core');
  const [conversionProgress, setConversionProgress] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);

  const [toast, setToast] = useState<{ msg: string; severity: 'success' | 'info' | 'warning' } | null>(
    null,
  );

  // refs pour accès dans les handlers clavier (sinon closures stale)
  const currentTimeRef = useRef(currentTime);
  const rangeRef = useRef(range);
  const durationRef = useRef(duration);
  const playingRef = useRef(playing);

  currentTimeRef.current = currentTime;
  rangeRef.current = range;
  durationRef.current = duration;
  playingRef.current = playing;

  useEffect(() => {
    if (!draft?.sourceVideo) {
      router.replace('/create');
    }
  }, [draft, router]);

  useEffect(() => {
    if (duration > 0 && range[1] === 5 && range[0] === 0) {
      const end = Math.min(duration, GIF_CONSTRAINTS.maxDurationSeconds);
      setRange([0, end]);
    }
  }, [duration, range]);

  // ========================================================================
  // Handlers avec refs pour éviter les re-créations
  // ========================================================================

  const handleRangeChange = useCallback(
    (newRange: [number, number]) => {
      setRange(newRange);
      setTrim({ start: newRange[0], end: newRange[1] });
      const current = currentTimeRef.current;
      if (current < newRange[0] || current > newRange[1]) {
        playerRef.current?.seekTo(newRange[0]);
      }
    },
    [setTrim],
  );

  const handleSeek = useCallback((time: number) => {
    playerRef.current?.seekTo(time);
  }, []);

  const handleBack = useCallback(() => {
    router.push('/create');
  }, [router]);

  // ========================================================================
  // Raccourcis clavier
  // ========================================================================

  const togglePlay = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    if (playingRef.current) {
      player.pause();
    } else {
      const [start, end] = rangeRef.current;
      if (currentTimeRef.current < start || currentTimeRef.current >= end) {
        player.seekTo(start);
      }
      await player.play();
    }
  }, []);

  const setInPoint = useCallback(() => {
    const now = currentTimeRef.current;
    const [, currentEnd] = rangeRef.current;
    const minDur = GIF_CONSTRAINTS.minDurationSeconds;
    const maxDur = GIF_CONSTRAINTS.maxDurationSeconds;
    const videoDuration = durationRef.current;

    if (videoDuration <= 0) return;

    let newStart = Math.max(0, Math.min(now, videoDuration));
    let newEnd = currentEnd;

    if (newEnd - newStart < minDur) {
      newEnd = Math.min(videoDuration, newStart + minDur);
    }
    if (newEnd - newStart > maxDur) {
      newEnd = newStart + maxDur;
    }
    if (newEnd > videoDuration) {
      newEnd = videoDuration;
      newStart = Math.max(0, newEnd - minDur);
    }
    if (newEnd - newStart < minDur) {
      setToast({ msg: 'Pas assez de durée restante pour poser un début ici', severity: 'warning' });
      return;
    }

    handleRangeChange([newStart, newEnd]);
    setToast({ msg: `Début posé à ${newStart.toFixed(1)}s`, severity: 'success' });
  }, [handleRangeChange]);

  const setOutPoint = useCallback(() => {
    const now = currentTimeRef.current;
    const [currentStart] = rangeRef.current;
    const minDur = GIF_CONSTRAINTS.minDurationSeconds;
    const maxDur = GIF_CONSTRAINTS.maxDurationSeconds;
    const videoDuration = durationRef.current;

    if (videoDuration <= 0) return;

    let newEnd = Math.max(0, Math.min(now, videoDuration));
    let newStart = currentStart;

    if (newEnd - newStart < minDur) {
      newStart = Math.max(0, newEnd - minDur);
    }
    if (newEnd - newStart > maxDur) {
      newStart = newEnd - maxDur;
    }
    if (newStart < 0) {
      newStart = 0;
      newEnd = Math.min(videoDuration, minDur);
    }
    if (newEnd - newStart < minDur) {
      setToast({ msg: 'Pas assez de durée en amont pour poser une fin ici', severity: 'warning' });
      return;
    }

    handleRangeChange([newStart, newEnd]);
    setToast({ msg: `Fin posée à ${newEnd.toFixed(1)}s`, severity: 'success' });
  }, [handleRangeChange]);

  const seekBackward = useCallback(() => {
    const videoDuration = durationRef.current;
    if (videoDuration <= 0) return;
    const newTime = Math.max(0, currentTimeRef.current - SEEK_STEP);
    playerRef.current?.seekTo(newTime);
  }, []);

  const seekForward = useCallback(() => {
    const videoDuration = durationRef.current;
    if (videoDuration <= 0) return;
    const newTime = Math.min(videoDuration, currentTimeRef.current + SEEK_STEP);
    playerRef.current?.seekTo(newTime);
  }, []);

  useKeyboardShortcuts(
    [
      { key: ' ', handler: togglePlay },
      { key: 'i', handler: setInPoint },
      { key: 'o', handler: setOutPoint },
      { key: 'ArrowLeft', handler: seekBackward },
      { key: 'ArrowRight', handler: seekForward },
    ],
    genStage === null,
  );

  // ========================================================================
  // Génération GIF
  // ========================================================================

  async function handleGenerate() {
    setGenError(null);
    setConversionProgress(0);
    setGenStage('loading-ffmpeg');

    try {
      await getFFmpeg((progress) => setLoadingStage(progress.stage));

      setGenStage('converting');

      const videoUrl = getStorageUrl(draft!.sourceVideo.url);
      const blob = await convertVideoToGif({
        videoUrl,
        startSeconds: range[0],
        endSeconds: range[1],
        width: resolution,
        fps,
        onProgress: (ratio) => setConversionProgress(ratio),
      });

      setGifResult(blob, { width: resolution, fps });
      setGenStage('done');
    } catch (err) {
      console.error(err);
      setGenError(err instanceof Error ? err.message : 'Erreur de conversion');
      setGenStage('error');
    }
  }

  /**
   * "Refaire" : reset du resultat GIF + reset du trim + retour au step
   * de decoupage avec la MEME video source.
   */
  function handleRestartDraft() {
    clearGifResult();
    setGenStage(null);
    setGenError(null);
    setConversionProgress(0);
    // Reset l'etat local de range : se recalcule via le useEffect [duration, range]
    // au prochain rendu de la PreviewPlayer
    setRange([0, 5]);
    setCurrentTime(0);
    setPlaying(false);
  }

  function handleContinueToEditor() {
    router.push('/create/editor');
  }

  if (!draft?.sourceVideo) return null;

  const videoUrl = getStorageUrl(draft.sourceVideo.url);
  const rangeDuration = range[1] - range[0];
  const rangeValid =
    rangeDuration >= GIF_CONSTRAINTS.minDurationSeconds &&
    rangeDuration <= GIF_CONSTRAINTS.maxDurationSeconds;

  // ========================================================================
  // Vue GIF généré
  // ========================================================================

  if (draft.gifBlob && draft.gifBlob.size > 0 && genStage === 'done') {
    return (
      <Container maxWidth="md" sx={{ py: 6 }}>
        <Stack spacing={4}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              GIF généré ! Passez à l&apos;éditeur
            </Typography>
          </Box>

          <Stepper activeStep={1} alternativeLabel>
            {STEPS.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          <GifResult
            blob={draft.gifBlob}
            width={draft.gifSettings?.width ?? resolution}
            fps={draft.gifSettings?.fps ?? fps}
            duration={rangeDuration}
            onRestart={handleRestartDraft}
            onContinue={handleContinueToEditor}
          />
        </Stack>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Stack spacing={4}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Tooltip title="Retour à l'upload">
            <IconButton onClick={handleBack}>
              <ArrowBackIcon />
            </IconButton>
          </Tooltip>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              Découper la vidéo
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {draft.sourceVideo.originalName}
            </Typography>
          </Box>
          <ShortcutsHelp />
        </Stack>

        <Stepper activeStep={1} alternativeLabel>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={3}>
            <PreviewPlayer
              ref={playerRef}
              src={videoUrl}
              range={range}
              playing={playing}
              onTimeUpdate={setCurrentTime}
              onDurationLoaded={setDuration}
              onPlayStateChange={setPlaying}
            />

            {duration > 0 && (
              <Timeline
                duration={duration}
                range={range}
                currentTime={currentTime}
                onRangeChange={handleRangeChange}
                onSeek={handleSeek}
              />
            )}
          </Stack>
        </Paper>

        <ExportSettings
          resolution={resolution}
          fps={fps}
          rangeDuration={rangeDuration}
          onResolutionChange={setResolution}
          onFpsChange={setFps}
        />

        {!rangeValid && (
          <Alert severity="warning">
            La durée doit être entre {GIF_CONSTRAINTS.minDurationSeconds}s et{' '}
            {GIF_CONSTRAINTS.maxDurationSeconds}s.
          </Alert>
        )}

        <Stack direction="row" spacing={1.5} justifyContent="flex-end">
          <Button variant="outlined" onClick={handleBack}>
            Annuler
          </Button>
          <Button
            variant="contained"
            size="large"
            startIcon={<ContentCutIcon />}
            onClick={handleGenerate}
            disabled={!rangeValid}
          >
            Générer le GIF
          </Button>
        </Stack>
      </Stack>

      <GenerationProgress
        open={genStage === 'loading-ffmpeg' || genStage === 'converting' || genStage === 'error'}
        stage={genStage ?? 'loading-ffmpeg'}
        loadingStage={loadingStage}
        conversionProgress={conversionProgress}
        errorMessage={genError ?? undefined}
      />

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={2000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert
            onClose={() => setToast(null)}
            severity={toast.severity}
            variant="filled"
            sx={{ minWidth: 240 }}
          >
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Container>
  );
}

// ============================================================================
// Tooltip d'aide avec la liste des raccourcis
// ============================================================================

function ShortcutsHelp() {
  return (
    <Tooltip
      title={
        <Box sx={{ p: 0.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>
            Raccourcis clavier
          </Typography>
          <Stack spacing={0.5}>
            <ShortcutRow keys={['Espace']} label="Lecture / Pause" />
            <ShortcutRow keys={['I']} label="Poser le début" />
            <ShortcutRow keys={['O']} label="Poser la fin" />
            <ShortcutRow keys={['←']} label="Reculer de 0.1s" />
            <ShortcutRow keys={['→']} label="Avancer de 0.1s" />
          </Stack>
        </Box>
      }
      placement="bottom-end"
      arrow
    >
      <IconButton size="small">
        <KeyboardIcon />
      </IconButton>
    </Tooltip>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Stack direction="row" spacing={0.5}>
        {keys.map((k) => (
          <Chip
            key={k}
            label={k}
            size="small"
            sx={{
              height: 20,
              fontSize: 11,
              fontWeight: 600,
              bgcolor: 'rgba(255,255,255,0.15)',
              color: 'inherit',
              '& .MuiChip-label': { px: 0.75 },
            }}
          />
        ))}
      </Stack>
      <Typography variant="caption">{label}</Typography>
    </Stack>
  );
}
