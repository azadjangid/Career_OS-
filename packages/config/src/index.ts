// Shared configuration constants

export const APP_NAME = 'CareerOS';
export const APP_VERSION = '1.0.0';

export const QUEUE_NAMES = {
  JOB_FETCH: 'job-fetch',
  JOB_MATCH: 'job-match',
  RESUME_PARSE: 'resume-parse',
  AI_PROCESS: 'ai-process',
  NOTIFICATIONS: 'notifications',
  REMINDERS: 'reminders',
} as const;

export const CACHE_TTL = {
  JOB_LIST: 60 * 5,         // 5 minutes
  JOB_DETAIL: 60 * 30,      // 30 minutes
  USER_PROFILE: 60 * 10,    // 10 minutes
  ANALYTICS: 60 * 60,       // 1 hour
} as const;

export const LIMITS = {
  MAX_RESUME_SIZE_MB: 10,
  MAX_RESUMES_PER_USER: 10,
  MAX_SKILLS_PER_PROFILE: 50,
  MAX_AI_REQUESTS_PER_DAY: 100,
  JOBS_PER_PAGE: 20,
  APPLICATIONS_PER_PAGE: 20,
} as const;

export const AI_MODELS = {
  DEFAULT: 'gpt-4o-mini',
  POWERFUL: 'gpt-4o',
  EMBEDDINGS: 'text-embedding-3-small',
} as const;
