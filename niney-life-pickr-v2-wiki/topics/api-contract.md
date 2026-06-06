---
topic: api-contract
last_compiled: 2026-06-06
sources_count: 25
status: active
aliases: [zod, schemas, ssot, contracts, "@repo/api-contract", canonical, canonical-merge, canonical-split, canonical-proposal, canonical-suggestion, catchtable, catchtable-search, catchtable-shop, diningcode, diningcode-search, diningcode-shop, diningcode-bulk-save, naver-search-result, crawl-search-query, crawl-search-result, search-bbox, auto-discover, auto-discover-job, auto-discover-phase, auto-discover-snapshot, fused-detail, public-sources, public-diningcode-addon, crawl-log, crawl-log-level, crawl-job-log-entry, review-summary-queued, review-summary-cancelled, restaurant-cancel-summary, restaurant-resume-summary, summary-log-event, public-reviews-pagination, public-review-sentiment, public-review-sort, settlement, settlement-session, settlement-participant, settlement-item, settlement-share, settlement-shared, settlement-contact, settlement-extraction, receipt-item, receipt-item-category, settlement-calculator, calculate-shares, llm-provider-purpose, ai-purpose, settlement-draft, settlement-draft-schema, SettlementDraft, UpsertSettlementDraftInput, settlement-rounds, SettlementRound, SettlementRoundAttendee, calculateMultiRoundShares, effectiveExcludes, perCategoryShares, ExtractReceiptSplit, roundIndex, roundTotal, fromDraftId, update-PUT, full-replace, leftoverParticipantClientId, roundUnit-100-1000, categoryAdjustments, SharedSettlementRound, omit-extend, attendees-100, items-200, models-preview, share-og-image, ShareOgImage, og-image, og-image-url, og-image-candidates, ogImageUrl, ogImageCandidates, share-ttl, ShareTtl, expiresAt, receiptImageToken, eslint-config, schedule, schedule-config, schedule-run, schedule-runs, schedule-preview, schedule-progress, schedule-done, ScheduleJobType, ScheduleTrigger, ScheduleRunStatus, SchedulePhase, ScheduleConfig, ScheduleConfigInput, ScheduleRun, ScheduleRunList, ScheduleProgressEvent, ScheduleDoneEvent, SchedulePreviewInput, SchedulePreviewResult, normalize-merge, cron, croner, normalize-merge-pipeline, restaurant-category-tree, RestaurantCategoryTreeResult, public-category-tree, review-tip-filter, review-menu-filter]
---

# api-contract — Zod 공유 스키마 (SSOT)

**2026-06-06 변경 흡수 (17차) — schedule.ts 신규(주기 자동 실행) + 공개 식당 카테고리 트리 + 리뷰 tip/menu 필터**: 관리자가 cron 으로 "정규화 → 글로벌 머지" 파이프라인을 예약하는 **신규 `schemas/schedule.ts`** 가 추가됐다 (12 export). 다섯 enum (`ScheduleJobType`=`'normalize-merge'` 단일 / `ScheduleTrigger`=`cron|manual` / `ScheduleRunStatus`=`running|done|failed|skipped|interrupted` / `SchedulePhase`=`collecting|grouping|merging|done`) + 설정 페어 (`ScheduleConfig` 응답 / `ScheduleConfigInput` 입력, `cronExpr` 1..120, `timezone` default `'Asia/Seoul'`) + 실행 (`ScheduleRun` — live 스냅샷·영속 이력 공용 shape / `ScheduleRunList`) + SSE 이벤트 (`ScheduleProgressEvent` / `ScheduleDoneEvent`) + cron 미리보기 (`SchedulePreviewInput` / `SchedulePreviewResult`). **cron 식 형식 검증은 서버 라우트가 croner 로** — api-contract 는 croner 에 의존하지 않는 순수 스키마 패키지로 남았다 (shared → api-contract 단방향 의존 규칙과 일관, [zod-ssot-buildless](../concepts/zod-ssot-buildless.md)). `routes.ts` 에 `Routes.Schedule` namespace 신설 (`config`/`run`/`runs`/`runEvents`/`preview` — 모두 `/admin/schedule/...` 어드민 게이트), `index.ts` 가 schedule re-export 추가. `restaurant.ts` 는 신규 **`RestaurantCategoryTreeResult`** (`{ roots: CategoryTreeNode[] }` — analytics 의 `CategoryTreeNode` 를 import 해 식당별 멘션만 누적) + `RestaurantPublicReviewsQuery` 에 **`tip?`/`menu?`** 필터 두 필드 추가 (인사이트의 topTips/topMenus 클릭 → 그 항목 달린 리뷰만), `Routes.Restaurant.publicCategoryTree(placeId)` 추가.

**2026-05-31 변경 흡수 — 정산 공유 OG 이미지 선택 페어 + share TTL/만료 + receiptImageToken + ESLint 합류**: 정산 공유 링크의 미리보기(OG) 이미지를 owner 가 고를 수 있게 `settlement.ts` 가 확장됐다. **신규 `ShareTtl` enum (`'1d'|'7d'|'30d'`)** + **`ShareOgImage` enum (`'restaurant'|'table'`)** — `restaurant` 는 정산 식당 사진(네이버 호스트, owner 가 갤러리에서 특정 1장 고르거나 미선택 시 토큰 시드 결정적 랜덤), `table` 은 정산표 매트릭스 PNG. `CreateSettlementShareInput` 가 `z.preprocess((v)=> v==null?{}:v, …)` 로 본문 없는 POST 도 `{}` 로 메꿔 `ttl` 기본 7일을 적용하게 바뀌었고, `ogImage?: ShareOgImage` (생략=기존 유지) + **`ogImageUrl?: string.url().nullable()` 트라이스테이트** (생략=기존 유지 / null=선택 해제→랜덤 / URL=후보 목록의 특정 사진 고정) 를 받는다. `SettlementShare` 응답이 `token/shareUrl` 외에 **`expiresAt`** (ISO, 토큰 없으면 null) + **`ogImage`** (복원용 현재 선택) + **`ogImageUrl`** (선택된 식당 사진 원본 URL, 미선택 null) + **`ogImageCandidates: string[]`** (갤러리 후보 원본 URL, 식당 사진 없으면 빈 배열→갤러리 숨김 자동 정산표 폴백) 4 필드로 확장. `SettlementRound` 에 **`receiptImageToken: string|null`** 가 추가됐다 — 편집 재진입 시 토큰을 그대로 돌려줘 재저장에도 영수증이 보존된다 (소유자 응답 한정). 따라서 `SharedSettlementRound` 의 omit 가 `receiptPreviewUrl` 단일에서 **`{ receiptPreviewUrl, receiptImageToken }` 두 필드**로 늘었다 — 토큰 보유자는 둘 다 못 본다. ESLint: `packages/api-contract/eslint.config.mjs` 신규 (`@repo/config/eslint/base` flat config + `dist/`·`node_modules/` ignore), `package.json` 에 `lint: "eslint ."` + `eslint@^10.4.1` devDep 추가 — turbo lint 4/4 green 합류.

**2026-05-28 변경 흡수 — 정산 N차 모델 + Draft 도메인 + calculator 멀티라운드 확장**: 정산이 **세션당 단일 차수**에서 **N차(최대 10) 모델**로 재구성됐다. `settlement.ts` 가 전면 재작성 — 세션 본문이 `items[]/attendees[]` 직속에서 `rounds: SettlementRound[].min(1)` 로 이동했고, 신규 `SettlementRound`/`SettlementRoundInput`/`SettlementRoundAttendee`/`SettlementRoundAttendeeInput` 가 차수 단위 식당 snapshot·source·할인·`categoryAdjustments`·items·attendees 를 묶는다. 참여자는 **마스터 + round override** 2단 구조 — `SettlementParticipant` 는 기본 `excludeXxx` boolean, `SettlementRoundAttendee` 는 `excludeXxxOverride: boolean | null` (null=마스터 default). `SettlementCategoryAdjustment` (응답) + `SettlementCategoryAdjustmentInput` (입력) 이 카테고리별 `leftoverParticipantId/ClientId` + `roundUnit` (100/1000원 단위) 으로 분담 다듬기 규칙을 표현. `CreateSettlementInput.fromDraftId` 가 추가돼 임시저장에서 출발한 저장이면 같은 트랜잭션에서 해당 draft 가 함께 삭제된다. `UpdateSettlementInput = CreateSettlementInput` 별칭 — 부분 PATCH 가 아닌 **전체 replace PUT** 으로 통일됐다 (이전 `updateParticipants` PATCH 라우트 폐기). attendees per round cap 20→**100**, items per round cap 100→**200**. **`schemas/settlement-draft.ts` (신규)** — `SettlementDraft`/`UpsertSettlementDraftInput`/`ListSettlementDraftsResult`. payload 는 `z.unknown()` 으로 받고 서버는 형태 검증 없이 보관, 직렬화 길이 200KB cap 만 refine. `(userId, placeId)` unique — 같은 식당 draft 는 하나. **`settlement.calculator.ts` 멀티라운드 확장** — 신규 `calculateMultiRoundShares(input: MultiRoundCalcInput): MultiRoundCalcOutput` 가 차수별 (items × 참석자 부분집합) 을 독립 calc 후 마스터 인덱스로 합산. `calculateShares` 자체에는 옵션 `discount?: { amount, category } | null` (풀 음수 클램프) + `categoryAdjustments?: CategoryAdjustmentsInput | null` (카테고리별 `roundUnit` rounding + leftover 흡수자) 추가, 반환에 `perCategoryShares: Record<카테고리, number[]>` 매트릭스 신규. `effectiveExcludes(master, override)` helper 가 마스터+round override 를 합성. **`settlement-extraction.ts`** — `ExtractReceiptSplit` (한 사진에 N장 영수증 가로 N등분, count 2~5 + index 1..count) 신규, `ExtractReceiptInput` 에 `roundIndex`/`roundTotal` (1..20) + `split` 옵션 추가. 같은 `imageToken` 으로 N번 extract 호출. **`routes.ts`** — `Routes.Settlement.update(id)` (PUT) 가 `updateParticipants` 자리를 대체, `Routes.SettlementDraft.{list, upsert, one(id)}` 신규 namespace, `Routes.Ai.providerModelsPreview(id, purpose)` 추가. `Routes.Restaurant.publicReviews(placeId)` 는 직전 라운드에 추가됐던 그대로 유지.

**2026-05-25 변경 흡수**: 정산 도메인 3 파일 (`settlement.ts`, `settlement-extraction.ts`, `settlement-contact.ts`) + `settlement.calculator.ts` 1차 도입, `LlmProviderPurpose` enum (`chat|image`) + `LlmProviderConfig.purpose` 필드, `Routes.{Settlement, SettlementExtraction, SettlementContact}` 3 namespace 신규. (현재 라운드에서 settlement.ts 가 N차 모델로 재작성됐고 SettlementDraft 가 추가됐다.)

**2026-05-19 변경 흡수**: (1) `crawl.ts` — `CrawlLogLevel` + SSE log variant + `CrawlJobLogEntry` 페이지네이션. (2) `restaurant.ts` — `ReviewSummaryStatus` 6 종 확장, `RestaurantCancel/ResumeSummaryResult`, 공개 리뷰 페이지네이션 분리. (3) `routes.ts` — `Routes.Crawl.jobLogs(:id)`, `Routes.Restaurant.crawlLogs/cancelSummary/resumeSummary/publicReviews`.

`@repo/api-contract` 은 모노레포 전체의 API I/O 단일 진실 공급원(Single Source of Truth)이다.
서버(friendly)와 클라이언트(web/mobile, `@repo/shared` 경유) 양쪽이 동일한 Zod 스키마와
라우트 경로 상수를 공유한다.

## Purpose [coverage: high — 5 sources]

API 의 입력/출력을 한 곳에서 정의하기 위한 Zod 스키마 패키지다. 동일한 스키마가
세 가지 역할을 동시에 수행한다.

- **friendly (Fastify)** — `fastify-type-provider-zod` 가 동일 스키마로 요청/응답을
  런타임 검증하고, 그 메타데이터로 OpenAPI 문서를 자동 생성한다.
- **web / mobile** — `@repo/shared` 의 fetch 함수가 `z.infer<typeof X>` 로 추출한
  타입으로 정적 타입을 부여한다 (런타임 파싱은 옵션).
- **route 경로** — `routes.ts` 의 `Routes.*` 가 서버 라우터 등록과 클라이언트 호출
  양쪽에 같은 문자열을 공급해, 경로 오타로 인한 미스매치를 컴파일 타임에 차단한다.

CLAUDE.md 에 명시된 핵심 규칙 그대로다 — _"FE/BE 모두 사용하는 타입/검증 로직은 반드시
`packages/api-contract/src/schemas/` 에 zod 스키마로 정의한다"_ ([CLAUDE.md](../../CLAUDE.md)).

## Architecture [coverage: high — 13 sources]

### 디렉터리 구조

```
packages/api-contract/
├── package.json          # exports: src/*.ts 직접 노출 (no build). lint 스크립트 + eslint devDep 신규
├── tsconfig.json         # @repo/config/tsconfig/base.json 상속
├── eslint.config.mjs     # **신규** @repo/config/eslint/base flat config + dist/·node_modules/ ignore
└── src/
    ├── index.ts          # 모든 스키마 + Routes namespace + calculator 재내보내기
    ├── routes.ts         # API_PREFIX + 도메인별 경로 상수 (Auth/Users/Picks/Admin/Media/Crawl/Restaurant/Canonical/Analytics/Schedule/AutoDiscover/Ai/SettingsMap/SettlementExtraction/Settlement/SettlementContact/SettlementDraft/Health)
    ├── settlement.calculator.ts # FE/BE 공통 분배 알고리즘 — 카테고리별 풀 + 제외 플래그 → shareAmounts[]. **이번 라운드 멀티라운드 확장** (calculateMultiRoundShares + effectiveExcludes + perCategoryShares 매트릭스 + discount/categoryAdjustments 옵션)
    └── schemas/
        ├── common.ts                # Id, Timestamp, ErrorResponse, Pagination
        ├── auth.ts                  # Register/Login/AuthResponse
        ├── user.ts                  # Role, User, PublicUser
        ├── picks.ts                 # Pick, PickCategory, Create/Update/Result
        ├── admin.ts                 # AdminUsersResponse, SetRole
        ├── crawl.ts                 # NaverPlace 크롤러 + Job/SSE Event + VisitorReview + 네이버 검색 + 캐치테이블 + 다이닝코드(검색·상세·리뷰·등록확인·일괄저장 SSE 잡)
        ├── restaurant.ts            # 어드민/공개 식당 + 리뷰 분석 + summary SSE + insights/smart-pick + analytics backfill + canonical 단위 list (sources[]). **이번 라운드**: RestaurantCategoryTreeResult(식당별 category tree, analytics CategoryTreeNode import) + PublicReviewsQuery.tip/menu 필터
        ├── canonical.ts             # 가게 정체(canonical) 통합 — candidates/merge/split/dismissSuggestion + proposal 큐 + canonical 삭제
        ├── menu-grouping.ts         # 식당 단위 메뉴 정규화 + ranking + grouping job (다건/SSE)
        ├── auto-discover.ts         # 맛집 자동 발견 잡 — AI 키워드 8개 → 다중 검색 → 그룹 5병렬 크롤. state + phase 두 enum 분리
        ├── analytics.ts             # 글로벌 메뉴 통계 + 머지 잡 + category tree (z.lazy 재귀)
        ├── schedule.ts              # **신규** 주기 자동 실행 — cron 으로 "정규화 → 글로벌 머지" 예약. 5 enum + config/run/SSE/preview (12 export). cron 검증은 croner(서버) — 패키지는 croner 미의존
        ├── ai.ts                    # AI 호출 + 배치 + LLM Provider 관리 (purpose=chat/image enum) + PreviewLlmModelsInput/Result
        ├── settings-map.ts          # 외부 지도 SDK provider config (admin + public reveal)
        ├── settlement-extraction.ts # 영수증 업로드(token)/추출(vision LLM) + ReceiptItemCategory enum. **이번 라운드 신규**: ExtractReceiptSplit (count/index) + ExtractReceiptInput.roundIndex/roundTotal/split
        ├── settlement.ts            # N차(rounds) 정산 — SettlementRound/RoundAttendee + 마스터 participants + categoryAdjustments + 할인. UpdateSettlementInput=CreateSettlementInput 별칭(전체 replace) + fromDraftId. **이번 라운드**: ShareTtl/ShareOgImage enum + CreateSettlementShareInput.ogImage/ogImageUrl + SettlementShare.expiresAt/ogImage/ogImageUrl/ogImageCandidates + SettlementRound.receiptImageToken + SharedSettlementRound 두-필드 omit
        ├── settlement-contact.ts    # 사용자별 단골 참여자 CRUD — list/update + lastExclude* 기억
        └── settlement-draft.ts      # **신규** 정산 입력 임시저장 (자동저장/다기기 동기화) — payload z.unknown(), 200KB cap, (userId, placeId) unique
```

### 빌드 없는 src 직접 노출

[packages/api-contract/package.json](../../packages/api-contract/package.json) 는 `dist/`
가 아니라 `src/` 를 그대로 `exports` 한다.

```json
"main": "./src/index.ts",
"types": "./src/index.ts",
"exports": {
  ".": "./src/index.ts",
  "./schemas/*": "./src/schemas/*.ts",
  "./routes": "./src/routes.ts"
}
```

이 구조 덕분에 tsx (friendly), Vite (web), Metro (mobile) 가 모두 워크스페이스 소스를
바로 트랜스파일한다. Turborepo 의 변경 감지도 빌드 산출물을 거치지 않기 때문에
`pnpm typecheck` 한 번이면 모든 소비자가 즉시 영향을 본다. friendly 는 `injected`
의존성 (workspace + nodeLinker=hoisted) 으로 src 를 직접 본다 — 빌드 산출물 없이도
런타임에서 이 패키지가 그대로 import 가능한 이유.

### 도메인 분할

[src/index.ts](../../packages/api-contract/src/index.ts) 는 단순한 배럴 — 도메인별
파일을 그대로 `export *` 하고, `routes.ts` 는 `Routes` 네임스페이스로 재노출한다.
이번 라운드(17차)에 `schemas/schedule.js` 한 줄이 `analytics` 다음에 추가됐다
(직전 라운드의 `settlement-draft.js` 는 유지).

```ts
export * from './schemas/common.js';
export * from './schemas/auth.js';
export * from './schemas/user.js';
export * from './schemas/picks.js';
export * from './schemas/admin.js';
export * from './schemas/crawl.js';
export * from './schemas/restaurant.js';
export * from './schemas/canonical.js';
export * from './schemas/menu-grouping.js';
export * from './schemas/auto-discover.js';
export * from './schemas/analytics.js';
export * from './schemas/schedule.js';   // 신규 (17차)
export * from './schemas/ai.js';
export * from './schemas/settings-map.js';
export * from './schemas/settlement-extraction.js';
export * from './schemas/settlement.js';
export * from './schemas/settlement-contact.js';
export * from './schemas/settlement-draft.js';
export * from './settlement.calculator.js';
export * as Routes from './routes.js';
```

ESM `.js` 확장자는 TypeScript NodeNext 해석을 위한 의도적 표기 (실파일은 `.ts`).
`settlement.calculator.ts` 는 schemas/ 가 아닌 패키지 루트에 두는데, 순수 함수
계산기는 zod 스키마와 의존 방향이 반대 (calculator → schemas 의 타입을 import 함) 이고
도메인의 "wire shape" 가 아닌 "wire 처리 로직" 이라 분리했다.

### 도메인 간 의존 방향 (one-way)

`restaurant.ts` 가 `crawl.ts` 의 `NaverPlaceData`/`VisitorReview` 뿐 아니라
공개 상세에 평탄화해 노출하는 `BlogReview`/`MenuItem` 까지 import 한다. 역방향은
절대 없다. `visitor_batch` SSE 가 페이로드로 실어 보내는 `PersistedVisitorReview`
도 — 의미상 "맛집 상세에 머지될 행" 이지만 — 의도적으로 `crawl.ts` 에 정의했다.

`restaurant.ts` 가 `crawl.ts` 의 `DiningcodeShopBusinessHour` 를 추가로 import 한다.
직전 라운드에 추가된 `canonical.ts` 의 `CanonicalSuggestion` import 도 유지
(`CanonicalListItem.suggestion`). **이번 라운드(17차) restaurant.ts 가 `analytics.ts` 의
`CategoryTreeNode` 를 새로 import** — `RestaurantCategoryTreeResult.roots` 가 어드민 전역
트리와 같은 노드 구조를 재사용하되 식당별 멘션만 누적하기 때문. 방향은 restaurant →
crawl / canonical / analytics 한쪽 — canonical·analytics 는 어떤 다른 도메인 스키마도
import 하지 않는다. 신규 `auto-discover.ts` 도 자체 타입만 사용. `menu-grouping.ts` 는
여전히 독립.

**신규 `schedule.ts` 는 다른 schemas/ 파일을 전혀 import 하지 않는다** — 자체 enum/object
만 정의한다. 특히 cron 식의 형식 검증을 `croner` 같은 외부 런타임 라이브러리에 의존하지
않고, 단순 `z.string().min(1).max(120)` 길이 검사만 둔다 (실제 cron 파싱·다음 실행 시각
계산은 서버 라우트가 croner 로 수행). api-contract 를 순수 스키마 패키지로 유지하려는
의도적 선택.

`settings-map.ts` 는 다른 어떤 schemas/ 파일도 import 하지 않는다 — provider config
모델은 LLM `LlmProviderConfig` 와 형태가 비슷하지만 의도적으로 중복 선언했다.

정산 패밀리 내부:
- `settlement.ts` 가 `settlement-extraction.ts` 의 `ReceiptItemCategory` 만 import.
- `settlement-contact.ts` 는 자체 타입만 — 단골 row 의 모양은 세션 참여자와 독립이다.
- **`settlement-draft.ts` 는 다른 schemas/ 파일을 전혀 import 하지 않는다** — payload 가
  `z.unknown()` 라 정산 본문 스키마의 어떤 모양에도 묶이지 않는 것이 핵심 디자인.
- `settlement.calculator.ts` 는 `settlement.ts` 의 `SettlementItemInputType` +
  `SettlementParticipantInputType` 와 `settlement-extraction.ts` 의 `ReceiptItemCategoryType`
  타입만 type-only import. 런타임 zod 스키마에는 의존하지 않는다 (순수 계산).

## Talks To [coverage: medium — 3 sources]

- **friendly (apps/friendly)** — 각 `*.route.ts` 가 `RegisterInput`, `CrawlEvent`,
  `RestaurantListResult`, `RestaurantPublicDetail`, `RestaurantPublicReviewsQuery/Result`,
  `RestaurantSummaryReviewEvent`, `RestaurantInsights`, `RestaurantSmartPickInput/Result`,
  `MenuRankingResult`, `MenuGroupingJobInput/Snapshot`, `CanonicalCandidatesResult`,
  `CanonicalMergeInput/Result`, `CanonicalSplitInput/Result`, `CanonicalProposalListResult`,
  `CatchtableSearchQuery/Response`, `CatchtableShopData/MenusResponse/ReviewOverviewResponse`,
  `DiningcodeSearchQuery/Response`, `DiningcodeShopData/ReviewsResponse`,
  `DiningcodeBulkSaveJobInput/Snapshot/ItemEvent/DoneEvent`, `GlobalMenuResult`,
  `CategoryTreeResult`, `AutoDiscoverJobInput/Snapshot/KeywordEvent/CandidateEvent/PhaseEvent/DoneEvent`,
  `AiCompleteInput`, `PreviewLlmModelsInput/Result`, `UpdateLlmProviderInput`,
  `MapProviderConfig`, `CreateSettlementInput`, `UpdateSettlementInput`, `SettlementSession`,
  `SharedSettlementSession`, `UpsertSettlementDraftInput`, `ListSettlementDraftsResult`,
  `ExtractReceiptInput` (split/round 포함), **`ScheduleConfig`, `ScheduleConfigInput`,
  `ScheduleRunList`, `ScheduleProgressEvent`/`ScheduleDoneEvent` (SSE), `SchedulePreviewInput/Result`,
  `RestaurantCategoryTreeResult`** 등을 `schema: { body, response }` 로 등록. 스케줄러
  파이프라인 자체는 [schedule](schedule.md) / [analytics](analytics.md) 토픽 참조.
- **@repo/shared** — `Routes.Auth.login`, `Routes.Crawl.{jobEvents(id), catchtableSearch, ...}`,
  `Routes.Canonical.*`, `Routes.Restaurant.{summaryEvents, publicReviews, publicCategoryTree}`,
  `Routes.Analytics.*`, **`Routes.Schedule.{config, run, runs, runEvents, preview}`**,
  `Routes.AutoDiscover.*`, `Routes.SettingsMap.*`, `Routes.Ai.{complete, provider(id, purpose),
  providerModelsPreview(id, purpose)}`, `Routes.Settlement.{list, create, one(id), update(id),
  share(id), shared(token)}`, `Routes.SettlementDraft.{list, upsert, one(id)}`,
  `Routes.SettlementExtraction.*`, `Routes.SettlementContact.*` 의 경로 헬퍼와 `z.infer<typeof X>`
  추론 타입을 import 해서 fetch 래퍼와 React Query 훅을 구성한다.
- **web / mobile** — `@repo/shared` 를 통해 간접 의존.

순환 의존 규칙: shared → api-contract 만 허용, 반대 방향은 금지 ([CLAUDE.md](../../CLAUDE.md)).

## API Surface [coverage: high — 19 sources]

### `schemas/common.ts` — [common.ts](../../packages/api-contract/src/schemas/common.ts)

| Export | 용도 |
| --- | --- |
| `IdSchema` / `Id` | 비어있지 않은 문자열 ID |
| `TimestampSchema` | ISO 8601 datetime 문자열 |
| `ErrorResponseSchema` / `ErrorResponse` | Fastify 에러 형식 |
| `PaginationQuerySchema` / `PaginationQuery` | `page`, `limit` (coerce, 기본 1/20, 최대 100) |
| `PaginatedSchema(item)` | 제네릭 페이지 응답 빌더 |

### `schemas/auth.ts` · `user.ts` · `picks.ts` · `admin.ts`

(변경 없음 — 직전 컴파일 본 참고. `RegisterInput`/`LoginInput`/`AuthResponse`, `Role`,
`UserSchema`/`PublicUserSchema`, `PickCategory`/`PickSchema`/`Create/UpdatePickInput`/
`PickResult`, `AdminUsersResponse`/`SetRoleParams/Body`.)

### `schemas/crawl.ts` — [crawl.ts](../../packages/api-contract/src/schemas/crawl.ts)

네이버 크롤러 + 어드민 발견용 네이버 검색 + 캐치테이블 패밀리 + 다이닝코드 패밀리
(검색·상세·리뷰·등록 확인·일괄 저장 SSE 잡). 큰 파일이지만 같은 "외부 소스 어댑터"
도메인이라 분리하지 않았다. (직전 라운드 표 그대로 — 이번 라운드 변경 없음.)

### `schemas/canonical.ts` · `schemas/auto-discover.ts`

(직전 라운드 그대로 — 변경 없음. `CanonicalSummary`/`CanonicalListItem`/proposal 큐,
`AutoDiscoverJobState/Phase` 분리. 각 표는 직전 컴파일 본 참고.)

### `schemas/restaurant.ts` — [restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts) **(category tree + 리뷰 필터)**

대부분 직전 라운드 그대로 (`RestaurantPublicDetail` 융합 모양 + `reviewsFirstPage`,
canonical 단위 list). **이번 라운드(17차) 신규/확장**:

| Export | 용도 |
| --- | --- |
| **`RestaurantCategoryTreeResult` (신규)** | `{ roots: CategoryTreeNode[] }`. 이 식당의 언급 메뉴를 카테고리 계층 트리로 — 어드민 전역 트리(`analytics.ts` 의 `CategoryTreeNode`)와 같은 노드 구조를 재사용하되 이 식당 멘션만 누적. coverage 없으면 `roots` 빈 배열 |
| `RestaurantPublicReviewsQuery` (확장) | 기존 `offset/limit/sentiment/sort` 에 **`tip?: string(trim,min 1)`** + **`menu?: string(trim,min 1)`** 두 필터 추가. `tip` = 인사이트 topTips 항목 클릭 시 그 팁(termNorm 정확 일치)이 달린 리뷰만. `menu` = topMenus 카드(canonical 표시명) 클릭 시 그 메뉴 언급 리뷰만 — 서버가 topMenus 와 동일한 MenuCanonical 그룹핑으로 매칭해 카드의 'N회 언급' 카운트와 결과 수 일치 |

### `schemas/schedule.ts` — [schedule.ts](../../packages/api-contract/src/schemas/schedule.ts) **(신규 — 주기 자동 실행)**

관리자가 cron 으로 "정규화(grouping) → 글로벌 머지" 파이프라인을 예약. 인프로세스
스케줄러(croner)가 단일 Fastify 인스턴스 안에서 돌고, 설정은 SQLite 에 영속화돼 재시작 시
복원된다. 파이프라인 도메인 흐름은 [schedule](schedule.md) / [analytics](analytics.md) 토픽.

| Export | 용도 |
| --- | --- |
| `ScheduleJobType` | `'normalize-merge'` 단일 enum. 추후 다른 주기 작업 대비 enum 으로 둠. 설정 입력엔 없고 서버가 고정 |
| `ScheduleTrigger` | `'cron' \| 'manual'`. cron tick vs 어드민 "지금 실행" 버튼 |
| `ScheduleRunStatus` | `'running' \| 'done' \| 'failed' \| 'skipped' \| 'interrupted'`. `skipped` = 이전 run 미완 → 이번 tick overlap 방지로 건너뜀, `interrupted` = graceful shutdown(SIGTERM/SIGINT) 중 abort |
| `SchedulePhase` | `'collecting' \| 'grouping' \| 'merging' \| 'done'`. live 진행 표시용. 완료 이력 행은 null |
| `ScheduleConfig` (응답) | `{ jobType, enabled, cronExpr, timezone, lastRunAt: nullable, lastStatus: ScheduleRunStatus\|null, nextRunAt: nullable(croner.nextRun, enabled=false 면 null), updatedAt }`. 행 없으면 서버가 기본값(enabled=false + 권장 cron)으로 채워 반환 |
| `ScheduleConfigInput` (입력) | `{ enabled: bool, cronExpr: string(1..120), timezone: string(1..64).default('Asia/Seoul') }`. jobType 없음(서버 고정). cron 형식 검증은 croner(서버) — 여기선 길이만 |
| `ScheduleRun` | `{ runId, jobType, trigger, status, phase: nullable, totalTargets: int\|null(collecting 후 확정), processedCount: int, skippedCount: int(크롤 진행 중이라 제외), startedAt, finishedAt: nullable, error: nullable }`. **이력(영속) 과 live 스냅샷(메모리) 양쪽 공용 shape** |
| `ScheduleRunList` | `{ items: ScheduleRun[], inflightRunId: string\|null(진행 중 run, UI 가 SSE 붙을 대상) }` |
| `ScheduleProgressEvent` (SSE) | `{ type:'progress', runId, phase, processed:int, total:int, skipped:int, currentName: string\|null(merging 등에선 null) }` |
| `ScheduleDoneEvent` (SSE) | `{ type:'done', runId, status, finishedAt }` |
| `SchedulePreviewInput` | `{ cronExpr: string(1..120), timezone: string(1..64).default('Asia/Seoul') }`. 저장 전 검증 + 다음 실행 미리보기. 어드민 UI 가 입력 중 디바운스 호출 |
| `SchedulePreviewResult` | `{ valid: bool, error: string\|null, nextRuns: string[](valid 일 때 croner 로 계산한 다음 실행 최대 5개) }` |

### `schemas/menu-grouping.ts` / `schemas/analytics.ts` / `schemas/settings-map.ts`

(직전 라운드 그대로 — 변경 없음. `analytics.ts` 의 `CategoryTreeNode` 가 17차부터
`restaurant.ts` 에 의해 import 돼 식당별 category tree 에도 재사용된다.)

### `schemas/ai.ts` — [ai.ts](../../packages/api-contract/src/schemas/ai.ts)

| Export | 용도 |
| --- | --- |
| `AiCompleteInput/Result`, `AiCompleteBatchInput/Result` | LLM 호출 + 배치 |
| `LlmProviderId` | `'ollama-cloud'` |
| `LlmProviderPurpose` | `'chat' \| 'image'` — 한 provider 를 용도별로 별도 row |
| `LlmProviderConfig` | `provider` × `purpose` 복합 키 row. `hasApiKey/apiKeyMasked/baseUrl/defaultModel/enabled/maxConcurrent` |
| `LlmProviderListResult` | `{ providers: [] }` |
| `UpdateLlmProviderInput` | partial update. apiKey empty → 기존 유지. null 명시 → clear |
| `TestLlmProviderInput/Result` | 모델 alias 검증 (성공 분기 + 에러 분기) |
| `LlmModelListResult` | provider 가 지원 시 모델 목록 (실패 시 빈 배열) |
| **`PreviewLlmModelsInput/Result`** | 저장 없이 입력 폼의 키만으로 모델 목록 조회 — 신규 등록 시 키 검증 + 모델 선택 통합. 결과는 ok 분기로 잘못된 키 에러 노출 |

### `schemas/settlement-extraction.ts` — [settlement-extraction.ts](../../packages/api-contract/src/schemas/settlement-extraction.ts)

영수증 사진을 vision LLM 으로 항목화. settlement 세션 생성 직전 단계.

| Export | 용도 |
| --- | --- |
| `ReceiptItemCategory` | `'ALCOHOL' \| 'NON_ALCOHOL' \| 'SIDE' \| 'UNCATEGORIZED'`. 분배 시 풀 분리 기준 |
| `ReceiptItem` | `{ name(1~120), unitPrice, quantity, amount, category, matchedMenuName }` |
| `UploadReceiptResult` | `{ imageToken, previewUrl, byteSize }`. 클라이언트는 token 만 보관 |
| **`ExtractReceiptSplit` (신규)** | `{ count: 2..5, index: 1..count }` 가로 N등분. `refine: index <= count`. count=1 의미는 명시적으로 표현 안 함(`split` 자체 옵션을 omit 하면 분할 안 함) |
| `ExtractReceiptInput` (확장) | `{ imageToken, placeId, roundIndex?, roundTotal?, split? }`. **`roundIndex` 1..20 + `roundTotal` 1..20** — '2차/N차' 컨텍스트를 LLM 프롬프트에 주입. `split` 지정 시 같은 imageToken 으로 N번 호출 (index 만 다르게) |
| `ExtractReceiptResult` | `{ items: ReceiptItem[], totalAmount, itemsSubtotal, warning, model }`. `warning` 은 소계 vs 총금액 불일치 |

### `schemas/settlement.ts` — [settlement.ts](../../packages/api-contract/src/schemas/settlement.ts) **(N차 모델 + 공유 OG 선택)**

세션 한 건이 **여러 차수(rounds)** 를 가진다. 마스터 참여자(`SettlementParticipant`) 가
세션 단위, 차수별 참석/제외 override 는 `SettlementRoundAttendee` 가 담당. 차수별로
식당이 다를 수 있어 `restaurantPlaceId` 가 round 에도 있다. items/attendees 가 session
직속에서 사라지고 `rounds[]` 안으로 이동. **이번 라운드** 공유 OG 이미지 선택 페어
(`ShareTtl`/`ShareOgImage` enum + share input/응답 확장) + `receiptImageToken` 추가.

| Export | 용도 |
| --- | --- |
| `SettlementSource` | `'MANUAL' \| 'RECEIPT'`. 차수 단위 — 1차 RECEIPT + 2차 MANUAL 가능 |
| `SettlementItem` / `SettlementItemInput` | 한 항목. `{ id, name(1~120), unitPrice, quantity, amount, category, matchedMenuName, orderIndex }`. Input 은 `id`/`orderIndex` 생략 |
| **`SettlementRoundAttendee`** | `{ participantId, attended, excludeAlcoholOverride: bool\|null, excludeNonAlcoholOverride: bool\|null, excludeSideOverride: bool\|null, shareAmount }`. **override = null 이면 마스터 default 사용**, true/false 면 그 차수만 덮어쓰기 |
| **`SettlementRoundAttendeeInput`** | `{ participantClientId(min 1), attended(default true), excludeXxxOverride: bool\|null }`. 입력 시점엔 마스터 cuid 가 아직 없어 클라이언트가 안정적 임시 키(`participantClientId`)로 매핑 |
| **`SettlementCategoryAdjustment`** (응답) | `{ leftoverParticipantId, roundUnit: int>0 \| null }`. 차수 단위 카테고리 보정 |
| **`SettlementCategoryAdjustmentInput`** (입력) | `{ leftoverParticipantClientId, roundUnit }` — 입력은 clientId 로 |
| **`SettlementCategoryAdjustments`** / **`...Input`** | `Record<카테고리, adjustment \| null>` 의 `.nullable()` (Input 은 `.optional().default(null)`) |
| **`SettlementRound`** | `{ id, orderIndex, restaurantPlaceId, restaurantName, source, totalAmount, warning, receiptPreviewUrl, **receiptImageToken: string\|null (신규)**, itemsSubtotal, discountAmount: int>0\|null, discountCategory: ReceiptItemCategory\|null, categoryAdjustments, items: SettlementItem[], attendees: SettlementRoundAttendee[] }`. `receiptImageToken` 은 편집 재진입 시 영수증 보존용(소유자 응답 한정 — 공유 응답에선 omit) |
| **`SettlementRoundInput`** | 입력 차수. `items.min(1).max(200)` + `attendees.min(1).max(100)`. `discount{Amount,Category}` 는 optional+default(null). **2 단 refine**: ① `(amount==null) === (category==null)` (페어 강제), ② 같은 카테고리 풀 금액 ≥ discountAmount (풀 음수 방지) |
| `SettlementParticipant` | 마스터 참여자. `{ id, name, nickname, excludeAlcohol, excludeNonAlcohol, excludeSide, shareAmount(=모든 round 합), orderIndex, contactId(nullable) }` |
| **`SettlementParticipantInput`** | `{ clientId(min 1), name, nickname, excludeXxx(default false), contactId? }`. **clientId 는 required** — 클라가 안정적 임시 키 부여, round.attendees 의 `participantClientId` 와 매칭 |
| **`SettlementSession`** | `{ id, userId, restaurantPlaceId, restaurantName(=1차 식당 snapshot, 목록·이력 호환), grandTotal(=모든 round itemsSubtotal 합), rounds: SettlementRound[].min(1), participants: SettlementParticipant[], createdAt, updatedAt, editedAt(nullable) }` |
| **`CreateSettlementInput`** | `{ rounds: SettlementRoundInput[].min(1).max(10), participants: SettlementParticipantInput[].min(1).max(100), fromDraftId?: string }`. **`fromDraftId`** — 임시저장에서 출발이면 저장 트랜잭션 안에서 해당 draft 함께 삭제. 본인 소유가 아니거나 없는 id 면 조용히 무시 |
| **`UpdateSettlementInput`** | `= CreateSettlementInput`. **전체 replace** 의미 — 부분 PATCH 없음. 서버는 트랜잭션으로 삭제→재삽입 + shareAmount 재계산 |
| `ListSettlementsQuery` | `{ placeId?, offset, limit(1~50, def 20) }` |
| **`SettlementSessionSummary`** | `{ id, restaurantPlaceId, restaurantName, source(=1차), grandTotal, roundCount, itemCount(=차수 합), participantCount, createdAt }` |
| `ListSettlementsResult` | `{ items: SettlementSessionSummary[], total }` |
| **`ShareTtl`** | `'1d' \| '7d' \| '30d'`. 무제한 없음 — 모든 링크가 최대 30일 내 만료돼 짧은 토큰(10자)의 brute-force 노출 창을 닫는다 |
| **`ShareOgImage`** | `'restaurant' \| 'table'`. `restaurant` = 정산 식당 사진(네이버 호스트, owner 가 갤러리에서 1장 고르거나 미선택 시 토큰 시드 결정적 랜덤, 사진 없으면 정산표 폴백) / `table` = 정산표 매트릭스 PNG. 기본 `restaurant` (참가자 이름이 미리보기/크롤러 캐시에 안 박혀 프라이버시상 유리) |
| **`CreateSettlementShareInput`** | `z.preprocess(v=> v==null?{}:v, z.object({ ttl: ShareTtl.default('7d'), ogImage?: ShareOgImage, ogImageUrl?: string.url().nullable() }))`. 본문 없는 POST 도 `{}` 로 메꿔 ttl 기본 적용. **`ogImage` 생략=기존 선택 유지** (첫 공유면 restaurant). **`ogImageUrl` 트라이스테이트**: 생략→유지 / null→선택 해제(랜덤 복귀) / URL→후보 목록의 그 사진 고정(후보에 없으면 서버가 무시→null) |
| `SettlementShare` (응답, 확장) | `{ token: nullable, shareUrl: nullable, **expiresAt: nullable (만료 ISO, 토큰 없으면 null)**, **ogImage: ShareOgImage (현재 선택 복원용)**, **ogImageUrl: string\|null (선택된 식당 사진 원본 URL, 미선택 null=랜덤)**, **ogImageCandidates: string[] (갤러리 후보 원본 URL, 식당 사진 없으면 빈 배열→갤러리 숨김)** }`. 회수 후 token/shareUrl/expiresAt 모두 null |
| **`SharedSettlementSession`** | `SettlementSession.omit({ userId, rounds }).extend({ rounds: SharedSettlementRound[] })` 여기서 `SharedSettlementRound = SettlementRound.omit({ receiptPreviewUrl, **receiptImageToken** })`. 토큰 받은 사람도 원본 사진·재업로드 토큰 둘 다 못 본다 (이번 라운드 omit 가 1→2 필드) |

### `schemas/settlement-draft.ts` — [settlement-draft.ts](../../packages/api-contract/src/schemas/settlement-draft.ts) **(신규)**

정산 입력 화면의 서버 임시저장. 자동저장(debounce)으로 다기기 동기화. **payload 는
서버가 형태 검증을 하지 않고 보관만 한다** — 클라이언트 store 모양이 진화해도 BE 영향
없게 의도적으로 분리. 크기만 안전 cap.

| Export | 용도 |
| --- | --- |
| **`SettlementDraft`** | `{ id, placeId: string\|null, placeNameHint: string\|null, payload: unknown, createdAt, updatedAt }`. `placeId=null` 은 '/me/settlements/new' 흐름(식당 미지정 슬롯). `(userId, placeId)` unique — 같은 식당의 draft 는 하나만 유지 |
| **`UpsertSettlementDraftInput`** | `{ placeId: string(1~64) \| null, placeNameHint?: string(<=120) \| null, payload }`. **payload refine**: `JSON.stringify(v).length <= 200KB` (200 * 1024). 안전 cap 만 적용, 형태는 통과 |
| **`ListSettlementDraftsResult`** | `{ items: SettlementDraft[] }` |

### `schemas/settlement-contact.ts` — [settlement-contact.ts](../../packages/api-contract/src/schemas/settlement-contact.ts)

(직전 라운드 그대로 — `SettlementContact`, `ListContactsQuery/Result`, `UpdateContactInput`.
`lastExclude*` 는 가장 최근 정산의 선택, 다음 정산의 default 자동 제안.)

### `settlement.calculator.ts` — [settlement.calculator.ts](../../packages/api-contract/src/settlement.calculator.ts) **(멀티라운드 확장)**

FE/BE 공통 분배 계산기 — 순수 함수.

| Export | 용도 |
| --- | --- |
| `CalculateInput` | `{ items: Pick<...,'amount'\|'category'>[], participants: Pick<...,'excludeXxx'>[] }` |
| `CalculateOutput` | `{ shareAmounts[], itemsSubtotal, poolBreakdown: Record<카테고리, {poolAmount, participantCount, perParticipant}>, perCategoryShares: Record<카테고리, number[]> }` |
| `calculateShares(input)` | 메인 함수. 카테고리별 풀 → 제외 플래그 없는 참여자에게 균등 분배. **신규 옵션**: `discount?: { amount, category } \| null` (풀에서 차감, 음수는 max(0,…) 클램프), `categoryAdjustments?: CategoryAdjustmentsInput \| null` (카테고리별 `{leftoverParticipantIndex, roundUnit}`). **신규 반환**: `perCategoryShares` 매트릭스 — UI 의 '정산표 (이름 × 카테고리)' 컬럼별 합 |
| **`CategoryAdjustmentsInput`** (타입) | `Partial<Record<카테고리, { leftoverParticipantIndex, roundUnit }>>` |
| **`effectiveExcludes(master, override)`** | `{excludeAlcohol, excludeNonAlcohol, excludeSide}` 합성. override.x === null → 마스터 그대로, 아니면 round 값 덮어쓰기. (`a ?? b` 패턴) |
| **`RoundAttendeeCalcInput`** (타입) | `{ participantIndex, excludeAlcohol, excludeNonAlcohol, excludeSide }`. 마스터 인덱스 + effective excludes |
| **`RoundCalcInput`** (타입) | `{ items, attendees: RoundAttendeeCalcInput[], discount?, categoryAdjustments? }` (categoryAdjustments 의 leftoverParticipantIndex 는 마스터 인덱스) |
| **`MultiRoundCalcInput`** | `{ participantCount, rounds: RoundCalcInput[] }` |
| **`PerRoundCalcOutput`** | `{ shareAmounts(마스터 인덱스, 비참석=0), itemsSubtotal, poolBreakdown, perCategoryShares(마스터 인덱스) }` |
| **`MultiRoundCalcOutput`** | `{ perParticipant: number[](마스터 grand total), perRound: PerRoundCalcOutput[], grandTotal }` |
| **`calculateMultiRoundShares(input)`** | 차수별 (items × 참석자 부분집합) 을 독립 calc → 마스터 인덱스로 합산. 내부에서 마스터 인덱스 → 참석자 배열 인덱스 매핑(`masterToAttendee`)을 만들고 categoryAdjustments 의 leftoverParticipantIndex 도 참석자 인덱스로 변환 (매핑에 없으면 -1 → 첫 활성자 fallback). 그 뒤 `calculateShares` 호출 후 결과를 다시 마스터 인덱스로 부풀린다 |

분배 규칙 요약 (단일 차수):
- **풀 분리** — items.amount 합을 4 카테고리 풀로 쪼갠다.
- **할인 차감** — `discount.category` 풀에서 `discount.amount` 차감 (max(0, raw - amount)).
- **풀별 참여자 산정** — ALCOHOL 풀이면 `excludeAlcohol=false` 인 참여자만. UNCATEGORIZED 는 항상 전원.
- **`roundUnit` rounding** — `adj.roundUnit` 이 있고 `(round(pool/unit) * unit) % activeCount === 0` 이면 round 한 풀로, 아니면 silently 무시하고 원 풀에 잔여 가산 fallback.
- **leftover 흡수** — `adj.leftoverParticipantIndex` 가 활성자이면 그 위치에 잔여, 아니면 첫 활성자.
- **전원 제외 풀 fallback** — activeCount=0 + 풀>0 이면 전원 균등 분배(=UNCATEGORIZED 처럼).
- **perCategoryShares** — fallback 케이스에도 본래 카테고리 키에 기록 (예: ALCOHOL 풀 fallback → `perCategoryShares.ALCOHOL[i]` 에 분담값. UI 가 매트릭스 컬럼 합 invariant 를 유지해야 하므로).

### `routes.ts` — [routes.ts](../../packages/api-contract/src/routes.ts)

`API_PREFIX = '/api/v1'` 고정. 도메인별 객체:

| Namespace | 키 | 경로 |
| --- | --- | --- |
| `Auth` | register, login, me, logout | `/auth/...` |
| `Users` | list, byId(id) | `/users[/:id]` |
| `Picks` | list, create, byId(id) | `/picks[/:id]` |
| `Admin` | listUsers, setUserRole(id) | `/admin/users[/:id/role]` |
| `Media` | thumbnail | `/media/thumbnail` |
| `Crawl` | naverPlace, jobs, job(id), jobEvents(id), jobLogs(id), search, catchtable*, diningcode* | `/admin/crawl/...` |
| `Restaurant` | 공개: ranking, publicList, publicByPlaceId, publicInsights, publicReviews(placeId), **publicCategoryTree(placeId)** / 어드민: list, byPlaceId, delete, summaryStatus, summaryEvents, reanalyze, cancelSummary, resumeSummary, crawlLogs, insights, smartPick, menusGroup, menusRanking, analyticsBackfill | `/restaurants/...` + `/admin/restaurants/...` |
| `Canonical` | candidates(id), merge, split(id), dismissSuggestion(id), proposals, proposalsRun, proposalAccept(id), proposalReject(id), delete(id) | `/admin/canonical/...` |
| `Analytics` | restaurantsStatus, groupingJobs/Job/JobEvents, overview, globalMenus, globalMergeJobs/Job/JobEvents, categoryTree | `/admin/analytics/...` |
| **`Schedule` (신규)** | config (GET 조회+다음 실행 / PUT 변경), run (지금 실행=manual), runs (이력+inflight), runEvents (진행 SSE), preview (cron 검증+미리보기) | `/admin/schedule[/run\|/runs\|/run-events\|/preview]` |
| `AutoDiscover` | jobs, job(id), jobEvents(id) | `/admin/auto-discover/jobs[/:id[/events]]` |
| `Ai` | complete, completeBatch, providers, provider(id, purpose), testProvider(id, purpose), providerModels(id, purpose), **`providerModelsPreview(id, purpose)`** | `/admin/ai/...` (`/:id/:purpose[/test|/models|/models/preview]`) |
| `SettingsMap` | list, provider(id), secret(id), publicConfig | `/admin/settings/map/...` + `/settings/map/public` |
| `SettlementExtraction` | upload, extract, preview(token) | `/settlement-extraction/...` |
| **`Settlement`** | list, create, one(id), **`update(id)`** (PUT 전체 replace, 기존 updateParticipants 대체), share(id), shared(token) | `/settlements/...` + `/share/settlements/:token` |
| **`SettlementDraft` (신규)** | **list, upsert (PUT `/settlement-drafts`), one(id) (DELETE)** | `/settlement-drafts[/:id]` |
| `SettlementContact` | list, one(id) | `/me/contacts[/:id]` |
| `Health` | (단일 상수) | `/health` |

**이번 라운드 (17차, 2026-06) 변경 라우트:**

- `Routes.Schedule.{config, run, runs, runEvents, preview}` — 주기 자동 실행 namespace
  신설. 모두 `/admin/schedule/...` 어드민 게이트. `config` 는 GET(현재 설정+다음 실행 시각) /
  PUT(enabled/cronExpr/timezone) 한 경로를 verb 로 분기. `run` = 즉시 manual 실행, `runs` =
  이력+inflight, `runEvents` = 진행 SSE, `preview` = 저장 전 cron 검증.
- `Routes.Restaurant.publicCategoryTree(placeId)` — `/restaurants/public/:placeId/category-tree`.
  공개 식당별 카테고리 트리(`RestaurantCategoryTreeResult`). 인사이트의 메뉴 카드 클릭 시
  `publicReviews(placeId)` 의 `tip`/`menu` 쿼리로 필터된 리뷰를 가져온다.

**이전 라운드 (2026-05-28) 변경 라우트:**

- `Routes.Settlement.update(id)` (PUT) — 이전 `updateParticipants(id)` (PATCH /:id/participants)
  자리를 대체. **부분 수정이 사라지고 전체 replace** 만 가능. 차수 추가/삭제·참여자
  명단·참석 변경까지 한 번에 보낸다. URL 은 `/settlements/:id` 로 `one(id)` 과 같고
  HTTP verb 로 구분 (GET=one, PUT=update, DELETE 는 별도 안 정의 — 라우트 핸들러가 직접
  처리하는 듯).
- `Routes.SettlementDraft.*` — 정산 임시저장 namespace 신설. `upsert` 는 PUT
  `/settlement-drafts` 로 body 에 placeId/payload — `(userId, placeId)` 키로 서버가
  upsert. `one(id)` 은 DELETE 용. **일반 사용자 흐름에선 명시적 DELETE 가 거의 없다** —
  완성된 정산 저장 성공 시 매칭 draft 가 `fromDraftId` 로 자동 삭제되므로.
- `Routes.Ai.providerModelsPreview(id, purpose)` — `/:id/:purpose/models/preview`. 저장
  없이 입력 폼의 키만으로 모델 목록 조회 — 신규 provider 등록 시 키 검증 + 모델 선택을
  한 번에 끝내려는 미리보기 엔드포인트.

**직전 라운드 (2026-05-25) 라우트군** (요약):

- `Routes.SettlementExtraction.*`, `Routes.Settlement.*` (당시 `updateParticipants` 포함),
  `Routes.SettlementContact.*`, `Routes.Ai.provider/testProvider/providerModels` 시그니처를
  `(id, purpose)` 두 인자로 변경.

## Data [coverage: high — 11 sources]

순수 contract 패키지로, 자체 데이터(persistence/cache) 는 없다 — 모든 모양은
스키마 정의로만 존재한다. Prisma 모델 매핑은 friendly 토픽 참조.

이번 라운드 compose 관계 (변경/신규 강조):

- **`SettlementSession` (재구성)** = `{ id, userId, restaurantPlaceId(=1차 snapshot),
  restaurantName, grandTotal, rounds: SettlementRound[].min(1), participants:
  SettlementParticipant[], createdAt, updatedAt, editedAt }`. 항목/참석은 모두 round 안으로
  이동, 세션 직속 `itemsSubtotal/items/attendees` 는 사라졌다. 목록 검색·이력 호환을 위해
  1차 식당(rounds[0]) snapshot 은 세션 직속에도 둔다 — `restaurantPlaceId`/`restaurantName`.
- **`SettlementRound`** = `{ id, orderIndex, restaurantPlaceId, restaurantName, source,
  totalAmount, warning, receiptPreviewUrl, receiptImageToken(string\|null), itemsSubtotal,
  discountAmount(int>0\|null), discountCategory(ReceiptItemCategory\|null), categoryAdjustments,
  items[], attendees[] }`.
  차수마다 식당이 다를 수 있어 `restaurantPlaceId`/`restaurantName` 이 round 에도 있다.
  **`receiptImageToken` (이번 라운드 신규)** — 편집 재진입 시 토큰을 그대로 돌려줘 재저장에도
  영수증이 보존되게 한다. 소유자 응답 한정.
- **`SettlementRoundAttendee`** = `{ participantId, attended, excludeAlcoholOverride,
  excludeNonAlcoholOverride, excludeSideOverride, shareAmount }`. override 가 `null` 이면
  마스터 default 사용 — `effectiveExcludes(master, override)` helper 가 계산.
- **`SettlementCategoryAdjustments`** = `Record<카테고리, { leftoverParticipantId, roundUnit:
  int>0 \| null } \| null>` 의 `.nullable()`. roundUnit=100/1000 이 일반 — UI 가
  '100원 단위 다듬기/1000원 단위 다듬기' 토글로 노출.
- **`SettlementParticipantInput.clientId`** — required string. 클라가 안정적 임시 ID 부여,
  서버가 cuid 매핑 후 폐기. round.attendees.participantClientId 와의 indirection.
- **`SharedSettlementSession`** = `SettlementSession.omit({ userId, rounds }).extend({
  rounds: SharedSettlementRound[] })` 여기서 `SharedSettlementRound =
  SettlementRound.omit({ receiptPreviewUrl, receiptImageToken })`. omit→extend 패턴으로
  nested 필드까지 공개 응답에서 제거. **이번 라운드 nested omit 가 1→2 필드** (신규
  `receiptImageToken` 도 토큰 보유자에게 leak 되면 영수증 재조회 가능하므로 같이 제거).
- **`SettlementShare` (응답, 확장)** = `{ token(nullable), shareUrl(nullable),
  expiresAt(nullable), ogImage: ShareOgImage, ogImageUrl(string\|null), ogImageCandidates:
  string[] }`. `ogImageCandidates` 는 식당 사진(네이버 호스트) 후보 원본 URL 배열 — 다이얼로그가
  썸네일 갤러리로 렌더하고, 사진이 없으면 빈 배열로 갤러리를 숨겨 정산표 폴백으로 떨어진다.
- **`CreateSettlementShareInput`** = `z.preprocess` 로 본문 null→`{}` 후 `{ ttl: ShareTtl(def
  '7d'), ogImage?: ShareOgImage, ogImageUrl?: string.url().nullable() }`. `ogImageUrl` 은
  트라이스테이트(생략/null/URL) — 옵셔널과 nullable 의 차이가 의미를 갖는 드문 케이스.
- **`SettlementDraft`** = `{ id, placeId(nullable), placeNameHint(nullable), payload(unknown),
  createdAt, updatedAt }`. `payload` 가 `z.unknown()` — 형태 검증 없이 통과, 직렬화 길이
  200KB cap. `(userId, placeId)` unique.
- **`ExtractReceiptInput` (확장)** = `{ imageToken, placeId, roundIndex?, roundTotal?, split?:
  ExtractReceiptSplit }`. **`ExtractReceiptSplit` = `{ count: 2..5, index: 1..count }`**.
  같은 imageToken 으로 N 번 호출 — 한 사진에 N 영수증을 가로로 잘라 차수 매핑.
- **`MultiRoundCalcInput` → `MultiRoundCalcOutput`** — 차수별 `RoundCalcInput` 배열을 받아
  마스터 인덱스 단위 `perParticipant[]` + 차수별 `perRound[]` 반환. 각 차수는 자체
  `discount`/`categoryAdjustments` 를 갖고, calculator 내부에서 마스터→참석자 인덱스
  변환·역변환을 수행.

17차(2026-06) compose 관계:

- **`ScheduleRun` 이 live·이력 공용 shape** — 같은 object 가 메모리 진행 스냅샷(SSE 가 push
  하는 동안)과 SQLite 영속 이력 행 양쪽에 쓰인다. `phase`/`totalTargets` 는 진행 중에만
  의미가 있어 완료 이력 행에서는 nullable. `ScheduleRunList = { items: ScheduleRun[],
  inflightRunId }` 가 이력 + "지금 SSE 붙을 run" 을 한 응답에 묶는다.
- **`ScheduleProgressEvent`/`ScheduleDoneEvent`** = `type` literal 로 구분되는 SSE 페이로드.
  progress 는 `phase/processed/total/skipped/currentName`, done 은 `status/finishedAt`. live
  진행은 SSE 로, 최종 상태는 `ScheduleRun` 으로 다시 조회 — 두 채널이 같은 `runId` 로 묶인다.
- **`ScheduleConfig` (응답) vs `ScheduleConfigInput` (입력)** — 응답엔 `lastRunAt/lastStatus/
  nextRunAt/updatedAt` 같은 서버 계산 필드(croner.nextRun 포함)가 있고 입력엔 없다. 입력은
  `enabled/cronExpr/timezone` 3 필드만. settlement 의 응답/입력 분리와 같은 패턴.
- **`RestaurantCategoryTreeResult` = `{ roots: CategoryTreeNode[] }`** — analytics 의 재귀
  `CategoryTreeNode` (z.lazy) 를 그대로 import 해 식당별 멘션 트리로 재사용. 어드민 전역
  트리와 노드 모양이 동일하므로 UI 컴포넌트도 공유 가능.

(이전 라운드의 NaverSearchResult / RestaurantPublicDetail / ReviewAnalysis 분리 / CanonicalSummary /
GlobalMenuStat / CategoryTreeNode / LlmProviderConfig / SettlementSession(N차) / SettlementShare 등의
compose 관계는 그대로 유효.)

## Key Decisions [coverage: high — 15 sources]

- **Zod 채택** — 런타임 검증 + 정적 타입 추론을 한 스키마로 처리하고, fastify-type-provider-zod
  와 한 번에 결합돼 OpenAPI 까지 자동 생성. **TS interface 직접 사용 금지** — 모든
  공유 타입은 zod 스키마에서 추론.
- **빌드 없는 src 직접 export** — `package.json` `exports` 가 `./src/*.ts` 를 가리킨다.
- **도메인별 파일 분할 + 한 방향 import** — `restaurant → crawl/canonical/analytics` 처럼
  한쪽만 (17차에 restaurant → analytics `CategoryTreeNode` 추가). 정산 패밀리 내부도
  `settlement → settlement-extraction (enum 만)`, `calculator → settlement 타입` 등 한 방향.
  **`settlement-draft.ts` 와 `schedule.ts` 는 다른 schemas/ 를 전혀 import 하지 않는다** —
  draft 는 payload 가 `z.unknown()` 이라, schedule 은 자체 enum 만 쓰므로.
- **17차(2026-06): `schedule.ts` 신규 — cron 검증을 서버 croner 에 위임(순수 스키마 유지)** —
  주기 자동 실행 스키마 묶음(12 export)을 추가하면서 **cron 식의 실제 파싱·다음 실행 시각
  계산은 api-contract 가 하지 않는다**. `cronExpr` 은 `z.string().min(1).max(120)` 길이
  검사만 두고, 형식 유효성·`nextRuns` 계산은 서버 라우트가 `croner` 로 수행해
  `SchedulePreviewResult` 로 돌려준다. **이유**: api-contract 는 FE/BE/앱 셋이 공유하는
  순수 스키마 패키지라 croner 같은 런타임 라이브러리를 의존성에 끌어들이면 안 된다
  (shared → api-contract 단방향 의존 규칙·번들 무게와 일관). **`ScheduleRun` 한 shape 를
  live(메모리)·이력(SQLite) 양쪽에 공용**으로 쓰고, 진행은 `ScheduleProgressEvent`/
  `ScheduleDoneEvent` SSE 로 push — 같은 `runId` 로 묶여 UI 가 live → 최종을 매끄럽게 잇는다.
  `status` enum 에 `skipped`(overlap 방지)·`interrupted`(graceful shutdown abort)를 둬
  스케줄러 운영 상태를 스키마 단에서 표현. ([zod-ssot-buildless](../concepts/zod-ssot-buildless.md)
  컨셉의 새 인스턴스 — 한 라운드에 12+ export 를 단방향·런타임 무의존으로 흡수.)
- **식당별 category tree = analytics 노드 재사용** — `RestaurantCategoryTreeResult.roots` 가
  어드민 전역 트리의 `CategoryTreeNode` (z.lazy 재귀) 를 그대로 import. 식당별 멘션만
  누적하는 다른 데이터지만 노드 모양·UI 컴포넌트를 공유하려고 중복 선언 대신 import 선택
  (restaurant → analytics 단방향).
- **정산을 N차(rounds) 모델로 재구성** — 단일 차수 → 차수 배열. 실 사용 흐름이 "1차 호프
  + 2차 술집" 처럼 다중인데, 한 세션에 다 들어가는 게 자연스럽다. 차수마다 식당/할인/
  카테고리 보정이 다를 수 있어 round 단위로 `restaurantPlaceId`/`discount`/`categoryAdjustments`
  를 둔다. 세션 직속의 `restaurantPlaceId`/`restaurantName` 은 1차 snapshot — 목록 검색·
  이력 라벨 호환을 위해 의도적으로 중복 보관. rounds[0] 과 항상 동기화.
- **참여자 마스터 + round override 2단 구조** — `SettlementParticipant` 는 세션 단위 마스터
  (기본 `excludeXxx`), `SettlementRoundAttendee` 는 차수 단위 attendance + `excludeXxxOverride`
  (nullable, null=마스터 사용). 한 사람이 1차엔 술 마시고 2차엔 안 마시는 케이스를
  override 로 자연 표현. `effectiveExcludes(master, override)` helper 가 SSOT.
- **`UpdateSettlementInput` = `CreateSettlementInput` (전체 replace PUT)** — 이전 라운드의
  `UpdateSettlementParticipantsInput` (참여자 PATCH) 를 폐기하고 통합. **이유**: rounds 추가/
  삭제·차수별 items 수정·attendance 토글까지 한 번에 가능해야 하는데, 부분 PATCH 로 표현하면
  payload 가 복잡하고 동시 충돌 처리도 어렵다. 전체 replace 면 서버가 트랜잭션으로
  삭제→재삽입 + shareAmount 재계산 한 번에 끝. PUT 의 의미론도 정확. trade-off: 큰 payload
  반복 전송이지만 정산이 보통 작은 객체라 비용 무시 가능.
- **`fromDraftId` 라이프사이클 hook in transaction** — `CreateSettlementInput.fromDraftId?:
  string`. 자동저장으로 만들어진 draft 에서 출발한 저장이면 서버가 **저장 트랜잭션 안에서**
  해당 draft 를 삭제. 본인 소유가 아니거나 없는 id 면 조용히 무시(저장 자체는 성공) —
  draft 정리 실패가 본 정산 저장을 막아선 안 되기 때문. UI 가 "임시저장 → 저장" 을 누른
  순간 draft 가 안전하게 사라지는 자연스러운 흐름.
- **payload `z.unknown()` + 200KB refine 만** — `SettlementDraft.payload` 의 형태를 서버가
  검증하지 않는다. **이유**: 정산 입력 store(zustand) 의 상태 모양이 클라이언트 진화에
  따라 자주 바뀌는데, BE 스키마가 이를 따라가면 마이그레이션이 폭발한다. payload 는
  '클라이언트 상태 보관소' 로 둘 뿐이고 BE 는 통과/저장만 — 새 필드를 클라가 자유롭게
  넣고, 다음 클라이언트 버전이 모르는 필드는 ignore 하면 끝. 안전치만 cap (200KB —
  마스터 100명 + 항목 200개 모두 채워도 100KB 미만이라 여유).
- **`SharedSettlementSession` 의 omit + extend 패턴** — 공개 응답은 `userId` 와 round 별
  `receiptPreviewUrl` 두 필드를 제거. 단일 `omit({ userId, receiptPreviewUrl })` 로는
  nested(round) 안의 필드를 못 지우므로 `omit({ userId, rounds }).extend({ rounds:
  SharedSettlementRound[] })` 로 rounds 만 다시 정의. `SharedSettlementRound =
  SettlementRound.omit({ receiptPreviewUrl })`. zod 의 schema 재조립 능력을 활용해 중복
  선언 없이 공개 응답 모양을 표현.
- **`clientId` indirection 패턴 (FE → server)** — 입력 시 마스터 참여자가 아직 cuid 가 없어
  round.attendees 가 마스터를 가리킬 키가 필요하다. 클라가 안정적 임시 ID (`clientId`) 를
  부여하고 round.attendees.participantClientId 가 그 키로 마스터를 참조. 서버는 cuid 매핑
  완료 후 clientId 폐기. 같은 패턴이 `SettlementCategoryAdjustmentInput.leftoverParticipantClientId`
  에도 적용 — 카테고리 보정의 leftover 흡수자도 입력 시점엔 clientId 로.
- **차수별 할인 — 페어 강제 refine** — `SettlementRoundInput` 의 `discountAmount`/
  `discountCategory` 는 둘 다 null 이거나 둘 다 채워져야 한다 (`(amount==null) ===
  (category==null)`). 그리고 두 번째 refine 으로 같은 카테고리 풀 ≥ discountAmount 검증
  (풀 음수 방지). zod refine 의 등록 순서가 에러 메시지 우선순위 — 페어 refine 이 먼저라
  "할인 금액과 카테고리는 함께 설정해야 합니다." 가 우선 노출되고, 페어 OK 면 그제서야
  "할인 금액이 해당 카테고리 풀을 초과합니다." 가 보인다.
- **`categoryAdjustments` 의 `roundUnit` divisibility silent fallback** — `calculateShares`
  는 `roundUnit` (100/1000) 으로 풀을 round 한 뒤 **그 결과가 인원수로 나눠떨어지는
  경우에만** rounding 을 적용한다. 안 떨어지면 silently 무시하고 원 풀(`afterDiscount`)에
  잔여 가산 fallback. UI 는 활성 조건 검사 + 서비스 검증으로 무효한 rounding 을 사용자가
  못 고르게 하지만, calculator 가 안전망으로 절대 깨지지 않게 한다 — 정산은 "어쨌든 합이
  맞는 결과" 가 무엇보다 중요하기 때문.
- **`perCategoryShares` 매트릭스 신규** — '정산표 (이름 × 카테고리)' UI 를 가능하게 하는
  반환. 합은 `shareAmounts[i]` 와 같지만 컬럼 단위 분담도 별도로 노출. fallback 케이스
  (ALCOHOL 풀 전원 제외 → UNCATEGORIZED 처럼 분배) 에도 본래 카테고리 키에 기록 —
  매트릭스 컬럼 합 invariant 유지. UI 측에선 `poolBreakdown` 으로 '실제 풀' 인지 fallback
  인지 구분 가능.
- **`calculateMultiRoundShares` 가 마스터 인덱스 ↔ 참석자 인덱스 변환을 캡슐화** — 비참석자는
  입력 자체에 빠지므로 calculator 가 차수마다 `masterToAttendee` 맵을 만들어 categoryAdjustments
  의 leftoverParticipantIndex (마스터 인덱스) 를 참석자 인덱스로 변환 후 `calculateShares`
  호출, 결과를 다시 마스터 인덱스로 부풀린다. 호출부(친화적 FE/BE)는 마스터 인덱스 단위로만
  생각하면 됨.
- **정산 calculator 를 api-contract 에 둠** — schemas 가 아니지만 의도적으로 같은 패키지.
  FE 가 입력 즉시 미리보기 계산 + BE 가 영속화 전 검증 — 둘이 어긋나면 silent breaking.
  알고리즘이 순수 함수라 shared 로 끌어올릴 필요 없이 contract 패키지에 직접. type-only
  import 로 zod 런타임 의존 없음.
- **`LlmProviderPurpose` enum (chat vs image)** — 같은 provider 라도 텍스트/비전 모델은
  다르고 `defaultModel/maxConcurrent` 도 따로 잡고 싶다. `(provider, purpose)` 복합 키로
  row 분리. env fallback 은 chat 에만 — image 는 명시적 DB row 가 있을 때만 활성화 (vision
  비용 우발 방지). `Routes.Ai.provider(id, purpose)` 시그니처도 두 인자로 — 호출부에서
  purpose 누락 시 컴파일 에러.
- **공유 OG 이미지를 enum 페어 + 트라이스테이트로 표현** — 공유 링크 미리보기(OG) 이미지를
  owner 가 고를 수 있게 `ShareOgImage` (`restaurant`/`table`) enum + `CreateSettlementShareInput`
  의 `ogImage?`/`ogImageUrl?` 를 도입. **기본을 `restaurant` 로 둔 이유**는 프라이버시 — `table`
  (정산표 PNG) 은 참가자 이름이 미리보기/카카오톡·크롤러 캐시에 박히지만, 식당 사진은 그렇지
  않다. **`ogImageUrl` 의 트라이스테이트(생략/null/URL)** 가 핵심 디자인: 공유 다이얼로그가
  자동으로 share POST 를 호출하는데(본문 없이), 이 때 owner 가 직전에 고른 사진을 덮어쓰면
  안 된다 → `ogImage`/`ogImageUrl` 옵셔널은 "생략=기존 유지", 명시할 때만 변경. null 은
  "선택 해제(랜덤 복귀)" 라는 별개 의미를 가진다. zod 의 `.optional()` vs `.nullable()` 차이가
  도메인 의미로 직결되는 드문 케이스. 후보 검증(후보 목록에 없는 URL 무시)은 서버 책임 —
  스키마는 `string.url()` 형식만 본다.
- **`CreateSettlementShareInput` 의 `z.preprocess` null→`{}`** — 다이얼로그가 본문 없이 POST
  하면 Fastify 가 body 를 `null` 로 넘긴다(undefined 아님 → zod default 가 안 먹음). preprocess
  로 `null` 을 `{}` 로 메꿔야 `ttl` default('7d') 가 적용된다. body 옵셔널 라우트에서 default
  를 살리려는 정형 패턴.
- **`receiptImageToken` 를 round 에 추가 + 공유에서 omit** — 편집 재진입 시 영수증을 보존하려면
  서버가 토큰을 응답에 실어야 하지만, 공유 토큰 보유자가 이 토큰으로 원본 영수증을 재조회할 수
  있으면 안 된다. `SharedSettlementRound.omit` 가 `receiptPreviewUrl` 1 개에서
  `{ receiptPreviewUrl, receiptImageToken }` 2 개로 늘었다 — 민감 필드 추가 시 공유 redaction
  도 따라 늘려야 한다는 omit→extend 패턴의 실증.
- **`ShareTtl` 무제한 없음 (최대 30일)** — `'1d'|'7d'|'30d'` 만. 짧은 10자 토큰을 쓰므로 무제한
  공유면 brute-force 노출 창이 닫히지 않는다. TTL cap 으로 보안 trade-off 를 스키마 단에서 강제.
- **`SettlementSession.editedAt` 을 nullable** — 저장 후 한 번도 수정 안 됐으면 null, 한
  번이라도 update PUT 이 돌면 그 시각. 단순 boolean (`isEdited`) 대신 시각을 실어 보내
  공유 페이지의 '수정됨 (yyyy-mm-dd HH:MM)' 배지를 만든다. `updatedAt` 과 의미가 다르다 —
  `updatedAt` 은 어떤 변경이든 갱신되지만 `editedAt` 은 사용자의 명시적 본문 수정 한정.
- **참여자 옵션은 `excludeXxx` 3 boolean** — 풀 카테고리 1:1 매칭. 직교 조합 자유롭게.
  `EXCLUDE_KEY` 매핑은 calculator 가 단일 SSOT.
- **ESLint flat config 합류 (turbo lint 4/4)** — [eslint.config.mjs](../../packages/api-contract/eslint.config.mjs)
  가 `@repo/config/eslint/base` 만 spread + `dist/`·`node_modules/` ignore. **순수 zod 스키마/타입
  패키지라 base TS 규칙만으로 충분** — React Compiler 진단 룰(앱 전용)이나 추가 플러그인은 없다.
  이번 라운드 web/friendly/api-contract/mobile 4 워크스페이스가 모두 eslint.config.mjs 를 가져
  turbo lint 가 4/4 green 이 됐다.
- **CLAUDE.md 규칙** — _"공유 스키마는 `@repo/api-contract` 에 추가"_ ([CLAUDE.md](../../CLAUDE.md)).

## Gotchas [coverage: high — 12 sources]

- **변경의 파급력** — 스키마 한 줄 수정이 friendly + web + mobile 모두에 컴파일 타임 영향.
  필드 제거나 타입 좁히기는 모든 소비자 코드를 깨뜨린다.
- **정산 세션 모양이 통째로 바뀐 breaking change** — `SettlementSession` 의 `items[]`/
  `participants[]` (참여자 도메인 외) 가 사라지고 `rounds: SettlementRound[].min(1)` 안으로
  이동. `itemsSubtotal` → `grandTotal`. 직전 라운드의 `UpdateSettlementParticipantsInput`
  도 사라졌다 — 이제 `UpdateSettlementInput = CreateSettlementInput` 의 전체 replace 만
  가능. 어떤 클라이언트도 단일 차수 가정 코드를 그대로 두면 컴파일 시 깨진다.
- **`Routes.Settlement.updateParticipants(id)` 사라짐** — 직전 라운드에 있던 `PATCH /:id/participants`
  엔드포인트가 폐기. 이제 `Routes.Settlement.update(id)` 의 PUT 한 가지. URL 자체는 `one(id)`
  과 같지만 HTTP verb 로 분기. fetch 래퍼가 verb 명시 안 하고 호출하면 GET 으로 떨어져 의외
  동작.
- **`SettlementRoundInput` 의 refine 순서가 에러 메시지 순서** — discount pair refine 이
  먼저, 풀 cover refine 이 다음. 한 번에 둘 다 실패하면 페어 에러만 노출되므로 클라이언트가
  "둘 다 채웠는데도 풀 초과" 케이스를 보려면 페어를 먼저 채워서 두 번째 refine 만 트리거
  되게 해야 한다. UI 가 stepwise 검증을 한다고 가정.
- **`clientId` indirection 의 함정** — `SettlementParticipantInput.clientId` 는 **클라가
  부여**하는 안정적 임시 키. `crypto.randomUUID()` 같은 걸 한 번 만들고 같은 폼 세션 내내
  유지해야 round.attendees.participantClientId 매칭이 끊기지 않는다. 입력 도중 새로 만들면
  같은 사람이 두 번 들어가게 된다. 서버는 그 clientId 가 unique 한지 검증 없이 신뢰 (zod
  min(1) 외 제약 없음).
- **`participantClientId` 가 마스터에 없으면 서버 에러** — round.attendees 의 키는 반드시
  participants 의 누군가의 clientId 와 매칭돼야 한다. 마스터 삭제 후 round.attendees 정리
  안 하면 저장 실패. 폼 store 에서 마스터 삭제 시 모든 round 의 attendees 도 같이 정리해야
  한다.
- **`categoryAdjustments.leftoverParticipantClientId` 도 같은 indirection** — 카테고리 보정의
  흡수자도 입력 시점엔 clientId 로 가리킨다. 마스터 삭제 시 이 참조도 끊기지 않게 정리 필요.
  서버는 매핑 실패 시 calculator 가 -1 → 첫 활성자 fallback 으로 silently 처리하지만, UI
  의도와 다를 수 있다.
- **`roundUnit` divisibility silent fallback** — calculator 가 무효한 rounding(나눠떨어지지
  않는 케이스) 을 silently 무시하고 원 풀 + 잔여 가산으로 떨어진다. 사용자가 "100원 단위로
  맞춘다" 를 선택했는데 결과가 그대로 안 나올 수 있다는 의미 — UI 가 활성 조건 검사 (풀이
  100 으로 round 시 인원수로 나눠지는지) 를 사전에 해야 한다. calculator 는 절대 깨지지 않는
  것을 우선으로 둠.
- **할인 풀 음수 클램프** — `calculateShares` 가 `Math.max(0, rawPool - discount.amount)`
  로 음수를 0 으로 막는다. 스키마 refine 으로 입력 단에서 차단되지만, calculator 가 호출
  context (멀티라운드, 외부 호출) 를 신뢰하지 않고 방어한다. UI 가 "할인이 풀보다 큼"
  케이스를 user-friendly 에러로 보여주려면 스키마 refine 에 걸리도록 입력 검증을 거쳐야지,
  calculator 만 보고 판단하면 안 된다 (조용히 0).
- **`SettlementDraft.payload` 형태 검증 부재** — 서버가 `z.unknown()` 으로 통과만 시킨다.
  즉 잘못된 모양의 payload 가 저장돼도 BE 는 모름. 다음 입력 화면이 그 payload 를 로드할 때
  클라가 자체 검증 + invalid 면 폐기/마이그레이션 책임. payload 가 의도적으로 BE 와 분리된
  자유 영역이라는 점을 잊으면 "서버에 저장됐는데 왜 화면이 깨지나" 디버깅 함정.
- **`fromDraftId` 가 없는 id 면 silent ignore** — 본인 소유가 아니거나 존재하지 않는 draft
  id 를 보내도 정산 저장은 성공한다 (draft 정리만 skip). UI 가 "임시저장이 사라졌는지"
  확인하려면 별도 호출 필요 — 단, 일반적인 사용 흐름(자동저장 → 저장 클릭)에서는 같은
  세션 안의 draft id 라 안전.
- **`SharedSettlementSession.omit + extend` 의 nested 제거** — receiptPreviewUrl/receiptImageToken
  은 round 안에 있어 top-level omit 으론 안 지워진다. `omit({ userId, rounds }).extend({ rounds:
  SharedSettlementRound[] })` 패턴 필요. **이번 라운드 `receiptImageToken` 추가로 omit 가
  1→2 필드**가 됐다 — round 에 새 민감 필드를 추가할 때마다 `SharedSettlementRound.omit` 도
  같이 늘려야 한다. 잊으면 공유 토큰 보유자에게 원본 영수증(토큰)이 leak.
- **`CreateSettlementShareInput.ogImageUrl` 트라이스테이트 혼동** — `생략`(키 없음) / `null` /
  `URL` 세 상태가 모두 다른 의미다. 생략=기존 선택 유지, null=선택 해제(랜덤 복귀), URL=고정.
  fetch 래퍼가 "선택 안 함" 을 `null` 로 보내면 owner 의 직전 선택이 지워진다 — 토글을 바꿀
  때만 명시하고 그 외엔 키 자체를 빼야 한다. 다이얼로그 자동 share POST 가 이 함정을 피하려고
  본문을 비워 보낸다.
- **`CreateSettlementShareInput` 의 body null preprocess** — 본문 없이 POST 하면 Fastify body 가
  `undefined` 가 아닌 `null` 이라 zod default 가 안 먹는다. `z.preprocess(v=> v==null?{}:v, …)`
  를 거쳐야 `ttl` 기본 7일이 적용된다. 다른 옵셔널-body 라우트를 만들 때 같은 함정 — `.default()`
  만으론 부족.
- **`ogImageUrl` 후보 검증은 서버 책임** — 스키마는 `string.url()` 형식만 본다. 후보 목록
  (`ogImageCandidates`) 에 없는 URL 을 보내면 zod 는 통과시키고 **서버가 무시 후 null 처리**.
  클라가 "분명 URL 을 보냈는데 미선택으로 돌아간다" 디버깅 시 후보 매칭 실패를 의심해야 한다.
- **`ExtractReceiptSplit.index <= count` refine** — `count=3, index=4` 같은 입력은
  refine 으로 거부. 클라가 split UI 에서 미리 검증해도 BE 가 다시 막는다. count 와 index
  enum 의 max(5) cap 도 — 가로 5등분이 실용 한계 가정.
- **`ExtractReceiptInput.roundIndex/roundTotal` 의 의미** — 한 영수증이 N차 회식의 몇 번째
  인지 LLM 프롬프트에 주입하는 힌트. 미지정 + `roundTotal <= 1` 이면 프롬프트에 차수 라인을
  넣지 않음. 잘못된 `roundIndex > roundTotal` 같은 케이스는 zod refine 으로 막혀있지 않다
  (각각 1..20 cap 만) — 서버 또는 클라가 별도 검증해야 한다.
- **`Routes.Ai.X(id, purpose)` (breaking)** — `provider/testProvider/providerModels` +
  신규 `providerModelsPreview` 모두 두 인자. 1 인자만 넘기면 TS 컴파일 에러.
- **`Routes.SettlementDraft.upsert` 는 id 없이 PUT** — body 안의 `placeId` 로 서버가
  `(userId, placeId)` 키로 upsert. RESTful 관습으로 보면 PUT 에 id 가 없는 게 어색하지만
  의도 — 클라가 draft 의 server cuid 를 모르는 상태에서도 같은 식당 슬롯을 갱신할 수
  있어야 한다. DELETE 만 `one(id)` 의 cuid 가 필요.
- **`Routes.Settlement.shared(token)` 만 `/share/...` prefix** — 다른 정산 라우트는
  `/settlements/...`. Fastify 인증 미들웨어가 path prefix 로 분기 — 의도된 분리.
  `/settlements/share/:token` 처럼 보이지 않게 주의.
- **`SettlementParticipantInput.contactId` 는 힌트일 뿐** — 클라가 자동완성에서 단골을 골라
  보내도 서버는 무시하고 `(userId, normalizedKey)` 로 upsert.
- **`calculateShares` 전원 제외 풀 fallback 동작** — 주류 항목이 있는데 전원이
  `excludeAlcohol=true` 면 풀 금액이 0 으로 떨어지는 게 아니라 **전원에게 균등 분배**.
  UI 가 이 의미 차이를 사용자에게 전달하지 않으면 의외의 결과를 줄 수 있음. `perCategoryShares`
  도 본래 카테고리 키(ALCOHOL) 에 값이 박혀 매트릭스에 '주류 컬럼' 에 음식값이 보이는 경우가
  발생 — UI 가 `poolBreakdown.participantCount === 0` 으로 fallback 분기를 감지해 회색
  처리 등 시각적 구분 필요.
- **list 응답 모양이 (직전 라운드) canonical 단위 그룹핑으로 전환된 상태 유지** —
  `RestaurantListResult.items` 가 `CanonicalListItem[]` (1 행 = 1 canonical, `sources` 배열).
  변경 없음.
- **공개 상세의 `reviews[].source` 가 (직전 라운드) 신규** — `PublicVisitorReview.source:
  'naver' \| 'diningcode'`. 변경 없음.
- **빌드 단계 추가 금지** — `package.json` `exports` 가 `src/` 를 직접 가리키므로 tsup/rollup
  같은 번들러를 끼우면 워크스페이스 전체 import 경로가 깨진다.
- **순환 의존 금지** — `@repo/shared → @repo/api-contract` 는 OK, 반대 방향은 금지.
- **`.js` 확장자 표기** — 실 파일은 `.ts` 지만 import 는 `.js` 로 써야 한다 (NodeNext 해석).
- **`z.coerce` 의 함정** — `ExtractReceiptSplit.{count,index}`, `ExtractReceiptInput.{roundIndex,
  roundTotal}`, `PaginationQuerySchema`, `ListSettlementsQuery.{offset,limit}` 등 다수가 coerce.
- **`Routes.*` namespace re-export 가 vite esbuild prebundle 에서 깨질 수 있음** —
  `Routes.Settlement`, `Routes.SettlementDraft` 등도 동일 위험. 회피책: friendly 측은
  `const SettlementDraftRoutes = Routes.SettlementDraft` 로 한 단계 우회.
- **`schedule.ts` 의 `cronExpr` 은 길이만 검증** — `z.string().min(1).max(120)` 만 봐서
  `"banana"` 같은 무효 cron 도 zod 는 통과시킨다. 형식 유효성은 `SchedulePreviewInput` →
  `SchedulePreviewResult.valid/error` (서버 croner) 로만 알 수 있다. 클라가 스키마 통과 =
  유효한 cron 이라고 가정하면 함정. PUT `config` 전에 `preview` 로 검증하는 흐름을 전제로 한다.
- **`ScheduleConfigInput` 에 `jobType` 이 없다** — 서버가 `'normalize-merge'` 로 고정.
  enum 이 단일이라 입력에 받지 않는다. 추후 jobType 다중화 시 입력 스키마에 추가될 예정 —
  지금 `ScheduleConfig` 응답엔 `jobType` 이 있으니 응답/입력 비대칭에 주의.
- **`ScheduleRun.phase`/`totalTargets` 는 nullable** — 완료된 이력 행에서는 null 일 수 있다
  (`phase` 는 진행 중에만, `totalTargets` 는 collecting 단계 후에야 확정). live 스냅샷과
  같은 shape 를 쓰는 대가 — UI 가 이력 렌더 시 null 가드 필요.
- **`Routes.Schedule.config` 한 경로가 GET/PUT 겸용** — URL 은 `/admin/schedule` 하나,
  HTTP verb 로 조회/변경 분기. fetch 래퍼가 verb 명시 안 하면 GET 으로 떨어진다 (settlement
  `update` 와 같은 함정). `runEvents` 는 SSE 라 EventSource 로 붙어야 한다.
- **`Routes.*` namespace re-export 함정에 `Routes.Schedule` 도 포함** — vite esbuild
  prebundle 에서 깨질 수 있어 friendly 측은 `const ScheduleRoutes = Routes.Schedule` 우회
  패턴을 동일하게 쓴다.
- **`RestaurantPublicReviewsQuery.tip`/`menu` 매칭은 서버 책임** — `tip` 은 termNorm 정확
  일치, `menu` 는 topMenus 와 동일 MenuCanonical 그룹핑. 클라가 raw 텍스트를 보내면 카드
  카운트와 결과 수가 안 맞을 수 있다 — 카드의 canonical 표시명을 그대로 넘겨야 한다.
- **정산 도메인 상세 설명은 `settlement.md` 에서** — api-contract 토픽은 스키마 export 목록
  + 라우트 namespace + design decision 만 다룬다. N차 입력 UX / 임시저장 자동저장 흐름 /
  영수증 분할 / 카테고리 보정 UI 같은 도메인 흐름은 [settlement.md](settlement.md) 토픽 참조.
- **스케줄러 파이프라인 동작은 `schedule.md`/`analytics.md` 에서** — api-contract 는 wire
  shape 만. 실제 정규화 → 글로벌 머지 단계, overlap/shutdown 처리, croner tick 운영은
  [schedule](schedule.md) / [analytics](analytics.md) 토픽 참조.

## Sources [coverage: high — 25 sources]

- [packages/api-contract/package.json](../../packages/api-contract/package.json) — 업데이트 (lint 스크립트 + eslint devDep)
- [packages/api-contract/eslint.config.mjs](../../packages/api-contract/eslint.config.mjs) — **신규** (@repo/config/eslint/base flat config)
- [packages/api-contract/tsconfig.json](../../packages/api-contract/tsconfig.json)
- [packages/api-contract/src/index.ts](../../packages/api-contract/src/index.ts) — 업데이트 (17차: schedule re-export)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — 업데이트 (17차: Routes.Schedule namespace + Restaurant.publicCategoryTree)
- [packages/api-contract/src/settlement.calculator.ts](../../packages/api-contract/src/settlement.calculator.ts) — 업데이트 (calculateMultiRoundShares, effectiveExcludes, perCategoryShares, discount/categoryAdjustments 옵션)
- [packages/api-contract/src/schemas/common.ts](../../packages/api-contract/src/schemas/common.ts)
- [packages/api-contract/src/schemas/auth.ts](../../packages/api-contract/src/schemas/auth.ts)
- [packages/api-contract/src/schemas/user.ts](../../packages/api-contract/src/schemas/user.ts)
- [packages/api-contract/src/schemas/picks.ts](../../packages/api-contract/src/schemas/picks.ts)
- [packages/api-contract/src/schemas/admin.ts](../../packages/api-contract/src/schemas/admin.ts)
- [packages/api-contract/src/schemas/crawl.ts](../../packages/api-contract/src/schemas/crawl.ts)
- [packages/api-contract/src/schemas/restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts) — 업데이트 (17차: RestaurantCategoryTreeResult + PublicReviewsQuery.tip/menu)
- [packages/api-contract/src/schemas/canonical.ts](../../packages/api-contract/src/schemas/canonical.ts)
- [packages/api-contract/src/schemas/menu-grouping.ts](../../packages/api-contract/src/schemas/menu-grouping.ts)
- [packages/api-contract/src/schemas/auto-discover.ts](../../packages/api-contract/src/schemas/auto-discover.ts)
- [packages/api-contract/src/schemas/analytics.ts](../../packages/api-contract/src/schemas/analytics.ts) — CategoryTreeNode 가 restaurant.ts 에 재사용됨(17차)
- [packages/api-contract/src/schemas/schedule.ts](../../packages/api-contract/src/schemas/schedule.ts) — **신규 (17차)** 주기 자동 실행 12 export, cron 검증은 croner(서버) 위임
- [packages/api-contract/src/schemas/ai.ts](../../packages/api-contract/src/schemas/ai.ts) — PreviewLlmModelsInput/Result
- [packages/api-contract/src/schemas/settings-map.ts](../../packages/api-contract/src/schemas/settings-map.ts)
- [packages/api-contract/src/schemas/settlement-extraction.ts](../../packages/api-contract/src/schemas/settlement-extraction.ts) — 업데이트 (ExtractReceiptSplit + roundIndex/roundTotal)
- [packages/api-contract/src/schemas/settlement.ts](../../packages/api-contract/src/schemas/settlement.ts) — 업데이트 (ShareTtl/ShareOgImage enum + CreateSettlementShareInput.ogImage/ogImageUrl + SettlementShare.expiresAt/ogImage/ogImageUrl/ogImageCandidates + SettlementRound.receiptImageToken + SharedSettlementRound 두-필드 omit)
- [packages/api-contract/src/schemas/settlement-contact.ts](../../packages/api-contract/src/schemas/settlement-contact.ts)
- [packages/api-contract/src/schemas/settlement-draft.ts](../../packages/api-contract/src/schemas/settlement-draft.ts) — **신규**
- [CLAUDE.md](../../CLAUDE.md) — "공유 스키마는 `@repo/api-contract` 에 추가" 규칙
