---
concept: cross-tab-async-job-toast
last_compiled: 2026-06-25
topics_connected: [shared, web, mobile, review-search]
status: active
---

# 탭을 가로지르는 비동기 잡 토스트

## Pattern

오래 걸리는 비동기 잡(공개 리뷰 QA, 어드민 단건 재요약)의 **진행 상태와 결과를 React 컴포넌트 트리 바깥의 전역 스토어(zustand 싱글톤)** 에 둔다. 잡 수명을 UI 수명에서 분리하는 것이 목적이다 — 잡을 트리거한 화면(식당 상세 Ask 탭, ReviewsTab)을 떠나 탭을 옮기거나 카드를 닫거나 페이지를 이동해도 진행/결과가 증발하지 않게 한다. App 루트에 정확히 1개만 상주하는 **render-null watcher 컴포넌트**가 그 스토어를 구독하다 완료 신호를 잡아 토스트(웹 sonner) / 배너(앱 reanimated 자작)로 알린다. 단, **잡을 트리거한 그 화면을 지금 보고 있으면 알림을 생략**한다(인라인으로 이미 결과가 떠 있으므로 노이즈 방지).

두 가지 변형이 같은 골격을 공유한다:

- **(a) store-가-직접-fetch** — 스토어 액션이 컴포넌트 밖에서 직접 HTTP 를 await 한다. 컴포넌트 언마운트와 무관하게 응답이 도착한다.
- **(b) 목록만 + watcher-가-SSE-구독** — 스토어는 진행 중 잡 목록만 들고, watcher 가 그 잡들의 채널을 SSE 구독해 완료를 처리한다.

두 변형 모두 렌더 출력 없는 watcher 가 완료를 가로채 토스트를 1회만 띄운다는 점, 그리고 알림 UI 만 [[platform-ui-split]] 로 분기한다는 점이 같다. 이는 서버가 잡을 in-memory 싱글톤으로 게이팅하는 [[in-memory-singleton-gates]] 의 **클라이언트 측 거울**이다.

## Instances

- **2026-06-25** in [[../topics/shared]] / [[../topics/web]] / [[../topics/mobile]] / [[../topics/review-search]] (변형 a — **공개 리뷰 QA**, store-가-직접-fetch): [reviewAskStore.ts](../../packages/shared/src/stores/reviewAskStore.ts) 는 답변이 LLM 3콜로 15초+ 걸리는 공개 질문을 추적한다. 핵심은 스토어 액션 `ask(placeId, query)` 가 컴포넌트 안이 아니라 **스토어 안에서 곧장 `reviewSearchApi.publicAsk` 를 await** 한다는 것 — 트리거한 AskTab 이 언마운트돼도 응답이 도착한다. 상태는 `inFlight`(진행 중, 메모리) / `lastByPlace`(식당별 마지막 Q&A, 영속) / `freshThisSession`(이번 세션에 직접 물어봤는지 — 복원된 '지난 답변'과 방금 받은 답을 구분, 메모리) / `errorByPlace`(메모리) / `completion`(seq 증가하는 완료 이벤트, 메모리) / `visiblePlaceId`(지금 보고 있는 Ask 탭). 같은 식당이 이미 `inFlight` 면 무시(중복 제출 방지). 영속은 식당별 마지막 `{질문, 답변, answeredAt}` 만(`partialize: lastByPlace`, persist `review-ask-v1`, `MAX_KEPT=20` 식당 cap by answeredAt) — 진행 중·완료 이벤트·에러는 메모리(하드 리로드하면 in-flight HTTP 가 어차피 죽으므로 영속화 무의미). storage 어댑터는 `setReviewAskStorage(adapter)` lazy resolver(웹 localStorage 자동 / 앱 AsyncStorage 주입 / NO_OP) — `settlementDraftStore` 의 주입 철학과 동일([[platform-ui-split]] 의 storage-adapter-주입 자매 패턴).
  - **알림 UI 분기**: 웹 [ReviewAskToaster.tsx](../../apps/web/src/components/ReviewAskToaster.tsx) 는 `completion.seq` 를 `useRef` 로 추적해 같은 이벤트를 **정확히 1회**만 sonner 토스트한다(성공 → '더보기', 실패 → '다시 보기'). 앱 [ReviewAskBanner.tsx](../../apps/mobile/src/components/ReviewAskBanner.tsx) 는 같은 `completion` 을 구독하지만 **앱엔 지속형 토스트 인프라가 없어** reanimated 로 하단 슬라이드 배너를 자작한다(`withTiming` + `runOnJS`, 8초 자동 닫힘, AnimatedSplash 와 동일 계열). '더보기' → `?tab=ask` deep link(웹 `/restaurants/:placeId?tab=ask`, 앱 `/restaurant/:placeId?tab=ask` — 라우트 prefix 가 web/app 다름).
  - **suppress 판정도 플랫폼 분기**: "지금 그 식당 Ask 탭을 보고 있으면 생략" 을 웹은 `window.location` 을 **직접 읽어**(pathname endsWith placeId + `?tab=ask`) 판정하고 — `useLocation` 을 구독하면 매 네비게이션마다 effect 재실행 + ref-during-render 가 생기므로 의도적으로 회피 —, 앱은 `useReviewAskStore.getState().visiblePlaceId` 를 직접 읽어 판정한다. 그 `visiblePlaceId` 는 앱 AskTab 이 마운트/언마운트 시 `setAskTabVisible(placeId, true/false)` 로 갱신([apps/mobile/src/components/restaurantDetail/AskTab.tsx](../../apps/mobile/src/components/restaurantDetail/AskTab.tsx)) — RN 은 탭 전환 시 탭이 언마운트되므로 마운트 = visible 로 신뢰 가능.

- **2026-06-25** in [[../topics/shared]] / [[../topics/web]] (변형 b — **어드민 단건 재요약**, 목록만 + watcher-SSE-구독): [resummarizeStore.ts](../../packages/shared/src/stores/resummarizeStore.ts) 는 큐+SSE 로 수 초 걸리는 단건 재요약을 추적한다. 스토어는 `items: Record<reviewId, {reviewId, placeId, prevSentiment, model}>` **목록만** 들고 `add`/`remove` 만 가진다 — **persist 없음(메모리 전용)**, fetch 도 하지 않는다. 진짜 일은 watcher 훅 `useResummarizeWatcher`([packages/shared/src/hooks/useRestaurant.ts](../../packages/shared/src/hooks/useRestaurant.ts)) 가 한다: 스토어의 distinct placeId 들을 안정 키(`sort().join(',')`)로 묶어 `summarySseManager.subscribe({kind:'place', placeId})` 로 SSE 구독하고, `onReview` 이벤트가 오면 `useResummarizeStore.getState().items[ev.reviewId]` 로 우리가 트리거한 잡인지 확인(아니면 무시) 후 — (1) `onResult` 콜백 호출(호출자가 토스트), (2) 공개 캐시(`['restaurant','public', placeId]` / `reviews` / `insights`) invalidate(보이는 화면이면 즉시 갱신), (3) store 에서 `remove`(버튼 잠금 해제). 트리거 측 `useResummarizeReview` 의 `resummarize(...)` 는 `add(...)` 후 mutation 을 쏘고, POST 큐잉 실패 시 `onError` 로 `remove` 해 잠금 해제.
  - **알림 UI**: 웹 [ResummarizeToaster.tsx](../../apps/web/src/components/ResummarizeToaster.tsx) 가 `useResummarizeWatcher({ onResult })` 로 완료를 토스트. 재분류로 그 리뷰가 현재 필터(예: 부정)에서 사라지기 직전, SSE 가 실어온 새 분석을 `prevSentiment` 와 비교해 **"부정 → 긍정" 델타** + 만족도 + 모델로 보여준다. ReviewsTab 을 떠나도(탭/페이지 이동) 동작. **앱엔 대응 컴포넌트가 없다** — 어드민 화면 자체가 web-only 이므로([[platform-ui-split]] 의 "어드민은 web-only" 인스턴스), 앱 `_layout.tsx` 루트에는 `ReviewAskBanner` 만 상주하고 ResummarizeToaster 는 없다.

- **두 변형의 대비 — 잡의 "본체"가 어디 사느냐**: (a) reviewAsk 는 **스토어가 곧 잡 실행자**(액션이 fetch 를 소유) — 완료 신호는 스토어 내부 `completion.seq` 증가, watcher 는 그 변화만 감지하는 얇은 소비자. (b) resummarize 는 **스토어는 등록부일 뿐**(목록만), 잡 본체는 서버 큐에서 돌고 watcher 가 SSE 로 완료를 끌어온다 — watcher 가 캐시 무효화·remove 까지 책임지는 두꺼운 소비자. 그래서 (a) 는 영속(앱 재시작 후에도 마지막 답 복원)하고 (b) 는 메모리만(진행 중 SSE 가 리로드로 끊기면 잡 자체가 의미 없음)이다. 공통점은 **렌더 출력 없는 watcher 가 App 루트에 정확히 1개** — 여러 곳에 마운트하면 같은 완료가 중복 토스트되거나 SSE 가 중복 구독된다(단일 마운트 계약).

## What This Means

긴 LLM 잡(15초+, 또는 큐+SSE 수 초)을 컴포넌트 state 에 두면, 사용자가 탭을 옮기거나 카드를 닫거나 페이지를 이동하는 **그 순간 진행 상태와 결과가 증발한다**. React 트리 안에 사는 데이터는 트리가 사라지면 같이 사라지기 때문이다. 이 패턴은 잡의 수명을 UI 수명에서 떼어내려고 데이터를 React 바깥 zustand 싱글톤에 둔다 — 컴포넌트가 죽어도 스토어는 산다.

이는 서버 측 [[in-memory-singleton-gates]] 의 **클라이언트 거울**이다. 서버가 "이 잡은 이미 한 인스턴스가 돌고 있으니 게이팅" 을 in-memory 싱글톤으로 관리하듯, 클라이언트는 "이 잡은 진행 중이고 결과는 여기 있다" 를 zustand 싱글톤으로 관리한다. 양쪽 다 **잡의 진행을 그것을 요청한 요청/컴포넌트의 수명보다 길게** 살린다는 같은 문제를 푼다 — `inFlight`/`items` 의 중복 제출 차단(같은 placeId/reviewId 가 이미 진행 중이면 무시)이 그 게이팅의 클라 측 표현이다.

설계상 의식적으로 박아둔 판단:

1. **공통은 데이터 골격, 분기는 알림 UI** — 스토어(`@repo/shared/stores`)와 watcher 훅은 1벌이고, 알림 표현만 [[platform-ui-split]] 로 갈라진다(웹 sonner 토스트 ↔ 앱 reanimated 자작 배너 — 앱엔 지속형 토스트 인프라가 없어서). 같은 결의 분기가 **suppress 판정**에도 적용됐다: 웹은 `window.location` 직접 읽기(useLocation 구독 회피), 앱은 store `visiblePlaceId`(탭 마운트로 갱신). 같은 약속("보고 있는 화면이면 생략")을 두 플랫폼이 각자 인프라로 충족.
2. **watcher 는 정확히 1개** — render-null watcher 를 App `<Routes>` **바깥** 최상위에 둔다. Route 안에 두면 페이지 전환 시 언마운트돼 진행 중 watcher 가 끊긴다. 여러 곳에 마운트하면 중복 토스트/중복 SSE 구독. (2026-06-25, web 토픽의 명시 계약.)
3. **답이 캐시가 아니라 store 에 갇힌다는 함정** — reviewAsk 의 답변은 `['review-qa', ...]` React Query 캐시가 아니라 `lastByPlace[placeId]` 에 산다(탭 떠나도 살아남게 하려고 mutation 대신 store.ask 를 씀). mutation 훅과 store 를 헷갈리면 답이 어디 있는지 잃는다.

이 패턴은 SSE 이벤트로 캐시를 패치하는 [[stream-driven-cache-merge]] 와도 인접하다 — 변형 (b) 의 watcher 는 완료 SSE 를 받아 토스트만 띄우는 게 아니라 공개 detail/reviews/insights 캐시를 invalidate 해, 보고 있는 화면이면 토스트와 동시에 데이터도 갱신된다.

깨질 수 있는 위험:
- **watcher 를 Routes 안/여러 곳에 마운트** — 위 계약 위반. 진행 중 잡이 끊기거나 중복 토스트.
- **store.ask 와 mutation 훅 혼동** — 답이 캐시에 없고 store 에 있다는 걸 놓치면 "답이 사라졌다" 로 오인.
- **앱 visiblePlaceId race** — AskTab 언마운트 순서가 꼬여 다른 placeId 가 이미 visible 인데 덮어쓰면 오판정. `setAskTabVisible` 는 "다른 placeId 가 이미 visible 이면 건드리지 않음" 가드로 방어.
- **앱에 ResummarizeToaster 가 없다는 비대칭** — 어드민이 web-only 라 의도된 것이지만, 앱에 단건 재요약 UI 가 생기면 watcher 마운트를 잊으면 알림이 안 뜬다.

## Sources

- [[../topics/shared]]
- [[../topics/web]]
- [[../topics/mobile]]
- [[../topics/review-search]]
- [reviewAskStore.ts](../../packages/shared/src/stores/reviewAskStore.ts)
- [resummarizeStore.ts](../../packages/shared/src/stores/resummarizeStore.ts)
- [useRestaurant.ts (useResummarizeWatcher / useResummarizeReview)](../../packages/shared/src/hooks/useRestaurant.ts)
- [ReviewAskToaster.tsx (web)](../../apps/web/src/components/ReviewAskToaster.tsx)
- [ResummarizeToaster.tsx (web)](../../apps/web/src/components/ResummarizeToaster.tsx)
- [ReviewAskBanner.tsx (mobile)](../../apps/mobile/src/components/ReviewAskBanner.tsx)
- [AskTab.tsx (mobile — setAskTabVisible)](../../apps/mobile/src/components/restaurantDetail/AskTab.tsx)
- [[in-memory-singleton-gates]]
- [[platform-ui-split]]
- [[stream-driven-cache-merge]]
