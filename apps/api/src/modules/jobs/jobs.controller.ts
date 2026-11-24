import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { buildJobWhere, cleanJobFilters } from '../../lib/jobQuery';
import { dedupeKey, detectExperienceLevel, extractSkills, mergeSkills, sourceNameFromExternalId } from '../../lib/jobEnrich';
import { AuthRequest } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { quickMatch, userSkillSet } from '../../lib/match';
import { listJobSources } from '../../lib/jobFeeds';
import { importJobsForUser, readJobSourceSettings } from '../../lib/jobImport';
import { getUserAIPrefs } from '../../lib/aiPrefs';
import { matchJobForUser } from '../../lib/jobMatch';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

const uid = (req: AuthRequest) => req.user!.id;
const param = (req: AuthRequest, k: string) => req.params[k] as string;

type Q = Record<string, string | undefined>;

export const jobsController = {
  async listJobs(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = uid(req);
      const q = req.query as Q;
      const page = Math.max(parseInt(q['page'] ?? '1') || 1, 1);
      const limit = Math.min(parseInt(q['limit'] ?? '20') || 20, 100);
      const sort = q['sort'] ?? 'date';

      const where = buildJobWhere(userId, q);
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
        return { ...job, sourceName: job.sourceName ?? sourceNameFromExternalId(job.externalId), saved: savedJobs.length > 0, application: applications[0] ?? null, match };
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

      const description = str('description', 20_000);
      const given = Array.isArray(b['skills']) ? (b['skills'] as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 20) : [];
      const key = dedupeKey(companyName, title);
      const existing = await prisma.job.findFirst({ where: { userId: uid(req), dedupeKey: key }, select: { id: true } });
      const job = await prisma.job.create({
        data: {
          userId: uid(req), title, companyName, applyUrl, sourceUrl: applyUrl,
          location: str('location', 200), description, country: '',
          skills: mergeSkills(given, extractSkills(title, description)),
          experienceLevel: detectExperienceLevel(title, description),
          sourceName: 'Added by you', dedupeKey: key,
          postedAt: new Date(),
        },
      });
      await prisma.savedJob.create({ data: { userId: uid(req), jobId: job.id } });
      res.status(201).json({ success: true, data: { ...job, possibleDuplicateOf: existing?.id ?? null } });
    } catch (e) { next(e); }
  },

  // ── Saved searches and alerts (JobSearch rows with a name) ─────────────────
  async listSearches(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const rows = await prisma.jobSearch.findMany({ where: { userId: uid(req), name: { not: null } }, orderBy: { createdAt: 'desc' } });
      // Live count of matches so the list shows what each search finds today
      const data = await Promise.all(rows.map(async r => ({
        ...r,
        matches: await prisma.job.count({ where: buildJobWhere(uid(req), (r.filters ?? {}) as Record<string, string>) }),
      })));
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  async createSearch(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const b = req.body as { name?: unknown; filters?: unknown; alertEnabled?: unknown };
      const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
      if (!name) throw new AppError('Give the search a name', 400);
      const filters = cleanJobFilters((b.filters ?? {}) as Record<string, unknown>);
      if (!Object.keys(filters).length) throw new AppError('Set at least one filter or keyword to save a search', 400);
      if ((await prisma.jobSearch.count({ where: { userId: uid(req), name: { not: null } } })) >= 20) throw new AppError('You can keep up to 20 saved searches', 409);
      const resultCount = await prisma.job.count({ where: buildJobWhere(uid(req), filters) });
      const row = await prisma.jobSearch.create({
        data: { userId: uid(req), name, query: filters['q'] ?? '', filters, resultCount, alertEnabled: b.alertEnabled === true, lastRunAt: new Date() },
      });
      res.status(201).json({ success: true, data: row });
    } catch (e) { next(e); }
  },

  async updateSearch(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const b = req.body as { name?: unknown; alertEnabled?: unknown };
      const data: Prisma.JobSearchUpdateManyMutationInput = {};
      if (typeof b.name === 'string' && b.name.trim()) data.name = b.name.trim().slice(0, 80);
      if (typeof b.alertEnabled === 'boolean') { data.alertEnabled = b.alertEnabled; if (b.alertEnabled) data.lastRunAt = new Date(); }
      const r = await prisma.jobSearch.updateMany({ where: { id: param(req, 'searchId'), userId: uid(req), name: { not: null } }, data });
      if (!r.count) throw new AppError('Saved search not found', 404);
      res.json({ success: true, data: { updated: true } });
    } catch (e) { next(e); }
  },

  async deleteSearch(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const r = await prisma.jobSearch.deleteMany({ where: { id: param(req, 'searchId'), userId: uid(req) } });
      if (!r.count) throw new AppError('Saved search not found', 404);
      res.json({ success: true, data: { deleted: true } });
    } catch (e) { next(e); }
  },

  /** Job sources this server can import from, and the user's current choices. */
  async listSources(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const prefs = await prisma.userPreference.findUnique({ where: { userId: uid(req) }, select: { extras: true } });
      const settings = readJobSourceSettings((prefs?.extras ?? {}) as Record<string, unknown>);
      res.json({ success: true, data: { sources: listJobSources(), settings } });
    } catch (e) { next(e); }
  },

  /** Pull fresh jobs from the user's chosen sources (or the ones in the request) into their job list. */
  async fetchJobs(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = uid(req);
      const body = req.body as { search?: string; sources?: unknown };
      const search = String(body.search ?? '').slice(0, 100);

      // Public feeds ask consumers to fetch sparingly; cap to one pull per 10 minutes per user.
      const prefs = await prisma.userPreference.findUnique({ where: { userId }, select: { extras: true } });
      const extras = (prefs?.extras ?? {}) as Record<string, unknown>;
      const last = typeof extras['lastJobFetchAt'] === 'string' ? Date.parse(extras['lastJobFetchAt']) : 0;
      if (Date.now() - last < 10 * 60_000) throw new AppError('Jobs were fetched recently. Try again in a few minutes.', 429);

      const settings = readJobSourceSettings({ ...extras, ...(Array.isArray(body.sources) ? { jobSources: body.sources } : {}) });
      const result = await importJobsForUser(userId, settings, search);
      const newIds = result.newIds;
      if (!result.fetched && result.bySource.every(s => s.error)) {
        throw new AppError(result.bySource.map(s => `${s.source}: ${s.error}`).join('; ') || 'No job sources selected', 502);
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

      res.json({ success: true, data: { fetched: result.fetched, created: result.created, duplicates: result.duplicates, bySource: result.bySource } });
    } catch (e) { next(e); }
  },
};
