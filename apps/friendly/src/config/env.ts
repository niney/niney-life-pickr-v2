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
  // (chat) skip(image/log-analysis/meal-photo/meal-recommend) 된다.
  // .env → LlmProviderEnv 조립은 modules/ai/llm-provider-env.ts 한 곳에서 한다.
  //  - OLLAMA_DEFAULT_MODEL:        텍스트(chat) 기본 모델.
  //  - OLLAMA_IMAGE_MODEL:          이미지(vision) 기본 모델 (영수증 추출 등).
  //  - OLLAMA_LOG_ANALYSIS_MODEL:   로그 분석(log-analysis) 기본 모델.
  //  - OLLAMA_MEAL_PHOTO_MODEL:     식단 사진 인식(meal-photo, vision) 기본 모델 — 식단 관리.
  //  - OLLAMA_MEAL_RECOMMEND_MODEL: 식단 추천(meal-recommend, 텍스트) 기본 모델 — 식단 관리.
  OLLAMA_DEFAULT_MODEL: z.string().default(''),
  OLLAMA_IMAGE_MODEL: z.string().default(''),
  OLLAMA_LOG_ANALYSIS_MODEL: z.string().default(''),
  OLLAMA_MEAL_PHOTO_MODEL: z.string().default(''),
  OLLAMA_MEAL_RECOMMEND_MODEL: z.string().default(''),

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

  // 서울시 버스 API (ws.bus.go.kr) 인증키 — data.go.kr 발급. 빈 값이면 버스
  // 기능 비활성(검색 라우트가 503). Encoding/Decoding 키 어느 쪽이든 어댑터가
  // 처리하며, 확신이 없으면 probe:bus 스크립트가 판별해 알려준다.
  BUS_API_KEY: z.string().default(''),

  // 에어코리아 대기오염정보 API(apis.data.go.kr/B552584, 15073861) 인증키 — data.go.kr
  // 는 계정당 키 1개라 BUS_API_KEY 와 같은 값일 수 있다(해당 API 활용신청만 추가).
  // 비우면 BUS_API_KEY 로 폴백(라우트), 둘 다 비면 대기정보 라우트 503.
  AIRKOREA_API_KEY: z.string().default(''),
  // 기상청 단기예보(15084084)·중기예보(15059468) — 같은 data.go.kr 계정 키라 비우면
  // BUS_API_KEY 로 폴백(라우트). 둘 다 비면 날씨 라우트 503.
  KMA_API_KEY: z.string().default(''),
  // 기상청 API허브(apihub.kma.go.kr) 인증키 — AWS 매분 관측으로 현재 날씨 보강(선택). data.go.kr
  // 키와 별개. 비우면 /weather/aws 가 enabled=false 로 응답하고 페이지는 보강을 생략한다.
  KMA_APIHUB_KEY: z.string().default(''),

  // 서울시 지하철 API — 모두 data.seoul.go.kr(열린데이터광장) 발급. 발급처가
  // 키를 2종으로 쪼개 둔다: '지하철 인증키'는 실시간 swopenAPI(도착/위치) 전용,
  // '일반 인증키'는 openapi.seoul.go.kr:8088 정적(역사마스터) 전용 — 서로 호환
  // 되지 않는다. 각 기능은 자기 키가 빈 값이면 비활성(라우트/스크립트가 503).
  //  - SUBWAY_API_KEY:     실시간 swopenAPI(도착/위치) — 2차~ 라우트가 사용.
  //  - SEOUL_OPEN_API_KEY: openapi 정적(역사마스터) — load:subway-stations 가 사용.
  SUBWAY_API_KEY: z.string().default(''),
  SEOUL_OPEN_API_KEY: z.string().default(''),

  // 음식 카탈로그(food) 적재 소스 키 — 식단 관리. 요청 경로가 아니라 어드민 적재 잡/CLI 만 쓴다.
  //  - FOOD_API_KEY:        data.go.kr 전국통합식품영양성분정보(음식) 표준데이터(15100070). 같은
  //                         data.go.kr 계정 키라 비우면 BUS_API_KEY 로 폴백(해당 데이터셋 활용신청만 추가).
  //  - FOOD_RECIPE_API_KEY: 식품안전나라(foodsafetykorea.go.kr) OpenAPI 키 — 조리식품 레시피 DB COOKRCP01.
  //  - MAFRA_API_KEY:       data.mafra.go.kr 키 — 레시피 기본/재료(선택).
  // 비어 있는 소스는 적재 회차에서 오류로 기록하고 건너뛴다(다른 소스는 진행).
  FOOD_API_KEY: z.string().default(''),
  FOOD_RECIPE_API_KEY: z.string().default(''),
  MAFRA_API_KEY: z.string().default(''),

  // 식단 관리 per-user 일일 LLM 호출 한도(인메모리 카운터, Asia/Seoul 기준). 0 이면 무제한.
  // 사용자 트리거 호출이라 계정 동시성 게이트만으론 비용이 안 막힌다.
  MEAL_RECOGNIZE_DAILY_LIMIT: z.coerce.number().int().min(0).default(30),
  MEAL_RECOMMEND_DAILY_LIMIT: z.coerce.number().int().min(0).default(20),

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
