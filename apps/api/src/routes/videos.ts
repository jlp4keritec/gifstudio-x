import { Router } from 'express';
import * as videosController from '../controllers/videos-controller';
import { requireAuth } from '../middlewares/auth';
import { videoAssetUpload } from '../middlewares/video-asset-upload';
import { streamingRateLimiter } from '../middlewares/rate-limit';

const router = Router();

// Endpoint PUBLIC (sans auth) : streaming du fichier video par slug.
router.get('/file/:slug', streamingRateLimiter, videosController.getVideoFileBySlug);

// Toutes les autres routes : auth requise
router.get('/', requireAuth, videosController.listVideos);
router.post('/import-url', requireAuth, videosController.importFromUrl);
router.post(
  '/upload',
  requireAuth,
  videoAssetUpload.single('file'),
  videosController.uploadFile,
);
router.post(
  '/regenerate-all-thumbnails',
  requireAuth,
  videosController.regenerateAllThumbnails,
);
// Bulk delete : route specifique (POST avec body) avant /:id
router.post('/bulk-delete', requireAuth, videosController.bulkDeleteVideos);

router.get('/:id', requireAuth, videosController.getVideo);
router.get('/:id/thumbnail', requireAuth, videosController.getThumbnail);
router.post(
  '/:id/regenerate-thumbnail',
  requireAuth,
  videosController.regenerateThumbnail,
);
router.post('/:id/share', requireAuth, videosController.createShareSlug);
router.delete('/:id/share', requireAuth, videosController.revokeShareSlugCtrl);
router.delete('/:id', requireAuth, videosController.deleteVideo);

export { router as videosRouter };
