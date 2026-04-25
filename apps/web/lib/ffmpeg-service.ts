'use client';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { EditorState, EditorTextOverlay, FilterType } from '@gifstudio-x/shared';

const FFMPEG_CORE_VERSION = '0.12.10';
const BASE_URL = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

export interface FFmpegLoadProgress {
  stage: 'downloading-core' | 'downloading-wasm' | 'initializing' | 'ready';
  percentage?: number;
}

export async function getFFmpeg(
  onProgress?: (progress: FFmpegLoadProgress) => void,
): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();

    onProgress?.({ stage: 'downloading-core' });
    const coreURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, 'text/javascript');

    onProgress?.({ stage: 'downloading-wasm' });
    const wasmURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.wasm`, 'application/wasm');

    onProgress?.({ stage: 'initializing' });
    await ffmpeg.load({ coreURL, wasmURL });

    onProgress?.({ stage: 'ready' });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return loadPromise;
}

// ============================================================================
// Conversion initiale vidéo -> GIF (Étape 3, inchangée)
// ============================================================================

export interface ConvertToGifOptions {
  videoUrl: string;
  startSeconds: number;
  endSeconds: number;
  width: number;
  fps: number;
  onProgress?: (ratio: number) => void;
}

export async function convertVideoToGif(options: ConvertToGifOptions): Promise<Blob> {
  const { videoUrl, startSeconds, endSeconds, width, fps, onProgress } = options;
  const ffmpeg = await getFFmpeg();
  const duration = Math.max(0.1, endSeconds - startSeconds);

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.max(0, Math.min(1, progress)));
  };
  ffmpeg.on('progress', progressHandler);

  try {
    const inputName = 'input.mp4';
    const paletteName = 'palette.png';
    const outputName = 'output.gif';

    await ffmpeg.writeFile(inputName, await fetchFile(videoUrl));

    await ffmpeg.exec([
      '-ss', startSeconds.toFixed(2),
      '-t', duration.toFixed(2),
      '-i', inputName,
      '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos,palettegen=stats_mode=diff`,
      '-y', paletteName,
    ]);

    await ffmpeg.exec([
      '-ss', startSeconds.toFixed(2),
      '-t', duration.toFixed(2),
      '-i', inputName,
      '-i', paletteName,
      '-lavfi', `fps=${fps},scale=${width}:-1:flags=lanczos [v]; [v][1:v] paletteuse=dither=bayer:bayer_scale=5`,
      '-y', outputName,
    ]);

    const data = (await ffmpeg.readFile(outputName)) as Uint8Array;

    try {
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(paletteName);
      await ffmpeg.deleteFile(outputName);
    } catch { /* ignore */ }

    return new Blob([data], { type: 'image/gif' });
  } finally {
    ffmpeg.off('progress', progressHandler);
  }
}

// ============================================================================
// Export final : applique filtres + vitesse + crop au GIF
// (Le texte est appliqué séparément via canvas car FFmpeg gère mal les polices custom)
// ============================================================================

function filterToFFmpegExpr(filter: FilterType): string | null {
  switch (filter) {
    case 'bw':
      return 'hue=s=0';
    case 'sepia':
      return 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131';
    case 'none':
    default:
      return null;
  }
}

export interface ApplyEditsOptions {
  gifBlob: Blob;
  state: EditorState;
  width: number;
  height: number;
  onProgress?: (ratio: number) => void;
}

export async function applyEditsToGif(options: ApplyEditsOptions): Promise<Blob> {
  const { gifBlob, state, width, height, onProgress } = options;
  const ffmpeg = await getFFmpeg();

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.max(0, Math.min(1, progress)));
  };
  ffmpeg.on('progress', progressHandler);

  try {
    const inputName = 'input.gif';
    const outputName = 'output.gif';
    const paletteName = 'palette.png';

    await ffmpeg.writeFile(inputName, await fetchFile(gifBlob));

    // Construction de la chaîne de filtres
    const filters: string[] = [];

    // 1. Crop (avant tout)
    if (state.crop) {
      const cropX = Math.round((state.crop.x / 100) * width);
      const cropY = Math.round((state.crop.y / 100) * height);
      const cropW = Math.max(2, Math.round((state.crop.width / 100) * width));
      const cropH = Math.max(2, Math.round((state.crop.height / 100) * height));
      filters.push(`crop=${cropW}:${cropH}:${cropX}:${cropY}`);
    }

    // 2. Filtre couleur
    const colorFilter = filterToFFmpegExpr(state.filter);
    if (colorFilter) filters.push(colorFilter);

    // 3. Vitesse (setpts inverse du facteur)
    if (state.speed !== 1) {
      const pts = (1 / state.speed).toFixed(3);
      filters.push(`setpts=${pts}*PTS`);
    }

    // Si aucun filtre ET pas de changement, retour direct
    if (filters.length === 0 && state.texts.length === 0) {
      return gifBlob;
    }

    const filterChain = filters.join(',');
    const splitChain = filters.length > 0
      ? `${filterChain},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5`
      : 'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5';

    await ffmpeg.exec([
      '-i', inputName,
      '-lavfi', splitChain,
      '-y', outputName,
    ]);

    const data = (await ffmpeg.readFile(outputName)) as Uint8Array;

    try {
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
      if (await ffmpeg.readFile(paletteName).catch(() => null)) {
        await ffmpeg.deleteFile(paletteName);
      }
    } catch { /* ignore */ }

    return new Blob([data], { type: 'image/gif' });
  } finally {
    ffmpeg.off('progress', progressHandler);
  }
}

// ============================================================================
// Composition texte via Canvas 2D (fusion avec le GIF frame par frame)
// Plus simple : on rend le texte sur un canvas et on stitche avec gif.
// Pour le MVP on utilise une approche côté client : rendu d'une image PNG
// avec les textes, qu'on passe à FFmpeg en overlay.
// ============================================================================

export async function renderTextsToPng(
  texts: EditorTextOverlay[],
  width: number,
  height: number,
): Promise<Blob | null> {
  if (texts.length === 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Fond transparent
  ctx.clearRect(0, 0, width, height);

  for (const t of texts) {
    const fontSize = Math.round((t.fontSizePercent / 100) * width);
    ctx.font = `bold ${fontSize}px "${t.fontFamily}", sans-serif`;
    ctx.fillStyle = t.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const x = (t.xPercent / 100) * width;
    const y = (t.yPercent / 100) * height;

    if (t.hasOutline) {
      ctx.lineWidth = Math.max(2, fontSize * 0.08);
      ctx.strokeStyle = '#000000';
      ctx.strokeText(t.text, x, y);
    }
    ctx.fillText(t.text, x, y);
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

export interface ExportFinalGifOptions {
  gifBlob: Blob;
  state: EditorState;
  sourceWidth: number;
  sourceHeight: number;
  onProgress?: (ratio: number) => void;
}

/**
 * Pipeline d'export complet :
 * 1. Applique crop + filter + speed au GIF source
 * 2. Si des textes existent, overlay PNG transparent par-dessus
 */
export async function exportFinalGif(options: ExportFinalGifOptions): Promise<Blob> {
  const { gifBlob, state, sourceWidth, sourceHeight, onProgress } = options;

  // Étape 1 : crop + filter + speed
  const edited = await applyEditsToGif({
    gifBlob,
    state,
    width: sourceWidth,
    height: sourceHeight,
    onProgress: (r) => onProgress?.(r * 0.6),
  });

  // Étape 2 : texte overlay (si présent)
  if (state.texts.length === 0) {
    onProgress?.(1);
    return edited;
  }

  const ffmpeg = await getFFmpeg();

  // Calculer les nouvelles dimensions après crop
  let outputWidth = sourceWidth;
  let outputHeight = sourceHeight;
  if (state.crop) {
    outputWidth = Math.max(2, Math.round((state.crop.width / 100) * sourceWidth));
    outputHeight = Math.max(2, Math.round((state.crop.height / 100) * sourceHeight));
  }

  const textPng = await renderTextsToPng(state.texts, outputWidth, outputHeight);
  if (!textPng) {
    onProgress?.(1);
    return edited;
  }

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(0.6 + Math.max(0, Math.min(1, progress)) * 0.4);
  };
  ffmpeg.on('progress', progressHandler);

  try {
    await ffmpeg.writeFile('edited.gif', await fetchFile(edited));
    await ffmpeg.writeFile('texts.png', await fetchFile(textPng));

    await ffmpeg.exec([
      '-i', 'edited.gif',
      '-i', 'texts.png',
      '-lavfi',
      '[0:v][1:v]overlay=0:0,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5',
      '-y', 'final.gif',
    ]);

    const data = (await ffmpeg.readFile('final.gif')) as Uint8Array;

    try {
      await ffmpeg.deleteFile('edited.gif');
      await ffmpeg.deleteFile('texts.png');
      await ffmpeg.deleteFile('final.gif');
    } catch { /* ignore */ }

    onProgress?.(1);
    return new Blob([data], { type: 'image/gif' });
  } finally {
    ffmpeg.off('progress', progressHandler);
  }
}
