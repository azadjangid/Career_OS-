import { z } from 'zod';

/** ISO date string → Date; rejects strings Date can't parse instead of storing "Invalid Date". */
const date = z.string().refine(v => !Number.isNaN(Date.parse(v)), 'Invalid date').transform(v => new Date(v));

export const updateProfileSchema = z.object({
  headline: z.string().max(200).optional(),
  summary: z.string().max(2000).optional(),
  phone: z.string().max(20).optional(),
  location: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  githubUrl: z.string().url().optional().or(z.literal('')),
  portfolioUrl: z.string().url().optional().or(z.literal('')),
  currentRole: z.string().max(100).optional(),
  currentCompany: z.string().max(100).optional(),
  yearsOfExp: z.number().min(0).max(50).optional(),
  targetRoles: z.array(z.string()).max(10).optional(),
  targetLocations: z.array(z.string()).max(10).optional(),
  remotePreference: z.enum(['REMOTE', 'HYBRID', 'ONSITE']).optional(),
  salaryMin: z.number().min(0).optional(),
  salaryMax: z.number().min(0).optional(),
  salaryCurrency: z.string().length(3).optional(),
  noticePeriod: z.string().max(50).optional(),
});

export const addSkillSchema = z.object({
  name: z.string().min(1).max(100),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']).default('INTERMEDIATE'),
  status: z.enum(['KNOWN', 'LEARNING', 'PRACTICING', 'COMPLETED']).default('KNOWN'),
  yearsOfExp: z.number().min(0).max(50).optional(),
  isPrimary: z.boolean().default(false),
  category: z.string().max(50).optional(),
});

export const addExperienceSchema = z.object({
  title: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  startDate: date,
  endDate: date.optional(),
  current: z.boolean().default(false),
  description: z.string().max(2000).optional(),
  technologies: z.array(z.string()).max(20).optional(),
});

export const addEducationSchema = z.object({
  degree: z.string().min(1).max(200),
  field: z.string().max(200).default(''),
  institution: z.string().min(1).max(200),
  startDate: date.default('2000-01-01'),
  endDate: date.optional(),
  grade: z.string().max(20).optional(),
});

export const addProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  url: z.string().url().optional().or(z.literal('')),
  repoUrl: z.string().url().optional().or(z.literal('')),
  technologies: z.array(z.string()).max(20).optional(),
  startDate: date.optional(),
  endDate: date.optional(),
});

// Updates accept the same fields as creation, all optional; unknown keys (e.g. profileId) are rejected
export const updateSkillSchema = addSkillSchema.partial().strict();
export const updateExperienceSchema = addExperienceSchema.partial().strict();
export const updateEducationSchema = addEducationSchema.partial().strict();
export const updateProjectSchema = addProjectSchema.partial().strict();

export const updatePreferencesSchema = z.object({
  emailJobAlerts: z.boolean(),
  emailApplicationUpdates: z.boolean(),
  emailInterviewReminders: z.boolean(),
  emailWeeklySummary: z.boolean(),
  inAppJobAlerts: z.boolean(),
  inAppApplicationUpdates: z.boolean(),
  jobAlertMinMatchScore: z.number().int().min(0).max(100),
  automationPaused: z.boolean(),
  dailySummary: z.boolean(),
  emailDailySummary: z.boolean(),
  weeklyReport: z.boolean(),
  resumeNudges: z.boolean(),
  theme: z.enum(['dark', 'light', 'system']),
  language: z.string().min(2).max(10),
  timezone: z.string().min(1).max(64),
}).partial().strict();
