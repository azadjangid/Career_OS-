import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Sparkles, ExternalLink, CheckCircle2, Pause, Play, Trash2, BookOpen, Hammer, Dumbbell, Award } from 'lucide-react';
import { api } from '@/lib/api';
import { AI_SETUP_CODES, apiError, apiErrorCode, formatDate } from '@/lib/format';
import { toast } from '@/store/toast.store';
import { useAIUsage } from '@/hooks/queries';
import { SectionCard } from '@/components/ui/Bits';
import { ListSkeleton } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/Modal';

interface Step { id: string; title: string; kind: 'learn' | 'practice' | 'project'; resource?: { label: string; url: string }; done: boolean; week?: number }
interface Path { id: string; skill: string; title: string; description: string; weeks: number; steps: Step[] }
interface Goal { id: string; skill: string; title: string; source: string; pathId: string | null; status: 'ACTIVE' | 'PAUSED' | 'DONE'; steps: Step[]; progress: number; targetDate: string | null; completedAt: string | null; createdAt: string }
interface Gaps { jobs: number; skills: Array<{ skill: string; count: number; demand: number; youHave: boolean; pathId: string | null; goal: { id: string; status: string } | null }> }

const KIND = { learn: { icon: BookOpen, label: 'Learn' }, practice: { icon: Dumbbell, label: 'Practice' }, project: { icon: Hammer, label: 'Project' } } as const;

export default function LearningPage() {
  const qc = useQueryClient();
  const refresh = () => { qc.invalidateQueries({ queryKey: ['learning-goals'] }); qc.invalidateQueries({ queryKey: ['learning-gaps'] }); };
  const goals = useQuery({ queryKey: ['learning-goals'], queryFn: async () => (await api.get('/learning/goals')).data.data as Goal[] });
  const gaps = useQuery({ queryKey: ['learning-gaps'], queryFn: async () => (await api.get('/learning/gaps')).data.data as Gaps });
  const paths = useQuery({ queryKey: ['learning-paths'], queryFn: async () => (await api.get('/learning/paths')).data.data as Path[] });
  const create = useMutation({
    mutationFn: (body: { pathId?: string; skill?: string; source?: string }) => api.post('/learning/goals', body),
    onSuccess: () => { toast.success('Added to your learning goals'); refresh(); },
    onError: e => toast.error(apiError(e, 'Could not add the goal')),
  });
  const openGoals = goals.data?.filter(g => g.status !== 'DONE') ?? [];
  const doneGoals = goals.data?.filter(g => g.status === 'DONE') ?? [];
  const hasPath = (id: string) => goals.data?.some(g => g.pathId === id && g.status !== 'DONE');

  return (
    <div className="space-y-6">
      <SectionCard title="Skill gaps from your jobs" action={gaps.data ? <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>From {gaps.data.jobs} saved jobs</span> : undefined}>
        {gaps.isLoading ? <ListSkeleton rows={2} /> : gaps.isError ? <p className="text-sm" style={{ color: 'var(--tone-red)' }}>{apiError(gaps.error, 'Could not load skill gaps')}</p>
          : !gaps.data?.skills.length ? <EmptyState art="search" compact title="No jobs to compare yet" description="Save or fetch jobs and we’ll show which skills they ask for that your profile and resume don’t mention." action={<Link to="/jobs" className="btn-secondary text-sm py-2">Go to jobs</Link>} />
          : (
            <ul className="space-y-1.5">
              {gaps.data.skills.slice(0, 12).map(s => (
                <li key={s.skill} className="flex items-center gap-3 text-sm">
                  <span className="w-32 truncate" style={{ color: 'var(--fg-primary)' }}>{s.skill}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }} aria-hidden>
                    <div className="h-full rounded-full" style={{ width: `${s.demand}%`, background: s.youHave ? 'var(--tone-green)' : 'var(--tone-amber)' }} />
                  </div>
                  <span className="w-20 text-right text-xs font-mono" style={{ color: 'var(--fg-muted)' }}>{s.demand}% of jobs</span>
                  {s.youHave ? <span className="badge badge-green w-28 justify-center">You have it</span>
                    : s.goal ? <span className="badge badge-blue w-28 justify-center">{s.goal.status === 'DONE' ? 'Learned' : 'Learning'}</span>
                    : <button className="btn-secondary text-xs px-2 py-1 w-28 justify-center" disabled={create.isPending} onClick={() => create.mutate(s.pathId ? { pathId: s.pathId, source: 'gap' } : { skill: s.skill, source: 'gap' })}><Plus size={12} /> Start learning</button>}
                </li>
              ))}
            </ul>
          )}
      </SectionCard>

      <SectionCard title="My learning goals">
        {goals.isLoading ? <ListSkeleton rows={3} /> : goals.isError ? <p className="text-sm" style={{ color: 'var(--tone-red)' }}>{apiError(goals.error, 'Could not load goals')}</p>
          : !openGoals.length ? <EmptyState art="generic" compact title="No active goals" description="Start from a skill gap above, pick a path below, or ask AI for a roadmap." />
          : <div className="space-y-4">{openGoals.map(g => <GoalCard key={g.id} goal={g} onChange={refresh} />)}</div>}
        {doneGoals.length > 0 && (
          <details className="mt-4">
            <summary className="text-sm cursor-pointer" style={{ color: 'var(--fg-secondary)' }}>Completed ({doneGoals.length})</summary>
            <ul className="mt-2 space-y-1 text-sm">
              {doneGoals.map(g => <li key={g.id} className="flex items-center gap-2" style={{ color: 'var(--fg-secondary)' }}><Award size={14} color="#34D399" /> {g.title} <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>{formatDate(g.completedAt)}</span></li>)}
            </ul>
          </details>
        )}
      </SectionCard>

      <RoadmapForm onCreated={refresh} />

      <SectionCard title="Learning paths">
        {paths.isLoading ? <ListSkeleton rows={3} /> : paths.isError ? <p className="text-sm" style={{ color: 'var(--tone-red)' }}>{apiError(paths.error, 'Could not load paths')}</p> : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {paths.data!.map(p => (
              <article key={p.id} className="rounded-xl p-4 flex flex-col" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                <h3 className="font-medium text-sm" style={{ color: 'var(--fg-primary)' }}>{p.title}</h3>
                <p className="text-xs mt-1 flex-1" style={{ color: 'var(--fg-muted)' }}>{p.description}</p>
                <p className="text-xs mt-2" style={{ color: 'var(--fg-secondary)' }}>{p.steps.length} steps · about {p.weeks} weeks · {p.steps.filter(s => s.kind === 'project').length} project{p.steps.filter(s => s.kind === 'project').length === 1 ? '' : 's'}</p>
                <button className="btn-secondary text-xs mt-3 py-1.5 justify-center" disabled={hasPath(p.id) || create.isPending} onClick={() => create.mutate({ pathId: p.id })}>
                  {hasPath(p.id) ? 'In your goals' : <><Plus size={13} /> Add to my goals</>}
                </button>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function GoalCard({ goal, onChange }: { goal: Goal; onChange: () => void }) {
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const step = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => api.post(`/learning/goals/${goal.id}/steps/${id}`, { done }),
    onSuccess: onChange,
    onError: e => toast.error(apiError(e, 'Could not update the step')),
  });
  const status = useMutation({
    mutationFn: (s: 'ACTIVE' | 'PAUSED') => api.put(`/learning/goals/${goal.id}`, { status: s }),
    onSuccess: onChange,
    onError: e => toast.error(apiError(e, 'Could not update the goal')),
  });
  const complete = useMutation({
    mutationFn: async () => (await api.post(`/learning/goals/${goal.id}/complete`, { addToProfile: true })).data.data as { addedToProfile: boolean },
    onSuccess: d => { toast.success(d.addedToProfile ? `${goal.skill} added to your profile skills` : 'Goal completed'); onChange(); qc.invalidateQueries({ queryKey: ['profile'] }); },
    onError: e => toast.error(apiError(e, 'Could not complete the goal')),
  });
  const del = useMutation({
    mutationFn: () => api.delete(`/learning/goals/${goal.id}`),
    onSuccess: () => { setConfirmDelete(false); onChange(); },
    onError: e => toast.error(apiError(e, 'Could not delete the goal')),
  });

  return (
    <article className="rounded-xl p-4" style={{ background: 'var(--bg-secondary)', opacity: goal.status === 'PAUSED' ? 0.75 : 1 }}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm" style={{ color: 'var(--fg-primary)' }}>{goal.title}</h3>
          <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
            {goal.skill} · {goal.source === 'ai' ? 'AI roadmap' : goal.source === 'gap' ? 'From a skill gap' : goal.source === 'path' ? 'Learning path' : 'Custom'}
            {goal.targetDate ? ` · target ${formatDate(goal.targetDate)}` : ''}{goal.status === 'PAUSED' ? ' · paused' : ''}
          </p>
        </div>
        <span className="font-mono text-sm" style={{ color: goal.progress === 100 ? 'var(--tone-green)' : 'var(--fg-secondary)' }}>{goal.progress}%</span>
      </div>
      <div className="h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: 'var(--bg-hover)' }} role="progressbar" aria-valuenow={goal.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${goal.title} progress`}>
        <div className="h-full rounded-full" style={{ width: `${goal.progress}%`, background: goal.progress === 100 ? 'var(--tone-green)' : 'var(--accent)' }} />
      </div>
      <ul className="mt-3 space-y-1.5">
        {goal.steps.map(s => {
          const K = KIND[s.kind] ?? KIND.learn;
          return (
            <li key={s.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={s.done} disabled={step.isPending} aria-label={s.title} onChange={e => step.mutate({ id: s.id, done: e.target.checked })} />
              <K.icon size={14} className="mt-1 shrink-0" style={{ color: 'var(--fg-muted)' }} aria-label={K.label} />
              <span className="flex-1" style={{ color: s.done ? 'var(--fg-muted)' : 'var(--fg-primary)', textDecoration: s.done ? 'line-through' : undefined }}>
                {s.week ? <span className="text-xs mr-1" style={{ color: 'var(--fg-muted)' }}>Week {s.week}:</span> : null}{s.title}
                {s.resource && <a href={s.resource.url} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs inline-flex items-center gap-0.5 underline" style={{ color: 'var(--accent)' }}>{s.resource.label}<ExternalLink size={10} /></a>}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2 mt-3 flex-wrap">
        <button className="btn-primary text-xs px-2 py-1.5" disabled={complete.isPending} onClick={() => complete.mutate()}><CheckCircle2 size={13} /> I’ve learned {goal.skill}</button>
        {goal.status === 'ACTIVE'
          ? <button className="btn-ghost text-xs px-2 py-1.5" onClick={() => status.mutate('PAUSED')}><Pause size={13} /> Pause</button>
          : <button className="btn-ghost text-xs px-2 py-1.5" onClick={() => status.mutate('ACTIVE')}><Play size={13} /> Resume</button>}
        <button className="btn-ghost text-xs px-2 py-1.5" onClick={() => setConfirmDelete(true)}><Trash2 size={13} /> Delete</button>
      </div>
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} danger busy={del.isPending} title="Delete this goal?" message={`“${goal.title}” and its progress will be removed.`} confirmLabel="Delete" onConfirm={() => del.mutate()} />
    </article>
  );
}

function RoadmapForm({ onCreated }: { onCreated: () => void }) {
  const { data: usage } = useAIUsage();
  const [target, setTarget] = useState('');
  const [weeks, setWeeks] = useState(8);
  const run = useMutation({
    mutationFn: async () => (await api.post('/learning/roadmap', { target: target.trim(), weeks })).data.data as { summary: string },
    onSuccess: d => { toast.success(d.summary ? `Roadmap added. ${d.summary}` : 'Roadmap added to your goals'); setTarget(''); onCreated(); },
  });
  const code = run.isError ? apiErrorCode(run.error) : undefined;
  return (
    <SectionCard title="AI career roadmap">
      <p className="text-sm mb-3" style={{ color: 'var(--fg-secondary)' }}>Describe where you want to be. The AI builds a week-by-week plan around the skills you already have and saves it as a goal you can tick off.</p>
      {!usage?.configured && <p className="text-xs mb-3" style={{ color: 'var(--fg-muted)' }}>Needs AI. It isn’t configured yet: <Link to="/settings#ai" className="underline">Settings → AI</Link>. The learning paths below work without it.</p>}
      <form className="flex gap-2 flex-wrap" onSubmit={e => { e.preventDefault(); run.mutate(); }}>
        <label className="sr-only" htmlFor="rm-target">Goal</label>
        <input id="rm-target" className="input flex-1 min-w-[14rem]" placeholder="e.g. Senior React developer at a product company" value={target} onChange={e => setTarget(e.target.value)} maxLength={200} />
        <label className="sr-only" htmlFor="rm-weeks">Weeks</label>
        <select id="rm-weeks" className="input w-32" value={weeks} onChange={e => setWeeks(Number(e.target.value))}>
          {[4, 8, 12, 16, 24].map(w => <option key={w} value={w}>{w} weeks</option>)}
        </select>
        <button className="btn-primary" disabled={!usage?.configured || target.trim().length < 2 || run.isPending}>
          {run.isPending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Build roadmap
        </button>
      </form>
      {run.isError && <p className="text-sm mt-2" role="alert" style={{ color: 'var(--tone-red)' }}>{apiError(run.error, 'Could not build the roadmap')} {code && AI_SETUP_CODES.includes(code) && <Link to="/settings#ai" className="underline">Settings → AI</Link>}</p>}
    </SectionCard>
  );
}
