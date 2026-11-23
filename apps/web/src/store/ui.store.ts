import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'dark' | 'light' | 'system';
export type QuickAction = 'application' | 'job' | 'resume' | null;

interface UIState {
  sidebarOpen: boolean;
  theme: Theme;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  quickMenuOpen: boolean;
  quickAction: QuickAction;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setTheme: (theme: Theme) => void;
  setPaletteOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setQuickMenuOpen: (open: boolean) => void;
  setQuickAction: (a: QuickAction) => void;
}

const isDesktop = () => typeof window !== 'undefined' && window.innerWidth >= 1024;

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Open by default on desktop, closed (hamburger menu) on phones/tablets
      sidebarOpen: isDesktop(),
      theme: 'dark',
      paletteOpen: false,
      shortcutsOpen: false,
      quickMenuOpen: false,
      quickAction: null,

      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
      setTheme: (theme) => {
        set({ theme });
        const root = document.documentElement;
        if (theme === 'system') root.removeAttribute('data-theme');
        else root.setAttribute('data-theme', theme);
      },
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
      setQuickMenuOpen: (quickMenuOpen) => set({ quickMenuOpen }),
      setQuickAction: (quickAction) => set({ quickAction, quickMenuOpen: false }),
    }),
    {
      name: 'careeros-ui',
      partialize: (s) => ({ theme: s.theme }),
    },
  ),
);
