---
concept: 공공데이터 마스터 적재 수명주기 — 원본은 리포 밖, 로더 전량 교체, 가공 캐시만 커밋
last_compiled: 2026-09-26
topics_connected: [life-map, bus, subway, food, friendly, project-overview, housing, tarot, saju-c, tour, canonical, parking, sea]
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

- **2026-09-25 (API 전량형 두 원천 병합 + 마스터 위 상태 오버레이)** in [parking](../topics/parking.md) / [project-overview](../topics/project-overview.md) (`2ff2c31`): 주차장은 원본 파일 없이 **API 두 계열을 한 표로** — 전국주차장정보표준데이터(data.go.kr 15012896, 1,000행 × ~19콜)와 서울 공영주차장 안내(서울 열린데이터 `GetParkInfo`)를 정규화(표준 API 의 camelCase 와 포털 파일의 UPPER_SNAKE 키 통일, 서울 노상 구획 행 접기, 버스·거주자 전용 제외)한 뒤 **표준↔서울 겹침을 접어**(로컬 413건) `ParkingLot` 에 전량 교체한다(트랜잭션 + `createMany` 청크 500, id 는 원천 접두 `std:<관리번호>`·`seoul:<코드>`). 전기차 충전소(환경공단 15076352, 전량 ~53콜 43초)는 `EvStation`·`EvCharger` 두 표를 한 트랜잭션에서 교체(21초, 로컬 99,850곳/515,263기). 두 로더 모두 `ParkingSync(kind)` 에 이력을 남기고 `status:parking` 한 줄(`ok lots=N std=S seoul=U geocoded=G ev=E chargers=C`)을 `deploy.sh` `parking_data` 가 읽어 비었으면 첫 적재, 새 메뉴 **9** 로 코드 배포·재기동 없이 재적재한다. 새로운 층은 **마스터 위의 상태 오버레이** — 실시간 여석은 폴러 메모리, 충전기 상태는 10분 폴러가 마스터 행을 `UPDATE … FROM` 으로 제자리 갱신, 요일×시간 혼잡 이력은 `ParkingOccupancyStat(key, dow, hour)` 에 **FK 없는 누적 집계**(samples·occSum·fullCount)로 쌓는다. 마스터가 통째로 교체돼도 이력은 원천 키로 살아남는다(아래 What This Means 5).
- **2026-09-24 (원본을 로더가 직접 받는다 + 좌표계 변환)** in [life-map](../topics/life-map.md) / [housing](../topics/housing.md) (`ad48f96`): 서울시 침수흔적도(서울 열린데이터 OA-15636) — `load:life-flood` 가 `data/open/flood/` 가 비어 있으면 데이터셋 페이지를 읽고 파일별로 폼 POST 해 연도별 SHP zip 14개(~6MB, 로그인 불필요)를 **스스로 내려받는다**(`--download` 는 새 연도 재확인, deploy.sh force 때). SHP/DBF 를 자체 파서로 읽고(CP949·UTF-8 혼재, 연도마다 다른 스키마) UTM-K(EPSG:5179) 필지 폴리곤을 WGS84 무게중심 점으로 바꿔(주소·필지는 버림) `LifeFloodTrace` 4.3만 행을 전량 교체, `LifeMasterSync layer='flood'` → `status:life-map` `flood=N` → deploy.sh 가 0건이면 자동 적재. 재취득이 쉬워 원본 보관 부담이 없는 쪽 극단이고, `build:life-crime` 의 인구 CSV 자동 다운로드와 같은 "로더가 원본을 획득" 계열. 소비 쪽에선 **이력 행이 캐시 버전**이 됐다 — 집값의 `HousingFloodIndex` 는 0.002° 메모리 격자를 만들어 두고 최신 `LifeMasterSync(flood).id` 가 바뀔 때만 다시 짓는다.
- **2026-09-24 (대조 — 적재 없음, 좌표표만 코드로 커밋)** in [sea](../topics/sea.md) (`4a2bff1`): 바다는 마스터를 두지 않는다 — 국립해양조사원 지수 6종·조석·이안류를 요청 시 받아 메모리 캐시(활동별 1시간·물때 12시간 + 실패 시 12시간 stale)만 한다. 대신 공식 코드표에 **좌표가 없어서** 조석 예보지점 166곳·이안류 해수욕장 10곳의 좌표를 지점별 1회 호출로 모아 `packages/utils/src/seaStations.ts` 로 커밋했다 — "쿼터를 써서 얻은 가공물만 커밋" 규약이 DB 적재 없이 코드 상수로 나타난 형태(지오코딩 gz·범죄 JSON 과 같은 다리).
- **2026-09-13~19 (변형 — 데이터셋 단위 교체 + 원본은 다른 작업공간)** in [tour](../topics/tour.md) / [project-overview](../topics/project-overview.md) (`c777380`·`d18ac24`·`93ae031`·`6cae6b2`): 여행로그 4권역 — 원본(AI 허브 71780·71779·71778·71581, 세트당 93~178GB)은 리포 밖 `niney-tour-pickr` 작업공간에 있고 **변환기(tour-c, Python/DuckDB)가 export(JSONL.gz 10표 + manifest sha256 + thumbs/s)** 를 만들어 `data/open/tour/<export>/`(세트당 ~190MB, gitignore) 에 둔다. 로더 `load:tour --dataset <키>` 는 전량 교체가 아니라 **그 데이터셋 행만 교체**(장소 id 접두 `west:`·`east:`·`capital:`, 코드표만 공용 통째 교체)하고, manifest 가 늘 71780 이라 여행의 제주 방문 비율로 `--dataset` 오지정을 막는다(plausibility). `--dry-run` 이 sha256 대조·정규화 리포트만 내고, `status:life-map` 이 `tour_<세트>=N` 을 찍어 `deploy.sh` 가 "키|폴더|이름" 루프로 세트별 자동 적재 → `match:restaurant-tour`. 재취득 난이도가 최고(로그인·승인·수백 GB)라 export 4폴더가 **백업 대상**이고, 2026-09-19 원본 사진 449GB 를 지운 뒤엔 작업 폴더 썸네일이 유일한 사진 보관본이다(재export 시 thumbs 스텝 금지). 환수·폐기 요구엔 `unload:tour --yes [--dataset]` 한 명령.
- **2026-09-12 (분기 재적재 + 사이드 테이블)** in [life-map](../topics/life-map.md) / [canonical](../topics/canonical.md) (`bc39a79`·`127e746`): 상가(상권)정보 — 분기 zip(시도별 CSV 16개, 항목명 CP949) 약 130만 행을 `LifeStore` 에 전량 교체(`load:life-stores`, `probe:store-csv` 로 형식 고정), deploy.sh 케이스 6 이 `store=N` 으로 첫 적재를 판단하고 뒤이어 `match:restaurant-stores` 를 돌린다([canonical-side-table-match](canonical-side-table-match.md)). zip 을 못 찾으면 배포 스크립트가 조용히 죽던 함정(`127e746`, `set -e` + 파이프)이 이 케이스에서 나왔다.
- **2026-09-12 (가공 산출물만 커밋 — 빌드형)** in [life-map](../topics/life-map.md) (`bc39a79`, `build:life-crime`): 범죄 통계는 적재가 아니라 **빌드** — 경찰청 CSV × 행안부 인구(자동 다운로드)를 시군구 10만 명당 5등급으로 계산한 JSON(`data/life-crime-stats.json`)을 커밋하고 서버는 기동 시 계약 검증만. 화장실 지오코딩 gz 와 같은 "쿼터·가공은 개발 머신, 산출물만 커밋" 다리의 순수 정적 변형([quantile-graded-overlay](quantile-graded-overlay.md)).
- **2026-09-03~06 (변형)** in [tarot](../topics/tarot.md) / [saju-c](../topics/saju-c.md) / [project-overview](../topics/project-overview.md): 같은 수명주기를 **이미지 자산**에 적용 — 제미나이 원본은 `assets-src/{tarot,saju}/raw`(gitignore, 재취득 = 프롬프트북 `docs/*-prompts.md`), `build:tarot-deck`·`build:saju-images` 가 1:1 크롭·webp 512/1024 로 가공해 `apps/web/public/{tarot/cards,saju-c/images}`(158·44장) + manifest 를 커밋, 운영은 dist 에서 nginx 7일 캐시·진짜 404. 한자 글리프(`build:saju-glyphs`, 81장)는 개발 머신 폰트로 만들어 커밋해 운영에 CJK 폰트가 필요 없다. "원본은 리포 밖, 로더/빌더로 재현, 가공물만 커밋" 규칙이 데이터 밖 자산에도 같은 형태.
- **2026-08-30~09-02** in [housing](../topics/housing.md) (`254fb76`, `168b363`): 수명주기의 가장 큰 사례 — 원천 5종(단지 마스터 CSV 30.7만 행 / 실거래 매매·전월세 API 709만 행 / 공시가격 3.4GB zip 스트리밍 / K-apt xlsx·V5 API / 건축HUB). 원본은 `data/open/housing`(리포 밖), 로더는 `load:housing-*` 6종, 실거래는 upsert 가 아니라 **(시군구, 계약년월, 유형) 파티션 교체 + `HousingSync` 장부**(신고 지연·해제 때문), 단지 마스터 재적재는 **같은 id 에서 보강 컬럼·좌표를 이어받는다**(며칠치 쿼터로 채운 K-apt·건축물대장이 CSV 갱신에 사라지지 않게). 지오코딩 캐시는 일상지도와 같은 압축본에 실어 커밋 → 운영은 `--offline` 호출 0건. `deploy.sh` 케이스 8 + API 배포마다 `status:housing` 한 줄을 파싱해 자동 점검(`b8c08ed` 가 파일 없을 때 메뉴가 죽던 glob 을 고침).
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

5. **전량 교체되는 마스터에 매달리는 데이터는 FK 대신 안정 원천 키로** (2026-09-25 정리). 교체 트랜잭션의 `deleteMany({})` 는 FK 가 걸린 자식까지 끌고 간다 — 그래서 마스터 위에 쌓이는 것들은 하나같이 FK 없이 원천 키로 매단다: 주차 혼잡 이력 `ParkingOccupancyStat.key`(`seoul:<코드>`·공항 구역 키), 맛집 매칭 `RestaurantTourMatch`(FK 없음)·`RestaurantStoreMatch`(상가 마스터 `LifeStore` 쪽 FK 를 떼어 낸 마이그레이션 `20260912102150` — canonical 쪽 FK 는 유지), 여행로그 `Tour*` 표 전체(FK 없음, `west:`·`east:`·`capital:` 접두), 지오코딩 영구 캐시 `LifeGeocodeCache`(유형+주소 키), 집값 단지 재적재의 "같은 id 에서 보강 컬럼 이어받기". 원천 id 에 출처 접두(`std:`·`seoul:`·`west:`)를 붙이는 것도 같은 목적 — 여러 원천이 한 표에 들어와도 키가 충돌하지 않고, 재적재 뒤에도 같은 행을 같은 키로 다시 찾는다. 대가는 고아 행이다(마스터에서 사라진 주차장의 이력·폐업 가게의 매칭이 남는다) — 매칭 표는 `missing` 상태로 드러내고, 혼잡 이력은 주차장 상세에서 그 키로만 읽으므로 고아 행은 조회되지 않은 채 남는다.

관련: [quota-proportional-loading](quota-proportional-loading.md) — 이 컨셉이 그 4층 중 "정적=로컬" 다리의 운영 규약. [external-api-proxy-fixture](external-api-proxy-fixture.md) — HIRA·VWorld 지오코더처럼 **라우트 없는 적재 전용 어댑터**가 이 수명주기의 입력단. [in-memory-singleton-gates](in-memory-singleton-gates.md) — food import 의 단일-잡 게이트가 운영 중 갱신형의 동시성 방어.

## Sources

- [life-map](../topics/life-map.md)
- [bus](../topics/bus.md)
- [subway](../topics/subway.md)
- [food](../topics/food.md)
- [friendly](../topics/friendly.md)
- [project-overview](../topics/project-overview.md)
- [tour](../topics/tour.md)
- [canonical](../topics/canonical.md)
- [parking](../topics/parking.md)
- [sea](../topics/sea.md)
- [housing](../topics/housing.md)
- [canonical-side-table-match](canonical-side-table-match.md)
- [server-only-boot-effects](server-only-boot-effects.md)
- [quantile-graded-overlay](quantile-graded-overlay.md)
- [quota-proportional-loading](quota-proportional-loading.md)
- [external-api-proxy-fixture](external-api-proxy-fixture.md)
- [in-memory-singleton-gates](in-memory-singleton-gates.md)
