---
topic: friendly
last_compiled: 2026-05-17
status: active
aliases: [naver-search-adapter, search-route]
sources_count: 67
---

# friendly — Fastify 백엔드

## Purpose [coverage: high — 7 sources]

`apps/friendly`는 niney-life-pickr-v2 모노레포의 유일한 백엔드 서비스다. Fastify 5 위에 zod 기반 스키마 검증, JWT 인증, Prisma+SQLite 영속화, OpenAPI/Swagger 문서, Playwright 크롤링 런타임, Naver 이미지 썸네일 프록시(sharp), Ollama Cloud 기반 리뷰 요약 + 구조화 분석 + 메뉴 정규화/통계, vworld 지도 SDK 키 관리, **multi-source 가게 통합(canonical)** 까지 얹어 web(`apps/web`)과 mobile(`apps/mobile`)이 동시에 호출하는 단일 API를 제공한다.

도메인 표면은 모듈 디렉터리로 나뉜다.

- **auth** — 회원가입/로그인/내 정보/로그아웃 (`Routes.Auth.*`)
- **picks** — 사용자별 "선택지" CRUD + 랜덤 추첨 (`Routes.Picks.*`)
- **admin** — 사용자 목록·역할 변경 (`Routes.Admin.*`, `requireAdmin`)
- **restaurant** — 크롤된 맛집 + 방문자 리뷰 영속화, 요약/분석 진행률 SSE, reanalyze/insights/smart-pick + 메뉴 그룹핑/순위/분석 백필 라우트, **공개 list/detail/insights + 공개 ranking** (`Routes.Restaurant.*`)
- **summary** — 리뷰 단위 AI 요약+구조화 분석 라이프사이클 (HTTP 라우트 없음, 내부 모듈)
- **menu-grouping** — 식당별 메뉴 표기 변형을 LLM으로 canonical 그룹핑 + 순위. 자세한 건 [menu-grouping 토픽](./menu-grouping.md).
- **analytics** — 글로벌 메뉴 통계 + 전역 LLM 머지 + 카테고리 트리. 자세한 건 [analytics 토픽](./analytics.md).
- **canonical** — cross-source 가게 동일성(canonical) + 자동 매칭 제안 큐. CanonicalService + ProposalService. 자세한 건 [canonical 토픽](./canonical.md).
- **auto-discover** — **(NEW)** 어드민 키워드 한 줄 + 카테고리 칩 입력으로 AI 키워드 8 개 생성 → 다중 검색 → dedupe → 등록된 placeId 분리 → 그룹 5 개씩 직렬 크롤까지 한 잡으로 묶는 자동 발견 워크플로. 자세한 건 [auto-discover 토픽](./auto-discover.md).
- **media** — Naver CDN 이미지 썸네일 프록시 + 디스크 캐시 (`Routes.Media.*`)
- **settings** — 외부 지도 SDK 키(vworld) 관리. admin CRUD + 평문 reveal + 공개 키 노출 (`Routes.SettingsMap.*`)
- **health** — 라이브니스 체크 (`Routes.Health`, `/health`)
- **crawl** — 별도 위키 토픽 ([crawl 토픽 참조](./crawl.md))
- **ai** — 별도 위키 토픽 ([ai 토픽 참조](./ai.md))

CLAUDE.md 규약상 모든 모듈은 `*.route.ts`(HTTP) + `*.service.ts`(비즈니스) + `*.test.ts`(Vitest) 트리오로 구성하고, FE/BE가 공유하는 타입/검증 로직은 모두 `@repo/api-contract`의 zod 스키마로만 정의한다. [apps/friendly/package.json](../../apps/friendly/package.json)의 `name: "friendly"`가 워크스페이스 식별자이며, `pnpm dev:api`/`pnpm --filter friendly <cmd>`로 단독 실행한다.

## Architecture [coverage: high — 14 sources]

엔트리 흐름은 `server.ts → buildApp() → autoload(plugins) → autoload(modules/*.route.ts)`로 단방향이다.

- [src/server.ts](../../apps/friendly/src/server.ts) — `buildApp()` 호출 직후 `await cleanupStaleReviewSummaries(app.prisma, app.log)` 로 DB 의 stale 요약 행을 정리한 뒤 `env.HOST:env.PORT`로 listen, SIGTERM/SIGINT에서 `app.close()`로 graceful shutdown. 부팅 실패 시 `process.exit(1)`.
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
├── auto-discover/    ← (NEW) AI 키워드 → 다중 검색 → 그룹 직렬 크롤 자동 발견 잡 (auto-discover 토픽)
├── canonical/        ← cross-source 가게 통합 + 자동 매칭 제안 (canonical 토픽)
├── crawl/
├── health/
├── media/
├── menu-grouping/    ← 식당별 메뉴 LLM 그룹핑 + 순위 (menu-grouping 토픽)
├── picks/
├── restaurant/
├── settings/         ← 지도 SDK 키 관리 (vworld)
├── summary/
└── user/
```

autoload는 route 파일만 픽업하므로 `summary/`처럼 라우트 파일이 없는 모듈은 외부에서 모듈 싱글턴(`summaryEventsBus`)과 명시적 import로만 접근한다. analytics/menu-grouping/settings/canonical 은 자체 `*.route.ts` 가 있어 자동 등록.

**가게 동일성 매칭 라이브러리** — [src/lib/matching.ts](../../apps/friendly/src/lib/matching.ts) 는 모듈에 속하지 않는 순수 유틸. 가게명 정규화(`normalizeName` — 소문자/공백/구두점 제거 + 분점 suffix `본점/지점/점` 제거) + bigram Jaccard 이름 유사도(`nameSimilarity`) + Haversine 거리(`distanceMeters`) + 둘을 0.6/0.4 가중한 `scoreMatch` 와 임계(`MATCH_THRESHOLDS`: 좌표 있을 때 score ≥ 0.45 + 거리 ≤ 500m, 좌표 없으면 name ≥ 0.7). `restaurant.list()` 의 1차 suggestion 산출과 canonical 의 ProposalService 가 둘 다 호출.

**공개 vs admin 라우트 분리 정책** — 같은 도메인이라도 (1) 응답 스키마가 다르거나 (2) 가드만 빠진 게 아니라 캐싱/SEO 정책이 다른 경우에는 별도 라우트로 분리한다. 핸들러 안에서 `if (req.user) {…} else {…}` 분기보다 라우트 자체가 둘이라 OpenAPI/Swagger 가 두 응답 셋을 분리해 표시하고 어드민 회귀 위험이 0이 된다. restaurant 의 `publicList`/`publicByPlaceId`/`publicInsights`/`ranking`, settings 의 `publicConfig` 가 같은 패턴.

**crawl 모듈 변경 흡수 (2026-05-15)** — 자세한 건 [crawl 토픽](./crawl.md). friendly 차원에선 `CrawlService` 생성자에 `ProposalService` 가 추가 주입돼 (`new CrawlService(restaurants, summaries, jobRegistry, proposals)`) 신규 등록 후크에서 자동 매칭 후보를 적재한다. 캐치테이블/다이닝코드 검색·상세 라우트(2026-05-09 ~ 2026-05-14) 외에 새 라우트는 없음.

**crawl 모듈 변경 흡수 (2026-05-17)** — `CrawlService` 생성자에 `CanonicalService` 가 한 번 더 주입돼 (`new CrawlService(restaurants, summaries, jobRegistry, proposals, canonical)`) 신규 메소드 `tryAutoMatchDiningcode(canonicalId)` 가 Naver 잡 done 후크에서 fire-and-forget 으로 호출된다 — 같은 canonical 의 다이닝코드 형제가 아직 없으면 DC 검색 어댑터로 후보를 찾아 자동 매칭 + 머지까지 한 트랜잭션으로 처리. 자세한 건 [crawl 토픽](./crawl.md) / [canonical 토픽](./canonical.md).

**restaurant 모듈 변경 흡수 (2026-05-17)** — 신규 파일 [restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts) 가 canonical 그룹(Naver + DC 형제) 을 단일 public detail 로 융합하는 순수 함수 군을 모아둔다 — `mergeName`/`mergeCategory`/`mergeAddress`/`mergePhone`/`mergeRating`/`mergeReviewCount`/`mergeCoordinates`/`mergeBusinessHours`/`mergeMenus`/`mergePhotos`/`mergeBlogReviews`, sources 배열 빌더 `computeSources`, 저장 리뷰 카운트 합산 `computeStoredReviewCount`, DC 전용 addon 빌더 `composeDiningcodeAddon`. service 는 row 두 개를 읽은 뒤 파싱된 데이터만 넘겨 호출 → 단위 테스트 [restaurant.merge.test.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.test.ts) 가 DB 없이 머지 규칙만 검증.

## Talks To [coverage: high — 13 sources]

- **`@repo/api-contract`** — `Routes.*` URL 상수와 모든 zod 스키마(인증/픽/식당/요약/분석/미디어/AI/메뉴 그룹핑/애널리틱스/지도 설정/canonical)의 단일 출처. 모든 `*.route.ts`가 import.
- **`@repo/utils`** — `picks.service.ts`의 랜덤 추첨에서 `pickRandom(options)`.
- **Prisma + SQLite** — [prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)는 `provider = "sqlite"`, `DATABASE_URL`은 기본 `file:./data/dev.db`. CLAUDE.md "Docker 추가하지 말 것" 규칙과 짝.
- **bcryptjs** — [src/lib/hash.ts](../../apps/friendly/src/lib/hash.ts)의 `hashPassword`/`verifyPassword`가 10 라운드 솔트.
- **sharp ^0.34** — media 모듈의 썸네일 리사이즈/JPEG 인코딩.
- **Playwright** — crawl 모듈이 사용 ([crawl 토픽](./crawl.md)).
- **Naver Place 페이지 + Naver CDN** — crawl 이 SSR/AJAX, media 가 `phinf.pstatic.net` 호스트군 썸네일 프록시.
- **Naver PC 지도 페이지 (`map.naver.com`)** — 검색 어댑터가 Playwright Chromium 으로 captcha 토큰 + 세션 쿠키 캡처. 직접 fetch 는 봇 보호로 차단됨.
- **Diningcode / Catchtable** — crawl 의 추가 소스. 자세한 건 [crawl 토픽](./crawl.md).
- **Ollama Cloud** — ai/summary/menu-grouping/analytics 가 LLM 호출.
- **외부 지도 키(vworld)** — settings 가 평문 보관, `publicConfig` 로 공개 페이지에 그대로 흘려 보냄.
- **소비자** —
  - `apps/web` 어드민 화면이 `@repo/shared`의 API 클라이언트로 모든 admin 라우트 호출 (canonical merge 패널 포함).
  - `apps/web` **공개 화면**(루트 랭킹·맛집 지도·식당 상세)이 `Routes.Restaurant.ranking`/`publicList`/`publicByPlaceId`/`publicInsights` + `Routes.SettingsMap.publicConfig` 호출.
  - `apps/mobile` 도 같은 클라이언트 (CLAUDE.md 핵심 규칙 #2).
- **모듈 간 토폴로지**:
  - `crawl → restaurant` — 크롤이 `upsertRestaurantFromCrawl(...)` (네이버) / `upsertRestaurantFromDiningcode(...)` (다이닝코드) 로 마스터 행 upsert. 둘 다 신규 행 생성 시 nested `canonical: { create: {...} }` 로 자기 전용 CanonicalRestaurant 1행을 같이 만든다 (1:1 시작).
  - **`crawl → canonical (ProposalService → CanonicalService)`** — `CrawlService` 가 등록 후크에서 `ProposalService` 를 호출, ProposalService 가 `lib/matching.ts` 로 후보 점수 계산 후 임계(0.45) 이상이면 `CanonicalMergeProposal` 행을 status=`open` 으로 적재. 자동 머지는 안 하고 검토 큐에 적재만. 어드민 수락 시 `CanonicalService.merge(A,B)` 로 두 canonical 중 한쪽이 다른 쪽으로 흡수. ProposalService → CanonicalService 단방향 의존.
  - `crawl → summary` — `persistReviewBatch`가 돌려준 새 리뷰 id 배열을 `SummaryService.queueSummariesForReviews(busKey, ids)`로 fire-and-forget. busKey 는 네이버=`placeId`, 다이닝코드=`dc:<vRid>`.
  - `summary → ai` — `summary.service.ts`가 [ai/adapter-cache.ts](../../apps/friendly/src/modules/ai/adapter-cache.ts)의 공유 FIFO 게이트로 LLM 어댑터를 받아 호출.
  - `summary → restaurant.route` — `summaryEventsBus`(모듈 싱글턴)가 두 모듈의 결합점. publish는 SummaryService, subscribe는 restaurant SSE 핸들러. SSE 가 placeId 외에 **canonicalId 도 받아** `getRestaurantsByCanonicalIds` 로 묶인 모든 source 행 (네이버 + 다이닝코드) 의 bus key 를 union 구독.
  - `summary → menu-grouping/analytics` — `extractFirstJsonObject`/`normalizeTerm` 공유 export.
  - `restaurant.route → summary` — `reanalyze`/`analyticsBackfill` 라우트가 summary 메소드 호출.
  - `restaurant.route → menu-grouping` — `menusGroup`/`menusRanking`.
  - `settings.route → settings.service` — 공개/admin 모두 같은 `MapSettingsService.getSecret('vworld')`.
  - **`auto-discover → ai + crawl + restaurant + crawl/job-registry`** — `AutoDiscoverService` 는 (1) `AiConfigService` 로 LLM 키워드 8개 생성, (2) `naver-search.http.adapter` 로 키워드별 검색, (3) `RestaurantService.findRegisteredByPlaceIds` 로 dedupe, (4) `CrawlService.startCrawl` + `crawl/job-registry.subscribe` 로 그룹 5 병렬·그룹 직렬 크롤, (5) `RestaurantService.findByPlaceId` 로 등록 결과 확인. fire-and-forget 백그라운드 실행, 라우트는 즉시 snapshot 응답 + SSE 로 진행률 push. 자세한 건 [auto-discover 토픽](./auto-discover.md).
  - `server.ts → summary` — 부팅 직후 `cleanupStaleReviewSummaries(app.prisma, app.log)` 로 stale 행 정리.

## API Surface [coverage: high — 8 sources]

라우트 경로는 모두 `@repo/api-contract`의 [`Routes.*`](../../packages/api-contract/src/routes.ts)에서 가져온다.

라우트 트리 (요약, 공개/admin 표기):

```
/api/v1
├── /auth/*                                       (public mix)
├── /admin/users/*                                (admin)
├── /picks/*                                      (bearer)
├── /media/thumbnail                              (public)
├── /restaurants
│   ├── /ranking                                  (public)        ← AI 분포 정렬
│   ├── /public                                   (public)        ← 공개 리스트
│   ├── /public/:placeId                          (public)        ← 공개 상세
│   ├── /public/:placeId/insights                 (public)        ← 공개 인사이트
│   └── /admin/restaurants/*                      (admin)         ← 어드민 CRUD/SSE/smart-pick/...
├── /admin/crawl/*                                (admin)         ← crawl 토픽
├── /admin/canonical/*                            (admin)         ← canonical 토픽
├── /admin/auto-discover/jobs[/:id[/events]]      (admin + SSE)   ← (NEW) auto-discover 토픽
├── /admin/ai/*                                   (admin)         ← ai 토픽
├── /admin/analytics/*                            (admin)         ← analytics 토픽
├── /admin/settings/map[/...]                     (admin)
├── /settings/map/public                          (public)
└── /health                                       (public)
```

restaurant 의 admin `list` 응답은 multi-source 통합 형태로 진화 — 한 행 = 한 canonical, 그 안에 `sources[]` 배열로 네이버/다이닝코드 행이 들어가고 `candidateCount`/`suggestion` (top1 매칭 후보) + 발견 리스트 카드용 다이닝코드 형제 카운트 합산도 포함. 공개 표면(`publicList`/`publicByPlaceId`/`ranking`/`smartPick`)도 detail 단계에선 같은 canonical 그룹의 DC 형제를 함께 읽어 [restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts) 의 머지 함수 군으로 단일 응답으로 융합한다 (list/ranking 은 여전히 `source = 'naver'` 필터 + `placeId` 키). canonical 자체 라우트는 [canonical 토픽](./canonical.md) 참고.

### auth — [auth.route.ts](../../apps/friendly/src/modules/auth/auth.route.ts)

| Method | Path                   | Auth   | 설명                                 |
| ------ | ---------------------- | ------ | ------------------------------------ |
| POST   | `Routes.Auth.register` | public | 가입 → `{ token, user }` (201, USER) |
| POST   | `Routes.Auth.login`    | public | 로그인 → `{ token, user }`           |
| GET    | `Routes.Auth.me`       | bearer | 현재 사용자 정보                     |
| POST   | `Routes.Auth.logout`   | bearer | 204 (stateless NOP)                  |

### picks — [picks.route.ts](../../apps/friendly/src/modules/picks/picks.route.ts)

`addHook('onRequest', app.authenticate)`로 모듈 전역 인증. CRUD + `POST :id/random`.

### admin — [admin.route.ts](../../apps/friendly/src/modules/admin/admin.route.ts)

각 라우트마다 `onRequest: [authenticate, requireAdmin]`. `Routes.Admin.listUsers`, `Routes.Admin.setUserRole(:id)`.

### restaurant — [restaurant.route.ts](../../apps/friendly/src/modules/restaurant/restaurant.route.ts)

| Method | Path (`Routes.Restaurant.*`)                  | Auth          | 설명                                                                              |
| ------ | --------------------------------------------- | ------------- | --------------------------------------------------------------------------------- |
| GET    | `ranking`                                     | **public**    | 60s TTL + dogpile-guard. 네이버 전용.                                             |
| GET    | `publicList`                                  | **public**    | 좌표·도로명·썸네일·AI 통계. q/category/bbox/sort. 네이버 전용. nullsLast.        |
| GET    | `publicByPlaceId(:placeId)`                   | **public**    | 공개 상세. `analysis` 는 done 행만 평탄화.                                        |
| GET    | `publicInsights(:placeId)`                    | **public**    | 어드민 `insights` 와 동일 응답 스키마, 가드만 빠짐.                                |
| GET    | `list`                                        | bearer+admin  | **multi-source 통합 리스트**. 한 행 = 한 canonical + `sources[]` + `candidateCount`/`suggestion`. |
| GET    | `byPlaceId(:placeId)`                         | bearer+admin  | 디테일 (네이버 단일 행).                                                          |
| DELETE | `delete(:placeId)`                            | bearer+admin  | 캐스케이드 삭제. in-flight 크롤이 같은 placeId면 **409**.                        |
| POST   | `reanalyze(:placeId)`                         | bearer+admin  | 구버전/failed 분석 행 재큐잉.                                                     |
| GET    | `insights(:placeId)`                          | bearer+admin  | MenuMention + MenuCanonical JOIN.                                                 |
| POST   | `menusGroup(:placeId)`                        | bearer+admin  | 식당 메뉴 LLM canonical 그룹핑.                                                   |
| GET    | `menusRanking(:placeId)`                      | bearer+admin  | 그룹된 메뉴 순위.                                                                 |
| POST   | `analyticsBackfill`                           | bearer+admin  | menus/tips/keywords JSON → 정규화 테이블 1회 백필.                                |
| POST   | `smartPick`                                   | bearer+admin  | 가중 랜덤 픽. 네이버 전용.                                                        |
| GET    | `summaryStatus(:placeId)`                     | bearer+admin  | 요약 진행률 스냅샷.                                                               |
| GET    | `summaryEvents`                               | query token   | Multiplexed SSE. `?placeId=…&canonicalId=…&token=<jwt>`. canonicalId 는 묶인 모든 source 의 bus key 를 union 구독. **named `heartbeat` 이벤트 5 초 주기** (comment `: hb` 가 아니라 클라이언트 EventSource 콜백으로 노출되는 이벤트 이름) — FE 가 idle timeout 으로 서버 다운 자동 감지. |

> 글로벌 통계 라우트는 [analytics 토픽](./analytics.md), 가게 통합/제안 라우트는 [canonical 토픽](./canonical.md), 자동 발견 잡 라우트는 [auto-discover 토픽](./auto-discover.md) 참고.

### settings — [settings/map.route.ts](../../apps/friendly/src/modules/settings/map.route.ts)

vworld JS SDK 키. 공개 한 개 + admin 네 개 (`list`/`provider(:id) PUT|DELETE`/`secret(:id) GET` 평문 reveal/`publicConfig`).

### media — [media.route.ts](../../apps/friendly/src/modules/media/media.route.ts) — public

`?url=<naver-cdn-url>&w=300&q=78` → JPEG. ALLOWED_HOSTS 화이트리스트, sharp 리사이즈, `data/thumbs/<sha1>.jpg` 디스크 캐시. `Cache-Control: 30일 immutable`, `ETag`, 304. 업스트림 5초 timeout, 10MB 상한.

### health — [health.route.ts](../../apps/friendly/src/modules/health/health.route.ts)

`Routes.Health` + `/health` (스모크 프로브).

## Data [coverage: high — 13 sources]

[prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) 모델 — 코어:

| 모델 | 테이블 | 핵심 필드 / 인덱스 | 비고 |
| ---- | ------ | -------------------- | ---- |
| `User` | `users` | `email @unique`, `role Role` | picks Cascade |
| `Pick` | `picks` | `userId @index`, `options` JSON | User Cascade |
| `PickResult` | `pick_results` | `pickId @index` | Pick Cascade |
| `Role` | enum | `USER \| ADMIN` | |
| `LlmProviderConfig` | `llm_provider_configs` | `provider @unique`, `apiKey`, `maxConcurrent` | env fallback |
| `MapProviderConfig` | `map_provider_configs` | `provider @unique`, `apiKey`(평문), `domains?` | env fallback **없음** |
| **`CanonicalRestaurant`** | **`canonical_restaurants`** | **`id`, `name`, `primaryCategory?`, `latitude?`, `longitude?`, `searchKey?`, `suggestionDismissedAt?`, `@@index([searchKey])`, `@@index([latitude, longitude])`** | **NEW**. cross-source "같은 가게" 의 단일 진실. 자세한 건 [canonical 토픽](./canonical.md) |
| **`CanonicalMergeProposal`** | **`canonical_merge_proposals`** | **`canonicalAId`+`canonicalBId` (정규화: A<B), `score`/`nameScore`/`distanceM?`, `status` (open/accepted/rejected/superseded), `@@unique([A,B])`, `@@index([status])`** | **NEW**. 자동 매칭 검토 큐. 둘 FK 모두 **Cascade** (한쪽 canonical 사라지면 제안 자동 삭제) |
| `Restaurant` | `restaurants` | `id`, **`source` (NEW, default 'naver')**, **`sourceId` (NEW)**, `placeId?` (nullable; 네이버만 채움), **`canonicalId` (NEW, NOT NULL)**, `snapshotJson`, `lastCrawledAt @updatedAt`, **`@@unique([source, sourceId])`**, `@@index([source])`, `@@index([canonicalId])`, `placeId @unique` 유지 | 메뉴/블로그/영업시간/이미지/좌표는 snapshotJson 안. **canonical FK 는 `onDelete: Restrict`(=Cascade 아님)** |
| `VisitorReview` | `visitor_reviews` | `restaurantId @index`, dedup `@@unique([restaurantId, externalId])` + `@@unique([restaurantId, contentHash])` | Restaurant Cascade |
| `ReviewSummary` | `review_summaries` | `reviewId @unique`, `status`, `sentiment?`, `sentimentScore?`, `satisfactionScore?`, `menusJson?`/`tipsJson?`/`keywordsJson?`, `analysisVersion?` | `ANALYSIS_VERSION = 4` |
| `MenuMention` | `menu_mentions` | `summaryId`/`restaurantId` + `name`/`nameNorm`/`sentiment`/`traitsJson` | summary done 시 평탄화 사본 |
| `ReviewTag` | `review_tags` | `kind` ('tip'/'keyword') + `term`/`termNorm` | tip+keyword 통합 |
| `MenuCanonical` | `menu_canonicals` | `(restaurantId, nameNorm) @@unique` | 식당 내 canonical |
| `GlobalMenuCanonical` | `global_menu_canonicals` | `globalKey @unique`, `categoryPath?` | 전역 canonical |
| `GlobalMenuCanonicalLink` | `global_menu_canonical_links` | `menuCanonicalId @unique` + `globalCanonicalId @index` | 다대일 링크 |

**Restaurant ↔ Canonical 관계 핵심**:
- 신규 Restaurant 생성 시 항상 nested `canonical: { create: {...} }` 로 자기 전용 CanonicalRestaurant 1행을 동시 생성 (1:1 시작).
- 어드민이 ProposalService 큐에서 수락하면 `CanonicalService.merge(A,B)` 가 한쪽 canonical 의 `Restaurant.canonicalId` 들을 다른 쪽으로 옮기고 빈 canonical 행을 삭제 → N:1 로 진화.
- `Restaurant.canonicalId` FK 는 **`onDelete: Restrict`** (Cascade **아님**) — 같은 canonical 에 묶인 다른 source 행이 남아있을 때 한 source 만 지워도 canonical 은 보존돼야 한다. 다이닝코드 단독 가게도 canonical 이 살아남아 다음 등록(예: 같은 가게의 네이버 행)에서 다시 매칭 후보로 떠야 함.
- `CanonicalMergeProposal.canonicalA/BId` FK 는 반대로 **Cascade** — canonical 이 사라지면 그 canonical 을 가리키던 제안은 자동으로 정리(stale 방지).

**`Restaurant.source` 분기**:
- `source = 'naver'` — `sourceId` 와 `placeId` 가 같은 값 (백필 마이그레이션에서 `sourceId = placeId` 로 채움). 공개 라우트가 `placeId` 키로 라우팅하므로 항상 NOT NULL.
- `source = 'diningcode'` — `sourceId` 는 `vRid`, `placeId` 는 `null`. 공개 `/restaurants/:placeId` 에 잡히지 않도록 의도된 nullable.
- `source = 'catchtable'` — 아직 저장 경로 없음(검증 페이지 단계).
- cross-source unique 키는 `(source, sourceId)` — 같은 가게의 다른 출처 행은 서로 다른 행으로 존재하되 같은 `canonicalId` 로 묶인다.

캐스케이드 체인:
- `Restaurant 삭제 → VisitorReview → ReviewSummary → MenuMention/ReviewTag` (Cascade), `Restaurant → MenuCanonical → GlobalMenuCanonicalLink` (Cascade).
- `Restaurant → CanonicalRestaurant` 는 **Restrict** (반대로 canonical 을 먼저 지우려면 묶인 Restaurant 가 0개여야 함).
- `CanonicalRestaurant → CanonicalMergeProposal` (Cascade).
- `MapProviderConfig.updatedById` 는 nullable + FK 미선언 — 사용자 삭제 시 dangling reference.

마이그레이션 (최근순):
- **`20260515104718_add_canonical_merge_proposals`** — **(NEW)** `CanonicalMergeProposal` 테이블 + status index + (A,B) unique
- **`20260515100910_add_canonical_suggestion_dismissed`** — **(NEW)** `CanonicalRestaurant.suggestionDismissedAt` 컬럼 추가
- **`20260515083303_add_canonical_restaurant`** — **(NEW)** `CanonicalRestaurant` 테이블 + Restaurant.canonicalId(NOT NULL) FK + 기존 행마다 자기 전용 Canonical 백필 (id 재활용, 좌표는 snapshotJson 의 `$.latitude`/`$.lat` COALESCE)
- **`20260515063258_add_restaurant_source_split`** — **(NEW)** Restaurant 에 `source`(default 'naver')/`sourceId`(NOT NULL) 컬럼 + `@@unique([source, sourceId])` + 기존 행 sourceId 를 placeId 로 백필
- `20260508173216_add_map_provider_configs` — `MapProviderConfig`
- `20260509_add_global_menu_category_path` — `GlobalMenuCanonical.categoryPath`
- `20260509_add_global_menu_canonicals` — `GlobalMenuCanonical` + Link
- `20260509_add_menu_canonicals` — `MenuCanonical`
- `20260509_add_analytics_tables` — `MenuMention` + `ReviewTag`
- [20260508122321_add_visitor_review_videos](../../apps/friendly/prisma/migrations/20260508122321_add_visitor_review_videos/migration.sql) — `videosJson`
- [20260508095207_add_review_analysis_fields](../../apps/friendly/prisma/migrations/20260508095207_add_review_analysis_fields/migration.sql)
- [20260506205226_add_restaurant_review_summary](../../apps/friendly/prisma/migrations/20260506205226_add_restaurant_review_summary/migration.sql)
- [20260506191413_add_llm_provider_config](../../apps/friendly/prisma/migrations/20260506191413_add_llm_provider_config/migration.sql)

디스크 영속:
- `apps/friendly/data/dev.db` — SQLite DB 파일
- `apps/friendly/data/thumbs/<sha1>.jpg` — media 모듈 썸네일 캐시

JWT payload: `{ userId: string; email: string; role: 'USER' | 'ADMIN' }`.

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

vworld 키는 env 변수 없음. canonical/source 분리 관련 env 변수도 없음 — DB 스키마와 lib/matching 임계만으로 동작.

## Key Decisions [coverage: high — 25 sources]

- **Zod = 단일 진실 (SSOT)** — 라우트 스키마는 모두 `@repo/api-contract`. `fastify-type-provider-zod`가 런타임 검증 + TS 타입 추론 + OpenAPI 자동 생성.
- **autoload 두 단계** — `plugins/`는 무조건 전부, `modules/`는 `*.route.ts` 파일만. `summary` 모듈은 라우트 파일이 없어 autoload 영향권 밖.
- **모듈 레이아웃** — CLAUDE.md 규칙대로 모듈마다 `*.route.ts` + `*.service.ts` + `*.test.ts` 트리오.
- **공개 라우트는 별도 라우트로 분리, 응답 스키마도 다르게** — restaurant 의 `publicList`/`publicByPlaceId`/`publicInsights`/`ranking`, settings 의 `publicConfig` 모두 admin 라우트와 path 자체가 다르고 service 메소드도 별개. 응답 분리 + 어드민 회귀 위험 0 + 캐싱 정책 분리 + OpenAPI 표면 분류.
- **공개 list 의 메모리 파싱 + bbox 필터 + 좁힌 ids 만 분석 집계** — 좌표/대표 사진/도로명은 `Restaurant.snapshotJson` 안. SQL where 로 못 거름 → 모든 행 메모리 파싱 → bbox 필터 → 통과한 ids 만 분석 집계.
- **공개 detail 의 mixed sentiment 분포는 카운트 안 함** — 공개 list 의 카운트는 `positive/negative/neutral` 만. 공개 insights 는 어드민과 같은 스키마라 mixed 포함.
- **cross-source 가게는 `Restaurant` 다행 + `CanonicalRestaurant` 1행 패턴** — 같은 가게의 네이버/다이닝코드 행을 하나로 합치지 않고 출처별 행을 그대로 둔 채 같은 `canonicalId` 로 묶는다. 출처별 스냅샷(snapshotJson)/리뷰/분석은 독립 → source 별로 다른 시점/다른 필드가 자연스럽게 보존. 통합 표면은 list 의 `sources[]` 배열로 합치고 sentiment 평균은 가중평균.
- **`(source, sourceId)` 가 cross-source unique 키** — 네이버는 `placeId == sourceId`, 다이닝코드는 `sourceId = vRid` + `placeId = null`. 공개 라우트 호환을 위해 `placeId @unique` (nullable) 도 그대로 유지 — 신규 소스는 채우지 않으니 네이버만 라우팅된다. zero-downtime 마이그레이션의 핵심: 기존 placeId 기반 모든 라우트/URL/캐시 키가 그대로 동작.
- **`Restaurant.canonicalId` FK 가 Cascade 아님 (Restrict) — 의도된 trap** — 다이닝코드 단독으로 등록된 가게가 있을 때 그 행을 지워도 canonical 은 살아남아야 한다. 다음에 같은 가게의 네이버 행이 등록되면 ProposalService 가 그 canonical 을 다시 매칭 후보로 잡을 수 있어야 하기 때문. 반대로 canonical 을 통째로 지우려면 묶인 Restaurant 행이 모두 0이어야 함(역방향 Restrict). 머지 도중 임시로 비는 canonical 은 같은 트랜잭션 내에서 정리.
- **자동 매칭은 큐만 적재, 머지는 사람이 확정** — `lib/matching.ts` 의 임계 (좌표 있을 때 score 0.45, 이름 단독은 0.7) 통과 후보는 `CanonicalMergeProposal` 에 status=`open` 으로만 적재. 동명이인/주변 가게 false positive 가 데이터 오염을 일으키므로 자동 머지를 의도적으로 안 함. 임계 자체는 보수적으로 (사람 눈에 띌 후보를 빠뜨리는 것보다 가짜 후보를 잡는 비용이 낮음). **단, Naver→DC 한정으로 `CrawlService.tryAutoMatchDiningcode` 는 자동 머지까지 진행** — 같은 canonical 에 DC 형제가 없을 때만 DC 검색 어댑터로 1건 후보를 찾고 임계 통과 시 즉시 머지. 자세한 건 [crawl 토픽](./crawl.md) / [canonical 토픽](./canonical.md).
- **(A,B) 쌍 정규화 (A<B cuid 사전순)** — `CanonicalMergeProposal` 의 `(canonicalAId, canonicalBId)` 가 unique. 같은 쌍이 양방향으로 두 번 큐에 뜨지 않도록 항상 cuid 문자열 사전순 정규화. ProposalService 적재 시 swap.
- **bigram Jaccard + Haversine 200m 선형 감쇠** — 한국어 짧은 가게명에서 trigram 보다 안정적이고 (음절 단위 변형은 normalizeName 단계 흡수), 한 글자 이름은 정규화 후 완전 일치만 1점. 거리는 200m 이상이면 0점, 그 이상은 maxDistanceM=500m 안에서만 후보 고려. name 0.6 + distance 0.4 가중.
- **vworld 키는 LlmProviderConfig 와 같은 DB-backed 패턴이지만 env fallback 없음** — vworld 도메인 페어링이 다르면 어차피 동작 안 함.
- **vworld secret 라우트는 평문 reveal** — SDK init URL 에 키를 그대로 박아야 해서.
- **vworld `publicConfig` 는 admin secret 과 보안 등급이 동등** — WMTS 키는 어차피 Network 탭 노출.
- **JWT `?token=` 쿼리 + 로그 redaction** — SSE 는 커스텀 헤더 불가. app.ts 의 `serializers.req` 마스킹.
- **Multiplexed Summary SSE + canonicalId 구독** — 한 admin 이 여러 식당 모니터링 시 HTTP/1.1 6 connection 제한 회피. canonicalId 로 받으면 묶인 모든 source 행의 bus key (네이버=placeId, 다이닝코드=`dc:<vRid>`) 를 union 으로 구독 — 머지 후에도 한 canonical 의 진행 상황을 통째로 본다.
- **요약 이벤트 두 종류** — `progress`/`review`.
- **리뷰 dedup = externalId + contentHash 이중 키** — Naver review id 있으면 externalId, 없으면 SHA-1. 다이닝코드는 `dc:rv:<rvId>` prefix 로 네이버와 충돌 방지.
- **1 review = 1 ReviewSummary** — `reviewId @unique`.
- **Summary placeId-level 직렬화 + 어댑터 공유 FIFO 게이트** — `runChainByPlace` Map + adapter-cache 동시성.
- **부팅 시 stale 요약 행 정리 (`cleanupStaleReviewSummaries`)** — 서버 재시작하면 in-flight 잡은 메모리에서 사라지지만 DB 의 `ReviewSummary.status='pending'|'running'` 행이 남아 다음 큐가 그 reviewId 를 다시 못 집는다. `server.ts` 가 `buildApp()` 직후 이 함수를 호출해 stale 행을 `status='failed'` + `errorCode='server_restart'` 로 마킹 → 기존 재요약 경로 (`backfillForRestaurant` 의 failed → pending upsert) 가 자연스럽게 다시 처리한다. **단일 Fastify 인스턴스 가정** (CLAUDE.md "단일 인스턴스 + lru-cache 로 충분") 하에서만 안전 — 같은 DB 를 가리키는 여러 인스턴스가 동시 뜨면 살아있는 인스턴스의 in-flight 잡까지 stale 로 보고 fail 시킬 수 있음.
- **canonical 그룹 detail = response-time fusion** — DB 안의 canonical 그룹 자체는 `Restaurant` 1:N 그대로 유지 (출처별 snapshot/리뷰/분석 독립 보존). 어드민/공개 detail 응답에서만 [restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts) 의 순수 함수 군이 두 행을 fused detail 로 합친다. 필드별 우선순위는 하드코딩 (rating/phone/address 는 Naver 우선, businessHours 는 DC summary 우선, photos 는 합쳐서 dedup, reviews 는 두 출처 합쳐 fetchedAt desc). 저장 형태와 응답 형태가 분리돼 머지 규칙 변경이 마이그레이션 없이 가능.
- **`MAX_CONCURRENT_PER_ACTOR = 5`** — crawl `job-registry` 의 한 액터 동시 잡 슬롯. 자동 발견 잡의 그룹 크기(`GROUP_SIZE = 5`) 와 같은 값 — 한 그룹이 5 잡을 띄우면 다른 잡은 못 들어옴(잡 시작 자체가 409). 이전 3 에서 상향.
- **리뷰 단위 자동 재시도 3회** — `300 * attempt + jitter` ms 백오프.
- **`ANALYSIS_VERSION = 4`** — sentiment 필수 non-null + traits string[] 추가.
- **Ollama structured output + numCtx=4096** — 시스템 프롬프트 + 긴 리뷰가 입력에서 잘리지 않도록.
- **`extractFirstJsonObject` / `normalizeTerm` 공유 export** — summary → menu-grouping/analytics.
- **`getInsights` MenuCanonical 기반** — MenuMention + MenuCanonical JOIN.
- **분석 정규화 테이블 도입 동기** — 글로벌 통계용 GROUP BY 가능 행 단위 필요.
- **Summary는 fire-and-forget + 공유 FIFO 게이트** — adapter-cache 동시성 제어.
- **Media는 디스크 캐시 + sharp** — `data/thumbs/<sha1>.jpg` 파일 캐시.
- **No Docker / No Redis** — CLAUDE.md 규칙.
- **dev = `tsx watch`, prod = `tsup` 번들** — `target: node22`, ESM.
- **Vitest는 `extensionAlias` + 수동 .env 로드**.

## Gotchas [coverage: medium — 13 sources]

- **canonical 1:1 시작 → merge 로 N:1 로 진화** — 마이그레이션 직후엔 모든 Restaurant 가 자기 전용 canonical 을 갖는다 (백필 시 `canonical.id = restaurant.id` 재활용). list 응답의 `sources.length === 1` 이 압도적으로 많고 `suggestion` 이 뜨면 어드민이 수동 머지. canonical 토픽 작업이 끝날 때까지 어드민 화면은 "보통 1:1, 가끔 묶임" 상태.
- **`canonicalId` FK 가 Cascade 아니라 Restrict** — 단일 source Restaurant 를 DELETE 하면 그 행만 사라지고 canonical 은 살아남는다. 반대로 canonical 을 prisma 로 직접 지우려 하면 묶인 Restaurant 가 0개일 때만 가능 (FK 위반). 머지 코드는 이를 활용해 "옮기고 → 빈 canonical 정리" 2단계로 진행한다.
- **`CanonicalMergeProposal` 의 (A,B) 쌍은 항상 A<B 정규화** — 직접 INSERT 로 디버깅 시 사전순 위반하면 unique 검사가 양방향 중복을 못 막는다. 항상 ProposalService 를 거쳐 적재해야 함.
- **`Restaurant.source` 분기 라우팅 — 공개 표면은 네이버 전용** — `publicList`/`publicByPlaceId`/`ranking`/`smartPick` 의 모든 service 메소드에 `where.source = 'naver'` 가 명시. 다이닝코드 행은 어드민 화면에서만 보인다 (admin list 의 sources[] 에 포함). 공개 표면 확장은 후속 PR.
- **`Restaurant.placeId` 가 nullable** — 코드 안의 `r.placeId!` non-null assertion 들은 모두 `where: { source: 'naver' }` 필터와 짝 (네이버 행은 항상 placeId 보유). 새 코드에서 이 가정을 흘려쓰면 다이닝코드 행에서 런타임 에러.
- **lib/matching 의 임계 변경 = 큐 폭증 위험** — `MATCH_THRESHOLDS.minScoreWithCoords` 를 0.45 → 0.3 같이 낮추면 ProposalService 가 적재하는 후보가 기하급수로 늘어 어드민 큐가 무용지물. lib/matching 손대면 ProposalService + restaurant.list 의 candidateCount 두 호출 사이트 회귀 테스트.
- **`snapshotJson` 파손 시 좌표/사진만 null fallback** — 공개 list 가 try/catch 로 흡수, 다른 필드는 살림.
- **bbox NaN/length 방어** — 방어적으로 length·finite 체크.
- **공개 list 정렬에서 null 은 항상 뒤** — `nullsLast` 헬퍼.
- **공개 detail 의 `analysis` 는 done 한정**.
- **공개 detail mixed 카운트 누락은 의도**.
- **vworld `publicConfig` 키 미등록 시 404 → FE 가드 필요**.
- **vworld 도메인 화이트리스트는 단순 메모**.
- **공개 vs admin getInsights — 응답 스키마는 같지만 가드만 다르다**.
- **Windows에서 Prisma DLL lock (EPERM)** — 분석/canonical 마이그레이션 4개가 한꺼번에 들어온 시기엔 특히 자주 부딪힘. dev watch 먼저 죽이고 migrate.
- **`extractFirstJsonObject` cross-module 의존성** — summary 파서 변경 시 menu-grouping/analytics 회귀 테스트.
- **v3 행 + v4 코드 공존** — null sentiment 는 'neutral' 로 폴백.
- **`JWT_SECRET` 32자 미만 → 부팅 실패**.
- **회원가입은 무조건 USER** — 첫 ADMIN은 `scripts/promote-admin.ts`.
- **`?token=` 마스킹은 app.ts에만 있다** — 외부 트레이스 경로엔 안 먹음.
- **DELETE restaurant ↔ in-flight crawl = 409**. 캐스케이드 범위에 MenuMention/ReviewTag/MenuCanonical/GlobalMenuCanonicalLink 까지 포함되어 트랜잭션 시간 증가 가능.
- **summary 모듈은 라우트 미노출** — restaurant 라우트가 호스팅.
- **`cleanupStaleReviewSummaries` 는 단일 인스턴스 가정** — 같은 DB 를 가리키는 두 번째 Fastify 인스턴스가 부팅되면 살아있는 1번 인스턴스가 처리 중인 `running` 행까지 stale 로 마킹해 `failed`(`server_restart`) 로 만든다. 분산 배포 시작 시 이 함수를 우선 떼어내야 함. dev 에서 nodemon/tsx watch 가 짧게 두 프로세스 겹칠 때도 잠깐 발생 가능 — 보통 무해(다음 백필이 다시 pending 으로 살림).
- **summary SSE heartbeat 는 `comment(: hb)` 가 아니라 `named heartbeat` 이벤트** — 클라이언트 EventSource 는 SSE comment 를 콜백으로 노출하지 않아 idle 감지에 못 쓴다. 5 초 주기 + FE 의 15 초 idle timeout = 3 회 누락 시 죽음 판정. 다른 SSE (auto-discover, menu-grouping, diningcode bulk-save) 는 여전히 comment heartbeat — 그쪽 FE 는 idle timeout 을 안 쓰거나 다른 신호로 감지.
- **`MAX_CONCURRENT_PER_ACTOR = 5` 와 auto-discover GROUP_SIZE 가 동일** — 자동 발견 잡 한 그룹이 5 잡을 띄우는 동안 같은 액터의 다른 크롤 잡(수동 등록 포함) 은 409. 의도 동작 (동시 부담 제어) 이지만 어드민이 자동 발견 돌리는 중엔 다른 등록을 못 한다는 점이 사용자 혼동 포인트.
- **`createMany skipDuplicates` SQLite 미지원** — in-memory pre-filter + P2002 silent skip 패턴.
- **Ollama `num_ctx` 기본 2048 함정** — 4096 + maxTokens 1500 명시.
- **autoload는 vite resolve를 우회한다** — vitest 통합 부팅 깨지기 쉬움.
- **media `data/thumbs/` 디렉터리 누적** — 만료 로직 없음.
- **media는 public(인증 없음)** — ALLOWED_HOSTS 가 SSRF 가드 전부.
- **`tsx watch`는 `src/`만 감시한다** — `@repo/*` 변경은 수동 재시작.
- **crawl 검색/다이닝코드/캐치테이블 적응형 의존** — 자세한 건 [crawl 토픽](./crawl.md).

## Sources [coverage: high — 67 sources]

- [apps/friendly/package.json](../../apps/friendly/package.json)
- [apps/friendly/tsconfig.json](../../apps/friendly/tsconfig.json)
- [apps/friendly/tsup.config.ts](../../apps/friendly/tsup.config.ts)
- [apps/friendly/vitest.config.ts](../../apps/friendly/vitest.config.ts)
- [apps/friendly/.env.example](../../apps/friendly/.env.example)
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)
- [apps/friendly/prisma/migrations/20260515104718_add_canonical_merge_proposals/migration.sql](../../apps/friendly/prisma/migrations/20260515104718_add_canonical_merge_proposals/migration.sql)
- [apps/friendly/prisma/migrations/20260515100910_add_canonical_suggestion_dismissed/migration.sql](../../apps/friendly/prisma/migrations/20260515100910_add_canonical_suggestion_dismissed/migration.sql)
- [apps/friendly/prisma/migrations/20260515083303_add_canonical_restaurant/migration.sql](../../apps/friendly/prisma/migrations/20260515083303_add_canonical_restaurant/migration.sql)
- [apps/friendly/prisma/migrations/20260515063258_add_restaurant_source_split/migration.sql](../../apps/friendly/prisma/migrations/20260515063258_add_restaurant_source_split/migration.sql)
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
- [apps/friendly/src/lib/matching.ts](../../apps/friendly/src/lib/matching.ts)
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
- [apps/friendly/src/modules/restaurant/restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts)
- [apps/friendly/src/modules/restaurant/restaurant.merge.test.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.test.ts)
- [apps/friendly/src/modules/canonical/](../../apps/friendly/src/modules/canonical/)
- [apps/friendly/src/modules/auto-discover/auto-discover.route.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.route.ts)
- [apps/friendly/src/modules/auto-discover/auto-discover.service.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.service.ts)
- [apps/friendly/src/modules/auto-discover/auto-discover-registry.ts](../../apps/friendly/src/modules/auto-discover/auto-discover-registry.ts)
- [apps/friendly/src/modules/auto-discover/auto-discover.prompts.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.prompts.ts)
- [apps/friendly/src/modules/auto-discover/auto-discover.test.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.test.ts)
- [apps/friendly/src/modules/crawl/crawl.route.ts](../../apps/friendly/src/modules/crawl/crawl.route.ts)
- [apps/friendly/src/modules/crawl/crawl.service.ts](../../apps/friendly/src/modules/crawl/crawl.service.ts)
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
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)
