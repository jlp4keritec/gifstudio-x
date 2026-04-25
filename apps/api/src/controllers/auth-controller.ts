import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import {
  hashPassword,
  verifyPassword,
  signToken,
  validatePasswordStrength,
} from '../services/auth-service';
import { AUTH_COOKIE_NAME } from '../middlewares/auth';
import { resetLoginAttempts } from '../middlewares/rate-limit';
import { AppError } from '../middlewares/error-handler';
import { env } from '../config/env';

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
}

function toPublicUser(user: {
  id: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    mustChangePassword: env.FORCE_PASSWORD_CHANGE ? user.mustChangePassword : false,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/**
 * Recherche un utilisateur par identifier :
 * - Si l'identifier contient @ : recherche exacte par email
 * - Sinon : recherche par préfixe (ex: "admin" trouve "admin@gifstudio.local")
 */
async function findUserByIdentifier(identifier: string) {
  const trimmed = identifier.trim().toLowerCase();

  if (trimmed.includes('@')) {
    return prisma.user.findUnique({ where: { email: trimmed } });
  }

  return prisma.user.findFirst({
    where: {
      email: { startsWith: `${trimmed}@`, mode: 'insensitive' },
    },
  });
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { identifier, password } = loginSchema.parse(req.body);

    const user = await findUserByIdentifier(identifier);

    if (!user || !user.isActive) {
      throw new AppError(401, 'Identifiant ou mot de passe incorrect', 'INVALID_CREDENTIALS');
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, 'Identifiant ou mot de passe incorrect', 'INVALID_CREDENTIALS');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    setAuthCookie(res, token);

    if (req.ip) resetLoginAttempts(req.ip);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    res.json({ success: true, data: { user: toPublicUser(refreshed) } });
  } catch (err) {
    next(err);
  }
}

export function logout(_req: Request, res: Response): void {
  clearAuthCookie(res);
  res.json({ success: true, data: { message: 'Déconnecté' } });
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'Non authentifié', 'UNAUTHORIZED');

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) throw new AppError(404, 'Utilisateur introuvable', 'NOT_FOUND');

    res.json({ success: true, data: { user: toPublicUser(user) } });
  } catch (err) {
    next(err);
  }
}

export async function changePassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'Non authentifié', 'UNAUTHORIZED');

    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) {
      throw new AppError(400, strengthError, 'WEAK_PASSWORD');
    }

    if (currentPassword === newPassword) {
      throw new AppError(
        400,
        'Le nouveau mot de passe doit être différent de l\'ancien',
        'SAME_PASSWORD',
      );
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.userId } });

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      throw new AppError(400, 'Mot de passe actuel incorrect', 'INVALID_CURRENT_PASSWORD');
    }

    const newHash = await hashPassword(newPassword);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash, mustChangePassword: false },
    });

    res.json({ success: true, data: { user: toPublicUser(updated) } });
  } catch (err) {
    next(err);
  }
}

export { toPublicUser };
