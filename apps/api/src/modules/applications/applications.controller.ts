import { Response, NextFunction } from 'express';
import { Prisma, ApplicationStatus } from '@prisma/client';
import { AuthRequest } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';

const uid = (req: AuthRequest) => req.user!.id;
const param = (req: AuthRequest, k: string) => req.params[k] as string;

/** Writes a history row and applies any status side effects. */
function statusData(prev: ApplicationStatus | null, next: ApplicationStatus) {
  return {
    ...(next === 'APPLIED' ? { appliedAt: new Date() } : {}),
    statusHistory: { create: { fromStatus: prev, toStatus: next } },
  };
}

async function snapshot(jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { description: true } });
  return job?.description ? { jobDescriptionSnapshot: job.description.slice(0, 20_000) } : {};
}

const listInclude = (userId: string) =>
  ({
    job: {
      include: {
        company: { select: { logo: true, size: true } },
        matches: { where: { userId }, select: { overallScore: true, matchedSkills: true, missingSkills: true } },
      },
    },
    resume: { select: { id: true, name: true } },
    interviews: { select: { id: true, type: true, scheduledAt: true, status: true }, orderBy: { scheduledAt: 'asc' as const } },
  }) satisfies Prisma.ApplicationInclude;

export const applicationsController = {
  async listApplications(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { status, q, page = '1', limit = '200' } = req.query as Record<string, string>;
      const take = Math.min(parseInt(limit) || 200, 500);
      const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take;
      const where: Prisma.ApplicationWhereInput = {
        userId: uid(req),
        ...(status ? { status: status as ApplicationStatus } : {}),
        ...(q
          ? { OR: [{ job: { title: { contains: q, mode: 'insensitive' } } }, { job: { companyName: { contains: q, mode: 'insensitive' } } }] }
          : {}),
      };

      const [applications, total] = await Promise.all([
        prisma.application.findMany({ where, skip, take, include: listInclude(uid(req)), orderBy: { updatedAt: 'desc' } }),
        prisma.application.count({ where }),
      ]);
      res.json({ success: true, data: { applications, total, page: parseInt(page), limit: take } });
    } catch (e) { next(e); }
  },

  async createApplication(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { jobId, companyName, title, applyUrl, ...rest } = req.body;
      let job;
      if (jobId) {
        job = await prisma.job.findFirst({ where: { id: jobId, userId: uid(req) } });
        if (!job) throw new AppError('Job not found', 404);
      } else {
        // Manual entry: create a private job record to hang the application on
        job = await prisma.job.create({
          data: { userId: uid(req), title, companyName, applyUrl: applyUrl || null, description: null },
        });
      }

      const existing = await prisma.application.findFirst({ where: { userId: uid(req), jobId: job.id } });
      if (existing) throw new AppError('You already have an application for this job', 409);

      const status = (rest.status ?? 'APPLIED') as ApplicationStatus;
      const application = await prisma.application.create({
        data: {
          userId: uid(req),
          jobId: job.id,
          ...rest,
          // Keep the description as it was when applying: postings get edited or taken down
          jobDescriptionSnapshot: job.description?.slice(0, 20_000) ?? null,
          status,
          appliedAt: rest.appliedAt ?? (status === 'APPLIED' ? new Date() : null),
          statusHistory: { create: { toStatus: status } },
        },
        include: listInclude(uid(req)),
      });
      res.status(201).json({ success: true, data: application });
    } catch (e) { next(e); }
  },

  async getApplication(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const app = await prisma.application.findFirst({
        where: { id: param(req, 'id'), userId: uid(req) },
        include: {
          job: { include: { company: true, matches: { where: { userId: uid(req) } } } },
          resume: { select: { id: true, name: true, fileName: true, updatedAt: true } },
          interviews: { orderBy: { scheduledAt: 'asc' } },
          statusHistory: { orderBy: { changedAt: 'desc' } },
          noteEntries: { orderBy: { createdAt: 'desc' } },
          coverLetters: { orderBy: { createdAt: 'desc' }, select: { id: true, title: true, content: true, createdAt: true } },
        },
      });
      if (!app) throw new AppError('Application not found', 404);
      res.json({ success: true, data: app });
    } catch (e) { next(e); }
  },

  async updateApplication(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.application.findFirst({ where: { id: param(req, 'id'), userId: uid(req) } });
      if (!existing) throw new AppError('Application not found', 404);
      const { status, ...rest } = req.body as { status?: ApplicationStatus } & Record<string, unknown>;

      const changed = status && status !== existing.status;
      const updated = await prisma.application.update({
        where: { id: existing.id },
        data: {
          ...(rest as Prisma.ApplicationUpdateInput),
          ...(status ? { status } : {}),
          ...(changed ? statusData(existing.status, status) : {}),
          // keep the first applied date unless the client sets one explicitly
          ...(changed && status === 'APPLIED' && existing.appliedAt ? { appliedAt: existing.appliedAt } : {}),
          ...(changed && status === 'APPLIED' && !existing.jobDescriptionSnapshot ? await snapshot(existing.jobId) : {}),
        },
        include: listInclude(uid(req)),
      });
      res.json({ success: true, data: updated });
    } catch (e) { next(e); }
  },

  async deleteApplication(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const r = await prisma.application.deleteMany({ where: { id: param(req, 'id'), userId: uid(req) } });
      if (!r.count) throw new AppError('Application not found', 404);
      res.json({ success: true, data: { deleted: true } });
    } catch (e) { next(e); }
  },

  async bulkUpdate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { ids, status } = req.body as { ids: string[]; status?: ApplicationStatus };
      if (!status) throw new AppError('status is required', 400);
      const apps = await prisma.application.findMany({ where: { id: { in: ids }, userId: uid(req) }, select: { id: true, status: true } });
      await prisma.$transaction(
        apps
          .filter(a => a.status !== status)
          .map(a => prisma.application.update({ where: { id: a.id }, data: { status, ...statusData(a.status, status) } })),
      );
      res.json({ success: true, data: { updated: apps.length } });
    } catch (e) { next(e); }
  },

  async bulkDelete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { ids } = req.body as { ids: string[] };
      const r = await prisma.application.deleteMany({ where: { id: { in: ids }, userId: uid(req) } });
      res.json({ success: true, data: { deleted: r.count } });
    } catch (e) { next(e); }
  },

  async getStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const stats = await prisma.application.groupBy({ by: ['status'], where: { userId: uid(req) }, _count: { status: true } });
      const total = await prisma.application.count({ where: { userId: uid(req) } });
      res.json({ success: true, data: { total, byStatus: stats } });
    } catch (e) { next(e); }
  },

  async getStatusHistory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const app = await prisma.application.findFirst({ where: { id: param(req, 'id'), userId: uid(req) }, select: { id: true } });
      if (!app) throw new AppError('Application not found', 404);
      const history = await prisma.applicationStatusHistory.findMany({ where: { applicationId: app.id }, orderBy: { changedAt: 'desc' } });
      res.json({ success: true, data: history });
    } catch (e) { next(e); }
  },

  // ── Notes ────────────────────────────────────────────────────────────────
  async addNote(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const app = await prisma.application.findFirst({ where: { id: param(req, 'id'), userId: uid(req) }, select: { id: true } });
      if (!app) throw new AppError('Application not found', 404);
      const note = await prisma.applicationNote.create({ data: { applicationId: app.id, userId: uid(req), content: req.body.content } });
      res.status(201).json({ success: true, data: note });
    } catch (e) { next(e); }
  },

  async updateNote(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const r = await prisma.applicationNote.updateMany({
        where: { id: param(req, 'noteId'), applicationId: param(req, 'id'), userId: uid(req) },
        data: { content: req.body.content },
      });
      if (!r.count) throw new AppError('Note not found', 404);
      res.json({ success: true, data: { updated: true } });
    } catch (e) { next(e); }
  },

  async deleteNote(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await prisma.applicationNote.deleteMany({ where: { id: param(req, 'noteId'), applicationId: param(req, 'id'), userId: uid(req) } });
      res.json({ success: true, data: { deleted: true } });
    } catch (e) { next(e); }
  },

  async addInterview(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const app = await prisma.application.findFirst({ where: { id: param(req, 'id'), userId: uid(req) } });
      if (!app) throw new AppError('Application not found', 404);
      const { type, scheduledAt, durationMinutes, location, meetingUrl, interviewer, notes } = req.body;
      const interview = await prisma.interview.create({
        data: {
          userId: uid(req), applicationId: app.id, jobId: app.jobId,
          type, durationMinutes, location, meetingUrl, interviewer, notes,
          scheduledAt: scheduledAt ?? null,
        },
      });
      res.status(201).json({ success: true, data: interview });
    } catch (e) { next(e); }
  },
};
