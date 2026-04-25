import type { Request, Response, NextFunction } from 'express';
import type { UserRole } from '@prisma/client';
import { verifyToken, type JwtPayload } from '../services/auth-service';
import { AppError } from './error-handler';
import { prisma } from '../lib/prisma';

const AUTH_COOKIE_NAME = 'gifstudio_x_token';

function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  if (cookieToken && typeof cookieToken === 'string') return cookieToken;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractToken(req);
    if (!token) {
      throw new AppError(401, 'Authentification requise', 'UNAUTHORIZED');
    }

    const payload = verifyToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, isActive: true, role: true },
    });

    if (!user || !user.isActive) {
      throw new AppError(401, 'Compte inactif ou introuvable', 'UNAUTHORIZED');
    }

    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
    } else {
      next(new AppError(401, 'Token invalide ou expire', 'INVALID_TOKEN'));
    }
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError(401, 'Authentification requise', 'UNAUTHORIZED'));
    }
    if (!allowedRoles.includes(req.user.role as UserRole)) {
      return next(new AppError(403, 'Permissions insuffisantes', 'FORBIDDEN'));
    }
    next();
  };
}

export { AUTH_COOKIE_NAME };
