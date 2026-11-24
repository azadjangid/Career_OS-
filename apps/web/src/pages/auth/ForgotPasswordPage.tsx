import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { Zap, Mail, CheckCircle } from 'lucide-react';
import { useForgotPassword } from '@/hooks/useAuth';

const schema = z.object({ email: z.string().email('Enter a valid email') });
type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const forgot = useForgotPassword();
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-primary)' }}>
        <div className="w-full max-w-md card text-center">
          <div className="flex justify-center mb-4"><CheckCircle size={48} style={{ color: 'var(--tone-green)' }} /></div>
          <h2 className="font-display font-bold text-xl mb-2" style={{ color: 'var(--fg-primary)' }}>Check your email</h2>
          <p className="text-sm mb-4" style={{ color: 'var(--fg-secondary)' }}>If that email exists, we sent a reset link. Check your inbox.</p>
          <Link to="/login" className="btn-primary inline-flex justify-center">Back to login</Link>
        </div>
      </div>
    );
  }

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
          <h2 className="font-display font-bold text-2xl mb-1" style={{ color: 'var(--fg-primary)' }}>Reset password</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--fg-secondary)' }}>Enter your email and we'll send a reset link</p>

          <form onSubmit={handleSubmit(async data => { await forgot.mutateAsync(data.email); setSent(true); })} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--fg-muted)' }} />
                <input {...register('email')} type="email" placeholder="you@example.com" className="input pl-9" />
              </div>
              {errors.email && <p className="text-xs mt-1" style={{ color: 'var(--tone-red)' }}>{errors.email.message}</p>}
            </div>
            <button type="submit" disabled={forgot.isPending} className="btn-primary w-full justify-center py-2.5">
              {forgot.isPending ? 'Sending...' : 'Send reset link'}
            </button>
          </form>

          <p className="text-center text-sm mt-5" style={{ color: 'var(--fg-secondary)' }}>
            <Link to="/login" style={{ color: 'var(--accent)' }} className="font-medium">Back to login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
