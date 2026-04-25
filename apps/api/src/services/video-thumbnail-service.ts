import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../lib/prisma';
import { extractThumbnail } from '../lib/ffmpeg-thumbnail';
import { env } from '../config/env';

/**
 * Genere la thumbnail d'un VideoAsset et met a jour thumbnailPath en BDD.
 * Non-fatal : si ffmpeg echoue, on loggue et on continue sans thumbnail.
 */
export async function generateAndSaveThumbnail(params: {
  assetId: string;
  videoPath: string;
  durationSec: number | null;
}): Promise<string | null> {
  const { assetId, videoPath, durationSec } = params;

  const thumbsDir = path.resolve(env.STORAGE_ROOT, 'thumbnails');
  if (!fs.existsSync(thumbsDir)) {
    fs.mkdirSync(thumbsDir, { recursive: true });
  }

  const thumbPath = path.resolve(thumbsDir, `${assetId}.jpg`);

  // Choisit un timecode : 1s, ou milieu de la video si plus courte
  const atSec = durationSec && durationSec > 2 ? 1 : (durationSec ?? 1) / 2;

  try {
    await extractThumbnail({
      videoPath,
      outputPath: thumbPath,
      atSec,
      width: 320,
    });

    await prisma.videoAsset.update({
      where: { id: assetId },
      data: { thumbnailPath: thumbPath },
    });

    return thumbPath;
  } catch (err) {
    console.warn(
      `[thumbnail] generation failed for asset ${assetId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
