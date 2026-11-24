import { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { logger } from '../config/logger';

export type NewJob = Omit<Prisma.JobUncheckedCreateInput, 'userId'> & { externalId: string };

export type JobSourceId = 'remotive' | 'remoteok' | 'arbeitnow' | 'adzuna' | 'greenhouse' | 'lever';

export interface FetchOptions {
  search?: string;
  /** Company board slugs for Greenhouse / Lever, e.g. ["razorpay", "postman"] */
  companies?: string[];
}

export interface JobSourceInfo {
  id: JobSourceId;
  label: string;
  note: string;
  /** False when the source needs server configuration that is missing (API keys). */
  available: boolean;
  needsCompanies?: boolean;
}

const JOB_TYPES: Record<string, Prisma.JobUncheckedCreateInput['jobType']> = {
  full_time: 'FULL_TIME', 'full-time': 'FULL_TIME', fulltime: 'FULL_TIME', permanent: 'FULL_TIME',
  part_time: 'PART_TIME', 'part-time': 'PART_TIME', parttime: 'PART_TIME',
  contract: 'CONTRACT', contractor: 'CONTRACT', freelance: 'FREELANCE', internship: 'INTERNSHIP', intern: 'INTERNSHIP',
};
const jobType = (s?: string | null) => JOB_TYPES[(s ?? '').toLowerCase().replace(/\s+/g, '_')] ?? 'FULL_TIME';

const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'" };

export const stripHtml = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<(br|\/p|\/li|\/h\d)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|#39|#x27);/g, m => ENTITIES[m] ?? m)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();

const clip = (s: string | null | undefined, n = 8000) => (s ? stripHtml(s).slice(0, n) : null);
const date = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === '') return null;
  const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const isRemote = (s?: string | null) => /remote|anywhere|worldwide/i.test(s ?? '');
const matches = (search: string | undefined, ...fields: Array<string | null | undefined>) => {
  if (!search) return true;
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = fields.join(' ').toLowerCase();
  return words.every(w => hay.includes(w));
};

async function getJson<T>(url: string | URL, source: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'CareerOS job importer' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    logger.warn({ status: res.status, source }, 'Job source fetch failed');
    throw new Error(`${source} returned ${res.status}`);
  }
  return (await res.json()) as T;
}

// ── Remotive: https://remotive.com/api/remote-jobs (free, no key; link back to the job) ──
interface RemotiveJob {
  id: number; url: string; title: string; company_name: string; tags?: string[]; job_type?: string;
  publication_date?: string; candidate_required_location?: string; description?: string;
}
export function mapRemotive(body: { jobs?: RemotiveJob[] }): NewJob[] {
  return (body.jobs ?? []).map(j => ({
    externalId: `remotive:${j.id}`,
    title: j.title,
    companyName: j.company_name,
    location: j.candidate_required_location || 'Remote',
    country: '',
    workMode: 'REMOTE' as const,
    jobType: jobType(j.job_type),
    description: clip(j.description),
    skills: (j.tags ?? []).slice(0, 12),
    applyUrl: j.url,
    sourceUrl: j.url,
    postedAt: date(j.publication_date),
  }));
}
export async function fetchRemotive(search = ''): Promise<NewJob[]> {
  const url = new URL('https://remotive.com/api/remote-jobs');
  url.searchParams.set('limit', '40');
  if (search) url.searchParams.set('search', search);
  return mapRemotive(await getJson(url, 'Remotive'));
}

// ── RemoteOK: https://remoteok.com/api (free; first element is a legal notice; link back required) ──
interface RemoteOkJob {
  id?: string | number; slug?: string; position?: string; company?: string; tags?: string[]; location?: string;
  description?: string; url?: string; apply_url?: string; epoch?: number; date?: string; salary_min?: number; salary_max?: number;
}
export function mapRemoteOk(body: RemoteOkJob[], search?: string): NewJob[] {
  return body
    .filter(j => j.id && j.position && j.company)
    .filter(j => matches(search, j.position, j.company, (j.tags ?? []).join(' ')))
    .slice(0, 40)
    .map(j => ({
      externalId: `remoteok:${j.id}`,
      title: j.position!,
      companyName: j.company!,
      location: j.location || 'Remote',
      country: '',
      workMode: 'REMOTE' as const,
      jobType: 'FULL_TIME' as const,
      description: clip(j.description),
      skills: (j.tags ?? []).slice(0, 12),
      salaryMin: j.salary_min || null,
      salaryMax: j.salary_max || null,
      salaryCurrency: j.salary_min ? 'USD' : 'INR',
      applyUrl: j.apply_url || j.url || null,
      sourceUrl: j.url || null,
      postedAt: date(j.epoch ?? j.date),
    }));
}
export async function fetchRemoteOk(search = ''): Promise<NewJob[]> {
  return mapRemoteOk(await getJson<RemoteOkJob[]>('https://remoteok.com/api', 'RemoteOK'), search);
}

// ── Arbeitnow: https://www.arbeitnow.com/api/job-board-api (free, no key) ──
interface ArbeitnowJob {
  slug: string; company_name: string; title: string; description?: string; remote?: boolean; url: string;
  tags?: string[]; job_types?: string[]; location?: string; created_at?: number;
}
export function mapArbeitnow(body: { data?: ArbeitnowJob[] }, search?: string): NewJob[] {
  return (body.data ?? [])
    .filter(j => matches(search, j.title, j.company_name, (j.tags ?? []).join(' ')))
    .slice(0, 40)
    .map(j => ({
      externalId: `arbeitnow:${j.slug}`,
      title: j.title,
      companyName: j.company_name,
      location: j.remote ? `Remote${j.location ? ` (${j.location})` : ''}` : j.location || null,
      country: '',
      workMode: j.remote ? ('REMOTE' as const) : ('ONSITE' as const),
      jobType: jobType(j.job_types?.[0]),
      description: clip(j.description),
      skills: (j.tags ?? []).slice(0, 12),
      applyUrl: j.url,
      sourceUrl: j.url,
      postedAt: date(j.created_at),
    }));
}
export async function fetchArbeitnow(search = ''): Promise<NewJob[]> {
  return mapArbeitnow(await getJson('https://www.arbeitnow.com/api/job-board-api', 'Arbeitnow'), search);
}

// ── Adzuna (India): https://developer.adzuna.com (free key: ADZUNA_APP_ID + ADZUNA_APP_KEY) ──
interface AdzunaJob {
  id: string; title: string; description?: string; redirect_url: string; created?: string; contract_time?: string;
  company?: { display_name?: string }; location?: { display_name?: string; area?: string[] }; salary_min?: number; salary_max?: number;
}
export function mapAdzuna(body: { results?: AdzunaJob[] }): NewJob[] {
  return (body.results ?? []).map(j => ({
    externalId: `adzuna:${j.id}`,
    title: stripHtml(j.title),
    companyName: j.company?.display_name || 'Unknown company',
    location: j.location?.display_name || null,
    city: j.location?.area?.[2] ?? null,
    state: j.location?.area?.[1] ?? null,
    workMode: isRemote(`${j.title} ${j.location?.display_name}`) ? ('REMOTE' as const) : ('ONSITE' as const),
    jobType: jobType(j.contract_time),
    description: clip(j.description),
    salaryMin: j.salary_min ? Math.round(j.salary_min) : null,
    salaryMax: j.salary_max ? Math.round(j.salary_max) : null,
    applyUrl: j.redirect_url,
    sourceUrl: j.redirect_url,
    postedAt: date(j.created),
  }));
}
export async function fetchAdzuna(search = ''): Promise<NewJob[]> {
  if (!env.ADZUNA_APP_ID || !env.ADZUNA_APP_KEY) throw new Error('Adzuna is not configured on this server');
  const url = new URL('https://api.adzuna.com/v1/api/jobs/in/search/1');
  url.searchParams.set('app_id', env.ADZUNA_APP_ID);
  url.searchParams.set('app_key', env.ADZUNA_APP_KEY);
  url.searchParams.set('results_per_page', '40');
  url.searchParams.set('content-type', 'application/json');
  if (search) url.searchParams.set('what', search);
  return mapAdzuna(await getJson(url, 'Adzuna'));
}

// ── Greenhouse public job boards: https://boards-api.greenhouse.io/v1/boards/{company}/jobs ──
interface GreenhouseJob { id: number; title: string; absolute_url: string; updated_at?: string; location?: { name?: string }; content?: string }
export function mapGreenhouse(company: string, body: { jobs?: GreenhouseJob[] }, search?: string): NewJob[] {
  const name = company.charAt(0).toUpperCase() + company.slice(1);
  return (body.jobs ?? [])
    .filter(j => matches(search, j.title))
    .slice(0, 40)
    .map(j => ({
      externalId: `greenhouse:${company}:${j.id}`,
      title: j.title,
      companyName: name,
      country: '',
      location: j.location?.name || null,
      workMode: isRemote(j.location?.name) ? ('REMOTE' as const) : ('HYBRID' as const),
      jobType: 'FULL_TIME' as const,
      // Greenhouse returns the description HTML-escaped
      description: j.content ? clip(j.content.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : null,
      applyUrl: j.absolute_url,
      sourceUrl: j.absolute_url,
      postedAt: date(j.updated_at),
    }));
}

// ── Lever public postings: https://api.lever.co/v0/postings/{company}?mode=json ──
interface LeverJob {
  id: string; text: string; hostedUrl: string; applyUrl?: string; createdAt?: number; descriptionPlain?: string;
  categories?: { location?: string; commitment?: string; team?: string }; workplaceType?: string;
}
export function mapLever(company: string, body: LeverJob[], search?: string): NewJob[] {
  const name = company.charAt(0).toUpperCase() + company.slice(1);
  return body
    .filter(j => matches(search, j.text, j.categories?.team))
    .slice(0, 40)
    .map(j => ({
      externalId: `lever:${company}:${j.id}`,
      title: j.text,
      companyName: name,
      country: '',
      location: j.categories?.location || null,
      workMode: j.workplaceType === 'remote' || isRemote(j.categories?.location) ? ('REMOTE' as const) : j.workplaceType === 'onsite' ? ('ONSITE' as const) : ('HYBRID' as const),
      jobType: jobType(j.categories?.commitment),
      description: j.descriptionPlain?.slice(0, 8000) ?? null,
      applyUrl: j.applyUrl || j.hostedUrl,
      sourceUrl: j.hostedUrl,
      postedAt: date(j.createdAt),
    }));
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const cleanCompanySlugs = (list: unknown): string[] =>
  Array.isArray(list)
    ? [...new Set(list.map(s => String(s).trim().toLowerCase()).filter(s => SLUG.test(s)))].slice(0, 15)
    : [];

async function fetchBoards(
  source: 'Greenhouse' | 'Lever',
  companies: string[],
  one: (company: string) => Promise<NewJob[]>,
): Promise<NewJob[]> {
  if (!companies.length) throw new Error(`Add at least one company board for ${source} in Settings → Job sources`);
  const results = await Promise.allSettled(companies.map(one));
  results.forEach((r, i) => r.status === 'rejected' && logger.warn({ company: companies[i], source }, 'Company board fetch failed'));
  return results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
}

export const fetchGreenhouse = (search = '', companies: string[] = []) =>
  fetchBoards('Greenhouse', companies, async c =>
    mapGreenhouse(c, await getJson(`https://boards-api.greenhouse.io/v1/boards/${c}/jobs?content=true`, 'Greenhouse'), search),
  );

export const fetchLever = (search = '', companies: string[] = []) =>
  fetchBoards('Lever', companies, async c => mapLever(c, await getJson(`https://api.lever.co/v0/postings/${c}?mode=json`, 'Lever'), search));

export function listJobSources(): JobSourceInfo[] {
  const adzuna = Boolean(env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY);
  return [
    { id: 'remotive', label: 'Remotive', note: 'Remote jobs worldwide, free public feed', available: true },
    { id: 'remoteok', label: 'RemoteOK', note: 'Remote tech jobs, free public feed', available: true },
    { id: 'arbeitnow', label: 'Arbeitnow', note: 'Tech jobs, many remote, free public feed', available: true },
    { id: 'adzuna', label: 'Adzuna India', note: adzuna ? 'Jobs across India' : 'Needs ADZUNA_APP_ID and ADZUNA_APP_KEY on the server', available: adzuna },
    { id: 'greenhouse', label: 'Greenhouse boards', note: 'Jobs from companies you choose that hire with Greenhouse', available: true, needsCompanies: true },
    { id: 'lever', label: 'Lever boards', note: 'Jobs from companies you choose that hire with Lever', available: true, needsCompanies: true },
  ];
}

export const SOURCE_IDS = listJobSources().map(s => s.id);

export async function fetchFromSource(id: JobSourceId, opts: FetchOptions & { greenhouse?: string[]; lever?: string[] }): Promise<NewJob[]> {
  const search = (opts.search ?? '').slice(0, 100);
  switch (id) {
    case 'remotive': return fetchRemotive(search);
    case 'remoteok': return fetchRemoteOk(search);
    case 'arbeitnow': return fetchArbeitnow(search);
    case 'adzuna': return fetchAdzuna(search);
    case 'greenhouse': return fetchGreenhouse(search, opts.greenhouse ?? opts.companies ?? []);
    case 'lever': return fetchLever(search, opts.lever ?? opts.companies ?? []);
  }
}
