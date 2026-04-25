import sharp from 'sharp';

/**
 * Extrait la première frame d'un GIF et la convertit en JPG.
 * sharp sait lire les GIFs animés et prend la frame 0 par défaut.
 */
export async function generateThumbnailFromGif(gifBuffer: Buffer): Promise<Buffer> {
  return sharp(gifBuffer, { animated: false })
    .jpeg({ quality: 85, progressive: true })
    .toBuffer();
}

/**
 * Récupère les dimensions natives d'un GIF depuis son buffer.
 */
export async function getGifDimensions(
  gifBuffer: Buffer,
): Promise<{ width: number; height: number }> {
  const metadata = await sharp(gifBuffer, { animated: false }).metadata();
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
  };
}
