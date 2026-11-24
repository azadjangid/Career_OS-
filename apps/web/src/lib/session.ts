import axios from 'axios';
import { useAuthStore } from '@/store/auth.store';

const BASE_URL = import.meta.env['VITE_API_URL'] ?? '/api';

let inFlight: Promise<string | null> | null = null;

/**
 * Gets a fresh access token from the httpOnly refresh cookie. Concurrent callers share one
 * request, because the server rotates the refresh token and a second parallel refresh would
 * look like token theft. Resolves null when the session is over.
 */
export function refreshAccessToken(): Promise<string | null> {
  inFlight ??= axios
    .post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true })
    .then(({ data }) => {
      const token = data.data.accessToken as string;
      useAuthStore.getState().setAccessToken(token);
      return token;
    })
    .catch(() => null)
    .finally(() => { inFlight = null; });
  return inFlight;
}

/** Ends the local session and sends the user to the sign-in page. */
export function endSession(): void {
  useAuthStore.getState().logout();
  if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
}
