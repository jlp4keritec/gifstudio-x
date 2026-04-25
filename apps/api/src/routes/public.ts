import { Router } from 'express';
import * as exploreController from '../controllers/explore-controller';
import * as categoriesController from '../controllers/categories-controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();

// INSTANCE PRIVEE : toutes les routes "explore" exigent une auth.
// Plus de decouverte publique anonyme (plus de SEO, plus d'embed public).
router.get('/categories', requireAuth, categoriesController.listCategories);
router.get('/explore', requireAuth, exploreController.explore);
router.get('/g/:slug', requireAuth, exploreController.getGifBySlug);

export { router as publicRouter };
