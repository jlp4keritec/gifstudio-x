'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  TextField,
  Typography,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
  Box,
  InputAdornment,
  Slider,
  Snackbar,
  Divider,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LinkIcon from '@mui/icons-material/Link';
import CodeIcon from '@mui/icons-material/Code';
import ShareIcon from '@mui/icons-material/Share';
import TwitterIcon from '@mui/icons-material/X';
import FacebookIcon from '@mui/icons-material/Facebook';
import RedditIcon from '@mui/icons-material/Reddit';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import EmailIcon from '@mui/icons-material/Email';
import type { PublicGif } from '@gifstudio-x/shared';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  gif: PublicGif;
}

export function ShareDialog({ open, onClose, gif }: ShareDialogProps) {
  const [tab, setTab] = useState<'link' | 'embed'>('link');
  const [embedWidth, setEmbedWidth] = useState(480);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = `${origin}/g/${gif.slug}`;
  const embedUrl = `${origin}/embed/${gif.slug}`;

  // Hauteur calculée selon le ratio du GIF
  const aspectRatio = gif.height / gif.width;
  const embedHeight = Math.round(embedWidth * aspectRatio);

  const embedCode = `<iframe src="${embedUrl}" width="${embedWidth}" height="${embedHeight}" frameborder="0" allowfullscreen style="border:0;"></iframe>`;

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setSnackbar(`${label} copié !`);
    } catch {
      setSnackbar('Impossible de copier');
    }
  }

  function shareTo(platform: 'twitter' | 'facebook' | 'reddit' | 'whatsapp' | 'email') {
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedTitle = encodeURIComponent(gif.title);

    let url = '';
    switch (platform) {
      case 'twitter':
        url = `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`;
        break;
      case 'facebook':
        url = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
        break;
      case 'reddit':
        url = `https://reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`;
        break;
      case 'whatsapp':
        url = `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`;
        break;
      case 'email':
        url = `mailto:?subject=${encodedTitle}&body=${encodedUrl}`;
        break;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function nativeShare() {
    if (typeof navigator === 'undefined' || !navigator.share) {
      copy(shareUrl, 'Lien');
      return;
    }
    try {
      await navigator.share({
        title: gif.title,
        text: gif.description ?? gif.title,
        url: shareUrl,
      });
    } catch {
      /* cancel */
    }
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <ShareIcon />
            <span>Partager ce GIF</span>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
          >
            <Tab icon={<LinkIcon />} iconPosition="start" label="Lien" value="link" />
            <Tab icon={<CodeIcon />} iconPosition="start" label="Code embed" value="embed" />
          </Tabs>

          {tab === 'link' && (
            <Stack spacing={3}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  Lien direct vers le GIF
                </Typography>
                <TextField
                  value={shareUrl}
                  fullWidth
                  size="small"
                  InputProps={{
                    readOnly: true,
                    endAdornment: (
                      <InputAdornment position="end">
                        <Tooltip title="Copier le lien">
                          <IconButton onClick={() => copy(shareUrl, 'Lien')} edge="end">
                            <ContentCopyIcon />
                          </IconButton>
                        </Tooltip>
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>

              <Divider>
                <Typography variant="caption" color="text.secondary">
                  Partager sur
                </Typography>
              </Divider>

              <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap>
                <Tooltip title="X (Twitter)">
                  <IconButton onClick={() => shareTo('twitter')} size="large" sx={{ border: 1, borderColor: 'divider' }}>
                    <TwitterIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Facebook">
                  <IconButton onClick={() => shareTo('facebook')} size="large" sx={{ border: 1, borderColor: 'divider' }}>
                    <FacebookIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Reddit">
                  <IconButton onClick={() => shareTo('reddit')} size="large" sx={{ border: 1, borderColor: 'divider' }}>
                    <RedditIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="WhatsApp">
                  <IconButton onClick={() => shareTo('whatsapp')} size="large" sx={{ border: 1, borderColor: 'divider' }}>
                    <WhatsAppIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Email">
                  <IconButton onClick={() => shareTo('email')} size="large" sx={{ border: 1, borderColor: 'divider' }}>
                    <EmailIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Partage natif (mobile)">
                  <IconButton onClick={nativeShare} size="large" sx={{ border: 1, borderColor: 'divider' }}>
                    <ShareIcon />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>
          )}

          {tab === 'embed' && (
            <Stack spacing={3}>
              <Typography variant="body2" color="text.secondary">
                Copiez ce code HTML pour intégrer le GIF sur votre site.
              </Typography>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Largeur : {embedWidth}px — Hauteur : {embedHeight}px (ratio conservé)
                </Typography>
                <Slider
                  value={embedWidth}
                  onChange={(_, v) => setEmbedWidth(v as number)}
                  min={240}
                  max={800}
                  step={20}
                  size="small"
                  sx={{ mt: 1 }}
                  valueLabelDisplay="auto"
                />
              </Box>

              <TextField
                value={embedCode}
                fullWidth
                multiline
                rows={3}
                size="small"
                InputProps={{
                  readOnly: true,
                  sx: {
                    fontFamily: 'monospace',
                    fontSize: 12,
                  },
                  endAdornment: (
                    <InputAdornment position="end" sx={{ alignSelf: 'flex-start', pt: 1 }}>
                      <Tooltip title="Copier le code">
                        <IconButton onClick={() => copy(embedCode, 'Code embed')} edge="end">
                          <ContentCopyIcon />
                        </IconButton>
                      </Tooltip>
                    </InputAdornment>
                  ),
                }}
              />

              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  Aperçu
                </Typography>
                <Box
                  sx={{
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    p: 1,
                    display: 'flex',
                    justifyContent: 'center',
                    bgcolor: 'background.default',
                  }}
                >
                  <iframe
                    src={embedUrl}
                    width={Math.min(embedWidth, 480)}
                    height={Math.min(embedHeight, 480 * aspectRatio)}
                    frameBorder="0"
                    style={{ border: 0, display: 'block' }}
                  />
                </Box>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose}>Fermer</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(snackbar)}
        autoHideDuration={2000}
        onClose={() => setSnackbar(null)}
        message={snackbar ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
}
