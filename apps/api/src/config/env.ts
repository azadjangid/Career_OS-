import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';

// Tests configure their own environment (tests/setup.ts); a developer's .env must not leak real keys into them
if (process.env['NODE_ENV'] !== 'test') {
  dotenv.config({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001').transform(Number),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  BCRYPT_ROUNDS: z.string().default('12').transform(Number),

  FRONTEND_URL: z.string().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3000'),

  // 'anthropic' = Claude; 'nvidia' = NVIDIA NIM hosted models (OpenAI-compatible, free dev credits)
  AI_PROVIDER: z.enum(['anthropic', 'nvidia']).default('anthropic'),
  AI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  NVIDIA_API_KEY: z.string().optional(),
  NVIDIA_BASE_URL: z.string().default('https://integrate.api.nvidia.com/v1'),
  // meta/llama-3.3-70b-instruct (the old default) was retired by NVIDIA and returns HTTP 410
  NVIDIA_MODEL: z.string().default('nvidia/nemotron-3-super-120b-a12b'),
  // Optional: a second provider to use when the primary one is down (needs that provider's key too)
  AI_FALLBACK_PROVIDER: z.enum(['anthropic', 'nvidia', 'none']).default('none'),
  ANTHROPIC_BASE_URL: z.string().optional(),
  // Per-attempt timeout and retries for transient provider failures (429, 5xx, network)
  AI_TIMEOUT_MS: z.string().default('90000').transform(Number),
  AI_MAX_RETRIES: z.string().default('2').transform(Number),
  AI_RETRY_BASE_MS: z.string().default('500').transform(Number),
  AI_MODEL: z.string().default('claude-opus-5-5'),
  AI_AGENT_MAX_STEPS: z.string().default('8').transform(Number),
  AI_MAX_TOKENS: z.string().default('4096').transform(Number),
  AI_TEMPERATURE: z.string().default('0.7').transform(Number),
  AI_MONTHLY_BUDGET_TOKENS: z.string().default('500000').transform(Number),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().default('587').transform(Number),
  SMTP_SECURE: z.string().default('false').transform(v => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().default('CareerOS <noreply@careeros.app>'),

  STORAGE_PROVIDER: z.enum(['local', 's3', 'r2']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./uploads'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),

  RATE_LIMIT_WINDOW_MS: z.string().default('900000').transform(Number),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('1000').transform(Number),
  AI_RATE_LIMIT_PER_MINUTE: z.string().default('20').transform(Number),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_FORMAT: z.enum(['pretty', 'json']).default('pretty'),
  APP_NAME: z.string().default('CareerOS'),
  APP_URL: z.string().default('http://localhost:5173'),
  DEMO_MODE: z.string().default('false').transform(v => v === 'true'),
  // Number of reverse proxies in front of the API (nginx = 1). Used for client IPs in rate limiting.
  TRUST_PROXY: z.string().default('1').transform(Number),
  // Refresh cookie "Secure" flag. Defaults to on in production; set 'false' only for plain-HTTP local Docker.
  COOKIE_SECURE: z.enum(['true', 'false']).optional().transform(v => (v === undefined ? undefined : v === 'true')),
  SENTRY_DSN: z.string().optional(),
  // Timezone for the worker's daily schedules (reminders at 9 AM, cleanup at 3:30 AM)
  SCHEDULER_TZ: z.string().default('Asia/Kolkata'),
  SENTRY_TRACES_SAMPLE_RATE: z.string().default('0').transform(Number),
  // Adzuna job search API (free key at developer.adzuna.com). Optional.
  ADZUNA_APP_ID: z.string().optional(),
  ADZUNA_APP_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const p = parsed.data;
const isNvidia = p.AI_PROVIDER === 'nvidia';
// Placeholders from .env.example are ignored because they don't have the real prefix
const anthropicKey = [p.ANTHROPIC_API_KEY, !isNvidia ? p.AI_API_KEY : undefined].find(k => k && k.trim().startsWith('sk-ant-'))?.trim();
const nvidiaKey = [p.NVIDIA_API_KEY, isNvidia ? p.AI_API_KEY : undefined].find(k => k && k.trim().startsWith('nvapi-'))?.trim();

export const env = {
  ...p,
  ANTHROPIC_KEY: anthropicKey,
  NVIDIA_KEY: nvidiaKey,
  // Key for the selected provider
  AI_KEY: isNvidia ? nvidiaKey : anthropicKey,
  // True when a key was set but doesn't look like a real key for that provider (helps the health check explain it)
  AI_KEY_MALFORMED: Boolean(isNvidia ? (p.NVIDIA_API_KEY || p.AI_API_KEY) && !nvidiaKey : (p.ANTHROPIC_API_KEY || p.AI_API_KEY) && !anthropicKey),
  // Default model for the selected provider (users can override in Settings)
  AI_DEFAULT_MODEL: isNvidia ? p.NVIDIA_MODEL : p.AI_MODEL,
};
export type Env = typeof env;
