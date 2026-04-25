import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

export async function listCategories(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: { categories } });
  } catch (err) {
    next(err);
  }
}
