import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { aiRateLimit } from '../../middleware/rateLimiter';
import { prepController as c } from './prep.controller';

const router = Router();
router.use(authenticate);

router.get('/topics', c.topics);
router.get('/sessions', c.list);
router.post('/sessions', c.create);
router.get('/sessions/:id', c.get);
router.post('/sessions/:id/questions/:questionId/answer', aiRateLimit, c.answer);
router.post('/sessions/:id/questions/:questionId/self-rate', c.selfRate);
router.post('/sessions/:id/complete', c.complete);
router.delete('/sessions/:id', c.remove);

export default router;
