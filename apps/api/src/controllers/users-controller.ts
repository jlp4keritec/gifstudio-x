import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { hashPassword, validatePasswordStrength } from '../services/auth-service';
import { AppError } from '../middlewares/error-handler';
import { toPublicUser } from './auth-controller';

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'moderator', 'user']),
  mustChangePassword: z.boolean().default(true),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  role: z.enum(['admin', 'moderator', 'user']).optional(),
  isActive: z.boolean().optional(),
  resetPassword: z.string().min(8).optional(),
});

export async function listUsers(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: { users: users.map(toPublicUser) } });
  } catch (err) {
    next(err);
  }
}

export async function getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = String(req.params.id);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, 'Utilisateur introuvable', 'NOT_FOUND');
    res.json({ success: true, data: { user: toPublicUser(user) } });
  } catch (err) {
    next(err);
  }
}

export async function createUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = createUserSchema.parse(req.body);

    const strengthError = validatePasswordStrength(data.password);
    if (strengthError) {
      throw new AppError(400, strengthError, 'WEAK_PASSWORD');
    }

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new AppError(409, 'Un utilisateur avec cet email existe déjà', 'EMAIL_EXISTS');
    }

    const passwordHash = await hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        role: data.role,
        mustChangePassword: data.mustChangePassword,
      },
    });

    res.status(201).json({ success: true, data: { user: toPublicUser(user) } });
  } catch (err) {
    next(err);
  }
}

export async function updateUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = updateUserSchema.parse(req.body);
    const userId = String(req.params.id);

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new AppError(404, 'Utilisateur introuvable', 'NOT_FOUND');

    if (
      req.user?.userId === userId &&
      existing.role === 'admin' &&
      data.role !== undefined &&
      data.role !== 'admin'
    ) {
      throw new AppError(
        400,
        'Vous ne pouvez pas retirer votre propre role administrateur',
        'SELF_DEMOTION',
      );
    }

    if (req.user?.userId === userId && data.isActive === false) {
      throw new AppError(
        400,
        'Vous ne pouvez pas vous desactiver vous-meme',
        'SELF_DEACTIVATE',
      );
    }

    if (data.email && data.email !== existing.email) {
      const emailTaken = await prisma.user.findUnique({ where: { email: data.email } });
      if (emailTaken) {
        throw new AppError(409, 'Email deja utilise', 'EMAIL_EXISTS');
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.email !== undefined) updateData.email = data.email;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    if (data.resetPassword) {
      const strengthError = validatePasswordStrength(data.resetPassword);
      if (strengthError) {
        throw new AppError(400, strengthError, 'WEAK_PASSWORD');
      }
      updateData.passwordHash = await hashPassword(data.resetPassword);
      updateData.mustChangePassword = true;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    res.json({ success: true, data: { user: toPublicUser(updated) } });
  } catch (err) {
    next(err);
  }
}

export async function deactivateUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = String(req.params.id);

    if (req.user?.userId === userId) {
      throw new AppError(400, 'Vous ne pouvez pas vous desactiver vous-meme', 'SELF_DEACTIVATE');
    }

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new AppError(404, 'Utilisateur introuvable', 'NOT_FOUND');

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    res.json({ success: true, data: { user: toPublicUser(updated) } });
  } catch (err) {
    next(err);
  }
}
