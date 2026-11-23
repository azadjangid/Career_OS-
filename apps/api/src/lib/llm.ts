import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../config/logger';

/**
 * One interface over two providers. Transcripts are always stored in Anthropic's message shape
 * (text / tool_use / tool_result blocks); the NVIDIA path converts to and from OpenAI's format,
 * so the agent loop, approvals and saved chats are identical for both.
 */
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
}

const NOT_CONFIGURED = () =>
  new AppError(
    env.AI_PROVIDER === 'nvidia'
      ? 'AI is not configured. Add your NVIDIA key (nvapi-…) as NVIDIA_API_KEY in .env and restart the API.'
      : 'AI is not configured. Add a valid Anthropic key (sk-ant-…) as ANTHROPIC_API_KEY in .env and restart the API.',
    503,
    'AI_NOT_CONFIGURED',
  );

let anthropic: Anthropic | null = null;
let nvidia: OpenAI | null = null;

function anthropicClient(): Anthropic {
  if (!env.AI_KEY) throw NOT_CONFIGURED();
  return (anthropic ??= new Anthropic({ apiKey: env.AI_KEY }));
}
function nvidiaClient(): OpenAI {
  if (!env.AI_KEY) throw NOT_CONFIGURED();
  // Fail fast (45s, no SDK retries): a slow or dead model should trigger our own fallback instead
  return (nvidia ??= new OpenAI({ apiKey: env.AI_KEY, baseURL: env.NVIDIA_BASE_URL, timeout: 45_000, maxRetries: 0 }));
}

// ── NVIDIA model availability ───────────────────────────────────────────────
// NVIDIA's free catalog changes constantly: models get retired (404/410), go busy (503) or hang.
// We keep a short-lived list of live models plus a cool-down list of models that just failed, and
// try the requested model first, then these fallbacks in order.
const NVIDIA_FALLBACKS = [
  'nvidia/nemotron-3-super-120b-a12b',
  'nvidia/nemotron-3-ultra-550b-a55b',
  'nvidia/nemotron-3.5-lightning-30b-a3b',
  'deepseek-ai/deepseek-v4.1-flash',
];
let liveCache: { at: number; ids: Set<string> } | null = null;
const coolDown = new Map<string, number>(); // model -> usable again at (ms epoch)

async function liveNvidiaModels(): Promise<Set<string> | null> {
  if (liveCache && Date.now() - liveCache.at < 10 * 60_000) return liveCache.ids;
  try {
    const list = await nvidiaClient().models.list();
    const ids = new Set<string>();
    for await (const m of list) ids.add(m.id);
    liveCache = { at: Date.now(), ids };
    return ids;
  } catch {
    return liveCache?.ids ?? null; // can't tell: don't filter
  }
}

async function nvidiaCandidates(requested: string): Promise<string[]> {
  const live = await liveNvidiaModels();
  const now = Date.now();
  const ordered = [...new Set([requested, ...NVIDIA_FALLBACKS])]
    .filter(m => !live || live.has(m))
    .filter(m => (coolDown.get(m) ?? 0) <= now);
  // If everything is cooling down, still try the requested model rather than failing outright
  return ordered.length ? ordered : [requested];
}

const isUnavailable = (e: unknown): boolean => {
  const err = e as { status?: number; name?: string; code?: string };
  return err.status === 404 || err.status === 410 || err.status === 503 || err.status === 502
    || err.name === 'APIConnectionTimeoutError' || err.code === 'ETIMEDOUT';
};

export function assertConfigured(): void {
  if (!env.AI_KEY) throw NOT_CONFIGURED();
}

// ── Anthropic ───────────────────────────────────────────────────────────────
async function callAnthropic(r: LLMRequest): Promise<LLMResult> {
  const stream = anthropicClient().messages.stream({
    model: r.model, max_tokens: r.maxTokens, system: r.system, messages: r.messages,
    ...(r.tools?.length ? { tools: r.tools } : {}),
  });
  if (r.onText) stream.on('text', r.onText);
  const m = await stream.finalMessage();
  const stop = m.stop_reason;
  return {
    // Keep thinking blocks etc. so the transcript stays append-only for Claude
    content: m.content as Anthropic.ContentBlockParam[],
    stopReason: stop === 'tool_use' ? 'tool_use' : stop === 'max_tokens' ? 'max_tokens' : stop === 'refusal' ? 'refusal' : 'end_turn',
    inputTokens: m.usage.input_tokens,
    outputTokens: m.usage.output_tokens,
  };
}

// ── NVIDIA NIM (OpenAI-compatible) ─────────────────────────────────────────
type OAIMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

function toOpenAIMessages(system: string, messages: Anthropic.MessageParam[]): OAIMessage[] {
  const out: OAIMessage[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (typeof m.content === 'string') {
      if (m.role === 'user' || m.role === 'assistant') out.push({ role: m.role, content: m.content });
      continue;
    }
    if (m.role === 'assistant') {
      const text = m.content.filter((b): b is Anthropic.TextBlockParam => b.type === 'text').map(b => b.text).join('\n');
      const calls = m.content
        .filter((b): b is Anthropic.ToolUseBlockParam => b.type === 'tool_use')
        .map(b => ({ id: b.id, type: 'function' as const, function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else if (m.role === 'user') {
      // tool_result blocks become role:'tool' messages; plain text stays a user message
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

async function callNvidia(r: LLMRequest): Promise<LLMResult> {
  const tried: string[] = [];
  let lastError: unknown;
  for (const model of await nvidiaCandidates(r.model)) {
    let emitted = false;
    try {
      const out = await callNvidiaOnce({ ...r, model, onText: r.onText ? d => { emitted = true; r.onText!(d); } : undefined });
      if (model !== r.model) logger.warn({ requested: r.model, used: model }, 'NVIDIA model fallback used');
      return out;
    } catch (e) {
      lastError = e;
      tried.push(model);
      // Never retry after text was streamed to the user: it would duplicate output
      if (emitted || !isUnavailable(e)) throw e;
      const status = (e as { status?: number }).status;
      coolDown.set(model, Date.now() + (status === 404 || status === 410 ? 30 * 60_000 : 2 * 60_000));
      liveCache = null; // re-read the catalog next time
      logger.warn({ model, status: status ?? 'timeout' }, 'NVIDIA model unavailable, trying next');
    }
  }
  const code = (lastError as { status?: number } | undefined)?.status;
  throw new AppError(
    `No NVIDIA model is available right now (tried ${tried.join(', ')}${code ? `; last error HTTP ${code}` : ''}). Try again in a minute.`,
    503,
    'AI_MODELS_UNAVAILABLE',
  );
}

async function callNvidiaOnce(r: LLMRequest): Promise<LLMResult> {
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
    try { input = c.args ? (JSON.parse(c.args) as Record<string, unknown>) : {}; } catch { /* malformed args → validation error returned to the model */ }
    content.push({ type: 'tool_use', id: c.id || `call_${Date.now()}_${i}`, name: c.name, input });
  }
  const hasTools = content.some(b => b.type === 'tool_use');
  return {
    content,
    stopReason: hasTools ? 'tool_use' : finish === 'length' ? 'max_tokens' : 'end_turn',
    inputTokens: inTok,
    outputTokens: outTok,
  };
}

export async function callLLM(r: LLMRequest): Promise<LLMResult> {
  try {
    return env.AI_PROVIDER === 'nvidia' ? await callNvidia(r) : await callAnthropic(r);
  } catch (e) {
    if (e instanceof AppError) throw e;
    // Surface provider auth/rate/model problems as readable errors instead of a generic 500
    const err = e as { status?: number; message?: string };
    if (err.status === 401 || err.status === 403) throw new AppError('The AI provider rejected the API key. Check it in .env.', 502, 'AI_AUTH');
    if (err.status === 404) throw new AppError(`The AI provider doesn't know the model “${r.model}”. Pick another in Settings → AI preferences.`, 502, 'AI_MODEL');
    if (err.status === 429) throw new AppError('The AI provider is rate-limiting requests. Wait a moment and try again.', 429, 'AI_RATE');
    throw e;
  }
}
