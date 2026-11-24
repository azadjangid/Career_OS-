import { Prisma, WorkMode, ExperienceLevel, JobType } from '@prisma/client';

const DAY = 86_400_000;
export type JobFilters = Record<string, string | undefined>;

/** Filters a saved search can store (everything the job list understands except paging and sort). */
export const JOB_FILTER_KEYS = ['q', 'location', 'workMode', 'experienceLevel', 'jobType', 'salaryMin', 'salaryMax', 'companySize', 'posted', 'indiaEligible', 'source', 'saved'] as const;

const ENUMS = {
  workMode: Object.values(WorkMode) as string[],
  experienceLevel: Object.values(ExperienceLevel) as string[],
  jobType: Object.values(JobType) as string[],
};

/** Keeps only known filter keys with sane values, so saved searches can't store junk. */
export function cleanJobFilters(input: Record<string, unknown>): JobFilters {
  const out: JobFilters = {};
  for (const k of JOB_FILTER_KEYS) {
    const v = input[k];
    if (v === undefined || v === null || v === '') continue;
    const s = String(v).slice(0, 200);
    if (k in ENUMS && !ENUMS[k as keyof typeof ENUMS].includes(s)) continue;
    if ((k === 'salaryMin' || k === 'salaryMax') && !/^\d{1,10}$/.test(s)) continue;
    out[k] = s;
  }
  return out;
}

/** The Prisma filter behind the job list, saved searches and job alerts. */
export function buildJobWhere(userId: string, q: JobFilters, extra: Prisma.JobWhereInput[] = []): Prisma.JobWhereInput {
  const and: Prisma.JobWhereInput[] = [...extra];
  const text = q['q']?.trim();
  if (text) {
    const variants = [...new Set([text, text.toLowerCase(), text.charAt(0).toUpperCase() + text.slice(1)])];
    and.push({
      OR: [
        { title: { contains: text, mode: 'insensitive' } },
        { companyName: { contains: text, mode: 'insensitive' } },
        { skills: { hasSome: variants } },
        { description: { contains: text, mode: 'insensitive' } },
      ],
    });
  }
  if (q['location']) and.push({ location: { contains: q['location'], mode: 'insensitive' } });
  if (q['workMode'] && ENUMS.workMode.includes(q['workMode'])) and.push({ workMode: q['workMode'] as WorkMode });
  if (q['experienceLevel'] && ENUMS.experienceLevel.includes(q['experienceLevel'])) and.push({ experienceLevel: q['experienceLevel'] as ExperienceLevel });
  if (q['jobType'] && ENUMS.jobType.includes(q['jobType'])) and.push({ jobType: q['jobType'] as JobType });
  const min = parseInt(q['salaryMin'] ?? '');
  const max = parseInt(q['salaryMax'] ?? '');
  if (Number.isFinite(min)) and.push({ OR: [{ salaryMax: { gte: min } }, { salaryMax: null }] });
  if (Number.isFinite(max)) and.push({ OR: [{ salaryMin: { lte: max } }, { salaryMin: null }] });
  if (q['companySize']) and.push({ company: { size: q['companySize'] } });
  if (q['posted']) {
    const days = ({ '24h': 1, week: 7, month: 30 } as Record<string, number>)[q['posted']];
    if (days) and.push({ postedAt: { gte: new Date(Date.now() - days * DAY) } });
  }
  if (q['indiaEligible'] === 'true') and.push({ indiaEligible: true });
  if (q['source']) and.push({ sourceName: { startsWith: q['source'], mode: 'insensitive' } });
  if (q['saved'] === 'true') and.push({ savedJobs: { some: { userId } } });
  return { userId, isActive: true, duplicateOfId: null, AND: and };
}
