import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles, CheckCircle2, AlertTriangle, Lightbulb, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { apiError } from '@/lib/format';
import { toast } from '@/store/toast.store';
import type { AtsReport, Resume, ResumeAnalysis } from '@/lib/types';
import { ScoreRing } from '@/components/ui/Bits';
import { Modal } from '@/components/ui/Modal';

const BARS: Array<[keyof NonNullable<ResumeAnalysis['breakdown']>, string]> = [
  ['keywords', 'Keywords'], ['ats', 'ATS compatibility'], ['format', 'Format'], ['completeness', 'Completeness'],
];
const tone = (n: number) => (n >= 75 ? 'var(--tone-green)' : n >= 50 ? 'var(--tone-amber)' : 'var(--tone-red)');

export default function AnalysisModal({ resume, onClose }: { resume: Resume | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [jd, setJd] = useState('');
  const [jobResult, setJobResult] = useState<ResumeAnalysis['jobComparison'] | null>(null);

  const stored = resume?.aiAnalysis ?? null;
  const shown = analysis ?? stored;

  const run = useMutation({
    mutationFn: async (withJob: boolean) =>
      (await api.post('/ai/resume-analysis', { resumeId: resume!.id, jobDescription: withJob ? jd : undefined })).data.data as ResumeAnalysis,
    onSuccess: (data, withJob) => {
      if (withJob) setJobResult(data.jobComparison ?? null);
      else { setAnalysis(data); qc.invalidateQueries({ queryKey: ['resumes'] }); }
    },
    onError: e => toast.error(apiError(e, 'Analysis failed')),
  });

  return (
    <Modal open={!!resume} onClose={onClose} title={resume ? `Analysis · ${resume.name}` : 'Analysis'} wide>
      {resume && (
        <div className="space-y-6">
          <AtsCheckSection resumeId={resume.id} />
          <h3 className="font-display font-semibold -mb-2" style={{ color: 'var(--fg-primary)' }}>AI analysis</h3>
          {!shown && !run.isPending && (
            <div className="text-center py-6">
              <p className="text-sm mb-4" style={{ color: 'var(--fg-secondary)' }}>Get an AI review with strengths, weaknesses and specific suggestions for this resume.</p>
              <button className="btn-primary" onClick={() => run.mutate(false)}><Sparkles size={15} /> Analyze with AI</button>
            </div>
          )}
          {run.isPending && !run.variables && <p className="text-center py-8 text-sm" style={{ color: 'var(--fg-secondary)' }}><Loader2 className="inline animate-spin mr-2" size={16} />Analyzing your resume…</p>}

          {shown && (
            <>
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <ScoreRing score={Math.round(shown.atsScore ?? 0)} label="overall" />
                <div className="flex-1 w-full space-y-3">
                  {shown.breakdown && BARS.map(([k, label]) => (
                    <div key={k}>
                      <div className="flex justify-between text-xs mb-1"><span style={{ color: 'var(--fg-secondary)' }}>{label}</span><span className="font-mono" style={{ color: tone(shown.breakdown![k]) }}>{Math.round(shown.breakdown![k])}</span></div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}><div className="h-full rounded-full" style={{ width: `${shown.breakdown![k]}%`, background: tone(shown.breakdown![k]) }} /></div>
                    </div>
                  ))}
                  {!shown.breakdown && <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>This analysis predates the detailed breakdown — re-run it to see keyword, ATS, format and completeness scores.</p>}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <ListBlock icon={CheckCircle2} color="#34D399" title="Strengths" items={shown.strengths} />
                <ListBlock icon={AlertTriangle} color="#FBBF24" title="Needs work" items={shown.weaknesses} />
              </div>
              <ListBlock icon={Lightbulb} color="var(--accent)" title="Suggestions" items={shown.suggestions} />

              <button className="btn-secondary text-sm" onClick={() => { setAnalysis(null); run.mutate(false); }} disabled={run.isPending}>
                {run.isPending && !run.variables ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Re-run analysis
              </button>
            </>
          )}

          {/* Compare against a specific job */}
          <div className="pt-5" style={{ borderTop: '1px solid var(--border)' }}>
            <h3 className="font-display font-semibold mb-1" style={{ color: 'var(--fg-primary)' }}>Compare with a job</h3>
            <p className="text-xs mb-3" style={{ color: 'var(--fg-muted)' }}>Paste a job description to see which keywords and skills your resume is missing.</p>
            <label className="sr-only" htmlFor="an-jd">Job description</label>
            <textarea id="an-jd" rows={5} className="input resize-none" placeholder="Paste the job description here…" value={jd} onChange={e => setJd(e.target.value)} />
            <button className="btn-primary mt-2" disabled={jd.trim().length < 40 || run.isPending} onClick={() => run.mutate(true)}>
              {run.isPending && run.variables ? <Loader2 size={14} className="animate-spin" /> : null} Compare
            </button>
            {jobResult && (
              <div className="mt-4 space-y-3">
                <p className="text-sm" style={{ color: 'var(--fg-primary)' }}>Match for this job: <strong style={{ color: tone(jobResult.matchScore) }}>{Math.round(jobResult.matchScore)}%</strong></p>
                <Chips title="Missing keywords" items={jobResult.missingKeywords} cls="badge-red" />
                <Chips title="Missing skills" items={jobResult.missingSkills} cls="badge-amber" />
                <Chips title="Already matched" items={jobResult.matchedKeywords} cls="badge-green" />
                <ListBlock icon={Lightbulb} color="var(--accent)" title="Advice" items={jobResult.advice} />
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function ListBlock({ icon: Icon, color, title, items }: { icon: LucideIcon; color: string; title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--bg-secondary)' }}>
      <h4 className="flex items-center gap-2 text-sm font-medium mb-2" style={{ color: 'var(--fg-primary)' }}><span style={{ color }}><Icon size={15} /></span>{title}</h4>
      <ul className="space-y-1.5 list-disc pl-5 text-sm" style={{ color: 'var(--fg-secondary)' }}>{items.map((s, i) => <li key={i}>{s}</li>)}</ul>
    </div>
  );
}

function Chips({ title, items, cls }: { title: string; items?: string[]; cls: string }) {
  if (!items?.length) return null;
  return <div><p className="text-xs mb-1.5" style={{ color: 'var(--fg-muted)' }}>{title}</p><div className="flex flex-wrap gap-1.5">{items.map(s => <span key={s} className={`badge ${cls}`}>{s}</span>)}</div></div>;
}

/** Rule-based ATS check from the server. Works without any AI key. */
function AtsCheckSection({ resumeId }: { resumeId: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['resume-ats', resumeId],
    queryFn: async () => (await api.get(`/resumes/${resumeId}/ats`)).data.data as AtsReport,
  });
  if (isLoading) return <p className="text-sm py-4" style={{ color: 'var(--fg-secondary)' }}><Loader2 className="inline animate-spin mr-2" size={16} />Checking ATS readiness…</p>;
  if (isError || !data) return <p className="text-sm" style={{ color: 'var(--tone-red)' }}>{apiError(error, 'Could not run the ATS check')} <button className="underline" onClick={() => refetch()}>Retry</button></p>;
  const failing = data.checks.filter(c => !c.passed);
  return (
    <section aria-labelledby="ats-h" className="space-y-4">
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <ScoreRing score={data.score} label="ATS check" />
        <div className="flex-1 w-full">
          <h3 id="ats-h" className="font-display font-semibold mb-1" style={{ color: 'var(--fg-primary)' }}>ATS readiness</h3>
          <p className="text-xs mb-3" style={{ color: 'var(--fg-muted)' }}>
            Rule-based check of {data.checks.length} things applicant tracking systems look for ({data.wordCount} words read){data.keywordMatch ? `, plus keyword fit against ${data.keywordMatch.against}` : ''}. No AI needed.
          </p>
          <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {data.checks.map(c => (
              <li key={c.id} className="flex items-center gap-1.5" style={{ color: 'var(--fg-secondary)' }}>
                {c.passed ? <CheckCircle2 size={13} color="#34D399" aria-label="passed" /> : <XCircle size={13} color="#F87171" aria-label="needs work" />}
                <span className="flex-1">{c.label}</span><span className="font-mono" style={{ color: 'var(--fg-muted)' }}>{c.points}/{c.max}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {failing.length > 0 && <ListBlock icon={Lightbulb} color="#FBBF24" title="Fix these first" items={failing.map(c => c.tip ?? c.label)} />}
      {data.keywordMatch && (
        <div className="space-y-2">
          <p className="text-sm" style={{ color: 'var(--fg-primary)' }}>Keyword fit with {data.keywordMatch.against}: <strong style={{ color: tone(data.keywordMatch.score) }}>{data.keywordMatch.score}%</strong></p>
          <Chips title="Skills these jobs ask for that your resume doesn’t mention" items={data.keywordMatch.missing} cls="badge-amber" />
          <Chips title="Already covered" items={data.keywordMatch.matched} cls="badge-green" />
        </div>
      )}
    </section>
  );
}
