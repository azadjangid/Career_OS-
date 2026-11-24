import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { AuthRequest } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { aiService } from '../../services/ai.service';
import { resumeText } from '../../lib/match';
import { buildCalendar, CalendarEvent } from '../../lib/ics';

const uid = (req: AuthRequest) => req.user!.id;
const param = (req: AuthRequest, k: string) => req.params[k] as string;

const withJob = {
  job: { select: { title: true, companyName: true, description: true, skills: true } },
  application: { select: { id: true, status: true, resumeId: true, job: { select: { title: true, companyName: true, description: true, skills: true } } } },
} satisfies Prisma.InterviewInclude;

type InterviewWithJob = Prisma.InterviewGetPayload<{ include: typeof withJob }>;

async function ownInterview(req: AuthRequest): Promise<InterviewWithJob> {
  const interview = await prisma.interview.findFirst({ where: { id: param(req, 'id'), userId: uid(req) }, include: withJob });
  if (!interview) throw new AppError('Interview not found', 404);
  return interview;
}

const jobOf = (i: InterviewWithJob) => i.job ?? i.application?.job ?? null;
const typeLabel = (t: string) => t.replace(/_/g, ' ').toLowerCase();

function toEvent(i: InterviewWithJob): CalendarEvent | null {
  if (!i.scheduledAt) return null;
  const job = jobOf(i);
  const what = job ? `${job.title} at ${job.companyName}` : 'Interview';
  const details = [
    `${typeLabel(i.type)} interview`,
    i.interviewer ? `With: ${i.interviewer}` : '',
    i.meetingUrl ? `Join: ${i.meetingUrl}` : '',
    i.notes ? `Notes: ${i.notes}` : '',
    'Added from CareerOS',
  ].filter(Boolean);
  return {
    uid: i.id,
    start: i.scheduledAt,
    durationMinutes: i.durationMinutes ?? 60,
    title: `Interview: ${what}`,
    description: details.join('\n'),
    location: i.location ?? i.meetingUrl ?? undefined,
    url: i.meetingUrl ?? undefined,
    updatedAt: i.updatedAt,
    cancelled: i.status === 'CANCELLED',
  };
}

function sendIcs(res: Response, filename: string, body: string) {
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(body);
}

async function resumeFor(userId: string, resumeId?: string | null): Promise<string> {
  const resume = await prisma.resume.findFirst({
    where: resumeId ? { id: resumeId, userId } : { userId },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    select: { parsedData: true },
  });
  return resume ? resumeText(resume) : '';
}

export const interviewsController = {
  /** Upcoming (default) or all interviews, soonest first. */
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const all = req.query['all'] === 'true';
      const interviews = await prisma.interview.findMany({
        where: { userId: uid(req), ...(all ? {} : { status: 'SCHEDULED', scheduledAt: { gte: new Date(Date.now() - 2 * 3_600_000) } }) },
        include: { ...withJob, _count: { select: { questions: true } } },
        orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
        take: 200,
      });
      res.json({ success: true, data: interviews });
    } catch (e) { next(e); }
  },

  async get(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const i = await ownInterview(req);
      const questions = await prisma.interviewQuestion.findMany({ where: { interviewId: i.id }, orderBy: { createdAt: 'asc' } });
      res.json({ success: true, data: { ...i, questions } });
    } catch (e) { next(e); }
  },

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const i = await ownInterview(req);
      const data = req.body as Prisma.InterviewUpdateInput;
      if (data.status === 'COMPLETED' && !i.completedAt) data.completedAt = new Date();
      const updated = await prisma.interview.update({ where: { id: i.id }, data });
      res.json({ success: true, data: updated });
    } catch (e) { next(e); }
  },

  async remove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const i = await ownInterview(req);
      await prisma.interview.delete({ where: { id: i.id } });
      res.json({ success: true, data: { deleted: true } });
    } catch (e) { next(e); }
  },

  /** One interview as an .ics file. */
  async calendarOne(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const i = await ownInterview(req);
      const event = toEvent(i);
      if (!event) throw new AppError('Set a date and time for this interview first', 400);
      sendIcs(res, `interview-${i.id}.ics`, buildCalendar([event]));
    } catch (e) { next(e); }
  },

  /** Every scheduled interview from the last week onwards as one .ics file. */
  async calendarAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const interviews = await prisma.interview.findMany({
        where: { userId: uid(req), scheduledAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
        include: withJob,
        orderBy: { scheduledAt: 'asc' },
      });
      const events = interviews.map(toEvent).filter((e): e is CalendarEvent => e !== null);
      sendIcs(res, 'careeros-interviews.ics', buildCalendar(events));
    } catch (e) { next(e); }
  },

  // ── Practice: AI questions for this interview, the user's answers, AI feedback ──

  async practiceQuestions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const i = await ownInterview(req);
      const job = jobOf(i);
      const { count } = req.body as { count: number };
      const generated = await aiService.generatePracticeQuestions(
        {
          jobTitle: job?.title ?? 'the role',
          company: job?.companyName ?? 'the company',
          jobDescription: job?.description ?? job?.skills.join(', ') ?? '',
          interviewType: typeLabel(i.type),
          resumeText: await resumeFor(uid(req), i.application?.resumeId),
          count,
        },
        uid(req),
      );
      if (!generated.length) throw new AppError('The AI did not return usable questions. Please try again.', 502);
      await prisma.interviewQuestion.createMany({
        data: generated.map(q => ({ interviewId: i.id, question: q.question, category: q.category, difficulty: q.difficulty, aiGenerated: true })),
      });
      const questions = await prisma.interviewQuestion.findMany({ where: { interviewId: i.id }, orderBy: { createdAt: 'asc' } });
      res.status(201).json({ success: true, data: questions });
    } catch (e) { next(e); }
  },

  async answerQuestion(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const i = await ownInterview(req);
      const q = await prisma.interviewQuestion.findFirst({ where: { id: param(req, 'questionId'), interviewId: i.id } });
      if (!q) throw new AppError('Question not found', 404);
      const { answer } = req.body as { answer: string };
      const feedback = await aiService.gradePracticeAnswer(
        { question: q.question, answer, jobTitle: jobOf(i)?.title ?? 'the role', interviewType: typeLabel(i.type) },
        uid(req),
      );
      const updated = await prisma.interviewQuestion.update({
        where: { id: q.id },
        data: { userAnswer: answer, aiFeedback: feedback as unknown as Prisma.InputJsonValue, score: feedback.score },
      });
      res.json({ success: true, data: updated });
    } catch (e) { next(e); }
  },

  async deleteQuestion(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const i = await ownInterview(req);
      await prisma.interviewQuestion.deleteMany({ where: { id: param(req, 'questionId'), interviewId: i.id } });
      res.json({ success: true, data: { deleted: true } });
    } catch (e) { next(e); }
  },
};
