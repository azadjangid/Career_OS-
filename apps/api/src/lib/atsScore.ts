import { extractSkills } from './jobEnrich';

/**
 * Deterministic ATS readiness score for a resume's plain text. It checks what applicant tracking
 * systems and recruiters reliably look for (contact details, standard sections, length, measurable
 * results, skills). No AI involved, so it works without any key and gives the same answer every time.
 */

export interface AtsCheck {
  id: string;
  label: string;
  passed: boolean;
  points: number;
  max: number;
  tip?: string;
}

export interface AtsReport {
  score: number;
  checks: AtsCheck[];
  wordCount: number;
  skills: string[];
  /** Present when a job (or the user's saved jobs) was compared */
  keywordMatch?: { score: number; matched: string[]; missing: string[]; against: string };
}

const SECTION_PATTERNS: Record<string, RegExp> = {
  experience: /^\s*(work experience|professional experience|experience|employment history|work history)\b/im,
  education: /^\s*(education|academic background|qualifications)\b/im,
  skills: /^\s*(skills|technical skills|core skills|key skills|technologies|tech stack)\b/im,
  summary: /^\s*(summary|professional summary|profile|about me|objective|career objective)\b/im,
  projects: /^\s*(projects|personal projects|key projects|selected projects)\b/im,
};

const ACTION_VERBS = /\b(built|led|designed|developed|implemented|improved|reduced|increased|launched|migrated|optimi[sz]ed|automated|created|delivered|owned|shipped|architected|mentored|scaled|refactored|integrated|managed|drove|cut|grew|introduced|established)\b/gi;

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(\+?\d[\d\s().-]{8,}\d)/;
const LINK = /(linkedin\.com\/in\/|github\.com\/|https?:\/\/)/i;

export function scoreResume(text: string, target?: { skills: string[]; label: string }): AtsReport {
  const t = (text ?? '').replace(/\r/g, '');
  const words = t.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
  const bullets = lines.filter(l => /^([•▪●◦‣\-*–]|\d+[.)])\s+/.test(l));
  const quantified = lines.filter(l => /(\d+\s?%|\b\d{2,}[kKmM+]?\b|[$₹€£]\s?\d)/.test(l) && !/^\D*(19|20)\d{2}\s*[-–]\s*((19|20)\d{2}|present)/i.test(l));
  const verbs = new Set((t.match(ACTION_VERBS) ?? []).map(v => v.toLowerCase()));
  const skills = extractSkills(t);
  const has = (k: keyof typeof SECTION_PATTERNS) => SECTION_PATTERNS[k]!.test(t);
  const years = t.match(/\b(19|20)\d{2}\b/g) ?? [];

  const checks: AtsCheck[] = [];
  const add = (id: string, label: string, max: number, earned: number, tip: string) => {
    const points = Math.max(0, Math.min(max, Math.round(earned)));
    checks.push({ id, label, max, points, passed: points >= max * 0.7, tip: points >= max * 0.7 ? undefined : tip });
  };

  add('readable', 'Text can be read by an ATS', 10, wordCount >= 80 ? 10 : wordCount / 8,
    'Very little text could be read. Export a text-based PDF or a DOCX instead of a scanned image.');
  add('email', 'Email address', 6, EMAIL.test(t) ? 6 : 0, 'Add a professional email address at the top.');
  add('phone', 'Phone number', 4, PHONE.test(t) ? 4 : 0, 'Add a phone number with country code, e.g. +91.');
  add('links', 'LinkedIn, GitHub or portfolio link', 4, LINK.test(t) ? 4 : 0, 'Add your LinkedIn and GitHub or portfolio URL.');
  add('experience', 'Experience section', 12, has('experience') ? 12 : 0, 'Use a clear "Experience" heading so the ATS finds your roles.');
  add('education', 'Education section', 6, has('education') ? 6 : 0, 'Add an "Education" section with degree, institution and year.');
  add('skills_section', 'Skills section', 8, has('skills') ? 8 : 0, 'Add a "Skills" section listing your main technologies.');
  add('summary', 'Summary at the top', 4, has('summary') ? 4 : 0, 'Add a 2–3 line summary with your role, years of experience and focus.');
  add('length', 'Length (300–1,100 words)', 8,
    wordCount >= 300 && wordCount <= 1100 ? 8 : wordCount < 300 ? (wordCount / 300) * 8 : Math.max(0, 8 - (wordCount - 1100) / 100),
    wordCount < 300 ? 'The resume is short. Describe what you built and its impact for each role.' : 'The resume is long. Keep it to one or two pages and cut older detail.');
  add('bullets', 'Achievements written as bullet points', 8, Math.min(8, bullets.length), 'Write each role as 3–6 bullet points starting with an action verb.');
  add('metrics', 'Measurable results (numbers, %)', 12, Math.min(12, quantified.length * 3),
    'Add real numbers to your achievements, e.g. "cut page load time by 40%" or "served 2M users".');
  add('verbs', 'Strong action verbs', 6, Math.min(6, verbs.size), 'Start bullets with verbs like built, led, reduced, shipped or automated.');
  add('skills', 'Recognised technical skills', 8, Math.min(8, skills.length), 'Name the specific tools and languages you use, e.g. React, TypeScript, Node.js.');
  add('dates', 'Dates for roles and education', 4, years.length >= 2 ? 4 : years.length * 2, 'Add start and end dates (month and year) for each role.');

  const report: AtsReport = { score: 0, checks, wordCount, skills };
  let total = checks.reduce((s, c) => s + c.points, 0);
  let max = checks.reduce((s, c) => s + c.max, 0);

  if (target && target.skills.length) {
    const have = new Set(skills.map(s => s.toLowerCase()));
    const lower = t.toLowerCase();
    const matched: string[] = [];
    const missing: string[] = [];
    for (const s of dedupe(target.skills)) (have.has(s.toLowerCase()) || lower.includes(s.toLowerCase()) ? matched : missing).push(s);
    const kScore = Math.round((matched.length / (matched.length + missing.length)) * 100);
    report.keywordMatch = { score: kScore, matched, missing, against: target.label };
    // Keyword fit counts for a fifth of the score when comparing against a job
    total += (kScore / 100) * 25;
    max += 25;
  }
  report.score = Math.round((total / max) * 100);
  return report;
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  return list.map(s => s.trim()).filter(s => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
}

/** Most requested skills across a set of jobs, with how many jobs ask for each. */
export function topSkills(jobs: Array<{ skills: string[] }>, limit = 15): Array<{ skill: string; count: number }> {
  const counts = new Map<string, { skill: string; count: number }>();
  for (const j of jobs) {
    for (const s of new Set(j.skills.map(x => x.trim()).filter(Boolean))) {
      const k = s.toLowerCase();
      const cur = counts.get(k);
      if (cur) cur.count++;
      else counts.set(k, { skill: s, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill)).slice(0, limit);
}
