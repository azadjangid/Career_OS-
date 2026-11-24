import axios, { AxiosError } from 'axios';
import { useAuthStore } from '@/store/auth.store';
import { endSession, refreshAccessToken } from '@/lib/session';

const BASE_URL = import.meta.env['VITE_API_URL'] ?? '/api';

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token to every request
api.interceptors.request.use(config => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, get a new access token once and retry the request
api.interceptors.response.use(
  res => res,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    const isAuthCall = original?.url?.startsWith('/auth/');
    if (error.response?.status !== 401 || !original || original._retry || isAuthCall) return Promise.reject(error);

    original._retry = true;
    const token = await refreshAccessToken();
    if (!token) {
      endSession();
      return Promise.reject(error);
    }
    original.headers = original.headers ?? {};
    original.headers['Authorization'] = `Bearer ${token}`;
    return api(original);
  }
);

/** Downloads a file from an authenticated endpoint (plain links can't send the Authorization header). */
export async function downloadFromApi(path: string, fallbackName: string): Promise<void> {
  const res = await api.get(path, { responseType: 'blob' });
  const disposition = String(res.headers['content-disposition'] ?? '');
  const name = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
