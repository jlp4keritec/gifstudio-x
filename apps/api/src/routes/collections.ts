import { Router } from 'express';
import * as collectionsController from '../controllers/collections-controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();

router.get('/', requireAuth, collectionsController.listMyCollections);
router.get('/:id', collectionsController.getCollection); // accès géré dans controller
router.post('/', requireAuth, collectionsController.createCollection);
router.patch('/:id', requireAuth, collectionsController.updateCollection);
router.delete('/:id', requireAuth, collectionsController.deleteCollection);

router.post('/:id/gifs', requireAuth, collectionsController.addGifToCollection);
router.delete('/:id/gifs/:gifId', requireAuth, collectionsController.removeGifFromCollection);

export { router as collectionsRouter };
