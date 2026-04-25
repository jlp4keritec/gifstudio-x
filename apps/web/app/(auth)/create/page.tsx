'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Typography,
  Stack,
  Box,
  Alert,
  Stepper,
  Step,
  StepLabel,
} from '@mui/material';
import type { UploadedVideo } from '@gifstudio-x/shared';
import { UPLOAD_CONSTRAINTS } from '@gifstudio-x/shared';
import { UploadDropzone } from '@/components/upload/UploadDropzone';
import { UploadProgressCard } from '@/components/upload/UploadProgressCard';
import { VideoPreview } from '@/components/upload/VideoPreview';
import { uploadVideo, deleteUploadedVideo } from '@/lib/upload-service';
import { useDraft } from '@/lib/draft-context';

type Stage = 'idle' | 'uploading' | 'ready' | 'error';

const STEPS = ['Uploader une vidéo', 'Découper', 'Éditer & Exporter'];

function validateFileClient(file: File): string | null {
  const maxBytes = UPLOAD_CONSTRAINTS.maxSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    return `Le fichier dépasse ${UPLOAD_CONSTRAINTS.maxSizeMb} Mo (taille : ${(file.size / 1024 / 1024).toFixed(1)} Mo)`;
  }

  const acceptedMimes = UPLOAD_CONSTRAINTS.acceptedMimes as readonly string[];
  if (file.type && !acceptedMimes.includes(file.type)) {
    const ext = file.name.toLowerCase().match(/\.(mp4|mov|webm)$/);
    if (!ext) {
      return `Type de fichier non supporté : ${file.type || 'inconnu'}. Acceptés : MP4, MOV, WebM.`;
    }
  }

  return null;
}

export default function CreatePage() {
  const router = useRouter();
  const { setSourceVideo, clear } = useDraft();
  const [stage, setStage] = useState<Stage>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [video, setVideo] = useState<UploadedVideo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleFileSelected = useCallback(async (selected: File) => {
    setError(null);

    const clientError = validateFileClient(selected);
    if (clientError) {
      setError(clientError);
      setStage('error');
      return;
    }

    setFile(selected);
    setProgress(0);
    setStage('uploading');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const uploaded = await uploadVideo(selected, {
        signal: controller.signal,
        onProgress: (p) => setProgress(p.percentage),
      });
      setVideo(uploaded);
      setStage('ready');
    } catch (err) {
      if (err instanceof Error && err.message === 'Upload annulé') {
        setStage('idle');
        setFile(null);
      } else {
        setError(err instanceof Error ? err.message : 'Erreur lors de l\'upload');
        setStage('error');
      }
    } finally {
      abortRef.current = null;
    }
  }, []);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleDelete = useCallback(async () => {
    if (!video) return;
    setDeleting(true);
    try {
      await deleteUploadedVideo(video.filename);
    } catch (err) {
      console.warn('Erreur suppression:', err);
    } finally {
      setVideo(null);
      setFile(null);
      setStage('idle');
      clear();
      setDeleting(false);
    }
  }, [video, clear]);

  const handleContinue = useCallback(() => {
    if (!video) return;
    setSourceVideo(video);
    router.push('/create/edit');
  }, [video, setSourceVideo, router]);

  const handleReset = useCallback(() => {
    setError(null);
    setFile(null);
    setStage('idle');
  }, []);

  const activeStep = stage === 'ready' ? 1 : 0;

  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Stack spacing={4}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Créer un GIF
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Uploadez une vidéo pour commencer
          </Typography>
        </Box>

        <Stepper activeStep={activeStep} alternativeLabel>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && (
          <Alert severity="error" onClose={handleReset}>
            {error}
          </Alert>
        )}

        {stage === 'idle' && <UploadDropzone onFileSelected={handleFileSelected} />}

        {stage === 'error' && <UploadDropzone onFileSelected={handleFileSelected} />}

        {stage === 'uploading' && file && (
          <UploadProgressCard
            filename={file.name}
            fileSize={file.size}
            percentage={progress}
            onCancel={handleCancel}
          />
        )}

        {stage === 'ready' && video && (
          <VideoPreview
            video={video}
            onDelete={handleDelete}
            onContinue={handleContinue}
            deleting={deleting}
          />
        )}
      </Stack>
    </Container>
  );
}
