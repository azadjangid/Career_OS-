import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../config/logger';
import { NVIDIA_MODELS, ANTHROPIC_MODELS } from './aiPrefs';

/**
 * One interface over two providers. Transcripts are always stored in Anthropic's message shape
 * (text / tool_use / tool_result blocks); the NVIDIA path converts to and from OpenAI's format,
 * so the agent loop, approvals and saved chats are identical for both.
 *
 * Reliability rules:
 * - Every provider failure is turned into an AppError with a stable `code` and a message that says
 *   what to fix. Nothing is swallowed: callers log it, the user sees the reason.
 * - Transient failures (429, 5xx, overloaded, network, timeout) are retried with exponential backoff
 *   and jitter, but never after text has been streamed to the user (that would duplicate output).
 * - If AI_FALLBACK_PROVIDER is set and has a key, a request that still fails for a transient reason
 *   is tried once on the other provider with its default model.
 */
export type Provider = 'anthropic' | 'nvidia';

export interface LLMRequest {
  system: string;
  messages: Anthropic.MessageParam[];
  tools?: Anthropic.Tool[];
  model: string;
  maxTokens: number;
  onText?: (delta: string) => void;
}

export interface LLMResult {
  content: Anthropic.ContentBlockParam[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal';
  inputTokens: number;
  outputTokens: number;
  provider: Provider;
  model: string;
  latencyMs: number;
  attempts: number;
}

// ── Configuration ───────────────────────────────────────────────────────────

const keyFor = (p: Provider) => (p === 'nvidia' ? env.NVIDIA_KEY : env.ANTHROPIC_KEY);
const keyVarFor = (p: Provider) => (p === 'nvidia' ? 'NVIDIA_API_KEY' : 'ANTHROPIC_API_KEY');
const defaultModelFor = (p: Provider) => (p === 'nvidia' ? env.NVIDIA_MODEL : env.AI_MODEL);

export const primaryProvider = (): Provider => env.AI_PROVIDER;
export function fallbackProvider(): Provider | null {
  const f = env.AI_FALLBACK_PROVIDER;
  if (f === 'none' || f === env.AI_PROVIDER || !keyFor(f)) return null;
  return f;
}

function notConfigured(p: Provider = primaryProvider()): AppError {
  const why = env.AI_KEY_MALFORMED && p === primaryProvider()
    ? `The ${keyVarFor(p)} in .env doesn't look like a real key (it should start with ${p === 'nvidia' ? 'nvapi-' : 'sk-ant-'}).`
    : `No ${keyVarFor(p)} is set.`;
  return new AppError(`AI is not configured. ${why} Add it to .env and restart the API.`, 503, 'AI_NOT_CONFIGURED');
}

export function assertConfigured(): void {
  if (!env.AI_KEY) throw notConfigured();
}

let anthropic: Anthropic | null = null;
let nvidia: OpenAI | null = null;

function anthropicClient(): Anthropic {
  if (!env.ANTHROPIC_KEY) throw notConfigured('anthropic');
  // SDK retries are off: retries happen in withRetry() so both providers behave the same and are logged
  return (anthropic ??= new Anthropic({
    apiKey: env.ANTHROPIC_KEY, timeout: env.AI_TIMEOUT_MS, maxRetries: 0,
    ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}),
  }));
}
function nvidiaClient(): OpenAI {
  if (!env.NVIDIA_KEY) throw notConfigured('nvidia');
  return (nvidia ??= new OpenAI({ apiKey: env.NVIDIA_KEY, baseURL: env.NVIDIA_BASE_URL, timeout: env.AI_TIMEOUT_MS, maxRetries: 0 }));
}

/** Tests swap base URLs between cases; this drops the cached clients. */
export function resetClients(): void {
  anthropic = null;
  nvidia = null;
  liveCache = null;
  coolDown.clear();
}

// ── Error classification ────────────────────────────────────────────────────

interface Classified { error: AppError; retryable: boolean; retryAfterMs?: number }

const providerLabel = (p: Provider) => (p === 'nvidia' ? 'NVIDIA' : 'Anthropic');

/** Turns any provider SDK error into a readable AppError with a stable code. */
export function classifyProviderError(e: unknown, p: Provider, model: string): Classified {
  if (e instanceof AppError) return { error: e, retryable: false };
  const name = providerLabel(p);
  const err = e as { status?: number; name?: string; code?: string; message?: string; headers?: Headers | Record<string, string>; cause?: { code?: string } };
  const header = (k: string) => {
    const h = err.headers;
    if (!h) return undefined;
    return typeof (h as Headers).get === 'function' ? (h as Headers).get(k) ?? undefined : (h as Record<string, string>)[k];
  };
  const retryAfter = Number(header('retry-after'));
  const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 20_000) : undefined;

  const isTimeout = err.name === 'APIConnectionTimeoutError' || err.code === 'ETIMEDOUT' || /timed? ?out/i.test(err.message ?? '');
  if (isTimeout) {
    return { retryable: true, error: new AppError(`${name} took too long to answer (over ${Math.round(env.AI_TIMEOUT_MS / 1000)}s). Try again, or pick a faster model in Settings.`, 504, 'AI_TIMEOUT') };
  }
  // Errors sent inside an already-open stream carry no HTTP status, only the error type in the message
  if (err.status === undefined && /overloaded/i.test(err.message ?? '')) {
    return { retryable: true, error: new AppError(`${name} is overloaded right now. Try again in a minute.`, 503, 'AI_OVERLOADED') };
  }
  const isConnection = e instanceof Anthropic.APIConnectionError || e instanceof OpenAI.APIConnectionError
    || (err.status === undefined && Boolean(err.cause?.code ?? (typeof err.code === 'string' && /^E[A-Z]+$/.test(err.code) ? err.code : undefined)));
  if (isConnection) {
    const cause = err.cause?.code ?? err.code;
    const hint = cause === 'ENOTFOUND' || cause === 'EAI_AGAIN'
      ? 'the server could not resolve its address (DNS or no internet)'
      : cause === 'ECONNREFUSED' ? 'the connection was refused'
      : cause && /CERT|SSL|TLS/i.test(cause) ? 'the TLS certificate check failed (a proxy or antivirus may be intercepting HTTPS)'
      : 'the network request failed';
    return { retryable: true, error: new AppError(`Can't reach ${name}: ${hint}. Check this server's internet connection, firewall or proxy.`, 502, 'AI_NETWORK') };
  }
  const s = err.status;
  if (s === undefined) {
    // Not a provider response at all (a bug or an unexpected stream shape): report it, don't retry
    return { retryable: false, error: new AppError(`The ${name} response could not be processed: ${String(err.message ?? e).slice(0, 200)}`, 502, 'AI_PROVIDER_ERROR') };
  }
  if (s === 401 || s === 403) return { retryable: false, error: new AppError(`${name} rejected the API key (HTTP ${s}). Check ${keyVarFor(p)} in .env.`, 502, 'AI_AUTH') };
  if (s === 404 || s === 410) return { retryable: false, error: new AppError(`${name} doesn't offer the model "${model}" (HTTP ${s}). Pick another model in Settings → AI.`, 502, 'AI_MODEL') };
  if (s === 429) return { retryable: true, retryAfterMs, error: new AppError(`${name} is rate-limiting requests. Wait a minute and try again.`, 429, 'AI_RATE_LIMIT') };
  if (s === 529 || s === 503) return { retryable: true, retryAfterMs, error: new AppError(`${name} is overloaded right now. Try again in a minute.`, 503, 'AI_OVERLOADED') };
  if (s >= 500) return { retryable: true, retryAfterMs, error: new AppError(`${name} had a server error (HTTP ${s}). Try again in a minute.`, 502, 'AI_PROVIDER_ERROR') };
  if (s === 400 || s === 422) {
    const msg = String(err.message ?? '').replace(/sk-ant-[\w-]+|nvapi-[\w-]+/g, '[key]').slice(0, 300);
    const tools = /tool/i.test(msg) ? ' This model may not support tools; pick another model in Settings → AI.' : '';
    return { retryable: false, error: new AppError(`${name} rejected the request: ${msg}${tools}`, 502, 'AI_BAD_REQUEST') };
  }
  return { retryable: false, error: new AppError(`${name} returned HTTP ${s}.`, 502, 'AI_PROVIDER_ERROR') };
}

// ── Retry with exponential backoff ──────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export const backoffMs = (attempt: number, retryAfterMs?: number) =>
  retryAfterMs ?? Math.min(8_000, env.AI_RETRY_BASE_MS * 2 ** attempt) + Math.floor(Math.random() * env.AI_RETRY_BASE_MS * 0.5);

async function withRetry(
  p: Provider,
  r: LLMRequest,
  once: (r: LLMRequest) => Promise<Omit<LLMResult, 'provider' | 'latencyMs' | 'attempts'>>,
): Promise<LLMResult> {
  let emitted = false;
  const req: LLMRequest = { ...r, onText: r.onText ? d => { emitted = true; r.onText!(d); } : undefined };
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    try {
      const out = await once(req);
      return { ...out, provider: p, latencyMs: Date.now() - started, attempts: attempt + 1 };
    } catch (e) {
      const c = classifyProviderError(e, p, req.model);
      const canRetry = c.retryable && !emitted && attempt < env.AI_MAX_RETRIES;
      logger.warn(
        { provider: p, model: req.model, attempt: attempt + 1, code: c.error.code, status: (e as { status?: number }).status, retrying: canRetry },
        `AI call failed: ${c.error.message}`,
      );
      if (!canRetry) throw Object.assign(c.error, { retryable: c.retryable && !emitted });
      await sleep(backoffMs(attempt, c.retryAfterMs));
    }
  }
}

// ── NVIDIA model availability ───────────────────────────────────────────────
// NVIDIA's free catalog changes constantly: models get retired (404/410), go busy (503) or hang.
// Keep a short-lived list of live models plus a cool-down list of models that just failed, and try
// the requested model first, then the known models in order.
let liveCache: { at: number; ids: Set<string> } | null = null;
const coolDown = new Map<string, number>();

async function liveNvidiaModels(): Promise<Set<string> | null> {
  if (liveCache && Date.now() - liveCache.at < 10 * 60_000) return liveCache.ids;
  try {
    const list = await nvidiaClient().models.list();
    const ids = new Set<string>();
    for await (const m of list) ids.add(m.id);
    liveCache = { at: Date.now(), ids };
    return ids;
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'Could not read the NVIDIA model list');
    return liveCache?.ids ?? null; // can't tell: don't filter
  }
}

async function nvidiaCandidates(requested: string): Promise<string[]> {
  const live = await liveNvidiaModels();
  const now = Date.now();
  const ordered = [...new Set([requested, ...Object.keys(NVIDIA_MODELS)])]
    .filter(m => !live || live.has(m))
    .filter(m => (coolDown.get(m) ?? 0) <= now);
  return ordered.length ? ordered : [requested];
}

// ── Anthropic ───────────────────────────────────────────────────────────────
// Current Opus/Sonnet models can decline a request for safety (stop_reason "refusal"); the
// server-side fallback re-runs it on the default fallback model inside the same call.
const SERVER_FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);

async function callAnthropicOnce(r: LLMRequest) {
  const client = anthropicClient();
  const base = {
    model: r.model, max_tokens: r.maxTokens, system: r.system, messages: r.messages,
    ...(r.tools?.length ? { tools: r.tools } : {}),
  };
  let m: Anthropic.Message;
  if (SERVER_FALLBACK_MODELS.has(r.model)) {
    const stream = client.beta.messages.stream({
      ...(base as unknown as Anthropic.Beta.MessageCreateParamsStreaming),
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    if (r.onText) stream.on('text', r.onText);
    m = (await stream.finalMessage()) as unknown as Anthropic.Message;
  } else {
    const stream = client.messages.stream(base);
    if (r.onText) stream.on('text', r.onText);
    m = await stream.finalMessage();
  }
  const stop = m.stop_reason;
  return {
    // Keep thinking/fallback blocks so the transcript stays append-only for Claude
    content: m.content as unknown as Anthropic.ContentBlockParam[],
    stopReason: (stop === 'tool_use' ? 'tool_use' : stop === 'max_tokens' ? 'max_tokens' : stop === 'refusal' ? 'refusal' : 'end_turn') as LLMResult['stopReason'],
    inputTokens: m.usage.input_tokens,
    outputTokens: m.usage.output_tokens,
    model: m.model ?? r.model,
  };
}

// ── NVIDIA NIM (OpenAI-compatible) ─────────────────────────────────────────
type OAIMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export function toOpenAIMessages(system: string, messages: Anthropic.MessageParam[]): OAIMessage[] {
  const out: OAIMessage[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (typeof m.content === 'string') {
      if ((m.role === 'user' || m.role === 'assistant') && m.content.trim()) out.push({ role: m.role, content: m.content });
      continue;
    }
    if (m.role === 'assistant') {
      const text = m.content.filter((b): b is Anthropic.TextBlockParam => b.type === 'text').map(b => b.text).join('\n');
      const calls = m.content
        .filter((b): b is Anthropic.ToolUseBlockParam => b.type === 'tool_use')
        .map(b => ({ id: b.id, type: 'function' as const, function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      if (!text && !calls.length) continue; // empty turns are rejected by most OpenAI-compatible servers
      out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else if (m.role === 'user') {
      for (const b of m.content) {
        if (b.type === 'tool_result') {
          const c = typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? '');
          out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: c });
        } else if (b.type === 'text') out.push({ role: 'user', content: b.text });
      }
    }
  }
  return out;
}

async function callNvidiaOnce(r: LLMRequest) {
  const stream = await nvidiaClient().chat.completions.create({
    model: r.model,
    max_tokens: Math.min(r.maxTokens, 4096),
    messages: toOpenAIMessages(r.system, r.messages),
    ...(r.tools?.length
      ? { tools: r.tools.map(t => ({ type: 'function' as const, function: { name: t.name, description: t.description ?? '', parameters: t.input_schema as Record<string, unknown> } })) }
      : {}),
    stream: true,
    stream_options: { include_usage: true },
  });

  let text = '';
  let finish: string | null = null;
  let inTok = 0, outTok = 0;
  const calls = new Map<number, { id: string; name: string; args: string }>();

  for await (const chunk of stream) {
    if (chunk.usage) { inTok = chunk.usage.prompt_tokens ?? 0; outTok = chunk.usage.completion_tokens ?? 0; }
    const choice = chunk.choices?.[0];
    if (!choice) continue;
    if (choice.delta?.content) { text += choice.delta.content; r.onText?.(choice.delta.content); }
    for (const tc of choice.delta?.tool_calls ?? []) {
      const cur = calls.get(tc.index) ?? { id: '', name: '', args: '' };
      if (tc.id) cur.id = tc.id;
      if (tc.function?.name) cur.name += tc.function.name;
      if (tc.function?.arguments) cur.args += tc.function.arguments;
      calls.set(tc.index, cur);
    }
    if (choice.finish_reason) finish = choice.finish_reason;
  }

  const content: Anthropic.ContentBlockParam[] = [];
  if (text) content.push({ type: 'text', text });
  for (const [i, c] of [...calls.entries()].sort((a, b) => a[0] - b[0])) {
    let input: Record<string, unknown> = {};
    try { input = c.args ? (JSON.parse(c.args) as Record<string, unknown>) : {}; } catch { /* malformed args → the tool's schema check returns a validation error to the model */ }
    content.push({ type: 'tool_use', id: c.id || `call_${Date.now()}_${i}`, name: c.name, input });
  }
  const hasTools = content.some(b => b.type === 'tool_use');
  return {
    content,
    stopReason: (hasTools ? 'tool_use' : finish === 'length' ? 'max_tokens' : 'end_turn') as LLMResult['stopReason'],
    inputTokens: inTok,
    outputTokens: outTok,
    model: r.model,
  };
}

/** Tries the requested NVIDIA model, then the other known models when one is retired or busy. */
async function callNvidia(r: LLMRequest): Promise<LLMResult> {
  let last: AppError | null = null;
  const tried: string[] = [];
  for (const model of await nvidiaCandidates(r.model)) {
    try {
      const out = await withRetry('nvidia', { ...r, model }, callNvidiaOnce);
      if (model !== r.model) logger.warn({ requested: r.model, used: model }, 'NVIDIA model fallback used');
      return out;
    } catch (e) {
      const err = e as AppError & { retryable?: boolean };
      tried.push(model);
      last = err;
      // Only a missing/busy model moves on to the next model; auth, network and bad requests won't get better
      if (err.code !== 'AI_MODEL' && err.code !== 'AI_OVERLOADED' && err.code !== 'AI_TIMEOUT') throw err;
      coolDown.set(model, Date.now() + (err.code === 'AI_MODEL' ? 30 * 60_000 : 2 * 60_000));
      liveCache = null;
    }
  }
  throw Object.assign(
    new AppError(`No NVIDIA model answered (tried ${tried.join(', ')}). ${last?.message ?? ''}`.trim(), 503, 'AI_MODELS_UNAVAILABLE'),
    { retryable: true },
  );
}

const callProvider = (p: Provider, r: LLMRequest) => (p === 'nvidia' ? callNvidia(r) : withRetry('anthropic', r, callAnthropicOnce));

// ── Public entry point ──────────────────────────────────────────────────────

export async function callLLM(r: LLMRequest): Promise<LLMResult> {
  const primary = primaryProvider();
  if (!keyFor(primary)) throw notConfigured(primary);
  let emitted = false;
  const req: LLMRequest = { ...r, onText: r.onText ? d => { emitted = true; r.onText!(d); } : undefined };
  try {
    return await callProvider(primary, req);
  } catch (e) {
    const err = e as AppError & { retryable?: boolean };
    const fb = fallbackProvider();
    // Fall back only for outages (not auth/model/bad request problems) and only before any text streamed
    if (!fb || emitted || !err.retryable) throw err;
    logger.warn({ from: primary, to: fb, code: err.code }, 'AI provider fallback used');
    return callProvider(fb, { ...req, model: defaultModelFor(fb) });
  }
}

// ── Health ──────────────────────────────────────────────────────────────────

export interface ProviderHealth {
  provider: Provider;
  configured: boolean;
  keyVar: string;
  keyProblem: string | null;
  model: string;
  knownModel: boolean;
  fallback: Provider | null;
  lastSuccessAt: string | null;
  lastError: { code: string; message: string; at: string } | null;
}

const lastStatus: { ok: string | null; error: ProviderHealth['lastError'] } = { ok: null, error: null };
export function recordOutcome(ok: boolean, err?: AppError): void {
  if (ok) { lastStatus.ok = new Date().toISOString(); lastStatus.error = null; }
  else if (err) lastStatus.error = { code: err.code ?? 'ERROR', message: err.message, at: new Date().toISOString() };
}

export function providerHealth(): ProviderHealth {
  const p = primaryProvider();
  const model = defaultModelFor(p);
  return {
    provider: p,
    configured: Boolean(keyFor(p)),
    keyVar: keyVarFor(p),
    keyProblem: keyFor(p) ? null : notConfigured(p).message,
    model,
    knownModel: model in (p === 'nvidia' ? NVIDIA_MODELS : ANTHROPIC_MODELS),
    fallback: fallbackProvider(),
    lastSuccessAt: lastStatus.ok,
    lastError: lastStatus.error,
  };
}

/** Makes one tiny real request to prove the key, model and network all work. */
export async function testConnection(model?: string): Promise<{ ok: true; provider: Provider; model: string; latencyMs: number } | { ok: false; code: string; message: string }> {
  try {
    const r = await callLLM({
      model: model ?? defaultModelFor(primaryProvider()),
      maxTokens: 64,
      system: 'You are a connectivity check. Reply with the single word OK.',
      messages: [{ role: 'user', content: 'ping' }],
    });
    recordOutcome(true);
    return { ok: true, provider: r.provider, model: r.model, latencyMs: r.latencyMs };
  } catch (e) {
    const err = e instanceof AppError ? e : classifyProviderError(e, primaryProvider(), model ?? '').error;
    recordOutcome(false, err);
    return { ok: false, code: err.code ?? 'ERROR', message: err.message };
  }
}
