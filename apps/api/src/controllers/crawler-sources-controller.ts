import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error-handler';
import { getAdapter, listImplementedAdapters } from '../services/crawler/registry';
import { validateCronMinInterval } from '../lib/cron-validator';
import { enqueueCrawlerRun } from '../workers/crawler-queue';

const adapterEnum = z.enum([
  'reddit',
  'redgifs',
  'rule34',
  'e621',
  'generic_html',
]);

const baseSourceSchema = z.object({
  name: z.string().min(1).max(255),
  adapter: adapterEnum,
  config: z.record(z.unknown()).default({}),
  cronExpression: z.string().min(1).max(100),
  enabled: z.boolean().default(true),
  maxResultsPerRun: z.number().int().min(1).max(200).default(20),
});

const updateSourceSchema = baseSourceSchema.partial();

function validateSourceInput(data: {
  adapter: string;
  config: Record<string, unknown>;
  cronExpression: string;
}): void {
  // Cron min 15 min
  const cronCheck = validateCronMinInterval(data.cronExpression);
  if (!cronCheck.valid) {
    throw new AppError(
      400,
      `Cron invalide : ${cronCheck.error}`,
      'INVALID_CRON',
    );
  }

  // Adapter implemente ?
  const implemented = listImplementedAdapters();
  if (!implemented.includes(data.adapter as (typeof implemented)[number])) {
    throw new AppError(
      400,
      `Adaptateur "${data.adapter}" non implemente pour l'instant (prevu etape 10.x)`,
      'ADAPTER_NOT_IMPLEMENTED',
    );
  }

  // Config valide pour cet adapter ?
  try {
    getAdapter(data.adapter as (typeof implemented)[number]).validateConfig(data.config);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Config invalide';
    throw new AppError(400, `Config invalide : ${msg}`, 'INVALID_CONFIG');
  }
}

function serializeSource(s: {
  id: string;
  name: string;
  adapter: string;
  config: unknown;
  cronExpression: string;
  enabled: boolean;
  maxResultsPerRun: number;
  lastRunAt: Date | null;
  lastRunStatus: string | null;
  lastRunMessage: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: s.id,
    name: s.name,
    adapter: s.adapter,
    config: s.config,
    cronExpression: s.cronExpression,
    enabled: s.enabled,
    maxResultsPerRun: s.maxResultsPerRun,
    lastRunAt: s.lastRunAt?.toISOString() ?? null,
    lastRunStatus: s.lastRunStatus,
    lastRunMessage: s.lastRunMessage,
    createdById: s.createdById,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export async function listSources(_req: Request, res: Response, next: NextFunction) {
  try {
    const sources = await prisma.crawlerSource.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      success: true,
      data: { items: sources.map(serializeSource) },
    });
  } catch (err) {
    next(err);
  }
}

export async function getSource(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    const src = await prisma.crawlerSource.findUnique({ where: { id } });
    if (!src) throw new AppError(404, 'Source introuvable', 'NOT_FOUND');
    res.json({ success: true, data: { source: serializeSource(src) } });
  } catch (err) {
    next(err);
  }
}

export async function createSource(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'Non authentifie', 'UNAUTHORIZED');

    const data = baseSourceSchema.parse(req.body);
    validateSourceInput({
      adapter: data.adapter,
      config: data.config,
      cronExpression: data.cronExpression,
    });

    const created = await prisma.crawlerSource.create({
      data: {
        ...data,
        createdById: req.user.userId,
      },
    });
    res.status(201).json({
      success: true,
      data: { source: serializeSource(created) },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateSource(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    const existing = await prisma.crawlerSource.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Source introuvable', 'NOT_FOUND');

    const patch = updateSourceSchema.parse(req.body);

    const mergedAdapter = patch.adapter ?? existing.adapter;
    const mergedConfig = (patch.config ?? existing.config) as Record<string, unknown>;
    const mergedCron = patch.cronExpression ?? existing.cronExpression;

    validateSourceInput({
      adapter: mergedAdapter,
      config: mergedConfig,
      cronExpression: mergedCron,
    });

    const updated = await prisma.crawlerSource.update({
      where: { id },
      data: patch,
    });
    res.json({ success: true, data: { source: serializeSource(updated) } });
  } catch (err) {
    next(err);
  }
}

export async function deleteSource(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    const existing = await prisma.crawlerSource.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Source introuvable', 'NOT_FOUND');

    await prisma.crawlerSource.delete({ where: { id } });
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
}

/**
 * Declenche un run immediat (enqueue dans pg-boss).
 */
export async function triggerSourceRun(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    const existing = await prisma.crawlerSource.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Source introuvable', 'NOT_FOUND');

    const jobId = await enqueueCrawlerRun(id);
    res.json({ success: true, data: { enqueued: true, jobId } });
  } catch (err) {
    next(err);
  }
}

/**
 * Retourne la liste des adaptateurs implementes + ceux prevus.
 */
export async function listAdapters(_req: Request, res: Response, next: NextFunction) {
  try {
    const implemented = listImplementedAdapters();
    const all = ['reddit', 'redgifs', 'rule34', 'e621', 'generic_html'] as const;
    res.json({
      success: true,
      data: {
        adapters: all.map((a) => ({
          name: a,
          implemented: (implemented as readonly string[]).includes(a),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}
