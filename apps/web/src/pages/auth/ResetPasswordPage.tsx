import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSearchParams } from 'react-router-dom';
import { Zap, Lock, AlertCircle } from 'lucide-react';
import { useResetPassword } from '@/hooks/useAuth';

const schema = z.object({
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
  confirm: z.string(),
}).refine(d => d.password === d.confirm, { message: 'Passwords do not match', path: ['confirm'] });

type FormData = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const reset = useResetPassword();
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent)' }}>
            <Zap size={20} className="text-white" />
          </div>
          <span className="font-display font-bold text-2xl" style={{ color: 'var(--fg-primary)' }}>CareerOS</span>
        </div>

        <div className="card">
          <h2 className="font-display font-bold text-2xl mb-1" style={{ color: 'var(--fg-primary)' }}>New password</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--fg-secondary)' }}>Choose a strong new password</p>

          {!token && (
            <div className="flex items-center gap-2 p-3 rounded-lg mb-4 text-sm" style={{ background: 'rgba(248,113,113,0.1)', color: '#F87171' }}>
              <AlertCircle size={16} /> Invalid or missing reset token
            </div>
          )}

          <form onSubmit={handleSubmit(data => reset.mutate({ token, password: data.password }))} className="space-y-4">
            <div>
              <label className="label">New password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--fg-muted)' }} />
                <input {...register('password')} type="password" placeholder="Min 8 chars" className="input pl-9" />
              </div>
              {errors.password && <p className="text-xs mt-1" style={{ color: '#F87171' }}>{errors.password.message}</p>}
            </div>
            <div>
              <label className="label">Confirm password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--fg-muted)' }} />
                <input {...register('confirm')} type="password" placeholder="••••••••" className="input pl-9" />
              </div>
              {errors.confirm && <p className="text-xs mt-1" style={{ color: '#F87171' }}>{errors.confirm.message}</p>}
            </div>
            <button type="submit" disabled={reset.isPending || !token} className="btn-primary w-full justify-center py-2.5">
              {reset.isPending ? 'Resetting...' : 'Reset password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
