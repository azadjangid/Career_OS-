import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Sparkles, Copy, Check, FileDown } from 'lucide-react';
import { api } from '@/lib/api';
import { apiError } from '@/lib/format';
import { toast } from '@/store/toast.store';
import { downloadDocx, downloadTxt } from '@/lib/exportDocs';
import type { Resume } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';

const TONES = ['professional', 'enthusiastic', 'concise', 'friendly'] as const;

export default function CoverLetterModal({ resume, onClose }: { resume: Resume | null; onClose: () => void }) {
  const [form, setForm] = useState({ jobTitle: '', companyName: '', jobDescription: '', tone: 'professional' as (typeof TONES)[number] });
  const [copied, setCopied] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const gen = useMutation({
    mutationFn: async () => (await api.post('/ai/cover-letter', { resumeId: resume!.id, save: false, ...form })).data.data as { content: string; title: string },
    onError: e => toast.error(apiError(e, 'Could not generate the cover letter')),
  });
  const letter = gen.data;

  return (
    <Modal open={!!resume} onClose={onClose} title="Cover letter generator" wide>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label" htmlFor="cl-title">Job title</label><input id="cl-title" className="input" value={form.jobTitle} onChange={set('jobTitle')} placeholder="Frontend Developer" /></div>
          <div><label className="label" htmlFor="cl-co">Company</label><input id="cl-co" className="input" value={form.companyName} onChange={set('companyName')} placeholder="Acme" /></div>
        </div>
        <div><label className="label" htmlFor="cl-jd">Job description *</label><textarea id="cl-jd" rows={6} className="input resize-none" value={form.jobDescription} onChange={set('jobDescription')} placeholder="Paste the job description…" /></div>
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="label" htmlFor="cl-tone">Tone</label><select id="cl-tone" className="input w-auto" value={form.tone} onChange={set('tone')}>{TONES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <button className="btn-primary" disabled={form.jobDescription.trim().length < 40 || gen.isPending} onClick={() => gen.mutate()}>
            {gen.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate
          </button>
        </div>

        {letter && (
          <div className="space-y-3 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <label className="sr-only" htmlFor="cl-out">Generated cover letter (editable)</label>
            <textarea id="cl-out" rows={14} className="input" defaultValue={letter.content} key={letter.content} />
            <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>Edit freely — copy and downloads use the text above. Review it for accuracy before sending.</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={() => { const t = (document.getElementById('cl-out') as HTMLTextAreaElement).value; navigator.clipboard.writeText(t).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
              </button>
              <button className="btn-secondary" onClick={() => downloadTxt(letter.title, (document.getElementById('cl-out') as HTMLTextAreaElement).value)}><FileDown size={14} /> .txt</button>
              <button className="btn-secondary" onClick={() => downloadDocx(letter.title, (document.getElementById('cl-out') as HTMLTextAreaElement).value).catch(() => toast.error('Could not create the .docx file'))}><FileDown size={14} /> .docx</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
