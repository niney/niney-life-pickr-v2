---
concept: 지도 + 바텀시트 화면 골격 — 시트 위치에서 헤더·지도 인셋이 파생되는 단일 상태
last_compiled: 2026-09-26
topics_connected: [web, mobile, map, bus, subway, transit, life-map, housing, parking, sea]
status: active
---

# 지도 + 바텀시트 화면 골격 — 시트 위치에서 헤더·지도 인셋이 파생되는 단일 상태

## Pattern

지도가 주인공인 화면(맛집·버스·지하철·일상지도)은 웹 모바일(=작은 화면)과 앱이 각자 **같은 골격**으로 수렴했다. 2026-05-18 맛집 v2(웹 `/restaurants-v2` + 앱 맛집 탭)에서 태어나, 07-07 앱 대중교통 포팅이 그대로 복제했고, 08-21 일상지도가 세 번째로 복제한 뒤, 08-22 하루에 웹은 훅으로 추출(`e84e4b9`)하고 앱은 세 화면의 어긋남을 규칙으로 못박았다(`4e414aa`·`fdb6ab9`·`342b3b7`).

골격은 다섯 단이다: **① 상단 서브바**(탭·검색행) → **② 헤더 아래 고정 지도** → **③ 목록 시트**(상시, peek) → **④ 상세 시트**(조건부, half, 항목 바뀌면 `key=id` 로 리마운트) → **⑤ 지도 인셋 파생**. 핵심 결정은 ⑤에 있다 — 시트가 어디까지 올라왔는가라는 **단일 상태에서 헤더 모양과 지도의 유효 영역이 파생**된다. 웹은 `useMapSheets` 가 목록/상세 스냅 전이를 렌더 중 파생으로 조율하고(상세가 열리면 목록 스냅을 기억해 peek 로, 닫히면 복원; `PEEK 120`·`HALF 0.55`·`sheetHalfInset`), 그 값이 CSS 변수 `--map-bottom-inset` 이 되어 `MapCanvas.flyTo(..., { bottomInset })` 와 `MapLayerControl` 의 bottom 을 밀어 올린다. 앱은 gorhom 시트의 `animatedPosition` 을 `syncMapBottomInset` 이 WebView 지도의 `viewBottomInset` 으로 넘기고, 플로팅 헤더는 활성 시트 index 1.5→2 구간에서 카드(마진 12·라운드 12·그림자)가 sticky 바(마진 0·라운드 0·노치 surface)로 보간된다. `SNAP_POINTS ['20%','50%','100%']` 는 세 화면이 글자까지 같다.

같은 날 확정된 규칙이 이 골격의 함정 목록이다: (a) **`enableDynamicSizing={false}` 필수** — 켜 두면 짧은 콘텐츠가 4번째 스냅을 끼워 넣어 `index 2 ≠ full` 이 되고 헤더 보간이 엉뚱한 구간에서 일어난다(앱 시트 6개 전부, `fdb6ab9`). (b) **헤더는 "활성 시트"를 따라간다** — 상세가 열리면 목록이 아니라 상세 시트의 index 를 봐야 한다(`detailOpenSV`/`headerSheetIndex`, `342b3b7`). (c) **숨은 시트도 부수효과를 낸다** — 웹 `BottomSheet` 의 스크롤 락은 `hidden` 과 무관하게 걸리므로, 데스크톱 트리에 모바일 시트를 숨겨 두면 문서 스크롤이 잠긴다(버스·지하철은 루트 고정 높이라 티가 안 나고, 일상지도는 이 때문에 JS 분기 → [dual-mount-shared-state](dual-mount-shared-state.md)). (d) **루트 높이 고정은 데스크톱만** — 모바일은 body 스크롤(ux-v2 문서의 원칙)이라 시트가 `position: fixed` 로 떠야 한다.

## Instances

- **2026-09-25** in [parking](../topics/parking.md) / [web](../topics/web.md) (`2ff2c31`): 주차 `/parking` 은 이 골격의 **여섯 번째 웹 페이지**(맛집 v2·버스·지하철·일상지도·집값 다음)이자 "탭 3개가 한 골격을 나눠 쓰는" 첫 사례 — 주차장·충전소·공항 탭(`?t=lot|ev|airport`)이 지도 한 장·목록 시트·상세 시트(`key={`${tab}:${sel}`}`)를 공유한다. 파일 머리 주석이 계보를 직접 적는다: *"레이아웃·분기·시트 조율은 집값·일상지도와 같다(지도 한 장 + 패널, `useIsDesktopXl` 로 JS 분기, 모바일은 상단바 subBar + 목록/상세 바텀시트 + `useMapSheets`)"*. 진입 중심은 URL `ll`/`z` → 저장한 내 위치 → 서울 순(마운트 1회 결정, 저장 위치가 늦게 오면 사용자가 안 움직였을 때만 1회 `flyTo`), 지역 이동은 일상지도의 `LifeGoToBox` 를 그대로, 선택 항목으로의 이동은 시트 인셋(`flyInset`)을 고려한다. 골격을 새로 만들지 않고 **조립만** 한 페이지라 컴포넌트 비용이 도메인 부분(`ParkingLists`·`ParkingDetails`·`ParkingTabBar`·마커)에 몰렸다. 다만 "조립" 의 절반은 **복사**다 — 시트·헤더는 `useMapSheets`·`BottomSheet` 로 공유되지만, 그 위의 페이지 뼈대(`parseZoom`·`parseSel`·`InitialView` 진입 중심 결정·"저장 위치로 1회 이동" ref·뷰포트 디바운스)는 일상지도·집값·주차 세 페이지가 각자 들고 있고, `parseSel` 의 길이 한도는 이미 200 과 80 으로 갈라졌다(web 토픽 Gotchas). 셀 격자(`lifeCellSizeDeg`·`LIFE_CELL_ORIGIN`·`lifeCountBucket`)는 utils 에서 공유되는데 페이지 상태 뼈대는 아직 훅이 없다 — 네 번째 복사 전에 `useMapPageState` 식 페이지 레벨 훅으로 뽑을 후보.
- **2026-09-24 (의도된 예외)** in [sea](../topics/sea.md) (`4a2bff1`): 바다 `/sea` 는 지도가 있지만 이 골격을 **쓰지 않는다** — `lg` 그리드(지도 360px/데스크톱 600px + 우측 380px 지점 목록 `aside`)의 일반 페이지 흐름이다. 지점 수가 적고(활동별 지점 목록 + 순위) 사용 흐름이 "활동·날짜를 고르고 목록을 훑는다" 라 지도가 주인공이 아닌 날씨·대기 쪽 계보에 가깝다. 골격 선택 기준의 반례로서 유용하다: **지도 위에서 탐색이 일어나면 시트 골격, 목록·표를 읽는 게 주면 페이지 흐름.**
- **2026-09-02** in [housing](../topics/housing.md) (`254fb76`): [LifeMapPage](../topics/life-map.md) 와 같은 뼈대 — URL 이 진실(`?ll&z&sel…`), 데스크톱 좌 패널 400px(`LifeGoToBox` + `HousingFilterBar`) / 모바일 subBar + 지도 fixed + 목록 시트(면적 구간 칩) + 상세 시트(`useMapSheets(sel)`), 마커 풀 `poolKey 'housing'`. 지역 이동은 새 박스를 만들지 않고 `LifeGoToBox` 에 `extraSections`(아파트 단지)·`onQueryChange` 만 더해 페이지가 자기 검색 훅을 돌린다(훅을 박스로 넘기지 않아 rules-of-hooks 유지). 셀 격자는 일상지도의 두 배(평당가 알약이 넓어서).
- **2026-08-22** in [web](../topics/web.md) / [bus](../topics/bus.md) / [subway](../topics/subway.md) / [life-map](../topics/life-map.md) (`e84e4b9`): `restaurant-v2/BottomSheet` → `sheet/BottomSheet`(R100 이동) + 신규 `sheet/useMapSheets.ts` + `lib/useMediaQuery.ts`. 맛집 v2·버스·지하철·일상지도 4페이지가 같은 5단 골격으로 통일 — 대중교통 모바일의 "검색바 고정 / 지도 40dvh / 리스트 38dvh 세로 적층" 이 폐기되고 "결과 많음" 문단은 건수 행 인라인으로. `MapCanvas` 에 `flyTo bottomInset`·`MapMarker.fixedScale`·마커 Style 캐시(상한 6,000 — CCTV 수천 feature 프리즈 해소)가 함께 들어감.
- **2026-08-22** in [mobile](../topics/mobile.md) / [life-map](../topics/life-map.md) (`4e414aa`·`fdb6ab9`·`342b3b7`): 일상지도 플로팅 헤더를 시트 full 에서 sticky 바로 보간(`4e414aa`), 시트 6개(맛집·대중교통·일상지도 각 List/Detail) `enableDynamicSizing=false`(`fdb6ab9`), 헤더가 활성 시트를 따라가도록 `detailOpenSV`/`headerSheetIndex`(`342b3b7`). 공용 훅은 추출하지 않고 세 화면에 **동일 복제** — 웹과 갈린 선택.
- **2026-08-21** in [life-map](../topics/life-map.md) / [mobile](../topics/mobile.md) (`1d92acb`·`e348032`): 일상지도가 앱에서 대중교통 `TransitMapView`(`window.__cmd` 단일 진입 브리지) + 플로팅 헤더 + 시트 골격을 세 번째로 복제. 브리지 확장은 `setMarkers.icons` 아이콘 사전 + `BridgeMarker.fixedScale` 두 필드뿐(마커당 ~60B).
- **2026-07-07** in [transit](../topics/transit.md) / [mobile](../topics/mobile.md) (`6d57dbe`): 앱 대중교통 탭이 맛집 탭의 지도+시트+플로팅 헤더 골격을 복제하며 `TransitFloatingHeader`·`useTransitMapSync`(`viewBottomInset` 은 `5660811`, 2026-07-25 — 따라가기가 시트에 가리던 수정) 가 생김.
- **2026-05-18** in [web](../topics/web.md) / [mobile](../topics/mobile.md) (`5cfd186`·`100c65d`·`7363c72`): 기원 — 웹 `/restaurants-v2` 모바일 시트 패턴 + 앱 맛집 탭 "네이버지도식 통합 화면(지도+바텀시트+상세 in-sheet)" + `docs/mobile-public-restaurant-ux-v2.md`(모바일 body 스크롤·데스크톱 고정 높이 원칙).

## What This Means

1. **골격이 세 번 복제된 뒤에야 규칙이 됐다.** 맛집(05-18)→대중교통(07-07)→일상지도(08-21)까지는 복사였고, 08-22 에 웹은 훅(`useMapSheets`)으로, 앱은 규칙(`enableDynamicSizing=false`·활성 시트 추적)으로 굳혔다. [platform-ui-split](platform-ui-split.md)의 "사후 승격" 과 같은 결이되, 앱은 아직 훅을 뽑지 않았다 — 네 번째 지도 화면이 생기면 앱 쪽 추출이 자연스러운 다음 수.
2. **"시트 위치 → 인셋·헤더 파생" 이 이 골격의 본질이다.** 시트·헤더·지도를 각자 상태로 두면 세 개가 어긋나는 순간(상세 열림, 짧은 콘텐츠, 리사이즈)이 곧 버그다. 08-22 의 세 앱 수정이 전부 "파생 원천을 하나로" 되돌리는 작업이었다는 점이 증거.
3. **웹과 앱이 같은 함정을 다른 이름으로 겪는다.** 앱의 dynamic sizing 4번째 스냅과 웹의 숨은 시트 스크롤 락은 둘 다 "시트 라이브러리의 기본값이 골격의 가정을 깬다" 는 한 문장이다. 새 시트 라이브러리 옵션을 만질 때 이 두 사례를 먼저 본다.
4. [dual-mount-shared-state](dual-mount-shared-state.md) 와의 경계 — 그쪽은 "상태를 어디 두나"(스토어·페이지·로컬·풀 키), 이쪽은 "화면 골격과 전이·인셋 규약". 일상지도가 JS 분기를 고른 이유(숨은 시트의 락)는 두 컨셉의 접점이다.

## Sources

- [web](../topics/web.md)
- [mobile](../topics/mobile.md)
- [map](../topics/map.md)
- [bus](../topics/bus.md)
- [subway](../topics/subway.md)
- [transit](../topics/transit.md)
- [life-map](../topics/life-map.md)
- [dual-mount-shared-state](dual-mount-shared-state.md)
- [platform-ui-split](platform-ui-split.md)
- [parking](../topics/parking.md)
- [sea](../topics/sea.md)
