import type { Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import { z } from 'zod';

import { AppError } from '../middlewares/error-handler';
import {
  getUserSettings,
  updateUserSettings,
  saveWatermarkLogo,
  deleteWatermarkLogo,
  getWatermarkLogoPath,
} from '../services/user-settings-service';
import { WATERMARK_POSITIONS } from '@gifstudio-x/shared';

const watermarkPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    mode: z.enum(['text', 'image', 'text_and_image']).optional(),
    position: z.enum(WATERMARK_POSITIONS as readonly [string, ...string[]]).optional(),
    marginPx: z.number().int().min(0).max(500).optional(),
    text: z
      .object({
        text: z.string().max(200).optional(),
        fontFamily: z.string().max(50).optional(),
        fontSizePercent: z.number().min(1).max(30).optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        opacity: z.number().min(0).max(1).optional(),
        hasShadow: z.boolean().optional(),
      })
      .partial()
      .optional(),
    hasLogo: z.boolean().optional(),
    logoWidthPercent: z.number().min(5).max(50).optional(),
    logoOpacity: z.number().min(0).max(1).optional(),
  })
  .partial();

const updateSchema = z.object({
  watermark: watermarkPatchSchema.optional(),
});

export async function getSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'Non authentifie', 'UNAUTHORIZED');
    const settings = await getUserSettings(req.user.userId);
    res.json({ success: true, data: { settings } });
  } catch (err) {
    next(err);
  }
}

export async function patchSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'Non authentifie', 'UNAUTHORIZED');
    const patch = updateSchema.parse(req.body);
    const settings = await updateUserSettings(req.user.userId, patch as Parameters<typeof updateUserSettings>[1]);
    res.json({ success: true, data: { settings } });
  } catch (err) {
    next(err);
  }
}

export async function uploadWatermarkLogo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'Non authentifie', 'UNAUTHORIZED');
    if (!req.file) throw new AppError(400, 'Aucun fichier recu', 'NO_FILE');

    const accepted = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!accepted.includes(req.file.mimetype)) {
      throw new AppError(400, `Type non supporte : ${req.file.mimetype}. Accepte : PNG, JPG, WEBP.`, 'BAD_MIME');
    }
    if (req.file.size > 2 * 1024 * 1024) {
      throw new AppError(400, 'Fichier trop volumineux (max 2 Mo)', 'TOO_LARGE');
    }

    const result = await saveWatermarkLogo(req.user.userId, req.file.buffer);

    // Activer hasLogo dans les settings
    await updateUserSettings(req.user.userId, {
      watermark: { hasLogo: true } as Parameters<typeof updateUserSettings>[1]['watermark'],
    });

    const settings = await getUserSettings(req.user.userId);
    res.json({
      success: true,
      data: {
        width: result.width,
        height: result.height,
        settings,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteWatermarkLogoCtrl(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'Non authentifie', 'UNAUTHORIZED');
    const deleted = deleteWatermarkLogo(req.user.userId);
    await updateUserSettings(req.user.userId, {
      watermark: { hasLogo: false } as Parameters<typeof updateUserSettings>[1]['watermark'],
    });
    const settings = await getUserSettings(req.user.userId);
    res.json({ success: true, data: { deleted, settings } });
  } catch (err) {
    next(err);
  }
}

export async function getWatermarkLogo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'Non authentifie', 'UNAUTHORIZED');
    const p = getWatermarkLogoPath(req.user.userId);
    if (!p) {
      throw new AppError(404, 'Pas de logo', 'NO_LOGO');
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, no-cache');
    fs.createReadStream(p).pipe(res);
  } catch (err) {
    next(err);
  }
}
