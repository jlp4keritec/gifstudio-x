import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { prisma } from '../lib/prisma';
import {
  DEFAULT_USER_SETTINGS,
  DEFAULT_WATERMARK_CONFIG,
  type UserSettings,
  type WatermarkConfig,
} from '@gifstudio-x/shared';
import { env } from '../config/env';

const STORAGE_BASE = path.resolve(env.STORAGE_ROOT);
const WATERMARK_DIR = path.join(STORAGE_BASE, 'watermarks');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function logoPath(userId: string): string {
  return path.join(WATERMARK_DIR, `${userId}.png`);
}

/**
 * Merge : data BDD + defaut. Si une cle manque, on retombe sur le defaut.
 */
function mergeWithDefaults(raw: unknown): UserSettings {
  const base = { ...DEFAULT_USER_SETTINGS };
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (obj.watermark && typeof obj.watermark === 'object') {
      base.watermark = {
        ...DEFAULT_WATERMARK_CONFIG,
        ...(obj.watermark as Partial<WatermarkConfig>),
        text: {
          ...DEFAULT_WATERMARK_CONFIG.text,
          ...((obj.watermark as { text?: object }).text ?? {}),
        },
      };
    }
  }
  return base;
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const row = await prisma.userSettings.findUnique({ where: { userId } });
  const merged = mergeWithDefaults(row?.data);

  // Override hasLogo selon presence reelle du fichier
  merged.watermark.hasLogo = fs.existsSync(logoPath(userId));
  return merged;
}

export async function updateUserSettings(
  userId: string,
  partial: Partial<UserSettings>,
): Promise<UserSettings> {
  const current = await getUserSettings(userId);
  const merged: UserSettings = {
    watermark: {
      ...current.watermark,
      ...(partial.watermark ?? {}),
      text: {
        ...current.watermark.text,
        ...(partial.watermark?.text ?? {}),
      },
    },
  };

  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, data: merged as unknown as object },
    update: { data: merged as unknown as object },
  });

  return getUserSettings(userId);
}

/**
 * Sauvegarde le logo (PNG ou JPG/JPEG converti en PNG).
 * Limite : 2 Mo, max 1024x1024 (resize).
 */
export async function saveWatermarkLogo(
  userId: string,
  inputBuffer: Buffer,
): Promise<{ path: string; width: number; height: number }> {
  ensureDir(WATERMARK_DIR);

  const meta = await sharp(inputBuffer).metadata();
  if (!meta.width || !meta.height) {
    throw new Error('Image invalide (dimensions inconnues)');
  }

  let pipeline = sharp(inputBuffer);
  if (meta.width > 1024 || meta.height > 1024) {
    pipeline = pipeline.resize({
      width: 1024,
      height: 1024,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  const out = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(logoPath(userId), out);

  const finalMeta = await sharp(out).metadata();
  return {
    path: logoPath(userId),
    width: finalMeta.width ?? meta.width,
    height: finalMeta.height ?? meta.height,
  };
}

export function deleteWatermarkLogo(userId: string): boolean {
  const p = logoPath(userId);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    return true;
  }
  return false;
}

export function getWatermarkLogoPath(userId: string): string | null {
  const p = logoPath(userId);
  return fs.existsSync(p) ? p : null;
}
