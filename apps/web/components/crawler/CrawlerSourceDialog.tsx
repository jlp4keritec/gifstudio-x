'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Alert,
  Typography,
  Box,
  Divider,
  Chip,
  CircularProgress,
  Paper,
} from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';
import type {
  CrawlerSource,
  CrawlerAdapter,
  CrawlerAdapterInfo,
} from '@gifstudio-x/shared';
import {
  crawlerService,
  type CreateSourceInput,
  type GenericHtmlTestResult,
  type GenericBrowserTestResult,
} from '@/lib/crawler-service';
import { ApiError } from '@/lib/api-client';

interface Props {
  open: boolean;
  source?: CrawlerSource | null;
  adapters: CrawlerAdapterInfo[];
  onClose: (refreshed?: boolean) => void;
}

const CONFIG_TEMPLATES: Record<CrawlerAdapter, string> = {
  reddit: JSON.stringify(
    {
      subreddit: 'oddlysatisfying',
      sort: 'hot',
      minScore: 100,
      requireVideo: true,
      nsfw: 'allow',
    },
    null,
    2,
  ),
  redgifs: JSON.stringify(
    {
      mode: 'tag',
      tag: 'cute',
      order: 'trending',
      quality: 'hd',
      minDurationSec: 0,
    },
    null,
    2,
  ),
  rule34: JSON.stringify(
    {
      includeTags: ['video'],
      excludeTags: ['loli', 'shota'],
      sort: 'date',
      minScore: 10,
    },
    null,
    2,
  ),
  e621: JSON.stringify(
    {
      includeTags: ['animated'],
      excludeTags: ['gore'],
      sort: 'score',
      minScore: 50,
      rating: 'e',
    },
    null,
    2,
  ),
  generic_html: JSON.stringify(
    {
      url: 'https://example.com/videos',
      videoSelectors: ["video source[src]", "a[href$='.mp4']"],
      thumbnailSelectors: ["img.thumb"],
      titleSelectors: ["h1", "title"],
      videoRegex: "https?://[^\"'\\s<>]+\\.(?:mp4|webm)",
      allowedExtensions: ["mp4", "webm"],
    },
    null,
    2,
  ),
  generic_browser: JSON.stringify(
    {
      url: 'https://example.com/videos',
      waitForSelector: '.video-card',
      waitForTimeout: 30000,
      scrollToBottom: true,
      scrollPasses: 3,
      videoSelectors: ["video[src]", "video source[src]"],
      videoRegex: "https?://[^\"'\\s<>]+\\.(?:mp4|webm|m3u8)",
      thumbnailSelectors: ["img.thumb"],
      titleSelectors: ["h1", "title"],
      interceptNetwork: true,
      allowedExtensions: ["mp4", "webm", "m3u8"],
      viewport: { width: 1280, height: 720 },
    },
    null,
    2,
  ),
};

export function CrawlerSourceDialog({ open, source, adapters, onClose }: Props) {
  const isEdit = Boolean(source);

  const [name, setName] = useState('');
  const [adapter, setAdapter] = useState<CrawlerAdapter>('reddit');
  const [config, setConfig] = useState(CONFIG_TEMPLATES.reddit);
  const [cronExpression, setCronExpression] = useState('0 */6 * * *');
  const [enabled, setEnabled] = useState(true);
  const [maxResultsPerRun, setMaxResultsPerRun] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    GenericHtmlTestResult | GenericBrowserTestResult | null
  >(null);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (source) {
      setName(source.name);
      setAdapter(source.adapter);
      setConfig(JSON.stringify(source.config, null, 2));
      setCronExpression(source.cronExpression);
      setEnabled(source.enabled);
      setMaxResultsPerRun(source.maxResultsPerRun);
    } else {
      setName('');
      setAdapter('reddit');
      setConfig(CONFIG_TEMPLATES.reddit);
      setCronExpression('0 */6 * * *');
      setEnabled(true);
      setMaxResultsPerRun(20);
    }
    setError(null);
    setTestResult(null);
    setTestError(null);
  }, [open, source]);

  useEffect(() => {
    if (!isEdit) {
      setConfig(CONFIG_TEMPLATES[adapter]);
    }
    setTestResult(null);
    setTestError(null);
  }, [adapter, isEdit]);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      let parsedConfig: Record<string, unknown>;
      try {
        parsedConfig = JSON.parse(config);
      } catch {
        throw new Error('Config : JSON invalide');
      }

      const payload: CreateSourceInput = {
        name: name.trim(),
        adapter,
        config: parsedConfig,
        cronExpression: cronExpression.trim(),
        enabled,
        maxResultsPerRun,
      };

      if (isEdit && source) {
        await crawlerService.updateSource(source.id, payload);
      } else {
        await crawlerService.createSource(payload);
      }
      onClose(true);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTestError(null);
    setTestResult(null);
    setTesting(true);
    try {
      let parsedConfig: Record<string, unknown>;
      try {
        parsedConfig = JSON.parse(config);
      } catch {
        throw new Error('Config : JSON invalide');
      }
      let result: GenericHtmlTestResult | GenericBrowserTestResult;
      if (adapter === 'generic_browser') {
        result = await crawlerService.testGenericBrowser(parsedConfig);
      } else {
        result = await crawlerService.testGenericHtml(parsedConfig);
      }
      setTestResult(result);
    } catch (err) {
      if (err instanceof ApiError) setTestError(err.message);
      else setTestError(err instanceof Error ? err.message : 'Erreur de test');
    } finally {
      setTesting(false);
    }
  };

  const isTestable = adapter === 'generic_html' || adapter === 'generic_browser';
  const isBrowserResult = (r: unknown): r is GenericBrowserTestResult =>
    Boolean(r && typeof r === 'object' && 'networkCaptureCount' in r);

  return (
    <Dialog open={open} onClose={() => onClose(false)} fullWidth maxWidth="md">
      <DialogTitle>
        {isEdit ? 'Editer la source' : 'Nouvelle source de crawl'}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Nom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
            placeholder="Ex: my-site videos"
          />

          <FormControl fullWidth>
            <InputLabel>Adaptateur</InputLabel>
            <Select
              value={adapter}
              label="Adaptateur"
              onChange={(e) => setAdapter(e.target.value as CrawlerAdapter)}
              disabled={isEdit}
            >
              {adapters.map((a) => (
                <MenuItem key={a.name} value={a.name} disabled={!a.implemented}>
                  {a.name} {!a.implemented && '(bientot)'}
                  {a.name === 'generic_browser' && ' — Playwright (sites JS, plus lent)'}
                  {a.name === 'generic_html' && ' — fetch + selecteurs'}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {adapter === 'generic_browser' && (
            <Alert severity="info">
              Mode <strong>Playwright</strong> : charge la page dans Chromium headless
              (rendu JS), supporte le scroll auto et l'intercept reseau.
              Plus lent (10-30s par run) mais beaucoup plus puissant.
              Necessite : <code>pnpm playwright:install</code> a executer une fois.
            </Alert>
          )}

          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              Config (JSON)
            </Typography>
            <TextField
              value={config}
              onChange={(e) => setConfig(e.target.value)}
              multiline
              minRows={6}
              maxRows={18}
              fullWidth
              sx={{ fontFamily: 'monospace' }}
              InputProps={{ sx: { fontFamily: 'monospace', fontSize: 13 } }}
            />
            {isTestable && (
              <Stack direction="row" spacing={1} sx={{ mt: 1 }} alignItems="center">
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={testing ? <CircularProgress size={14} /> : <ScienceIcon />}
                  onClick={handleTest}
                  disabled={testing}
                >
                  {testing ? 'Test en cours...' : 'Tester la config'}
                </Button>
                <Typography variant="caption" color="text.secondary">
                  {adapter === 'generic_browser'
                    ? 'Lance Chromium et capture la page (peut prendre 30s+)'
                    : 'Fetch la page + applique les selecteurs sans rien inserer'}
                </Typography>
              </Stack>
            )}
          </Box>

          {testError && <Alert severity="error">{testError}</Alert>}

          {testResult && (
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
              <Stack spacing={1}>
                <Typography variant="subtitle2">Resultat du test</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip
                    size="small"
                    label={`Page : ${(testResult.pageTitle || '(sans titre)').slice(0, 50)}`}
                    variant="outlined"
                  />
                  {isBrowserResult(testResult) && (
                    <Chip
                      size="small"
                      label={`URL finale : ${new URL(testResult.finalUrl).hostname}`}
                      variant="outlined"
                    />
                  )}
                  <Chip
                    size="small"
                    label={`HTML : ${(testResult.htmlSize / 1024).toFixed(0)} Ko`}
                    variant="outlined"
                  />
                  <Chip
                    size="small"
                    label={`CSS : ${testResult.cssMatchCount} match`}
                    color={testResult.cssMatchCount > 0 ? 'success' : 'default'}
                  />
                  <Chip
                    size="small"
                    label={`Regex : ${testResult.regexMatchCount} match`}
                    color={testResult.regexMatchCount > 0 ? 'success' : 'default'}
                  />
                  {isBrowserResult(testResult) && (
                    <Chip
                      size="small"
                      label={`Network : ${testResult.networkCaptureCount} capturees`}
                      color={testResult.networkCaptureCount > 0 ? 'success' : 'default'}
                    />
                  )}
                  <Chip
                    size="small"
                    label={`URLs videos : ${testResult.filteredUrls.length}`}
                    color={testResult.filteredUrls.length > 0 ? 'success' : 'error'}
                  />
                </Stack>

                {testResult.warnings.length > 0 && (
                  <Alert severity="warning" sx={{ py: 0 }}>
                    {testResult.warnings.join(' / ')}
                  </Alert>
                )}

                {testResult.filteredUrls.length > 0 ? (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      URLs trouvees (max 10) :
                    </Typography>
                    <Box
                      sx={{
                        maxHeight: 200,
                        overflowY: 'auto',
                        fontFamily: 'monospace',
                        fontSize: 12,
                        mt: 0.5,
                      }}
                    >
                      {testResult.filteredUrls.slice(0, 10).map((u, i) => (
                        <Box key={i} sx={{ py: 0.25, wordBreak: 'break-all' }}>{u}</Box>
                      ))}
                    </Box>
                  </Box>
                ) : (
                  <Alert severity="info" sx={{ py: 0 }}>
                    Aucune URL video apres filtre extensions. Verifie les selecteurs / regex / allowedExtensions.
                  </Alert>
                )}
              </Stack>
            </Paper>
          )}

          <Divider />

          <TextField
            label="Cron expression"
            value={cronExpression}
            onChange={(e) => setCronExpression(e.target.value)}
            required
            fullWidth
            helperText="Min 15 min entre runs. Ex: '0 */6 * * *' (toutes les 6h)"
          />

          <TextField
            label="Max resultats / run"
            type="number"
            value={maxResultsPerRun}
            onChange={(e) => setMaxResultsPerRun(Number(e.target.value) || 20)}
            inputProps={{ min: 1, max: 200 }}
            fullWidth
          />

          <FormControlLabel
            control={
              <Switch
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
            }
            label="Activee (cron planifie)"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)} disabled={saving}>
          Annuler
        </Button>
        <Button onClick={handleSave} variant="contained" disabled={saving || !name.trim()}>
          {saving ? 'Enregistrement...' : isEdit ? 'Enregistrer' : 'Creer'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
