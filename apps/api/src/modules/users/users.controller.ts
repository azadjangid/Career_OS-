import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { env } from '../../config/env';
import { hashApiKey } from '../../middleware/auth';
import { MODEL_OPTIONS } from '../../lib/aiPrefs';
import { audit, requestMeta } from '../../lib/audit';
import { storage } from '../../lib/storage';
import { cleanCompanySlugs, SOURCE_IDS, type JobSourceId } from '../../lib/jobFeeds';

const uid = (req: AuthRequest) => req.user!.id;

export const usersController = {
  async getProfile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await prisma.profile.findUnique({
        where: { userId: uid(req) },
        include: { skills: true, experiences: true, educations: true, projects: true },
      });
      res.json({ success: true, data: profile });
    } catch (e) { next(e); }
  },

  async updateProfile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await prisma.profile.upsert({
        where: { userId: uid(req) },
        update: req.body,
        create: { userId: uid(req), ...req.body },
      });
      res.json({ success: true, data: profile });
    } catch (e) { next(e); }
  },

  async getSkills(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await prisma.profile.findUnique({ where: { userId: uid(req) }, select: { id: true } });
      if (!profile) throw new AppError('Profile not found', 404);
      const skills = await prisma.skill.findMany({ where: { profileId: profile.id }, orderBy: { isPrimary: 'desc' } });
      res.json({ success: true, data: skills });
    } catch (e) { next(e); }
  },

  async addSkill(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await prisma.profile.findUnique({ where: { userId: uid(req) }, select: { id: true } });
      if (!profile) throw new AppError('Profile not found', 404);
      const skill = await prisma.skill.create({ data: { profileId: profile.id, ...req.body } });
      res.status(201).json({ success: true, data: skill });
    } catch (e) { next(e); }
  },

  async updateSkill(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await prisma.profile.findUnique({ where: { userId: uid(req) }, select: { id: true } });
      if (!profile) throw new AppError('Profile not found', 404);
      const skill = await prisma.skill.updateMany({
        where: { id: req.params['id'], profileId: profile.id },
        data: req.body,
      });
      if (skill.count === 0) throw new AppError('Skill not found', 404);
      res.json({ success: true, data: { updated: true } });
    } catch (e) { next(e); }
  },

  async deleteSkill(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await prisma.profile.findUnique({ where: { userId: uid(req) }, select: { id: true } });
      if (!profile) throw new AppError('Profile not found', 404);
      await prisma.skill.deleteMany({ where: { id: req.params['id'], profileId: profile.id } });
      res.json({ success: true, data: { deleted: true } });
    } catch (e) { next(e); }
  },

  async getExperience(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await prisma.profile.findUnique({ where: { userId: uid(req) }, select: { id: true } });
      if (!profile) throw new AppError('Profile not found', 404);
      const exp = await prisma.experience.findMany({ where: { profileId: profile.id }, orderBy: { startDate: 'desc' } });
      res.json({ success: true, data: exp });
    } catch (e) { next(e); }
  },

  async addExperience(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await prisma.profile.findUnique({ where: { userId: uid(req) }, select: { id: true } });
      if (!profile) throw new AppError('Profile not found', 404);
      const exp = await prisma.experience.create({ data: { profileId: profile.id, ...req.body } });
      res.status(201).json({ success: true, data: exp });
    } catch (e) { next(e); }
  },

  async updateExperience(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await prisma.profile.findUnique({ where: { userId: uid(req) }, select: { id: true } });
      if (!profile) throw new AppError('Profile not found', 404);
      const r = await prisma.experience.updateMany({ where: { id: req.params['id'], profileId: profile.id }, data: req.body });
      if (!r.count) throw new AppError('Experience not found', 404);
      res.json({ success: true, data: { updated: true } });
    } catch (e) { next(e); }
  },

  async deleteExperience(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await prisma.profile.findUnique({ where: { userId: uid(req) }, select: { id: true } });
      if (!profile) throw new AppError('Profile not found', 404);
      await prisma.experience.deleteMany({ where: { id: req.params['id'], profileId: profile.id } });
      res.json({ success: true, data: { deleted: true } });
    } catch (e) { next(e); }
  },

  async getEducation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await prisma.profile.findUnique({ where: { userId: uid(req) }, select: { id: true } });
      if (!profile) throw new AppError('Profile not found', 404);
      const edu = await prisma.education.findMany({ where: { profileId: profile.id } });
      res.json({ success: true, data: edu });
    } catch (e) { next(e); }
  },

  async addEducation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await prisma.profile.findUnique({ where: { userId: uid(req) }, select: { id: true } });
      if (!profile) throw new AppError('Profile not found', 404);
      const edu = await prisma.education.create({ data: { profileId: profile.id, ...req.body } });
      res.status(201).json({ success: true, data: edu });
    } catch (e) { next(e); }
  },

  async updateEducation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await prisma.profile.findUnique({ where: { userId: uid(req) }, select: { id: true } });
      if (!profile) throw new AppError('Profile not found', 404);
      const r = await prisma.education.updateMany({ where: { id: req.params['id'], profileId: profile.id }, data: req.body });
      if (!r.count) throw new AppError('Education not found', 404);
      res.json({ success: true, data: { updated: true } });
    } catch (e) { next(e); }
  },

  async deleteEducation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await prisma.profile.findUnique({ where: { userId: uid(req) }, select: { id: true } });
      if (!profile) throw new AppError('Profile not found', 404);
      await prisma.education.deleteMany({ where: { id: req.params['id'], profileId: profile.id } });
      res.json({ success: true, data: { deleted: true } });
    } catch (e) { next(e); }
  },

  async getProjects(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await prisma.profile.findUnique({ where: { userId: uid(req) }, select: { id: true } });
      if (!profile) throw new AppError('Profile not found', 404);
      const projects = await prisma.project.findMany({ where: { profileId: profile.id } });
      res.json({ success: true, data: projects });
    } catch (e) { next(e); }
  },

  async addProject(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await prisma.profile.findUnique({ where: { userId: uid(req) }, select: { id: true } });
      if (!profile) throw new AppError('Profile not found', 404);
      const project = await prisma.project.create({ data: { profileId: profile.id, ...req.body } });
      res.status(201).json({ success: true, data: project });
    } catch (e) { next(e); }
  },

  async updateProject(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await prisma.profile.findUnique({ where: { userId: uid(req) }, select: { id: true } });
      if (!profile) throw new AppError('Profile not found', 404);
      const r = await prisma.project.updateMany({ where: { id: req.params['id'], profileId: profile.id }, data: req.body });
      if (!r.count) throw new AppError('Project not found', 404);
      res.json({ success: true, data: { updated: true } });
    } catch (e) { next(e); }
  },

  async deleteProject(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await prisma.profile.findUnique({ where: { userId: uid(req) }, select: { id: true } });
      if (!profile) throw new AppError('Profile not found', 404);
      await prisma.project.deleteMany({ where: { id: req.params['id'], profileId: profile.id } });
      res.json({ success: true, data: { deleted: true } });
    } catch (e) { next(e); }
  },

  async getAccount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: uid(req) },
        select: { id: true, email: true, name: true, role: true, emailVerified: true, createdAt: true, lastLoginAt: true },
      });
      res.json({ success: true, data: user });
    } catch (e) { next(e); }
  },

  async updateAccount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const name = String((req.body as { name?: string }).name ?? '').trim();
      if (name.length < 2 || name.length > 100) throw new AppError('Name must be 2–100 characters', 400);
      const user = await prisma.user.update({ where: { id: uid(req) }, data: { name }, select: { id: true, email: true, name: true, role: true } });
      res.json({ success: true, data: user });
    } catch (e) { next(e); }
  },

  async changePassword(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
      const user = await prisma.user.findUnique({ where: { id: uid(req) }, select: { passwordHash: true } });
      if (!user) throw new AppError('User not found', 404);
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) throw new AppError('Current password is incorrect', 400);
      const hash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
      await prisma.user.update({ where: { id: uid(req) }, data: { passwordHash: hash } });
      await prisma.refreshToken.deleteMany({ where: { userId: uid(req) } });
      await audit(uid(req), 'account.password_changed', requestMeta(req));
      res.json({ success: true, data: { message: 'Password changed successfully' } });
    } catch (e) { next(e); }
  },

  /** Permanently deletes the user and everything they own (all relations cascade). */
  async deleteAccount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = uid(req);
      // Remove stored resume files first; the rows go with the user below
      const files = await prisma.resume.findMany({ where: { userId, storageKey: { not: null } }, select: { storageKey: true, storageProvider: true } });
      const unique = new Map(files.map(f => [f.storageKey!, f.storageProvider]));
      await Promise.all([...unique].map(([key, provider]) => storage.remove(provider, key)));
      // Applications reference jobs without cascade, so clear them first
      await prisma.$transaction([
        prisma.application.deleteMany({ where: { userId } }),
        prisma.user.delete({ where: { id: userId } }),
      ]);
      res.clearCookie('refreshToken', { path: '/api/auth' });
      res.clearCookie('refreshToken');
      res.json({ success: true, data: { message: 'Account deleted' } });
    } catch (e) { next(e); }
  },

  /** Deletes job-search data (applications, interviews, cover letters, saved/matched jobs) but keeps the account. */
  async deleteApplicationData(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = uid(req);
      await prisma.$transaction([
        prisma.interview.deleteMany({ where: { userId } }),
        prisma.coverLetter.deleteMany({ where: { userId } }),
        prisma.application.deleteMany({ where: { userId } }),
        prisma.jobMatch.deleteMany({ where: { userId } }),
        prisma.savedJob.deleteMany({ where: { userId } }),
        prisma.job.deleteMany({ where: { userId } }),
      ]);
      res.json({ success: true, data: { deleted: true } });
    } catch (e) { next(e); }
  },

  /** GDPR-style export of everything we hold for the user (no password hash / tokens). */
  async exportData(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = uid(req);
      const [user, profile, resumes, jobs, applications, interviews, coverLetters, conversations, preferences,
        recruiterMessages, savedJobs, jobMatches, notifications, aiUsage, auditLog] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, emailVerified: true, createdAt: true, lastLoginAt: true } }),
        prisma.profile.findUnique({ where: { userId }, include: { skills: true, experiences: true, educations: true, projects: true } }),
        prisma.resume.findMany({ where: { userId }, select: { id: true, name: true, isDefault: true, atsScore: true, extractedSkills: true, keywords: true, aiAnalysis: true, parsedData: true, createdAt: true } }),
        prisma.job.findMany({ where: { userId } }),
        prisma.application.findMany({ where: { userId }, include: { statusHistory: true, noteEntries: true } }),
        prisma.interview.findMany({ where: { userId }, include: { questions: true, sessions: true } }),
        prisma.coverLetter.findMany({ where: { userId } }),
        prisma.aIConversation.findMany({ where: { userId } }),
        prisma.userPreference.findUnique({ where: { userId } }),
        prisma.recruiterMessage.findMany({ where: { userId } }),
        prisma.savedJob.findMany({ where: { userId } }),
        prisma.jobMatch.findMany({ where: { userId } }),
        prisma.notification.findMany({ where: { userId } }),
        prisma.aIUsage.findMany({ where: { userId } }),
        prisma.auditLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 500 }),
      ]);
      await audit(userId, 'account.data_exported', requestMeta(req));
      res.setHeader('Content-Disposition', 'attachment; filename="careeros-export.json"');
      res.json({
        exportedAt: new Date().toISOString(), user, profile, resumes, jobs, applications, interviews, coverLetters, conversations, preferences,
        recruiterMessages, savedJobs, jobMatches, notifications, aiUsage, auditLog,
      });
    } catch (e) { next(e); }
  },

  // ── App settings (onboarding, AI prefs, integrations …) kept in UserPreference.extras ──
  async getSettings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const prefs = await prisma.userPreference.findUnique({ where: { userId: uid(req) } });
      const user = await prisma.user.findUnique({ where: { id: uid(req) }, select: { apiKeyPrefix: true } });
      res.json({
        success: true,
        data: {
          ...(prefs ?? {}), extras: prefs?.extras ?? {}, apiKeyPrefix: user?.apiKeyPrefix ?? null,
          aiModels: Object.entries(MODEL_OPTIONS).map(([id, m]) => ({ id, label: m.label })),
          defaultModel: env.AI_DEFAULT_MODEL,
        },
      });
    } catch (e) { next(e); }
  },

  async updateSettings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { extras, ...cols } = req.body as { extras?: Record<string, unknown> } & Record<string, unknown>;
      const BOOLS = ['emailJobAlerts', 'emailApplicationUpdates', 'emailInterviewReminders', 'emailWeeklySummary', 'inAppJobAlerts', 'inAppApplicationUpdates',
        'automationPaused', 'dailySummary', 'emailDailySummary', 'weeklyReport', 'resumeNudges'];
      const allowed = [...BOOLS, 'jobAlertMinMatchScore', 'theme', 'language', 'timezone'];
      const data: Record<string, unknown> = {};
      for (const k of allowed) {
        if (!(k in cols)) continue;
        if (BOOLS.includes(k) && typeof cols[k] !== 'boolean') throw new AppError(`${k} must be true or false`, 400, 'VALIDATION_ERROR');
        if (k === 'jobAlertMinMatchScore' && !(Number.isInteger(cols[k]) && (cols[k] as number) >= 0 && (cols[k] as number) <= 100)) throw new AppError('jobAlertMinMatchScore must be 0–100', 400, 'VALIDATION_ERROR');
        data[k] = cols[k];
      }

      if (extras && 'aiModel' in extras && !(String(extras['aiModel']) in MODEL_OPTIONS)) {
        throw new AppError('Unknown AI model', 400);
      }
      // avatars are stored inline; keep them small
      if (extras && typeof extras['avatar'] === 'string' && (extras['avatar'] as string).length > 300_000) {
        throw new AppError('Avatar image is too large (max ~200KB)', 413);
      }

      // Server-managed keys can't be set by the client (e.g. the job-fetch throttle)
      const clientExtras = { ...(extras ?? {}) };
      delete clientExtras['lastJobFetchAt'];
      if ('companyBoards' in clientExtras) {
        const b = (clientExtras['companyBoards'] ?? {}) as { greenhouse?: unknown; lever?: unknown };
        clientExtras['companyBoards'] = { greenhouse: cleanCompanySlugs(b.greenhouse), lever: cleanCompanySlugs(b.lever) };
      }
      if ('jobSources' in clientExtras) {
        clientExtras['jobSources'] = Array.isArray(clientExtras['jobSources'])
          ? (clientExtras['jobSources'] as unknown[]).filter(s => SOURCE_IDS.includes(s as JobSourceId))
          : [];
      }
      if ('autoFetchJobs' in clientExtras) clientExtras['autoFetchJobs'] = clientExtras['autoFetchJobs'] === true;

      const current = await prisma.userPreference.findUnique({ where: { userId: uid(req) }, select: { extras: true } });
      const merged = { ...((current?.extras ?? {}) as object), ...clientExtras };
      if (JSON.stringify(merged).length > 500_000) throw new AppError('Settings are too large', 413);
      const prefs = await prisma.userPreference.upsert({
        where: { userId: uid(req) },
        create: { userId: uid(req), ...data, extras: merged as object },
        update: { ...data, extras: merged as object },
      });
      res.json({ success: true, data: prefs });
    } catch (e) { next(e); }
  },

  // ── Personal API key (hash only is stored; shown once on creation) ──
  async createApiKey(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const key = `cos_${crypto.randomBytes(24).toString('hex')}`;
      await prisma.user.update({
        where: { id: uid(req) },
        data: { apiKeyHash: hashApiKey(key), apiKeyPrefix: key.slice(0, 8) },
      });
      await audit(uid(req), 'account.api_key_created', requestMeta(req));
      res.status(201).json({ success: true, data: { key, prefix: key.slice(0, 8) } });
    } catch (e) { next(e); }
  },

  async revokeApiKey(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await prisma.user.update({ where: { id: uid(req) }, data: { apiKeyHash: null, apiKeyPrefix: null } });
      res.json({ success: true, data: { revoked: true } });
    } catch (e) { next(e); }
  },

  async getPreferences(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const prefs = await prisma.userPreference.findUnique({ where: { userId: uid(req) } });
      res.json({ success: true, data: prefs });
    } catch (e) { next(e); }
  },

  async updatePreferences(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const prefs = await prisma.userPreference.upsert({
        where: { userId: uid(req) },
        update: req.body,
        create: { userId: uid(req), ...req.body },
      });
      res.json({ success: true, data: prefs });
    } catch (e) { next(e); }
  },
};
