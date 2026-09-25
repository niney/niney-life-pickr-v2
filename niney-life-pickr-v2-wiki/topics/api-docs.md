---
topic: api-docs
last_compiled: 2026-09-26
sources_count: 63
status: active
aliases: [api-docs, 외부 API 문서, 외부용 API 문서, API 문서, 외부 사용 가이드, docs/api, docs/api/README.md, endpoints.md, 엔드포인트 색인, openapi.json, OpenAPI, openapi, OpenAPI 3.0.3, Life Pickr API, export:openapi, export-openapi, export-openapi.ts, swagger, "@fastify/swagger", swagger-ui, /docs, SwaggerTransform, jsonSchemaTransform, x-auth, x-rate-limit, RouteAuth, authOf, rateLimitOf, OPTIONAL_BEARER, bearerAuth, 선택 인증, optional-auth, resolveOptionalUser, optionalUserId, 한국어 summary, route summary, CORS, cors, CORS 개방, CORS_ORIGIN, PUBLIC_ORIGIN, buildCorsPolicy, isAdminPath, delegator, credentials-false, preflight, access-control-max-age, exposedHeaders, x-ratelimit-remaining, retry-after, 보안 감사 #42, "#42 번복", "#44", fail-closed, error-handler, 에러 본문, 429, Too Many Requests, errorResponseBuilder, replyUpstreamError, app.cors.test, app.openapi.test, app.errors.test, "app.*.test.ts", plugins-test-ban, CLAUDE.md 6번 규칙, openapi-typescript, openapi-fetch, 다른 프로젝트, 1b621c4, 678ecc0]
---

# api-docs — 외부용 API 문서(docs/api)·OpenAPI 생성 파이프라인·어드민 외 CORS 개방

**2026-09-24~09-26 변경 흡수 — 신규 토픽: 외부용 API 문서 자동 생성 + 어드민 외 CORS `*` 개방 + 429 본문 수정**: 사용자의 다른 프로젝트가 브라우저·서버에서 friendly API 를 직접 쓰도록 `1b621c4`(2026-09-24)가 (1) [plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts) 를 "어드민(`/api/v1/admin/**`) 외 `origin:'*'` + `credentials:false`, 어드민은 `PUBLIC_ORIGIN` 만" 으로 바꿔 보안 감사 #42 의 prod fail-closed(`bc2db00`, 2026-07-13)를 **번복**하고, (2) [plugins/swagger.ts](../../apps/friendly/src/plugins/swagger.ts) 의 스펙 생성기를 전 환경에 등록하면서 transform 이 `x-auth`·`x-rate-limit`·bearer `security` 를 자동으로 싣게 했으며, (3) 비-어드민 라우트가 있는 route 파일 32개의 `schema` 에 한국어 `summary`(필요 시 `description`)를 달고(동작 변경 없음), (4) [scripts/export-openapi.ts](../../apps/friendly/scripts/export-openapi.ts)(`pnpm --filter friendly export:openapi`)로 `docs/api/openapi.json`·`endpoints.md` 를 뽑아 수기 가이드 `docs/api/README.md` 와 함께 커밋했다 — 그 시점 **183개(공개 74·선택 15·로그인 94)**. 같은 날 `678ecc0` 은 레이트리밋 429 본문에서 `error` 필드가 빠지던 전역 에러 핸들러 결함을 고쳐 README 가 약속한 공통 에러 본문 `{ statusCode, error, message }` 를 지켰다. 이튿날 `2ff2c31`(2026-09-25, 주차)이 문서를 재생성해 **192개(공개 83·선택 15·로그인 94)** 가 됐고, `420a6be`(2026-09-26)는 어드민 라우트만 건드려 재생성 변화가 없다. 작업 규칙은 `CLAUDE.md` 6번 "외부 API 문서(`docs/api/`)" 로 박혔다 — 비-어드민 라우트를 추가·변경하면 summary·선택 인증이면 `OPTIONAL_BEARER`·`export:openapi` 재생성, `src/plugins/` 에 `*.test.ts` 금지(앱 연결 테스트는 `src/app.*.test.ts`).

## Purpose [coverage: high — 8 sources]

`docs/api/` 는 **이 리포 밖의 소비자**(사용자의 다른 프로젝트)를 위한 friendly API 문서다. 리포 안의 웹·앱은 여전히 `@repo/api-contract`(zod)와 `@repo/shared` API 함수로 호출하고 이 문서를 읽지 않는다 — 외부 프로젝트만 `openapi.json` 을 기준으로 한다([README 8절](../../docs/api/README.md)).

| 파일 | 내용 | 갱신 방식 | 규모(2026-09-26) |
|---|---|---|---|
| [docs/api/README.md](../../docs/api/README.md) | 공통 규칙 9절 — 기준 URL·CORS·인증·요청/응답 규약·한도·도메인 개요·데이터 출처/이용 조건·타입 쓰기·알려진 한계 | 수기 | 243줄 |
| [docs/api/endpoints.md](../../docs/api/endpoints.md) | 태그 27개 절로 나눈 엔드포인트 색인 — 메서드·경로·인증·한도·입력·한 줄 설명 | 자동(`export:openapi`) | 337줄 · 192개 |
| [docs/api/openapi.json](../../docs/api/openapi.json) | OpenAPI 3.0.3 — 요청·응답 스키마 전체 | 자동 | 53,919줄 · 1,955,033바이트 |

이 토픽이 다루는 것:

1. **문서 생성 파이프라인** — zod 스키마 → 라우트 `schema`(한국어 summary) → `swagger.ts` transform(x-auth·x-rate-limit·security 추론) → `export-openapi.ts` → `docs/api/`.
2. **외부 공개 정책** — CORS 개방(어드민 외 `*`, credentials false)과 어드민 예외(`PUBLIC_ORIGIN` 만), `/docs` UI 의 dev 전용 유지, 보안 감사 #42·#44 결정과의 관계([docs/PLAN-perf-security.md](../../docs/PLAN-perf-security.md) 3차 절).
3. **외부 계약이 된 공통 규약** — 에러 본문 `{ statusCode, error, message }`(429 수정 `678ecc0`), 레이트리밋 응답 헤더 노출, 인증 3등급(공개·선택·로그인) 표기.
4. **작업 규칙** — [CLAUDE.md](../../CLAUDE.md) 6번과 앱 연결 테스트 위치(`src/app.*.test.ts`).

도메인별 동작(파라미터 의미·캐시·폴백)은 각 도메인 토픽 소관이고, README 6절 "도메인 개요" 는 그 외부용 요약이다 — [weather](weather.md)·[air-quality](air-quality.md)·[bus](bus.md)·[subway](subway.md)·[sea](sea.md)·[parking](parking.md)·[life-map](life-map.md)·[housing](housing.md)·[tour](tour.md)·[tarot](tarot.md)·[saju-c](saju-c.md)·[saju-g](saju-g.md)·[meal](meal.md)·[food](food.md)·[settlement](settlement.md)·[vote](vote.md). 백엔드 공통 관점은 [friendly](friendly.md), 스키마 원천은 [api-contract](api-contract.md), LLM 기능의 일일 한도는 [usage-quota](usage-quota.md).

사용자 결정(2026-09-24, 작업 기록): "내 다른 프로젝트에서 쓸 것 — 운영도 CORS 다 풀고, 트래픽 보고 나중에 제한. 어드민 제외, 열 수 있는 건 다 열기(LLM 포함)." 커밋 본문은 "사용자의 다른 프로젝트가 브라우저에서 이 API 를 직접 쓰도록 운영 CORS 를 연다. 트래픽을 보고 CORS_ORIGIN 목록으로 다시 좁힌다" 로 적었고, PLAN-perf-security 는 같은 결정을 "2026-09-24 번복(사용자 결정)" 으로 남겼다.

소스: [README.md](../../docs/api/README.md), [endpoints.md](../../docs/api/endpoints.md), [openapi.json](../../docs/api/openapi.json), [export-openapi.ts](../../apps/friendly/scripts/export-openapi.ts), [cors.ts](../../apps/friendly/src/plugins/cors.ts), [swagger.ts](../../apps/friendly/src/plugins/swagger.ts), [CLAUDE.md](../../CLAUDE.md), [PLAN-perf-security.md](../../docs/PLAN-perf-security.md)

## Architecture [coverage: high — 19 sources]

### 1. 생성 파이프라인

```
packages/api-contract/src/schemas/*.ts (zod)             ← 요청·응답 스키마 원천
        │ import
apps/friendly/src/modules/**/<x>.route.ts
   schema: { tags, summary, description?, security?, params/querystring/body, response }
   config: { rateLimit: RATE.xxx | { max: async fn, timeWindow } }
   onRequest: [app.authenticate(, app.requireAdmin)]
        │ 라우트 등록 때 @fastify/swagger 가 수집 (모든 환경)
plugins/swagger.ts transform
   jsonSchemaTransform(zod → JSON Schema) → authOf() / rateLimitOf()
   → x-auth · x-rate-limit · security 부착
        │ app.swagger()
scripts/export-openapi.ts   (tsx --env-file=.env · buildApp → ready → swagger → close)
   /api/v1/ 밖 제외 · x-auth=admin 제외 · info/servers 교체
        ├─ docs/api/openapi.json   (JSON.stringify 2칸 + 끝 개행)
        └─ docs/api/endpoints.md   (태그별 표 + 합계·인증별 개수 머리말)
        ▼
외부 프로젝트: npx openapi-typescript docs/api/openapi.json → openapi-fetch (README 8절)
```

### 2. swagger.ts — 인증 수준 추론과 security 자동 부착

[swagger.ts](../../apps/friendly/src/plugins/swagger.ts)(84줄)는 `RouteAuth = 'public' | 'optional' | 'user' | 'admin'` 를 export 하고, transform 안에서 `authOf(app, route, schema)` 로 라우트마다 등급을 정한다. 판정은 **첫 매치**:

| 순서 | 조건 | 결과 | 비고 |
|---|---|---|---|
| 1 | `isAdminPath(route.url)` 이거나 훅에 `app.requireAdmin` | `admin` | 어드민 SSE 는 핸들러 안에서 `?token=` 을 검증해 훅이 없다 → 경로로 판정(어드민 라우트는 전부 이 prefix 아래) |
| 2 | 훅에 `app.authenticate` | `user` | |
| 3 | 원본 schema 의 `security` 가 비어 있지 않음 | `{}` 원소가 있으면 `optional`, 없으면 `user` | picks 처럼 플러그인 단위 `addHook('onRequest', app.authenticate)` 는 route 훅에 안 보여 security 를 명시한다 |
| 4 | 그 외 | `public` | |

- 훅 목록은 `route.onRequest`·`preValidation`·`preHandler` 를 평탄화한 배열이고, 비교는 **함수 identity**(`includes`)다.
- `OPTIONAL_BEARER = [{}, { bearerAuth: [] }]` — OpenAPI 에서 빈 객체는 "인증 없이도 됨". 선택 인증은 핸들러 안에서 `app.resolveOptionalUser`(타로·사주(C)·사주(G) 의 `actorOf` 헬퍼) 또는 vote 의 `optionalUserId` 로 판정해 훅으로 안 보이므로 **라우트 schema 에 사람이 명시**해야 한다(현재 15개 — API Surface).
- 비-public 인데 schema 에 `security` 가 없으면 `[{ bearerAuth: [] }]` 를 채운다. public 은 security 를 싣지 않는다(`app.openapi.test` 가 `undefined` 확인).
- `rateLimitOf(route)`: `route.config.rateLimit` 이 있으면 `{ max: number | 'dynamic', timeWindow: String(timeWindow ?? '1 minute') }`. max 가 함수면 `'dynamic'` — 타로·사주의 분당 한도는 `async () => (await app.usageQuota.getSetting(feature)).ipPerMinute` 처럼 어드민 설정을 읽는다([tarot.route.ts](../../apps/friendly/src/modules/tarot/tarot.route.ts)). config 가 없으면 필드를 생략(= 전역 백스톱). 레이트리밋 플러그인이 테스트에서 미등록이어도 route config 를 읽으므로 스펙은 환경과 무관하다.
- `schema.hide` 면 부착 없이 통과 — 현재 `hide: true` 는 prefix 없는 `/health` 하나([health.route.ts](../../apps/friendly/src/modules/health/health.route.ts)).
- 등록: `@fastify/swagger` 는 **모든 환경**(HTTP 노출 없음 — `app.swagger()` 로 스펙 객체만), `@fastify/swagger-ui`(`/docs`)는 `isDev` 일 때만 → prod·test 는 404. 앱 내부 스펙의 info 는 여전히 `title 'Friendly API'`·`servers: http://localhost:3000` 이고 외부용 값은 export 가 갈아 끼운다.
- `swagger.ts` 가 `cors.ts` 의 `isAdminPath` 를 import 한다 — "어드민이냐" 판정 한 함수가 CORS 정책 선택·문서 등급·export 제외를 모두 결정한다.

### 3. export-openapi.ts — 외부용 파일 추출

[export-openapi.ts](../../apps/friendly/scripts/export-openapi.ts)(131줄), 스크립트 `"export:openapi": "tsx --env-file=.env scripts/export-openapi.ts"`([package.json](../../apps/friendly/package.json), `1b621c4` 추가).

1. `buildApp({ logger: false })` → `app.ready()`(**listen 없음**) → `app.swagger()` → `app.close()`.
2. 필터: path 가 `/api/v1/` 로 시작하는 것만(공유 미리보기 HTML `/r/`·`/share/settlements/`·`/s/`·`/vote/`·`/tarot/s/`·`/saju-c/s/`·`/saju-g/s/` 와 robots·sitemap·well-known 이 빠짐) × 메서드 `get·post·put·patch·delete` 중 `x-auth !== 'admin'`. 경로는 사전순 정렬.
3. 외부용 스펙: `info.title 'Life Pickr API'`, version 은 원본 그대로(`0.0.1`), description 에 README 안내와 x-auth·x-rate-limit 뜻, `servers: [{ url: env.PUBLIC_ORIGIN(끝 슬래시 제거) }]`, `components` 는 원본(bearerAuth) 그대로. 최상위 `tags` 배열은 없다.
4. endpoints.md: 첫 태그로 묶고(없으면 `(untagged)`) 태그 이름순. 열 = 메서드 · 경로(`{x}` → `:x`) · 인증(`user`→로그인, `optional`→선택, 나머지→공개) · 한도(`max/분·시간·일`, `dynamic`→`설정값`, 없으면 빈 칸 = 전역 1000/분) · 입력(query·header 파라미터, 필수는 `*`, 본문이 있으면 `body`) · 설명(`summary ?? description`, `|` 이스케이프·개행 평탄화). 머리에 "**자동 생성 — 직접 수정하지 말 것**" 과 합계 한 줄.
5. 콘솔 `docs/api — N개 엔드포인트(공개 a, 선택 b, 로그인 c), 태그 t개` 뒤 `process.exit(0)`.

부팅 부수효과: `ready()` 는 `onReady` 훅을 실행한다 — [housing.route.ts](../../apps/friendly/src/modules/housing/housing.route.ts) 의 월 갱신 스케줄러 `start()`(close 에서 stop), [plugins/summaries.ts](../../apps/friendly/src/plugins/summaries.ts) 의 군집 기동 리컨실 예약([review-clustering.service.ts](../../apps/friendly/src/modules/review-clustering/review-clustering.service.ts) `scheduleStartupReconcile` — `setTimeout(...).unref()` 라 곧 exit 로 사라짐). 업스트림을 부르는 주차 실시간·충전기 폴러는 `2ff2c31` 에서 일부러 `onListen` 에 걸었다 — 코드 주석 "export:openapi 처럼 app.ready() 만 하는 스크립트·inject 테스트에서 업스트림을 부르지 않게"([parking.route.ts](../../apps/friendly/src/modules/parking/parking.route.ts), [parking](parking.md), 컨셉 [server-only-boot-effects](../concepts/server-only-boot-effects.md)).

### 4. CORS — plugins/cors.ts

[cors.ts](../../apps/friendly/src/plugins/cors.ts)(66줄):

- `isAdminPath(url)`: `?` 앞만 떼어 `decodeURIComponent`(잘못된 인코딩이면 원문으로) 한 뒤 `/^\/api\/v1\/admin(?:\/|$)/` — 라우터가 `/api/v1/%61dmin` 도 `/api/v1/admin` 으로 매칭하므로 디코딩 후 판정. `/api/v1/administrator`·`/api/v1/weather/forecast?admin=1` 은 비어드민.
- `buildCorsPolicy({ dev, corsOrigin, publicOrigin })` → `{ open, admin }`. 공통 `base = { credentials: false, exposedHeaders: ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after'], maxAge: 600 }`.

| 실행 환경 | `CORS_ORIGIN` | 어드민 외(`open.origin`) | 어드민(`admin.origin`) |
|---|---|---|---|
| dev (`NODE_ENV=development`) | 무시 | `'*'` | `true` (요청 origin 반사) |
| 비-dev (production·test) | `*`(기본) · 빈 값 · 목록에 `*` 포함 | `'*'` | `[PUBLIC_ORIGIN]`(끝 슬래시 제거) |
| 비-dev | 콤마 구분 목록 | 그 목록(trim) | `[PUBLIC_ORIGIN]` |

- 등록은 `@fastify/cors` 의 `delegator: (req, cb) => cb(null, isAdminPath(req.url) ? policy.admin : policy.open)` — 요청마다 두 정책 중 하나를 고른다. `allowedHeaders` 를 지정하지 않아 preflight 의 `Access-Control-Request-Headers`(Authorization·Content-Type·x-guest-key 등)를 그대로 반사한다.
- 비-dev 기동 때 info 로그 1줄 `CORS: 어드민 외 {모든 origin | 목록} 허용, 어드민은 {PUBLIC_ORIGIN} 만` — 운영에서 실제 적용값을 확인하는 곳.
- env: [env.ts](../../apps/friendly/src/config/env.ts) `CORS_ORIGIN: z.string().default('*')`(주석 "어드민 외 API 의 허용 origin(prod 만 적용)"), `PUBLIC_ORIGIN: z.string().url().default('https://ninelife.kr')`(원래 SEO·OG canonical 기준 origin 인데 어드민 CORS·외부 문서 `servers` 에도 쓰인다). [.env.example](../../apps/friendly/.env.example) 은 `CORS_ORIGIN=http://localhost:5173,http://localhost:8081` → `CORS_ORIGIN=*` + 3줄 주석.
- `9be2e10`(2026-05-30)부터 있던 dev 의 `PRIVATE_LAN_ORIGIN`(RFC1918) 분류 regex 와 "비-LAN origin 반사 허용" warn 은 이번에 삭제됐다.

CORS 정책 변천(`git log -- apps/friendly/src/plugins/cors.ts`):

| 날짜·커밋 | dev | prod | credentials |
|---|---|---|---|
| 2026-04-27 `96746da` 초기 | `CORS_ORIGIN='*'` 면 origin 반사(`true`), 아니면 목록 | dev 와 같음 | true |
| 2026-05-28 `fcc0def` | 목록 + RFC1918·localhost 자동 허용, 그 밖은 `cb(Error)` 거부 | 목록(`*` 면 반사) | true |
| 2026-05-30 `9be2e10` | 전부 반사 + 비-LAN origin 을 origin 당 1회 warn | 목록(`*` 면 반사) — 감사 #42 가 지적한 상태 | true |
| 2026-07-13 `bc2db00` | 전부 반사 | `*`·미설정이면 `PUBLIC_ORIGIN` 으로 폐쇄(fail-closed, warn), 목록이면 목록 | true |
| **2026-09-24 `1b621c4`** | 어드민 외 `*`, 어드민 반사 | 어드민 외 `*`(기본) 또는 목록, 어드민 `PUBLIC_ORIGIN` | **false** |

### 5. 에러 본문 — plugins/error-handler.ts

[error-handler.ts](../../apps/friendly/src/plugins/error-handler.ts)(43줄) `setErrorHandler` 4분기 — 외부 문서가 약속하는 공통 본문 `{ statusCode, error, message }` 의 실제 구현:

| 분기 | 상태 | 본문 |
|---|---|---|
| `error instanceof ZodError`(서비스 내부 검증) | 400 | `error: 'Bad Request'`, `message: 'Validation failed'`, `details: flatten().fieldErrors` |
| `error.validation`(라우트 스키마 검증) | 400 | `message` = 검증 메시지(README 예 `querystring/lat Expected number, received nan`) |
| `statusCode < 500` | 그 코드 | `error: error.name ?? (typeof error.error === 'string' ? error.error : 'Error')` |
| 그 외(던진 5xx 포함) | 500 | `Internal Server Error`, message 는 dev 만 원문, 나머지 `Something went wrong` |

- 429 경로: `@fastify/rate-limit`(설치본 10.3.0)은 한도 초과 시 `x-ratelimit-limit/remaining/reset`·`retry-after` 헤더를 붙인 뒤 `throw params.errorResponseBuilder(req, respCtx)` 한다. 이 리포의 builder([rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts))는 Error 가 아닌 평객체 `{ statusCode: 429, error: 'Too Many Requests', message: '요청이 너무 많습니다. N초 후 다시 시도해 주세요.' }` 를 돌려주므로 `name` 이 없다. `678ecc0` 전에는 `error: error.name`(undefined)이라 JSON 직렬화에서 `error` 키가 사라졌다.
- 502/503/404 를 의미 있게 돌려줘야 하는 라우트는 던지지 않고 [reply-upstream-error.ts](../../apps/friendly/src/lib/reply-upstream-error.ts) 의 `replyUpstreamError` 로 같은 모양(`error: 'Not Found' | 'Service Unavailable' | 'Bad Gateway'`)을 직접 보낸다 — air-quality·bus·subway·weather·sea·life-map·housing·parking 8개 route 파일. 던지면 4번째 분기가 500 으로 뭉갠다.
- 401/403 은 `@fastify/sensible` 의 `reply.unauthorized/forbidden`([jwt.ts](../../apps/friendly/src/plugins/jwt.ts)): `Invalid or missing token`(서명·만료 실패) / `Session expired`(`tokenVersion` 불일치 — 로그아웃·강등 후) / `Admin role required`. 토큰 기본 수명은 `JWT_EXPIRES_IN=7d`.

### 6. 레이트리밋 — 외부 문서 관점

[rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts): 전역 백스톱 IP당 분당 1000(`global: true`), 키 = `clientKey`(`CF-Connecting-IP` 우선, 없으면 `req.ip` — [app.ts](../../apps/friendly/src/app.ts) `trustProxy: true`). 라우트 프리셋 `RATE` 20개가 `config.rateLimit` 으로 걸리고 그대로 스펙의 `x-rate-limit` 이 된다. 테스트(`isTest`)에선 플러그인 자체를 등록하지 않는다(inject 요청이 한 IP 로 쌓여 429 오탐). 분포는 API Surface, LLM 기능의 KST 일일 한도(게스트 키·IP·전역 예산)는 별개 층 → [usage-quota](usage-quota.md)·[anonymous-usage-quota](../concepts/anonymous-usage-quota.md).

### 7. 플러그인 로딩과 테스트 위치

[app.ts](../../apps/friendly/src/app.ts) 는 `plugins/` 를 **`matchFilter` 없이** autoload 하고(`modules/` 만 `/\.route\.(ts|js)$/`), [tsup.config.ts](../../apps/friendly/tsup.config.ts) entry 는 `src/plugins/*.ts` 를 통째로 잡는다. 설치된 `@fastify/autoload` 6.3.1 의 기본 `scriptPattern` 은 `.d.ts` 만 빼고 모든 `.ts/.js` 를 받으며 테스트 파일 기본 제외가 없다 → `src/plugins/x.test.ts` 는 런타임 플러그인으로 로드되고 dist 에도 빌드된다. 그래서 CORS·OpenAPI·에러 본문 테스트는 `src/` 루트의 `app.cors.test.ts`(7건)·`app.openapi.test.ts`(5건)·`app.errors.test.ts`(2건)에 두었다([vitest.config.ts](../../apps/friendly/vitest.config.ts) `include: ['src/**/*.test.ts']`). `CLAUDE.md` 6번의 마지막 줄이 이 규칙이다.

## Talks To [coverage: high — 16 sources]

- **[friendly](friendly.md)** — 네 플러그인(cors·swagger·error-handler·rate-limit)과 autoload 되는 route 파일 전체가 문서의 원천. 공유 미리보기 7경로는 `app.ts` 가 autoload 밖에서 명시 등록해 `/api/v1` 밖에 있고 문서에서 빠진다.
- **[api-contract](api-contract.md)** — 요청·응답 zod 가 `fastify-type-provider-zod` `jsonSchemaTransform` 으로 JSON Schema 가 되어 openapi.json 에 **인라인**으로 들어간다(`components.schemas` 0개). [zod-ssot-buildless](../concepts/zod-ssot-buildless.md) 의 "스키마 1개 → 검증·OpenAPI·FE 타입" 이 리포 밖 소비자(`openapi-typescript`)까지 연장된 것.
- **[usage-quota](usage-quota.md) · [tarot](tarot.md) · [saju-c](saju-c.md) · [saju-g](saju-g.md)** — `x-rate-limit.max = 'dynamic'` 10개가 usage-quota 설정 `ipPerMinute` 를 읽는 함수 max. README 5절이 기능별 일일 한도 기본값(50/500/20/5000/90%, 30/300/20/3000/90%, 20/200/10/1000/90%)과 `x-guest-key` 규칙을 외부용으로 옮겨 적었다. 선택 인증 13개가 이 세 모듈의 `actorOf` → `resolveOptionalUser`([tarot.route.ts](../../apps/friendly/src/modules/tarot/tarot.route.ts)·[saju.route.ts](../../apps/friendly/src/modules/saju/saju.route.ts)·[saju-g.route.ts](../../apps/friendly/src/modules/saju-g/saju-g.route.ts)).
- **[vote](vote.md)** — 공유 조회 `GET /share/votes/:token`·투표 제출 `PUT …/ballot` 가 `OPTIONAL_BEARER`. 판정은 route 파일의 자체 `optionalUserId`(`req.jwtVerify()` 만)로 `isOwner` 표시용([vote.route.ts](../../apps/friendly/src/modules/vote/vote.route.ts)).
- **picks** — 플러그인 단위 `app.addHook('onRequest', app.authenticate)` 라 6개 라우트 모두 `security: [{ bearerAuth: [] }]` 를 명시해 `user` 로 잡힌다([picks.route.ts](../../apps/friendly/src/modules/picks/picks.route.ts)) — authOf 3번 규칙으로 `user` 가 되는 유일한 모듈(`modules/` 에서 플러그인 단위 인증 훅은 picks 하나; 3번 규칙의 나머지는 선택 인증 15개).
- **[parking](parking.md)** — `2ff2c31` 재생성으로 +9(전부 공개, `parking` 태그 — `/restaurants/public/:placeId/parking-reviews` 포함). 폴러를 `onListen` 에 둔 이유가 export 스크립트.
- **[sea](sea.md)** — `4a2bff1` 이 `1b621c4` 보다 먼저라 183개 시점부터 2개 포함(`sea.route.ts` 의 summary 5줄은 `1b621c4` 가 추가).
- **[web](web.md) · [mobile](mobile.md)** — 이 문서의 소비자가 아니다. 웹은 운영에서 같은 origin(ninelife.kr), dev 는 Vite `/api` 프록시([vite.config.ts](../../apps/web/vite.config.ts) → localhost:3000)라 CORS 와 무관. 앱은 네이티브 fetch 라 무관하고 Expo Web dev(:8081)만 교차 origin — dev `*` 로 통과. `packages/shared`·`apps/web/src`·`apps/mobile/src` 어디에도 fetch `credentials` 옵션이 없어(기본 same-origin) `credentials:false` 전환에 따른 회귀가 없다.
- **운영 경로** — Cloudflare → nginx `location /api/` → `127.0.0.1:3000`([ops/nginx/niney_life_pickr_v2_projects](../../ops/nginx/niney_life_pickr_v2_projects)). nginx 는 CORS 헤더를 붙이지 않고 OPTIONS 도 그대로 넘긴다(`X-Real-IP $http_cf_connecting_ip`, XFF). `.env` 반영은 [deploy.sh](../../deploy.sh) 5번 ".env만" = `pm2 reload friendly --update-env; pm2 save`, 수동 절차는 [docs/deploy-friendly.md](../../docs/deploy-friendly.md) "`.env` 변경 후 반드시 `pm2 reload friendly --update-env`".
- **[project-overview](project-overview.md)** — `CLAUDE.md` 6번 규칙이 모노레포 작업 규칙 목록에 합류.
- **보안 감사** — [PLAN-perf-security.md](../../docs/PLAN-perf-security.md) 3차 절 LOW #42(CORS)·#44(swagger) — 이번 커밋이 #42 번복 문단을 추가.
- **외부** — `openapi-typescript`(타입 생성)·`openapi-fetch`(README 8절 권장, 기준 URL `https://ninelife.kr`).

소스(위 링크 외): [app.ts](../../apps/friendly/src/app.ts), [swagger.ts](../../apps/friendly/src/plugins/swagger.ts), [README.md](../../docs/api/README.md), [openapi.json](../../docs/api/openapi.json), [parking.route.ts](../../apps/friendly/src/modules/parking/parking.route.ts), [sea.route.ts](../../apps/friendly/src/modules/sea/sea.route.ts)

## API Surface [coverage: high — 11 sources]

### 인증 등급 (x-auth)

| x-auth | endpoints.md 표시 | 스펙 `security` | 판정 근거 | 개수 |
|---|---|---|---|---|
| `public` | 공개 | 없음 | 훅·security 없음 | 83 |
| `optional` | 선택 | `[{}, {bearerAuth: []}]` | schema 에 `OPTIONAL_BEARER` 명시 | 15 |
| `user` | 로그인 | `[{bearerAuth: []}]` | `app.authenticate` 훅 또는 security 명시 | 94 |
| `admin` | (제외) | `[{bearerAuth: []}]` | 경로 prefix 또는 `app.requireAdmin` 훅 | 문서에 없음 |

README 3절의 의미 정의: `선택` = 토큰 없이도 동작하고 유효한 토큰이면 회원 처리(한도 면제·자동 저장·방장 표시), **무효 토큰은 401 이 아니라 게스트**. 로그인 필요 API 는 전부 본인 데이터만(남의 리소스는 403·404). 인증 흐름은 `POST /auth/register`(201 `{ token, user }`, 중복 409) → `POST /auth/login`(200, 틀리면 401) → `Authorization: Bearer`, 갱신(refresh) API 없음, `POST /auth/logout` 은 전 기기 토큰 무효화.

### 도메인(태그)별 엔드포인트 — endpoints.md 절 기준 (2026-09-26, 192개)

| 태그(절) | 경로 | 계 | 공개 | 선택 | 로그인 | 라우트 한도(IP당) |
|---|---|---|---|---|---|---|
| air-location | `/air/location` | 3 | 0 | 0 | 3 | — |
| air-quality | `/air/*` | 8 | 8 | 0 | 0 | 전부 60/분 |
| auth | `/auth/*` | 4 | 2 | 0 | 2 | 로그인 20/분 · 가입 40/시간 |
| bus | `/bus/*` | 5 | 5 | 0 | 0 | 도착·위치 60/분 |
| bus-favorite | `/bus/favorites*` | 6 | 0 | 0 | 6 | — |
| food | `/food/*` | 2 | 0 | 0 | 2 | 검색 120/분 · 역검색 60/분 |
| health | `/health` | 1 | 1 | 0 | 0 | — |
| housing | `/housing/*` | 6 | 6 | 0 | 0 | 지도·주변·거래 240/분 · 검색 120/분 |
| life-map | `/life-map/*` | 6 | 6 | 0 | 0 | 지도·주변 240/분 · 검색 60/분 |
| meal | `/meals*` | 28 | 0 | 0 | 28 | 사진 30/분 · 인식·추천 10/분 · 백업·복원 10/시간 |
| media | `/media/*` | 2 | 2 | 0 | 0 | — |
| parking | `/parking/*` + `/restaurants/public/:placeId/parking-reviews` | 9 | 9 | 0 | 0 | status 외 240/분 |
| picks | `/picks*` | 6 | 0 | 0 | 6 | — |
| public | `/restaurants/public*`·`/restaurants/ranking`·`/restaurants/:placeId/{clusters,qa,qa/ready}`·`/settings/map/public` | 12 | 12 | 0 | 0 | 스마트 픽 60/분 · 리뷰 Q&A 15/분 |
| restaurant-favorite | `/restaurants/favorites*` | 4 | 0 | 0 | 4 | — |
| saju | `/saju-c/*` | 18 | 3 | 8 | 7 | 설정값 7 · 공유 발급 10/분 · 잡 폴링·공유 조회 120/분 |
| saju-g | `/saju-g/*` | 16 | 5 | 3 | 8 | 설정값 2 · 명식 30/분 · 공유 발급·취소 10/분 · 조회·PNG 120/분 |
| sea | `/sea/*` | 2 | 2 | 0 | 0 | 60/분 |
| settlement | `/settlements*`·`/settlement-extraction/*`·`/share/settlements/:token` | 11 | 1 | 0 | 10 | 공유 조회 120/분 |
| settlement-contact | `/me/contacts*` | 3 | 0 | 0 | 3 | — |
| settlement-draft | `/settlement-drafts*` | 3 | 0 | 0 | 3 | — |
| subway | `/subway/*` | 8 | 8 | 0 | 0 | 도착·위치·시간표 60/분 |
| subway-favorite | `/subway/favorites*` | 6 | 0 | 0 | 6 | — |
| tarot | `/tarot/*` | 6 | 1 | 2 | 3 | 설정값 1 · 공유 발급 10/분 · 조회 120/분 |
| tour | `/tour/public/*` + `/restaurants/public/:placeId/tour-stats` | 6 | 6 | 0 | 0 | 120/분 |
| vote | `/votes*`·`/share/votes/:token*` | 5 | 0 | 2 | 3 | 공유 조회 120/분 · 투표 30/분 |
| weather | `/weather/*` | 6 | 6 | 0 | 0 | 60/분 |
| **합계** | | **192** | **83** | **15** | **94** | |

- 태그 이름은 각 route schema 의 `tags[0]` 이지 경로가 아니다: `saju` = 사주(C)(`/saju-c/*`), `public` = 맛집 공개 읽기 + 지도 공개 설정, 맛집 상세 탭용 `tour-stats`·`parking-reviews` 는 각각 `tour`·`parking` 절에 있다.
- 메서드 분포: GET 113 · POST 43 · DELETE 21 · PUT 12 · PATCH 3. 경로(path) 159개.

### 한도(x-rate-limit) 분포

| 한도 | 개수 | 대표 프리셋 (`RATE`) |
|---|---|---|
| 없음 → 전역 1000/분 | 113 | — |
| 60/분 | 24 | `transitRealtime`(대기·날씨·바다·버스/지하철 실시간), `lifeMapSearch`, `publicPick`, `foodRestaurants` |
| 120/분 | 16 | `tourRead`, `publicShare`(공유 조회·PNG·사주(C) 잡 폴링), `housingSearch`, `foodSearch` |
| 240/분 | 13 | `lifeMapRead` 2, `housingRead` 3, `parkingRead` 8 |
| 설정값/분(`dynamic`) | 10 | 타로 1·사주(C) 7·사주(G) 2 — usage-quota `ipPerMinute` |
| 10/분 | 6 | `tarotShare`(세 운세의 공유 발급 + 사주(G) 공유 취소), `mealRecognize`, `mealRecommend` |
| 30/분 | 5 | `publicVote`, `mealPhotoUpload` 2, 사주(G) 명식 2(인라인 `{ max: 30 }`) |
| 10/시간 | 2 | `mealDataArchive` |
| 20/분 · 40/시간 · 15/분 | 1 · 1 · 1 | `authLogin` · `authRegister` · `publicAsk` |

### 선택 인증 15개 (OPTIONAL_BEARER)

- 사주(C) 8: `POST /saju-c/{readings, themes, ask, daily, match, date-pick, food, shares}`
- 사주(G) 3: `POST /saju-g/{readings, pair/readings, shares}`
- 타로 2: `POST /tarot/{readings, shares}`
- 투표 2: `GET /share/votes/:token`, `PUT /share/votes/:token/ballot`

### 문서에 없는 표면

어드민 `/api/v1/admin/**` 전부(SSE 포함 — README 9절 "서버 푸시(SSE)는 어드민 전용"), 공유 미리보기 HTML·PNG(`/r/:placeId`, `/share/settlements/:token(/image.png)`, `/s/`, `/vote/:token`, `/tarot/s/:token(/image.png)`, `/saju-c/s/…`, `/saju-g/s/:token`), prefix 없는 `/health`(`hide`), robots·sitemap·well-known, `/docs`(dev 전용 UI), 요청 헤더 `x-guest-key`(스키마 미선언 — 스펙 전체에 header 파라미터 0개, README 5·9절에만 설명).

소스: [endpoints.md](../../docs/api/endpoints.md), [openapi.json](../../docs/api/openapi.json), [README.md](../../docs/api/README.md), [swagger.ts](../../apps/friendly/src/plugins/swagger.ts), [export-openapi.ts](../../apps/friendly/scripts/export-openapi.ts), [rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts), [tarot.route.ts](../../apps/friendly/src/modules/tarot/tarot.route.ts), [saju.route.ts](../../apps/friendly/src/modules/saju/saju.route.ts), [saju-g.route.ts](../../apps/friendly/src/modules/saju-g/saju-g.route.ts), [vote.route.ts](../../apps/friendly/src/modules/vote/vote.route.ts), [health.route.ts](../../apps/friendly/src/modules/health/health.route.ts)

## Data [coverage: high — 14 sources]

### 생성물 규모 이력

| 시점 | 엔드포인트(공개·선택·로그인) | openapi.json | endpoints.md | 비고 |
|---|---|---|---|---|
| `1b621c4` 2026-09-24 | 183 (74·15·94) | 신규 51,599줄 | 신규 323줄 | README 243줄 동시 작성 |
| `2ff2c31` 2026-09-25 | **192 (83·15·94)** | +2,320줄 → 53,919줄 | +15/−1 → 337줄 | 주차 9개(공개) 추가, README 는 손대지 않음 |
| `420a6be` 2026-09-26 | 변화 없음 | — | — | 새 라우트 `review-match` 는 어드민 |

`git log -- docs/api/` 에는 이 두 커밋뿐이다.

### openapi.json 구조 (2026-09-26 실측, `node` 로 집계)

- `openapi: "3.0.3"`, `info = { title: 'Life Pickr API', version: '0.0.1', description }`, `servers: [{ url: 'https://ninelife.kr' }]`, 최상위 키는 `openapi·info·servers·paths·components` 5개(`tags` 없음).
- `components.securitySchemes.bearerAuth = { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }`, **`components.schemas` 0개** — 모든 요청·응답 스키마가 op 안에 인라인이라 1.96MB 가 됐다.
- paths 159 · operations 192, 192개 전부 `summary` 가 있고 57개는 `description` 도 있다.
- 요청 본문은 전부 `application/json`(55개 op) — multipart 업로드 2개(`POST /meals/photos`, `POST /settlement-extraction/upload`)는 본문을 선언하지 않고 description 에 적었다.
- 응답 코드 선언: 200 186 · 201 4 · 204 2 · 404 13 · 502 26 · 503 40(응답 content type 은 전부 `application/json`).
- **2xx 응답 스키마가 없는 op 21개**(200 `Default Response` 만): 이미지 6(`/meals/photos/:token`·`/thumb`, `/media/panorama/:placeId`, `/media/thumbnail`, `/saju-g/shares/:token/image.png`, `/settlement-extraction/preview/:token`), 업로드 2, 실제로는 204 를 돌려주는 삭제·로그아웃 12(`POST /auth/logout`, `DELETE /me/contacts/:id`·`/picks/:id`·`/saju-c/me/profiles/:id`·`/saju-c/me/readings/:id`·`/saju-g/me/profiles/:id`·`/saju-g/me/readings/:id`·`/saju-g/shares/:token`·`/settlement-drafts/:id`·`/settlements/:id`·`/settlements/:id/share`·`/tarot/me/readings/:id`), `/health` 1. 204 를 스키마에 선언한 건 식단 2개(`DELETE /meals/:id`, `DELETE /meals/photos/:token`)뿐.
- 재귀 스키마 한계: `GET /restaurants/public/:placeId/category-tree` 의 `children` 이 `items: {}`(zod → JSON Schema 변환이 재귀를 못 풀어 any) — README 9절이 명시.

### endpoints.md 형식

머리말 5줄(기준 URL `https://ninelife.kr` · 합계 "엔드포인트 192개 — 공개 83 · 선택 인증 15 · 로그인 94" · 인증/한도/입력 열 읽는 법) + 태그 27절 × 표 `| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |`. 설명 열은 summary 원문이라 "무엇 — 원천·캐시·한도·특이 응답" 형태가 그대로 보인다(예: `단기예보(격자, 시간별·일별) — 기상청 단기예보 API 프록시, 다음 발표까지 캐시`).

### README.md 9절 (수기, 243줄)

1 기준 URL(운영 `https://ninelife.kr` + `/api/v1` 경로, Cloudflare → nginx → friendly:3000; 로컬 `http://localhost:3000`; 버전 정책 없음 — 변경은 openapi.json git diff 로) · 2 CORS · 3 인증(3등급 표·가입/로그인 흐름·JWT 7일·refresh 없음·logout 전 기기·401 메시지 2종·웹 토큰은 origin 별 localStorage 라 공유 안 됨) · 4 요청/응답 규약(JSON, 쿼리 문자열 자동 변환, 에러 본문, 상태 코드 표 400~503, 공공 API 프록시의 `stale: true`, 키 미설정은 `enabled: false` 200) · 5 한도(IP당 레이트리밋 표 + 운세 일일 한도 표 + 식단 인식 30/일·추천 20/일) · 6 도메인 개요(대중교통·생활 정보 / 지도 데이터 / 맛집 / 운세 / 개인 기록) · 7 데이터 출처·이용 조건(공공누리 유형, 여행로그 원본 제3자 제공 금지·집계만, 크롤 데이터 대량 재게시 금지, LLM·공공 API 비용은 이 서버 부담) · 8 타입 쓰기(`npx openapi-typescript` + `openapi-fetch`) · 9 알려진 한계.

### 관련 env

| 키 | 기본값 | 쓰임 |
|---|---|---|
| `CORS_ORIGIN` | `*` | 어드민 외 허용 origin — 비-dev 에서만, `*`·빈 값 = 전부, 콤마 목록 = 그 목록 |
| `PUBLIC_ORIGIN` | `https://ninelife.kr` | 어드민 CORS 허용 origin · export 의 `servers`/endpoints.md 기준 URL · (원래) OG/canonical |
| `NODE_ENV` | `development` | dev 면 CORS 전부 허용·`/docs` 등록, test 면 레이트리밋 미등록 |
| `JWT_EXPIRES_IN` | `7d` | README 3절 "토큰 7일" |

소스: [openapi.json](../../docs/api/openapi.json), [endpoints.md](../../docs/api/endpoints.md), [README.md](../../docs/api/README.md), [export-openapi.ts](../../apps/friendly/scripts/export-openapi.ts), [env.ts](../../apps/friendly/src/config/env.ts), 204 실측은 [auth.route.ts](../../apps/friendly/src/modules/auth/auth.route.ts)·[contact.route.ts](../../apps/friendly/src/modules/contact/contact.route.ts)·[picks.route.ts](../../apps/friendly/src/modules/picks/picks.route.ts)·[saju.route.ts](../../apps/friendly/src/modules/saju/saju.route.ts)·[saju-g.route.ts](../../apps/friendly/src/modules/saju-g/saju-g.route.ts)·[settlement.route.ts](../../apps/friendly/src/modules/settlement/settlement.route.ts)·[settlement-draft.route.ts](../../apps/friendly/src/modules/settlement/settlement-draft.route.ts)·[tarot.route.ts](../../apps/friendly/src/modules/tarot/tarot.route.ts) 의 `reply.code(204)`, 선언된 204 는 [meal.route.ts](../../apps/friendly/src/modules/meal/meal.route.ts)

## Key Decisions [coverage: high — 13 sources]

- **2026-09-25: 문서 재생성은 기능 커밋에 함께 싣고, 업스트림 폴러는 `onListen` 에서만** (`2ff2c31`) — 주차 기능 커밋이 `docs/api` 를 같이 재생성했다(183→192, openapi +2,320줄). 같은 커밋이 실시간·충전기 폴러를 `onReady` 가 아니라 `onListen` 에 걸었다 — `export:openapi` 처럼 `app.ready()` 만 하는 스크립트와 `app.inject()` 테스트가 공공 API 를 부르지 않게(코드 주석). 문서 생성이 "앱을 실제로 부팅" 하는 방식이라 생긴 부팅 단계 규율이다.
- **2026-09-24: 운영 CORS 를 어드민 외 `*` 로 개방 — 감사 #42 의 fail-closed 번복** (`1b621c4`, 사용자 결정) — 근거는 코드 주석과 PLAN 번복 문단: 인증은 `Authorization: Bearer` 헤더뿐이고 쿠키 세션이 없어, `credentials:false` 로 두면 #42 가 걱정한 "모든 사이트가 사용자 세션으로 호출" 이 성립하지 않는다. `'*'` + credentials 조합은 브라우저가 거부하기도 하고, 나중에 쿠키가 생겨도 타 사이트가 그 쿠키로 호출하지 못하게 미리 막아 둔다. **남는 위험은 비용**(LLM·업스트림 쿼터 소진 — 방문자 브라우저마다 IP 가 달라 IP당 한도가 약해짐)이고, 트래픽을 보고 `CORS_ORIGIN` 목록으로 좁힌다. 번복은 [PLAN-perf-security.md](../../docs/PLAN-perf-security.md) 3차 "수정" 절의 CORS 항목 밑에 들여쓴 문단으로 기록됐다.
- **2026-09-24: 어드민만 예외 — `PUBLIC_ORIGIN` 만, 퍼센트 인코딩까지 판정** — 웹은 API 와 같은 origin 이라 CORS 가 원래 필요 없고 어드민을 외부 origin 에 열 이유가 없다(방어심층). 전제는 "어드민 라우트는 SSE 포함 전부 `/api/v1/admin` 아래" 라는 불변식 — [public-admin-route-split](../concepts/public-admin-route-split.md) 의 "prefix 가 가드의 유일한 신호" 가 이제 인증 가드뿐 아니라 CORS 정책 선택·OpenAPI 등급·외부 문서 제외까지 하나의 `isAdminPath` 로 결정한다.
- **2026-09-24: preflight 캐시 600초·레이트리밋 헤더 4종 노출** — 캐시는 "정책을 좁혔을 때 10분 안에 반영되도록 짧게"(주석). `x-ratelimit-limit/remaining/reset`·`retry-after` 를 `Access-Control-Expose-Headers` 로 열어 외부 JS 가 잔량·재시도 시각을 읽게 했다. 요청 헤더는 목록을 두지 않고 반사(`x-guest-key` 같은 새 헤더도 설정 없이 통과).
- **2026-09-24: 스펙 생성기는 전 환경, `/docs` UI 는 dev 전용 유지** — #44("`/docs` + 전체 OpenAPI 가 prod 무인증 노출")의 결론(`bc2db00` 에서 swagger 를 dev 에서만 등록)은 지키면서, 생성기 등록만 모든 환경으로 풀어 export 스크립트·테스트가 운영과 같은 코드 경로로 스펙을 뽑게 했다. 외부 공개는 HTTP 가 아니라 **어드민을 뺀 파일을 리포에 커밋**하는 방식.
- **2026-09-24: 인증 수준·한도는 사람이 쓰지 않고 transform 이 추론** — 훅(`authenticate`/`requireAdmin`)·`config.rateLimit`·경로에서 자동으로 싣고, 사람이 쓰는 건 한국어 `summary`/`description` 과 훅으로 보이지 않는 선택 인증의 `OPTIONAL_BEARER` 뿐. 라우트 표기와 실제 가드가 어긋날 여지를 줄이려는 선택.
- **2026-09-24: 수기 README + 자동 색인·스펙의 분업** — 인증 흐름·에러 계약·한도·이용 조건(공공누리·AI 허브 제3자 제공 금지·크롤 데이터 재게시 주의)·알려진 한계는 코드에서 뽑을 수 없어 수기로, 라우트 목록·스키마는 자동으로. endpoints.md 는 머리말에 "직접 수정하지 말 것" 을 박았다.
- **2026-09-24: 외부 문서의 범위 = `/api/v1/` 아래 비-어드민** — 공유 미리보기 HTML(사람이 여는 링크)·robots·sitemap·well-known 은 API 가 아니라 제외하고, SSE 는 전부 어드민이라 자연히 빠진다.
- **2026-09-24: 한국어 summary 규약** — 비-어드민 라우트가 있는 route 파일 32개의 `schema` 에 "무엇 — 원천·캐시·한도·특이 응답" 꼴의 한 줄 `summary`(192개 op 전부 보유)와, 행동 규칙이 긴 경우 `description`(57개)을 달았다. schema 필드만 바꿔 동작 변경이 없다(`1b621c4` diff 의 삭제 줄은 한 줄 `schema: {…}` 를 여러 줄로 편 것뿐). 규칙화: `CLAUDE.md` 6번.
- **2026-09-24: 앱 연결 테스트는 `src/app.*.test.ts`** — `src/plugins/` 는 autoload·tsup 이 파일을 통째로 플러그인으로 잡으므로 테스트를 둘 수 없다(Architecture §7). `app.cors.test.ts` 는 `vi.hoisted` 로 `CORS_ORIGIN='*'`·`PUBLIC_ORIGIN='https://ninelife.kr'` 을 env 파싱 전에 넣어, 로컬 `.env` 의 dev 용 목록이 아니라 운영 기본값으로 비-dev 분기(테스트는 `NODE_ENV=test`)를 검증한다.
- **2026-09-24: 429 본문도 공통 계약에 맞춘다** (`678ecc0`) — 평객체의 `error` 문자열을 쓰도록 한 줄 분기. 회귀 테스트는 에러 핸들러만 붙인 맨 `Fastify()` 에 평객체를 던지는 방식 — 레이트리밋 플러그인이 테스트에서 미등록이라 실제 429 를 만들 수 없어서다. 같은 파일이 "Error 계열 4xx 는 error = 예외 이름" 도 고정한다.
- **2026-09-24: `.env.example` 기본값을 `CORS_ORIGIN=*` 로** — 이전 예시값 `http://localhost:5173,http://localhost:8081` 을 운영에 그대로 복사했다면 개방이 적용되지 않는다(Gotchas 1).
- (이력) **2026-07-13 `bc2db00`** — 감사 3차가 #42 를 "prod 에서 `*`/미설정이면 `PUBLIC_ORIGIN` 으로 폐쇄" 로, #44 를 "swagger `/docs`+스펙 prod 미등록" 으로 처리했다. 이번 라운드가 #42 는 번복(개방 + credentials false), #44 는 UI 만 유지·생성기는 전 환경으로 바꿨다.

소스: [cors.ts](../../apps/friendly/src/plugins/cors.ts), [swagger.ts](../../apps/friendly/src/plugins/swagger.ts), [error-handler.ts](../../apps/friendly/src/plugins/error-handler.ts), [app.errors.test.ts](../../apps/friendly/src/app.errors.test.ts), [app.cors.test.ts](../../apps/friendly/src/app.cors.test.ts), [PLAN-perf-security.md](../../docs/PLAN-perf-security.md), [CLAUDE.md](../../CLAUDE.md), [parking.route.ts](../../apps/friendly/src/modules/parking/parking.route.ts), [.env.example](../../apps/friendly/.env.example), [README.md](../../docs/api/README.md), [endpoints.md](../../docs/api/endpoints.md), [export-openapi.ts](../../apps/friendly/scripts/export-openapi.ts), [tsup.config.ts](../../apps/friendly/tsup.config.ts)

## Gotchas [coverage: high — 30 sources]

1. **운영 `.env` 의 `CORS_ORIGIN` 이 목록이면 개방되지 않는다** — 비-dev 는 목록이 있으면 그 목록만 허용한다. 운영 `.env` 가 옛 `.env.example`(`http://localhost:5173,http://localhost:8081`)에서 복사됐다면 외부 origin 은 계속 막힌다 → `*` 로 바꾸거나 줄을 지우고(기본 `*`) [deploy.sh](../../deploy.sh) 5번(".env만" = `pm2 reload friendly --update-env`) 로 반영, 기동 로그 `CORS: 어드민 외 모든 origin 허용, 어드민은 https://ninelife.kr 만` 으로 확인. [deploy-friendly.md](../../docs/deploy-friendly.md) 의 "환경 변수" 절은 `CORS_ORIGIN` 을 언급하지 않는다(작업 기록상 운영 확인 미완 ⚠️).
2. **dev 와 운영의 CORS 동작이 다르다** — dev 는 `CORS_ORIGIN` 목록을 무시하고 전부 `*`, 어드민은 요청 origin 을 반사한다. "로컬에서 되니 운영도 된다" 로 판단하면 운영 목록·어드민 제한을 놓친다. 반대로 테스트(`NODE_ENV=test`)는 운영 분기를 탄다 — 로컬 `.env` 의 `CORS_ORIGIN` 이 dev 목록이면 `buildApp` 테스트의 결과가 달라지므로 `app.cors.test.ts` 처럼 import 전에 env 를 고정해야 한다([vitest.config.ts](../../apps/friendly/vitest.config.ts) 는 `.env` 를 읽되 이미 있는 값은 덮지 않는다).
3. **수기 README 가 주차 추가를 따라가지 못했다** — [README.md](../../docs/api/README.md) 파일 표는 여전히 "엔드포인트 색인 … (183개)" 이고, 5절 한도 표(240/분 = "일상지도·집값 지도 조회")와 6절 도메인 개요에 **주차(`/parking/*`) 가 없다** — `2ff2c31` 이 endpoints.md·openapi.json 만 재생성하고 README 를 고치지 않았다(현재 192개, `parkingRead` 240/분).
4. **재생성은 전적으로 수동** — `.github` 워크플로·git 훅·lint-staged 가 없고 turbo 파이프라인에도 export 태스크가 없다. `app.openapi.test.ts` 는 transform 주석(x-auth·x-rate-limit·security)만 검사하고 **커밋된 `docs/api` 와 코드의 일치는 아무도 검사하지 않는다**. 비-어드민 라우트를 바꾸고 `export:openapi` 를 잊으면 외부 문서가 조용히 낡는다(`420a6be` 는 수동으로 "변화 없음" 확인). summary 를 빠뜨린 새 라우트도 막는 장치가 없다 — 현재 192개 전부 summary 가 있는 건 규율의 결과.
5. **export 결과가 로컬 `.env` 에 좌우된다** — `servers` 와 endpoints.md 의 기준 URL 은 실행 환경의 `PUBLIC_ORIGIN` 이다. 로컬 `.env` 에서 `PUBLIC_ORIGIN` 을 바꿔 두고 재생성하면 커밋되는 외부 문서의 기준 URL 이 바뀐다. `tsx --env-file=.env` 라 `.env` 가 없으면 실패하고, env 스키마 검증(`JWT_SECRET` 32자 등)과 `DATABASE_URL` 연결을 거친다. 앱을 실제로 부팅하므로 `onReady` 훅(housing 스케줄러 start·군집 리컨실 예약)이 돈다 — 새 백그라운드 작업을 `onReady` 에 걸면 export·inject 테스트에서도 실행된다(주차가 `onListen` 을 쓴 이유).
6. **`src/plugins/` 에 테스트를 두면 앱이 그 파일을 플러그인으로 로드한다** — autoload 기본 패턴에 테스트 제외가 없고 tsup entry 가 `src/plugins/*.ts` 전체라 dist 에도 빌드된다. 앱 전체를 띄우는 테스트는 `src/app.*.test.ts`, 모듈 단위는 `modules/<domain>/*.test.ts`(route 만 autoload 되는 `matchFilter` 가 있어 안전).
7. **x-auth 는 훅 함수 identity 로 추론** — `onRequest: [app.authenticate]` 처럼 decorator 를 그대로 넣어야 `user` 로 잡힌다. 래퍼 함수로 감싸거나 플러그인 단위 `addHook` 을 쓰면 훅이 안 보여 `public` 으로 문서화된다 → schema 에 `security` 를 명시(picks). 선택 인증 라우트가 `OPTIONAL_BEARER` 를 빠뜨려도 `public` 이 된다. 반대로 문서 등급과 실제 가드는 서로를 검증하지 않는다.
8. **선택 인증 구현이 두 가지** — 타로·사주(C)·사주(G) 13개는 `resolveOptionalUser`(서명·만료 + DB `tokenVersion` 대조 — 로그아웃된 토큰은 게스트), 투표 2개는 route 파일의 `optionalUserId`(`req.jwtVerify()` 만 — tokenVersion 미대조). 투표 쪽은 `isOwner` 표시용이라 접근 제어 영향은 없지만, README 3절의 "무효 토큰은 게스트" 가 투표에선 "서명·만료만 본다" 는 뜻이다.
9. **스펙이 실제 응답과 다른 곳** — (a) 204 를 돌려주는 삭제·로그아웃 12개가 스펙엔 `200 Default Response`(스키마 없음)로 나온다 — `openapi-fetch` 로 상태별 타입 분기를 하면 어긋난다(204 를 선언한 건 식단 삭제 2개뿐). (b) 이미지 6개·업로드 2개·`/health` 는 2xx 응답에 content 자체가 없다 — 이미지 MIME(`image/jpeg`·`image/png`)도 업로드 응답(사진 토큰)의 모양도 스펙에 안 나온다(README 9절은 이미지만 언급). (c) `x-guest-key` 헤더가 스키마에 없다. (d) 재귀 `children` 은 `items: {}`. (e) `components.schemas` 가 비어 있어 `openapi-typescript` 결과에 이름 있는 스키마 타입이 없다 — `paths['/api/v1/…']['get']['responses']['200']…` 로 꺼내야 한다.
10. **태그 이름과 경로가 다르다** — endpoints.md 절 `saju` 는 `/saju-c/*`(사주(C)), `public` 은 맛집 공개 읽기 + `/settings/map/public`, 맛집 상세 탭용 `/restaurants/public/:placeId/tour-stats`·`/parking-reviews` 는 `tour`·`parking` 절에 있다. 경로로 찾으려면 openapi.json 을 검색한다.
11. **(추정) 사주(G) 공유 PNG 가 운영 nginx 에서 정적 location 에 가로채일 수 있다** — docs/api 는 `GET /api/v1/saju-g/shares/:token/image.png` 를 공개 엔드포인트로 나열하고, `saju-g-preview.ts` 도 OG 이미지를 `${origin}${Routes.SajuG.shareImage(token)}`(= 이 `/api/v1` 경로)로 준다. 그런데 리포의 [nginx 설정](../../ops/nginx/niney_life_pickr_v2_projects) ninelife.kr 블록은 `location /api/` 가 `^~` 없는 일반 prefix 이고 뒤에 `location ~* \.(js|css|png|…)$`(정적 캐시)가 있다 — nginx 는 정규식 location 이 `^~` 없는 prefix 보다 우선하므로, [deploy-friendly.md](../../docs/deploy-friendly.md) 가 정산·타로·사주(C) 공유 이미지에 대해 스스로 설명한 "`.png` 로 끝나는 경로는 `^~` 필수(dev OK / prod 404)" 함정에 그대로 해당한다. 같은 문서와 nginx 주석은 "사주(G) PNG 는 기존 /api 프록시를 사용한다" 고 적었다. `.png` 로 끝나는 `/api/v1` 경로는 이 하나뿐. 운영 실측은 하지 않았다 — 실제 서버 설정이 리포와 같다면 `location ^~ /api/` 로 바꾸는 게 해법.
12. **개방 뒤의 비용 노출면** — CORS 는 브라우저만 막으므로 서버·curl 호출은 원래 가능했지만, 개방으로 **임의 웹사이트가 방문자 브라우저를 통해** 호출할 수 있게 됐고 요청 IP 가 방문자마다 흩어져 IP당 한도의 억제력이 약하다. LLM 을 부르는 외부 표면: 공개 `POST /restaurants/:placeId/qa`(임베딩 1 + LLM ≤3콜, 캐시 없음, 일일 한도 없이 IP당 15/분), 선택 인증 타로·사주의 생성 계열 POST(usage-quota 전역 일일 예산이 상한), 로그인 식단 인식·추천(사용자당 30·20/일), 로그인 `POST /settlement-extraction/extract`(비전 LLM 1콜 — 라우트 한도도 일일 한도도 없어 전역 1000/분만, README 6절이 "일일 한도가 없다" 고 명시; 가입은 IP당 40/시간). 반대로 다른 프로젝트가 **자기 서버를 거쳐** 호출하면 그 서버 IP 하나로 합산돼 금방 429 가 난다(README 5절).
13. **던진 5xx 는 500 으로 뭉개진다** — 전역 핸들러는 `statusCode < 500` 만 그대로 돌려준다. README 4절 표의 502/503 은 라우트가 `replyUpstreamError` 로 직접 응답할 때만 나온다 — 새 공공 API 프록시가 `httpErrors.serviceUnavailable()` 을 던지면 외부엔 `500 Something went wrong` 으로 보인다.
14. **429 의 end-to-end 경로는 테스트되지 않는다** — 레이트리밋 플러그인이 테스트에서 미등록이라 실제 헤더(`x-ratelimit-*`·`retry-after`)와 429 본문의 결합은 실구동에서만 확인된다. `app.cors.test.ts` 도 `access-control-expose-headers` 문자열만 본다.
15. **`/docs` 는 dev 에서 어드민까지 전부 보여 준다** — prod·test 는 404(테스트 고정)지만 dev 서버를 외부에 노출하면 전체 표면(어드민 포함)이 무인증으로 보인다. 외부 공유는 `docs/api/` 파일로만.
16. **낡은 서술 주의** — [PLAN-perf-security.md](../../docs/PLAN-perf-security.md) 의 "감사에서 제외/이미 처리됨" 목록(`dev CORS 전체 반사: isDev 게이팅 + prod allowList — 정상`)과 진행 기록 "3차 완료 — CORS prod fail-closed" 는 계획·당시 기록이고, 현행은 3차 절의 2026-09-24 번복 문단이다. [friendly](friendly.md) 토픽의 CORS 서술(2026-05-28 RFC1918 자동 허용, "2026-05-31 갱신"(커밋 `9be2e10`, 2026-05-30)의 dev 전면 반사·비-LAN warn, `credentials: true`, "production 은 env `CORS_ORIGIN` list 로 엄격 차단")도 `1b621c4` 이전 상태다.

소스(위 링크 외): [cors.ts](../../apps/friendly/src/plugins/cors.ts), [.env.example](../../apps/friendly/.env.example), [app.cors.test.ts](../../apps/friendly/src/app.cors.test.ts), [app.openapi.test.ts](../../apps/friendly/src/app.openapi.test.ts), [env.ts](../../apps/friendly/src/config/env.ts), [endpoints.md](../../docs/api/endpoints.md), [openapi.json](../../docs/api/openapi.json), [rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts), [export-openapi.ts](../../apps/friendly/scripts/export-openapi.ts), [housing.route.ts](../../apps/friendly/src/modules/housing/housing.route.ts), [summaries.ts](../../apps/friendly/src/plugins/summaries.ts), [parking.route.ts](../../apps/friendly/src/modules/parking/parking.route.ts), [app.ts](../../apps/friendly/src/app.ts), [tsup.config.ts](../../apps/friendly/tsup.config.ts), [swagger.ts](../../apps/friendly/src/plugins/swagger.ts), [picks.route.ts](../../apps/friendly/src/modules/picks/picks.route.ts), [jwt.ts](../../apps/friendly/src/plugins/jwt.ts), [vote.route.ts](../../apps/friendly/src/modules/vote/vote.route.ts), [auth.route.ts](../../apps/friendly/src/modules/auth/auth.route.ts), [saju-g-preview.ts](../../apps/friendly/src/modules/saju-g/saju-g-preview.ts), [review-search.route.ts](../../apps/friendly/src/modules/review-search/review-search.route.ts), [settlement-extraction.route.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts), [error-handler.ts](../../apps/friendly/src/plugins/error-handler.ts), [reply-upstream-error.ts](../../apps/friendly/src/lib/reply-upstream-error.ts)

## Sources [coverage: high — 63 sources]

외부 문서(생성물·수기):
- [docs/api/README.md](../../docs/api/README.md) — 수기 가이드 9절(기준 URL·CORS·인증·에러·한도·도메인 개요·이용 조건·타입 쓰기·한계). 파일 표의 "183개" 는 낡음.
- [docs/api/endpoints.md](../../docs/api/endpoints.md) — 자동 색인, 192개(공개 83·선택 15·로그인 94), 태그 27절.
- [docs/api/openapi.json](../../docs/api/openapi.json) — 자동, OpenAPI 3.0.3, 53,919줄, paths 159, `components.schemas` 0(통째로 읽지 말 것 — node 로 집계).

생성·정책 코드:
- [apps/friendly/scripts/export-openapi.ts](../../apps/friendly/scripts/export-openapi.ts) — 추출 스크립트(`/api/v1/`·비-어드민 필터, info/servers 교체, endpoints.md 표 생성).
- [apps/friendly/src/plugins/swagger.ts](../../apps/friendly/src/plugins/swagger.ts) — 전 환경 스펙 생성기, transform(`authOf`·`rateLimitOf`), `OPTIONAL_BEARER`, `/docs` dev 전용.
- [apps/friendly/src/plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts) — `isAdminPath`·`buildCorsPolicy`·`delegator`, credentials false, 노출 헤더·preflight 600초.
- [apps/friendly/src/plugins/error-handler.ts](../../apps/friendly/src/plugins/error-handler.ts) — 공통 에러 본문 4분기, 429 평객체 `error` 보존(`678ecc0`).
- [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — `RATE` 20개·전역 1000/분·`clientKey`·429 builder·테스트 미등록.
- [apps/friendly/src/plugins/jwt.ts](../../apps/friendly/src/plugins/jwt.ts) — `authenticate`·`resolveOptionalUser`(tokenVersion)·`requireAdmin`, 401/403 메시지.
- [apps/friendly/src/lib/reply-upstream-error.ts](../../apps/friendly/src/lib/reply-upstream-error.ts) — 502/503/404 를 같은 본문 모양으로 직접 응답.
- [apps/friendly/src/app.ts](../../apps/friendly/src/app.ts) — plugins autoload(필터 없음)·modules `.route` 필터·미리보기 7경로 명시 등록·`trustProxy`.
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) — `CORS_ORIGIN` 기본 `*`(주석)·`PUBLIC_ORIGIN`·`JWT_EXPIRES_IN`·`isDev/isTest`.
- [apps/friendly/.env.example](../../apps/friendly/.env.example) — `CORS_ORIGIN=*` + 주석 3줄(이전 localhost 목록).
- [apps/friendly/package.json](../../apps/friendly/package.json) — `export:openapi` 스크립트.
- [apps/friendly/tsup.config.ts](../../apps/friendly/tsup.config.ts) — entry `src/plugins/*.ts`(테스트 금지 근거).
- [apps/friendly/vitest.config.ts](../../apps/friendly/vitest.config.ts) — `include: src/**/*.test.ts`, `.env` 로드(기존 값 유지).

테스트:
- [apps/friendly/src/app.cors.test.ts](../../apps/friendly/src/app.cors.test.ts) — 7건: 어드민 판정(퍼센트 인코딩)·정책(dev/`*`/목록/빈 값)·실제 preflight·응답 헤더.
- [apps/friendly/src/app.openapi.test.ts](../../apps/friendly/src/app.openapi.test.ts) — 5건: `/docs` 비-dev 404·public/optional(dynamic)/user(picks 포함)/admin(SSE 포함) 주석.
- [apps/friendly/src/app.errors.test.ts](../../apps/friendly/src/app.errors.test.ts) — 2건: 429 평객체 `error` 유지·Error 계열 4xx 는 예외 이름.

규칙·결정 문서:
- [CLAUDE.md](../../CLAUDE.md) — 6번 "외부 API 문서(`docs/api/`)".
- [docs/PLAN-perf-security.md](../../docs/PLAN-perf-security.md) — 3차 LOW #42·#44, 2026-09-24 번복 문단, 3차 완료 기록.
- [docs/deploy-friendly.md](../../docs/deploy-friendly.md) — `location /api/` 예시·`.png` 정규식 우선 함정·`.env` 변경 후 reload.
- [deploy.sh](../../deploy.sh) — 5번 ".env만" = `pm_reload`.
- [ops/nginx/niney_life_pickr_v2_projects](../../ops/nginx/niney_life_pickr_v2_projects) — `/api/` 프록시(^~ 없음)·정적 정규식 location.
- [apps/web/vite.config.ts](../../apps/web/vite.config.ts) — dev `/api` 프록시(웹은 CORS 무관).
- [TECH_STACK.md](../../TECH_STACK.md) — `@fastify/swagger`+`swagger-ui`·`fastify-type-provider-zod`·`@fastify/cors` 스택 표.

선택 인증·판정 예시와 부팅 훅:
- [apps/friendly/src/modules/tarot/tarot.route.ts](../../apps/friendly/src/modules/tarot/tarot.route.ts) — `OPTIONAL_BEARER` 2·`actorOf`·함수 max(dynamic).
- [apps/friendly/src/modules/saju/saju.route.ts](../../apps/friendly/src/modules/saju/saju.route.ts) — 사주(C) 선택 인증 8.
- [apps/friendly/src/modules/saju-g/saju-g.route.ts](../../apps/friendly/src/modules/saju-g/saju-g.route.ts) — 사주(G) 선택 인증 3·인라인 30/분.
- [apps/friendly/src/modules/saju-g/saju-g-preview.ts](../../apps/friendly/src/modules/saju-g/saju-g-preview.ts) — OG 이미지를 `/api/v1/saju-g/shares/:token/image.png` 로.
- [apps/friendly/src/modules/vote/vote.route.ts](../../apps/friendly/src/modules/vote/vote.route.ts) — 선택 인증 2·`optionalUserId`.
- [apps/friendly/src/modules/picks/picks.route.ts](../../apps/friendly/src/modules/picks/picks.route.ts) — 플러그인 단위 인증 훅 + security 명시.
- [apps/friendly/src/modules/health/health.route.ts](../../apps/friendly/src/modules/health/health.route.ts) — `/api/v1/health` summary, `/health` `hide`.
- [apps/friendly/src/modules/auth/auth.route.ts](../../apps/friendly/src/modules/auth/auth.route.ts) — logout 204(스펙은 200).
- [apps/friendly/src/modules/parking/parking.route.ts](../../apps/friendly/src/modules/parking/parking.route.ts) — 폴러 `onListen`(export 대비 주석), 주차 9개.
- [apps/friendly/src/modules/housing/housing.route.ts](../../apps/friendly/src/modules/housing/housing.route.ts) — `onReady` 스케줄러 start.
- [apps/friendly/src/plugins/summaries.ts](../../apps/friendly/src/plugins/summaries.ts) — `onReady` 군집 리컨실 예약.
- [apps/friendly/src/modules/review-clustering/review-clustering.service.ts](../../apps/friendly/src/modules/review-clustering/review-clustering.service.ts) — `scheduleStartupReconcile`(`setTimeout(...).unref()`).
- [apps/friendly/src/modules/review-search/review-search.route.ts](../../apps/friendly/src/modules/review-search/review-search.route.ts) — 공개 Q&A summary/description·어드민 SSE 핸들러 내 인증.
- [apps/friendly/src/modules/restaurant/restaurant.route.ts](../../apps/friendly/src/modules/restaurant/restaurant.route.ts) — `420a6be` 변경은 어드민(`review-match`)뿐 → 재생성 불필요.
- [packages/api-contract/src/schemas/restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts) — `420a6be` 스키마 변경도 어드민 쪽(`RestaurantDetail`·`AdminVisitorReview`·`RestaurantReviewMatch*`).
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts) — 영수증 추출(라우트 한도·일일 한도 없음).

`1b621c4` 에서 summary·description 을 단 나머지 route 파일 21개(동작 변경 없음): [air-location.route.ts](../../apps/friendly/src/modules/air-quality/air-location.route.ts), [air-quality.route.ts](../../apps/friendly/src/modules/air-quality/air-quality.route.ts), [bus.route.ts](../../apps/friendly/src/modules/bus/bus.route.ts), [bus-favorite.route.ts](../../apps/friendly/src/modules/bus/bus-favorite.route.ts), [contact.route.ts](../../apps/friendly/src/modules/contact/contact.route.ts), [food.route.ts](../../apps/friendly/src/modules/food/food.route.ts), [life-map.route.ts](../../apps/friendly/src/modules/life-map/life-map.route.ts), [meal.route.ts](../../apps/friendly/src/modules/meal/meal.route.ts), [meal-recognition.route.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.route.ts), [meal-recommendation.route.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.route.ts), [media.route.ts](../../apps/friendly/src/modules/media/media.route.ts), [restaurant-favorite.route.ts](../../apps/friendly/src/modules/restaurant/restaurant-favorite.route.ts), [review-clustering.route.ts](../../apps/friendly/src/modules/review-clustering/review-clustering.route.ts), [sea.route.ts](../../apps/friendly/src/modules/sea/sea.route.ts), [map.route.ts](../../apps/friendly/src/modules/settings/map.route.ts), [settlement.route.ts](../../apps/friendly/src/modules/settlement/settlement.route.ts), [settlement-draft.route.ts](../../apps/friendly/src/modules/settlement/settlement-draft.route.ts), [subway.route.ts](../../apps/friendly/src/modules/subway/subway.route.ts), [subway-favorite.route.ts](../../apps/friendly/src/modules/subway/subway-favorite.route.ts), [tour-public.route.ts](../../apps/friendly/src/modules/tour/tour-public.route.ts), [weather.route.ts](../../apps/friendly/src/modules/weather/weather.route.ts).

관련 컨셉: [public-admin-route-split](../concepts/public-admin-route-split.md)(어드민 prefix 가 CORS·문서 등급까지 결정) · [zod-ssot-buildless](../concepts/zod-ssot-buildless.md)(zod → OpenAPI → 외부 타입) · [anonymous-usage-quota](../concepts/anonymous-usage-quota.md)(개방 뒤 비용 상한) · [sse-token-auth](../concepts/sse-token-auth.md)(쿠키 없는 인증 — credentials false 의 전제) · [server-only-boot-effects](../concepts/server-only-boot-effects.md)(export 스크립트도 `buildApp` 을 부팅 — 폴러는 `onListen`).
