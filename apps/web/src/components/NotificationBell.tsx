import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';

interface Notification { id: string; title: string; body: string; read: boolean; createdAt: string }

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: count = 0 } = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: async () => (await api.get('/notifications/unread-count')).data.data.count as number,
    refetchInterval: 60_000,
  });
  const { data: list } = useQuery({
    queryKey: ['notifications', 'list'],
    enabled: open,
    queryFn: async () => (await api.get('/notifications', { params: { limit: 10 } })).data.data.notifications as Notification[],
  });
  const markAll = useMutation({
    mutationFn: () => api.put('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)} className="btn-ghost p-2 relative"
        aria-label={count ? `Notifications, ${count} unread` : 'Notifications'} aria-expanded={open} aria-haspopup="true"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-on-accent" style={{ background: 'var(--accent)' }}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-xl shadow-xl z-50 overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="font-medium text-sm" style={{ color: 'var(--fg-primary)' }}>Notifications</p>
            {count > 0 && (
              <button onClick={() => markAll.mutate()} className="text-xs flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {!list?.length && <li className="px-4 py-8 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>You’re all caught up</li>}
            {list?.map(n => (
              <li key={n.id} className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)', background: n.read ? 'transparent' : 'var(--accent-dim)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--fg-primary)' }}>{n.title}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--fg-secondary)' }}>{n.body}</p>
                <p className="text-[11px] mt-1" style={{ color: 'var(--fg-muted)' }}>{timeAgo(n.createdAt)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
