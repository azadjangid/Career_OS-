import { Response, NextFunction } from 'express';
import { Prisma, SkillLevel } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { AuthRequest } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { extractResumeText } from '../../lib/resumeFiles';
import { resumeText } from '../../lib/match';
import { aiService } from '../../services/ai.service';

const uid = (req: AuthRequest) => req.user!.id;
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

      const count = await prisma.resume.count({ where: { userId: uid(req) } });
      const text = await extractResumeText(file.filename, file.originalname);

      const resume = await prisma.resume.create({
        data: {
          userId: uid(req),
          name: name?.trim() || file.originalname,
          isDefault: count === 0,
          fileUrl: `/uploads/${file.filename}`,
          fileName: file.originalname,
          fileSize: file.size,
          fileMimeType: file.mimetype,
          storageProvider: 'LOCAL',
          storageKey: file.filename,
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
          storageKey: null, // the original owns the file; deleting a copy must not remove it
          parsedData: (r.parsedData ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          keywords: r.keywords,
          extractedSkills: r.extractedSkills,
          atsScore: r.atsScore,
          aiAnalysis: (r.aiAnalysis ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          version: r.version + 1,
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
        if (!shared) await fs.unlink(path.resolve(env.STORAGE_LOCAL_PATH, resume.storageKey)).catch(() => {});
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

  async getVersions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const resume = await ownResume(req);
      const versions = await prisma.resumeVersion.findMany({ where: { resumeId: resume.id }, orderBy: { version: 'desc' } });
      res.json({ success: true, data: versions });
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
