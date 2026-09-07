---
topic: housing
last_compiled: 2026-09-07
sources_count: 70
status: active
aliases: [집값, housing, 아파트 실거래가, 실거래가, RTMS, 공시가격, K-apt, 건축HUB, 한국부동산원 단지 식별정보, PNU, 평당가, HousingComplex, HousingTrade, HousingComplexStat, HousingComplexPrice, HousingSync, housingApi, useHousingPoints, housingPrefsStore, HousingPage, load:housing-trades, status:housing, HOUSING_REFRESH_CRON, DATA_GO_KR_API_KEY, deploy.sh 8]
---

# housing — 집값(전국 아파트 단지의 실거래가·공시가격 지도)

**2026-08-30~09-02 신설 — 공공데이터 5원천 적재 파이프라인 + 단지×유형×면적 구간 파생 표 + 배지/셀 지도**: 국토교통부 아파트 실거래가 API(매매 상세 15126468·전월세 15126474)를 시군구×계약년월 파티션으로 5년치(로컬 실측 202110~202609, 709만 건) 받아 friendly 로컬 SQLite 에 쌓고, 한국부동산원 공동주택 단지 식별정보 CSV(15106861, 아파트 45,920단지)를 마스터로 삼아 거래를 단지에 붙인 뒤, 단지 × 거래 유형(매매/전세/월세) × 전용면적 구간(60·85·135㎡ 경계) 통계 표만 읽어 **단지별 최근 실거래가 배지**(저줌은 평당가 셀)를 그리는 공개 페이지 `/housing` 이 `254fb76`(09-02) 로 들어왔다. 실거래가 없는 단지엔 다른 조건의 마지막 거래(회색) → 공시가격 중위(점선 회색, 주택 공시가격 정보 3073746 호별 1,558만 행 zip 스트리밍) → K-apt 임대단지 표시(15098979) 순으로 보강하고, 건축HUB 건축물대장(15134735)으로 주차·층수·구조를 붙이는 보강 로더까지 같은 커밋에 있다. `168b363`(09-02) 이 K-apt 포털 xlsx 형식(안내문 1행·승강기 6열 분할·지번 뒤 단지명 꼬리)과 API 경로 버전(V3→V5·List3→4)을 실제에 맞췄고, `b8c08ed` 가 deploy.sh 의 K-apt 파일 탐지가 파일 없을 때 스크립트를 조용히 죽이던 것을 고쳤으며, `3d9dfed` 가 data.go.kr 키 8종을 `DATA_GO_KR_API_KEY` 하나로 통일했다. 적재 골격(정규화 순수 함수 + 사유별 drop 리포트 + 전량 교체 트랜잭션 + 상태 한 줄 + deploy.sh 자동 점검)·점/셀 이중 모드·지오코딩 캐시 공유·지역 이동 옴니박스·웹 모바일 시트는 [life-map](life-map.md) 의 것을 그대로 가져와 확장했다.

## Purpose [coverage: high — 9 sources]

"이 동네 아파트가 요즘 얼마에 거래되나" 를 **비로그인 공개**로 답하는 도메인. 조회 라우트 6개는 전부 **로컬 DB 조회만** 하고(업스트림 호출·쿼터 없음), 지도 배지·주변 목록·상세 통계는 거래 표(수백만 행)를 집계하지 않고 **파생 표** `HousingComplexStat`(단지 × 유형 × 구간 + 단지당 폴백 행 `any/all`)과 `HousingComplexPrice`(단지 × 구간 공시가격)만 조인한다([housing.service.ts](../../apps/friendly/src/modules/housing/housing.service.ts) 헤더). 모든 조회의 축은 `dealType`(trade/jeonse/monthly) × `band`(all/b1~b4) 이며 점·셀·주변·상세 통계·거래 목록에 같은 축이 걸린다. 의존자는 웹 `/housing`([HousingPage](../../apps/web/src/routes/HousingPage.tsx), 상단바·사이드바 메뉴 '집값') 과 운영 스크립트 [deploy.sh](../../deploy.sh)(API 배포마다 `housing_data` 자동 점검, 8번 메뉴 강제) 뿐이다 — **앱 화면은 없다**(`apps/mobile` 에 housing 참조 0건).

원천이 5종이고 셋은 파일, 둘은 API 다: 단지 마스터 CSV(좌표 없음 → VWorld 지오코딩, [life-map](life-map.md) 과 같은 `LifeGeocodeCache`·압축본 공유) · 실거래 API 2종(XML, 시군구×계약년월 단위, 단지 식별자 없음 → 지번·이름 매칭) · 공시가격 zip(연 1회, PNU 로 직결) · K-apt 의무단지 xlsx 또는 API(분양형태 '임대' 판별) · 건축HUB API(PNU 로 조회). 서버 요청 경로에서 외부 호출은 없고, **월 자동 갱신**(`HOUSING_REFRESH_CRON`, 인프로세스 croner)만 RTMS 를 부른다.

데이터 규모(2026-09-07 로컬 `status:housing` + DB 실측): `ok complexes=47193 geocoded=39170 trades=1909445 rents=5177208 from=202110 to=202609 stats=1 prices=45898 kapt=20615 buildings=0`. 단지 47,193 = 마스터 `reb` 45,920 + 실거래 주소로만 만든 `rtms` 1,273. 좌표 확보 83%(`parcel` 31,362 · `road` 7,808 · 미해결 8,023). 매매 1,909,445건(해제 103,203 포함) · 전세 2,839,822 · 월세 2,337,386(전월세 API 엔 해제 표기 없음). 통계 표 311,237행(`any` 42,405 · trade 93,897 · jeonse 86,139 · monthly 88,796). 공시가격 2025 기준 45,898단지(`all` 행 수 = 단지 수). 건축물대장은 **0건**(활용신청 미승인).

## Architecture [coverage: high — 27 sources]

```
웹 /housing (HousingPage — ?ll=lat,lng&z=줌&sel=단지id 가 진실, 축은 lp:housing-prefs)
  ├ 데스크톱(xl+): 좌 패널 400px  LifeGoToBox(panel, extraSections=아파트 단지) · HousingFilterBar(all)
  │                              · HousingNearbyList | HousingDetailCard · HousingFooter
  ├ 모바일: subBar(LifeGoToBox bar + HousingFilterBar axis) · 지도 fixed 배경 · 목록 시트(bands 칩 + 목록 + 푸터)
  │         · 상세 시트 — useMapSheets(sel)
  └ HousingMapView → MapCanvas(poolKey 'housing', 전부 fixedScale) ← housingMarkers.ts(배지/셀 SVG 메모)
        │  @repo/shared  housingApi · useHousingStatus/Points/Nearby/Search/Complex/Trades(staleTime 6h · 검색 10분)
        │  @repo/utils   housing.ts(코드표·가격 포맷·연월) · housingMarker.ts(배지·셀·회색 배지 SVG)
        ▼  @repo/api-contract schemas/housing.ts · Routes.Housing
friendly housing.route.ts ── HousingService(status/points/nearby/search/complex/trades — 파생 표만, 셀 LRU 10분)
                          └─ HousingRefreshScheduler(croner, HOUSING_REFRESH_CRON) ── runHousingTradeIngest + rebuildHousingDerived(--offline)
적재(스크립트, 서버 밖)
  load:housing-complexes ── housing-complex-master(CSV 정규화·전량 교체·보강 이어받기) ── life-map-geocode(VWorld, 캐시 공유)
  load:housing-trades ───── housing-ingest(파티션 계획·장부) ── rtms.adapter(XML) ── housing-trade-master(정규화·파티션 교체)
  rebuild:housing-derived ─ housing-derived(거래↔단지 매칭 · rtms 단지 생성 · 통계 표 전량 재계산)
  load:housing-prices ───── housing-price-master(zip 스트리밍 · PNU 매칭 · 구간 중위/범위)
  load:housing-kapt ─────── housing-kapt-master(xlsx/csv 열 인식 · 3단 매칭) ── kapt.adapter(JSON, --source=api)
  load:housing-buildings ── housing-buildings(총괄·표제부 요약) ── bldg-hub.adapter(JSON)   ← datago-json.adapter 공통
  geocode:housing-missing ─ housing-geocode(도로명 → 지번 → 지번 변형)
  status:housing ("ok complexes=N geocoded=G trades=T rents=R from= to= stats= prices= kapt= buildings=" — deploy.sh 가 파싱)
```

### 원천 5종 — 무엇이 어디서 오나

| 원천 | 형식·단위 | 붙는 열 | 적재 명령 | 쿼터 |
|---|---|---|---|---|
| 한국부동산원 공동주택 단지 식별정보 기본정보(15106861) + 단지명 이력(15106867) | CSV(UTF-8 BOM, 307,408행·10열), 좌표 없음 | `HousingComplex` 전량(`source='reb'`, PNU 19자리·지번 주소·동수·세대수·사용승인일·`altNames`) | `load:housing-complexes [csv] [--names=]` | VWorld 지오코더(일 4만 건 수준) — 캐시 압축본으로 운영 0건 |
| 국토교통부 아파트 매매 실거래가 상세(15126468) / 전월세(15126474) | HTTPS **XML**, `LAWD_CD`(시군구 5자리) × `DEAL_YMD`(YYYYMM) | `HousingTrade` 파티션 교체 + `HousingTradeSync` 장부 | `load:housing-trades` · 월 스케줄러 | 개발계정 일 10,000콜 — 전국 252시군구 × 1개월 × 2 오퍼레이션 ≈ 504콜 |
| 국토교통부 주택 공시가격 정보(3073746) | zip 안 3.4GB CSV(호별 15,580,435행, 21열, 연 1회) | `HousingComplexPrice`(단지 × 구간 count·median·min·max·avgArea) + 빈 `roadAddr` | `load:housing-prices [zip]` | 없음(파일) |
| K-apt 관리비 공개 의무단지(15098979 xlsx) 또는 단지 목록(15057332)·기본정보(15058453) API | xlsx/csv(주 1회, 21,701행) / JSON | `kaptCode`·`saleType`(분양/임대/혼합)·`heating`·`elevatorCount` + 빈 세대수·동수·승인일·도로명 | `load:housing-kapt [xlsx]` / `--source=api` | API 일 5,000(단지당 2콜) |
| 건축HUB 건축물대장 총괄표제부·표제부(15134735) | JSON, PNU → `sigunguCd/bjdongCd/platGbCd/bun/ji` | `parkingCount`·`floorsMax`·`structure` + 빈 승강기·도로명·세대수·동수·승인일, `buildingFetchedAt` 장부 | `load:housing-buildings` | 일 10,000(단지당 2콜 → 4.6만 단지 ≈5일). **deploy.sh 자동 실행 제외** |

세 API 는 같은 data.go.kr 게이트웨이 규약을 쓴다 — `serviceKey` 는 bus 어댑터의 `toServiceKeyPart`(Encoding 키를 `URLSearchParams` 에 넣으면 이중 인코딩 → 30), 로깅엔 `serviceKey=***` 마스킹 URL 만, 봉투 `OpenAPI_ServiceResponse.cmmMsgHeader.returnReasonCode` 가 `20/21/22/30/31/32/33` 이면 인증 오류(적재 즉시 중단), `04/05`·HTTP 5xx·타임아웃·네트워크는 일시 오류로 최대 2회 재시도(700ms × attempt). RTMS 는 XML 뿐이라 [rtms.adapter.ts](../../apps/friendly/src/modules/housing/rtms.adapter.ts) 가 의존성 없는 정규식 파서(중첩 없는 `<item>` 태그 목록)로 풀고, K-apt·건축HUB 는 JSON 공통 클라이언트 [datago-json.adapter.ts](../../apps/friendly/src/modules/housing/datago-json.adapter.ts)(`items` 가 배열/`{item}`/`''`/`body.item` 단일 객체 넷 다 오는 버릇 흡수, 타임아웃 30초)를 공유한다. RTMS 응답 실측(2026-08-30 종로구 202507): `resultCode` 는 `'000'`(3자리 — 심평원 `'00'` 과 다름), 빈 값은 공백 한 칸, 전월세는 태그 일부가 소문자(`roadnm`)로 와서 정규화가 소문자 키로 찾는다. 페이지 크기 요청 2,000·타임아웃 40초·`MAX_PAGES 100`, 게이트웨이가 상한을 두면 첫 페이지 실제 행수로 `pageCap` 을 감지해 `totalCount` 까지 **순차** 페이징.

### 단지 마스터 — 정규화 + 전량 교체 + 보강 컬럼 이어받기

[housing-complex-master.service.ts](../../apps/friendly/src/modules/housing/housing-complex-master.service.ts): `decodeHousingCsv`(BOM 이면 UTF-8, 아니면 UTF-8/EUC-KR 중 헤더에 `단지고유번호` 가 보이는 쪽) → [lib/csv.ts](../../apps/friendly/src/lib/csv.ts) `parseCsv` → `normalizeHousingComplexRows`(필수 열 10개 없으면 하드 fail; 열 수 불일치·단지번호/PNU(19자리) 누락·중복·주소 파싱 실패(샘플 50개 보존)·단지명 없음을 사유별 집계, 기본 `kinds=['apt']` 라 연립·다세대는 `skippedKind`). 표시명은 `단지명_공시가격 → 건축물대장 → 도로명주소` 순 첫 값, 나머지 이름 + 이력 CSV 의 변경 전·후 이름은 `altNames`('|' 구분, 이름 안 '|' 는 '/' 로). `parseHousingAddress` 는 마지막 토큰이 `^산?\d+(-\d+)?$` 면 지번, 첫 토큰이 시도, 그 뒤 `시|군|구` 로 끝나는 선행 토큰들이 시군구(세종처럼 없으면 `''`), 나머지가 읍면동(`'조치원읍 신흥리'`). `sggCd = pnu[0:5]`, `bjdCd = pnu[0:10]`.

`replaceHousingComplexes` 는 인터랙티브 트랜잭션(15분) 하나에서 **기존 `reb` 행의 보강 컬럼을 같은 id 로 이어받은 뒤**(`kaptCode·saleType·heating·elevatorCount·roadAddr·parkingCount·floorsMax·structure·buildingFetchedAt`, 좌표는 새 행이 비었을 때만) → `HousingComplexStat` 전량 삭제 → `HousingComplex` 전량 삭제(**rtms 단지 포함** — 파생 재구축이 다시 만든다) → 거래의 `complexId` 전부 null → 500행 청크 `createMany` → `HousingSync{kind:'complex'}`. `HousingComplexPrice` 는 id 기준이라 지우지 않는다. 마스터 CSV 를 새로 받아 재적재해도 며칠치 API 쿼터로 채운 보강과 좌표 보완이 사라지지 않게 하기 위한 설계.

### 실거래 — 파티션 교체 + 장부, 순차 호출

[housing-trade-master.service.ts](../../apps/friendly/src/modules/housing/housing-trade-master.service.ts) `normalizeHousingTradeItems`: 금액은 `parseHousingManwon`('58,960' → 정수 만원), 전월세는 `monthlyRent>0` 이면 `monthly`(보증금=`price`, 월세=`rent`) 아니면 `jeonse`, 계약일은 `dealYear/Month/Day` 조합, `cdealType 'O'` 가 해제, 등기일자·해제일 `'YY.MM.DD'` → ISO, `landLeaseholdGbn 'Y'` 토지임대부. 단지명·금액·면적·계약일 누락은 사유별 drop. **거래 id 는 자연키 sha1 24자**(`유형|시군구|읍면동|지번|단지명|계약일|면적|층|금액|월세|동`) — API 가 식별자를 주지 않아서이고, 같은 파티션 안 완전 중복(같은 날 같은 층·면적·금액)은 `'#n'` 접미. `replaceHousingTradePartition` 은 한 트랜잭션(5분)에서 `(sggCd, dealYm, dealType ∈ dealTypes)` 행을 지우고 새로 넣고 유형별 장부 `HousingTradeSync` 를 upsert 한다(rows 에 없는 유형도 0건으로 기록 — "받았는데 없음" 과 "안 받음" 구분). 전월세 오퍼레이션 한 번이 `jeonse`·`monthly` 두 파티션을 동시에 갱신. upsert 가 아니라 **파티션 교체**인 이유는 신고 기한(계약 후 30일)과 해제 신고로 같은 달이 뒤늦게 바뀌기 때문.

[housing-ingest.service.ts](../../apps/friendly/src/modules/housing/housing-ingest.service.ts) `planHousingPartitions`: 연월은 **최신부터**(한도에 걸려도 최근 데이터 먼저), 시군구는 마스터 `kind='apt'` 의 DISTINCT `sggCd` 오름차순, 매매 → 전월세; 장부에 있는 파티션은 건너뛰되 `refreshYms`(스크립트 `--recent`, 기본 3개월) 는 다시 받고 `force` 면 전부. `runHousingTradeIngest`: 동시성 없이 순차 + 파티션 사이 150ms, `maxCalls` 상한, 인증 오류면 `authError` 로 즉시 중단, 일시 오류 **10회 연속**이면 중단(그 파티션은 건너뛰고 다음 실행이 이어간다), `dryRun` 은 호출은 나가되 쓰지 않음. 스크립트 [load-housing-trades.ts](../../apps/friendly/scripts/load-housing-trades.ts) 와 서버 스케줄러가 같은 함수를 부른다.

[housing-refresh.service.ts](../../apps/friendly/src/modules/housing/housing-refresh.service.ts) `HousingRefreshScheduler`: `croner` `Cron(cron, {timezone:'Asia/Seoul', name:'housing-refresh', unref, catch})`, 라우트 플러그인이 `onReady` 에 `start()`·`onClose` 에 `stop()`. `refreshRecent`: 인스턴스 플래그 하나로 겹침 방지(단일 인스턴스 — Redis 없음) → 키 없음·마스터 없음이면 warn 후 null → 최근 `HOUSING_REFRESH_MONTHS`(기본 3, 1~12) 개월을 `force:true` 로 재수집 → 인증 오류가 아니면 `rebuildHousingDerived(geocode:{key:'', offline:true})` + `HousingSync` trade/rent 행(`sourceFile 'rtms:YYYYMM-YYYYMM'`). **서버는 VWorld 를 부르지 않는다** — 새 rtms 단지는 캐시에 있을 때만 좌표를 얻는다. cron 이 빈 문자열이면 등록하지 않는다(기본).

### 파생 재구축 — 매칭·rtms 단지·통계 표

[housing-derived.service.ts](../../apps/friendly/src/modules/housing/housing-derived.service.ts) `rebuildHousingDerived`. 실거래 API 엔 단지 식별자가 아파트명·지번뿐이라 결정적 키가 없다. 단지 인덱스 두 개 — 지번 키 `sggCd|읍면동 마지막 토큰|지번(0 패딩 제거, 산 접두 유지)`, 이름 키 `sggCd|읍면동|normalizeHousingName(name 또는 altNames)` — 를 만들고 거래를 id 순 5,000건씩 스캔(기본은 `complexId null` 만, `rematchAll` 이면 전부): ① 지번 일치(한 필지에 여러 단지면 이름으로 고르고 그래도 모호하면 첫 단지) → ② 같은 시군구·읍면동 안 이름이 **유일**할 때 → ③ 그래도 못 붙인 거래는 `(시군구, 읍면동, 지번, 정규화명)` 으로 묶어 **rtms 단지**를 만든다: id `rt:<sggCd>:<umdNm>:<jibun|->:<norm|->`, 이름은 가장 흔한 원문(나머지는 `altNames`), 주소는 같은 시군구 `reb` 단지에서 시도·시군구명을 빌려 조립, 좌표는 지번 지오코딩(`geocodeLifeRows`). 시도명을 알 수 없는 시군구(마스터에 단지가 하나도 없는 곳)는 `unmatched` 로 남긴다(로컬 실측 미연결 0건). 이미 있는 rtms 단지는 `reusedRtms`.

`rebuildHousingStats`: `canceled=0 AND complexId IS NOT NULL` 거래만으로 (a) 단지당 폴백 행 `dealType='any', band='all'` — 세 유형을 통틀어 최근 거래(`ROW_NUMBER() OVER (PARTITION BY complexId ORDER BY dealDate DESC, id)`) + 그 유형 `latestDealType` + 전체 건수, (b) 구간 5개 × 유형별 — 최근 거래(윈도 함수) + `count`·`count12`(오늘 기준 12개월 창)·`unitPrice12`(12개월 `AVG(price/area)`, 만원/㎡). 구간 조건은 `(min, max]`(`area<=60 / 60<area<=85 / 85<area<=135 / >135`). 전량 교체 트랜잭션(10분) + `HousingSync{kind:'stats'}` — 이 sync id 가 셀 캐시 키에 들어가 재계산 즉시 무효.

### 보강 3종 — 공시가격 · K-apt · 건축물대장

**공시가격** [housing-price-master.service.ts](../../apps/friendly/src/modules/housing/housing-price-master.service.ts): 3.4GB CSV 를 통째로 읽을 수 없어(문자열 상한) **스트리밍**이 필수 — zip 은 의존성 없이 EOCD(zip64 로케이터 지원) → 중앙 디렉터리 → 로컬 헤더를 직접 읽어 '샘플' 이 아닌 가장 큰 `.csv` 항목의 deflate 스트림만 `createInflateRaw` 로 푼다(`listZipEntries`·`openGongsiStream`). 줄 파서는 포털 규약(모든 값 큰따옴표, 값 안 쉼표·개행 없음)에 기대 `"a","b"` 를 `split('","')`. 단지 매칭은 **PNU**: `법정동코드 10 + 특수지 1 + 본번 4 + 부번 4` 인데 파일의 특수지코드 `'0'(일반)→'1'`, `'1'(산)→'2'` 로 자리를 옮겨야 마스터 PNU 와 같다(청운동 1번지 샘플로 검증). 같은 PNU 에 단지가 여럿이면 정규화 단지명으로 고르고, PNU 로 못 붙이면 `법정동|정규화명` 이 유일할 때만. 호별 공시가격(원 → 만원 반올림)을 구간별 배열로 모아 `all/b1..b4` 의 `count·median·min·max·avgArea` 를 만든다(호 단위 1,200만 값이 메모리에 오르지만 숫자 배열이라 ~100MB). 도로명주소 최빈값도 단지별로 모아 `roadAddr` 가 빈 단지에 채운다(좌표 보완이 쓴다). 전량 교체 + `HousingSync{kind:'prices', baseDate:'YYYY-01-01'}`.

**K-apt** [housing-kapt-master.service.ts](../../apps/friendly/src/modules/housing/housing-kapt-master.service.ts): 배포본마다 헤더가 달라 키워드 정규식으로 열을 찾는다(`resolveKaptColumns` — `세대수` 는 `합계|총세대수` 우선·`분양|임대|관리자` 제외, `동수` 는 `법정동|읍면동` 제외 등; `--dry-run` 이 인식 결과를 찍는다). `168b363` 로 포털 xlsx 형식을 흡수: 1행 안내문은 로더 `skipNoticeRows`(단지코드·단지명 열이 보이는 첫 행을 헤더로, 최대 5행), 승강기 합계 열이 없으면 `승강기(승객용)…` 6열 합산(`resolveKaptElevatorParts`), 법정동주소 `'… 내수동 72 경희궁의아침3단지'`·`'73-'` 꼬리는 `cleanKaptJibunAddr` 가 첫 지번 토큰까지만 남긴다. 매칭(K-apt 엔 PNU 없음): ① 시군구코드(법정동코드 앞 5자리, 없으면 주소의 시도·시군구명으로 마스터에서 역조회 — `kaptSidoKey` 로 '서울특별시/서울시/서울' 통일, '성남시' 만 오면 분당·수정·중원 전부 후보) + 읍면동 + 지번 → ② 같은 시군구·읍면동 안 정규화명 유일 → ③ 도로명주소 완전 일치(공백·괄호 제거). **모호하면 건너뛴다**(속성을 엉뚱한 단지에 쓰는 것보다 비우는 게 낫다). 적용은 `kaptCode·saleType·heating·elevatorCount` 는 덮어쓰고 `households·dongCount·approvedDate·roadAddr` 는 마스터가 비었을 때만. API 모드는 목록 전량(1,000/페이지) → 목록만으로 1차 매칭 → `kaptCode`·`heating` 이 이미 찬 단지는 건너뛰고 기본정보+상세 2콜씩(120ms 간격, `--max-calls`). 경로는 `AptListService4/getTotalAptList4`·`AptBasisInfoServiceV5/getAphusBassInfoV5`·`getAphusDtlInfoV5`(2026-09-02 실응답 확인) — 게이트웨이 `12 서비스 없음` 은 미신청이 아니라 **경로 버전 불일치** 코드다.

**건축물대장** [housing-buildings.service.ts](../../apps/friendly/src/modules/housing/housing-buildings.service.ts) + [bldg-hub.adapter.ts](../../apps/friendly/src/modules/housing/bldg-hub.adapter.ts): PNU 19자리 → `sigunguCd(5)·bjdongCd(5)·platGbCd(PNU 11번째 1→'0' 대지, 2→'1' 산)·bun(4)·ji(4)`, 총괄표제부 `getBrRecapTitleInfo` + 표제부 `getBrTitleInfo`(동마다 한 행, 100/페이지·최대 10페이지). 요약(`summarizeBldgRecords`): 주차는 총괄 `totPkngCnt` → 총괄 4종 합 → 표제부 4종 합, 최고층·구조(최빈)·승강기(승용+비상)·동수는 주용도가 주거(`아파트|공동주택|주택|주거`)인 표제부만(상가동 제외), 세대수·사용승인일·도로명은 총괄 우선. 대상은 PNU 가 있고 `buildingFetchedAt null` 인 아파트를 **세대수 큰 순**(큰 단지부터), 응답이 0건이어도 장부를 찍어 재호출하지 않는다(`--only-missing` 으로 다시). 적용은 주차·최고층·구조 덮어쓰기, 나머지는 빈 값만. 필드명은 활용명세 기준이고 **실응답으로 검증하지 못했다** — 프로브(2026-08-30)에서 키 미등록 30.

### 좌표 보완 — 도로명 → 지번 → 지번 변형

[housing-geocode.service.ts](../../apps/friendly/src/modules/housing/housing-geocode.service.ts) `geocodeMissingHousingComplexes`: `lat null` 인 아파트 단지를 ① `roadAddr`(공시가격·K-apt·건축물대장이 채운 것) + 지번 원문을 `geocodeLifeRows` 에 한 번에(life-map 의 `lifeAddressCandidates` 가 도로명→지번→정제본 후보를 만든다) → ② 못 맞춘 단지만 지번 변형을 단계별로(`housingJibunVariants`: `'0578-0005'→'578-5'` 정규화 → '산' 접두 토글 → 부번 제거 — 마지막은 같은 본번 필지라 수십 m 오차 감수). 호출 예산은 단계마다 줄여 넘기고, 키·한도 오류(`hardStop`)는 다음 단계를 막지만 오프라인은 캐시에 변형 주소가 있을 수 있어 계속 돈다. `HousingSync{kind:'geocode'}`. deploy.sh 는 `--offline` 으로만 돌린다.

### 조회 — 점/셀 이중 모드, 폴백 조인, 파생 표만

[housing.service.ts](../../apps/friendly/src/modules/housing/housing.service.ts) `getPoints`: `requireLoaded`(최신 `HousingSync complex` 없으면 503 + `pnpm --filter friendly load:housing-complexes 실행 필요`; `fetchedAt`·`syncId` 는 `stats` sync 우선) → `floor(zoom) ≥ HOUSING_POINT_MIN_ZOOM(13)` 이고 bbox 한 변 ≤ 1.5°(줌 속임 방어) 면 **points**: raw SQL 한 방 — `housing_complexes` 를 `(lat,lng)` 범위로 긁으며 `housing_complex_stats` 를 두 번(축 행 `s` + 폴백 행 `f: dealType='any' AND band='all'`) 과 `housing_complex_prices`(`band='all'`) 를 LEFT JOIN, `LIMIT 4001` 로 받아 4,000 초과면 `truncated` + `count`. 응답 항목은 `latest`(축의 최근 거래) / `fallback`(축에 거래가 없을 때만, `latestDealType` 이 유형 밖이면 없음) / `official`(있으면 항상 — 상세 없이도 배지 옆에 쓰게) / `saleType`. 아니면 **cells**: [life-map](life-map.md) 과 같은 전국 고정 원점 `LIFE_CELL_ORIGIN(33N,124E)` 격자이되 `lifeCellSizeDeg(zoom-1)` 로 **한 칸을 두 배**(화면 ~128px) — 평당가 알약(60~80px)이 숫자 버블보다 넓어 64px 칸에선 이웃과 겹친다(2026-08-30 실화면). `GROUP BY cx, cy` 로 단지 수·거래 있는 단지 수·`AVG(latestPrice/latestArea)`(만원/㎡)·무게중심(셀 중심 ±15% 클램프). 키 `zoom|정렬 bbox|dealType|band|syncId` LRU **300개·10분**.

`getNearby`: 등거리 근사 bbox(`radius/111,320`, 경도 `cos(lat)`) → `findMany` → 하버사인 → 반경 필터·거리순(동률은 이름) → `limit` → `extrasFor`(id 500개 청크로 축 행 + `any/all` 행 + `all` 공시가격 한 번에). `search`: `name`·`altNames` `contains`, 세대수 큰 순 → 이름순, `take limit`. `getComplex`: 단지 + 통계 전부(유형별로 `all→b4` 순 정렬, `any` 행은 유형 정확 일치라 자연히 빠짐) + 공시가격 전부 + 보강 열. `getTrades`: `complexId·dealType·구간(area > min AND <= max)·canceled=false(includeCanceled 아니면)` 로 `dealDate desc, id asc` offset 페이징 + `count`.

### 웹 UI 골격

[HousingPage](../../apps/web/src/routes/HousingPage.tsx) 는 [LifeMapPage](../../apps/web/src/routes/LifeMapPage.tsx) 와 같은 뼈대: URL 이 진실(`?ll&z(5~19)&sel(≤200자)`, 사용자 이동만 URL 반영·모든 뷰포트 변경은 250ms 디바운스 뒤 조회 키), 진입 중심 URL → 저장한 내 위치(`useAirLocation`, 날씨·대기·일상지도와 공유, 늦게 오면 1회 flyTo) → 서울시청 줌 15, 축(`dealType·band`)은 [housingPrefsStore](../../apps/web/src/stores/housingPrefsStore.ts)(`lp:housing-prefs` v1), 분기는 `useIsDesktopXl` JS, 모바일은 `usePublicLayout().setSubBar` + 목록 시트(z 20, half 부터 면적 칩) + 상세 시트(z 25, `key=sel`) 를 `useMapSheets(sel!==null)` 가 조율, 목록·검색 선택은 `flyTo(..., {bottomInset: sheetHalfInset(headerHeight)})`. 주변 목록은 지도 중심 1km·15건. 셀 클릭은 `flyToZoomIn(현재 줌+2)`. 안내 칩: 셀이면 "13 이상 확대하면 단지별 실거래가가 보입니다(지금 N)", 잘렸으면 "단지가 많아 일부만 표시 중".

지역 이동은 새 박스를 만들지 않고 [LifeGoToBox](../../apps/web/src/components/life-map/LifeGoToBox.tsx) 에 `extraSections`(입력 중 섹션 맨 앞에 끼움)·`onQueryChange`(디바운스된 검색어 통지 — 훅을 박스로 넘기지 않아 rules-of-hooks 유지)·`placeholder`·`kind:'complex'` 를 더해(`254fb76`, 41줄) 페이지가 `useHousingSearch(q, 6)` 로 '아파트 단지' 섹션을 만든다(좌표 없는 단지는 제외, 선택 = 줌 16 이동 + `sel`). 최근 본 위치 스토어·행정구역·역·정류장·주소 섹션은 일상지도와 공유.

[housingMarkers.ts](../../apps/web/src/components/housing/housingMarkers.ts): 마커 id `c:${id}` / `cell:${index}`, 전부 `fixedScale`(글자를 SVG 에 새기므로 라벨 없음). 배지 우선순위 — `latest`(유형색 알약) → `fallback`(회색, `'{유형 라벨} {금액}'` — 같은 유형이라도 다른 면적 구간임을 드러냄) → `official`(점선 회색 `'공시 {중위}'`) → 임대단지 회색 `'임대'` → 회색 점. 임대단지(`saleType==='임대'`)는 폴백·공시 배지 앞에 `'임대 '` 를 붙인다. 배지 data URL 은 `종류|글자|유형|선택` 키로 메모(5,000 넘으면 통째로 비움), 셀은 단지 수 버킷(1~9/10~49/50+) 대표값으로 키를 줄인다. [HousingDetailCard](../../apps/web/src/components/housing/HousingDetailCard.tsx): 유형 탭은 **로컬 축**(초기값 전역), 거래 목록 면적 구간은 전역 축; 통계 표(면적·최근 거래·12개월·평당가) → 공시가격 표(있을 때만) → 거래 목록(`useHousingTrades` 30건 '더 보기', 배지 해제/직거래/신규/갱신·갱신요구권 사용, 종전 보증금) → 출처·지연·임대·좌표 오차 주석. [HousingFooter](../../apps/web/src/components/housing/HousingFooter.tsx): 범례(색은 항상 글자와 함께) + 상태 한 줄 + 공공저작물 출처 링크 5종.

## Talks To [coverage: high — 13 sources]

- **data.go.kr 게이트웨이 3계열** — RTMS `apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev|RTMSDataSvcAptRent`(XML), K-apt `1613000/AptListService4`·`AptBasisInfoServiceV5`(JSON), 건축HUB `1613000/BldRgstHubService`(JSON). 전부 적재 스크립트·프로브·월 스케줄러만 호출, 라우트 없음. 키는 `.env DATA_GO_KR_API_KEY` 하나(`3d9dfed` — 계정당 1개, 데이터셋별 활용신청은 따로). `toServiceKeyPart` 는 [bus-api.adapter.ts](../../apps/friendly/src/modules/bus/bus-api.adapter.ts) 에서 import.
- **파일 원본 `data/open/housing/`** — `reb-complexes.csv`(44MB)·`reb-complex-names.csv`·`gongsi-2025.zip`(144MB)·`YYYYMMDD_단지_기본정보.xlsx`(11MB). 리포 밖(`/data/` gitignore), 출처·다운로드 경로·행수는 [docs/data-sources.md](../../docs/data-sources.md). xlsx 는 food 가 도입한 [lib/xlsx.ts](../../apps/friendly/src/lib/xlsx.ts) 최소 리더.
- **VWorld 지오코더** — 직접 부르지 않고 [life-map-geocode.service.ts](../../apps/friendly/src/modules/life-map/life-map-geocode.service.ts) `geocodeLifeRows`(동시 2·80ms·`--max-calls`·`LifeGeocodeCache` 영구 캐시)를 재사용. 키는 `MapSettingsService.getSecret('vworld')`(설정>지도 DB 우선 + `.env VWORLD_API_KEY` 폴백 — [db-config-env-fallback](../concepts/db-config-env-fallback.md)). 캐시 압축본 [life-geocode-cache.json.gz](../../apps/friendly/src/modules/life-map/data/life-geocode-cache.json.gz) 를 **일상지도와 같이 쓴다** — deploy.sh 의 `GZ_CHANGED` 감지·`import:life-geocode` 도 공유.
- **friendly DB(Prisma/SQLite)** — `housing_complexes`·`housing_trades`·`housing_complex_stats`·`housing_complex_prices`·`housing_trade_syncs`·`housing_syncs` + 공유 `life_geocode_caches`.
- **rate-limit 플러그인** — `RATE.housingRead`(points·nearby·trades, **240/분** — 지도 이동마다 1콜) · `RATE.housingSearch`(**120/분** — 로컬 LIKE, 디바운스 뒤). status·complex 는 전역 기본.
- **`reply-upstream-error`** — 업스트림은 없지만 미적재 503·없는 단지 404 를 라우트가 직접 응답(전역 error-handler 는 5xx 를 500 으로 뭉갠다) — 일상지도와 같은 경로.
- **croner** — `HousingRefreshScheduler` 의 cron(라우트 플러그인 수명에 묶임).
- **`@repo/api-contract`** `schemas/housing.ts`·`Routes.Housing`, **`@repo/shared`** `housingApi`·`useHousing*`, **`@repo/utils`** `housing.ts`·`housingMarker.ts`(+ `markerFrame.buildPinMarkerSvg`, `lifeMap.ts` 의 `LIFE_CELL_ORIGIN`·`lifeCellSizeDeg`, `formatBbox`·`parseLatLngParam`·`haversineM`·`approxDistanceM`·`isInKorea`·`formatDistanceM`).
- **life-map** — 셀 격자 상수·지오코딩 서비스·캐시 압축본·`LifeGoToBox`(+ `lifeMapRecentStore`)·`csvColumnIndex` 를 그대로 쓴다([life-map](life-map.md)). 지오코딩 캐시가 이 기능으로 39,181건 → 104,871건이 됐다.
- **weather/air** — 진입 중심·보라 점 오버레이는 `useAirLocation` 의 저장한 내 위치([weather](weather.md)·[air-quality](air-quality.md)).
- **map(MapCanvas)** — `fixedScale` 마커·`flyTo/flyToZoomIn` `bottomInset`·`poolKey 'housing'`([map](map.md)). 웹 시트 패턴은 [web](web.md).
- **deploy.sh** — 케이스 8 `집값 데이터 적재/갱신`(강제) + API 배포 케이스마다 `housing_data` 자동 점검. 상태는 `status:housing` 한 줄을 `stat_val` 로 키 단위 파싱.
- **food** — `parseXlsx`·`data/open` 규약을 빌린다([food](food.md)).

## API Surface [coverage: high — 9 sources]

### HTTP (공개·비로그인, `tags: ['housing']`, 접두 `/api/v1/housing`)

| 메서드 | 경로 | 파라미터 | 응답·비고 |
|---|---|---|---|
| GET | `/status` | — | `complexes{loaded,count,geocoded,baseDate,loadedAt}`·`trades`/`rents{loaded,count,fromYm,toYm,loadedAt}`(장부 집계)·`statsAt`·`officialPrices{loaded,year,complexes,loadedAt}`·`kapt{loaded,matched,loadedAt}`·`buildings{fetched,total(PNU 보유),loadedAt}`·`fetchedAt`. 푸터·범례 |
| GET | `/points` | `bbox="minLng,minLat,maxLng,maxLat"`·`zoom(0~22, 소수 허용·서버 내림)`·`dealType(기본 trade)`·`band(기본 all)` | `mode 'points'|'cells'`, `items[{id,lat,lng,name,households,latest?,fallback?,official?,saleType}]`(상한 4,000·`truncated`)·`cells[{lat,lng,count,traded,unitPrice?}]`·`total`·`minPointZoom 13`·`fetchedAt(=통계 시각)`. 미적재 503. rate 240/분 |
| GET | `/nearby` | `lat(33~39)`·`lng(124~132)`·`radius(100~3000, 기본 1000)`·`limit(1~30, 기본 15)`·축 | 거리 오름차순 `HousingComplexSummary + dist(m)`·`total`. 503. rate 240/분 |
| GET | `/search` | `q(1~40자, NFC·공백 정규화)`·`limit(1~20, 기본 10)` | `{q, items[{id,name,addr,lat?,lng?,households?}], fetchedAt}` 세대수 큰 순. 503. rate 120/분 |
| GET | `/complexes/:id` | `id` 1~200자 | `HousingComplexDetail` — 속성·`altNames[]`·`pnu`·`geoSource`·`source 'reb'|'rtms'`·`stats{trade,jeonse,monthly: HousingBandStat[]}`·`officialPrices[]`·보강 8열·`baseDate`. 404. 등록은 `decodeURIComponent(Routes.Housing.complex(':id'))` |
| GET | `/complexes/:id/trades` | 축·`limit(1~100, 기본 50)`·`offset`·`includeCanceled('1'|'0'|'true'|'false')` | `items[HousingTrade]` 계약일 내림차순·`total`. 404. rate 240/분 |

가격 단위는 전부 **만원 정수**(`price` = 매매가/보증금, `rent` = 월세, 그 외 0). `HousingLatestDeal{price,rent,area,floor?,dealDate}`, `HousingFallbackDeal = Latest + dealType`, `HousingOfficialGlance{year,median,count}`, `HousingBandStat{band,latest,count12,count,unitPrice12?}`.

### 스크립트 (`apps/friendly/package.json`, `tsx --env-file=.env`)

| 명령 | 역할 | 옵션 |
|---|---|---|
| `load:housing-complexes [csv]` | CSV 정규화 → 지번 지오코딩 → `HousingComplex` 전량 교체 → 파생 재구축(`rematchAll`) | `--names=`·`--kinds=apt,row,multi`·`--base-date=`(기본 파일명 8자리 날짜 → 수정일)·`--dry-run`·`--offline`·`--max-calls`·`--concurrency`(2)·`--pause`(80)·`--retry-notfound`·`--skip-derived` |
| `load:housing-trades` | 파티션 계획 → RTMS 순차 → 파티션 교체 → 파생 재구축 + `HousingSync` trade/rent | `--from/--to=YYYYMM`·`--months`(24)·`--recent`(3, 0 이면 안 받음)·`--force`·`--types=trade,rent`·`--sgg=11110,…`·`--max-calls`·`--pause`(150)·`--dry-run`(호출은 나감)·`--skip-derived`·`--offline`·`--max-geocode-calls` |
| `rebuild:housing-derived` | 매칭·rtms 단지·통계만 재구축(12개월 창을 오늘로 다시 자를 때) | `--rematch-all`·`--offline`·`--max-calls` |
| `load:housing-prices [zip\|csv]` | 공시가격 스트리밍 집계 → `HousingComplexPrice` 전량 교체 + `roadAddr` 채움 | `--dry-run`·`--limit-rows=N` |
| `load:housing-kapt [xlsx\|csv]` | 열 인식 → 정규화 → 3단 매칭 → 단지 속성 갱신 | `--sheet=`·`--dry-run`·`--source=api`·`--max-calls`·`--pause`(120)·`--force`·`--probe`(3콜) |
| `load:housing-buildings` | 건축HUB 총괄·표제부 → 요약 → 단지 갱신 + `buildingFetchedAt` | `--max-calls`(하루 9,800 권장)·`--sgg`·`--only-missing`·`--pause`(120)·`--probe`(2콜) |
| `geocode:housing-missing` | 좌표 없는 단지 도로명 → 지번 → 변형 재시도 | `--offline`·`--max-calls`·`--concurrency`·`--pause`·`--retry-notfound`·`--skip-variants` |
| `status:housing` | `ok complexes=N geocoded=G trades=T rents=R from= to= stats=1|0 prices=P kapt=K buildings=B` / `missing` | — |
| `probe:rtms` | 매매·전월세 각 1콜(종로구 11110, 지난달) — 키 등록·페이지 상한·필드 인벤토리 | `--lawd`·`--ym`·`--rows`(2000) |

### FE 공통 export

- [housingApi](../../packages/shared/src/api/housing.api.ts) `status()`·`points(bbox, zoom, axis)`(zoom 은 `floor`)·`nearby(lat,lng,axis,{radius,limit})`·`search(q,limit)`·`complex(id)`·`trades(id, axis, {limit,offset,includeCanceled})`; `HousingAxis{dealType,band}`.
- [useHousing.ts](../../packages/shared/src/hooks/useHousing.ts): `useHousingStatus`·`useHousingPoints(params|null)`(키 `['housing','points',bbox,floor(zoom),axisKey]`, `placeholderData: prev`)·`useHousingNearby(lat,lng,axis,{radius,limit,enabled})`(좌표 키 소수 4자리)·`useHousingSearch(q,limit)`(1~40자, `retry:false`)·`useHousingComplex(id|null)`·`useHousingTrades(id, axis, {pageSize 30, includeCanceled})`(`useInfiniteQuery` offset 페이징); `housingAxisKey`. **staleTime 6시간**(월 단위 적재 + 최근 몇 달 재수집), 검색 10분.
- [utils housing.ts](../../packages/utils/src/housing.ts): `HOUSING_DEAL_TYPES/LABEL`·`isHousingDealType`·`HOUSING_AREA_BANDS/LABEL/RANGE`(`(min,max]`, 60/85/135)·`housingAreaBandOf`·`HOUSING_COMPLEX_KINDS/LABEL`·`housingComplexKindOfCode`('1'/'2'/'3')·`HOUSING_POINT_MIN_ZOOM 13`·`HOUSING_POINTS_MAX 4000`·`parseHousingManwon`·`formatHousingPrice`(≥100억 정수, ≥1억 소수 1자리, 아니면 '9,800만')·`formatHousingRent`('1억/120')·`formatHousingDealPrice`·`PYEONG_M2 3.3058`·`housingPyeong`·`formatHousingArea`('84.97㎡ (25.7평)')·`formatHousingUnitPrice`('5,200만/평')·`formatHousingUnitPriceShort`(셀용 '/평' 생략)·`formatHousingYm`·`formatHousingDateShort`('YY.MM.DD')·`housingYmAdd/Range/CurrentYm(Asia/Seoul)/DateMonthsAgo`·`housingDealDate`·`normalizeHousingName`(괄호 내용 살려 접기·'아파트/APT' 접미·공백·기호 제거·소문자).
- [utils housingMarker.ts](../../packages/utils/src/housingMarker.ts): `HOUSING_DEAL_COLOR{trade #c2410c, jeonse #1d4ed8, monthly #047857}`·`HOUSING_EMPTY_COLOR #9ca3af`·`HOUSING_FALLBACK_COLOR #6b7280`; `buildHousingBadgeSvg`(높이 22·11px 굵게·글자폭 추정 + 16)/`SelectedBadgeSvg`(26 + 꼬리 7, 앵커 아래 중앙)·`buildHousingBadgeDataUrl`·`buildHousingEmptyDotSvg`(10px)/`EmptyMarkerDataUrl`(선택 시 건물 아이콘 핀)·`buildHousingCellSvg`(버킷별 font 11/12/13·높이 24/27/30·`fill-opacity .88`)·`buildHousingMutedBadgeSvg`/`MutedSelectedBadgeSvg`(`dashed` 면 점선 외곽선 + 연한 채움 `#e5e7eb` + 진한 글자).

## Data [coverage: high — 7 sources]

마이그레이션 [20260830094116_add_housing](../../apps/friendly/prisma/migrations/20260830094116_add_housing/migration.sql) + [20260830112334_add_housing_enrich](../../apps/friendly/prisma/migrations/20260830112334_add_housing_enrich/migration.sql)(보강 9열 + `latestDealType` + 공시가격 표):

| 테이블(모델) | 키·주요 컬럼 | 인덱스 |
|---|---|---|
| `housing_complexes`(`HousingComplex`) | `id`(reb = 단지고유번호 / rtms = `rt:<sggCd>:<umd>:<jibun>:<norm>`)·`source 'reb'|'rtms'`·`pnu?`(19자리, reb 만)·`name`·`altNames?`('|')·`kind 'apt'|'row'|'multi'`·`addr`(지번 원문)·`sido`·`sgg`·`umd`·`jibun?`·`sggCd`(5)·`bjdCd?`(10)·`dongCount?`·`households?`·`approvedDate?`·`lat/lng?`·`geoSource 'road'|'parcel'|null`·`baseDate` + 보강 `kaptCode?`·`saleType?`·`heating?`·`elevatorCount?`·`roadAddr?`·`parkingCount?`·`floorsMax?`·`structure?`·`buildingFetchedAt?` | `(lat,lng)`·`(sggCd,umd,jibun)`·`(kind,households)` |
| `housing_trades`(`HousingTrade`) | `id`(sha1 24자 [+`#n`])·`complexId?`·`sggCd`·`dealYm`·`dealDate`·`dealType`·`umdNm`·`jibun?`·`aptNm`·`aptSeq?`(매매만)·`roadNm?`·`area`·`floor?`·`buildYear?`·`price`·`rent`(기본 0)·`dealingGbn?`·`canceled`·`canceledDate?`·`rgstDate?`·`aptDong?`·`buyerGbn?`·`slerGbn?`·`contractType?`·`useRRRight?`·`contractTerm?`·`preDeposit?`·`preRent?`·`landLease` | `(complexId,dealType,dealDate)`·`(sggCd,dealYm,dealType)` |
| `housing_complex_stats`(`HousingComplexStat`) | PK `(complexId, dealType, band)` · `latestPrice`·`latestRent`·`latestArea`·`latestFloor?`·`latestDate`·`count12`·`count`·`unitPrice12?`·`latestDealType?`(`any/all` 행에서만) | — |
| `housing_complex_prices`(`HousingComplexPrice`) | PK `(complexId, band)` · `year`·`count`·`median`·`min`·`max`(만원)·`avgArea` | — |
| `housing_trade_syncs`(`HousingTradeSync`) | PK `(sggCd, dealYm, dealType)` · `count`·`fetchedAt` — 파티션 장부, 증분·재수집 판단·상태 API 의 거래 건수 원천 | `(dealType, dealYm)` |
| `housing_syncs`(`HousingSync`) | `id`·`kind 'complex'|'trade'|'rent'|'stats'|'prices'|'kapt'|'buildings'|'geocode'`·`count`·`geocoded?`·`baseDate?`·`sourceFile?`·`loadedAt` — 종류별 최신 행이 "적재됨" 판정·`fetchedAt`·셀 캐시 키(`stats`) | `(kind, loadedAt)` |

인메모리 캐시: `HousingService.cellCache`(LRU 300 · 10분, 키에 stats `syncId`). 클라이언트 React Query 6h/10분. 클라이언트 스토어(웹 localStorage): `lp:housing-prefs` v1 — `{dealType:'trade', band:'all'}`(`partialize`). 위치·선택은 URL. 최근 본 위치는 일상지도의 `lp:life-map-recent` 를 공유.

저장소 커밋 산출물: [life-geocode-cache.json.gz](../../apps/friendly/src/modules/life-map/data/life-geocode-cache.json.gz) — 컴파일 시점 해독 `exportedAt 2026-09-01T18:32:54Z`, **104,871건**(ok 73,754 · notfound 31,117 / road 47,174 · parcel 57,697), 2,374,882바이트(`254fb76` 104,174건 2,364,032바이트 → `168b363` +697건). 원본 CSV·zip·xlsx 는 gitignore.

## Key Decisions [coverage: high — 12 sources]

- **2026-09-02 data.go.kr 키를 `DATA_GO_KR_API_KEY` 하나로**(`3d9dfed`) — BUS·AIRKOREA·KMA·HIRA·RTMS·KAPT·BLDG·FOOD 8종 이름과 `|| BUS_API_KEY` 폴백이 29파일에 흩어져 "버스 키가 집값에 쓰이는" 오해를 낳았다. 호환 별칭 없음(**운영 .env 는 배포 전 이름 변경 필요**). 데이터셋별 다른 계정 키로 쿼터를 나누는 능력은 포기(쓴 적 없음).
- **2026-09-02 deploy.sh K-apt 파일 탐지는 glob for 루프**(`b8c08ed`) — `$(ls *단지_기본정보*.xlsx | sort | tail -n1)` 은 파일이 없으면 `set -euo pipefail` 아래 대입의 명령 치환 실패로 메뉴를 찍기 전에 스크립트가 종료됐다(출력 없음). 파일 없으면 빈 값 → `kapt-mandatory.xlsx` 폴백, 있으면 사전순 마지막(최신 날짜).
- **2026-09-02 K-apt 는 포털 xlsx 형식 그대로 받고, API 는 V5 경로**(`168b363`) — 안내문 1행 건너뛰기·승강기 6열 합산·지번 뒤 단지명 꼬리 제거로 지번 매칭 0건 → 17,484. 파일명은 그대로 두면 패턴의 최신 파일을 고른다(로더·deploy.sh 동일). 게이트웨이 `12` 를 미신청으로 오해했던 것을 "경로 버전 불일치" 로 확정(어댑터 주석에 다음 12 대처법 기록). 지오코딩 캐시 +180 좌표 재export.
- **2026-09-02 요청 경로는 파생 표만 읽고, 거래 표는 상세의 거래 목록에서만**(`254fb76`) — 709만 행 거래 표를 지도 이동마다 집계하지 않기 위한 유일한 분기. 폴백 행 `any/all` 을 통계 표에 한 줄 더 두어(조인 하나 추가) "다른 조건의 마지막 거래" 를 거래 표 없이 답한다.
- **2026-09-02 실거래는 upsert 가 아니라 파티션 교체 + 장부**(`254fb76`) — 신고 지연 30일·해제 신고로 같은 달이 바뀌므로 (시군구, 계약년월, 유형) 단위로 최신 상태를 그대로 옮기고 `HousingTradeSync` 가 "어느 달을 받았나" 를 기억한다. 계획은 최신 연월부터(한도에 걸려도 최근 먼저), 호출은 순차 150ms(일 10,000·게이트웨이 예의). 자동 갱신은 인프로세스 croner(단일 인스턴스, Redis 없음)이고 서버는 VWorld 를 부르지 않는다.
- **2026-09-02 셀 격자는 일상지도의 두 배**(`254fb76`, 결정 2026-08-30 실화면) — 평당가 알약이 숫자 버블보다 넓어 64px 칸에선 이웃과 겹친다. 셀 글자는 '/평' 을 뗀 짧은 형(범례가 설명). `HOUSING_POINT_MIN_ZOOM 13` 은 전국 4.6만 단지(서울 ≈8개/km²) → z13 뷰포트 ≈260km² 에서 ~2천 단지로 상한 4,000 안 — 배지가 점보다 커서 화장실(13)과 같은 줌이라도 밀도는 낮게.
- **2026-09-02 정보 없는 단지의 보강 순서와 "모양으로도 구분"**(`254fb76`) — `latest` → `fallback`(회색 채움 + 유형 라벨) → `official`(점선 외곽선 + 연한 채움 — 실거래가 아님을 색뿐 아니라 모양으로) → `'임대'` → 회색 점. `official` 은 축에 거래가 있어도 항상 실어 상세 없이 배지 옆에 쓸 수 있게. 임대단지(K-apt 분양형태)는 실거래가 없는 게 정상이라 지도·목록·상세에 그렇게 적는다.
- **2026-09-02 축 = 거래 유형 × 전용면적 구간, 한 번에 한 유형**(`254fb76`) — 구간 경계 60·85·135㎡(K-apt·통계청 관행, 85 = 국민주택 규모), `(min, max]`. 색은 유형당 하나(매매 주황·전세 파랑·월세 초록, 흰 외곽선)로 한 화면엔 한 유형만 그리므로 유형 사이 대비만 있으면 된다. 상세의 유형 탭은 로컬 축이고 거래 목록의 면적 구간은 전역 축.
- **2026-09-02 단지 마스터 재적재 시 보강 컬럼·좌표 이어받기**(`254fb76`) — 며칠치 API 쿼터로 채운 K-apt·건축물대장·좌표 보완이 CSV 갱신에 사라지지 않게 같은 id 에서 옮긴다. 공시가격 표는 id 기준이라 아예 지우지 않는다. 대신 rtms 단지·통계는 지우고 파생 재구축이 다시 만든다.
- **2026-09-02 공시가격은 zip 을 풀지 않고 스트리밍, 의존성 없이**(`254fb76`) — 3.4GB CSV 는 문자열 상한 때문에 통째로 못 읽고, zip 리더도 중앙 디렉터리·zip64 만 직접 읽어 deflate 스트림 하나만 푼다. 매칭은 PNU 직결(특수지코드 자리 매핑을 샘플로 검증) + 법정동·정규화명 폴백.
- **2026-09-02 K-apt 매칭은 모호하면 건너뛰고, 건축물대장은 큰 단지부터 + deploy 자동 실행 제외**(`254fb76`) — 속성을 엉뚱한 단지에 쓰는 것보다 비우는 게 낫다. 건축물대장은 단지당 2콜 × 4.6만이라 쿼터 소모가 커 수동으로만(`--max-calls=9800` 하루치 분할, `buildingFetchedAt` 장부로 이어감).
- **2026-09-02 지오코딩 캐시는 일상지도와 같은 압축본에 실어 커밋**(`254fb76`) — 로컬에서 온라인 적재 후 `export:life-geocode` 로 갱신하면 운영은 `--offline` 으로 호출 0건(39,181 → 104,174 → 104,871건). 좌표 보완은 도로명(보강이 채운) → 지번 → 지번 변형(부번 제거는 수십 m 오차 감수) 순.
- **2026-09-02 지역 이동은 LifeGoToBox 확장, 새 박스 없음**(`254fb76`) — `extraSections`·`onQueryChange` 만 더해 페이지가 자기 검색 훅을 돌린다(훅을 박스로 넘기지 않아 rules-of-hooks 유지). 최근 본 위치·저장한 내 위치도 일상지도와 공유. 상단바 NAV 7번째 '집값' 은 라벨 2자(≈44px)라 lg(1024) 에서도 칩·테마·계정과 한 줄에 든다 — 라벨을 늘리면 lg 구간 재실측.
- **2026-09-02 1차는 아파트만**(`254fb76`) — 실거래 API 도 아파트 계열만 붙였고, 연립(2)·다세대(3) 는 코드표·`--kinds` 만 미리 둔다(마스터 CSV 의 261,487행은 `skippedKind`).

## Gotchas [coverage: high — 11 sources]

- **건축물대장은 미적재(`buildings=0`)** — 15134735 활용신청이 승인되지 않아 프로브(2026-08-30)가 30 으로 끝났고, 어댑터 필드명(`totPkngCnt`·`grndFlrCnt`·`strctCdNm`·`rideUseElvtCnt`…)은 활용명세 기준일 뿐 실응답 검증이 없다. 승인 뒤 `load:housing-buildings --probe`(2콜) 로 인벤토리를 먼저 본다. 상세의 주차·최고층·구조는 현재 전부 null.
- **좌표 미해결 8,023단지(17%)** — 지도 점·셀·주변 목록에 안 나오고(검색·상세는 됨, 옴니박스 단지 섹션도 좌표 없는 항목은 제외) 상세에 "주소를 좌표로 변환하지 못해 지도에는 표시되지 않습니다" 로 보인다. `geocode:housing-missing`(온라인, `--retry-notfound` 로 notfound 31,117건 재시도 가능) → `export:life-geocode` → gz 커밋 → 배포 시 `GZ_CHANGED` 자동 import.
- **`docs/deploy-friendly.md` 엔 집값 절이 없다** — 운영 절차는 [deploy.sh](../../deploy.sh) 헤더 주석과 [docs/data-sources.md](../../docs/data-sources.md) 에만 있다. 첫 배포는 케이스 2/4(마이그레이션) 뒤 `housing_data` 가 단지 CSV + 캐시로 적재하고 거래는 **최근 3개월만** 받는다 — 5년 백필은 `HOUSING_MONTHS=60 ./deploy.sh 8` 또는 `load:housing-trades --months=60 --recent=0 --max-calls=9800` 을 며칠 나눠 실행(장부가 이어 받는다). 단지 CSV 가 서버에 없으면 "올린 뒤 ./deploy.sh 8" 안내만 하고 넘어간다.
- **운영 `.env` 키 이름** — `3d9dfed` 이후 `RTMS_API_KEY`·`KAPT_API_KEY`·`BLDG_API_KEY`·`BUS_API_KEY` 등은 읽지 않는다. `DATA_GO_KR_API_KEY` 가 비면 월 스케줄러가 warn 후 건너뛰고 `load:housing-trades` 는 즉시 종료.
- **K-apt 매칭 수가 문서와 다르다** — [docs/data-sources.md](../../docs/data-sources.md) 는 파일 매칭 20,273단지, 로컬 `status:housing` 은 `kapt=20615`(`HousingSync kapt` 2회 — 파일 뒤 API 401단지 추가분이 겹친 결과). `--source=api` 는 `kaptCode`·`heating` 이 이미 찬 단지를 건너뛰므로 재실행이 싸다.
- **통계 12개월 창은 재계산 시점 기준** — `count12`·`unitPrice12` 는 마지막 `rebuild`(또는 월 갱신) 시각의 "오늘" 로 잘린다. cron 을 끈 환경에선 `rebuild:housing-derived` 를 돌리지 않으면 12개월 건수가 낡는다. 폴백 배지의 "최근 거래" 도 마찬가지.
- **`replaceHousingComplexes` 뒤 `--skip-derived` 면 지도가 빈다** — 통계 표를 지우고 거래 연결을 끊으므로 파생 재구축 전엔 모든 단지가 회색 점(공시가격 배지만 남음). deploy.sh 는 거래가 0건일 때만 `--skip-derived` 를 붙이고 거래 수집 끝에 재구축한다.
- **해제 거래** — 통계·배지에서 제외, 상세 거래 목록 기본 제외(`includeCanceled=1` 로 취소선 표시). 전월세 API 엔 해제 필드가 없어 `rents` 의 `canceled` 는 항상 0. 매매 5년치 중 103,203건(5.4%).
- **거래 id 의 `'#n'` 접미는 파티션 안 등장 순서에 의존** — 재수집 때 API 가 순서를 바꾸면 완전 중복 행의 id 가 뒤바뀔 수 있다(내용은 같으므로 표시엔 영향 없음). 상세 거래 목록 `key` 로만 쓴다.
- **rtms 단지는 시도명을 빌릴 `reb` 단지가 그 시군구에 있어야 만들어진다** — 마스터에 단지가 하나도 없는 시군구의 거래는 `complexId null` 로 남아 어디에도 안 보인다(로컬 실측 0건이지만 `--sgg` 로 마스터 밖 시군구를 받으면 생긴다). rtms 단지는 세대수·동수·승인일이 없어 상세에 "실거래 주소로만 확인된 단지" 안내.
- **스케줄러 `force:true` 는 최근 N개월 전 파티션을 매번 다시 받는다** — 3개월 × 504콜 ≈ 1,512콜/실행. `HOUSING_REFRESH_CRON` 을 하루 여러 번으로 두면 일 한도를 먹는다(.env.example 예시는 월 2·17일 04:00).
- **RTMS 페이지 상한은 코드에 실측치가 없다** — 어댑터는 첫 페이지 실제 행수로 `pageCap` 을 감지해 이어 받고(테스트는 100건 상한 시나리오) 스크립트가 "게이트웨이 페이지 상한 관측" 을 찍는다. 상한이 있으면 강남 3구 전월세 성수기(~3,000행) 파티션은 콜이 늘어 504 추정이 깨진다.
- **공시가격 적재는 메모리 ~100MB·수 분** — 호별 값을 배열로 쥔다. `--limit-rows` 는 부분 집계라 확인용. 기준연도를 못 읽으면 적재하지 않는다.
- **테스트 격리** — [housing.test.ts](../../apps/friendly/src/modules/housing/housing.test.ts)(10건)·derived·kapt 적용·buildings·geocode 테스트는 `useIsolatedDatabase()`. 어댑터 테스트는 가짜 `fetchImpl`. 웹 [HousingPage.test.tsx](../../apps/web/src/routes/HousingPage.test.tsx)(9건 = 데스크톱 7 + 모바일 시트 2)는 `MapCanvas` 목 + MSW 라 points 요청은 나가지 않는다(주변·검색·상세·거래·저장 위치 계약만).
- **앱 화면 없음** — 홈 카드·라우트·WebView 임베드 어느 것도 없다. [mobile](mobile.md) 의 최근 패턴(3D 기능 WebView 임베드)과 달리 집값은 지도 페이지라 임베드 대상에도 들지 않았다.
- **`status.geocoded`·`complexes.count` 는 rtms 단지를 포함** — 마스터 45,920 과 다르다(47,193). 푸터 "좌표 N%" 의 분모도 같다.

## Sources [coverage: high — 70 sources]

### friendly (백엔드·스크립트·운영)
- [apps/friendly/src/modules/housing/housing.route.ts](../../apps/friendly/src/modules/housing/housing.route.ts)
- [apps/friendly/src/modules/housing/housing.service.ts](../../apps/friendly/src/modules/housing/housing.service.ts)
- [apps/friendly/src/modules/housing/housing.test.ts](../../apps/friendly/src/modules/housing/housing.test.ts) — 10건(격리 DB: 미적재 503·상태·점/셀·폴백·주변·검색·상세·거래·계약 400)
- [apps/friendly/src/modules/housing/housing-complex-master.service.ts](../../apps/friendly/src/modules/housing/housing-complex-master.service.ts) (+[test](../../apps/friendly/src/modules/housing/housing-complex-master.test.ts) 6건 — 주소 분해·정규화·kinds·하드 fail·이력·BOM)
- [apps/friendly/src/modules/housing/housing-trade-master.service.ts](../../apps/friendly/src/modules/housing/housing-trade-master.service.ts) (+[test](../../apps/friendly/src/modules/housing/housing-trade-master.test.ts) 6건 — 매매/전월세 정규화·해제·drop·`#n`·날짜)
- [apps/friendly/src/modules/housing/rtms.adapter.ts](../../apps/friendly/src/modules/housing/rtms.adapter.ts) (+[test](../../apps/friendly/src/modules/housing/rtms.adapter.test.ts) 7건 — XML 파싱·마스킹·0건·30·5xx 재시도·비XML·페이지 상한)
- [apps/friendly/src/modules/housing/datago-json.adapter.ts](../../apps/friendly/src/modules/housing/datago-json.adapter.ts) — K-apt·건축HUB 공통 JSON 클라이언트
- [apps/friendly/src/modules/housing/kapt.adapter.ts](../../apps/friendly/src/modules/housing/kapt.adapter.ts) — `AptListService4`·`AptBasisInfoServiceV5`
- [apps/friendly/src/modules/housing/bldg-hub.adapter.ts](../../apps/friendly/src/modules/housing/bldg-hub.adapter.ts) (+[test](../../apps/friendly/src/modules/housing/bldg-hub.adapter.test.ts) 4건 — PNU 분해·items 버릇·페이징·30/5xx)
- [apps/friendly/src/modules/housing/housing-price-master.service.ts](../../apps/friendly/src/modules/housing/housing-price-master.service.ts) (+[test](../../apps/friendly/src/modules/housing/housing-price-master.test.ts) 9건 — 줄 파서·PNU·스트림·집계·zip 중앙 디렉터리)
- [apps/friendly/src/modules/housing/housing-kapt-master.service.ts](../../apps/friendly/src/modules/housing/housing-kapt-master.service.ts) (+[test](../../apps/friendly/src/modules/housing/housing-kapt-master.test.ts) 9건 — 열 인식·포털 xlsx 형식·정규화·API 행·3단 매칭·적용)
- [apps/friendly/src/modules/housing/housing-buildings.service.ts](../../apps/friendly/src/modules/housing/housing-buildings.service.ts) (+[test](../../apps/friendly/src/modules/housing/housing-buildings.service.test.ts) 4건 — 요약 규칙·세대수 순·장부·30 중단)
- [apps/friendly/src/modules/housing/housing-derived.service.ts](../../apps/friendly/src/modules/housing/housing-derived.service.ts) (+[test](../../apps/friendly/src/modules/housing/housing-derived.test.ts) 5건 — 키 정규화·매칭·rtms·재실행·rematchAll·재사용)
- [apps/friendly/src/modules/housing/housing-geocode.service.ts](../../apps/friendly/src/modules/housing/housing-geocode.service.ts) (+[test](../../apps/friendly/src/modules/housing/housing-geocode.service.test.ts) 2건 — 변형 후보·단계별 채움)
- [apps/friendly/src/modules/housing/housing-ingest.service.ts](../../apps/friendly/src/modules/housing/housing-ingest.service.ts)
- [apps/friendly/src/modules/housing/housing-refresh.service.ts](../../apps/friendly/src/modules/housing/housing-refresh.service.ts)
- [apps/friendly/src/modules/life-map/life-map-geocode.service.ts](../../apps/friendly/src/modules/life-map/life-map-geocode.service.ts) — `geocodeLifeRows` 재사용
- [apps/friendly/src/modules/life-map/data/life-geocode-cache.json.gz](../../apps/friendly/src/modules/life-map/data/life-geocode-cache.json.gz) — 104,871건 2.3MB(`254fb76`→`168b363`)
- [apps/friendly/src/lib/csv.ts](../../apps/friendly/src/lib/csv.ts) — `parseCsv`·`csvColumnIndex`
- [apps/friendly/src/lib/xlsx.ts](../../apps/friendly/src/lib/xlsx.ts) — `parseXlsx`(K-apt 포털 파일)
- [apps/friendly/src/lib/narrow.ts](../../apps/friendly/src/lib/narrow.ts) — `coerceStrOrNull/intOrNull/isObject`
- [apps/friendly/src/lib/reply-upstream-error.ts](../../apps/friendly/src/lib/reply-upstream-error.ts) — 503/404 직접 응답
- [apps/friendly/src/modules/bus/bus-api.adapter.ts](../../apps/friendly/src/modules/bus/bus-api.adapter.ts) — `toServiceKeyPart`
- [apps/friendly/src/modules/settings/map.service.ts](../../apps/friendly/src/modules/settings/map.service.ts) — `getSecret('vworld')`
- [apps/friendly/scripts/load-housing-complexes.ts](../../apps/friendly/scripts/load-housing-complexes.ts)
- [apps/friendly/scripts/load-housing-trades.ts](../../apps/friendly/scripts/load-housing-trades.ts)
- [apps/friendly/scripts/load-housing-prices.ts](../../apps/friendly/scripts/load-housing-prices.ts)
- [apps/friendly/scripts/load-housing-kapt.ts](../../apps/friendly/scripts/load-housing-kapt.ts)
- [apps/friendly/scripts/load-housing-buildings.ts](../../apps/friendly/scripts/load-housing-buildings.ts)
- [apps/friendly/scripts/geocode-housing-missing.ts](../../apps/friendly/scripts/geocode-housing-missing.ts)
- [apps/friendly/scripts/rebuild-housing-derived.ts](../../apps/friendly/scripts/rebuild-housing-derived.ts)
- [apps/friendly/scripts/housing-status.ts](../../apps/friendly/scripts/housing-status.ts)
- [apps/friendly/scripts/probe-rtms-api.ts](../../apps/friendly/scripts/probe-rtms-api.ts)
- [apps/friendly/package.json](../../apps/friendly/package.json) — `load:housing-*`·`rebuild:housing-derived`·`geocode:housing-missing`·`status:housing`·`probe:rtms`
- [apps/friendly/prisma/migrations/20260830094116_add_housing/migration.sql](../../apps/friendly/prisma/migrations/20260830094116_add_housing/migration.sql)
- [apps/friendly/prisma/migrations/20260830112334_add_housing_enrich/migration.sql](../../apps/friendly/prisma/migrations/20260830112334_add_housing_enrich/migration.sql)
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — `HousingComplex`·`HousingTrade`·`HousingComplexStat`·`HousingTradeSync`·`HousingSync`·`HousingComplexPrice`
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) — `DATA_GO_KR_API_KEY`·`HOUSING_REFRESH_CRON`·`HOUSING_REFRESH_MONTHS`
- [apps/friendly/.env.example](../../apps/friendly/.env.example) — 데이터셋별 활용신청·쿼터 메모
- [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — `housingRead`·`housingSearch`
- [deploy.sh](../../deploy.sh) — `housing_data`·케이스 8·`kapt_latest_xlsx`·`HOUSING_MONTHS`
- [docs/data-sources.md](../../docs/data-sources.md) — `data/open/housing/*` 규약·행수·보강 적재 순서 표
- [.gitignore](../../.gitignore) — `/data/`

### 계약·공통
- [packages/api-contract/src/schemas/housing.ts](../../packages/api-contract/src/schemas/housing.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.Housing`
- [packages/shared/src/api/housing.api.ts](../../packages/shared/src/api/housing.api.ts)
- [packages/shared/src/hooks/useHousing.ts](../../packages/shared/src/hooks/useHousing.ts)
- [packages/utils/src/housing.ts](../../packages/utils/src/housing.ts) (+[test](../../packages/utils/src/housing.test.ts) 12건 — 가격 포맷·코드표·연월·마커 SVG)
- [packages/utils/src/housingMarker.ts](../../packages/utils/src/housingMarker.ts)
- [packages/utils/src/markerFrame.ts](../../packages/utils/src/markerFrame.ts) — `buildPinMarkerSvg`(빈 단지 선택 핀)
- [packages/utils/src/lifeMap.ts](../../packages/utils/src/lifeMap.ts) — `LIFE_CELL_ORIGIN`·`lifeCellSizeDeg`

### 웹
- [apps/web/src/routes/HousingPage.tsx](../../apps/web/src/routes/HousingPage.tsx)
- [apps/web/src/routes/HousingPage.test.tsx](../../apps/web/src/routes/HousingPage.test.tsx) — 9건(데스크톱 7 + 모바일 시트 2, MapCanvas 목·MSW)
- [apps/web/src/components/housing/HousingMapView.tsx](../../apps/web/src/components/housing/HousingMapView.tsx)
- [apps/web/src/components/housing/housingMarkers.ts](../../apps/web/src/components/housing/housingMarkers.ts)
- [apps/web/src/components/housing/HousingFilterBar.tsx](../../apps/web/src/components/housing/HousingFilterBar.tsx)
- [apps/web/src/components/housing/HousingNearbyList.tsx](../../apps/web/src/components/housing/HousingNearbyList.tsx)
- [apps/web/src/components/housing/HousingDetailCard.tsx](../../apps/web/src/components/housing/HousingDetailCard.tsx)
- [apps/web/src/components/housing/HousingFooter.tsx](../../apps/web/src/components/housing/HousingFooter.tsx)
- [apps/web/src/stores/housingPrefsStore.ts](../../apps/web/src/stores/housingPrefsStore.ts)
- [apps/web/src/components/life-map/LifeGoToBox.tsx](../../apps/web/src/components/life-map/LifeGoToBox.tsx) — `extraSections`·`onQueryChange`·`kind 'complex'`
- [apps/web/src/stores/lifeMapRecentStore.ts](../../apps/web/src/stores/lifeMapRecentStore.ts) — 최근 본 위치 공유
- [apps/web/src/components/sheet/BottomSheet.tsx](../../apps/web/src/components/sheet/BottomSheet.tsx)
- [apps/web/src/components/sheet/useMapSheets.ts](../../apps/web/src/components/sheet/useMapSheets.ts) — `SHEET_PEEK_HEIGHT`·`sheetHalfInset`
- [apps/web/src/lib/useMediaQuery.ts](../../apps/web/src/lib/useMediaQuery.ts) — `useIsDesktopXl`
- [apps/web/src/lib/useDebounced.ts](../../apps/web/src/lib/useDebounced.ts)
- [apps/web/src/components/restaurant/MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx) — `fixedScale`·`bottomInset`
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx) — `/housing` lazy 라우트
- [apps/web/src/components/PublicTopBar.tsx](../../apps/web/src/components/PublicTopBar.tsx) — NAV 7번째 '집값'(lg 구간 실측 메모)
- [apps/web/src/components/PublicSidebar.tsx](../../apps/web/src/components/PublicSidebar.tsx) — 메뉴 '집값'(`Building2`)
