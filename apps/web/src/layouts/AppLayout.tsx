import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import CommandPalette from '@/components/CommandPalette';
import ShortcutsModal from '@/components/ShortcutsModal';
import QuickActions from '@/components/QuickActions';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { useUIStore } from '@/store/ui.store';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import { useOnboarding } from '@/hooks/useOnboarding';

export default function AppLayout() {
  const sidebarOpen = useUIStore(s => s.sidebarOpen);
  const location = useLocation();
  const { needsOnboarding } = useOnboarding();
  useGlobalShortcuts();

  // First-time users go through the onboarding wizard once
  if (needsOnboarding && location.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:p-3 focus:bg-black focus:text-white">Skip to content</a>
      <Sidebar />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-20 lg:hidden" onClick={() => useUIStore.getState().setSidebarOpen(false)} aria-hidden />
      )}

      <div className="flex flex-col flex-1 min-w-0">
        <Topbar />
        <main id="main" className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          <ErrorBoundary resetKey={location.pathname}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </ErrorBoundary>
        </main>
      </div>

      <CommandPalette />
      <ShortcutsModal />
      <QuickActions />
    </div>
  );
}
