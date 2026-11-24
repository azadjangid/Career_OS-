import { useAuthStore } from '@/store/auth.store';
import { endSession, refreshAccessToken } from '@/lib/session';

const BASE_URL = import.meta.env['VITE_API_URL'] ?? '/api';

export interface StreamHandlers {
  onText: (delta: string) => void;
  onTool: (name: string) => void;
}

export class StreamError extends Error {
  constructor(message: string, public status?: number, public code?: string) { super(message); }
}

async function post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${useAuthStore.getState().accessToken ?? ''}` },
    body: JSON.stringify(body),
  });
}

/**
 * POST that answers with Server-Sent Events. Resolves with the payload of the final `done` event.
 * Retries once after refreshing the access token on 401 (axios interceptors don't cover fetch).
 */
export async function streamPost<T>(path: string, body: unknown, h: StreamHandlers, signal?: AbortSignal): Promise<T> {
  let res = await post(path, body, signal);
  if (res.status === 401) {
    const token = await refreshAccessToken();
    if (!token) {
      endSession();
      throw new StreamError('Session expired', 401);
    }
    res = await post(path, body, signal);
  }

  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => null) as { error?: { message?: string; code?: string } } | null;
    throw new StreamError(j?.error?.message ?? `Request failed (HTTP ${res.status})`, res.status, j?.error?.code);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: T | undefined;

  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new StreamError('The connection to the server dropped while the answer was streaming. Check your connection and try again.', undefined, 'STREAM_DISCONNECTED');
    }
    const { done, value } = chunk;
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const dataLine = /^data: (.*)$/m.exec(block)?.[1];
      if (!event || !dataLine) continue;
      const data = JSON.parse(dataLine);
      if (event === 'text') h.onText(data.delta as string);
      else if (event === 'tool') h.onTool(data.name as string);
      else if (event === 'error') throw new StreamError(data.message as string, undefined, data.code as string | undefined);
      else if (event === 'done') result = data as T;
    }
  }
  if (!result) throw new StreamError('The response ended unexpectedly. Please try again.');
  return result;
}
