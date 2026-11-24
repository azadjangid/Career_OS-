import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, AlertCircle, Loader2, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { apiError } from '@/lib/format';
import { useAuthStore } from '@/store/auth.store';

/** Landing page for the link in the confirmation email. */
export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const [state, setState] = useState<'working' | 'done' | 'error'>(token ? 'working' : 'error');
  const [message, setMessage] = useState(token ? '' : 'This confirmation link is missing its token.');
  const sent = useRef(false);

  useEffect(() => {
    // Strict mode runs effects twice in development; the token is single-use, so send it once
    if (!token || sent.current) return;
    sent.current = true;
    api
      .post('/auth/verify-email', { token })
      .then(() => {
        setState('done');
        const user = useAuthStore.getState().user;
        if (user) useAuthStore.getState().setUser({ ...user, emailVerified: true });
      })
      .catch(e => {
        setState('error');
        setMessage(apiError(e, 'This confirmation link is invalid or has expired.'));
      });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent)' }}>
            <Zap size={20} className="text-on-accent" />
          </div>
          <span className="font-display font-bold text-2xl" style={{ color: 'var(--fg-primary)' }}>CareerOS</span>
        </div>
        <div className="card text-center" role="status" aria-live="polite">
          {state === 'working' && (
            <>
              <Loader2 size={40} className="animate-spin mx-auto mb-4" style={{ color: 'var(--accent)' }} />
              <p style={{ color: 'var(--fg-secondary)' }}>Confirming your email…</p>
            </>
          )}
          {state === 'done' && (
            <>
              <CheckCircle size={48} className="mx-auto mb-4" style={{ color: 'var(--tone-green)' }} />
              <h2 className="font-display font-bold text-xl mb-2" style={{ color: 'var(--fg-primary)' }}>Email confirmed</h2>
              <p className="text-sm mb-6" style={{ color: 'var(--fg-secondary)' }}>Thanks! You'll now get reminders and job alerts by email.</p>
              <Link to={isAuthenticated ? '/dashboard' : '/login'} className="btn-primary inline-flex justify-center">
                {isAuthenticated ? 'Go to dashboard' : 'Sign in'}
              </Link>
            </>
          )}
          {state === 'error' && (
            <>
              <AlertCircle size={48} className="mx-auto mb-4" style={{ color: 'var(--tone-red)' }} />
              <h2 className="font-display font-bold text-xl mb-2" style={{ color: 'var(--fg-primary)' }}>Couldn't confirm your email</h2>
              <p className="text-sm mb-6" style={{ color: 'var(--fg-secondary)' }}>
                {message} {isAuthenticated ? 'You can send a new link from the banner in the app.' : 'Sign in to send a new link.'}
              </p>
              <Link to={isAuthenticated ? '/dashboard' : '/login'} className="btn-primary inline-flex justify-center">
                {isAuthenticated ? 'Back to the app' : 'Sign in'}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
