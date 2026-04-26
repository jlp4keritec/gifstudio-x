'use client';

import { useEffect, useState } from 'react';
import {
  Container,
  Stack,
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Button,
  Snackbar,
  CircularProgress,
  Alert,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import type { UserSettings, WatermarkConfig } from '@gifstudio-x/shared';
import { DEFAULT_USER_SETTINGS } from '@gifstudio-x/shared';
import { settingsService } from '@/lib/settings-service';
import { WatermarkEditor } from '@/components/settings/WatermarkEditor';
import { useConfirm } from '@/components/ui/ConfirmDialog';

type TabKey = 'watermark';

export default function SettingsPage() {
  const confirm = useConfirm();
  const [tab, setTab] = useState<TabKey>('watermark');
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [originalSettings, setOriginalSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const s = await settingsService.get();
        setSettings(s);
        setOriginalSettings(s);
      } catch (err) {
        setSnack(`Erreur : ${(err as Error).message}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isDirty = JSON.stringify(settings) !== JSON.stringify(originalSettings);

  const handleSave = async () => {
    setSaving(true);
    try {
      const next = await settingsService.update(settings);
      setSettings(next);
      setOriginalSettings(next);
      setSnack('Parametres enregistres');
    } catch (err) {
      setSnack(`Erreur : ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    const ok = await confirm({
      message: 'Reinitialiser les parametres aux valeurs par defaut ?',
      tone: 'danger',
    });
    if (!ok) return;
    setSettings(DEFAULT_USER_SETTINGS);
  };

  const handleWatermarkChange = (next: WatermarkConfig) => {
    setSettings((s) => ({ ...s, watermark: next }));
  };

  const handleLogoChanged = async () => {
    // Refetch les settings pour mettre a jour hasLogo cote BDD->client
    try {
      const s = await settingsService.get();
      setSettings(s);
      setOriginalSettings(s);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Parametres
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configurez vos preferences par defaut. Les modifications ne sont pas enregistrees automatiquement.
          </Typography>
        </Box>

        <Paper>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v as TabKey)}
            sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab value="watermark" label="Watermark" />
          </Tabs>

          <Box sx={{ p: 3 }}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : tab === 'watermark' ? (
              <WatermarkEditor
                config={settings.watermark}
                onChange={handleWatermarkChange}
                onLogoChanged={handleLogoChanged}
                manageLogoUpload
              />
            ) : null}
          </Box>
        </Paper>

        {isDirty && (
          <Alert severity="info">
            Vous avez des modifications non enregistrees.
          </Alert>
        )}

        <Stack direction="row" spacing={1.5} justifyContent="flex-end">
          <Button
            variant="outlined"
            startIcon={<RestartAltIcon />}
            onClick={handleReset}
            color="warning"
          >
            Reinitialiser
          </Button>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
            onClick={handleSave}
            disabled={saving || !isDirty}
          >
            Enregistrer
          </Button>
        </Stack>
      </Stack>

      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        message={snack}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      />
    </Container>
  );
}
