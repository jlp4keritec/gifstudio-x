/**
 * Applique un watermark a un GIF deja genere via FFmpeg WASM.
 * Le watermark est compose en image PNG (texte + logo) cote browser via Canvas,
 * puis FFmpeg overlay l'applique frame par frame sur le GIF.
 *
 * Strategie : on rend le watermark dans un canvas RGBA, on l'exporte en PNG,
 * puis on appelle ffmpeg avec un filter graph "overlay".
 *
 * IMPORTANT : la palette d'un GIF est limitee a 256 couleurs, donc apres overlay
 * il faut regenerer la palette (filter `split + palettegen + paletteuse`).
 */

import type { FFmpeg } from '@ffmpeg/ffmpeg';
import type { WatermarkConfig, WatermarkPosition } from '@gifstudio-x/shared';

/**
 * Recoit la config + dimensions du GIF + URL du logo (si applicable).
 * Renvoie un Blob PNG du watermark de meme taille que le GIF, ou null si pas applicable.
 */
export async function buildWatermarkOverlay(
  config: WatermarkConfig,
  gifWidth: number,
  gifHeight: number,
  logoUrl: string | null,
): Promise<Blob | null> {
  if (!config.enabled) return null;
  const showText = config.mode === 'text' || config.mode === 'text_and_image';
  const showLogo =
    (config.mode === 'image' || config.mode === 'text_and_image') &&
    config.hasLogo &&
    logoUrl;

  if (!showText && !showLogo) return null;

  const canvas = document.createElement('canvas');
  canvas.width = gifWidth;
  canvas.height = gifHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D non disponible');

  ctx.clearRect(0, 0, gifWidth, gifHeight);

  // Logo d'abord (sera derriere le texte si meme position)
  if (showLogo && logoUrl) {
    try {
      const img = await loadImage(logoUrl);
      const logoW = (config.logoWidthPercent / 100) * gifWidth;
      const logoH = (img.height / img.width) * logoW;
      const { x, y } = computePosition(
        config.position,
        config.marginPx,
        gifWidth,
        gifHeight,
        logoW,
        logoH,
      );
      ctx.globalAlpha = config.logoOpacity;
      ctx.drawImage(img, x, y, logoW, logoH);
      ctx.globalAlpha = 1;
    } catch (err) {
      console.warn('[watermark] echec chargement logo, on continue sans :', err);
    }
  }

  if (showText) {
    const fontSize = (config.text.fontSizePercent / 100) * gifWidth;
    ctx.font = `${config.text.fontFamily === 'Impact' ? '' : '600 '}${fontSize}px ${config.text.fontFamily}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    const metrics = ctx.measureText(config.text.text || '');
    const textWidth = metrics.width;
    const textHeight = fontSize * 1.1;

    let { x, y } = computePosition(
      config.position,
      config.marginPx,
      gifWidth,
      gifHeight,
      textWidth,
      textHeight,
    );

    // Si on a aussi un logo a la meme position, decaler le texte
    if (showLogo && config.hasLogo) {
      const logoH =
        (config.logoWidthPercent / 100) *
        gifWidth *
        0.6; // approx, on pourrait calculer mais ratio inconnu coute logo a charger
      if (config.position.startsWith('bottom')) {
        y -= logoH + 8;
      } else if (config.position.startsWith('top')) {
        y += logoH + 8;
      }
    }

    if (config.text.hasShadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = Math.max(2, fontSize * 0.08);
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
    }

    ctx.globalAlpha = config.text.opacity;
    ctx.fillStyle = config.text.color;
    ctx.fillText(config.text.text || '', x, y);
    ctx.globalAlpha = 1;
    ctx.shadowColor = 'transparent';
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Echec generation overlay PNG'));
    }, 'image/png');
  });
}

function computePosition(
  pos: WatermarkPosition,
  margin: number,
  gifW: number,
  gifH: number,
  elW: number,
  elH: number,
): { x: number; y: number } {
  let x = 0, y = 0;
  if (pos.endsWith('-left')) x = margin;
  else if (pos.endsWith('-center')) x = (gifW - elW) / 2;
  else x = gifW - elW - margin;

  if (pos.startsWith('top-')) y = margin;
  else if (pos.startsWith('middle-')) y = (gifH - elH) / 2;
  else y = gifH - elH - margin;

  return { x: Math.round(x), y: Math.round(y) };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'use-credentials';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Echec chargement image : ${url}`));
    img.src = url;
  });
}

/**
 * Applique le watermark a un GIF deja en memoire FFmpeg.
 * Lit `inputName`, ecrit `outputName`. L'overlay PNG doit aussi etre present sous `overlayName`.
 */
export async function ffmpegApplyWatermarkOverlay(
  ffmpeg: FFmpeg,
  inputName: string,
  overlayName: string,
  outputName: string,
  fps: number,
): Promise<void> {
  // Filter complex : on overlay le PNG sur chaque frame puis on regenere la palette
  // pour preserver une bonne qualite de GIF
  const filterComplex = [
    `[0:v][1:v]overlay=0:0:format=auto,split[a][b]`,
    `[a]palettegen=stats_mode=full[p]`,
    `[b][p]paletteuse=dither=bayer:bayer_scale=4`,
  ].join(';');

  await ffmpeg.exec([
    '-i', inputName,
    '-i', overlayName,
    '-filter_complex', filterComplex,
    '-r', String(fps),
    '-y',
    outputName,
  ]);
}
