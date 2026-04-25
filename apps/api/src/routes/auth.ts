import { Router } from 'express';
import * as authController from '../controllers/auth-controller';
import { requireAuth } from '../middlewares/auth';
import { loginRateLimiter } from '../middlewares/rate-limit';

const router = Router();

router.post('/login', loginRateLimiter, authController.login);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);
router.post('/change-password', requireAuth, authController.changePassword);

export { router as authRouter };
