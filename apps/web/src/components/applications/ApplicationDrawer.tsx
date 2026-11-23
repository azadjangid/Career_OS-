import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, ExternalLink, Pencil, Trash2, Loader2, Sparkles, Copy, Check, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { apiError, daysUntil, formatDate, formatSalary, timeAgo, formatStatus } from '@/lib/format';
import { toast } from '@/store/toast.store';
import { useUpdateApplicationStatus } from '@/hooks/queries';
import { STATUSES, STATUS_LABEL, STATUS_COLOR, type AppStatus } from '@/lib/constants';
import { CompanyLogo, MatchBadge, StatusBadge } from '@/components/ui/Bits';
import { Skeleton } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';

interface Detail {
  id: string; status: AppStatus; appliedAt?: string | null; followUpAt?: string | null; createdAt: string; salaryExpected?: number | null;
  job: {
    id: string; title: string; companyName: string; location?: string | null; description?: string | null; requirements?: string | null;
    skills: string[]; applyUrl?: string | null; workMode?: string | null; salaryMin?: number | null; salaryMax?: number | null; salaryCurrency?: string;
    company?: { logo?: string | null } | null; matches?: Array<{ overallScore: number; matchedSkills: string[]; missingSkills: string[] }>;
  };
  resume?: { id: string; name: string; fileName?: string | null; updatedAt: string } | null;
  statusHistory: Array<{ id: string; fromStatus: AppStatus | null; toStatus: AppStatus; changedAt: string; notes?: string | null }>;
  noteEntries: Array<{ id: string; content: string; createdAt: string; updatedAt: string }>;
  coverLetters: Array<{ id: string; title: string; content: string; createdAt: string }>;
  interviews: Array<{ id: string; type: string; status: string; scheduledAt?: string | null }>;
}

const TABS = ['Overview', 'Timeline', 'Notes', 'Interview prep', 'Documents'] as const;
type Tab = (typeof TABS)[number];

export default function ApplicationDrawerContent({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('Overview');
  const updateStatus = useUpdateApplicationStatus();

  const { data: app, isLoading, isError, error } = useQuery({
    queryKey: ['application', id],
    queryFn: async () => (await api.get(`/applications/${id}`)).data.data as Detail,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['application', id] });
    qc.invalidateQueries({ queryKey: ['applications'] });
  };

  const setFollowUp = useMutation({
    mutationFn: (date: string | null) => api.put(`/applications/${id}`, { followUpAt: date ? new Date(date).toISOString() : null }),
    onSuccess: () => { toast.success('Reminder updated'); refresh(); },
    onError: e => toast.error(apiError(e)),
  });

  if (isLoading) return <div className="p-5 space-y-4" role="status" aria-label="Loading"><Skeleton className="h-10 w-2/3 rounded" /><Skeleton className="h-32 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div>;
  if (isError || !app) return <div className="p-5"><EmptyState art="search" title="Couldn’t load this application" description={apiError(error)} action={<button className="btn-secondary" onClick={onClose}>Close</button>} /></div>;

  const match = app.job.matches?.[0];
  const days = daysUntil(app.followUpAt);

  return (
    <div className="flex flex-col h-full">
      <header className="p-5 pb-3 sticky top-0 z-10" style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-start gap-3">
          <CompanyLogo name={app.job.companyName} logo={app.job.company?.logo} size={44} />
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-semibold text-lg leading-tight" style={{ color: 'var(--fg-primary)' }}>{app.job.title}</h2>
            <p className="text-sm" style={{ color: 'var(--fg-secondary)' }}>{app.job.companyName}{app.job.location ? ` · ${app.job.location}` : ''}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5" aria-label="Close panel"><X size={18} /></button>
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <label className="sr-only" htmlFor="drawer-status">Status</label>
          <select id="drawer-status" value={app.status} onChange={e => updateStatus.mutate({ id, status: e.target.value as AppStatus }, { onSuccess: refresh })} className="input w-auto text-sm py-1.5">
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          {match && <MatchBadge score={Math.round(match.overallScore)} />}
          {days !== null && (
            <span className={`badge ${days < 0 ? 'badge-red' : days <= 2 ? 'badge-amber' : 'badge-muted'}`}><Clock size={10} />{days < 0 ? `Overdue ${-days}d` : days === 0 ? 'Follow up today' : `Follow up in ${days}d`}</span>
          )}
        </div>
        <div className="flex gap-1 mt-3 overflow-x-auto" role="tablist">
          {TABS.map(t => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className="px-3 py-1.5 rounded-md text-sm whitespace-nowrap"
              style={{ background: tab === t ? 'var(--accent-dim)' : 'transparent', color: tab === t ? 'var(--accent)' : 'var(--fg-secondary)' }}>{t}</button>
          ))}
        </div>
      </header>

      <div className="p-5 flex-1">
        {tab === 'Overview' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Applied" value={formatDate(app.appliedAt ?? app.createdAt)} />
              <Info label="Work mode" value={app.job.workMode ? formatStatus(app.job.workMode) : '—'} />
              <Info label="Salary range" value={formatSalary(app.job.salaryMin, app.job.salaryMax, app.job.salaryCurrency) || '—'} />
              <Info label="Resume used" value={app.resume?.name ?? '—'} />
            </div>

            <div>
              <label className="label" htmlFor="followup">Follow-up reminder</label>
              <div className="flex gap-2">
                <input id="followup" type="date" className="input" value={app.followUpAt ? app.followUpAt.slice(0, 10) : ''} onChange={e => setFollowUp.mutate(e.target.value || null)} />
                {app.followUpAt && <button className="btn-secondary" onClick={() => setFollowUp.mutate(null)}>Clear</button>}
              </div>
            </div>

            {app.job.skills.length > 0 && (
              <div>
                <p className="label">Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {app.job.skills.map(s => {
                    const have = match?.matchedSkills.includes(s);
                    return <span key={s} className={`badge ${have ? 'badge-green' : 'badge-muted'}`}>{s}</span>;
                  })}
                </div>
              </div>
            )}

            <div>
              <p className="label">Job description</p>
              <p className="text-sm whitespace-pre-wrap max-h-64 overflow-y-auto" style={{ color: 'var(--fg-secondary)' }}>
                {app.job.description || 'No description saved for this job.'}
              </p>
            </div>
            {app.job.applyUrl && <a href={app.job.applyUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary w-fit"><ExternalLink size={14} /> Open job posting</a>}
          </div>
        )}

        {tab === 'Timeline' && (
          app.statusHistory.length ? (
            <ol className="relative ml-2 space-y-5" style={{ borderLeft: '2px solid var(--border)' }}>
              {app.statusHistory.map(h => (
                <li key={h.id} className="pl-5 relative">
                  <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full" style={{ background: STATUS_COLOR[h.toStatus] }} aria-hidden />
                  <div className="flex items-center gap-2 flex-wrap">
                    {h.fromStatus && <><StatusBadge status={h.fromStatus} /><span style={{ color: 'var(--fg-muted)' }}>→</span></>}
                    <StatusBadge status={h.toStatus} />
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>{formatDate(h.changedAt, 'd MMM yyyy, h:mm a')} · {timeAgo(h.changedAt)}</p>
                  {h.notes && <p className="text-sm mt-1" style={{ color: 'var(--fg-secondary)' }}>{h.notes}</p>}
                </li>
              ))}
            </ol>
          ) : <EmptyState compact title="No status changes yet" />
        )}

        {tab === 'Notes' && <Notes appId={id} notes={app.noteEntries} onChange={refresh} />}
        {tab === 'Interview prep' && <InterviewPrep jobId={app.job.id} />}

        {tab === 'Documents' && (
          <div className="space-y-5">
            <div>
              <p className="label">Resume used</p>
              {app.resume ? (
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--fg-primary)' }}>{app.resume.name}</p>
                  <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>{app.resume.fileName} · updated {timeAgo(app.resume.updatedAt)}</p>
                </div>
              ) : <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>No resume attached to this application.</p>}
            </div>
            <div>
              <p className="label">Cover letters</p>
              {app.coverLetters.length ? app.coverLetters.map(c => <CoverLetterItem key={c.id} title={c.title} content={c.content} date={c.createdAt} />)
                : <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>No cover letter yet. Generate one from the Resumes page.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const Info = ({ label, value }: { label: string; value: string }) => (
  <div><p className="text-xs" style={{ color: 'var(--fg-muted)' }}>{label}</p><p style={{ color: 'var(--fg-primary)' }}>{value}</p></div>
);

function Notes({ appId, notes, onChange }: { appId: string; notes: Detail['noteEntries']; onChange: () => void }) {
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const add = useMutation({
    mutationFn: () => api.post(`/applications/${appId}/notes`, { content: text.trim() }),
    onSuccess: () => { setText(''); onChange(); },
    onError: e => toast.error(apiError(e, 'Could not add note')),
  });
  const save = useMutation({
    mutationFn: (noteId: string) => api.put(`/applications/${appId}/notes/${noteId}`, { content: editText.trim() }),
    onSuccess: () => { setEditing(null); onChange(); },
    onError: e => toast.error(apiError(e, 'Could not save note')),
  });
  const del = useMutation({
    mutationFn: (noteId: string) => api.delete(`/applications/${appId}/notes/${noteId}`),
    onSuccess: onChange,
    onError: e => toast.error(apiError(e, 'Could not delete note')),
  });

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="new-note" className="sr-only">New note</label>
        <textarea id="new-note" rows={3} className="input resize-none" placeholder="Add a note — recruiter name, interview feedback, next steps…" value={text} onChange={e => setText(e.target.value)} />
        <button className="btn-primary mt-2" disabled={!text.trim() || add.isPending} onClick={() => add.mutate()}>{add.isPending && <Loader2 size={14} className="animate-spin" />} Add note</button>
      </div>
      {notes.length === 0 ? <EmptyState compact title="No notes yet" /> : (
        <ul className="space-y-3">
          {notes.map(n => (
            <li key={n.id} className="p-3 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              {editing === n.id ? (
                <>
                  <textarea rows={3} className="input resize-none" value={editText} onChange={e => setEditText(e.target.value)} aria-label="Edit note" />
                  <div className="flex gap-2 mt-2"><button className="btn-primary text-xs py-1.5" onClick={() => save.mutate(n.id)} disabled={!editText.trim()}>Save</button><button className="btn-ghost text-xs py-1.5" onClick={() => setEditing(null)}>Cancel</button></div>
                </>
              ) : (
                <>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--fg-primary)' }}>{n.content}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>{formatDate(n.createdAt, 'd MMM, h:mm a')}{n.updatedAt !== n.createdAt ? ' · edited' : ''}</span>
                    <span className="flex gap-1">
                      <button className="btn-ghost p-1" aria-label="Edit note" onClick={() => { setEditing(n.id); setEditText(n.content); }}><Pencil size={13} /></button>
                      <button className="btn-ghost p-1" aria-label="Delete note" style={{ color: '#F87171' }} onClick={() => del.mutate(n.id)}><Trash2 size={13} /></button>
                    </span>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Question { question: string; difficulty?: string; category?: string; tips?: string; raw?: string }

function InterviewPrep({ jobId }: { jobId: string }) {
  const [category, setCategory] = useState('behavioral');
  const gen = useMutation({
    mutationFn: async () => (await api.post('/ai/interview-questions', { jobId, category })).data.data as Question[],
    onError: e => toast.error(apiError(e, 'Could not generate questions')),
  });
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="q-cat">Question type</label>
        <select id="q-cat" className="input" value={category} onChange={e => setCategory(e.target.value)}>
          <option value="behavioral">Behavioral</option><option value="technical">Technical</option><option value="system design">System design</option><option value="HR">HR / culture</option>
        </select>
        <button className="btn-primary shrink-0" onClick={() => gen.mutate()} disabled={gen.isPending}>
          {gen.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate
        </button>
      </div>
      {gen.data?.length ? (
        <ol className="space-y-3">
          {gen.data.map((q, i) => (
            <li key={i} className="p-3 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--fg-primary)' }}>{i + 1}. {q.question ?? q.raw}</p>
              {q.difficulty && <span className={`badge mt-2 ${q.difficulty === 'hard' ? 'badge-red' : q.difficulty === 'medium' ? 'badge-amber' : 'badge-green'}`}>{q.difficulty}</span>}
              {q.tips && <p className="text-xs mt-2" style={{ color: 'var(--fg-secondary)' }}>💡 {q.tips}</p>}
            </li>
          ))}
        </ol>
      ) : !gen.isPending && <EmptyState art="chat" compact title="Practice for this role" description="Generate likely interview questions based on the job description." />}
    </div>
  );
}

function CoverLetterItem({ title, content, date }: { title: string; content: string; date: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <details className="mb-2 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <summary className="px-3 py-2.5 text-sm cursor-pointer" style={{ color: 'var(--fg-primary)' }}>{title} <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>· {formatDate(date)}</span></summary>
      <div className="px-3 pb-3">
        <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--fg-secondary)' }}>{content}</p>
        <button className="btn-secondary text-xs py-1 mt-2" onClick={() => { navigator.clipboard.writeText(content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </details>
  );
}
