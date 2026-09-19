---
concept: 지도 배경 레이어의 분위 5등급 — 절대값 대신 "표본 안에서 어느 쪽인가", 한 번에 하나, 소셀 억제
last_compiled: 2026-09-19
topics_connected: [life-map, tour, utils, web, api-contract, air-quality]
status: active
---

# 지도 배경 레이어의 분위 5등급 — 절대값 대신 "표본 안에서 어느 쪽인가", 한 번에 하나, 소셀 억제

## Pattern

2026-09 에 일상지도가 점 레이어(CCTV·화장실·병의원·생활편의) 위에 **면을 칠하는 배경(overlay)** 을 두 개 얻었다 — 범죄 통계(시군구 경계, `bc39a79`)와 여행자 밀도(0.02° 격자, `9196495`). 데이터 원천·집계 단위·계산 위치가 전부 다른데도 같은 결을 택했다.

1. **등급은 절대값이 아니라 분위** — 값 분포의 20/40/60/80 분위(R type 7 선형 보간)를 경계 4개로 잡아 5등급. 범죄는 전국 시군구 인구 10만 명당 발생률의 분위, 밀도는 응답에 든 칸들의 방문 수 분위라 **범례가 "드묾 ~ 매우 많음"(표본 안 상대 위치)** 이지 "안전/위험" 같은 절대 판정이 아니다. 분위 계산 함수(`lifeCrimeQuantileBreaks`·`tourDensityQuantileBreaks`)와 등급 판정·색 램프는 [utils](../topics/utils.md)에 한 벌씩 두어 서버(빌드·SQL)와 웹(범례)이 같은 규칙을 쓴다.
2. **배경은 한 번에 하나** — `LIFE_MAP_OVERLAYS = ['crime', 'tour']` 를 단일 `overlay` 상태로 두어 면 색칠이 겹치지 않게 한다(겹치면 읽을 수 없다). 점 레이어 토글(`layers`)과 축이 다르고, 배경을 바꾸면 선택(시군구·칸)은 뜻이 달라져 항상 비운다.
3. **작은 셀은 내지 않는다** — 밀도는 여행자 5명 미만 칸을 응답에서 제외(k-익명성, `TOUR_K_MIN`), 범죄는 인구로 나눈 발생률이라 작은 군의 우연을 그대로 색으로 만들지 않는다. 상세 카드도 억제된 셀엔 값 대신 안내 문구.
4. **계산 위치는 데이터 크기에 맞춘다** — 범죄는 연 1회 CSV 라 빌드 스크립트가 JSON 산출물(`data/life-crime-stats.json`)을 **커밋**하고 서버는 기동 시 계약으로 검증만 한다(bbox·DB 없음); 밀도는 방문 11만 행이라 SQLite `GROUP BY` 격자 SQL(FLOOR 가 없어 `CAST(… AS INTEGER)`)로 요청 시 집계하고 키별 LRU 10분 캐시.
5. **표본 밖이면 데려간다** — 밀도 배경은 표본 세트 bbox(제주·서부권·동부권·수도권) 안에서만 의미가 있어, 켰을 때 지도가 밖이면 가까운 세트 중심으로 `flyTo`(`tourSampleRegionAt`/`nearestTourSampleRegion`). 범죄는 전국이라 이동이 없다.

## Instances

- **2026-09-13~19** in [tour](../topics/tour.md) / [life-map](../topics/life-map.md) / [web](../topics/web.md) (`9196495`·`d18ac24`·`93ae031`·`6cae6b2`): 여행자 밀도 — `GET /tour/public/density?kind=all|restaurant[&bbox]` 가 0.02° 칸(`{x,y,n,travelers}`)과 경계 4개를 내고, 웹 `lib/tourDensityGeo.ts` 가 OL 면 피처로, `LifeTourCard` 가 요약·범례·선택 칸(등록 맛집 목록은 공개 목록 bbox 조회로)을 그린다. 7차부터 표본이 여러 권역이 되며 "제주로 이동"이 "가까운 표본으로 이동"이 됐고, 9차 수도권으로 서울이 표본 안이 되자 기본 진입에서 이동이 사라졌다(e2e step 도 분기).
- **2026-09-12** in [life-map](../topics/life-map.md) / [utils](../topics/utils.md) / [api-contract](../topics/api-contract.md) (`bc39a79`): 범죄 통계 — 경찰청 「범죄 발생 지역별 통계」(data.go.kr 3074462) × 행안부 주민등록 인구 → 시군구 인구 10만 명당, 생활 안전과 직결되는 강력·절도·폭력 3종만(사기·교통은 합계를 지배하지만 제외), `build:life-crime` 이 인구 CSV 를 자동 내려받아 JSON 을 커밋, `LifeCrimeService` 가 기동 시 `LifeCrimeStatsResult` 로 검증. 웹은 `useSigunguGeo` 로 시군구 경계를 받아 `lifeMapAreas` 스타일로 칠하고 `LifeCrimeCard` 가 지표(전체/강력/절도/폭력) 선택과 범례를 든다. 경계 이름 별칭 함정 2건(빌드 스크립트 주석).
- **대조 — 2026-08-21** in [air-quality](../topics/air-quality.md): 대기질 등급은 **절대 기준**(환경부 통합대기환경지수 구간)이다 — 법정 척도가 있으면 분위를 쓰지 않는다. 배경이 아니라 측정소 점 레이어라 겹침 문제도 없다.

## What This Means

1. **분위 등급은 "주장하지 않기" 위한 선택이다.** 연구용 표본(여행로그)이나 인구 보정 통계를 절대 색으로 칠하면 "여기는 위험하다/인기다"라는 판정이 되고, 그건 데이터가 감당 못 하는 말이다(여행로그는 이용조건상 집계·2차 저작물만 공개). 상대 등급 + 출처 문구(`TOUR_SOURCE_NOTE`, 범죄 출처 푸터)가 한 세트다.
2. **배경 하나 규칙은 UI 가 아니라 데이터 규칙이다.** 두 배경을 겹쳐 보여 달라는 요청이 오면 색이 아니라 등급 조합(예: 교차표)으로 풀어야 한다 — 면 색은 한 축만 실을 수 있다.
3. **등급 규칙을 utils 에 두는 이유**는 서버·웹 불일치를 막는 것만이 아니다. 앱이 배경 레이어를 갖게 될 때(현재 앱 일상지도는 점 레이어만) 같은 함수로 범례를 그릴 수 있어야 한다([platform-ui-split](platform-ui-split.md)).
4. **다음 배경 후보**(집값 등급, 상가 밀도)도 같은 다섯 규칙을 따르면 된다 — 분위·단일 overlay·소셀 억제·계산 위치·표본 범위. 특히 소셀 억제 문턱은 데이터 라이선스에서 나오므로 도메인마다 값을 다시 정한다.

## Sources

- [life-map](../topics/life-map.md)
- [tour](../topics/tour.md)
- [utils](../topics/utils.md)
- [web](../topics/web.md)
- [api-contract](../topics/api-contract.md)
- [air-quality](../topics/air-quality.md)
- [map-sheet-shell](map-sheet-shell.md)
- [open-data-master-load](open-data-master-load.md)
