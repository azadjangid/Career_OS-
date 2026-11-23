import { Router } from 'express';
import { notificationsController } from './notifications.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', notificationsController.list);
router.put('/:id/read', notificationsController.markRead);
router.put('/read-all', notificationsController.markAllRead);
router.delete('/:id', notificationsController.delete_);
router.get('/unread-count', notificationsController.unreadCount);

export default router;
