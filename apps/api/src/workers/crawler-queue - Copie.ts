import PgBoss from 'pg-boss';
import { env } from '../config/env';
import { runCrawlerSource } from '../services/crawler/runner';

export const CRAWL_JOB_NAME = 'crawler:run-source';

let boss: PgBoss | null = null;

export async function startCrawlerQueue(): Promise<PgBoss> {
  if (boss) return boss;

  boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    // Retention jobs 7 jours pour debug
    archiveCompletedAfterSeconds: 60 * 60 * 24 * 7,
    deleteAfterDays: 7,
  });

  boss.on('error', (err) => {
    console.error('[crawler-queue] pg-boss error:', err);
  });

  await boss.start();

  // Worker : execute 1 job a la fois pour ne pas surcharger (pas de parallelisme
  // sur le meme crawler, et 1 crawler a la fois au global pour etre polis avec
  // les sites cibles).
  await boss.work<{ sourceId: string }>(
    CRAWL_JOB_NAME,
    { teamSize: 1, teamConcurrency: 1 },
    async (job) => {
      const jobs = Array.isArray(job) ? job : [job];
      for (const j of jobs) {
        const { sourceId } = j.data;
        console.info(`[crawler-queue] running source ${sourceId}`);
        const result = await runCrawlerSource(sourceId);
        if (result.errorMessage) {
          console.warn(
            `[crawler-queue] source ${sourceId} FAILED: ${result.errorMessage}`,
          );
        } else {
          console.info(
            `[crawler-queue] source ${sourceId} OK: ${result.itemsInserted} inserted in ${result.durationMs}ms`,
          );
        }
      }
    },
  );

  console.info('[crawler-queue] worker started (teamSize=1, teamConcurrency=1)');
  return boss;
}

export async function enqueueCrawlerRun(sourceId: string): Promise<string | null> {
  if (!boss) {
    throw new Error('Queue non demarree');
  }
  const jobId = await boss.send(CRAWL_JOB_NAME, { sourceId }, {
    retryLimit: 2,
    retryDelay: 60, // 60s avant retry
  });
  return jobId;
}

export async function stopCrawlerQueue(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: true });
    boss = null;
  }
}

export function getBoss(): PgBoss | null {
  return boss;
}
