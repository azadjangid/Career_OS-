import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { aiRateLimit } from '../../middleware/rateLimiter';
import { learningController as c } from './learning.controller';

const router = Router();
router.use(authenticate);

router.get('/paths', c.paths);
router.get('/gaps', c.gaps);
router.get('/goals', c.list);
router.post('/goals', c.create);
router.post('/roadmap', aiRateLimit, c.roadmap);
router.put('/goals/:id', c.update);
router.post('/goals/:id/steps/:stepId', c.toggleStep);
router.post('/goals/:id/complete', c.completeSkill);
router.delete('/goals/:id', c.remove);

export default router;
