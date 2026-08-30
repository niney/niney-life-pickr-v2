---
concept: 저장한 내 위치 1곳 — 원시 좌표 저장 + 조회 시 해석 + 다도메인 글랜스
last_compiled: 2026-08-30
topics_connected: [air-quality, weather, life-map, meal, shared, web, mobile]
status: active
---

# 저장한 내 위치 1곳 — 원시 좌표 저장 + 조회 시 해석 + 다도메인 글랜스

## Pattern

2026-08-21 대기정보에서 시작한 "내 위치 저장"이 한 주 만에 날씨·일상지도·식단 추천·앱 홈까지 번지면서 하나의 결합점이 됐다: **사용자당 위치는 정확히 1곳만 저장하고, 저장하는 것은 원시 좌표 + 라벨 + 출처(`source`)뿐이며, 그 위치가 무엇을 뜻하는지(가장 가까운 측정소·기상 격자·날씨 지점·지도 중심)는 저장하지 않고 조회하는 도메인이 그때그때 계산한다.** 저장소는 게스트 persist(`airLocationStore`, 키 `air-location-v1`, injectableStorage 주입) + 로그인 서버 1행(`air_user_locations`, `userId` PK)의 하이브리드인데, 값이 1개라 [guest-server-hybrid](guest-server-hybrid.md)의 union 병합 대신 **서버 우선 + 게스트 값 1회 업로드**(서버가 비어 있을 때만 PUT, 성공 시 로컬 clear)로 단순화됐다.

소비자는 네 도메인이다 — 대기 페이지의 기본 측정소(`nearby?limit=1&radius=50000`), 날씨 페이지의 기본 진입 지점(`resolveLocation`), 일상지도의 초기 중심·보라 점 오버레이, 식단 추천의 실시간 날씨 좌표. 그리고 **상주 표면** 둘 — 웹 상단바 `MyLocationChip`(날씨·대기 통합 알약)과 앱 홈 `MyLocationCard` — 이 공용 파생 훅 `useMyLocationGlance`(위치 1곳으로 `useWeatherNowcast(latLngToKmaGrid)` + `useAirNearbyStations(limit 1, 50km)`를 묶어 `{weather, air}` 한 객체로 냄)를 같은 값으로 소비하고 표기만 플랫폼 분기한다. 글랜스 규율도 공유된다: 통합지수 결측이면 PM2.5→PM10 등급으로 폴백, 자료가 없는 세그먼트는 조용히 생략(`● -` 금지), 10분 주기 조용한 갱신은 도메인 훅이 하고 `refetchOnWindowFocus`는 상주 표시만 켠다.

`source` 어휘가 저장소의 역사를 그대로 보여준다: `geolocation`·`manual`(a4284aa) → 대기 측정소를 그대로 저장하는 `station`(aa3a09e) → 날씨 지점 `place`(7704f8c). 저장소 이름은 `air*`로 남았지만 실체는 "내 위치" 저장소다.

## Instances

- **2026-08-22** in [mobile](../topics/mobile.md) / [shared](../topics/shared.md) (`e348032`): 웹 `MyLocationChip` 안에 있던 파생 로직을 `packages/shared/src/hooks/useMyLocationGlance.ts` 로 승격하고 앱 홈 `MyLocationCard` 가 같은 훅을 소비. 앱은 `api-setup.ts` 에서 `setAirLocationStorage(AsyncStorage)` 로 저장소를 주입(injectableStorage 1회 캡처 함정 준수).
- **2026-08-22** in [meal](../topics/meal.md) (`acb3206`): 식단 추천이 저장 위치 좌표로 실시간 날씨를 붙임 — 단, `meal-recommendation.route.ts` 가 **별도 `WeatherService` 인스턴스**를 만들어 발표 슬롯 캐시·일일 쿼터 카운터가 `/weather` 라우트와 분리된다(같은 키를 두 카운터가 나눠 씀).
- **2026-08-21** in [life-map](../topics/life-map.md) (`1d92acb`): 일상지도 초기 중심을 저장 위치로 잡고 보라 점 오버레이로 표시 — 저장소를 쓰기만 하고 갱신하지 않는 순수 소비자.
- **2026-08-21** in [web](../topics/web.md) (`9e197d3`·`4d35a57`·`a062e7d`): 대기 전용 `AirLocationChip` 삭제 → 날씨·대기 통합 알약 `MyLocationChip`. 통합지수 결측 폴백 규칙, `<sm` 에서 축약 표기(상단바 폭 예산).
- **2026-08-21** in [weather](../topics/weather.md) (`7704f8c`): 날씨 지점 선택이 같은 저장소에 `source='place'` 로 저장돼 대기 페이지와 "내 위치"가 동기화. 광역시 구·군 지점 74개 추가로 245지점.
- **2026-08-21** in [air-quality](../topics/air-quality.md) (`a4284aa`·`aa3a09e`·`26947ba`): 저장소 신설 — `AirUserLocation` 모델(주석: "해석은 저장하지 않고 조회 시 계산"), `airLocationStore` + `useAirLocation` 하이브리드, 선택 측정소 그대로 저장 버튼(`station`), 10분 조용한 갱신.

## What This Means

1. **위치 기반 도메인을 붙일 때 반드시 지나가는 자리다.** 새 도메인(예: 근처 병원 알림, 교통 출발지)이 "기본 위치"가 필요하면 자기 저장소를 만들지 말고 `useAirLocation` 을 읽는 것이 이 리포의 규약이 됐다. 네 번째 소비자(식단)까지 한 저장소로 수렴했다는 사실이 그 규약의 증거다.
2. **원시 좌표만 저장하는 결정이 드리프트를 흡수한다.** 측정소가 신설·폐지되거나 날씨 지점표가 바뀌어도 저장 데이터는 무효화되지 않는다 — 해석이 조회 시점의 마스터를 따라가기 때문. 대신 매 조회가 최근접 계산을 반복하므로 `nearby` 응답 캐시(대기 10분)가 실질적 비용 방어다.
3. **이름이 역사를 따라가지 못했다.** `airLocationStore`·`air_user_locations`·`Routes.AirLocation` 은 이제 날씨·일상지도·식단이 함께 쓰는 "내 위치" 저장소다. 리네임(`userLocation*`)은 계약·마이그레이션·앱 저장 키(`air-location-v1`)를 함께 옮겨야 해 미뤄졌다 — 새 소비자가 생길수록 비용이 커지는 부채.
4. **글랜스 규율은 코드가 아니라 훅에 산다.** "없으면 생략·폴백 순서·갱신 주기"가 `useMyLocationGlance` 한 곳에 있어 웹/앱이 어긋날 수 없다 — [platform-ui-split](platform-ui-split.md)의 "로직 승격 + 표현만 분기" 정석. 반대로 식단 추천은 훅을 거치지 않고 서버에서 `WeatherService` 를 따로 세워 쿼터 회계가 갈라진 예외다 — 위치 공유는 됐지만 **날씨 조회 경로 공유**는 아직 아니다.

관련: [guest-server-hybrid](guest-server-hybrid.md) — 저장 방식의 단일값 변형(서버 우선·1회 업로드). [quota-proportional-loading](quota-proportional-loading.md) — 글랜스의 10분 조용한 갱신·focus refetch 제한이 대기(일 500)·날씨(일 10,000) 예산을 상주 표시가 잠식하지 않게 하는 장치. [platform-ui-split](platform-ui-split.md) — 칩/카드 표기 분기.

## Sources

- [air-quality](../topics/air-quality.md)
- [weather](../topics/weather.md)
- [life-map](../topics/life-map.md)
- [meal](../topics/meal.md)
- [shared](../topics/shared.md)
- [web](../topics/web.md)
- [mobile](../topics/mobile.md)
- [guest-server-hybrid](guest-server-hybrid.md)
- [platform-ui-split](platform-ui-split.md)
- [quota-proportional-loading](quota-proportional-loading.md)
