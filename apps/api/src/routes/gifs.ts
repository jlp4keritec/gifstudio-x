import { Router } from 'express';
import * as gifsController from '../controllers/gifs-controller';
import { requireAuth } from '../middlewares/auth';
import { gifUpload } from '../middlewares/gif-upload';

const router = Router();

router.get('/mine', requireAuth, gifsController.listMyGifs);
router.get('/:id', gifsController.getGif); // public (accès géré dans le controller)
router.post('/', requireAuth, gifUpload.single('gif'), gifsController.saveGif);
router.delete('/:id', requireAuth, gifsController.deleteGif);

export { router as gifsRouter };
