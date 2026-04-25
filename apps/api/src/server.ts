import { createApp } from './app';
import { env } from './config/env';
import { initStorage } from './services/storage-service';
import { checkFfprobeAvailable } from './lib/ffprobe';
import {
  startCrawlerQueue,
  stopCrawlerQueue,
} from './workers/crawler-queue';
import {
  startCrawlerScheduler,
  stopCrawlerScheduler,
} from './workers/crawler-scheduler';

async function main() {
  await initStorage();

  const app = createApp();

  const server = app.listen(env.API_PORT, async () => {
    console.info(`🚀 GifStudio-X API running on http://${env.API_HOST}:${env.API_PORT}`);
    console.info(`📋 Environment: ${env.NODE_ENV}`);

    const ffprobeOk = await checkFfprobeAvailable();
    if (ffprobeOk) {
      console.info('✓ ffprobe disponible');
    } else {
      console.warn('⚠ ffprobe introuvable dans le PATH');
    }

    // Crawler : demarrage queue + scheduler
    try {
      await startCrawlerQueue();
      await startCrawlerScheduler();
      console.info('✓ crawler queue + scheduler demarres');
    } catch (err) {
      console.error('✗ crawler queue/scheduler startup failed:', err);
    }
  });

  const gracefulShutdown = async (signal: string): Promise<void> => {
    console.info(`\n${signal} received, shutting down gracefully...`);
    try {
      stopCrawlerScheduler();
      await stopCrawlerQueue();
    } catch (err) {
      console.error('shutdown error:', err);
    }
    server.close(() => {
      console.info('Server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
