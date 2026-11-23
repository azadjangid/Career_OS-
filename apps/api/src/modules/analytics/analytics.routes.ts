import { Router } from 'express';
import { analyticsController } from './analytics.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/dashboard', analyticsController.getDashboard);
router.get('/overview', analyticsController.getOverview);
router.get('/applications', analyticsController.getApplicationStats);
router.get('/jobs', analyticsController.getJobStats);
router.get('/ai-usage', analyticsController.getAIUsage);

export default router;
