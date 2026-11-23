import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Send, Bookmark, Upload, X, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { apiError } from '@/lib/format';
import { toast } from '@/store/toast.store';
import { useUIStore } from '@/store/ui.store';
import { Modal } from '@/components/ui/Modal';
import { useCreateApplication } from '@/hooks/queries';
import { useResumeUpload } from '@/hooks/useResumeUpload';
import { STATUSES, STATUS_LABEL, type AppStatus } from '@/lib/constants';

const today = () => new Date().toISOString().slice(0, 10);

/** Floating "+" button and the three quick-add modals (application, job, resume). */
export default function QuickActions() {
  const { quickMenuOpen, setQuickMenuOpen, quickAction, setQuickAction } = useUIStore();

  const actions = [
    { key: 'application' as const, label: 'Add application', icon: Send },
    { key: 'job' as const, label: 'Save job', icon: Bookmark },
    { key: 'resume' as const, label: 'Upload resume', icon: Upload },
  ];

  return (
    <>
      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
        <AnimatePresence>
          {quickMenuOpen && actions.map((a, i) => (
            <motion.button
              key={a.key}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }} exit={{ opacity: 0, y: 10 }}
              onClick={() => setQuickAction(a.key)}
              className="flex items-center gap-2 pl-3 pr-4 py-2 rounded-full text-sm font-medium shadow-lg"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--fg-primary)' }}
            >
              <a.icon size={16} style={{ color: 'var(--accent)' }} /> {a.label}
            </motion.button>
          ))}
        </AnimatePresence>
        <button
          onClick={() => setQuickMenuOpen(!quickMenuOpen)}
          aria-label={quickMenuOpen ? 'Close quick actions' : 'Open quick actions'}
          aria-expanded={quickMenuOpen}
          className="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl transition-transform hover:scale-105"
          style={{ background: 'var(--accent)' }}
        >
          <motion.span animate={{ rotate: quickMenuOpen ? 45 : 0 }}>{quickMenuOpen ? <X size={24} /> : <Plus size={24} />}</motion.span>
        </button>
      </div>

      <AddApplicationModal open={quickAction === 'application'} onClose={() => setQuickAction(null)} />
      <SaveJobModal open={quickAction === 'job'} onClose={() => setQuickAction(null)} />
      <UploadResumeModal open={quickAction === 'resume'} onClose={() => setQuickAction(null)} />
    </>
  );
}

export function AddApplicationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateApplication();
  const [form, setForm] = useState({ companyName: '', title: '', applyUrl: '', appliedAt: today(), status: 'APPLIED' as AppStatus, notes: '' });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        companyName: form.companyName.trim(), title: form.title.trim(), applyUrl: form.applyUrl.trim() || undefined,
        status: form.status, notes: form.notes.trim() || undefined,
        appliedAt: form.status === 'SAVED' ? undefined : new Date(form.appliedAt).toISOString(),
      },
      { onSuccess: () => { setForm({ companyName: '', title: '', applyUrl: '', appliedAt: today(), status: 'APPLIED', notes: '' }); onClose(); } },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Add application">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label" htmlFor="qa-company">Company *</label><input id="qa-company" required value={form.companyName} onChange={set('companyName')} className="input" placeholder="Razorpay" /></div>
          <div><label className="label" htmlFor="qa-role">Role *</label><input id="qa-role" required value={form.title} onChange={set('title')} className="input" placeholder="Frontend Developer" /></div>
        </div>
        <div><label className="label" htmlFor="qa-url">Job URL</label><input id="qa-url" type="url" value={form.applyUrl} onChange={set('applyUrl')} className="input" placeholder="https://…" /></div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label" htmlFor="qa-date">Date applied</label><input id="qa-date" type="date" max={today()} value={form.appliedAt} onChange={set('appliedAt')} className="input" /></div>
          <div>
            <label className="label" htmlFor="qa-status">Status</label>
            <select id="qa-status" value={form.status} onChange={set('status')} className="input">
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
        </div>
        <div><label className="label" htmlFor="qa-notes">Notes</label><textarea id="qa-notes" rows={3} value={form.notes} onChange={set('notes')} className="input resize-none" placeholder="Referral, recruiter name, anything useful…" /></div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={create.isPending}>
            {create.isPending && <Loader2 size={14} className="animate-spin" />} Add application
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SaveJobModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', companyName: '', location: '', applyUrl: '', description: '' });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/jobs', form);
      qc.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Job saved');
      setForm({ title: '', companyName: '', location: '', applyUrl: '', description: '' });
      onClose();
    } catch (err) { toast.error(apiError(err, 'Could not save job')); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Save a job">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label" htmlFor="sj-title">Job title *</label><input id="sj-title" required value={form.title} onChange={set('title')} className="input" /></div>
          <div><label className="label" htmlFor="sj-co">Company *</label><input id="sj-co" required value={form.companyName} onChange={set('companyName')} className="input" /></div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label" htmlFor="sj-loc">Location</label><input id="sj-loc" value={form.location} onChange={set('location')} className="input" /></div>
          <div><label className="label" htmlFor="sj-url">Posting URL</label><input id="sj-url" type="url" value={form.applyUrl} onChange={set('applyUrl')} className="input" placeholder="https://…" /></div>
        </div>
        <div><label className="label" htmlFor="sj-desc">Description</label><textarea id="sj-desc" rows={4} value={form.description} onChange={set('description')} className="input resize-none" placeholder="Paste the job description so AI can match it to your resume" /></div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />} Save job</button>
        </div>
      </form>
    </Modal>
  );
}

function UploadResumeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useResumeUpload();
  const [drag, setDrag] = useState(false);

  const handle = async (f?: File) => { if (f && (await upload(f))) onClose(); };

  return (
    <Modal open={open} onClose={onClose} title="Upload resume">
      <div
        role="button" tabIndex={0} aria-label="Choose a resume file"
        onClick={() => ref.current?.click()} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && ref.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
        className="rounded-xl text-center py-10 cursor-pointer"
        style={{ border: `2px dashed ${drag ? 'var(--accent)' : 'var(--border-accent)'}`, background: drag ? 'var(--accent-dim)' : 'transparent' }}
      >
        {uploading ? <Loader2 size={30} className="mx-auto animate-spin" style={{ color: 'var(--accent)' }} /> : <Upload size={30} className="mx-auto" style={{ color: 'var(--accent)' }} />}
        <p className="mt-3 font-medium" style={{ color: 'var(--fg-primary)' }}>{uploading ? 'Uploading…' : 'Drag & drop or click to browse'}</p>
        <p className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>PDF or DOCX, up to 10 MB</p>
        <input ref={ref} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={e => handle(e.target.files?.[0])} />
      </div>
    </Modal>
  );
}
