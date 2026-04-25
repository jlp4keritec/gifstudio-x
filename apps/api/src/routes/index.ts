import { Router } from 'express';
import { authRouter } from './auth';
import { usersRouter } from './users';
import { uploadRouter } from './upload';
import { gifsRouter } from './gifs';
import { collectionsRouter } from './collections';
import { publicRouter } from './public';
import { videosRouter } from './videos';
import { crawlerRouter } from './crawler';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'gifstudio-x-api',
    },
  });
});

router.use('/', publicRouter);
router.use('/auth', authRouter);
router.use('/admin/users', usersRouter);
router.use('/admin/crawler', crawlerRouter);
router.use('/upload', uploadRouter);
router.use('/gifs', gifsRouter);
router.use('/collections', collectionsRouter);
router.use('/videos', videosRouter);

export { router as apiRouter };
