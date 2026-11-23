import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Wand2, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { apiError } from '@/lib/format';
import { toast } from '@/store/toast.store';
import type { Resume } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';

interface TailorResult {
  matchScore?: number;
  matches?: Array<{ resumeText: string; requirement: string }>;
  suggestedEdits?: Array<{ section: string; original: string; suggested: string; why: string }>;
  missingKeywords?: string[];
  gaps?: string[];
  resumeText: string;
  raw?: string;
}

/** Splits `text` around exact quotes so matched passages can be highlighted. */
function highlight(text: string, quotes: string[]) {
  const valid = quotes.map(q => q.trim()).filter(q => q.length > 8 && text.includes(q));
  if (!valid.length) return [{ t: text, hit: false }];
  const escaped = valid.map(q => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return text.split(new RegExp(`(${escaped.join('|')})`, 'g')).filter(Boolean).map(t => ({ t, hit: valid.includes(t) }));
}

export default function TailorModal({ resume, onClose }: { resume: Resume | null; onClose: () => void }) {
  const [jd, setJd] = useState('');
  const tailor = useMutation({
    mutationFn: async () => (await api.post('/ai/resume-tailor', { resumeId: resume!.id, jobDescription: jd })).data.data as TailorResult,
    onError: e => toast.error(apiError(e, 'Tailoring failed')),
  });
  const r = tailor.data;
  const parts = useMemo(() => (r ? highlight(r.resumeText, (r.matches ?? []).map(m => m.resumeText)) : []), [r]);

  return (
    <Modal open={!!resume} onClose={onClose} title={resume ? `Tailor · ${resume.name}` : 'Tailor resume'} wide>
      <div className="space-y-5">
        <div>
          <label className="label" htmlFor="tl-jd">Job description</label>
          <textarea id="tl-jd" rows={6} className="input resize-none" placeholder="Paste the job description you’re applying to…" value={jd} onChange={e => setJd(e.target.value)} />
          <div className="flex items-center gap-3 mt-2">
            <button className="btn-primary" disabled={jd.trim().length < 40 || tailor.isPending} onClick={() => tailor.mutate()}>
              {tailor.isPending ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Tailor
            </button>
            <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>Suggestions only rephrase what’s already in your resume — nothing is invented.</p>
          </div>
        </div>

        {r && !r.raw && (
          <>
            {typeof r.matchScore === 'number' && <p className="text-sm" style={{ color: 'var(--fg-primary)' }}>Overall fit: <strong style={{ color: r.matchScore >= 75 ? '#34D399' : r.matchScore >= 50 ? '#FBBF24' : '#F87171' }}>{Math.round(r.matchScore)}%</strong></p>}

            <div>
              <h3 className="font-display font-semibold mb-2" style={{ color: 'var(--fg-primary)' }}>What already matches</h3>
              <div className="rounded-xl p-4 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto" style={{ background: 'var(--bg-secondary)', color: 'var(--fg-secondary)' }}>
                {parts.map((p, i) => p.hit ? <mark key={i} style={{ background: 'rgba(52,211,153,.25)', color: 'var(--fg-primary)', borderRadius: 3, padding: '0 2px' }}>{p.t}</mark> : <span key={i}>{p.t}</span>)}
              </div>
              <ul className="mt-2 space-y-1 text-xs" style={{ color: 'var(--fg-muted)' }}>{r.matches?.map((m, i) => <li key={i}>✓ “{m.resumeText.slice(0, 70)}{m.resumeText.length > 70 ? '…' : ''}” → {m.requirement}</li>)}</ul>
            </div>

            {!!r.suggestedEdits?.length && (
              <div>
                <h3 className="font-display font-semibold mb-2" style={{ color: 'var(--fg-primary)' }}>Suggested edits</h3>
                <ul className="space-y-3">
                  {r.suggestedEdits.map((e, i) => (
                    <li key={i} className="rounded-xl p-4 space-y-2" style={{ background: 'var(--bg-secondary)' }}>
                      <p className="text-xs font-medium" style={{ color: 'var(--accent)' }}>{e.section}</p>
                      {e.original && <p className="text-sm line-through" style={{ color: 'var(--fg-muted)' }}>{e.original}</p>}
                      <p className="text-sm flex gap-2" style={{ color: 'var(--fg-primary)' }}><ArrowRight size={14} className="mt-1 shrink-0" style={{ color: '#34D399' }} />{e.suggested}</p>
                      <p className="text-xs" style={{ color: 'var(--fg-secondary)' }}>{e.why}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              {!!r.missingKeywords?.length && <div><p className="label">Missing keywords</p><div className="flex flex-wrap gap-1.5">{r.missingKeywords.map(k => <span key={k} className="badge badge-red">{k}</span>)}</div></div>}
              {!!r.gaps?.length && <div><p className="label">Gaps to address</p><ul className="list-disc pl-5 text-sm space-y-1" style={{ color: 'var(--fg-secondary)' }}>{r.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></div>}
            </div>
          </>
        )}
        {r?.raw && <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--fg-secondary)' }}>{r.raw}</p>}
      </div>
    </Modal>
  );
}
