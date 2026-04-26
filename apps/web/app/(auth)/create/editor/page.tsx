'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  CircularProgress,
  Paper,
  Stack,
  Switch,
  FormControlLabel,
  Button,
  Typography,
  Tooltip,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { useDraft } from '@/lib/draft-context';
import { EditorProvider, useEditor } from '@/lib/editor-context';
import { EditorTopbar } from '@/components/editor/EditorTopbar';
import { EditorToolbar } from '@/components/editor/EditorToolbar';
import { EditorCanvas } from '@/components/editor/EditorCanvas';
import { EditorSidebar } from '@/components/editor/EditorSidebar';
import { GenerationProgress, type GenerationStage } from '@/components/editor/GenerationProgress';
import { GifResult } from '@/components/editor/GifResult';
import { WatermarkOverrideDialog } from '@/components/editor/WatermarkOverrideDialog';
import { exportFinalGif } from '@/lib/ffmpeg-service';
import { applyWatermarkToGif } from '@/lib/watermark-pipeline';
import { settingsService } from '@/lib/settings-service';
import type { UserSettings, WatermarkConfig } from '@gifstudio-x/shared';
import { DEFAULT_USER_SETTINGS } from '@gifstudio-x/shared';

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

  // Watermark : config locale (override l'export) + flag d'application
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [overrideConfig, setOverrideConfig] = useState<WatermarkConfig | null>(null);
  const [applyWatermark, setApplyWatermark] = useState(false);
  const [watermarkDialogOpen, setWatermarkDialogOpen] = useState(false);

  // Charger les settings au mount
  useEffect(() => {
    void (async () => {
      try {
        const s = await settingsService.get();
        setUserSettings(s);
        setApplyWatermark(s.watermark.enabled);
      } catch (err) {
        console.warn('[editor] echec chargement settings :', err);
      }
    })();
  }, []);

  useEffect(() => {
    if (!draft?.gifBlob || draft.gifBlob.size === 0) {
      router.replace('/create');
    }
  }, [draft, router]);

  useEffect(() => {
    if (!draft?.gifBlob || draft.gifBlob.size === 0) return;
    const url = URL.createObjectURL(draft.gifBlob);
    setGifUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [draft?.gifBlob]);

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

  /** Config watermark active : override local OU defaut user */
  function getActiveWatermarkConfig(): WatermarkConfig {
    if (overrideConfig) return { ...overrideConfig, enabled: applyWatermark };
    return { ...userSettings.watermark, enabled: applyWatermark };
  }

  async function handleExport() {
    if (!draftRef.current?.gifBlob) return;
    setExportError(null);
    setExportProgress(0);
    setExportStage('converting');

    try {
      // Etape 1 : export classique (crop, texte, filtres, vitesse)
      const baseGif = await exportFinalGif({
        gifBlob: draftRef.current.gifBlob,
        state,
        sourceWidth: gifDimensions.width,
        sourceHeight: gifDimensions.height,
        onProgress: (r) => setExportProgress(r * 0.7),
      });

      // Etape 2 : watermark si actif
      const wmConfig = getActiveWatermarkConfig();
      let finalGif = baseGif;
      if (wmConfig.enabled) {
        const fps = draftRef.current.gifSettings?.fps ?? 15;
        finalGif = await applyWatermarkToGif({
          gifBlob: baseGif,
          config: wmConfig,
          logoUrl: wmConfig.hasLogo ? settingsService.logoUrl() : null,
          gifWidth: gifDimensions.width,
          gifHeight: gifDimensions.height,
          fps,
          onProgress: (r) => setExportProgress(0.7 + r * 0.3),
        });
      }

      setFinalBlob(finalGif);
      setExportStage('done');
    } catch (err) {
      console.error(err);
      setExportError(err instanceof Error ? err.message : 'Erreur d\'export');
      setExportStage('error');
    }
  }

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

  const wmConfig = getActiveWatermarkConfig();

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
        <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
            <EditorSidebar
              gifUrl={gifUrl}
              gifWidth={gifDimensions.width}
              gifHeight={gifDimensions.height}
            />
          </Box>
          <Paper
            square
            elevation={2}
            sx={{ p: 2, borderTop: 1, borderColor: 'divider', minWidth: 280 }}
          >
            <Stack spacing={1}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Watermark
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    checked={applyWatermark}
                    onChange={(e) => setApplyWatermark(e.target.checked)}
                    size="small"
                  />
                }
                label={
                  applyWatermark
                    ? wmConfig.mode === 'image'
                      ? 'Logo seul'
                      : wmConfig.mode === 'text_and_image'
                      ? 'Texte + logo'
                      : `Texte : "${wmConfig.text.text || '(vide)'}"`
                    : 'Aucun watermark'
                }
              />
              <Tooltip title="Modifier ponctuellement (ne sauvegarde pas dans les parametres)">
                <Button
                  size="small"
                  startIcon={<EditIcon fontSize="small" />}
                  onClick={() => setWatermarkDialogOpen(true)}
                  variant="outlined"
                  fullWidth
                  disabled={!applyWatermark}
                >
                  Modifier pour cet export
                </Button>
              </Tooltip>
              {overrideConfig && (
                <Button
                  size="small"
                  color="warning"
                  onClick={() => setOverrideConfig(null)}
                  fullWidth
                >
                  Reinitialiser (utiliser les parametres)
                </Button>
              )}
            </Stack>
          </Paper>
        </Box>
      </Box>

      <GenerationProgress
        open={exportStage === 'converting' || exportStage === 'error'}
        stage={exportStage ?? 'converting'}
        conversionProgress={exportProgress}
        errorMessage={exportError ?? undefined}
      />

      <WatermarkOverrideDialog
        open={watermarkDialogOpen}
        initialConfig={overrideConfig ?? userSettings.watermark}
        onApply={(c) => setOverrideConfig(c)}
        onClose={() => setWatermarkDialogOpen(false)}
      />
    </Box>
  );
}
