import { z } from 'zod';

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
  startDate: z.string().transform(s => new Date(s)),
  endDate: z.string().transform(s => new Date(s)).optional(),
  current: z.boolean().default(false),
  description: z.string().max(2000).optional(),
  technologies: z.array(z.string()).max(20).optional(),
});

export const addEducationSchema = z.object({
  degree: z.string().min(1).max(200),
  field: z.string().max(200).default(''),
  institution: z.string().min(1).max(200),
  startDate: z.string().transform(s => new Date(s)).default('2000-01-01'),
  endDate: z.string().transform(s => new Date(s)).optional(),
  grade: z.string().max(20).optional(),
});

export const addProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  url: z.string().url().optional().or(z.literal('')),
  repoUrl: z.string().url().optional().or(z.literal('')),
  technologies: z.array(z.string()).max(20).optional(),
  startDate: z.string().transform(s => new Date(s)).optional(),
  endDate: z.string().transform(s => new Date(s)).optional(),
});
