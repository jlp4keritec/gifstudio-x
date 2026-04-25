import type { Request, Response, NextFunction } from 'express';
import { AppError } from './error-handler';

interface Attempt {
  count: number;
  firstAttemptAt: number;
  blockedUntil?: number;
}

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

const attempts = new Map<string, Attempt>();

setInterval(() => {
  const now = Date.now();
  for (const [key, attempt] of attempts.entries()) {
    if (attempt.firstAttemptAt + WINDOW_MS < now && (attempt.blockedUntil ?? 0) < now) {
      attempts.delete(key);
    }
  }
}, 60 * 1000).unref();

export function loginRateLimiter(req: Request, _res: Response, next: NextFunction): void {
  const key = req.ip ?? 'unknown';
  const now = Date.now();
  const attempt = attempts.get(key);

  if (attempt?.blockedUntil && attempt.blockedUntil > now) {
    const retryAfterSec = Math.ceil((attempt.blockedUntil - now) / 1000);
    return next(
      new AppError(
        429,
        `Trop de tentatives. Réessayez dans ${Math.ceil(retryAfterSec / 60)} minutes.`,
        'RATE_LIMITED',
        { retryAfterSec },
      ),
    );
  }

  if (!attempt || attempt.firstAttemptAt + WINDOW_MS < now) {
    attempts.set(key, { count: 1, firstAttemptAt: now });
    return next();
  }

  attempt.count += 1;
  if (attempt.count > MAX_ATTEMPTS) {
    attempt.blockedUntil = now + WINDOW_MS;
    return next(
      new AppError(
        429,
        'Trop de tentatives de connexion. Réessayez dans 15 minutes.',
        'RATE_LIMITED',
      ),
    );
  }

  next();
}

export function resetLoginAttempts(ip: string): void {
  attempts.delete(ip);
}
