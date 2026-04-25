import { randomBytes } from 'node:crypto';

/**
 * Génère un slug court, URL-safe, de 10 caractères.
 * Utilise un alphabet sans caractères ambigus (pas de 0/O/I/l).
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generateSlug(length = 10): string {
  const bytes = randomBytes(length);
  let slug = '';
  for (let i = 0; i < length; i++) {
    slug += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return slug;
}
