# 지하철 기능 구현 계획 — '대중교통' 탭 통합 (버스 패리티 + 지하철 특화)

> 2026-07-06 작성 (작성 당시 untracked 방침 → 2026-07-07 사용자 결정으로 git 반영).
> 버스 1~8차 완성 상태(e878288)를 전제로 한 지하철 차수별 로드맵 — 계획 시점의 기록이며,
> 이후 실제 진행·변경 사항은 커밋 이력이 진실이다.

## Context

버스 기능이 8차(검색 → 도착정보 → 주변 → 즐겨찾기 → 노선 보기 → 실시간 차량 보간/도로 추종 → 노선 전체 차량/방향 화살표 → 따라가기 토글)까지 완성된 상태에서, 같은 수준 이상의 지하철 기능을 추가한다.

**사용자 결정 (확정)**
1. 커버리지: **수도권 전철** (서울시 실시간 API — 1~9호선 + 공항철도·경의중앙·수인분당·경춘·신분당·우이신설·서해 등. 서울시 밖 역 구간은 실시간 미제공)
2. 페이지: 기존 `/bus`를 확장해 **버스/지하철 탭이 있는 '대중교통' 통합 페이지**
3. 부가기능: **시간표·첫차/막차 + 환승·출구 + 혼잡도(정적 통계)** 모두 포함 (후순위 차수)
4. 진행: **차수별** — 승인 시 1차부터 구현, 각 차수 완료 후 확인

범위: 웹 + friendly + 공유 패키지 (버스와 동일하게 **앱(Expo)은 범위 외**).

## 데이터 소스와 버스 대비 결정적 차이

| 용도 | API | 비고 |
|---|---|---|
| 실시간 도착 | `swopenAPI.seoul.go.kr/api/subway/{KEY}/json/realtimeStationArrival/0/N/{역명}` | JSON, **키가 URL path**. 서울 열린데이터광장 키(별도 발급, 즉시) |
| 실시간 도착 일괄 | `realtimeStationArrival/ALL` (별도 데이터셋 15125683) | **운영 확장 시 escape hatch** — 프로브로 확인 |
| 실시간 열차 위치 | `realtimePosition/{start}/{end}/{호선명}` | **GPS 없음** — statnId(현재역)+상태(0진입/1도착/2출발/3전역출발)만 |
| 역 마스터/좌표 | 서울시 역사마스터(OA-21232) — 역사_ID(10자리)·역명·호선·위경도 | 수도권 ~800역 → **전량 DB 적재 후 로컬 검색** |
| 노선 형상 | 공공 API 부재 | 역 좌표 연결 근사 폴리라인 |
| 시간표 | 서울시 시간표 API vs TAGO(data.go.kr) — 프로브로 택1 | 8차 |
| 출구/환승 | TAGO 출구별 정보 + 역사마스터 역명 그룹핑 | 9차 |
| 혼잡도(정적) | 서울교통공사 30분 단위 CSV (1~8호선 한정) | 10차 |

**버스와 다른 4가지 구조적 차이**
1. 별도 포털(JSON, path 키, `RESULT.CODE` 에러 모델) → **어댑터 신규** (`callBusApi` 재사용 불가, 패턴만 이식)
2. 역 검색·주변이 **로컬 DB 조회 = 쿼터 0콜** → 버스의 검색 캐시 테이블(검색헤더/hits/셀 격자) 전부 불필요, **라이브 검색(타이핑 즉시) 가능**
3. 열차 위치는 역 기준 상태 → **역간 보간으로 좌표 재구성** (신규 알고리즘, `routePath.ts` 기하 재사용)
4. 노선 형상 API 부재 → 역 좌표가 곧 폴리라인 정점 (버스의 '형상↔정류소 투영 불일치' 처리가 통째로 사라짐)

## 사전 준비 (사용자 액션)

- [ ] **서울 열린데이터광장(data.seoul.go.kr) 인증키 발급** → `apps/friendly/.env`에 `SUBWAY_API_KEY=` (즉시 발급되는 편, 1차 착수 전 필요)
- [ ] (8차 대비, 나중에 해도 됨) data.go.kr에서 TAGO 지하철정보(15098554) 활용신청

---

## 아키텍처 개요

### 탭 통합: `/bus` 유지 + `/subway` 추가, 탭 = 라우트 전환

- 신규 `apps/web/src/components/transit/TransitTabs.tsx` — [버스|지하철] NavLink 2개, 양 페이지 루트 최상단 슬림 행. 사용자에겐 탭 있는 단일 '대중교통' 페이지, URL은 경로로 네임스페이스 분리.
- 근거: 기존 `/bus` 딥링크 100% 호환, `q`/`near` 등 파라미터 충돌 없음, BusPage(627줄) 거의 무수정(탭 행 1줄), 탭 전환 = 언마운트 → **버스 폴링 자동 중단(쿼터 보호)**, lazy 청크 분리.
- 모바일 세로 예산이 답답하면 `usePublicLayout().setSubBar`로 탭을 sticky 헤더 2번째 행에 등록하는 대안(RestaurantsV2Page 검증 패턴) — 1차 실화면 보고 판단.
- **지도 인스턴스는 공유하지 않음**(의도적): OL 재생성은 ms 단위 + 타일은 HTTP 캐시. 셸이 지도를 소유하면 BusStationsMap의 검증된 소유 구조를 해체해야 해서 기각.
- NAV: `PublicSidebar.tsx`+`PublicTopBar.tsx`의 버스 항목을 `대중교통`으로 개명(진입 `/bus`), 활성 판정을 `pathname.startsWith`로 확장(두 파일 각 ~10줄).
- URL 파라미터 (버스 1:1 대응): `q`(검색어) / `near`(주변 기준점) / `stn`(선택 역 그룹) / `line`(추적 호선). `setSearchParams(updater,{replace:true})` 관용구 이식.

### 백엔드 모듈 구조

```
apps/friendly/src/modules/subway/
  subway-api.adapter.ts      # 신규 HTTP 코어 2종 + 타입드 래퍼 + 에러 클래스
  subway-master.service.ts   # 역사마스터 fetch→정규화→upsert + 역명 그룹핑 로직(검색·도착 필터 공용)
  subway.service.ts          # SubwayService — 로컬 검색/주변 + 실시간 프록시 + 쿼터
  subway.route.ts            # autoload 자동 등록 (*.route.ts 규칙)
  subway-favorite.{service,route}.ts        # 4차
  *.test.ts + __fixtures__/*.json           # 프로브 실덤프 기반 (버스는 xml, 지하철은 json)
apps/friendly/scripts/
  probe-subway-api.ts        # 1차 0단계 — 실응답 확정
  load-subway-stations.ts    # 역 마스터 적재 (--dry-run/--prune)
  load-subway-line-orders.ts # 5차, load-subway-congestion.ts # 10차
```

- **어댑터**: `callSwopenApi`(실시간)와 `callSeoulOpenApi`(마스터/시간표, `openapi.seoul.go.kr:8088`) 분리. 버스에서 이식할 패턴 — 요청 URL 키 마스킹(path 세그먼트 `***`), 자체 AbortController 10s(+undici bodyTimeout 함정 주석), AuthError 503/ApiError 502 분류, `strOrNull`/`numOrNull`(JSON이어도 숫자가 문자열로 옴), `row`/`realtimeArrivalList` 단건 객체 → 배열 정규화. `INFO-200`(데이터 없음)은 빈 배열 정상 처리(버스 `NO_RESULT_HEADER_CDS` 대응 — 서울 밖 역이 여기로 떨어짐).
- **서비스 캐싱/쿼터 매트릭스**: 검색·주변 = 로컬 DB(쿼터 0) / 실시간 도착·위치 = **메모리 15s 마이크로 캐시 + in-flight 합류**(역·노선당 1키라 동시 사용자 전원이 공유 — 쿼터 보호 핵심) / 시간표 = DB blob 30일 TTL+stale(`BusRouteShape` 패턴) / 혼잡도·출구 = 정적 적재. 쿼터 카운터는 버스와 별개, `Map<group,{dateKey,count}>`로 일반화(기본 900, Asia/Seoul 날짜 — `bus.service.ts:419-432` 이식). 마스터 0행이면 검색이 503("load-subway-stations 실행 필요").
- **쿼터 escape hatch (운영 확장 대비)**: 사용자 증가로 900이 부족해지면 도착정보를 **일괄(ALL) 엔드포인트 서버 주기 폴링**(예: 30s마다 1콜 = 일 2,880콜 고정, 트래픽 증설 신청 병행)으로 전환해 사용자 수와 쿼터를 분리할 수 있다. 마이크로 캐시 계층 뒤에 숨어 있어 라우트/계약 무변경 — 1차 프로브에서 ALL 동작만 확인해 두고 실제 전환은 운영 판단.
- **라우트** (`Routes.Subway`, 공개): `GET /subway/stations/search?q=` (1차) / `stations/nearby?lat&lng&radius` (3차) / `stations/:statnId/arrivals` (2차) / `lines/:lineId/positions` (6차 — 마스터 조인으로 lat/lng enrich, 조인 실패 시 null) / `lines/:lineId/detail` (5차) / `stations/:statnId/timetable` (8차) / `exits` (9차) / `congestion` (10차) / 즐겨찾기 CRUD+sync (4차). 502/503 직접 응답 패턴(`bus.route.ts:21-24`) 이식.
- **도착 조회 흐름**: `:statnId` → 마스터에서 역명(+`realtimeName` 오버라이드) 해석 → 역명 1콜(`0/30`)로 그 역 전 호선 도착 → **해당 역 그룹의 subwayId 집합으로 필터**(동명이역 응답 오염 차단) → 반환. 없는 statnId는 404.

### 역명 그룹핑 — 동명이역 처리 (정확성 핵심)

"같은 name = 환승역"만으로는 틀린다 — **진짜 동명이역**이 존재: '양평'(5호선 서울 영등포구 vs 경의중앙선 경기 양평군), '신촌'(2호선 vs 경의중앙선) 등. 그룹핑 규칙: **동일 name + 좌표 근접(예: ≤1km)** 일 때만 한 그룹(=환승역). 멀면 별개 그룹으로 분리(검색 결과에 두 항목, 필요 시 호선명 병기로 구분 표시). 도착 API가 역명 키라서 동명이역 응답이 섞여 오므로, 서버가 그룹의 subwayId 집합으로 필터한다. 그룹핑 함수는 `subway-master.service.ts`에 한 곳으로 두고 검색·도착 필터가 공용. 프로브에서 실제 동명이역 목록과 API 역명 표기를 확정.

### Prisma (1차 + 차수별 증분)

```prisma
model SubwayStation {        // 1차
  statnId String @id         // 실시간 API 10자리 — 역사마스터 ID와 동일성은 프로브 최우선 검증
  name String                // '강남'
  realtimeName String?       // 실시간 조회 역명이 다를 때만 (표기 예외 오버라이드)
  lineId String              // statnId 앞 4자리 ('1002')
  lineName String            // '2호선' — SUBWAY_LINES 상수 표기와 동일
  stationCd String?  frCode String?   // 8차 시간표/5차 정렬용 backfill
  lat Float  lng Float
  @@index([name]) @@index([lineId]) @@map("subway_stations")
}
model SubwayMasterSync { ... }                        // 적재 이력 (loadedAt → 검색 응답 fetchedAt)
// 4차 SubwayFavoriteStation(스냅샷, FK 없음 — 버스 동일 사유)
// 5차 SubwayLineStation { lineId, branchKey @default("main"), seq, statnId }  ← 지선 branch 모델
// 8차 SubwayTimetableCache(blob)  9차 SubwayStationExit  10차 SubwayCongestion
```

### 계약 (`packages/api-contract/src/schemas/subway.ts`)

- zod 패턴 계승: WGS84 범위 강제(lat 33~39, lng 124~132), NFC 정규화 검색어(로컬 검색이라 min 1자), `{items,total,fetchedAt}` 봉투. 검색은 `source:'db'` 단일(캐시/스테일 개념 없음을 계약으로 명시), 실시간은 `fetchedAt`만.
- `SubwayStationGroupItem { name, lat, lng, lines: [{statnId,lineId,lineName,lat,lng}] }` — 좌표 근접 그룹핑 결과. lines 2개 이상 = 환승역.
- `SubwayArrivalItem { subwayId, updnLine, trainLineNm(행선-방면), bstatnNm, btrainSttus(급행/ITX — 프로브 확정), btrainNo, barvlDt(초)|null, arvlMsg2, arvlCd, recptnDt }`.
- `SubwayTrainPositionItem { trainNo, statnId, statnNm, trainSttus 원문, updnLine, isExpress, isLastTrain, lat|null, lng|null }` — 좌표 nullable(조인 실패는 정상, 부가 정보).
- 호선 상수는 `packages/utils/src/subwayLine.ts`: `SUBWAY_LINES` (subwayId→이름·축약·공식 노선색 hex — 정확한 코드·hex는 프로브/공식 안내로 확정) + `subwayLineColor()` 폴백.

### 재사용 vs 신규

- **무수정 재사용**: `MapCanvas.tsx`(4레이어·rAF tween·followVehicleId·타일 프로빙 — `MapMarker`/`VehicleMarker` 인터페이스가 도메인 중립), `routePath.ts` 전 함수, `markerFrame.ts`, `BusFavoriteStar`, URL-as-truth 핸들러 골격, 폴링 정책(enabled 게이트·placeholderData·`refetchIntervalInBackground:false`), 즐겨찾기 하이브리드 패턴, 서비스 골격(쿼터/in-flight/TTL/stale), 테스트 인프라(vi.hoisted mock·app.inject·prefix 격리·deps.now/dailyLimit 주입), 프로브 우선 개발 플로우.
- **추출 리팩터(6차)**: 버스 알약·방향 다트 SVG 기하 → `packages/utils/src/vehiclePill.ts` (앵커 트릭이 미묘해 복제 시 드리프트 위험 — busMarker는 기존 export 위임 유지, 호출부 무수정).
- **신규**: `subway-api.adapter.ts`(JSON 에러 모델), `subwayLine.ts`, `subwayMarker.ts`(역 마커: markerFrame 규격 준수·환승 이중 링 / 열차 알약: 호선색+행선지+급행 변형), `subwayPosition.ts`(상태 기반 역간 보간 — 유일한 신규 알고리즘), SubwayPage + components/subway/* + api/hooks/store + 계약 일체.

### 열차 위치 시각화 (6차 코어 설계)

1. 5차 line detail의 `sections` 모델(본선+지선 각각 역 순서 배열)로 section별 `createRoutePathIndex` 구축 — 역 좌표 = 폴리라인 정점이라 역 seq→호길이 s가 `cum[i]` 그대로. 2호선 본선은 첫 역을 끝에 붙여 닫힌 링.
2. `packages/utils/src/subwayPosition.ts` 순수 함수(+단위 테스트): statnId→역 인덱스, updnLine→진행 방향, **trainSttus→세그먼트 분수 f** (전역출발≈0.2 / 진입≈0.9 / 도착=1.0 / 출발=다음 세그먼트 0.1 — 단조 진행이라 폴링 간 후퇴 없음, 상수 튜닝 가능) → `s = s(P) + f×(s(S)−s(P))`.
3. via 웨이포인트: 이전 폴링 s 스냅샷(cur/prev 세대 ref — BusStationsMap 패턴 복제) → `sliceRoutePath(sPrev,sCur)` (하행은 reverse). 점프 상한은 역 스팬 기준(급행 대비 ~6역), 2호선 링 시임은 텔레포트 폴백. `bearingAtRoutePathS`로 방향 다트(하행 +180).
4. MapCanvas rAF tween 무수정 재사용. 보간 실패(지선 미모델 등) 시 역 좌표 마커 + 직선 tween으로 우아한 강등.
5. 곡선 스무딩(Catmull-Rom)은 7차 폴리시로 보류 — `createRoutePathIndex` 앞단에 `smoothPolyline()` 하나 끼우면 전체가 일관되게 부드러워지는 구조라 미뤄도 비용 불변.

### 폴링/쿼터/카운트다운 정책

- 도착 30s 폴링 + **패널 1s 카운트다운**. 남은 시간은 **`barvlDt − (now − recptnDt 기준 보정)`** — 공식 가이드가 "현재시각과 recptnDt의 차이만큼 열차가 더 진행한 것으로 보정" 하라고 명시하므로 fetchedAt이 아닌 recptnDt를 기준으로 파생(마이크로 캐시로 fetchedAt이 과거여도 정확). 0 도달·arvlCd 도착/출발 시 상태 문구 전환.
- 열차 위치 **30s 폴링**(버스 15s와 다름 — 역 단위 상태라 갱신 밀도가 낮고 쿼터 보호. tween ~28s). 단, **원천 데이터 자체가 분 단위 갱신일 가능성** → 프로브에서 recptnDt 변화 주기를 실측해 폴링·tween 최종 확정.
- 서버 15s 마이크로 캐시로 동시 사용자 업스트림 공유. 소진 시 503(실시간은 stale 폴백 없음).
- **운행 종료 시간대 UX**: 심야에 도착 리스트가 비면 "운행 종료" 안내(INFO-200 정상 케이스와 동일 경로) — 8차 이후 첫차 시간을 함께 표시.

---

## 차수 로드맵

### 1차 — '대중교통' 탭 + 역 검색 + 지도 (상세)

UX 산출물: `/bus` 상단에 [버스|지하철] 탭. 지하철 탭 → 라이브 검색(호선 뱃지·환승 표시) → 지도 역 마커 + 선택 시 flyTo. `q`/`stn` 딥링크. NAV '대중교통' 개명.

| # | 작업 | 파일 |
|---|---|---|
| 1 | env `SUBWAY_API_KEY: z.string().default('')` (발급처 주석) | `apps/friendly/src/config/env.ts` |
| 2 | 어댑터 코어 2종 + `getStationMaster`/`getRealtimeArrivals`/`getRealtimePositions` + 에러 클래스 | `modules/subway/subway-api.adapter.ts` |
| 3 | **프로브 실행 → 미지수 확정 → 어댑터/상수 보정** (아래 체크리스트) | `scripts/probe-subway-api.ts`, package.json `probe:subway` |
| 4 | Prisma `SubwayStation`+`SubwayMasterSync` → `pnpm --filter friendly db:migrate` | `apps/friendly/prisma/schema.prisma` |
| 5 | 마스터 적재 (fetch→정규화(호선 표준화·WGS84 범위 drop)→upsert→sync 기록, `--dry-run`/`--prune`) + 역명 그룹핑 함수 | `subway-master.service.ts`, `scripts/load-subway-stations.ts` |
| 6 | 계약: 검색 스키마 + `Routes.Subway` + `SUBWAY_LINES` 상수(utils) | `api-contract/src/schemas/subway.ts`, `routes.ts`, `index.ts`, `packages/utils/src/subwayLine.ts` |
| 7 | `SubwayService.searchStations`(로컬 contains + 근접 그룹핑 + 전방일치 우선 정렬 + limit, 마스터 0행 503) | `modules/subway/subway.service.ts` |
| 8 | 검색 라우트 (502/503 직접 응답) | `modules/subway/subway.route.ts` |
| 9 | 테스트: 어댑터 단위(JSON fixture) + 라우트(app.inject, `subwaytest-` prefix 마스터 시드→정리, 동명이역 분리 케이스 포함) + live smoke(`skipIf(!key)`) | `subway*.test.ts`, `__fixtures__/` |
| 10 | shared: `subway.api.ts` + `useSubwayStationSearch`(debounce 250ms, enabled ≥1자, staleTime 24h, placeholderData) | `packages/shared/src/api/`, `hooks/useSubway.ts` |
| 11 | utils: `subwayMarker.ts` 역 마커(markerFrame 재사용, 환승 이중 링) | `packages/utils/src/subwayMarker.ts` |
| 12 | 웹: `TransitTabs`, `SubwayLineBadge`, `SubwayStationList`(3-export — 버스 구조), `SubwayStationsMap`(마커 파이프라인 최소판), `SubwayPage`(q/stn 오케스트레이션, 버스와 동일 반응형 레이아웃), `App.tsx` lazy 라우트, NAV 2파일, BusPage에 탭 행 | `apps/web/src/routes/SubwayPage.tsx`, `components/transit/`, `components/subway/` |

**1차 프로브 체크리스트** (구현 착수 0단계, `data/subway-probe/*.json` 덤프):
① 키 하나가 swopenAPI·openapi.seoul.go.kr 양쪽 유효한지 ② 에러 모델(정상 응답 동봉 `errorMessage` vs 에러 단독, INFO-200 실형태, 한도 초과 코드) ③ **realtimePosition statnId ↔ 역사마스터 역사_ID 동일성 (최대 리스크 — 불일치 시 (호선명+역명) 조인 플랜 B)** ④ 역사마스터 실필드명·총 건수·수도권 전 노선 포함 여부 ⑤ 호선명 param 표기 22종 명세 ⑥ 역명 표기 함정('서울역' vs '서울', 괄호 병기) + **동명이역(양평·신촌 등) API 표기 확정** ⑦ 도착 응답 급행 필드 값 집합 + 환승역 1콜 전 호선 여부 + `0/30` 요청 동작 ⑧ **recptnDt 변화 주기 실측**(원천 갱신 주기 → 폴링·tween 근거) ⑨ **도착 btrainNo ↔ 위치 trainNo 동일 체계 여부**(7차 연계 기능 게이트) ⑩ 일괄(ALL) 엔드포인트 동작·응답 크기(escape hatch 확인용).

### 2차 — 실시간 도착정보

- BE: `stations/:statnId/arrivals` + 쿼터 카운터·15s 마이크로 캐시·in-flight 인프라(위치도 이 인프라를 씀). statnId→역명(+realtimeName) 해석, `0/30` 요청(환승역 5건 절단 방지), 그룹 subwayId 필터(동명이역).
- FE: `SubwayArrivalPanel` — 호선 섹션(뱃지 헤더) → 상하행/내선·외선 그룹 → 열차 행(행선지 주 표기 + 급행 뱃지 + **1s 카운트다운(recptnDt 보정)** + arvlMsg2 보조). 30s 폴링. 환승역 과밀은 그룹당 상위 2~3개 + '더보기'. 빈 리스트 = "운행 종료(또는 실시간 미제공 역)" 안내.

### 3차 — 주변 역 + 지도 자동 재조회

- BE: `stations/nearby` — 로컬 바운딩박스 + `approxDistanceM` 이식 + dist 정렬 (셀 캐시·쿼터 불필요 — 버스 3차 대비 대폭 단순).
- FE: '주변 역' 버튼(Geolocation)·`near` 파라미터·패닝 자동 재조회 — BusPage 로직 이식. 역 밀도가 낮아 반경 기본 1.5km, 자동 조회 최소 줌 13~14로 완화.

### 4차 — 즐겨찾기

역 즐겨찾기 + 역×호선 즐겨찾기. 게스트 localStorage ↔ 서버 하이브리드 + sync — `bus-favorite.*`/`useBusFavorites`/`busFavoriteStore` 미러. 스냅샷 저장(FK 없음). `BusFavoriteStar` 그대로 import.

### 5차 — 호선 보기

- BE: `SubwayLineStation`(branchKey로 지선 모델링) + `load-subway-line-orders.ts`(frCode 정렬 검증 → 부족 시 보정 JSON 리포 커밋), `lines/:lineId/detail` — sections(역 목록)+branch별 근사 폴리라인.
- FE: 도착 패널 호선 섹션 탭 → `line` 파라미터 → 호선색 폴리라인 + 전 역 점(환승 구분) + 호선 정보 카드(노선 단위 첫차/막차 선반영). 경유역 점 클릭 = 역 선택.

### 6차 — 실시간 열차 위치 (버스 6·7차 대응 병합)

- BE: `lines/:lineId/positions` (마이크로 캐시 인프라 재사용, 좌표 enrich).
- FE: `subwayPosition.ts` 보간(+테스트), `vehiclePill.ts` 추출 리팩터, 열차 알약(호선색+행선지+급행 변형)+방향 다트, 30s 폴링 + rAF tween, cur/prev 세대 ref.
- **게이트: 위치 API 라이브 프로브** (급행 통과역 보고 semantics, updnLine↔역순서 방향 테이블).

### 7차 — 따라가기 + 도착↔열차 연계 + 마감

- 열차 알약 탭 → 카메라 추적(`followVehicleId` 무수정 재사용) + 일시정지/재개 칩 + 대상 강조 + 추적 중 화면 정리.
- **도착 패널 ↔ 지도 열차 연계 (지하철 특화, 버스에 없음)**: 프로브 ⑨에서 btrainNo↔trainNo 동일 체계로 확인되면, 도착 패널의 열차 행 탭 → 지도에서 "내가 기다리는 그 열차"를 강조/follow. 불일치로 판명되면 이 항목만 드랍(다른 기능 무영향).
- 급행 다중 역 스팬 via 안정화, 2호선 링 시임 폴백, (폴리시) Catmull-Rom 스무딩.

### 8차 — 시간표·첫차/막차 (부가 1)

프로브로 서울시 시간표 API vs TAGO 택1(커버리지 비교), `stationCd` backfill, `SubwayTimetableCache` blob 30일+stale, `stations/:statnId/timetable`. FE: 방향 그룹 푸터 첫차/막차 + 시간표 뷰(평일/토/휴일, 현재 시각 하이라이트) + **막차 임박 뱃지**(현재 시각 기준 "막차 N분 전" — 도착 패널 연계). env `TAGO_API_KEY`(빈 값이면 `DATA_GO_KR_API_KEY` 폴백 — 같은 data.go.kr 계정).

### 9차 — 환승·출구 (부가 2)

환승 호선 요약 심화 + `SubwayStationExit` 적재(TAGO 출구별 버스노선/시설) + `stations/:statnId/exits` + 출구 아코디언(+확보 시 지도 출구 점).

### 10차 — 혼잡도 (부가 3)

`load-subway-congestion.ts`(서울교통공사 CSV, 역명·호선 문자열 조인) + `stations/:statnId/congestion`. FE: 도착 행 혼잡 게이지 + 시간표 시간대 바. **1~8호선 한정 — `coverage` 계약으로 "데이터 없음" 명시, "정적 통계 기반" 라벨**.

### 선택 확장 (11차~, 별도 승인 후 진행)

- **11차 — 경로 탐색(출발역→도착역)**: 5차 `SubwayLineStation` + 환승(동일 그룹) 간선으로 역 그래프 구성 → 자체 다익스트라(역간 소요 상수 또는 8차 시간표 기반, 환승 페널티). 유료 API(ODsay) 불필요 — 전부 로컬 데이터. 결과를 지도 폴리라인 하이라이트 + 소요/환승 요약으로 표시.
- **12차 — 버스↔지하철 연계**: 역 상세에 주변 버스 정류장(기존 `GET /bus/stations/nearby` 재사용 — 신규 API 0) + 탭 딥링크(`/bus?stId=…`). '대중교통' 통합 페이지의 시너지. 9차 TAGO 출구별 버스노선과 상호 보완.
- **운영 개선(수시)**: 어드민에 마스터 재적재 버튼 + 마지막 적재일 표시(기존 어드민 설정 패턴), 일괄(ALL) 폴링 전환(위 escape hatch), Catmull-Rom 스무딩 폴리시.

---

## 리스크 / 함정 (통합)

1. **statnId 체계 불일치 (최대)** — 프로브 ③ 최우선. 플랜 B: 실시간 statnId를 PK, 마스터는 (호선+역명) 조인으로 좌표만.
2. **동명이역** — '양평'·'신촌' 등. 근접 그룹핑(≤1km) + 도착 응답 subwayId 필터로 차단. 테스트 케이스 포함.
3. **역명 표기 불일치** — `realtimeName` 오버라이드 컬럼으로 흡수. 미해결 역은 INFO-200으로 조용히 실패(빈 결과와 구분 불가) → 필요 시 전 역 1회 검증 스크립트(쿼터 ~800콜, 별도 날).
4. **ID 4중 체계** (statnId/STATION_CD/frCode/TAGO ID) — 전부 `subway_stations` nullable 컬럼으로 수렴, 차수별 backfill, 조인 실패 행은 해당 부가기능만 비활성.
5. **HTTP 200 + 본문 에러** — status 신뢰 금지, 본문 코드 분류가 유일한 진실 (버스 교훈 동일).
6. **키 URL path 노출** — 로그·에러·프로브 덤프 전부 마스킹 (path 키는 쿼리파람보다 새기 쉬움).
7. **서울 밖 역 도착 빈 결과 = 정상** — INFO-200을 에러로 다루면 오탐. "운행 종료/미제공" 안내 문구로 흡수.
8. **원천 갱신 주기 불명** — 분 단위 갱신이면 30s 폴링·28s tween 재조정 필요. 프로브 ⑧로 확정.
9. **지선/순환** — sections 모델을 5차 계약에 처음부터. 미모델 지선 열차는 폴백 마커(사라지지 않음).
10. **상하행 UX 복잡도** — 행선지("OO행")를 주 표기로, 방향은 보조. 2호선 내선/외선은 API 원문 라벨 신뢰.
11. **쿼터 실측 불확실** (서비스별인지 키 전체인지) — 보수적 900 단일 카운터로 시작, 운영 관측 후 그룹 분리. 확장 시 일괄(ALL) 전환.
12. **마스터 재적재** — upsert(delete-all 금지)로 무중단, 폐역은 `--prune` 리포트.
13. **테스트 격리** — `subwaytest-` prefix statnId 시드 + afterAll 정리 (공유 dev.db 규율).
14. **포트 3000 점유** (기존 함정) — samplepcb 등이 127.0.0.1:3000을 잡으면 엉뚱한 404. `Get-NetTCPConnection -LocalPort 3000`으로 확인.

## Verification (각 차수 공통)

1. `pnpm --filter friendly probe:subway` — 실응답 확정 (1차 0단계 게이트, 6차 위치 프로브 게이트)
2. `pnpm --filter friendly exec vitest run src/modules/subway` + `pnpm typecheck`
3. 마스터 적재: `pnpm --filter friendly load:subway-stations --dry-run` → 실적재 → 검색 API `curl`로 강남/왕십리(환승)/양평(동명이역 분리) 확인
4. 웹 수동 확인: `localhost:5173/subway` — 탭 전환, 라이브 검색, `q`/`stn` 딥링크 새로고침 복원, 기존 `/bus` 딥링크 무손상. 실시간 차수(2·6차)는 실 API 체인 E2E(도착 카운트다운·열차 이동 관찰)
5. 브랜치 전환/rebase 후 `prisma generate` 필수 (버스 함정 목록 계승)

## Critical Files (구현 시 참조 원형)

- `apps/friendly/src/modules/bus/bus-api.adapter.ts` — 어댑터 패턴 원형(마스킹·타임아웃·에러 분류)
- `apps/friendly/src/modules/bus/bus.service.ts` — 쿼터 가드·in-flight·TTL/stale SSOT
- `packages/api-contract/src/schemas/bus.ts` — zod 계약 원형
- `apps/friendly/scripts/probe-bus-api.ts` — 프로브 골격
- `apps/web/src/routes/BusPage.tsx` — URL 오케스트레이션 원형 + TransitTabs 삽입 대상
- `apps/web/src/components/bus/BusStationsMap.tsx` — 지도 어댑터 원형(마커 파이프라인·via 세대 ref·follow)
- `apps/web/src/components/restaurant/MapCanvas.tsx` — 무수정 재사용 지도 코어
- `packages/utils/src/routePath.ts` — 역간 보간 기하 코어 / `packages/shared/src/hooks/useBus.ts` — 폴링 정책 원형
