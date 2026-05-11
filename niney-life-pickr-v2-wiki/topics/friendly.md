---
topic: friendly
last_compiled: 2026-05-09
status: active
aliases: [naver-search-adapter, search-route]
sources_count: 57
---

# friendly — Fastify 백엔드

## Purpose [coverage: high — 7 sources]

`apps/friendly`는 niney-life-pickr-v2 모노레포의 유일한 백엔드 서비스다. Fastify 5 위에 zod 기반 스키마 검증, JWT 인증, Prisma+SQLite 영속화, OpenAPI/Swagger 문서, Playwright 크롤링 런타임, Naver 이미지 썸네일 프록시(sharp), Ollama Cloud 기반 리뷰 요약 + 구조화 분석 + 메뉴 정규화/통계, vworld 지도 SDK 키 관리까지 얹어 web(`apps/web`)과 mobile(`apps/mobile`)이 동시에 호출하는 단일 API를 제공한다.

도메인 표면은 모듈 디렉터리로 나뉜다.

- **auth** — 회원가입/로그인/내 정보/로그아웃 (`Routes.Auth.*`)
- **picks** — 사용자별 "선택지" CRUD + 랜덤 추첨 (`Routes.Picks.*`)
- **admin** — 사용자 목록·역할 변경 (`Routes.Admin.*`, `requireAdmin`)
- **restaurant** — 크롤된 맛집 + 방문자 리뷰 영속화, 요약/분석 진행률 SSE, reanalyze/insights/smart-pick + 메뉴 그룹핑/순위/분석 백필 라우트, **공개 list/detail/insights + 공개 ranking** (`Routes.Restaurant.*`)
- **summary** — 리뷰 단위 AI 요약+구조화 분석 라이프사이클 (HTTP 라우트 없음, 내부 모듈)
- **menu-grouping** — 식당별 메뉴 표기 변형을 LLM으로 canonical 그룹핑 + 순위. 자세한 건 [menu-grouping 토픽](./menu-grouping.md).
- **analytics** — 글로벌 메뉴 통계 + 전역 LLM 머지 + 카테고리 트리. 자세한 건 [analytics 토픽](./analytics.md).
- **media** — Naver CDN 이미지 썸네일 프록시 + 디스크 캐시 (`Routes.Media.*`)
- **settings** — **(NEW)** 외부 지도 SDK 키(vworld) 관리. admin CRUD + 평문 reveal + 공개 키 노출 (`Routes.SettingsMap.*`)
- **health** — 라이브니스 체크 (`Routes.Health`, `/health`)
- **crawl** — 별도 위키 토픽 ([crawl 토픽 참조](./crawl.md))
- **ai** — 별도 위키 토픽 ([ai 토픽 참조](./ai.md))

CLAUDE.md 규약상 모든 모듈은 `*.route.ts`(HTTP) + `*.service.ts`(비즈니스) + `*.test.ts`(Vitest) 트리오로 구성하고, FE/BE가 공유하는 타입/검증 로직은 모두 `@repo/api-contract`의 zod 스키마로만 정의한다. [apps/friendly/package.json](../../apps/friendly/package.json)의 `name: "friendly"`가 워크스페이스 식별자이며, `pnpm dev:api`/`pnpm --filter friendly <cmd>`로 단독 실행한다.

## Architecture [coverage: high — 11 sources]

엔트리 흐름은 `server.ts → buildApp() → autoload(plugins) → autoload(modules/*.route.ts)`로 단방향이다.

- [src/server.ts](../../apps/friendly/src/server.ts) — `buildApp()` 호출 후 `env.HOST:env.PORT`로 listen, SIGTERM/SIGINT에서 `app.close()`로 graceful shutdown. 부팅 실패 시 `process.exit(1)`.
- [src/app.ts](../../apps/friendly/src/app.ts) — Fastify 인스턴스를 만들고 `withTypeProvider<ZodTypeProvider>()`를 적용한 뒤 `validatorCompiler`/`serializerCompiler`를 등록한다. `serializers.req`에서 `?token=` 쿼리스트링을 `[REDACTED]`로 마스킹(SSE 인증용 JWT가 매 로그 라인에 박히지 않도록). `dev`에서는 `pino-pretty` 트랜스포트. 그다음 `@fastify/autoload`로 두 단계 등록:
  1. `plugins/` 디렉터리 전체 자동 로드
  2. `modules/` 하위에서 `*.route.(ts|js)`만 골라 자동 로드 (`dirNameRoutePrefix: false` — URL prefix는 `Routes.*` 상수가 결정)
- [src/types/fastify.d.ts](../../apps/friendly/src/types/fastify.d.ts) — `FastifyInstance`에 `prisma`, `authenticate`, `requireAdmin` 데코레이터, `FastifyRequest.user`에 `{ userId, email, role }` 타입을 선언.

플러그인 레이어 (모두 `fastify-plugin`으로 감싸 데코레이터를 부모 스코프에 노출):

- [plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts) — `env.CORS_ORIGIN`이 `*`이면 `true`, 아니면 콤마 분리. `credentials: true`.
- [plugins/helmet.ts](../../apps/friendly/src/plugins/helmet.ts) — `contentSecurityPolicy: false` (Swagger UI 호환).
- [plugins/sensible.ts](../../apps/friendly/src/plugins/sensible.ts) — `reply.unauthorized()`/`reply.forbidden()`/`app.httpErrors.*`.
- [plugins/jwt.ts](../../apps/friendly/src/plugins/jwt.ts) — `@fastify/jwt` + `authenticate`/`requireAdmin` 데코레이터.
- [plugins/prisma.ts](../../apps/friendly/src/plugins/prisma.ts) — `PrismaClient` 인스턴스, `app.prisma` 노출, `onClose`에 `$disconnect`.
- [plugins/swagger.ts](../../apps/friendly/src/plugins/swagger.ts) — OpenAPI 메타 + `bearerAuth` 시큐리티 스킴, Zod→JSON Schema 변환. UI는 `/docs`.
- [plugins/error-handler.ts](../../apps/friendly/src/plugins/error-handler.ts) — `ZodError`/Fastify validation/4xx/5xx 정규화. dev에서만 5xx 메시지 노출.
- [plugins/empty-body-parser.ts](../../apps/friendly/src/plugins/empty-body-parser.ts) — 빈 `application/json` body를 `{}`로 해석(action 없는 POST용).

모듈 레이어 — 현재 디렉터리:

```
modules/
├── admin/
├── ai/
├── analytics/        ← 글로벌 메뉴 통계 + 전역 LLM 머지 (analytics 토픽)
├── auth/
├── crawl/
├── health/
├── media/
├── menu-grouping/    ← 식당별 메뉴 LLM 그룹핑 + 순위 (menu-grouping 토픽)
├── picks/
├── restaurant/
├── settings/         ← (NEW) 지도 SDK 키 관리 (vworld)
├── summary/
└── user/
```

autoload는 route 파일만 픽업하므로 `summary/`처럼 라우트 파일이 없는 모듈은 외부에서 모듈 싱글턴(`summaryEventsBus`)과 명시적 import로만 접근한다. analytics/menu-grouping/settings 은 자체 `*.route.ts` 가 있어 자동 등록.

**공개 vs admin 라우트 분리 정책** — 같은 도메인이라도 (1) 응답 스키마가 다르거나 (2) 가드만 빠진 게 아니라 캐싱/SEO 정책이 다른 경우에는 별도 라우트로 분리한다. 핸들러 안에서 `if (req.user) {…} else {…}` 분기보다 라우트 자체가 둘이라 OpenAPI/Swagger 가 두 응답 셋을 분리해 표시하고 어드민 회귀 위험이 0이 된다. restaurant 의 `publicList`/`publicByPlaceId`/`publicInsights`/`ranking`, settings 의 `publicConfig` 가 같은 패턴 — 모두 `tags: ['public']` + 가드 미적용으로 마운트되고 service 메소드가 admin 과 다른 평탄화/정렬을 담당한다.

**crawl 모듈 변경 흡수 (2026-05-09 follow-up)** — 자세한 건 [crawl 토픽](./crawl.md). friendly 차원에서 2가지가 바뀌었다:
- 어드민 발견 페이지(`/admin/discover`) 가 호출하는 신규 검색 라우트 GET `/admin/crawl/search` 추가. `crawl.service.ts` 의 `searchPlaces(query, bbox?)` 메소드와 신규 `naver-search.playwright.adapter.ts` (Playwright Chromium 으로 PC 지도 페이지의 captcha 토큰 + 세션 쿠키를 가로채 `/p/api/search/allSearch` 응답을 캡처) 가 조합. 검색당 ~1.1초. onClose 훅에서 기존 `closeBrowser()` 와 함께 `closeSearchBrowser()` 도 호출 (place 어댑터와 검색 어댑터가 별개 Browser 인스턴스).
- `crawl.service.ts` 에서 actor 단위 rate-limit 완전 제거 — `RATE_LIMIT_WINDOW_MS` 상수, `lastCallByActor: Map<string, number>` 인스턴스 필드, startCrawl 진입부 검사 블록 모두 삭제. spam 방어는 in-flight dedup + `MAX_CONCURRENT_PER_ACTOR=3` + FIFO 큐 두 layer 로 충분. `error: 'rate_limited'` enum 은 backward-compat 으로 남아있지만 service 가 emit 하지 않음.

## Talks To [coverage: high — 12 sources]

- **`@repo/api-contract`** — `Routes.*` URL 상수와 모든 zod 스키마(인증/픽/식당/요약/분석/미디어/AI/메뉴 그룹핑/애널리틱스/지도 설정)의 단일 출처. 모든 `*.route.ts`가 import.
- **`@repo/utils`** — `picks.service.ts`의 랜덤 추첨에서 `pickRandom(options)`.
- **Prisma + SQLite** — [prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)는 `provider = "sqlite"`, `DATABASE_URL`은 기본 `file:./data/dev.db`. CLAUDE.md "Docker 추가하지 말 것" 규칙과 짝.
- **bcryptjs** — [src/lib/hash.ts](../../apps/friendly/src/lib/hash.ts)의 `hashPassword`/`verifyPassword`가 10 라운드 솔트.
- **sharp ^0.34** — media 모듈의 썸네일 리사이즈/JPEG 인코딩.
- **Playwright** — crawl 모듈이 사용 ([crawl 토픽](./crawl.md)).
- **Naver Place 페이지 + Naver CDN** — crawl 이 SSR/AJAX, media 가 `phinf.pstatic.net` 호스트군 썸네일 프록시.
- **Naver PC 지도 페이지 (`map.naver.com`) — captcha-aware capture (NEW)** — 검색 어댑터가 Playwright Chromium 으로 `https://map.naver.com/p/search/{query}` 를 띄우고 페이지 자체의 ncaptcha 토큰 + 세션 쿠키를 활용해 첫 `/p/api/search/allSearch` 응답을 가로챈다. 직접 fetch 는 봇 보호로 차단됨.
- **Ollama Cloud** — ai/summary/menu-grouping/analytics 가 LLM 호출.
- **외부 지도 키(vworld)** — settings 가 평문 보관, `publicConfig` 로 공개 페이지에 그대로 흘려 보냄(WMTS 키는 어차피 브라우저 Network 탭에 노출되므로 admin secret 과 보안 등급이 동등).
- **소비자** —
  - `apps/web` 어드민 화면이 `@repo/shared`의 API 클라이언트로 모든 admin 라우트 호출.
  - `apps/web` 어드민 발견 페이지(`AdminDiscoverPage`, `/admin/discover`) 가 신규 GET `/admin/crawl/search` 호출 → 결과 N개 체크 → 한 번에 N개 startCrawl.
  - `apps/web` **공개 화면**(루트 랭킹·맛집 지도·식당 상세)이 `Routes.Restaurant.ranking`/`publicList`/`publicByPlaceId`/`publicInsights` + `Routes.SettingsMap.publicConfig` 호출.
  - `apps/mobile` 도 같은 클라이언트 (CLAUDE.md 핵심 규칙 #2).
- **모듈 간 토폴로지**:
  - `crawl → restaurant` — 크롤이 `RestaurantService.upsertRestaurantFromCrawl(...)`로 마스터 행 upsert, 페이지 단위 `persistReviewBatch(restaurantId, reviews)`로 idempotent insert.
  - `crawl → summary` — `persistReviewBatch`가 돌려준 새 리뷰 id 배열을 `SummaryService.queueSummariesForReviews(placeId, ids)`로 fire-and-forget.
  - `summary → ai` — `summary.service.ts`가 [ai/adapter-cache.ts](../../apps/friendly/src/modules/ai/adapter-cache.ts)의 공유 FIFO 게이트로 LLM 어댑터를 받아 호출. `AiConfigService.getResolved('ollama-cloud')`로 키/모델/concurrency를 해소.
  - `summary → restaurant.route` — `summaryEventsBus`(모듈 싱글턴)가 두 모듈의 결합점. publish는 SummaryService, subscribe는 restaurant SSE 핸들러.
  - `summary → menu-grouping/analytics` — `summary.service.ts`가 export 한 `extractFirstJsonObject`/`normalizeTerm` 을 두 모듈이 재사용 (LLM JSON 응답 파싱·이름 정규화).
  - `restaurant.route → summary` — `Routes.Restaurant.reanalyze(:placeId)` 핸들러가 `summaries.backfillForRestaurant(placeId)`로 구버전(`analysisVersion < ANALYSIS_VERSION`)/failed 행을 재큐잉. `Routes.Restaurant.analyticsBackfill` 은 `summaries.backfillAnalyticsFromExisting()` 으로 기존 `menusJson`/`tipsJson`/`keywordsJson` 을 `MenuMention`/`ReviewTag` 로 풀어쓴다 (LLM 재호출 없음).
  - `restaurant.route → menu-grouping` — `Routes.Restaurant.menusGroup`/`menusRanking` 가 `MenuGroupingService` 를 호출 (식당 단위 그룹핑/순위).
  - `settings.route → settings.service` — 공개/admin 모두 같은 `MapSettingsService.getSecret('vworld')` 를 사용. 차이는 라우트 가드뿐.

## API Surface [coverage: high — 8 sources]

라우트 경로는 모두 `@repo/api-contract`의 [`Routes.*`](../../packages/api-contract/src/routes.ts)에서 가져오므로 이 파일 하나가 클라이언트와 동기화된다.

라우트 트리 (요약, 공개/admin 표기):

```
/api/v1
├── /auth/*                                       (public mix)
├── /admin/users/*                                (admin)
├── /picks/*                                      (bearer)
├── /media/thumbnail                              (public)
├── /restaurants
│   ├── /ranking                                  (public)        ← AI 분포 정렬
│   ├── /public                                   (public)        ← 공개 리스트(NEW)
│   ├── /public/:placeId                          (public)        ← 공개 상세(NEW)
│   ├── /public/:placeId/insights                 (public)        ← 공개 인사이트(NEW)
│   └── /admin/restaurants/*                      (admin)         ← 어드민 CRUD/SSE/smart-pick/...
├── /admin/crawl/*                                (admin)         ← crawl 토픽 (search 라우트 NEW)
├── /admin/ai/*                                   (admin)         ← ai 토픽
├── /admin/analytics/*                            (admin)         ← analytics 토픽
├── /admin/settings/map[/...]                     (admin)         ← (NEW)
├── /settings/map/public                          (public)        ← (NEW)
└── /health                                       (public)
```

### auth — [auth.route.ts](../../apps/friendly/src/modules/auth/auth.route.ts)

| Method | Path                   | Auth   | 설명                                 |
| ------ | ---------------------- | ------ | ------------------------------------ |
| POST   | `Routes.Auth.register` | public | 가입 → `{ token, user }` (201, USER) |
| POST   | `Routes.Auth.login`    | public | 로그인 → `{ token, user }`           |
| GET    | `Routes.Auth.me`       | bearer | 현재 사용자 정보                     |
| POST   | `Routes.Auth.logout`   | bearer | 204 (stateless NOP)                  |

### picks — [picks.route.ts](../../apps/friendly/src/modules/picks/picks.route.ts)

`addHook('onRequest', app.authenticate)`로 모듈 전역 인증. CRUD + `POST :id/random` (`PickResultSchema`).

### admin — [admin.route.ts](../../apps/friendly/src/modules/admin/admin.route.ts)

각 라우트마다 `onRequest: [authenticate, requireAdmin]`. `Routes.Admin.listUsers`, `Routes.Admin.setUserRole(:id)`.

### restaurant — [restaurant.route.ts](../../apps/friendly/src/modules/restaurant/restaurant.route.ts)

공개 라우트 4개 + admin 라우트 다수가 같은 모듈 안에 공존. **공개 라우트는 별도 service 메소드(`getPublicList`/`getPublicDetail`/`getRanking`)** 로 응답 스키마를 평탄화/축소한다 — admin 의 `getDetailByPlaceId`/`list` 와 다른 형태.

| Method | Path (`Routes.Restaurant.*`)                  | Auth          | 설명                                                                              |
| ------ | --------------------------------------------- | ------------- | --------------------------------------------------------------------------------- |
| GET    | `ranking`                                     | **public**    | 식당 단위 sentiment 분포 정렬(`positive`/`negative` ratio). 60s TTL 풀 캐시 + dogpile-guard. |
| GET    | `publicList`                                  | **public**    | **NEW**. 좌표·도로명·썸네일·AI 통계가 함께 들어간 공개 리스트. q/category/bbox 필터, sort=`recent`/`satisfaction`/`positive`/`rating` (null 항상 뒤). |
| GET    | `publicByPlaceId(:placeId)`                   | **public**    | **NEW**. 공개 상세. ReviewSummary 의 운영 메타(status/error/model/startedAt) 제거, `done` 행만 평탄화한 `analysis` (text/sentiment/sentimentScore/satisfactionScore/menus/tips/keywords/finishedAt). |
| GET    | `publicInsights(:placeId)`                    | **public**    | **NEW**. 어드민 `insights` 와 동일 응답 스키마, 가드만 빠짐. mixed 분포는 그대로 카운트(어드민과 동일).      |
| GET    | `list`                                        | bearer+admin  | 맛집 목록 + 행마다 요약 카운트(`pending/Running/Done/Failed`) + sentiment/만족도 평균.        |
| GET    | `byPlaceId(:placeId)`                         | bearer+admin  | 디테일. `reviews[]` (요약/분석 포함, `visitorReviews` 정렬은 `fetchedAt asc`).   |
| DELETE | `delete(:placeId)`                            | bearer+admin  | 캐스케이드 삭제. in-flight 크롤이 같은 placeId면 **409**.                        |
| POST   | `reanalyze(:placeId)`                         | bearer+admin  | 구버전/failed 분석 행을 재큐잉 → `{ ok, queued }`.                                |
| GET    | `insights(:placeId)`                          | bearer+admin  | 식당 단위 인사이트. 메뉴는 `MenuMention` + `MenuCanonical` JOIN 기반.            |
| POST   | `menusGroup(:placeId)`                        | bearer+admin  | 식당 메뉴 LLM canonical 그룹핑 ([menu-grouping](./menu-grouping.md)).             |
| GET    | `menusRanking(:placeId)`                      | bearer+admin  | 그룹된 메뉴 순위 + 통계.                                                          |
| POST   | `analyticsBackfill`                           | bearer+admin  | 기존 done summary 의 menusJson/tipsJson/keywordsJson 을 정규화 테이블로 풀어쓰는 1회 백필. |
| POST   | `smartPick`                                   | bearer+admin  | 분석 점수 가중 랜덤 픽.                                                           |
| GET    | `summaryStatus(:placeId)`                     | bearer+admin  | 요약 진행률 스냅샷.                                                               |
| GET    | `summaryEvents`                               | query token   | Multiplexed SSE. `?placeId=A&placeId=B&…&token=<jwt>`. 페이로드에 `placeId`. |

> 글로벌 통계 라우트 (`/admin/analytics/*`) 와 카테고리 트리는 [analytics 토픽](./analytics.md) 참고.

SSE: 연결 직후 모든 placeId에 `snapshot` 푸시. placeId별 `pendingProgressPush` 슬롯으로 progress 신호 coalesce(`setImmediate` 한 틱당 1회 DB 조회). `review` 신호는 페이로드가 완전하므로 즉시 push (분석 필드 포함). 15초 keep-alive `: hb`.

### settings (NEW) — [settings/map.route.ts](../../apps/friendly/src/modules/settings/map.route.ts)

vworld JS SDK 키. 공개 한 개 + admin 네 개. admin 라우트는 모두 `onRequest: [authenticate, requireAdmin]`.

| Method | Path (`Routes.SettingsMap.*`) | Auth         | 설명                                                                |
| ------ | ----------------------------- | ------------ | ------------------------------------------------------------------- |
| GET    | `list`                        | bearer+admin | 등록된 provider 목록. 행이 없어도 `{ provider:'vworld', hasApiKey:false, … }` 합성. |
| PUT    | `provider(:id)`               | bearer+admin | upsert. `apiKey` 미입력 + 첫 등록은 400. `domains` 만 부분 갱신 가능.    |
| DELETE | `provider(:id)`               | bearer+admin | 행 제거 (`deleteMany`).                                             |
| GET    | `secret(:id)`                 | bearer+admin | **평문 키 reveal**. vworld JS SDK init URL 에 키를 그대로 박아 호출해야 해서 별도 엔드포인트 노출. AI 어댑터의 `apiKeyMasked` 패턴과 다름. |
| GET    | `publicConfig`                | **public**   | `{ provider:'vworld', apiKey }` — 키 미등록이면 404. 공개 맛집 지도 페이지가 부팅 시 한 번 호출. |

### media — [media.route.ts](../../apps/friendly/src/modules/media/media.route.ts) — public

| Method | Path                       | Auth   | 설명                                                                                                                              |
| ------ | -------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `Routes.Media.thumbnail`   | public | `?url=<naver-cdn-url>&w=300&q=78` → JPEG. ALLOWED_HOSTS 화이트리스트, sharp 리사이즈, `data/thumbs/<sha1>.jpg` 디스크 캐시.        |

응답 헤더: `Cache-Control: public, max-age=2592000, immutable`(30일), `ETag: "<key>"`. `If-None-Match` 매칭이면 304. 업스트림 실패는 502. 호스트 화이트리스트(`ALLOWED_HOSTS`)에 `phinf.pstatic.net`, `pup-review-phinf.pstatic.net`, `review-phinf.pstatic.net`, `ldb-phinf.pstatic.net`, `search.pstatic.net`, `video-phinf.pstatic.net`. 업스트림 fetch는 5초 timeout, 10MB 상한.

### health — [health.route.ts](../../apps/friendly/src/modules/health/health.route.ts)

`Routes.Health` (`{ status, uptime, timestamp }`) + `/health` (스모크 프로브, Swagger hide).

## Data [coverage: high — 11 sources]

[prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) 모델 — 코어:

| 모델 | 테이블 | 핵심 필드 / 인덱스 | 비고 |
| ---- | ------ | -------------------- | ---- |
| `User` | `users` | `email @unique`, `role Role @default(USER)` | picks Cascade |
| `Pick` | `picks` | `userId @index`, `options String`(JSON) | options 는 stringify 된 string[] |
| `PickResult` | `pick_results` | `pickId @index`, `chosen` | Pick Cascade |
| `Role` | enum | `USER \| ADMIN` | |
| `LlmProviderConfig` | `llm_provider_configs` | `provider @unique`, `apiKey`, `defaultModel?`, `enabled`, `maxConcurrent` | env fallback 있음. ai 모듈 ([ai 토픽](./ai.md)) |
| **`MapProviderConfig`** | **`map_provider_configs`** | **`provider @unique`, `apiKey`(평문), `domains?`, `updatedAt`, `updatedById?`** | **NEW**. settings 모듈. env fallback **없음** |
| `Restaurant` | `restaurants` | `placeId @unique`, `snapshotJson`, `firstCrawledAt`, `lastCrawledAt @updatedAt` | 메뉴/블로그/영업시간/이미지/좌표는 snapshotJson 안 |
| `VisitorReview` | `visitor_reviews` | `restaurantId @index`, `externalId?`, `contentHash`, `videosJson String @default("[]")` | dedup `@@unique([restaurantId, externalId])` + `@@unique([restaurantId, contentHash])` |
| `ReviewSummary` | `review_summaries` | `reviewId @unique`(1:1), `status`, `sentiment?`, `sentimentScore? Float`, `satisfactionScore? Int`, `menusJson?`/`tipsJson?`/`keywordsJson?`, `analysisVersion?` | `ANALYSIS_VERSION = 4` |
| `MenuMention` | `menu_mentions` | `summaryId`/`restaurantId` + `name`/`nameNorm`/`sentiment`/`traitsJson` | summary done 시 menusJson 평탄화 사본 |
| `ReviewTag` | `review_tags` | `kind` ('tip'/'keyword') + `term`/`termNorm` | tip+keyword 통합 |
| `MenuCanonical` | `menu_canonicals` | `(restaurantId, nameNorm)` unique | 식당 내 canonical |
| `GlobalMenuCanonical` | `global_menu_canonicals` | `globalKey @unique`, `categoryPath?` | 전역 canonical |
| `GlobalMenuCanonicalLink` | `global_menu_canonical_links` | `menuCanonicalId @unique` + `globalCanonicalId @index` | 다대일 링크 |

캐스케이드 체인 — `Restaurant 삭제 → VisitorReview → ReviewSummary → MenuMention/ReviewTag` 그리고 `Restaurant → MenuCanonical → GlobalMenuCanonicalLink` 모두 SQLite FK로 자동 처리. `MapProviderConfig` 는 캐스케이드 무관 (`updatedById` 는 nullable + FK 미선언, 사용자 삭제 시 그냥 dangling reference).

마이그레이션 (최근순):
- **`20260508173216_add_map_provider_configs`** — **(NEW)** `MapProviderConfig` 테이블
- `20260509_add_global_menu_category_path` — `GlobalMenuCanonical.categoryPath` 추가
- `20260509_add_global_menu_canonicals` — `GlobalMenuCanonical` + `GlobalMenuCanonicalLink`
- `20260509_add_menu_canonicals` — `MenuCanonical` (식당 내 그룹핑)
- `20260509_add_analytics_tables` — `MenuMention` + `ReviewTag`
- [20260508122321_add_visitor_review_videos](../../apps/friendly/prisma/migrations/20260508122321_add_visitor_review_videos/migration.sql) — `videosJson` 컬럼
- [20260508095207_add_review_analysis_fields](../../apps/friendly/prisma/migrations/20260508095207_add_review_analysis_fields/migration.sql) — sentiment/menus/tips/keywords/analysisVersion
- [20260506205226_add_restaurant_review_summary](../../apps/friendly/prisma/migrations/20260506205226_add_restaurant_review_summary/migration.sql)
- [20260506191413_add_llm_provider_config](../../apps/friendly/prisma/migrations/20260506191413_add_llm_provider_config/migration.sql)

디스크 영속:
- `apps/friendly/data/dev.db` — SQLite DB 파일
- `apps/friendly/data/thumbs/<sha1>.jpg` — media 모듈 썸네일 캐시

JWT payload: `{ userId: string; email: string; role: 'USER' | 'ADMIN' }` (`request.user`도 동일).

환경 변수 — [src/config/env.ts](../../apps/friendly/src/config/env.ts)의 `EnvSchema` (zod):

| 키                            | 기본값               | 비고                                                                |
| ----------------------------- | -------------------- | ------------------------------------------------------------------- |
| `NODE_ENV`                    | `development`        | `development` \| `production` \| `test`                             |
| `PORT`                        | `3000`               |                                                                     |
| `HOST`                        | `0.0.0.0`            |                                                                     |
| `DATABASE_URL`                | (필수)               |                                                                     |
| `JWT_SECRET`                  | (필수)               | **min 32 chars**                                                    |
| `JWT_EXPIRES_IN`              | `7d`                 |                                                                     |
| `CORS_ORIGIN`                 | `*`                  | 콤마 분리 화이트리스트 또는 `*`                                     |
| `LOG_LEVEL`                   | `info`               | pino level                                                          |
| `OLLAMA_CLOUD_API_KEY`        | `''`                 | DB의 `LlmProviderConfig.apiKey`가 비어있을 때 fallback              |
| `OLLAMA_CLOUD_BASE_URL`       | `https://ollama.com` |                                                                     |
| `OLLAMA_CLOUD_TIMEOUT_MS`     | `60000`              |                                                                     |
| `OLLAMA_CLOUD_MAX_CONCURRENT` | `15`                 |                                                                     |
| `OLLAMA_DEFAULT_MODEL`        | `''`                 |                                                                     |

**vworld 키는 env 변수 없음** — `MapProviderConfig` DB 행이 유일한 출처. 첫 등록 전엔 `publicConfig` 가 404.

## Key Decisions [coverage: high — 18 sources]

- **Zod = 단일 진실 (SSOT)** — 라우트 스키마(`body`/`params`/`response`)는 모두 `@repo/api-contract`. `fastify-type-provider-zod`의 `validatorCompiler`/`serializerCompiler`가 런타임 검증 + TS 타입 추론 + OpenAPI 자동 생성을 한 번에 처리.
- **autoload 두 단계** — `plugins/`는 무조건 전부, `modules/`는 `matchFilter: /\.route\.(ts|js)$/`로 route 파일만. `summary` 모듈은 라우트 파일이 없어 autoload 영향권 밖이고 외부에서는 모듈 싱글턴(`summaryEventsBus`) + 명시적 import로만 접근.
- **모듈 레이아웃** — CLAUDE.md 규칙대로 모듈마다 `*.route.ts` + `*.service.ts` + `*.test.ts` 트리오. 인증 패턴 세 가지: picks는 모듈 전역 `addHook`, admin/restaurant/settings 은 라우트별 `onRequest`, summary-events SSE는 핸들러 안에서 직접 토큰 검증.
- **공개 라우트는 별도 라우트로 분리, 응답 스키마도 다르게** — restaurant 의 `publicList`/`publicByPlaceId`/`publicInsights`/`ranking`, settings 의 `publicConfig` 모두 admin 라우트와 path 자체가 다르고 service 메소드도 별개(`getPublicList`/`getPublicDetail` vs `list`/`getDetailByPlaceId`). 이유:
  - **응답이 다르다.** 공개 list 는 좌표·썸네일·도로명이 들어가고 운영 메타(요약 진행 카운트/분석 실패 카운트)가 빠진다. 공개 detail 은 `ReviewSummary` 의 status/errorCode/errorMessage/model/startedAt 같은 운영 메타를 떼고 분석 안 된 행은 `analysis: null` 로 본문만 노출.
  - **어드민 회귀 위험 0.** 공개 화면이 가벼워지더라도 admin 응답 셋이 그대로라 화면 회귀 가능성 없음.
  - **캐싱 정책 분리 가능.** `ranking` 은 60s TTL 메모리 캐시 + dogpile guard 가 들어갔지만 admin `list` 는 매 요청 새로 집계 — 공유 캐시면 admin 의 통계가 stale 해진다.
  - **OpenAPI 표면이 깔끔.** `tags: ['public']` vs `['admin']` 으로 분류돼 Swagger UI 에서 두 응답 셋이 분리 표시.
- **공개 list 의 메모리 파싱 + bbox 필터 + 좁힌 ids 만 분석 집계** — 좌표/대표 사진/도로명은 `Restaurant.snapshotJson` 안에 묻혀 있어 SQL where 로 거를 수 없다. 모든 행을 가져와 메모리에서 파싱 → bbox 필터 → 통과한 ids 만 `reviewSummary.findMany({ status:'done' })` 로 집계. **bbox 통과 후의 ids 만 집계해서 검색 범위 밖 식당의 분석 통계 호출을 회피**한다 (대규모 도시 단위 통계 호출이 검색바운드별로 따로 잡히게 됨). 식당 수가 수백 단위까지는 메모리 처리로 충분.
- **공개 detail 의 mixed sentiment 분포는 카운트 안 함** — 어드민 detail/insights 는 `mixed` 도 분포에 포함하지만, 공개 list 의 카운트는 `positive/negative/neutral` 만 표시한다. 라이트한 UI 표면에서 4범주가 시각적으로 무거워 신호/잡음 비가 나쁘다는 판단. (공개 insights 는 어드민과 같은 응답 스키마라 mixed 그대로 노출 — 화면이 의도된 4분포 차트.)
- **vworld 키는 LlmProviderConfig 와 같은 DB-backed 패턴이지만 env fallback 없음** — vworld JS SDK 키는 운영자가 발급받아 도메인 화이트리스트와 짝지어 직접 등록하는 1:1 자원이라 `.env` 기본값 개념이 어색하다. AI 키는 dev/test 환경에서 임시 키 fallback 이 유용하지만 vworld 는 도메인 페어링이 다르면 어차피 동작하지 않음 → 첫 등록 전엔 공개 라우트가 404, 등록 후엔 평문 그대로 흘려 보냄.
- **vworld secret 라우트는 평문 reveal** — AI 키 라우트는 `apiKeyMasked` (예: `sk-…abcd`) 만 돌려주고 평문은 한 번 입력 후 분실. vworld 는 SDK init URL 에 키를 그대로 박아 호출하므로 admin 화면이 평문을 다시 받아와야 한다 → `Routes.SettingsMap.secret(:id)` 라우트가 `{ provider, apiKey, domains }` 를 평문으로 반환. admin 가드 통과 시에만.
- **vworld `publicConfig` 는 admin secret 과 보안 등급이 동등** — WMTS 키는 어차피 브라우저 Network 탭에서 노출된다. admin 만 본다고 해서 더 비밀이 되는 게 아니므로 공개 라우트로 분리만 하고(가드 적용해야 동작 안 함) 평문 그대로 반환.
- **JWT `?token=` 쿼리 + 로그 redaction** — `EventSource`(SSE)는 커스텀 헤더 불가하므로 토큰을 쿼리스트링에 싣는다. [src/app.ts](../../apps/friendly/src/app.ts)의 `serializers.req`가 `([?&]token=)[^&]+ → $1[REDACTED]`로 마스킹.
- **Multiplexed Summary SSE** — 한 admin이 여러 식당을 동시 모니터링할 때 placeId마다 `EventSource`를 열면 HTTP/1.1 6 connection 제한에 걸린다. `?placeId=A&placeId=B&…` 한 번에 보내고 서버가 placeId 수만큼 subscribe. 이벤트 페이로드에 `placeId`를 포함해 클라이언트가 demux.
- **요약 이벤트 두 종류** — [summary-events-bus.ts](../../apps/friendly/src/modules/summary/summary-events-bus.ts)의 `progress`(카운트만 변경)와 `review`(특정 행 done/failed + 분석 필드 동봉). 후자가 있어 클라이언트가 디테일 GET 재요청 없이 캐시 머지 가능.
- **리뷰 dedup = externalId + contentHash 이중 키** — Naver review id가 있으면 `(restaurantId, externalId)`, 없거나 익명이면 `(restaurantId, sha1(authorName + body))`. SQLite는 `createMany skipDuplicates` 미지원 → in-memory pre-filter + row-by-row create + P2002 silent skip 패턴.
- **1 review = 1 ReviewSummary** — `reviewId @unique` 1:1. 재요약/재분석은 같은 row를 `upsert`로 덮어쓴다. 재크롤은 `clearReviewsAndSummaries`로 통째로 날린 뒤 새로.
- **Summary placeId-level 직렬화** — `runChainByPlace: Map<string, Promise<void>>`로 같은 placeId 의 batch 들을 then-chaining. 다른 placeId 는 여전히 병렬. 페이지마다 `queueSummariesForReviews` 가 떠도 자기 chunk 만 'running' 으로 마킹돼 진행 표시가 일관된다. Fastify `app.log`(pino) 주입으로 `[summary] queue start/chunk start/chunk done/queue finished` 라인이 콘솔에 박힌다.
- **리뷰 단위 자동 재시도 3회** — `attemptOnce` 헬퍼 + `attemptForReview` 재시도 루프. parse_failed/upstream/timeout 모두 대상. 백오프 = `300 * attempt + Math.floor(Math.random() * 200)` ms. 어댑터의 동시성-한도 백오프와 별개.
- **`ANALYSIS_VERSION = 4` (v4)** — v3→v4 변경점: (1) `menus[].sentiment` 를 LLM JSON schema/zod 양쪽에서 **필수 + non-null** 강제 (positive/negative/neutral 셋 중 하나만). 모델이 모호할 때도 'neutral' 로 빠지도록 — 메뉴 단위 통계의 입력 품질 확보. (2) `menus[].traits` (맛/특징 태그, string[]) 추가 — sentiment 와 직교해 "독특한 맛" 처럼 호불호 표현을 보존. 프롬프트도 few-shot 4개로 재구성하고 traits 단서가 없을 때 빈 배열을 명시. v3 잔존 행은 `backfillForRestaurant` 로 재분석되거나 `analyticsBackfill` 로 정규화 테이블에만 풀어쓸 수 있다.
- **Ollama structured output + numCtx=4096** — `provider.complete({ format: ANALYSIS_JSON_SCHEMA })` 로 토큰 샘플링 단계에서 출력 모양을 잡는다. `temperature: 0.2`, `maxTokens: 1500`, `numCtx: 4096` (Ollama 기본 2048 은 시스템 프롬프트 600토큰 + 긴 리뷰가 들어가면 입력에서 잘려 분석이 무의미해진다 — 회귀 핸들). 파서는 `<think>...</think>` reasoning 블록 제거 + 균형 괄호 추적으로 첫 완전 JSON 객체 추출.
- **`extractFirstJsonObject` / `normalizeTerm` 공유 export** — summary.service.ts 가 두 헬퍼를 export 해 menu-grouping/analytics 모듈이 같은 LLM 응답 파싱 + 이름 정규화 (소문자/공백/특수문자 제거) 를 재사용한다. 동의어 사전(예: "세트"="SET")은 별도 작업으로 미룸.
- **`getInsights` MenuCanonical 기반으로 갈아탔다** — 기존엔 done summary의 `menusJson` 을 행마다 파싱해서 메모리에서 그룹핑했다. 이제는 `MenuMention` + `MenuCanonical` JOIN. 매핑이 있으면 `canonicalNorm` 으로 그룹, 없으면 `nameNorm` fallback (가장 빈번한 원문 표기를 displayName 으로). sentiment 분포·평균 점수·tips/keywords 는 여전히 `ReviewSummary` 행에서 직접 집계 — 분석 필드는 1:1 이라 정규화 테이블 없이 충분.
- **분석 정규화 테이블 도입 동기** — `menusJson`/`tipsJson`/`keywordsJson` 파싱은 식당 단위 통계엔 충분하지만, 글로벌 메뉴 순위·키워드 검색·전역 LLM 머지엔 GROUP BY 가능한 행 단위가 필요하다. summary done 시 같은 트랜잭션 안에서 `delete + reinsert` 로 동기화. 기존 데이터는 `Routes.Restaurant.analyticsBackfill` (LLM 미호출, JSON → row 변환만) 로 1회 채운다.
- **Summary는 fire-and-forget + 공유 FIFO 게이트** — `queueSummariesForReviews`는 즉시 반환, 내부 `run()`은 `void Promise.catch(() => undefined)`. 어댑터 풀은 [adapter-cache.ts](../../apps/friendly/src/modules/ai/adapter-cache.ts)를 공유해 `LlmProviderConfig.maxConcurrent`로 동시성 제어 ([ai 토픽](./ai.md)).
- **Media는 디스크 캐시 + sharp** — lru-cache가 아닌 `data/thumbs/<sha1>.jpg` 파일 캐시. 이유: (1) 썸네일은 잠재적으로 GB 단위라 메모리에 안 맞음, (2) restart에도 살아남음, (3) 단일 인스턴스라 cache invalidation 문제 없음. ALLOWED_HOSTS로 SSRF 차단, 5초 timeout, 10MB 상한, `If-None-Match`로 304 지원.
- **crawl 의 actor 단위 rate-limit 제거 (2026-05-09)** — 어드민 발견 페이지의 정상 사용 패턴이 "검색 결과 N개 체크 → 한 번에 N개 startCrawl" 이라 어떤 윈도우 길이도 둘째부터 차단됐다. spam 방어는 in-flight dedup + max_concurrent FIFO 큐 두 layer 로 이미 충분 — `RATE_LIMIT_WINDOW_MS`/`lastCallByActor` Map 필드 제거. 자세한 건 [crawl 토픽](./crawl.md).
- **No Docker / No Redis** — CLAUDE.md 규칙. SQLite + 단일 인스턴스 + `lru-cache` 또는 디스크 캐시.
- **dev = `tsx watch`, prod = `tsup` 번들** — [tsup.config.ts](../../apps/friendly/tsup.config.ts), `target: node22`, ESM, sourcemap on. `start`는 `node --env-file=.env dist/server.js`.
- **Vitest는 `extensionAlias` + 수동 .env 로드** — [vitest.config.ts](../../apps/friendly/vitest.config.ts)는 `verbatimModuleSyntax`로 ESM-style `.js` 임포트를 쓰는 코드베이스를 위해 `resolve.extensionAlias: { '.js': ['.ts','.js'] }`, `server.deps.inline: [/^@repo\//]`. `.env`는 config 상단에서 수동 파싱.

## Gotchas [coverage: medium — 9 sources]

- **`snapshotJson` 파손 시 좌표/사진만 null fallback** — 공개 list 의 `getPublicList` 가 모든 행에 대해 `JSON.parse(snapshotJson)` 을 돈다. 손상된 행이 있어도 try/catch 안에서 좌표/도로명/썸네일만 null 로 두고 다른 필드(name/category/address/rating/reviewCount)는 살린다. 결과적으로 손상된 행도 리스트에 노출되지만 지도 마커는 안 찍힘.
- **bbox NaN/length 방어** — `query.bbox` 는 zod regex 통과한 입력이라 정상 파싱되지만 방어적으로 `parts.length === 4 && parts.every(Number.isFinite)` 체크. 한 토큰이라도 무효면 bbox 무시하고 전체 통과 (필터 미적용 대신 빈 결과를 보여주면 UX 가 나쁨).
- **공개 list 정렬에서 null 은 항상 뒤** — `pickPublicSort` 의 `nullsLast` 헬퍼. `satisfaction`/`positive`/`rating` 정렬은 분석 안 된 식당이 0점인 양 위로 올라오면 빈 자리처럼 보인다. `recent` 는 `firstCrawledAt` 이 항상 NOT NULL 이라 nullsLast 무관.
- **공개 detail 의 `analysis` 는 done 한정** — `summary.status === 'done'` + 모든 분석 필드 NOT NULL 일 때만 `PublicReviewAnalysis` 로 평탄화. 한 필드라도 비면 `analysis: null` 로 떨어져 본문만 보인다. 운영 메타(`status`/`errorCode`/`model`/`startedAt`) 는 응답 스키마에서 아예 제거 — 공개 페이지가 "분석 실패" 같은 디버깅 정보를 볼 일 없음.
- **공개 detail mixed 카운트 누락은 의도** — 공개 list 의 sentiment 카운트(`positiveCount`/`negativeCount`/`neutralCount`)는 mixed 를 빼고 집계. 공개 insights 는 어드민과 같은 응답 스키마라 mixed 가 들어가지만, 공개 detail/list 의 화면 위젯은 3분포 막대만 그린다.
- **vworld `publicConfig` 키 미등록 시 404 → FE 가드 필요** — admin 이 키를 한 번도 등록하지 않은 상태에서 공개 맛집 지도 페이지가 부팅하면 `Routes.SettingsMap.publicConfig` 가 404 를 돌려준다. 클라이언트는 키 없는 상태(빈 배경 지도) 로 폴백하거나 "관리자에게 문의" 메시지를 띄워야 한다 (자동 마운트 실패하면 vworld JS SDK 가 콘솔 에러).
- **vworld 도메인 화이트리스트는 단순 메모** — `MapProviderConfig.domains` 는 콤마 구분 자유 입력. 서버는 검증/사용 안 하고 단지 admin 화면이 키 발급 시 등록한 도메인을 기억하기 위한 노트필드. 실제 도메인 페어링은 vworld 측에서 강제.
- **공개 vs admin getInsights — 응답 스키마는 같지만 가드만 다르다** — `publicInsights(:placeId)` 와 `insights(:placeId)` 는 같은 `RestaurantInsights` 응답을 돌려주고 service 도 `getInsights()` 한 메소드를 공유. 둘 다 mixed 카운트 포함. 둘을 따로 둔 이유는 단지 admin 가드를 빼야 게스트가 호출 가능하기 때문.
- **Windows에서 Prisma DLL lock (EPERM)** — `prisma generate`/`db:migrate`가 dev 서버의 `query_engine-windows.dll.node` 때문에 실패. dev watch 프로세스를 먼저 죽이고 마이그레이션. 분석 정규화/canonical 테이블 4개 + map_provider_configs 마이그레이션이 연달아 추가된 시기엔 특히 자주 부딪힌다.
- **`extractFirstJsonObject` cross-module 의존성** — summary.service.ts 가 export 한 헬퍼를 menu-grouping/analytics 가 import 한다. summary 의 파서를 손대면 두 모듈도 함께 회귀 테스트해야 한다 (양쪽 다 LLM JSON 응답을 받는 형태가 같음).
- **v3 행 + v4 코드 공존** — `analysisVersion` null/3 인 done 행은 `menus[].sentiment` 가 null 일 수 있다. `getInsights`/`MenuMention` 저장 경로가 모두 null 을 'neutral' 로 폴백. 정확한 통계가 필요하면 `Routes.Restaurant.reanalyze` 로 LLM 재호출하거나 `analyticsBackfill` 로 정규화만 채운다.
- **`JWT_SECRET` 32자 미만 → 부팅 실패** — env zod에서 `process.exit(1)`.
- **회원가입은 무조건 USER** — 첫 ADMIN은 [scripts/promote-admin.ts](../../apps/friendly/scripts/promote-admin.ts)로.
- **`?token=` 마스킹은 app.ts에만 있다** — 외부 트레이스/메트릭 경로로 `req.url`이 흘러나가면 마스킹이 안 먹는다.
- **DELETE restaurant ↔ in-flight crawl = 409** — `jobRegistry.findInFlightByPlace`로 큐 대기/실행 중 잡까지 확인. cascade delete + 동시 INSERT가 FK race를 만든다. 캐스케이드 범위가 이번에 늘었다 (`MenuMention`/`ReviewTag`/`MenuCanonical`/`GlobalMenuCanonicalLink` 까지) — 큰 식당 삭제 시 트랜잭션 시간이 더 늘어날 수 있음.
- **summary 모듈은 라우트 미노출** — autoload 픽업 대상이 아니므로 HTTP 인터페이스를 추가하려면 새 `*.route.ts`나 기존 모듈(restaurant) 라우트에 얹어야 한다. 현재 reanalyze/insights/smart-pick + analyticsBackfill 은 restaurant 라우트가 호스팅한다.
- **`createMany skipDuplicates` SQLite 미지원** — 위 dedup 패턴(in-memory pre-filter + P2002 silent skip)으로 우회.
- **Ollama `num_ctx` 기본 2048 함정** — 시스템 프롬프트(~600토큰) + 긴 리뷰가 입력 단계에서 잘리면 분석 출력이 늘 깨졌다. `numCtx: 4096` + `maxTokens: 1500` 명시로 해결. Ollama에선 `num_ctx = 입력+출력 합`이라 둘 다 명시해야 한다.
- **autoload는 vite resolve를 우회한다** — `@fastify/autoload`는 동적 `import()`를 직접 호출하므로 vitest의 `extensionAlias`/`deps.inline` 변환이 적용되지 않는다. `buildApp()`을 통째로 부팅하는 통합 테스트는 ESM/.js resolve에서 깨지기 쉬움. 대안은 ai/settings 모듈처럼 minimal Fastify 인스턴스를 만들어 필요한 plugin/route만 명시적으로 register.
- **media `data/thumbs/` 디렉터리 누적** — 캐시 만료/제거 로직이 없다. 운영에서 디스크 모니터링 필요. 키는 `sha1(url|w=…|q=…)`이라 같은 원본을 다른 width로 요청하면 별도 파일이 쌓인다.
- **media는 public(인증 없음)** — Naver 리뷰 이미지는 공개 자원이고 `<img>` 로 불러야 해서 의도된 결정. ALLOWED_HOSTS 화이트리스트가 SSRF 가드의 전부.
- **`tsx watch`는 `src/`만 감시한다** — workspace 패키지(`@repo/*`) 변경은 자동 reload되지 않으므로 수동 재시작 필요.
- **crawl 검색 라우트의 ncaptcha 의존** — 검색 어댑터가 PC 지도 페이지를 띄워 captcha 토큰 + 세션 쿠키를 캡처하는 방식이라, 네이버가 captcha UI/응답 형태를 바꾸면 그날부터 GET `/admin/crawl/search` 가 죽는다. friendly 운영 단에선 어드민 발견 페이지가 빈 결과를 받게 됨. 자세한 건 [crawl 토픽](./crawl.md).

## Sources [coverage: high — 57 sources]

- [apps/friendly/package.json](../../apps/friendly/package.json)
- [apps/friendly/tsconfig.json](../../apps/friendly/tsconfig.json)
- [apps/friendly/tsup.config.ts](../../apps/friendly/tsup.config.ts)
- [apps/friendly/vitest.config.ts](../../apps/friendly/vitest.config.ts)
- [apps/friendly/.env.example](../../apps/friendly/.env.example)
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)
- [apps/friendly/prisma/migrations/20260508173216_add_map_provider_configs/migration.sql](../../apps/friendly/prisma/migrations/20260508173216_add_map_provider_configs/migration.sql)
- [apps/friendly/prisma/migrations/20260508122321_add_visitor_review_videos/migration.sql](../../apps/friendly/prisma/migrations/20260508122321_add_visitor_review_videos/migration.sql)
- [apps/friendly/prisma/migrations/20260508095207_add_review_analysis_fields/migration.sql](../../apps/friendly/prisma/migrations/20260508095207_add_review_analysis_fields/migration.sql)
- [apps/friendly/prisma/migrations/20260506205226_add_restaurant_review_summary/migration.sql](../../apps/friendly/prisma/migrations/20260506205226_add_restaurant_review_summary/migration.sql)
- [apps/friendly/prisma/migrations/20260506191413_add_llm_provider_config/migration.sql](../../apps/friendly/prisma/migrations/20260506191413_add_llm_provider_config/migration.sql)
- `apps/friendly/prisma/migrations/*_add_analytics_tables/migration.sql`
- `apps/friendly/prisma/migrations/*_add_menu_canonicals/migration.sql`
- `apps/friendly/prisma/migrations/*_add_global_menu_canonicals/migration.sql`
- `apps/friendly/prisma/migrations/*_add_global_menu_category_path/migration.sql`
- [apps/friendly/scripts/promote-admin.ts](../../apps/friendly/scripts/promote-admin.ts)
- [apps/friendly/src/server.ts](../../apps/friendly/src/server.ts)
- [apps/friendly/src/app.ts](../../apps/friendly/src/app.ts)
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts)
- [apps/friendly/src/lib/hash.ts](../../apps/friendly/src/lib/hash.ts)
- [apps/friendly/src/types/fastify.d.ts](../../apps/friendly/src/types/fastify.d.ts)
- [apps/friendly/src/plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts)
- [apps/friendly/src/plugins/empty-body-parser.ts](../../apps/friendly/src/plugins/empty-body-parser.ts)
- [apps/friendly/src/plugins/error-handler.ts](../../apps/friendly/src/plugins/error-handler.ts)
- [apps/friendly/src/plugins/helmet.ts](../../apps/friendly/src/plugins/helmet.ts)
- [apps/friendly/src/plugins/jwt.ts](../../apps/friendly/src/plugins/jwt.ts)
- [apps/friendly/src/plugins/prisma.ts](../../apps/friendly/src/plugins/prisma.ts)
- [apps/friendly/src/plugins/sensible.ts](../../apps/friendly/src/plugins/sensible.ts)
- [apps/friendly/src/plugins/swagger.ts](../../apps/friendly/src/plugins/swagger.ts)
- [apps/friendly/src/modules/auth/auth.route.ts](../../apps/friendly/src/modules/auth/auth.route.ts)
- [apps/friendly/src/modules/auth/auth.service.ts](../../apps/friendly/src/modules/auth/auth.service.ts)
- [apps/friendly/src/modules/auth/auth.test.ts](../../apps/friendly/src/modules/auth/auth.test.ts)
- [apps/friendly/src/modules/picks/picks.route.ts](../../apps/friendly/src/modules/picks/picks.route.ts)
- [apps/friendly/src/modules/picks/picks.service.ts](../../apps/friendly/src/modules/picks/picks.service.ts)
- [apps/friendly/src/modules/health/health.route.ts](../../apps/friendly/src/modules/health/health.route.ts)
- [apps/friendly/src/modules/admin/admin.route.ts](../../apps/friendly/src/modules/admin/admin.route.ts)
- [apps/friendly/src/modules/admin/admin.service.ts](../../apps/friendly/src/modules/admin/admin.service.ts)
- [apps/friendly/src/modules/restaurant/restaurant.route.ts](../../apps/friendly/src/modules/restaurant/restaurant.route.ts)
- [apps/friendly/src/modules/restaurant/restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts)
- [apps/friendly/src/modules/restaurant/restaurant.test.ts](../../apps/friendly/src/modules/restaurant/restaurant.test.ts)
- [apps/friendly/src/modules/summary/summary.service.ts](../../apps/friendly/src/modules/summary/summary.service.ts)
- [apps/friendly/src/modules/summary/summary-events-bus.ts](../../apps/friendly/src/modules/summary/summary-events-bus.ts)
- [apps/friendly/src/modules/summary/summary.test.ts](../../apps/friendly/src/modules/summary/summary.test.ts)
- [apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts)
- [apps/friendly/src/modules/analytics/](../../apps/friendly/src/modules/analytics/)
- [apps/friendly/src/modules/media/media.route.ts](../../apps/friendly/src/modules/media/media.route.ts)
- [apps/friendly/src/modules/media/media.test.ts](../../apps/friendly/src/modules/media/media.test.ts)
- [apps/friendly/src/modules/settings/map.route.ts](../../apps/friendly/src/modules/settings/map.route.ts)
- [apps/friendly/src/modules/settings/map.service.ts](../../apps/friendly/src/modules/settings/map.service.ts)
- [apps/friendly/src/modules/settings/map.test.ts](../../apps/friendly/src/modules/settings/map.test.ts)
- [apps/friendly/src/modules/ai/adapter-cache.ts](../../apps/friendly/src/modules/ai/adapter-cache.ts)
- [apps/friendly/src/modules/crawl/adapters/naver-search.playwright.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/naver-search.playwright.adapter.ts)
- [apps/friendly/scripts/dev-capture-search.ts](../../apps/friendly/scripts/dev-capture-search.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)
