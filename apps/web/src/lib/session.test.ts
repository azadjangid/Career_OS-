import { afterEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { refreshAccessToken } from './session';
import { useAuthStore } from '@/store/auth.store';

afterEach(() => vi.restoreAllMocks());

describe('refreshAccessToken', () => {
  it('shares one refresh request between concurrent callers', async () => {
    const post = vi.spyOn(axios, 'post').mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ data: { data: { accessToken: 'fresh' } } }), 10)),
    );
    const [a, b, c] = await Promise.all([refreshAccessToken(), refreshAccessToken(), refreshAccessToken()]);
    expect([a, b, c]).toEqual(['fresh', 'fresh', 'fresh']);
    expect(post).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().accessToken).toBe('fresh');
  });

  it('resolves null when the session has ended', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('401'));
    expect(await refreshAccessToken()).toBeNull();
  });
});
