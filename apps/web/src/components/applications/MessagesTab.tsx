import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Loader2, Pencil, Send, Sparkles, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { apiError, formatDate } from '@/lib/format';
import { toast } from '@/store/toast.store';
import EmptyState from '@/components/ui/EmptyState';

interface RecruiterMessage {
  id: string;
  type: string;
  recipientName?: string | null;
  subject?: string | null;
  content: string;
  sentAt?: string | null;
  createdAt: string;
}

const KINDS = [
  { id: 'linkedin', label: 'LinkedIn note', hint: 'Connection request, 300 characters max' },
  { id: 'email', label: 'Email to recruiter', hint: 'Short cold email about the role' },
  { id: 'referral', label: 'Referral request', hint: 'Ask someone who works there' },
  { id: 'follow_up', label: 'Follow-up', hint: 'No reply after applying or interviewing' },
  { id: 'thank_you', label: 'Thank-you note', hint: 'After an interview' },
] as const;
const kindLabel = (k: string) => KINDS.find(x => x.id === k)?.label ?? k;

const card = { background: 'var(--bg-card)', border: '1px solid var(--border)' } as const;

/** AI drafts for outreach about one application. Drafts are never sent automatically: copy and send them yourself. */
export default function MessagesTab({ appId }: { appId: string }) {
  const qc = useQueryClient();
  const key = ['recruiter-messages', appId];
  const [kind, setKind] = useState<(typeof KINDS)[number]['id']>('linkedin');
  const [recipientName, setRecipientName] = useState('');
  const [context, setContext] = useState('');

  const { data: messages = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get('/recruiter-messages', { params: { applicationId: appId } })).data.data as RecruiterMessage[],
  });
  const draft = useMutation({
    mutationFn: () =>
      api.post('/recruiter-messages/draft', { kind, applicationId: appId, recipientName: recipientName.trim() || undefined, context: context.trim() || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success('Draft ready. Review it before sending.'); },
    onError: e => toast.error(apiError(e, 'Could not write the draft')),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  return (
    <div className="space-y-4">
      <form className="p-3 rounded-lg space-y-3" style={card} onSubmit={e => { e.preventDefault(); draft.mutate(); }}>
        <div>
          <label className="label" htmlFor="msg-kind">Message type</label>
          <select id="msg-kind" className="input" value={kind} onChange={e => setKind(e.target.value as typeof kind)}>
            {KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
          <p className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>{KINDS.find(k => k.id === kind)?.hint}</p>
        </div>
        <div>
          <label className="label" htmlFor="msg-to">Recipient name (optional)</label>
          <input id="msg-to" className="input" placeholder="e.g. Priya Sharma" value={recipientName} onChange={e => setRecipientName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="msg-ctx">Anything to mention (optional)</label>
          <textarea id="msg-ctx" rows={2} className="input resize-none" placeholder="e.g. We met at the React Bangalore meetup; I applied on 12 Nov" value={context} onChange={e => setContext(e.target.value)} />
        </div>
        <button type="submit" className="btn-primary" disabled={draft.isPending}>
          {draft.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Write draft
        </button>
      </form>

      {isLoading ? <Loader2 size={16} className="animate-spin" /> : messages.length === 0
        ? <EmptyState compact title="No drafts yet" description="Drafts use your resume and this job. Nothing is ever sent for you." />
        : <ul className="space-y-3">{messages.map(m => <MessageItem key={m.id} m={m} onChange={refresh} />)}</ul>}
    </div>
  );
}

function MessageItem({ m, onChange }: { m: RecruiterMessage; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(m.subject ?? '');
  const [content, setContent] = useState(m.content);
  const [copied, setCopied] = useState(false);

  const save = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.put(`/recruiter-messages/${m.id}`, data),
    onSuccess: () => { setEditing(false); onChange(); },
    onError: e => toast.error(apiError(e, 'Could not save')),
  });
  const del = useMutation({ mutationFn: () => api.delete(`/recruiter-messages/${m.id}`), onSuccess: onChange });

  const copy = () => {
    const text = m.subject ? `Subject: ${m.subject}\n\n${m.content}` : m.content;
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  return (
    <li className="p-3 rounded-lg space-y-2" style={card}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="badge badge-orange">{kindLabel(m.type)}</span>
        {m.recipientName && <span className="text-xs" style={{ color: 'var(--fg-secondary)' }}>to {m.recipientName}</span>}
        {m.sentAt && <span className="badge badge-green">Sent {formatDate(m.sentAt)}</span>}
        <span className="text-xs ml-auto" style={{ color: 'var(--fg-muted)' }}>{formatDate(m.createdAt, 'd MMM, h:mm a')}</span>
      </div>
      {editing ? (
        <>
          {m.type !== 'linkedin' && <input className="input text-sm" aria-label="Subject" value={subject} onChange={e => setSubject(e.target.value)} />}
          <textarea rows={6} className="input resize-y text-sm" aria-label="Message" value={content} onChange={e => setContent(e.target.value)} />
          {m.type === 'linkedin' && <p className="text-xs" style={{ color: content.length > 300 ? 'var(--tone-red)' : 'var(--fg-muted)' }}>{content.length}/300</p>}
          <div className="flex gap-2">
            <button className="btn-primary text-xs py-1.5" disabled={!content.trim() || save.isPending} onClick={() => save.mutate({ subject: subject.trim() || null, content: content.trim() })}>Save</button>
            <button className="btn-ghost text-xs py-1.5" onClick={() => { setEditing(false); setSubject(m.subject ?? ''); setContent(m.content); }}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          {m.subject && <p className="text-sm font-medium" style={{ color: 'var(--fg-primary)' }}>{m.subject}</p>}
          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--fg-secondary)' }}>{m.content}</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary text-xs py-1" onClick={copy}>{copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}</button>
            <button className="btn-ghost text-xs py-1" onClick={() => setEditing(true)}><Pencil size={12} /> Edit</button>
            <button className="btn-ghost text-xs py-1" onClick={() => save.mutate({ sent: !m.sentAt })}><Send size={12} /> {m.sentAt ? 'Mark not sent' : 'Mark as sent'}</button>
            <button className="btn-ghost text-xs py-1" style={{ color: 'var(--tone-red)' }} onClick={() => del.mutate()} aria-label="Delete draft"><Trash2 size={12} /></button>
          </div>
        </>
      )}
    </li>
  );
}
