---
concept: 게스트 로컬 + 로그인 서버 하이브리드
last_compiled: 2026-08-30
topics_connected: [bus, subway, web, shared, vote, settlement, air-quality, weather, mobile]
status: active
---

# 게스트 로컬 + 로그인 서버 하이브리드

## Pattern

"로그인 없이도 쓰게 하되, 로그인하면 잃지 않게 한다"는 요구가 도메인마다 반복되면서 한 가지 구조가 표준이 됐다: **비로그인 상태는 zustand persist(웹 localStorage / 앱 AsyncStorage 주입) 로컬 스토어**가 담당하고, **로그인 상태는 React Query 로 서버 목록**을 다루며, **로그인 직후 1회 로컬→서버 union 병합(sync) 후 로컬을 비운다**. 훅 하나(`useXxxFavorites`)가 두 세계를 단일 인터페이스로 감싸 화면은 로그인 여부를 모른다. 서버 변경 응답은 항상 "변경 후 전체 목록"이라 클라이언트는 diff 없이 캐시를 통째로 교체한다.

파생 규약도 함께 굳었다: 저장 항목은 마스터와 FK 로 묶지 않는 **스냅샷**(어드민 삭제/재크롤에도 생존), 상한(100) 도달 시 무동작 + false 반환(UI 안내 근거), 401 로 세션이 풀리면 자연히 게스트 모드 폴백, 페이지(라우트)당 훅 1회 호출 원칙(sync effect 중복 방지).

## Instances

- **2026-07-04** in [bus](../topics/bus.md): 원형 확립 — busFavoriteStore(게스트) + useBusFavorites(하이브리드) + sync union 병합. StrictMode 이중 실행 가드(syncedRef)와 pending 연타 방어(ref Set)도 여기서 정립.
- **2026-07-06** in [subway](../topics/subway.md): 1:1 이식(역/역×호선 2종). 패턴이 "복사 가능한 템플릿"임이 증명됨.
- **2026-07-13** in [web](../topics/web.md)/[shared](../topics/shared.md): 맛집 즐겨찾기(`56b1c22`) — 대상 1종(placeId)이라 절반 규모로 미러. 좌표 nullable(식당 마스터가 nullable)이라는 도메인 차이만 계약에 반영.
- **2026-08-16** in [vote](../topics/vote.md): 변형 적용 — 서버 병합이 **없는** 순수 게스트 스토어(voteGuestStore). voterKey(기기 영속 UUID)가 서버 유니크 키의 반쪽이 되고, "내 찬성 목록" 조회 API 를 안 만드는 대신 재방문 복원을 전적으로 로컬 기록에 맡긴다 — 하이브리드의 로컬 절반만 떼어 쓴 사례.
- **2026-08-17** in [shared](../topics/shared.md): 패턴의 숨은 결함 발견·수복(`7520859`) — 모든 스토어가 쓰던 storage lazy resolver 가 실은 **앱 주입을 전혀 반영하지 못했다**(createJSONStorage 의 1회 캡처 × ESM 평가 순서). injectableStorage(지연 위임 + 주입 시 rehydrate)로 전 스토어 통일.
- **2026-08-21~22** in [air-quality](../topics/air-quality.md) / [weather](../topics/weather.md) / [mobile](../topics/mobile.md): **단일값 변형** — "내 위치" 는 사용자당 1곳이라 union 병합이 성립하지 않는다. `airLocationStore`(게스트 persist `air-location-v1`, injectableStorage) + 서버 `air_user_locations`(`userId` PK) 를 `useAirLocation` 이 감싸되, 로그인 직후 **서버 우선 + 게스트 값 1회 업로드**(서버가 비어 있을 때만 PUT, 성공 시 로컬 clear, 서버에 값이 있으면 게스트 값은 보존만)로 동기화하고 별도 sync 라우트를 만들지 않았다. 앱은 `api-setup.ts` 에서 `setAirLocationStorage(AsyncStorage)` 주입. 같은 저장소를 날씨·일상지도·식단 추천이 읽는 결합점은 [saved-location-glance](saved-location-glance.md) 가 다룬다.

## What This Means

이 패턴은 "익명 사용 → 계정 전환" 마찰을 없애는 제품 결정이 코드 구조로 굳은 것이다. 새 도메인에 즐겨찾기·기록류 기능을 붙일 때 설계 논의 없이 이 템플릿을 복사하면 되고, 실제로 버스→지하철→맛집이 각각 한 라운드 만에 이식됐다. 두 가지 교훈: (1) 템플릿 복제는 결함도 복제한다 — storage 주입 버그는 6개 스토어에 똑같이 존재했고, 첫 스토어에 테스트가 있었다면 다섯 번 복제되기 전에 잡혔다. 이제 injectableStorage 한 곳이라 한 번만 고치면 된다. (2) 패턴의 부분 적용도 유효하다 — vote 는 서버 병합 없이 로컬 절반만 썼고, 그 선택(내 찬성 조회 API 를 안 만든다)이 서버 표면을 줄였다.


세 번째 교훈(2026-08): 템플릿의 핵심은 union 병합이 아니라 **"게스트 상태가 로그인에서 소실되지 않는다"** 는 계약이다. 값이 목록이면 union 이 그 계약의 구현이고, 값이 1개면 "서버 우선 + 1회 업로드" 가 구현이다 — 내 위치 저장소가 이를 증명했다. 새 도메인은 저장 값의 카디널리티부터 정하고 그에 맞는 병합 규칙을 고르면 된다.

## Sources

- [../topics/bus.md](../topics/bus.md)
- [../topics/subway.md](../topics/subway.md)
- [../topics/shared.md](../topics/shared.md)
- [../topics/web.md](../topics/web.md)
- [../topics/vote.md](../topics/vote.md)
- [../topics/air-quality.md](../topics/air-quality.md)
- [../topics/weather.md](../topics/weather.md)
- [saved-location-glance.md](saved-location-glance.md)
