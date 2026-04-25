import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { getAdapter } from './registry';
import { env } from '../../config/env';

export interface RunResult {
  sourceId: string;
  itemsFound: number;
  itemsInserted: number;
  itemsSkipped: number;
  durationMs: number;
  errorMessage?: string;
}

const USER_AGENT = `${env.INSTANCE_NAME}/0.1 (private instance crawler)`;

/**
 * Delai apres lequel une URL rejetee peut reapparaitre dans les crawl (jours).
 */
const REJECTION_TTL_DAYS = 7;

/**
 * Execute un crawler source : fetch via adapter + dedup + insertion des resultats.
 * Met a jour lastRunAt/lastRunStatus/lastRunMessage sur la source.
 */
export async function runCrawlerSource(sourceId: string): Promise<RunResult> {
  const startedAt = Date.now();

  const source = await prisma.crawlerSource.findUnique({ where: { id: sourceId } });
  if (!source) {
    return {
      sourceId,
      itemsFound: 0,
      itemsInserted: 0,
      itemsSkipped: 0,
      durationMs: 0,
      errorMessage: 'Source introuvable',
    };
  }

  if (!source.enabled) {
    return {
      sourceId,
      itemsFound: 0,
      itemsInserted: 0,
      itemsSkipped: 0,
      durationMs: Date.now() - startedAt,
      errorMessage: 'Source desactivee',
    };
  }

  // Marquer comme running
  await prisma.crawlerSource.update({
    where: { id: sourceId },
    data: {
      lastRunStatus: 'running',
      lastRunAt: new Date(),
      lastRunMessage: null,
    },
  });

  try {
    const adapter = getAdapter(source.adapter);
    const items = await adapter.fetch({
      maxResults: source.maxResultsPerRun,
      config: (source.config as Record<string, unknown>) ?? {},
      userAgent: USER_AGENT,
    });

    // Dedup : URL deja presentes (sauf rejetees il y a > REJECTION_TTL_DAYS)
    const urls = items.map((i) => i.sourceUrl);
    const rejectionCutoff = new Date(Date.now() - REJECTION_TTL_DAYS * 86400 * 1000);
    const existing = await prisma.crawlerResult.findMany({
      where: {
        sourceUrl: { in: urls },
        OR: [
          { status: { not: 'rejected' } },
          { rejectedAt: { gte: rejectionCutoff } },
        ],
      },
      select: { sourceUrl: true },
    });
    const existingUrls = new Set(existing.map((r) => r.sourceUrl));

    const toInsert = items.filter((i) => !existingUrls.has(i.sourceUrl));

    // Insertion
    const insertData: Prisma.CrawlerResultCreateManyInput[] = toInsert.map((i) => ({
      crawlerSourceId: sourceId,
      sourceUrl: i.sourceUrl,
      thumbnailUrl: i.thumbnailUrl ?? null,
      title: i.title ?? null,
      externalId: i.externalId ?? null,
      metadata: (i.metadata as Prisma.InputJsonValue) ?? {},
      status: 'pending_review',
    }));

    const inserted = insertData.length
      ? await prisma.crawlerResult.createMany({
          data: insertData,
          skipDuplicates: true,
        })
      : { count: 0 };

    const durationMs = Date.now() - startedAt;
    const message = `${inserted.count} nouveau(x) / ${items.length} trouve(s) (${existingUrls.size} deja connus)`;

    await prisma.crawlerSource.update({
      where: { id: sourceId },
      data: {
        lastRunStatus: 'success',
        lastRunMessage: message,
      },
    });

    return {
      sourceId,
      itemsFound: items.length,
      itemsInserted: inserted.count,
      itemsSkipped: items.length - inserted.count,
      durationMs,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startedAt;

    await prisma.crawlerSource.update({
      where: { id: sourceId },
      data: {
        lastRunStatus: 'failed',
        lastRunMessage: errorMessage,
      },
    });

    return {
      sourceId,
      itemsFound: 0,
      itemsInserted: 0,
      itemsSkipped: 0,
      durationMs,
      errorMessage,
    };
  }
}
