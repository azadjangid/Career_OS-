import { z } from 'zod';

// Must mirror the Prisma ApplicationStatus enum
export const APPLICATION_STATUSES = [
  'SAVED', 'READY_TO_APPLY', 'APPLIED', 'SCREENING', 'INTERVIEW',
  'TECHNICAL_ROUND', 'FINAL_ROUND', 'OFFER', 'REJECTED', 'WITHDRAWN',
] as const;

const status = z.enum(APPLICATION_STATUSES);
const dateStr = z.string().refine(s => !Number.isNaN(Date.parse(s)), 'Invalid date').transform(s => new Date(s));

/** Either an existing job (jobId) or a manual entry (companyName + title). */
export const createApplicationSchema = z
  .object({
    jobId: z.string().min(1).optional(),
    companyName: z.string().min(1).max(200).optional(),
    title: z.string().min(1).max(200).optional(),
    applyUrl: z.string().url().optional().or(z.literal('')),
    resumeId: z.string().optional(),
    status: status.default('APPLIED'),
    appliedAt: dateStr.optional(),
    followUpAt: dateStr.optional(),
    notes: z.string().max(5000).optional(),
    coverLetterText: z.string().max(10000).optional(),
    salaryExpected: z.number().min(0).optional(),
  })
  .refine(d => d.jobId || (d.companyName && d.title), {
    message: 'Provide a jobId, or both companyName and title',
  });

export const updateApplicationSchema = z.object({
  status: status.optional(),
  resumeId: z.string().nullable().optional(),
  appliedAt: dateStr.optional(),
  notes: z.string().max(5000).optional(),
  coverLetterText: z.string().max(10000).optional(),
  salaryExpected: z.number().min(0).optional(),
  followUpAt: dateStr.nullable().optional(),
  rejectionReason: z.string().max(500).optional(),
  offerDetails: z.record(z.unknown()).optional(),
});

export const bulkSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  status: status.optional(),
});

export const noteSchema = z.object({ content: z.string().min(1).max(5000) });
