import type { AppStatus } from './constants';

export interface MatchInfo {
  score: number;
  matched: string[];
  missing: string[];
  total: number;
  source: 'ai' | 'skills';
}

export interface Job {
  id: string;
  title: string;
  companyName: string;
  location?: string | null;
  workMode?: string | null;
  jobType?: string | null;
  experienceLevel?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string;
  postedAt?: string | null;
  description?: string | null;
  skills: string[];
  applyUrl?: string | null;
  sourceName?: string | null;
  indiaEligible?: boolean | null;
  company?: { logo?: string | null; size?: string | null } | null;
  saved: boolean;
  application: { id: string; status: AppStatus } | null;
  match: MatchInfo;
}

export interface Application {
  id: string;
  status: AppStatus;
  appliedAt?: string | null;
  followUpAt?: string | null;
  updatedAt: string;
  createdAt: string;
  notes?: string | null;
  job: {
    id: string;
    title: string;
    companyName: string;
    location?: string | null;
    applyUrl?: string | null;
    skills: string[];
    company?: { logo?: string | null } | null;
    matches?: Array<{ overallScore: number; matchedSkills: string[]; missingSkills: string[] }>;
  };
  resume?: { id: string; name: string } | null;
  interviews?: Array<{ id: string; type: string; scheduledAt?: string | null; status: string }>;
}

export interface Resume {
  id: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  atsScore?: number | null;
  fileName?: string | null;
  fileSize?: number | null;
  createdAt: string;
  updatedAt: string;
  extractedSkills: string[];
  keywords: string[];
  version: number;
  aiAnalysis?: ResumeAnalysis | null;
}

export interface ResumeAnalysis {
  atsScore?: number;
  breakdown?: { keywords: number; ats: number; format: number; completeness: number };
  strengths?: string[];
  weaknesses?: string[];
  suggestions?: string[];
  keywords?: string[];
  skills?: string[];
  sectionScores?: Record<string, number>;
  jobComparison?: { matchScore: number; matchedKeywords: string[]; missingKeywords: string[]; missingSkills: string[]; advice: string[] };
  raw?: string;
}

export interface AtsCheck { id: string; label: string; passed: boolean; points: number; max: number; tip?: string }
export interface AtsReport {
  score: number;
  checks: AtsCheck[];
  wordCount: number;
  skills: string[];
  keywordMatch?: { score: number; matched: string[]; missing: string[]; against: string };
}

export type ResumeVersionSource = 'upload' | 'ai_improved' | 'manual' | 'restore';
export interface ResumeChange { section: string; original: string; improved: string; why: string }
export interface ResumeVersionSummary {
  id: string;
  version: number;
  label: string | null;
  source: ResumeVersionSource;
  atsScore: number | null;
  changes: string | null;
  explanations: ResumeChange[] | null;
  createdAt: string;
}
export interface ResumeVersionDetail extends ResumeVersionSummary { text: string | null; isCurrent: boolean }
export interface ResumeCompare {
  a: { id: string; version: number; label: string | null; source: ResumeVersionSource; atsScore: number | null; createdAt: string; isCurrent: boolean };
  b: ResumeCompare['a'];
  diff: Array<{ type: 'same' | 'added' | 'removed'; text: string }>;
  stats: { added: number; removed: number; unchanged: number };
  explanations: ResumeChange[] | null;
  changes: string | null;
}

export interface SavedSearch {
  id: string;
  name: string;
  filters: Record<string, string>;
  alertEnabled: boolean;
  lastRunAt?: string | null;
  lastNotifiedAt?: string | null;
  matches: number;
  createdAt: string;
}
