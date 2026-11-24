import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { AuthRequest } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { userSkillSet } from '../../lib/match';
import { topSkills } from '../../lib/atsScore';
import { genericSteps, PATHS, pathForSkill, type PathStep } from '../../lib/learningPaths';
import { aiService } from '../../services/ai.service';

const uid = (req: AuthRequest) => req.user!.id;
const param = (req: AuthRequest, k: string) => req.params[k] as string;
const norm = (s: string) => s.trim().toLowerCase().replace(/\.js$/, '').replace(/[^a-z0-9+#]/g, '');
const MAX_GOALS = 30;

interface GoalStep extends PathStep { done: boolean; week?: number }

const progressOf = (steps: GoalStep[]) => (steps.length ? Math.round((steps.filter(s => s.done).length / steps.length) * 100) : 0);

async function ownGoal(req: AuthRequest) {
  const g = await prisma.learningGoal.findFirst({ where: { id: param(req, 'id'), userId: uid(req) } });
  if (!g) throw new AppError('Learning goal not found', 404);
  return g;
}

function parseDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new AppError('targetDate must be a date', 400, 'VALIDATION_ERROR');
  return d;
}

export const learningController = {
  async paths(_req: AuthRequest, res: Response) {
    res.json({ success: true, data: PATHS });
  },

  /** Skills the user's own saved jobs ask for most, split into ones they have and gaps, with a matching path. */
  async gaps(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = uid(req);
      const [jobs, skills, goals] = await Promise.all([
        prisma.job.findMany({ where: { userId, isActive: true, duplicateOfId: null, isDemo: false }, select: { skills: true }, orderBy: { createdAt: 'desc' }, take: 300 }),
        userSkillSet(userId),
        prisma.learningGoal.findMany({ where: { userId }, select: { skill: true, status: true, id: true } }),
      ]);
      const goalBySkill = new Map(goals.map(g => [norm(g.skill), g]));
      const top = topSkills(jobs, 20).map(t => ({
        ...t,
        demand: jobs.length ? Math.round((t.count / jobs.length) * 100) : 0,
        youHave: skills.has(norm(t.skill)),
        pathId: pathForSkill(t.skill)?.id ?? null,
        goal: goalBySkill.get(norm(t.skill)) ?? null,
      }));
      res.json({ success: true, data: { jobs: jobs.length, skills: top, gaps: top.filter(t => !t.youHave) } });
    } catch (e) { next(e); }
  },

  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const goals = await prisma.learningGoal.findMany({ where: { userId: uid(req) }, orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }] });
      res.json({ success: true, data: goals });
    } catch (e) { next(e); }
  },

  /** From a built-in path ({ pathId }), or for any skill ({ skill, title? }) with a generic plan. */
  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const b = req.body as { pathId?: unknown; skill?: unknown; title?: unknown; targetDate?: unknown; source?: unknown };
      const userId = uid(req);
      if ((await prisma.learningGoal.count({ where: { userId, status: { not: 'DONE' } } })) >= MAX_GOALS) throw new AppError(`You can have up to ${MAX_GOALS} open goals`, 409);
      let skill: string;
      let title: string;
      let steps: GoalStep[];
      let pathId: string | null = null;
      let source = b.source === 'gap' ? 'gap' : 'manual';
      if (typeof b.pathId === 'string' && b.pathId) {
        const path = PATHS.find(p => p.id === b.pathId);
        if (!path) throw new AppError('Unknown learning path', 404);
        skill = path.skill; title = path.title; pathId = path.id; source = b.source === 'gap' ? 'gap' : 'path';
        steps = path.steps.map(s => ({ ...s, done: false }));
      } else {
        skill = typeof b.skill === 'string' ? b.skill.trim().slice(0, 60) : '';
        if (!skill) throw new AppError('Name the skill you want to learn', 400, 'VALIDATION_ERROR');
        const path = pathForSkill(skill);
        title = typeof b.title === 'string' && b.title.trim() ? b.title.trim().slice(0, 120) : path?.title ?? `Learn ${skill}`;
        pathId = path?.id ?? null;
        steps = (path?.steps ?? genericSteps(skill)).map(s => ({ ...s, done: false }));
      }
      const existing = await prisma.learningGoal.findFirst({ where: { userId, status: { not: 'DONE' }, skill: { equals: skill, mode: 'insensitive' } } });
      if (existing) throw new AppError(`You already have an open goal for ${skill}`, 409, 'CONFLICT');
      const goal = await prisma.learningGoal.create({
        data: { userId, skill, title, source, pathId, steps: steps as unknown as Prisma.InputJsonValue, targetDate: parseDate(b.targetDate) ?? null },
      });
      res.status(201).json({ success: true, data: goal });
    } catch (e) { next(e); }
  },

  /** AI-written roadmap saved as a goal. Needs AI; returns AI_NOT_CONFIGURED otherwise. */
  async roadmap(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = uid(req);
      const b = req.body as { target?: unknown; weeks?: unknown; skill?: unknown };
      const target = typeof b.target === 'string' ? b.target.trim().slice(0, 200) : '';
      if (target.length < 2) throw new AppError('Say what you are aiming for, e.g. "Senior React developer" or "GraphQL"', 400, 'VALIDATION_ERROR');
      const weeks = Math.min(Math.max(parseInt(String(b.weeks ?? 8)) || 8, 2), 26);
      if ((await prisma.learningGoal.count({ where: { userId, status: { not: 'DONE' } } })) >= MAX_GOALS) throw new AppError(`You can have up to ${MAX_GOALS} open goals`, 409);
      const [skills, profile] = await Promise.all([userSkillSet(userId), prisma.profile.findUnique({ where: { userId }, select: { yearsOfExp: true } })]);
      const y = profile?.yearsOfExp || 2;
      const level = y < 1.5 ? 'ENTRY' : y < 5 ? 'MID' : y < 9 ? 'SENIOR' : 'LEAD';
      const r = await aiService.careerRoadmap({ target, weeks, level, knownSkills: [...skills.values()], gaps: [] }, userId);
      const steps: GoalStep[] = r.steps.map((s, i) => ({
        id: `ai-${i + 1}`, title: s.title, kind: s.kind, week: s.week, done: false,
        // The model names resources but never writes URLs, so link to a search instead of a guessed address
        ...(s.resource ? { resource: { label: s.resource, url: `https://duckduckgo.com/?q=${encodeURIComponent(s.resource)}` } } : {}),
      }));
      const goal = await prisma.learningGoal.create({
        data: {
          userId, skill: (typeof b.skill === 'string' && b.skill.trim() ? b.skill.trim() : target).slice(0, 60), title: r.title, source: 'ai',
          steps: steps as unknown as Prisma.InputJsonValue, targetDate: new Date(Date.now() + weeks * 7 * 86_400_000),
        },
      });
      res.status(201).json({ success: true, data: { goal, summary: r.summary, milestones: r.milestones } });
    } catch (e) { next(e); }
  },

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const g = await ownGoal(req);
      const b = req.body as { title?: unknown; status?: unknown; targetDate?: unknown };
      const data: Prisma.LearningGoalUpdateInput = {};
      if (typeof b.title === 'string' && b.title.trim()) data.title = b.title.trim().slice(0, 120);
      if (b.status !== undefined) {
        if (!['ACTIVE', 'PAUSED', 'DONE'].includes(String(b.status))) throw new AppError('status must be ACTIVE, PAUSED or DONE', 400, 'VALIDATION_ERROR');
        data.status = String(b.status);
        data.completedAt = b.status === 'DONE' ? g.completedAt ?? new Date() : null;
      }
      const td = parseDate(b.targetDate);
      if (td !== undefined) data.targetDate = td;
      res.json({ success: true, data: await prisma.learningGoal.update({ where: { id: g.id }, data }) });
    } catch (e) { next(e); }
  },

  async toggleStep(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const g = await ownGoal(req);
      const steps = (g.steps ?? []) as unknown as GoalStep[];
      const step = steps.find(s => s.id === param(req, 'stepId'));
      if (!step) throw new AppError('Step not found', 404);
      if (typeof req.body?.done !== 'boolean') throw new AppError('done must be true or false', 400, 'VALIDATION_ERROR');
      step.done = req.body.done;
      const progress = progressOf(steps);
      const updated = await prisma.learningGoal.update({
        where: { id: g.id },
        data: { steps: steps as unknown as Prisma.InputJsonValue, progress },
      });
      res.json({ success: true, data: updated });
    } catch (e) { next(e); }
  },

  /** Marks the goal done and, if asked, adds the skill to the user's profile. */
  async completeSkill(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const g = await ownGoal(req);
      const addToProfile = req.body?.addToProfile !== false;
      let added = false;
      if (addToProfile) {
        const profile = await prisma.profile.upsert({ where: { userId: uid(req) }, create: { userId: uid(req) }, update: {}, include: { skills: { select: { name: true } } } });
        if (!profile.skills.some(s => norm(s.name) === norm(g.skill))) {
          await prisma.skill.create({ data: { profileId: profile.id, name: g.skill, level: 'INTERMEDIATE' } });
          added = true;
        }
      }
      const updated = await prisma.learningGoal.update({ where: { id: g.id }, data: { status: 'DONE', completedAt: new Date() } });
      res.json({ success: true, data: { goal: updated, addedToProfile: added } });
    } catch (e) { next(e); }
  },

  async remove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const r = await prisma.learningGoal.deleteMany({ where: { id: param(req, 'id'), userId: uid(req) } });
      if (!r.count) throw new AppError('Learning goal not found', 404);
      res.json({ success: true, data: { deleted: true } });
    } catch (e) { next(e); }
  },
};
