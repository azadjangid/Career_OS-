import { useCallback, useSyncExternalStore } from 'react';
import { useAuthStore } from '@/store/auth.store';

/**
 * Onboarding completion lives in localStorage (per user id) so it is instant and works offline.
 * 'done'    = finished the wizard
 * 'skipped' = chose "skip for now" (no redirect, but the dashboard banner keeps nudging)
 */
type OnboardingState = 'done' | 'skipped' | null;

const key = (userId: string) => `careeros-onboarding:${userId}`;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

function read(userId?: string): OnboardingState {
  if (!userId) return 'done';
  try {
    const v = localStorage.getItem(key(userId));
    return v === 'done' || v === 'skipped' ? v : null;
  } catch {
    return 'done'; // storage blocked: never trap the user in the wizard
  }
}

export function useOnboarding() {
  const userId = useAuthStore(s => s.user?.id);
  const state = useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => read(userId),
  );

  const set = useCallback((v: Exclude<OnboardingState, null>) => {
    if (!userId) return;
    try { localStorage.setItem(key(userId), v); } catch { /* ignore */ }
    emit();
  }, [userId]);

  return { state, needsOnboarding: state === null, complete: () => set('done'), skip: () => set('skipped') };
}
