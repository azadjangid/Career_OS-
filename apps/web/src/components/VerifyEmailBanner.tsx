import { useState } from 'react';
import { MailWarning, Loader2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { apiError } from '@/lib/format';
import { toast } from '@/store/toast.store';
import { useAuthStore } from '@/store/auth.store';

/** Reminds users who haven't confirmed their email; reminders and alerts are only emailed once they do. */
export default function VerifyEmailBanner() {
  const user = useAuthStore(s => s.user);
  const [sending, setSending] = useState(false);
  const [hidden, setHidden] = useState(false);

  if (!user || user.emailVerified !== false || hidden) return null;

  const resend = async () => {
    setSending(true);
    try {
      const r = await api.post('/auth/resend-verification');
      if (r.data.data.alreadyVerified) {
        useAuthStore.getState().setUser({ ...user, emailVerified: true });
        toast.success('Your email is already confirmed');
      } else {
        toast.success(`Confirmation link sent to ${user.email}`);
      }
    } catch (e) {
      toast.error(apiError(e, 'Could not send the email. Try again in a few minutes.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 text-sm"
      style={{ background: 'rgba(251,191,36,0.12)', color: 'var(--fg-primary)', borderBottom: '1px solid rgba(251,191,36,0.25)' }}
      role="status"
    >
      <MailWarning size={16} style={{ color: 'var(--tone-amber)' }} aria-hidden />
      <span className="flex-1 min-w-0">
        Confirm your email (<strong>{user.email}</strong>) to get interview reminders and job alerts.
      </span>
      <button className="btn-secondary !py-1 !px-3 text-xs" onClick={resend} disabled={sending}>
        {sending ? <Loader2 size={12} className="animate-spin" /> : null} Resend link
      </button>
      <button className="p-1 rounded hover:opacity-70" onClick={() => setHidden(true)} aria-label="Hide for now">
        <X size={14} />
      </button>
    </div>
  );
}
