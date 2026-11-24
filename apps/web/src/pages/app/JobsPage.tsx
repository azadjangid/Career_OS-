import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Bookmark, BookmarkCheck, MapPin, Search, SlidersHorizontal, LayoutGrid, List, Sparkles, Loader2,
  RefreshCw, X, Clock, ExternalLink, Wand2, Globe2, Bell, BellOff, BookmarkPlus, Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { apiError, formatSalary, timeAgo } from '@/lib/format';
import { toast } from '@/store/toast.store';
import { useCreateApplication, useToggleSaveJob } from '@/hooks/queries';
import { COMPANY_SIZES, EXPERIENCE_LEVELS, JOB_TYPES, SOURCE_FILTERS, WORK_MODES } from '@/lib/constants';
import type { Job, SavedSearch } from '@/lib/types';
import { CompanyLogo, MatchBadge, StatusBadge } from '@/components/ui/Bits';
import { CardSkeleton } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';

type Tab = 'all' | 'recommended' | 'saved';
type Sort = 'relevance' | 'date' | 'salary' | 'match';

interface Filters {
  location: string;
  workMode: string;
  experienceLevel: string;
  posted: string;
  companySize: string;
  jobType: string;
  source: string;
  indiaEligible: boolean;
  salaryMin: number; // LPA, 0 = any
  salaryMax: number; // LPA, 50 = any
}
const NO_FILTERS: Filters = { location: '', workMode: '', experienceLevel: '', posted: '', companySize: '', jobType: '', source: '', indiaEligible: false, salaryMin: 0, salaryMax: 50 };
const pretty = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export default function JobsPage() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [tab, setTab] = useState<Tab>('all');
  const [sort, setSort] = useState<Sort>('date');
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('careeros-jobs-view') as 'grid' | 'list') || 'grid');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);

  const dSearch = useDebounced(search);
  const dFilters = useDebounced(filters, 400);
  const effectiveSort: Sort = tab === 'recommended' ? 'match' : sort;

  useEffect(() => { try { localStorage.setItem('careeros-jobs-view', view); } catch { /* ignore */ } }, [view]);
  useEffect(() => { if (params.get('q') !== null) { setSearch(params.get('q') ?? ''); setParams({}, { replace: true }); } }, [params, setParams]);

  const queryParams = useMemo(() => ({
    q: dSearch || undefined,
    sort: effectiveSort,
    saved: tab === 'saved' ? 'true' : undefined,
    location: dFilters.location || undefined,
    workMode: dFilters.workMode || undefined,
    experienceLevel: dFilters.experienceLevel || undefined,
    posted: dFilters.posted || undefined,
    companySize: dFilters.companySize || undefined,
    jobType: dFilters.jobType || undefined,
    source: dFilters.source || undefined,
    indiaEligible: dFilters.indiaEligible ? 'true' : undefined,
    salaryMin: dFilters.salaryMin > 0 ? dFilters.salaryMin * 100_000 : undefined,
    salaryMax: dFilters.salaryMax < 50 ? dFilters.salaryMax * 100_000 : undefined,
  }), [dSearch, effectiveSort, tab, dFilters]);

  const jobsQuery = useInfiniteQuery({
    queryKey: ['jobs', queryParams],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (await api.get('/jobs', { params: { ...queryParams, page: pageParam, limit: 18 } })).data.data as { jobs: Job[]; total: number; hasMore: boolean },
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
  });
  const jobs = jobsQuery.data?.pages.flatMap(p => p.jobs) ?? [];
  const total = jobsQuery.data?.pages[0]?.total ?? 0;

  // Infinite scroll: load the next page when the sentinel scrolls into view
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = jobsQuery;
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(es => { if (es[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage(); }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const { data: suggestions } = useQuery({
    queryKey: ['job-suggest', dSearch],
    enabled: showSuggest && dSearch.length >= 2,
    queryFn: async () => (await api.get('/jobs/suggest', { params: { q: dSearch } })).data.data as Array<{ type: string; value: string }>,
  });

  const fetchRemote = useMutation({
    mutationFn: async () => (await api.post('/jobs/fetch', { search: search.trim() || undefined })).data.data as { created: number; fetched: number; duplicates?: number; bySource?: Array<{ source: string; error?: string }> },
    onSuccess: r => {
      const dupes = r.duplicates ? ` (${r.duplicates} duplicate${r.duplicates === 1 ? '' : 's'} of jobs you already have skipped)` : '';
      toast.success((r.created ? `Added ${r.created} new jobs` : 'No new jobs right now') + dupes);
      const failed = (r.bySource ?? []).filter(s => s.error);
      if (failed.length) toast.info(`Some sources didn’t respond: ${failed.map(s => s.source).join(', ')}`);
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: e => toast.error(apiError(e, 'Could not fetch jobs')),
  });

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => (k === 'salaryMin' ? (v as number) > 0 : k === 'salaryMax' ? (v as number) < 50 : !!v)).length;
  // Filters as the API stores them for a saved search (no sort or paging)
  const { sort: _sort, ...searchFilters } = queryParams;
  const applySearch = (f: Record<string, string>) => {
    setTab(f['saved'] === 'true' ? 'saved' : 'all');
    setSearch(f['q'] ?? '');
    setFilters({
      ...NO_FILTERS,
      location: f['location'] ?? '', workMode: f['workMode'] ?? '', experienceLevel: f['experienceLevel'] ?? '', posted: f['posted'] ?? '',
      companySize: f['companySize'] ?? '', jobType: f['jobType'] ?? '', source: f['source'] ?? '', indiaEligible: f['indiaEligible'] === 'true',
      salaryMin: f['salaryMin'] ? Math.round(Number(f['salaryMin']) / 100_000) : 0,
      salaryMax: f['salaryMax'] ? Math.round(Number(f['salaryMax']) / 100_000) : 50,
    });
  };

  const filterPanel = (
    <FilterPanel filters={filters} onChange={setFilters} onReset={() => setFilters(NO_FILTERS)} />
  );

  return (
    <div className="flex gap-6">
      {/* Filters: sidebar on desktop, slide-over on mobile */}
      <aside className="hidden lg:block w-64 shrink-0" aria-label="Job filters">
        <div className="card sticky top-0 space-y-1">{filterPanel}</div>
      </aside>
      {filtersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setFiltersOpen(false)} aria-hidden />
          <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[90vw] overflow-y-auto p-4" style={{ background: 'var(--bg-secondary)' }} role="dialog" aria-label="Job filters" aria-modal="true">
            <button className="btn-ghost p-1.5 mb-2" onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X size={18} /></button>
            {filterPanel}
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 space-y-4">
        {/* Search + controls */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--fg-muted)' }} aria-hidden />
            <input
              value={search} onChange={e => { setSearch(e.target.value); setShowSuggest(true); }}
              onFocus={() => setShowSuggest(true)} onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
              placeholder="Search job titles, companies, skills…" className="input pl-9" aria-label="Search jobs" autoComplete="off"
            />
            {showSuggest && suggestions && suggestions.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full rounded-lg overflow-hidden shadow-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }} role="listbox">
                {suggestions.map(s => (
                  <li key={`${s.type}-${s.value}`}>
                    <button className="w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-[var(--bg-hover)]" style={{ color: 'var(--fg-primary)' }}
                      onMouseDown={() => { setSearch(s.value); setShowSuggest(false); }} role="option" aria-selected={false}>
                      {s.value}<span className="text-xs" style={{ color: 'var(--fg-muted)' }}>{s.type}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <select value={sort} onChange={e => setSort(e.target.value as Sort)} disabled={tab === 'recommended'} className="input sm:w-44" aria-label="Sort jobs">
            <option value="date">Newest</option><option value="relevance">Relevance</option>
            <option value="salary">Highest salary</option><option value="match">Match score</option>
          </select>
          <div className="flex gap-2">
            <button className="btn-secondary lg:hidden relative" onClick={() => setFiltersOpen(true)} aria-label="Open filters">
              <SlidersHorizontal size={16} /> Filters{activeFilterCount > 0 && <span className="badge badge-orange">{activeFilterCount}</span>}
            </button>
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }} role="group" aria-label="View mode">
              {(['grid', 'list'] as const).map(v => (
                <button key={v} onClick={() => setView(v)} aria-pressed={view === v} aria-label={`${v} view`} className="px-3 py-2"
                  style={{ background: view === v ? 'var(--accent-dim)' : 'transparent', color: view === v ? 'var(--accent)' : 'var(--fg-muted)' }}>
                  {v === 'grid' ? <LayoutGrid size={16} /> : <List size={16} />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-secondary)' }} role="tablist">
            {([['all', 'All jobs'], ['recommended', 'AI Recommend'], ['saved', 'Saved']] as const).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className="px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5"
                style={{ background: tab === k ? 'var(--bg-card)' : 'transparent', color: tab === k ? 'var(--accent)' : 'var(--fg-secondary)' }}>
                {k === 'recommended' && <Sparkles size={13} />}{label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>{jobsQuery.isLoading ? '' : `${total} job${total === 1 ? '' : 's'}`}</span>
            <button className="btn-secondary text-sm py-1.5" onClick={() => fetchRemote.mutate()} disabled={fetchRemote.isPending}>
              {fetchRemote.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Fetch new jobs
            </button>
          </div>
        </div>

        <SavedSearches current={searchFilters} canSave={!!(search.trim() || activeFilterCount || tab === 'saved')} onApply={applySearch} />

        {tab === 'recommended' && (
          <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>Ranked by how many required skills match your profile and resume. Hover a score for the explanation, or run an AI analysis for a deeper read.</p>
        )}

        {jobsQuery.isLoading ? (
          <div className={view === 'grid' ? 'grid sm:grid-cols-2 xl:grid-cols-3 gap-4' : 'space-y-3'}>{Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} lines={4} />)}</div>
        ) : jobsQuery.isError ? (
          <EmptyState art="search" title="Couldn’t load jobs" description={apiError(jobsQuery.error)} action={<button className="btn-primary" onClick={() => jobsQuery.refetch()}>Try again</button>} />
        ) : jobs.length === 0 ? (
          <EmptyState art={tab === 'saved' ? 'jobs' : 'search'}
            title={tab === 'saved' ? 'No saved jobs yet' : search || activeFilterCount ? 'No jobs match your filters' : 'No jobs yet'}
            description={tab === 'saved' ? 'Tap the bookmark on any job to keep it here.' : search || activeFilterCount ? 'Try removing a filter or searching for something broader.' : 'Fetch jobs from your sources, or add one yourself with the + button.'}
            action={<>{(search || activeFilterCount > 0) && <button className="btn-secondary" onClick={() => { setSearch(''); setFilters(NO_FILTERS); }}>Clear filters</button>}
              <button className="btn-primary" onClick={() => fetchRemote.mutate()}>Fetch new jobs</button></>} />
        ) : (
          <div className={view === 'grid' ? 'grid sm:grid-cols-2 xl:grid-cols-3 gap-4' : 'space-y-3'}>
            {jobs.map(j => <JobCard key={j.id} job={j} layout={view} />)}
          </div>
        )}

        <div ref={sentinel} className="h-8 flex items-center justify-center">
          {isFetchingNextPage && <Loader2 className="animate-spin" size={18} style={{ color: 'var(--accent)' }} />}
        </div>
      </div>
    </div>
  );
}

function FilterPanel({ filters, onChange, onReset }: { filters: Filters; onChange: (f: Filters) => void; onReset: () => void }) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="mb-4"><p className="label">{label}</p>{children}</div>;
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--fg-primary)' }}>Filters</h2>
        <button onClick={onReset} className="text-xs" style={{ color: 'var(--accent)' }}>Reset</button>
      </div>
      <Field label="Location"><input className="input" placeholder="City or country" value={filters.location} onChange={e => set('location', e.target.value)} aria-label="Location" /></Field>
      <Field label="Work mode">
        <select className="input" value={filters.workMode} onChange={e => set('workMode', e.target.value)} aria-label="Work mode">
          <option value="">Any</option>{WORK_MODES.map(m => <option key={m} value={m}>{pretty(m)}</option>)}
        </select>
      </Field>
      <Field label="Experience level">
        <select className="input" value={filters.experienceLevel} onChange={e => set('experienceLevel', e.target.value)} aria-label="Experience level">
          <option value="">Any</option>{EXPERIENCE_LEVELS.map(m => <option key={m} value={m}>{pretty(m)}</option>)}
        </select>
      </Field>
      <Field label="Job type">
        <select className="input" value={filters.jobType} onChange={e => set('jobType', e.target.value)} aria-label="Job type">
          <option value="">Any</option>{JOB_TYPES.map(m => <option key={m} value={m}>{pretty(m)}</option>)}
        </select>
      </Field>
      <div className="mb-4">
        <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: 'var(--fg-primary)' }}>
          <input type="checkbox" className="mt-0.5" checked={filters.indiaEligible} onChange={e => set('indiaEligible', e.target.checked)} />
          <span>Open to candidates in India<span className="block text-xs" style={{ color: 'var(--fg-muted)' }}>Jobs in India, plus remote jobs that say they hire worldwide or in Asia</span></span>
        </label>
      </div>
      <Field label="Source">
        <select className="input" value={filters.source} onChange={e => set('source', e.target.value)} aria-label="Job source">
          <option value="">All sources</option>{SOURCE_FILTERS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </Field>
      <Field label="Date posted">
        <select className="input" value={filters.posted} onChange={e => set('posted', e.target.value)} aria-label="Date posted">
          <option value="">Any time</option><option value="24h">Last 24 hours</option><option value="week">Last week</option><option value="month">Last month</option>
        </select>
      </Field>
      <Field label="Company size">
        <select className="input" value={filters.companySize} onChange={e => set('companySize', e.target.value)} aria-label="Company size">
          <option value="">Any</option>{COMPANY_SIZES.map(m => <option key={m} value={m}>{m} employees</option>)}
        </select>
      </Field>
      <Field label={`Salary: ${filters.salaryMin}–${filters.salaryMax >= 50 ? '50+' : filters.salaryMax} LPA`}>
        <div className="space-y-2">
          <input type="range" min={0} max={50} step={1} value={filters.salaryMin} aria-label="Minimum salary in lakhs per annum" className="w-full accent-[var(--accent)]"
            onChange={e => set('salaryMin', Math.min(Number(e.target.value), filters.salaryMax))} />
          <input type="range" min={0} max={50} step={1} value={filters.salaryMax} aria-label="Maximum salary in lakhs per annum" className="w-full accent-[var(--accent)]"
            onChange={e => set('salaryMax', Math.max(Number(e.target.value), filters.salaryMin))} />
        </div>
      </Field>
    </>
  );
}

function JobCard({ job, layout }: { job: Job; layout: 'grid' | 'list' }) {
  const qc = useQueryClient();
  const toggle = useToggleSaveJob();
  const createApp = useCreateApplication();

  const analyze = useMutation({
    mutationFn: () => api.post('/ai/job-match', { jobId: job.id }),
    onSuccess: () => { toast.success('AI match analysis complete'); qc.invalidateQueries({ queryKey: ['jobs'] }); },
    onError: e => toast.error(apiError(e, 'Could not analyze this job')),
  });

  const apply = () => {
    createApp.mutate({ jobId: job.id, status: 'APPLIED' }, {
      onSuccess: () => { if (job.applyUrl) window.open(job.applyUrl, '_blank', 'noopener,noreferrer'); },
    });
  };

  const m = job.match;
  const tip = m.total
    ? `${m.matched.length} of ${m.total} required skills match${m.matched.length ? `: ${m.matched.slice(0, 4).join(', ')}` : ''}${m.missing.length ? `. Missing: ${m.missing.slice(0, 3).join(', ')}` : ''}${m.source === 'skills' ? ' (quick estimate)' : ' (AI analysis)'}`
    : 'No required skills listed for this job';
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency);

  return (
    <article className={`card card-hover flex ${layout === 'grid' ? 'flex-col' : 'flex-col sm:flex-row sm:items-center'} gap-3`} style={{ padding: 16 }}>
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <CompanyLogo name={job.companyName} logo={job.company?.logo} />
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm leading-snug" style={{ color: 'var(--fg-primary)' }}>{job.title}</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--fg-secondary)' }}>{job.companyName}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs" style={{ color: 'var(--fg-muted)' }}>
            {job.location && <span className="flex items-center gap-1"><MapPin size={12} />{job.location}</span>}
            {job.postedAt && <span className="flex items-center gap-1" title={`Posted ${new Date(job.postedAt).toLocaleDateString()}`}><Clock size={12} />Posted {timeAgo(job.postedAt)}</span>}
            {job.sourceName && <span title="Where this job came from">via {job.sourceName}</span>}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {job.workMode && <span className="badge badge-blue">{job.workMode.charAt(0) + job.workMode.slice(1).toLowerCase()}</span>}
            {job.experienceLevel && <span className="badge badge-muted">{pretty(job.experienceLevel)}</span>}
            {job.workMode === 'REMOTE' && job.location && !/india/i.test(job.location) && (
              job.indiaEligible === true ? <span className="badge badge-green" title="The posting says it hires in India, Asia or worldwide"><Globe2 size={11} className="inline mr-0.5" />India-eligible</span>
                : job.indiaEligible === false ? <span className="badge badge-red" title="The posting limits hiring to other regions">Not open to India</span>
                : <span className="badge badge-amber" title="The posting doesn’t say where it hires. Check before applying.">Eligibility unclear</span>
            )}
            {job.workMode === 'REMOTE' && !job.location && job.indiaEligible == null && <span className="badge badge-amber" title="The posting doesn’t say where it hires. Check before applying.">Eligibility unclear</span>}
            {salary && <span className="badge badge-green">{salary}</span>}
            {job.skills.slice(0, layout === 'grid' ? 3 : 4).map(s => <span key={s} className="badge badge-muted">{s}</span>)}
          </div>
        </div>
      </div>

      <div className={`flex ${layout === 'grid' ? 'items-center justify-between' : 'sm:flex-col sm:items-end items-center justify-between'} gap-2 shrink-0`}>
        {m.total > 0 && <MatchBadge score={m.score} title={tip} />}
        <div className="flex items-center gap-1">
          {m.source === 'skills' && (
            <button className="btn-ghost p-1.5" onClick={() => analyze.mutate()} disabled={analyze.isPending} title="Analyze match with AI" aria-label={`Analyze ${job.title} with AI`}>
              {analyze.isPending ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
            </button>
          )}
          {job.applyUrl && <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost p-1.5" aria-label={`Open ${job.title} posting`}><ExternalLink size={15} /></a>}
          <button className="btn-ghost p-1.5" onClick={() => toggle.mutate({ id: job.id, saved: job.saved })} aria-pressed={job.saved} aria-label={job.saved ? `Unsave ${job.title}` : `Save ${job.title}`}>
            {job.saved ? <BookmarkCheck size={16} style={{ color: 'var(--accent)' }} /> : <Bookmark size={16} />}
          </button>
          {job.application ? <StatusBadge status={job.application.status} /> : (
            <button className="btn-primary text-xs py-1.5 px-3" onClick={apply} disabled={createApp.isPending}>
              {createApp.isPending && <Loader2 size={12} className="animate-spin" />} Apply now
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/** Named searches the user saved, with live match counts and an optional alert for new matches. */
function SavedSearches({ current, canSave, onApply }: { current: Record<string, unknown>; canSave: boolean; onApply: (f: Record<string, string>) => void }) {
  const qc = useQueryClient();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const { data: searches } = useQuery({ queryKey: ['job-searches'], queryFn: async () => (await api.get('/jobs/searches')).data.data as SavedSearch[] });
  const refresh = () => qc.invalidateQueries({ queryKey: ['job-searches'] });
  const create = useMutation({
    mutationFn: (alertEnabled: boolean) => api.post('/jobs/searches', { name: name.trim(), filters: current, alertEnabled }),
    onSuccess: (_d, alert) => { toast.success(alert ? 'Search saved. You’ll be notified about new matching jobs.' : 'Search saved'); setNaming(false); setName(''); refresh(); },
    onError: e => toast.error(apiError(e, 'Could not save the search')),
  });
  const toggle = useMutation({
    mutationFn: (s: SavedSearch) => api.put(`/jobs/searches/${s.id}`, { alertEnabled: !s.alertEnabled }),
    onSuccess: (_d, s) => { toast.success(s.alertEnabled ? 'Alert turned off' : 'Alert on: new matching jobs will show in your notifications'); refresh(); },
    onError: e => toast.error(apiError(e, 'Could not update the alert')),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/jobs/searches/${id}`),
    onSuccess: () => { toast.success('Saved search removed'); refresh(); },
    onError: e => toast.error(apiError(e, 'Could not remove the search')),
  });

  if (!searches?.length && !canSave) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap" aria-label="Saved searches">
      {searches?.map(s => (
        <span key={s.id} className="inline-flex items-center rounded-full text-xs" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <button className="pl-3 pr-1 py-1" onClick={() => onApply(s.filters)} title="Apply this search" style={{ color: 'var(--fg-primary)' }}>
            {s.name} <span style={{ color: 'var(--fg-muted)' }}>· {s.matches}</span>
          </button>
          <button className="p-1" onClick={() => toggle.mutate(s)} aria-label={s.alertEnabled ? `Turn off alert for ${s.name}` : `Alert me about new jobs for ${s.name}`} title={s.alertEnabled ? 'Alert on' : 'Alert off'}
            style={{ color: s.alertEnabled ? 'var(--accent)' : 'var(--fg-muted)' }}>
            {s.alertEnabled ? <Bell size={12} /> : <BellOff size={12} />}
          </button>
          <button className="p-1 pr-2" onClick={() => del.mutate(s.id)} aria-label={`Delete saved search ${s.name}`} style={{ color: 'var(--fg-muted)' }}><Trash2 size={12} /></button>
        </span>
      ))}
      {canSave && !naming && (
        <button className="btn-ghost text-xs px-2 py-1" onClick={() => setNaming(true)}><BookmarkPlus size={13} /> Save this search</button>
      )}
      {naming && (
        <form className="flex items-center gap-1.5" onSubmit={e => { e.preventDefault(); if (name.trim()) create.mutate(false); }}>
          <label className="sr-only" htmlFor="ss-name">Search name</label>
          <input id="ss-name" autoFocus className="input py-1 text-xs w-44" placeholder="e.g. Remote React roles" value={name} onChange={e => setName(e.target.value)} maxLength={80} />
          <button className="btn-secondary text-xs px-2 py-1" disabled={!name.trim() || create.isPending}>Save</button>
          <button type="button" className="btn-primary text-xs px-2 py-1" disabled={!name.trim() || create.isPending} onClick={() => create.mutate(true)}><Bell size={12} /> Save with alert</button>
          <button type="button" className="btn-ghost p-1" aria-label="Cancel" onClick={() => setNaming(false)}><X size={14} /></button>
        </form>
      )}
    </div>
  );
}
