import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error-handler';

const createCollectionSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  isPublic: z.boolean().default(false),
});

const updateCollectionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  isPublic: z.boolean().optional(),
});

function serializeCollection(
  collection: {
    id: string;
    name: string;
    description: string | null;
    isPublic: boolean;
    ownerId: string;
    createdAt: Date;
  },
  gifCount: number,
  previewGifUrl: string | null,
) {
  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    isPublic: collection.isPublic,
    ownerId: collection.ownerId,
    gifCount,
    previewGifUrl,
    createdAt: collection.createdAt.toISOString(),
  };
}

export async function listMyCollections(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'Non authentifie', 'UNAUTHORIZED');

    const collections = await prisma.collection.findMany({
      where: { ownerId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        gifs: {
          take: 1,
          orderBy: { addedAt: 'desc' },
          include: { gif: { select: { thumbnailPath: true } } },
        },
        _count: { select: { gifs: true } },
      },
    });

    const data = collections.map((c) =>
      serializeCollection(
        c,
        c._count.gifs,
        c.gifs[0]?.gif.thumbnailPath ?? null,
      ),
    );

    res.json({ success: true, data: { collections: data } });
  } catch (err) {
    next(err);
  }
}

export async function getCollection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const collectionId = String(req.params.id);

    const collection = await prisma.collection.findUnique({
      where: { id: collectionId },
      include: {
        gifs: {
          orderBy: { addedAt: 'desc' },
          include: { gif: true },
        },
        _count: { select: { gifs: true } },
      },
    });

    if (!collection) throw new AppError(404, 'Collection introuvable', 'NOT_FOUND');

    const isOwner = req.user?.userId === collection.ownerId;
    if (!collection.isPublic && !isOwner) {
      throw new AppError(403, 'Acces refuse', 'FORBIDDEN');
    }

    const gifs = collection.gifs.map((cg) => ({
      id: cg.gif.id,
      slug: cg.gif.slug,
      title: cg.gif.title,
      thumbnailPath: cg.gif.thumbnailPath,
      filePath: cg.gif.filePath,
      width: cg.gif.width,
      height: cg.gif.height,
      views: cg.gif.views,
      isPublic: cg.gif.isPublic,
      addedAt: cg.addedAt.toISOString(),
    }));

    res.json({
      success: true,
      data: {
        collection: serializeCollection(
          collection,
          collection._count.gifs,
          gifs[0]?.thumbnailPath ?? null,
        ),
        gifs,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function createCollection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'Non authentifie', 'UNAUTHORIZED');

    const data = createCollectionSchema.parse(req.body);

    const collection = await prisma.collection.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        isPublic: data.isPublic,
        ownerId: req.user.userId,
      },
    });

    res.status(201).json({
      success: true,
      data: { collection: serializeCollection(collection, 0, null) },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateCollection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'Non authentifie', 'UNAUTHORIZED');
    const data = updateCollectionSchema.parse(req.body);
    const collectionId = String(req.params.id);

    const existing = await prisma.collection.findUnique({ where: { id: collectionId } });
    if (!existing) throw new AppError(404, 'Collection introuvable', 'NOT_FOUND');
    if (existing.ownerId !== req.user.userId) {
      throw new AppError(403, 'Acces refuse', 'FORBIDDEN');
    }

    const updated = await prisma.collection.update({
      where: { id: collectionId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.isPublic !== undefined && { isPublic: data.isPublic }),
      },
      include: {
        gifs: {
          take: 1,
          orderBy: { addedAt: 'desc' },
          include: { gif: { select: { thumbnailPath: true } } },
        },
        _count: { select: { gifs: true } },
      },
    });

    res.json({
      success: true,
      data: {
        collection: serializeCollection(
          updated,
          updated._count.gifs,
          updated.gifs[0]?.gif.thumbnailPath ?? null,
        ),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteCollection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'Non authentifie', 'UNAUTHORIZED');
    const collectionId = String(req.params.id);

    const existing = await prisma.collection.findUnique({ where: { id: collectionId } });
    if (!existing) throw new AppError(404, 'Collection introuvable', 'NOT_FOUND');
    if (existing.ownerId !== req.user.userId) {
      throw new AppError(403, 'Acces refuse', 'FORBIDDEN');
    }

    await prisma.collection.delete({ where: { id: collectionId } });

    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
}

export async function addGifToCollection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'Non authentifie', 'UNAUTHORIZED');
    const collectionId = String(req.params.id);

    const collection = await prisma.collection.findUnique({ where: { id: collectionId } });
    if (!collection || collection.ownerId !== req.user.userId) {
      throw new AppError(404, 'Collection introuvable', 'NOT_FOUND');
    }

    const { gifId } = z.object({ gifId: z.string().uuid() }).parse(req.body);

    const gif = await prisma.gif.findUnique({ where: { id: gifId } });
    if (!gif || gif.ownerId !== req.user.userId) {
      throw new AppError(404, 'GIF introuvable', 'NOT_FOUND');
    }

    await prisma.collectionGif.upsert({
      where: { collectionId_gifId: { collectionId: collection.id, gifId } },
      create: { collectionId: collection.id, gifId },
      update: {},
    });

    res.json({ success: true, data: { added: true } });
  } catch (err) {
    next(err);
  }
}

export async function removeGifFromCollection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'Non authentifie', 'UNAUTHORIZED');

    const collectionId = String(req.params.id);
    const gifId = String(req.params.gifId);

    const collection = await prisma.collection.findUnique({ where: { id: collectionId } });
    if (!collection || collection.ownerId !== req.user.userId) {
      throw new AppError(404, 'Collection introuvable', 'NOT_FOUND');
    }

    await prisma.collectionGif.deleteMany({
      where: { collectionId, gifId },
    });

    res.json({ success: true, data: { removed: true } });
  } catch (err) {
    next(err);
  }
}
