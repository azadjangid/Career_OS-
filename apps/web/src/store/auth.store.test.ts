import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from './auth.store';

describe('auth store', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().logout();
  });

  it('never writes the access token to localStorage', () => {
    useAuthStore.getState().login({ id: 'u1', email: 'a@b.c', name: 'A', role: 'USER' }, 'secret-access-token');
    const saved = localStorage.getItem('careeros-auth') ?? '';
    expect(saved).toContain('a@b.c');
    expect(saved).not.toContain('secret-access-token');
    expect(useAuthStore.getState().accessToken).toBe('secret-access-token');
  });

  it('clears everything on logout', () => {
    useAuthStore.getState().login({ id: 'u1', email: 'a@b.c', name: 'A', role: 'USER' }, 't');
    useAuthStore.getState().logout();
    expect(useAuthStore.getState()).toMatchObject({ user: null, accessToken: null, isAuthenticated: false });
  });
});
