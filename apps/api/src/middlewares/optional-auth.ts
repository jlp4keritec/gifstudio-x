import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/auth-service';
import { prisma } from '../lib/prisma';

const AUTH_COOKIE_NAME = 'gifstudio_x_token';

/**
 * Middleware qui tente d'authentifier mais n'échoue pas si absent.
 * Utile pour les routes publiques qui ont un comportement adapté selon connecté ou non.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token =
      req.cookies?.[AUTH_COOKIE_NAME] ??
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null);

    if (!token) return next();

    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, isActive: true, role: true },
    });

    if (user && user.isActive) {
      req.user = payload;
    }
    next();
  } catch {
    // Token invalide -> on continue sans user
    next();
  }
}
