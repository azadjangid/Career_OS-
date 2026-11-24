import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { Zap, Mail, Lock, User, AlertCircle } from 'lucide-react';
import { useRegister } from '@/hooks/useAuth';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Enter a valid email'),
  password: z.string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Include an uppercase letter')
    .regex(/[0-9]/, 'Include a number'),
});

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const register_ = useRegister();
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent)' }}>
            <Zap size={20} className="text-on-accent" />
          </div>
          <span className="font-display font-bold text-2xl" style={{ color: 'var(--fg-primary)' }}>CareerOS</span>
        </div>

        <div className="card">
          <h2 className="font-display font-bold text-2xl mb-1" style={{ color: 'var(--fg-primary)' }}>Get started</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--fg-secondary)' }}>Create your AI career dashboard</p>

          {register_.error && (
            <div className="flex items-center gap-2 p-3 rounded-lg mb-4 text-sm" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--tone-red)' }}>
              <AlertCircle size={16} />
              {(register_.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Registration failed'}
            </div>
          )}

          <form onSubmit={handleSubmit(data => register_.mutate(data))} className="space-y-4">
            <div>
              <label className="label">Full name</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--fg-muted)' }} />
                <input {...register('name')} placeholder="Azad Jangid" className="input pl-9" autoComplete="name" />
              </div>
              {errors.name && <p className="text-xs mt-1" style={{ color: 'var(--tone-red)' }}>{errors.name.message}</p>}
            </div>

            <div>
              <label className="label">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--fg-muted)' }} />
                <input {...register('email')} type="email" placeholder="you@example.com" className="input pl-9" autoComplete="email" />
              </div>
              {errors.email && <p className="text-xs mt-1" style={{ color: 'var(--tone-red)' }}>{errors.email.message}</p>}
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--fg-muted)' }} />
                <input {...register('password')} type="password" placeholder="Min 8 chars, 1 uppercase, 1 number" className="input pl-9" autoComplete="new-password" />
              </div>
              {errors.password && <p className="text-xs mt-1" style={{ color: 'var(--tone-red)' }}>{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={register_.isPending} className="btn-primary w-full justify-center py-2.5">
              {register_.isPending ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm mt-5" style={{ color: 'var(--fg-secondary)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--accent)' }} className="font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
