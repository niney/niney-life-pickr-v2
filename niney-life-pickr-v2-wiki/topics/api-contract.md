---
topic: api-contract
last_compiled: 2026-05-28
sources_count: 23
status: active
aliases: [zod, schemas, ssot, contracts, "@repo/api-contract", canonical, canonical-merge, canonical-split, canonical-proposal, canonical-suggestion, catchtable, catchtable-search, catchtable-shop, diningcode, diningcode-search, diningcode-shop, diningcode-bulk-save, naver-search-result, crawl-search-query, crawl-search-result, search-bbox, auto-discover, auto-discover-job, auto-discover-phase, auto-discover-snapshot, fused-detail, public-sources, public-diningcode-addon, crawl-log, crawl-log-level, crawl-job-log-entry, review-summary-queued, review-summary-cancelled, restaurant-cancel-summary, restaurant-resume-summary, summary-log-event, public-reviews-pagination, public-review-sentiment, public-review-sort, settlement, settlement-session, settlement-participant, settlement-item, settlement-share, settlement-shared, settlement-contact, settlement-extraction, receipt-item, receipt-item-category, settlement-calculator, calculate-shares, llm-provider-purpose, ai-purpose, settlement-draft, settlement-draft-schema, SettlementDraft, UpsertSettlementDraftInput, settlement-rounds, SettlementRound, SettlementRoundAttendee, calculateMultiRoundShares, effectiveExcludes, perCategoryShares, ExtractReceiptSplit, roundIndex, roundTotal, fromDraftId, update-PUT, full-replace, leftoverParticipantClientId, roundUnit-100-1000, categoryAdjustments, SharedSettlementRound, omit-extend, attendees-100, items-200, models-preview]
---

# api-contract — Zod 공유 스키마 (SSOT)

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

## Architecture [coverage: high — 12 sources]

### 디렉터리 구조

```
packages/api-contract/
├── package.json          # exports: src/*.ts 직접 노출 (no build)
├── tsconfig.json         # @repo/config/tsconfig/base.json 상속
└── src/
    ├── index.ts          # 모든 스키마 + Routes namespace + calculator 재내보내기
    ├── routes.ts         # API_PREFIX + 도메인별 경로 상수 (Auth/Users/Picks/Admin/Media/Crawl/Restaurant/Canonical/Analytics/AutoDiscover/Ai/SettingsMap/SettlementExtraction/Settlement/SettlementContact/SettlementDraft/Health)
    ├── settlement.calculator.ts # FE/BE 공통 분배 알고리즘 — 카테고리별 풀 + 제외 플래그 → shareAmounts[]. **이번 라운드 멀티라운드 확장** (calculateMultiRoundShares + effectiveExcludes + perCategoryShares 매트릭스 + discount/categoryAdjustments 옵션)
    └── schemas/
        ├── common.ts                # Id, Timestamp, ErrorResponse, Pagination
        ├── auth.ts                  # Register/Login/AuthResponse
        ├── user.ts                  # Role, User, PublicUser
        ├── picks.ts                 # Pick, PickCategory, Create/Update/Result
        ├── admin.ts                 # AdminUsersResponse, SetRole
        ├── crawl.ts                 # NaverPlace 크롤러 + Job/SSE Event + VisitorReview + 네이버 검색 + 캐치테이블 + 다이닝코드(검색·상세·리뷰·등록확인·일괄저장 SSE 잡)
        ├── restaurant.ts            # 어드민/공개 식당 + 리뷰 분석 + summary SSE + insights/smart-pick + analytics backfill + canonical 단위 list (sources[])
        ├── canonical.ts             # 가게 정체(canonical) 통합 — candidates/merge/split/dismissSuggestion + proposal 큐 + canonical 삭제
        ├── menu-grouping.ts         # 식당 단위 메뉴 정규화 + ranking + grouping job (다건/SSE)
        ├── auto-discover.ts         # 맛집 자동 발견 잡 — AI 키워드 8개 → 다중 검색 → 그룹 5병렬 크롤. state + phase 두 enum 분리
        ├── analytics.ts             # 글로벌 메뉴 통계 + 머지 잡 + category tree (z.lazy 재귀)
        ├── ai.ts                    # AI 호출 + 배치 + LLM Provider 관리 (purpose=chat/image enum) + **PreviewLlmModelsInput/Result**
        ├── settings-map.ts          # 외부 지도 SDK provider config (admin + public reveal)
        ├── settlement-extraction.ts # 영수증 업로드(token)/추출(vision LLM) + ReceiptItemCategory enum. **이번 라운드 신규**: ExtractReceiptSplit (count/index) + ExtractReceiptInput.roundIndex/roundTotal/split
        ├── settlement.ts            # **재작성** N차(rounds) 정산 — SettlementRound/RoundAttendee + 마스터 participants + categoryAdjustments + 할인. UpdateSettlementInput=CreateSettlementInput 별칭(전체 replace) + fromDraftId
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
이번 라운드에 `schemas/settlement-draft.ts` 한 파일이 추가됐다.

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
export * from './schemas/ai.js';
export * from './schemas/settings-map.js';
export * from './schemas/settlement-extraction.js';
export * from './schemas/settlement.js';
export * from './schemas/settlement-contact.js';
export * from './schemas/settlement-draft.js';   // 신규
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
(`CanonicalListItem.suggestion`). 방향은 restaurant → crawl, restaurant → canonical
한쪽 — canonical 은 어떤 다른 도메인 스키마도 import 하지 않는다. 신규 `auto-discover.ts`
도 자체 타입만 사용해 다른 도메인 스키마를 import 하지 않는다. `menu-grouping.ts` 와
`analytics.ts` 는 여전히 각자 독립.

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
  `MapProviderConfig`, **`CreateSettlementInput`, `UpdateSettlementInput`, `SettlementSession`,
  `SharedSettlementSession`, `UpsertSettlementDraftInput`, `ListSettlementDraftsResult`,
  `ExtractReceiptInput` (split/round 포함)** 등을 `schema: { body, response }` 로 등록.
- **@repo/shared** — `Routes.Auth.login`, `Routes.Crawl.{jobEvents(id), catchtableSearch, ...}`,
  `Routes.Canonical.*`, `Routes.Restaurant.summaryEvents/publicReviews`, `Routes.Analytics.*`,
  `Routes.AutoDiscover.*`, `Routes.SettingsMap.*`, `Routes.Ai.{complete, provider(id, purpose),
  providerModelsPreview(id, purpose)}`, **`Routes.Settlement.{list, create, one(id), update(id),
  share(id), shared(token)}`, `Routes.SettlementDraft.{list, upsert, one(id)}`,
  `Routes.SettlementExtraction.*`, `Routes.SettlementContact.*`** 의 경로 헬퍼와 `z.infer<typeof X>`
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

### `schemas/canonical.ts` · `schemas/auto-discover.ts` · `schemas/restaurant.ts`

(직전 라운드 그대로 — 변경 없음. `CanonicalSummary`/`CanonicalListItem`/proposal 큐,
`AutoDiscoverJobState/Phase` 분리, `RestaurantPublicDetail` 융합 모양 + `reviewsFirstPage`
+ `RestaurantPublicReviewsQuery/Result` 페이지네이션. 각 표는 직전 컴파일 본 참고.)

### `schemas/menu-grouping.ts` / `schemas/analytics.ts` / `schemas/settings-map.ts`

(직전 라운드 그대로 — 변경 없음.)

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

### `schemas/settlement.ts` — [settlement.ts](../../packages/api-contract/src/schemas/settlement.ts) **(재작성 — N차 모델)**

세션 한 건이 **여러 차수(rounds)** 를 가진다. 마스터 참여자(`SettlementParticipant`) 가
세션 단위, 차수별 참석/제외 override 는 `SettlementRoundAttendee` 가 담당. 차수별로
식당이 다를 수 있어 `restaurantPlaceId` 가 round 에도 있다. items/attendees 가 session
직속에서 사라지고 `rounds[]` 안으로 이동.

| Export | 용도 |
| --- | --- |
| `SettlementSource` | `'MANUAL' \| 'RECEIPT'`. 차수 단위 — 1차 RECEIPT + 2차 MANUAL 가능 |
| `SettlementItem` / `SettlementItemInput` | 한 항목. `{ id, name(1~120), unitPrice, quantity, amount, category, matchedMenuName, orderIndex }`. Input 은 `id`/`orderIndex` 생략 |
| **`SettlementRoundAttendee`** | `{ participantId, attended, excludeAlcoholOverride: bool\|null, excludeNonAlcoholOverride: bool\|null, excludeSideOverride: bool\|null, shareAmount }`. **override = null 이면 마스터 default 사용**, true/false 면 그 차수만 덮어쓰기 |
| **`SettlementRoundAttendeeInput`** | `{ participantClientId(min 1), attended(default true), excludeXxxOverride: bool\|null }`. 입력 시점엔 마스터 cuid 가 아직 없어 클라이언트가 안정적 임시 키(`participantClientId`)로 매핑 |
| **`SettlementCategoryAdjustment`** (응답) | `{ leftoverParticipantId, roundUnit: int>0 \| null }`. 차수 단위 카테고리 보정 |
| **`SettlementCategoryAdjustmentInput`** (입력) | `{ leftoverParticipantClientId, roundUnit }` — 입력은 clientId 로 |
| **`SettlementCategoryAdjustments`** / **`...Input`** | `Record<카테고리, adjustment \| null>` 의 `.nullable()` (Input 은 `.optional().default(null)`) |
| **`SettlementRound`** | `{ id, orderIndex, restaurantPlaceId, restaurantName, source, totalAmount, warning, receiptPreviewUrl, itemsSubtotal, discountAmount: int>0\|null, discountCategory: ReceiptItemCategory\|null, categoryAdjustments, items: SettlementItem[], attendees: SettlementRoundAttendee[] }` |
| **`SettlementRoundInput`** | 입력 차수. `items.min(1).max(200)` + `attendees.min(1).max(100)`. `discount{Amount,Category}` 는 optional+default(null). **2 단 refine**: ① `(amount==null) === (category==null)` (페어 강제), ② 같은 카테고리 풀 금액 ≥ discountAmount (풀 음수 방지) |
| `SettlementParticipant` | 마스터 참여자. `{ id, name, nickname, excludeAlcohol, excludeNonAlcohol, excludeSide, shareAmount(=모든 round 합), orderIndex, contactId(nullable) }` |
| **`SettlementParticipantInput`** | `{ clientId(min 1), name, nickname, excludeXxx(default false), contactId? }`. **clientId 는 required** — 클라가 안정적 임시 키 부여, round.attendees 의 `participantClientId` 와 매칭 |
| **`SettlementSession`** | `{ id, userId, restaurantPlaceId, restaurantName(=1차 식당 snapshot, 목록·이력 호환), grandTotal(=모든 round itemsSubtotal 합), rounds: SettlementRound[].min(1), participants: SettlementParticipant[], createdAt, updatedAt, editedAt(nullable) }` |
| **`CreateSettlementInput`** | `{ rounds: SettlementRoundInput[].min(1).max(10), participants: SettlementParticipantInput[].min(1).max(100), fromDraftId?: string }`. **`fromDraftId`** — 임시저장에서 출발이면 저장 트랜잭션 안에서 해당 draft 함께 삭제. 본인 소유가 아니거나 없는 id 면 조용히 무시 |
| **`UpdateSettlementInput`** | `= CreateSettlementInput`. **전체 replace** 의미 — 부분 PATCH 없음. 서버는 트랜잭션으로 삭제→재삽입 + shareAmount 재계산 |
| `ListSettlementsQuery` | `{ placeId?, offset, limit(1~50, def 20) }` |
| **`SettlementSessionSummary`** | `{ id, restaurantPlaceId, restaurantName, source(=1차), grandTotal, roundCount, itemCount(=차수 합), participantCount, createdAt }` |
| `ListSettlementsResult` | `{ items: SettlementSessionSummary[], total }` |
| `SettlementShare` | `{ token: nullable, shareUrl: nullable }`. 회수 후 둘 다 null |
| **`SharedSettlementSession`** | `SettlementSession.omit({ userId, rounds }).extend({ rounds: SharedSettlementRound[] })` 여기서 `SharedSettlementRound = SettlementRound.omit({ receiptPreviewUrl })`. 토큰 받은 사람도 원본 사진은 못 본다 |

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
| `Restaurant` | 공개: ranking, publicList, publicByPlaceId, publicInsights, **publicReviews(placeId)** / 어드민: list, byPlaceId, delete, summaryStatus, summaryEvents, reanalyze, cancelSummary, resumeSummary, crawlLogs, insights, smartPick, menusGroup, menusRanking, analyticsBackfill | `/restaurants/...` + `/admin/restaurants/...` |
| `Canonical` | candidates(id), merge, split(id), dismissSuggestion(id), proposals, proposalsRun, proposalAccept(id), proposalReject(id), delete(id) | `/admin/canonical/...` |
| `Analytics` | restaurantsStatus, groupingJobs/Job/JobEvents, overview, globalMenus, globalMergeJobs/Job/JobEvents, categoryTree | `/admin/analytics/...` |
| `AutoDiscover` | jobs, job(id), jobEvents(id) | `/admin/auto-discover/jobs[/:id[/events]]` |
| `Ai` | complete, completeBatch, providers, provider(id, purpose), testProvider(id, purpose), providerModels(id, purpose), **`providerModelsPreview(id, purpose)`** | `/admin/ai/...` (`/:id/:purpose[/test|/models|/models/preview]`) |
| `SettingsMap` | list, provider(id), secret(id), publicConfig | `/admin/settings/map/...` + `/settings/map/public` |
| `SettlementExtraction` | upload, extract, preview(token) | `/settlement-extraction/...` |
| **`Settlement`** | list, create, one(id), **`update(id)`** (PUT 전체 replace, 기존 updateParticipants 대체), share(id), shared(token) | `/settlements/...` + `/share/settlements/:token` |
| **`SettlementDraft` (신규)** | **list, upsert (PUT `/settlement-drafts`), one(id) (DELETE)** | `/settlement-drafts[/:id]` |
| `SettlementContact` | list, one(id) | `/me/contacts[/:id]` |
| `Health` | (단일 상수) | `/health` |

**이번 라운드 (2026-05-28) 변경 라우트:**

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
  totalAmount, warning, receiptPreviewUrl, itemsSubtotal, discountAmount(int>0\|null),
  discountCategory(ReceiptItemCategory\|null), categoryAdjustments, items[], attendees[] }`.
  차수마다 식당이 다를 수 있어 `restaurantPlaceId`/`restaurantName` 이 round 에도 있다.
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
  SettlementRound.omit({ receiptPreviewUrl })`. omit→extend 패턴으로 nested 필드까지
  공개 응답에서 제거.
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

(이전 라운드의 NaverSearchResult / RestaurantPublicDetail / ReviewAnalysis 분리 / CanonicalSummary /
GlobalMenuStat / CategoryTreeNode / LlmProviderConfig 등의 compose 관계는 그대로 유효.)

## Key Decisions [coverage: high — 15 sources]

- **Zod 채택** — 런타임 검증 + 정적 타입 추론을 한 스키마로 처리하고, fastify-type-provider-zod
  와 한 번에 결합돼 OpenAPI 까지 자동 생성. **TS interface 직접 사용 금지** — 모든
  공유 타입은 zod 스키마에서 추론.
- **빌드 없는 src 직접 export** — `package.json` `exports` 가 `./src/*.ts` 를 가리킨다.
- **도메인별 파일 분할 + 한 방향 import** — `restaurant → crawl/canonical` 처럼 한쪽만.
  정산 패밀리 내부도 `settlement → settlement-extraction (enum 만)`, `calculator → settlement
  타입` 등 한 방향. **`settlement-draft.ts` 는 다른 schemas/ 를 전혀 import 하지 않는다** —
  payload 가 `z.unknown()` 이므로 도메인 본문 스키마와 의도적으로 끊는다.
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
- **`SettlementSession.editedAt` 을 nullable** — 저장 후 한 번도 수정 안 됐으면 null, 한
  번이라도 update PUT 이 돌면 그 시각. 단순 boolean (`isEdited`) 대신 시각을 실어 보내
  공유 페이지의 '수정됨 (yyyy-mm-dd HH:MM)' 배지를 만든다. `updatedAt` 과 의미가 다르다 —
  `updatedAt` 은 어떤 변경이든 갱신되지만 `editedAt` 은 사용자의 명시적 본문 수정 한정.
- **참여자 옵션은 `excludeXxx` 3 boolean** — 풀 카테고리 1:1 매칭. 직교 조합 자유롭게.
  `EXCLUDE_KEY` 매핑은 calculator 가 단일 SSOT.
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
- **`SharedSettlementSession.omit + extend` 의 nested 제거** — receiptPreviewUrl 은 round
  안에 있어 top-level omit 으론 안 지워진다. `omit({ userId, rounds }).extend({ rounds:
  SharedSettlementRound[] })` 패턴 필요. 새로운 nested 민감 필드 추가 시 같은 패턴 반복
  필요 — 잊으면 공개 응답에 leak.
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
- **정산 도메인 상세 설명은 `settlement.md` 에서** — api-contract 토픽은 스키마 export 목록
  + 라우트 namespace + design decision 만 다룬다. N차 입력 UX / 임시저장 자동저장 흐름 /
  영수증 분할 / 카테고리 보정 UI 같은 도메인 흐름은 [settlement.md](settlement.md) 토픽 참조.

## Sources [coverage: high — 23 sources]

- [packages/api-contract/package.json](../../packages/api-contract/package.json)
- [packages/api-contract/tsconfig.json](../../packages/api-contract/tsconfig.json)
- [packages/api-contract/src/index.ts](../../packages/api-contract/src/index.ts) — 업데이트 (settlement-draft re-export)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — 업데이트 (Settlement.update, SettlementDraft, Ai.providerModelsPreview)
- [packages/api-contract/src/settlement.calculator.ts](../../packages/api-contract/src/settlement.calculator.ts) — 업데이트 (calculateMultiRoundShares, effectiveExcludes, perCategoryShares, discount/categoryAdjustments 옵션)
- [packages/api-contract/src/schemas/common.ts](../../packages/api-contract/src/schemas/common.ts)
- [packages/api-contract/src/schemas/auth.ts](../../packages/api-contract/src/schemas/auth.ts)
- [packages/api-contract/src/schemas/user.ts](../../packages/api-contract/src/schemas/user.ts)
- [packages/api-contract/src/schemas/picks.ts](../../packages/api-contract/src/schemas/picks.ts)
- [packages/api-contract/src/schemas/admin.ts](../../packages/api-contract/src/schemas/admin.ts)
- [packages/api-contract/src/schemas/crawl.ts](../../packages/api-contract/src/schemas/crawl.ts)
- [packages/api-contract/src/schemas/restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts)
- [packages/api-contract/src/schemas/canonical.ts](../../packages/api-contract/src/schemas/canonical.ts)
- [packages/api-contract/src/schemas/menu-grouping.ts](../../packages/api-contract/src/schemas/menu-grouping.ts)
- [packages/api-contract/src/schemas/auto-discover.ts](../../packages/api-contract/src/schemas/auto-discover.ts)
- [packages/api-contract/src/schemas/analytics.ts](../../packages/api-contract/src/schemas/analytics.ts)
- [packages/api-contract/src/schemas/ai.ts](../../packages/api-contract/src/schemas/ai.ts) — 업데이트 (PreviewLlmModelsInput/Result 명시)
- [packages/api-contract/src/schemas/settings-map.ts](../../packages/api-contract/src/schemas/settings-map.ts)
- [packages/api-contract/src/schemas/settlement-extraction.ts](../../packages/api-contract/src/schemas/settlement-extraction.ts) — 업데이트 (ExtractReceiptSplit + roundIndex/roundTotal)
- [packages/api-contract/src/schemas/settlement.ts](../../packages/api-contract/src/schemas/settlement.ts) — 재작성 (N차 rounds 모델)
- [packages/api-contract/src/schemas/settlement-contact.ts](../../packages/api-contract/src/schemas/settlement-contact.ts)
- [packages/api-contract/src/schemas/settlement-draft.ts](../../packages/api-contract/src/schemas/settlement-draft.ts) — **신규**
- [CLAUDE.md](../../CLAUDE.md) — "공유 스키마는 `@repo/api-contract` 에 추가" 규칙
