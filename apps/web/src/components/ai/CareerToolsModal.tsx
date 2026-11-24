import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Sparkles, Copy } from 'lucide-react';
import { api } from '@/lib/api';
import { AI_SETUP_CODES, apiError, apiErrorCode } from '@/lib/format';
import { toast } from '@/store/toast.store';
import type { Job } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';

type Task = 'jd_analysis' | 'skill_gap' | 'application_help' | 'roadmap' | 'email';
const TASKS: Array<[Task, string, string]> = [
  ['jd_analysis', 'Analyse a job', 'Must-haves, nice-to-haves, ATS keywords, red flags and questions to ask'],
  ['skill_gap', 'Skill gap', 'What your resume shows against the job, and how to close each gap'],
  ['application_help', 'Application help', 'A “why me” pitch, resume tweaks and draft screening answers'],
  ['roadmap', 'Career roadmap', 'A week-by-week plan toward a role, built around your skills'],
  ['email', 'Professional email', 'Follow-ups, thank-you notes, referral asks and recruiter messages'],
];

/* eslint-disable @typescript-eslint/no-explicit-any -- results are rendered field by field below */
type Result = Record<string, any>;

export default function CareerToolsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [task, setTask] = useState<Task>('jd_analysis');
  const [jobId, setJobId] = useState('');
  const [jd, setJd] = useState('');
  const [target, setTarget] = useState('');
  const [weeks, setWeeks] = useState(8);
  const [email, setEmail] = useState({ kind: 'follow_up', company: '', role: '', recipientName: '', context: '' });
  const jobs = useQuery({ queryKey: ['jobs', 'career-picker'], enabled: open, queryFn: async () => (await api.get('/jobs', { params: { limit: 50, sort: 'date' } })).data.data.jobs as Job[] });

  const run = useMutation({
    mutationFn: async (): Promise<{ task: Task; data: Result }> => {
      if (task === 'email') {
        const body = { kind: email.kind, company: email.company.trim(), role: email.role.trim(), recipientName: email.recipientName.trim() || undefined, context: email.context.trim() || undefined };
        return { task, data: (await api.post('/recruiter-messages/draft', body)).data.data };
      }
      const body = task === 'roadmap' ? { target: target.trim(), weeks } : { jobId: jobId || undefined, jobDescription: jobId ? undefined : jd };
      return { task, data: (await api.post(`/ai/career/${task}`, body)).data.data };
    },
  });
  const code = run.isError ? apiErrorCode(run.error) : undefined;
  const needsJob = task === 'jd_analysis' || task === 'skill_gap' || task === 'application_help';
  const canRun = needsJob ? !!jobId || jd.trim().length >= 40 : task === 'roadmap' ? target.trim().length >= 2 : !!(email.company.trim() && email.role.trim());
  const result = run.data?.task === task ? run.data.data : null;

  return (
    <Modal open={open} onClose={onClose} title="Career tools" wide>
      <div className="space-y-4">
        <div className="flex gap-1 flex-wrap" role="tablist">
          {TASKS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={task === id} onClick={() => { setTask(id); run.reset(); }} className="px-3 py-1.5 rounded-md text-sm"
              style={task === id ? { background: 'var(--accent-dim)', color: 'var(--accent)' } : { color: 'var(--fg-secondary)' }}>{label}</button>
          ))}
        </div>
        <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>{TASKS.find(t => t[0] === task)![2]}. Results are drafts for you to review; nothing is sent or submitted.</p>

        <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (canRun) run.mutate(); }}>
          {needsJob && (
            <>
              <label className="block text-sm" style={{ color: 'var(--fg-primary)' }}>Saved job
                <select className="input mt-1" value={jobId} onChange={e => setJobId(e.target.value)}>
                  <option value="">Paste a job description instead</option>
                  {jobs.data?.map(j => <option key={j.id} value={j.id}>{j.title} · {j.companyName}</option>)}
                </select>
              </label>
              {!jobId && <label className="block text-sm" style={{ color: 'var(--fg-primary)' }}>Job description
                <textarea className="input mt-1 resize-none" rows={5} value={jd} onChange={e => setJd(e.target.value)} maxLength={12000} placeholder="Paste the job description…" /></label>}
              {task !== 'jd_analysis' && <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>Uses your default resume.</p>}
            </>
          )}
          {task === 'roadmap' && (
            <div className="flex gap-2 flex-wrap">
              <label className="sr-only" htmlFor="ct-target">Target</label>
              <input id="ct-target" className="input flex-1 min-w-[14rem]" placeholder="e.g. Senior Frontend Engineer" value={target} onChange={e => setTarget(e.target.value)} maxLength={200} />
              <label className="sr-only" htmlFor="ct-weeks">Weeks</label>
              <select id="ct-weeks" className="input w-32" value={weeks} onChange={e => setWeeks(Number(e.target.value))}>{[4, 8, 12, 16, 24].map(w => <option key={w} value={w}>{w} weeks</option>)}</select>
            </div>
          )}
          {task === 'email' && (
            <div className="grid sm:grid-cols-2 gap-2">
              <label className="text-sm" style={{ color: 'var(--fg-primary)' }}>Type
                <select className="input mt-1" value={email.kind} onChange={e => setEmail({ ...email, kind: e.target.value })}>
                  <option value="follow_up">Follow-up after applying</option><option value="thank_you">Thank-you after an interview</option>
                  <option value="referral">Referral request</option><option value="email">Email to a recruiter</option><option value="linkedin">LinkedIn note</option>
                </select>
              </label>
              <label className="text-sm" style={{ color: 'var(--fg-primary)' }}>Recipient name (optional)<input className="input mt-1" value={email.recipientName} onChange={e => setEmail({ ...email, recipientName: e.target.value })} maxLength={120} /></label>
              <label className="text-sm" style={{ color: 'var(--fg-primary)' }}>Company<input className="input mt-1" value={email.company} onChange={e => setEmail({ ...email, company: e.target.value })} maxLength={200} /></label>
              <label className="text-sm" style={{ color: 'var(--fg-primary)' }}>Role<input className="input mt-1" value={email.role} onChange={e => setEmail({ ...email, role: e.target.value })} maxLength={200} /></label>
              <label className="text-sm sm:col-span-2" style={{ color: 'var(--fg-primary)' }}>Context (optional)<textarea className="input mt-1 resize-none" rows={2} value={email.context} onChange={e => setEmail({ ...email, context: e.target.value })} maxLength={2000} placeholder="e.g. Interviewed with Priya on Tuesday about the payments team" /></label>
            </div>
          )}
          <button className="btn-primary" disabled={!canRun || run.isPending}>{run.isPending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {run.isPending ? 'Working…' : 'Run'}</button>
        </form>

        {run.isError && (
          <p className="text-sm" role="alert" style={{ color: 'var(--tone-red)' }}>{apiError(run.error, 'That didn’t work')} {code && AI_SETUP_CODES.includes(code) && <Link to="/settings#ai" className="underline">Settings → AI</Link>}</p>
        )}
        {result && <ResultView task={task} r={result} />}
      </div>
    </Modal>
  );
}

function ResultView({ task, r }: { task: Task; r: Result }) {
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success('Copied'), () => toast.error('Could not copy'));
  if (task === 'jd_analysis') return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--fg-primary)' }}>{r['summary']} {r['seniority'] && <span className="badge badge-muted ml-1">{r['seniority']}</span>}</p>
      <div className="grid sm:grid-cols-2 gap-3"><L t="Must have" i={r['mustHave']} /><L t="Nice to have" i={r['niceToHave']} /></div>
      <L t="Responsibilities" i={r['responsibilities']} />
      <Chips t="Keywords to mirror on your resume" i={r['keywords']} />
      <div className="grid sm:grid-cols-2 gap-3"><L t="Red flags" i={r['redFlags']} /><L t="Questions to ask them" i={r['questionsToAsk']} /></div>
    </div>
  );
  if (task === 'skill_gap') return (
    <div className="space-y-3">
      {r['matchScore'] != null && <p className="text-sm" style={{ color: 'var(--fg-primary)' }}>AI match estimate: <strong>{r['matchScore']}%</strong>{r['skillsCheck'] && <> · listed skills you have: {r['skillsCheck'].matched.length}/{r['skillsCheck'].total}</>}</p>}
      <L t="What your resume shows" i={r['strengths']} />
      {r['gaps']?.length > 0 && (
        <Box t="Gaps and how to close them">
          <ul className="space-y-2 text-sm">{r['gaps'].map((g: Result, i: number) => (
            <li key={i}><span className={`badge ${g['importance'] === 'must' ? 'badge-red' : 'badge-amber'} mr-1.5`}>{g['importance'] === 'must' ? 'Must' : 'Nice'}</span><strong style={{ color: 'var(--fg-primary)' }}>{g['skill']}</strong>
              <span style={{ color: 'var(--fg-secondary)' }}> · {g['howToClose']}{g['timeEstimate'] ? ` (${g['timeEstimate']})` : ''}</span></li>))}</ul>
          <Link to="/learning" className="text-xs underline mt-2 inline-block" style={{ color: 'var(--accent)' }}>Track these on the Learning page</Link>
        </Box>
      )}
      <L t="Quick wins (check these are true first)" i={r['quickWins']} />
    </div>
  );
  if (task === 'application_help') return (
    <div className="space-y-3">
      {r['fitSummary'] && <p className="text-sm" style={{ color: 'var(--fg-primary)' }}>{r['fitSummary']}</p>}
      <Box t="Your pitch" action={<button type="button" className="btn-ghost p-1" aria-label="Copy pitch" onClick={() => copy(r['pitch'])}><Copy size={13} /></button>}><p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--fg-secondary)' }}>{r['pitch']}</p></Box>
      <div className="grid sm:grid-cols-2 gap-3"><L t="Resume tweaks" i={r['resumeTweaks']} /><L t="Cover letter points" i={r['coverLetterPoints']} /></div>
      {r['screeningAnswers']?.length > 0 && <Box t="Draft screening answers"><dl className="space-y-2 text-sm">{r['screeningAnswers'].map((x: Result, i: number) => <div key={i}><dt className="font-medium" style={{ color: 'var(--fg-primary)' }}>{x['question']}</dt><dd style={{ color: 'var(--fg-secondary)' }}>{x['answer']}</dd></div>)}</dl></Box>}
      <L t="Before you submit" i={r['checklist']} />
    </div>
  );
  if (task === 'roadmap') return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--fg-primary)' }}><strong>{r['title']}</strong>{r['summary'] ? ` · ${r['summary']}` : ''}</p>
      <ol className="space-y-1 text-sm">{r['steps']?.map((s: Result, i: number) => <li key={i} style={{ color: 'var(--fg-secondary)' }}><span className="text-xs font-mono mr-2" style={{ color: 'var(--fg-muted)' }}>Week {s['week']}</span>{s['title']}{s['resource'] ? <span className="text-xs" style={{ color: 'var(--fg-muted)' }}> · {s['resource']}</span> : null}</li>)}</ol>
      <L t="Milestones" i={r['milestones']} />
      <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>To track it step by step, create it from the <Link to="/learning" className="underline">Learning page</Link>.</p>
    </div>
  );
  return (
    <Box t={r['subject'] ? `Subject: ${r['subject']}` : 'Draft'} action={<button type="button" className="btn-ghost p-1" aria-label="Copy message" onClick={() => copy(`${r['subject'] ? `Subject: ${r['subject']}\n\n` : ''}${r['content']}`)}><Copy size={13} /></button>}>
      <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--fg-secondary)' }}>{r['content']}</p>
      <p className="text-xs mt-2" style={{ color: 'var(--fg-muted)' }}>Saved to your messages. Nothing was sent.</p>
    </Box>
  );
}

function Box({ t, children, action }: { t: string; children: ReactNode; action?: ReactNode }) {
  return <div className="rounded-xl p-3" style={{ background: 'var(--bg-secondary)' }}><div className="flex items-center justify-between mb-1.5"><p className="text-sm font-medium" style={{ color: 'var(--fg-primary)' }}>{t}</p>{action}</div>{children}</div>;
}
function L({ t, i }: { t: string; i?: string[] }) {
  if (!i?.length) return null;
  return <Box t={t}><ul className="list-disc pl-5 text-sm space-y-1" style={{ color: 'var(--fg-secondary)' }}>{i.map((x, k) => <li key={k}>{x}</li>)}</ul></Box>;
}
function Chips({ t, i }: { t: string; i?: string[] }) {
  if (!i?.length) return null;
  return <Box t={t}><div className="flex flex-wrap gap-1.5">{i.map(x => <span key={x} className="badge badge-muted">{x}</span>)}</div></Box>;
}
