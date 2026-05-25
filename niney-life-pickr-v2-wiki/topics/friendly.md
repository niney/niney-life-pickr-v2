---
topic: friendly
last_compiled: 2026-05-25
status: active
aliases: [naver-search-adapter, search-route, crawl-job-log, plugins-summaries, settlement, 정산, multipart, vision LLM, 단골, contacts, llm-purpose]
sources_count: 81
---

# friendly — Fastify 백엔드

**2026-05-25 변경 흡수 — 정산(settlement) 도메인 3 모듈 + multipart 플러그인 + DB 경로 통일 + LLM purpose 분리.** 정산하기 백엔드(영수증 vision LLM 추출 → 세션 CRUD/분배 → 단골 자동 적립 → 공개 공유 토큰)가 도입되면서 신규 모듈 3개 (`settlement-extraction`, `settlement`, `contact`) 가 모듈 트리에 합류한다 — 라우트 디테일은 [settlement 토픽](./settlement.md) 으로 위임. 영수증 이미지를 받기 위한 [plugins/multipart.ts](../../apps/friendly/src/plugins/multipart.ts) 가 신규 추가됐고(5MB 한계), AI provider 설정에 `purpose` 컬럼이 붙어 같은 provider 를 chat / image 용도로 분리 등록할 수 있게 됐다 (`(provider, purpose)` 복합 unique). 모든 LLM 호출처는 `getResolved('ollama-cloud', 'chat')` 로 명시 호출하고, env fallback 은 `purpose='chat'` 에만 적용된다. `.env.example` 의 `DATABASE_URL` 은 `file:./data/dev.db` → `file:../data/dev.db` 로 정리돼 Prisma CLI / 서버 / vitest 가 모두 같은 `apps/friendly/data/dev.db` 를 가리킨다. vitest 는 `fileParallelism: false` 로 직렬 실행, prisma 플러그인은 부팅 시 `PRAGMA foreign_keys=ON` 을 강제해 ON DELETE CASCADE 가 SQLite 에서 실제로 동작하도록 보장.

## Purpose [coverage: high — 8 sources]

`apps/friendly`는 niney-life-pickr-v2 모노레포의 유일한 백엔드 서비스다. Fastify 5 위에 zod 기반 스키마 검증, JWT 인증, Prisma+SQLite 영속화, OpenAPI/Swagger 문서, Playwright 크롤링 런타임, Naver 이미지 썸네일 프록시(sharp), Ollama Cloud 기반 리뷰 요약 + 구조화 분석 + 메뉴 정규화/통계, vworld 지도 SDK 키 관리, multi-source 가게 통합(canonical), **정산하기(receipt OCR/vision → 세션 CRUD → 분배 → 공유 토큰) + 단골 참여자 자동 적립** 까지 얹어 web(`apps/web`)과 mobile(`apps/mobile`)이 동시에 호출하는 단일 API를 제공한다.

도메인 표면은 모듈 디렉터리로 나뉜다.

- **auth** — 회원가입/로그인/내 정보/로그아웃 (`Routes.Auth.*`)
- **picks** — 사용자별 "선택지" CRUD + 랜덤 추첨 (`Routes.Picks.*`)
- **admin** — 사용자 목록·역할 변경 (`Routes.Admin.*`, `requireAdmin`)
- **restaurant** — 크롤된 맛집 + 방문자 리뷰 영속화, 요약/분석 진행률 SSE, reanalyze/insights/smart-pick + 메뉴 그룹핑/순위/분석 백필 라우트, 공개 list/detail/insights + 공개 ranking (`Routes.Restaurant.*`). admin list 는 **페이징 + 서버 정렬** 로 진화 (recent/satisfaction/positive/negativeRatio).
- **summary** — 리뷰 단위 AI 요약+구조화 분석 라이프사이클 (HTTP 라우트 없음, 내부 모듈)
- **menu-grouping** — 식당별 메뉴 표기 변형을 LLM으로 canonical 그룹핑 + 순위. 자세한 건 [menu-grouping 토픽](./menu-grouping.md).
- **analytics** — 글로벌 메뉴 통계 + 전역 LLM 머지 + 카테고리 트리. 자세한 건 [analytics 토픽](./analytics.md).
- **canonical** — cross-source 가게 동일성(canonical) + 자동 매칭 제안 큐. CanonicalService + ProposalService. 자세한 건 [canonical 토픽](./canonical.md).
- **auto-discover** — 어드민 키워드 한 줄 + 카테고리 칩 입력으로 AI 키워드 8 개 생성 → 다중 검색 → dedupe → 등록된 placeId 분리 → 그룹 5 개씩 직렬 크롤까지 한 잡으로 묶는 자동 발견 워크플로. 자세한 건 [auto-discover 토픽](./auto-discover.md).
- **settlement-extraction** — **(NEW 2026-05-25)** 영수증 multipart 업로드(JPEG/PNG/WebP, 5MB) → vision LLM 으로 메뉴/금액 추출 → 식당 메뉴 매칭/카테고리 분류 → 디스크 보관 (`data/receipts/<token>.jpg`). 자세한 건 [settlement 토픽](./settlement.md).
- **settlement** — **(NEW 2026-05-25)** 정산 세션 CRUD + 카테고리별 분배 계산 + 공유 토큰 발급/회수. owner 본인만 보고 편집 가능, `shareToken` 으로 공개 read-only 페이지에 노출. 자세한 건 [settlement 토픽](./settlement.md).
- **contact** — **(NEW 2026-05-25)** 사용자별 "단골 참여자" CRUD (`/me/contacts`). 정산 저장 시 participant 가 `(userId, normalizedKey)` 로 자동 upsert 되어 다음 정산에서 자동완성·다중 선택 모달로 재사용. 자세한 건 [settlement 토픽](./settlement.md).
- **media** — Naver CDN 이미지 썸네일 프록시 + 디스크 캐시 (`Routes.Media.*`)
- **settings** — 외부 지도 SDK 키(vworld) 관리. admin CRUD + 평문 reveal + 공개 키 노출 (`Routes.SettingsMap.*`)
- **health** — 라이브니스 체크 (`Routes.Health`, `/health`)
- **crawl** — 별도 위키 토픽 ([crawl 토픽 참조](./crawl.md))
- **ai** — 별도 위키 토픽 ([ai 토픽 참조](./ai.md))

CLAUDE.md 규약상 모든 모듈은 `*.route.ts`(HTTP) + `*.service.ts`(비즈니스) + `*.test.ts`(Vitest) 트리오로 구성하고, FE/BE가 공유하는 타입/검증 로직은 모두 `@repo/api-contract`의 zod 스키마로만 정의한다. [apps/friendly/package.json](../../apps/friendly/package.json)의 `name: "friendly"`가 워크스페이스 식별자이며, `pnpm dev:api`/`pnpm --filter friendly <cmd>`로 단독 실행한다.

## Architecture [coverage: high — 16 sources]

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
- [plugins/prisma.ts](../../apps/friendly/src/plugins/prisma.ts) — `PrismaClient` 인스턴스, `app.prisma` 노출, `onClose`에 `$disconnect`. 부팅 시 PRAGMA 셋업: **`journal_mode=WAL`** (동시 읽기), **`synchronous=NORMAL`**, **`busy_timeout=30000`** (SQLITE_BUSY → "Transaction not found" 회피), **`foreign_keys=ON`** (SQLite 기본 OFF — Cascade 가 실제 동작하려면 필수). `name: 'prisma'` 로 다른 플러그인이 `dependencies: ['prisma']` 로 줄 세울 수 있게 등록.
- [plugins/swagger.ts](../../apps/friendly/src/plugins/swagger.ts) — OpenAPI 메타 + `bearerAuth` 시큐리티 스킴, Zod→JSON Schema 변환. UI는 `/docs`.
- [plugins/error-handler.ts](../../apps/friendly/src/plugins/error-handler.ts) — `ZodError`/Fastify validation/4xx/5xx 정규화. dev에서만 5xx 메시지 노출.
- [plugins/empty-body-parser.ts](../../apps/friendly/src/plugins/empty-body-parser.ts) — 빈 `application/json` body를 `{}`로 해석(action 없는 POST용).
- [plugins/summaries.ts](../../apps/friendly/src/plugins/summaries.ts) — `SummaryService` + `JobLogService` + `AiConfigService` 셋을 `app.decorate('summaries' | 'jobLog' | 'aiConfig', ...)` 로 노출. `dependencies: ['prisma']`.
- **[plugins/multipart.ts](../../apps/friendly/src/plugins/multipart.ts) — (NEW 2026-05-25)** `@fastify/multipart` 등록. `fileSize: 5 * 1024 * 1024` (5MB), `files: 1`, `fields: 5`. 한도 초과 시 multipart 가 자동 413. 영수증 업로드 (`settlement-extraction`) 가 사용. 다른 multipart 소비자가 생기면 한도 상향은 여기서 한 번에.

모듈 레이어 — 현재 디렉터리:

```
modules/
├── admin/
├── ai/
├── analytics/                ← 글로벌 메뉴 통계 + 전역 LLM 머지 (analytics 토픽)
├── auth/
├── auto-discover/            ← AI 키워드 → 다중 검색 → 그룹 직렬 크롤 자동 발견 잡 (auto-discover 토픽)
├── canonical/                ← cross-source 가게 통합 + 자동 매칭 제안 (canonical 토픽)
├── contact/                  ← (NEW) /me/contacts — 단골 참여자 CRUD (settlement 토픽)
├── crawl/
├── health/
├── media/
├── menu-grouping/            ← 식당별 메뉴 LLM 그룹핑 + 순위 (menu-grouping 토픽)
├── picks/
├── restaurant/
├── settings/                 ← 지도 SDK 키 관리 (vworld)
├── settlement/               ← (NEW) 정산 세션 CRUD + 분배 + 공유 토큰 (settlement 토픽)
├── settlement-extraction/    ← (NEW) 영수증 multipart → vision LLM 추출 (settlement 토픽)
├── summary/
└── user/
```

autoload는 route 파일만 픽업하므로 `summary/`처럼 라우트 파일이 없는 모듈은 외부에서 모듈 싱글턴(`summaryEventsBus`)과 명시적 import로만 접근한다. analytics/menu-grouping/settings/canonical/contact/settlement/settlement-extraction 은 자체 `*.route.ts` 가 있어 자동 등록.

**가게 동일성 매칭 라이브러리** — [src/lib/matching.ts](../../apps/friendly/src/lib/matching.ts) 는 모듈에 속하지 않는 순수 유틸. 가게명 정규화(`normalizeName` — 소문자/공백/구두점 제거 + 분점 suffix `본점/지점/점` 제거) + bigram Jaccard 이름 유사도(`nameSimilarity`) + Haversine 거리(`distanceMeters`) + 둘을 0.6/0.4 가중한 `scoreMatch` 와 임계(`MATCH_THRESHOLDS`: 좌표 있을 때 score ≥ 0.45 + 거리 ≤ 500m, 좌표 없으면 name ≥ 0.7). `restaurant.list()` 의 1차 suggestion 산출과 canonical 의 ProposalService 가 둘 다 호출.

**공개 vs admin 라우트 분리 정책** — 같은 도메인이라도 (1) 응답 스키마가 다르거나 (2) 가드만 빠진 게 아니라 캐싱/SEO 정책이 다른 경우에는 별도 라우트로 분리한다. 핸들러 안에서 `if (req.user) {…} else {…}` 분기보다 라우트 자체가 둘이라 OpenAPI/Swagger 가 두 응답 셋을 분리해 표시하고 어드민 회귀 위험이 0이 된다. restaurant 의 `publicList`/`publicByPlaceId`/`publicInsights`/`ranking`, settings 의 `publicConfig`, **settlement 의 owner 라우트 vs `/share/settlements/:token` 공개 read-only 라우트** 가 같은 패턴.

**crawl 모듈 변경 흡수 (2026-05-15)** — 자세한 건 [crawl 토픽](./crawl.md). friendly 차원에선 `CrawlService` 생성자에 `ProposalService` 가 추가 주입돼 (`new CrawlService(restaurants, summaries, jobRegistry, proposals)`) 신규 등록 후크에서 자동 매칭 후보를 적재한다.

**crawl 모듈 변경 흡수 (2026-05-17)** — `CrawlService` 생성자에 `CanonicalService` 가 한 번 더 주입돼 (`new CrawlService(restaurants, summaries, jobRegistry, proposals, canonical)`) 신규 메소드 `tryAutoMatchDiningcode(canonicalId)` 가 Naver 잡 done 후크에서 fire-and-forget 으로 호출된다. 자세한 건 [crawl 토픽](./crawl.md) / [canonical 토픽](./canonical.md).

**restaurant 모듈 변경 흡수 (2026-05-17)** — 신규 파일 [restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts) 가 canonical 그룹(Naver + DC 형제) 을 단일 public detail 로 융합하는 순수 함수 군을 모아둔다.

**plugins/summaries.ts — app-level singleton 패턴 (2026-05-19)** — 신규 [plugins/summaries.ts](../../apps/friendly/src/plugins/summaries.ts) 가 `SummaryService` + `JobLogService` + `AiConfigService` 셋을 `fastify-plugin` 으로 묶어 `app.decorate('summaries' | 'jobLog' | 'aiConfig', ...)` 로 노출.

**CrawlJobLog 시스템 (2026-05-19)** — 신규 [modules/crawl/job-log.service.ts](../../apps/friendly/src/modules/crawl/job-log.service.ts) 가 크롤+요약 단계별 로그를 세 곳에 동시 흘려보내는 단일 진입점: (1) `app.log` pino 콘솔, (2) `prisma.crawlJobLog` DB 영속화, (3) SSE 채널. 모노톤 `seq` 카운터를 발급해 `(jobId, seq)` 로 클라이언트 dedup.

**Summary 라이프사이클 확장 — queued / cancelled / 부팅 자동 재큐잉 (2026-05-19)** — `ReviewSummary.status` enum 6종(queued/pending/running/done/failed/cancelled). 부팅 시 `cleanupStaleReviewSummaries` + `rescheduleStaleSummaries` 가 자동 재개.

**restaurant.list 페이징·정렬 (2026-05-25)** — 어드민 list 가 page state 를 URL 동기화 + 서버 정렬로 진화. `RestaurantListQuery` (offset/limit/sort) zod 스키마가 추가되고 `RestaurantService.list(query)` 가 `RestaurantListResultType` (`{ items, total, limit, offset }`) 반환. 정렬 키 `recent` (lastCrawledAt desc — 기본) / `satisfaction` (avgSatisfactionScore desc) / `positive` (avgSentimentScore desc) / `negativeRatio` (negativeCount/summaryDone asc). null 분석값은 항상 nulls-last. canonical 집계가 sources 합산이라 DB 정렬을 못 빼므로 **모든 canonical 후보까지 계산 후 메모리에서 정렬·slice** — 데이터 규모(< 1k canonical) 가정. handler 도 `service.list(req.query)` 한 줄로 단순화.

**LLM provider purpose 분리 (2026-05-25)** — [adapter-cache.ts](../../apps/friendly/src/modules/ai/adapter-cache.ts) 의 캐시 키에 `provider|purpose` prefix 가 들어가 chat/image 가 서로 다른 어댑터 인스턴스를 갖는다. `AiConfigService.getResolved(provider, purpose)` 는 모든 호출처가 `purpose` 인자를 명시적으로 넘기게 변경 — summary/analytics/menu-grouping/auto-discover 가 일괄 `'chat'` 으로 호출, settlement-extraction 만 `'image'` 로 호출. `AiConfigService.list()` 는 DB 행 + env-backed 가상 row (purpose='chat' 한정) 를 합성해 어드민 카드에 표시 — DB 에 chat row 가 없으면 env fallback 가상 카드 1개, image 는 DB row 가 있어야만 카드로 노출.

**정산하기 도메인 분리 (2026-05-25)** — `settlement-extraction` / `settlement` / `contact` 세 모듈은 friendly 안에서 자기 라우트 트리(`/settlement-extractions`, `/settlements`, `/me/contacts`, `/share/settlements/:token`) 와 자기 prisma 모델 4종 (`SettlementSession` / `SettlementItem` / `SettlementParticipant` / `SettlementContact`) 을 갖는다. friendly 차원에선 (1) `plugins/multipart.ts` 로 영수증 업로드 채널 제공, (2) `User → SettlementSession/SettlementContact` Cascade 관계 + `SettlementParticipant.contactId` SetNull 관계 추가, (3) `apps/friendly/data/receipts/` 디렉터리에 영수증 jpg 보관 — 까지가 인프라 책임. 라우트 스키마·분배 계산·UI 시나리오는 [settlement 토픽](./settlement.md) 으로 위임.

## Talks To [coverage: high — 14 sources]

- **`@repo/api-contract`** — `Routes.*` URL 상수와 모든 zod 스키마(인증/픽/식당/요약/분석/미디어/AI/메뉴 그룹핑/애널리틱스/지도 설정/canonical/**settlement/settlement-contact/settlement-extraction**)의 단일 출처.
- **`@repo/utils`** — `picks.service.ts`의 랜덤 추첨에서 `pickRandom(options)`.
- **Prisma + SQLite** — [prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)는 `provider = "sqlite"`. `DATABASE_URL` 은 `.env.example` 기준 `file:../data/dev.db` — Prisma CLI 의 cwd 가 `apps/friendly/prisma/` 이고 서버 cwd 가 `apps/friendly/` 라 `../data/dev.db` 가 양쪽 모두 `apps/friendly/data/dev.db` 를 가리키도록 통일 (이전엔 마이그레이션이 `prisma/dev.db` 를 만들고 서버는 `data/dev.db` 를 보던 분기 사고가 있었음).
- **bcryptjs** — [src/lib/hash.ts](../../apps/friendly/src/lib/hash.ts)의 `hashPassword`/`verifyPassword`가 10 라운드 솔트.
- **sharp ^0.34** — media 모듈의 썸네일 리사이즈/JPEG 인코딩.
- **Playwright + playwright-extra/stealth** — crawl 모듈이 사용. **(2026-05-25)** `playwright-extra ^4.3.6` + `puppeteer-extra-plugin-stealth ^2.11.2` 의존성 추가 — 네이버 크롤러 stealth 적용 + 429 차단 우회.
- **Naver Place 페이지 + Naver CDN** — crawl 이 SSR/AJAX, media 가 `phinf.pstatic.net` 호스트군 썸네일 프록시.
- **Naver PC 지도 페이지 (`map.naver.com`)** — 검색 어댑터.
- **Diningcode / Catchtable** — crawl 의 추가 소스. 자세한 건 [crawl 토픽](./crawl.md).
- **Ollama Cloud** — ai/summary/menu-grouping/analytics 가 LLM chat 호출, **settlement-extraction 이 vision (image) 호출**. provider 설정 row 는 `(provider, purpose)` 복합 unique 라 같은 ollama-cloud 라도 chat/image 가 서로 다른 model/concurrency 로 등록 가능.
- **`@fastify/multipart` ^10** — 영수증 업로드용. 5MB / 1 파일 / 5 필드 한도.
- **외부 지도 키(vworld)** — settings 가 평문 보관.
- **소비자** —
  - `apps/web` 어드민 화면이 `@repo/shared`의 API 클라이언트로 모든 admin 라우트 호출.
  - `apps/web` 공개 화면(루트 랭킹·맛집 지도·식당 상세) + **로그인 후 정산하기 stepper + /me/settlements 이력 + /me/contacts 단골 + /share/settlements/:token 공개 결과**.
  - `apps/mobile` 도 같은 클라이언트 (CLAUDE.md 핵심 규칙 #2).
- **모듈 간 토폴로지** —
  - `crawl → restaurant` — 신규 행 생성 시 nested `canonical: { create: {...} }`.
  - `crawl → canonical (ProposalService → CanonicalService)`.
  - `crawl → summary` — `persistReviewBatch` 가 돌려준 새 리뷰 id 배열을 `SummaryService.queueSummariesForReviews(busKey, ids)` 로 fire-and-forget.
  - `summary → ai` — adapter-cache 의 공유 FIFO 게이트.
  - `summary → restaurant.route` — `summaryEventsBus` 모듈 싱글턴.
  - `summary → menu-grouping/analytics` — `extractFirstJsonObject` / `normalizeTerm` 공유 export.
  - `restaurant.route → summary` — reanalyze/analyticsBackfill.
  - `restaurant.route → menu-grouping` — menusGroup/menusRanking.
  - `settings.route → settings.service` — 공개/admin 모두 같은 `getSecret('vworld')`.
  - `auto-discover → ai + crawl + restaurant + crawl/job-registry` — 자세한 건 [auto-discover 토픽](./auto-discover.md).
  - **`settlement-extraction → ai + media-like 디스크 보관`** — `AiConfigService.getResolved('ollama-cloud', 'image')` 로 vision 어댑터 획득 후 LLM 호출, multipart 로 받은 영수증 바이트를 `apps/friendly/data/receipts/<uuid>.jpg` 로 저장 + 토큰만 응답에 반환.
  - **`settlement → contact`** — `settlement.service.createSession` 이 모든 participant 를 `(userId, normalizedKey)` 로 SettlementContact 에 upsert 하고 `participant.contactId` 를 채운다 (자동 적립). 자세한 건 [settlement 토픽](./settlement.md).
  - **`settlement (public read) ← /share/settlements/:token`** — owner 본인 라우트와 별도 path, 가드 없이 read-only.
  - `server.ts → summary` — 부팅 직후 stale 행 정리 + 자동 재큐잉.

## API Surface [coverage: high — 9 sources]

라우트 경로는 모두 `@repo/api-contract`의 [`Routes.*`](../../packages/api-contract/src/routes.ts)에서 가져온다.

라우트 트리 (요약):

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
│   └── /admin/restaurants/*                      (admin)         ← 어드민 CRUD/SSE/smart-pick/페이징·정렬
├── /admin/crawl/*                                (admin)         ← crawl 토픽
├── /admin/canonical/*                            (admin)         ← canonical 토픽
├── /admin/auto-discover/jobs[/:id[/events]]      (admin + SSE)   ← auto-discover 토픽
├── /admin/ai/*                                   (admin)         ← ai 토픽 (provider × purpose)
├── /admin/analytics/*                            (admin)         ← analytics 토픽
├── /admin/settings/map[/...]                     (admin)
├── /settings/map/public                          (public)
├── /settlement-extractions                       (bearer)        ← (NEW) 영수증 multipart → vision LLM
├── /settlements/*                                (bearer, owner) ← (NEW) 세션 CRUD + 분배 + 공유 토큰
├── /share/settlements/:token                     (public)        ← (NEW) 공개 read-only
├── /me/contacts[/:id]                            (bearer)        ← (NEW) 단골 CRUD
└── /health                                       (public)
```

`/settlement-extractions` / `/settlements/*` / `/share/settlements/:token` / `/me/contacts` 의 메소드·body·response 상세는 [settlement 토픽](./settlement.md) 참고.

restaurant 의 admin `list` 응답은 multi-source 통합 + **페이징** 형태로 진화 — `{ items, total, limit, offset }`. 한 행 = 한 canonical, 그 안에 `sources[]` 배열로 네이버/다이닝코드 행이 들어가고 `candidateCount`/`suggestion` 도 포함. 공개 표면(`publicList`/`publicByPlaceId`/`ranking`/`smartPick`) 도 detail 단계에선 같은 canonical 그룹의 DC 형제를 함께 읽어 [restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts) 의 머지 함수 군으로 단일 응답으로 융합.

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
| GET    | `ranking`                                     | public        | 60s TTL + dogpile-guard. 네이버 전용.                                             |
| GET    | `publicList`                                  | public        | 좌표·도로명·썸네일·AI 통계. q/category/bbox/sort. 네이버 전용. nullsLast.        |
| GET    | `publicByPlaceId(:placeId)`                   | public        | 공개 상세. `analysis` 는 done 행만 평탄화.                                        |
| GET    | `publicInsights(:placeId)`                    | public        | 어드민 `insights` 와 동일 응답 스키마, 가드만 빠짐.                                |
| GET    | `list`                                        | bearer+admin  | **multi-source 통합 리스트 + 페이징/정렬**. `?offset&limit&sort=recent|satisfaction|positive|negativeRatio`. 응답 `{ items, total, limit, offset }`. |
| GET    | `byPlaceId(:placeId)`                         | bearer+admin  | 디테일 (네이버 단일 행).                                                          |
| DELETE | `delete(:placeId)`                            | bearer+admin  | 캐스케이드 삭제. in-flight 크롤이 같은 placeId면 409.                            |
| POST   | `reanalyze(:placeId)`                         | bearer+admin  | 구버전/failed 분석 행 재큐잉.                                                     |
| GET    | `insights(:placeId)`                          | bearer+admin  | MenuMention + MenuCanonical JOIN.                                                 |
| POST   | `menusGroup(:placeId)`                        | bearer+admin  | 식당 메뉴 LLM canonical 그룹핑.                                                   |
| GET    | `menusRanking(:placeId)`                      | bearer+admin  | 그룹된 메뉴 순위.                                                                 |
| POST   | `analyticsBackfill`                           | bearer+admin  | menus/tips/keywords JSON → 정규화 테이블 1회 백필.                                |
| POST   | `smartPick`                                   | bearer+admin  | 가중 랜덤 픽. 네이버 전용.                                                        |
| GET    | `summaryStatus(:placeId)`                     | bearer+admin  | 요약 진행률 스냅샷.                                                               |
| GET    | `summaryEvents`                               | query token   | Multiplexed SSE. `?placeId=…&canonicalId=…&token=<jwt>`. named heartbeat 5s.       |
| POST   | `cancelSummary(:placeId)`                     | bearer+admin  | 진행 중 요약 중지.                                                                 |
| POST   | `resumeSummary(:placeId)`                     | bearer+admin  | cancelled 행만 재큐잉.                                                            |
| GET    | `crawlLogs(:placeId)`                         | bearer+admin  | 누적 크롤+요약 로그 cursor pagination.                                            |

> 글로벌 통계 라우트는 [analytics 토픽](./analytics.md), 가게 통합/제안 라우트는 [canonical 토픽](./canonical.md), 자동 발견 잡 라우트는 [auto-discover 토픽](./auto-discover.md), 정산/단골/영수증 라우트는 [settlement 토픽](./settlement.md) 참고.

### settings — [settings/map.route.ts](../../apps/friendly/src/modules/settings/map.route.ts)

vworld JS SDK 키. 공개 한 개 + admin 네 개.

### media — [media.route.ts](../../apps/friendly/src/modules/media/media.route.ts) — public

`?url=<naver-cdn-url>&w=300&q=78` → JPEG. ALLOWED_HOSTS 화이트리스트, sharp 리사이즈, `data/thumbs/<sha1>.jpg` 디스크 캐시.

### health — [health.route.ts](../../apps/friendly/src/modules/health/health.route.ts)

`Routes.Health` + `/health` (스모크 프로브).

## Data [coverage: high — 17 sources]

[prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) 모델 — 코어:

| 모델 | 테이블 | 핵심 필드 / 인덱스 | 비고 |
| ---- | ------ | -------------------- | ---- |
| `User` | `users` | `email @unique`, `role Role` | picks/settlements/contacts Cascade |
| `Pick` | `picks` | `userId @index`, `options` JSON | User Cascade |
| `PickResult` | `pick_results` | `pickId @index` | Pick Cascade |
| `Role` | enum | `USER \| ADMIN` | |
| `LlmProviderConfig` | `llm_provider_configs` | **`(provider, purpose) @@unique`**, `purpose` default `'chat'`, `apiKey`, `maxConcurrent`, `defaultModel` | **2026-05-25 purpose 컬럼 추가** — 같은 provider 를 chat/image 따로 등록. env fallback 은 chat 한정 |
| `MapProviderConfig` | `map_provider_configs` | `provider @unique`, `apiKey`(평문), `domains?` | env fallback 없음 |
| `CanonicalRestaurant` | `canonical_restaurants` | `id`, `name`, `primaryCategory?`, `latitude?`, `longitude?`, `searchKey?`, `suggestionDismissedAt?`, `@@index([searchKey])` | [canonical 토픽](./canonical.md) |
| `CanonicalMergeProposal` | `canonical_merge_proposals` | `(A,B)` 정규화 unique, `score`/`nameScore`/`distanceM?`, `status` | 둘 FK Cascade |
| `Restaurant` | `restaurants` | `source` default `'naver'`, `sourceId` NOT NULL, `placeId?` (nullable, 네이버만), `canonicalId` NOT NULL (FK Restrict), `@@unique([source, sourceId])`, `placeId @unique` | snapshotJson 안에 메뉴/블로그/영업시간/이미지/좌표 |
| `VisitorReview` | `visitor_reviews` | `restaurantId @index`, dedup `@@unique([restaurantId, externalId])` + `@@unique([restaurantId, contentHash])` | Restaurant Cascade |
| `ReviewSummary` | `review_summaries` | `reviewId @unique`, `status` 6종 (queued/pending/running/done/failed/cancelled), `sentiment?`, scores, JSON 분석 컬럼 | `ANALYSIS_VERSION = 4` |
| `CrawlJobLog` | `crawl_job_logs` | `jobId`, `placeId?`, `stage`, `level`, `message`, `meta?`, `@@index([jobId, createdAt])`, `@@index([placeId, createdAt])` | FK 미선언 — 잡 휘발 후도 살아남음 |
| `MenuMention` | `menu_mentions` | `summaryId`/`restaurantId` + `name`/`nameNorm`/`sentiment`/`traitsJson` | summary done 시 평탄화 |
| `ReviewTag` | `review_tags` | `kind` ('tip'/'keyword') + `term`/`termNorm` | tip+keyword 통합 |
| `MenuCanonical` | `menu_canonicals` | `(restaurantId, nameNorm) @@unique` | 식당 내 canonical |
| `GlobalMenuCanonical` | `global_menu_canonicals` | `globalKey @unique`, `categoryPath?` | 전역 canonical |
| `GlobalMenuCanonicalLink` | `global_menu_canonical_links` | `menuCanonicalId @unique` + `globalCanonicalId @index` | 다대일 링크 |
| **`SettlementSession`** | **`settlement_sessions`** | **`userId`, `restaurantPlaceId`, `restaurantName` (스냅샷), `source` ('MANUAL'/'RECEIPT'), `totalAmount?`, `warning?`, `receiptImageToken?`, `itemsSubtotal`, `shareToken? @unique`, `editedAt?`, `@@index([userId, createdAt])`, `@@index([restaurantPlaceId])`** | **NEW (2026-05-25)**. User Cascade. `shareToken` 발급 시 unique 인덱스로 공개 read-only 라우트가 O(1) 조회. `editedAt` 은 participants 수정 시각 — updatedAt 과 분리한 이유는 share 토큰 발급/회수도 updatedAt 을 갱신해 '수정됨' 배지 기준으로 부적합. 자세한 건 [settlement 토픽](./settlement.md) |
| **`SettlementItem`** | **`settlement_items`** | **`sessionId`, `name`, `unitPrice?`, `quantity?`, `amount`, `category` ('ALCOHOL'/'NON_ALCOHOL'/'SIDE'/'UNCATEGORIZED'), `matchedMenuName?`, `orderIndex`, `@@index([sessionId])`** | **NEW (2026-05-25)**. Session Cascade. 분배 계산은 `amount` 만 사용 |
| **`SettlementParticipant`** | **`settlement_participants`** | **`sessionId`, `name?`/`nickname?` (둘 중 하나 필수), `excludeAlcohol/NonAlcohol/Side`, `shareAmount` 스냅샷, `orderIndex`, `contactId?` (FK SetNull), `@@index([sessionId])`, `@@index([contactId])`** | **NEW (2026-05-25)**. Session Cascade. Contact SetNull — 단골이 삭제돼도 정산 본체는 보존 |
| **`SettlementContact`** | **`settlement_contacts`** | **`userId`, `name?`/`nickname?`, `normalizedKey` (= `lower(trim(name))\|lower(trim(nickname))`), `lastExcludeAlcohol/NonAlcohol/Side`, `useCount` default 1, `lastUsedAt`, `@@unique([userId, normalizedKey])`, `@@index([userId, lastUsedAt])`** | **NEW (2026-05-25)**. User Cascade. 정산 저장 시 자동 upsert. 자동완성 / 다중 선택 / `/me/contacts` CRUD 의 원천 |

**Restaurant ↔ Canonical 관계 핵심**:
- 신규 Restaurant 생성 시 항상 nested `canonical: { create: {...} }` 로 자기 전용 CanonicalRestaurant 1행을 동시 생성.
- `Restaurant.canonicalId` FK 는 `onDelete: Restrict` (Cascade **아님**) — 다른 source 행이 남아있을 때 한 source 만 지워도 canonical 은 보존.
- `CanonicalMergeProposal.canonicalA/BId` FK 는 반대로 Cascade.

**Settlement 관계 핵심**:
- `SettlementSession → SettlementItem` / `→ SettlementParticipant` 둘 다 Cascade — 세션 삭제 시 깔끔하게 정리.
- `User → SettlementSession` / `→ SettlementContact` 둘 다 Cascade — 회원 탈퇴 시 정산/단골 모두 같이 삭제.
- `SettlementParticipant → SettlementContact` 는 **SetNull** — 단골을 삭제해도 과거 정산의 참여자 행은 남고 `contactId` 만 null 로 끊긴다 (이력 보존).
- `SettlementSession.shareToken @unique` — null 인 행이 여러 개여도 unique 제약 위반 아님 (SQLite 기준), 토큰 발급된 한 행만 토큰으로 O(1) 조회 가능.

**`Restaurant.source` 분기**: `naver` (`sourceId == placeId`) / `diningcode` (`sourceId = vRid`, `placeId = null`) / `catchtable` (검증 단계). cross-source unique = `(source, sourceId)`.

캐스케이드 체인:
- `Restaurant → VisitorReview → ReviewSummary → MenuMention/ReviewTag`, `Restaurant → MenuCanonical → GlobalMenuCanonicalLink` (모두 Cascade).
- `Restaurant → CanonicalRestaurant` Restrict.
- `CanonicalRestaurant → CanonicalMergeProposal` Cascade.
- `User → SettlementSession → SettlementItem/SettlementParticipant` Cascade.
- `User → SettlementContact` Cascade, `SettlementContact → SettlementParticipant` SetNull.

**SQLite Cascade 가 실제 동작하려면 `PRAGMA foreign_keys=ON` 이 필수** — [plugins/prisma.ts](../../apps/friendly/src/plugins/prisma.ts) 가 부팅마다 켠다. 끄면 ON DELETE CASCADE 가 silent 무시되어 orphan 자식 행이 남는다.

마이그레이션 (최근순):
- **`20260524112443_add_settlement_edited_at`** — **(NEW 2026-05-25)** `SettlementSession.editedAt` 컬럼
- **`20260524000000_add_settlement_contacts`** — **(NEW 2026-05-25)** `SettlementContact` 테이블 + `SettlementParticipant.contactId` FK(SetNull) 컬럼
- **`20260523030833_add_settlement_share_token`** — **(NEW 2026-05-25)** `SettlementSession.shareToken @unique` 컬럼
- **`20260523012752_add_settlement_models`** — **(NEW 2026-05-25)** `SettlementSession` + `SettlementItem` + `SettlementParticipant` 테이블 (3종)
- **`20260523010655_pnpm_filter_friendly_test_src_modules_ai`** — **(NEW 2026-05-25)** `LlmProviderConfig` 테이블 재정의: `purpose` 컬럼 default `'chat'` 추가 + `(provider, purpose) @@unique` 로 unique 키 교체. 기존 행은 chat 으로 백필.
- `20260518014530_add_crawl_job_log` — `CrawlJobLog` 테이블
- `20260515104718_add_canonical_merge_proposals` — `CanonicalMergeProposal` 테이블
- `20260515100910_add_canonical_suggestion_dismissed` — `CanonicalRestaurant.suggestionDismissedAt`
- `20260515083303_add_canonical_restaurant` — `CanonicalRestaurant` + Restaurant.canonicalId 백필
- `20260515063258_add_restaurant_source_split` — Restaurant.source/sourceId + unique 키
- `20260508173216_add_map_provider_configs` — `MapProviderConfig`
- `20260509_add_global_menu_category_path` — `GlobalMenuCanonical.categoryPath`
- `20260509_add_global_menu_canonicals` — `GlobalMenuCanonical` + Link
- `20260509_add_menu_canonicals` — `MenuCanonical`
- `20260509_add_analytics_tables` — `MenuMention` + `ReviewTag`
- `20260508122321_add_visitor_review_videos` — `videosJson`
- `20260508095207_add_review_analysis_fields`
- `20260506205226_add_restaurant_review_summary`
- `20260506191413_add_llm_provider_config`

디스크 영속:
- `apps/friendly/data/dev.db` — SQLite DB 파일 (Prisma CLI + 서버 + vitest 가 모두 같은 파일 가리킴)
- `apps/friendly/data/thumbs/<sha1>.jpg` — media 모듈 썸네일 캐시
- **`apps/friendly/data/receipts/<uuid>.jpg` — (NEW)** settlement-extraction 이 업로드받은 영수증 원본 보관

JWT payload: `{ userId: string; email: string; role: 'USER' | 'ADMIN' }`.

환경 변수 — [src/config/env.ts](../../apps/friendly/src/config/env.ts) 의 `EnvSchema` (zod):

| 키                            | 기본값               | 비고                                                                |
| ----------------------------- | -------------------- | ------------------------------------------------------------------- |
| `NODE_ENV`                    | `development`        |                                                                     |
| `PORT`                        | `3000`               |                                                                     |
| `HOST`                        | `0.0.0.0`            |                                                                     |
| `DATABASE_URL`                | (필수)               | **`.env.example` 기준 `file:../data/dev.db`** — Prisma cwd 와 서버 cwd 양쪽에서 같은 `apps/friendly/data/dev.db` 를 가리킨다 |
| `JWT_SECRET`                  | (필수)               | min 32 chars                                                        |
| `JWT_EXPIRES_IN`              | `7d`                 |                                                                     |
| `CORS_ORIGIN`                 | `*`                  |                                                                     |
| `LOG_LEVEL`                   | `info`               |                                                                     |
| `OLLAMA_CLOUD_API_KEY`        | `''`                 | DB 의 `LlmProviderConfig.apiKey` 가 비어있을 때 fallback. **purpose='chat' 한정** |
| `OLLAMA_CLOUD_BASE_URL`       | `https://ollama.com` |                                                                     |
| `OLLAMA_CLOUD_TIMEOUT_MS`     | `60000`              |                                                                     |
| `OLLAMA_CLOUD_MAX_CONCURRENT` | `15`                 |                                                                     |
| `OLLAMA_DEFAULT_MODEL`        | `''`                 | **purpose='chat' 한정** — image purpose 는 DB row 의 `defaultModel` 만 사용 |

스크립트 (`apps/friendly/scripts/`):
- `promote-admin.ts` — 첫 ADMIN 승격 (`pnpm --filter friendly promote-admin`)
- **`backfill-contacts.ts` — (NEW 2026-05-25)** 기존 `SettlementParticipant` 들을 `(userId, normalizedKey)` 로 그룹화해 `SettlementContact` 를 만들고 `participant.contactId` 를 채우는 1회 멱등 마이그레이션. `session.createdAt asc + participant.orderIndex asc` 순회로 최신 정산의 exclude* 가 `lastExclude*` 로 남도록 보장. 실행: `pnpm --filter friendly backfill:contacts`.
- `dev-capture-visitor.ts` / `dev-fetch-visitor-html.ts` / `dev-open-visitor-page.ts` / `dev-capture-catchtable.ts` — crawl 디버그 도구.

## Key Decisions [coverage: high — 28 sources]

- **Zod = 단일 진실 (SSOT)** — 라우트 스키마는 모두 `@repo/api-contract`. `fastify-type-provider-zod`가 런타임 검증 + TS 타입 추론 + OpenAPI 자동 생성.
- **autoload 두 단계** — `plugins/`는 무조건 전부, `modules/`는 `*.route.ts` 파일만.
- **모듈 레이아웃** — CLAUDE.md 규칙대로 모듈마다 `*.route.ts` + `*.service.ts` + `*.test.ts` 트리오.
- **공개 라우트는 별도 라우트로 분리, 응답 스키마도 다르게** — restaurant 의 `publicList/publicByPlaceId/publicInsights/ranking`, settings 의 `publicConfig`, **settlement 의 `/share/settlements/:token`** 모두 admin/owner 라우트와 path 자체가 다르고 service 메소드도 별개.
- **공개 list 의 메모리 파싱 + bbox 필터** — snapshotJson 안의 좌표/사진/도로명을 SQL where 로 못 거름 → 메모리 파싱.
- **restaurant.list canonical 정렬은 메모리에서** — 정렬 키(만족도/긍정/부정비율) 가 sources 합산이라 DB SQL 로 못 빼므로 모든 canonical 의 메타·집계·후보매칭을 계산한 뒤 메모리 정렬·slice. < 1k canonical 가정.
- **cross-source 가게는 `Restaurant` 다행 + `CanonicalRestaurant` 1행 패턴**.
- **`(source, sourceId)` 가 cross-source unique 키** — 공개 라우트 호환을 위해 `placeId @unique` (nullable) 도 그대로 유지.
- **`Restaurant.canonicalId` FK 가 Cascade 아님 (Restrict) — 의도된 trap**.
- **자동 매칭은 큐만 적재, 머지는 사람이 확정** (단, Naver→DC 한정 자동 머지).
- **(A,B) 쌍 정규화 (A<B cuid 사전순)**.
- **bigram Jaccard + Haversine 200m 선형 감쇠**.
- **`PRAGMA foreign_keys=ON` 부팅 강제** — SQLite 의 기본 OFF 상태에선 Prisma 스키마의 `onDelete: Cascade` 가 silent 무시되어 자식 행이 orphan 으로 남는다. `plugins/prisma.ts` 가 `$executeRawUnsafe('PRAGMA foreign_keys = ON')` 으로 매 연결 켠다 (SQLite 는 connection-scoped). WAL + busy_timeout 30s 와 묶음 — Prisma 의 "Transaction not found" 가 SQLITE_BUSY 에서 비롯되는 케이스 차단.
- **DB 경로는 `apps/friendly/data/dev.db` 한 곳** — `.env.example` 의 `DATABASE_URL=file:../data/dev.db` 가 Prisma CLI cwd (`apps/friendly/prisma/`) 와 서버 cwd (`apps/friendly/`) 양쪽 모두에서 같은 파일을 가리키도록 설계. 마이그레이션이 `prisma/dev.db` 를 만들고 서버는 `data/dev.db` 를 보는 분기 사고를 막는다. vitest 도 같은 `.env` 를 수동 로드해 동일 DB.
- **vitest `fileParallelism: false` (직렬 실행)** — 단일 `dev.db` 를 공유하면서 한 테스트가 `restaurant.deleteMany` 로 cascade 삭제 중일 때 다른 파일의 read 가 중간 상태를 잡아 "Field review is required ... got null" 단속 오류가 발생한다. 격리 DB 인스턴스를 따로 안 쓰는 한 직렬화가 가장 단순하고 안정적. + `deps.inline: [/^@repo\//, '@fastify/autoload']` 로 autoload 의 dynamic import 가 vite 의 `extensionAlias` 를 타도록.
- **LLM provider × purpose 분리** — `LlmProviderConfig` 의 unique 가 `(provider, purpose)`. chat 과 image 가 서로 다른 model/concurrency/baseUrl 을 가질 수 있다. `AiConfigService.getResolved(provider, purpose)` 가 모든 호출처에서 명시적이고, `adapter-cache` 키도 `provider|purpose` prefix 포함이라 두 어댑터가 독립 게이트. **env fallback 은 chat 만** — image 는 환경변수로 묶기 어려운 다른 vendor/model 인 경우가 많아 DB row 가 명시적으로 등록되어야 동작.
- **multipart 한도는 영수증 한 장 (5MB)** — `plugins/multipart.ts` 의 `fileSize: 5 * 1024 * 1024 + files: 1 + fields: 5`. 한도 초과 시 fastify-multipart 가 자동 413. 다른 multipart 소비자가 생기면 한도/필드 수 상향은 같은 플러그인에서.
- **영수증 jpg 는 `data/receipts/<uuid>.jpg` 디스크 보관** — DB 에는 토큰 (`SettlementSession.receiptImageToken`) 만 저장. media 모듈의 `data/thumbs/` 와 같은 사상.
- **단골 자동 적립 — `(userId, normalizedKey)` upsert** — 정산 저장 시 `settlement.service` 가 모든 participant 를 `SettlementContact` 에 upsert 하고 `participant.contactId` 를 채운다 (FK SetNull). 자동완성 / 다중 선택 모달 / `/me/contacts` 모두 같은 테이블. `normalizedKey = lower(trim(name))|lower(trim(nickname))` — 사용자가 같은 이름을 다른 대소문자/공백으로 다시 쳐도 같은 row 로 매칭.
- **공유 토큰은 32바이트 base64url + unique 인덱스** — `SettlementSession.shareToken` 이 null 일 땐 비공개, owner 가 POST `/settlements/:id/share` 로 멱등 발급 / DELETE 로 회수. 토큰 자체가 추측 불가능해 인증 없이 `/share/settlements/:token` 으로 O(1) read-only 조회 가능. 토큰 발급/회수는 `updatedAt` 을 갱신하지만 `editedAt` 은 건드리지 않아 '수정됨' 배지가 오해 없이 동작.
- **vworld 키는 LlmProviderConfig 와 같은 DB-backed 패턴이지만 env fallback 없음**.
- **vworld secret 라우트는 평문 reveal**, **vworld `publicConfig` 는 admin secret 과 보안 등급이 동등**.
- **JWT `?token=` 쿼리 + 로그 redaction**.
- **Multiplexed Summary SSE + canonicalId 구독**.
- **요약 이벤트 두 종류** — `progress`/`review`.
- **리뷰 dedup = externalId + contentHash 이중 키**.
- **1 review = 1 ReviewSummary** — `reviewId @unique`.
- **Summary placeId-level 직렬화 + 어댑터 공유 FIFO 게이트**.
- **부팅 시 stale 요약 행 정리 + 자동 재큐잉**.
- **`ReviewSummary.status` enum 6종 — 단계별 의미 분리**.
- **SummaryService 는 app 전역 singleton (`plugins/summaries.ts`)**.
- **CrawlJobLog 시스템 — 한 진입점 / 세 채널 / `(jobId, seq)` dedup**.
- **canonical 그룹 detail = response-time fusion**.
- **`MAX_CONCURRENT_PER_ACTOR = 5`**.
- **리뷰 단위 자동 재시도 3회**.
- **`ANALYSIS_VERSION = 4`**.
- **Ollama structured output + numCtx=4096**.
- **`extractFirstJsonObject` / `normalizeTerm` 공유 export**.
- **분석 정규화 테이블 도입 동기** — 글로벌 통계용 GROUP BY 가능 행 단위 필요.
- **Summary는 fire-and-forget + 공유 FIFO 게이트**.
- **Media는 디스크 캐시 + sharp**.
- **No Docker / No Redis** — CLAUDE.md 규칙.
- **dev = `tsx watch`, prod = `tsup` 번들** — `target: node22`, ESM.
- **Vitest는 `extensionAlias` + 수동 .env 로드 + 직렬 실행**.

## Gotchas [coverage: medium — 15 sources]

- **canonical 1:1 시작 → merge 로 N:1 로 진화**.
- **`canonicalId` FK 가 Cascade 아니라 Restrict**.
- **`CanonicalMergeProposal` 의 (A,B) 쌍은 항상 A<B 정규화**.
- **`Restaurant.source` 분기 라우팅 — 공개 표면은 네이버 전용**.
- **`Restaurant.placeId` 가 nullable** — `r.placeId!` 는 모두 `source = 'naver'` 필터와 짝.
- **lib/matching 의 임계 변경 = 큐 폭증 위험**.
- **`snapshotJson` 파손 시 좌표/사진만 null fallback**.
- **bbox NaN/length 방어**.
- **공개 list 정렬에서 null 은 항상 뒤** (`nullsLast` 헬퍼).
- **공개 detail 의 `analysis` 는 done 한정**, **mixed 카운트 누락은 의도**.
- **vworld `publicConfig` 키 미등록 시 404 → FE 가드 필요**.
- **공개 vs admin getInsights — 응답 스키마는 같지만 가드만 다르다**.
- **Windows에서 Prisma DLL lock (EPERM)**.
- **`extractFirstJsonObject` cross-module 의존성**.
- **v3 행 + v4 코드 공존** — null sentiment 는 'neutral' 로 폴백.
- **`JWT_SECRET` 32자 미만 → 부팅 실패**.
- **회원가입은 무조건 USER** — 첫 ADMIN은 `scripts/promote-admin.ts`.
- **`?token=` 마스킹은 app.ts에만 있다**.
- **DELETE restaurant ↔ in-flight crawl = 409**.
- **summary 모듈은 라우트 미노출** — restaurant 라우트가 호스팅.
- **`cleanupStaleReviewSummaries` 는 단일 인스턴스 가정**.
- **summary SSE heartbeat 는 `named heartbeat` 이벤트** (다른 SSE 는 comment).
- **`MAX_CONCURRENT_PER_ACTOR = 5` 와 auto-discover GROUP_SIZE 동일**.
- **`createMany skipDuplicates` SQLite 미지원**.
- **Ollama `num_ctx` 기본 2048 함정** — 4096 + maxTokens 1500 명시.
- **autoload는 vite resolve를 우회한다** — vitest 통합 부팅 깨지기 쉬움.
- **media `data/thumbs/` 디렉터리 누적** — 만료 로직 없음. **`data/receipts/<uuid>.jpg` 도 동일** — settlement 세션 삭제 시 jpg 파일은 그대로 남는다 (현재 GC 없음).
- **media는 public(인증 없음)** — ALLOWED_HOSTS 가 SSRF 가드 전부. **`/share/settlements/:token` 도 인증 없음** — 토큰의 추측 불가능성에 보안 전부 의존.
- **`tsx watch`는 `src/`만 감시한다**.
- **crawl 검색/다이닝코드/캐치테이블 적응형 의존**.
- **`DATABASE_URL` 의 `..` 상대 경로 함정** — Prisma CLI 와 서버 cwd 가 다르면 같은 URL 이 다른 파일을 가리킨다. `apps/friendly/.env` 의 `file:../data/dev.db` 는 prisma 디렉터리 (`apps/friendly/prisma/`) → `apps/friendly/data/dev.db` + 서버 cwd (`apps/friendly/`) → `apps/friendly/data/dev.db` 로 우연히 일치하도록 설계된 것이지, 임의의 cwd 에서 안전하지 않다. 다른 디렉터리에서 prisma 명령을 돌리면 엉뚱한 dev.db 가 생긴다.
- **SQLite `PRAGMA foreign_keys` 는 connection-scoped** — Prisma 가 연결을 새로 만들 때마다 OFF 로 돌아간다. `plugins/prisma.ts` 가 부팅 1회만 켜므로 같은 PrismaClient 인스턴스의 connection pool 안에서만 유효. dev 에서 `prisma migrate dev` 같은 외부 CLI 는 자체 연결을 쓰므로 별개.
- **`LlmProviderConfig` unique 키 변경 (2026-05-25)** — `provider @unique` → `(provider, purpose) @@unique` 로 바뀌었다. 같은 provider 의 새 row 를 추가할 땐 반드시 `purpose` 도 명시. 기존 백필은 `purpose='chat'` 으로 채워졌으므로 image purpose 카드는 어드민이 명시적으로 추가해야 노출. `getResolved` 는 인자에 `purpose` 필수.
- **env fallback 은 purpose='chat' 한정** — image purpose 는 환경변수 fallback 없음. DB row 가 없으면 settlement-extraction 의 `getResolved('ollama-cloud', 'image')` 가 null 을 돌려준다 → 추출 라우트가 503 또는 명시 에러로 떨어짐.
- **`SettlementSession.shareToken @unique` + nullable** — 토큰이 null 인 행이 여러 개여도 SQLite 의 unique 제약은 NULL 을 distinct 취급해 허용. 토큰 발급된 행만 토큰으로 검색.
- **단골 `normalizedKey` 계산은 service 전담** — 직접 SQL 로 SettlementContact 를 만들면 normalizedKey 가 어긋나 정산 저장 시 자동 적립이 새 row 를 만들어 버린다 (같은 사람이 두 행으로 분기). `settlement.service` 의 `normalizeContactKey` 함수만 거쳐야 함 — `backfill-contacts.ts` 가 같은 함수를 import 한다.
- **`backfill-contacts.ts` 정렬은 createdAt asc 필수** — `lastExcludeAlcohol/NonAlcohol/Side` 가 가장 최근 정산의 값으로 남으려면 오래된 정산부터 순회해야 한다. desc 로 돌리면 가장 오래된 exclude 값이 마지막에 덮어써 default 제안이 의도와 반대로 나옴.

## Sources [coverage: high — 81 sources]

- [apps/friendly/package.json](../../apps/friendly/package.json)
- [apps/friendly/src/plugins/summaries.ts](../../apps/friendly/src/plugins/summaries.ts)
- [apps/friendly/src/plugins/multipart.ts](../../apps/friendly/src/plugins/multipart.ts)
- [apps/friendly/src/plugins/prisma.ts](../../apps/friendly/src/plugins/prisma.ts)
- [apps/friendly/src/modules/crawl/job-log.service.ts](../../apps/friendly/src/modules/crawl/job-log.service.ts)
- [apps/friendly/prisma/migrations/20260524112443_add_settlement_edited_at/migration.sql](../../apps/friendly/prisma/migrations/20260524112443_add_settlement_edited_at/migration.sql)
- [apps/friendly/prisma/migrations/20260524000000_add_settlement_contacts/migration.sql](../../apps/friendly/prisma/migrations/20260524000000_add_settlement_contacts/migration.sql)
- [apps/friendly/prisma/migrations/20260523030833_add_settlement_share_token/migration.sql](../../apps/friendly/prisma/migrations/20260523030833_add_settlement_share_token/migration.sql)
- [apps/friendly/prisma/migrations/20260523012752_add_settlement_models/migration.sql](../../apps/friendly/prisma/migrations/20260523012752_add_settlement_models/migration.sql)
- [apps/friendly/prisma/migrations/20260523010655_pnpm_filter_friendly_test_src_modules_ai/migration.sql](../../apps/friendly/prisma/migrations/20260523010655_pnpm_filter_friendly_test_src_modules_ai/migration.sql)
- [apps/friendly/prisma/migrations/20260518014530_add_crawl_job_log/migration.sql](../../apps/friendly/prisma/migrations/20260518014530_add_crawl_job_log/migration.sql)
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
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)
- [apps/friendly/scripts/promote-admin.ts](../../apps/friendly/scripts/promote-admin.ts)
- [apps/friendly/scripts/backfill-contacts.ts](../../apps/friendly/scripts/backfill-contacts.ts)
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
- [apps/friendly/src/modules/analytics/analytics.service.ts](../../apps/friendly/src/modules/analytics/analytics.service.ts)
- [apps/friendly/src/modules/analytics/](../../apps/friendly/src/modules/analytics/)
- [apps/friendly/src/modules/media/media.route.ts](../../apps/friendly/src/modules/media/media.route.ts)
- [apps/friendly/src/modules/media/media.test.ts](../../apps/friendly/src/modules/media/media.test.ts)
- [apps/friendly/src/modules/settings/map.route.ts](../../apps/friendly/src/modules/settings/map.route.ts)
- [apps/friendly/src/modules/settings/map.service.ts](../../apps/friendly/src/modules/settings/map.service.ts)
- [apps/friendly/src/modules/settings/map.test.ts](../../apps/friendly/src/modules/settings/map.test.ts)
- [apps/friendly/src/modules/ai/adapter-cache.ts](../../apps/friendly/src/modules/ai/adapter-cache.ts)
- [apps/friendly/src/modules/ai/ai.config.service.ts](../../apps/friendly/src/modules/ai/ai.config.service.ts)
- [apps/friendly/src/modules/contact/contact.route.ts](../../apps/friendly/src/modules/contact/contact.route.ts)
- [apps/friendly/src/modules/contact/contact.service.ts](../../apps/friendly/src/modules/contact/contact.service.ts)
- [apps/friendly/src/modules/contact/contact.route.test.ts](../../apps/friendly/src/modules/contact/contact.route.test.ts)
- [apps/friendly/src/modules/settlement/settlement.route.ts](../../apps/friendly/src/modules/settlement/settlement.route.ts)
- [apps/friendly/src/modules/settlement/settlement.service.ts](../../apps/friendly/src/modules/settlement/settlement.service.ts)
- [apps/friendly/src/modules/settlement/settlement.route.test.ts](../../apps/friendly/src/modules/settlement/settlement.route.test.ts)
- [apps/friendly/src/modules/settlement/settlement.calculator.test.ts](../../apps/friendly/src/modules/settlement/settlement.calculator.test.ts)
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts)
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts)
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts)
- [apps/friendly/tsconfig.json](../../apps/friendly/tsconfig.json)
- [apps/friendly/tsup.config.ts](../../apps/friendly/tsup.config.ts)
- [apps/friendly/vitest.config.ts](../../apps/friendly/vitest.config.ts)
- [apps/friendly/.env.example](../../apps/friendly/.env.example)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)
