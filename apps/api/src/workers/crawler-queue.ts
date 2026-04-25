import PgBoss from 'pg-boss';
import { env } from '../config/env';
import { runCrawlerSource } from '../services/crawler/runner';

export const CRAWL_JOB_NAME = 'crawler-run-source';

let boss: PgBoss | null = null;

export async function startCrawlerQueue(): Promise<PgBoss> {
  if (boss) return boss;

  boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    archiveCompletedAfterSeconds: 60 * 60 * 24 * 7,
    deleteAfterDays: 7,
  });

  boss.on('error', (err) => {
    console.error('[crawler-queue] pg-boss error:', err);
  });

  await boss.start();

  // pg-boss v10 : la queue doit etre creee AVANT de send() ou work()
  await boss.createQueue(CRAWL_JOB_NAME);

  // Worker : signature v10 = handler recoit un ARRAY de jobs
  await boss.work<{ sourceId: string }>(
    CRAWL_JOB_NAME,
    { batchSize: 1 },
    async (jobs) => {
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

  console.info('[crawler-queue] worker started (v10, batchSize=1)');
  return boss;
}

export async function enqueueCrawlerRun(sourceId: string): Promise<string | null> {
  if (!boss) {
    throw new Error('Queue non demarree');
  }
  const jobId = await boss.send(
    CRAWL_JOB_NAME,
    { sourceId },
    {
      retryLimit: 2,
      retryDelay: 60,
    },
  );
  if (!jobId) {
    console.warn('[crawler-queue] send() returned null - job not queued');
  }
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
