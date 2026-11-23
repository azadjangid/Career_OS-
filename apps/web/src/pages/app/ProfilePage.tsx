import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, useEffect } from 'react';
import { User, Plus, Trash2, Loader2, CheckCircle } from 'lucide-react';

const profileSchema = z.object({
  headline: z.string().max(200).optional(),
  summary: z.string().max(2000).optional(),
  phone: z.string().max(20).optional(),
  location: z.string().max(200).optional(),
  currentRole: z.string().max(100).optional(),
  currentCompany: z.string().max(100).optional(),
  yearsOfExp: z.number().min(0).max(50).optional(),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  githubUrl: z.string().url().optional().or(z.literal('')),
  portfolioUrl: z.string().url().optional().or(z.literal('')),
  salaryMin: z.number().min(0).optional(),
  salaryMax: z.number().min(0).optional(),
  noticePeriod: z.string().max(50).optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export default function ProfilePage() {
  const [saved, setSaved] = useState(false);
  const [newSkill, setNewSkill] = useState('');
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await api.get('/users/profile');
      return res.data.data as ProfileFormData & { skills?: Array<{ id: string; name: string; level: string }> };
    },
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProfileFormData>({ resolver: zodResolver(profileSchema) });

  useEffect(() => { if (profile) reset(profile); }, [profile, reset]);

  const updateProfile = useMutation({
    mutationFn: (data: ProfileFormData) => api.put('/users/profile', data),
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); queryClient.invalidateQueries({ queryKey: ['profile'] }); },
  });

  const addSkill = useMutation({
    mutationFn: (name: string) => api.post('/users/profile/skills', { name, level: 'INTERMEDIATE', isPrimary: true }),
    onSuccess: () => { setNewSkill(''); queryClient.invalidateQueries({ queryKey: ['profile'] }); },
  });

  const deleteSkill = useMutation({
    mutationFn: (id: string) => api.delete(`/users/profile/skills/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  });

  if (isLoading) {
    return <div className="space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: 'var(--bg-card)' }} />)}</div>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <form onSubmit={handleSubmit(data => updateProfile.mutate(data))} className="space-y-6">
        {/* Basic info */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-dim)' }}>
              <User size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <h2 className="font-display font-semibold" style={{ color: 'var(--fg-primary)' }}>Basic Information</h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Headline" error={errors.headline?.message}>
              <input {...register('headline')} className="input" placeholder="Frontend Developer" />
            </Field>
            <Field label="Phone">
              <input {...register('phone')} className="input" placeholder="+91 98765 43210" />
            </Field>
            <Field label="Location" className="sm:col-span-2">
              <input {...register('location')} className="input" placeholder="Bengaluru, India" />
            </Field>
            <Field label="Current role">
              <input {...register('currentRole')} className="input" placeholder="Frontend Developer" />
            </Field>
            <Field label="Current company">
              <input {...register('currentCompany')} className="input" placeholder="TechCorp" />
            </Field>
            <Field label="Years of experience">
              <input {...register('yearsOfExp', { valueAsNumber: true })} type="number" min="0" max="50" className="input" />
            </Field>
            <Field label="Notice period">
              <input {...register('noticePeriod')} className="input" placeholder="30 days" />
            </Field>
          </div>

          <Field label="Professional summary">
            <textarea {...register('summary')} rows={3} className="input resize-none" placeholder="Brief professional summary..." />
          </Field>
        </div>

        {/* Links */}
        <div className="card space-y-4">
          <h2 className="font-display font-semibold" style={{ color: 'var(--fg-primary)' }}>Links</h2>
          <Field label="LinkedIn URL" error={errors.linkedinUrl?.message}>
            <input {...register('linkedinUrl')} className="input" placeholder="https://linkedin.com/in/your-name" />
          </Field>
          <Field label="GitHub URL" error={errors.githubUrl?.message}>
            <input {...register('githubUrl')} className="input" placeholder="https://github.com/username" />
          </Field>
          <Field label="Portfolio URL" error={errors.portfolioUrl?.message}>
            <input {...register('portfolioUrl')} className="input" placeholder="https://yoursite.dev" />
          </Field>
        </div>

        {/* Salary */}
        <div className="card space-y-4">
          <h2 className="font-display font-semibold" style={{ color: 'var(--fg-primary)' }}>Salary Expectations</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Minimum (₹/year)">
              <input {...register('salaryMin', { valueAsNumber: true })} type="number" className="input" placeholder="600000" />
            </Field>
            <Field label="Maximum (₹/year)">
              <input {...register('salaryMax', { valueAsNumber: true })} type="number" className="input" placeholder="800000" />
            </Field>
          </div>
        </div>

        <button type="submit" disabled={updateProfile.isPending} className="btn-primary">
          {updateProfile.isPending ? <Loader2 size={16} className="animate-spin" /> : saved ? <CheckCircle size={16} /> : null}
          {saved ? 'Saved!' : 'Save profile'}
        </button>
      </form>

      {/* Skills */}
      <div className="card space-y-4">
        <h2 className="font-display font-semibold" style={{ color: 'var(--fg-primary)' }}>Skills</h2>
        <div className="flex flex-wrap gap-2">
          {(profile as any)?.skills?.map((s: { id: string; name: string }) => (
            <span key={s.id} className="badge badge-orange gap-1.5">
              {s.name}
              <button onClick={() => deleteSkill.mutate(s.id)} style={{ lineHeight: 0 }}>
                <Trash2 size={11} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newSkill}
            onChange={e => setNewSkill(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newSkill.trim()) addSkill.mutate(newSkill.trim()); } }}
            className="input flex-1"
            placeholder="Add a skill (press Enter)"
          />
          <button
            type="button"
            onClick={() => { if (newSkill.trim()) addSkill.mutate(newSkill.trim()); }}
            disabled={!newSkill.trim() || addSkill.isPending}
            className="btn-primary px-3"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, error, className }: { label: string; children: React.ReactNode; error?: string; className?: string }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {error && <p className="text-xs mt-1" style={{ color: '#F87171' }}>{error}</p>}
    </div>
  );
}
