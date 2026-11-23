import { prisma } from '../config/database';

export interface QuickMatch {
  score: number;
  matched: string[];
  missing: string[];
  total: number;
  source: 'ai' | 'skills';
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\.js$/, '').replace(/[^a-z0-9+#]/g, '');

/** Skills the user claims: profile skills + default/most recent resume's extracted skills. */
export async function userSkillSet(userId: string): Promise<Map<string, string>> {
  const [profile, resume] = await Promise.all([
    prisma.profile.findUnique({ where: { userId }, select: { skills: { select: { name: true } } } }),
    prisma.resume.findFirst({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      select: { extractedSkills: true },
    }),
  ]);
  const map = new Map<string, string>();
  for (const s of [...(profile?.skills.map(k => k.name) ?? []), ...(resume?.extractedSkills ?? [])]) {
    map.set(norm(s), s);
  }
  return map;
}

/** Cheap, deterministic skills overlap — used when no AI match exists for a job yet. */
export function quickMatch(jobSkills: string[], userSkills: Map<string, string>): QuickMatch {
  if (!jobSkills.length) return { score: 0, matched: [], missing: [], total: 0, source: 'skills' };
  const matched: string[] = [];
  const missing: string[] = [];
  for (const s of jobSkills) (userSkills.has(norm(s)) ? matched : missing).push(s);
  return {
    score: Math.round((matched.length / jobSkills.length) * 100),
    matched,
    missing,
    total: jobSkills.length,
    source: 'skills',
  };
}

/** Plain text of a resume: extracted text if present, else a JSON dump of parsed data. */
export function resumeText(resume: { parsedData: unknown; fileName?: string | null }): string {
  const d = resume.parsedData as { text?: string } | null;
  if (d && typeof d.text === 'string' && d.text.trim()) return d.text;
  return d ? JSON.stringify(d) : '';
}
