---
topic: shared
last_compiled: 2026-06-06
sources_count: 54
status: active
aliases: [react-query, zustand, design-tokens, ui-primitives, "@repo/shared", useNaverSearch, "crawlApi.search", naver-search-hook, useCanonical, canonical-api, diningcode-bulk-save, useDiningcodeBulkSaveJob, autoDiscover, useAutoDiscoverJob, summarySseHeartbeat, useUserLocation, useCancelSummary, useResumeSummary, useRestaurantCrawlLogs, useCrawlJobLogs, summary-log-handler, stream-log-entries, useRestaurantPublicReviews, settlement, settlementApi, useSettlement, useListSettlements, useCreateSettlement, useDeleteSettlement, useUpdateSettlement, useUpdateSettlementParticipants, useCreateSettlementShare, useRevokeSettlementShare, useSharedSettlement, settlementExtractionApi, useUploadReceipt, useExtractReceipt, settlementContactApi, useSettlementContacts, useCreateSettlementContact, useUpdateSettlementContact, useDeleteSettlementContact, settlementDraftStore, useSettlementDraftStore, receipt-preview-blob, ai-provider-purpose, useSettlementDraft, useListSettlementDrafts, useUpsertSettlementDraft, useDeleteSettlementDraft, useSettlementDraftAutoSync, useSettlementDraftHydrate, settlement-draft-api, settlement-draft-v4, setSettlementDraftStorage, storage-adapter-injection, DraftRound, DraftAttendance, DraftCategoryAdjustment, copyRoundAttendancesFrom, setRoundReceipt, syncAttendances, fromDraftId, useProviderModelsPreview, usePreviewModels, ai-models-preview, ShareOgImage, ogImageCandidates, ogImageUrl, share-og-image, settlement-share-gallery, hydratedForRef, draft-hydrate-once, scheduleApi, useSchedule, useScheduleConfig, useScheduleRuns, useUpdateScheduleConfig, useRunScheduleNow, useSchedulePreview, useScheduleRunEvents, buildScheduleRunEventsUrl, schedule-sse, useRestaurantPublicCategoryTree, publicCategoryTree, dark-mode-tokens, soft-tonal-tokens, useUserLocation-auto]
---

# shared — FE 공통 패키지

**2026-06-06 변경 흡수 (17차, 13c10a5→HEAD) — 주기 자동 실행 어드민 FE 플러밍 + 다크 모드 토큰 + 공개 카테고리 트리 + useUserLocation auto 옵션**:
(1) **신규 `api/schedule.api.ts` + `hooks/useSchedule.ts`** — 주기 자동 실행([schedule](schedule.md)) 어드민 FE 플러밍. `scheduleApi` = `getConfig`/`updateConfig`(PUT)/`runNow`(POST, 진행 중이면 서버가 skipped run 반환)/`listRuns`/`preview`(cron 다음 실행시각 검증) + `buildScheduleRunEventsUrl()`(token query SSE URL). 훅: `useScheduleConfig`/`useScheduleRuns`(useQuery), `useUpdateScheduleConfig`(성공 시 `['schedule','config']` 에 `setQueryData` 직접 박기), `useRunScheduleNow`(runs+config invalidate), `useSchedulePreview(cronExpr, timezone, enabled)`(저장 전 cron 미리보기, queryKey 에 입력 포함, caller 가 디바운스), **`useScheduleRunEvents(enabled)`** — 진행 중 run 의 live SSE 진행 구독. global-merge 잡 훅과 같은 패턴(자체 EventSource + 1s→30s cap 백오프 + closedRef/cancelled), `'snapshot'`(running 이면 progress 로 정규화)/`'progress'`/`'done'` 3 이벤트, done 시 `['schedule','runs']`+`['schedule','config']`+`['analytics']` invalidate(머지 결과를 통계에 반영). [stream-driven-cache-merge](../concepts/stream-driven-cache-merge.md) 의 새 인스턴스(진행 머지). index.ts 가 둘 다 re-export.
(2) **`design/tokens.ts` — 다크 모드 토큰 가독성 개선** — `palette.zinc400(#a1a1aa)` 추가, `darkColors.textMuted` 를 `zinc500`→`zinc400`(surface 위 본문 AA 4.5:1 미달 → surfaceAlt 위 5.81:1 로 상향, placeholderTextColor 14곳도 회복), `darkColors.border` 를 `rgba(255,255,255,0.1)`→`0.14`(카드 외곽선/구분선 가시성). `lightColors.bg` 는 `zinc50`→`white`(라이트는 흰 배경이라 textMuted=zinc500 유지). 웹/앱이 design 토큰만 공유하고 **테마 저장소는 플랫폼별 분리**(웹 localStorage / 앱 AsyncStorage) — [platform-ui-split](../concepts/platform-ui-split.md) 의 새 인스턴스(토큰 공유 + 영속화 분리).
(3) **`restaurant.api.ts` + `useRestaurant.ts` — 공개 카테고리 트리 + 리뷰 tip/menu 필터** — `restaurantApi.publicCategoryTree(placeId)` 신규(`Routes.Restaurant.publicCategoryTree`) + **`useRestaurantPublicCategoryTree(placeId)`** 훅(`['restaurant','public','category-tree',placeId]`, staleTime 60s, 전역 머지가 닿은 식당만 roots 채워짐). `useRestaurantPublicReviews` 의 filters 에 `tip?`/`menu?` 추가 — queryKey 에 `tip ?? null`/`menu ?? null` 포함, 둘 중 하나라도 있으면 detail seed 무효화(`canSeed` 가 `!filters.tip && !filters.menu` 추가), `publicReviews` 쿼리스트링에 tip/menu 전달. tip/menu 는 호출처에서 동시 1개만 설정.
(4) **`useUserLocation.ts` — `{ auto?: boolean }` 옵션 추가** — `auto=true`(기본) 마운트 시 자동 1회 요청(공개 맛집 주변 검색용), `auto=false` 면 명시적 `refetch`("내 위치" 버튼) 전까지 `'idle'` 유지(어드민 발견처럼 진입만으로 권한 prompt 안 띄움). permission `'change'` 구독은 auto 와 무관하게 유지(거부→설정 해제 시 자동 복구). 상태 enum/refetch 시그니처 불변.

**2026-06-01 변경 흡수 — 정산 공유 OG 이미지 갤러리/선택 + draft hydrate placeId당 1회 (correctness)**:
(1) **`useSettlementDraftHydrate` 가 placeId(식당 컨텍스트)당 단 한 번만 hydrate** ([useSettlementDraft.ts](../../packages/shared/src/hooks/useSettlementDraft.ts)) —
이전에는 effect 가 `list.data` 를 의존해서, 자동저장(`useSettlementDraftAutoSync`)이 `['settlement-draft', 'list']` 를
invalidate→refetch 할 때마다 `list.data` 가 새 참조로 와 effect 가 다시 돌고 store 를 옛 서버 스냅샷으로 다시
overwrite 했다 — 그 사이 들어온 사용자 입력이 in-flight 저장 직후의 stale snapshot 에 밀려나는 좁은 레이스 +
저장마다 store 전역 리렌더가 터졌다. `hydratedForRef = useRef<string | null | undefined>(undefined)` 로 마지막
hydrate 한 placeId 를 기억하고, `hydratedForRef.current === placeId` 면 effect 가 즉시 return — 같은 식당
컨텍스트면 두 번 다시 덮어쓰지 않는다. placeId 가 바뀌면(다른 식당 진입) 다시 hydrate 허용. 비로그인/list 실패도
한 번만 `hydrated=true` 로 마킹하고 끝(sessionStorage-only 모드). perf + correctness 양쪽 fix.
(2) **공유 OG 이미지 갤러리/선택 API 확장** ([settlement.api.ts](../../packages/shared/src/api/settlement.api.ts) /
[useSettlement.ts](../../packages/shared/src/hooks/useSettlement.ts)) — `settlementApi.createShare(id, ttl, ogImage?, ogImageUrl?)`
가 두 옵션 인자 추가:
  - `ogImage?: ShareOgImageType` (`'restaurant' | 'table'`) — 미리보기 소스 토글. 식당 사진(`restaurant`) vs 정산표
    PNG(`table`). **생략 시 서버가 기존 선택 유지**(첫 공유면 `restaurant`) — 다이얼로그가 열릴 때마다 본문 없이
    POST 해도 선택이 덮이지 않게 토글 변경 시에만 명시.
  - `ogImageUrl?: string | null` **트라이스테이트**(식당 사진 갤러리에서 특정 1장 고정): **생략(undefined) → 유지 /
    `null` → 해제(토큰 시드 결정적 랜덤으로 복귀) / URL 문자열 → 그 사진 고정.** `undefined` 일 때만 body 에서 키를
    빼서 서버가 "유지" 와 "해제(null)" 를 구분할 수 있게 한다(`if (ogImageUrl !== undefined) body.ogImageUrl = ...`).
  - 응답 `SettlementShareType` 가 확장 — 기존 `token`/`shareUrl`/`expiresAt` 에 더해 `ogImage`(현재 저장된 선택),
    `ogImageUrl`(갤러리에서 고른 식당 사진 원본 URL, 미선택이면 null=랜덤), **`ogImageCandidates: string[]`**(고를 수
    있는 식당 사진 후보 원본 URL, 네이버 호스트 — 다이얼로그가 썸네일 갤러리로 렌더, 비면 갤러리 숨김 + 자동 정산표
    폴백) 추가. `useCreateSettlementShare()` mutation 인자도 `{ id, ttl?, ogImage?, ogImageUrl? }` 로 확장 —
    공유 다이얼로그가 토글/갤러리 선택을 그대로 실어 보낸다. 캐시는 여전히 손대지 않음(응답을 UI 가 직접 표시).

**2026-05-31 변경 흡수 — `useUserLocation` 권한/환경 판정 강화**: ([useUserLocation.ts](../../packages/shared/src/hooks/useUserLocation.ts)) (1) **비-secure context 단정** — 평문 HTTP(`http://192.168.x.x` 등, localhost 제외)에서는 브라우저가 geolocation 을 권한 prompt 조차 없이 즉시 `code 1` 로 막아 `denied` 로 오분류될 수 있다. `window.isSecureContext === false` 면 시도 전에 `unavailable` 로 단정(사이트 설정으로 못 푸는 환경 제약 — `denied` 와 구분). (2) **Permissions API `'change'` 구독** — 한 번 `denied` 가 되면 사이트가 다시 prompt 를 띄울 방법이 없고 사용자가 브라우저 설정에서 직접 풀어야 하는데, 그 변화를 `navigator.permissions.query({name:'geolocation'})` 의 `change` 이벤트로 감지해 새로고침 없이 자동 `refetch` — granted 면 좌표까지 자동 취득(미지원 환경은 스킵, 수동 refetch 만). 컨슈머([web](web.md) 의 `PublicRestaurantsMap` "내 위치" 버튼)는 이 덕에 "설정 풀면 버튼이 저절로 살아남" UX 를 공짜로 얻는다. 상태 enum(`idle|pending|granted|denied|unavailable`) + `refetch()` 시그니처는 불변.

**2026-05-28 변경 흡수 — 정산 N차(rounds) + 서버 임시저장 자동 동기화 + 스토리지 어댑터 주입**:
(1) `settlementDraftStore` 가 평면 draft → `rounds[]` 배열 모델로 리팩토링(차수 N개 + 마스터 참여자 1 명단), persist 버전 v1 → v4 마이그레이션
체인 (`v1→v2` rounds 도입 / `v2→v3` 차수 할인 / `v3→v4` 카테고리 잔여 보정), `setSettlementDraftStorage(storage)` 로 RN AsyncStorage 등 플랫폼별
storage 주입 가능(웹은 자동 `window.sessionStorage`, 미주입+무브라우저면 NO_OP 폴백). 새 액션: `addRound` / `removeRound` / `updateRoundMeta` /
`setRoundItems|addRoundItem|updateRoundItem|removeRoundItem` / `setRoundReceipt` / `setAttendance` / `setExcludeOverride` /
`copyRoundAttendancesFrom` / `setRoundDiscount` / `setCategoryAdjustment` / `startFromScratch`. 마스터 참여자 변동 시 모든 round 의 attendances 를
`syncAttendances` 가 자동 정합화. ([settlementDraftStore.ts](../../packages/shared/src/stores/settlementDraftStore.ts))
(2) **신규 `api/settlement-draft.api.ts` + `hooks/useSettlementDraft.ts`** — 서버 임시저장 `/api/v1/settlement-drafts` (list/upsert/delete) +
`useListSettlementDrafts` / `useUpsertSettlementDraft` / `useDeleteSettlementDraft` + 자동저장 hook 두 짝: `useSettlementDraftHydrate(placeId)`
(진입 시 서버 draft 를 store 에 한 번 overwrite) + `useSettlementDraftAutoSync({ placeId, placeNameHint, hydrated, initialDraftId, debounceMs=3000 })`
(store subscribe → debounce → upsert, 로그인 + hydrated 일 때만 동작, `draftId` 반환해 정산 저장 시 `fromDraftId` 로 넘김).
(3) `useUpdateSettlementParticipants` → **`useUpdateSettlement`** 로 이름 변경 + 시그니처 `({ id, input: UpdateSettlementInputType })` — 부분 패치가 아니라
세션 전체 replace(차수 추가/삭제 포함). detail 캐시는 `setQueryData` 직접 박기, list 만 invalidate(기존 패턴 유지). (4) `useCreateSettlement` 의 입력
타입(`CreateSettlementInputType`)에 `fromDraftId?: string` 필드 추가 — 자동저장된 draft 에서 출발한 저장이면 서버가 트랜잭션 안에서 그 draft 도 함께
삭제(소유 mismatch 면 silent ignore). (5) `useListSettlements` 가 `/me/settlements` 이력 페이지에서 완료 정산 목록을 렌더, 그 위에 `useListSettlementDrafts`
가 "이어 입력" 행을 같이 그림.
(6) `aiApi.previewModels` + **`usePreviewModels` (a.k.a. `useProviderModelsPreview`)** 신규 — 저장 전에 폼의 API 키로 모델 목록 직접 fetch.
AdminAiKeysPage 가 저장 전 미리보기에 사용. ([ai.api.ts](../../packages/shared/src/api/ai.api.ts) / [useAi.ts](../../packages/shared/src/hooks/useAi.ts))

**2026-05-25 변경 흡수 — 정산 도메인 FE 플러밍 통째 추가 (api 3 + hook 3 + store 1)**: 새 `@repo/shared` 노출 = `settlement.api.ts` / `settlement-extraction.api.ts` / `settlement-contact.api.ts` (api), `useSettlement.ts` / `useSettlementExtraction.ts` / `useSettlementContact.ts` (hooks), `settlementDraftStore.ts` (zustand persist `sessionStorage`, placeId 별 단일 draft). 정산 도메인 자체 동작은 [settlement.md](settlement.md) 가 다루고, 여기서는 클라이언트 plumbing layer(HTTP 함수 + React Query 훅 + draft 스토어)만 정리. 부수 변경: (a) `aiApi` provider 키가 `{ id, purpose }` ProviderKey 로 바뀜 — chat/image 용도별 분리, vision LLM 등록 길 열림 ([ai.api.ts](../../packages/shared/src/api/ai.api.ts) / [useAi.ts](../../packages/shared/src/hooks/useAi.ts)). (b) `apiFetch` 가 `FormData` body 면 `Content-Type` 헤더를 안 붙임 — 브라우저가 multipart boundary 채우게 양보 ([client.ts](../../packages/shared/src/api/client.ts)). (c) `restaurantApi.list` / `useRestaurantList` 가 `{ limit, offset, sort }` 받는 페이징형으로 확장, queryKey 가 가변이라 `patchSummaryInListCaches` 가 `setQueriesData` prefix 매칭으로 모든 페이지 캐시 일괄 갱신 ([restaurant.api.ts](../../packages/shared/src/api/restaurant.api.ts) / [useRestaurant.ts](../../packages/shared/src/hooks/useRestaurant.ts)).

**2026-05-19 변경 흡수**: (1) `useUserLocation` 신규 훅 — 브라우저 geolocation 권한 query → getCurrentPosition (`enableHighAccuracy:false`, 5s timeout, 60s maximumAge), `idle|pending|granted|denied|unavailable` 5상태 + `refetch()`. ref 기반 attempt 카운터로 in-flight 무효화. 공개 맛집 지도 첫 진입에서 사용 — `@repo/utils` 의 `computeBboxAround` 와 짝. (2) `useRestaurant` — `useCancelSummary` / `useResumeSummary` 신규 mutation, `useRestaurantCrawlLogs(placeId)` infiniteQuery (cursor pagination), `useRestaurantSummaryEvents(placeId, { onLog })` 시그니처 확장 — onLog 콜백을 ref 안정화로 받아 SSE log 이벤트 누적 가능. (3) `summarySseManager` — `LogHandler` 타입 + `Subscribers.logs: Set<LogHandler>` 추가, `subscribe({ onLog?: ... })` 옵션 추가, 'log' named event 를 구독자에 라우팅. (4) `useCrawl` — `CrawlStreamState.logs: StreamLogEntry[]` 누적 필드 + `useCrawlJobLogs(jobId)` 신규 + reducer 가 (jobId, seq) Map dedup 으로 SSE 'log' 이벤트 누적. (5) `useRestaurantPublicReviews` 신규 infiniteQuery — detail 의 `reviewsFirstPage` 를 seed (sentiment='all', sort='recent' 일 때만) + 2 페이지부터 fetch. (6) `restaurantApi` — `cancelSummary`/`resumeSummary`/`crawlLogs`/`publicReviews` API 함수, `publicByPlaceId` 가 옛 백엔드 응답 어댑팅 (`reviews` 단일 배열 → `reviewsFirstPage` + `reviewCounts` 평탄화). `crawlApi.jobLogs(jobId)` 추가.

## 1. Purpose [coverage: high — 5 sources]

`@repo/shared`는 web과 mobile에서 동시에 사용되는 프론트엔드 공통 코드를 모아둔 워크스페이스
패키지다. 어드민(인증 필요)과 공개(비로그인 허용) 두 모드를 모두 한 패키지에서 다루며,
컨슈머는 `apps/web`(어드민 + 공개 + 로그인 페이지)과 `apps/mobile`(어드민 게이트)이다.
책임 영역은 다음과 같다.

- 타입 안전한 fetch 래퍼와 도메인별 API 함수 (auth, picks, admin, crawl, restaurant,
  canonical, menu-grouping, analytics, ai, settings-map, **settlement / settlement-extraction
  / settlement-contact**). 어드민/공개/공유(read-only) 라우트가 같은 `apiFetch` 위에 얹힌다.
- TanStack Query 훅 (서버 상태) — 메뉴 그룹핑/전역 머지/다이닝코드 일괄 저장 잡 SSE 훅 +
  공개 맛집 리스트/상세/인사이트/지도 설정 훅 + 캐노니컬(병합/분리/제안 큐) 훅 + **정산 세션 CRUD
  + 영수증 업로드/추출 + 단골 CRUD 훅** 포함
- Zustand 스토어 (인증, 활성 크롤 잡, 활성 그룹핑/전역 머지/DC 일괄 저장 잡, **정산 draft**)
- 프로세스 전역 SSE 매니저 싱글톤 (요약 진행률 + review 분석 멀티플렉싱 — placeId + canonicalId 두 키 종류 동시)
- 잡 단위 SSE 라이프사이클 훅 (그룹핑/전역 머지/DC 일괄 저장 — 매니저를 쓰지 않고 hook 자체가
  EventSource 를 직접 들고 백오프 재연결 관리)
- 디자인 토큰·테마·`ThemeProvider`·CSS 변수 변환
- 플랫폼 분기형 UI 프리미티브 (Button, Input, Stack, Text, Divider, ErrorBanner, Screen, SegmentedControl)
- 공용 상수 (`APP_NAME`, React Query staleTime/gcTime)

빌드 산출물 없이 `src/index.ts`를 그대로 노출(`"main": "./src/index.ts"`)하므로
Turborepo 컨슈머는 별도 빌드 단계 없이 TS 소스를 바로 import한다.

## 2. Architecture [coverage: high — 26 sources]

```
packages/shared/src/
├── index.ts                # barrel: 모든 하위 모듈 re-export
├── api/
│   ├── client.ts           # apiFetch + ApiError + configureApi (토큰 게터 주입) — FormData 면 Content-Type 미설정
│   ├── auth.api.ts
│   ├── picks.api.ts
│   ├── admin.api.ts
│   ├── crawl.api.ts        # start/list/cancel/search + catchtable*/diningcode* + DC bulk-save 잡 + buildJobEventsUrl + buildDiningcodeBulkSaveEventsUrl
│   ├── restaurant.api.ts   # 어드민 list({limit,offset,sort})/ranking/getByPlaceId/delete/reanalyze + 공개 publicList/publicByPlaceId/publicInsights + buildSummaryEventsUrl({placeIds, canonicalIds})
│   ├── canonical.api.ts    # candidates/merge/split/dismissSuggestion/proposals(list/run/accept/reject)/delete
│   ├── menu-grouping.api.ts# 식당 단위 그룹핑 + 잡 시작/스냅샷 + buildGroupingJobEventsUrl
│   ├── autoDiscover.api.ts # 자동 발견 잡 start/get/cancel + buildAutoDiscoverEventsUrl
│   ├── analytics.api.ts    # overview / global-menus / category-tree + 전역 머지 잡 + buildGlobalMergeJobEventsUrl
│   ├── schedule.api.ts      # (신규) 주기 자동 실행: getConfig/updateConfig/runNow/listRuns/preview + buildScheduleRunEventsUrl(token query SSE)
│   ├── settings-map.api.ts # 어드민 list/update/remove/getSecret + 공개 publicConfig (Routes.SettingsMap 단일 소스)
│   ├── ai.api.ts           # LLM provider×purpose 관리 + complete/completeBatch (ProviderKey = {id, purpose}) + previewModels (저장 전 키 미리보기)
│   ├── settlement.api.ts             # 정산 세션 CRUD + share 토큰 + update(전체 replace) + getShared(token)
│   ├── settlement-extraction.api.ts  # 영수증 upload(Blob→FormData) + extract(imageToken→items) + previewBlob(인증 GET)
│   ├── settlement-contact.api.ts     # /me/contacts 사용자별 단골 list/update/remove
│   └── settlement-draft.api.ts       # (신규) /api/v1/settlement-drafts — list / upsert(PUT, userId+placeId 매칭) / remove
├── hooks/
│   ├── useAuth.ts          # useCurrentUser, useLogin, useRegister, useLogout
│   ├── usePicks.ts         # 쿼리키 팩토리 + CRUD + useRandomPick
│   ├── useAdmin.ts
│   ├── useCrawl.ts         # useStartCrawl/useCrawlJobs/useCancelCrawl/useNaverSearch + useCrawlJobStream + useCatchtable*/useDiningcode* + DC bulk-save 잡 훅
│   ├── useRestaurant.ts    # 어드민 list(query={limit,offset,sort})/ranking/byPlaceId/delete/reanalyze + 공개 useRestaurantsPublic/useRestaurantPublic/useRestaurantPublicInsights/useRestaurantPublicCategoryTree + useRestaurantPublicReviews(tip/menu 필터) + canonical 기반 list summary SSE 구독 (delta-aware 합산 보호)
│   ├── useCanonical.ts     # candidates/merge/split/dismiss + proposals(list/run/accept/reject) + delete
│   ├── summarySseManager.ts# 프로세스 전역 SSE 싱글톤 (place + canonical 두 키 멀티플렉싱) + heartbeat watchdog + idle timeout (서버 다운 자동 감지) + snapshot delta-aware dispatch
│   ├── useMenuGrouping.ts  # ranking/group/status/createJob + useGroupingJob (자체 EventSource + 백오프)
│   ├── useAutoDiscover.ts  # useStartAutoDiscover / useAutoDiscoverJob / useCancelAutoDiscover (snapshot/keyword/candidate/phase/done SSE 머지)
│   ├── useAnalytics.ts     # overview/globalMenus/categoryTree + useStartGlobalMerge + useGlobalMergeJob (chunk 진행)
│   ├── useSchedule.ts       # (신규) useScheduleConfig/useScheduleRuns/useUpdateScheduleConfig/useRunScheduleNow/useSchedulePreview + useScheduleRunEvents (자체 EventSource, snapshot/progress/done, done 시 schedule+analytics invalidate)
│   ├── useSettingsMap.ts   # 어드민 providers/secret + 공개 useMapPublicConfig
│   ├── useAi.ts            # ProviderKey({id,purpose}) 기반 provider CRUD + complete/test/models + usePreviewModels(=useProviderModelsPreview, 저장 전 키로 모델 fetch)
│   ├── useUserLocation.ts  # geolocation 권한+위치 query (5s timeout, 60s maxAge) + { auto?: boolean } 옵션 (false 면 마운트 자동요청 스킵)
│   ├── useSettlement.ts           # useListSettlements / useSettlement / useCreateSettlement(fromDraftId 옵션) / useDeleteSettlement / useUpdateSettlement(전체 replace, setQueryData) / useCreateSettlementShare / useRevokeSettlementShare / useSharedSettlement
│   ├── useSettlementExtraction.ts # useUploadReceipt / useExtractReceipt (둘 다 useMutation)
│   ├── useSettlementContact.ts    # useSettlementContacts(검색어 키별) / useUpdateSettlementContact / useDeleteSettlementContact (삭제 시 settlement 캐시도 무효화)
│   └── useSettlementDraft.ts      # (신규) useListSettlementDrafts / useUpsertSettlementDraft / useDeleteSettlementDraft + useSettlementDraftHydrate(placeId) + useSettlementDraftAutoSync({placeId, placeNameHint, hydrated, initialDraftId, debounceMs=3000})
├── stores/
│   ├── authStore.ts                       # Zustand: user / token / isGuest
│   ├── activeCrawlJobStore.ts             # Zustand: jobs by jobId (멀티 슬롯)
│   ├── activeGroupingJobStore.ts          # Zustand + persist: jobId (단일 슬롯, localStorage)
│   ├── activeGlobalMergeJobStore.ts       # Zustand + persist: jobId (단일 슬롯, localStorage)
│   ├── activeDiningcodeBulkSaveJobStore.ts# Zustand + persist: jobId (단일 슬롯, localStorage)
│   ├── activeAutoDiscoverJobStore.ts      # Zustand + persist: jobId (단일 슬롯, localStorage)
│   └── settlementDraftStore.ts            # Zustand + persist (storage adapter 주입형 — 웹은 sessionStorage 자동, RN AsyncStorage 주입, SSR/test NO_OP). 마스터 participants + rounds[] N차 모델. v1→v4 migration.
├── design/ … (불변)
├── ui/ … (불변)
└── constants/ …
```

API 함수 모듈과 React Query 훅 모듈은 1:1 페어로 분리된다. 함수 모듈(`*.api.ts`)은
querystring 빌더와 `apiFetch` 호출만 담당하고, 훅 모듈(`use*.ts`)은 캐시 키·`enabled`·
`placeholderData`·`staleTime`·invalidate 정책 등 React Query 레이어를 책임진다. 어드민과
공개 함수는 같은 모듈에 공존하지만(`restaurant.api.ts`의 `list`/`publicList` 등) 컨슈머는
훅 이름으로 모드를 식별한다 — `useRestaurantList`(어드민) vs `useRestaurantsPublic`(공개).

**정산 도메인 FE 플러밍** ([settlement.api.ts](../../packages/shared/src/api/settlement.api.ts) +
[useSettlement.ts](../../packages/shared/src/hooks/useSettlement.ts) +
[settlement-extraction.api.ts](../../packages/shared/src/api/settlement-extraction.api.ts) +
[useSettlementExtraction.ts](../../packages/shared/src/hooks/useSettlementExtraction.ts) +
[settlement-contact.api.ts](../../packages/shared/src/api/settlement-contact.api.ts) +
[useSettlementContact.ts](../../packages/shared/src/hooks/useSettlementContact.ts) +
[settlement-draft.api.ts](../../packages/shared/src/api/settlement-draft.api.ts) +
[useSettlementDraft.ts](../../packages/shared/src/hooks/useSettlementDraft.ts) +
[settlementDraftStore.ts](../../packages/shared/src/stores/settlementDraftStore.ts)) —
영수증 분기/수동 입력 분기를 모두 같은 draft 스토어에 모아 다단계 wizard 를 굴리고, N차(2차/3차) 까지 누적해서 저장. 저장
완료 후엔 서버 세션 ID 로 결과 페이지 진입. 모듈은 네 갈래.

- `settlement.api.ts` / `useSettlement.ts` — 세션 CRUD + 저장 후 전체 replace +
  공유 토큰. **`useUpdateSettlement` (이전 `useUpdateSettlementParticipants` 에서 개명·확장)** —
  시그니처 `({ id, input: UpdateSettlementInputType })` 로 참여자뿐 아니라 차수 구성 / 차수별
  items / attendees 까지 한 번에 교체 (서버 트랜잭션 wipe + rebuild + 재계산 + editedAt 갱신).
  onSuccess 가 응답 세션을 detail 캐시 (`['settlement', 'one', id]`) 에 `setQueryData` 로 직접
  박는다 — 결과 페이지가 다시 fetch 하지 않아도 새 `shareAmount`/round 구성 즉시 반영. list
  만 invalidate. `useCreateSettlement` 의 입력 타입(`CreateSettlementInputType`)은 `fromDraftId?:
  string` 옵션 필드를 포함 — 자동저장된 draft 에서 출발한 저장이면 서버가 트랜잭션 안에서 그
  draft 도 함께 삭제(소유 mismatch / 없는 id 는 silent ignore). 호출자 페이지가 `useSettlementDraftAutoSync`
  가 알려준 `draftId` 를 그대로 input 에 실어 보낸다. 공유 토큰 mutation 은 캐시 무관 — 응답을
  UI 가 그대로 표시. `useSharedSettlement(token)` 은 별도 KEY `['settlement', 'shared', token]`
  로 격리해 소유자가 같은 세션을 보고 있어도 캐시 충돌 없음.
- `settlement-extraction.api.ts` / `useSettlementExtraction.ts` — 영수증 업로드/추출 +
  미리보기 blob. `upload(Blob)` 은 `FormData` 만들어 `apiFetch` 에 위임 — `apiFetch`
  분기가 `Content-Type` 을 안 붙이므로 브라우저가 multipart boundary 채움. `extract` 는
  imageToken + placeId → items[] + totalAmount + warning. **`previewBlob(token)` 은
  `apiFetch` 가 아닌 직접 `fetch`** — 응답이 binary 라 JSON 파싱하면 깨지고, `<img>`
  태그가 Authorization 헤더를 못 보내므로 `getApiConfig().getToken?.()` 로 토큰을 꺼내
  헤더 붙여 받고 caller 가 `URL.createObjectURL(blob)` 로 src 만든다.
- `settlement-contact.api.ts` / `useSettlementContact.ts` — `/me/contacts` 사용자별 단골.
  검색어/페이지 키별 캐시 (`['settlement-contact', 'list', q, take]`). **삭제 시
  `settlement` 캐시도 invalidate** — 단골 삭제로 정산 응답의 `participant.contactId` 가
  null 로 떨어지면 결과 페이지가 재요청할 때 자연 반영되도록.
- **`settlement-draft.api.ts` / `useSettlementDraft.ts` (신규)** — 정산 입력의 서버 임시저장(자동
  저장). API 함수: `list()` / `upsert(input: UpsertSettlementDraftInputType)` (PUT, 서버가
  userId + placeId 로 매칭 후 upsert — id 를 클라가 몰라도 호출 가능) / `remove(id)`. 훅:
  - `useListSettlementDrafts(enabled=true)` — `['settlement-draft', 'list']`, `staleTime: 30s`.
    `/me/settlements` 이력 페이지가 완료 정산 목록 위에 "이어 입력" 행으로 렌더.
  - `useUpsertSettlementDraft()` / `useDeleteSettlementDraft()` — mutation, 성공 시 list invalidate.
  - **`useSettlementDraftHydrate(placeId)`** — 진입 시 서버 list 를 받아 placeId 매치되는
    draft 가 있으면 `useSettlementDraftStore.setState` 로 store 의 `participants` / `rounds` 를
    overwrite. 반환 `{ hydrated, matched }` — `hydrated=true` 가 자동저장 활성 신호.
    **하나의 placeId(식당 컨텍스트)당 단 한 번만 hydrate** — `hydratedForRef` 가 마지막 hydrate
    placeId 를 기억해, 자동저장이 list 를 invalidate→refetch 해 `list.data` 가 새 참조로 와도
    같은 컨텍스트면 store 를 다시 덮지 않는다(저장 in-flight 중 사용자 입력을 옛 서버 스냅샷이
    밀어내는 레이스 + 저장마다 store 전역 리렌더 차단). placeId 변경 시 다시 hydrate 허용.
  - **`useSettlementDraftAutoSync({ placeId, placeNameHint, hydrated, initialDraftId, enabled=true,
    debounceMs=3000 })`** — 마운트 시점에 store 의 직렬화 baseline 을 잡고, `useSettlementDraftStore.subscribe`
    로 변경을 감지, debounce 후 `upsert.mutateAsync({ placeId, placeNameHint, payload: JSON.parse(...) })`.
    로그인(`useAuthStore.token`) + `hydrated` 일 때만 활성. 반환 `{ status, savedAt, draftId }` —
    `draftId` 는 정산 저장 시 `useCreateSettlement` 의 input 에 `fromDraftId` 로 그대로 넘김.
    `upsert` mutation 객체는 매 render 마다 새 참조라 effect 의존 배열에 넣지 않고 `upsertRef` 로 우회 —
    placeId/auth/hydrated 변경만 effect 재실행 트리거.
- `settlementDraftStore.ts` — **N차(rounds) 모델로 리팩토링.** state 모양:
  - `participants: DraftParticipant[]` — 세션 마스터 명단(이름/닉네임/contactId, exclude*\* 는 마스터
    default).
  - `rounds: DraftRound[]` — 각 round 는 자기 식당(`placeId`/`placeName`) · `source` · `items[]` ·
    영수증 정보(`receiptImageToken`/`receiptPreviewUrl`/`totalAmount`/`warning`) · 마스터 참여자 ×
    차수 `attendances: DraftAttendance[]` · 차수 할인(`discountAmount`/`discountCategory`) ·
    카테고리 잔여 보정(`categoryAdjustments`) 보유. `DraftAttendance` 는 `attended` + 세 개의
    nullable override(`excludeAlcoholOverride`/`excludeNonAlcoholOverride`/`excludeSideOverride`) —
    null 이면 마스터 default 그대로, true/false 면 이 차수에서만 덮어쓴다.
  - lifecycle: `startFor(placeId, placeName)` 가 같은 1차 식당이면 진행 중인 입력 보존(`placeName`
    만 refresh), 다른 식당이면 reset 후 1차 round prefill. **`startFromScratch()`** — `/me/settlements/new`
    의 placeless 진입용 — 기존 입력이 비어 있을 때만 reset, 진행 중이면 그대로 보존(이어 입력
    의도 존중). `reset()` 은 명시적 초기화.
  - 마스터 액션: `setParticipants` / `addParticipant`(returns clientId) / `addParticipantsAndCompact` /
    `updateParticipant` / `removeParticipant` — **모두 내부에서 `syncAttendances(rounds, participants)`
    를 호출**해 마스터 변동을 모든 round 의 attendances 에 자동 반영(사라진 사람의 attendance 제거 +
    새 사람의 default attendance 추가). UI 코드가 attendance 정합성 관리할 필요 없음.
  - 차수 액션: `addRound(placeId, placeName)`(returns clientId) / `removeRound` / `updateRoundMeta`
    (placeId/Name/source/totalAmount/warning) / `setRoundItems` / `addRoundItem`(returns clientId) /
    `updateRoundItem` / `removeRoundItem` / **`setRoundReceipt({ imageToken, previewUrl, items?,
    totalAmount?, warning? })`** (totalAmount/warning 은 **`?? null` 강제 폴백** — 영수증 교체 시
    이전 추출의 warning 이 남는 회귀 방지) / `setAttendance(roundCID, participantCID, attended)` /
    `setExcludeOverride(roundCID, participantCID, key, override|null)` / **`copyRoundAttendancesFrom
    (targetRoundCID, sourceRoundCID)`** ("2차도 1차와 같은 인원·옵션" 용 — attendances 만 복사,
    items/source/영수증 미변동) / `setRoundDiscount(roundCID, {amount, category}|null)` /
    `setCategoryAdjustment(roundCID, category, adjustment|null)` (null 이면 그 카테고리 보정 제거,
    전체가 비면 `categoryAdjustments: null` 로 압축).
  - persist: zustand `persist` middleware + `createJSONStorage(() => resolveStorage())`. 키
    `settlement-draft-v1`, version `4`. **storage adapter 주입형** — `setSettlementDraftStorage
    (storage)` 로 RN(AsyncStorage 등) 환경에서 어댑터 주입, 미주입 시 `window.sessionStorage`
    자동 선택, 둘 다 없으면 `NO_OP_STORAGE`(메모리만). 마이그레이션:
    - v1 → v2: 평면 draft(한 식당, 1 round) → rounds 배열. `placeId` 없는 옛 draft 는 의미
      없어 `emptyDraft()` 로 폐기.
    - v2 → v3: 각 round 에 `discountAmount` / `discountCategory` 필드 추가(null).
    - v3 → v4: 각 round 에 `categoryAdjustments` 필드 추가(null).
    `migrate(fromVersion >= 2)` 는 누락 필드만 채우는 idempotent 경로.
  - `addParticipantsAndCompact(items)` — 빈 행(이름·닉네임 둘 다 빈) 자동 정리 후 새 항목 append.
    단골 다중 선택 모달이 호출.

**페이징된 어드민 리스트 캐시 prefix 매칭** — `restaurantApi.list` 가
`{ limit, offset, sort }` 받는 페이징형으로 확장되면서 `useRestaurantList` 의 queryKey 가
`['restaurant', 'list', limit, offset, sort]` 처럼 가변. SSE summary patch 가 모든
페이지 캐시를 갱신해야 하므로 `patchSummaryInListCaches` 가 `setQueriesData
({ queryKey: ['restaurant', 'list'] }, ...)` 의 prefix 매칭으로 모든 페이지 인스턴스를
일괄 패치한다. `placeholderData: (prev) => prev` 로 페이지 전환 시 깜빡임 방지.

**AI provider × purpose 분리** — `aiApi.updateProvider/deleteProvider/testProvider/
listModels` 가 `(id, purpose)` 페어 `ProviderKey` 를 인자로 받는다. 같은 provider 를
chat(텍스트 추론) 과 image(비전 추출) 로 따로 등록 — 정산 영수증 추출이 vision 모델을
별도로 부르기 위함. `useUpdateProvider` 의 mutation 인자도 `{ key: ProviderKey,
input }`. env fallback 은 chat 에만 적용되고 image 는 DB row 필수 (서버 정책 — 위키
[friendly.md](friendly.md) 참고).

**캐노니컬 도메인** ([canonical.api.ts](../../packages/shared/src/api/canonical.api.ts) +
[useCanonical.ts](../../packages/shared/src/hooks/useCanonical.ts)) — 같은 가게의 Naver / DC
source 를 하나로 묶는 canonical 모델을 다룬다. 훅 셋: `useCanonicalCandidates`(모달 open 시만
fetch), `useMergeCanonical`, `useSplitCanonical`, `useDismissCanonicalSuggestion`,
`useCanonicalProposals`(30s `refetchInterval` 폴링, 15s `staleTime`), `useRunCanonicalProposals`,
`useAcceptCanonicalProposal`, `useRejectCanonicalProposal`, `useDeleteCanonical`. 모든 mutation
의 onSuccess 는 영향 받는 캐시(`['restaurant', 'list']` / `['canonical', 'candidates']` /
`['canonical', 'proposals']`)를 prefix 매치로 invalidate.

**다이닝코드 도메인** ([crawl.api.ts](../../packages/shared/src/api/crawl.api.ts) +
[useCrawl.ts](../../packages/shared/src/hooks/useCrawl.ts)) — 캐치테이블 + 다이닝코드 검증
페이지와 정식 등록 흐름을 모두 같은 `crawlApi` 안에서 처리. 함수: `catchtableSearch/Shop/Menus/
ReviewOverview`, `diningcodeSearch/Shop/ShopReviews/ShopSave`, `diningcodeRegistered`,
`diningcodeBulkSaveStart/Get/Cancel` + `buildDiningcodeBulkSaveEventsUrl`. 훅:
`useCatchtableSearch/Shop/Menus/ReviewOverview`, `useDiningcodeSearch/Shop/Reviews`,
`useSaveDiningcodeShop`, `useDiningcodeRegistered`, `useStartDiningcodeBulkSave`,
`useCancelDiningcodeBulkSave`, **`useDiningcodeBulkSaveJob`**.

**`useDiningcodeBulkSaveJob(jobId)` 동작** — `useGroupingJob` 패턴을 그대로 답습.
1. `useQuery(['crawl', 'diningcode-bulk-save', jobId])` 가 GET snapshot — 404 면 `activeStore.clear()`
   호출 후 `null` 반환 (잡이 서버에서 만료 시 stale jobId 가 store 에 남지 않게).
2. `useEffect` 안에서 `buildDiningcodeBulkSaveEventsUrl(jobId)` 로 토큰 주입된 URL 만든 뒤
   `new EventSource(url)`. 세 이벤트 `addEventListener`:
   - `'snapshot'` — `qc.setQueryData` 로 전체 교체, `retryRef = 0`.
   - `'item'` — 매칭 vRid 행 머지 + `doneCount/failedCount/skippedCount` 재계산.
   - `'done'` — state·finishedAt 갱신 후 `closedRef = true; es.close()` + 세 캐시
     (`['crawl', 'diningcode-registered']`, `['restaurant', 'list']`, `['canonical', 'proposals']`)
     invalidate.
3. `onerror` 시 백오프 `Math.min(30_000, 1000 * 2 ** retryRef.current)` (1s → 2s → 4s → 8s →
   16s → 30s cap) 으로 재연결. `closedRef` true 면 모든 reconnect 차단.
4. cleanup 에서 `cancelled = true` + `closedRef = true` + 백오프 타이머 clear + ES close.

**자동 발견 도메인** ([autoDiscover.api.ts](../../packages/shared/src/api/autoDiscover.api.ts) +
[useAutoDiscover.ts](../../packages/shared/src/hooks/useAutoDiscover.ts) +
[activeAutoDiscoverJobStore.ts](../../packages/shared/src/stores/activeAutoDiscoverJobStore.ts)) —
키워드/그룹 단위로 새 가게를 자동으로 찾아 등록하는 잡. DC bulk-save 와 동형 (start/get/cancel +
SSE URL 빌더 + persist 단일 슬롯 store). 훅 셋: `useStartAutoDiscover`, `useCancelAutoDiscover`,
`useAutoDiscoverJob(jobId)`. SSE 이벤트는 5종(snapshot/keyword/candidate/phase/done) —
candidate 이벤트마다 클라이언트가 자체로 `candidates.filter((c) => c.state === 'done').length`
로 `newlyRegistered` 도 재계산 (phase 이벤트가 늦게 와도 UI 가 즉시 갱신되도록). 백오프
동일 (`1s → 2s → 4s → 8s → 16s → 30s cap`). 404 → `activeStore.clear()`.

**주기 자동 실행 도메인** ([schedule.api.ts](../../packages/shared/src/api/schedule.api.ts) +
[useSchedule.ts](../../packages/shared/src/hooks/useSchedule.ts)) — 어드민이 cron 식으로 전역
머지 등을 주기 자동 실행하도록 설정/실행/이력/live 진행을 다루는 FE 플러밍. 도메인 자체 동작은
[schedule](schedule.md) 가 다루고 여기는 HTTP 함수 + React Query 훅만 정리. 함수: `getConfig`/
`updateConfig`(PUT)/`runNow`(POST — 진행 중이면 서버가 `skipped` run 을 돌려줌)/`listRuns`/
`preview({ cronExpr, timezone })`(저장 전 cron 검증 + 다음 실행시각) + `buildScheduleRunEventsUrl()`
(token query SSE URL). 훅: `useScheduleConfig`/`useScheduleRuns`(useQuery), `useUpdateScheduleConfig`
(성공 시 `['schedule','config']` 에 `setQueryData` 직접 박기 — 별도 refetch 없이 즉시 반영),
`useRunScheduleNow`(성공 시 runs+config invalidate), `useSchedulePreview(cronExpr, timezone, enabled)`
(queryKey 에 cronExpr/timezone 포함, `enabled && cronExpr.trim().length > 0`, 입력 디바운스는
caller 책임). **`useScheduleRunEvents(enabled)`** 는 잡 단위 SSE 훅(global-merge 동형) — 매니저를
거치지 않고 훅 안에서 직접 `EventSource` 라이프사이클을 들고 `1s → 30s cap` 백오프 + `closedRef`/
`cancelled`/`reconnectId` 정리. 3 이벤트: `'snapshot'`(`status === 'running'` 이면 snapshot 을
`ScheduleProgressEventType` 모양으로 정규화해 첫 진행 표시), `'progress'`(그대로 setState), `'done'`
(es.close + `['schedule','runs']`+`['schedule','config']`+`['analytics']` invalidate — 머지 결과가
overview/통계에 반영되도록). `enabled=false` 면 `progress` 를 null 로 리셋하고 연결 안 함. 반환은
`{ progress }` 단일 필드. [stream-driven-cache-merge](../concepts/stream-driven-cache-merge.md) 의
새 인스턴스로, snapshot/progress 가 캐시가 아닌 로컬 state 로 흐르고 done 에서만 캐시를 무효화한다.

**SSE 매니저 확장** — `summarySseManager` 가 이전엔 placeId 단일 키였는데 이번에 `SubscriptionKey`
를 union `{ kind: 'place'; placeId } | { kind: 'canonical'; canonicalId }` 로 확장. 서버는
두 종류 키를 한 connection 에서 받아 각 이벤트마다 canonicalId / placeId 양쪽 태그를 흘려보내고,
매니저는 들어온 이벤트를 양쪽 구독자 set 에 dispatch. `lastSnapshotByCanonical` 과
`lastSnapshotByPlace` 두 Map 으로 키 종류별 replay 캐시 분리.

**SSE 매니저 heartbeat + idle timeout (서버 다운 자동 감지)** — 매니저가 두 단계로 죽음을 감지.
서버 5초 주기 `'heartbeat'` 명명 이벤트 + 클라 3초 주기 watchdog (`Date.now() - lastEventAt >
15s` 면 강제 `handleConnectionLost`) + backoff 1.5s→60s cap. `onerror` 도 같은 경로로 수렴.

**SSE snapshot delta-aware dispatch** — snapshot 핸들러 시그니처가 `(snap, prev)` — 같은
canonical 의 두 source 가 공유하는 공개 list 캐시 합산 행을 한쪽 source snapshot 으로 통째로
덮어쓰지 않도록 `(snap - prev)` delta 만 가감 ([useRestaurant.ts](../../packages/shared/src/hooks/useRestaurant.ts)
의 `patchSummaryInListCaches` 가 로직 담당, 첫 catch-up 은 prev=null → delta 0).

`apiFetch`의 자동 토큰 첨부는 모드를 구분하지 않는다 — 토큰이 있으면 모든 요청에
`Authorization: Bearer <token>`이 붙고, 없으면 헤더 없이 나간다. 공개 라우트는 토큰이
있어도 그대로 통과(서버가 무시), 없어도 그대로 통과. 공유 read-only 라우트 (`/api/v1/share/
settlements/:token`) 도 동일 — 비로그인도 호출 가능. **FormData body 분기** — `init.body
instanceof FormData` 면 `Content-Type` 헤더를 안 붙임. 영수증 업로드처럼 multipart boundary
는 브라우저가 자동으로 헤더에 채워야 하기 때문. `onUnauthorized` 콜백은 401 응답 때만 발동.

훅 레이어는 `useQueryClient`로 TanStack Query 캐시를 직접 패치하는 패턴을 광범위하게 쓴다.
정산 도메인에선 `useUpdateSettlementParticipants` 가 응답 세션을 `setQueryData
([...KEY, 'one', id], updated)` 로 직접 박아서 결과 페이지가 재요청 없이 갱신.
SSE 도메인에선 list/detail 캐시 inline merge. `summarySseManager`는 React 바깥의 모듈
싱글톤이라 어떤 컴포넌트가 mount/unmount되든 동일한 단일 EventSource를 공유한다.

반면 **잡 단위 SSE 훅**(`useGroupingJob`, `useGlobalMergeJob`, `useDiningcodeBulkSaveJob`,
`useAutoDiscoverJob`)은 매니저를 거치지 않고 훅 인스턴스 안에서 직접 `EventSource`
라이프사이클을 들고 있다. 잡 하나당 한 페이지에서 하나만 띄우는 일회성 흐름이라 멀티플렉싱이
필요 없고, `closedRef`/`retryRef`로 재연결과 종단 처리만 깔끔하게 다루면 충분.

각 UI 컴포넌트는 `*.types.ts`로 props 계약을 단일 소스로 두고, 플랫폼 번들러가
파일 확장자 해석으로 구현체를 골라간다 (Vite/Webpack은 `.web.tsx`, Metro는
`.native.tsx`). `tsconfig.json`은 `@repo/config/tsconfig/react.json`을 상속.

## 3. Talks To [coverage: high — 8 sources]

- 의존성: `@repo/api-contract` (zod 스키마/타입/`Routes` 상수 + `recomputeCanonicalAggregates` 유틸 + **정산/단골/추출 타입**), `@repo/utils`,
  `@tanstack/react-query`, `zustand` + `zustand/middleware` (persist).
- peerDependencies: `react >=18.0.0`, `react-native >=0.76.0` (옵셔널).
- 컨슈머:
  - `apps/web` — 어드민 콘솔(맛집/메뉴/분석/AI/지도 설정 + 발견 페이지 + 다이닝코드 검증/정식 페이지 + 캐치테이블 검증 페이지), 공개 맛집 페이지, 로그인, **정산하기 진입/입력/결과/공유/단골 관리 페이지**.
  - `apps/mobile` — 어드민 게이트.
- 외부:
  - `apiFetch`로 [friendly](friendly.md) API에 HTTP. `FormData` 본문이면 Content-Type 자동 미설정 (영수증 업로드 호환).
  - `useCrawlJobStream` → `Routes.Crawl.jobEvents` EventSource.
  - `useDiningcodeBulkSaveJob` → `Routes.Crawl.diningcodeBulkSaveJobEvents(jobId)` EventSource (token query 인증).
  - `useAutoDiscoverJob` → `Routes.AutoDiscover.jobEvents(jobId)` EventSource (token query 인증).
  - `summarySseManager` → `Routes.Restaurant.summaryEvents` 단일 EventSource. placeId / canonicalId 두 키 종류 멀티플렉싱.
  - `useGroupingJob` → `Routes.Analytics.groupingJobEvents(jobId)`, `useGlobalMergeJob` → `Routes.Analytics.globalMergeJobEvents(jobId)`.
  - **`useScheduleRunEvents` → `Routes.Schedule.runEvents` EventSource** (token query 인증). `scheduleApi` → `Routes.Schedule.{config,run,runs,preview}`.
  - `canonicalApi` → friendly의 `Routes.Canonical.*`.
  - **`settlementApi` → `/api/v1/settlements/*` + `/api/v1/share/settlements/:token` (공개)**.
  - **`settlementExtractionApi` → `/api/v1/settlement-extraction/upload|extract|preview/:token`** (preview 만 직접 fetch + Authorization 헤더).
  - **`settlementContactApi` → `/api/v1/me/contacts/*`** (인증 필수).
  - **`settlementDraftApi` → `/api/v1/settlement-drafts/*`** (인증 필수, upsert PUT, 서버가 userId+placeId 로 매칭).
- UI 측 사용처는 [web](web.md), 정산 도메인 자체는 [settlement](settlement.md), 주기 실행 도메인은 [schedule](schedule.md).

## 4. API Surface [coverage: high — 35 sources]

**API 클라이언트 (`api/`)**
- `configureApi(cfg)`, `getApiConfig()`, `apiFetch<T>(path, init)`, `ApiError`. `FormData` body 면 Content-Type 자동 스킵.
- `authApi`: `register`, `login`, `me`, `logout`
- `picksApi`: `list`, `getById`, `create`, `update`, `remove`, `random`
- `adminApi`: `listUsers`, `setRole`
- `crawlApi`:
  - 네이버: `start`, `list`, `cancel`, `search({ q, bbox? })` + `buildJobEventsUrl(jobId)`
  - 캐치테이블: `catchtableSearch`, `catchtableShop(shopRef)`, `catchtableShopMenus(shopRef)`, `catchtableShopReviewOverview(shopRef)`
  - 다이닝코드: `diningcodeSearch`, `diningcodeShop(vRid)`, `diningcodeShopReviews(vRid, page)`, `diningcodeShopSave(vRid)`, `diningcodeRegistered(vRids[])`
  - DC 일괄 저장 잡: `diningcodeBulkSaveStart(input)`, `diningcodeBulkSaveGet(jobId)`, `diningcodeBulkSaveCancel(jobId)` + `buildDiningcodeBulkSaveEventsUrl(jobId)`
- `restaurantApi`:
  - 어드민: **`list(query: Partial<RestaurantListQueryType>)` (limit/offset/sort, 시그니처 변경)**, `ranking(query?)`, `getByPlaceId(placeId)`, `getSummaryStatus(placeId)`, `delete(placeId)`, `reanalyze(placeId)`, `cancelSummary(placeId)`, `resumeSummary(placeId)`, `crawlLogs({ placeId, cursor? })`
  - 공개: `publicList(query?)`, `publicByPlaceId(placeId)`, `publicInsights(placeId)`, **`publicCategoryTree(placeId)` (신규 — `RestaurantCategoryTreeResultType`, 전역 머지 닿은 식당만 roots 채워짐)**, `publicReviews({ placeId, sentiment, sort, cursor?, **tip?, menu?** })` (tip/menu 필터 추가)
  - SSE URL: `buildSummaryEventsUrl({ placeIds?, canonicalIds? })`
- `canonicalApi`: `candidates(canonicalId)`, `merge(input)`, `split(canonicalId, input)`, `dismissSuggestion(canonicalId)`, `listProposals()`, `runProposals()`, `acceptProposal(proposalId, input)`, `rejectProposal(proposalId)`, `delete(canonicalId)`.
- `menuGroupingApi`: `groupForRestaurant(placeId)`, `getRanking(placeId, query?)`, `getRestaurantsStatus()`, `createGroupingJob({ placeIds })`, `getGroupingJob(jobId)` + `buildGroupingJobEventsUrl(jobId)`
- `autoDiscoverApi`: `start(input)`, `get(jobId)`, `cancel(jobId)` + `buildAutoDiscoverEventsUrl(jobId)`
- `analyticsApi`: `overview()`, `globalMenus(query?)`, `categoryTree()`, `startGlobalMerge({ full })`, `getGlobalMergeJob(jobId)` + `buildGlobalMergeJobEventsUrl(jobId)`
- **`scheduleApi` (신규)**: `getConfig()`, `updateConfig(input: ScheduleConfigInputType)` (PUT), `runNow()` (POST — 진행 중이면 `skipped` run 반환), `listRuns(): ScheduleRunListType`, `preview(input: SchedulePreviewInputType): SchedulePreviewResultType` + `buildScheduleRunEventsUrl(): Promise<string>` (token query SSE URL).
- `settingsMapApi`: 어드민 `list/update/remove/getSecret` + 공개 `publicConfig`
- `aiApi`: **`ProviderKey = { id: LlmProviderIdType; purpose: LlmProviderPurposeType }`** 기반. `complete`, `completeBatch`, `listProviders`, `updateProvider(key, input)`, `deleteProvider(key)`, `testProvider(key, model?)`, `listModels(key)`, **`previewModels(key, input: PreviewLlmModelsInputType)` (신규 — 저장 전에 폼의 API 키로 모델 fetch, `ok=false` 분기로 에러 노출)** — URL 모양 `/providers/:id/:purpose[/models|/models/preview|/test]`.
- `settlementApi`: `create(input: CreateSettlementInputType)` (**input 에 `fromDraftId?: string` 옵션 필드** — 임시저장 draft 에서 출발한 저장 시 서버 트랜잭션이 그 draft 도 함께 삭제, mismatch 면 silent ignore), `list(query?)`, `get(id)`, `remove(id)`, **`update(id, input: UpdateSettlementInputType)` (전체 replace — 참여자/차수/items/attendees 모두 교체)**, **`createShare(id, ttl='7d', ogImage?, ogImageUrl?)`** (멱등 — 같은 세션 여러 번 호출 시 동일 토큰, ttl 로 만료 갱신; **`ogImage?: ShareOgImageType('restaurant'|'table')`** 미리보기 소스 토글 — 생략 시 서버가 기존 선택 유지; **`ogImageUrl?: string|null`** 트라이스테이트 — 생략→유지 / null→해제(랜덤) / URL→갤러리 사진 고정, `undefined` 일 때만 body 에서 키 제외; 응답 `SettlementShareType` 에 `ogImage`/`ogImageUrl`/**`ogImageCandidates: string[]`** 포함), `revokeShare(id)`, `getShared(token)` (공개 read-only, 비로그인 가능).
- `settlementExtractionApi`: `upload(file: Blob)` (FormData with field name `'file'`), `extract(input)`, **`previewBlob(token): Promise<Blob>`** (apiFetch 미사용 — 직접 `fetch` + `getApiConfig().getToken?.()` 헤더 부착 후 `res.blob()` 반환; binary 라 JSON 파싱 우회).
- `settlementContactApi`: `list(query? = { take: 50 })` (검색어 q 옵션), `update(id, input)`, `remove(id)`.
- **`settlementDraftApi` (신규)**: `list(): Promise<ListSettlementDraftsResultType>`, `upsert(input: UpsertSettlementDraftInputType): Promise<SettlementDraftType>` (PUT — 서버가 userId+placeId 로 매칭 후 upsert, id 모르고도 호출 가능), `remove(id): Promise<void>`.

**React Query 훅 (`hooks/`)**
- 인증: `useCurrentUser`, `useLogin`, `useRegister`, `useLogout`
- 픽: `usePicks`, `usePick`, `useCreatePick`, `useUpdatePick`, `useDeletePick`, `useRandomPick`
- 어드민: `useAdminUsers`, `useSetUserRole`
- 크롤 네이버: `useStartCrawl`, `useCrawlJobs`, `useCancelCrawl`, `useCrawlJobStream`, `useNaverSearch(q, bbox)`, `useCrawlJobLogs(jobId)`
- 크롤 캐치테이블: `useCatchtableSearch`, `useCatchtableShop`, `useCatchtableShopMenus`, `useCatchtableShopReviewOverview`
- 크롤 다이닝코드: `useDiningcodeSearch`, `useDiningcodeShop`, `useDiningcodeShopReviews`, `useSaveDiningcodeShop`, `useDiningcodeRegistered`
- DC 일괄 저장 잡: `useStartDiningcodeBulkSave`, `useCancelDiningcodeBulkSave`, `useDiningcodeBulkSaveJob`
- 맛집 어드민: **`useRestaurantList(query?: { limit?, offset?, sort? })` (queryKey `['restaurant', 'list', limit, offset, sort]` + `placeholderData: (prev) => prev`)**, `useRestaurantRanking`, `useRestaurantByPlaceId`, `useDeleteRestaurant`, `useReanalyzeRestaurant`, `useCancelSummary`, `useResumeSummary`, `useRestaurantCrawlLogs(placeId)` (infiniteQuery), `useRestaurantSummaryEvents(placeId, { onLog? })`, `useRestaurantListSummaryEvents(canonicalIds[])`, `useRestaurantListSummaryEventsByPlaceIds(placeIds[])`
- 맛집 공개: `useRestaurantsPublic`, `useRestaurantPublic`, `useRestaurantPublicInsights`, **`useRestaurantPublicCategoryTree(placeId)` (신규 — `['restaurant','public','category-tree',placeId]`, staleTime 60s)**, `useRestaurantPublicReviews(filters, seed?)` (infiniteQuery, detail seed — **filters 에 `tip?`/`menu?` 추가, queryKey 에 `tip ?? null`/`menu ?? null` 포함, tip/menu 있으면 seed 무효**)
- 캐노니컬: `useCanonicalCandidates`, `useMergeCanonical`, `useSplitCanonical`, `useDismissCanonicalSuggestion`, `useCanonicalProposals` (refetchInterval 30s), `useRunCanonicalProposals`, `useAcceptCanonicalProposal`, `useRejectCanonicalProposal`, `useDeleteCanonical`
- 메뉴 그룹핑: `useMenuRanking`, `useGroupForRestaurant`, `useGroupingRestaurantsStatus`, `useCreateGroupingJob`, `useGroupingJob`
- 자동 발견: `useStartAutoDiscover`, `useCancelAutoDiscover`, `useAutoDiscoverJob`
- 분석: `useAnalyticsOverview`, `useGlobalMenus`, `useCategoryTree`, `useStartGlobalMerge`, `useGlobalMergeJob`
- **주기 자동 실행 (신규)**: `useScheduleConfig()` (`['schedule','config']`), `useScheduleRuns()` (`['schedule','runs']`), `useUpdateScheduleConfig()` (성공 시 config 에 `setQueryData` 직접 박기), `useRunScheduleNow()` (성공 시 runs+config invalidate), `useSchedulePreview(cronExpr, timezone, enabled)` (`['schedule','preview',cronExpr,timezone]`, `enabled && cronExpr.trim().length>0`), **`useScheduleRunEvents(enabled): { progress }`** (자체 EventSource — snapshot/progress/done, done 시 schedule+analytics invalidate, 1s→30s 백오프)
- 지도: `useMapProviders`, `useUpdateMapProvider`, `useDeleteMapProvider`, `useMapProviderSecret`, `useMapPublicConfig`, **`useUserLocation(options? = { auto?: boolean })`** (auto=false 면 마운트 자동요청 스킵, refetch 로만 시작)
- AI: `useCompleteAi`, `useCompleteBatchAi`, `useProviders`, `useUpdateProvider({ key, input })`, `useDeleteProvider(key)`, `useTestProvider({ key, model? })`, `useProviderModels(key, enabled?)`, **`usePreviewModels()` (a.k.a. `useProviderModelsPreview`) — mutation, `({ key, input }) => aiApi.previewModels(...)`, AdminAiKeysPage 저장 전 모델 미리보기**
- 정산 세션:
  - `useListSettlements(query? = { offset: 0, limit: 20 })` — queryKey `['settlement', 'list', placeId ?? null, offset, limit]`. `placeId` 필터 지원해 특정 1차 식당의 이력만 추출 가능.
  - `useSettlement(id: string | null)` — `enabled: !!id`, key `['settlement', 'one', id]`
  - `useCreateSettlement()` — mutation, **입력 타입에 `fromDraftId?` 포함 — 자동저장 draft 와 트랜잭션 함께 삭제 트리거**. onSuccess 시 `['settlement']` invalidate.
  - `useDeleteSettlement()` — mutation, 같은 invalidate
  - **`useUpdateSettlement()` (이전 `useUpdateSettlementParticipants` 에서 개명·확장)** — mutation, 입력 `({ id, input: UpdateSettlementInputType })` 로 참여자뿐 아니라 차수 구성/items/attendees 까지 한 번에 replace. onSuccess 시 응답 세션을 `setQueryData(['settlement', 'one', updated.id], updated)` 로 detail 직접 박고 list 만 invalidate.
  - **`useCreateSettlementShare()`** — mutation, 인자 `{ id, ttl?, ogImage?, ogImageUrl? }` → `settlementApi.createShare(id, ttl, ogImage, ogImageUrl)`. 응답(`token`/`shareUrl`/`expiresAt`/`ogImage`/`ogImageUrl`/`ogImageCandidates`)을 공유 다이얼로그가 그대로 표시 — 캐시 손대지 않음. 다이얼로그가 OG 토글·갤러리 선택을 인자로 실어 보냄.
  - `useRevokeSettlementShare()` — mutation
  - `useSharedSettlement(token: string | null)` — `enabled: !!token`, 별도 key `['settlement', 'shared', token]`
- 정산 추출:
  - `useUploadReceipt()` — mutation, `Blob | File` 받아 imageToken/previewUrl/byteSize 반환
  - `useExtractReceipt()` — mutation, imageToken + placeId → items/totalAmount/warning
- 정산 단골:
  - `useSettlementContacts(query? = { take: 50 })` — queryKey `['settlement-contact', 'list', q, take]`
  - `useUpdateSettlementContact()` — onSuccess 시 `['settlement-contact']` invalidate
  - `useDeleteSettlementContact()` — onSuccess 시 `['settlement-contact']` + **`['settlement']` 동시 invalidate** (정산 응답의 participant.contactId null fall-through 반영)
- **정산 임시저장 (신규)**:
  - `useListSettlementDrafts(enabled = true)` — queryKey `['settlement-draft', 'list']`, `staleTime: 30_000` (다른 기기에서 편집 중인 경우 대비 짧게).
  - `useUpsertSettlementDraft()` — mutation, onSuccess 시 `['settlement-draft', 'list']` invalidate
  - `useDeleteSettlementDraft()` — mutation, 같은 invalidate
  - **`useSettlementDraftHydrate(placeId: string | null): { hydrated: boolean; matched: SettlementDraftType | null }`** — list fetch, placeId 매치되는 draft 가 있으면 `useSettlementDraftStore.setState` 로 store 의 `participants` / `rounds` overwrite. **`hydratedForRef` 로 placeId당 1회만 hydrate** — list invalidate→refetch 로 `list.data` 가 새 참조여도 같은 placeId 면 재overwrite 안 함(자동저장 in-flight 입력 보호). 비로그인이거나 list 가 실패하면 즉시 `hydrated = true` 로 진행(sessionStorage-only 모드).
  - **`useSettlementDraftAutoSync({ placeId, placeNameHint, hydrated, initialDraftId?, enabled?, debounceMs = 3000 }): { status, savedAt, draftId }`** — store subscribe + debounce 후 upsert. 마운트 시점 baseline 을 잡아 실 편집 있을 때만 저장. 로그인(`useAuthStore.token`) + `hydrated` 일 때만 활성, 아니면 `status: 'disabled'`. 반환 `draftId` 는 `useCreateSettlement` 의 `fromDraftId` 로 그대로 사용.

**SSE 매니저 (`hooks/summarySseManager.ts`)** — 변경 없음. `subscribe(key, { onSnapshot(snap, prev), onReview, onLog? })`, place/canonical 키 union, heartbeat 5s, idle 15s, backoff 1.5s→60s.

**잡 단위 SSE 훅** — **`useScheduleRunEvents` 추가로 다섯 훅.** `useGroupingJob` / `useGlobalMergeJob` / `useDiningcodeBulkSaveJob` / `useAutoDiscoverJob` / **`useScheduleRunEvents`** 모두 매니저를 거치지 않고 훅 안에서 직접 `EventSource` 라이프사이클(closed/cancelled + 백오프 + cleanup)을 든다. 백오프 `1s → 30s cap` 공통. `useScheduleRunEvents` 는 jobId 가 없고 `enabled` 플래그로만 연결 토글(서버가 "현재 진행 중 run" 하나를 스트림) — 진행값은 캐시가 아닌 로컬 `{ progress }` state, done 에서만 schedule+analytics 캐시 invalidate.

**Zustand 스토어 (`stores/`)**
- `useAuthStore`: `user`, `token`, `isGuest` + `setSession`, `setUser`, `enterGuest`, `clearSession`
- `useActiveCrawlJobStore`: `jobs: Record<jobId, ActiveCrawlJob>` (멀티 슬롯, persist 없음)
- `useActiveGroupingJobStore`: `jobId | null` + `setJobId`, `clear` — `lp:activeGroupingJob` localStorage persist
- `useActiveGlobalMergeJobStore`: `lp:activeGlobalMergeJob` localStorage persist
- `useActiveDiningcodeBulkSaveJobStore`: `lp:activeDiningcodeBulkSaveJob` localStorage persist
- `useActiveAutoDiscoverJobStore`: `lp:activeAutoDiscoverJob` localStorage persist
- `useSettlementDraftStore`: **N차(rounds) 모델** — `{ participants: DraftParticipant[]; rounds: DraftRound[] }` + 액션:
  - lifecycle — `startFor(placeId, placeName)` / `startFromScratch()` / `reset()`
  - 마스터 참여자 — `setParticipants` / `addParticipant` (returns clientId) / `addParticipantsAndCompact` (빈 행 compaction + 다중 append) / `updateParticipant` / `removeParticipant` — 모두 내부에서 `syncAttendances` 호출해 모든 round 의 attendances 자동 정합화
  - 차수 — `addRound` (returns clientId) / `removeRound` / `updateRoundMeta` (placeId/Name/source/totalAmount/warning) / `setRoundItems` / `addRoundItem` (returns clientId) / `updateRoundItem` / `removeRoundItem` / **`setRoundReceipt({ imageToken, previewUrl, items?, totalAmount?, warning? })` — totalAmount/warning 은 `?? null` 강제 폴백** / `setAttendance` / `setExcludeOverride` (override === null 이면 마스터 default 로 복귀) / **`copyRoundAttendancesFrom(targetRoundCID, sourceRoundCID)`** (attendances 만 복사) / `setRoundDiscount` / `setCategoryAdjustment`
  - persist key `settlement-draft-v1`, version `4` (v1→v2→v3→v4 마이그레이션 체인). storage 는 **`setSettlementDraftStorage(adapter)` 주입형** — 미주입 시 `window.sessionStorage` 자동, 둘 다 없으면 `NO_OP_STORAGE` (SSR/test 안전).
  - 노출 타입: `SettlementDraft` / `DraftParticipant` / `DraftItem` / `DraftRound` / `DraftAttendance` / `DraftCategoryAdjustment` / `DraftCategoryAdjustments` / `ExcludeKey`.

**UI / 디자인 / 상수** — UI 8 컴포넌트·상수 불변. **`design/tokens.ts` 다크 모드 토큰 가독성 개선** —
`palette.zinc400(#a1a1aa)` 추가, `darkColors.textMuted` `zinc500→zinc400`(AA 4.5:1 회복), `darkColors.border`
`rgba(255,255,255,0.1)→0.14`, `lightColors.bg` `zinc50→white`. 토큰만 `@repo/shared` 가 공유하고 테마
선택의 영속화는 플랫폼별(웹 localStorage / 앱 AsyncStorage) — Key Decisions 참고. (`palette/lightColors/
darkColors/space/radius/typography/duration`, `APP_NAME` / `QUERY_STALE_TIME` / `QUERY_GC_TIME` 노출 모양 불변.)

## 5. Data [coverage: high — 16 sources]

**Auth 상태 모양** (`stores/authStore.ts`)
```ts
interface AuthState {
  user: User | null;
  token: string | null;
  isGuest: boolean;
}
```

**Active crawl job 상태** — 기존 동일. 멀티 슬롯 `jobs: Record<jobId, ActiveCrawlJob>`.

**Active 잡 단일 슬롯 스토어 (4종)** — 모양 동일 (`jobId | null` + `setJobId` + `clear`),
키만 `lp:activeGroupingJob` / `lp:activeGlobalMergeJob` / `lp:activeDiningcodeBulkSaveJob` /
`lp:activeAutoDiscoverJob`. 자동 정리는 훅 책임 — GET snapshot 404 → `clear()`.

**Settlement draft 상태 (N차 모델)** (`stores/settlementDraftStore.ts`)
```ts
interface SettlementDraft {
  participants: DraftParticipant[];   // 세션 마스터 명단 (이름·닉네임·contactId·exclude* 마스터 default)
  rounds: DraftRound[];               // 차수 배열 (1차, 2차, …)
}

interface DraftRound {
  clientId: string;
  placeId: string;
  placeName: string;
  source: 'RECEIPT' | 'MANUAL' | null;
  items: DraftItem[];                              // name/unitPrice/quantity/amount/category/matchedMenuName/clientId
  receiptImageToken: string | null;
  receiptPreviewUrl: string | null;
  totalAmount: number | null;
  warning: string | null;
  attendances: DraftAttendance[];                  // 마스터 participants 와 1:1 (syncAttendances 가 유지)
  discountAmount: number | null;                   // v3 도입
  discountCategory: ReceiptItemCategoryType | null;
  categoryAdjustments: DraftCategoryAdjustments | null;  // v4 도입 — 카테고리별 잔여 처리 규칙
}

interface DraftAttendance {
  participantClientId: string;
  attended: boolean;
  // null = 마스터 default 그대로. true/false = 이 차수에서만 override.
  excludeAlcoholOverride: boolean | null;
  excludeNonAlcoholOverride: boolean | null;
  excludeSideOverride: boolean | null;
}

interface DraftCategoryAdjustment {
  leftoverParticipantClientId: string;   // 잔여를 떠안을 마스터 참여자
  roundUnit: number | null;              // 반올림 단위 (null = 보정 없음)
}
type DraftCategoryAdjustments = Partial<Record<ReceiptItemCategoryType, DraftCategoryAdjustment | null>>;
```

- **Storage adapter 주입** — `setSettlementDraftStorage(storage: StateStorage)` 로 RN 등에서
  AsyncStorage 어댑터 주입. 미주입 시 `window.sessionStorage` 자동 선택, 둘 다 없으면(SSR/test)
  `NO_OP_STORAGE`(get/set/remove 모두 noop) 로 fallback — persist 가 메모리만 쓰는 효과.
  resolver 는 첫 read/write 시점에 평가되므로 앱 entry 가 zustand 첫 hydrate 이전에 한 번만
  호출하면 됨.
- 키 `settlement-draft-v1`. **persist version `4`** — v1 → v2(rounds 도입) → v3(차수 할인) →
  v4(카테고리 잔여 보정). `migrate(fromVersion)`:
  - v2 이상 → 최신: rounds 각 항목에 누락 필드(`discountAmount`/`discountCategory`/`categoryAdjustments`)
    null fill (idempotent).
  - v1 → v4: 평면 draft 의 `placeId`/`items`/`receipt*`/`totalAmount`/`warning` 을 1차 round
    1개로 옮기고 `participants` 는 그대로, 모든 attendance 는 default(`attended=true`, override
    모두 null). `placeId` 가 없는 옛 draft 는 `emptyDraft()` 로 폐기(1차 식당 모르면 의미 없음).
    옛 draft 는 `placeName` 을 안 가졌으므로 store 의 `placeName` 은 빈 문자열 — UI 가 `startFor`
    호출 시점에 최신 식당명으로 채움.
- `clientId` 는 store 가 부여 (`crypto.randomUUID` 우선, 폴백 `c-<ts>-<rnd>`). 저장 시 서버가
  새 id 부여.
- `setRoundReceipt({ ... totalAmount?, warning? })` — `?? null` 강제 폴백 (Key Decisions / Gotchas 참고).
- `syncAttendances(rounds, participants)` — 마스터 참여자 mutator 가 호출하는 정합화 헬퍼.
  모든 round 의 `attendances` 를 마스터 명단에 맞춰 재배열(사라진 사람 제거, 새 사람 default
  attendance 추가, 기존 사람의 값은 보존).

**토큰 저장**은 `@repo/shared` 책임 아님. 각 앱이 `configureApi({ baseUrl, getToken, onUnauthorized })`로 게터/콜백 주입.

**클라이언트 캐시** — TanStack Query 가 전적으로 관리.
- 픽: `['picks', 'list']` / `['picks', 'detail', id]`
- 크롤 네이버 / 캐치테이블 / 다이닝코드 / DC bulk-save 잡: 기존과 동일.
- 자동 발견 잡: `['auto-discover', 'job', jobId]`.
- 어드민 맛집: **`['restaurant', 'list', limit, offset, sort]` (페이징 도입)** — 페이지/정렬/사이즈
  변경마다 별 캐시 인스턴스. SSE summary patch 는 prefix 매칭 (`setQueriesData
  ({ queryKey: ['restaurant', 'list'] }, ...)`) 으로 모든 페이지 인스턴스를 동시에 갱신.
  `placeholderData: (prev) => prev` 로 페이지 전환 시 깜빡임 방지.
- 어드민 맛집 detail: `['restaurant', placeId]`. 공개 맛집 키 변경 없음.
- 캐노니컬: 기존과 동일.
- 메뉴 그룹핑 / 분석 / 지도 / AI: 기존과 동일.
- 공개 맛집 카테고리 트리: `['restaurant', 'public', 'category-tree', placeId]` (staleTime 60s).
- 공개 리뷰: `['restaurant', 'public-reviews', placeId, sentiment, sort, tip ?? null, menu ?? null]` (tip/menu 추가로 튜플 확장 — 필터 조합마다 별 캐시 인스턴스, tip/menu 있으면 seed 안 씀).
- **주기 자동 실행 (신규)**:
  - `useScheduleConfig` → `['schedule', 'config']`, `useScheduleRuns` → `['schedule', 'runs']`.
  - `useSchedulePreview` → `['schedule', 'preview', cronExpr, timezone]` (입력별 별 캐시).
  - `useUpdateScheduleConfig` onSuccess 가 `['schedule','config']` 에 `setQueryData(cfg)` 직접 박기(refetch 없이 반영).
  - `useRunScheduleNow` onSuccess → `['schedule','runs']` + `['schedule','config']` invalidate.
  - `useScheduleRunEvents` 의 `progress` 는 React Query 캐시가 아닌 훅 로컬 state. done 시 `['schedule','runs']` + `['schedule','config']` + `['analytics']` 무효화.
- **정산 (신규)**:
  - `useListSettlements` → `['settlement', 'list', placeId ?? null, offset, limit]`
  - `useSettlement` → `['settlement', 'one', id]`
  - `useUpdateSettlementParticipants` onSuccess 가 같은 키에 `setQueryData(updated)` 직접
    삽입 + list 만 invalidate (prefix `['settlement', 'list']`).
  - `useCreateSettlement` / `useDeleteSettlement` onSuccess → `['settlement']` 전체 prefix
    invalidate (one + list 모두).
  - `useSharedSettlement` → `['settlement', 'shared', token]` (별도 prefix, 소유자 캐시와 격리)
- **정산 단골 (신규)**:
  - `useSettlementContacts` → `['settlement-contact', 'list', q ?? null, take]`
  - `useDeleteSettlementContact` onSuccess → `['settlement-contact']` + `['settlement']` 둘 다 invalidate
- **정산 임시저장 (신규)**:
  - `useListSettlementDrafts` → `['settlement-draft', 'list']`, `staleTime: 30_000`
  - `useUpsertSettlementDraft` / `useDeleteSettlementDraft` onSuccess → `['settlement-draft', 'list']` invalidate
  - `useCreateSettlement` 의 onSuccess 가 `['settlement']` 전체 invalidate 하지만 draft 캐시는 직접 안 건드림 — 서버가 `fromDraftId` 로 함께 삭제했으면 다음 list refetch 때 빠짐. 호출자가 즉시 UI 에서 제거하고 싶으면 별도 `qc.invalidateQueries(['settlement-draft'])` 또는 mutation cache eviction 필요.

**ReviewSummary 분석 필드 머지** — 기존 동일.

**SSE last-snapshot 캐시** — 매니저가 `lastSnapshotByCanonical` + `lastSnapshotByPlace` 두 Map 유지.

**SSE 스트림 상태** (`useCrawlJobStream`) — 기존 동일.

## 6. Key Decisions [coverage: high — 29 sources]

- **17차(2026-06): `useScheduleRunEvents` SSE 진행 훅 추가, design 토큰 soft tonal+다크 —
  테마 저장소는 플랫폼별 분리, `@repo/shared` 는 토큰만 공유.** 주기 자동 실행 진행은 잡 단위 SSE
  훅 패턴(매니저 미사용 + 1s→30s 백오프)을 그대로 답습하되 jobId 없이 `enabled` 플래그만으로
  연결 토글하고 진행값을 캐시가 아닌 로컬 state 로 흘린다([stream-driven-cache-merge](../concepts/stream-driven-cache-merge.md)
  의 새 인스턴스 — done 에서만 캐시 무효화). 다크 모드는 `darkColors`/`lightColors` 토큰만
  `@repo/shared` 가 공유하고, "어떤 테마를 골랐나" 의 영속화는 플랫폼별(웹 localStorage / 앱
  AsyncStorage)로 갈린다 — [platform-ui-split](../concepts/platform-ui-split.md) 의 새 인스턴스
  (`settlementDraftStore` storage adapter 주입과 같은 철학: 라이브러리는 플랫폼 무관 토큰/로직만,
  영속화 매체는 플랫폼 entry 가 결정).
- **다크 모드 토큰은 대비비(contrast ratio) 기준으로 결정** — `textMuted` 를 `zinc500`(다크 surface
  위 3.08:1, 본문 AA 4.5:1 미달)에서 `zinc400`(surfaceAlt 위 5.81:1)으로, `border` 를 흰 0.1(1.33:1,
  거의 안 보임)에서 0.14 로 상향. 라이트는 흰 배경이라 `zinc500` 그대로(`lightColors.textMuted`
  불변). 한 토큰이 placeholderTextColor 14곳에 함께 쓰여 일괄 회복.
- **`useScheduleRunEvents` snapshot 정규화** — 서버 첫 `'snapshot'` 이벤트(running 일 때)를 즉시
  `ScheduleProgressEventType` 모양으로 변환해 progress state 에 박는다. catch-up 시점에도 진행
  바가 빈 채로 안 보이고 곧장 현재 진행을 표시(global-merge 의 snapshot 미리 박기와 동형).
- **`useUserLocation({ auto })` — 진입형 vs 버튼형 화면 분기** — `auto=true`(기본) 는 진입과 동시에
  위치가 필요한 공개 맛집 주변 검색용, `auto=false` 는 "내 위치" 버튼을 눌러야만 권한 prompt 가
  뜨길 원하는 어드민 발견 같은 화면용(진입만으로 권한 팝업을 띄우면 거슬림). permission `'change'`
  구독은 auto 와 무관 — 거부 후 사용자가 설정에서 풀면 어느 모드든 자동 복구.
- **공개 리뷰 tip/menu 필터는 seed 무효화** — detail 동봉 첫 페이지 seed 는 필터 없는 기본 상태
  (`sentiment='all'`, `sort='recent'`)에서만 유효한데, tip/menu 필터가 걸리면 서버가 부분집합만
  돌려주므로 seed 를 쓰면 안 됨. `canSeed` 에 `!filters.tip && !filters.menu` 를 추가해 필터 활성
  시 seed 를 끄고 1페이지부터 fetch. tip/menu 는 호출처에서 동시 1개만 설정(서버 계약).
- **상태관리는 Zustand**, **서버 상태는 TanStack Query**.
- **공개 훅 placeholderData / staleTime 30s / queryKey 좁히기** — 기존 결정 유지.
- **`useNaverSearch` 디바운스는 호출자 책임**.
- **`useMapPublicConfig` staleTime/gcTime Infinity + retry false**.
- **`settings-map` Routes 단일 소스 / AI 만 모듈 상수 PREFIX**.
- **`apiFetch` 토큰 자동 첨부는 공개 라우트에 무해**.
- **`apiFetch` FormData body 면 Content-Type 헤더 미설정** — 브라우저가 multipart boundary
  를 포함한 Content-Type 을 자동으로 채우게 양보. `JSON.stringify` 안 한 body 가 들어오면
  `instanceof FormData` 체크로 분기. 영수증 업로드(`settlementExtractionApi.upload`) 가
  유일한 호출 케이스. 다른 binary 업로드가 생기면 이 분기를 그대로 재사용.
- **Summary SSE 는 싱글톤 매니저로 멀티플렉싱** — HTTP/1.1 6 connection cap 회피.
- **Summary 매니저 키 union — place + canonical 두 종류 한 connection** — 기존.
- **잡 단위 SSE 는 매니저를 쓰지 않는다** — 잡 하나당 한 페이지에서 하나만 띄우는 일회성
  흐름이라 멀티플렉싱 불필요. 네 훅 패턴 통일.
- **Summary SSE heartbeat + idle timeout** — 기존.
- **Summary SSE snapshot 핸들러 (snap, prev) — 합산 카운트 보호** — 기존.
- **잡 GET snapshot 404 → activeStore.clear** — 기존.
- **잡 done 후 cleanup 책임 분할** — hook 은 캐시 invalidate, store.clear 는 페이지.
- **잡 mutation onSuccess 가 snapshot 을 미리 박는다** — 기존 (DC bulk-save / grouping /
  global-merge / auto-discover). **`useUpdateSettlementParticipants` 도 동일 패턴 — 응답
  세션을 detail 캐시에 직접 `setQueryData`** 해서 결과 페이지가 재요청 없이 새
  shareAmount 를 본다. mutation 응답 페이로드가 곧 최신 캐시 값이라는 invariant.
- **`useCanonicalProposals` 는 30s 폴링 자동 trigger** — 기존.
- **`useCanonicalCandidates` 는 모달 open 시만 fetch** — 기존.
- **활성 잡 persist 패턴** — `lp:` 네임스페이스 localStorage. 단일 슬롯 4종 + 멀티 슬롯
  크롤 1종.
- **`settlementDraftStore` storage adapter 주입 패턴** — store 자체는 플랫폼 무관(zustand persist
  + StateStorage 인터페이스), 모듈 로드 시점엔 어느 플랫폼인지 모르므로 lazy resolver 로 우회.
  앱(RN) entry 가 `setSettlementDraftStorage(asyncStorageAdapter)` 를 import 후 한 번만 호출, 웹은
  미주입 시 `window.sessionStorage` 자동, 둘 다 없으면 `NO_OP_STORAGE` fallback. resolver 는
  `createJSONStorage(() => resolveStorage())` 가 zustand 의 첫 read/write 시 평가하므로, 앱이
  zustand 첫 사용 전에 inject 하면 됨. 같은 패턴(라이브러리 모듈은 abstract storage, 플랫폼 entry
  가 inject)이 향후 다른 cross-platform persist store 에도 그대로 재사용 가능.
- **앱은 AsyncStorage / 웹은 sessionStorage — 각자 다른 영속성** — RN 은 탭 개념이 없어 sessionStorage
  대응이 불가하고 AsyncStorage 가 자연스러운 영구 저장. 웹은 정산 입력이 본질적으로 일시적이라
  탭 닫기가 "포기" 의 자연 UX 시그널 — sessionStorage 가 맞는 의미. **양쪽 정책이 다른 게 정상** —
  플랫폼별로 "탭 닫음 = 포기" 가 다른 의미라서 강제로 같게 만들면 어느 한쪽이 이상해진다.
- **자동 저장(debounce + subscribe + ref-stable mutation)** — `useSettlementDraftAutoSync` 가
  store 의 직렬화 결과를 `lastSavedRef` 와 비교하고 변경 시 debounce(default 3s) 후 upsert.
  `upsert` 객체가 매 render 마다 새 참조라 effect 의존 배열에 두면 매 변경마다 subscribe 가
  새로 붙는 사고 → `upsertRef` 로 우회하고 effect 는 `enabled/isAuthed/hydrated/debounceMs`
  만 의존. baseline 은 effect 시작 시 한 번 잡아 사용자가 실제로 편집하기 전까진 저장 안 함
  (hydrate 후 idle 상태에서 의미 없는 PUT 방지).
- **`useSettlementDraftHydrate` 가 하이드레이트 신호 + placeId당 1회 가드** — 진입 시 서버 draft 를
  fetch 후 store overwrite 하고 `hydrated = true` 신호. 그 다음에야 자동저장이 활성화 — hydrate 가
  끝나기 전에 저장이 일어나면 빈 store 가 서버 draft 를 덮는 사고. 비로그인이거나 list 가 실패하면
  즉시 hydrated 로 처리해 sessionStorage-only 모드로 진행(서버 미사용 fallback). **2026-06-01:
  hydrate 를 placeId당 단 1회로 게이팅** (`hydratedForRef`) — effect 가 `list.data` 를 의존하는데
  자동저장이 list 를 invalidate→refetch 하면 `list.data` 가 새 참조로 와 effect 가 다시 돌고
  store 를 옛 서버 스냅샷으로 다시 overwrite 하던 버그. 자동저장 중 들어온 사용자 입력이 stale
  스냅샷에 밀려나는 레이스 + 매 저장마다 store 전역 리렌더 두 가지를 한 가드로 차단. placeId 가
  바뀌면(다른 식당) 다시 hydrate 허용. correctness + perf.
- **`settlementDraftStore` 는 placeId 별 단일 draft (1차 식당 기준)** — `startFor(placeId)` 가 같은
  placeId 면 보존, 다른 식당이면 `emptyDraft()` 로 리셋 + 1차 round prefill. 식당 간 항목/참여자가
  섞여 들어가는 사고 차단. **N차로 확장되었지만 "1차 식당" 이 draft 의 정체성 키** — 2차/3차의
  placeId 는 무관, 1차가 같으면 같은 draft. `useSettlementDraftAutoSync` 도 `rounds[0]?.placeId`
  를 서버 매칭 키로 보냄.
- **`startFromScratch` — placeless 진입의 보존 우선 정책** — `/me/settlements/new` 처럼 식당 없이
  진입할 때 기존 draft 가 비어 있지 않으면 그대로 보존(이어 입력 의도 존중), 비어 있을 때만 reset.
  "이어 입력" UX 의 핵심 — 사용자가 의도적으로 이력 페이지에서 draft 행을 클릭해 들어왔으면 절대
  덮어쓰지 않는다.
- **`setRoundReceipt` 의 totalAmount/warning 은 `?? null` 강제 폴백** — `?? prev` 패턴이 남아 있으면
  영수증 A(불일치, warning 세팅)→영수증 B(일치, warning=null) 교체 시 A 의 warning 이 B 위에
  잔존하는 회귀(과거 커밋 14196ea 수정). 영수증 교체는 "이전 추출 결과를 완전히 버리고 새 추출
  결과를 받는다" 가 의도된 동작이므로 폴백 자체를 제거. items 만 `items != null` 이면 갈아끼우고
  미지정 시 기존 유지(수동 편집 도중 영수증만 다시 올리는 경우 대비).
- **마스터 참여자 mutate → `syncAttendances` 자동 호출** — UI 코드는 attendance 정합성에 신경
  쓰지 않는다. `setParticipants` / `addParticipant` / `addParticipantsAndCompact` /
  `removeParticipant` 가 내부에서 모든 round 의 attendances 를 마스터 명단에 맞춰 재배열 —
  사라진 사람 제거 + 새 사람 default attendance 추가, 기존 사람의 attended/override 는 보존.
  데이터 정합성을 단일 헬퍼에 집중해 캘리브레이션 누락 위험 차단.
- **`copyRoundAttendancesFrom` 은 attendances 만 복사** — "2차도 1차와 같은 인원·옵션" 단축
  버튼용. items/source/영수증 정보는 건드리지 않는다 — 차수마다 메뉴는 다르고 영수증 토큰을
  공유하면 안 되기 때문. attendances 배열 길이는 target 의 현재(마스터 sync 결과) 를 유지하고
  각 항목의 attended/override 만 source 에서 lookup.
- **`useUpdateSettlement` (개명·확장) — detail 캐시 직접 `setQueryData` + 전체 replace** — 이전
  `useUpdateSettlementParticipants` 가 참여자만 patch 하던 것을 차수 구성 / items / attendees
  까지 한 번에 교체로 확장(서버 트랜잭션 wipe + rebuild). 응답 세션을 detail 캐시에 직접 박고
  list 만 invalidate. 이유: (a) 결과 페이지가 mount 된 상태에서 수정→저장→같은 페이지로 돌아오는
  흐름이라 즉시 갱신이 UX 필수, (b) 응답 페이로드가 곧 최신 상태이므로 추가 GET 한 번이 낭비,
  (c) 서버가 재계산해서 돌려주는 분배 결과를 그대로 신뢰.
- **`fromDraftId` 옵션 — 정산 저장과 draft 삭제를 한 트랜잭션** — `CreateSettlementInputType.fromDraftId`
  옵션 필드. 자동저장된 draft 에서 출발한 저장이면 서버가 트랜잭션 안에서 그 draft 도 삭제 —
  "저장 완료 후 별도 DELETE" 가 부분 실패하는 케이스(저장은 됐는데 draft 가 남는 사고) 차단.
  소유 mismatch 나 없는 id 는 서버가 silent ignore(저장 자체는 성공). 클라가 보내는 id 의 진위
  확인은 서버 책임 — 클라 캐시 eviction 은 best-effort.
- **`useDeleteSettlementContact` 가 두 캐시 invalidate** — `['settlement-contact']` + `['settlement']`.
  단골을 지우면 기존 정산 응답의 `participant.contactId` 가 null 로 떨어지는데, 결과
  페이지/상세가 이를 자연 반영하도록 settlement 캐시까지 동시 무효화. 다른 단골
  mutation(`update`) 은 settlement 까지 안 건드림 — name/nickname 변경은 정산 결과의
  표시값에만 영향이라 다음 GET 때 따라오면 충분.
- **`createShare` 의 OG 옵션은 "생략=유지" 트라이스테이트** — 공유 다이얼로그가 열릴 때마다 본문
  없이 `createShare` 를 자동 호출하는데(토큰 멱등 + ttl 갱신), 이때 OG 선택이 매번 기본값으로
  덮이면 owner 가 골라둔 사진이 리셋된다. 그래서 `ogImage`/`ogImageUrl` 둘 다 옵셔널 — **생략하면
  서버가 기존 선택 유지**, 토글/갤러리를 실제로 바꿀 때만 명시. 특히 `ogImageUrl` 은 `string | null`
  트라이스테이트라 "유지(undefined)" 와 "해제→랜덤(null)" 을 구분해야 해서, api 함수가
  `if (ogImageUrl !== undefined) body.ogImageUrl = ...` 로 undefined 일 때만 body 키 자체를 빼서
  서버가 두 의미를 분간하게 한다(JSON 직렬화는 undefined 키를 자동으로 빼지만 명시 분기로 의도를
  못박음). 응답 `ogImageCandidates` 가 빈 배열이면 식당 사진이 없다는 뜻 → 다이얼로그가 갤러리를
  숨기고 자동으로 정산표(table) 폴백.
- **`useSharedSettlement` 별도 KEY 격리** — `['settlement', 'shared', token]` 로 일반
  `['settlement', 'one', id]` 와 분리. 같은 사용자가 자기 세션을 공유 URL 로도 보고 어드민
  편집 페이지로도 보는 경우 캐시 충돌 없음. 공유 응답은 read-only 필드만 갖고 있어 편집
  캐시와 형태가 다르기도 함.
- **`previewBlob` 만 apiFetch 우회** — 응답이 binary 라 `apiFetch` 의 `res.json()` 으로 받으면
  깨진다. `getApiConfig().getToken?.()` 로 토큰을 꺼내 `Authorization` 헤더 직접 부착해
  `fetch` → `res.blob()`. `<img>` 가 헤더를 못 보내는 한계를 caller 가 `URL.createObjectURL
  (blob)` 로 우회. 같은 패턴이 향후 다른 인증된 binary GET(예: PDF 다운로드) 에 재사용 가능.
- **AI provider × purpose 분리 — ProviderKey** — chat/image 용도별 독립 행. 같은 provider
  를 두 용도로 같이 등록할 수 있어 정산 영수증 추출용 vision 모델을 별도로 관리한다.
  shared 의 `aiApi.updateProvider/deleteProvider/testProvider/listModels` 가 ProviderKey
  를 1st arg 로 받게 변경, 훅도 `{ key, ... }` 인자 모양.
- **어드민 list 페이징 — queryKey 가변 + prefix patch** — `useRestaurantList(query)` 가
  `{ limit, offset, sort }` 받고 queryKey 에 들어가서 page/sort 마다 별 캐시 인스턴스가 됨.
  SSE summary snapshot 은 모든 페이지 인스턴스를 동시에 갱신해야 하므로 `setQueriesData
  ({ queryKey: ['restaurant', 'list'] }, ...)` prefix 매칭. `placeholderData: (prev) => prev`
  로 페이지 전환 시 깜빡임 방지. 공개 list 도 동일 패턴 (기존부터 적용).
- **잡 SSE 백오프** — `1s → 30s cap` 4 훅 공통. Summary 매니저는 별도 `1.5s → 60s cap`
  (조금 길게 — long-lived 연결이라 빨리 두드리지 않게).
- **`buildSummaryEventsUrl` 시그니처 객체 인자** — 기존.
- **Multi-slot crawl store, Passive list-summary subscription, zod 기반 fetch, body 없을 때
  Content-Type 안 붙임, AI path 하드코드, 로직/UI 플랫폼 분리, 빌드 없는 소스 노출, 유연한
  React peer, SSE 토큰은 쿼리스트링, 중복 이벤트 방어** — 모두 기존 결정 유지.

## 7. Gotchas [coverage: high — 26 sources]

- **EventSource 헤더 못 보냄 → token query 필수** — `buildJobEventsUrl`, `buildSummaryEventsUrl`,
  `buildGroupingJobEventsUrl`, `buildGlobalMergeJobEventsUrl`, `buildDiningcodeBulkSaveEventsUrl`,
  `buildAutoDiscoverEventsUrl`, **`buildScheduleRunEventsUrl`** 모두 `?token=<jwt>`. URL/access log/Referer 노출 위험 동일. (`buildScheduleRunEventsUrl` 만 `async` — `getToken?.()` 가 Promise 일 수 있어 await; 따라서 `useScheduleRunEvents` 의 `connect` 도 async 이고 그 사이 cleanup 이 돌면 `cancelled` 가드로 ES 생성 자체를 막는다.)
- **`useScheduleRunEvents` 는 jobId 가 아니라 `enabled` 단일 dep** — 서버가 "현재 진행 중 run" 하나를 스트림하므로 클라가 runId 를 모르고도 연결. `enabled` 가 false→true 로 바뀔 때만 재연결하고, false 면 `progress`=null 리셋. caller 가 `enabled` 를 "지금 실행" 클릭/진행 중 run 존재 여부로 토글해야 함 — 안 끄면 done 후에도 빈 연결을 재시도(`onerror` 백오프) 할 수 있으니 done 직후 caller 가 enabled 를 내리거나 done 이벤트의 closed 가드에 의존.
- **`useScheduleRunEvents` 의 done → `['analytics']` 통째 invalidate** — 주기 머지 결과를 overview/통계에 반영하려는 의도지만 analytics prefix 전체를 무효화하므로 그 화면이 떠 있으면 일괄 refetch. 머지 외 다른 schedule 작업이 추가되면 invalidate 범위 재검토 필요.
- **공개 리뷰 queryKey 튜플 확장(tip/menu) — cold cache** — `['restaurant','public-reviews',placeId,sentiment,sort]` 가 `tip ?? null`/`menu ?? null` 두 칸 추가로 길어졌다. 기존 캐시 키와 안 맞아 배포 직후 한 번 cold(전부 refetch). 또한 tip 과 menu 를 동시에 설정하면 서버 동작이 정의돼 있지 않으니(계약상 동시 1개만) 호출처에서 상호배타 보장 필요.
- **잡 GET 404 → activeStore.clear (4 훅 공통)** — `ApiError.statusCode === 404` 만 분기.
- **잡 done 후 store.clear 는 hook 이 안 한다** — 페이지 컴포넌트 책임.
- **`buildSummaryEventsUrl` 시그니처 변경** — `{ placeIds?, canonicalIds? }`.
- **summary 매니저 키 종류 — DC source 는 canonical 키로만** — 기존.
- **summary `review` 이벤트 placeId 가드** — 기존.
- **`useCanonicalProposals` 자동 폴링 백그라운드 부하** — 기존.
- **canonical mutation invalidate 범위 — `['restaurant', 'list']` prefix** — 페이징 도입
  으로 모든 페이지 인스턴스 + 공개 list 까지 동시에 무효화. 의도 맞는지 호출 시 확인.
- **`useRestaurantList(query)` queryKey 가변 — SSE patch 누락 주의** — 어드민 list 캐시 모양
  변경 시 (예: 새 정렬 옵션 추가) `patchSummaryInListCaches` 의 prefix 매칭은 자동으로 새
  인스턴스도 덮으므로 이론상 안전. 그러나 만약 prefix 자체를 `['restaurant', 'list', ...]`
  외로 옮긴다면 patch 함수가 한 곳도 못 찾아 SSE 가 무용지물이 되므로, prefix 만 유지하면 됨.
- **`setRoundReceipt` 폴백 제거 학습** — totalAmount/warning 은 `?? null` 강제 폴백 (커밋 14196ea
  의 회귀 수정). 영수증 교체 시 이전 warning/totalAmount 잔존 버그 — caller 가 명시적으로
  `warning: undefined` 를 보내도 store 는 `null` 로 적는다. caller 가 부분 patch 의도로 `undefined`
  를 보내면 의도와 다르게 동작하니, 영수증 교체는 항상 명시적인 새 값 (또는 null) 을 보내는 계약 유지.
- **`setSettlementDraftStorage` 는 첫 read/write 이전에 호출** — store import 자체는 storage 를
  바로 평가하지 않지만(resolver 가 lazy), zustand persist 는 hydrate 시점에 한 번 storage 를 읽는다.
  RN entry 가 `setSettlementDraftStorage(asyncStorageAdapter)` 호출 전에 `useSettlementDraftStore`
  가 mount 되면 첫 hydrate 가 `NO_OP_STORAGE` 로 굳어버려 그 세션에서 영구 저장이 안 된다(메모리만).
  앱 entry 의 `api-setup.ts` 같은 zustand 모듈 import 보다 먼저 실행되는 곳에서 inject 하는 게
  안전. 미주입 + 비브라우저 환경(SSR/test)이 의도된 케이스라면 NO_OP fallback 가 정답이라 경고도
  내지 않음 — 그래서 누락 시 silent 하게 메모리만 쓰는 효과로 보임. 디버깅 시 "내가 입력한 값이
  앱 재시작 후 사라진다" 면 inject 누락 의심.
- **persist v1 → v4 마이그레이션 경로** — `version: 4` 로 올라가 있으므로 옛 v1 평면 draft 가 남아
  있는 사용자는 진입 시 한 번 마이그레이션 실행. **v1 의 `placeId` 가 없으면 `emptyDraft()` 로
  폐기** — 1차 식당 모르면 의미 없는 입력이라 살릴 가치 없다고 결정. v2/v3 사용자는 누락 필드만
  null 로 채우는 idempotent 경로(`fromVersion >= 2`). 마이그레이션 도중 throw 가 발생하면 zustand
  가 persisted state 를 무시하고 init state 로 시작 — 사용자가 진행 중 입력을 잃지만 앱은 정상
  동작. 새 필드 추가 시 반드시 version 을 올리고 migrate 분기를 확장해야 함.
- **`settlementDraftStore` 1차 식당 충돌 — `startFor` 항상 호출** — 진입 페이지가 `startFor(placeId,
  placeName)` 또는 `startFromScratch()` 를 호출하지 않으면 이전 식당의 draft 가 그대로 보일 수
  있다. 결정적인 것은 `rounds[0]?.placeId` 값으로만 비교하므로 page mount 시점에 반드시 호출.
  페이지 unmount 시 `reset()` 은 부르지 않는다(중간에 빠져나가도 새로고침으로 복귀 가능해야 하기 때문).
- **`useUpdateSettlement` detail 캐시 직접 박기 — list 캐시 invalidate** — detail 은 `setQueryData`
  로 즉시 반영하지만 list 는 invalidate 만 (참여자 수/차수 수 표시가 바뀌므로 다시 fetch). 만약
  list 도 즉시 갱신이 필요하다면 별도 `setQueriesData` prefix 패치 필요 — 현재 코드는 next render
  때 refetch 로 따라오는 패턴이라 약간의 깜빡임 가능. **호출 시그니처가 `({ id, input })` 으로 바뀌어
  옛 `useUpdateSettlementParticipants(input)` 호출자는 타입 에러로 잡힌다** — 동적 호출/mock 은 grep.
- **`useCreateSettlement(.., fromDraftId)` 의 클라 캐시 eviction 은 best-effort** — 서버가 트랜잭션
  으로 draft 를 함께 삭제하지만 클라이언트 React Query 캐시(`['settlement-draft', 'list']`)는
  자동으로 그 항목이 빠지지 않는다. `useCreateSettlement` 의 onSuccess 가 `['settlement']` 만
  invalidate 하고 `['settlement-draft']` 는 손대지 않음 — 사용자가 `/me/settlements` 로 이동하면
  거기서 `useListSettlementDrafts` 가 refetch 되어 자연 반영되지만, 같은 페이지에 머무는 흐름이면
  stale 한 draft 행이 잠시 보일 수 있음. 호출자가 즉시 깔끔히 보이고 싶으면 `qc.invalidateQueries
  (['settlement-draft'])` 별도 추가. 또한 `fromDraftId` 가 다른 사용자 소유거나 없는 id 면 서버가
  silent ignore — 클라는 mismatch 를 알 길이 없어 "삭제됐겠지" 라고 가정하지 말 것.
- **`useSettlementDraftAutoSync` 의 baseline 잡기 — race condition** — effect 가 마운트 시점의
  `useSettlementDraftStore.getState()` 를 baseline 으로 잡는데, `useSettlementDraftHydrate` 가
  서버 draft 를 store 에 setState 한 직후가 베이스라인 시점이 되어야 함. `hydrated` 가 false 인
  동안 effect 가 비활성이므로 자연스럽게 hydrate 후 baseline 이 잡히지만, hydrate 가 비동기인
  경우 setState → 다음 tick 의 useEffect 실행 순서가 보장돼야 함. 일반적으로 `hydrated` 가 true 로
  바뀌면 React 가 같은 render 사이클에 effect 를 재실행해 안전하지만, hydrate 가 store 를 두 번
  연달아 set 하는 코드를 추가하면 baseline 직전에 변경이 들어가 "변경 없음" 판정을 받을 수 있어
  주의.
- **`useSharedSettlement` 캐시 격리 무시 주의** — `['settlement', 'shared', token]` 키. 같은
  세션 id 로 owner 도 read-only 공개도 동시에 보고 있으면 두 캐시가 분리돼 있어 한쪽 변경이
  다른 쪽에 반영되지 않는다. 의도된 분리 — 공유 응답은 read-only 모양이 다르고 토큰이 인증
  단위. 만약 owner 가 수정 후 즉시 공유 페이지를 새로고침해도 캐시 충돌은 안 나지만 공유
  데이터가 stale 일 수는 있다 (token 키 캐시는 invalidate 안 됨). owner-edit 후 공유 캐시도
  refresh 시키려면 별도 invalidate 추가 필요.
- **`previewBlob` 은 `apiFetch` 우회 — 401/403 처리 없음** — 직접 `fetch` 라 `onUnauthorized`
  콜백이 발동 안 한다. 토큰 만료 케이스에 caller 가 `throw new Error('미리보기 요청 실패
  ({status})')` 만 받고 끝 — 어드민 로그아웃 처리는 caller 가 별도로 챙겨야 함. 향후 같은
  패턴의 binary GET 이 늘어나면 공통 `fetchBinary` 헬퍼로 묶을 가치 있음.
- **FormData body 호환 — header 직접 설정 금지** — `apiFetch` 가 `FormData` 분기로 Content-Type
  을 안 붙이는데, 만약 caller 가 `init.headers` 에 `Content-Type` 을 직접 추가하면 그게 우선해
  서 boundary 가 빠진 멀티파트가 만들어져 서버가 400 으로 거절. caller 는 절대 헤더를 손대지
  않는다.
- **AI ProviderKey 마이그레이션 — 호출자 모두 업데이트** — `aiApi.updateProvider/deleteProvider/
  testProvider/listModels` 가 `(id) → ({ id, purpose })` 로 시그니처 변경. 옛 호출자는
  TypeScript 에러로 잡히지만 동적 호출(테스트 mock 등) 있으면 런타임에 깨질 수 있어 grep 으로
  확인. env fallback 은 chat 에만 적용되므로 image purpose 는 DB row 가 반드시 있어야 호출
  성공.
- **`useUpdateSettlementContact` 는 settlement 캐시 안 건드림** — name/nickname 수정은 차후
  GET 때 따라오면 충분. 결과 페이지가 즉시 새 이름을 보고 싶다면 호출자가 `qc.invalidateQueries
  (['settlement'])` 를 별도로 호출해야 함.
- **`addParticipantsAndCompact` 가 빈 행 정리는 하지만 중복 검사는 안 함** — 단골 다중 선택
  모달이 중복 호출되면 같은 contactId 가 두 번 들어갈 수 있음. 모달 측에서 이미 추가된
  contactId 는 노출하지 않는 정책으로 회피.
- **`useAutoDiscoverJob` candidate 자체 계산이 phase 와 어긋날 수 있음** — 기존.
- **공개 list 의 queryKey 에 모든 필드 깔지 말 것**, **`useRestaurantPublic` placeId null
  가드**, **`buildSummaryEventsUrl` 사용 시 키 객체 형태**, **`useNaverSearch` 빈 q 자동
  disabled**, **잡 SSE 훅 effect jobId 단일 dep**, **`useGlobalMergeJob` chunk payload.progress
  미사용**, **잡 done 이후 추가 이벤트는 무시**, **`useMenuRanking` / `useGroupingJob` /
  `useDiningcodeBulkSaveJob` / `useAutoDiscoverJob` 의 404 → null 패턴**, **`useGroupingRestaurantsStatus` 자동 refetch
  없음**, **8-튜플/9-튜플 기본값 변경 시 cold cache**, **재연결 짧은 갭 — summary 매니저
  한정**, **Detail 캐시 inline 패치 의존**, **Review 머지는 summary 통째 교체**, **List 캐시
  형태 변경 주의**, **`useRestaurantListSummaryEvents*` 부수효과 전용**, **활성 잡 스토어
  cleanup 호출부 책임**, **확장자 해석 의존**, **React 18 하한선**, **순환 의존 금지**, **토큰
  영속화는 앱 책임**, **`configureApi` 호출 누락**, **`Button.tsx` web 진입점**, **`applyCssVars`
  HTMLElement 필요**, **`invalidateQueries` prefix 매칭 주의**, **`testProvider`/`deleteProvider`
  빈 body** — 모두 기존 항목 유지.

## 8. Sources [coverage: high — 54 sources]

- [packages/shared/package.json](../../packages/shared/package.json)
- [packages/shared/tsconfig.json](../../packages/shared/tsconfig.json)
- [packages/shared/src/index.ts](../../packages/shared/src/index.ts) — *modified: schedule.api + useSchedule re-export 추가*
- [packages/shared/src/api/client.ts](../../packages/shared/src/api/client.ts)
- [packages/shared/src/api/auth.api.ts](../../packages/shared/src/api/auth.api.ts)
- [packages/shared/src/api/picks.api.ts](../../packages/shared/src/api/picks.api.ts)
- [packages/shared/src/api/admin.api.ts](../../packages/shared/src/api/admin.api.ts)
- [packages/shared/src/api/crawl.api.ts](../../packages/shared/src/api/crawl.api.ts)
- [packages/shared/src/api/restaurant.api.ts](../../packages/shared/src/api/restaurant.api.ts) — *modified: publicCategoryTree + publicReviews tip/menu 필터*
- [packages/shared/src/api/canonical.api.ts](../../packages/shared/src/api/canonical.api.ts)
- [packages/shared/src/api/menu-grouping.api.ts](../../packages/shared/src/api/menu-grouping.api.ts)
- [packages/shared/src/api/autoDiscover.api.ts](../../packages/shared/src/api/autoDiscover.api.ts)
- [packages/shared/src/api/analytics.api.ts](../../packages/shared/src/api/analytics.api.ts)
- [packages/shared/src/api/schedule.api.ts](../../packages/shared/src/api/schedule.api.ts) (NEW)
- [packages/shared/src/api/ai.api.ts](../../packages/shared/src/api/ai.api.ts)
- [packages/shared/src/api/settings-map.api.ts](../../packages/shared/src/api/settings-map.api.ts)
- [packages/shared/src/api/settlement.api.ts](../../packages/shared/src/api/settlement.api.ts) — *modified: createShare ogImage/ogImageUrl 트라이스테이트 + SettlementShare ogImageCandidates*
- [packages/shared/src/api/settlement-extraction.api.ts](../../packages/shared/src/api/settlement-extraction.api.ts)
- [packages/shared/src/api/settlement-contact.api.ts](../../packages/shared/src/api/settlement-contact.api.ts)
- [packages/shared/src/api/settlement-draft.api.ts](../../packages/shared/src/api/settlement-draft.api.ts) (NEW)
- [packages/shared/src/hooks/useAuth.ts](../../packages/shared/src/hooks/useAuth.ts)
- [packages/shared/src/hooks/usePicks.ts](../../packages/shared/src/hooks/usePicks.ts)
- [packages/shared/src/hooks/useAdmin.ts](../../packages/shared/src/hooks/useAdmin.ts)
- [packages/shared/src/hooks/useCrawl.ts](../../packages/shared/src/hooks/useCrawl.ts)
- [packages/shared/src/hooks/useRestaurant.ts](../../packages/shared/src/hooks/useRestaurant.ts) — *modified: useRestaurantPublicCategoryTree 추가 + useRestaurantPublicReviews tip/menu 필터(seed 무효)*
- [packages/shared/src/hooks/useCanonical.ts](../../packages/shared/src/hooks/useCanonical.ts)
- [packages/shared/src/hooks/summarySseManager.ts](../../packages/shared/src/hooks/summarySseManager.ts)
- [packages/shared/src/hooks/useMenuGrouping.ts](../../packages/shared/src/hooks/useMenuGrouping.ts)
- [packages/shared/src/hooks/useAutoDiscover.ts](../../packages/shared/src/hooks/useAutoDiscover.ts)
- [packages/shared/src/hooks/useAnalytics.ts](../../packages/shared/src/hooks/useAnalytics.ts)
- [packages/shared/src/hooks/useSchedule.ts](../../packages/shared/src/hooks/useSchedule.ts) (NEW)
- [packages/shared/src/hooks/useAi.ts](../../packages/shared/src/hooks/useAi.ts)
- [packages/shared/src/hooks/useSettingsMap.ts](../../packages/shared/src/hooks/useSettingsMap.ts)
- [packages/shared/src/hooks/useUserLocation.ts](../../packages/shared/src/hooks/useUserLocation.ts) — *modified: { auto?: boolean } 옵션 (auto=false 면 마운트 자동요청 스킵) — 기존 insecure-context 단정 + Permissions 'change' 구독 유지*
- [packages/shared/src/hooks/useSettlement.ts](../../packages/shared/src/hooks/useSettlement.ts) — *modified: useCreateSettlementShare { id, ttl, ogImage, ogImageUrl } 인자 확장*
- [packages/shared/src/hooks/useSettlementExtraction.ts](../../packages/shared/src/hooks/useSettlementExtraction.ts)
- [packages/shared/src/hooks/useSettlementContact.ts](../../packages/shared/src/hooks/useSettlementContact.ts)
- [packages/shared/src/hooks/useSettlementDraft.ts](../../packages/shared/src/hooks/useSettlementDraft.ts) — *modified: useSettlementDraftHydrate placeId당 1회 가드(hydratedForRef) — 자동저장 중 입력 보호*
- [packages/shared/src/stores/authStore.ts](../../packages/shared/src/stores/authStore.ts)
- [packages/shared/src/stores/activeCrawlJobStore.ts](../../packages/shared/src/stores/activeCrawlJobStore.ts)
- [packages/shared/src/stores/activeGroupingJobStore.ts](../../packages/shared/src/stores/activeGroupingJobStore.ts)
- [packages/shared/src/stores/activeGlobalMergeJobStore.ts](../../packages/shared/src/stores/activeGlobalMergeJobStore.ts)
- [packages/shared/src/stores/activeDiningcodeBulkSaveJobStore.ts](../../packages/shared/src/stores/activeDiningcodeBulkSaveJobStore.ts)
- [packages/shared/src/stores/activeAutoDiscoverJobStore.ts](../../packages/shared/src/stores/activeAutoDiscoverJobStore.ts)
- [packages/shared/src/stores/settlementDraftStore.ts](../../packages/shared/src/stores/settlementDraftStore.ts)
- [packages/shared/src/constants/index.ts](../../packages/shared/src/constants/index.ts)
- [packages/shared/src/design/index.ts](../../packages/shared/src/design/index.ts)
- [packages/shared/src/design/tokens.ts](../../packages/shared/src/design/tokens.ts) — *modified: zinc400 추가 + 다크 textMuted/border 대비비 상향 + lightColors.bg=white*
- [packages/shared/src/design/theme.ts](../../packages/shared/src/design/theme.ts)
- [packages/shared/src/design/cssVars.ts](../../packages/shared/src/design/cssVars.ts)
- [packages/shared/src/design/ThemeProvider.tsx](../../packages/shared/src/design/ThemeProvider.tsx)
- [packages/shared/src/ui/index.ts](../../packages/shared/src/ui/index.ts)
- [packages/shared/src/ui/Button/Button.tsx](../../packages/shared/src/ui/Button/Button.tsx)
- [packages/shared/src/ui/Button/Button.types.ts](../../packages/shared/src/ui/Button/Button.types.ts)
- [packages/shared/src/ui/](../../packages/shared/src/ui/) (Divider, ErrorBanner, Input, Screen, SegmentedControl, Stack, Text)
- [CLAUDE.md](../../CLAUDE.md)
