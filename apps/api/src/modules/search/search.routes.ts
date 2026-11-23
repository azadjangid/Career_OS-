import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { prisma } from '../../config/database';

const router = Router();
router.use(authenticate);

/** Global search for the command palette: jobs, applications and resumes. */
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const q = String(req.query['q'] ?? '').trim().slice(0, 100);
    if (!q) {
      res.json({ success: true, data: { jobs: [], applications: [], resumes: [] } });
      return;
    }
    const like = { contains: q, mode: 'insensitive' as const };

    const [jobs, applications, resumes] = await Promise.all([
      prisma.job.findMany({
        where: { userId, OR: [{ title: like }, { companyName: like }] },
        select: { id: true, title: true, companyName: true }, take: 6, orderBy: { postedAt: 'desc' },
      }),
      prisma.application.findMany({
        where: { userId, OR: [{ job: { title: like } }, { job: { companyName: like } }] },
        select: { id: true, status: true, job: { select: { title: true, companyName: true } } }, take: 6, orderBy: { updatedAt: 'desc' },
      }),
      prisma.resume.findMany({ where: { userId, name: like }, select: { id: true, name: true }, take: 4 }),
    ]);
    res.json({ success: true, data: { jobs, applications, resumes } });
  } catch (e) { next(e); }
});

export default router;
