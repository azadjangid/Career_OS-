import { Router } from 'express';
import { prisma } from '../config/database';
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
import interviewsRoutes from '../modules/interviews/interviews.routes';
import messagesRoutes from '../modules/messages/messages.routes';
import prepRoutes from '../modules/prep/prep.routes';
import learningRoutes from '../modules/learning/learning.routes';

const router = Router();

// Liveness: the process is up. Use for container restarts.
router.get('/health/live', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

// Readiness: the API can serve requests (database reachable). Use for load balancers and uptime checks.
router.get('/health', async (_req, res) => {
  const started = Date.now();
  const db = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
  res.status(db ? 200 : 503).json({
    success: db,
    data: {
      status: db ? 'ok' : 'degraded',
      checks: { database: db ? 'ok' : 'down' },
      version: process.env['APP_VERSION'] ?? 'dev',
      uptimeSeconds: Math.round(process.uptime()),
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    },
  });
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
router.use('/interviews', interviewsRoutes);
router.use('/recruiter-messages', messagesRoutes);
router.use('/prep', prepRoutes);
router.use('/learning', learningRoutes);

export default router;
