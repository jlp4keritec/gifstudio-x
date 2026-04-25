import { UPLOAD_CONSTRAINTS } from '@gifstudio-x/shared';

/**
 * Magic bytes (file signatures) pour détecter les vrais types de fichiers vidéo,
 * indépendamment de l'extension ou du MIME annoncé par le client.
 */
interface MagicBytesCheck {
  offset: number;
  bytes: number[];
  mimeType: string;
}

const VIDEO_SIGNATURES: MagicBytesCheck[] = [
  // MP4 / MOV : "ftyp" à l'offset 4
  // 0x66 0x74 0x79 0x70 = "ftyp"
  { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70], mimeType: 'video/mp4' },

  // WebM : 1A 45 DF A3 (EBML header)
  { offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3], mimeType: 'video/webm' },
];

export function detectVideoMimeFromBuffer(buffer: Buffer): string | null {
  for (const sig of VIDEO_SIGNATURES) {
    const slice = buffer.subarray(sig.offset, sig.offset + sig.bytes.length);
    if (slice.length < sig.bytes.length) continue;

    const matches = sig.bytes.every((byte, i) => slice[i] === byte);
    if (matches) return sig.mimeType;
  }
  return null;
}

export function isAcceptedMime(mime: string): boolean {
  return (UPLOAD_CONSTRAINTS.acceptedMimes as readonly string[]).includes(mime);
}

export function getExtensionFromMime(mime: string): string {
  switch (mime) {
    case 'video/mp4':
      return '.mp4';
    case 'video/quicktime':
      return '.mov';
    case 'video/webm':
      return '.webm';
    default:
      return '.bin';
  }
}

export interface VideoValidationResult {
  valid: boolean;
  mimeType?: string;
  error?: string;
}

export function validateVideoBuffer(
  buffer: Buffer,
  declaredMime: string,
  fileSize: number,
): VideoValidationResult {
  const maxBytes = UPLOAD_CONSTRAINTS.maxSizeMb * 1024 * 1024;
  if (fileSize > maxBytes) {
    return {
      valid: false,
      error: `Le fichier dépasse la taille maximum de ${UPLOAD_CONSTRAINTS.maxSizeMb} Mo`,
    };
  }

  if (!isAcceptedMime(declaredMime)) {
    return {
      valid: false,
      error: `Type de fichier non supporté : ${declaredMime}. Acceptés : MP4, MOV, WebM.`,
    };
  }

  const detected = detectVideoMimeFromBuffer(buffer);

  if (!detected) {
    return {
      valid: false,
      error: 'Le fichier ne semble pas être une vidéo valide',
    };
  }

  // Tolérance entre mp4/quicktime (même conteneur ftyp)
  const mimeFamilyMatch =
    detected === declaredMime ||
    (detected === 'video/mp4' && declaredMime === 'video/quicktime') ||
    (detected === 'video/mp4' && declaredMime === 'video/mp4');

  if (!mimeFamilyMatch && declaredMime !== 'video/webm') {
    return {
      valid: false,
      error: 'Le contenu du fichier ne correspond pas à son type déclaré',
    };
  }

  return { valid: true, mimeType: detected };
}
