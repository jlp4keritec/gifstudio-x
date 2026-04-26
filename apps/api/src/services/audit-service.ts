// [Patch H-07] Service d'audit log
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { prisma } from '../lib/prisma';

export type AuditAction =
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.logout'
  | 'auth.password.changed'
  | 'admin.user.created'
  | 'admin.user.updated'
  | 'admin.user.deleted'
  | 'admin.user.password_reset'
  | 'crawler.source.created'
  | 'crawler.source.updated'
  | 'crawler.source.deleted'
  | 'crawler.test.generic_html'
  | 'crawler.test.generic_browser'
  | 'video.share.created'
  | 'video.share.revoked';

export interface AuditEntry {
  userId?: string | null;
  action: AuditAction;
  resource?: string | null;
  ip?: string;
  userAgent?: string;
  payload?: Record<string, unknown>;
}

export function getAuditContext(req: Request): { ip?: string; userAgent?: string } {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return createHash('sha256').update(`gifstudio-x-audit:${ip}`).digest('hex').slice(0, 64);
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        resource: entry.resource ?? null,
        ipHash: hashIp(entry.ip),
        userAgent: entry.userAgent?.slice(0, 500) ?? null,
        payload: (entry.payload ?? {}) as never,
      },
    });
  } catch (err) {
    console.warn('[audit] failed to log entry:', err);
  }
}