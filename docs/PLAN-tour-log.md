# 여행로그(AI 허브 71780) 연동 계획 — "집계는 공개, 원본은 관리자, 계약은 export 하나"

> 2026-09-13 작성. 커밋 여부는 사용자 지시에 따름(작성 시점 untracked).
> 계획 시점의 기록이며, 이후 실제 진행·변경 사항은 커밋 이력이 진실이다.
> 상류는 별도 작업공간 `D:\work\workspace_other\niney-tour-pickr\tour-c`(Vue + DuckDB-WASM 로컬 탐색기, 규칙은 그쪽 `AGENTS.md`).
> 이 리포는 tour-c 가 내보낸 파생표를 **적재·집계·매칭·표시**만 한다. 프로토타입: https://claude.ai/code/artifact/1392ba04-af21-4e31-8118-2b799c89ae54

## Context

AI 허브 「국내 여행로그 데이터(제주도 및 도서지역) 2023」(데이터셋 71780)은 2023년 4~9월 패널 2,880명이 여행 직후 입력한
방문지·만족도·체류·지출·활동·동선이다. tour-c 가 원본 203GB 를 파생표 11개(여행 2,880 · 공개 방문 45,265 · 장소 15,679)로
정리해 두었고, 그중 **제주 식당 3,686곳(방문자 5명 이상 512곳)의 실제 방문 통계**가 이 서비스의 맛집·골라주기·코스에 바로 쓰인다.

AI 허브 이용조건상 **원본(개별 기록·사진·GPS·원본 표)의 제3자 열람·제공은 금지**이고, **집계·서비스 등 2차 저작물은 영리 포함
자유(출처 표기 필수)** 다. 그래서 구조는 "한 DB, 두 출구" — 운영 DB 에 파생표를 넣되 공개 API 는 집계만, 원본은 다운로드
승인을 받은 관리자 본인만 본다. 근거 조항은 §이용조건.

**사용자 결정 (확정 — 2026-09-13 대화 기준)**

| # | 결정 | 비고 |
|---|---|---|
| 1 | 맛집 한정이 아니라 **모든 유형(장소 7,166곳 · 제주 기준)을 가져온다** | 식당 외 유형은 맛집 DB 에 등록하지 않고 TourPlace 자체로 인사이트·코스에 쓴다 |
| 2 | 제3자(공개)에게 허용되는 것은 **전부 구현** | §공개 API·§웹 화면 |
| 3 | 운영 배포하되 원본은 **관리자 전용**으로, 운영에 쓸모 있는 것만 올린다 | §관리자 층 — 시드·폐업 확인·근거 보기·참고 사진·코스 샘플 |
| 4 | 원본 탐색(raw 14표·GPS·설문 원문·캡션)은 올리지 않는다 | tour-c 로컬이 이미 한다. 반출·환수 부담만 늘어남 |

**미확정 (진행에 영향)**

| 항목 | 기본안 | 영향 |
|---|---|---|
| 운영 서버 소재지 | 국내로 가정 | 국외면 원본(관리자 층) 자체가 "반출" — 집계만 올려야 함 |
| 관리자 계정 수 | 본인 1명으로 가정 | 다른 사람 관리자는 원본 allowlist 에서 제외(각자 AI 허브 승인 필요) |
| 참고 사진 적재 | 256px 전체 + 640px 는 시드 장소만 | 빼도 나머지 성립. 1번 큰 부담(파일 배포·인증 서빙) |
| AI 허브 서면 확인 | 4차(공개) 전에 받는다 | "학습용으로만" 조항 vs FAQ "서비스 2차 저작물 자유" 의 문언 충돌 해소 |

## 이용조건 (근거)

| 조항 | 원문 요지 | 이 계획에서의 처리 |
|---|---|---|
| 목적 제한 | "본 AI데이터는 인공지능 학습모델의 학습용으로만 사용할 수 있습니다." | 통계 서비스는 문언상 회색. FAQ·활용 가이드라인(추천·마케팅 활용 예시)에 기대되, 공개 전 서면 확인(부록 B) |
| 제3자 금지 | 승인 없는 다른 법인·단체·개인에게 **열람**·제공·양도·대여·판매 금지 | 공개 API 는 집계만(응답 스키마에 식별자 없음 + n≥5). 원본은 승인받은 본인 allowlist |
| 2차 저작물 | 모델·서비스·연구 결과물은 영리·비영리 자유, 원본 배포 불가 (FAQ) | 집계·추천·매칭 결과가 여기 해당 |
| 출처 표기 | NIA 사업결과임을 밝히고 2차 저작물에도 동일. 데이터명 + aihub.or.kr 필수 | 부록 A 문구를 집계를 쓰는 모든 섹션·about 에 |
| 국외 | 반출·국외 소재자 이용은 별도 합의 | 원본은 국내 서버에만. 관리자 원본 경로는 Cloudflare 프록시 우회 |
| 개인정보 | 재식별 금지, 발견 시 신고·삭제 | 집·친지집·사무실 방문은 tour-c 에서 이미 마스킹(이름·주소·좌표 NULL). 소셀 억제 |
| 환수 | 부적합 판단 시 이용 중지·환수·폐기 요구 가능 | `unload:tour` 한 명령으로 전부 삭제 |
| 캡션 | JSON `licenses` 가 CC-BY-SA-4.0 (㈜데이터웨이) | 공개 화면에는 쓰지 않음(어절 통계도 뺌). 관리자 참고 사진 옆에만 |

15차의 운영 정보(이용 시간·쉬는 날·주차·요금)는 여행로그가 아니라 한국관광공사 「국문 관광정보 서비스」(공공데이터포털 [15101578](https://www.data.go.kr/data/15101578/openapi.do))에서
온다 — AI 허브 조건과 별개의 공공데이터이고, 출처(한국관광공사)를 운영 정보 옆에 표기한다(응답 `infoNote`). 사진은 콘텐츠마다 저작권 유형이 달라 받지 않는다.
공개 응답에는 문구만 나가고 관광정보 콘텐츠 id·좌표는 싣지 않는다.

출처: [이용정책](https://www.aihub.or.kr/intrcn/guid/usagepolicy.do?currMenu=151&topMenu=105) · [FAQ](https://aihub.or.kr/aihubnews/faq/list.do?currMenu=146&topMenu=104) · [데이터셋](https://aihub.or.kr/aihubdata/data/view.do?dataSetSn=71780).

## 용어

| 용어 | 뜻 |
|---|---|
| **여행(trip)** | 패널 1명의 여행 1건(`travel_id`). 2,880건. 표시 명칭은 익명 라벨 `여행자 #0001` |
| **방문(visit)** | 여행 중 머문 곳 1회(`travel_id + visit_area_id`). 집·친지집·사무실은 **비공개 방문**(이름·주소·좌표 NULL) |
| **장소(TourPlace)** | 방문을 POI ID·정규화 이름·좌표(300m)로 묶은 단위(`place_id = 'p' + md5[:10]`). 15,679곳 |
| **보정 만족도(bayes)** | `(n·mean + 10·C)/(n+10)`, C = 전체 공개 방문 만족도 평균. 순위·픽 가중치에 쓴다 |
| **전이(transition)** | 같은 여행에서 바로 이어진 두 공개 방문. "다음에 간 곳" 의 재료 |
| **하루 코스 템플릿** | 여행·일차별 방문 유형 순서(`교통>식당>자연>숙소`) |
| **소셀 억제(k)** | 집계 셀의 여행자 수가 5 미만이면 값을 숨긴다. 장소 평점은 평가 3건 미만 숨김 |
| **관리자 원본 층** | 개별 행·사진을 보는 어드민 화면. 다운로드 승인받은 본인 계정만(`TOUR_RAW_USER_IDS`) |
| **시드(seed)** | TourPlace 중 아직 맛집 DB 에 없는 곳. 네이버 검색으로 등록 후보를 찾는 발굴 입력 |

## 구조 — 한 DB, 두 출구

```text
tour-c (로컬, Python/DuckDB)                    niney-life-pickr-v2 (운영)
원본 203GB → prepare.py → data/parquet ─┐
                                        └→ export_life_pickr.py → data/export/lp-2023/
                                                                   ├ manifest.json (exportVersion)
                                                                   ├ *.csv.gz (표 10개)
                                                                   └ thumbs/{s,m}/*.webp (옵션)
                                                   ↓ 복사: data/open/tour/lp-2023/ (리포 밖)
                                             load:tour ──→ Tour* 테이블(전량 교체) + LifeMasterSync layer=tour
                                                   ↓
                     ┌────────────── friendly ──────────────┐
                     │ TourAggregateService (집계·k 억제)     │ → /tour/public/*  (인증 없음, 식별자 없는 스키마)
                     │ TourRawService (개별 행·사진)          │ → /admin/tour/*   (authenticate + requireAdmin + requireTourRaw)
                     │ RestaurantTourMatch · TourPlaceBiz    │ → 맛집 상세 애드온 · 시드 콘솔
                     └───────────────────────────────────────┘
```

- **집계 게이트웨이 하나**: 공개 응답은 전부 `TourAggregateService` 를 거친다. 응답 zod 스키마에 `travelId`·`visitAreaId`·`travelerLabel` 이
  아예 없고(serializer 가 키를 걷어냄), 모든 group-by 결과에 `n >= 5` 필터가 걸린다. 테스트가 "공개 응답에 개별 행 0건" 을 고정한다.
- **원본 층은 별도 모듈·별도 권한**: `requireTourRaw` 는 `TOUR_RAW_USER_IDS` 에 든 사용자만 통과. 응답 `Cache-Control: private, no-store`,
  `X-Robots-Tag: noindex`. 사진은 nginx 정적이 아니라 인증 라우트가 스트리밍.
- **원본은 국내 서버에만**, 관리자 원본 화면은 Cloudflare 프록시를 타지 않는 경로(DNS 전용 서브도메인 또는 SSH 터널)로 접근.
- 성능: SQLite 에 30만 행. 공개 집계는 인덱스 + `lru-cache`(필터 키, TTL 10분) 로 충분.
- 캐시 무효화는 **데이터 버전**으로: 적재·제거(`load:tour`·`unload:tour`)는 API 와 다른 프로세스라 서비스의 `invalidate()` 를 부를 수 없다.
  대신 둘 다 데이터와 같은 트랜잭션에서 적재 이력(`LifeMasterSync layer=tour|tour-<key>`)을 한 행 남기므로, 네 layer 의 가장 큰 이력 id 를
  버전으로 삼는다(`tour-data-version.ts` 의 `tourDataVersion`). 인사이트·밀도·숙소·지역 비교·코스 프로필 캐시(`TourVersionedCache`)는 요청마다
  집계보다 **먼저** 버전을 읽고(인덱스만 읽는 조회 한 번 — 0.1ms 미만이라 메모하지 않는다), 버전이 바뀌었으면 담긴 것을 전부 버린다. 그래서
  떠 있는 API 가 커밋 뒤 첫 요청부터 새로 집계한다 — 환수·폐기(`unload:tour`) 뒤 옛 집계가 TTL 만큼 응답에 남지 않고, 프로세스 메모리에서도
  그 캐시를 쓰는 다음 요청 때 내려간다. 이력 행을 남기지 않는 변경(표를 직접 고친 경우, `match:restaurant-tour`·`check:tour-biz` 갱신)은
  버전이 그대로라 TTL(10분)로 따라간다.

## 데이터 계약 — tour-c export (`exportVersion: 1`)

tour-c 의 `scripts/export_life_pickr.py`(`npm run data:export -- [--out data/export/lp-2023] [--thumbs s|s,m] [--region all|jeju]`)가
파생 parquet 를 읽어 아래를 쓴다. **전 지역**을 내보내고(용량 무의미), 지역 제한은 이 리포의 집계 쿼리가 한다.
형식은 **JSONL.gz**(한 줄 = JSON 객체, 열 이름은 parquet 그대로) — CSV 대신 고른 이유는 자유기술의 줄바꿈·따옴표와 숫자/불리언
형이 그대로 보존돼 적재기에 열 인덱스 매핑·형 변환이 없기 때문. tour-c `tests/data/test_export.py` 가 마스킹·제외 열·행 수·sha 를 검사한다.

| 파일 | 행 | 열(요지) | 제외·마스킹 |
|---|---:|---|---|
| `manifest.json` | — | `exportVersion: 1`, `format: "jsonl.gz"`, `dataset: "aihub-71780"`, `built_at`, `source.rules[]`(tour-c manifest 의 rules), `tables{name:{file,rows,bytes,sha256,columns}}`, `thumbs{s,m}`, `excluded` | — |
| `places.jsonl.gz` | 15,679 | tour-c `places` 전 열(place_id·name·aliases·type_cd·type_nm·type_short·poi_id·주소·lon·lat·sido·sigungu·emd·region·is_jeju·is_island·n_*·mean_dgstfn·bayes_score·mean_revisit_int·mean_rcmd_int·revisit_rate·stay_median·spend_pp_median·spend_n·top_reason_nm·n_lodging·lodging_type_nm·first_seen·last_seen·first_day_share·search_text) | — |
| `trips.jsonl.gz` | 2,880 | travel_id·traveler_label·start_date·end_date·nights·month·start_weekday·persona_mission·mission_codes·mission_names·mvmn_nm·gender·age_grp·residence_sido·accompany·companions_num·destination·style_1..8·motive_1_nm..3·n_visits·n_public·n_jeju·n_island·n_photos·n_activities·spend_*·gps_km·gps_hours·has_gps·main_region·first/last_place_id·name·lodging_types·mean_dgstfn·regions·cover_photo_id | `traveler_id`·`travel_nm`·`persona*`·`mission_check_*`·`gps_points_*`·`split` 제외. 학력·직업·소득·선호지역은 `travelers` 표 자체를 안 내보냄 |
| `visits.jsonl.gz` | 51,596 | tour-c `visits` 전 열(`split` 제외) | 비공개 방문(is_private)은 name·road_addr·lot_addr·lon·lat·place_id·poi_id NULL — tour-c 규칙 그대로. export 와 로더가 각각 재검증 |
| `activities.jsonl.gz` | 60,957 | 전 열(travel_id·visit_area_id·place_id·is_private·type_cd·type_nm·seq·detail·rsvt_yn·expnd_*·admission_nm·visit_date·day_index·visit_type_*·region·is_jeju·gender·age_grp·accompany·month) | — |
| `spend.jsonl.gz` | 43,664 | 전 열(spend_id·travel_id·category·category_cd·visit_area_id·place_id·subtype_*·item·store_nm·brno·amount·pay_num·per_person·method_*·paid_ts·paid_hour·rsvt_yn·etc_text·road_addr·sgg_cd·day_index·…) | — |
| `transitions.jsonl.gz` | 42,385 | 전 열 | — |
| `day_sequences.jsonl.gz` | 7,633 | 전 열 | — |
| `companions.jsonl.gz` | 4,427 | travel_id·seq·rel_cd·rel_nm·gender_nm·age_nm·situation_nm | — |
| `photos.jsonl.gz` | 17,513 | photo_id·travel_id·visit_area_id·place_id·place_name·taken_ts·taken_hour·taken_date·width·height·has_thumb·caption·caption_tokens·landmark·has_caption·visit_type_*·region·is_jeju·day_index·source·seq·… | `lon`·`lat`(촬영 좌표)·`filename`·`res_raw` **제외**. 비공개 방문 사진은 tour-c 가 이미 뺐음 |
| `codes.jsonl.gz` | 238 | cd_a·group_nm·cd_b·cd_nm·order_num·del_flag | — |
| `thumbs/{s,m}/{photo_id}.webp` | 옵션 | 256px / 640px, EXIF 없음 | `--thumbs` 없으면 생략. 2026-09-13 export 는 `s` 17,513장(≈180MB) |

내보내지 않는 것: `travelers`(설문 원문), `raw_*` 14표, `gps/*.json`, POI 마스터, 캡션 JSON 원본, 원본 JPG.

이 리포 쪽 위치: `data/open/tour/lp-2023/`(`.gitignore`, `docs/data-sources.md` 에 등록). 로더는 이 경로를 기본값으로 찾는다.
재취득 난이도가 높으므로(AI 허브 로그인·203GB) export 산출물은 백업 대상.

## DB 모델 (Prisma, SQLite)

| 모델 | 키·주요 컬럼 | 인덱스 | 비고 |
|---|---|---|---|
| `TourPlace` | `id`(place_id) · name · aliases · typeCd · typeShort · poiId · roadAddr · lotAddr · lat · lng · sido · sigungu · emd · region · isJeju · isIsland · nVisits · nTravelers · nRated · meanDgstfn · bayesScore · meanRevisitInt · meanRcmdInt · revisitRate · stayMedian · spendPpMedian · spendN · topReasonNm · nPhotos · firstSeen · lastSeen · firstDayShare · searchText | (lat,lng) · (typeShort,nTravelers) · (isJeju,typeShort) | 공개 장소 집계의 주 테이블 |
| `TourTrip` | `id`(travel_id) · travelerLabel · startDate · endDate · nights · month · gender · ageGrp · residenceSido · accompany · companionsNum · destination · personaMission · missionCodes · mvmnNm · style1..8 · nVisits · nPublic · nJeju · nPhotos · spendActivity/Lodge/Move/Adv/Total · mainRegion | (ageGrp,accompany,nights) · (nJeju) | 코스 추천 세그먼트 계산용. 설문 원문 없음 |
| `TourVisit` | `id`(travel_id+':'+visit_area_id) · travelId · visitAreaId · visitOrder · dayIndex · visitDate · arrivalTs · departTs · stayMin · travelMinFromPrev · typeCd · typeShort · isPrivate · privateRole · placeId? · name? · lat? · lng? · sido? · sigungu? · emd? · region · isJeju · revisitYn · reasonNm · lodgingTypeNm · dgstfn · revisitInt · rcmdInt · mvmnNm · nPhotos · spendSum · spendPp · prevPlaceId · nextPlaceId · arrivalHour · arrivalWeekday · gender · ageGrp · accompany · residenceSido · nights · month | (placeId) · (travelId,visitOrder) · (isJeju,typeShort,isPrivate) · (emd) | 집계의 사실 표. 비공개 행은 마스킹 상태로 보관(순서·전이 계산에 필요) |
| `TourActivity` | id · travelId · visitAreaId · placeId? · typeNm · seq · detail · … | (placeId) | 주문 원문(관리자) · 메뉴 어절 집계(공개) |
| `TourSpend` | id · travelId · category · categoryCd · visitAreaId? · placeId? · subtypeNm · item · storeNm · brno · amount · payNum · perPerson · methodNm · paidTs · paidHour · … | (placeId) · (brno) | 1인당 지출 집계 · 사업자번호(폐업 조회) |
| `TourTransition` | id · travelId · dayIndex · fromPlaceId · toPlaceId · fromName · toName · fromType · toType · mvmnNm · travelMin · sameDay · viaPrivate · bothJeju · … | (fromPlaceId) · (toPlaceId) · (fromType,toType) | 전후 장소 · 전이 행렬 |
| `TourDaySequence` | id · travelId · dayIndex · nStops · typeSeq · placeSeq · placeIds · isJejuDay · isLastDay · … | (isJejuDay) | 코스 템플릿 |
| `TourCompanion` | id · travelId · seq · relNm · genderNm · ageNm · situationNm | (travelId) | 관리자 코스 샘플에서만 |
| `TourPhoto` | `id`(photo_id) · travelId? · visitAreaId? · placeId? · placeName · takenTs · width · height · hasThumb · caption · landmark · visitTypeNm · region · isJeju · source | (placeId) | 관리자 참고 사진. 파일은 `TOUR_THUMBS_DIR` |
| `RestaurantTourMatch` | `canonicalId` PK · `tourPlaceId` **unique** · distM · nameScore · status · matchedAt · lastSeenAt | (tourPlaceId) · (status) | `RestaurantStoreMatch` 와 같은 골격, canonical:place 1:1 |
| `TourPlaceBizStatus` | `placeId` PK · brno · storeNm · bStt(계속사업자/휴업자/폐업자) · bSttCd · endDt? · checkedAt | (bStt) | 국세청 상태조회 결과 |
| `TourKtoContent` (15차) | `contentId` PK · contentTypeId(12 관광지·14 문화시설·28 레포츠·38 쇼핑·39 음식점) · title · addr? · lat? · lng? · modifiedTime? · syncedAt | (contentTypeId) | 한국관광공사 관광정보 카탈로그. 유형별로 통째 교체. 사진은 받지 않는다 |
| `TourKtoIntro` (15차) | `contentId` PK · contentTypeId · hours? · closed? · parking? · fee? · modifiedTime? · fetchedAt | — | 소개 정보(이용 시간·쉬는 날·주차·요금, 태그만 지운 원문). 여행로그 장소와 맞은 콘텐츠만 |
| `TourPlaceKto` (15차) | `placeId` PK · contentId · title · distM · nameScore · matchedAt | (contentId) | 여행로그 장소 ↔ 콘텐츠(이름 + 거리). 맞출 때마다 통째 교체. 한 콘텐츠가 여러 장소에 붙을 수 있다 |
| `LifeMasterSync` | layer=`tour` · count(=places) · baseDate(=manifest built_at) · sourceFile(=export 경로+exportVersion) | 기존 | "적재됨" 판정. 15차 — layer=`tour-kto`(count = 카탈로그 콘텐츠, geocoded = 맞은 장소)도 데이터 버전에 든다 |

`codes` 는 테이블 없이 `@repo/utils` 상수(`TOUR_TYPE_SHORT`, `TOUR_REASON` 등)로 둔다 — 화면 라벨·색이 필요할 뿐 조인이 없다.

## 로더·운영

| 명령 | 하는 일 |
|---|---|
| `load:tour [dir] [--dry-run] [--no-thumbs]` | manifest 검증(exportVersion·sha256) → 정규화 순수 함수(좌표 한국 범위·비공개 마스킹 재검증·필수값) + 사유별 drop 리포트 → Tour* 전량 교체 트랜잭션(청크 500~1,000, 바인드 32,766 아래) → 같은 트랜잭션에서 `LifeMasterSync layer=tour` → `TOUR_THUMBS_DIR` 존재 확인. 공개 집계 캐시는 로더가 비우지 않는다(다른 프로세스) — 이력 행이 데이터 버전을 올려, 떠 있는 API 가 다음 요청에 스스로 버린다(§구조) |
| `unload:tour` | Tour* 전부 삭제 + RestaurantTourMatch·TourPlaceBizStatus 삭제 + sync 행(count 0) — 환수 대비. sync 행이 데이터 버전을 올려, 떠 있는 API 도 재시작 없이 다음 요청부터 빈 집계를 낸다 |
| `match:restaurant-tour [--dry-run]` | 식당 행이 1개 이상인 canonical(좌표 있음) ↔ TourPlace(식당·상업·상점) — 100m + `storeNameScore ≥ 0.5`, 정규화 이름 완전일치면 300m — 1:1(최고 점수), 재실행 시 이전 매칭 유지(상가 매칭 규칙) |
| `check:tour-biz [--max-calls=N] [--min-travelers=3]` | TourSpend 에서 장소별 최빈 사업자번호 → 국세청 「사업자등록정보 진위확인 및 상태조회」(data.go.kr 15081808, 100건/콜, `DATA_GO_KR_API_KEY` 활용신청) → TourPlaceBizStatus |
| `sync:tour-kto [--max-calls=900] [--catalog=auto\|force\|skip] [--skip-intro] [--force-intro] [--review=N] [--misses=N] [--closed=N] [--status]` (15차) | 한국관광공사 「국문 관광정보 서비스」(data.go.kr 15101578, `DATA_GO_KR_API_KEY` 활용신청 — 개발계정 일 1,000건) ① 카탈로그: `areaBasedList2` 를 유형 5개(관광지·문화시설·레포츠·쇼핑·음식점)마다 끝까지 받아 통째 교체(30일 안에 받았으면 생략, 절반 아래로 줄어 오면 그대로 둠) ② 맞추기: 여행 5건 이상·좌표 있는 장소 ↔ 카탈로그(호출 없음) ③ 소개 정보: 맞은 콘텐츠만 `detailIntro2`(콘텐츠당 1콜, 방문 많은 장소부터, 수정 시각이 그대로면 생략). 예산이 다하거나 쿼터에 걸리면 멈추고 다음 실행이 이어 받는다. 바뀐 것이 있으면 `LifeMasterSync layer=tour-kto` → 떠 있는 API 의 코스 프로필 캐시가 다음 요청에 새로 만들어진다. 검수(호출 없음, `--status` 와 같이 쓰면 조회만): `--review` 이름이 딱 맞지 않은 맞춤을 점수 낮은 순으로 · `--misses` 못 맞춘 장소를 방문 많은 순으로, 반경 안에서 이름이 가장 비슷한 콘텐츠와 같이 · `--closed` 받은 쉬는 날 문구와 읽어 낸 요일 |
| `probe:kto` (15차) | 관광정보 실응답 확인(15콜 안팎) — 키 등록(활용신청 직후 30 이면 대기) · 유형별 건수와 페이지 크기 · 목록·소개 정보의 필드 이름. 덤프 `data/kto-probe/`. 맞춤 비율은 여기서 보지 않는다(반경 검색이 콘텐츠를 빠뜨린다 — `sync:tour-kto --review --misses`) |
| `status:life-map` | 기존 한 줄에 `tour=<places> tour_matched=<matched>` 추가(`stat_val` 키 단위 파싱이라 안전) |
| `deploy.sh` 케이스 6 | `tour=0` 이고 `data/open/tour/lp-2023/manifest.json` 이 있으면 `load:tour` → `match:restaurant-tour`. 사진은 rsync 로 별도 |
| `.env` | `TOUR_THUMBS_DIR`(기본 `data/open/tour/lp-2023/thumbs`) · `TOUR_RAW_USER_IDS`(원본 허용 사용자 id, 쉼표) |

## 공개 API (`tags: ['tour']`, 인증 없음, 집계만)

| 라우트 | 응답 | 억제 규칙 |
|---|---|---|
| `GET /restaurants/public/:placeId` (기존) | `tour: RestaurantTourSummary \| null` 추가 — nTravelers·nVisits·bayesScore·revisitRate·stayMedian·spendPpMedian·topReason·sampleYear | 매칭 없으면 null, nRated<3 이면 bayesScore null |
| `GET /restaurants/public/:placeId/tour-stats` | "여행자" 탭 전체 — 만족도 분포·추천 의향·시간대(24)·요일·월·방문 이유·동반별·연령별·체류 분포·여행 중 위치·전/후 장소·동행 장소·주문 어절·결제(중앙값·수단) | 동반·연령 셀 n≥5, 전후 장소 n≥3, 동행 n≥5, 어절 n≥2 |
| `GET /restaurants/public` (기존) | `sort=tour_travelers \| tour_score` 추가, 행에 `tour{nTravelers,bayesScore,spendPpMedian,revisitRate}` | 매칭 없는 행은 null(정렬 시 뒤로) |
| `POST /restaurants/public/smart-pick` (기존) | `strategy: 'traveler'` 추가. `balanced` 는 세 점수 평균(없는 것은 제외) | 여행자 점수 = `(bayes−1)/4`, nRated≥3 |
| `GET /tour/public/insights?region&ageGrp&gender&accompany&month&nights` | 규모·박수·월·동반·시간대×유형·유형별 만족/체류/지출·전이 행렬·코스 템플릿·읍면동·이유·지출 구성·이동수단·공항 다음·거주지 | 필터 후 여행 <20건이면 `insufficient: true`, 셀 n<5 null |
| `POST /tour/public/plan` `{region, ageGrp, accompany, nights, month?, gender?, pace?, focus?, transport?, stayArea?, must?, avoid?, wetDays?, fame?, purposes?, variant?, startDow?}`(pace~avoid 는 11차, wetDays 는 12차, fame~variant 는 14차, startDow 는 15차) | `{regionTrips, matchedTrips, relaxed, places[{name,kind,sigungu,emd,n,mean,score,similarN,lift,peak,stayMin,spendPp,placeId,purposeFit,info}], templates[{label,n}], itinerary{days[{day,area,pattern,patternBasis,stops[{name,kind,arriveMin,stayMin,moveMin,moveKm,pinned,purposeFit,info,closedThatDay,alternatives}],fromStayMin,toStayMin,wet}],legBasis,transport,stayArea,unplaced,base,weatherPlaceId} \| null, areas[{label,n}], excludedClosed, infoNote}` (10차 — 장소 숫자는 지역 표본 전체 기준. 일정표는 13차부터 `region=all` 을 뺀 모든 지역 — 제주 밖은 `base`(거점 동네) 주변에서 짜고 `weatherPlaceId`(예보 지점)를 알려 준다. 15차 — `info{hours,closed,parking,fee}` 는 한국관광공사 관광정보와 맞춘 곳의 운영 문구(아니면 null), `infoNote` 는 그 출처·주의 한 줄, `startDow`(첫날의 요일 0~6)를 주면 매주 그 요일에 쉬는 곳을 그날 일정에서 빼고 꼭 갈 곳이 쉬는 날에 남으면 `closedThatDay`) | 장소 n≥5·평가 3건 이상(지역 전체 기준), `similarN` 은 비슷한 여행 5건 이상일 때만, 뼈대는 여행 5건 이상에서 나온 유형 순서만, 좌표·장소 id 없음. matchedTrips<20 이면 조건 완화 안내. `regionTrips`(그 지역에 적재된 여행 수) 0 이면 미적재 — 화면은 "표본이 적다" 대신 여행로그가 없다고 안내하고, 서버는 빈 프로필을 캐시에 남기지 않는다(적재 직후 곧바로 반영) |
| `GET /tour/public/density?kind=all\|restaurant[&bbox]` (6차) | 0.02° 격자 `[{x,y,n,travelers}]` + 분위 경계 4개(5등급 색칠) + 규모 — bbox 없으면 전국 칸 전부(수백 개) | 여행자 ≥5 칸만 |
| `GET /tour/public/lodging?region&ageGrp&gender&accompany&month&nights` (6차) | 숙박 결제 유형별 이용 여행·결제 중앙·1박 추정(결제액 × 숙박 건수 ÷ 박수)·1인 중앙·예약률 + 숙소 방문 만족도 | 여행 ≥5 유형만, 금액·평가 3건 미만 null |
| `GET /tour/public/regions?region&ageGrp&gender&accompany&month&nights` (6차·7차) | 집단(region=jeju 는 제주시·서귀포시·부속섬 3집단, 시도·서부권은 시군구 상위 8집단: 여행·방문·비중·만족·식당·체류·1인 지출·유형·읍면동) + 읍면동 표(최대 20) | 집단 여행 ≥5, 읍면동 방문 ≥5 |
| 공통: `region` (7~9차) | `jeju`(제주 본섬+부속섬) · `west`(서부권 7개 시도 합) + 시도 키 `jeonbuk/jeonnam/chungnam/daejeon/chungbuk/gwangju/sejong` · `east`(동부권 6개 시도 합) + `gangwon/gyeongbuk/gyeongnam/busan/daegu/ulsan` · `capital`(수도권 3개 시도 합) + `seoul/gyeonggi/incheon` · `all`(적재 전체). 라벨·bbox·거점·권역 묶음(`parent`, `TOUR_REGION_GROUPS`)은 utils `TOUR_REGIONS` — 화면 칩은 1행 권역, 2행 시도 | — |

응답 스키마(`@repo/api-contract` `tour.ts`)에는 여행·방문·여행자 식별자 필드가 없다. 테스트 `tour-public.test.ts` 가 (1) 스키마 키 집합에
`travelId|visitAreaId|travelerLabel|photoId` 가 없음, (2) n<5 셀이 null 로 나옴, (3) 매칭 없는 식당은 `tour: null` 을 고정한다.

## 관리자 층 (`/admin/tour/*`)

| 라우트 | 권한 | 응답 |
|---|---|---|
| `GET /admin/tour/status` | admin | sync 행·건수·매칭 통계·폐업 조회 통계·thumbs 존재 |
| `GET /admin/tour/seeds?minTravelers=5&status=unmatched\|matched\|closed&type=식당` | admin | TourPlace 집계 + 매칭·폐업 상태 + 상가 매칭 힌트 |
| `POST /admin/tour/seeds/:placeId/discover` | admin | 기존 `searchPlacesViaMapNaver(name + ' ' + sigungu)` → 후보(좌표 ≤100m·상호 점수) |
| `POST /admin/tour/seeds/:placeId/register` `{candidate}` | admin | 기존 크롤 등록 경로(random-crawl `crawlChosenCandidate` 재사용) → 등록 후 매칭 즉시 시도 |
| `POST /admin/tour/match/run` · `POST /admin/tour/biz-status/run` | admin | 스크립트와 같은 서비스 함수, 리포트 반환 |
| `GET /admin/tour/places/:id/visits` · `/activities` · `/spend` · `/photos` · `/trips` | admin + **requireTourRaw** | 개별 행(여행자 라벨·날짜·만족·체류·지출·동반·이유 / 주문 원문 / 영수증 상호·사업자번호 / 사진 메타 / 그 장소를 포함한 여행의 일차별 순서) |
| `GET /admin/tour/trips/:travelId` | admin + requireTourRaw | 여행 타임라인(방문 순서·활동·지출·동반자·사진). GPS 없음 |
| `GET /admin/tour/photos/:photoId/:size` | admin + requireTourRaw | webp 스트리밍, `private, no-store`, `noindex` |

## 웹 화면

| 화면 | 위치 | 내용 |
|---|---|---|
| 맛집 상세 "여행자" 탭 | `apps/web/src/components/restaurant/detail/TourTab.tsx`, `tabs.ts` 에 `tour` | 프로토타입 화면 1. 헤더 배지 `여행자 N명 · 만족 x.xx · 2023` (`StoreInfoBadges` 옆) |
| 맛집 목록 | `PublicRestaurantCard`·`PublicRestaurantList` | 정렬 칩 2개, 카드 메타 줄(여행자·만족·1인·재방문) |
| 홈 골라줘 | `SmartPickSection` | 전략 칩 "여행자 만족", 결과 카드에 근거 3줄 |
| `/travel/jeju` | `routes/TravelInsightsPage.tsx` | 프로토타입 화면 3 + 필터 바(연령·성별·동반·월·박수·지역). 표본 부족 셀은 "표본 부족" |
| `/travel/plan` | `routes/TravelPlanPage.tsx` | 프로토타입 화면 4. 결과 → 그룹투표 만들기(`/vote/new` 에 옵션 프리필)·즐겨찾기·가는 법 |
| 일상지도 레이어 | `LifeLayerBar`·`LifeMapPage`·`LifeTourCard`·`lib/tourDensityGeo.ts` | 배경(면) 레이어 "여행자 밀도"(범죄 통계와 배타, 켜면 제주 밖일 때 제주로 이동) — 0.02° 격자 청록 5등급, 카드에 종류 칩(전체/식당만)·범례, 칸 클릭 시 방문·여행자 수 + 그 칸 bbox 의 등록 맛집(공개 목록, 여행자 순)·상세 링크·지도 이동. 푸터에 AI 허브 출처 줄 |
| 어드민 `/admin/tour` | `routes/admin/AdminTourPage.tsx` | 상태·파이프라인·시드 표(발굴·등록 버튼)·폐업 상태 |
| 어드민 식당 상세 | `AdminRestaurantDetailPage` | "여행자 근거" 섹션 — 방문 행·주문 원문·영수증·참고 사진·코스 샘플(원본 allowlist 만 렌더) |
| 사이드바·홈 카드 | `PublicLayout`·홈 | "여행" 메뉴(인사이트·코스) |

앱(`apps/mobile`)은 v1 범위 밖 — 웹 우선. 공개 API 는 앱이 같은 계약으로 붙일 수 있게 둔다.

## 보안·운영 체크리스트

- [ ] 공개 응답 스키마에 식별자 없음(테스트 고정) · 모든 집계 n≥5 · 장소 평점 n≥3
- [ ] `requireTourRaw` = `TOUR_RAW_USER_IDS` allowlist. 비어 있으면 원본 라우트 전부 404
- [ ] 원본·사진 응답 `Cache-Control: private, no-store` + `X-Robots-Tag: noindex`. 사이트맵·OG·공유 링크에 tour 원본 경로 없음
- [ ] 운영 서버 국내 확인. 관리자 원본 화면은 Cloudflare 프록시 우회 경로(DNS 전용 서브도메인 또는 `ssh -L`)
- [ ] `data/open/tour/` gitignore · 백업 목록 등재 · `unload:tour` 동작 확인
- [ ] 출처 표기(부록 A)가 집계를 쓰는 모든 섹션 + `/about` 에 있음
- [ ] 적재·머지 테스트는 `useIsolatedDatabase()` — `.env` 의 dev.db 를 갈아엎지 않게

## 단계

각 단계가 끝나면 실행 가능한 상태가 남는다. 커밋은 사용자 지시 시.

| 차수 | 만드는 것 | 완료 기준 |
|---|---|---|
| **0차 계약·문서** | 이 문서 · `docs/data-sources.md` tour 행 · `.gitignore`(`data/open/tour`) · 사용자: AI 허브 문의(부록 B) 발송, 서버 소재·관리자 계정 확인 | 문서만 |
| **1차 export + 적재** ✅ 2026-09-13 | tour-c `scripts/export_life_pickr.py` + `tests/data/test_export.py`(마스킹·행 수·sha) / 이 리포 Prisma 모델 10개 + 마이그레이션 `20260913062022_add_tour_log` · `tour-master.service.ts`(정규화·drop 리포트·전량 교체) · `load:tour`·`unload:tour` · `status:life-map` 에 `tour=` · deploy.sh 케이스 6 · `@repo/utils` `tourLog.ts` · 테스트 `tour-master.service.test.ts` | 로컬 dev.db 적재 27초(표 10개 25만 행 전량, drop 0), `status` 한 줄 `tour=15679`. export 는 `data/open/tour/lp-2023/`(195MB, 썸네일 s 포함) |
| **2차 매칭 + 시드 콘솔 (관리자, 바로 운영)** ✅ 2026-09-13 | `modules/tour/restaurant-tour-match.service.ts` + `match:restaurant-tour` · `tour-biz-status.service.ts` + `check:tour-biz`(data.go.kr 15081808 활용신청은 사용자) · `tour-admin.service.ts`·`tour-admin.route.ts`(`/admin/tour/status·seeds·seeds/:id/discover·register·match/run·biz-status/run`) · 계약 `schemas/tour.ts` + `RestaurantDetail.tour` · shared `tour.api.ts`·`useTour.ts` · 웹 `AdminTourPage`(사이드바 "여행로그 시드") + `TourMatchBadge`(어드민 상세 헤더) · 마이그레이션 `20260913064102_add_tour_match_biz` · `status:life-map` 에 `tour_matched=` · deploy.sh 적재 뒤 매칭 · `unload:tour` 가 매칭·상태도 삭제 · 테스트 3파일 21건 | dev.db 매칭 실행 0/25(제주 등록 맛집 없음 — 운영 DB 에서 재측정). 시드 표에서 "네이버 검색 → 등록" 하면 크롤 잡이 돌고 끝나면 매칭이 자동 재실행. 폐업 조회는 키 활용신청 뒤 어드민 버튼 |
| **3차 관리자 근거·사진·코스 샘플** ✅ 2026-09-13 | `tour-raw.service.ts`·`tour-raw.route.ts`(`/admin/tour/places/:id/{visits,activities,spend,photos,trips}`·`/trips/:travelId`·`/photos/:photoId/:size`, `TOUR_RAW_USER_IDS` allowlist → 밖이면 404, 플러그인 onSend 로 `private, no-store`·`noindex`, 사진은 `?token=` 도 인증) · 계약 `TourRaw*` · shared `tourApi.adminPlace*`·`useTourRaw*`·`tourPhotoUrl` · 웹 `TourEvidencePanel`(방문·주문 원문·영수증·사진·여행 타임라인 — 어드민 식당 상세 "여행자 근거" 카드 + 시드 표 "근거" 버튼) · env `TOUR_RAW_USER_IDS`·`TOUR_THUMBS_DIR` · `docs/deploy-friendly.md` rsync·allowlist·Cloudflare 우회 절차 · 테스트 `tour-raw.route.test.ts` 6건 | allowlist 밖 admin 404·비로그인 401·회원 403, 헤더 확인, 비공개 방문은 역할만, 사진 파일 헤더/토큰 인증·경로 조작 400. 사용자 몫: `.env` 에 본인 user id·운영 rsync |
| **4차 공개 — 상세·목록·골라줘** ✅ 2026-09-13 (배포는 AI 허브 회신 뒤) | `tour-public.service.ts`(`toTourSummary`·`aggregateTourStats` 순수 집계 — 평가 3건·표본 5명 하한, 동반·연령 n≥5, 전후 3회·동행 5명·어절 2건) + `tour-public.route.ts`(`GET /restaurants/public/:placeId/tour-stats`, `RATE.tourRead`) · 계약 `RestaurantTourSummary`·`RestaurantPublicListTour`·`RestaurantTourStats`(식별자 없음), `RestaurantPublicDetail.tour`·`RestaurantPublicListItem.tour`·`sort=tourTravelers\|tourScore`·smartPick `traveler`+`avgTravelerScore` · `getPublicList/Detail/smartPick` 확장 · shared `publicTourStats`·`useRestaurantPublicTourStats` · 웹 `TourTab`(여행자 탭, 매칭 있을 때만)·`TourSummaryBadge/Line`(헤더 배지·홈 요약)·`TourSourceNote`·카드 메타·정렬 칩 2개·골라줘 "여행자 만족 기준" 칩 · 테스트 `tour-public.test.ts` 6건(응답 키 스캔으로 식별자 0 고정) | balanced 는 리뷰 AI 두 점수와 여행자 점수 중 있는 것의 평균 — 분석 없는 매칭 가게도 후보. 앱(mobile)은 타입만 통과(화면 미구현) |
| **5차 공개 — 인사이트·코스** ✅ 2026-09-13 (배포는 AI 허브 회신 뒤) | `tour-insights.service.ts`(`TourInsightsService.insights/plan`, LRU 10분·필터 키, 20건 미만 `insufficient`, 완화 사다리 month→gender→nights→ageGrp, 점수 n×(mean−3.3), 교통·숙소 제외) · `GET /tour/public/insights?region·ageGrp·gender·accompany·month·nights` · `POST /tour/public/plan` · 계약 `TourInsightsQuery/Result`·`TourPlanBody/Result` · shared `tourApi.publicInsights/publicPlan`·`useTourInsights`(필터 키 캐시)·`useTourPlan` · 웹 `routes/TravelInsightsPage.tsx`(`/travel/jeju`, 필터 = URL 쿼리, KPI 5 + 섹션 13)·`routes/TravelPlanPage.tsx`(`/travel/plan`, 체크 → `/vote/new` state 프리필 `presetTitle/presetOptions`)·`components/tour/{charts,TourFilterBar,tourFormat}` · 사이드바·상단바 "여행" · 테스트 `tour-insights.service.test.ts` 5건(집계·k 억제·insufficient·사다리·라우트 400, 응답 키 스캔) | 필터를 바꾸면 셀이 갱신되고 20건 미만은 안내. 코스 → 그룹투표 생성까지 이어짐 |
| **6차 공개 — 지도·숙소·지역** ✅ 2026-09-13 (배포는 AI 허브 회신 뒤) | `tour-region.service.ts`(`TourRegionService.density/lodging/regions`, SQL 격자 group by — SQLite 엔 FLOOR 가 없어 CAST 절삭, 키별 LRU 10분) · `GET /tour/public/density`·`/lodging`·`/regions` · 계약 `TourDensity*`·`TourLodging*`·`TourRegion*` · shared `tourApi.publicDensity/publicLodging/publicRegions`·`useTourDensity`(24h, 켠 동안만)·`useTourLodging`·`useTourRegions` · utils `tourLog.ts` 격자 상수·분위·등급·칸 bbox·`JEJU_CENTER`, `LIFE_MAP_OVERLAYS` 에 `tour` · 웹 일상지도 배경 레이어(위 표) + `lifeMapPrefsStore` v5 `tourDensityKind` · 인사이트 페이지 `TourRegionSection`(3집단 카드 + 읍면동 표)·`TourLodgingSection`(유형 표) — 같은 필터 바 · 테스트 `tour-region.service.test.ts` 4건 + `LifeMapPage.test.tsx` 배경 토글 1건 + utils 3건 |
| **7차 서부권(71779) 다중 데이터셋** ✅ 2026-09-16 | tour-c 를 `TOUR_DATA_ROOT`=147 로 실행해 서부권 export(`lp-west-2023`) 생성(코드 수정 없음) · Prisma `Tour*` 10표에 `dataset`(기본 jeju) + `trips.visitSidos`·`day_sequences.sidos`·`transitions.fromSido/toSido` + 인덱스(마이그레이션 `20260915185047`, 기존 제주 행 백필 포함) · `tour-master.service.ts` 데이터셋 단위 교체(`--dataset`, 장소 id `<key>:` 접두, spend id 자체증가, manifest 71779 허용 + 제주 방문비율 plausibility 검사, 적재 뒤 sido 파생열 SQL 채움, `getTourLoadStatus.datasets`) · `tour-region-filter.ts`(region → 표별 where: jeju=isJeju, 시도=sido, west=7개 시도, all=전체) 를 인사이트·코스·숙소·지역비교·시드·폐업조회가 공용 · utils `TOUR_DATASETS`·`TOUR_REGIONS`(라벨·bbox·거점 hubs)·`tourSampleRegionAt`/`nearestTourSampleRegion`(밀도 레이어 이동) · 계약 `TourRegion` 10키·`TourDataset`·`TourAdminStatus.datasets`·`airportNext` → `hubLabel`(거점=역·터미널·공항)·지역비교 집단 키 문자열(시군구) · 웹 지역 칩(TourFilterBar/인사이트/코스, 제목 동적)·어드민 데이터셋별 적재·지역 필터(제주·도서/서부권/전체)·지역비교 집단 색 인덱스 · deploy.sh 세트별 적재 · 테스트 friendly 45건(키 동일성·id 접두 포함) 통과 |
| **8차 동부권(71778) 세 번째 데이터셋** ✅ 2026-09-18 | 원본 146 폴더(93GB, 147 과 배치 동일)를 `niney-tour-pickr/tour-c-east`(tour-c 스크립트 사본 + `source-view` junction 으로 TS_photo·VS_photo·SbL 을 제주식 배치로) 에서 `TOUR_DATA_ROOT` 로 실행 → `lp-east-2023`(파생표 10 + thumbs/s 16,581장, 코드 수정 없음) · utils `TOUR_DATASETS.east`(접두 `east:`, 강원·경북·경남·부산·대구·울산) + `TOUR_REGIONS` 7키(`east` + 시도 6, 거점은 동부권 전이 표 실측 — 강릉역·신경주역·동대구역·부산역·태화강역 등) + `parent`/`TOUR_REGION_GROUPS`/`tourRegionGroupOf`(권역 묶음) + `tourSampleRegionAt`/`nearestTourSampleRegion` 을 데이터셋 전체로 일반화 + `TOUR_SOURCE_NOTE` 데이터명 자동(세트 전부) · 계약 `TourDataset`·`TourRegion` 17키 · env `TOUR_THUMBS_DIR_EAST` · `deploy.sh` 세트 목록 루프(`TOUR_EAST_EXPORT_DIR`) · `status:life-map` `tour_<세트>` 자동 · 웹 TourFilterBar 지역 칩 2행(권역 → 시도)·어드민 시드 필터 데이터셋 목록 자동 · 로더·마이그레이션·region-filter 수정 없음(`--dataset east`, 제주 방문 4/2,880 이라 plausibility 통과) · 테스트 utils 4건 추가(권역 묶음·표본 판정·출처 표기)·friendly east 접두 · e2e step region=gangwon/east |
| **9차 수도권(71581) 네 번째 데이터셋** ✅ 2026-09-19 | 원본 145 폴더(97GB, 배치 동일)를 `tour-c-capital`(junction 뷰)에서 실행 → `lp-capital-2023`(파생표 10 + thumbs/s). 표본 성격이 다름 — 수도권 거주자(85%)의 근교 나들이(당일 67%, 비공개 집·친지 27%)라 장소당 표본이 얇다(식당 4,761곳 중 여행자 5명↑ 41곳, 서울 6곳) → 시드보다 **운영 맛집 매칭(서울 1,810곳)·서울 밀도 레이어(5명↑ 칸 143)·나들이 코스** 용도. `TOUR_DATASETS.capital`(접두 `capital:`, 서울·경기·인천) + `TOUR_REGIONS` 4키(`capital` + `seoul/gyeonggi/incheon`, 거점은 역·터미널·공항만 — 집 출발 표본이라 "거점 다음" 은 타지 거주자용) · 계약 21키 · env `TOUR_THUMBS_DIR_CAPITAL` · deploy.sh 루프 항목 · 서울이 표본 bbox 안이 되어 밀도 토글이 이동하지 않음(utils 테스트·e2e step 수정) · 4세트 공용 POI·코드표 md5 동일. 공개 장소 통계는 5명 하한에 대부분 억제되므로 매칭의 가치는 관리자 근거, 시드 콘솔은 하한 3명으로 |
| **10차 코스 보강 — 후보 품질 + 일정표 합성(제주)** ✅ 2026-10-04 (배포는 AI 허브 회신 뒤) | `tour-plan.service.ts`(5차 `plan()` 을 `TourInsightsService` 에서 분리 — `TourPlanService`) + `tour-plan-synth.ts`(순수 함수: 시간대 5칸·하루 뼈대·이동 모델·권역·일정 합성). **후보**: 공개 가능 여부와 표시 숫자(n·보정 만족도)를 비슷한 여행 "안"이 아니라 **지역 표본 전체** 기준으로 바꿨다 — 5차는 조건을 좁힐수록 장소가 사라졌다(여행 20건 기준으로만 완화하는데 장소는 그 안에서 5건을 요구). 비슷한 여행은 정렬 가중치로만: 5건 이상 간 곳은 `(방문+3) ÷ (지역 평균대로라면 갔을 수+3)`(0.5~2배), 그 미만은 유형 선호(0.7~1.5배)로 물러선다. 점수 = `(보정 만족도 − 3.3) × √n × 선호`(tour-c PlanPage 산식 `n × (mean − 3.3)` 과 달라졌다). 장소마다 주 방문 시간대·체류 중앙·1인 지출, 국세청 조회의 폐업·휴업 제외(`excludedClosed`), 목록에 식당·식당 아닌 곳 각 12곳 보장. 장소의 유형은 장소 표가 아니라 방문 기록에 가장 많이 적힌 것(같은 해수욕장이 방문마다 자연·레저·산책으로 갈린다). **일정표**: utils `TOUR_ITINERARY_REGIONS`(지금 `jeju`, 하루 권역 반경 12km)만. 일수 = 박수+1(최대 5일) → 일차 위치(첫날·가운데·마지막·당일)별 뼈대(이동·숙소·상점·기타·축제를 뺀 뒤 **식사 자리(식당·카페)와 볼거리 자리 두 묶음의 순서**로 센 것 — 유형을 그대로 세면 순서마다 표본이 얇다. 여행 5건 이상, 식사·볼거리가 둘 다 있는 날만, 자리별 도착 시각 중앙 — 비슷한 여행 → 지역 → 기본 순) → 권역(방문 많은 곳부터 반경 안이면 합치는 리더 군집) 배정(첫날·마지막 날은 그날 방문 비중이 높은 동네) → 자리 채우기(묶음이 같은 후보 중 점수 × 시간대 적합 × 일차 위치 적합 × 앞 장소와의 가까움, 등록 맛집은 식사 자리에서 1.15배, 같은 날 같은 세부 유형의 볼거리는 0.85배) → 시간표(도착 = 앞 장소 출발 + 이동과 자리의 흔한 시각 중 늦은 쪽) + 자리별 대안 2곳(8km 안). 이동 분은 같은 날 이어진 방문의 직선거리 × 이동 분을 거리 구간별 **평균**(상위 10% 는 눌러서)으로 접은 모델 — 원본 시각이 30분 단위라 이동 분이 0·30·60 으로만 찍혀 중앙값은 계단이 된다(구간 20건 이상인 점 3개 미만이면 기본 속도). **개별 여행의 하루 동선(`TourDaySequence.placeIds`)은 읽지 않는다** — 합성 근거는 전부 5건 이상 집계. 부속섬(배편)·좌표 없는 곳은 일정에서 제외, **좌표는 응답에 싣지 않음**(6차 결정 유지 — 구간 이동 분·직선거리만, 화면은 이름으로 지도 검색 링크). 계약 `TourPlanPlace`(+`similarN`·`lift`·`peak`·`stayMin`·`spendPp`)·`TourPlanStop/Day/Itinerary`·`TourPlanResult.itinerary/excludedClosed` · utils `TOUR_ITINERARY_REGIONS`·`tourItineraryDays` · 웹 `components/tour/TourItinerary.tsx`(일차 카드·시각·이동·여유·대안) + `TravelPlanPage`(일정표 섹션·카드 근거 줄·미지원 지역 안내) · `probe:tour-plan`(대표 조건 + 동반×박수 훑기) · e2e step 4개 · 테스트 `tour-plan-synth.test.ts` 17건·`tour-plan.service.test.ts` 8건·`TravelPlanPage.test.tsx` 3건 | 작성 머신(Mac)에는 여행로그가 없어 **행 단위 실측은 아직**이다. 대신 2026-10-04 운영 공개 집계(`/tour/public/insights·density·regions·plan`, 제주 여행 1,694건·방문 30,500건)로 가정을 맞춰 봤다 — ① 5차 `plan` 의 얇음 확인(30대·2인·2박 94건 → 식당 2곳, 40대 나홀로 3박 51건 → 장소 6곳, 조건 없이도 상위 24곳 중 식당 2곳) ② 식당이 자리 유형 방문의 절반이고 식당→식당 전이가 가장 흔함 → 뼈대를 두 묶음으로 세고 식당만 도는 날을 뺌 ③ 이동수단별 이동 분 중앙이 30·60·0분 → 이동 모델을 평균으로 ④ 같은 장소의 유형이 방문마다 갈림(5차 응답에서 함덕해수욕장=레저, 동문시장=문화) → 유형은 방문 최빈값 ⑤ 밀도 격자를 12km 로 군집하면 방문 2% 이상 권역이 10개(제주시내·한림·서귀포·성산·중문·조천·애월·대정·구좌·중산간) — 반경 유지 ⑥ 만족도 평균이 4.2~4.7 에 몰려 점수는 여전히 방문 수가 먼저, 만족도가 그다음. 남은 것은 새 로직을 실제 행에 돌려 보는 것 — 적재된 머신에서 `pnpm --filter friendly probe:tour-plan`. 좌표 공개(지도에 코스 그리기)는 AI 허브 회신 뒤 결정 |
| **11차 코스 입력 확장 — 속도·취향·이동수단·숙소 동네·꼭 갈 곳/뺄 곳** ✅ 2026-10-04 (배포는 AI 허브 회신 뒤) | `TourPlanBody` 에 선택 입력 6개. **속도**(`pace` relaxed/normal/packed) — 하루 자리 수 목표를 비슷한 여행의 중앙에서 −1/+1 하고 그 길이의 실제 뼈대를 고른다(뼈대 고르기를 "길이가 맞는 것 먼저, 같은 길이면 비슷한 여행 → 지역" 으로 정리). **취향**(`focus` nature/city/activity/culture) — 고른 묶음의 유형에 1.5배, 목록 순위와 일정표 후보 점수에 같이 들어간다(utils `TOUR_PLAN_FOCUSES` 가 유형 묶음과 화면 라벨의 원본). **이동수단**(`transport` car/transit) — 구간 기록의 수단 표기로 모델을 따로 맞춘다(차: 버스 구간만 뺀 전부, 대중교통: 버스·지하철 + 도보 구간, 모자라면 차 × 1.8 + 10분). 대중교통은 하루 권역을 반경의 0.7배·거리 감쇠 5km 로 좁힌다. **숙소 동네**(`stayArea`) — 응답 `areas`(권역 라벨, 후보 3곳 이상인 권역을 방문 많은 순으로 12개)에서 골라 되돌려 보낸다. 가까운 권역을 앞세우고(45km 에서 절반) 일차마다 숙소에서·숙소까지 이동 분을 붙인다(도착한 날은 가는 쪽, 떠나는 날은 나오는 쪽만). **꼭 갈 곳/뺄 곳**(`must` ≤8 · `avoid` ≤30) — 응답에 장소 id 가 없어 이름(+읍면동)으로 받는다. 꼭 갈 곳이 든 권역을 가운데 날부터 배정하고(없으면 첫날·마지막 날 중 잘 채워지는 쪽) 그 장소를 시간대가 맞는 자리에 고정, 자리가 모자라면 그 장소에 많이 가는 시각에 자리를 늘린다(하루 7곳까지). 섬·좌표 없음·날 부족으로 못 넣은 곳은 `itinerary.unplaced`. 뺄 곳은 일정(대안 포함)에서만 빠지고 목록에는 남는다. 출발 거점 입력은 넣지 않았다 — 제주는 공항 하나라 첫날·마지막 날 동네가 이미 방문 기록에서 나온다(시도 단위로 일정표를 열 때 필요). 취향을 여행 스타일 설문(`TourTrip.style1~8`)으로 맞추는 방식은 축의 뜻·방향을 이 머신에서 확인할 수 없어 쓰지 않았다. 웹 `TourPlanOptions`(속도·취향·이동 칩) + 일정표의 숙소 동네 선택·꼭/뺌 칩·장소별 ×·목록 카드의 핀 — 고르는 즉시 다시 짜고, 다시 짜는 동안 앞 결과를 유지한다. `probe:tour-plan` 입력 확장 구역 · e2e step 2개 · 테스트 `tour-plan-synth.test.ts` 25건·`tour-plan.service.test.ts` 15건·`TravelPlanPage.test.tsx` 5건 | 10차와 같이 행 단위 실측은 아직 — 운영 집계 분포를 흉내 낸 합성 데이터(여행 1,694건)로 화면·e2e 를 돌렸다. 버스 구간 기록이 실제로 모델을 맞출 만큼 있는지(제주 시내/마을버스 구간 1,347건)는 프로브의 "대중교통(이동 근거 …)" 줄로 확인 |
| **12차 코스 날씨 반영 — 출발일·비 오는 날** ✅ 2026-10-04 (배포는 AI 허브 회신 뒤) | 웹에서 **출발일**을 넣으면 일차 카드에 날짜를 붙이고, 그 지역 예보 지점(utils `TOUR_ITINERARY_REGIONS[…].weatherPlaceId` — 제주는 제주시. 지역 중심에서 가장 가까운 지점은 성판악(산간)이라 직접 적는다)의 단기(오늘~+3일)·중기(+4~+10일) 예보를 날씨 화면과 같은 훅·병합(`useWeatherForecast`·`useWeatherMid`·`mergeDailyRows`)으로 불러 비 오는 일차를 고른다(강수 상태이거나 강수확률 60% 이상). 서버에는 날짜가 아니라 **비 오는 일차 번호(`wetDays`)** 만 간다 — `TourPlanService` 는 예보를 부르지 않아 외부 의존이 없고 결정적이다. 비 오는 날은 후보 점수에 유형별 배수(자연·산책·레저 0.5, 역사·테마 0.8, 문화 1.5, 상업·체험 1.2)를 곱해 권역과 자리를 고르고 응답 `days[].wet` 으로 표시한다. 가운데 날의 지리적 순서 바꿈은 비 오는 날과 아닌 날이 섞이면 하지 않는다(권역을 그날 날씨에 맞춰 골랐으므로). 예보가 닿지 않는 날짜(열흘 뒤)나 예보 조회 실패는 날짜만 붙인다. 테스트 `tour-plan-synth.test.ts` 27건·`tour-plan.service.test.ts` 16건·`TravelPlanPage.test.tsx` 6건(예보는 MSW 픽스처) | 유형은 장소 단위 실내·야외 정보가 아니라 거친 구분이다(실내 수족관도 '테마'). 작성 머신 `.env` 에 `DATA_GO_KR_API_KEY` 가 없어 실제 예보가 반영되는 화면은 못 봤다 — 예보 실패 경로(날짜만 표시)만 실서버로 확인. **4단계의 나머지는 하지 않았다**: 주변 주차장(작성 머신에 주차장 적재 0건이라 검증 불가, 좌표 비공개 방침과도 닿는다) · 물때(해안 몇 곳에만 의미) · 일정 설명문(LLM — 공개 라우트의 비용·한도 결정이 먼저) |
| **13차 일정표를 제주 밖으로 — 시도·권역 19개 지역** ✅ 2026-10-04 (배포는 AI 허브 회신 뒤) | utils `TOUR_ITINERARY_REGIONS` 를 `전체` 만 빼고 전 지역으로(`TourItineraryRegionDef{zoneKm,hubKm,skipIslands,mealFallback,weatherPlaceId}` — 값은 부록 D 의 실측). **거점 반경**(`hubKm`, 제주는 null) — 제주는 하루에 섬 절반을 돌지만 본토 여행은 한 도시 안팎에서 끝난다(날짜 사이 이동 90% 선 7~38km). 반경이 없으면 "강원 2박" 이 강릉 → 춘천 → 속초로 튄다. 거점은 숙소 동네(`stayArea`) → 꼭 갈 곳(`must`)이 든 권역 → 그 조건에서 며칠을 가장 알차게 채우는 동네 순으로 정한다: 권역마다 하루를 채운 점수를 내고, 반경의 **절반** 안 권역의 점수를 높은 것부터 일수만큼 더한 값이 가장 큰 묶음에서 하루 점수가 가장 높은 권역(반경 전체로 재면 두 도시의 중간이 거점이 된다). 날에 줄 수 있는 권역은 거점에서 반경 안 + 꼭 갈 곳이 든 권역, 거점 권역에도 하루를 준다(숙소로 정한 거점은 제외). 날을 다 못 채우면 반경을 두 배로 넓혀 한 번 더 짜고, 그래도 모자라면 채운 날만 낸다. **거리는 권역 중심이 아니라 "그 권역에서 하루를 채웠을 때 들르는 곳들의 중심" 끼리** 잰다 — 권역 중심은 군집의 씨앗일 뿐이라 이웃 권역의 인기 장소로 하루를 채우는 권역은 중심과 실제 동선이 반경만큼 어긋난다(강릉 북쪽 권역: 중심에서는 속초가 38km 안인데 하루는 강문해변에서 보낸다). **하루 권역 반경**(`zoneKm` 5~12km)·앞 장소 거리 감쇠(반경 × 2/3)·대안 거리·숙소 감쇠(거점 반경 ÷ 2)도 지역 규모를 따른다. **같은 곳 합치기** — 장소 id 는 세트 안에서만 유일해 제주·도서 세트와 권역 세트에 같이 잡힌 곳(해운대해수욕장 105+19건, 전주한옥마을 126+8건 … 시도 11곳에 109쌍)이 목록·일정에 두 번 나왔다. 이름이 같고 300m 안이면 한 곳으로 센다(여행 수는 합, 보정 만족도는 여행 수 가중, 등록 맛집 연결은 합친 id 전부에서 찾는다). **사실상 같은 곳 묶음** — 한쪽 이름이 다른 쪽 이름 + 공백으로 시작하고 500m 안이면(대왕암공원·대왕암공원 출렁다리, 18쌍) 합치지는 않되 한 일정에 한 곳만 넣는다. **이름으로 거르기** — 유형이 `상업`·`식당` 으로 더 많이 적힌 대형마트·편의점·생활용품점·아파트(이마트 서귀포점 36건 등 23곳)는 목록에만 남기고 일정 자리에는 넣지 않는다. **식사 자리 대체**(`mealFallback`, 제주 밖) — 제주 밖은 식당마다 표본이 얇아(여행 5건 이상인 식당: 서울 8곳·경남 6곳·울산 0곳) 식사 자리에 넣을 식당 후보가 없으면 그 시각에 맞는 볼거리로 채운다. 식당이 하나도 없는 날은 화면이 그렇게 알린다. **섬 표시**(`isIsland`)는 제주 세트에서만 뜻이 맞아(다른 세트에서는 전주한옥마을·강릉 시내에도 붙어 있다) 제주에서만 일정에서 뺀다. **라벨** — 읍면동이 시군구를 넘나들면 읍면동마다 시군구를 붙이고("해운대구 우동·수영구 광안동"), 여러 시도를 묶은 권역은 시도를 앞에 붙인다("부산 수영구 광안동·민락동"). **날씨** — 제주 밖은 예보 지점이 거점에 따라 달라 서버가 응답으로 알려 준다(`itinerary.weatherPlaceId` = 거점에서 가장 가까운 시·군·구, utils `nearestWeatherPlace`). 화면은 첫 결과에 날짜·예보를 붙이고 비 예보는 다음에 찾을 때부터 `wetDays` 로 보낸다. 거점은 날씨를 보지 않고 정해 예보가 거점(=예보 지점)을 흔들지 않는다. **웹** — 일정 옵션(속도·이동·출발일)이 전 지역에서 보이고, 일정표 위에 "○○ 주변에서 짰습니다 — 다른 곳을 중심으로 보려면 숙소 동네를 고르거나 꼭 갈 곳을 넣으세요"(숙소를 고르면 숨김), `전체` 는 "지역을 골라야" 안내. 긴 장소 이름이 일차 카드를 화면 밖으로 밀던 것(격자 칸 `min-w-0`)도 고쳤다. **실측**(`probe:tour-plan --regions` — 일정표 지역 전부를 당일·1박·2박으로) — 20개 지역 × 3 = 60개 중 59개가 일수를 다 채움(세종 2박만 2/3일). 제주 결과는 13차 전과 같다(숙소 동네 라벨 표기만 달라짐). 남긴 것: 원본의 장소명 오류(조천읍 식당이 "도산근린공원" 등)는 손대지 않았고, 다도해(남해·통영처럼 직선 35km 가 차로 80km)는 직선거리 반경이 실제보다 가깝게 본다. | 거점 권역·그 좌표·거점에서 보내는 날은 합성기 안에서만 쓰고 응답에는 동네 라벨과 예보 지점 id(시·군·구 단위)만 나간다. 합친 장소도 각자 여행 5건·평가 3건 이상인 행끼리만 합친다(하한 미만 행을 더해 공개하지 않는다) |
| **14차 코스 다양화 — 다른 코스 보기·유명도·여행 목적·풀린 조건의 선호** ✅ 2026-10-04 (배포는 AI 허브 회신 뒤) | 조건이 달라도, 다시 찾아도 같은 코스가 나오던 것을 푼다. **실측**(`probe:tour-plan --diversity` — 연령 5 × 동반 8 × 박수 5 = 200개 조건): 제주는 일정에 한 번이라도 나오는 장소가 85곳(일정에 넣을 수 있는 후보 약 815곳), 조건의 59% 가 같은 첫날(델문도 → 함덕해수욕장 → 도산근린공원), 서로 다른 일정표 98개, 같은 조건을 다시 요청하면 늘 같은 일정. 원인 셋 — ① 점수의 √여행 수가 순위를 정한다(후보의 8할 665곳이 여행 20건 미만인데 보정 만족도는 인기 장소와 같은 수준: 중앙 4.35 대 4.43) ② 조건이 전부 맞는 여행이 20건 미만이면 조건을 통째로 버린다(200개 중 175개가 조건을 풀고 100개는 연령까지) ③ 자리마다 1등만 고른다. **다른 코스 보기**(`variant` 0~99) — 0 이 아니면 후보 점수에 ±35%, 권역 점수에 ±30% 의 잡음을 곱한다. 난수를 차례로 뽑지 않고 번호와 후보 id(권역 번호)로 정해(FNV 해시) 같은 번호는 같은 코스이고, 권역을 견줄 때와 채울 때 같은 후보가 같은 점수로 보인다. 점수가 1등의 절반에 못 미치는 후보는 어떤 번호에서도 뽑히지 않고, 꼭 갈 곳은 흔들지 않는다. 목록 순위는 그대로(일정에서 고르는 곳만 바뀐다). **유명도**(`fame`) — 여행 수의 지수: `famous` √n(기본) · `mixed` n^¼ · `hidden` 여행 수를 보지 않음. 목록에도 반영. **여행 목적**(`purposes`, 최대 3 — utils `TOUR_PLAN_PURPOSES`: 테마파크·동식물원/역사 유적/전시·공연/야외 스포츠·레포츠/등산/쇼핑/온천·스파/촬영지/요즘 뜨는 곳/새로운 곳 찾기) — 원본의 미션(코드표 MIS, 여행마다 1~5개. 권역마다 100건 이상인 것만 열었다)으로 "그 목적의 여행이 평균보다 더 간 곳" 을 앞세운다. 선호를 **세제곱**해 곱한다(목적 여럿은 0.1~10 으로 자름): 그대로 곱하면 방문 수에 묻혀 일정이 한 곳도 바뀌지 않고(테마파크 목적인데 기준과 같은 일정), 제곱이면 역사 유적 목적에 역사 유적이 하나도 안 든다. 세제곱에서 역사 유적 → 항파두리, 테마파크 → 뽀로로앤타요·신화워터파크, 등산 → 성산일출봉·새별오름이 든다. 그 목적의 여행 5건 이상이 갔고 평균의 1.3배 이상인 곳에 `purposeFit`(화면의 "목적" 표시). 표본이 20건에 못 미치는 목적은 쓰지 않는다. **풀린 조건의 선호** — 사다리로 풀린 조건(`relaxed`)을 버리지 않고 "그 조건 하나만 같은 여행"(30대 597건 · 2박 610건처럼 두껍다)의 선호를 순위에 곱한다. 비슷한 여행(풀고 남은 조건)과 겹치지 않는 조건이라 같은 근거를 두 번 세지 않는다. 표시하는 "비슷한 여행 N건 · 평균의 몇 배" 는 조건을 다 맞춘 여행 기준 그대로. 구현은 지역 프로필의 여행 요약에 연령·성별·월·미션을 실어 메모리에서 가른다(추가 조회 없음). **웹** — 일정 옵션에 목적(칩, 3개까지)·장소(유명한 곳 위주/골고루/덜 알려진 곳도), 일정표에 "다른 코스 보기"(번호를 하나 올려 다시 짠다. "코스 N" 표시와 "처음 코스로". 폼으로 다시 찾으면 처음 코스, 일정 편집은 보던 번호 유지), 목적에 맞는 곳 표시, 점수 설명이 유명도·목적을 따라 바뀐다. **결과**(같은 200개 조건, 기본 설정) — 제주: 서로 다른 일정표 98 → 159개 · 서로 다른 하루 97 → 247개 · 일정에 나오는 장소 85 → 112곳 · 가장 흔한 첫날 59 → 48%. 강원: 일정표 111 → 175개 · 장소 70 → 97곳 · 가장 흔한 첫날 28 → 10%. 한 조건(제주 30대·2인·2박)에서 다른 코스 보기 12번은 전부 다른 코스(장소 12 → 41곳, 평균 만족도 4.41 → 4.40), 유명도는 일정 장소의 여행 수 중앙 77 → 57 → 46건(평균 만족도 4.41 → 4.45 → 4.46). **하지 않은 것** — 성향 설문(`style1~8`)은 방문과 거의 무관해 쓰지 않는다(설문 양 끝 그룹의 자연·산책 방문 비중 26% 대 24%). 풀리지 않은 조건의 선호까지 곱하면 더 갈리지만(159 → 164개) 같은 근거를 두 번 세게 돼 넣지 않았다. 코스 2~3개를 한 화면에 나란히 보여 주는 것은 다른 코스 보기로 넘겨 볼 수 있어 미뤘다. 기본 설정의 첫날 쏠림(48%)은 남아 있다 — 그 동네가 실제로 도착한 날 가장 많이 가는 곳이다. | 변형 잡음은 서버 안의 점수에만 곱하고 응답 숫자(n·만족도)는 그대로다. 목적·풀린 조건의 선호도 장소 단위는 그 묶음의 여행 5건 이상이 간 곳에만 쓰고 그 미만은 유형 선호로 물러선다(기존 규칙 그대로). 미션 코드·연령 등 여행 속성은 메모리에서만 쓰고 응답에 없다 |
| **15차 운영 정보 — 한국관광공사 관광정보로 이용 시간·쉬는 날 붙이기** ✅ 2026-10-04 (실호출로 검증·보정. 소개 정보는 930/1,599 — 개발계정 일 1,000건이라 나머지는 `sync:tour-kto` 를 다시 돌려 이어 받는다. 배포는 AI 허브 회신 뒤) | 여행로그는 2023년 표본이라 "지금 몇 시에 열고 언제 쉬는지" 가 없다 — 수요일에 쉬는 국수집이 수요일 일정에 들어간다. 원천은 한국관광공사 「국문 관광정보 서비스_GW」(TourAPI 4.0, data.go.kr [15101578](https://www.data.go.kr/data/15101578/openapi.do), `B551011/KorService2`, 개발계정 자동승인·일 1,000건, 출처 표기). **받기** — `kto-tour.adapter.ts`(키를 가린 URL · `items` 배열/단일/빈 문자열 흡수 · 게이트웨이 봉투 JSON·XML · 키·권한(20·30 …)과 쿼터(22)는 즉시 중단, 04·05·HTTP 5xx 만 재시도 · 소개 정보의 유형별 필드(관광지 `usetime/restdate`, 문화시설 `usetimeculture/restdateculture/usefee`, 레포츠 `…leports`, 쇼핑 `opentime/restdateshopping`, 음식점 `opentimefood/restdatefood`)를 이용 시간·쉬는 날·주차·요금 넷으로 모음). 실측: 전체 49,613건 중 받는 유형 44,734건(관광지 12,602 · 문화시설 2,751 · 레포츠 3,751 · 쇼핑 12,228 · 음식점 13,402), `numOfRows=1000` 이 되어 전량 47콜, 필드 이름은 가정 그대로. 반경 검색(`locationBasedList2`)은 카탈로그에 있는 콘텐츠를 빠뜨려(성산일출봉 좌표 1km 에 성산일출봉이 없다) 쓰지 않는다. **맞추기**(`tour-kto-info.ts`, 순수 함수 — 구간 값은 실데이터의 맞춤과 아까운 후보를 보고 정했다) — 이름 열쇠: 괄호 설명을 떼고("성산일출봉 [유네스코 세계자연유산]" · "무주한풍루(시도유형문화재제19호)"), 같은 곳을 두 가지로 부르는 낱말을 하나로(해수욕장 = 해변, 재래·전통·상설시장 = 시장), 괄호 속 별칭은 통째로 같을 때만("월정리해변(월정리해수욕장)" · "종달항(두문포항)" — 지역 구분 "(안성)" 은 2자라 빠진다). 점수 = 같으면 1 · 한쪽이 다른 쪽을 품으면 0.6 + 0.3 × 길이 비율(짧은 쪽 3자 이상) · 아니면 글자쌍 Jaccard. 볼거리: 같은 이름 3km · 0.75 이상 1.5km · 0.55 이상 500m · 0.45 이상 100m · 0.4 이상 50m(바로 그 자리면 이름이 절반만 겹쳐도 같은 곳 — "남산공원 N서울타워" · "남산서울타워" 41m). 식당·카페: 0.75 이상 300m, 한쪽 이름이 다른 쪽을 품은 가게는 0.6 이상 50m(글자쌍만 겹치는 이웃 가게 "제주흑돼지 ○○" 는 맞추지 않는다). 유형이 엇갈리는 짝(볼거리 ↔ 음식점 콘텐츠 등)은 이름이 같고 300m 안일 때만 — 카페가 '체험'·'상업' 으로 적힌 곳(마노르블랑·조양방직)을 살리고 "성산일출봉 ○○식당" 은 막는다. 주변에서 못 찾으면 이름이 전국에 하나뿐인 콘텐츠를 더 멀리까지(볼거리 6km — "사려니숲길" 5.5km, 식당 1.5km). 결과: **1,746/2,649곳(66%)** — 자연 436/502 · 역사 265/292 · 상업 221/263 · 문화 117/139 · 체험 90/117 · 테마 72/90 · 산책 61/74 · 식당·카페 409/980(관광정보에 없는 프랜차이즈·동네 식당이 남는다). 보정 전(초안 기준) 1,653곳 — 더해진 99곳을 전부 눈으로 봤고 틀린 맞춤은 찾지 못했다. **쉬는 요일 읽기** — "매주 월요일"·"매주 월,화"·"월~수요일"·"주말" 에서 매주 쉬는 요일만 뽑는다. 받은 문구 203가지를 보고 정한 규칙: 괄호 안은 본문의 예외라 떼고 읽되 철을 가리면("(비수기)") 통째로 읽지 않는다 · ※ 뒤는 덧붙임이라 보지 않는다("연중무휴 ※ 매주 월요일 향토박물관 휴관" 이 월요일 휴무로 읽혔다) · "연중무휴" 가 있으면 쉬는 요일 없음 · 시설마다 따로 적은 문구("[동원] 매주 월요일[서원] 매주 화요일" · "- 서문시장 … / - 야시장 매주 월~목요일")와 격주·월 n회·"문의"·"…을 제외한" 은 읽지 않는다. 읽지 못한 문구도 그대로 보여 준다(일정에서 피하는 데만 쓰지 않는다). 받은 882건 중 요일을 읽은 것 153 · 매주 쉬는 요일 없음 647 · 읽지 않은 것 82. **저장·동기화** — Prisma 3표(`TourKtoContent`·`TourKtoIntro`·`TourPlaceKto`, 마이그레이션 `20261004105500_add_tour_kto`) + `tour-kto.service.ts`(카탈로그 → 맞추기 → 소개 정보, 위 §로더·운영). 카탈로그를 통째로 받아 로컬에서 맞추니 기준을 고쳐 다시 맞추는 데 호출이 들지 않는다. **코스** — 프로필이 맞춤 표를 읽어 장소에 `info` 를 붙이고(같은 곳으로 합친 장소는 정보가 있는 쪽을 따른다), `startDow` 를 주면 합성이 일차마다 요일을 정해 그 요일에 쉬는 후보를 그날 자리와 대안에서 뺀다. 꼭 갈 곳은 열려 있는 날에 놓는다(가운데 날이 쉬는 요일이면 첫날·마지막 날로) — 어느 날에 놓아도 쉬는 요일이면 그래도 넣고 `closedThatDay`. 거점은 요일을 보지 않고 정한다(출발일이 거점과 예보 지점을 흔들지 않게). 가운데 날 순서 바꾸기는 요일을 날짜에 붙여 둔 채로 하고, 꼭 갈 곳이 있는 일정은 바꾸지 않는다. 서버는 날짜도 관광정보도 부르지 않는다(받아 둔 표만 읽는다 — 결정적). 표시 문구는 글머리표·줄바꿈을 " / " 로 이은 한 줄(240자). 대안에 이름만 같은 다른 장소가 두 번 나오던 것도 한 번으로. **웹** — 출발일에서 요일을 뽑아 `startDow` 로 보내고, 일정·추천 목록의 장소 아래에 접힌 한 줄("이용 … · 쉬는 날 …", 누르면 네 항목), 쉬는 날에 남은 꼭 갈 곳은 한 줄로 알리고, 결과 아래에 출처·주의(`infoNote`, utils `TOUR_INFO_NOTE`) | typecheck 6/6 · friendly 1,744 · web 184 · utils 398 · shared 115 통과. `docs/api/openapi.json` 재생성. 실호출 992건(프로브 15 + 카탈로그 47 + 소개 정보 930): 소개 정보를 받은 930개 중 이용 시간 914 · 쉬는 날 882. 로컬 API(prod.db): 제주 30대·2인·2박 추천 목록 33곳 중 24곳에 운영 정보. 월요일 출발이면 3일차(수)의 자매국수("매주 수요일")가 빠지고 제주광해 애월본점이 들어가며, 화요일 출발이면 그대로다. 화면은 폭 375 에서 가로 넘침 없음. **남은 것** — 소개 정보 669개(다음 날 `sync:tour-kto`) · 운영 서버에는 이 Mac 의 결과가 가지 않으므로 거기서도 한 번 돌려야 한다(카탈로그 47콜 + 맞은 콘텐츠당 1콜) |
| 후속 후보 | 앱 연동(WebView 또는 네이티브 탭) · 여행자 점수의 랭킹 페이지 반영 · 권역 추가는 `TOUR_DATASETS`·`TOUR_REGIONS`(권역+시도, `parent`) 키 + 계약 두 배열 + deploy.sh 루프 한 항목 · 코스 2~3개를 한 화면에 나란히(대표·덜 알려진 곳·목적 중심) · 식당 표본이 얇은 지역의 식사 자리를 등록 맛집(자체 DB)으로 채우기 · 거점 반경을 직선거리 대신 도로 거리로(다도해) · 여행일 물때·주차 결합 · 15차 뒤 — 이용 시간 문구에서 여닫는 시각을 읽어 자리 시각과 맞추기 · 관광정보 축제(15)로 2023년 '축제' 장소 대신 여행일의 행사 넣기 · 관광정보에 없는 식당의 영업시간은 등록 맛집(네이버) 정보로 · 어드민에서 동기화 실행·맞춤 검수 | — |

## 테스트

| 파일 | 고정하는 것 |
|---|---|
| tour-c `tests/data/test_export.py` | 비공개 행 마스킹 유지 · photos 에 좌표 열 없음 · trips 에 traveler_id·소득·직업 없음 · manifest 행 수·sha 일치 |
| `tour-master.service.test.ts` | 정규화 drop 사유(좌표 밖·필수값·마스킹 위반) · 전량 교체 후 건수 · unload 후 0 |
| `restaurant-tour-match.test.ts` | 점수·반경·완전일치 300m · 1:1 · 재실행 안정성 · 고아 canonical 제외 |
| `tour-public.test.ts` | 응답 스키마 키에 식별자 없음 · n<5 null · 여행 <20 insufficient · 매칭 없는 식당 `tour: null` |
| `tour-plan-synth.test.ts` · `tour-plan.service.test.ts` (10·11차) | 뼈대는 여행 5건 이상만 · 이동 모델 실측/기본 · 권역·일정 합성 결정성 · 후보 숫자는 지역 전체 기준, `similarN` 5건 미만 null · 폐업·유형·표본 제외 · 응답 키에 식별자·좌표 없음 · 속도·취향·이동수단·숙소·꼭 갈 곳/뺄 곳 반영, 입력 선택지 키가 계약과 utils 에서 같음 |
| `tour-plan.service.mainland.test.ts` · `tour-plan-synth.test.ts` 의 13차 묶음 | 거점 반경 안에서만 짠다(반경 없으면 두 도시를 오감) · 날이 모자라면 두 배까지 · 숙소·꼭 갈 곳이 거점을 옮김 · 거리는 하루 동선의 중심끼리 · 세트가 다른 같은 곳 합치기(여행 수 합·만족도 가중) · 마트·아파트는 목록에만 · 같은 곳 묶음은 한 일정에 하나 · 식당 없는 동네는 볼거리로 · 섬 표시는 제주에서만 · 권역 라벨의 시도 · `전체` 는 장소만 · 응답에 좌표 키 없음 |
| 14차 — `tour-plan-synth.test.ts`(변형 번호) · `tour-plan.service.mainland.test.ts`(유명도·목적·풀린 조건·변형) · `tour-plan.service.test.ts`(선택지 키·상한) | 변형 0 = 번호 없음 · 같은 번호는 같은 코스 · 번호마다 상위권이 번갈아 뽑힘 · 1등의 절반 미만은 안 뽑힘 · 꼭 갈 곳은 그대로 · 목록은 변형과 무관 · 유명도별 점수(√n · n^¼ · 1) · 목적 선호의 세제곱과 `purposeFit` · 표본 20건 미만 목적은 무시 · 풀린 조건의 선호가 순위에 남고 표시 수치는 그대로 · 계약 enum = utils 상수, 목적 3개·변형 99 상한 |
| 15차 — `kto-tour.adapter.test.ts` · `tour-kto-info.test.ts` · `tour-kto.service.test.ts` · `tour-plan-synth.test.ts`(쉬는 날) · `tour-plan.service.test.ts`(운영 정보) · 웹 `TravelPlanPage.test.tsx` | 키는 로그용 URL 에서 가려지고 인코딩된 키는 다시 인코딩하지 않음 · 응답 봉투(배열·단일·0건·오류 JSON/XML) · 인증 오류는 재시도 없이 중단 · 유형별 소개 필드 → 네 항목 · 맞추기 기준(이름 점수 구간별 거리 · 바로 그 자리 구간 · 해수욕장=해변 같은 낱말과 괄호 속 별칭 · 식당은 300m, 품은 이름은 50m · 유형이 엇갈리면 같은 이름만 · 이름이 하나뿐이면 6km — 예시는 실데이터에서, 격자 색인이 3km 를 덮음) · 쉬는 요일 읽기(줄인 요일·범위·주말, 괄호·조건절·격주·월 n회는 읽지 않음 — 실제 문구에서 틀리게 읽혔던 것: ※ 덧붙임 속의 요일, 시설마다 따로 적은 문구, 철이 붙은 괄호, "…을 제외한") · 표시 문구의 글머리표 정리 · 동기화(쪽 넘기기와 페이지 상한 적응, 다시 돌리면 0콜, 수정된 콘텐츠만 다시, 예산·쿼터·인증 중단과 이어 받기, 줄어든 카탈로그 유지, 적재 이력) · 쉬는 요일인 곳은 그날 자리·대안에 없음 · 꼭 갈 곳은 열린 날로, 없으면 `closedThatDay` · 요일을 안 주면 일정 그대로 · 응답에 좌표·식별자 키 없음 · 화면은 `startDow` 를 출발일이 있을 때만 보내고 운영 정보·출처를 표시 |
| `tour-admin.test.ts` | allowlist 밖 admin 404 · no-store/noindex 헤더 · 사진 라우트 인증 |
| `tour-data-version.test.ts` (+ 인사이트·지역·코스 서비스 테스트의 "데이터 버전" 케이스) | 버전 = 여행로그 네 layer 와 관광정보 동기화 layer(`tour-kto`, 15차)의 가장 큰 이력 id(다른 layer 무시, 없으면 0) · 이력 행이 추가되면 같은 서비스 인스턴스가 곧바로 새로 집계(이력 없는 직접 수정은 TTL) · 버전을 집계보다 먼저 읽음(집계 중 커밋된 적재가 옛 결과를 새 버전으로 남기지 않음) · `unloadTourTables` 직후 떠 있는 공개 라우트 다섯 개가 빈 결과 · 적재·재적재·제거가 버전을 올림(`tour-master.service.test.ts`) |

## 부록 A — 출처 표기 문구

> 이 통계는 과학기술정보통신부·한국지능정보사회진흥원(NIA) 인공지능 학습용 데이터 구축사업 결과물인
> **「국내 여행로그 데이터(제주도 및 도서지역)」(AI 허브 aihub.or.kr, 2023)** 을 가공한 2차 저작물입니다.
> 2023년 4~9월 패널 표본을 집계한 값이며 현재 영업 상태나 관광객 전체를 대표하지 않습니다.

컴포넌트 `TourSourceNote`(웹)로 두고, 집계를 쓰는 모든 섹션 하단과 `/about` 에 넣는다.

## 부록 B — AI 허브 문의문 초안 (사용자 발송)

> 제목: 「국내 여행로그 데이터」(제주도 및 도서지역·서부권·동부권·수도권) 집계 통계의 웹 서비스 게시 가능 여부 문의
>
> 데이터셋 71780(제주도 및 도서지역)·71779(서부권)·71778(동부권)·71581(수도권)을 다운로드 승인받아 이용 중인 개인입니다. 원본 데이터(개별 여행·방문 기록, 사진, GPS)는 외부에 제공하거나
> 열람시키지 않고, 장소 단위로 **집계한 통계(방문자 수, 평균 만족도, 체류 시간 중앙값, 방문 시간대 분포, 1인당 지출 중앙값 등,
> 표본 5명 미만 구간은 비공개)** 를 제가 운영하는 국내 웹 서비스(맛집 추천)에 출처(데이터명·AI 허브·NIA 사업결과)를 표기해
> 게시하려 합니다. 이용정책의 "인공지능 학습모델의 학습용으로만" 조항과 FAQ 의 "2차 저작물(서비스 등) 영리·비영리 자유 활용"
> 안내 사이에서, 위와 같은 **집계 통계의 게시가 2차 저작물 활용에 해당하여 허용되는지** 확인 부탁드립니다. 서버는 국내에 있으며
> 원본은 국외로 반출하지 않습니다.

## 부록 C — 프로토타입과 결정 이력

- 프로토타입(2026-09-13): https://claude.ai/code/artifact/1392ba04-af21-4e31-8118-2b799c89ae54 — 화면 6개, 실제 집계값.
- 이용조건 조사 결과와 항목별 판정표는 2026-09-13 대화 기록. 요지: 공개 = 집계·추천만, 원본 = 승인받은 본인만.
- dev DB 관측: 제주 등록 맛집 0곳(발굴 시드가 1순위인 이유), 고아 canonical 7,969건(매칭 대상에서 제외).

## 부록 D — 지역별 동선 실측(13차, 2026-10-04 적재본)

`TOUR_ITINERARY_REGIONS` 의 값이 여기서 나왔다. 공개 방문(이동·숙소·상점·기타·축제 제외, 좌표 있음)만 셌다.
**하루 반경** = 그날 들른 곳들의 중심에서 가장 먼 곳까지, **날짜 사이** = 이어진 두 날의 중심 사이 거리.
`zoneKm` = 하루 반경 75% 선을 5~12km 로, `hubKm` = 날짜 사이 90% 선을 15~40km 로 자른 값(제주는 섬 전체가 하루 거리라 거점 반경을 두지 않는다).
후보 = 여행 5건·평가 3건 이상인 장소(이동·숙소 제외, 세트 간 중복을 합치기 전).

| 지역 | 여행 | 박수 당일/1박/2박+ (%) | 후보(식당) | 하루 반경 p50/p75 (km) | 날짜 사이 p50/p75/p90 (km) | zoneKm | hubKm |
|---|---|---|---|---|---|---|---|
| 제주 | 1,694 | 15 / 8 / 77 | 925 (513) | 13.1 / 20.2 | 17.0 / 25.5 / 34.6 | 12 | — |
| 서부권 | 3,864 | 40 / 40 / 19 | 683 (218) | 3.8 / 9.3 | 6.3 / 17.1 / 35.5 | 9 | 36 |
| 전북 | 811 | 30 / 45 / 24 | 168 (59) | 2.9 / 7.9 | 4.0 / 12.0 / 27.7 | 8 | 28 |
| 전남 | 906 | 35 / 41 / 24 | 185 (75) | 3.6 / 7.6 | 4.6 / 15.4 / 31.5 | 8 | 32 |
| 충남 | 1,049 | 40 / 42 / 18 | 132 (20) | 5.0 / 11.0 | 9.5 / 18.2 / 32.3 | 11 | 32 |
| 대전 | 636 | 52 / 36 / 12 | 95 (46) | 3.3 / 4.6 | 3.2 / 5.2 / 7.3 | 5 | 15 |
| 충북 | 834 | 30 / 41 / 29 | 79 (15) | 4.3 / 9.4 | 7.0 / 15.2 / 23.5 | 9 | 24 |
| 광주 | 318 | 30 / 36 / 34 | 15 (2) | 2.3 / 5.1 | 3.7 / 5.0 / 10.0 | 5 | 15 |
| 세종 | 149 | 69 / 21 / 10 | 9 (1) | 1.7 / 4.1 | 3.3 / 5.1 / 7.0 | 5 | 15 |
| 동부권 | 3,826 | 39 / 43 / 18 | 669 (199) | 4.2 / 9.4 | 7.3 / 16.6 / 34.9 | 9 | 35 |
| 강원 | 1,216 | 32 / 54 / 15 | 252 (85) | 4.0 / 9.3 | 6.3 / 18.0 / 37.6 | 9 | 38 |
| 경북 | 985 | 44 / 41 / 14 | 174 (67) | 4.3 / 10.0 | 7.9 / 17.1 / 30.6 | 10 | 31 |
| 경남 | 785 | 40 / 42 / 18 | 74 (6) | 4.9 / 10.2 | 10.0 / 18.5 / 30.7 | 10 | 31 |
| 부산 | 872 | 36 / 37 / 27 | 127 (34) | 3.4 / 6.9 | 5.5 / 9.2 / 12.9 | 7 | 15 |
| 대구 | 451 | 41 / 35 / 24 | 26 (7) | 2.5 / 4.1 | 3.6 / 5.4 / 9.5 | 5 | 15 |
| 울산 | 203 | 45 / 37 / 17 | 16 (0) | 4.8 / 9.4 | 7.7 / 13.1 / 16.1 | 9 | 16 |
| 수도권 | 5,341 | 46 / 32 / 22 | 380 (53) | 2.4 / 6.7 | 6.5 / 13.8 / 23.8 | 7 | 24 |
| 서울 | 2,532 | 38 / 28 / 35 | 116 (8) | 1.2 / 3.9 | 4.1 / 7.7 / 11.1 | 5 | 15 |
| 경기 | 2,978 | 53 / 35 / 13 | 191 (33) | 2.2 / 6.3 | 7.4 / 15.9 / 25.8 | 6 | 26 |
| 인천 | 604 | 49 / 38 / 14 | 73 (12) | 2.3 / 6.4 | 5.0 / 11.6 / 20.0 | 6 | 20 |

읽는 법 — 제주 여행은 2박 이상이 77% 이고 하루에 13~20km 를 돈다. 본토는 당일·1박이 8할이고 하루 동선이 한 동네(3~5km) 안이다. 그래서 제주의
규칙(권역 12km·섬 전체에서 날마다 다른 동네)을 그대로 쓰면 본토 일정은 날마다 도시를 옮겨 다닌다. 식당 후보가 제주에 몰려 있는 것(전체 식당
후보의 절반)도 본토에서 식사 자리를 볼거리로 메우는 이유다.
