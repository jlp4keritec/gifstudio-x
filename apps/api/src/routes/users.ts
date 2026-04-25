import { Router } from 'express';
import * as usersController from '../controllers/users-controller';
import { requireAuth, requireRole } from '../middlewares/auth';

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/', usersController.listUsers);
router.get('/:id', usersController.getUser);
router.post('/', usersController.createUser);
router.patch('/:id', usersController.updateUser);
router.delete('/:id', usersController.deactivateUser);

export { router as usersRouter };
