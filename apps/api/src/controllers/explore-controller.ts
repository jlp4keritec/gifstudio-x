import type { Request, Response, NextFunction } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error-handler';

const exploreQuerySchema = z.object({
  sort: z.enum(['trending', 'recent']).default('recent'),
  categorySlug: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
});

function serializePublicGif(gif: {
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
  createdAt: Date;
  owner: { email: string };
  categories: Array<{ category: { id: string; name: string; slug: string } }>;
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
    ownerEmail: gif.owner.email,
    tags: gif.tags,
    categories: gif.categories.map((c) => c.category),
    createdAt: gif.createdAt.toISOString(),
  };
}

/**
 * INSTANCE PRIVEE : explore montre TOUS les GIFs.
 * Le filtre isPublic=true du projet public est retire car ca n'a plus de sens :
 * l'acces est deja restreint par requireAuth en amont (cf routes/public.ts).
 */
export async function explore(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = exploreQuerySchema.parse(req.query);

    const where: Prisma.GifWhereInput = {};

    if (query.categorySlug) {
      where.categories = {
        some: { category: { slug: query.categorySlug } },
      };
    }

    if (query.search && query.search.trim()) {
      const searchTerm = query.search.trim();
      where.OR = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { tags: { has: searchTerm.toLowerCase() } },
      ];
    }

    let orderBy: Prisma.GifOrderByWithRelationInput[];
    if (query.sort === 'trending') {
      orderBy = [{ views: 'desc' }, { createdAt: 'desc' }];
    } else {
      orderBy = [{ createdAt: 'desc' }];
    }

    const [total, gifs] = await Promise.all([
      prisma.gif.count({ where }),
      prisma.gif.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          owner: { select: { email: true } },
          categories: { include: { category: true } },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        gifs: gifs.map(serializePublicGif),
        total,
        page: query.page,
        pageSize: query.pageSize,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getGifBySlug(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const slug = String(req.params.slug);
    const isEmbed = req.query.embed === '1';

    const gif = await prisma.gif.findUnique({
      where: { slug },
      include: {
        owner: { select: { email: true } },
        categories: { include: { category: true } },
      },
    });

    if (!gif) throw new AppError(404, 'GIF introuvable', 'NOT_FOUND');

    // En instance privee, tout utilisateur authentifie peut voir tous les GIFs.
    // (Pas de check isPublic, le requireAuth sur la route suffit.)

    const isOwner = req.user?.userId === gif.ownerId;

    // Increment de vue uniquement sur visite "reelle" hors proprietaire
    if (!isOwner && !isEmbed) {
      await prisma.gif.update({
        where: { id: gif.id },
        data: { views: { increment: 1 } },
      });
      gif.views += 1;
    }

    res.json({ success: true, data: { gif: serializePublicGif(gif) } });
  } catch (err) {
    next(err);
  }
}
