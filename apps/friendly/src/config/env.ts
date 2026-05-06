import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('*'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Ollama Cloud — DB-backed config wins over these. env values are used
  // only when no LlmProviderConfig row exists for 'ollama-cloud' or the row
  // leaves a field unset.
  OLLAMA_CLOUD_API_KEY: z.string().default(''),
  OLLAMA_CLOUD_BASE_URL: z.string().url().default('https://ollama.com'),
  OLLAMA_CLOUD_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  OLLAMA_CLOUD_MAX_CONCURRENT: z.coerce.number().int().positive().default(15),
  // Optional fallback model id when no DB row defines defaultModel.
  // Empty means "no default" — UI must supply one for /test and /complete.
  OLLAMA_DEFAULT_MODEL: z.string().default(''),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;
export const isDev = env.NODE_ENV === 'development';
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
