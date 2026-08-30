---
concept: 공공데이터 마스터 적재 수명주기 — 원본은 리포 밖, 로더 전량 교체, 가공 캐시만 커밋
last_compiled: 2026-08-30
topics_connected: [life-map, bus, subway, food, friendly, project-overview]
status: active
---

# 공공데이터 마스터 적재 수명주기 — 원본은 리포 밖, 로더 전량 교체, 가공 캐시만 커밋

## Pattern

지하철 역사마스터(2026-07-06)에서 시작해 버스 정류소(07-13), 일상지도 CCTV·화장실·병의원(08-21/30), 음식 카탈로그(08-22)까지 네 도메인이 같은 수명주기를 반복한다. [quota-proportional-loading](quota-proportional-loading.md)이 "정적인 것은 로컬로"라고 말한 그 **로컬 적재를 어떻게 운영하는가**의 규약이다.

1. **원본은 리포 밖** — CSV/XLSX/API 전량 덤프는 `/data/open/{food,life,eval}` 에 두고 `.gitignore` 로 제외한다. `docs/data-sources.md` 가 "무엇을 어디서 받아 어디에 두고 어떤 명령으로 적재하는가"의 단일 기준이며, 보관 여부는 **"다시 받기 얼마나 어려운가"** 로 정한다(공개 URL 은 지우고, 로그인·심의가 필요한 AI Hub 평가셋은 추출본만 남긴다). 로더는 이 표준 경로를 기본값으로 찾아 인자 없이 돈다.
2. **로더 골격이 같다** — `load:*` 스크립트가 "정규화는 순수 함수 + 사유별 drop 리포트, 쓰기는 별도 함수" 로 나뉘고(`bus-master.service.ts` ↔ `life-map-master.service.ts` 헤더가 서로를 지목), 좌표는 계약과 같은 WGS84 한국 범위(lat 33~39·lng 124~132) 밖이면 drop, 쓰기는 **전량 교체 트랜잭션**(청크 500 — SQLite 바인드 변수 32,766 상한 아래).
3. **이력 행이 "적재됨" 판정** — `SubwayMasterSync`·`BusMasterSync`·`LifeMasterSync`·`FoodImportRun` 의 최신 행이 적재 상태이고, 미적재면 기능이 조용히 비는 게 아니라 503 + 적재 명령 안내(일상지도)로 드러난다.
4. **status 한 줄 → deploy.sh 자동 적재** — `status:life-map`(`ok cctv=N toilet=M geocoded=G hospital=H cache=C`)·`status:food-catalog`(`ok items=N classified=C nutrition=U meals=M`) 가 한 줄을 찍고, `deploy.sh` 케이스 6·7 이 같은 `stat_val` 파서로 읽어 "0건이면 적재, gz 바뀌었으면 재적재" 를 코드 배포·재기동 없이 수행한다.
5. **쿼터가 드는 가공은 배포 시점 예산으로, 산출물만 커밋** — 화장실 5.3만 행의 VWorld 지오코딩(일 한도)은 `--max-calls`·영구 `LifeGeocodeCache`·notfound 캐시·`--offline` 로 나눠 소비하고, 결과 gz(39,181건 1.1MB)를 **리포에 커밋**한다. 서버 기동 시 import 는 없고 deploy.sh 가 `GZ_CHANGED` 를 감지해 `import:life-geocode` → `load:life-toilets --offline` 을 돌린다. 운영 중 지오코딩 호출은 0.

변형이 정보값이다: **food** 만 CLI 외에 어드민 월간 cron import(매월 1일 04:00 KST) + 수동 실행 + SSE 진행을 가져 "운영 중 갱신" 이 가능하고(그래서 이력이 `*MasterSync` 가 아니라 `FoodImportRun` 이며 skipped/interrupted 상태를 가진다), `hansik-800` 은 자동 소스가 아니라 수동 적재다. **병의원**은 CSV 가 아니라 심평원 API 전량(1,000행×~79콜, 일 10,000 한도)이라 원본 파일이 없다. **지하철**은 마스터 외에 실형상·노선순서·혼잡도까지 로더 4종이 계보를 이룬다.

## Instances

- **2026-08-30** in [life-map](../topics/life-map.md) (`4fd6e22`): 병의원 레이어 — `load:life-hospitals`(HIRA API 순차 페이징, 지오코더 `--offline`), `LifeHospital` + `LifeMasterSync` 확장, deploy.sh 케이스 6 에 합류. 원본 파일이 없는 첫 API 전량형.
- **2026-08-23** in [food](../topics/food.md) / [project-overview](../topics/project-overview.md) (`dae1cc9`·`edb7f44`): 음식 카탈로그 적재를 deploy.sh 케이스 7 로 — `status:food-catalog` 한 줄 + `load:food-catalog --classify --backfill-nutrition`. "영양성분 API 는 선택, 배포본 CSV 가 기본" 을 문서로 못박음(data.go.kr 데이터셋별 활용신청 함정: 다른 데이터셋 키를 쓰면 `30 등록되지 않은 서비스키`).
- **2026-08-22** in [project-overview](../topics/project-overview.md) / [life-map](../topics/life-map.md) / [food](../topics/food.md) (`809b7e0`·`5a84b63`): 원본을 `data/open/{food,life,eval}` 로 정리하고 로더 기본 경로를 붙임, `docs/data-sources.md` 신설(보관 기준·평가셋 추출 스크립트·백업 대상), deploy.sh CSV 경로 폴백.
- **2026-08-22** in [food](../topics/food.md) (`69dc0e2`·`5cdbc0f`): 6출처 카탈로그 적재 — 배포 파일(CSV·XLSX, `lib/csv.ts`·`lib/xlsx.ts`) + 레시피 API + 내부 어휘, 월간 cron + `FoodImportRun` 이력. 실적재 2,789종.
- **2026-08-21** in [life-map](../topics/life-map.md) (`1d92acb`·`a21de10`): CCTV 377,243행·화장실 53,559행 전량 교체 적재, RFC4180 파서 신설, 지오코딩 캐시 gz 커밋 + export/import 스크립트 — 5다리를 다 갖춘 **정본**.
- **2026-07-13** in [bus](../topics/bus.md) (`b0c4f0a`): 열린데이터광장 정류소 마스터 11,248행을 `BusStation` 에 적재(`load:bus-stations` + `BusMasterSync`) — 주변 조회가 실시간 API 대신 로컬 bbox 쿼리로, 셀 캐시 테이블 폐기.
- **2026-07-06** in [subway](../topics/subway.md) (`09d977b` 이후 `load-subway-{stations,shapes,line-orders,congestion}`): 역사마스터 784행 + 실형상 + 노선순서 + 혼잡도 로컬 적재 — 검색·주변·노선·경로가 쿼터 0. 마스터 `BLDN_ID` ≠ 실시간 `statnId` 라 관측 기반 보정(`verify-subway-lines`)이 함께 태어남.

## What This Means

1. **"정적=로컬" 의 대가는 운영이다.** 런타임 API 소비를 0 으로 만드는 대신 재취득·재적재·상태 점검이라는 운영 작업이 생긴다. 이 리포는 그 작업을 deploy.sh 케이스(6·7)와 status 한 줄 계약으로 **사람이 기억하지 않아도 되게** 만들었다 — 적재 명령을 외우는 대신 `./deploy.sh 6` 을 친다.
2. **원본을 리포에 안 넣는 결정이 두 규약을 낳았다.** (a) 보관 기준은 "재취득 난이도" — 79MB CSV 는 지우고 16GB zip 은 0.5% 추출본만 남긴다. (b) **가공 캐시만 커밋** — 쿼터를 써서 얻은 산출물(지오코딩 gz)은 원본이 아니라 코드에 준하는 자산이라 리포에 들어간다. 이 둘이 없으면 "원본 밖" 결정은 재현 불가능한 배포가 된다.
3. **이력 행은 기능 게이트다.** `*MasterSync`/`FoodImportRun` 은 로그가 아니라 "이 기능이 지금 켜져 있는가" 의 진실이다. 그래서 미적재를 503 + 안내로 드러내는 것이 맞고, 조용한 빈 목록은 버그로 취급한다.
4. **깨지는 지점** — 로컬 `dev.db` 와 운영 `prod.db` 의 적재 상태가 다르다(로컬 병의원 0건 관측). 로더가 비스트리밍이라 메모리에 원본 전량이 올라간다(CCTV 79MB 까지는 통과). 화장실 지오코딩은 1일차 78.9% 에서 멈춰 2일차 재실행·gz 재커밋이 남았다. 테스트가 `.env` 의 `DATABASE_URL` 을 그대로 쓰므로 적재·머지 테스트는 `useIsolatedDatabase()` 없이는 실 DB 를 갈아엎는다(2026-08-22 `517e465` 실사고).

관련: [quota-proportional-loading](quota-proportional-loading.md) — 이 컨셉이 그 4층 중 "정적=로컬" 다리의 운영 규약. [external-api-proxy-fixture](external-api-proxy-fixture.md) — HIRA·VWorld 지오코더처럼 **라우트 없는 적재 전용 어댑터**가 이 수명주기의 입력단. [in-memory-singleton-gates](in-memory-singleton-gates.md) — food import 의 단일-잡 게이트가 운영 중 갱신형의 동시성 방어.

## Sources

- [life-map](../topics/life-map.md)
- [bus](../topics/bus.md)
- [subway](../topics/subway.md)
- [food](../topics/food.md)
- [friendly](../topics/friendly.md)
- [project-overview](../topics/project-overview.md)
- [quota-proportional-loading](quota-proportional-loading.md)
- [external-api-proxy-fixture](external-api-proxy-fixture.md)
- [in-memory-singleton-gates](in-memory-singleton-gates.md)
