import { prisma } from '../config/database';
import { env } from '../config/env';

interface ModelInfo { label: string; input: number; output: number }

const ANTHROPIC_MODELS: Record<string, ModelInfo> = {
  'claude-opus-5-5': { label: 'Claude Opus 5.5 (most capable)', input: 4 / 1e6, output: 20 / 1e6 },
  'claude-sonnet-5-5': { label: 'Claude Sonnet 5.5 (fast, cheaper)', input: 2 / 1e6, output: 10 / 1e6 },
  'claude-haiku-4-5': { label: 'Claude Haiku 4.5 (fastest, cheapest)', input: 1 / 1e6, output: 5 / 1e6 },
};

// NVIDIA's free developer endpoints: no per-token cost to the user
// Model ids come from GET https://integrate.api.nvidia.com/v1/models; NVIDIA retires models often
// (e.g. the Llama 3.x ids now return 404/410), so re-check the list if a model stops working.
const NVIDIA_MODELS: Record<string, ModelInfo> = {
  'nvidia/nemotron-3-super-120b-a12b': { label: 'Nemotron 3 Super 120B (recommended, supports tools)', input: 0, output: 0 },
  'nvidia/nemotron-3-ultra-550b-a55b': { label: 'Nemotron 3 Ultra 550B (largest, slower)', input: 0, output: 0 },
  'nvidia/nemotron-3.5-lightning-30b-a3b': { label: 'Nemotron 3.5 Lightning 30B (fastest)', input: 0, output: 0 },
  'deepseek-ai/deepseek-v4.1-flash': { label: 'DeepSeek V4.1 Flash (often slow on the free tier)', input: 0, output: 0 },
};

/** Models a user may pick for the active provider. */
export const MODEL_OPTIONS: Record<string, ModelInfo> = env.AI_PROVIDER === 'nvidia' ? NVIDIA_MODELS : ANTHROPIC_MODELS;

export const priceFor = (model: string): ModelInfo =>
  MODEL_OPTIONS[model] ?? { label: model, input: env.AI_PROVIDER === 'nvidia' ? 0 : 4 / 1e6, output: env.AI_PROVIDER === 'nvidia' ? 0 : 20 / 1e6 };

export interface UserAIPrefs {
  model: string;
  language: string;
  autoAnalyze: boolean;
  autoMatch: boolean;
}

/** Reads the user's AI preferences from UserPreference.extras, validating against the allowlist. */
export async function getUserAIPrefs(userId: string): Promise<UserAIPrefs> {
  const row = await prisma.userPreference.findUnique({ where: { userId }, select: { extras: true } });
  const x = (row?.extras ?? {}) as Record<string, unknown>;
  // A saved model from another provider (e.g. after switching AI_PROVIDER) falls back to the default
  const model = typeof x['aiModel'] === 'string' && x['aiModel'] in MODEL_OPTIONS ? (x['aiModel'] as string) : env.AI_DEFAULT_MODEL;
  return {
    model,
    language: typeof x['aiLanguage'] === 'string' && x['aiLanguage'] ? (x['aiLanguage'] as string) : 'English',
    autoAnalyze: x['aiAutoAnalyze'] === true,
    autoMatch: x['aiAutoMatch'] === true,
  };
}

/** One-line instruction appended to system prompts so replies use the preferred language. */
export const languageNote = (language: string): string =>
  language && language.toLowerCase() !== 'english' ? `\nAlways reply in ${language} (keep code, names and URLs as they are).` : '';
