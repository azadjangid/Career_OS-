import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { aiRateLimit } from '../../middleware/rateLimiter';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { aiService, RECRUITER_MESSAGE_KINDS, RecruiterMessageKind } from '../../services/ai.service';
import { resumeText } from '../../lib/match';

/** AI-drafted outreach: LinkedIn notes, cold emails, referral asks, follow-ups and thank-you notes. */
const router = Router();
router.use(authenticate);

const uid = (req: AuthRequest) => req.user!.id;

const draftSchema = z
  .object({
    kind: z.enum(RECRUITER_MESSAGE_KINDS),
    applicationId: z.string().min(1).optional(),
    company: z.string().trim().min(1).max(200).optional(),
    role: z.string().trim().min(1).max(200).optional(),
    recipientName: z.string().trim().max(120).optional(),
    context: z.string().trim().max(2000).optional(),
  })
  .refine(d => d.applicationId || (d.company && d.role), { message: 'Pick an application, or enter a company and role' });

const updateSchema = z.object({
  subject: z.string().max(200).nullable().optional(),
  content: z.string().min(1).max(5000).optional(),
  recipientName: z.string().max(120).nullable().optional(),
  sent: z.boolean().optional(),
});

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const applicationId = typeof req.query['applicationId'] === 'string' ? req.query['applicationId'] : undefined;
    const messages = await prisma.recruiterMessage.findMany({
      where: { userId: uid(req), ...(applicationId ? { applicationId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ success: true, data: messages });
  } catch (e) { next(e); }
});

router.post('/draft', aiRateLimit, validate(draftSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = req.body as z.infer<typeof draftSchema>;
    const userId = uid(req);
    const app = body.applicationId
      ? await prisma.application.findFirst({ where: { id: body.applicationId, userId }, include: { job: true } })
      : null;
    if (body.applicationId && !app) throw new AppError('Application not found', 404);

    const [user, resume] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      prisma.resume.findFirst({
        where: app?.resumeId ? { id: app.resumeId, userId } : { userId },
        orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        select: { parsedData: true },
      }),
    ]);
    const company = app?.job.companyName ?? body.company!;
    const role = app?.job.title ?? body.role!;
    const draft = await aiService.draftRecruiterMessage(
      {
        kind: body.kind as RecruiterMessageKind,
        company,
        role,
        recipientName: body.recipientName,
        context: body.context,
        senderName: user?.name ?? '',
        resumeText: resume ? resumeText(resume) : '',
        jobDescription: app?.job.description ?? '',
      },
      userId,
    );
    const saved = await prisma.recruiterMessage.create({
      data: {
        userId,
        applicationId: app?.id ?? null,
        type: body.kind,
        company,
        role,
        recipientName: body.recipientName || null,
        subject: draft.subject,
        content: draft.content,
        aiGenerated: true,
      },
    });
    res.status(201).json({ success: true, data: saved });
  } catch (e) { next(e); }
});

router.put('/:id', validate(updateSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const msg = await prisma.recruiterMessage.findFirst({ where: { id: req.params['id'], userId: uid(req) } });
    if (!msg) throw new AppError('Message not found', 404);
    const { sent, ...rest } = req.body as z.infer<typeof updateSchema>;
    const updated = await prisma.recruiterMessage.update({
      where: { id: msg.id },
      data: { ...rest, ...(sent === undefined ? {} : { sentAt: sent ? msg.sentAt ?? new Date() : null }) },
    });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.recruiterMessage.deleteMany({ where: { id: req.params['id'], userId: uid(req) } });
    res.json({ success: true, data: { deleted: true } });
  } catch (e) { next(e); }
});

export default router;
