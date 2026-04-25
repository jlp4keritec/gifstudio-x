import { Router } from 'express';
import * as uploadController from '../controllers/upload-controller';
import { requireAuth } from '../middlewares/auth';
import { videoUpload } from '../middlewares/upload';

const router = Router();

router.use(requireAuth);

router.post('/video', videoUpload.single('video'), uploadController.uploadVideo);
router.delete('/video/:filename', uploadController.deleteUploadedVideo);

export { router as uploadRouter };
