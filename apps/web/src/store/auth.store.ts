import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerified?: boolean;
}

interface AuthState {
  user: User | null;
  /** Short-lived (15 min) and kept in memory only, never in localStorage, so a script injected
   *  into the page can't read a long-lived credential. The httpOnly refresh cookie restores it. */
  accessToken: string | null;
  isAuthenticated: boolean;
  setUser: (user: User) => void;
  setAccessToken: (token: string) => void;
  login: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,

      setUser: (user) => set({ user }),
      setAccessToken: (accessToken) => set({ accessToken }),

      login: (user, accessToken) =>
        set({ user, accessToken, isAuthenticated: true }),

      logout: () =>
        set({ user: null, accessToken: null, isAuthenticated: false }),
    }),
    {
      name: 'careeros-auth',
      version: 2,
      // Only who is signed in is remembered; the token is fetched again from the refresh cookie
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
      // Drop tokens saved by older versions of the app
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<AuthState>;
        return { user: p.user ?? null, isAuthenticated: Boolean(p.isAuthenticated) } as AuthState;
      },
    }
  )
);
