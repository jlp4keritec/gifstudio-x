import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { env } from './config/env';
import { apiRouter } from './routes/index';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';
import { optionalAuth } from './middlewares/optional-auth';

export function createApp(): express.Application {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );

  if (env.NODE_ENV !== 'test') {
    app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use(
    '/storage',
    express.static(path.resolve(env.STORAGE_ROOT), {
      maxAge: '7d',
      immutable: false,
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=604800');
      },
    }),
  );

  // Hydrate req.user si présent, mais ne bloque pas
  app.use('/api/v1', optionalAuth);
  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
