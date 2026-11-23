import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Upload, Trash2, Star, BarChart2, Loader2, Copy, Pencil, Eye, Wand2, Mail, UserCheck, Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { apiError, formatDate } from '@/lib/format';
import { toast } from '@/store/toast.store';
import { useResumes } from '@/hooks/queries';
import { useResumeUpload } from '@/hooks/useResumeUpload';
import type { Resume } from '@/lib/types';
import AnalysisModal from '@/components/resumes/AnalysisPanel';
import TailorModal from '@/components/resumes/TailorModal';
import CoverLetterModal from '@/components/resumes/CoverLetterModal';
import PreviewModal from '@/components/resumes/PreviewModal';
import { ConfirmDialog } from '@/components/ui/Modal';
import { ListSkeleton } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';

type Panel = { kind: 'analysis' | 'tailor' | 'cover' | 'preview'; resume: Resume } | null;

export default function ResumesPage() {
  const [params, setParams] = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { upload, uploading, filling } = useResumeUpload();
  const { data: resumes, isLoading, isError, refetch } = useResumes();
  const [drag, setDrag] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [deleting, setDeleting] = useState<Resume | null>(null);

  // Palette / links can open a resume preview via ?open=<id>
  useEffect(() => {
    const id = params.get('open');
    if (id && resumes) {
      const r = resumes.find(x => x.id === id);
      if (r) setPanel({ kind: 'preview', resume: r });
      setParams({}, { replace: true });
    }
  }, [params, resumes, setParams]);

  const refresh = () => { qc.invalidateQueries({ queryKey: ['resumes'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); };
  const onErr = (m: string) => (e: unknown) => toast.error(apiError(e, m));

  const del = useMutation({ mutationFn: (id: string) => api.delete(`/resumes/${id}`), onSuccess: () => { toast.success('Resume deleted'); setDeleting(null); refresh(); }, onError: onErr('Could not delete resume') });
  const setDefault = useMutation({ mutationFn: (id: string) => api.post(`/resumes/${id}/set-default`), onSuccess: () => { toast.success('Default resume updated'); refresh(); }, onError: onErr('Could not update default') });
  const duplicate = useMutation({ mutationFn: (r: Resume) => api.post(`/resumes/${r.id}/duplicate`, { name: `${r.name} v${r.version + 1}` }), onSuccess: () => { toast.success('Duplicated — rename it to track a new version'); refresh(); }, onError: onErr('Could not duplicate') });
  const rename = useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => api.put(`/resumes/${id}`, { name }), onSuccess: () => { setRenaming(null); refresh(); }, onError: onErr('Could not rename') });
  const parse = useMutation({
    mutationFn: (id: string) => api.post(`/resumes/${id}/parse`, { applyToProfile: true }),
    onSuccess: () => { toast.success('Profile updated from this resume'); refresh(); qc.invalidateQueries({ queryKey: ['profile'] }); },
    onError: onErr('Could not parse this resume'),
  });
  const analyzeQuick = (r: Resume) => setPanel({ kind: 'analysis', resume: r });

  const handleFile = (f?: File) => { if (f) upload(f); };

  return (
    <div className="space-y-5">
      <div
        role="button" tabIndex={0} aria-label="Upload a resume"
        className="card text-center py-8 cursor-pointer transition-colors"
        style={{ borderStyle: 'dashed', borderWidth: 2, borderColor: drag ? 'var(--accent)' : 'var(--border-accent)', background: drag ? 'var(--accent-dim)' : undefined }}
        onClick={() => fileRef.current?.click()} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
      >
        {uploading || filling ? <Loader2 size={30} className="mx-auto mb-2 animate-spin" style={{ color: 'var(--accent)' }} /> : <Upload size={30} className="mx-auto mb-2" style={{ color: 'var(--accent)' }} />}
        <p className="font-medium" style={{ color: 'var(--fg-primary)' }}>{uploading ? 'Uploading…' : filling ? 'Reading your resume with AI…' : 'Upload a resume'}</p>
        <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>Drag & drop or click · PDF or DOCX · up to 10 MB</p>
        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      {isLoading ? <ListSkeleton rows={3} />
        : isError ? <EmptyState art="resumes" title="Couldn’t load resumes" action={<button className="btn-primary" onClick={() => refetch()}>Try again</button>} />
        : !resumes?.length ? <EmptyState art="resumes" title="No resumes yet" description="Upload your resume to get an ATS score, tailor it to jobs, and generate cover letters." />
        : (
          <ul className="space-y-3">
            {resumes.map(r => (
              <li key={r.id} className="card" style={{ padding: 16 }}>
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--accent-dim)' }}><FileText size={20} style={{ color: 'var(--accent)' }} /></div>
                    <div className="flex-1 min-w-0">
                      {renaming === r.id ? (
                        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (newName.trim()) rename.mutate({ id: r.id, name: newName.trim() }); }}>
                          <input autoFocus className="input py-1.5" value={newName} onChange={e => setNewName(e.target.value)} aria-label="Resume name" maxLength={120} />
                          <button className="btn-primary p-2" aria-label="Save name"><Check size={14} /></button>
                          <button type="button" className="btn-ghost p-2" aria-label="Cancel rename" onClick={() => setRenaming(null)}><X size={14} /></button>
                        </form>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm truncate" style={{ color: 'var(--fg-primary)' }}>{r.name}</p>
                          {r.isDefault && <span className="badge badge-orange">Default</span>}
                          {r.version > 1 && <span className="badge badge-muted">v{r.version}</span>}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-0.5 text-xs flex-wrap" style={{ color: 'var(--fg-muted)' }}>
                        {r.atsScore != null && <span className="font-mono" style={{ color: r.atsScore >= 70 ? '#34D399' : r.atsScore >= 50 ? '#FBBF24' : '#F87171' }}>ATS {r.atsScore}/100</span>}
                        {r.fileSize ? <span>{(r.fileSize / 1024).toFixed(0)} KB</span> : null}
                        <span>{formatDate(r.createdAt)}</span>
                        {r.extractedSkills.length > 0 && <span>{r.extractedSkills.length} skills found</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 flex-wrap" role="group" aria-label={`Actions for ${r.name}`}>
                    <IconBtn label="Preview" onClick={() => setPanel({ kind: 'preview', resume: r })}><Eye size={16} /></IconBtn>
                    <IconBtn label="Analysis" onClick={() => analyzeQuick(r)}><BarChart2 size={16} /></IconBtn>
                    <IconBtn label="Tailor to a job" onClick={() => setPanel({ kind: 'tailor', resume: r })}><Wand2 size={16} /></IconBtn>
                    <IconBtn label="Generate cover letter" onClick={() => setPanel({ kind: 'cover', resume: r })}><Mail size={16} /></IconBtn>
                    <IconBtn label="Fill my profile from this resume" onClick={() => parse.mutate(r.id)} busy={parse.isPending && parse.variables === r.id}><UserCheck size={16} /></IconBtn>
                    <IconBtn label="Duplicate as a new version" onClick={() => duplicate.mutate(r)}><Copy size={16} /></IconBtn>
                    <IconBtn label="Rename" onClick={() => { setRenaming(r.id); setNewName(r.name); }}><Pencil size={16} /></IconBtn>
                    {!r.isDefault && <IconBtn label="Set as default" onClick={() => setDefault.mutate(r.id)}><Star size={16} /></IconBtn>}
                    <IconBtn label="Delete" danger onClick={() => setDeleting(r)}><Trash2 size={16} /></IconBtn>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

      <AnalysisModal resume={panel?.kind === 'analysis' ? panel.resume : null} onClose={() => setPanel(null)} />
      <TailorModal resume={panel?.kind === 'tailor' ? panel.resume : null} onClose={() => setPanel(null)} />
      <CoverLetterModal resume={panel?.kind === 'cover' ? panel.resume : null} onClose={() => setPanel(null)} />
      <PreviewModal resume={panel?.kind === 'preview' ? panel.resume : null} onClose={() => setPanel(null)} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} danger busy={del.isPending} title="Delete this resume?"
        message={`“${deleting?.name}” will be removed. Applications that used it keep their history.`} confirmLabel="Delete" onConfirm={() => deleting && del.mutate(deleting.id)} />
    </div>
  );
}

function IconBtn({ label, onClick, children, danger, busy }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean; busy?: boolean }) {
  return (
    <button onClick={onClick} className="btn-ghost p-2" title={label} aria-label={label} disabled={busy} style={danger ? { color: '#F87171' } : undefined}>
      {busy ? <Loader2 size={16} className="animate-spin" /> : children}
    </button>
  );
}
