import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '@/store/ui.store';

const GO: Record<string, string> = {
  d: '/dashboard', j: '/jobs', a: '/applications', r: '/resumes', i: '/ai', n: '/analytics', s: '/settings',
};

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

/** Ctrl/⌘+K palette, "?" help, "g then <letter>" navigation and "n" for new application. */
export function useGlobalShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    let gPending = false;
    let timer: ReturnType<typeof setTimeout>;

    const onKey = (e: KeyboardEvent) => {
      const ui = useUIStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.setPaletteOpen(!ui.paletteOpen);
        return;
      }
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();

      if (gPending) {
        gPending = false;
        clearTimeout(timer);
        if (GO[k]) { e.preventDefault(); navigate(GO[k]!); }
        return;
      }
      if (e.key === '?') { e.preventDefault(); ui.setShortcutsOpen(true); }
      else if (k === 'g') { gPending = true; timer = setTimeout(() => (gPending = false), 1200); }
      else if (k === 'n') { e.preventDefault(); ui.setQuickAction('application'); }
    };

    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(timer); };
  }, [navigate]);
}
