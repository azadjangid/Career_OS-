import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Sparkles, Pencil, Loader2, GitCompare, RotateCcw, Download, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { AI_SETUP_CODES, apiError, apiErrorCode, formatDate } from '@/lib/format';
import { toast } from '@/store/toast.store';
import { downloadResumePdf, RESUME_TEMPLATES, type ResumeTemplate } from '@/lib/exportDocs';
import type { Resume, ResumeCompare, ResumeVersionDetail, ResumeVersionSummary } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';
import { ListSkeleton } from '@/components/ui/Skeleton';

type Tab = 'history' | 'improve' | 'edit';
const SOURCE: Record<string, { label: string; cls: string }> = {
  upload: { label: 'Upload', cls: 'badge-muted' },
  ai_improved: { label: 'AI-improved', cls: 'badge-orange' },
  manual: { label: 'Edited', cls: 'badge-blue' },
  restore: { label: 'Restored', cls: 'badge-muted' },
};
const tone = (n?: number | null) => (n == null ? 'var(--fg-muted)' : n >= 70 ? 'var(--tone-green)' : n >= 50 ? 'var(--tone-amber)' : 'var(--tone-red)');

export default function VersionsModal({ resume, onClose }: { resume: Resume | null; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('history');
  const [compare, setCompare] = useState<{ a?: string; b?: string } | null>(null);
  const close = () => { setTab('history'); setCompare(null); onClose(); };

  return (
    <Modal open={!!resume} onClose={close} title={resume ? `Versions · ${resume.name}` : 'Versions'} wide>
      {resume && (
        <div className="space-y-5">
          <div className="flex gap-1 p-1 rounded-lg w-fit" role="tablist" style={{ background: 'var(--bg-secondary)' }}>
            {([['history', 'History', History], ['improve', 'Improve with AI', Sparkles], ['edit', 'Edit text', Pencil]] as const).map(([id, label, Icon]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setCompare(null); }}
                className="px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5"
                style={tab === id ? { background: 'var(--bg-card)', color: 'var(--fg-primary)' } : { color: 'var(--fg-muted)' }}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
          {compare ? <CompareView resumeId={resume.id} a={compare.a} b={compare.b} onBack={() => setCompare(null)} />
            : tab === 'history' ? <HistoryTab resume={resume} onCompare={(b) => setCompare({ b })} />
            : tab === 'improve' ? <ImproveTab resume={resume} onDone={(id) => { setTab('history'); setCompare({ b: id }); }} />
            : <EditTab resume={resume} onSaved={() => setTab('history')} />}
        </div>
      )}
    </Modal>
  );
}

function useInvalidate(resumeId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['resume-versions', resumeId] });
    qc.invalidateQueries({ queryKey: ['resume-compare', resumeId] });
    qc.invalidateQueries({ queryKey: ['resume-ats', resumeId] });
    qc.invalidateQueries({ queryKey: ['resumes'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

async function fetchVersion(resumeId: string, versionId: string) {
  return (await api.get(`/resumes/${resumeId}/versions/${versionId}`)).data.data as ResumeVersionDetail;
}

function HistoryTab({ resume, onCompare }: { resume: Resume; onCompare: (versionId: string) => void }) {
  const invalidate = useInvalidate(resume.id);
  const [template, setTemplate] = useState<ResumeTemplate>('classic');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['resume-versions', resume.id],
    queryFn: async () => (await api.get(`/resumes/${resume.id}/versions`)).data.data as { current: number; versions: ResumeVersionSummary[] },
  });
  const restore = useMutation({
    mutationFn: (versionId: string) => api.post(`/resumes/${resume.id}/versions/${versionId}/restore`),
    onSuccess: () => { toast.success('That version is now the one used for matching and applications'); invalidate(); },
    onError: e => toast.error(apiError(e, 'Could not switch version')),
  });
  const pdf = useMutation({
    mutationFn: async (v: ResumeVersionSummary) => {
      const full = await fetchVersion(resume.id, v.id);
      if (!full.text?.trim()) throw new Error('This version has no saved text');
      await downloadResumePdf(`${resume.name} v${v.version}`, full.text, template);
    },
    onError: e => toast.error(apiError(e, 'Could not create the PDF')),
  });

  if (isLoading) return <ListSkeleton rows={3} />;
  if (isError || !data) return <div className="text-sm" style={{ color: 'var(--fg-secondary)' }}>Couldn’t load the history. <button className="underline" onClick={() => refetch()}>Try again</button></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="pdf-template" style={{ color: 'var(--fg-muted)' }}>PDF template</label>
        <select id="pdf-template" className="input py-1.5 w-auto" value={template} onChange={e => setTemplate(e.target.value as ResumeTemplate)}>
          {RESUME_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>{RESUME_TEMPLATES.find(t => t.id === template)?.hint}</span>
      </div>
      <ul className="space-y-2">
        {data.versions.map(v => {
          const isCurrent = v.version === data.current;
          const src = SOURCE[v.source] ?? SOURCE['upload']!;
          return (
            <li key={v.id} className="rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3" style={{ background: 'var(--bg-secondary)', border: isCurrent ? '1px solid var(--accent)' : '1px solid transparent' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>v{v.version}</span>
                  <span className="text-sm font-medium truncate" style={{ color: 'var(--fg-primary)' }}>{v.label ?? `Version ${v.version}`}</span>
                  <span className={`badge ${src.cls}`}>{src.label}</span>
                  {isCurrent && <span className="badge badge-green">In use</span>}
                </div>
                <div className="text-xs mt-0.5 flex gap-3 flex-wrap" style={{ color: 'var(--fg-muted)' }}>
                  <span>{formatDate(v.createdAt, 'd MMM yyyy, HH:mm')}</span>
                  {v.atsScore != null && <span className="font-mono" style={{ color: tone(v.atsScore) }}>ATS {v.atsScore}/100</span>}
                  {v.explanations?.length ? <span>{v.explanations.length} explained changes</span> : null}
                </div>
                {v.changes && <p className="text-xs mt-1" style={{ color: 'var(--fg-secondary)' }}>{v.changes}</p>}
              </div>
              <div className="flex gap-1 flex-wrap">
                {!isCurrent && <button className="btn-ghost text-xs px-2 py-1.5" onClick={() => onCompare(v.id)}><GitCompare size={14} /> Compare</button>}
                {!isCurrent && (
                  <button className="btn-secondary text-xs px-2 py-1.5" disabled={restore.isPending} onClick={() => restore.mutate(v.id)}>
                    {restore.isPending && restore.variables === v.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Use this version
                  </button>
                )}
                <button className="btn-ghost text-xs px-2 py-1.5" disabled={pdf.isPending} onClick={() => pdf.mutate(v)} aria-label={`Download version ${v.version} as PDF`}>
                  {pdf.isPending && pdf.variables?.id === v.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>The version marked “In use” is the text used for job matching, tailoring and cover letters. Switching never deletes a version.</p>
    </div>
  );
}

function CompareView({ resumeId, a, b, onBack }: { resumeId: string; a?: string; b?: string; onBack: () => void }) {
  const [onlyChanges, setOnlyChanges] = useState(true);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['resume-compare', resumeId, a ?? '', b ?? ''],
    queryFn: async () => (await api.get(`/resumes/${resumeId}/compare`, { params: { a, b } })).data.data as ResumeCompare,
  });
  if (isLoading) return <ListSkeleton rows={4} />;
  if (isError || !data) return <p className="text-sm" style={{ color: 'var(--tone-red)' }}>{apiError(error, 'Could not compare these versions')}</p>;
  const lines = onlyChanges ? data.diff.filter(l => l.type !== 'same') : data.diff;

  return (
    <div className="space-y-4">
      <button className="btn-ghost text-sm px-2 py-1" onClick={onBack}>← Back to history</button>
      <div className="flex items-center gap-3 flex-wrap text-sm" style={{ color: 'var(--fg-secondary)' }}>
        <VersionTag v={data.a} />
        <ArrowRight size={16} />
        <VersionTag v={data.b} />
        <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>+{data.stats.added} lines, −{data.stats.removed} lines</span>
      </div>
      {data.changes && <p className="text-sm" style={{ color: 'var(--fg-secondary)' }}>{data.changes}</p>}

      {data.explanations?.length ? (
        <div>
          <h3 className="font-display font-semibold mb-2 text-sm" style={{ color: 'var(--fg-primary)' }}>What changed and why</h3>
          <ol className="space-y-2">
            {data.explanations.map((c, i) => (
              <li key={i} className="rounded-xl p-3 text-sm" style={{ background: 'var(--bg-secondary)' }}>
                {c.section && <p className="text-xs mb-1 font-medium" style={{ color: 'var(--accent)' }}>{c.section}</p>}
                {c.original && <p className="line-through" style={{ color: 'var(--tone-red)' }}>{c.original}</p>}
                <p style={{ color: 'var(--tone-green)' }}>{c.improved}</p>
                {c.why && <p className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>{c.why}</p>}
              </li>
            ))}
          </ol>
          <p className="text-xs mt-2" style={{ color: 'var(--fg-muted)' }}>Replace any “[add your real metric]” with a real number before you use this version.</p>
        </div>
      ) : null}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--fg-primary)' }}>Line by line</h3>
          <label className="text-xs flex items-center gap-1.5" style={{ color: 'var(--fg-muted)' }}>
            <input type="checkbox" checked={onlyChanges} onChange={e => setOnlyChanges(e.target.checked)} /> Only changed lines
          </label>
        </div>
        {!lines.length ? <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>These versions have the same text.</p> : (
          <pre className="text-xs rounded-xl p-3 overflow-auto max-h-96 whitespace-pre-wrap font-mono" style={{ background: 'var(--bg-secondary)' }}>
            {lines.map((l, i) => (
              <div key={i} style={{ color: l.type === 'added' ? 'var(--tone-green)' : l.type === 'removed' ? 'var(--tone-red)' : 'var(--fg-secondary)', background: l.type === 'same' ? undefined : l.type === 'added' ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)' }}>
                {l.type === 'added' ? '+ ' : l.type === 'removed' ? '− ' : '  '}{l.text}
              </div>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}

function VersionTag({ v }: { v: ResumeCompare['a'] }) {
  return (
    <span className="rounded-lg px-2 py-1" style={{ background: 'var(--bg-secondary)' }}>
      v{v.version} {v.label ?? ''}{v.isCurrent ? ' (in use)' : ''}
      {v.atsScore != null && <span className="font-mono ml-1" style={{ color: tone(v.atsScore) }}>· ATS {v.atsScore}</span>}
    </span>
  );
}

function ImproveTab({ resume, onDone }: { resume: Resume; onDone: (versionId: string) => void }) {
  const invalidate = useInvalidate(resume.id);
  const [jd, setJd] = useState('');
  const run = useMutation({
    mutationFn: async () => (await api.post(`/resumes/${resume.id}/improve`, { jobDescription: jd.trim() || undefined })).data.data as {
      version: ResumeVersionSummary; before: number; after: number | null;
    },
    onSuccess: d => {
      toast.success(`Saved as v${d.version.version}. ATS ${d.before} → ${d.after ?? '?'}. Review it, then choose “Use this version”.`);
      invalidate();
      onDone(d.version.id);
    },
  });
  const code = run.isError ? apiErrorCode(run.error) : undefined;

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--fg-secondary)' }}>
        The AI rewrites your resume for clarity, impact and ATS readability, and explains every change. It never adds experience, skills or numbers you don’t have.
        The result is saved as a new version. Your current version stays in use until you switch.
      </p>
      <label className="text-sm" htmlFor="imp-jd" style={{ color: 'var(--fg-primary)' }}>Target job description (optional)</label>
      <textarea id="imp-jd" rows={6} className="input resize-none" placeholder="Paste a job description to emphasise what matters for it…" value={jd} onChange={e => setJd(e.target.value)} maxLength={12000} />
      <button className="btn-primary" disabled={run.isPending} onClick={() => run.mutate()}>
        {run.isPending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {run.isPending ? 'Improving… this can take a minute' : 'Improve my resume'}
      </button>
      {run.isError && (
        <p className="text-sm" role="alert" style={{ color: 'var(--tone-red)' }}>
          {apiError(run.error, 'Could not improve the resume')}
          {code && AI_SETUP_CODES.includes(code) && <> <Link to="/settings#ai" className="underline">Open Settings → AI</Link></>}
        </p>
      )}
    </div>
  );
}

function EditTab({ resume, onSaved }: { resume: Resume; onSaved: () => void }) {
  const invalidate = useInvalidate(resume.id);
  const [text, setText] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const preview = useQuery({
    queryKey: ['resume-preview', resume.id, resume.version],
    queryFn: async () => (await api.get(`/resumes/${resume.id}/preview`)).data.data as { text: string },
  });
  const value = text ?? preview.data?.text ?? '';
  const save = useMutation({
    mutationFn: () => api.post(`/resumes/${resume.id}/versions`, { text: value, label: label.trim() || undefined }),
    onSuccess: () => { toast.success('Saved as a new version and put in use'); setText(null); setLabel(''); invalidate(); onSaved(); },
    onError: e => toast.error(apiError(e, 'Could not save')),
  });
  if (preview.isLoading) return <ListSkeleton rows={4} />;

  return (
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
      <p className="text-sm" style={{ color: 'var(--fg-secondary)' }}>Edit the text used for matching and PDF export. Saving creates a new version; the uploaded file is kept unchanged.</p>
      <label className="sr-only" htmlFor="edit-text">Resume text</label>
      <textarea id="edit-text" rows={16} className="input font-mono text-xs" value={value} onChange={e => setText(e.target.value)} maxLength={60000} />
      <div className="flex gap-2 flex-wrap">
        <label className="sr-only" htmlFor="edit-label">Version name</label>
        <input id="edit-label" className="input flex-1 min-w-[12rem]" placeholder="Version name, e.g. “Frontend focus”" value={label} onChange={e => setLabel(e.target.value)} maxLength={120} />
        <button className="btn-primary" disabled={save.isPending || text === null || value.trim().length < 50}>
          {save.isPending ? <Loader2 size={15} className="animate-spin" /> : null} Save as new version
        </button>
      </div>
    </form>
  );
}
