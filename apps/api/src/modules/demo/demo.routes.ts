import { Router, Response, NextFunction } from 'express';
import { hasDemoData, loadDemoData } from '../../lib/demoData';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';

const router = Router();
router.use(authenticate);

router.post('/load', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    if (await hasDemoData(prisma, userId)) throw new AppError('Demo data is already loaded. Remove it first to reload.', 409);
    const data = await loadDemoData(prisma, userId);
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
});
/** Removes only what the demo loader created (jobs flagged isDemo, their applications, demo AI usage). */
router.delete('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const demoJobs = await prisma.job.findMany({ where: { userId, isDemo: true }, select: { id: true } });
    const ids = demoJobs.map(j => j.id);
    await prisma.$transaction([
      prisma.interview.deleteMany({ where: { userId, jobId: { in: ids } } }),
      prisma.application.deleteMany({ where: { userId, jobId: { in: ids } } }),
      prisma.job.deleteMany({ where: { userId, id: { in: ids } } }),
      prisma.aIUsage.deleteMany({ where: { userId, model: 'demo' } }),
    ]);
    res.json({ success: true, data: { removedJobs: ids.length } });
  } catch (e) { next(e); }
});

export default router;
