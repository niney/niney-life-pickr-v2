---
concept: 조회를 "대상" 에 묶는다 — 대상이 정해진 뒤 시작하고, 같은 대상일 때만 이전 결과를 보이고, 대상이 떠나면 끊는다
last_compiled: 2026-10-10
topics_connected: [web, shared, mobile, crawl, canonical, logs, tour, menu-grouping, weather, air-quality, parking, housing, life-map, subway, bus, meal, settlement, map]
status: active
---

# 조회를 "대상" 에 묶는다 — 대상이 정해진 뒤 시작하고, 같은 대상일 때만 이전 결과를 보이고, 대상이 떠나면 끊는다

## Pattern

웹 프론트 성능 라운드(2026-10-05, `3d294304`..`c5052742` 14커밋)는 화면마다 "헛조회" 를 걷어 냈는데, 고친 자리를 모아 보면 원인은 거의 하나다 — **React Query 쿼리가 "무엇에 대한 조회인가(대상)" 를 모른 채 "언제 조회할 수 있는가(마운트·키 변경)" 에만 반응했다.** 그래서 대상이 아직 정해지지 않았는데 기본값(서울·전국)으로 먼저 받았다가 버리고, 다른 대상으로 넘어갔는데 직전 대상의 결과를 placeholder 로 보여 주고, 지도가 이미 떠난 범위의 요청을 끝까지 받아 쌓았다.

처방은 쿼리의 수명을 **대상의 수명**에 맞추는 네 가지로 반복됐다. (1) **정해진 뒤 시작** — 저장 위치·지도 범위처럼 대상을 결정하는 값이 확정될 때까지 `enabled: false`(상한 시간을 두고). (2) **같은 대상일 때만 이전 결과** — `placeholderData: (prev, previousQuery) => previousQuery?.queryKey[i] === 지금 대상 ? prev : undefined`, 즉 필터·정렬·페이지만 바뀌면 흐리게 유지하고 대상이 바뀌면 빈 상태로. (3) **떠나면 끊는다** — queryFn 의 `signal` 을 fetch 까지 넘겨 지도가 다시 움직이면 이전 요청을 abort, 지나간 범위의 결과는 짧게(60초)만 보관. (4) **보일 때 시작** — 화면 밖 섹션은 `useInViewOnce`(IntersectionObserver)로 처음 보일 때 조회.

## Instances

- **2026-10-05** in [weather](../topics/weather.md) / [air-quality](../topics/air-quality.md) / [parking](../topics/parking.md) (`03bc43f0`): **정해진 뒤 시작** — URL 에 위치가 없으면 저장 위치(로그인은 서버 조회)를 받은 뒤 조회한다. 예전엔 서울로 먼저 받았다가 저장 위치로 전부 다시 받았다. 화면 변화: 로그인 사용자가 URL 없이 들어오면 서울 화면 대신 로딩이 먼저 보인다 — 잠깐의 로딩이 "틀린 대상의 화면" 보다 낫다는 선택.
- **2026-10-05** in [canonical](../topics/canonical.md) / [web](../topics/web.md) (`14f48e16`, `RestaurantsV2Page`): 첫 맛집 목록은 bbox 가 정해질 때까지 미루고 **상한 800ms** 뒤엔 전역 목록으로 — 전국 80건을 받았다 버리지 않게. 상세·인사이트는 lazy 청크와 나란히 미리 조회(`RestaurantDetailWarmup` — 아무것도 그리지 않는 선조회 컴포넌트), 홈 탭 주차 한 줄은 "영업 정보" 가 화면에 들어온 뒤에만(`useInViewOnce`).
- **2026-10-05** in [shared](../topics/shared.md) / [crawl](../topics/crawl.md) / [logs](../topics/logs.md) / [tour](../topics/tour.md) / [menu-grouping](../topics/menu-grouping.md) (`14f48e16`·`e50ccfe6`·`c5052742`): **같은 대상일 때만 이전 결과** — `useCrawl`(검색어 `queryKey[2]`)·`useRestaurant`(식당 `placeId` — 옵트인 `keepPrevious`)·`useLogs`·`useMenuGrouping`·`useTour` 의 `placeholderData` 가 `previousQuery.queryKey` 의 대상 칸을 비교한다. 예전 `keepPreviousData` 는 다른 식당으로 넘어가도 직전 식당의 리뷰를 흐리게 보여 줬다. `keepPrevious` 가 옵트인인 것은 **공유 훅의 기본값은 앱 동작을 바꾸지 않고 웹이 골라 쓴다**는 원칙([platform-ui-split](platform-ui-split.md)).
- **2026-10-05** in [housing](../topics/housing.md) / [life-map](../topics/life-map.md) / [parking](../topics/parking.md) / [map](../topics/map.md) (`086e4510`, `viewportQueryAbort.test.tsx`): **떠나면 끊는다** — 뷰포트 조회의 `signal` 을 shared API 함수의 fetch 까지 넘겨 지도를 다시 움직이면 이전 요청을 끊고, points 결과는 `VIEWPORT_GC_MS` 60초만 보관(팬 횟수만큼 최대 4,000점씩 쌓이던 것). 서버 쪽에서 응답 하나의 크기를 묶은 [amplification-caps](amplification-caps.md) 의 클라이언트 짝 — 서버는 한 요청을, 클라이언트는 요청의 개수와 수명을 묶는다.
- **2026-10-05** in [subway](../topics/subway.md) / [bus](../topics/bus.md) (`086e4510`): 대상이 "지금 보는 뷰" 인 폴링 — 지하철 도착 30초 폴링은 시간표·길찾기 뷰에서 끄고 돌아오면 즉시 한 번 다시 받는다. 버스·지하철 마커는 "따라가기 대상" 만 memo 의존으로 두어 폴링 리렌더마다 마커를 다시 만들고 `fitToMarkers` 가 지도를 끌고 가던 것을 끊었다.
- **2026-10-05** in [meal](../topics/meal.md) / [settlement](../topics/settlement.md) (`03bc43f0`·`82d455c7`): 식단 목록·영양 탭 기간 전환은 조건이 바뀌는 동안 이전 목록을 흐리게 유지하되 로딩·오류는 목록 칸 안에서만(검색창이 언마운트돼 포커스를 잃던 것), 사진은 화면 가까이 온 것만. 정산은 `enabled` 와 "null 키" 를 분리 — 꺼진 쿼리를 `null` 키로 표현하자 실제 슬롯 키와 겹쳐 **수정 모드에서 다른 정산의 초안이 덮어쓰던** 버그가 났다(대상 없음 ≠ 대상이 null).
- ⚠️ **앱은 아직** in [mobile](../topics/mobile.md): 앱 `ContactSuggestions.tsx`·`ContactPickerSheet.tsx` 는 훅을 `open` 검사보다 먼저 불러 닫힌 행마다 단골을 조회하고(웹만 `enabled` 로 고침), 앱 QueryClient 는 `retry: 1` 이라 4xx 도 재시도한다(웹만 무재시도, `3d294304`).

## What This Means

1. **쿼리 키는 "무엇을" 이지만 대상은 그중 한 칸이다** — 키에는 대상(식당·검색어·위치)과 보기 옵션(필터·정렬·페이지)이 섞여 있다. 키 전체로만 판단하면 "옵션이 바뀐 것" 과 "대상이 바뀐 것" 을 구분 못 해, 흐린 이전 화면이 틀린 대상의 화면이 된다. 대상 칸을 명시적으로 비교하는 `placeholderData` 가 그 구분을 코드로 적는 방법이다.
2. **기본값으로 먼저 받는 것은 공짜가 아니다** — "일단 서울로 보여 주고 나중에 바꾸자" 는 요청 2배, 화면 깜박임, 그리고 공공 API 쿼터([quota-proportional-loading](quota-proportional-loading.md))를 쓴다. 대상을 기다리는 시간에 상한(800ms)을 두면 첫 화면 지연도 묶을 수 있다.
3. **떠난 대상의 요청은 서버에도 비용이다** — abort 는 클라이언트 메모리만 아끼는 게 아니라 서버가 그 응답을 직렬화·전송하는 일을 줄인다(지도 셀·점 응답은 수십 KB~MB). 서버 상한(셀 6,000·점 강등)과 클라이언트 취소가 같은 화면의 양쪽 끝이다.
4. **"없음" 의 표현을 고르는 것도 대상 설계다** — 꺼진 쿼리를 `null` 키로 두면 `null` 이 실제 대상 값과 겹친다. `enabled` 로 끄고 키는 대상 그대로 두는 것이 안전하다([unknown-vs-zero](unknown-vs-zero.md) 의 "모름과 없음" 이 클라이언트 쿼리에 나타난 모양).
5. **공유 훅은 웹·앱이 같이 쓰지만 이 규율은 웹만 받았다** — 옵트인 기본값 원칙 덕에 앱 동작은 안전하게 그대로지만, 같은 이유로 앱의 헛조회도 그대로다. 앱에 같은 라운드를 돌 때 이 컨셉의 네 가지가 점검표가 된다.

## Sources

- [web](../topics/web.md)
- [shared](../topics/shared.md)
- [mobile](../topics/mobile.md)
- [crawl](../topics/crawl.md)
- [canonical](../topics/canonical.md)
- [logs](../topics/logs.md)
- [tour](../topics/tour.md)
- [menu-grouping](../topics/menu-grouping.md)
- [weather](../topics/weather.md)
- [air-quality](../topics/air-quality.md)
- [parking](../topics/parking.md)
- [housing](../topics/housing.md)
- [life-map](../topics/life-map.md)
- [subway](../topics/subway.md)
- [bus](../topics/bus.md)
- [meal](../topics/meal.md)
- [settlement](../topics/settlement.md)
- [map](../topics/map.md)
- [packages/shared/src/hooks/useRestaurant.ts](../../packages/shared/src/hooks/useRestaurant.ts)
- [packages/shared/src/hooks/useCrawl.ts](../../packages/shared/src/hooks/useCrawl.ts)
- [apps/web/src/test/viewportQueryAbort.test.tsx](../../apps/web/src/test/viewportQueryAbort.test.tsx)
- [apps/web/src/components/restaurant/detail/useInViewOnce.ts](../../apps/web/src/components/restaurant/detail/useInViewOnce.ts)
- [amplification-caps](amplification-caps.md)
- [quota-proportional-loading](quota-proportional-loading.md)
- [platform-ui-split](platform-ui-split.md)
- [unknown-vs-zero](unknown-vs-zero.md)
