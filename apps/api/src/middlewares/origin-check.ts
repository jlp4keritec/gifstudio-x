// [Patch H-08] Origin check (mitigation CSRF en complement de SameSite=strict)
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AppError } from './error-handler';

const ALLOWED_ORIGINS = env.CORS_ORIGIN.split(',').map((s) => s.trim());

const STATE_CHANGING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

export function originCheck(req: Request, _res: Response, next: NextFunction): void {
  if (!STATE_CHANGING_METHODS.includes(req.method)) {
    return next();
  }

  // En dev, on tolere les requetes sans Origin (curl, scripts)
  if (env.NODE_ENV !== 'production') {
    return next();
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;

  let source: string | undefined;
  if (origin) {
    source = origin;
  } else if (referer) {
    try {
      source = new URL(referer).origin;
    } catch {
      source = undefined;
    }
  }

  if (!source) {
    return next(new AppError(403, 'Origin manquant', 'CSRF_BLOCKED'));
  }

  if (!ALLOWED_ORIGINS.includes(source)) {
    return next(new AppError(403, `Origin non autorise : ${source}`, 'CSRF_BLOCKED'));
  }

  next();
}