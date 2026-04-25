'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, CircularProgress } from '@mui/material';
import { useDraft } from '@/lib/draft-context';
import { EditorProvider, useEditor } from '@/lib/editor-context';
import { EditorTopbar } from '@/components/editor/EditorTopbar';
import { EditorToolbar } from '@/components/editor/EditorToolbar';
import { EditorCanvas } from '@/components/editor/EditorCanvas';
import { EditorSidebar } from '@/components/editor/EditorSidebar';
import { GenerationProgress, type GenerationStage } from '@/components/editor/GenerationProgress';
import { GifResult } from '@/components/editor/GifResult';
import { exportFinalGif } from '@/lib/ffmpeg-service';

export default function EditorPage() {
  return (
    <EditorProvider>
      <EditorContent />
    </EditorProvider>
  );
}

function EditorContent() {
  const router = useRouter();
  const { draft } = useDraft();
  const [gifUrl, setGifUrl] = useState<string>('');
  const [gifDimensions, setGifDimensions] = useState({ width: 0, height: 0 });

  const [exportStage, setExportStage] = useState<GenerationStage | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [finalBlob, setFinalBlob] = useState<Blob | null>(null);
  const { state, reset: resetEditor } = useEditor();
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Garde : il faut un GIF en mémoire
  useEffect(() => {
    if (!draft?.gifBlob || draft.gifBlob.size === 0) {
      router.replace('/create');
    }
  }, [draft, router]);

  // Création de l'URL Object pour le GIF
  useEffect(() => {
    if (!draft?.gifBlob || draft.gifBlob.size === 0) return;
    const url = URL.createObjectURL(draft.gifBlob);
    setGifUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [draft?.gifBlob]);

  // Récupération des dimensions natives
  useEffect(() => {
    if (!gifUrl) return;
    const img = new Image();
    img.onload = () => {
      setGifDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = gifUrl;
  }, [gifUrl]);

  if (!draft?.gifBlob || draft.gifBlob.size === 0) return null;

  function handleBack() {
    router.push('/create/edit');
  }

  async function handleExport() {
    if (!draftRef.current?.gifBlob) return;
    setExportError(null);
    setExportProgress(0);
    setExportStage('converting');

    try {
      const finalGif = await exportFinalGif({
        gifBlob: draftRef.current.gifBlob,
        state,
        sourceWidth: gifDimensions.width,
        sourceHeight: gifDimensions.height,
        onProgress: (r) => setExportProgress(r),
      });

      setFinalBlob(finalGif);
      setExportStage('done');
    } catch (err) {
      console.error(err);
      setExportError(err instanceof Error ? err.message : 'Erreur d\'export');
      setExportStage('error');
    }
  }

  /**
   * "Refaire" : reset le resultat exporte + reset les modifs editeur
   * (textes, crop, filtres, vitesse), mais GARDE le GIF source charge.
   * L'utilisateur revient sur le canvas avec le GIF de depart, prêt
   * pour un nouvel essai d'edition.
   */
  function handleRestart() {
    setFinalBlob(null);
    setExportStage(null);
    setExportError(null);
    setExportProgress(0);
    resetEditor();
  }

  function handleContinue() {
    alert('Étape suivante (US#4 Collections) à venir.\n\nVotre GIF est prêt et téléchargeable.');
  }

  // Vue résultat final
  if (finalBlob && exportStage === 'done') {
    return (
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
          p: 4,
        }}
      >
        <Box sx={{ maxWidth: 800, mx: 'auto', width: '100%' }}>
          <GifResult
            blob={finalBlob}
            width={gifDimensions.width}
            fps={draft.gifSettings?.fps ?? 15}
            duration={
              draft.trim
                ? (draft.trim.end - draft.trim.start) / state.speed
                : 0
            }
            onRestart={handleRestart}
            onContinue={handleContinue}
          />
        </Box>
      </Box>
    );
  }

  if (!gifUrl || gifDimensions.width === 0) {
    return (
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <EditorTopbar
        title={draft.sourceVideo.originalName}
        onBack={handleBack}
        onExport={handleExport}
        exportLoading={exportStage === 'converting'}
      />

      <Box sx={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>
        <EditorToolbar />
        <EditorCanvas
          gifUrl={gifUrl}
          width={gifDimensions.width}
          height={gifDimensions.height}
        />
        <EditorSidebar
          gifUrl={gifUrl}
          gifWidth={gifDimensions.width}
          gifHeight={gifDimensions.height}
        />
      </Box>

      <GenerationProgress
        open={exportStage === 'converting' || exportStage === 'error'}
        stage={exportStage ?? 'converting'}
        conversionProgress={exportProgress}
        errorMessage={exportError ?? undefined}
      />
    </Box>
  );
}
