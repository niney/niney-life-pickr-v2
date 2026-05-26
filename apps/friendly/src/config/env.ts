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

  // Deep link (Universal Links / App Links) 검증 파일 콘텐츠를 /.well-known/
  // 라우트가 동적으로 만든다. 비어 있으면 그 라우트가 404 — iOS/Android 도
  // 자동 검증 실패로 폴백(브라우저 오픈)한다.
  //
  // - APP_TEAM_ID: Apple Developer Team ID (10자, 예: ABCDE12345).
  //   apps/mobile/app.config.ts 의 ios.bundleIdentifier 와 합쳐
  //   "ABCDE12345.com.niney.lifepickr" 로 AASA appIDs 에 들어간다.
  // - APP_BUNDLE_ID: iOS bundle id. 미설정 시 'com.niney.lifepickr' 폴백.
  // - ANDROID_APP_PACKAGE: 안드로이드 package. 미설정 시 'com.niney.lifepickr' 폴백.
  // - ANDROID_SHA256_FINGERPRINTS: 콤마 구분 SHA-256 지문 (대문자 16진수,
  //   콜론 구분 64자). EAS 빌드는 `eas credentials` 로 확인.
  APP_TEAM_ID: z.string().default(''),
  APP_BUNDLE_ID: z.string().default('com.niney.lifepickr'),
  ANDROID_APP_PACKAGE: z.string().default('com.niney.lifepickr'),
  ANDROID_SHA256_FINGERPRINTS: z.string().default(''),
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
