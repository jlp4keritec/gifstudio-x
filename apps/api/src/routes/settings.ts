import { Router } from 'express';
import multer from 'multer';
import * as ctl from '../controllers/user-settings-controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();

// Upload du logo : memoire (2 Mo max), traitement par sharp ensuite
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

router.use(requireAuth);

router.get('/', ctl.getSettings);
router.patch('/', ctl.patchSettings);

router.get('/watermark/logo', ctl.getWatermarkLogo);
router.post('/watermark/logo', logoUpload.single('file'), ctl.uploadWatermarkLogo);
router.delete('/watermark/logo', ctl.deleteWatermarkLogoCtrl);

export { router as settingsRouter };
