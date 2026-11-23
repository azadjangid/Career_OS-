import { NavLink } from 'react-router-dom';
import { useUIStore } from '@/store/ui.store';
import { useLogout } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/auth.store';
import AIUsageMeter from '@/components/AIUsageMeter';
import {
  LayoutDashboard, Briefcase, FileText, Brain, Send,
  BarChart3, Settings, User, LogOut, Zap, X
} from 'lucide-react';
import { clsx } from 'clsx';

// On phones the sidebar is an overlay, so close it after navigating
const closeOnMobile = () => { if (window.innerWidth < 1024) useUIStore.getState().setSidebarOpen(false); };

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/jobs', icon: Briefcase, label: 'Jobs' },
  { to: '/applications', icon: Send, label: 'Applications' },
  { to: '/resumes', icon: FileText, label: 'Resumes' },
  { to: '/ai', icon: Brain, label: 'AI Assistant' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
];

const BOTTOM_ITEMS = [
  { to: '/profile', icon: User, label: 'Profile' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const sidebarOpen = useUIStore(s => s.sidebarOpen);
  const { user } = useAuthStore();
  const logout = useLogout();

  return (
    <aside
      className={clsx(
        'fixed lg:relative inset-y-0 left-0 z-30 flex flex-col w-64 transition-transform duration-300',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden'
      )}
      style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}
    >
      {/* Brand */}
      <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent)' }}>
            <Zap size={16} className="text-white" />
          </div>
          <span className="font-display font-bold text-lg" style={{ color: 'var(--fg-primary)' }}>CareerOS</span>
        </div>
        <button
          onClick={() => useUIStore.getState().setSidebarOpen(false)}
          className="lg:hidden btn-ghost p-1"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" aria-label="Main">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={closeOnMobile}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group',
              isActive
                ? 'text-white'
                : 'hover:text-white'
            )}
            style={({ isActive }) => ({
              background: isActive ? 'var(--accent)' : 'transparent',
              color: isActive ? 'white' : 'var(--fg-secondary)',
            })}
            onMouseEnter={e => {
              if (!(e.currentTarget as HTMLElement).style.background.includes('var(--accent)')) {
                (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                (e.currentTarget as HTMLElement).style.color = 'var(--fg-primary)';
              }
            }}
            onMouseLeave={e => {
              if (!(e.currentTarget as HTMLElement).style.background.includes('var(--accent)')) {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
                (e.currentTarget as HTMLElement).style.color = 'var(--fg-secondary)';
              }
            }}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <AIUsageMeter />
      </div>

      {/* Bottom */}
      <div className="px-3 pb-4 space-y-0.5">
        {BOTTOM_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={closeOnMobile}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
            style={{ color: 'var(--fg-secondary)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--fg-primary)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--fg-secondary)'; }}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}

        {/* User + Logout */}
        <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: 'var(--accent)' }}>
              {user?.name?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--fg-primary)' }}>{user?.name}</p>
              <p className="text-xs truncate" style={{ color: 'var(--fg-muted)' }}>{user?.email}</p>
            </div>
            <button
              onClick={() => logout.mutate()}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--fg-muted)' }}
              title="Log out"
              aria-label="Log out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
