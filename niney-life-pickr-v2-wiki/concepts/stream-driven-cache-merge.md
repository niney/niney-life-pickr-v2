---
concept: SSE 페이로드 직접 머지로 follow-up GET 회피
last_compiled: 2026-05-15
topics_connected: [crawl, friendly, shared, web, menu-grouping, analytics]
status: active
---

# SSE 페이로드 직접 머지로 follow-up GET 회피

## Pattern

서버가 SSE 이벤트를 흘릴 때 단순한 "이 placeId 갱신됨" 신호가 아니라 **클라이언트가 캐시에 그대로 머지할 수 있는 완성된 페이로드**를 함께 푸시한다. 결과적으로 클라이언트는 `invalidateQueries` 대신 `setQueryData`로 캐시를 부분 패치하고, follow-up GET을 한 번도 쏘지 않는다. 이 패턴은 리뷰처럼 본문이 KB 단위인 데이터를 다루는 곳에서 특히 큰 차이를 낸다 — 한 번에 200건의 리뷰 본문을 다시 받아오면 페이지가 멎는데, 페이로드 머지는 새 행만 prepend.

## Instances

- **2026-05-07** in [[../topics/crawl]] (`crawl.service.ts`): `visitor_batch` SSE 이벤트가 `persistedReviews: PersistedVisitorReview[]`를 동봉. 어댑터→persistTail→`persistReviewBatch({newReviews})`가 server id가 박힌 새 row를 그대로 이벤트에 실어 준다. 같은 잡 안에서 무거운 detail GET이 한 번도 안 뜨고도 새 리뷰가 화면에 등장.
- **2026-05-07** in [[../topics/friendly]] (`restaurant.route.ts` `summaryEvents`): SSE `review` 이벤트가 done/failed 상태 + 요약 텍스트 + 모델명 + 에러 정보까지 한 페이로드에 담아 푸시. 클라가 `reviews[].summary`를 그 자리에서 머지. `snapshot` 이벤트는 progress 카운트 + recentDone 같이 보내 list/detail 캐시 양쪽을 패치할 수 있게 함. placeId 태그도 페이로드에 — 멀티플렉싱 endpoint에서 demux용.
- **2026-05-07** in [[../topics/shared]] (`useRestaurantSummaryEvents` / `summarySseManager`): `onSnapshot`에서 `qc.setQueryData(['restaurant', 'list'], ...)`로 행의 카운트 패치 + `onReview`에서 `qc.setQueryData(['restaurant', placeId], ...)`로 detail 안 리뷰의 summary 필드 패치. `useCrawlJobStream`도 `lastPersistedBatch`를 reducer state에 노출해 호출자(`ActiveJobPanel`)가 같은 패턴 적용.
- **2026-05-07** in [[../topics/web]] (`ActiveJobPanel.tsx`): `stream.lastPersistedBatch`를 `seen` Set로 dedupe한 뒤 detail 캐시에 prepend. `done` 시점에서야 list 캐시만 invalidate. 이전엔 visitor_batch 이벤트마다 `invalidateQueries(['restaurant', placeId])`를 쳐서 매 페이지마다 detail GET이 떠 페이지가 멎었음.
- **2026-05-08** in [[../topics/crawl]] / [[../topics/api-contract]] (`crawl.service.ts`, `schemas/crawl.ts`): 새로 추가된 `VisitorReview.videos: VisitorReviewVideo[]`(포스터 + 서명된 mp4 url)도 같은 머지 채널을 그대로 탄다. `visitor_batch` SSE의 `persistedReviews`에 `videos`가 동봉되어 `setQueryData` 머지 시 클라가 별도 GET 없이 비디오 타일까지 그릴 수 있음. 페이로드 한 칸 늘리고 끝 — 머지 인프라는 손 안 댐.
- **2026-05-08** in [[../topics/friendly]] / [[../topics/web]] (`summary.service.ts`, `summary-events-bus.ts`, `sections.tsx`): ReviewSummary 구조화 분석(sentiment / sentimentScore / satisfactionScore / menusJson / tipsJson / keywordsJson)도 SSE `review` 이벤트 페이로드에 그대로 실려와 `reviews[].summary.*`로 머지됨. FE 리뷰 카드의 감정 뱃지·만족도·메뉴 칩·팁 리스트가 detail GET 0회로 채워지고 갱신됨. 페이로드만 풍부해지고 머지 코드는 동일.
- **2026-05-09** in [[../topics/menu-grouping]] / [[../topics/shared]] (`packages/shared/src/hooks/useMenuGrouping.ts` `useGroupingJob(jobId)`): batch 메뉴 그룹핑 잡 React Query 캐시에 SSE 이벤트를 직접 머지. `snapshot` 이벤트는 잡 캐시를 통째로 set, `item` 이벤트는 items 배열에서 placeId 매치해 patch + doneCount/failedCount/skippedCount 재계산, `done` 이벤트는 state/finishedAt patch + ranking + restaurants-status 캐시 invalidate. follow-up GET 0회. 자동 재연결 백오프(1s→2s→4s→max 30s) + closedRef 가드 + jobId effect dep로 라이프사이클을 훅 안에서 직접 관리.
- **2026-05-09** in [[../topics/analytics]] / [[../topics/shared]] (`packages/shared/src/hooks/useAnalytics.ts` `useGlobalMergeJob(jobId)`): 전역 머지 잡 진행도. `snapshot`은 잡 캐시 통째 set, `chunk` 이벤트는 doneChunks +1 + totalChunks를 max로 갱신, `done`은 잡 종료 + overview/global-menus 캐시 invalidate. 같은 GET snapshot 1회 + SSE 머지 모양을 그대로 따름.
- **2026-05-15** in [[../topics/crawl]] / [[../topics/shared]] (`packages/shared/src/hooks/useCrawl.ts` `useDiningcodeBulkSaveJob(jobId)`): 다이닝코드 일괄 저장 잡 진행. `snapshot`은 잡 캐시 통째 set, `item` 이벤트는 vRid 매치해 items 배열 patch + doneCount/failedCount/skippedCount 재계산, `done`은 state/finishedAt patch + `['crawl','diningcode-registered']`/`['restaurant','list']`/`['canonical','proposals']` 캐시 invalidate. menu-grouping의 `useGroupingJob` 과 거의 한 글자 다른 카피 — 패턴이 머지 카피되는 첫 사례. 어드민이 N개 vRid 일괄 저장 중 새 가게가 등록될 때마다 결과 카드의 '등록됨' 배지가 별도 GET 없이 갱신.

## What This Means

이 패턴이 알려주는 것:

1. **SSE 페이로드의 "완전성"이 RTT를 결정한다** — 이벤트가 단순 신호("뭔가 바뀜")이면 클라가 GET을 다시 쏴야 하고, 그게 N번이면 N×RTT. 페이로드를 완성시키면 0×RTT. 서버가 한 번 만든 데이터를 어차피 캐시에 쓸 거라면, 그 데이터를 그대로 이벤트에 실어 보내는 게 거의 항상 옳다.
2. **TanStack Query는 이 패턴의 1차 인프라** — `setQueryData` 콜백 형태(`(prev) => merged`)가 dedupe + prepend + 부분 패치 같은 머지 로직을 명료하게 표현. 캐시 키 컨벤션(`['restaurant', 'list']`, `['restaurant', placeId]`)도 패치 위치를 결정.
3. **머지의 안전망은 server-assigned id** — `persistedReviews`가 server id를 가져야 클라가 이미 가진 row와 dedupe할 수 있다. server id 없이 `externalId`만으로 머지하면 race에서 깨짐. 페이로드 설계가 직접 머지의 가능 여부를 좌우한다.
4. **invalidate는 마지막 카드** — `done` 같은 종료 이벤트에서만 list cache invalidate를 친다. 전체 새로고침 비용을 가장 마지막에 한 번만 지불하는 룰.
5. **이젠 6번째·7번째 인스턴스 — 모든 잡 진행 UI가 같은 모양** — 리뷰 크롤(`useCrawlJobStream`), 요약(`useRestaurantSummaryEvents`), 메뉴 그룹핑(`useGroupingJob`), 전역 머지(`useGlobalMergeJob`)까지 전부 같은 골격을 공유한다: **GET snapshot 1회로 초기 상태 시드 → SSE가 부분 업데이트를 push → `useQueryClient().setQueryData`로 머지 → `done`에서만 invalidate**. `setQueryData`가 이 패턴의 핵심 도구로 굳었음.
6. **흥미로운 변형: 잡 단위 훅은 공유 매니저를 거치지 않는다** — `summarySseManager`처럼 placeId×endpoint 멀티플렉싱이 필요한 경우엔 공유 매니저를 둔다. 반면 `useGroupingJob` / `useGlobalMergeJob`은 jobId가 곧 구독 단위라 훅 안에서 EventSource 라이프사이클을 직접 관리(재연결 백오프, closedRef 가드, jobId effect dep). 같은 패턴이지만 multiplex 필요 여부에 따라 인프라 층이 갈리는 두 갈래 모양으로 정착했다.

이 패턴이 깨질 수 있는 시점:
- **페이로드가 너무 무거워질 때** — 한 이벤트가 MB 단위가 되면 SSE가 백프레셔를 못 쳐서 서버 메모리 누적. 리뷰 본문 500자 컷 같은 상한이 이 균형의 일부.
- **캐시 키 모양이 바뀔 때** — list 행과 detail의 key 모양이 달라지면 `setQueryData` 콜백이 모두 깨짐. 키는 `@repo/shared`의 hooks에서 한 곳에 집중시키는 게 절대적.
- **머지 dedupe 키가 race에 약할 때** — 같은 row가 두 번 prepend되거나, 네트워크 재연결 직후 lastSeq 불일치로 같은 이벤트를 두 번 적용할 위험. `seq` 기반 dedupe(crawl) + `id` 기반 set 검사(visitor_batch)가 두 단계 안전망.

## Sources

- [[../topics/crawl]]
- [[../topics/friendly]]
- [[../topics/shared]]
- [[../topics/web]]
