import { Menu, Sun, Moon, Search, Keyboard } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { useLocation } from 'react-router-dom';
import NotificationBell from '@/components/NotificationBell';

export const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/jobs': 'Job Discovery',
  '/applications': 'Applications',
  '/resumes': 'Resume Manager',
  '/ai': 'AI Career Agent',
  '/analytics': 'Analytics',
  '/profile': 'Profile',
  '/settings': 'Settings',
};

export default function Topbar() {
  const { toggleSidebar, theme, setTheme, setPaletteOpen, setShortcutsOpen } = useUIStore();
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] ?? 'CareerOS';
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

  return (
    <header
      className="flex items-center justify-between px-3 md:px-6 h-14 shrink-0 border-b gap-2"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <button onClick={toggleSidebar} className="btn-ghost p-2" aria-label="Toggle navigation menu">
          <Menu size={20} />
        </button>
        <h1 className="font-display font-semibold text-lg truncate" style={{ color: 'var(--fg-primary)' }}>{title}</h1>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => setPaletteOpen(true)}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
          style={{ background: 'var(--bg-hover)', color: 'var(--fg-muted)', border: '1px solid var(--border)' }}
          aria-label="Open command palette"
        >
          <Search size={14} /> Search… <kbd className="kbd">{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>
        <button onClick={() => setPaletteOpen(true)} className="btn-ghost p-2 sm:hidden" aria-label="Search">
          <Search size={18} />
        </button>
        <button onClick={() => setShortcutsOpen(true)} className="btn-ghost p-2 hidden md:inline-flex" aria-label="Keyboard shortcuts">
          <Keyboard size={18} />
        </button>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="btn-ghost p-2"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <NotificationBell />
      </div>
    </header>
  );
}
