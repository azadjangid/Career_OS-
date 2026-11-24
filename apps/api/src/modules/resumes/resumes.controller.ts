import { Response, NextFunction } from 'express';
import { Prisma, SkillLevel } from '@prisma/client';
import crypto from 'crypto';
import { AuthRequest } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { detectResumeType, extractResumeText, RESUME_TYPES } from '../../lib/resumeFiles';
import { storage, currentProvider } from '../../lib/storage';
import { resumeText } from '../../lib/match';
import { aiService } from '../../services/ai.service';
import { scoreResume } from '../../lib/atsScore';
import { extractSkills, mergeSkills } from '../../lib/jobEnrich';
import { diffLines, diffStats } from '../../lib/textDiff';
import { userTargetSkills } from '../../lib/resumeInsights';

const uid = (req: AuthRequest) => req.user!.id;
const MAX_RESUMES = 20;
const param = (req: AuthRequest, k: string) => req.params[k] as string;

async function ownResume(req: AuthRequest) {
  const resume = await prisma.resume.findFirst({ where: { id: param(req, 'id'), userId: uid(req) } });
  if (!resume) throw new AppError('Resume not found', 404);
  return resume;
}

export const resumesController = {
  async listResumes(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const resumes = await prisma.resume.findMany({
        where: { userId: uid(req) },
        select: {
          id: true, name: true, description: true, isDefault: true, atsScore: true, createdAt: true, updatedAt: true,
          fileName: true, fileSize: true, extractedSkills: true, keywords: true, aiAnalysis: true, version: true,
        },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });
      res.json({ success: true, data: resumes });
    } catch (e) { next(e); }
  },

  async uploadResume(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const file = req.file;
      if (!file) throw new AppError('A PDF or DOCX file is required', 400);
      const { name } = req.body as { name?: string };

      const ext = detectResumeType(file.buffer, file.originalname);
      if (!ext) throw new AppError("This file isn't a valid PDF or DOCX. Export it again from Word or Google Docs and retry.", 415, 'UNSUPPORTED_FILE');

      const count = await prisma.resume.count({ where: { userId: uid(req) } });
      if (count >= MAX_RESUMES) throw new AppError(`You can keep up to ${MAX_RESUMES} resumes. Delete one to upload another.`, 409);
      const text = await extractResumeText(file.buffer, ext);

      const storageKey = `resumes/${uid(req)}/${crypto.randomBytes(16).toString('hex')}${ext}`;
      await storage.put(storageKey, file.buffer, RESUME_TYPES[ext]);

      const ats = text ? scoreResume(text) : null;
      const resume = await prisma.resume.create({
        data: {
          userId: uid(req),
          name: name?.trim().slice(0, 120) || file.originalname.slice(0, 120),
          extractedSkills: ats?.skills ?? [],
          atsScore: ats?.score ?? null,
          versions: { create: { version: 1, label: 'Original upload', text, source: 'upload', atsScore: ats?.score ?? null, storageKey } },
          isDefault: count === 0,
          fileUrl: null, // files are private: download through GET /api/resumes/:id/file
          fileName: file.originalname.slice(0, 200),
          fileSize: file.size,
          fileMimeType: RESUME_TYPES[ext],
          storageProvider: currentProvider(),
          storageKey,
          parsedData: { text },
        },
      });
      res.status(201).json({ success: true, data: { ...resume, hasText: text.length > 0 } });
    } catch (e) { next(e); }
  },

  async getResume(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const resume = await prisma.resume.findFirst({
        where: { id: param(req, 'id'), userId: uid(req) },
        include: { versions: { orderBy: { version: 'desc' } } },
      });
      if (!resume) throw new AppError('Resume not found', 404);
      res.json({ success: true, data: resume });
    } catch (e) { next(e); }
  },

  /** The original uploaded file, streamed only to its owner. */
  async downloadFile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const source = await ownResume(req);
      if (!source.storageKey) throw new AppError('The original file for this resume is no longer stored', 404);
      const body = await storage.get(source.storageProvider, source.storageKey).catch(() => {
        throw new AppError('The original file for this resume is no longer stored', 404);
      });
      const safeName = (source.fileName ?? 'resume').replace(/[^\w.\- ]+/g, '_');
      res.setHeader('Content-Type', source.fileMimeType ?? 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(body);
    } catch (e) { next(e); }
  },

  /** Text + structured data for the preview panel. */
  async getPreview(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const r = await ownResume(req);
      const parsed = (r.parsedData ?? {}) as { text?: string; structured?: unknown };
      res.json({ success: true, data: { id: r.id, name: r.name, text: parsed.text ?? '', structured: parsed.structured ?? null } });
    } catch (e) { next(e); }
  },

  async updateResume(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const r = await ownResume(req);
      const { name, description } = req.body as { name?: string; description?: string };
      const data: Prisma.ResumeUpdateInput = {};
      if (typeof name === 'string' && name.trim()) data.name = name.trim().slice(0, 120);
      if (typeof description === 'string') data.description = description.slice(0, 500);
      const updated = await prisma.resume.update({ where: { id: r.id }, data });
      res.json({ success: true, data: updated });
    } catch (e) { next(e); }
  },

  /** New resume record sharing the same stored file + parsed text, for tailoring variants ("Resume v2 - Frontend"). */
  async duplicateResume(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const r = await ownResume(req);
      const copy = await prisma.resume.create({
        data: {
          userId: uid(req),
          name: (req.body as { name?: string }).name?.trim() || `${r.name} (copy)`,
          description: r.description,
          fileUrl: r.fileUrl, fileName: r.fileName, fileSize: r.fileSize, fileMimeType: r.fileMimeType,
          storageProvider: r.storageProvider,
          // Copies share the stored file; delete only removes it once no resume points at it
          storageKey: r.storageKey,
          parsedData: (r.parsedData ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          keywords: r.keywords,
          extractedSkills: r.extractedSkills,
          atsScore: r.atsScore,
          aiAnalysis: (r.aiAnalysis ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          version: 1,
          versions: { create: { version: 1, label: `Copied from “${r.name.slice(0, 80)}”`, text: resumeText(r), source: 'manual', atsScore: r.atsScore, storageKey: r.storageKey } },
        },
      });
      res.status(201).json({ success: true, data: copy });
    } catch (e) { next(e); }
  },

  async deleteResume(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const resume = await ownResume(req);
      if (resume.storageKey) {
        // Only remove the file if no other resume record still points at it
        const shared = await prisma.resume.count({ where: { storageKey: resume.storageKey, id: { not: resume.id } } });
        if (!shared) await storage.remove(resume.storageProvider, resume.storageKey);
      }
      await prisma.resume.delete({ where: { id: resume.id } });
      res.json({ success: true, data: { deleted: true } });
    } catch (e) { next(e); }
  },

  async setDefault(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const resume = await ownResume(req);
      await prisma.$transaction([
        prisma.resume.updateMany({ where: { userId: uid(req) }, data: { isDefault: false } }),
        prisma.resume.update({ where: { id: resume.id }, data: { isDefault: true } }),
      ]);
      res.json({ success: true, data: { isDefault: true } });
    } catch (e) { next(e); }
  },

  /** Version history, newest first. Resumes uploaded before versions existed get their v1 on first view. */
  async getVersions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const resume = await ownResume(req);
      await ensureBaseVersion(resume);
      const versions = await prisma.resumeVersion.findMany({
        where: { resumeId: resume.id },
        orderBy: { version: 'desc' },
        select: { id: true, version: true, label: true, source: true, atsScore: true, changes: true, explanations: true, createdAt: true },
      });
      const current = await prisma.resume.findUnique({ where: { id: resume.id }, select: { version: true } });
      res.json({ success: true, data: { current: current?.version ?? resume.version, versions } });
    } catch (e) { next(e); }
  },

  async getVersion(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const resume = await ownResume(req);
      const v = await prisma.resumeVersion.findFirst({ where: { id: param(req, 'versionId'), resumeId: resume.id } });
      if (!v) throw new AppError('Version not found', 404);
      res.json({ success: true, data: { ...v, isCurrent: v.version === resume.version } });
    } catch (e) { next(e); }
  },

  /** Save edited text as a new version and make it the current one. */
  async createVersion(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const resume = await ownResume(req);
      const { text, label } = req.body as { text?: unknown; label?: unknown };
      if (typeof text !== 'string' || text.trim().length < 50) throw new AppError('Resume text must be at least 50 characters', 400, 'VALIDATION_ERROR');
      if (text.length > 60_000) throw new AppError('Resume text is too long (60,000 characters max)', 400, 'VALIDATION_ERROR');
      await ensureBaseVersion(resume);
      const v = await addVersion(resume.id, {
        text: text.trim(), source: 'manual', label: typeof label === 'string' && label.trim() ? label.trim().slice(0, 120) : 'Edited by you',
      });
      await makeCurrent(resume.id, v.version, v.text ?? '');
      res.status(201).json({ success: true, data: v });
    } catch (e) { next(e); }
  },

  /** Make an older (or AI-improved) version the current one. Nothing is deleted. */
  async restoreVersion(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const resume = await ownResume(req);
      const v = await prisma.resumeVersion.findFirst({ where: { id: param(req, 'versionId'), resumeId: resume.id } });
      if (!v) throw new AppError('Version not found', 404);
      if (!v.text?.trim()) throw new AppError('This version has no saved text, so it cannot be restored', 422);
      await makeCurrent(resume.id, v.version, v.text);
      res.json({ success: true, data: { current: v.version } });
    } catch (e) { next(e); }
  },

  /** Deterministic ATS score (no AI). With ?jobId= it also checks keywords against that job; otherwise against the user's saved jobs. */
  async atsScore(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const resume = await ownResume(req);
      const text = resumeText(resume);
      if (!text.trim()) throw new AppError('Could not read any text from this resume. Re-upload a text-based PDF or a DOCX.', 422);
      const jobId = typeof req.query['jobId'] === 'string' ? req.query['jobId'] : undefined;
      const target = await userTargetSkills(uid(req), jobId);
      const report = scoreResume(text, target ?? undefined);
      // Keep the list badge current when no AI analysis has set a score yet
      if (!jobId && resume.atsScore == null) await prisma.resume.update({ where: { id: resume.id }, data: { atsScore: report.score } });
      res.json({ success: true, data: report });
    } catch (e) { next(e); }
  },

  /** AI-improved copy with explanations, saved as a new version. The current version stays until the user picks the new one. */
  async improveResume(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const resume = await ownResume(req);
      const text = resumeText(resume);
      if (text.trim().length < 50) throw new AppError('Could not read enough text from this resume to improve it.', 422);
      const { jobId, jobDescription } = req.body as { jobId?: string; jobDescription?: string };
      let jd = typeof jobDescription === 'string' ? jobDescription.trim() : '';
      let jobLabel = '';
      if (jobId) {
        const job = await prisma.job.findFirst({ where: { id: jobId, userId: uid(req) }, select: { title: true, companyName: true, description: true } });
        if (!job) throw new AppError('Job not found', 404);
        jd = job.description ?? '';
        jobLabel = `${job.title} at ${job.companyName}`;
      }
      await ensureBaseVersion(resume);
      const result = await aiService.improveResume(text, uid(req), jd || undefined);
      const v = await addVersion(resume.id, {
        text: result.improvedText,
        source: 'ai_improved',
        label: (jobLabel ? `AI-improved for ${jobLabel}` : jd ? 'AI-improved for a job description' : 'AI-improved').slice(0, 120),
        changes: result.summary.slice(0, 1000) || null,
        explanations: result.changes,
      });
      const before = scoreResume(text);
      res.status(201).json({ success: true, data: { version: v, before: before.score, after: v.atsScore, summary: result.summary, changes: result.changes } });
    } catch (e) { next(e); }
  },

  /** Line diff and score change between two versions, older → newer (default: the version in use vs the newest other one). */
  async compareVersions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const resume = await ownResume(req);
      await ensureBaseVersion(resume);
      const all = await prisma.resumeVersion.findMany({ where: { resumeId: resume.id }, orderBy: { version: 'desc' } });
      const pick = (id: unknown) => (typeof id === 'string' ? all.find(v => v.id === id) : undefined);
      const a = pick(req.query['a']) ?? all.find(v => v.version === resume.version) ?? all[all.length - 1];
      const b = pick(req.query['b']) ?? all.find(v => v.id !== a?.id) ?? a;
      if (!a || !b) throw new AppError('This resume has no versions to compare yet', 404);
      if ((typeof req.query['a'] === 'string' && pick(req.query['a']) === undefined) || (typeof req.query['b'] === 'string' && pick(req.query['b']) === undefined)) {
        throw new AppError('Version not found', 404);
      }
      // Always read as "older → newer", whichever order the versions were picked in
      const [from, to] = a.version <= b.version ? [a, b] : [b, a];
      const diff = diffLines(from.text ?? '', to.text ?? '');
      const summary = (v: typeof a) => ({ id: v.id, version: v.version, label: v.label, source: v.source, atsScore: v.atsScore, createdAt: v.createdAt, isCurrent: v.version === resume.version });
      res.json({ success: true, data: { a: summary(from), b: summary(to), diff, stats: diffStats(diff), explanations: to.explanations ?? null, changes: to.changes } });
    } catch (e) { next(e); }
  },

  /**
   * AI-parse the resume into structured data, store it, and (optionally) fill the user's profile.
   * Only fills profile fields that are currently empty unless `overwrite` is set — never clobbers edits.
   */
  async parseResume(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { applyToProfile = false, overwrite = false } = req.body as { applyToProfile?: boolean; overwrite?: boolean };
      const resume = await ownResume(req);
      const text = resumeText(resume);
      if (text.length < 50) throw new AppError('Could not read any text from this file. Try a text-based PDF or a DOCX.', 422);

      const structured = await aiService.parseResumeToProfile(text, uid(req));
      const prevText = (resume.parsedData as { text?: string } | null)?.text ?? text;

      await prisma.resume.update({
        where: { id: resume.id },
        data: {
          parsedData: { text: prevText, structured } as unknown as Prisma.InputJsonValue,
          extractedSkills: structured.skills,
        },
      });

      let applied = false;
      if (applyToProfile) {
        applied = true;
        await applyParsedToProfile(uid(req), structured, overwrite);
      }
      res.json({ success: true, data: { structured, applied } });
    } catch (e) { next(e); }
  },
};

type ResumeRow = Awaited<ReturnType<typeof ownResume>>;

/** Creates v1 from the stored text for resumes that predate version history. */
async function ensureBaseVersion(resume: ResumeRow): Promise<void> {
  const count = await prisma.resumeVersion.count({ where: { resumeId: resume.id } });
  if (count) return;
  const text = resumeText(resume);
  await prisma.resumeVersion.create({
    data: { resumeId: resume.id, version: resume.version, label: 'Original upload', text, source: 'upload', atsScore: text ? scoreResume(text).score : null, storageKey: resume.storageKey },
  });
}

async function addVersion(resumeId: string, v: { text: string; source: string; label: string; changes?: string | null; explanations?: unknown }) {
  // Serialisable retry keeps version numbers unique if two saves race
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const last = await tx.resumeVersion.findFirst({ where: { resumeId }, orderBy: { version: 'desc' }, select: { version: true } });
        return tx.resumeVersion.create({
          data: {
            resumeId, version: (last?.version ?? 0) + 1, text: v.text, source: v.source, label: v.label, changes: v.changes ?? null,
            explanations: v.explanations === undefined ? Prisma.JsonNull : (v.explanations as Prisma.InputJsonValue),
            atsScore: scoreResume(v.text).score,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (e) {
      if (attempt < 2 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') continue;
      throw e;
    }
  }
}

/** Points the resume at a version: its text becomes the one used for matching, tailoring and cover letters. */
async function makeCurrent(resumeId: string, version: number, text: string): Promise<void> {
  const r = await prisma.resume.findUniqueOrThrow({ where: { id: resumeId }, select: { parsedData: true, extractedSkills: true } });
  const structured = (r.parsedData as { structured?: { skills?: string[] } } | null)?.structured;
  const lower = text.toLowerCase();
  // Keep AI-parsed skills that still appear in the text, plus everything the dictionary finds
  const aiSkills = (structured?.skills ?? r.extractedSkills).filter(s => lower.includes(s.toLowerCase()));
  const report = scoreResume(text);
  await prisma.resume.update({
    where: { id: resumeId },
    data: {
      version,
      parsedData: { text, ...(structured ? { structured } : {}) } as unknown as Prisma.InputJsonValue,
      extractedSkills: mergeSkills(aiSkills, extractSkills(text)),
      atsScore: report.score,
      // An AI analysis describes the old text, so it no longer applies
      aiAnalysis: Prisma.JsonNull,
      keywords: [],
    },
  });
}

export interface ParsedResume {
  fullName?: string; headline?: string; summary?: string; phone?: string; location?: string;
  currentRole?: string; currentCompany?: string; yearsOfExp?: number;
  linkedinUrl?: string; githubUrl?: string; portfolioUrl?: string;
  skills: string[];
  experience: Array<{ title: string; company: string; location?: string; startDate?: string; endDate?: string | null; current?: boolean; description?: string }>;
  education: Array<{ degree: string; field?: string; institution: string; startDate?: string; endDate?: string | null }>;
}

const validDate = (s?: string | null) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s) : undefined);

export async function applyParsedToProfile(userId: string, p: ParsedResume, overwrite: boolean): Promise<void> {
  const profile = await prisma.profile.upsert({ where: { userId }, create: { userId }, update: {}, include: { skills: true, experiences: true, educations: true } });

  const scalars = {
    headline: p.headline, summary: p.summary, phone: p.phone, location: p.location,
    currentRole: p.currentRole, currentCompany: p.currentCompany,
    linkedinUrl: p.linkedinUrl, githubUrl: p.githubUrl, portfolioUrl: p.portfolioUrl,
  } as const;
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(scalars)) {
    const existing = (profile as unknown as Record<string, unknown>)[k];
    if (v && (overwrite || !existing)) data[k] = v;
  }
  if (typeof p.yearsOfExp === 'number' && (overwrite || !profile.yearsOfExp)) data['yearsOfExp'] = p.yearsOfExp;
  if (Object.keys(data).length) await prisma.profile.update({ where: { id: profile.id }, data });

  const have = new Set(profile.skills.map(s => s.name.toLowerCase()));
  const newSkills = [...new Set(p.skills.map(s => s.trim()).filter(Boolean))].filter(s => !have.has(s.toLowerCase())).slice(0, 40);
  if (newSkills.length) {
    await prisma.skill.createMany({
      data: newSkills.map(name => ({ profileId: profile.id, name, level: 'INTERMEDIATE' as SkillLevel })),
      skipDuplicates: true,
    });
  }

  // Add experience/education only when the profile has none, so re-parsing never duplicates entries
  if (!profile.experiences.length && p.experience.length) {
    await prisma.experience.createMany({
      data: p.experience.slice(0, 15).map(e => ({
        profileId: profile.id, title: e.title, company: e.company, location: e.location,
        startDate: validDate(e.startDate) ?? new Date('2000-01-01'),
        endDate: validDate(e.endDate) ?? null, current: !!e.current, description: e.description,
      })),
    });
  }
  if (!profile.educations.length && p.education.length) {
    await prisma.education.createMany({
      data: p.education.slice(0, 10).map(e => ({
        profileId: profile.id, degree: e.degree, field: e.field ?? '', institution: e.institution,
        startDate: validDate(e.startDate) ?? new Date('2000-01-01'), endDate: validDate(e.endDate) ?? null,
      })),
    });
  }
}
