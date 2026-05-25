---
topic: shared
last_compiled: 2026-05-25
sources_count: 50
status: active
aliases: [react-query, zustand, design-tokens, ui-primitives, "@repo/shared", useNaverSearch, "crawlApi.search", naver-search-hook, useCanonical, canonical-api, diningcode-bulk-save, useDiningcodeBulkSaveJob, autoDiscover, useAutoDiscoverJob, summarySseHeartbeat, useUserLocation, useCancelSummary, useResumeSummary, useRestaurantCrawlLogs, useCrawlJobLogs, summary-log-handler, stream-log-entries, useRestaurantPublicReviews, settlement, settlementApi, useSettlement, useListSettlements, useCreateSettlement, useDeleteSettlement, useUpdateSettlementParticipants, useCreateSettlementShare, useRevokeSettlementShare, useSharedSettlement, settlementExtractionApi, useUploadReceipt, useExtractReceipt, settlementContactApi, useSettlementContacts, useCreateSettlementContact, useUpdateSettlementContact, useDeleteSettlementContact, settlementDraftStore, useSettlementDraftStore, receipt-preview-blob, ai-provider-purpose]
---

# shared — FE 공통 패키지

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

## 2. Architecture [coverage: high — 24 sources]

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
│   ├── settings-map.api.ts # 어드민 list/update/remove/getSecret + 공개 publicConfig (Routes.SettingsMap 단일 소스)
│   ├── ai.api.ts           # LLM provider×purpose 관리 + complete/completeBatch (ProviderKey = {id, purpose})
│   ├── settlement.api.ts             # (신규) 정산 세션 CRUD + share 토큰 + updateParticipants + getShared(token)
│   ├── settlement-extraction.api.ts  # (신규) 영수증 upload(Blob→FormData) + extract(imageToken→items) + previewBlob(인증 GET)
│   └── settlement-contact.api.ts     # (신규) /me/contacts 사용자별 단골 list/update/remove
├── hooks/
│   ├── useAuth.ts          # useCurrentUser, useLogin, useRegister, useLogout
│   ├── usePicks.ts         # 쿼리키 팩토리 + CRUD + useRandomPick
│   ├── useAdmin.ts
│   ├── useCrawl.ts         # useStartCrawl/useCrawlJobs/useCancelCrawl/useNaverSearch + useCrawlJobStream + useCatchtable*/useDiningcode* + DC bulk-save 잡 훅
│   ├── useRestaurant.ts    # 어드민 list(query={limit,offset,sort})/ranking/byPlaceId/delete/reanalyze + 공개 useRestaurantsPublic/useRestaurantPublic/useRestaurantPublicInsights + canonical 기반 list summary SSE 구독 (delta-aware 합산 보호)
│   ├── useCanonical.ts     # candidates/merge/split/dismiss + proposals(list/run/accept/reject) + delete
│   ├── summarySseManager.ts# 프로세스 전역 SSE 싱글톤 (place + canonical 두 키 멀티플렉싱) + heartbeat watchdog + idle timeout (서버 다운 자동 감지) + snapshot delta-aware dispatch
│   ├── useMenuGrouping.ts  # ranking/group/status/createJob + useGroupingJob (자체 EventSource + 백오프)
│   ├── useAutoDiscover.ts  # useStartAutoDiscover / useAutoDiscoverJob / useCancelAutoDiscover (snapshot/keyword/candidate/phase/done SSE 머지)
│   ├── useAnalytics.ts     # overview/globalMenus/categoryTree + useStartGlobalMerge + useGlobalMergeJob (chunk 진행)
│   ├── useSettingsMap.ts   # 어드민 providers/secret + 공개 useMapPublicConfig
│   ├── useAi.ts            # ProviderKey({id,purpose}) 기반 provider CRUD + complete/test/models
│   ├── useUserLocation.ts  # geolocation 권한+위치 query (5s timeout, 60s maxAge)
│   ├── useSettlement.ts           # (신규) useListSettlements / useSettlement / useCreateSettlement / useDeleteSettlement / useUpdateSettlementParticipants(setQueryData) / useCreateSettlementShare / useRevokeSettlementShare / useSharedSettlement
│   ├── useSettlementExtraction.ts # (신규) useUploadReceipt / useExtractReceipt (둘 다 useMutation)
│   └── useSettlementContact.ts    # (신규) useSettlementContacts(검색어 키별) / useUpdateSettlementContact / useDeleteSettlementContact (삭제 시 settlement 캐시도 무효화)
├── stores/
│   ├── authStore.ts                       # Zustand: user / token / isGuest
│   ├── activeCrawlJobStore.ts             # Zustand: jobs by jobId (멀티 슬롯)
│   ├── activeGroupingJobStore.ts          # Zustand + persist: jobId (단일 슬롯, localStorage)
│   ├── activeGlobalMergeJobStore.ts       # Zustand + persist: jobId (단일 슬롯, localStorage)
│   ├── activeDiningcodeBulkSaveJobStore.ts# Zustand + persist: jobId (단일 슬롯, localStorage)
│   ├── activeAutoDiscoverJobStore.ts      # Zustand + persist: jobId (단일 슬롯, localStorage)
│   └── settlementDraftStore.ts            # (신규) Zustand + persist sessionStorage — placeId 별 단일 draft (items/participants/receipt 토큰·미리보기·totalAmount·warning)
├── design/ … (불변)
├── ui/ … (불변)
└── constants/ …
```

API 함수 모듈과 React Query 훅 모듈은 1:1 페어로 분리된다. 함수 모듈(`*.api.ts`)은
querystring 빌더와 `apiFetch` 호출만 담당하고, 훅 모듈(`use*.ts`)은 캐시 키·`enabled`·
`placeholderData`·`staleTime`·invalidate 정책 등 React Query 레이어를 책임진다. 어드민과
공개 함수는 같은 모듈에 공존하지만(`restaurant.api.ts`의 `list`/`publicList` 등) 컨슈머는
훅 이름으로 모드를 식별한다 — `useRestaurantList`(어드민) vs `useRestaurantsPublic`(공개).

**정산 도메인 FE 플러밍 (신규)** ([settlement.api.ts](../../packages/shared/src/api/settlement.api.ts) +
[useSettlement.ts](../../packages/shared/src/hooks/useSettlement.ts) +
[settlement-extraction.api.ts](../../packages/shared/src/api/settlement-extraction.api.ts) +
[useSettlementExtraction.ts](../../packages/shared/src/hooks/useSettlementExtraction.ts) +
[settlement-contact.api.ts](../../packages/shared/src/api/settlement-contact.api.ts) +
[useSettlementContact.ts](../../packages/shared/src/hooks/useSettlementContact.ts) +
[settlementDraftStore.ts](../../packages/shared/src/stores/settlementDraftStore.ts)) —
영수증 분기/수동 입력 분기를 모두 같은 draft 스토어에 모아 다단계 wizard 를 굴리고, 저장
완료 후엔 서버 세션 ID 로 결과 페이지에 진입. 모듈은 세 갈래.

- `settlement.api.ts` / `useSettlement.ts` — 세션 CRUD + 저장 후 참여자/옵션 수정 +
  공유 토큰. `useUpdateSettlementParticipants` 의 onSuccess 가 응답 세션을 detail 캐시
  (`['settlement', 'one', id]`) 에 `setQueryData` 로 직접 박는다. 결과 페이지가 다시
  fetch 하지 않아도 새 `shareAmount` 가 즉시 보임. list 는 invalidate (참여자 수 표시가
  바뀔 수 있어). 공유 토큰 mutation 은 캐시 무관 — 응답을 UI 가 그대로 표시.
  `useSharedSettlement(token)` 은 별도 KEY `['settlement', 'shared', token]` 로 격리해
  소유자가 같은 세션을 보고 있어도 캐시 충돌 없음.
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
- `settlementDraftStore.ts` — zustand `persist` + `createJSONStorage(() => window.
  sessionStorage)`. key `settlement-draft-v1`. **placeId 별 단일 draft** — `startFor
  (placeId)` 호출 시 같은 placeId 면 보존, 다른 식당이면 `emptyDraft()` 로 리셋. 새로
  고침은 살고 탭 닫으면 휘발. `setReceipt({ imageToken, previewUrl, items?, totalAmount?,
  warning? })` 는 **`?? null` 폴백 적용 — 이전 값은 무조건 버린다**. 영수증 교체 시 A
  영수증의 warning 이 B 의 깨끗한 결과 위에 살아남는 버그 수정 (커밋 14196ea). items
  미지정 시에만 기존 items 유지. `addParticipantsAndCompact` 는 빈 행(이름·닉네임 모두
  빈) 자동 정리 후 새 항목 append — 단골 다중 선택 모달이 호출.

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
  - `canonicalApi` → friendly의 `Routes.Canonical.*`.
  - **`settlementApi` → `/api/v1/settlements/*` + `/api/v1/share/settlements/:token` (공개)**.
  - **`settlementExtractionApi` → `/api/v1/settlement-extraction/upload|extract|preview/:token`** (preview 만 직접 fetch + Authorization 헤더).
  - **`settlementContactApi` → `/api/v1/me/contacts/*`** (인증 필수).
- UI 측 사용처는 [web](web.md), 정산 도메인 자체는 [settlement](settlement.md).

## 4. API Surface [coverage: high — 31 sources]

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
  - 공개: `publicList(query?)`, `publicByPlaceId(placeId)`, `publicInsights(placeId)`, `publicReviews({ placeId, sentiment, sort, cursor? })`
  - SSE URL: `buildSummaryEventsUrl({ placeIds?, canonicalIds? })`
- `canonicalApi`: `candidates(canonicalId)`, `merge(input)`, `split(canonicalId, input)`, `dismissSuggestion(canonicalId)`, `listProposals()`, `runProposals()`, `acceptProposal(proposalId, input)`, `rejectProposal(proposalId)`, `delete(canonicalId)`.
- `menuGroupingApi`: `groupForRestaurant(placeId)`, `getRanking(placeId, query?)`, `getRestaurantsStatus()`, `createGroupingJob({ placeIds })`, `getGroupingJob(jobId)` + `buildGroupingJobEventsUrl(jobId)`
- `autoDiscoverApi`: `start(input)`, `get(jobId)`, `cancel(jobId)` + `buildAutoDiscoverEventsUrl(jobId)`
- `analyticsApi`: `overview()`, `globalMenus(query?)`, `categoryTree()`, `startGlobalMerge({ full })`, `getGlobalMergeJob(jobId)` + `buildGlobalMergeJobEventsUrl(jobId)`
- `settingsMapApi`: 어드민 `list/update/remove/getSecret` + 공개 `publicConfig`
- `aiApi`: **`ProviderKey = { id: LlmProviderIdType; purpose: LlmProviderPurposeType }`** 기반. `complete`, `completeBatch`, `listProviders`, `updateProvider(key, input)`, `deleteProvider(key)`, `testProvider(key, model?)`, `listModels(key)` — URL 모양 `/providers/:id/:purpose`.
- **`settlementApi` (신규)**: `create(input)`, `list(query?)`, `get(id)`, `remove(id)`, `updateParticipants(id, input)`, `createShare(id)` (멱등 — 같은 세션 여러 번 호출 시 동일 토큰), `revokeShare(id)`, `getShared(token)` (공개 read-only, 비로그인 가능).
- **`settlementExtractionApi` (신규)**: `upload(file: Blob)` (FormData with field name `'file'`), `extract(input)`, **`previewBlob(token): Promise<Blob>`** (apiFetch 미사용 — 직접 `fetch` + `getApiConfig().getToken?.()` 헤더 부착 후 `res.blob()` 반환; binary 라 JSON 파싱 우회).
- **`settlementContactApi` (신규)**: `list(query? = { take: 50 })` (검색어 q 옵션), `update(id, input)`, `remove(id)`.

**React Query 훅 (`hooks/`)**
- 인증: `useCurrentUser`, `useLogin`, `useRegister`, `useLogout`
- 픽: `usePicks`, `usePick`, `useCreatePick`, `useUpdatePick`, `useDeletePick`, `useRandomPick`
- 어드민: `useAdminUsers`, `useSetUserRole`
- 크롤 네이버: `useStartCrawl`, `useCrawlJobs`, `useCancelCrawl`, `useCrawlJobStream`, `useNaverSearch(q, bbox)`, `useCrawlJobLogs(jobId)`
- 크롤 캐치테이블: `useCatchtableSearch`, `useCatchtableShop`, `useCatchtableShopMenus`, `useCatchtableShopReviewOverview`
- 크롤 다이닝코드: `useDiningcodeSearch`, `useDiningcodeShop`, `useDiningcodeShopReviews`, `useSaveDiningcodeShop`, `useDiningcodeRegistered`
- DC 일괄 저장 잡: `useStartDiningcodeBulkSave`, `useCancelDiningcodeBulkSave`, `useDiningcodeBulkSaveJob`
- 맛집 어드민: **`useRestaurantList(query?: { limit?, offset?, sort? })` (queryKey `['restaurant', 'list', limit, offset, sort]` + `placeholderData: (prev) => prev`)**, `useRestaurantRanking`, `useRestaurantByPlaceId`, `useDeleteRestaurant`, `useReanalyzeRestaurant`, `useCancelSummary`, `useResumeSummary`, `useRestaurantCrawlLogs(placeId)` (infiniteQuery), `useRestaurantSummaryEvents(placeId, { onLog? })`, `useRestaurantListSummaryEvents(canonicalIds[])`, `useRestaurantListSummaryEventsByPlaceIds(placeIds[])`
- 맛집 공개: `useRestaurantsPublic`, `useRestaurantPublic`, `useRestaurantPublicInsights`, `useRestaurantPublicReviews` (infiniteQuery, detail seed)
- 캐노니컬: `useCanonicalCandidates`, `useMergeCanonical`, `useSplitCanonical`, `useDismissCanonicalSuggestion`, `useCanonicalProposals` (refetchInterval 30s), `useRunCanonicalProposals`, `useAcceptCanonicalProposal`, `useRejectCanonicalProposal`, `useDeleteCanonical`
- 메뉴 그룹핑: `useMenuRanking`, `useGroupForRestaurant`, `useGroupingRestaurantsStatus`, `useCreateGroupingJob`, `useGroupingJob`
- 자동 발견: `useStartAutoDiscover`, `useCancelAutoDiscover`, `useAutoDiscoverJob`
- 분석: `useAnalyticsOverview`, `useGlobalMenus`, `useCategoryTree`, `useStartGlobalMerge`, `useGlobalMergeJob`
- 지도: `useMapProviders`, `useUpdateMapProvider`, `useDeleteMapProvider`, `useMapProviderSecret`, `useMapPublicConfig`, `useUserLocation`
- AI: `useCompleteAi`, `useCompleteBatchAi`, `useProviders`, `useUpdateProvider({ key, input })`, `useDeleteProvider(key)`, `useTestProvider({ key, model? })`, `useProviderModels(key, enabled?)`
- **정산 세션 (신규)**:
  - `useListSettlements(query? = { offset: 0, limit: 20 })` — queryKey `['settlement', 'list', placeId, offset, limit]`
  - `useSettlement(id: string | null)` — `enabled: !!id`, key `['settlement', 'one', id]`
  - `useCreateSettlement()` — mutation, onSuccess 시 `['settlement']` invalidate
  - `useDeleteSettlement()` — mutation, 같은 invalidate
  - **`useUpdateSettlementParticipants()` — onSuccess 시 응답 세션을 `setQueryData(['settlement', 'one', updated.id], updated)` 로 detail 직접 박고 list 만 invalidate**
  - `useCreateSettlementShare()` — mutation (응답 그대로 UI 표시, 캐시 손대지 않음)
  - `useRevokeSettlementShare()` — mutation
  - `useSharedSettlement(token: string | null)` — `enabled: !!token`, 별도 key `['settlement', 'shared', token]`
- **정산 추출 (신규)**:
  - `useUploadReceipt()` — mutation, `Blob | File` 받아 imageToken/previewUrl/byteSize 반환
  - `useExtractReceipt()` — mutation, imageToken + placeId → items/totalAmount/warning
- **정산 단골 (신규)**:
  - `useSettlementContacts(query? = { take: 50 })` — queryKey `['settlement-contact', 'list', q, take]`
  - `useUpdateSettlementContact()` — onSuccess 시 `['settlement-contact']` invalidate
  - `useDeleteSettlementContact()` — onSuccess 시 `['settlement-contact']` + **`['settlement']` 동시 invalidate** (정산 응답의 participant.contactId null fall-through 반영)

**SSE 매니저 (`hooks/summarySseManager.ts`)** — 변경 없음. `subscribe(key, { onSnapshot(snap, prev), onReview, onLog? })`, place/canonical 키 union, heartbeat 5s, idle 15s, backoff 1.5s→60s.

**잡 단위 SSE 훅** — 변경 없음. `useGroupingJob` / `useGlobalMergeJob` / `useDiningcodeBulkSaveJob` / `useAutoDiscoverJob` 네 훅 모두 `closedRef`/`retryRef`/cleanup 패턴 동일. 백오프 `1s → 30s cap`.

**Zustand 스토어 (`stores/`)**
- `useAuthStore`: `user`, `token`, `isGuest` + `setSession`, `setUser`, `enterGuest`, `clearSession`
- `useActiveCrawlJobStore`: `jobs: Record<jobId, ActiveCrawlJob>` (멀티 슬롯, persist 없음)
- `useActiveGroupingJobStore`: `jobId | null` + `setJobId`, `clear` — `lp:activeGroupingJob` localStorage persist
- `useActiveGlobalMergeJobStore`: `lp:activeGlobalMergeJob` localStorage persist
- `useActiveDiningcodeBulkSaveJobStore`: `lp:activeDiningcodeBulkSaveJob` localStorage persist
- `useActiveAutoDiscoverJobStore`: `lp:activeAutoDiscoverJob` localStorage persist
- **`useSettlementDraftStore` (신규)**: `SettlementDraft` 상태 + 액션 `startFor(placeId)` / `reset()` / `setSource` / `setParticipants` / `addParticipant` / `addParticipantsAndCompact` / `updateParticipant` / `removeParticipant` / `setItems` / `addItem` / `updateItem` / `removeItem` / `setReceipt(...)`. persist key `settlement-draft-v1`, storage `sessionStorage` (SSR/test 환경 noop 어댑터).

**UI / 디자인 / 상수** — 변경 없음 (기존 8 컴포넌트, `palette/lightColors/darkColors/space/radius/typography/duration`, `APP_NAME` / `QUERY_STALE_TIME` / `QUERY_GC_TIME`).

## 5. Data [coverage: high — 14 sources]

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

**Settlement draft 상태 (신규)** (`stores/settlementDraftStore.ts`)
```ts
interface SettlementDraft {
  placeId: string | null;
  source: SettlementSourceType | null;       // 'RECEIPT' | 'MANUAL'
  participants: DraftParticipant[];          // contactId/name/nickname/clientId 포함
  items: DraftItem[];                        // name/unitPrice/quantity/amount/category/matchedMenuName/clientId
  receiptImageToken: string | null;          // 영수증 분기에서만
  receiptPreviewUrl: string | null;
  totalAmount: number | null;                // 영수증 추출 시 서버가 돌려준 총액
  warning: string | null;                    // 항목 소계와 영수증 총액 불일치 시 경고
}
```
- zustand `persist` + `createJSONStorage(() => window.sessionStorage)` — 새로고침은 살리되
  탭 닫으면 휘발. SSR/test 면 `{ getItem/setItem/removeItem: noop }` 어댑터.
- 키 `settlement-draft-v1`. `startFor(placeId)` 가 같은 placeId 면 보존, 다른 식당이면
  `emptyDraft()` 로 리셋해 식당 간 데이터 교차 차단.
- `clientId` 는 store 가 부여 (`crypto.randomUUID` 우선, 폴백 `c-<ts>-<rnd>`). 저장 시
  서버가 새 id 부여.
- `setReceipt({ ... totalAmount?, warning? })` — `?? null` 강제 폴백. 영수증 교체 시 이전
  값을 끌고 오면 안 되기 때문(아래 Key Decisions / Gotchas 참고).
- `addParticipantsAndCompact(items)` — 빈 행 제거 후 새 항목 append. 단골 다중 선택 모달용.

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

**ReviewSummary 분석 필드 머지** — 기존 동일.

**SSE last-snapshot 캐시** — 매니저가 `lastSnapshotByCanonical` + `lastSnapshotByPlace` 두 Map 유지.

**SSE 스트림 상태** (`useCrawlJobStream`) — 기존 동일.

## 6. Key Decisions [coverage: high — 25 sources]

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
- **`settlementDraftStore` persist 는 sessionStorage** — 다른 잡 스토어가 localStorage 인 것과
  대비. 정산 입력은 본질적으로 일시적이고 다른 기기로 옮길 가치가 없으며, 탭을 닫는 행위가
  "포기" 의 자연스러운 UX 시그널. 새로고침은 데이터 유지(잘못 누른 새로고침 보호), 탭 닫기는
  휘발. SSR/test 환경에선 `window === undefined` 일 때 noop 어댑터로 fallback.
- **`settlementDraftStore` 는 placeId 별 단일 draft** — `startFor(placeId)` 가 같은 placeId
  면 보존, 다른 식당이면 `emptyDraft()` 로 리셋. 식당 간 항목/참여자가 섞여 들어가는 사고
  차단. 결과적으로 한 사용자는 동시에 한 식당의 정산만 진행 — 멀티 식당 동시 입력은 비지원
  결정(사용 빈도 낮고 UI 복잡도 폭증).
- **`setReceipt` 의 totalAmount/warning 은 `?? null` 강제 폴백** — 이전엔 `?? prev` 패턴이
  남아 있어 영수증 A(불일치, warning 세팅)→영수증 B(일치, warning=null) 교체 시 A 의
  warning 이 B 위에 잔존하는 버그(커밋 14196ea). 영수증 교체는 "이전 추출 결과를 완전히
  버리고 새 추출 결과를 받는다" 가 의도된 동작이므로 폴백 자체를 제거. items 만 `items != null`
  이면 갈아끼우고 미지정 시 기존 유지(수동 편집 도중 영수증 만 다시 올리는 경우 대비).
- **`useUpdateSettlementParticipants` 가 detail 캐시 직접 `setQueryData`** — 일반적인
  mutation onSuccess 가 `invalidateQueries` 만 하는 패턴과 다르게, 응답 세션을 detail 캐시
  에 직접 박고 list 만 invalidate. 이유: (a) 결과 페이지가 mount 된 상태에서 수정→저장
  →같은 페이지로 돌아오는 흐름이라 즉시 갱신이 UX 필수, (b) 응답 페이로드가 곧 최신 상태
  이므로 추가 GET 한 번이 낭비, (c) 서버가 재계산해서 돌려주는 분배 결과를 그대로 신뢰.
- **`useDeleteSettlementContact` 가 두 캐시 invalidate** — `['settlement-contact']` + `['settlement']`.
  단골을 지우면 기존 정산 응답의 `participant.contactId` 가 null 로 떨어지는데, 결과
  페이지/상세가 이를 자연 반영하도록 settlement 캐시까지 동시 무효화. 다른 단골
  mutation(`update`) 은 settlement 까지 안 건드림 — name/nickname 변경은 정산 결과의
  표시값에만 영향이라 다음 GET 때 따라오면 충분.
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

## 7. Gotchas [coverage: high — 22 sources]

- **EventSource 헤더 못 보냄 → token query 필수** — `buildJobEventsUrl`, `buildSummaryEventsUrl`,
  `buildGroupingJobEventsUrl`, `buildGlobalMergeJobEventsUrl`, `buildDiningcodeBulkSaveEventsUrl`,
  `buildAutoDiscoverEventsUrl` 모두 `?token=<jwt>`. URL/access log/Referer 노출 위험 동일.
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
- **`setReceipt` 폴백 제거 학습** — `?? null` 강제 폴백 (커밋 14196ea 수정). 영수증 교체 시
  이전 warning/totalAmount 잔존 버그 — caller 가 명시적으로 `warning: undefined` 를 보내도
  store 는 `null` 로 적는다. caller 가 부분 patch 의도로 `undefined` 를 보내면 의도와 다르
  게 동작하니, 영수증 교체는 항상 명시적인 새 값 (또는 null) 을 보내는 계약을 유지.
- **`settlementDraftStore` persist 는 sessionStorage** — 새로고침 OK, 탭 닫기 시 휘발. 어드민
  잡 스토어들이 localStorage 인 것과 다르므로 코드 수정 시 `createJSONStorage` 가 어떤 Storage
  반환하는지 반드시 확인. 사용자가 "탭 닫고 다음 날 다시 와도 정산 진행 중이어야 하는 거 아냐?"
  라고 보고하면 정책이 변경된 것 — 그땐 localStorage 로 옮기되 placeId 별 단일 draft 정책과
  함께 stale 데이터 정리 전략(예: 24h TTL) 도 같이 검토.
- **`settlementDraftStore` placeId 충돌 — `startFor` 항상 호출 필요** — 진입 페이지가
  `startFor(placeId)` 를 호출하지 않으면 이전 식당의 draft 가 그대로 보일 수 있다. 결정적인
  것은 placeId 값으로만 비교하므로 page mount 시점에 반드시 호출. 페이지 unmount 시 `reset()`
  은 부르지 않는다(중간에 빠져나가도 새로고침으로 복귀 가능해야 하기 때문).
- **`useUpdateSettlementParticipants` detail 캐시 직접 박기 — list 캐시 invalidate** — detail
  은 `setQueryData` 로 즉시 반영하지만 list 는 invalidate 만 (참여자 수 표시가 바뀌므로 다시
  fetch). 만약 list 도 즉시 갱신이 필요하다면 별도 `setQueriesData` prefix 패치 필요 — 현재
  코드는 next render 때 refetch 로 따라오는 패턴이라 약간의 깜빡임 가능.
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

## 8. Sources [coverage: high — 50 sources]

- [packages/shared/package.json](../../packages/shared/package.json)
- [packages/shared/tsconfig.json](../../packages/shared/tsconfig.json)
- [packages/shared/src/index.ts](../../packages/shared/src/index.ts)
- [packages/shared/src/api/client.ts](../../packages/shared/src/api/client.ts)
- [packages/shared/src/api/auth.api.ts](../../packages/shared/src/api/auth.api.ts)
- [packages/shared/src/api/picks.api.ts](../../packages/shared/src/api/picks.api.ts)
- [packages/shared/src/api/admin.api.ts](../../packages/shared/src/api/admin.api.ts)
- [packages/shared/src/api/crawl.api.ts](../../packages/shared/src/api/crawl.api.ts)
- [packages/shared/src/api/restaurant.api.ts](../../packages/shared/src/api/restaurant.api.ts)
- [packages/shared/src/api/canonical.api.ts](../../packages/shared/src/api/canonical.api.ts)
- [packages/shared/src/api/menu-grouping.api.ts](../../packages/shared/src/api/menu-grouping.api.ts)
- [packages/shared/src/api/autoDiscover.api.ts](../../packages/shared/src/api/autoDiscover.api.ts)
- [packages/shared/src/api/analytics.api.ts](../../packages/shared/src/api/analytics.api.ts)
- [packages/shared/src/api/ai.api.ts](../../packages/shared/src/api/ai.api.ts)
- [packages/shared/src/api/settings-map.api.ts](../../packages/shared/src/api/settings-map.api.ts)
- [packages/shared/src/api/settlement.api.ts](../../packages/shared/src/api/settlement.api.ts)
- [packages/shared/src/api/settlement-extraction.api.ts](../../packages/shared/src/api/settlement-extraction.api.ts)
- [packages/shared/src/api/settlement-contact.api.ts](../../packages/shared/src/api/settlement-contact.api.ts)
- [packages/shared/src/hooks/useAuth.ts](../../packages/shared/src/hooks/useAuth.ts)
- [packages/shared/src/hooks/usePicks.ts](../../packages/shared/src/hooks/usePicks.ts)
- [packages/shared/src/hooks/useAdmin.ts](../../packages/shared/src/hooks/useAdmin.ts)
- [packages/shared/src/hooks/useCrawl.ts](../../packages/shared/src/hooks/useCrawl.ts)
- [packages/shared/src/hooks/useRestaurant.ts](../../packages/shared/src/hooks/useRestaurant.ts)
- [packages/shared/src/hooks/useCanonical.ts](../../packages/shared/src/hooks/useCanonical.ts)
- [packages/shared/src/hooks/summarySseManager.ts](../../packages/shared/src/hooks/summarySseManager.ts)
- [packages/shared/src/hooks/useMenuGrouping.ts](../../packages/shared/src/hooks/useMenuGrouping.ts)
- [packages/shared/src/hooks/useAutoDiscover.ts](../../packages/shared/src/hooks/useAutoDiscover.ts)
- [packages/shared/src/hooks/useAnalytics.ts](../../packages/shared/src/hooks/useAnalytics.ts)
- [packages/shared/src/hooks/useAi.ts](../../packages/shared/src/hooks/useAi.ts)
- [packages/shared/src/hooks/useSettingsMap.ts](../../packages/shared/src/hooks/useSettingsMap.ts)
- [packages/shared/src/hooks/useUserLocation.ts](../../packages/shared/src/hooks/useUserLocation.ts)
- [packages/shared/src/hooks/useSettlement.ts](../../packages/shared/src/hooks/useSettlement.ts)
- [packages/shared/src/hooks/useSettlementExtraction.ts](../../packages/shared/src/hooks/useSettlementExtraction.ts)
- [packages/shared/src/hooks/useSettlementContact.ts](../../packages/shared/src/hooks/useSettlementContact.ts)
- [packages/shared/src/stores/authStore.ts](../../packages/shared/src/stores/authStore.ts)
- [packages/shared/src/stores/activeCrawlJobStore.ts](../../packages/shared/src/stores/activeCrawlJobStore.ts)
- [packages/shared/src/stores/activeGroupingJobStore.ts](../../packages/shared/src/stores/activeGroupingJobStore.ts)
- [packages/shared/src/stores/activeGlobalMergeJobStore.ts](../../packages/shared/src/stores/activeGlobalMergeJobStore.ts)
- [packages/shared/src/stores/activeDiningcodeBulkSaveJobStore.ts](../../packages/shared/src/stores/activeDiningcodeBulkSaveJobStore.ts)
- [packages/shared/src/stores/activeAutoDiscoverJobStore.ts](../../packages/shared/src/stores/activeAutoDiscoverJobStore.ts)
- [packages/shared/src/stores/settlementDraftStore.ts](../../packages/shared/src/stores/settlementDraftStore.ts)
- [packages/shared/src/constants/index.ts](../../packages/shared/src/constants/index.ts)
- [packages/shared/src/design/index.ts](../../packages/shared/src/design/index.ts)
- [packages/shared/src/design/tokens.ts](../../packages/shared/src/design/tokens.ts)
- [packages/shared/src/design/theme.ts](../../packages/shared/src/design/theme.ts)
- [packages/shared/src/design/cssVars.ts](../../packages/shared/src/design/cssVars.ts)
- [packages/shared/src/design/ThemeProvider.tsx](../../packages/shared/src/design/ThemeProvider.tsx)
- [packages/shared/src/ui/index.ts](../../packages/shared/src/ui/index.ts)
- [packages/shared/src/ui/Button/Button.tsx](../../packages/shared/src/ui/Button/Button.tsx)
- [packages/shared/src/ui/Button/Button.types.ts](../../packages/shared/src/ui/Button/Button.types.ts)
- [packages/shared/src/ui/](../../packages/shared/src/ui/) (Divider, ErrorBanner, Input, Screen, SegmentedControl, Stack, Text)
- [CLAUDE.md](../../CLAUDE.md)
