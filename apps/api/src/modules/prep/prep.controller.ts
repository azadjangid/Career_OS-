import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import { ExperienceLevel, Prisma } from '@prisma/client';
import { AuthRequest } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { aiService } from '../../services/ai.service';
import { resumeText } from '../../lib/match';
import { BANK, pickQuestions, TOPICS, type Topic } from '../../lib/interviewBank';

const uid = (req: AuthRequest) => req.user!.id;
const param = (req: AuthRequest, k: string) => req.params[k] as string;
const LEVELS = Object.values(ExperienceLevel) as string[];
const TOPIC_IDS = TOPICS.map(t => t.id) as string[];

export interface MockQuestion {
  id: string;
  question: string;
  category: string;
  difficulty: string;
  source: 'bank' | 'ai';
  keyPoints: string[];
  answer?: string;
  feedback?: { score: number; summary: string; strengths: string[]; improvements: string[]; sampleAnswer: string } | null;
  /** 0–100: AI score ×10, or the user's own 1–5 rating ×20 when graded without AI */
  score?: number | null;
  selfRating?: number | null;
}

async function ownSession(req: AuthRequest) {
  const s = await prisma.mockInterview.findFirst({ where: { id: param(req, 'id'), userId: uid(req) } });
  if (!s) throw new AppError('Practice session not found', 404);
  return s;
}

const questionsOf = (s: { questions: Prisma.JsonValue }) => (s.questions ?? []) as unknown as MockQuestion[];

function summarise(questions: MockQuestion[]) {
  const scored = questions.filter(q => typeof q.score === 'number');
  const byCat = new Map<string, number[]>();
  for (const q of scored) byCat.set(q.category, [...(byCat.get(q.category) ?? []), q.score!]);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const cats = [...byCat.entries()].map(([c, xs]) => ({ c, v: avg(xs) })).sort((a, b) => b.v - a.v);
  return {
    overallScore: scored.length ? Math.round(avg(scored.map(q => q.score!))) : null,
    summary: {
      answered: questions.filter(q => q.answer?.trim()).length,
      graded: scored.length,
      total: questions.length,
      strengths: cats.filter(x => x.v >= 70).map(x => x.c).slice(0, 3),
      focusAreas: cats.filter(x => x.v < 60).map(x => x.c).reverse().slice(0, 3),
      improvements: questions.flatMap(q => q.feedback?.improvements ?? []).slice(0, 5),
    },
  };
}

export const prepController = {
  /** Topics and how many built-in questions each has. */
  async topics(_req: AuthRequest, res: Response) {
    res.json({ success: true, data: TOPICS.map(t => ({ ...t, questions: t.id === 'role' ? null : BANK.filter(b => b.topic === t.id).length })) });
  },

  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const rows = await prisma.mockInterview.findMany({ where: { userId: uid(req) }, orderBy: { createdAt: 'desc' }, take: 50 });
      res.json({
        success: true,
        data: rows.map(r => {
          const qs = questionsOf(r);
          return { id: r.id, topic: r.topic, level: r.level, targetRole: r.targetRole, status: r.status, overallScore: r.overallScore, createdAt: r.createdAt, completedAt: r.completedAt, total: qs.length, answered: qs.filter(q => q.answer?.trim()).length };
        }),
      });
    } catch (e) { next(e); }
  },

  /** Starts a session from the built-in bank, or (topic "role") from AI-written questions for a job. */
  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const b = req.body as { topic?: unknown; level?: unknown; count?: unknown; jobId?: unknown; jobDescription?: unknown; targetRole?: unknown };
      const topic = String(b.topic ?? '');
      if (!TOPIC_IDS.includes(topic)) throw new AppError(`Pick a topic: ${TOPIC_IDS.join(', ')}`, 400, 'VALIDATION_ERROR');
      const level = (LEVELS.includes(String(b.level)) ? String(b.level) : await defaultLevel(uid(req))) as ExperienceLevel;
      const count = Math.min(Math.max(parseInt(String(b.count ?? 5)) || 5, 1), 10);
      let questions: MockQuestion[];
      let targetRole = typeof b.targetRole === 'string' ? b.targetRole.trim().slice(0, 120) : null;
      let jobId: string | null = null;

      if (topic === 'role') {
        let jd = typeof b.jobDescription === 'string' ? b.jobDescription.trim() : '';
        let company = 'the company';
        if (typeof b.jobId === 'string' && b.jobId) {
          const job = await prisma.job.findFirst({ where: { id: b.jobId, userId: uid(req) }, select: { id: true, title: true, companyName: true, description: true, skills: true } });
          if (!job) throw new AppError('Job not found', 404);
          jd = job.description || job.skills.join(', ');
          targetRole = job.title;
          company = job.companyName;
          jobId = job.id;
        }
        if (jd.length < 40) throw new AppError('Pick a saved job or paste a job description of at least a few lines', 400, 'VALIDATION_ERROR');
        const resume = await prisma.resume.findFirst({ where: { userId: uid(req) }, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] });
        const generated = await aiService.generatePracticeQuestions({
          jobTitle: `${targetRole ?? 'the role'} (${level.toLowerCase()} level)`, company, jobDescription: jd.slice(0, 8000),
          interviewType: 'mixed technical and behavioural', resumeText: resume ? resumeText(resume) : '', count,
        }, uid(req));
        if (!generated.length) throw new AppError('The AI did not return usable questions. Try again.', 502, 'AI_BAD_OUTPUT');
        questions = generated.map(g => ({ id: crypto.randomUUID(), question: g.question, category: g.category, difficulty: g.difficulty, source: 'ai', keyPoints: [] }));
      } else {
        // Prefer questions the user hasn't seen in their last few sessions of this topic
        const recent = await prisma.mockInterview.findMany({ where: { userId: uid(req), topic }, orderBy: { createdAt: 'desc' }, take: 3, select: { questions: true } });
        const seen = new Set(recent.flatMap(r => questionsOf(r).map(q => q.id)));
        questions = pickQuestions(topic as Topic, level, count, seen).map(q => ({
          id: q.id, question: q.question, category: q.category, difficulty: q.difficulty, source: 'bank', keyPoints: q.keyPoints,
        }));
      }
      const row = await prisma.mockInterview.create({
        data: { userId: uid(req), topic, level, jobId, targetRole, questions: questions as unknown as Prisma.InputJsonValue },
      });
      res.status(201).json({ success: true, data: row });
    } catch (e) { next(e); }
  },

  async get(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await ownSession(req) });
    } catch (e) { next(e); }
  },

  /** Saves an answer and grades it with AI. If AI isn't set up, the answer is still saved and the error says so. */
  async answer(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const s = await ownSession(req);
      const answer = typeof req.body?.answer === 'string' ? req.body.answer.trim() : '';
      if (answer.length < 10) throw new AppError('Write an answer of at least a sentence', 400, 'VALIDATION_ERROR');
      if (answer.length > 8000) throw new AppError('Answers are limited to 8,000 characters', 400, 'VALIDATION_ERROR');
      const qs = questionsOf(s);
      const q = qs.find(x => x.id === param(req, 'questionId'));
      if (!q) throw new AppError('Question not found', 404);
      q.answer = answer;
      // Save first so the answer is never lost, even if grading fails
      await prisma.mockInterview.update({ where: { id: s.id }, data: { questions: qs as unknown as Prisma.InputJsonValue } });
      const fb = await aiService.gradePracticeAnswer({
        question: q.question, answer, jobTitle: s.targetRole ?? `${s.topic} role`, interviewType: TOPICS.find(t => t.id === s.topic)?.label ?? s.topic,
        level: s.level, keyPoints: q.keyPoints,
      }, uid(req));
      q.feedback = fb;
      q.score = fb.score * 10;
      const { overallScore, summary } = summarise(qs);
      const updated = await prisma.mockInterview.update({ where: { id: s.id }, data: { questions: qs as unknown as Prisma.InputJsonValue, overallScore, summary } });
      res.json({ success: true, data: updated });
    } catch (e) { next(e); }
  },

  /** Without AI: the user compares their answer with the key points and rates it 1–5. */
  async selfRate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const s = await ownSession(req);
      const rating = Number(req.body?.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new AppError('Rating must be 1 to 5', 400, 'VALIDATION_ERROR');
      const qs = questionsOf(s);
      const q = qs.find(x => x.id === param(req, 'questionId'));
      if (!q) throw new AppError('Question not found', 404);
      if (typeof req.body?.answer === 'string' && req.body.answer.trim()) q.answer = String(req.body.answer).trim().slice(0, 8000);
      q.selfRating = rating;
      if (!q.feedback) q.score = rating * 20;
      const { overallScore, summary } = summarise(qs);
      const updated = await prisma.mockInterview.update({ where: { id: s.id }, data: { questions: qs as unknown as Prisma.InputJsonValue, overallScore, summary } });
      res.json({ success: true, data: updated });
    } catch (e) { next(e); }
  },

  async complete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const s = await ownSession(req);
      const { overallScore, summary } = summarise(questionsOf(s));
      const updated = await prisma.mockInterview.update({ where: { id: s.id }, data: { status: 'COMPLETED', completedAt: new Date(), overallScore, summary } });
      res.json({ success: true, data: updated });
    } catch (e) { next(e); }
  },

  async remove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const r = await prisma.mockInterview.deleteMany({ where: { id: param(req, 'id'), userId: uid(req) } });
      if (!r.count) throw new AppError('Practice session not found', 404);
      res.json({ success: true, data: { deleted: true } });
    } catch (e) { next(e); }
  },
};

/** Level from the profile's years of experience when the user doesn't pick one. */
async function defaultLevel(userId: string): Promise<ExperienceLevel> {
  const p = await prisma.profile.findUnique({ where: { userId }, select: { yearsOfExp: true } });
  const y = p?.yearsOfExp || 2; // 0 means "not set"
  return y < 1.5 ? 'ENTRY' : y < 5 ? 'MID' : y < 9 ? 'SENIOR' : 'LEAD';
}
