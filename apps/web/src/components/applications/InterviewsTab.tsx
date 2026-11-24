import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, CheckCircle2, Loader2, Plus, Sparkles, Trash2, Video, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { api, downloadFromApi } from '@/lib/api';
import { apiError, formatDate } from '@/lib/format';
import { toast } from '@/store/toast.store';
import EmptyState from '@/components/ui/EmptyState';

export interface InterviewItem {
  id: string;
  type: string;
  status: string;
  scheduledAt?: string | null;
  durationMinutes?: number | null;
  location?: string | null;
  meetingUrl?: string | null;
  interviewer?: string | null;
  notes?: string | null;
}

const TYPES = ['HR', 'TECHNICAL', 'CODING', 'SYSTEM_DESIGN', 'BEHAVIORAL', 'FINAL', 'OTHER'] as const;
const typeLabel = (t: string) => t.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());

const card = { background: 'var(--bg-card)', border: '1px solid var(--border)' } as const;

/** Interviews for one application: schedule, add to calendar, practise with AI feedback. */
export default function InterviewsTab({ appId, interviews, onChange }: { appId: string; interviews: InterviewItem[]; onChange: () => void }) {
  const [adding, setAdding] = useState(interviews.length === 0);
  const [practiceId, setPracticeId] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => api.put(`/interviews/${id}`, data),
    onSuccess: onChange,
    onError: e => toast.error(apiError(e, 'Could not update the interview')),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/interviews/${id}`),
    onSuccess: () => { toast.success('Interview removed'); onChange(); },
    onError: e => toast.error(apiError(e, 'Could not delete the interview')),
  });

  const addToCalendar = async (i: InterviewItem) => {
    try {
      await downloadFromApi(`/interviews/${i.id}/calendar.ics`, 'interview.ics');
      toast.success('Calendar file downloaded. Open it to add the interview to your calendar.');
    } catch (e) {
      toast.error(apiError(e, 'Could not create the calendar file'));
    }
  };

  return (
    <div className="space-y-4">
      {!adding && (
        <button className="btn-secondary" onClick={() => setAdding(true)}><Plus size={14} /> Schedule interview</button>
      )}
      {adding && <AddInterviewForm appId={appId} onDone={() => { setAdding(false); onChange(); }} onCancel={interviews.length ? () => setAdding(false) : undefined} />}

      {interviews.length === 0 && !adding && <EmptyState compact title="No interviews yet" description="Schedule one to get a reminder, a calendar invite and practice questions." />}

      <ul className="space-y-3">
        {interviews.map(i => (
          <li key={i.id} className="p-3 rounded-lg" style={card}>
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--fg-primary)' }}>
                  {typeLabel(i.type)} interview
                  <span className={`badge ml-2 ${i.status === 'COMPLETED' ? 'badge-green' : i.status === 'CANCELLED' ? 'badge-red' : 'badge-blue'}`}>{typeLabel(i.status)}</span>
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--fg-secondary)' }}>
                  {i.scheduledAt ? formatDate(i.scheduledAt, 'EEE d MMM yyyy, h:mm a') : 'Date not set'}
                  {i.durationMinutes ? ` · ${i.durationMinutes} min` : ''}
                  {i.interviewer ? ` · with ${i.interviewer}` : ''}
                </p>
                {i.location && <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>{i.location}</p>}
              </div>
              <button className="btn-ghost p-1" aria-label="Delete interview" style={{ color: 'var(--tone-red)' }} onClick={() => del.mutate(i.id)}><Trash2 size={13} /></button>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {i.meetingUrl && <a className="btn-secondary text-xs py-1" href={i.meetingUrl} target="_blank" rel="noopener noreferrer"><Video size={12} /> Join link</a>}
              {i.scheduledAt && <button className="btn-secondary text-xs py-1" onClick={() => addToCalendar(i)}><CalendarPlus size={12} /> Add to calendar</button>}
              <button className="btn-secondary text-xs py-1" onClick={() => setPracticeId(practiceId === i.id ? null : i.id)}>
                <Sparkles size={12} /> Practice {practiceId === i.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {i.status === 'SCHEDULED' && (
                <>
                  <button className="btn-ghost text-xs py-1" onClick={() => update.mutate({ id: i.id, data: { status: 'COMPLETED' } })}><CheckCircle2 size={12} /> Mark done</button>
                  <button className="btn-ghost text-xs py-1" onClick={() => update.mutate({ id: i.id, data: { status: 'CANCELLED' } })}><XCircle size={12} /> Cancel</button>
                </>
              )}
            </div>
            {practiceId === i.id && <PracticePanel interviewId={i.id} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AddInterviewForm({ appId, onDone, onCancel }: { appId: string; onDone: () => void; onCancel?: () => void }) {
  const [form, setForm] = useState({ type: 'TECHNICAL', scheduledAt: '', durationMinutes: '60', location: '', meetingUrl: '', interviewer: '' });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [k]: e.target.value }));

  const add = useMutation({
    mutationFn: () =>
      api.post(`/applications/${appId}/interviews`, {
        type: form.type,
        scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
        durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined,
        location: form.location.trim() || undefined,
        meetingUrl: form.meetingUrl.trim() || undefined,
        interviewer: form.interviewer.trim() || undefined,
      }),
    onSuccess: () => { toast.success('Interview scheduled'); onDone(); },
    onError: e => toast.error(apiError(e, 'Could not save the interview')),
  });

  return (
    <form className="p-3 rounded-lg space-y-3" style={card} onSubmit={e => { e.preventDefault(); add.mutate(); }}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="iv-type">Round</label>
          <select id="iv-type" className="input" value={form.type} onChange={set('type')}>
            {TYPES.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="iv-dur">Length (min)</label>
          <input id="iv-dur" type="number" min={5} max={600} className="input" value={form.durationMinutes} onChange={set('durationMinutes')} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="iv-when">Date and time</label>
        <input id="iv-when" type="datetime-local" className="input" value={form.scheduledAt} onChange={set('scheduledAt')} />
      </div>
      <div>
        <label className="label" htmlFor="iv-url">Meeting link</label>
        <input id="iv-url" type="url" className="input" placeholder="https://meet.google.com/…" value={form.meetingUrl} onChange={set('meetingUrl')} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="iv-loc">Location</label>
          <input id="iv-loc" className="input" placeholder="Office address or 'Online'" value={form.location} onChange={set('location')} />
        </div>
        <div>
          <label className="label" htmlFor="iv-who">Interviewer</label>
          <input id="iv-who" className="input" placeholder="Name, role" value={form.interviewer} onChange={set('interviewer')} />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={add.isPending}>{add.isPending && <Loader2 size={14} className="animate-spin" />} Save interview</button>
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

interface PracticeQuestion {
  id: string;
  question: string;
  category?: string | null;
  difficulty?: string | null;
  userAnswer?: string | null;
  score?: number | null;
  aiFeedback?: { score: number; summary: string; strengths: string[]; improvements: string[]; sampleAnswer: string } | null;
}

function PracticePanel({ interviewId }: { interviewId: string }) {
  const qc = useQueryClient();
  const key = ['interview', interviewId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get(`/interviews/${interviewId}`)).data.data as { questions: PracticeQuestion[] },
  });
  const generate = useMutation({
    mutationFn: async () => (await api.post(`/interviews/${interviewId}/practice`, { count: 5 })).data.data as PracticeQuestion[],
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: e => toast.error(apiError(e, 'Could not generate questions')),
  });

  const questions = data?.questions ?? [];
  const answered = questions.filter(q => q.score != null);
  const avg = answered.length ? Math.round((answered.reduce((s, q) => s + (q.score ?? 0), 0) / answered.length) * 10) / 10 : null;

  return (
    <div className="mt-3 pt-3 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <button className="btn-primary text-xs py-1.5" onClick={() => generate.mutate()} disabled={generate.isPending}>
          {generate.isPending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {questions.length ? 'More questions' : 'Generate practice questions'}
        </button>
        {avg !== null && <span className="text-xs" style={{ color: 'var(--fg-secondary)' }}>Average score {avg}/10 over {answered.length} answer{answered.length > 1 ? 's' : ''}</span>}
      </div>
      {isLoading ? <Loader2 size={16} className="animate-spin" /> : questions.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>Questions are tailored to this round, the job and your resume. Answer them and get a score with tips.</p>
      ) : (
        <ol className="space-y-3">
          {questions.map((q, n) => <PracticeItem key={q.id} n={n + 1} q={q} interviewId={interviewId} onChange={() => qc.invalidateQueries({ queryKey: key })} />)}
        </ol>
      )}
    </div>
  );
}

function PracticeItem({ n, q, interviewId, onChange }: { n: number; q: PracticeQuestion; interviewId: string; onChange: () => void }) {
  const [answer, setAnswer] = useState(q.userAnswer ?? '');
  const grade = useMutation({
    mutationFn: () => api.post(`/interviews/${interviewId}/practice/${q.id}/answer`, { answer }),
    onSuccess: onChange,
    onError: e => toast.error(apiError(e, 'Could not get feedback')),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/interviews/${interviewId}/practice/${q.id}`),
    onSuccess: onChange,
  });
  const f = q.aiFeedback;

  return (
    <li className="space-y-2">
      <div className="flex items-start gap-2">
        <p className="text-sm font-medium flex-1" style={{ color: 'var(--fg-primary)' }}>{n}. {q.question}</p>
        {q.difficulty && <span className={`badge ${q.difficulty === 'hard' ? 'badge-red' : q.difficulty === 'medium' ? 'badge-amber' : 'badge-green'}`}>{q.difficulty}</span>}
        <button className="btn-ghost p-1" aria-label="Remove question" onClick={() => remove.mutate()}><Trash2 size={12} /></button>
      </div>
      <label className="sr-only" htmlFor={`ans-${q.id}`}>Your answer</label>
      <textarea id={`ans-${q.id}`} rows={4} className="input resize-y text-sm" placeholder="Type your answer as you'd say it…" value={answer} onChange={e => setAnswer(e.target.value)} />
      <button className="btn-secondary text-xs py-1" onClick={() => grade.mutate()} disabled={grade.isPending || answer.trim().length < 10}>
        {grade.isPending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {f ? 'Grade again' : 'Get feedback'}
      </button>
      {f && (
        <div className="p-3 rounded-lg text-sm space-y-2" style={{ background: 'var(--bg-hover)' }}>
          <p style={{ color: 'var(--fg-primary)' }}>
            <span className={`badge mr-2 ${f.score >= 8 ? 'badge-green' : f.score >= 5 ? 'badge-amber' : 'badge-red'}`}>{f.score}/10</span>{f.summary}
          </p>
          {f.strengths.length > 0 && <div><p className="text-xs font-semibold" style={{ color: 'var(--tone-green)' }}>What worked</p><ul className="list-disc ml-5 text-xs" style={{ color: 'var(--fg-secondary)' }}>{f.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
          {f.improvements.length > 0 && <div><p className="text-xs font-semibold" style={{ color: 'var(--tone-amber)' }}>To improve</p><ul className="list-disc ml-5 text-xs" style={{ color: 'var(--fg-secondary)' }}>{f.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
          {f.sampleAnswer && <details><summary className="text-xs cursor-pointer" style={{ color: 'var(--accent)' }}>See a stronger answer outline</summary><p className="text-xs whitespace-pre-wrap mt-1" style={{ color: 'var(--fg-secondary)' }}>{f.sampleAnswer}</p></details>}
        </div>
      )}
    </li>
  );
}
