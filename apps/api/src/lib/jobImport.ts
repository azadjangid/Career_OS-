import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { cleanCompanySlugs, fetchFromSource, JobSourceId, listJobSources, NewJob, SOURCE_IDS } from './jobFeeds';
import { dedupeKey, detectExperienceLevel, detectIndiaEligible, extractSkills, mergeSkills, sourceNameFromExternalId } from './jobEnrich';

/** Adds skills, seniority, India eligibility, a readable source and the duplicate key to a fetched job. */
export function enrichJob(j: NewJob): NewJob & { dedupeKey: string } {
  const tags = Array.isArray(j.skills) ? (j.skills as string[]) : [];
  const workMode = (j.workMode ?? 'HYBRID') as 'REMOTE' | 'HYBRID' | 'ONSITE';
  return {
    ...j,
    skills: mergeSkills(tags, extractSkills(j.title, tags.join(' '), j.description ?? '')),
    experienceLevel: j.experienceLevel ?? detectExperienceLevel(j.title, j.description),
    indiaEligible: detectIndiaEligible(j.location, workMode, j.description),
    sourceName: sourceNameFromExternalId(j.externalId),
    dedupeKey: dedupeKey(j.companyName, j.title),
  };
}

export interface JobSourceSettings {
  sources: JobSourceId[];
  greenhouse: string[];
  lever: string[];
  autoFetch: boolean;
}

/** The user's job-source choices, stored in UserPreference.extras. Defaults to Remotive only. */
export function readJobSourceSettings(extras: Record<string, unknown>): JobSourceSettings {
  const sources = Array.isArray(extras['jobSources'])
    ? (extras['jobSources'] as unknown[]).filter((s): s is JobSourceId => SOURCE_IDS.includes(s as JobSourceId))
    : [];
  const boards = (extras['companyBoards'] ?? {}) as { greenhouse?: unknown; lever?: unknown };
  return {
    sources: sources.length ? sources : ['remotive'],
    greenhouse: cleanCompanySlugs(boards.greenhouse),
    lever: cleanCompanySlugs(boards.lever),
    autoFetch: extras['autoFetchJobs'] === true,
  };
}

export interface ImportResult {
  fetched: number;
  created: number;
  /** Same company + title already in the user's list from another source (or earlier in this batch) */
  duplicates: number;
  newIds: string[];
  bySource: Array<{ source: string; fetched: number; error?: string }>;
}

/** Pulls jobs from the chosen sources into the user's job list, skipping ones already imported. */
export async function importJobsForUser(
  userId: string,
  settings: Pick<JobSourceSettings, 'sources' | 'greenhouse' | 'lever'>,
  search = '',
): Promise<ImportResult> {
  const available = new Set(listJobSources().filter(s => s.available).map(s => s.id));
  const sources = settings.sources.filter(s => available.has(s));
  const results = await Promise.allSettled(
    sources.map(s => fetchFromSource(s, { search, greenhouse: settings.greenhouse, lever: settings.lever })),
  );

  const bySource: ImportResult['bySource'] = [];
  const incoming = results.flatMap((r, i) => {
    if (r.status === 'fulfilled') {
      bySource.push({ source: sources[i]!, fetched: r.value.length });
      return r.value;
    }
    bySource.push({ source: sources[i]!, fetched: 0, error: (r.reason as Error).message });
    return [];
  });

  const existing = new Set(
    (
      await prisma.job.findMany({
        where: { userId, sourceId: null, externalId: { in: incoming.map(j => j.externalId) } },
        select: { externalId: true },
      })
    ).map(j => j.externalId),
  );

  const fresh = incoming.filter(j => !existing.has(j.externalId)).map(enrichJob);
  const knownKeys = new Set(
    (
      await prisma.job.findMany({
        where: { userId, dedupeKey: { in: [...new Set(fresh.map(j => j.dedupeKey))] } },
        select: { dedupeKey: true },
      })
    ).map(j => j.dedupeKey),
  );

  const newIds: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const j of fresh) {
    if (seen.has(j.externalId)) continue;
    seen.add(j.externalId);
    // The same role posted on two boards: keep the first one the user got, skip the copy
    if (knownKeys.has(j.dedupeKey)) { duplicates++; continue; }
    knownKeys.add(j.dedupeKey);
    try {
      const row = await prisma.job.create({ data: { ...j, userId }, select: { id: true } });
      newIds.push(row.id);
    } catch (err) {
      logger.warn({ err: (err as Error).message, externalId: j.externalId }, 'Skipping job that failed to save');
    }
  }
  return { fetched: incoming.length, created: newIds.length, duplicates, newIds, bySource };
}
