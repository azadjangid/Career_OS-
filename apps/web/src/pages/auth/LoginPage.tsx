import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { Zap, Mail, Lock, AlertCircle } from 'lucide-react';
import { useLogin } from '@/hooks/useAuth';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const login = useLogin();
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent)' }}>
            <Zap size={20} className="text-on-accent" />
          </div>
          <span className="font-display font-bold text-2xl" style={{ color: 'var(--fg-primary)' }}>CareerOS</span>
        </div>

        <div className="card">
          <h2 className="font-display font-bold text-2xl mb-1" style={{ color: 'var(--fg-primary)' }}>Welcome back</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--fg-secondary)' }}>Sign in to your career dashboard</p>

          {login.error && (
            <div className="flex items-center gap-2 p-3 rounded-lg mb-4 text-sm" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--tone-red)' }}>
              <AlertCircle size={16} />
              {(login.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Invalid credentials'}
            </div>
          )}

          <form onSubmit={handleSubmit(data => login.mutate(data))} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--fg-muted)' }} />
                <input {...register('email')} type="email" placeholder="you@example.com" className="input pl-9" autoComplete="email" />
              </div>
              {errors.email && <p className="text-xs mt-1" style={{ color: 'var(--tone-red)' }}>{errors.email.message}</p>}
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="label mb-0">Password</label>
                <Link to="/forgot-password" className="text-xs" style={{ color: 'var(--accent)' }}>Forgot password?</Link>
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--fg-muted)' }} />
                <input {...register('password')} type="password" placeholder="••••••••" className="input pl-9" autoComplete="current-password" />
              </div>
              {errors.password && <p className="text-xs mt-1" style={{ color: 'var(--tone-red)' }}>{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={login.isPending} className="btn-primary w-full justify-center py-2.5">
              {login.isPending ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-sm mt-5" style={{ color: 'var(--fg-secondary)' }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: 'var(--accent)' }} className="font-medium">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
