import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import remarkGfm from 'remark-gfm';
import {
  Brain, Send, Plus, Trash2, Loader2, User, Sparkles, Search, Paperclip, X, Copy, Check, FileDown, Menu, Square, Wrench,
} from 'lucide-react';
import { api } from '@/lib/api';
import { streamPost, StreamError } from '@/lib/sse';
import { apiError, formatDate, timeAgo } from '@/lib/format';
import { downloadPdf } from '@/lib/exportDocs';
import { toast } from '@/store/toast.store';
import { useResumes, useAIUsage } from '@/hooks/queries';
import { useResumeUpload } from '@/hooks/useResumeUpload';
import { Skeleton } from '@/components/ui/Skeleton';
import CareerToolsModal from '@/components/ai/CareerToolsModal';

interface Message { role: 'user' | 'assistant'; content: string; tools?: string[] }
interface Conversation { id: string; title: string; updatedAt: string }
interface PendingAction { toolUseId: string; tool: string; description: string }
interface AgentReply { reply: string; conversationId: string; pending: PendingAction[]; toolsUsed: string[] }
interface Attachment { id: string; name: string }

const SUGGESTED_PROMPTS = [
  'Review my resume for a Senior React Developer role',
  'Help me prepare for a behavioral interview',
  'Write a follow-up email after my interview at [company]',
  'What skills should I add for a Data Engineer role?',
  'Which of my applications need a follow-up this week?',
  'Compare my resume with the jobs I saved and tell me the gaps',
];

const TOOL_LABEL: Record<string, string> = {
  get_profile: 'your profile', list_resumes: 'your resumes', get_resume_text: 'your resume', search_jobs: 'jobs', get_job: 'job details',
  list_applications: 'your applications', get_pipeline_stats: 'pipeline stats', upcoming_interviews: 'your interviews',
  create_application: 'creating an application', update_application_status: 'updating a status', add_application_note: 'adding a note', schedule_interview: 'scheduling an interview',
};
const WRITE_TOOLS = new Set(['create_application', 'update_application_status', 'add_application_note', 'schedule_interview']);

export default function AIPage() {
  const qc = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [activity, setActivity] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [search, setSearch] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: usage } = useAIUsage();
  const { data: resumes } = useResumes();
  const { upload, uploading } = useResumeUpload();
  const { data: conversations, isLoading: convLoading } = useQuery({
    queryKey: ['ai-conversations'],
    queryFn: async () => (await api.get('/ai/conversations')).data.data as Conversation[],
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (conversations ?? []).filter(c => !q || c.title.toLowerCase().includes(q));
  }, [conversations, search]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, streamText, pending]);
  useEffect(() => {
    const t = textareaRef.current;
    if (t) { t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight, 160)}px`; }
  }, [input]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const applyReply = (data: AgentReply) => {
    setError(null);
    setStreamText('');
    setActivity(null);
    setMessages(prev => (data.reply ? [...prev, { role: 'assistant', content: data.reply, tools: [...new Set(data.toolsUsed)] }] : prev));
    setPending(data.pending ?? []);
    setConversationId(data.conversationId);
    qc.invalidateQueries({ queryKey: ['ai-conversations'] });
    qc.invalidateQueries({ queryKey: ['ai-usage'] });
    if (data.toolsUsed.some(t => WRITE_TOOLS.has(t))) { qc.invalidateQueries({ queryKey: ['applications'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); }
  };

  const send = async (text: string) => {
    const clean = text.trim();
    if (!clean || streaming || pending.length) return;
    const full = attachment ? `${clean}\n\n(Attached resume: "${attachment.name}", id: ${attachment.id})` : clean;
    setMessages(prev => [...prev, { role: 'user', content: full }]);
    setInput(''); setAttachment(null); setError(null); setStreaming(true); setStreamText('');

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let acc = '';
    try {
      const data = await streamPost<AgentReply>('/ai/chat/stream', { message: full, conversationId }, {
        onText: d => { acc += d; setStreamText(acc); },
        onTool: name => setActivity(TOOL_LABEL[name] ?? name),
      }, ctrl.signal);
      applyReply(data);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        // Stopped by the user: keep what had streamed so far
        if (acc) setMessages(prev => [...prev, { role: 'assistant', content: `${acc}\n\n*(stopped)*` }]);
        setStreamText(''); setActivity(null);
      } else {
        setStreamText(''); setActivity(null);
        // The turn wasn't saved: take the message back out of the thread and put it in the box to resend
        setMessages(prev => (prev[prev.length - 1]?.role === 'user' ? prev.slice(0, -1) : prev));
        setInput(clean);
        if (attachment) setAttachment(attachment);
        setError(e instanceof StreamError
          ? { message: e.message, code: e.code }
          : { message: 'Could not reach the CareerOS server. Check your connection and try again.', code: 'NETWORK' });
        qc.invalidateQueries({ queryKey: ['ai-usage'] });
      }
    } finally { setStreaming(false); abortRef.current = null; }
  };

  const resolve = useMutation({
    mutationFn: async (approve: boolean) => (await api.post('/ai/chat/resolve', { conversationId, approve })).data.data as AgentReply,
    onSuccess: data => { applyReply(data); toast.success('Done'); },
    onError: e => setError({ message: apiError(e) }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/ai/conversations/${id}`),
    onSuccess: (_d, id) => { qc.invalidateQueries({ queryKey: ['ai-conversations'] }); if (id === conversationId) newChat(); },
  });

  const newChat = () => { abortRef.current?.abort(); setConversationId(null); setMessages([]); setPending([]); setError(null); setStreamText(''); setListOpen(false); };

  const loadConversation = async (id: string) => {
    try {
      const conv = (await api.get(`/ai/conversations/${id}`)).data.data as { messages: Message[]; pending?: PendingAction[] };
      setMessages(conv.messages ?? []); setPending(conv.pending ?? []); setConversationId(id); setError(null); setListOpen(false);
    } catch (e) { toast.error(apiError(e, 'Could not open this chat')); }
  };

  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } };

  const transcript = () => messages.map(m => `${m.role === 'user' ? 'You' : 'CareerOS AI'}: ${m.content}`).join('\n\n');
  const copyChat = () => navigator.clipboard.writeText(transcript()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  const exportPdf = () => downloadPdf('CareerOS AI conversation', messages.map(m => ({
    heading: m.role === 'user' ? 'You' : 'CareerOS AI',
    lines: m.content.replace(/[*_`#>]/g, '').split('\n'),
  })), `chat-${new Date().toISOString().slice(0, 10)}`).catch(() => toast.error('Could not create the PDF'));

  const attachFile = async (f?: File) => { const r = await upload(f!); if (r) { setAttachment({ id: r.id, name: r.name }); setAttachOpen(false); } };
  const empty = messages.length === 0 && !streaming;
  const busy = streaming || resolve.isPending;

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <button onClick={newChat} className="btn-primary w-full justify-center text-sm py-2"><Plus size={16} /> New chat</button>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--fg-muted)' }} aria-hidden />
          <input className="input pl-8 py-1.5 text-sm" placeholder="Search chats" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search chats" />
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {convLoading && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}
        {!convLoading && filtered.length === 0 && <li className="text-xs text-center py-6" style={{ color: 'var(--fg-muted)' }}>{search ? 'No chats match' : 'No chats yet'}</li>}
        {filtered.map(c => (
          <li key={c.id} className="group relative">
            <button onClick={() => loadConversation(c.id)} className="w-full text-left px-3 py-2 rounded-lg text-sm"
              aria-current={c.id === conversationId}
              style={{ background: c.id === conversationId ? 'var(--accent-dim)' : 'transparent', color: c.id === conversationId ? 'var(--accent)' : 'var(--fg-secondary)' }}>
              <span className="block truncate pr-6">{c.title}</span>
              <span className="text-[11px]" style={{ color: 'var(--fg-muted)' }} title={formatDate(c.updatedAt, 'd MMM yyyy, h:mm a')}>{timeAgo(c.updatedAt)}</span>
            </button>
            <button onClick={() => del.mutate(c.id)} className="absolute right-2 top-2.5 p-1 opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`Delete chat ${c.title}`} style={{ color: 'var(--tone-red)' }}><Trash2 size={13} /></button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="flex gap-4 h-[calc(100vh-7.5rem)]">
      <aside className="hidden md:block w-64 shrink-0 rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }} aria-label="Chat history">{sidebar}</aside>
      {listOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setListOpen(false)} aria-hidden />
          <div className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw]" style={{ background: 'var(--bg-card)' }} role="dialog" aria-label="Chat history" aria-modal="true">{sidebar}</div>
        </div>
      )}

      <section className="flex-1 min-w-0 flex flex-col rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }} aria-label="Conversation">
        <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <button className="btn-ghost p-2 md:hidden" onClick={() => setListOpen(true)} aria-label="Open chat history"><Menu size={18} /></button>
          <p className="text-sm font-medium truncate px-2 flex items-center gap-2" style={{ color: 'var(--fg-primary)' }}><Brain size={16} style={{ color: 'var(--accent)' }} /> CareerOS AI</p>
          <div className="flex gap-1">
            <button className="btn-secondary text-xs px-2 py-1.5" onClick={() => setToolsOpen(true)} title="JD analysis, skill gap, application help, roadmap, emails"><Wrench size={14} /> Career tools</button>
            <button className="btn-ghost p-2" onClick={copyChat} disabled={!messages.length} aria-label="Copy conversation" title="Copy conversation">{copied ? <Check size={16} /> : <Copy size={16} />}</button>
            <button className="btn-ghost p-2" onClick={exportPdf} disabled={!messages.length} aria-label="Export as PDF" title="Export as PDF"><FileDown size={16} /></button>
          </div>
        </div>

        {usage && !usage.configured && (
          <div className="px-4 py-2 text-xs" style={{ background: 'var(--accent-dim)', color: 'var(--fg-primary)' }} role="status">
            AI isn’t configured yet. Add your {usage.provider === 'nvidia' ? 'NVIDIA' : 'Anthropic'} key as <code>{usage.keyVar ?? 'ANTHROPIC_API_KEY'}</code> in <code>.env</code> and restart the API.
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4" aria-live="polite">
          {empty ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--accent-dim)' }}><Brain size={32} style={{ color: 'var(--accent)' }} /></div>
              <h2 className="font-display font-bold text-2xl mb-2" style={{ color: 'var(--fg-primary)' }}>How can I help with your job search?</h2>
              <p className="text-sm mb-6 max-w-md" style={{ color: 'var(--fg-secondary)' }}>I can see your resumes, saved jobs, applications and interviews, and can update your pipeline once you approve.</p>
              <div className="grid sm:grid-cols-2 gap-2 w-full max-w-2xl">
                {SUGGESTED_PROMPTS.map(p => (
                  <button key={p} onClick={() => send(p)} className="text-left px-3 py-2.5 rounded-lg text-sm card-hover" style={{ background: 'var(--bg-hover)', color: 'var(--fg-secondary)', border: '1px solid var(--border)' }}>
                    <Sparkles size={12} className="inline mr-1.5" style={{ color: 'var(--accent)' }} />{p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-5">
              {messages.map((m, i) => <Bubble key={i} m={m} />)}
              {streaming && (
                streamText ? <Bubble m={{ role: 'assistant', content: streamText }} />
                : <div className="flex gap-3" role="status" aria-label="CareerOS AI is thinking">
                    <Avatar assistant />
                    <div className="px-4 py-3 rounded-2xl text-sm flex items-center gap-2" style={{ background: 'var(--bg-hover)', color: 'var(--fg-secondary)' }}>
                      <TypingDots />{activity && <span>Looking at {activity}…</span>}
                    </div>
                  </div>
              )}
              {streaming && streamText && activity && <p className="text-xs ml-11" style={{ color: 'var(--fg-muted)' }}>Looking at {activity}…</p>}

              {pending.length > 0 && (
                <div className="rounded-xl p-4 text-sm ml-11" style={{ border: '1px solid var(--accent)', background: 'var(--accent-dim)' }} role="alertdialog" aria-label="Approval needed">
                  <p className="font-semibold mb-2" style={{ color: 'var(--fg-primary)' }}>The agent wants to make {pending.length === 1 ? 'a change' : `${pending.length} changes`}:</p>
                  <ul className="list-disc pl-5 mb-3 space-y-1" style={{ color: 'var(--fg-secondary)' }}>{pending.map(p => <li key={p.toolUseId}>{p.description}</li>)}</ul>
                  <div className="flex gap-2">
                    <button className="btn-primary text-sm py-1.5 px-4" disabled={busy} onClick={() => resolve.mutate(true)}>{resolve.isPending && <Loader2 size={13} className="animate-spin" />} Approve</button>
                    <button className="btn-secondary text-sm py-1.5 px-4" disabled={busy} onClick={() => resolve.mutate(false)}>Reject</button>
                  </div>
                </div>
              )}
              {error && (
                <div className="rounded-xl p-3 text-sm ml-11 space-y-2" style={{ border: '1px solid #F8717166', color: 'var(--tone-red)' }} role="alert">
                  <p>{error.message}</p>
                  <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                    Your message is back in the box below so you can resend it.
                    {error.code && ['AI_NOT_CONFIGURED', 'AI_AUTH', 'AI_MODEL', 'AI_NETWORK', 'AI_BAD_REQUEST'].includes(error.code) && (
                      <> Check the AI setup in <Link to="/settings#ai" className="underline">Settings → AI</Link>, where “Test connection” shows exactly what fails.</>
                    )}
                  </p>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="p-3 sm:p-4" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="max-w-3xl mx-auto">
            {attachment && (
              <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 rounded-full text-xs" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                <Paperclip size={12} /> {attachment.name}
                <button onClick={() => setAttachment(null)} aria-label="Remove attached resume"><X size={12} /></button>
              </div>
            )}
            <div className="flex gap-2 items-end relative">
              <div className="relative">
                <button className="btn-secondary h-11 w-11 justify-center p-0 rounded-full" onClick={() => setAttachOpen(o => !o)} aria-label="Attach a resume" aria-expanded={attachOpen}>
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
                </button>
                {attachOpen && (
                  <div className="absolute bottom-12 left-0 w-64 rounded-xl p-2 shadow-xl z-20" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <p className="text-xs px-2 py-1" style={{ color: 'var(--fg-muted)' }}>Attach a resume for the AI to read</p>
                    <ul className="max-h-40 overflow-y-auto">
                      {resumes?.map(r => <li key={r.id}><button className="w-full text-left px-2 py-1.5 rounded-lg text-sm truncate hover:bg-[var(--bg-hover)]" style={{ color: 'var(--fg-primary)' }} onClick={() => { setAttachment({ id: r.id, name: r.name }); setAttachOpen(false); }}>{r.name}</button></li>)}
                    </ul>
                    <button className="w-full text-left px-2 py-1.5 rounded-lg text-sm flex items-center gap-2 hover:bg-[var(--bg-hover)]" style={{ color: 'var(--accent)' }} onClick={() => fileRef.current?.click()}><Plus size={14} /> Upload a new file</button>
                    <input ref={fileRef} type="file" accept=".pdf,.docx" className="hidden" onChange={e => { attachFile(e.target.files?.[0]); e.target.value = ''; }} />
                  </div>
                )}
              </div>
              <label htmlFor="chat-input" className="sr-only">Message CareerOS AI</label>
              <textarea id="chat-input" ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey}
                placeholder={pending.length ? 'Approve or reject the pending change first…' : 'Ask anything about your job search…'}
                className="input flex-1 resize-none leading-relaxed" rows={1} style={{ minHeight: 44 }} disabled={pending.length > 0} maxLength={8000} />
              {streaming ? (
                <button onClick={() => abortRef.current?.abort()} className="btn-primary h-11 w-11 justify-center p-0 shrink-0 rounded-full" aria-label="Stop generating"><Square size={14} fill="currentColor" /></button>
              ) : (
                <button onClick={() => send(input)} disabled={!input.trim() || busy || pending.length > 0} className="btn-primary h-11 w-11 justify-center p-0 shrink-0 rounded-full" aria-label="Send message"><Send size={18} /></button>
              )}
            </div>
            <p className="text-[11px] mt-2 text-center" style={{ color: 'var(--fg-muted)' }}>AI can make mistakes. Check important details before acting on them.</p>
          </div>
        </div>
      </section>
      <CareerToolsModal open={toolsOpen} onClose={() => setToolsOpen(false)} />
    </div>
  );
}

function Avatar({ assistant }: { assistant?: boolean }) {
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: assistant ? 'var(--accent)' : 'var(--bg-hover)' }} aria-hidden>
      {assistant ? <Brain size={16} className="text-on-accent" /> : <User size={16} style={{ color: 'var(--fg-secondary)' }} />}
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1" aria-hidden>
      {[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--accent)', animationDelay: `${i * 0.15}s` }} />)}
    </span>
  );
}

function Bubble({ m }: { m: Message }) {
  const user = m.role === 'user';
  return (
    <div className={`flex gap-3 ${user ? 'flex-row-reverse' : ''}`}>
      <Avatar assistant={!user} />
      <div className="px-4 py-3 text-sm leading-relaxed max-w-[85%] min-w-0"
        style={{ background: user ? 'var(--accent)' : 'var(--bg-hover)', color: user ? 'var(--accent-fg)' : 'var(--fg-primary)', borderRadius: user ? '18px 4px 18px 18px' : '4px 18px 18px 18px' }}>
        {user ? <p className="whitespace-pre-wrap break-words">{m.content}</p> : (
          <div className="md break-words"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ node: _n, ...p }) => <a {...p} target="_blank" rel="noopener noreferrer" /> }}>{m.content}</ReactMarkdown></div>
        )}
        {!user && m.tools && m.tools.length > 0 && (
          <p className="text-xs mt-2" style={{ color: 'var(--fg-muted)' }}><Sparkles size={11} className="inline mr-1" />Used: {m.tools.map(t => TOOL_LABEL[t] ?? t).join(', ')}</p>
        )}
      </div>
    </div>
  );
}
