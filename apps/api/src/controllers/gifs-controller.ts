import type { Request, Response, NextFunction } from 'express';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error-handler';
import {
  generateFilename,
  getFilePath,
  getPublicUrl,
  moveToTrash,
} from '../services/storage-service';
import { generateSlug } from '../services/slug-service';
import {
  generateThumbnailFromGif,
  getGifDimensions,
} from '../services/thumbnail-service';

function parseJsonArrayField(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string');
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string');
        return [];
      } catch {
        return [];
      }
    }
    return [trimmed];
  }
  return [];
}

function parseBooleanField(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true' || value === '1';
  return false;
}

const saveGifBodySchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  durationMs: z.coerce.number().int().positive(),
  fps: z.coerce.number().int().positive(),
});

function serializeGif(gif: {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  filePath: string;
  thumbnailPath: string;
  width: number;
  height: number;
  durationMs: number;
  fps: number;
  fileSize: bigint;
  views: number;
  isPublic: boolean;
  ownerId: string;
  tags: string[];
  metadata: unknown;
  createdAt: Date;
}) {
  return {
    id: gif.id,
    slug: gif.slug,
    title: gif.title,
    description: gif.description,
    filePath: gif.filePath,
    thumbnailPath: gif.thumbnailPath,
    width: gif.width,
    height: gif.height,
    durationMs: gif.durationMs,
    fps: gif.fps,
    fileSize: Number(gif.fileSize),
    views: gif.views,
    isPublic: gif.isPublic,
    ownerId: gif.ownerId,
    tags: gif.tags,
    metadata: gif.metadata,
    createdAt: gif.createdAt.toISOString(),
  };
}

export async function saveGif(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'Non authentifie', 'UNAUTHORIZED');
    if (!req.file) throw new AppError(400, 'Aucun GIF recu', 'NO_FILE');

    const base = saveGifBodySchema.parse({
      title: req.body.title,
      description: req.body.description || undefined,
      durationMs: req.body.durationMs,
      fps: req.body.fps,
    });

    const collectionIds = parseJsonArrayField(req.body.collectionIds);
    const categoryIds = parseJsonArrayField(req.body.categoryIds);
    const tags = parseJsonArrayField(req.body.tags).slice(0, 20);
    const isPublic = parseBooleanField(req.body.isPublic);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const invalidCollIds = collectionIds.filter((id) => !uuidRegex.test(id));
    if (invalidCollIds.length > 0) {
      throw new AppError(400, 'Identifiants de collection invalides', 'INVALID_COLLECTION_IDS');
    }

    const invalidCatIds = categoryIds.filter((id) => !uuidRegex.test(id));
    if (invalidCatIds.length > 0) {
      throw new AppError(400, 'Identifiants de categorie invalides', 'INVALID_CATEGORY_IDS');
    }

    if (req.file.mimetype !== 'image/gif') {
      throw new AppError(400, 'Le fichier doit etre un GIF', 'INVALID_TYPE');
    }

    if (collectionIds.length > 0) {
      const found = await prisma.collection.findMany({
        where: { id: { in: collectionIds }, ownerId: req.user.userId },
        select: { id: true },
      });
      if (found.length !== collectionIds.length) {
        throw new AppError(400, 'Collections invalides', 'INVALID_COLLECTIONS');
      }
    }

    if (categoryIds.length > 0) {
      const found = await prisma.category.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true },
      });
      if (found.length !== categoryIds.length) {
        throw new AppError(400, 'Categories invalides', 'INVALID_CATEGORIES');
      }
    }

    const gifFilename = generateFilename('.gif');
    const thumbFilename = gifFilename.replace('.gif', '.jpg');
    const gifPath = getFilePath('gifs', gifFilename);
    const thumbPath = getFilePath('thumbnails', thumbFilename);

    await fs.writeFile(gifPath, req.file.buffer);

    const dimensions = await getGifDimensions(req.file.buffer);
    const thumbBuffer = await generateThumbnailFromGif(req.file.buffer);
    await fs.writeFile(thumbPath, thumbBuffer);

    let slug = generateSlug();
    let attempts = 0;
    while (await prisma.gif.findUnique({ where: { slug } })) {
      slug = generateSlug();
      attempts++;
      if (attempts > 5) {
        throw new AppError(500, 'Impossible de generer un slug unique', 'SLUG_COLLISION');
      }
    }

    const gif = await prisma.gif.create({
      data: {
        slug,
        title: base.title,
        description: base.description ?? null,
        filePath: getPublicUrl('gifs', gifFilename),
        thumbnailPath: getPublicUrl('thumbnails', thumbFilename),
        width: dimensions.width,
        height: dimensions.height,
        durationMs: base.durationMs,
        fps: base.fps,
        fileSize: BigInt(req.file.size),
        isPublic,
        ownerId: req.user.userId,
        tags,
      },
    });

    if (collectionIds.length > 0) {
      await prisma.collectionGif.createMany({
        data: collectionIds.map((collectionId) => ({ collectionId, gifId: gif.id })),
      });
    }

    if (categoryIds.length > 0) {
      await prisma.gifCategory.createMany({
        data: categoryIds.map((categoryId) => ({ categoryId, gifId: gif.id })),
      });
    }

    res.status(201).json({ success: true, data: { gif: serializeGif(gif) } });
  } catch (err) {
    next(err);
  }
}

export async function listMyGifs(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'Non authentifie', 'UNAUTHORIZED');
    const gifs = await prisma.gif.findMany({
      where: { ownerId: req.user.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: { gifs: gifs.map(serializeGif) } });
  } catch (err) {
    next(err);
  }
}

export async function getGif(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const gifId = String(req.params.id);
    const gif = await prisma.gif.findUnique({ where: { id: gifId } });
    if (!gif) throw new AppError(404, 'GIF introuvable', 'NOT_FOUND');

    const isOwner = req.user?.userId === gif.ownerId;
    if (!gif.isPublic && !isOwner) {
      throw new AppError(403, 'Acces refuse', 'FORBIDDEN');
    }

    res.json({ success: true, data: { gif: serializeGif(gif) } });
  } catch (err) {
    next(err);
  }
}

export async function deleteGif(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'Non authentifie', 'UNAUTHORIZED');
    const gifId = String(req.params.id);

    const gif = await prisma.gif.findUnique({ where: { id: gifId } });
    if (!gif) throw new AppError(404, 'GIF introuvable', 'NOT_FOUND');

    if (gif.ownerId !== req.user.userId && req.user.role !== 'admin') {
      throw new AppError(403, 'Vous ne pouvez pas supprimer ce GIF', 'FORBIDDEN');
    }

    const gifFilename = gif.filePath.split('/').pop();
    const thumbFilename = gif.thumbnailPath.split('/').pop();
    if (gifFilename) {
      try { await moveToTrash('gifs', gifFilename); } catch { /* ignore */ }
    }
    if (thumbFilename) {
      try { await moveToTrash('thumbnails', thumbFilename); } catch { /* ignore */ }
    }

    await prisma.gif.delete({ where: { id: gif.id } });
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
}
