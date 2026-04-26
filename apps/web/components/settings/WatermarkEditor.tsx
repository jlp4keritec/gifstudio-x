'use client';

import { useRef, useState } from 'react';
import {
  Box,
  Stack,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Slider,
  Typography,
  Button,
  Divider,
  Chip,
  IconButton,
  Tooltip,
  Paper,
} from '@mui/material';
import UploadIcon from '@mui/icons-material/Upload';
import DeleteIcon from '@mui/icons-material/Delete';
import type {
  WatermarkConfig,
  WatermarkMode,
  WatermarkPosition,
} from '@gifstudio-x/shared';
import { AVAILABLE_WATERMARK_FONTS } from '@gifstudio-x/shared';
import { settingsService } from '@/lib/settings-service';
import { PositionPicker } from './PositionPicker';

interface WatermarkEditorProps {
  config: WatermarkConfig;
  onChange: (next: WatermarkConfig) => void;
  /**
   * Si true, gere l'upload du logo via API (ecrit en BDD/disque).
   * Si false, mode "ephemere" : pas d'upload (ex: edition ponctuelle a l'export).
   * Defaut: true.
   */
  manageLogoUpload?: boolean;
  onLogoChanged?: () => void;
  showHeader?: boolean;
}

export function WatermarkEditor({
  config,
  onChange,
  manageLogoUpload = true,
  onLogoChanged,
  showHeader = true,
}: WatermarkEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [logoCacheBuster, setLogoCacheBuster] = useState(Date.now());

  const update = <K extends keyof WatermarkConfig>(key: K, value: WatermarkConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  const updateText = <K extends keyof WatermarkConfig['text']>(
    key: K,
    value: WatermarkConfig['text'][K],
  ) => {
    onChange({ ...config, text: { ...config.text, [key]: value } });
  };

  const handleUpload = async (file: File) => {
    if (!manageLogoUpload) return;
    setUploading(true);
    try {
      const next = await settingsService.uploadLogo(file);
      onChange(next.watermark);
      setLogoCacheBuster(Date.now());
      onLogoChanged?.();
    } catch (err) {
      alert(`Erreur upload : ${(err as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteLogo = async () => {
    if (!manageLogoUpload) return;
    if (!confirm('Supprimer le logo ?')) return;
    try {
      const next = await settingsService.deleteLogo();
      onChange(next.watermark);
      setLogoCacheBuster(Date.now());
      onLogoChanged?.();
    } catch (err) {
      alert(`Erreur : ${(err as Error).message}`);
    }
  };

  const showText = config.mode === 'text' || config.mode === 'text_and_image';
  const showLogo = config.mode === 'image' || config.mode === 'text_and_image';

  return (
    <Stack spacing={3}>
      {showHeader && (
        <Box>
          <Typography variant="h6">Watermark</Typography>
          <Typography variant="body2" color="text.secondary">
            Signature appliquee a l'export final du GIF (texte et/ou logo).
          </Typography>
        </Box>
      )}

      <FormControlLabel
        control={
          <Switch
            checked={config.enabled}
            onChange={(e) => update('enabled', e.target.checked)}
          />
        }
        label={config.enabled ? 'Watermark active' : 'Watermark desactive'}
      />

      <Stack spacing={2} sx={{ opacity: config.enabled ? 1 : 0.5, pointerEvents: config.enabled ? 'auto' : 'none' }}>
        <FormControl size="small" fullWidth>
          <InputLabel>Mode</InputLabel>
          <Select
            value={config.mode}
            label="Mode"
            onChange={(e) => update('mode', e.target.value as WatermarkMode)}
          >
            <MenuItem value="text">Texte uniquement</MenuItem>
            <MenuItem value="image">Logo uniquement</MenuItem>
            <MenuItem value="text_and_image">Texte + logo</MenuItem>
          </Select>
        </FormControl>

        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Position
          </Typography>
          <Stack direction="row" spacing={3} alignItems="center">
            <PositionPicker
              value={config.position}
              onChange={(p) => update('position', p)}
            />
            <Box sx={{ flexGrow: 1, maxWidth: 240 }}>
              <Typography variant="caption" color="text.secondary">
                Marge : {config.marginPx}px
              </Typography>
              <Slider
                value={config.marginPx}
                min={0}
                max={100}
                step={2}
                onChange={(_, v) => update('marginPx', v as number)}
                size="small"
              />
            </Box>
          </Stack>
        </Box>

        {showText && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 2 }}>Texte</Typography>
            <Stack spacing={2}>
              <TextField
                label="Texte"
                size="small"
                value={config.text.text}
                onChange={(e) => updateText('text', e.target.value)}
                fullWidth
                inputProps={{ maxLength: 200 }}
              />

              <Stack direction="row" spacing={2}>
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>Police</InputLabel>
                  <Select
                    value={config.text.fontFamily}
                    label="Police"
                    onChange={(e) => updateText('fontFamily', e.target.value)}
                  >
                    {AVAILABLE_WATERMARK_FONTS.map((f) => (
                      <MenuItem key={f} value={f} style={{ fontFamily: f }}>{f}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  type="color"
                  label="Couleur"
                  size="small"
                  value={config.text.color}
                  onChange={(e) => updateText('color', e.target.value)}
                  sx={{ width: 100 }}
                />
              </Stack>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Taille : {config.text.fontSizePercent}% de la largeur
                </Typography>
                <Slider
                  value={config.text.fontSizePercent}
                  min={1}
                  max={30}
                  step={0.5}
                  onChange={(_, v) => updateText('fontSizePercent', v as number)}
                  size="small"
                />
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Opacite : {Math.round(config.text.opacity * 100)}%
                </Typography>
                <Slider
                  value={config.text.opacity}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(_, v) => updateText('opacity', v as number)}
                  size="small"
                />
              </Box>

              <FormControlLabel
                control={
                  <Switch
                    checked={config.text.hasShadow}
                    onChange={(e) => updateText('hasShadow', e.target.checked)}
                  />
                }
                label="Ombre noire (lisibilite)"
              />
            </Stack>
          </Paper>
        )}

        {showLogo && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 2 }}>Logo</Typography>
            <Stack spacing={2}>
              {config.hasLogo ? (
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box
                    sx={{
                      width: 80,
                      height: 80,
                      bgcolor: 'action.hover',
                      borderRadius: 1,
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={settingsService.logoUrl(logoCacheBuster)}
                      alt="logo watermark"
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    />
                  </Box>
                  <Stack spacing={1}>
                    <Chip label="Logo charge" color="success" size="small" />
                    {manageLogoUpload && (
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<UploadIcon />}
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                        >
                          Remplacer
                        </Button>
                        <Tooltip title="Supprimer le logo">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={handleDeleteLogo}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    )}
                  </Stack>
                </Stack>
              ) : (
                manageLogoUpload && (
                  <Button
                    variant="outlined"
                    startIcon={<UploadIcon />}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? 'Upload...' : 'Choisir un logo (PNG/JPG/WEBP, max 2 Mo)'}
                  </Button>
                )
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUpload(f);
                  e.target.value = '';
                }}
              />

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Largeur du logo : {config.logoWidthPercent}% de la largeur du GIF
                </Typography>
                <Slider
                  value={config.logoWidthPercent}
                  min={5}
                  max={50}
                  step={1}
                  onChange={(_, v) => update('logoWidthPercent', v as number)}
                  size="small"
                />
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Opacite : {Math.round(config.logoOpacity * 100)}%
                </Typography>
                <Slider
                  value={config.logoOpacity}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(_, v) => update('logoOpacity', v as number)}
                  size="small"
                />
              </Box>
            </Stack>
          </Paper>
        )}
      </Stack>

      <Divider />

      <PreviewBox config={config} logoCacheBuster={logoCacheBuster} />
    </Stack>
  );
}

/**
 * Preview simulee : affiche un placeholder de GIF (16:9) avec le watermark
 * applique en CSS (pas FFmpeg, juste pour visualiser placement et style).
 * Le rendu reel sera fait par FFmpeg cote export.
 */
function PreviewBox({
  config,
  logoCacheBuster,
}: {
  config: WatermarkConfig;
  logoCacheBuster: number;
}) {
  const showText = config.mode === 'text' || config.mode === 'text_and_image';
  const showLogo = (config.mode === 'image' || config.mode === 'text_and_image') && config.hasLogo;

  // Conversion position en CSS
  const positionStyles: Record<string, React.CSSProperties> = {
    'top-left': { top: config.marginPx, left: config.marginPx, transform: 'none' },
    'top-center': { top: config.marginPx, left: '50%', transform: 'translateX(-50%)' },
    'top-right': { top: config.marginPx, right: config.marginPx, transform: 'none' },
    'middle-left': { top: '50%', left: config.marginPx, transform: 'translateY(-50%)' },
    'middle-center': { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
    'middle-right': { top: '50%', right: config.marginPx, transform: 'translateY(-50%)' },
    'bottom-left': { bottom: config.marginPx, left: config.marginPx, transform: 'none' },
    'bottom-center': { bottom: config.marginPx, left: '50%', transform: 'translateX(-50%)' },
    'bottom-right': { bottom: config.marginPx, right: config.marginPx, transform: 'none' },
  };
  const posStyle = positionStyles[config.position];

  // Largeur fictive du preview (350px), on en deduit la taille texte/logo
  const PREVIEW_WIDTH = 350;
  const fontSizePx = (config.text.fontSizePercent / 100) * PREVIEW_WIDTH;
  const logoWidthPx = (config.logoWidthPercent / 100) * PREVIEW_WIDTH;

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Apercu</Typography>
      <Box
        sx={{
          position: 'relative',
          width: PREVIEW_WIDTH,
          height: Math.round(PREVIEW_WIDTH * 9 / 16),
          bgcolor: '#444',
          backgroundImage:
            'linear-gradient(45deg, #555 25%, transparent 25%), linear-gradient(-45deg, #555 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #555 75%), linear-gradient(-45deg, transparent 75%, #555 75%)',
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 10px, 10px -10px, 10px 0px',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        {!config.enabled && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'rgba(0,0,0,0.6)',
              color: 'white',
              fontSize: 14,
            }}
          >
            Watermark desactive
          </Box>
        )}

        {config.enabled && showText && (
          <Box
            sx={{
              position: 'absolute',
              ...posStyle,
              fontFamily: config.text.fontFamily,
              fontSize: fontSizePx,
              color: config.text.color,
              opacity: config.text.opacity,
              textShadow: config.text.hasShadow ? '2px 2px 4px rgba(0,0,0,0.9)' : 'none',
              whiteSpace: 'nowrap',
              fontWeight: config.text.fontFamily === 'Impact' ? 'normal' : 600,
              lineHeight: 1,
            }}
          >
            {config.text.text || '(texte vide)'}
          </Box>
        )}

        {config.enabled && showLogo && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={settingsService.logoUrl(logoCacheBuster)}
            alt=""
            style={{
              position: 'absolute',
              ...posStyle,
              width: logoWidthPx,
              opacity: config.logoOpacity,
              // Si texte ET image au meme spot, on decale legerement le logo
              ...(showText && config.mode === 'text_and_image'
                ? config.position.startsWith('bottom')
                  ? { bottom: (config.marginPx + fontSizePx + 8) as number }
                  : { top: (config.marginPx + fontSizePx + 8) as number }
                : {}),
            }}
          />
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
        Apercu indicatif. Le rendu final est applique par FFmpeg a l'export.
      </Typography>
    </Box>
  );
}
