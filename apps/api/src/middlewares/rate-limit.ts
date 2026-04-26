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

// ============================================================================
// [Patch HX-06] strictRateLimiter
// 10 req / 5 min par IP. Pour endpoints sensibles : test crawler, source run.
// ============================================================================
const STRICT_WINDOW_MS = 5 * 60 * 1000;
const STRICT_MAX = 10;
const strictAttempts = new Map<string, { count: number; firstAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, a] of strictAttempts.entries()) {
    if (a.firstAt + STRICT_WINDOW_MS < now) strictAttempts.delete(key);
  }
}, 60_000).unref();

export function strictRateLimiter(req: Request, _res: Response, next: NextFunction): void {
  const key = req.ip ?? 'unknown';
  const now = Date.now();
  const a = strictAttempts.get(key);
  if (!a || a.firstAt + STRICT_WINDOW_MS < now) {
    strictAttempts.set(key, { count: 1, firstAt: now });
    return next();
  }
  a.count += 1;
  if (a.count > STRICT_MAX) {
    return next(new AppError(429, 'Trop de requetes. Reessayez dans quelques minutes.', 'RATE_LIMITED_STRICT'));
  }
  next();
}

// ============================================================================
// [Patch HX-07] streamingRateLimiter
// 60 req / 1 min par IP. Pour endpoint public de streaming video (Range
// requests = plusieurs req par lecture).
// ============================================================================
const STREAM_WINDOW_MS = 60 * 1000;
const STREAM_MAX = 60;
const streamAttempts = new Map<string, { count: number; firstAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, a] of streamAttempts.entries()) {
    if (a.firstAt + STREAM_WINDOW_MS < now) streamAttempts.delete(key);
  }
}, 30_000).unref();

export function streamingRateLimiter(req: Request, _res: Response, next: NextFunction): void {
  const key = req.ip ?? 'unknown';
  const now = Date.now();
  const a = streamAttempts.get(key);
  if (!a || a.firstAt + STREAM_WINDOW_MS < now) {
    streamAttempts.set(key, { count: 1, firstAt: now });
    return next();
  }
  a.count += 1;
  if (a.count > STREAM_MAX) {
    return next(new AppError(429, 'Trop de requetes sur ce fichier. Patientez.', 'RATE_LIMITED_STREAM'));
  }
  next();
}
