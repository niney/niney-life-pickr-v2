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
  // 용도별 기본 모델 fallback — DB(LlmProviderConfig) row 의 defaultModel 이
  // 비어 있을 때만 사용. 비우면 "기본 없음" — 해당 용도는 model 을 명시받거나
  // (chat) skip(image/log-analysis) 된다.
  //  - OLLAMA_DEFAULT_MODEL:      텍스트(chat) 기본 모델.
  //  - OLLAMA_IMAGE_MODEL:        이미지(vision) 기본 모델 (영수증 추출 등).
  //  - OLLAMA_LOG_ANALYSIS_MODEL: 로그 분석(log-analysis) 기본 모델.
  OLLAMA_DEFAULT_MODEL: z.string().default(''),
  OLLAMA_IMAGE_MODEL: z.string().default(''),
  OLLAMA_LOG_ANALYSIS_MODEL: z.string().default(''),

  // 텔레그램 봇 — 맛집 자동 발굴(random-crawl)이 후보를 보내고 사용자가
  // 인라인 버튼으로 고르면 그 응답을 long-polling 으로 받는다. 둘 다 비어 있으면
  // 텔레그램 비활성 — 자동 발굴 회차는 후보를 못 보내 skip 된다.
  // - TELEGRAM_BOT_TOKEN: @BotFather 로 발급한 봇 토큰.
  // - TELEGRAM_CHAT_ID: 후보를 받을 대상 chat id(개인/그룹). 봇과 1회 대화하거나
  //   그룹에 추가한 뒤 getUpdates 로 확인할 수 있다.
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_CHAT_ID: z.string().default(''),

  // 지도(vworld) — 설정>지도 의 DB(MapProviderConfig) 행이 있으면 그 키가
  // 우선, 비어 있으면 아래 값으로 fallback. WMTS 키는 어차피 브라우저에 노출
  // 되는 클라이언트 자원이라 .env 기본값을 둬도 보안 등급 차이가 없다.
  // - VWORLD_API_KEY: vworld JavaScript/WMTS 키.
  // - VWORLD_DOMAINS: 허용 도메인 메모(콤마 구분). 런타임 미사용 — 표시·기록용.
  VWORLD_API_KEY: z.string().default(''),
  VWORLD_DOMAINS: z.string().default(''),

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

  // 정산 공유 링크 SNS 미리보기(OG)용. 빌드된 웹 index.html 경로 — Fastify 가
  // 읽어 <head> 에 OG 메타를 주입한다. 미설정 시 모노레포 기본 위치
  // (apps/web/dist/index.html) 를 빌드 산출물 기준 상대경로로 탐색.
  WEB_INDEX_PATH: z.string().optional(),
  // 공개 URL/canonical 생성 기준 origin. Cloudflare/Flexible SSL/nginx Host 변형에
  // 흔들리지 않게 SEO 표면은 기본 운영 도메인으로 고정한다.
  PUBLIC_ORIGIN: z.string().url().default('https://ninelife.kr'),
  // OG 기본 이미지. 같은 도메인 정적 파일의 path (또는 절대 URL).
  OG_IMAGE_PATH: z.string().default('/og-default.png'),
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
