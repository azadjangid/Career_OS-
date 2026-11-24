import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Play, ChevronLeft, ChevronRight, Sparkles, Eye, Trash2, CheckCircle2, Flag, History } from 'lucide-react';
import { api } from '@/lib/api';
import { AI_SETUP_CODES, apiError, apiErrorCode, formatDate } from '@/lib/format';
import { toast } from '@/store/toast.store';
import { useAIUsage } from '@/hooks/queries';
import { EXPERIENCE_LEVELS } from '@/lib/constants';
import type { Job } from '@/lib/types';
import { SectionCard } from '@/components/ui/Bits';
import { ListSkeleton } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/Modal';

interface Topic { id: string; label: string; description: string; needsAI?: boolean; questions: number | null }
interface Feedback { score: number; summary: string; strengths: string[]; improvements: string[]; sampleAnswer: string }
interface Question { id: string; question: string; category: string; difficulty: string; source: 'bank' | 'ai'; keyPoints: string[]; answer?: string; feedback?: Feedback | null; score?: number | null; selfRating?: number | null }
interface Session {
  id: string; topic: string; level: string; targetRole: string | null; status: 'IN_PROGRESS' | 'COMPLETED'; overallScore: number | null; createdAt: string; completedAt: string | null;
  questions: Question[]; summary: { answered: number; graded: number; total: number; strengths: string[]; focusAreas: string[]; improvements: string[] } | null;
}
interface SessionRow { id: string; topic: string; level: string; targetRole: string | null; status: string; overallScore: number | null; createdAt: string; total: number; answered: number }

const pretty = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const tone = (n?: number | null) => (n == null ? 'var(--fg-muted)' : n >= 70 ? 'var(--tone-green)' : n >= 50 ? 'var(--tone-amber)' : 'var(--tone-red)');

export default function InterviewPrepPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  return openId ? <SessionView id={openId} onBack={() => setOpenId(null)} /> : <PrepHome onOpen={setOpenId} />;
}

function PrepHome({ onOpen }: { onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const { data: usage } = useAIUsage();
  const aiReady = !!usage?.configured;
  const [topic, setTopic] = useState('react');
  const [level, setLevel] = useState('');
  const [count, setCount] = useState(5);
  const [jobId, setJobId] = useState('');
  const [jd, setJd] = useState('');
  const [deleting, setDeleting] = useState<SessionRow | null>(null);

  const topics = useQuery({ queryKey: ['prep-topics'], queryFn: async () => (await api.get('/prep/topics')).data.data as Topic[] });
  const history = useQuery({ queryKey: ['prep-sessions'], queryFn: async () => (await api.get('/prep/sessions')).data.data as SessionRow[] });
  const jobs = useQuery({
    queryKey: ['jobs', 'prep-picker'], enabled: topic === 'role',
    queryFn: async () => (await api.get('/jobs', { params: { limit: 50, sort: 'date' } })).data.data.jobs as Job[],
  });

  const start = useMutation({
    mutationFn: async () => (await api.post('/prep/sessions', { topic, level: level || undefined, count, jobId: topic === 'role' ? jobId || undefined : undefined, jobDescription: topic === 'role' && !jobId ? jd : undefined })).data.data as Session,
    onSuccess: s => { qc.invalidateQueries({ queryKey: ['prep-sessions'] }); onOpen(s.id); },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/prep/sessions/${id}`),
    onSuccess: () => { toast.success('Session deleted'); setDeleting(null); qc.invalidateQueries({ queryKey: ['prep-sessions'] }); },
    onError: e => toast.error(apiError(e, 'Could not delete')),
  });
  const startCode = start.isError ? apiErrorCode(start.error) : undefined;
  const selected = topics.data?.find(t => t.id === topic);

  return (
    <div className="space-y-6">
      <SectionCard title="Start a mock interview">
        {!aiReady && (
          <p className="text-xs mb-4 rounded-lg p-3" style={{ background: 'var(--bg-secondary)', color: 'var(--fg-secondary)' }}>
            AI isn’t configured, so answers can’t be graded automatically. You can still practise with the built-in questions: after each answer, compare it with the key points and rate yourself.
            {' '}<Link to="/settings#ai" className="underline">Settings → AI</Link>
          </p>
        )}
        {topics.isLoading ? <ListSkeleton rows={2} /> : topics.isError ? <p className="text-sm" style={{ color: 'var(--tone-red)' }}>{apiError(topics.error, 'Could not load topics')}</p> : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2" role="radiogroup" aria-label="Topic">
            {topics.data!.map(t => {
              const disabled = t.needsAI && !aiReady;
              return (
                <button key={t.id} role="radio" aria-checked={topic === t.id} disabled={disabled} onClick={() => setTopic(t.id)}
                  className="text-left rounded-xl p-3 transition-colors disabled:opacity-50" title={disabled ? 'Needs AI to be configured' : undefined}
                  style={{ background: topic === t.id ? 'var(--accent-dim)' : 'var(--bg-secondary)', border: `1px solid ${topic === t.id ? 'var(--accent)' : 'var(--border)'}` }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--fg-primary)' }}>{t.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--fg-muted)' }}>{t.description}</p>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--fg-muted)' }}>{t.questions != null ? `${t.questions} questions in the bank` : 'Needs AI'}</p>
                </button>
              );
            })}
          </div>
        )}

        {topic === 'role' && (
          <div className="mt-4 grid gap-3">
            <label className="text-sm" style={{ color: 'var(--fg-primary)' }}>
              Saved job
              <select className="input mt-1" value={jobId} onChange={e => setJobId(e.target.value)}>
                <option value="">Paste a job description instead</option>
                {jobs.data?.map(j => <option key={j.id} value={j.id}>{j.title} · {j.companyName}</option>)}
              </select>
            </label>
            {!jobId && (
              <label className="text-sm" style={{ color: 'var(--fg-primary)' }}>
                Job description
                <textarea className="input mt-1 resize-none" rows={5} value={jd} onChange={e => setJd(e.target.value)} maxLength={12000} placeholder="Paste the job description…" />
              </label>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 mt-4">
          <label className="text-sm" style={{ color: 'var(--fg-primary)' }}>
            Level
            <select className="input mt-1 w-40" value={level} onChange={e => setLevel(e.target.value)}>
              <option value="">From my profile</option>
              {EXPERIENCE_LEVELS.map(l => <option key={l} value={l}>{pretty(l)}</option>)}
            </select>
          </label>
          <label className="text-sm" style={{ color: 'var(--fg-primary)' }}>
            Questions
            <select className="input mt-1 w-24" value={count} onChange={e => setCount(Number(e.target.value))}>
              {[3, 5, 8, 10].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button className="btn-primary" disabled={start.isPending || (topic === 'role' && !jobId && jd.trim().length < 40)} onClick={() => start.mutate()}>
            {start.isPending ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Start {selected?.label ?? ''} practice
          </button>
        </div>
        {start.isError && (
          <p className="text-sm mt-2" role="alert" style={{ color: 'var(--tone-red)' }}>
            {apiError(start.error, 'Could not start the session')} {startCode && AI_SETUP_CODES.includes(startCode) && <Link to="/settings#ai" className="underline">Settings → AI</Link>}
          </p>
        )}
      </SectionCard>

      <SectionCard title="Practice history">
        {history.isLoading ? <ListSkeleton rows={3} /> : history.isError ? (
          <p className="text-sm" style={{ color: 'var(--tone-red)' }}>{apiError(history.error, 'Could not load history')} <button className="underline" onClick={() => history.refetch()}>Retry</button></p>
        ) : !history.data?.length ? (
          <EmptyState art="chat" compact title="No practice sessions yet" description="Start a mock interview above. Your answers, feedback and scores are kept here." />
        ) : (
          <ul className="space-y-2">
            {history.data.map(s => (
              <li key={s.id} className="flex items-center gap-3 rounded-xl p-3" style={{ background: 'var(--bg-secondary)' }}>
                <History size={16} style={{ color: 'var(--accent)' }} aria-hidden />
                <button className="flex-1 min-w-0 text-left" onClick={() => onOpen(s.id)}>
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--fg-primary)' }}>
                    {topics.data?.find(t => t.id === s.topic)?.label ?? s.topic}{s.targetRole ? ` · ${s.targetRole}` : ''} <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>({pretty(s.level)})</span>
                  </p>
                  <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>{formatDate(s.createdAt, 'd MMM yyyy, HH:mm')} · {s.answered}/{s.total} answered · {s.status === 'COMPLETED' ? 'Finished' : 'In progress'}</p>
                </button>
                <span className="font-mono text-sm" style={{ color: tone(s.overallScore) }}>{s.overallScore != null ? `${s.overallScore}/100` : '–'}</span>
                <button className="btn-ghost p-1.5" aria-label="Delete session" onClick={() => setDeleting(s)}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} danger busy={del.isPending} title="Delete this practice session?"
        message="Its answers and feedback will be removed." confirmLabel="Delete" onConfirm={() => deleting && del.mutate(deleting.id)} />
    </div>
  );
}

function SessionView({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { data: usage } = useAIUsage();
  const aiReady = !!usage?.configured;
  const [idx, setIdx] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const { data: s, isLoading, isError, error } = useQuery({ queryKey: ['prep-session', id], queryFn: async () => (await api.get(`/prep/sessions/${id}`)).data.data as Session });
  const put = (data: Session) => { qc.setQueryData(['prep-session', id], data); qc.invalidateQueries({ queryKey: ['prep-sessions'] }); };

  const grade = useMutation({
    mutationFn: async ({ q, answer }: { q: Question; answer: string }) => (await api.post(`/prep/sessions/${id}/questions/${q.id}/answer`, { answer })).data.data as Session,
    onSuccess: put,
    onError: () => qc.invalidateQueries({ queryKey: ['prep-session', id] }),
  });
  const rate = useMutation({
    mutationFn: async ({ q, rating, answer }: { q: Question; rating: number; answer: string }) => (await api.post(`/prep/sessions/${id}/questions/${q.id}/self-rate`, { rating, answer })).data.data as Session,
    onSuccess: put,
    onError: e => toast.error(apiError(e, 'Could not save the rating')),
  });
  const finish = useMutation({
    mutationFn: async () => (await api.post(`/prep/sessions/${id}/complete`)).data.data as Session,
    onSuccess: d => { put(d); toast.success('Session finished'); },
    onError: e => toast.error(apiError(e, 'Could not finish the session')),
  });

  if (isLoading) return <ListSkeleton rows={4} />;
  if (isError || !s) return <EmptyState art="chat" title="Couldn’t open this session" description={apiError(error)} action={<button className="btn-primary" onClick={onBack}>Back</button>} />;

  const q = s.questions[Math.min(idx, s.questions.length - 1)]!;
  const draft = drafts[q.id] ?? q.answer ?? '';
  const gradeCode = grade.isError && grade.variables?.q.id === q.id ? apiErrorCode(grade.error) : undefined;
  const showKeys = reveal[q.id] || !!q.feedback || q.selfRating != null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <button className="btn-ghost text-sm px-2 py-1" onClick={onBack}><ChevronLeft size={15} /> All sessions</button>
        <span className="text-sm" style={{ color: 'var(--fg-secondary)' }}>{pretty(s.level)} level{s.targetRole ? ` · ${s.targetRole}` : ''}</span>
        {s.overallScore != null && <span className="font-mono text-sm ml-auto" style={{ color: tone(s.overallScore) }}>Score so far {s.overallScore}/100</span>}
      </div>

      <nav className="flex gap-1.5 flex-wrap" aria-label="Questions">
        {s.questions.map((x, i) => (
          <button key={x.id} onClick={() => setIdx(i)} aria-current={i === idx ? 'step' : undefined} aria-label={`Question ${i + 1}${x.score != null ? `, scored ${x.score}` : x.answer ? ', answered' : ''}`}
            className="w-8 h-8 rounded-lg text-xs font-mono"
            style={{ background: i === idx ? 'var(--accent)' : 'var(--bg-secondary)', color: i === idx ? 'var(--accent-fg)' : x.score != null ? tone(x.score) : 'var(--fg-secondary)', border: '1px solid var(--border)' }}>
            {i + 1}
          </button>
        ))}
      </nav>

      <SectionCard>
        <div className="flex gap-2 mb-2 flex-wrap">
          <span className="badge badge-muted">{q.category}</span>
          <span className={`badge ${q.difficulty === 'hard' ? 'badge-red' : q.difficulty === 'medium' ? 'badge-amber' : 'badge-green'}`}>{q.difficulty}</span>
          {q.source === 'ai' && <span className="badge badge-orange">AI-written</span>}
        </div>
        <h2 className="font-display font-semibold text-lg" style={{ color: 'var(--fg-primary)' }}>{q.question}</h2>
        <label className="sr-only" htmlFor="prep-answer">Your answer</label>
        <textarea id="prep-answer" className="input mt-4 resize-y" rows={8} value={draft} maxLength={8000} disabled={s.status === 'COMPLETED'}
          placeholder={q.category === 'Introduction' || s.topic === 'hr' ? 'Answer as you would out loud. For stories, use Situation, Task, Action, Result.' : 'Explain your answer as you would to the interviewer…'}
          onChange={e => setDrafts(d => ({ ...d, [q.id]: e.target.value }))} />
        {s.status !== 'COMPLETED' && (
          <div className="flex gap-2 mt-3 flex-wrap">
            <button className="btn-primary" disabled={!aiReady || draft.trim().length < 10 || grade.isPending} title={aiReady ? undefined : 'AI is not configured'} onClick={() => grade.mutate({ q, answer: draft })}>
              {grade.isPending && grade.variables?.q.id === q.id ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Get AI feedback
            </button>
            {q.keyPoints.length > 0 && !showKeys && (
              <button className="btn-secondary" onClick={() => setReveal(r => ({ ...r, [q.id]: true }))}><Eye size={15} /> Show key points</button>
            )}
          </div>
        )}
        {grade.isError && grade.variables?.q.id === q.id && (
          <p className="text-sm mt-2" role="alert" style={{ color: 'var(--tone-red)' }}>
            {apiError(grade.error, 'Grading failed')}. Your answer was saved.{gradeCode && AI_SETUP_CODES.includes(gradeCode) && <> <Link to="/settings#ai" className="underline">Settings → AI</Link></>}
          </p>
        )}

        {showKeys && q.keyPoints.length > 0 && (
          <div className="mt-4 rounded-xl p-3" style={{ background: 'var(--bg-secondary)' }}>
            <p className="text-sm font-medium mb-1.5" style={{ color: 'var(--fg-primary)' }}>A strong answer covers</p>
            <ul className="list-disc pl-5 text-sm space-y-1" style={{ color: 'var(--fg-secondary)' }}>{q.keyPoints.map(k => <li key={k}>{k}</li>)}</ul>
            {!q.feedback && s.status !== 'COMPLETED' && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>How well did you cover them?</span>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} className="w-8 h-8 rounded-lg text-sm" disabled={rate.isPending} aria-pressed={q.selfRating === n} aria-label={`Rate ${n} of 5`}
                    style={{ background: q.selfRating === n ? 'var(--accent)' : 'var(--bg-card)', color: q.selfRating === n ? 'var(--accent-fg)' : 'var(--fg-primary)', border: '1px solid var(--border)' }}
                    onClick={() => rate.mutate({ q, rating: n, answer: draft })}>{n}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {q.feedback && (
          <div className="mt-4 space-y-3">
            <p className="text-sm" style={{ color: 'var(--fg-primary)' }}><strong style={{ color: tone(q.score) }}>{q.feedback.score}/10</strong> · {q.feedback.summary}</p>
            {q.feedback.strengths.length > 0 && <Block title="What worked" items={q.feedback.strengths} color="#34D399" />}
            {q.feedback.improvements.length > 0 && <Block title="How to improve" items={q.feedback.improvements} color="#FBBF24" />}
            {q.feedback.sampleAnswer && (
              <details className="rounded-xl p-3" style={{ background: 'var(--bg-secondary)' }}>
                <summary className="text-sm cursor-pointer" style={{ color: 'var(--fg-primary)' }}>Sample answer outline</summary>
                <p className="text-sm mt-2 whitespace-pre-wrap" style={{ color: 'var(--fg-secondary)' }}>{q.feedback.sampleAnswer}</p>
              </details>
            )}
          </div>
        )}

        <div className="flex justify-between mt-5">
          <button className="btn-ghost text-sm" disabled={idx === 0} onClick={() => setIdx(i => i - 1)}><ChevronLeft size={15} /> Previous</button>
          {idx < s.questions.length - 1
            ? <button className="btn-secondary text-sm" onClick={() => setIdx(i => i + 1)}>Next <ChevronRight size={15} /></button>
            : s.status !== 'COMPLETED' && <button className="btn-primary text-sm" disabled={finish.isPending} onClick={() => finish.mutate()}>{finish.isPending ? <Loader2 size={14} className="animate-spin" /> : <Flag size={14} />} Finish session</button>}
        </div>
      </SectionCard>

      {s.status === 'COMPLETED' && s.summary && (
        <SectionCard title="Session summary">
          <p className="text-sm" style={{ color: 'var(--fg-secondary)' }}>
            <CheckCircle2 size={15} className="inline mr-1" color="#34D399" />
            {s.summary.answered} of {s.summary.total} answered, {s.summary.graded} scored. Overall <strong style={{ color: tone(s.overallScore) }}>{s.overallScore ?? '–'}/100</strong>.
          </p>
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            {s.summary.strengths.length > 0 && <Block title="Strong areas" items={s.summary.strengths} color="#34D399" />}
            {s.summary.focusAreas.length > 0 && <Block title="Practise more" items={s.summary.focusAreas} color="#FBBF24" />}
          </div>
          {s.summary.improvements.length > 0 && <div className="mt-3"><Block title="Top improvements" items={s.summary.improvements} color="var(--accent)" /></div>}
        </SectionCard>
      )}
    </div>
  );
}

function Block({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--bg-secondary)' }}>
      <p className="text-sm font-medium mb-1" style={{ color }}>{title}</p>
      <ul className="list-disc pl-5 text-sm space-y-1" style={{ color: 'var(--fg-secondary)' }}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}
