import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth';
import { strictRateLimiter } from '../middlewares/rate-limit';
import * as sourcesCtl from '../controllers/crawler-sources-controller';
import * as resultsCtl from '../controllers/crawler-results-controller';

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/adapters', sourcesCtl.listAdapters);

router.get('/sources', sourcesCtl.listSources);
router.post('/sources', sourcesCtl.createSource);
router.get('/sources/:id', sourcesCtl.getSource);
router.patch('/sources/:id', sourcesCtl.updateSource);
router.delete('/sources/:id', sourcesCtl.deleteSource);
router.post('/sources/:id/run', strictRateLimiter, sourcesCtl.triggerSourceRun);

// Tests a blanc (sans inserer en BDD)
router.post('/test-generic-html', strictRateLimiter, sourcesCtl.testGenericHtml);
router.post('/test-generic-browser', strictRateLimiter, sourcesCtl.testGenericBrowser);

router.get('/results', resultsCtl.listResults);
router.post('/results/bulk', resultsCtl.bulkAction);

router.get('/results/:id/thumbnail', resultsCtl.getResultThumbnail);
router.post('/results/:id/approve', resultsCtl.approveAndImport);
router.post('/results/:id/reject', resultsCtl.rejectResult);
router.post('/results/:id/reopen', resultsCtl.reopenResult);
router.delete('/results/:id', resultsCtl.deleteResult);

export { router as crawlerRouter };
