// Application statuses must mirror the backend/Prisma ApplicationStatus enum.
export const STATUSES = [
  'SAVED', 'READY_TO_APPLY', 'APPLIED', 'ASSESSMENT', 'SCREENING', 'INTERVIEW',
  'TECHNICAL_ROUND', 'FINAL_ROUND', 'OFFER', 'REJECTED', 'WITHDRAWN',
] as const;
export type AppStatus = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<AppStatus, string> = {
  SAVED: 'Saved', READY_TO_APPLY: 'Ready to apply', APPLIED: 'Applied', ASSESSMENT: 'Assessment', SCREENING: 'Phone screen',
  INTERVIEW: 'Interview', TECHNICAL_ROUND: 'Technical', FINAL_ROUND: 'Final round',
  OFFER: 'Offer', REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn',
};

export const STATUS_BADGE: Record<AppStatus, string> = {
  SAVED: 'badge-muted', READY_TO_APPLY: 'badge-muted', APPLIED: 'badge-blue', ASSESSMENT: 'badge-blue', SCREENING: 'badge-amber',
  INTERVIEW: 'badge-amber', TECHNICAL_ROUND: 'badge-orange', FINAL_ROUND: 'badge-orange',
  OFFER: 'badge-green', REJECTED: 'badge-red', WITHDRAWN: 'badge-muted',
};

export const STATUS_COLOR: Record<AppStatus, string> = {
  SAVED: '#878BB0', READY_TO_APPLY: '#878BB0', APPLIED: '#60A5FA', ASSESSMENT: '#818CF8', SCREENING: '#FBBF24',
  INTERVIEW: '#F59E0B', TECHNICAL_ROUND: '#D8B46A', FINAL_ROUND: '#FB923C',
  OFFER: '#34D399', REJECTED: '#F87171', WITHDRAWN: '#64748B',
};

/** Full kanban board: one column per status the user drags between. */
export const BOARD_COLUMNS: AppStatus[] = [
  'SAVED', 'APPLIED', 'ASSESSMENT', 'SCREENING', 'INTERVIEW', 'TECHNICAL_ROUND', 'FINAL_ROUND', 'OFFER', 'REJECTED', 'WITHDRAWN',
];

/** Dashboard mini-board groups several statuses into the five stages from the product spec. */
export const MINI_BOARD: Array<{ key: string; label: string; statuses: AppStatus[]; color: string }> = [
  { key: 'applied', label: 'Applied', statuses: ['APPLIED', 'ASSESSMENT'], color: STATUS_COLOR.APPLIED },
  { key: 'phone', label: 'Phone Screen', statuses: ['SCREENING', 'INTERVIEW'], color: STATUS_COLOR.SCREENING },
  { key: 'technical', label: 'Technical', statuses: ['TECHNICAL_ROUND', 'FINAL_ROUND'], color: STATUS_COLOR.TECHNICAL_ROUND },
  { key: 'offer', label: 'Offer', statuses: ['OFFER'], color: STATUS_COLOR.OFFER },
  { key: 'rejected', label: 'Rejected', statuses: ['REJECTED'], color: STATUS_COLOR.REJECTED },
];

export const WORK_MODES = ['REMOTE', 'HYBRID', 'ONSITE'] as const;
export const EXPERIENCE_LEVELS = ['ENTRY', 'MID', 'SENIOR', 'LEAD', 'PRINCIPAL'] as const;
export const JOB_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE'] as const;
/** Values of Job.sourceName the list can filter on (Greenhouse and Lever add the board name after the label). */
export const SOURCE_FILTERS = ['Remotive', 'RemoteOK', 'Arbeitnow', 'Adzuna', 'Greenhouse', 'Lever', 'Added by you'] as const;
export const COMPANY_SIZES = ['1-50', '51-200', '201-1000', '1000+'] as const;

// Mirrors the API's job sources (GET /api/jobs/sources has the live availability)
export const JOB_SOURCES = [
  { id: 'remotive', label: 'Remotive', note: 'Remote jobs worldwide, free public feed', available: true },
  { id: 'remoteok', label: 'RemoteOK', note: 'Remote tech jobs, free public feed', available: true },
  { id: 'arbeitnow', label: 'Arbeitnow', note: 'Tech jobs, many remote, free public feed', available: true },
  { id: 'adzuna', label: 'Adzuna India', note: 'Jobs across India (needs an Adzuna key on the server)', available: true },
  { id: 'greenhouse', label: 'Greenhouse boards', note: 'Companies you pick in Settings → Job sources', available: true },
  { id: 'lever', label: 'Lever boards', note: 'Companies you pick in Settings → Job sources', available: true },
] as const;
