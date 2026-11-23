import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  User, Briefcase, Brain, ShieldCheck, Plug, KeyRound, Palette, Bell, Lock, Camera, Loader2, Download, Trash2, Copy, Check,
  RefreshCw, Linkedin, Github, Database, X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { apiError, downloadBlob, initials } from '@/lib/format';
import { toast } from '@/store/toast.store';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { useSettings, useUpdateSettings } from '@/hooks/queries';
import { COMPANY_SIZES, WORK_MODES } from '@/lib/constants';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { CardSkeleton } from '@/components/ui/Skeleton';

const NAV = [
  ['profile', 'Profile', User], ['job-prefs', 'Job preferences', Briefcase], ['ai', 'AI preferences', Brain], ['notifications', 'Notifications', Bell],
  ['appearance', 'Appearance', Palette], ['integrations', 'Integrations', Plug], ['api-key', 'API key', KeyRound], ['security', 'Password', Lock], ['data', 'Data & privacy', ShieldCheck],
] as const;

export default function SettingsPage() {
  const { isLoading } = useSettings();
  return (
    <div className="flex gap-6 max-w-5xl">
      <nav className="hidden lg:block w-48 shrink-0" aria-label="Settings sections">
        <ul className="sticky top-0 space-y-0.5">
          {NAV.map(([id, label, Icon]) => (
            <li key={id}><a href={`#${id}`} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-[var(--bg-hover)]" style={{ color: 'var(--fg-secondary)' }}
              onClick={e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><Icon size={15} />{label}</a></li>
          ))}
        </ul>
      </nav>
      <div className="flex-1 min-w-0 space-y-6">
        {isLoading ? <><CardSkeleton lines={4} /><CardSkeleton lines={4} /></> : (
          <>
            <ProfileSection /><JobPrefsSection /><AISection /><NotificationsSection /><AppearanceSection />
            <IntegrationsSection /><ApiKeySection /><PasswordSection /><DataSection />
          </>
        )}
      </div>
    </div>
  );
}

function Section({ id, title, icon: Icon, children, danger }: { id: string; title: string; icon: LucideIcon; children: React.ReactNode; danger?: boolean }) {
  return (
    <section id={id} className="card space-y-4 scroll-mt-4" style={danger ? { borderColor: '#7F1D1D' } : undefined} aria-labelledby={`${id}-h`}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: danger ? '#7F1D1D33' : 'var(--accent-dim)' }}><span style={{ color: danger ? '#F87171' : 'var(--accent)' }}><Icon size={18} /></span></div>
        <h2 id={`${id}-h`} className="font-display font-semibold" style={{ color: danger ? '#F87171' : 'var(--fg-primary)' }}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Toggle({ label, desc, checked, onChange, disabled }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
      <div><p className="text-sm font-medium" style={{ color: 'var(--fg-primary)' }}>{label}</p>{desc && <p className="text-xs mt-0.5" style={{ color: 'var(--fg-muted)' }}>{desc}</p>}</div>
      <button role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
        className="relative w-10 h-6 rounded-full shrink-0 transition-colors disabled:opacity-50" style={{ background: checked ? 'var(--accent)' : 'var(--bg-hover)', border: '1px solid var(--border)' }}>
        <span className="absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white transition-all" style={{ width: 18, height: 18, left: checked ? 19 : 2 }} />
      </button>
    </div>
  );
}

// ── Profile ─────────────────────────────────────────────────────────────────
const profileSchema = z.object({
  name: z.string().min(2, 'At least 2 characters').max(100),
  phone: z.string().max(20).optional(),
  location: z.string().max(200).optional(),
  linkedinUrl: z.string().url('Enter a full URL').optional().or(z.literal('')),
  githubUrl: z.string().url('Enter a full URL').optional().or(z.literal('')),
  portfolioUrl: z.string().url('Enter a full URL').optional().or(z.literal('')),
  salaryMin: z.number().min(0).optional(),
  salaryMax: z.number().min(0).optional(),
}).refine(d => d.salaryMin === undefined || d.salaryMax === undefined || Number.isNaN(d.salaryMin) || Number.isNaN(d.salaryMax) || d.salaryMin <= d.salaryMax, { message: 'Minimum must not exceed maximum', path: ['salaryMax'] });
type ProfileForm = z.infer<typeof profileSchema>;

interface ProfileData { phone?: string; location?: string; linkedinUrl?: string; githubUrl?: string; portfolioUrl?: string; salaryMin?: number; salaryMax?: number; targetRoles?: string[]; remotePreference?: string }

function ProfileSection() {
  const qc = useQueryClient();
  const { user, setUser } = useAuthStore();
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [roleInput, setRoleInput] = useState('');

  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: async () => (await api.get('/users/profile')).data.data as ProfileData | null });
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<ProfileForm>({ resolver: zodResolver(profileSchema), defaultValues: { name: user?.name ?? '' } });

  useEffect(() => {
    reset({ name: user?.name ?? '', phone: profile?.phone ?? '', location: profile?.location ?? '', linkedinUrl: profile?.linkedinUrl ?? '', githubUrl: profile?.githubUrl ?? '', portfolioUrl: profile?.portfolioUrl ?? '', salaryMin: profile?.salaryMin || undefined, salaryMax: profile?.salaryMax || undefined });
    setRoles(profile?.targetRoles ?? []);
  }, [profile, user?.name, reset]);

  const save = useMutation({
    mutationFn: async (d: ProfileForm) => {
      const { name, ...rest } = d;
      const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined && !(typeof v === 'number' && Number.isNaN(v))));
      await api.put('/users/profile', { ...clean, targetRoles: roles });
      if (name !== user?.name) { const r = await api.put('/users/account', { name }); setUser({ ...user!, name: r.data.data.name }); }
    },
    onSuccess: () => { toast.success('Profile saved'); qc.invalidateQueries({ queryKey: ['profile'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
    onError: e => toast.error(apiError(e, 'Could not save profile')),
  });

  const onAvatar = (f?: File) => {
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) { toast.error('Use a PNG, JPG or WebP image'); return; }
    // Downscale to 160px so it stays small enough to store inline
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); const s = Math.min(1, 160 / Math.max(img.width, img.height));
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      update.mutate({ extras: { avatar: c.toDataURL('image/jpeg', 0.85) } }, { onSuccess: () => toast.success('Avatar updated') });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => toast.error('Could not read that image');
    img.src = URL.createObjectURL(f);
  };

  const addRole = () => { const r = roleInput.trim(); if (r && !roles.includes(r) && roles.length < 10) { setRoles([...roles, r]); setRoleInput(''); } };
  const avatar = settings?.extras.avatar;

  return (
    <Section id="profile" title="Profile" icon={User}>
      <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            {avatar ? <img src={avatar} alt="Your avatar" className="w-16 h-16 rounded-full object-cover" /> : <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white" style={{ background: 'var(--accent)' }} aria-hidden>{initials(user?.name ?? '')}</div>}
            <button type="button" onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }} aria-label="Change avatar"><Camera size={13} /></button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { onAvatar(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>PNG, JPG or WebP. Resized automatically.{avatar && <button type="button" className="ml-2 underline" onClick={() => update.mutate({ extras: { avatar: '' } })}>Remove</button>}</div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Full name" error={errors.name?.message}><input className="input" {...register('name')} /></Field>
          <Field label="Email"><input className="input" value={user?.email ?? ''} disabled aria-describedby="email-note" /><p id="email-note" className="text-[11px] mt-1" style={{ color: 'var(--fg-muted)' }}>Email can’t be changed yet.</p></Field>
          <Field label="Phone"><input className="input" {...register('phone')} placeholder="+91 98765 43210" /></Field>
          <Field label="Location"><input className="input" {...register('location')} placeholder="Bengaluru, India" /></Field>
          <Field label="LinkedIn URL" error={errors.linkedinUrl?.message}><input className="input" {...register('linkedinUrl')} placeholder="https://linkedin.com/in/…" /></Field>
          <Field label="GitHub URL" error={errors.githubUrl?.message}><input className="input" {...register('githubUrl')} placeholder="https://github.com/…" /></Field>
          <Field label="Portfolio URL" error={errors.portfolioUrl?.message} className="sm:col-span-2"><input className="input" {...register('portfolioUrl')} placeholder="https://…" /></Field>
          <Field label="Target salary min (₹/year)"><input type="number" min={0} className="input" {...register('salaryMin', { valueAsNumber: true })} /></Field>
          <Field label="Target salary max (₹/year)" error={errors.salaryMax?.message}><input type="number" min={0} className="input" {...register('salaryMax', { valueAsNumber: true })} /></Field>
        </div>

        <div>
          <label className="label" htmlFor="role-input">Target roles</label>
          <div className="flex flex-wrap gap-1.5 mb-2">{roles.map(r => <span key={r} className="badge badge-orange gap-1">{r}<button type="button" onClick={() => setRoles(roles.filter(x => x !== r))} aria-label={`Remove ${r}`}><X size={11} /></button></span>)}</div>
          <div className="flex gap-2">
            <input id="role-input" className="input" value={roleInput} onChange={e => setRoleInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRole(); } }} placeholder="Add a role and press Enter" />
            <button type="button" className="btn-secondary" onClick={addRole}>Add</button>
          </div>
        </div>
        <button className="btn-primary" disabled={save.isPending || (!isDirty && roles.join() === (profile?.targetRoles ?? []).join())}>{save.isPending && <Loader2 size={14} className="animate-spin" />} Save profile</button>
      </form>
    </Section>
  );
}

function Field({ label, error, children, className }: { label: string; error?: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><label className="label">{label}</label>{children}{error && <p className="text-xs mt-1" style={{ color: '#F87171' }} role="alert">{error}</p>}</div>;
}

// ── Job preferences ─────────────────────────────────────────────────────────
function JobPrefsSection() {
  const { data: s } = useSettings();
  const update = useUpdateSettings();
  const qc = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: async () => (await api.get('/users/profile')).data.data as ProfileData | null });
  const setMode = useMutation({ mutationFn: (m: string) => api.put('/users/profile', { remotePreference: m }), onSuccess: () => { toast.success('Preference saved'); qc.invalidateQueries({ queryKey: ['profile'] }); }, onError: e => toast.error(apiError(e)) });
  const x = s?.extras ?? {};
  const save = (extras: Record<string, unknown>) => update.mutate({ extras }, { onSuccess: () => toast.success('Saved') });

  return (
    <Section id="job-prefs" title="Job preferences" icon={Briefcase}>
      <div>
        <p className="label">Preferred work mode</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Preferred work mode">
          {WORK_MODES.map(m => (
            <button key={m} role="radio" aria-checked={profile?.remotePreference === m} onClick={() => setMode.mutate(m)} className="py-2 rounded-lg text-sm font-medium"
              style={{ background: profile?.remotePreference === m ? 'var(--accent-dim)' : 'var(--bg-secondary)', color: profile?.remotePreference === m ? 'var(--accent)' : 'var(--fg-secondary)', border: `1px solid ${profile?.remotePreference === m ? 'var(--border-accent)' : 'var(--border)'}` }}>
              {m.charAt(0) + m.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="co-size">Preferred company size</label>
        <select id="co-size" className="input" value={x.preferredCompanySize ?? ''} onChange={e => save({ preferredCompanySize: e.target.value })}>
          <option value="">No preference</option>{COMPANY_SIZES.map(c => <option key={c} value={c}>{c} employees</option>)}
        </select>
      </div>
      <Toggle label="Willing to relocate" checked={!!x.willingToRelocate} onChange={v => save({ willingToRelocate: v })} />
      <Toggle label="Open to contract work" checked={!!x.openToContract} onChange={v => save({ openToContract: v })} />
    </Section>
  );
}

// ── AI preferences ──────────────────────────────────────────────────────────
const LANGUAGES = ['English', 'Hindi', 'Spanish', 'French', 'German', 'Portuguese', 'Japanese'];

function AISection() {
  const { data: s } = useSettings();
  const update = useUpdateSettings();
  const x = s?.extras ?? {};
  const save = (extras: Record<string, unknown>) => update.mutate({ extras }, { onSuccess: () => toast.success('Saved') });
  return (
    <Section id="ai" title="AI preferences" icon={Brain}>
      <div>
        <label className="label" htmlFor="ai-model">Default AI model</label>
        <select id="ai-model" className="input" value={x.aiModel ?? s?.defaultModel ?? ''} onChange={e => save({ aiModel: e.target.value })}>
          {s?.aiModels?.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <p className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>Smaller models are faster and use less of your monthly token budget.</p>
      </div>
      <div>
        <label className="label" htmlFor="ai-lang">Response language</label>
        <select id="ai-lang" className="input" value={x.aiLanguage ?? 'English'} onChange={e => save({ aiLanguage: e.target.value })}>{LANGUAGES.map(l => <option key={l}>{l}</option>)}</select>
        <p className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>Applies to chat, cover letters and interview prep.</p>
      </div>
      <Toggle label="Auto-analyze new jobs" desc="After fetching jobs, AI-score up to 5 of the newest. Uses tokens." checked={!!x.aiAutoAnalyze} onChange={v => save({ aiAutoAnalyze: v })} />
      <Toggle label="Auto-match resume when I save a job" desc="Scores the saved job against your default resume in the background." checked={!!x.aiAutoMatch} onChange={v => save({ aiAutoMatch: v })} />
    </Section>
  );
}

// ── Notifications ───────────────────────────────────────────────────────────
function NotificationsSection() {
  const { data: s } = useSettings();
  const update = useUpdateSettings();
  const items = [
    ['emailJobAlerts', 'New job matches', 'Email me when jobs match my profile'],
    ['emailApplicationUpdates', 'Application updates', 'Status changes and interview invites'],
    ['emailInterviewReminders', 'Interview reminders', 'Reminders before scheduled interviews'],
    ['emailWeeklySummary', 'Weekly digest', 'A summary of my job search activity'],
  ] as const;
  return (
    <Section id="notifications" title="Notifications" icon={Bell}>
      <div>{items.map(([k, label, desc]) => <Toggle key={k} label={label} desc={desc} checked={s?.[k] ?? false} onChange={v => update.mutate({ [k]: v }, { onSuccess: () => toast.success('Saved') })} />)}</div>
      <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>Email delivery needs SMTP configured on the server.</p>
    </Section>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useUIStore();
  return (
    <Section id="appearance" title="Appearance" icon={Palette}>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
        {(['dark', 'light', 'system'] as const).map(t => (
          <button key={t} role="radio" aria-checked={theme === t} onClick={() => setTheme(t)} className="py-2.5 rounded-lg text-sm font-medium"
            style={{ background: theme === t ? 'var(--accent-dim)' : 'var(--bg-secondary)', color: theme === t ? 'var(--accent)' : 'var(--fg-secondary)', border: `1px solid ${theme === t ? 'var(--border-accent)' : 'var(--border)'}` }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
    </Section>
  );
}

// ── Integrations ────────────────────────────────────────────────────────────
function IntegrationsSection() {
  const qc = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: async () => (await api.get('/users/profile')).data.data as ProfileData | null });
  const [editing, setEditing] = useState<'linkedinUrl' | 'githubUrl' | null>(null);
  const [url, setUrl] = useState('');
  const save = useMutation({
    mutationFn: (v: { key: string; value: string }) => api.put('/users/profile', { [v.key]: v.value }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profile'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); setEditing(null); },
    onError: e => toast.error(apiError(e, 'Enter a valid URL starting with https://')),
  });
  const items = [
    { key: 'linkedinUrl' as const, name: 'LinkedIn', icon: Linkedin, placeholder: 'https://linkedin.com/in/your-name' },
    { key: 'githubUrl' as const, name: 'GitHub', icon: Github, placeholder: 'https://github.com/your-username' },
  ];
  return (
    <Section id="integrations" title="Integrations" icon={Plug}>
      <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>These link your public profiles so the AI and your resume can reference them. Automatic account sync (OAuth) isn’t available yet.</p>
      {items.map(i => {
        const value = profile?.[i.key];
        return (
          <div key={i.key} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <i.icon size={20} style={{ color: 'var(--fg-secondary)' }} aria-hidden />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: 'var(--fg-primary)' }}>{i.name}</p>
              {editing === i.key
                ? <form className="flex gap-2 mt-1" onSubmit={e => { e.preventDefault(); save.mutate({ key: i.key, value: url.trim() }); }}><input autoFocus className="input py-1.5" value={url} onChange={e => setUrl(e.target.value)} placeholder={i.placeholder} aria-label={`${i.name} URL`} /><button className="btn-primary text-sm" disabled={!url.trim()}>Save</button><button type="button" className="btn-ghost text-sm" onClick={() => setEditing(null)}>Cancel</button></form>
                : <p className="text-xs truncate" style={{ color: 'var(--fg-muted)' }}>{value || 'Not connected'}</p>}
            </div>
            <span className={`badge ${value ? 'badge-green' : 'badge-muted'}`}>{value ? 'Linked' : 'Not linked'}</span>
            {editing !== i.key && (value
              ? <button className="btn-secondary text-sm" onClick={() => save.mutate({ key: i.key, value: '' })}>Disconnect</button>
              : <button className="btn-primary text-sm" onClick={() => { setEditing(i.key); setUrl(''); }}>Connect</button>)}
          </div>
        );
      })}
    </Section>
  );
}

// ── API key ─────────────────────────────────────────────────────────────────
function ApiKeySection() {
  const qc = useQueryClient();
  const { data: s } = useSettings();
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const gen = useMutation({
    mutationFn: async () => (await api.post('/users/api-key')).data.data as { key: string },
    onSuccess: d => { setFresh(d.key); setConfirm(false); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: e => toast.error(apiError(e)),
  });
  const revoke = useMutation({ mutationFn: () => api.delete('/users/api-key'), onSuccess: () => { setFresh(null); toast.success('API key revoked'); qc.invalidateQueries({ queryKey: ['settings'] }); } });
  const has = !!s?.apiKeyPrefix;
  const copy = () => fresh && navigator.clipboard.writeText(fresh).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });

  return (
    <Section id="api-key" title="API key" icon={KeyRound}>
      <p className="text-sm" style={{ color: 'var(--fg-secondary)' }}>Use a personal key to call the CareerOS API from scripts: send <code>Authorization: Bearer &lt;key&gt;</code>. Keep it secret — it has full access to your account.</p>
      <div className="flex items-center gap-2 flex-wrap">
        <code className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm truncate" style={{ background: 'var(--bg-secondary)', color: 'var(--fg-primary)', border: '1px solid var(--border)' }}>
          {fresh ?? (has ? `${s!.apiKeyPrefix}••••••••••••••••••••••••••••••••••` : 'No key generated')}
        </code>
        {fresh && <button className="btn-secondary" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}</button>}
      </div>
      {fresh && <p className="text-xs" style={{ color: '#FBBF24' }}>Copy it now — for security it won’t be shown again.</p>}
      <div className="flex gap-2">
        <button className="btn-primary" onClick={() => (has ? setConfirm(true) : gen.mutate())} disabled={gen.isPending}>{gen.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {has ? 'Regenerate' : 'Generate key'}</button>
        {has && <button className="btn-secondary" onClick={() => revoke.mutate()} disabled={revoke.isPending}>Revoke</button>}
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => gen.mutate()} busy={gen.isPending} title="Regenerate API key?" message="The current key stops working immediately. Anything using it will need the new key." confirmLabel="Regenerate" />
    </Section>
  );
}

// ── Password ────────────────────────────────────────────────────────────────
const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Required'),
  newPassword: z.string().min(8, 'Min 8 characters').regex(/[A-Z]/, 'Needs an uppercase letter').regex(/[0-9]/, 'Needs a number'),
  confirmPassword: z.string(),
}).refine(d => d.newPassword === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });
type PasswordForm = z.infer<typeof passwordSchema>;

function PasswordSection() {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });
  const change = useMutation({
    mutationFn: (d: PasswordForm) => api.put('/users/account/password', { currentPassword: d.currentPassword, newPassword: d.newPassword }),
    onSuccess: () => { toast.success('Password updated. Other sessions were signed out.'); reset(); },
    onError: e => toast.error(apiError(e, 'Could not update password')),
  });
  return (
    <Section id="security" title="Change password" icon={Lock}>
      <form onSubmit={handleSubmit(d => change.mutate(d))} className="space-y-4" autoComplete="off">
        <Field label="Current password" error={errors.currentPassword?.message}><input type="password" className="input" autoComplete="current-password" {...register('currentPassword')} /></Field>
        <Field label="New password" error={errors.newPassword?.message}><input type="password" className="input" autoComplete="new-password" {...register('newPassword')} /></Field>
        <Field label="Confirm new password" error={errors.confirmPassword?.message}><input type="password" className="input" autoComplete="new-password" {...register('confirmPassword')} /></Field>
        <button className="btn-primary" disabled={change.isPending}>{change.isPending && <Loader2 size={14} className="animate-spin" />} Update password</button>
      </form>
    </Section>
  );
}

// ── Data & privacy ──────────────────────────────────────────────────────────
function DataSection() {
  const qc = useQueryClient();
  const { logout } = useAuthStore();
  const [dlg, setDlg] = useState<'data' | 'account' | null>(null);
  const [typed, setTyped] = useState('');
  const [exporting, setExporting] = useState(false);

  const refreshAll = () => qc.invalidateQueries();
  const loadDemo = useMutation({ mutationFn: () => api.post('/demo/load'), onSuccess: () => { toast.success('Demo data loaded: 20 applications, 35 jobs'); refreshAll(); }, onError: e => toast.error(apiError(e, 'Could not load demo data')) });
  const removeDemo = useMutation({ mutationFn: () => api.delete('/demo'), onSuccess: () => { toast.success('Demo data removed'); refreshAll(); }, onError: e => toast.error(apiError(e)) });
  const delData = useMutation({ mutationFn: () => api.delete('/users/data'), onSuccess: () => { toast.success('All application data deleted'); setDlg(null); setTyped(''); refreshAll(); }, onError: e => toast.error(apiError(e)) });
  const delAccount = useMutation({ mutationFn: () => api.delete('/users/account'), onSuccess: () => { qc.clear(); logout(); window.location.href = '/login'; }, onError: e => toast.error(apiError(e)) });

  const exportAll = async () => {
    setExporting(true);
    try { const r = await api.get('/users/export'); downloadBlob('careeros-export.json', JSON.stringify(r.data, null, 2), 'application/json'); toast.success('Export downloaded'); }
    catch (e) { toast.error(apiError(e, 'Export failed')); } finally { setExporting(false); }
  };
  const close = () => { setDlg(null); setTyped(''); };

  return (
    <>
      <Section id="data" title="Data & privacy" icon={Database}>
        <Row title="Load demo data" desc="Adds 35 sample jobs and 20 applications with history, plus sample AI usage so every chart has something to show." action={<div className="flex gap-2"><button className="btn-secondary" onClick={() => loadDemo.mutate()} disabled={loadDemo.isPending}>{loadDemo.isPending && <Loader2 size={14} className="animate-spin" />} Load</button><button className="btn-ghost" onClick={() => removeDemo.mutate()} disabled={removeDemo.isPending}>Remove</button></div>} />
        <Row title="Export my data" desc="Download everything we store about you as JSON (passwords and tokens excluded)." action={<button className="btn-secondary" onClick={exportAll} disabled={exporting}>{exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export</button>} />
        <Row title="Delete all application data" desc="Removes jobs, applications, interviews, cover letters and matches. Your account, profile and resumes stay." action={<button className="btn-secondary" style={{ color: '#F87171' }} onClick={() => setDlg('data')}><Trash2 size={14} /> Delete data</button>} />
      </Section>

      <Section id="danger" title="Danger zone" icon={Trash2} danger>
        <p className="text-sm" style={{ color: 'var(--fg-secondary)' }}>Permanently delete your account and everything in it. This cannot be undone.</p>
        <button className="w-full sm:w-auto py-2 px-4 rounded-lg text-sm font-medium" style={{ background: '#7F1D1D', color: '#FCA5A5' }} onClick={() => setDlg('account')}>Delete my account</button>
      </Section>

      <Modal open={dlg !== null} onClose={close} title={dlg === 'account' ? 'Delete your account?' : 'Delete all application data?'}>
        <p className="text-sm mb-4" style={{ color: 'var(--fg-secondary)' }}>
          {dlg === 'account' ? 'Your profile, resumes, applications, chats and settings will be permanently deleted.' : 'All jobs, applications, interviews, cover letters and matches will be permanently deleted.'}
        </p>
        <label className="label" htmlFor="del-confirm">Type <span className="font-mono" style={{ color: '#F87171' }}>DELETE</span> to confirm</label>
        <input id="del-confirm" className="input mb-4" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" />
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={close}>Cancel</button>
          <button className="btn-primary" style={{ background: '#DC2626' }} disabled={typed !== 'DELETE' || delData.isPending || delAccount.isPending} onClick={() => (dlg === 'account' ? delAccount.mutate() : delData.mutate())}>
            {(delData.isPending || delAccount.isPending) && <Loader2 size={14} className="animate-spin" />} Delete permanently
          </button>
        </div>
      </Modal>
    </>
  );
}

function Row({ title, desc, action }: { title: string; desc: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <div><p className="text-sm font-medium" style={{ color: 'var(--fg-primary)' }}>{title}</p><p className="text-xs mt-0.5 max-w-md" style={{ color: 'var(--fg-muted)' }}>{desc}</p></div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
