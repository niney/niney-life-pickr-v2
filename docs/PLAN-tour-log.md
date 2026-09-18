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
- 성능: SQLite 에 30만 행. 공개 집계는 인덱스 + `lru-cache`(필터 키, TTL 1h) 로 충분. 적재 시 캐시 무효화.

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
| `LifeMasterSync` | layer=`tour` · count(=places) · baseDate(=manifest built_at) · sourceFile(=export 경로+exportVersion) | 기존 | "적재됨" 판정 |

`codes` 는 테이블 없이 `@repo/utils` 상수(`TOUR_TYPE_SHORT`, `TOUR_REASON` 등)로 둔다 — 화면 라벨·색이 필요할 뿐 조인이 없다.

## 로더·운영

| 명령 | 하는 일 |
|---|---|
| `load:tour [dir] [--dry-run] [--no-thumbs]` | manifest 검증(exportVersion·sha256) → 정규화 순수 함수(좌표 한국 범위·비공개 마스킹 재검증·필수값) + 사유별 drop 리포트 → Tour* 전량 교체 트랜잭션(청크 500~1,000, 바인드 32,766 아래) → `LifeMasterSync layer=tour` → `TOUR_THUMBS_DIR` 존재 확인 → 공개 집계 캐시 무효화 |
| `unload:tour` | Tour* 전부 삭제 + RestaurantTourMatch·TourPlaceBizStatus 삭제 + sync 행(count 0) — 환수 대비 |
| `match:restaurant-tour [--dry-run]` | 식당 행이 1개 이상인 canonical(좌표 있음) ↔ TourPlace(식당·상업·상점) — 100m + `storeNameScore ≥ 0.5`, 정규화 이름 완전일치면 300m — 1:1(최고 점수), 재실행 시 이전 매칭 유지(상가 매칭 규칙) |
| `check:tour-biz [--max-calls=N] [--min-travelers=3]` | TourSpend 에서 장소별 최빈 사업자번호 → 국세청 「사업자등록정보 진위확인 및 상태조회」(data.go.kr 15081808, 100건/콜, `DATA_GO_KR_API_KEY` 활용신청) → TourPlaceBizStatus |
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
| `POST /tour/public/plan` `{ageGrp, accompany, nights, month?, gender?}` | `{matchedTrips, places[{name,kind,sigungu,n,mean,score}], templates[{typeSeq,n}]}` | 장소 n≥5, matchedTrips<20 이면 조건 완화 안내 |
| `GET /tour/public/density?kind=all\|restaurant[&bbox]` (6차) | 0.02° 격자 `[{x,y,n,travelers}]` + 분위 경계 4개(5등급 색칠) + 규모 — bbox 없으면 전국 칸 전부(수백 개) | 여행자 ≥5 칸만 |
| `GET /tour/public/lodging?region&ageGrp&gender&accompany&month&nights` (6차) | 숙박 결제 유형별 이용 여행·결제 중앙·1박 추정(결제액 × 숙박 건수 ÷ 박수)·1인 중앙·예약률 + 숙소 방문 만족도 | 여행 ≥5 유형만, 금액·평가 3건 미만 null |
| `GET /tour/public/regions?region&ageGrp&gender&accompany&month&nights` (6차·7차) | 집단(region=jeju 는 제주시·서귀포시·부속섬 3집단, 시도·서부권은 시군구 상위 8집단: 여행·방문·비중·만족·식당·체류·1인 지출·유형·읍면동) + 읍면동 표(최대 20) | 집단 여행 ≥5, 읍면동 방문 ≥5 |
| 공통: `region` (7차·8차) | `jeju`(제주 본섬+부속섬) · `west`(서부권 7개 시도 합) + 시도 키 `jeonbuk/jeonnam/chungnam/daejeon/chungbuk/gwangju/sejong` · `east`(동부권 6개 시도 합) + `gangwon/gyeongbuk/gyeongnam/busan/daegu/ulsan` · `all`(적재 전체). 라벨·bbox·거점·권역 묶음(`parent`, `TOUR_REGION_GROUPS`)은 utils `TOUR_REGIONS` — 화면 칩은 1행 권역, 2행 시도 | — |

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
| 후속 후보 | 앱 연동(WebView 또는 네이티브 탭) · 남은 권역(수도권 71581, 같은 스키마 — `TOUR_DATASETS`·`TOUR_REGIONS`(권역+시도, `parent`) 에 키 추가 + 계약 두 배열) · 여행자 점수의 랭킹 페이지 반영 | — |

## 테스트

| 파일 | 고정하는 것 |
|---|---|
| tour-c `tests/data/test_export.py` | 비공개 행 마스킹 유지 · photos 에 좌표 열 없음 · trips 에 traveler_id·소득·직업 없음 · manifest 행 수·sha 일치 |
| `tour-master.service.test.ts` | 정규화 drop 사유(좌표 밖·필수값·마스킹 위반) · 전량 교체 후 건수 · unload 후 0 |
| `restaurant-tour-match.test.ts` | 점수·반경·완전일치 300m · 1:1 · 재실행 안정성 · 고아 canonical 제외 |
| `tour-public.test.ts` | 응답 스키마 키에 식별자 없음 · n<5 null · 여행 <20 insufficient · 매칭 없는 식당 `tour: null` |
| `tour-admin.test.ts` | allowlist 밖 admin 404 · no-store/noindex 헤더 · 사진 라우트 인증 |

## 부록 A — 출처 표기 문구

> 이 통계는 과학기술정보통신부·한국지능정보사회진흥원(NIA) 인공지능 학습용 데이터 구축사업 결과물인
> **「국내 여행로그 데이터(제주도 및 도서지역)」(AI 허브 aihub.or.kr, 2023)** 을 가공한 2차 저작물입니다.
> 2023년 4~9월 패널 표본을 집계한 값이며 현재 영업 상태나 관광객 전체를 대표하지 않습니다.

컴포넌트 `TourSourceNote`(웹)로 두고, 집계를 쓰는 모든 섹션 하단과 `/about` 에 넣는다.

## 부록 B — AI 허브 문의문 초안 (사용자 발송)

> 제목: 「국내 여행로그 데이터」(제주도 및 도서지역·서부권·동부권) 집계 통계의 웹 서비스 게시 가능 여부 문의
>
> 데이터셋 71780(제주도 및 도서지역)·71779(서부권)·71778(동부권)을 다운로드 승인받아 이용 중인 개인입니다. 원본 데이터(개별 여행·방문 기록, 사진, GPS)는 외부에 제공하거나
> 열람시키지 않고, 장소 단위로 **집계한 통계(방문자 수, 평균 만족도, 체류 시간 중앙값, 방문 시간대 분포, 1인당 지출 중앙값 등,
> 표본 5명 미만 구간은 비공개)** 를 제가 운영하는 국내 웹 서비스(맛집 추천)에 출처(데이터명·AI 허브·NIA 사업결과)를 표기해
> 게시하려 합니다. 이용정책의 "인공지능 학습모델의 학습용으로만" 조항과 FAQ 의 "2차 저작물(서비스 등) 영리·비영리 자유 활용"
> 안내 사이에서, 위와 같은 **집계 통계의 게시가 2차 저작물 활용에 해당하여 허용되는지** 확인 부탁드립니다. 서버는 국내에 있으며
> 원본은 국외로 반출하지 않습니다.

## 부록 C — 프로토타입과 결정 이력

- 프로토타입(2026-09-13): https://claude.ai/code/artifact/1392ba04-af21-4e31-8118-2b799c89ae54 — 화면 6개, 실제 집계값.
- 이용조건 조사 결과와 항목별 판정표는 2026-09-13 대화 기록. 요지: 공개 = 집계·추천만, 원본 = 승인받은 본인만.
- dev DB 관측: 제주 등록 맛집 0곳(발굴 시드가 1순위인 이유), 고아 canonical 7,969건(매칭 대상에서 제외).
