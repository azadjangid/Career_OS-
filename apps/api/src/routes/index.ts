import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import usersRoutes from '../modules/users/users.routes';
import jobsRoutes from '../modules/jobs/jobs.routes';
import applicationsRoutes from '../modules/applications/applications.routes';
import resumesRoutes from '../modules/resumes/resumes.routes';
import aiRoutes from '../modules/ai/ai.routes';
import notificationsRoutes from '../modules/notifications/notifications.routes';
import analyticsRoutes from '../modules/analytics/analytics.routes';
import searchRoutes from '../modules/search/search.routes';
import demoRoutes from '../modules/demo/demo.routes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/jobs', jobsRoutes);
router.use('/applications', applicationsRoutes);
router.use('/resumes', resumesRoutes);
router.use('/ai', aiRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/search', searchRoutes);
router.use('/demo', demoRoutes);

export default router;
