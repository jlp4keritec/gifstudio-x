import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Extrait une frame JPG d'une video a un timecode donne (defaut : 1s).
 * Necessite ffmpeg dans le PATH.
 *
 * @param videoPath Chemin absolu vers la video source
 * @param outputPath Chemin absolu vers le JPG a ecrire
 * @param atSec Timecode en secondes (defaut 1)
 * @param width Largeur cible en pixels (defaut 320, hauteur auto pour ratio)
 */
export function extractThumbnail(params: {
  videoPath: string;
  outputPath: string;
  atSec?: number;
  width?: number;
}): Promise<void> {
  const { videoPath, outputPath, atSec = 1, width = 320 } = params;

  // S'assurer que le dossier de sortie existe
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const args = [
      '-y', // overwrite
      '-ss', String(atSec), // seek avant -i = rapide
      '-i', videoPath,
      '-frames:v', '1',
      '-vf', `scale=${width}:-2`,
      '-q:v', '4', // qualite JPG (2-31, plus bas = mieux)
      outputPath,
    ];

    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
    });
  });
}

export function checkFfmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-version']);
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}
