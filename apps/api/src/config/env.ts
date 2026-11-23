import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001').transform(Number),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
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
  NVIDIA_MODEL: z.string().default('meta/llama-3.3-70b-instruct'),
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
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100').transform(Number),
  AI_RATE_LIMIT_PER_MINUTE: z.string().default('20').transform(Number),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_FORMAT: z.enum(['pretty', 'json']).default('pretty'),
  APP_NAME: z.string().default('CareerOS'),
  APP_URL: z.string().default('http://localhost:5173'),
  DEMO_MODE: z.string().default('false').transform(v => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const p = parsed.data;
const isNvidia = p.AI_PROVIDER === 'nvidia';

export const env = {
  ...p,
  // Key for the selected provider. Placeholders from .env.example are ignored because they
  // don't have the real prefix (sk-ant- for Anthropic, nvapi- for NVIDIA).
  AI_KEY: isNvidia
    ? [p.NVIDIA_API_KEY, p.AI_API_KEY].find(k => k && k.startsWith('nvapi-'))
    : [p.ANTHROPIC_API_KEY, p.AI_API_KEY].find(k => k && k.startsWith('sk-ant-')),
  // Default model for the selected provider (users can override in Settings)
  AI_DEFAULT_MODEL: isNvidia ? p.NVIDIA_MODEL : p.AI_MODEL,
};
export type Env = typeof env;
