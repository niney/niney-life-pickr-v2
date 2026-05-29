---
concept: Zod SSOT + 빌드 없는 src export
last_compiled: 2026-05-28
topics_connected: [api-contract, friendly, shared, web, mobile, utils, ai, menu-grouping, analytics, map, project-overview, auto-discover, settlement]
status: active
---

# Zod SSOT + 빌드 없는 src export

## Pattern

이 모노레포는 두 가지 결정이 한 쌍으로 묶여 있다: (1) **API I/O는 Zod 스키마로 한 번만 정의**하고, (2) **공유 패키지는 컴파일하지 않고 `src/*.ts`를 그대로 export**한다. 둘 다 따로 보면 각자 합리적이지만, 함께일 때 진짜 가치가 나온다 — 스키마 1개를 고치면 friendly의 검증, 자동 생성된 OpenAPI 문서, web과 mobile의 fetch 타입까지 모두 컴파일 타임에 즉시 동기화된다. 빌드 단계가 끼어 있으면 캐시 무효화·watch 재기동으로 마찰이 생기지만, src 직접 노출은 tsx (friendly), Vite (web), Metro (mobile)이 자연스럽게 처리한다.

## Instances

- **2026-05-07** in [[../topics/api-contract]]: `package.json`이 `./src/index.ts`를 main/types로 직접 가리킨다. 컴파일 산출물 없음. `Routes.Auth.login` 같은 경로 상수 + zod 스키마가 한 파일에서 노출.
- **2026-05-07** in [[../topics/friendly]]: `fastify-type-provider-zod`로 동일 zod 스키마를 검증기 + 시리얼라이저 + OpenAPI 변환기로 재사용. `app.ts`가 `setValidatorCompiler` / `setSerializerCompiler`로 와이어링.
- **2026-05-07** in [[../topics/shared]]: `client.ts`의 fetch 래퍼가 `ErrorResponseSchema.safeParse`로 응답 검증. API 함수 시그니처는 `z.infer<typeof X>`로 도출 — 별도 타입 선언 없음.
- **2026-05-07** in [[../topics/web]] / [[../topics/mobile]]: 같은 `Routes.*` 상수와 `z.infer` 타입을 import. 하드코딩된 경로 문자열·타입 중복 0.
- **2026-05-07** in [[../topics/utils]]: 같은 빌드 없는 패턴이 도메인 무관 헬퍼에도 적용. 외부 의존 0인 진짜 leaf.
- **2026-05-07** in [[../topics/project-overview]]: CLAUDE.md 규칙 "공유 스키마는 `@repo/api-contract`에 추가" + 순환 의존 금지 (shared → api-contract OK, 반대 ❌).
- **2026-05-07** in [[../topics/ai]]: AI 도메인이 그대로 같은 패턴을 따른다. `schemas/ai.ts`에 `AiCompleteInput`/`LlmProviderConfig`/`UpdateLlmProviderInput`/`TestLlmProviderResult` 등 정의 → friendly의 `ai.route.ts`가 동일 스키마로 `body`/`response` 검증 → shared의 `aiApi`/`useAi*` 훅이 `z.infer`로 타입 도출 → web의 `AdminAiKeysPage`/`AdminAiTestPage`가 같은 타입으로 폼/결과 렌더. 한 곳 수정 → 4개 컨슈머가 컴파일 타임에 동기화되는 약속이 신규 도메인에서도 깨지지 않음.
- **2026-05-09** in [[../topics/menu-grouping]] / [[../topics/analytics]]: 두 신규 스키마 모듈 (`packages/api-contract/src/schemas/menu-grouping.ts`, `analytics.ts`) 이 같은 패턴으로 추가. friendly 가 `fastify-type-provider-zod` 로 자동 검증 + OpenAPI 생성, shared 의 `apiFetch` 함수가 동일 zod 타입을 type-only import, web/mobile 컴포넌트가 `Type` suffix `z.infer` 결과를 직접 사용. 신규 진입 두 가지: (1) **재귀 스키마 — 같은 모듈에서 첫 `z.lazy` 사용**. `CategoryTreeNode` 트리 구조에 대해 type alias 를 먼저 선언한 뒤 `z.ZodType<CategoryTreeNodeType>` 로 lazy 정의 — TS 추론이 재귀 깊이를 못 따라가서 명시적 annotation 필요. (2) **잡 SSE event payload 별도 스키마** — `MenuGroupingJobItemEvent`, `GlobalMergeJobChunkEvent`, ... 를 discriminated union 으로 묶지 않고 단순함을 우선해 개별 스키마로 노출.
- **2026-05-09** in [[../topics/map]] / [[../topics/api-contract]] / [[../topics/friendly]] / [[../topics/shared]] / [[../topics/web]]: vworld 지도 도메인 + 공개 맛집 페어가 같은 SSOT 모델로 흡수. `schemas/settings-map.ts` 에 `MapProviderConfig` / `UpdateMapProviderInput` / `MapProviderSecret` / `MapProviderPublicConfig` 4종이 한 곳에 정의되고, friendly 의 `map.route.ts` 가 검증 + OpenAPI 자동 생성, shared 의 `settingsMapApi` / `useMapProviders` / `useUpdateMapProvider` / `useMapProviderSecret` / `useMapPublicConfig` 가 `z.infer` 로 타입 도출, web 의 `AdminMapKeysPage` / `PublicRestaurantsMap` 이 같은 타입으로 폼 / 응답 처리. 그리고 공개 맛집 페어 — `RestaurantPublicListQuery` / `RestaurantPublicListItem` / `RestaurantPublicListResult` / `PublicReviewAnalysis` / `PublicVisitorReview` / `RestaurantPublicDetail` 6종이 어드민 페어 옆에 `schemas/restaurant.ts` 한 모듈에 추가되어 한 번 변경에 컨슈머 4-5개가 컴파일 타임 동기화. 새 도메인이 늘어도 보일러플레이트가 증가하지 않는다는 약속이 두 라운드 연속 깨지지 않음.
- **2026-05-17** in [[../topics/auto-discover]] / [[../topics/api-contract]] / [[../topics/friendly]] / [[../topics/shared]] / [[../topics/web]]: 자동 발견 도메인 한 모듈 통째 추가. `schemas/auto-discover.ts` 에 14 export (Input/JobState/Phase/Keyword/Candidate/JobSnapshot + SkipReason enum + 4 SSE 이벤트). 흥미로운 신규 진입: (1) **`JobState` 와 `Phase` 두 enum 분리** — 기존 잡들(menu-grouping/global-merge/diningcode-bulk-save)이 state 하나만 가졌던 것과 달리 잡 상태(pending/running/done/failed/cancelled)와 단계(queued/generating_keywords/searching/crawling/done)를 별 축으로 표현. UI 배지 / 진행률 / 취소 정책이 이 두 축에서 자연스럽게 갈라짐. (2) **`cancelled` enum 값 첫 등장** — 기존 잡 enum 4 값(pending/running/done/failed)에 cancelled 추가. 사용자 명시 취소를 silent skip 과 다르게 표현. 한 곳 변경 → friendly 의 `auto-discover.route.ts` 검증 + service 흐름, shared 의 `autoDiscoverApi` / `useAutoDiscover*` / activeStore, web 의 `AdminAutoDiscoverPage` / `AutoDiscoverForm` / `AutoDiscoverJobCard` 가 컴파일 타임 동기화. **fused detail 페어 동시 추가** — `schemas/restaurant.ts` 에 `PublicSourceNaver` / `PublicSourceDiningcode` / `PublicSources` / `PublicStoredReviewCount` / `PublicDiningcodeScoreDetail` / `PublicDiningcodeAddon` 6종이 한 모듈에 흡수되어 (canonical 그룹의 Naver 행 + DC 형제) 응답을 어드민/공개 양쪽이 같은 zod 페어로 받음. 한 모듈 변경 → 5-6 컨슈머 동기화 약속이 세 라운드 연속 깨지지 않음.
- **2026-05-09 (follow-up)** in [[../topics/api-contract]] / [[../topics/friendly]] / [[../topics/shared]] / [[../topics/web]]: 어드민 발견 페이지를 위한 검색 스키마 페어가 추가. `schemas/crawl.ts` 에 `NaverSearchResult` / `CrawlSearchQuery` / `CrawlSearchResult` 3종 + `Routes.Crawl.search` 라우트 상수 추가. `CrawlSearchResult.source: z.enum(['playwright'])` 는 어떤 어댑터가 응답을 만들었는지 명시 — 추후 비공식 fallback 가능성을 enum 으로 한 곳에 기록 (현재 단일 값이지만 'unofficial' 추가 가능). friendly 의 `crawl.route.ts` 가 querystring 검증, `crawl.service.searchPlaces()` 가 응답 형식, shared 의 `crawlApi.search` + `useNaverSearch` 가 `z.infer` 로 타입 도출, web 의 `AdminDiscoverPage` 가 동일 타입. 한 모듈 변경 → 4 컨슈머 동기화.
- **2026-05-25** in [[../topics/settlement]] / [[../topics/api-contract]] / [[../topics/friendly]] / [[../topics/shared]] / [[../topics/web]] / [[../topics/ai]]: 정산 도메인 통째 — **세 스키마 모듈 + 공유 calculator + ai purpose enum 한 라운드**. (a) `schemas/settlement.ts` ~13 export (SettlementSession, SettlementItem, SettlementParticipant, CreateSettlementInput, UpdateSettlementParticipantsInput, SettlementShare, SharedSettlementSession, ListSettlementsQuery/Result, SettlementSessionSummary 등) — `editedAt: z.string().nullable()` 같은 의도된 nullable 다수. (b) `schemas/settlement-extraction.ts` ~6 export — 영수증 업로드/추출 입출력 + ReceiptItemCategory enum. (c) `schemas/settlement-contact.ts` ~6 export — 단골 CRUD. (d) `settlement.calculator.ts` (zod schema 아닌 순수 헬퍼) — **첫 사례: 계산 헬퍼를 api-contract 에 둠**. FE 가 미리보기 + BE 가 권위 있는 저장을 같은 알고리즘으로 보장. 같은 빌드 없는 leaf 약속 안에서 헬퍼도 동일 컨슈머 모델로 흡수. (e) `schemas/ai.ts` 에 `LlmProviderPurpose` enum 추가 (chat/image) — vision 모델 컨슈머 등록을 한 곳에서 + 4-5 컨슈머 동기화. friendly 의 `settlement.route.ts`/`settlement-extraction.route.ts`/`contact.route.ts` 가 검증 + OpenAPI 자동 생성, shared 의 `settlementApi`/`settlementExtractionApi`/`settlementContactApi` + 8 훅 (`useListSettlements`, `useSettlement`, `useCreateSettlement`, `useUpdateSettlementParticipants`, `useCreateSettlementShare`, `useRevokeSettlementShare`, `useSharedSettlement`, `useDeleteSettlement` + extraction/contact 훅) 이 `z.infer` 로 타입 도출, web 의 정산 페이지 5종 + 다이얼로그 4종 이 동일 타입. 한 라운드 통째 추가로 **컨슈머 5개가 컴파일 타임 동기화** — 새 도메인 통째 추가가 zod-ssot 패턴 첫 한 라운드 안에서 흡수된 가장 큰 사례.
- **2026-05-28** in [[../topics/settlement]] / [[../topics/api-contract]] / [[../topics/friendly]] / [[../topics/shared]] / [[../topics/web]] / [[../topics/mobile]]: 정산 도메인이 **N-라운드 모델**로 진화 — **단일 라운드 SSOT 흡수의 새 최대치**. 이전(2026-05-25) 라운드의 "도메인 통째 추가"가 가장 컸다면, 이번엔 같은 도메인의 **모델 자체가 재형성**되며 컨슈머 6개(api-contract → friendly + shared + web + mobile + 그 안의 calculator 호출자들)가 한 라운드에서 동시에 컴파일된다. (a) 신규 모듈 `schemas/settlement-draft.ts` (`SettlementDraft` / `UpsertSettlementDraftInput` / `ListSettlementDraftsResult`) — 사용자 편집 중 임시 상태를 서버에 보존. (b) `schemas/settlement.ts` 의 대규모 재작성 — `SettlementRound` / `SettlementRoundAttendee` / `SettlementRoundAttendeeInput` / `SettlementCategoryAdjustmentInput` / `SettlementCategoryAdjustmentsInput` / `SettlementCategoryAdjustmentOutput` 등 N-라운드 표현이 스키마 1급 시민으로 등장. 1차/2차/N차 회식이 한 정산 세션에 묶이는 모델. (c) `settlement.calculator.ts` 에 `calculateMultiRoundShares` + `effectiveExcludes` 추가 — 기존 `calculateShares` 가 단일 라운드 알고리즘이었다면, multi-round 는 라운드별 카테고리 보정과 라운드별 참석자 제외를 합산. **calculator 가 두 라운드 연속 성장하며 "FE/BE 공유 알고리즘" 이 zod 스키마 아닌 헬퍼로도 한 leaf 에 박힘이 일반화**. (d) `schemas/settlement-extraction.ts` 에 `ExtractReceiptSplit` 타입과 `roundIndex` / `roundTotal` 필드 추가 — 한 영수증을 N 라운드로 split 하는 케이스를 추출 결과에 반영 (LLM 출력은 그대로, 응답 envelope 만 풍부해짐). 컨슈머 동기화: friendly 의 `settlement.route.ts` PUT(`/api/v1/settlements/:id` 전체 교체) + service 의 multi-round 저장 / 계산 / share, shared 의 `settlementApi` + 정산 훅 다수, web 의 Step1/2/3/4 다이얼로그 + `RoundDiscountEditor` 등 신규 컴포넌트, mobile 의 같은 Step1/2/3/4 바텀시트 + 정산 화면 — **모두 한 PR diff 안에서 컴파일 타임 동기화**.

## What This Means

빌드 없는 src export는 단순히 빌드 시간 절약이 아니다 — **Zod SSOT의 약속을 지키는 인프라**다. 만약 api-contract에 tsup 단계를 추가하면 즉각 watch 재기동·d.ts 캐시 무효화 문제가 따라붙고, "스키마 한 곳만 고치면 된다"는 약속이 부분적으로 깨진다. 그래서 두 결정은 사실상 한 묶음이다.

**확장이 마찰 없음** — 새 도메인 스키마 추가 = 한 파일 추가 + `src/index.ts` re-export 1줄. 빌드 없는 src export 라 컨슈머(friendly · shared · web · mobile)가 즉시 컴파일 타임에 동기화된다. menu-grouping/analytics 처럼 도메인 수가 늘어나도 보일러플레이트가 증가하지 않는다. 재귀 스키마 (`z.lazy`) 는 이전 라운드에 처음 들어왔지만 같은 SSOT 모델 안에서 자연스럽게 흡수됐다 — type alias + 명시적 `z.ZodType` annotation 한 줄이면 끝이고, 컨슈머 측은 일반 스키마와 구분 없이 `z.infer` 로 타입을 받는다.

**재형성도 마찰 없음** (2026-05-28) — settlement 도메인이 "단일 영수증·단일 라운드" 에서 "N 라운드 + 라운드별 참석자/보정/제외" 로 모델 자체가 재형성됐는데도, 스키마 수정 한 라운드 안에서 friendly + shared + web + mobile 4 컨슈머가 모두 컴파일 타임에 정렬됐다. 도메인 추가가 아닌 **모델 재구조화** 도 같은 SSOT 인프라가 흡수한다는 것이 두 라운드 연속 확인됨. 그리고 `settlement.calculator.ts` 에 `calculateMultiRoundShares` + `effectiveExcludes` 가 추가되며 **api-contract 의 "헬퍼 leaf" 역할이 zod 스키마와 동등한 1급 시민으로 안착** — FE 미리보기와 BE 권위 저장이 같은 함수를 호출한다는 약속이 단일 라운드 알고리즘에서 N-라운드 알고리즘으로 자연스럽게 확장.

이게 깨질 수 있는 시점:
- **api-contract가 외부 패키지를 npm에 publish해야 할 때** — 그 시점엔 빌드 단계가 필요해진다. 그 전까지는 workspace 안에서만 사용
- **공유 패키지에 사이드 이펙트가 생길 때** — 현재 모두 순수 (utils는 외부 의존 0, api-contract는 zod만, shared는 react/zustand/tanstack-query peer로). 사이드 이펙트가 들어오면 트리 셰이킹·SSR 호환성 문제가 시작됨
- **TypeScript의 `verbatimModuleSyntax`를 끄고 싶어질 때** — 이 옵션이 켜져 있어야 isolatedModules 환경(Vite/Metro/tsx)에서 src 직접 import가 안전. 끄는 순간 미묘한 type-only import 문제 발생

순환 의존 금지 규칙(`shared → api-contract`만 허용)도 이 패턴의 보호 장치다 — api-contract는 leaf로 유지돼야 SSOT 노드가 다중화되지 않는다.

## Sources

- [[../topics/api-contract]]
- [[../topics/friendly]]
- [[../topics/shared]]
- [[../topics/web]]
- [[../topics/mobile]]
- [[../topics/utils]]
- [[../topics/project-overview]]
- [[../topics/menu-grouping]]
- [[../topics/analytics]]
- [[../topics/map]]
- [[../topics/auto-discover]]
- [[../topics/settlement]]
