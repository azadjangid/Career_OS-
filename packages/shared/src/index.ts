// Shared utilities between frontend and backend

export const APPLICATION_STATUSES = [
  'SAVED', 'APPLYING', 'APPLIED', 'PHONE_SCREEN',
  'TECHNICAL', 'ONSITE', 'OFFER', 'NEGOTIATING',
  'ACCEPTED', 'REJECTED',
] as const;

export type ApplicationStatus = typeof APPLICATION_STATUSES[number];

export const WORK_MODES = ['REMOTE', 'HYBRID', 'ONSITE'] as const;
export type WorkMode = typeof WORK_MODES[number];

export const JOB_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE'] as const;
export type JobType = typeof JOB_TYPES[number];

export const SKILL_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] as const;
export type SkillLevel = typeof SKILL_LEVELS[number];

export function formatSalaryINR(amount: number): string {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  return `₹${(amount / 1000).toFixed(0)}K`;
}

export function formatStatus(s: string): string {
  return s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );
}
