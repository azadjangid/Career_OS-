import { Prisma } from '@prisma/client';
import { logger } from '../config/logger';

type NewJob = Omit<Prisma.JobUncheckedCreateInput, 'userId'> & { externalId: string };

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

const JOB_TYPES: Record<string, Prisma.JobUncheckedCreateInput['jobType']> = {
  full_time: 'FULL_TIME', part_time: 'PART_TIME', contract: 'CONTRACT', freelance: 'FREELANCE', internship: 'INTERNSHIP',
};

const stripHtml = (html: string) =>
  html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/**
 * Remotive public API (https://remotive.com/api/remote-jobs). Free, no key.
 * Their terms require linking back to the job URL (we keep it in sourceUrl/applyUrl)
 * and fetching sparingly, so callers must throttle.
 */
export async function fetchRemotive(search = ''): Promise<NewJob[]> {
  const url = new URL('https://remotive.com/api/remote-jobs');
  url.searchParams.set('limit', '40');
  if (search) url.searchParams.set('search', search);

  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    logger.warn({ status: res.status }, 'Remotive fetch failed');
    throw new Error(`Job source returned ${res.status}`);
  }
  const body = (await res.json()) as { jobs?: RemotiveJob[] };

  return (body.jobs ?? []).map(j => ({
    externalId: `remotive:${j.id}`,
    title: j.title,
    companyName: j.company_name,
    location: j.candidate_required_location || 'Remote',
    workMode: 'REMOTE' as const,
    jobType: JOB_TYPES[j.job_type ?? ''] ?? 'FULL_TIME',
    description: j.description ? stripHtml(j.description).slice(0, 8000) : null,
    skills: (j.tags ?? []).slice(0, 12),
    applyUrl: j.url,
    sourceUrl: j.url,
    postedAt: j.publication_date ? new Date(j.publication_date) : null,
  }));
}
