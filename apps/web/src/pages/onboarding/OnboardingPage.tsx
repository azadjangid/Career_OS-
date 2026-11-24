import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Zap, Upload, Loader2, CheckCircle2, ArrowRight, ArrowLeft, Briefcase, FileText, Link2 } from 'lucide-react';
import { api } from '@/lib/api';
import { apiError } from '@/lib/format';
import { toast } from '@/store/toast.store';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useResumeUpload } from '@/hooks/useResumeUpload';
import { useUpdateSettings } from '@/hooks/queries';
import { JOB_SOURCES, WORK_MODES } from '@/lib/constants';

const STEPS = [
  { title: 'Set your job preferences', icon: Briefcase },
  { title: 'Upload your resume', icon: FileText },
  { title: 'Connect job sources', icon: Link2 },
] as const;

interface Prefs { role: string; location: string; salaryMin: string; salaryMax: string; workMode: (typeof WORK_MODES)[number] }
interface ParsedSummary { headline?: string; skills: string[]; experience: unknown[] }

export default function OnboardingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { complete, skip } = useOnboarding();
  const updateSettings = useUpdateSettings();
  const { upload, uploading } = useResumeUpload({ autoFillProfile: false });
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({ role: '', location: '', salaryMin: '', salaryMax: '', workMode: 'HYBRID' });
  const [drag, setDrag] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedSummary | null>(null);
  const [parseNote, setParseNote] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>(['remotive']);

  const lpa = (v: string) => (v ? Math.round(parseFloat(v) * 100_000) : undefined);

  // Step 1 → save preferences to the profile
  const savePrefs = async () => {
    const min = lpa(prefs.salaryMin), max = lpa(prefs.salaryMax);
    if (min !== undefined && max !== undefined && min > max) { toast.error('Minimum salary cannot be higher than the maximum'); return; }
    setSaving(true);
    try {
      await api.put('/users/profile', {
        ...(prefs.role.trim() ? { targetRoles: [prefs.role.trim()] } : {}),
        ...(prefs.location.trim() ? { targetLocations: [prefs.location.trim()], location: prefs.location.trim() } : {}),
        ...(min !== undefined ? { salaryMin: min } : {}),
        ...(max !== undefined ? { salaryMax: max } : {}),
        remotePreference: prefs.workMode,
      });
      qc.invalidateQueries({ queryKey: ['profile'] });
      setStep(1);
    } catch (e) { toast.error(apiError(e, 'Could not save preferences')); } finally { setSaving(false); }
  };

  // Step 2 → upload, then ask AI to parse and fill the profile
  const handleFile = async (file?: File) => {
    if (!file) return;
    const resume = await upload(file);
    if (!resume) return;
    setFileName(file.name);
    setParsed(null); setParseNote(null);
    setParsing(true);
    try {
      const res = await api.post(`/resumes/${resume.id}/parse`, { applyToProfile: true });
      setParsed(res.data.data.structured as ParsedSummary);
      qc.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Profile filled from your resume');
    } catch (e) {
      const status = (e as { response?: { status?: number } }).response?.status;
      setParseNote(
        status === 503 ? 'Resume saved. AI parsing needs an Anthropic API key — add one in .env to auto-fill your profile.'
        : status === 422 ? 'Resume saved, but we could not read text from it. Try a text-based PDF or DOCX.'
        : apiError(e, 'Resume saved, but AI parsing failed. You can retry from the Resumes page.'),
      );
    } finally { setParsing(false); }
  };

  // Step 3 → persist and finish
  const finish = async () => {
    setSaving(true);
    try {
      await updateSettings.mutateAsync({ extras: { jobSources: sources, onboardingDone: true } });
      if (sources.includes('remotive')) {
        // Seed the job list from the one source we can really fetch. Failure here must not block onboarding.
        await api.post('/jobs/fetch', { search: prefs.role.trim() || undefined }).then(
          r => toast.success(`Found ${r.data.data.created} new remote jobs`),
          () => undefined,
        );
      }
      complete();
      qc.invalidateQueries();
      navigate('/dashboard', { replace: true });
    } finally { setSaving(false); }
  };

  const skipAll = () => { skip(); navigate('/dashboard', { replace: true }); };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent)' }}><Zap size={18} className="text-on-accent" /></div>
            <span className="font-display font-bold text-xl" style={{ color: 'var(--fg-primary)' }}>CareerOS</span>
          </div>
          <button onClick={skipAll} className="text-sm" style={{ color: 'var(--fg-muted)' }}>Skip for now</button>
        </div>

        {/* Progress */}
        <ol className="flex items-center gap-2 mb-6" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex-1" aria-current={i === step ? 'step' : undefined}>
              <div className="h-1.5 rounded-full" style={{ background: i <= step ? 'var(--accent)' : 'var(--bg-hover)' }} />
              <p className="text-xs mt-1.5 hidden sm:block" style={{ color: i === step ? 'var(--fg-primary)' : 'var(--fg-muted)' }}>{i + 1}. {s.title}</p>
            </li>
          ))}
        </ol>

        <div className="card">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
              <h1 className="font-display font-bold text-xl mb-1" style={{ color: 'var(--fg-primary)' }}>{STEPS[step]!.title}</h1>

              {step === 0 && (
                <div className="space-y-4 mt-4">
                  <p className="text-sm" style={{ color: 'var(--fg-secondary)' }}>This tunes job matches and what the AI agent recommends. You can change it later.</p>
                  <div><label className="label" htmlFor="ob-role">Target role</label><input id="ob-role" className="input" placeholder="e.g. Frontend Developer" value={prefs.role} onChange={e => setPrefs(p => ({ ...p, role: e.target.value }))} /></div>
                  <div><label className="label" htmlFor="ob-loc">Preferred location</label><input id="ob-loc" className="input" placeholder="e.g. Bengaluru" value={prefs.location} onChange={e => setPrefs(p => ({ ...p, location: e.target.value }))} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="label" htmlFor="ob-min">Min salary (LPA)</label><input id="ob-min" type="number" min="0" step="0.5" className="input" placeholder="6" value={prefs.salaryMin} onChange={e => setPrefs(p => ({ ...p, salaryMin: e.target.value }))} /></div>
                    <div><label className="label" htmlFor="ob-max">Max salary (LPA)</label><input id="ob-max" type="number" min="0" step="0.5" className="input" placeholder="12" value={prefs.salaryMax} onChange={e => setPrefs(p => ({ ...p, salaryMax: e.target.value }))} /></div>
                  </div>
                  <fieldset>
                    <legend className="label">Work mode</legend>
                    <div className="grid grid-cols-3 gap-2">
                      {WORK_MODES.map(m => (
                        <label key={m} className="cursor-pointer text-center py-2.5 rounded-lg text-sm font-medium"
                          style={{ background: prefs.workMode === m ? 'var(--accent-dim)' : 'var(--bg-secondary)', color: prefs.workMode === m ? 'var(--accent)' : 'var(--fg-secondary)', border: `1px solid ${prefs.workMode === m ? 'var(--border-accent)' : 'var(--border)'}` }}>
                          <input type="radio" name="workMode" className="sr-only" checked={prefs.workMode === m} onChange={() => setPrefs(p => ({ ...p, workMode: m }))} />
                          {m.charAt(0) + m.slice(1).toLowerCase()}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4 mt-4">
                  <p className="text-sm" style={{ color: 'var(--fg-secondary)' }}>Our AI reads your resume and fills in your profile: headline, skills, experience and education. It only uses what is in the file, and never overwrites fields you have already filled.</p>
                  <div
                    role="button" tabIndex={0} aria-label="Choose a resume file"
                    onClick={() => fileRef.current?.click()} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                    onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
                    className="rounded-xl text-center py-10 cursor-pointer"
                    style={{ border: `2px dashed ${drag ? 'var(--accent)' : 'var(--border-accent)'}`, background: drag ? 'var(--accent-dim)' : 'transparent' }}
                  >
                    {uploading || parsing ? <Loader2 size={30} className="mx-auto animate-spin" style={{ color: 'var(--accent)' }} />
                      : fileName ? <CheckCircle2 size={30} className="mx-auto" style={{ color: 'var(--tone-green)' }} />
                      : <Upload size={30} className="mx-auto" style={{ color: 'var(--accent)' }} />}
                    <p className="mt-3 font-medium" style={{ color: 'var(--fg-primary)' }}>
                      {uploading ? 'Uploading…' : parsing ? 'Reading your resume with AI…' : fileName ?? 'Drag & drop your resume here'}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>{fileName ? 'Click to replace' : 'PDF or DOCX, up to 10 MB'}</p>
                    <input ref={fileRef} type="file" accept=".pdf,.docx" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
                  </div>
                  {parsed && (
                    <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--bg-secondary)' }}>
                      <p className="font-medium" style={{ color: 'var(--fg-primary)' }}>{parsed.headline || 'Profile updated'}</p>
                      <p className="mt-1" style={{ color: 'var(--fg-secondary)' }}>Found {parsed.skills.length} skills and {parsed.experience.length} roles.</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">{parsed.skills.slice(0, 10).map(s => <span key={s} className="badge badge-orange">{s}</span>)}</div>
                    </div>
                  )}
                  {parseNote && <p className="text-sm rounded-lg p-3" style={{ background: 'var(--bg-secondary)', color: 'var(--fg-secondary)' }}>{parseNote}</p>}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3 mt-4">
                  <p className="text-sm" style={{ color: 'var(--fg-secondary)' }}>Choose where CareerOS should look for jobs. You can change this, add company boards and turn on automatic fetching later in Settings → Job sources.</p>
                  {JOB_SOURCES.map(s => {
                    const on = sources.includes(s.id);
                    return (
                      <label key={s.id} className="flex items-center gap-3 p-3 rounded-lg cursor-pointer" style={{ background: 'var(--bg-secondary)', border: `1px solid ${on ? 'var(--border-accent)' : 'var(--border)'}` }}>
                        <input type="checkbox" checked={on} onChange={() => setSources(c => (on ? c.filter(x => x !== s.id) : [...c, s.id]))} className="w-4 h-4 accent-[var(--accent)]" />
                        <div className="flex-1">
                          <p className="text-sm font-medium" style={{ color: 'var(--fg-primary)' }}>{s.label}</p>
                          <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>{s.note}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-between mt-6 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <button className="btn-ghost" onClick={() => setStep(s => s - 1)} disabled={step === 0 || saving} style={{ visibility: step === 0 ? 'hidden' : 'visible' }}>
              <ArrowLeft size={16} /> Back
            </button>
            {step === 0 && <button className="btn-primary" onClick={savePrefs} disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : null} Continue <ArrowRight size={16} /></button>}
            {step === 1 && (
              <div className="flex gap-2">
                {!fileName && <button className="btn-ghost" onClick={() => setStep(2)}>Skip</button>}
                <button className="btn-primary" onClick={() => setStep(2)} disabled={uploading || parsing}>Continue <ArrowRight size={16} /></button>
              </div>
            )}
            {step === 2 && <button className="btn-primary" onClick={finish} disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Finish setup</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
