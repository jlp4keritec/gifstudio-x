import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { enqueueCrawlerRun } from './crawler-queue';

/**
 * Scheduler : gere dynamiquement les crons de chaque CrawlerSource enabled.
 * - Reload periodique (toutes les 1min) pour prendre en compte les modifs d'admin
 * - Chaque source enabled a sa propre ScheduledTask
 * - Au declenchement d'un cron -> enqueue un job dans pg-boss
 */

interface ScheduledEntry {
  task: cron.ScheduledTask;
  cronExpression: string;
  updatedAt: Date;
}

const scheduled = new Map<string, ScheduledEntry>();
let reloadTask: cron.ScheduledTask | null = null;

async function reloadSchedules(): Promise<void> {
  const sources = await prisma.crawlerSource.findMany({
    where: { enabled: true },
    select: { id: true, cronExpression: true, updatedAt: true },
  });

  const currentIds = new Set(sources.map((s) => s.id));

  // Retirer les schedules dont la source n'est plus enabled
  for (const [id, entry] of scheduled.entries()) {
    if (!currentIds.has(id)) {
      entry.task.stop();
      scheduled.delete(id);
      console.info(`[crawler-scheduler] stopped task for source ${id}`);
    }
  }

  // Ajouter / mettre a jour
  for (const s of sources) {
    if (!cron.validate(s.cronExpression)) {
      console.warn(
        `[crawler-scheduler] invalid cron "${s.cronExpression}" on source ${s.id} - skipped`,
      );
      continue;
    }

    const existing = scheduled.get(s.id);
    if (existing) {
      const sameCron = existing.cronExpression === s.cronExpression;
      const sameUpdate = existing.updatedAt.getTime() === s.updatedAt.getTime();
      if (sameCron && sameUpdate) continue; // pas de changement
      existing.task.stop();
      scheduled.delete(s.id);
    }

    const task = cron.schedule(
      s.cronExpression,
      async () => {
        try {
          await enqueueCrawlerRun(s.id);
        } catch (err) {
          console.error(`[crawler-scheduler] enqueue failed for ${s.id}:`, err);
        }
      },
      { timezone: 'Europe/Paris' },
    );

    scheduled.set(s.id, {
      task,
      cronExpression: s.cronExpression,
      updatedAt: s.updatedAt,
    });
    console.info(
      `[crawler-scheduler] scheduled source ${s.id} with cron "${s.cronExpression}"`,
    );
  }
}

export async function startCrawlerScheduler(): Promise<void> {
  console.info('[crawler-scheduler] starting...');
  await reloadSchedules();

  // Recharge toutes les 1 min
  reloadTask = cron.schedule('* * * * *', () => {
    void reloadSchedules().catch((err) => {
      console.error('[crawler-scheduler] reload failed:', err);
    });
  });

  console.info('[crawler-scheduler] running');
}

export function stopCrawlerScheduler(): void {
  if (reloadTask) {
    reloadTask.stop();
    reloadTask = null;
  }
  for (const entry of scheduled.values()) {
    entry.task.stop();
  }
  scheduled.clear();
}

export function getScheduledSources(): string[] {
  return Array.from(scheduled.keys());
}
