/**
 * Pipeline post-export : prend un GIF deja genere, lui applique le watermark
 * via FFmpeg WASM, retourne un nouveau Blob GIF.
 *
 * Si pas de watermark actif ou config invalide -> retourne le blob d'entree inchange.
 */

import type { WatermarkConfig } from '@gifstudio-x/shared';
import {
  buildWatermarkOverlay,
  ffmpegApplyWatermarkOverlay,
} from './watermark-applier';
import { getFFmpeg } from './ffmpeg-service';

export interface ApplyWatermarkParams {
  gifBlob: Blob;
  config: WatermarkConfig;
  /** URL du logo (settingsService.logoUrl(...)) si watermark image */
  logoUrl: string | null;
  /** Dimensions natives du GIF (recuperees via Image.naturalWidth/Height) */
  gifWidth: number;
  gifHeight: number;
  fps: number;
  onProgress?: (ratio: number) => void;
}

export async function applyWatermarkToGif(params: ApplyWatermarkParams): Promise<Blob> {
  const { gifBlob, config, logoUrl, gifWidth, gifHeight, fps, onProgress } = params;

  if (!config.enabled) return gifBlob;

  // 1. Construire l'overlay PNG (texte + logo) cote canvas
  const overlayBlob = await buildWatermarkOverlay(config, gifWidth, gifHeight, logoUrl);
  if (!overlayBlob) {
    // Rien a appliquer
    return gifBlob;
  }

  // 2. Charger FFmpeg
  const ffmpeg = await getFFmpeg();

  if (onProgress) {
    ffmpeg.on('progress', (e) => {
      if (typeof e.progress === 'number') onProgress(e.progress);
    });
  }

  // 3. Ecrire les fichiers
  const inputName = `wm_input_${Date.now()}.gif`;
  const overlayName = `wm_overlay_${Date.now()}.png`;
  const outputName = `wm_output_${Date.now()}.gif`;

  const inputBytes = new Uint8Array(await gifBlob.arrayBuffer());
  const overlayBytes = new Uint8Array(await overlayBlob.arrayBuffer());

  await ffmpeg.writeFile(inputName, inputBytes);
  await ffmpeg.writeFile(overlayName, overlayBytes);

  try {
    await ffmpegApplyWatermarkOverlay(ffmpeg, inputName, overlayName, outputName, fps);

    const data = await ffmpeg.readFile(outputName);
    const out = new Blob(
      [typeof data === 'string' ? new TextEncoder().encode(data) : data],
      { type: 'image/gif' },
    );
    return out;
  } finally {
    // Cleanup
    try { await ffmpeg.deleteFile(inputName); } catch {/* ignore */}
    try { await ffmpeg.deleteFile(overlayName); } catch {/* ignore */}
    try { await ffmpeg.deleteFile(outputName); } catch {/* ignore */}
  }
}
