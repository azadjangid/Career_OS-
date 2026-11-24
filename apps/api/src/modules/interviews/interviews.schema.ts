import { z } from 'zod';

export const INTERVIEW_TYPES = ['HR', 'TECHNICAL', 'SYSTEM_DESIGN', 'CODING', 'BEHAVIORAL', 'FINAL', 'OTHER'] as const;
export const INTERVIEW_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'] as const;

const dateStr = z.string().refine(s => !Number.isNaN(Date.parse(s)), 'Invalid date').transform(s => new Date(s));
const optionalText = (max: number) => z.string().max(max).optional().or(z.literal('').transform(() => undefined));

export const createInterviewSchema = z.object({
  type: z.enum(INTERVIEW_TYPES).default('TECHNICAL'),
  scheduledAt: dateStr.optional(),
  durationMinutes: z.number().int().min(5).max(600).optional(),
  location: optionalText(300),
  meetingUrl: z.string().url().max(1000).optional().or(z.literal('').transform(() => undefined)),
  interviewer: optionalText(200),
  notes: optionalText(5000),
});

export const updateInterviewSchema = z.object({
  type: z.enum(INTERVIEW_TYPES).optional(),
  status: z.enum(INTERVIEW_STATUSES).optional(),
  scheduledAt: dateStr.nullable().optional(),
  durationMinutes: z.number().int().min(5).max(600).nullable().optional(),
  location: z.string().max(300).nullable().optional(),
  meetingUrl: z.string().url().max(1000).nullable().optional().or(z.literal('').transform(() => null)),
  interviewer: z.string().max(200).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  feedback: z.string().max(5000).nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
});

export const practiceQuestionsSchema = z.object({
  count: z.number().int().min(1).max(10).default(5),
});

export const practiceAnswerSchema = z.object({
  answer: z.string().trim().min(10, 'Write at least a sentence so there is something to give feedback on').max(6000),
});
