import { Response, NextFunction } from 'express';
import { Prisma, WorkMode, ExperienceLevel } from '@prisma/client';
import { AuthRequest } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { quickMatch, userSkillSet } from '../../lib/match';
import { fetchRemotive } from '../../lib/jobFeeds';
import { getUserAIPrefs } from '../../lib/aiPrefs';
import { matchJobForUser } from '../../lib/jobMatch';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

const uid = (req: AuthRequest) => req.user!.id;
const param = (req: AuthRequest, k: string) => req.params[k] as string;
const DAY = 86_400_000;

type Q = Record<string, string | undefined>;

export const jobsController = {
  async listJobs(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = uid(req);
      const q = req.query as Q;
      const page = Math.max(parseInt(q['page'] ?? '1') || 1, 1);
      const limit = Math.min(parseInt(q['limit'] ?? '20') || 20, 100);
      const sort = q['sort'] ?? 'date';

      const and: Prisma.JobWhereInput[] = [];
      if (q['q']) {
        and.push({
          OR: [
            { title: { contains: q['q'], mode: 'insensitive' } },
            { companyName: { contains: q['q'], mode: 'insensitive' } },
            { skills: { has: q['q'] } },
          ],
        });
      }
      if (q['location']) and.push({ location: { contains: q['location'], mode: 'insensitive' } });
      if (q['workMode']) and.push({ workMode: q['workMode'] as WorkMode });
      if (q['experienceLevel']) and.push({ experienceLevel: q['experienceLevel'] as ExperienceLevel });
      if (q['salaryMin']) and.push({ OR: [{ salaryMax: { gte: parseInt(q['salaryMin']) } }, { salaryMax: null }] });
      if (q['salaryMax']) and.push({ OR: [{ salaryMin: { lte: parseInt(q['salaryMax']) } }, { salaryMin: null }] });
      if (q['companySize']) and.push({ company: { size: q['companySize'] } });
      if (q['posted']) {
        const days = { '24h': 1, week: 7, month: 30 }[q['posted']];
        if (days) and.push({ postedAt: { gte: new Date(Date.now() - days * DAY) } });
      }
      if (q['saved'] === 'true') and.push({ savedJobs: { some: { userId } } });

      const where: Prisma.JobWhereInput = { userId, isActive: true, AND: and };
      const include = {
        company: { select: { logo: true, size: true } },
        matches: { where: { userId }, select: { overallScore: true, matchedSkills: true, missingSkills: true } },
        savedJobs: { where: { userId }, select: { id: true } },
        applications: { where: { userId }, select: { id: true, status: true } },
      } satisfies Prisma.JobInclude;

      const decorate = (skills: Map<string, string>) => (j: Prisma.JobGetPayload<{ include: typeof include }>) => {
        const ai = j.matches[0];
        const match = ai
          ? { score: Math.round(ai.overallScore), matched: ai.matchedSkills, missing: ai.missingSkills, total: j.skills.length, source: 'ai' as const }
          : quickMatch(j.skills, skills);
        const { matches: _m, savedJobs, applications, ...job } = j;
        return { ...job, saved: savedJobs.length > 0, application: applications[0] ?? null, match };
      };

      const skills = await userSkillSet(userId);
      let rows: ReturnType<ReturnType<typeof decorate>>[];
      let total: number;

      if (sort === 'match' || sort === 'relevance') {
        // Match scores are computed in memory, so rank a bounded candidate window then page it.
        const candidates = await prisma.job.findMany({ where, include, orderBy: { postedAt: 'desc' }, take: 500 });
        total = await prisma.job.count({ where });
        rows = candidates.map(decorate(skills)).sort((a, b) => b.match.score - a.match.score).slice((page - 1) * limit, page * limit);
      } else {
        const orderBy: Prisma.JobOrderByWithRelationInput =
          sort === 'salary' ? { salaryMax: { sort: 'desc', nulls: 'last' } } : { postedAt: { sort: 'desc', nulls: 'last' } };
        const [jobs, count] = await Promise.all([
          prisma.job.findMany({ where, include, orderBy, skip: (page - 1) * limit, take: limit }),
          prisma.job.count({ where }),
        ]);
        rows = jobs.map(decorate(skills));
        total = count;
      }

      res.json({ success: true, data: { jobs: rows, total, page, limit, hasMore: page * limit < total } });
    } catch (e) { next(e); }
  },

  /** Autocomplete for the search box: distinct titles and companies. */
  async suggest(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const q = ((req.query as Q)['q'] ?? '').trim();
      if (q.length < 2) {
        res.json({ success: true, data: [] });
        return;
      }
      const [titles, companies] = await Promise.all([
        prisma.job.findMany({ where: { userId: uid(req), title: { contains: q, mode: 'insensitive' } }, select: { title: true }, distinct: ['title'], take: 5 }),
        prisma.job.findMany({ where: { userId: uid(req), companyName: { contains: q, mode: 'insensitive' } }, select: { companyName: true }, distinct: ['companyName'], take: 5 }),
      ]);
      res.json({
        success: true,
        data: [
          ...titles.map(t => ({ type: 'title', value: t.title })),
          ...companies.map(c => ({ type: 'company', value: c.companyName })),
        ],
      });
    } catch (e) { next(e); }
  },

  async getJob(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const job = await prisma.job.findFirst({
        where: { id: param(req, 'id'), userId: uid(req) },
        include: {
          company: true,
          matches: { where: { userId: uid(req) } },
          savedJobs: { where: { userId: uid(req) } },
          applications: { where: { userId: uid(req) }, select: { id: true, status: true } },
        },
      });
      if (!job) throw new AppError('Job not found', 404);
      res.json({ success: true, data: job });
    } catch (e) { next(e); }
  },

  async getSavedJobs(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const saved = await prisma.savedJob.findMany({
        where: { userId: uid(req) },
        include: { job: { include: { company: true } } },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ success: true, data: saved.map(s => s.job) });
    } catch (e) { next(e); }
  },

  async saveJob(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const job = await prisma.job.findFirst({ where: { id: param(req, 'id'), userId: uid(req) }, select: { id: true } });
      if (!job) throw new AppError('Job not found', 404);
      await prisma.savedJob.upsert({
        where: { userId_jobId: { userId: uid(req), jobId: job.id } },
        create: { userId: uid(req), jobId: job.id },
        update: {},
      });
      res.json({ success: true, data: { saved: true } });

      // "Auto-match on save" preference: score the job in the background (failures are only logged)
      const prefs = await getUserAIPrefs(uid(req));
      if (prefs.autoMatch && env.AI_KEY) {
        matchJobForUser(uid(req), job.id).catch(err => logger.warn({ err: (err as Error).message }, 'auto-match failed'));
      }
    } catch (e) { next(e); }
  },

  async unsaveJob(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await prisma.savedJob.deleteMany({ where: { userId: uid(req), jobId: param(req, 'id') } });
      res.json({ success: true, data: { saved: false } });
    } catch (e) { next(e); }
  },

  async getJobMatch(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const match = await prisma.jobMatch.findFirst({ where: { jobId: param(req, 'id'), userId: uid(req) } });
      res.json({ success: true, data: match });
    } catch (e) { next(e); }
  },

  /** Add a job by hand (e.g. from a posting found elsewhere) and bookmark it. */
  async createJob(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const b = req.body as Record<string, unknown>;
      const str = (k: string, max: number) => (typeof b[k] === 'string' && (b[k] as string).trim() ? (b[k] as string).trim().slice(0, max) : null);
      const title = str('title', 200);
      const companyName = str('companyName', 200);
      if (!title || !companyName) throw new AppError('Job title and company are required', 400);
      const applyUrl = str('applyUrl', 1000);
      if (applyUrl && !/^https?:\/\//i.test(applyUrl)) throw new AppError('Job URL must start with http:// or https://', 400);

      const job = await prisma.job.create({
        data: {
          userId: uid(req), title, companyName, applyUrl, sourceUrl: applyUrl,
          location: str('location', 200), description: str('description', 20_000),
          skills: Array.isArray(b['skills']) ? (b['skills'] as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 20) : [],
          postedAt: new Date(),
        },
      });
      await prisma.savedJob.create({ data: { userId: uid(req), jobId: job.id } });
      res.status(201).json({ success: true, data: job });
    } catch (e) { next(e); }
  },

  /** Pull fresh remote jobs from Remotive's public API into this user's job list. */
  async fetchJobs(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = uid(req);
      const search = String((req.body as { search?: string }).search ?? '').slice(0, 100);

      // Remotive asks API consumers to fetch sparingly; cap to one pull per 10 minutes per user.
      const prefs = await prisma.userPreference.findUnique({ where: { userId }, select: { extras: true } });
      const extras = (prefs?.extras ?? {}) as Record<string, unknown>;
      const last = typeof extras['lastJobFetchAt'] === 'string' ? Date.parse(extras['lastJobFetchAt']) : 0;
      if (Date.now() - last < 10 * 60_000) throw new AppError('Jobs were fetched recently. Try again in a few minutes.', 429);

      const incoming = await fetchRemotive(search);
      let created = 0;
      const newIds: string[] = [];
      for (const j of incoming) {
        const exists = await prisma.job.findFirst({ where: { userId, externalId: j.externalId, sourceId: null }, select: { id: true } });
        if (exists) continue;
        const row = await prisma.job.create({ data: { ...j, userId } });
        newIds.push(row.id);
        created++;
      }

      // "Auto-analyze new jobs" preference: AI-match a few of the newest ones (capped to bound token spend)
      const aiPrefs = await getUserAIPrefs(userId);
      if (aiPrefs.autoAnalyze && env.AI_KEY && newIds.length) {
        (async () => {
          for (const id of newIds.slice(0, 5)) {
            await matchJobForUser(userId, id).catch(err => logger.warn({ err: (err as Error).message }, 'auto-analyze failed'));
          }
        })();
      }

      await prisma.userPreference.upsert({
        where: { userId },
        create: { userId, extras: { lastJobFetchAt: new Date().toISOString() } },
        update: { extras: { ...extras, lastJobFetchAt: new Date().toISOString() } },
      });

      res.json({ success: true, data: { fetched: incoming.length, created, source: 'Remotive' } });
    } catch (e) { next(e); }
  },
};
