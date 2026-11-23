import type { LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Briefcase, FileText, Send, Settings, Search, Brain, BarChart3, LayoutDashboard, User, Plus, Moon, Keyboard } from 'lucide-react';
import { api } from '@/lib/api';
import { useUIStore } from '@/store/ui.store';

interface Item {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: LucideIcon;
  run: () => void;
}

/** Subsequence fuzzy match: "rzp" matches "Razorpay". Returns a score (lower = better) or null. */
function fuzzy(query: string, text: string): number | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  const direct = t.indexOf(q);
  if (direct >= 0) return direct; // substring hits rank first
  let ti = 0, gaps = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return null;
    gaps += found - ti;
    ti = found + 1;
  }
  return 100 + gaps;
}

export default function CommandPalette() {
  const { paletteOpen, setPaletteOpen, setShortcutsOpen, setQuickAction, setTheme, theme } = useUIStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (paletteOpen) { setQuery(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [paletteOpen]);

  // Server search for jobs / applications / resumes (debounced via key change + enabled flag)
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(query.trim()), 200); return () => clearTimeout(t); }, [query]);
  const { data: remote } = useQuery({
    queryKey: ['search', debounced],
    enabled: paletteOpen && debounced.length >= 2,
    queryFn: async () => (await api.get('/search', { params: { q: debounced } })).data.data as {
      jobs: Array<{ id: string; title: string; companyName: string }>;
      applications: Array<{ id: string; status: string; job: { title: string; companyName: string } }>;
      resumes: Array<{ id: string; name: string }>;
    },
  });

  const go = (to: string) => () => { setPaletteOpen(false); navigate(to); };

  const staticItems: Item[] = useMemo(() => [
    { id: 'p-dash', label: 'Dashboard', group: 'Pages', icon: LayoutDashboard, run: go('/dashboard') },
    { id: 'p-jobs', label: 'Jobs', group: 'Pages', icon: Briefcase, run: go('/jobs') },
    { id: 'p-apps', label: 'Applications', group: 'Pages', icon: Send, run: go('/applications') },
    { id: 'p-res', label: 'Resumes', group: 'Pages', icon: FileText, run: go('/resumes') },
    { id: 'p-ai', label: 'AI Assistant', group: 'Pages', icon: Brain, run: go('/ai') },
    { id: 'p-an', label: 'Analytics', group: 'Pages', icon: BarChart3, run: go('/analytics') },
    { id: 'p-prof', label: 'Profile', group: 'Pages', icon: User, run: go('/profile') },
    { id: 's-set', label: 'Settings', hint: 'Account, privacy, API key', group: 'Settings', icon: Settings, run: go('/settings') },
    { id: 's-theme', label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', group: 'Settings', icon: Moon, run: () => { setTheme(theme === 'dark' ? 'light' : 'dark'); setPaletteOpen(false); } },
    { id: 's-keys', label: 'Keyboard shortcuts', group: 'Settings', icon: Keyboard, run: () => { setPaletteOpen(false); setShortcutsOpen(true); } },
    { id: 'a-app', label: 'Add application', group: 'Actions', icon: Plus, run: () => { setPaletteOpen(false); setQuickAction('application'); } },
    { id: 'a-job', label: 'Save a job', group: 'Actions', icon: Plus, run: () => { setPaletteOpen(false); setQuickAction('job'); } },
    { id: 'a-res', label: 'Upload resume', group: 'Actions', icon: Plus, run: () => { setPaletteOpen(false); setQuickAction('resume'); } },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [theme]);

  const items: Item[] = useMemo(() => {
    const dynamic: Item[] = [
      ...(remote?.jobs ?? []).map(j => ({ id: `j-${j.id}`, label: j.title, hint: j.companyName, group: 'Jobs', icon: Briefcase, run: go(`/jobs?q=${encodeURIComponent(j.title)}`) })),
      ...(remote?.applications ?? []).map(a => ({ id: `a-${a.id}`, label: a.job.title, hint: `${a.job.companyName} · application`, group: 'Applications', icon: Send, run: go(`/applications?open=${a.id}`) })),
      ...(remote?.resumes ?? []).map(r => ({ id: `r-${r.id}`, label: r.name, hint: 'Resume', group: 'Resumes', icon: FileText, run: go(`/resumes?open=${r.id}`) })),
    ];
    const scored = [...staticItems, ...dynamic]
      .map(it => ({ it, s: fuzzy(query, `${it.label} ${it.hint ?? ''}`) }))
      .filter((x): x is { it: Item; s: number } => x.s !== null);
    return query ? scored.sort((a, b) => a.s - b.s).slice(0, 14).map(x => x.it) : scored.map(x => x.it);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, remote, staticItems]);

  useEffect(() => setActive(0), [query]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); items[active]?.run(); }
    else if (e.key === 'Escape') setPaletteOpen(false);
  };

  useEffect(() => {
    document.getElementById(`cmd-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  let lastGroup = '';
  return (
    <AnimatePresence>
      {paletteOpen && (
        <motion.div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setPaletteOpen(false)} aria-hidden />
          <motion.div
            initial={{ y: -12, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -12, opacity: 0 }}
            role="dialog" aria-modal="true" aria-label="Command palette"
            className="relative w-full max-w-xl rounded-2xl overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <Search size={18} style={{ color: 'var(--fg-muted)' }} aria-hidden />
              <input
                ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKey}
                placeholder="Search jobs, applications, resumes, settings…"
                className="flex-1 bg-transparent outline-none text-sm" style={{ color: 'var(--fg-primary)' }}
                role="combobox" aria-expanded="true" aria-controls="cmd-list" aria-activedescendant={`cmd-${active}`}
                aria-label="Search"
              />
              <span className="kbd">Esc</span>
            </div>
            <ul id="cmd-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
              {items.length === 0 && <li className="px-3 py-8 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>No results for “{query}”</li>}
              {items.map((it, i) => {
                const header = it.group !== lastGroup ? it.group : null;
                lastGroup = it.group;
                const Icon = it.icon;
                return (
                  <li key={it.id} role="presentation">
                    {header && <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide" style={{ color: 'var(--fg-muted)' }}>{header}</p>}
                    <button
                      id={`cmd-${i}`} role="option" aria-selected={i === active}
                      onClick={it.run} onMouseMove={() => setActive(i)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm"
                      style={{ background: i === active ? 'var(--accent-dim)' : 'transparent', color: i === active ? 'var(--accent)' : 'var(--fg-primary)' }}
                    >
                      <Icon size={16} />
                      <span className="flex-1 truncate">{it.label}</span>
                      {it.hint && <span className="text-xs truncate max-w-[40%]" style={{ color: 'var(--fg-muted)' }}>{it.hint}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
