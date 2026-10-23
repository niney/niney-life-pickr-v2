# 식단 관리 기능 구현 계획 — "내 평소 식단 기록 + 다음 끼니 추천"

> 2026-08-22 작성. 커밋 여부는 사용자 지시에 따름(작성 시점 untracked).
> "오늘 뭐 먹지?"(= `restaurant` smart-pick, 식당 가중 랜덤 픽)와는 **독립 도메인**으로 구현한다.
> 계획 시점의 기록이며, 이후 실제 진행·변경 사항은 커밋 이력이 진실이다.

## Context

"오늘 뭐 먹지?"는 리뷰 만족도 가중치로 **식당**을 뽑는 기능(`SmartPickSection` → `POST /restaurants/public/smart-pick`, LLM·사용자 이력 없음, 웹 전용)이다.
이번 기능은 **사용자 개인의 평소 식단을 기록하고, 그 패턴을 분석해 다음 끼니를 추천**하는 별개 도메인이다.
재료로는 기존 음식점·메뉴 데이터(리뷰 기반 정규화 메뉴 ~6,600종 + 식당 스냅샷 메뉴)와 공공데이터(식약처 영양성분 DB·레시피 DB)를 합쳐 **음식 카탈로그**를 만들고, 정산 영수증 추출에 이미 검증된 **사진 → Ollama Cloud 비전 → JSON** 파이프라인을 음식 사진 인식으로 이식한다.

**사용자 결정 (확정 — 요청 원문 기준)**
1. "오늘 뭐 먹지?" 확장이 아니라 **독립 구현**. 음식점·메뉴 데이터는 자유롭게 재활용.
2. 음식 데이터는 기존 메뉴 데이터 + **공공데이터포털 등 외부 데이터**를 더해 확보.
3. 평소 식단 입력은 **앱(Expo)에서만**, 편의를 위해 **사진 인식**(Ollama Cloud 상위 비전 모델). *(2026-09-29 일부 번복 — 웹도 손으로 적는 입력·수정·삭제를 연다. 2026-10-23 사진 넣기·인식도 웹에 연다(수정 포함). 아래 진행 기록 참조)*
4. 추천의 기본 목표는 건강보다 **내 패턴 분석 → 겹치지 않게·골고루 + 취향 반영**.
5. 추천 시 **중요도(가중치) 설정** 기능 — 항목은 이 문서가 제안.
6. 입력을 제외한 조회·통계·추천·설정은 **웹·앱 동일**하게 제공.
7. 추천도 Ollama Cloud 모델. **모델은 어드민 AI 설정(purpose 별)** 에서 바꿀 수 있게.

**보강한 결정 (제안 — 착수 전 확인 요청, 이견 없으면 이대로 진행)**

| # | 결정 | 근거 |
|---|---|---|
| A | **로그인 필수** (게스트 로컬 모드 없음) | 사진 포함 서버 저장 데이터라 즐겨찾기식 guest↔server 하이브리드가 맞지 않음. 앱은 게스트에게 진입점 숨김 + 화면 상단 `Redirect('/(auth)/login')`, 웹은 `RequireUser` |
| B | 코드 슬러그 **`meal`(식단 기록) / `food`(음식 카탈로그)** | `diet` 는 한국어 "다이어트" 오독 소지. 한글 본문은 "식단" |
| C | 식단 기록 행은 카탈로그·식당에 **FK 를 걸지 않고 스냅샷 문자열** 저장 | `global_menu_canonicals` 는 재머지 때 전량 삭제·재생성, 식당도 재크롤/삭제됨. 기존 `RestaurantFavorite` 와 동일 원칙 |
| D | 인식 결과는 **사용자 확정 전까지 저장 안 함**(영수증과 동일), 확정 후 **인식 메타(모델·버전·confidence·원본 후보)는 보존** | 영수증과 달리 인식 품질·추천 품질을 나중에 측정해야 함 |
| E | LLM 에는 **원시 기록을 주지 않고 서버가 집계한 패턴 프로필 + 코드가 고른 후보 풀**만 전달. LLM 불가·실패 시 **결정적 점수 랭킹 폴백** | 토큰·프라이버시·재현성. smart-pick 의 "서버 null → 클라 균등 랜덤" 폴백과 같은 철학 |
| F | 새 purpose **2개**: `meal-photo`(vision) / `meal-recommend`(text). 기존 `image` 를 공유하지 않음 | 영수증과 모델·동시성 게이트·텔레메트리를 분리해 독립 튜닝 |
| G | Ollama Cloud 는 현재 **JSON 스키마 강제(structured outputs)를 지원하지 않음** → 스키마를 프롬프트에 내장 + `format:'json'` + `extractFirstJsonObject` + zod + **수리 재시도 1회** | docs.ollama.com 명시 + 이슈 #12362 (영수증 추출도 같은 조건에서 동작 중) |
| H | 다중 사진 업로드는 **장당 1요청 순차**(현 multipart `files:1` 유지), 인식은 **사진 묶음 1회 호출** | 플러그인 한도 변경 없이 진행률 UX 확보 |
| I | 기존 `picks` 모듈(휴면 per-user CRUD, UI 없음)은 **건드리지 않음** | 스키마가 다르고 Routes SSOT 위반 상태 — 확장보다 독립이 싸다 |

범위: **friendly + api-contract + shared + 앱(입력·조회·추천·설정) + 웹(조회·추천·설정 + 어드민)**.

## 용어

| 용어 | 뜻 |
|---|---|
| **식단 기록** `MealEntry` | 한 끼 — 언제(eatenAt)·어느 끼니(slot)·어디서(placeId 스냅샷)·무엇을(items) 먹었는지. 사진 0~N장 |
| **끼니** `slot` | `breakfast / lunch / dinner / snack / late_night`. 시각으로 자동 추정(05–10 아침, 11–14 점심, 17–21 저녁, 22–04 야식, 그 외 간식), 수정 가능 |
| **음식 항목** `MealItem` | 기록 속 음식 하나 — 이름 + (선택) 카탈로그 매칭 + 분류 스냅샷 + 주식/반찬 구분 + 양(서수) |
| **음식 카탈로그** `FoodItem` | 음식 마스터 — 이름·별칭·분류 2축·주재료·1인분 영양(선택)·출처 |
| **분류 2축** | `dishType`(조리형태 — **식약처 식품대분류 25종을 축약**: 밥·죽 / 면·만두 / 국·탕 / 찌개·전골 / 구이 / 볶음 / 조림 / 찜 / 전·부침 / 튀김 / 나물·숙채 / 생채·무침 / 김치·절임·젓갈 / 회·초밥 / 빵·과자·떡 / 유제품·빙과 / 음료·차 / 주류 / 기타) × `mainIngredient`(주재료: 소·돼지·닭·오리양·생선·해산물·채소·두부콩·계란·유제품·곡물·과일·기타) + `cuisine`(한식·중식·일식·양식·동남아·분식패스트푸드·기타). "골고루"는 이 축들의 분포로 정의한다 |
| **추천** `MealRecommendation` | 다음 끼니 후보 3~5개 + 이유 + 요청 컨텍스트 + 프로필 스냅샷 + 피드백 |
| **선호 설정** `MealPreference` | 사용자당 1행 — 중요도 가중치·제외 음식·식사 유형·기록 대상 끼니 |

기존 택소노미 v3(`고기/해산물/밥/면/국·탕/…` 15루트, `GlobalMenuCanonical.categoryPath`)는 **재료·메뉴군이 한 축에 섞인 체계**라 "골고루"의 근거로 쓰기 애매하다. 카탈로그 시드 때 `categoryPath` → 2축으로 **매핑 테이블 + LLM 배치 분류**로 옮기고, 이후 기준은 2축으로 통일한다.

## 데이터 소스

> 2026-08-22 실측(페이지·샘플 호출·CSV 집계) 기준. 0차 프로브(`probe:food-api`)로 필드·건수를 다시 확정한 뒤 갱신한다.

| 용도 | 소스 | 접근 | 규모·필드 | 라이선스·한도 | 판정 |
|---|---|---|---|---|---|
| **음식 마스터**(이름·5단계 분류·1인분 중량·영양) | 식약처 **전국통합식품영양성분정보(음식) 표준데이터** — data.go.kr **15100070** | `https://api.data.go.kr/openapi/tn_pubr_public_nutri_food_info_api?serviceKey&pageNo&numOfRows(≤1000)&type=json` (+ 모든 컬럼 필터 가능, CSV 파일도 제공) | **19,495행**, 식품대분류 25종, 대표식품명 1,249, 중분류 320. 필드 `foodCd, foodNm, foodLv3Nm(대분류), foodLv4Nm(대표식품), foodLv5Nm(중분류), foodOriginNm(식품기원), nutConSrtrQua(기준량 100g/ml), enerc, prot, fatce, chocdf, sugar, nat, …, foodSize(1인분 중량, 19,483행 채움)`. **`1인분 참고량` 컬럼은 전부 공란 → `foodSize` × 100g 영양으로 환산** | 이용허락 제한 없음, 개발계정 10,000/일, 자동승인 | **1순위 시드**. 단 74%가 프랜차이즈 메뉴(빵·과자 8,600 / 음료·차 5,776 / 유제품 663 — 피자 4,692행·커피 1,825행) → **한식 요리류 18개 대분류만 추리면 4,447행 / 대표식품 1,094 / 식품명 2,248**. 카탈로그는 `대표식품명`(+`식품기원` 가정식·급식·외식 산출) 기준으로 축약, 변형 `식품명`은 별칭 |
| 음식 마스터(대안·검증용) | 식약처 **식품영양성분DB정보 API** — **15127578** | `https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02` (193필드, `DB_GRP_NM=음식` 필터) | 같은 K-FIND DB(≈27만, 음식 외 포함) | 제한 없음, 10,000/일, **운영단계는 심의승인** | 15100070 과 동일 DB — 필드 교차검증·누락 보강용. 구 API I0750/I2790 은 `ERROR-310`(폐기 추정) → 쓰지 않음 |
| **레시피·재료** | 식품안전나라 **조리식품의 레시피 DB** `COOKRCP01` | `http://openapi.foodsafetykorea.go.kr/api/{key}/COOKRCP01/json/{start}/{end}` (식품안전나라 키) | **1,156건**, `RCP_NM, RCP_PAT2(요리종류), RCP_WAY2(조리법), RCP_PARTS_DTLS(재료 문자열), INFO_ENG/CAR/PRO/FAT/NA, HASH_TAG, ATT_FILE_NO_MAIN(사진), MANUAL01~20` | 제한 없음, 1,000회/일·1회 1,000건(= 2콜이면 전량) | 재료 문자열 → `ingredientsJson`·`mainIngredient`, 대표 사진·조리법(간편함 가중치 근거) |
| 레시피·재료(구조화) | 농림수산식품교육문화정보원 **레시피 기본/재료/과정** (data.go.kr 15057205·15058981, 키는 data.mafra.go.kr) | `http://211.237.50.150:7080/openapi/{KEY}/json/Grid_20150827000000000226_1/{s}/{e}` (재료 `…227_1`, 과정 `…228_1`) — **평문 HTTP·IP** | 기본 **537** / 재료 **6,104**(주재료·부재료·양념 구분) / 과정 3,022. `TY_NM(밥·국…), NATION_NM, COOKING_TIME, LEVEL_NM, IRDNT_TY_NM` | 제한 없음, 기능별 1,000/일 | 537건뿐이지만 **주재료 라벨이 구조화**돼 `mainIngredient` 규칙 학습·검증용. 서버 배치 수집만(앱 직접 호출 금지) |
| 한식명 **별칭(로마자·영문·중·일)** + 25개 카테고리 | 한식진흥원 **한식메뉴 외국어표기 800선** — data.go.kr **15129784** | XLSX 수동 다운로드(1회성, 2023-06 기준) | 800행: 요리명·카테고리(구이 78·밥 71·탕 55·찜 55·면 54·전 54·볶음 51·국 49…)·로마자·영어·일본어·중문 | 제한 없음 | **LLM 이 영문/로마자로 답할 때 매핑용 별칭 사전** + dishType 교차검증 |
| 외식 메뉴 어휘 | 기존 `global_menu_canonicals` (~6,600, 100% `categoryPath` 택소노미 v3) | 로컬 DB | 리뷰 언급 어휘 — `기타` 19%, 오타(`깅치`) 포함 | — | `restaurantCount ≥ 2` 등 필터 후 **별칭·인기도(popularity)** 로 합류. 카탈로그에 없는 외식 메뉴(마라탕·부대찌개 변형 등) 보강 |
| 식당별 메뉴 | `Restaurant.snapshotJson.menus` (286식당 4,941행; `restaurant_menus` 테이블은 336행·읽는 곳 없음) | 로컬 DB | — | — | 장소 연결 시 **인식 힌트**(영수증 `menuNames` 패턴)·자동완성·외식 후보 |
| 음식 사진 **평가셋** | 사용자 본인 사진 30~100장 (+선택 AI Hub 「한국 이미지(음식)」150종 15만장 / 「음식 이미지 및 영양정보」400종 84만장) | 로컬 폴더 | — | AI Hub 는 내국인 본인인증·신청 승인·분할 다운로드 리드타임 | 본인 사진 우선, AI Hub 클래스명은 정확도 평가 라벨로만 |
| (제외) | 농진청 메뉴젠 API(15143502) — 재료 구조화 우수하나 **공공저작물 4유형(상업 이용 금지)** / 만개의레시피 — 약관상 재이용·영리 금지 + AI 봇 Disallow / CAN-Pro — 상용 / Open Food Facts KR — 포장 가공식품 3,179건뿐 / Wikidata — 한식 50~67건 | | | | 라이선스·커버리지로 제외 |

**결정적 차이 (지하철·버스 때와 비교)** — 음식 DB 는 **배치 적재 후 로컬 검색**(요청 경로 외부 호출 0)이다. 실시간 어댑터·마이크로캐시·쿼터 게이트는 필요 없고, `load-life-*` 류 **적재 파이프라인 + 어드민 잡**이면 된다. 외부 호출 어댑터는 **에어코리아 어댑터 패턴**(`pageNo/numOfRows`, `callAllPages`, `toServiceKeyPart`, `fetchUrl/requestUrl` 이중 빌드, 20s 타임아웃, 응답 본문 코드로 에러 분류)을 그대로 이식한다 — odcloud(`page/perPage`)가 아님에 주의.

**카탈로그 시드 전략(1차)**: ① 15100070 음식 → 한식 요리류 18개 대분류 + 식품기원(가정식·급식·외식 산출·분석) 우선, 프랜차이즈 행은 `대표식품명` 단위로 축약(피자·커피 변형 수천 행 → 수십 종) ② `COOKRCP01` 1,156 + MAFRA 537 로 재료·조리법 보강(이름 `nameNorm` 매칭으로 병합) ③ 800선으로 별칭·카테고리 보강 ④ `global_menu_canonicals` 필터분을 별칭·인기도로 합류(신규 외식 메뉴는 `source:'menu-canonical'` 행 추가) ⑤ LLM 배치로 `mainIngredient`·`cuisine` 채우고 `dishType` 은 식품대분류 매핑 테이블 우선, 없을 때만 LLM. 예상 규모 **2~4천 종**(표시명 기준) — 자동완성·추천 후보 풀로 충분한 크기.

## 사전 준비 (사용자 액션)

- [ ] data.go.kr 에서 **전국통합식품영양성분정보(음식) 표준데이터(15100070)** 활용신청(자동승인) → `DATA_GO_KR_API_KEY` 계정 키 그대로(계정당 1키, 데이터셋별 활용신청). 별도 계정이면 `DATA_GO_KR_API_KEY=`. (선택) 15127578 식품영양성분DB정보 API 도 신청해 두면 교차검증 가능
- [ ] 식품안전나라(foodsafetykorea.go.kr) OpenAPI 키 발급 → `FOOD_RECIPE_API_KEY=` (COOKRCP01, 1차 시드 ②에 필요)
- [ ] (선택) data.mafra.go.kr 가입 → 레시피 재료 API 키 `MAFRA_API_KEY=` (주재료 구조화 537건 — 없어도 진행 가능)
- [ ] 한식메뉴 외국어표기 800선 XLSX(15129784) 수동 다운로드 → `data/open/` (gitignore)
- [ ] **Ollama Cloud 플랜 확인** — Free 는 동시 1모델·"light usage"(5시간 세션 + 주간 한도). 비전+텍스트 두 purpose 를 쓰면 **Pro($20/월, 동시 3) 권장**
- [ ] 비전 모델 1차 선택: 기본 **`gemma4:31b`**(usage Low, 한국어 양호), 비교군 **`qwen3.5:397b`**(비전·OCR 최강, usage Medium). 추천(text) 모델은 chat 계열에서 선택(`gpt-oss:120b` / `deepseek-v4-flash` / `glm-5.x`). *기존 `qwen3-vl:235b`, `gemma3` 는 cloud 에서 은퇴됨 — 현 `image` purpose 설정값 점검 필요*
- [ ] 앱 `app.config.ts` 의 `expo-image-picker` 권한 문구가 **영수증 전용**("영수증 사진을 첨부하기 위해…") → 식단 포함 문구로 변경 후 `prebuild`/재빌드(iOS·Android)
- [ ] 평가용 음식 사진 30~100장 (단품 / 반찬 많은 백반 / 찌개·국·탕 유사군 / 분식 / 배달 용기)
- [ ] 위 **보강 결정 A~I** 확인

---

## 아키텍처 개요

### 모듈 구조

```
apps/friendly/src/modules/
  food/                              # 음식 카탈로그(마스터) + 적재 잡 + 검색/매칭
    food.route.ts                    # 사용자: GET /food/search  ·  어드민: items CRUD, import config/run/runs/events, unmatched
    food.service.ts                  # 검색(nameNorm·별칭·bigram) + matchFood(name) → {foodId, score} | null
    food-import.service.ts           # 소스별 fetchAll(15100070 / COOKRCP01 / MAFRA / 800선 XLSX / menu-canonical) → normalize(순수, 리포트 반환) → upsert(source,sourceId) + FoodImportRun
    food-import-registry.ts          # random-crawl-registry 복제(활성 런 슬롯·SSE 구독·abort)
    food-classify.service.ts         # LLM 배치 분류(dishType/mainIngredient/cuisine) — global-merge 청크 패턴, FOOD_CLASSIFY_VERSION
    food.prompts.ts
    food-api.adapter.ts              # data.go.kr 클라이언트(에어코리아 어댑터 이식: toServiceKeyPart, fetchUrl/requestUrl 이중 빌드, 20s, pageNo/numOfRows≤1000, totalCount+짧은 페이지 종료, 본문 코드 22/30/31 → 503) + COOKRCP01/MAFRA 호출기
    *.test.ts, __fixtures__/
  meal/                              # 식단 기록(사용자) + 사진 + 통계 + 선호 설정
    meal.route.ts                    # entries CRUD/list/calendar/stats · preference GET/PUT · photos upload/preview/delete
    meal.service.ts
    meal-photo.service.ts            # 저장(sharp 정규화·EXIF 제거·썸네일)/삭제/고아 GC — settlement-extraction storeImage 이식
    meal-stats.service.ts            # 기간 집계(빈도·분포·겹침·연속) — 순수 함수 + SQL
    meal-preference.service.ts
  meal-recognition/                  # 사진 → 음식 후보 (vision LLM)
    meal-recognition.route.ts        # POST /meals/recognize { photoTokens[], placeId?, eatenAt? }
    meal-recognition.service.ts      # (선택) 2단계 서술→JSON, zod, 수리 재시도, 카탈로그 매칭 부착
    meal-recognition.prompts.ts      # MEAL_RECOGNITION_VERSION
  meal-recommendation/               # 다음 끼니 추천 (text LLM)
    meal-recommendation.route.ts     # POST /meals/recommendations · GET list/:id · POST :id/feedback
    meal-pattern.service.ts          # 결정적 패턴 분석(프로필·후보 풀·점수) — 순수 함수 위주(테스트 핵심)
    meal-recommendation.service.ts
    meal-recommendation.prompts.ts   # MEAL_RECOMMENDATION_VERSION
apps/friendly/src/plugins/food-import.ts   # app.decorate('foodImport') + bootstrap/shutdown (random-crawl 플러그인 복제)
apps/friendly/scripts/
  probe-food-api.ts                  # 0차 — 15100070·COOKRCP01·MAFRA 실응답(필드·건수·numOfRows 상한·대분류 분포) 확정 → __fixtures__
  load-food-catalog.ts               # CLI 적재(--dry-run, --source=nutrition|recipe|mafra|hansik800|menu-canonical, --classify) — 어드민 잡과 같은 서비스 호출
  probe-meal-vision.ts               # 폴더 사진 × 모델 N개 × (1단계/2단계) raw 출력 비교
  eval-meal-recognition.ts           # MEAL_RECOGNITION_DEBUG 덤프 + 라벨 집계 (eval-extraction 패턴)
```

- **적재 잡은 `schedule` 모듈 확장이 아니라 `random-crawl` 패턴의 독립 모듈**이다. `schedule.service` 는 `JOB_TYPE` 상수가 10여 곳에 박힌 단일 잡이고 `scheduleRegistry.beginRun()` 은 전역 단일 슬롯이라, 음식 적재가 야간 normalize-merge 와 서로 skip 시킨다. cron 타이머(`scheduleRegistry.setCron/clearCron/nextRun`)만 빌려 쓰고, 활성 런·SSE 는 자체 레지스트리.
- 플러그인 autoload 알파벳 순서 함정: `app.aiConfig` 는 `summaries` 플러그인이 decorate → `food-import` 플러그인은 그보다 먼저 로드되므로 `AiConfigService` 를 **직접 생성**한다(`plugins/schedule.ts:20-30` 과 동일).

### 계약·공유 패키지

| 패키지 | 추가 |
|---|---|
| `@repo/api-contract` | `schemas/food.ts`(FoodItem·검색·import config/run/events·unmatched), `schemas/meal.ts`(Entry·Item·Photo·Preference·Stats·Recognize·Recommendation·Feedback), `routes.ts` 에 `Food`·`Meal` 네임스페이스, `LlmProviderPurpose` += `meal-photo`·`meal-recommend`, `OperationFeature` += `food-import`·`meal-recognition`·`meal-recommendation` |
| `@repo/shared` | `api/food.api.ts`·`api/meal.api.ts`(업로드는 `ReceiptUploadFile` 유니온 — `Blob | {uri,name,type}` — 그대로), hooks `useFoodSearch`·`useMeals`(list/calendar/one/create/update/remove)·`useMealStats`·`useMealPreference`·`useMealRecognize`·`useMealRecommendation`·`useMealPhotoUrl`(웹 objectURL / RN data URL — `useReceiptPreviewUrl` 일반화), store `mealDraftStore`(`createInjectableStorage({web:'session'})`, 앱은 `api-setup.ts` 에 `setMealDraftStorage(AsyncStorage)` 1줄), `index.ts` 3줄 |
| `@repo/utils` | `mealSlot.ts`(slot 추정·라벨·정렬), `foodTaxonomy.ts`(2축 상수·라벨·색), `aiModel.ts` `recommendModelForPurpose` 에 두 purpose 분기(`meal-photo` → vision, `meal-recommend` → text) |

앱에는 테스트 하니스가 없으므로(**vitest 없음**) 집계·슬롯 추정·드래프트 스토어·훅 등 **로직은 전부 shared/utils 에 두고 거기서 테스트**한다(정산이 간 길).

### Prisma (초안 — 1차에 확정)

```prisma
model FoodItem {                       // 음식 카탈로그
  id              String  @id @default(cuid())
  name            String                         // 표시명 "김치찌개"
  nameNorm        String                         // normalizeTerm(name) — 매칭 키
  aliasesJson     String  @default("[]")         // ["김치찌게","묵은지김치찌개"] — nameNorm 배열
  dishType        String?                        // 2축 분류 (아래 enum 은 zod 가 진실)
  mainIngredient  String?
  cuisine         String?
  ingredientsJson String?                        // ["돼지고기","김치","두부"]
  servingG        Float?                         // 1인분 g (영양 DB)
  kcal Float?  carbG Float?  proteinG Float?  fatG Float?  sodiumMg Float?  sugarG Float?
  repName         String?                        // 대표식품명(15100070 foodLv4Nm) — 변형 축약 키
  sourceCategory  String?                        // 원본 분류명(식품대분류 / RCP_PAT2 / 800선 카테고리 / categoryPath)
  source          String                         // 'mfds-nutrition' | 'mfds-recipe' | 'mafra-recipe' | 'hansik-800' | 'menu-canonical' | 'manual'
  sourceId        String?                        // foodCd / RCP_SEQ / RECIPE_ID / 요리번호 / globalKey
  popularity      Int     @default(0)            // 외식 등장 식당 수·언급 수 — 후보 풀 가중
  active          Boolean @default(true)         // 어드민 비활성(노이즈)
  classifyVersion Int?     classifyModel String?
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt
  @@unique([source, sourceId])
  @@index([nameNorm])  @@index([dishType, mainIngredient])  @@index([active, popularity])
  @@map("food_items")
}
model FoodImportConfig { jobType String @unique … }   // RandomCrawlConfig 복제 (enabled/cronExpr/timezone/lastRunAt/lastStatus)
model FoodImportRun    { … trigger/status/phase/totalCount/insertedCount/updatedCount/skippedCount/error … @@map("food_import_runs") }

model MealEntry {
  id        String   @id @default(cuid())
  userId    String
  eatenAt   DateTime                              // UTC
  eatenDate String                                // 'YYYY-MM-DD' 사용자 로컬 — 달력·통계 그룹 키
  slot      String                                // breakfast|lunch|dinner|snack|late_night
  mealType  String?                               // home|dining_out|delivery|convenience|other
  placeId   String?   placeName String?           // 맛집 스냅샷 (FK 없음)
  memo      String?
  source    String                                // photo|manual|recommendation
  recognitionJson String?                         // {model, version, dishes:[…원본 후보…]} — 확정 후 보존(품질 측정)
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt
  user   User        @relation(fields:[userId], references:[id], onDelete: Cascade)
  items  MealItem[]  photos MealPhoto[]
  @@index([userId, eatenAt])  @@index([userId, eatenDate])
  @@map("meal_entries")
}
model MealItem {
  id String @id @default(cuid())
  entryId String
  name String   nameNorm String
  foodId String?                                  // FoodItem.id 스냅샷 (FK 없음 — 카탈로그 재적재에 안전)
  dishType String?  mainIngredient String?  cuisine String?   // 확정 시점 분류 스냅샷
  portion String?                                 // small|normal|large
  isMain  Boolean @default(true)                  // false = 반찬/곁들임
  confidence Float?                               // 인식 confidence (수동이면 null)
  source  String                                  // recognized|manual|catalog|recommendation
  sortOrder Int
  entry MealEntry @relation(fields:[entryId], references:[id], onDelete: Cascade)
  @@index([entryId])  @@index([nameNorm])
  @@map("meal_items")
}
model MealPhoto { id, entryId(Cascade), token String @unique, width, height, byteSize, sortOrder, createdAt  @@map("meal_photos") }
model MealPreference {
  userId String @id                               // AirUserLocation 과 같은 "사용자당 1행, PUT 덮어쓰기"
  weightsJson       String                        // {variety:4,taste:4,balance:3,health:2,novelty:2,weather:1,convenience:2} 0~5
  excludedFoodsJson String @default("[]")         // 못 먹는/싫어하는 음식명·분류 키
  likedFoodsJson    String @default("[]")         // 명시 선호
  mealTypesJson     String @default("[]")         // 주 식사 유형
  slotsJson         String @default("[\"breakfast\",\"lunch\",\"dinner\"]")  // 기록·추천 대상 끼니
  onboarded Boolean @default(false)  updatedAt DateTime @updatedAt
  user User @relation(fields:[userId], references:[id], onDelete: Cascade)
  @@map("meal_preferences")
}
model MealRecommendation {
  id String @id @default(cuid())
  userId String
  targetDate String   targetSlot String
  contextJson  String                             // {mealType?, weather?, location?, note?}
  profileJson  String                             // LLM 에 준 프로필 스냅샷(재현용)
  resultJson   String                             // [{name, foodId?, reason, tags, score}] + summary
  model String?  promptVersion Int  status String // done|fallback|failed
  feedbackJson String?                            // {pickedName?, rating?, eatenEntryId?}
  createdAt DateTime @default(now())
  user User @relation(fields:[userId], references:[id], onDelete: Cascade)
  @@index([userId, createdAt])  @@index([userId, targetDate, targetSlot])
  @@map("meal_recommendations")
}
```

관례 준수: 모델 PascalCase 단수 + `@@map` snake 복수, 컬럼 camelCase, JSON 은 `*Json` String, enum 은 zod 가 진실, User 관계 `onDelete: Cascade`. 마이그레이션 2개(`add_food_catalog`, `add_meal_log`)로 분리해 차수별 배포.

### 라우트 (`Routes.Food`, `Routes.Meal` — 전부 `/api/v1` 하위)

| 구분 | 메서드·경로 | 가드 | 비고 |
|---|---|---|---|
| 카탈로그 검색 | `GET /food/search?q=&limit=` | `authenticate` + `RATE.foodSearch` | nameNorm prefix + 별칭 + bigram 유사도, `active` 만 |
| 카탈로그 어드민 | `GET/PATCH /admin/food/items…`, `GET /admin/food/unmatched` | admin | 별칭·분류·비활성, 사용자 미매칭 상위 음식명 |
| 적재 잡 | `GET/PUT /admin/food/import/config`, `POST …/run`, `GET …/runs`, `GET …/events`(SSE), `POST …/preview` | admin (SSE 는 `resolveSseAdmin`) | `Routes.RandomCrawl` 5경로 복제 |
| 사진 | `POST /meals/photos`(multipart `file`), `GET /meals/photos/:token`, `GET …/:token/thumb`, `DELETE …/:token` | `authenticate` + 소유 검증 | 토큰 서버 발급 uuid, preview 는 JWT(`<img src>` 직접 불가 → 훅) |
| 인식 | `POST /meals/recognize { photoTokens[1..5], placeId?, eatenAt? }` | `authenticate` + `RATE.mealRecognize` + 일일 한도 | 동기 HTTP(영수증과 동일), 60s |
| 기록 | `GET /meals?from&to&slot&cursor`, `GET /meals/calendar?month=`, `GET /meals/:id`, `POST /meals`, `PATCH /meals/:id`, `DELETE /meals/:id` | `authenticate` | 소유자만 |
| 통계 | `GET /meals/stats?from&to` | `authenticate` | 분포·top·겹침·연속·끼니별 |
| 선호 | `GET/PUT /meals/preference` | `authenticate` | 1행 덮어쓰기 |
| 추천 | `POST /meals/recommendations { targetDate, targetSlot, context?, force? }`, `GET /meals/recommendations?limit=`, `POST /meals/recommendations/:id/feedback` | `authenticate` + `RATE.mealRecommend` + 일일 한도 | 같은 날·끼니·프로필 해시면 캐시 재사용(`force` 시만 재호출) |

공개(무인증) 표면은 **없다**(이 도메인은 전부 개인 데이터). 새 RATE 프리셋 3개를 `plugins/rate-limit.ts` 에 추가.

---

## LLM 설계

### purpose·모델
- `meal-photo`(vision): 기본 `gemma4:31b`, 비교 `qwen3.5:397b`. 어드민 AI 키 페이지에 행 추가(`PURPOSE_ORDER`/`PURPOSE_META`), env 기본값 `OLLAMA_MEAL_PHOTO_MODEL`.
- `meal-recommend`(text): `OLLAMA_MEAL_RECOMMEND_MODEL`. 사고(thinking) 모델은 지연만 늘리므로 `think:false`(gpt-oss 는 `'low'`).
- `meal-supplement`(text, 2026-10-04): 영양제 조언. 기본 `kimi-k3`(`OLLAMA_MEAL_SUPPLEMENT_MODEL`) — 가끔 보는 리포트라 지연보다 구체성. 어드민 '추론' 선택을 읽는다(kimi 전용, 사주(C)와 같은 배수로 출력 예산·타임아웃을 키움).
- 새 purpose 추가 시 건드릴 곳(확인됨): `schemas/ai.ts` enum · `config/env.ts` + `.env.example` · `ai.config.service.ts ALL_PURPOSES` · **`LlmProviderEnv.defaultModels` 리터럴 9곳 + 테스트 픽스처**(→ `buildLlmProviderEnv()` 헬퍼로 1곳에 모으는 리팩터를 1차에 같이) · `utils/aiModel.ts recommendModelForPurpose` · `AdminAiKeysPage PURPOSE_META`. `AdapterCache MAX_ENTRIES` 는 purpose 9개가 되며 8 → 16(2026-10-04, 상한에 닿으면 삽입 순으로 chat 부터 밀려났다).

### 인식(사진 → 음식)
- 호출: `provider.complete({ images:[b64…], systemPrompt, prompt, temperature:0, maxTokens:2000, numCtx:8192, format:'json', signal })` — `AiConfigService.getResolved('ollama-cloud','meal-photo')` + `adapterCache.get()`.
- 프롬프트 원칙: **한국어 정식 명칭 우선**(중·일식 표기 금지, 로마자 병기 선택), 모르면 `unknown`, 음식당 후보 1~3 + confidence, **반찬은 `isMain:false` 로 분리**, 양은 서수(`small|normal|large`; 질량 추정은 신뢰 불가), 음료·술 표시, 사진 여러 장이면 사진 인덱스 포함, 장소 힌트(식당 등록 메뉴 목록) 주입 — 영수증 `buildExtractionUserPrompt` 의 `menuNames` 패턴.
- 출력 스키마(zod, 프롬프트에 내장): `{ photos:[{ index, dishes:[{ name, candidates:[{name,confidence}], confidence, isMain, portion, isDrink, category? }] }], overallCuisine?, notes? }`.
- **2단계 모드**(반찬 많은 백반 대응): 1) 자유 서술로 "보이는 음식 전부 + 위치" 2) 같은 모델(또는 `meal-recommend` 텍스트 모델)로 JSON 화. `MEAL_RECOGNITION_TWO_STEP` env/설정 플래그로 A/B. 기본은 1단계(≤3 음식), 음식 수 ≥4 감지 시 2단계로 에스컬레이션 검토.
- 후처리: `extractFirstJsonObject` → zod → 실패 시 **수리 재시도 1회**(원문 + 오류를 붙여 "JSON 만" 요구) → 그래도 실패면 `parse_failed`(사용자는 수동 입력으로 자연 전환). 각 dish 에 `food.service.matchFood(name)`(nameNorm 정확 → 별칭 → bigram ≥ 임계)로 `foodId`·분류 스냅샷 부착, 미매칭은 `foodId:null`(통계는 `nameNorm` 기준).
- 디버그·평가: `MEAL_RECOGNITION_DEBUG=1` → `data/meal-recognition-debug/*.json` 덤프, `eval:meal-recognition` 으로 파싱 실패율·unknown 비율·top-1/후보 적중률(라벨 있을 때) 집계. `probe:meal-vision` 으로 모델·모드 비교.

### 추천(패턴 → 다음 끼니)
1. **패턴 프로필(코드, `meal-pattern.service.ts`)** — 최근 7/14/30/90일에서: 음식·dishType·mainIngredient·cuisine 빈도(시간 감쇠), 최근 7일 끼니별 음식명 목록, 같은 음식 마지막 섭취 경과일, 연속·주간 중복 횟수, 끼니별 습관(아침엔 빵/커피 등), 요일 패턴, 피드백(👍/👎/먹었어요)에서 나온 명시 선호, 제외 목록, 가중치, 컨텍스트(끼니·요일·날씨(기존 weather 모듈: 기온·강수)·식사 유형·위치).
2. **후보 풀(코드)** — 30~50개: 사용자 이력 음식(취향) + 좋아요 + 카탈로그 인기(active, popularity) + 탐험용 미경험(novelty 가중치에 비례) + (외식이면) 근처 식당 메뉴 상위. 제외·알레르기 제거. 각 후보에 **결정적 점수** `score = Σ weight_k · feature_k`(recencyPenalty·frequencyAffinity·categoryBalance·healthPenalty·noveltyBonus·weatherFit·convenienceFit).
3. **LLM(`meal-recommend`)** — 프로필 요약 + 후보 풀(이름·분류·점수·마지막 섭취)을 주고 "3~5개 고르고 각 1~2문장 이유, 한 줄 총평"을 JSON 으로. **후보 풀 밖 이름은 검증에서 드롭**, 제외 위반 드롭, 부족분은 점수 순으로 채움. 실패·미설정(`no_provider`) 시 **폴백 = 점수 상위 + 템플릿 이유**(`status:'fallback'` 표시).
4. 결과 저장(`MealRecommendation`) → 화면에서 "이거 먹었어요"(→ `source:'recommendation'` 기록 생성 + 피드백) / 👍👎 / "다시 추천"(`force`).
5. 콜드 스타트: 기록 0~3건이면 온보딩 설문(좋아하는 분류 3개·못 먹는 것·주 식사 유형) + 카탈로그 인기 기반. 기록이 쌓일수록 프로필 비중 증가.

### 중요도(가중치) 항목 — 제안

| 키 | 라벨 | 추천에 미치는 영향 | 기본 |
|---|---|---|---|
| `variety` | 겹침 피하기 | 최근 N일 먹은 음식(강)·같은 dishType/주재료(약) 감점. "겹치지 않게"의 본체 | 4 |
| `taste` | 내 취향 | 자주 먹고 👍 한 음식·분류 가점 (variety 와 긴장 → 두 슬라이더 비율이 "익숙함 vs 새로움" 균형) | 4 |
| `balance` | 골고루 | 주간 dishType × 주재료 × cuisine 분포가 고르게 — 적게 먹은 축 가점 | 3 |
| `health` | 건강 | 튀김·야식·고나트륨·술 빈도 억제, 채소·단백질 비중 (영양 DB 있으면 수치, 없으면 분류 규칙) | 2 |
| `novelty` | 새로운 시도 | 안 먹어본 카탈로그 음식 일부 포함(탐험 비율) | 2 |
| `weather` | 날씨·계절 | 기온·강수·계절 적합(더우면 냉면·차가운 것, 비 오면 국물·전) — weather 모듈 연동 | 1 |
| `convenience` | 간편함 | 집밥이면 조리 난이도, 외식·배달이면 접근성 | 2 |
| `budget` | 예산 (후순위) | 외식 메뉴 가격대(`snapshotJson` 가격) | 0 |

0~5 슬라이더 + 프리셋(**골고루 / 내 취향대로 / 가볍게·건강 / 새로운 도전**). 하드 제약(가중치 아님): 제외 음식·알레르기, 식사 유형, 기록 대상 끼니.

### 비용·운영 통제
- 일일 한도 per user(env 기본 인식 30회·추천 20회) → 초과 429 `daily_limit`. 추천은 **같은 날·끼니·프로필 해시 캐시**로 재호출 억제.
- 오플로그: `feature:'meal-recognition' | 'meal-recommendation'`, `trigger:'user'`(실패 자동 LLM 분석 제외), meta 화이트리스트(model·durationMs·dishCount·errorCode — 토큰·이미지·음식명·userId 금지). 적재 잡은 `feature:'food-import'`, 단계별 `log`.
- 텔레메트리·동시성 게이트·429 백오프는 `AdapterCache` 경유라 **자동**.

---

## 앱 (Expo) — 입력 UX

- 진입: `profile.tsx` `rows` 에 "식단" (로그인 시만) + 홈 상단 카드 "오늘 식단 n끼 · 다음 끼니 추천 보기" (`MyLocationCard` 패턴). 스택 화면: `app/meal/index.tsx`(목록·달력·통계 탭) · `app/meal/new.tsx`(**`.native.tsx` + `.web.tsx` 스텁** — Expo Web 은 "앱에서 입력") · `app/meal/[id].tsx` · `app/meal/recommend.tsx` · `app/meal/settings.tsx`. 화면 파일은 파라미터만, 로직은 `src/components/meal/`.
- 새 기록 흐름(`MealEntryEditor`): ① 사진 — 촬영/앨범(`allowsMultipleSelection:true, selectionLimit:5, quality:0.8, exif:true, preferredAssetRepresentationMode: Compatible`(HEIC→JPEG)) → EXIF `DateTimeOriginal` 로 `eatenAt` 기본 → 장당 순차 업로드(진행률) ② 인식 1회 호출 → ③ **편집 리스트**(`Step3Edit` 패턴): 인식 음식 칩(후보 탭 전환·삭제·반찬 토글·양), "+ 직접 추가"(카탈로그 자동완성 `useFoodSearch`, 없으면 자유 입력) ④ 끼니(자동 추정 수정)·시각·식사 유형·장소(`RestaurantPickerSheet` 재사용, 선택 시 인식 힌트로 재인식 버튼)·메모 ⑤ 저장. 인식 실패/미설정은 ③ 로 바로 진입(수동 입력). 진행 중 상태는 `mealDraftStore`(앱 종료 복원).
- 사진 없는 수동 입력·"추천 → 이거 먹었어요" 빠른 기록도 같은 에디터.
- 사진 표시: 썸네일/원본 모두 JWT → `useMealPhotoUrl` 훅(RN data URL), 원본은 `Lightbox` 재사용.

## 웹·앱 공통 화면 (조회·통계·추천·설정)

- 웹 `/me/meals`(`RequireUser`, `PublicLayout`, lazy) 안에 탭 **기록 / 통계 / 추천 / 설정**; 사이드바·상단바 NAV 추가(로그인 시). 앱 `app/meal/*` 는 같은 훅·같은 화면 구성(입력 버튼만 앱).
- 기록: 날짜별 타임라인(끼니 배지·사진 썸네일·음식 칩) + 월 달력(끼니 점), 상세(수정·삭제 — 앱은 사진 추가 가능).
- 통계(기간 주/월): dishType·주재료·cuisine 분포 막대, 가장 많이 먹은 음식 top, 연속·주간 중복, 끼니별 패턴, 추천 수락률. **차트 라이브러리 없음 관례 유지** — 웹 `AirHistoryChart` 식 SVG, 앱 `air/index.tsx` 식 View 막대.
- 추천: 끼니 선택 → 카드 3~5장(이름·이유·태그·근처 맛집 링크(5차)) → 👍👎/먹었어요/다시 추천, 과거 추천 목록.
- 설정: 가중치 슬라이더 + 프리셋, 제외·선호 음식(자동완성), 식사 유형, 기록 끼니, 온보딩 재실행.

## 어드민

- AI 키: purpose 행 2개(`meal-photo`·`meal-recommend`) — 모델 선택·테스트 기존 UI 그대로, 사용량 패널 자동.
- `/admin/food`: 카탈로그 검색·편집(이름·별칭·2축 분류·비활성), 적재 잡 섹션(`RandomCrawlSection` 패턴: 설정·cron·지금 실행·이력·SSE 진행), **미매칭 상위 음식명**(사용자 입력 중 `foodId:null` 빈도순 → 별칭 추가·신규 등록), LLM 분류 재실행(`FOOD_CLASSIFY_VERSION` 미만 행).
- 로그: `OperationFeature` 3종 추가 → `/admin/logs` 자동 노출.

## 쿼터·보안·프라이버시

- 업로드: 장당 5MB(현 multipart 한도), 서버 `sharp.rotate().resize(1600).jpeg()` + **EXIF(GPS 포함) 제거**(sharp 기본) + 썸네일 320px; HEIC 는 앱 `Compatible` + 서버 `heic-convert` 2중 방어 유지; 경로 `data/meal-photos/<userId>/<uuid>.jpg`(사용자 디렉터리 샤딩), 토큰 정규식 + `stat` 검증, **소유자 검증** 필수.
- 삭제: 기록 삭제 시 파일 unlink, 사용자 삭제 cascade + 파일 삭제, 고아 파일 GC(`MealPhoto` 에 없는 파일) 스크립트 + 주기. 영수증 파이프라인에 없던 부분 — 식단은 업로드 빈도가 훨씬 높다.
- 쿼터: RATE 프리셋 3개 + 일일 한도(인식·추천) + `MAX_PHOTOS_PER_ENTRY=5`, `MAX_ITEMS_PER_ENTRY=20`.
- 프롬프트 인젝션: 메모·음식명 등 사용자 텍스트는 길이 캡 + 구분자 이스케이프(`log-analysis` 의 `<logs>` 패턴), LLM 출력은 **후보 풀 화이트리스트**로만 채택.
- 개인정보: 식단 기록은 민감할 수 있음 → 공개·공유 표면 없음(1차), 오플로그·디버그 덤프에 식별자 금지, 디버그 덤프는 opt-in env.

---

## 차수별 로드맵

| 차수 | 범위 | 산출물 | 완료 기준 |
|---|---|---|---|
| **0차 프로브·결정** | 데이터·모델 실측 | `probe:food-api`(필드·건수·numOfRows 상한·대분류 분포) → `__fixtures__`; `probe:meal-vision`(본인 사진 30장 × gemma4/qwen3.5 × 1/2단계); 보강 결정 A~I 확인 | 적재 대상 필드 표 확정, 모델 1차 선택, 파싱 실패율 수치 |
| **1차 기반** | 계약·스키마·AI purpose·카탈로그 | `schemas/food.ts`·`meal.ts`·Routes; Prisma `add_food_catalog`; purpose 2개(+`buildLlmProviderEnv` 리팩터)·어드민 행; `food` 모듈(어댑터·적재 서비스·CLI·어드민 잡·SSE·검색·matchFood); 시드 ①15100070 한식 요리류 축약 → ②COOKRCP01/MAFRA 재료 → ③800선 별칭 → ④menu-canonical 필터 합류 → ⑤LLM 2축 분류 배치; `/admin/food` | 카탈로그 2~4천 종 적재·검색 응답, `dishType` 커버리지 100%(매핑 테이블)·`mainIngredient` ≥ 90%, 테스트(normalize·match·route, 픽스처 기반) |
| **2차 앱 입력** | 사진 → 기록 | Prisma `add_meal_log`; `meal`·`meal-recognition` 모듈(사진 저장·인식·기록 CRUD); shared api/hooks/draft store; 앱 `meal/new`·`[id]`·목록 최소; 권한 문구·prebuild | iOS·Android 에서 사진 5장 → 인식 → 편집 → 저장 → 목록 확인, HEIC·RN FormData 회귀 없음 |
| **3차 조회·통계** | 웹+앱 동일 | `meal-stats`; 웹 `/me/meals` 기록·달력·통계, 앱 동일 탭; `useMealPhotoUrl`; 삭제·수정 | 웹·앱 같은 데이터로 같은 화면, 통계 순수 함수 테스트 |
| **4차 추천** | 설정·패턴·LLM·피드백 | `MealPreference` API+UI(웹·앱), `meal-pattern`(순수 함수+테스트), `meal-recommendation`(LLM+검증+폴백+캐시), 피드백·"먹었어요" 기록, 온보딩 | 기록 10건 이상 사용자에게 추천 3~5개 + 이유, LLM 꺼도 폴백 동작, 후보 풀 밖 이름 0 |
| **5차 고도화** | 연동·품질 | 날씨 컨텍스트, 추천 음식 → 근처 맛집(`MenuCanonical` 역검색 + 위치), 끼니 시간 로컬 알림(`expo-notifications` 기존), 2단계 인식 A/B, `eval:meal-recognition` 라벨셋, 미매칭→별칭 운영 루프 | 평가셋 top-1/후보 적중률 보고, 맛집 연결 동작 |
| **6차 운영** | 한도·GC·문서 | 일일 한도·RATE·파일 GC·보존, 테스트 보강(shared/web/friendly), `.env.example`·deploy 문서, 위키 토픽 `meal`/`food` 컴파일 | lint/typecheck/test green, 운영 체크리스트 |

각 차수는 승인 후 착수, 차수 끝마다 실화면 확인(정산·지하철과 같은 진행 방식).

## 리스크·열린 질문

| 항목 | 영향 | 대응 |
|---|---|---|
| Ollama Cloud 구조화 출력 미지원 | JSON 파싱 실패 | 스키마 프롬프트 내장 + `format:'json'` + 수리 재시도 + 0차에서 실패율 실측. 영수증도 같은 조건이라 선례 있음 |
| 비전 모델의 한식 세부 구분(찌개/국/탕, 볶음/조림, 반찬 다수) | 오인식 | 후보 제시 UX(사용자가 탭으로 고름), 장소 힌트 주입, 2단계 모드, 평가셋으로 모델 선택 |
| Free 플랜 동시 1모델·세션 한도 | 429·큐 대기 | 계정 게이트 429 백오프 존재, 일일 한도, Pro 권장 |
| 카탈로그 노이즈(리뷰 어휘) | 이상한 추천·자동완성 | 시드 필터 + `active` + 어드민 큐레이션 + 미매칭 루프 |
| 시간대·날짜 경계 | 달력 오표시 | 클라이언트가 `eatenAt`(UTC)+`eatenDate`(로컬) 둘 다 전송, 서버는 `eatenDate` 형식만 검증 |
| 다중 사진 업로드 순차 지연 | 입력 UX | 업로드와 인식 분리, 진행률 표시; 필요 시 multipart `files` 한도 상향은 별도 결정 |
| 추천 품질 주관성 | 만족도 | 피드백 로그로 수락률 측정, 가중치 프리셋, 이유 설명 필수 |
| 개인정보(식단·사진) | 신뢰 | 공개 표면 없음, EXIF 제거, 소유자 검증, 로그 식별자 금지 |

**사용자 확인이 필요한 것**: 보강 결정 A~I, 중요도 항목 구성(§중요도), 슬러그 `meal/food`, Ollama 플랜, 적재 소스 우선순위(영양 DB → 레시피 → 메뉴 어휘), 추천 카드 수(기본 3).

---

## 진행 기록

- **2026-10-23 — 웹 사진 넣기·인식(2단계) + 촬영 시각**: 사용자 요청 "웹에서도 사진 올리면 인식" → 검토 의견(서버·shared 는 이미 웹을 지원, 작업은 웹 입력 화면) 뒤 사용자 결정: ① 수정 화면에서도 사진 추가·빼기 ② 촬영 시각(EXIF)으로 먹은 시각 맞추기(3단계에서 당김) ③ 데스크톱 끌어다 놓기·붙여넣기. 업로드 전 브라우저 축소는 권장안대로.
  - **흐름(`useMealPhotoIntake`)**: 앱 Expo Web 경로와 같은 규칙 — 고르기·끌어다 놓기·붙여넣기 → 촬영 시각 반영 → 장마다 바로 올리기 → 다 올린 뒤 전체 사진으로 `replace-recognized` 인식. 웹은 파일을 draft 에 붙들 수 없어 앱의 업로드 대기열(pendingPhotos)이 없다 — 실패한 장은 안내하고 다시 넣게 한다(올라간 사진은 sessionStorage draft 에 남는다). 올리기·인식은 사진 준비 lease 안에서 해 저장이 끝나길 기다렸다가 사진·인식 원본을 함께 저장하고, 그동안 저장 버튼은 막는다. 시작 때 draft 세대가 바뀌었으면(취소·저장·계정 전환) 결과를 쓰지 않고 방금 올린 사진은 바로 지운다. 인식이 음식을 채우면 새 기록의 빈 첫 줄은 치운다.
  - **파일 손질(`mealPhotoFile.ts`)**: EXIF 는 의존성 없이 JPEG APP1 → IFD0/Exif IFD 를 직접 읽는다(DateTimeOriginal → DateTime, 앱과 같은 순서, 미래 시각은 버림). 긴 변 1,600px(서버 저장 크기)·1.5MB 를 넘거나 JPEG 가 아니면 캔버스로 JPEG 0.9 로 줄이고(EXIF 회전은 브라우저가 적용), 브라우저가 못 읽는 형식(데스크톱 Chrome 의 HEIC)은 원본 그대로 서버 변환에 맡기되 5MB 를 넘으면 올리지 않는다. 헤드리스 크로미움 실측: 4032×3024 12MB → 1600×1200 0.96MB(촬영 시각 읽음), Orientation=6 3200×1600 → 800×1600, 작은 JPEG 는 원본 유지.
  - **저장**: 새 기록은 사진 토큰·`recognition` 을 보내고 출처는 추천 > 사진(인식 또는 사진 있음) > manual(앱과 같음). **수정도 `photoTokens` 전체를 보낸다** — 서버가 받은 목록으로 갈아끼우고 빠진 사진을 지운다(기존 기록 사진은 draft 가 들고 연다). 음식 줄에 인식의 "다른 후보" 칩(둘까지, 고르면 `selectedCandidateRank`)을 더했다.
  - 테스트: web 450(+12: 입력 화면 6 — 인식·후보·저장 / EXIF / 붙여넣기·끌어다 놓기 / 실패·사진 아닌 파일 / 올리는 중 저장 막기·취소 시 삭제 / 수정 사진 교체, 파일 손질 6 — 기존 수정 테스트 1건은 photoTokens 기대로 교체). 웹 타입체크·lint·빌드 통과. **로그인한 실제 화면에서 업로드 → 인식은 미확인**(API 서버·비전 모델 필요).

- **2026-10-04 — 웹 식단 데스크톱 배치 1차(추천·영양·설정)**: 사용자 요청 "모바일에 최적화된 식단 페이지를 데스크톱에서도 잘 나오게" → 1440×900 실측(Aside): 모든 탭이 896px 한 단(`max-w-4xl`)이라 영양제 조언이 1,440px·설정 저장이 2,318px·추천 결과가 687px 아래, 기록은 첫 화면 4끼. 의견(데스크톱에서만 두 단 + 고정 패널, 탭바는 위 유지) 중 권장안 결정 — 범위는 영양·추천·설정부터, 기록 목록은 촘촘한 행.
  - lg(1024px↑)에서만 폭 `max-w-6xl`(날씨·바다·여행과 같음)과 두 단. 좁은 화면은 그대로(`lg:` 접두만), DOM 순서도 그대로 두고 그리드 자리만 바꿔 키보드·스크린리더 순서가 같다.
  - 영양: 점검 | 조언 두 단 → 조언 219px. 추천: 왼쪽 22rem(조건 + 최근 추천) | 오른쪽 결과(두 행에 걸침, 추천이 없으면 데스크톱에서만 안내 칸) → 결과 219px. 설정: 카드 2×2(중요도 | 먹는 것 / 영양 기준 | 내 데이터) → 페이지 2,386 → 1,440px, 그리고 바뀐 게 있으면 저장 줄을 화면 아래에 붙인다(좁은 화면도 — 형식 오류도 그 줄에).
  - 기록·달력은 다음 차수라 넓은 화면에서 본문만 896px 로 두고 왼쪽에 붙였다(오른쪽 빈자리가 필터·고른 날 패널 자리).
  - 검증: 1440·1024px(iframe)·390px(iframe) 배치 좌표 실측(가로 넘침은 공통 상단바 탓 — 날씨 페이지도 같음), 웹 테스트 173 통과. Aside 캡처가 시간 초과로 막혀 화면 사진 대신 좌표로 확인.
  - 다음: 2차 기록(필터·이번 주 요약 오른쪽 + 촘촘한 행)·달력(고른 날 패널, 칸에 kcal), 3차 입력·상세(두 단 + 저장 고정). 별개: 1024px 에서 공통 상단바가 87px 넘친다(전 페이지).
- **2026-10-04 — 웹 식단 데스크톱 배치 2·3차(상세·입력·수정·기록·달력, 공통 틀)**: 사용자 "목록에서 상세·수정에 들어가면 너비가 달라져 이질감" → 의견(같은 틀 + 같은 배치, 오른쪽은 늘 맥락·동작) → 진행. 상세·입력은 `max-w-2xl` 가운데 정렬이라 목록(1,104px)에서 넘어가면 제목이 약 250px 옮겨 가고 본문이 624px 로 줄었다.
  - 공통 틀 `routes/meal/mealLayout.ts`: 바깥 폭(`max-w-4xl lg:max-w-6xl`) + 두 단(왼쪽 본문 `minmax(0,1fr)` | 오른쪽 22rem 패널, 패널은 상단바 아래 sticky·화면보다 길면 패널 안 스크롤). 목록·상세·입력·수정이 모두 이 틀 — 1440px 에서 제목이 늘 x=161.
  - 짧은 상세와 긴 목록을 오갈 때 스크롤바가 생겼다 없어지며 7px 옮겨 가던 것: 식단 틀(`.meal-page`)이 있을 때만 `html:has(.meal-page) { scrollbar-gutter: stable }` — 지도처럼 화면을 꽉 채우는 페이지에 빈 줄이 생기지 않게 전역이 아니다.
  - 기록: 오른쪽 검색·필터 + 최근 7일(기록 끼니·하루 평균 kcal·연속, 데스크톱에서만 요청 — `useIsDesktopLg`), 왼쪽은 날짜 묶음 카드 안의 한 줄 행(끼니·시각·장소 | 음식 | kcal, 메모는 마우스를 올리면) → 첫 화면 4 → 10끼. 좁은 화면은 끼니마다 카드 그대로.
  - 달력: 오른쪽 고른 날 패널(데스크톱은 이번 달이면 오늘이 기본), 칸에 그날 kcal(데스크톱만). 달력 응답에 `days[].kcal`(항목 영양 스냅샷 합, 값이 있는 항목만·없으면 null) 추가.
  - 상세: 왼쪽 음식·사진 | 오른쪽 식당·메모·버튼. 입력·수정: 왼쪽 먹은 음식·사진 | 오른쪽 언제·어떻게, 저장 줄은 데스크톱에서 화면 아래 고정(전엔 1,251px 아래). 좁은 화면에서 상세는 식당 카드가 음식·사진 뒤로, 입력은 사진 카드가 먹은 음식 바로 뒤로 온다(두 단 묶음 순서).
  - 추천 탭도 같은 문법으로 결과를 왼쪽, 조건·최근 추천을 오른쪽으로 옮겼다.
  - 검증: 1440px·390px(iframe) 좌표 실측(Aside 캡처는 계속 시간 초과) — 사용자 dev 서버가 내려가 있고 5173 은 다른 프로젝트가 써서 확인용 API·웹(5174)을 잠시 띄우고 끝낸 뒤 내렸다. 웹 173·서버 식단 203 통과, 전체 typecheck·lint(오류 0), docs/api 재생성.

- **2026-10-04 — 영양소 점검·영양제 조언(KIMI 기본)**: 사용자 요청 "KIMI-3 기본으로, 식단 기록을 보고 부족한 영양소를 참고해 나에게 맞는 비타민제 추천" → 의견(① 영양소 데이터·점검 ② kimi 조언 + 성별·나이 ③ 선택: 끼니 추천 점수 반영 / 제품명 없이 성분·형태만) 중 **권장(①·②) 진행, 필요하면 데이터·구현 추가 허용**.
  - **데이터**: 식약처 음식 표준데이터의 100g당 비타민·무기질 13종을 `FoodItem.nutrientsPer100gJson` 에 둔다(빈 문자열은 없음, 0 은 0). 같은 대표식품 묶음에서는 **이름이 같은 층부터** 영양소별로 고른다 — 묶음 전체에서 고르면 참치김치찌개의 비타민 D 가 김치찌개로 샜다. 빌려온 영양(`nutritionFrom`)·`공기밥`(=쌀밥)은 같은 출처에서 복사(`backfillBorrowedNutrients`). dev 1,236/1,236. 원재료 DB(15100065, 과일·채소)는 활용신청 미등록(403) — 과일·채소 기록이 있으면 비타민 C·칼륨·식이섬유·비타민 A 가 적게 잡힐 수 있어 그 영양소는 조언을 미루고 그렇다고 밝힌다.
  - **기준**: 2020 한국인 영양소 섭취기준 요약표(12세 이상 7구간 × 남녀 — 평균필요량·권장·충분·상한, 나트륨 만성질환위험감소섭취량, 필요추정량). 성별·출생연도(선택, `MealPreference.sex·birthYear`)가 없으면 30-49세 **남녀 중 낮은 값**(부족을 과하게 말하지 않게). 만 12세 미만은 판단하지 않는다.
  - **점검**(결정적, `GET /meals/nutrition?days=7~28`, LLM·한도 없음): 두 끼 이상 기록한 날만 평균(4일 미만 보류) · 먹은 g = 저장 열량 ÷ 100g당 열량 · 그 영양소 정보가 있는 열량이 60% 미만이면 보류 · 음료·주류는 0 으로 아는 셈 · 부족(평균필요량 미만, 충분섭취량만 있으면 70% 미만)/조금 부족/충분/많음 · **조언 대상은 기록 열량을 필요량만큼(최대 2배) 채워 봐도 모자란 것만**(빠진 끼니 탓일 수 있어서) · 니아신·비타민 A 는 음식으로 상한 판정 안 함(상한이 보충제·레티놀 기준) · 한 끼 후보 = 흔한 한 끼 중 열량 대비 많이 든 음식 3개(알레르기·제외·덜 선호 빼고, 1인분 나트륨 1,500mg↑·100g당 200kcal↑ 빼고, **나트륨이 많은 사람에겐 국물 요리를 빼고 800mg**, 1인분이 상한을 넘는 원자료 오류 빼고 — 초밥 니아신 150mg) + 고정 '많이 든 음식'(과일·유제품 포함).
  - **조언**(`POST /meals/nutrition/advice`, purpose `meal-supplement` 기본 **kimi-k3**, 어드민 '추론' 선택 가능): 서버가 고른 대상(최대 6)만 모델이 풀어 쓴다. 검사 — 후보 밖 영양소·한자·치료/예방/완치·점검 밖 영양소(마그네슘·아연·오메가-3·유산균…)·**프롬프트에 없는 용량 숫자**가 있으면 그 칸만 서버 문장(비타민 D 는 IU 환산값을 서버가 넘긴다). 영양제는 '부족'일 때만 권한다 — '조금 부족'은 음식으로만(프로브: 부족분 0.05mg 에 B 복합제), 칼륨·식이섬유·단백질은 늘 음식으로만. 부족분·상한·주의 문구(복약·임신·결석 등)·면책은 서버 값. 같은 날·같은 점검 결과면 저장본(한도 미차감, fallback 은 재사용 안 함), 일일 한도 `MEAL_SUPPLEMENT_DAILY_LIMIT`(기본 10)·분당 5. 기록이 모자라거나 조언할 게 없으면 모델 없이 답한다.
  - **프로브** `probe:meal-nutrition`(가상 A·B·C·E + 내 계정, 리포트에 모델 원문): kimi-k3 5/5·p50 12.9s·서버 문장으로 바꾼 칸 0 / gpt-oss:120b 5/5·4.3s 지만 '~합니다'체·나열식 → kimi 유지. 프로브로 고친 것 3가지는 위(국물 한 끼 후보·조금 부족에 영양제·원자료 오류).
  - **화면**: 웹 `/me/meals?tab=nutrition`·앱 '영양' 탭 — 기간 7/14/28일, 영양소별 막대(기준선 100%)·상태·한 끼 후보, 조언 카드(요약 · '영양제로 채운다면' 칩 · 영양소별 이유/음식/영양제/주의 · 면책). 설정에 성별·출생연도. 식단 전체 삭제가 조언 이력도 지운다(`deleted.nutritionAdvices`). 웹 탭바는 좁은 화면에서 아이콘을 숨기고 가로로 민다.
  - **운영 배포**: 마이그레이션 `20261004060205_add_meal_nutrition` + `load:food-catalog --source=nutrition --backfill-nutrition`(100g당 영양소 채우기·빌려온 행 복사). `.env` 는 새 값 없이도 기본(kimi-k3·한도 10)으로 동작.
  - 같이 고친 것: 어댑터 캐시 상한 8 → 16(용도 9개), 백업 복원이 성별·출생연도도 되살림, food-import 정규식의 리터럴 BOM → `﻿`(린트 오류).
  - 검증: friendly 1,628 통과(1 skip, 영양 28건 신규) · web 173 · shared 115 · utils 395, 전체 typecheck·lint(오류 0). 실제 서비스 경로(dev 계정): kimi-k3 10.3s 로 생성·저장, 같은 날 재요청은 저장본.
  - 남은 것: 원재료 DB 활용신청(과일·채소 비타민) · 점검 결과를 끼니 추천 점수에 반영(③) · 앱 화면 실기기 확인 · 웹 화면 육안 확인(이 환경 브라우저가 dev 서버에 닿지 않아 RTL 테스트로만 확인).

- **2026-10-04 — 최근 추천 삭제(하나·모두)**: 사용자 요청 "최근 추천 했던것 삭제하는 기능" → 의견(A 숨기기 권장 / B 완전 삭제 / C 모두 지우기) 중 사용자 결정 **B+C**(완전 삭제 + 모두 삭제, 둘 다 확인창).
  - API: `DELETE /meals/recommendations/:id`(204, 남의 것·없는 것 404) · `DELETE /meals/recommendations`(본문 confirmation `DELETE_MY_MEAL_RECOMMENDATIONS` → `{deleted:{recommendations, recommendationEvents}}`). 반응 이벤트도 함께 지워 다음 추천 학습(선택·평가·기록)과 수락률 통계에서 빠진다. 식단 기록은 그대로(originRecommendationId 는 FK 가 아닌 출처 스냅샷), 일일 한도 카운터도 그대로라 지워서 한도를 늘릴 수 없다. 같은 날·끼니 재요청은 새로 만든다(한도 차감). 식단 쓰기 장벽 안에서 돌려 생성 중인 추천과 엇갈리지 않는다.
  - 지운 추천에서 시작한 기록 초안(영속 draft): 서버는 원본 추천이 아예 없으면(삭제) 일반 기록(manual)으로 저장하고, 남의 추천 id 는 그대로 400. 화면은 삭제가 성공하면 초안의 출처만 뗀다(shared `useDeleteMealRecommendation`·`useDeleteAllMealRecommendations` — 추천·통계 쿼리 무효화).
  - 웹·앱: '최근 추천' 줄마다 휴지통 + 머리에 '모두 삭제'(웹 ConfirmDialog·앱 Alert). 한 개여도 목록을 보인다(마지막 추천도 지울 수 있게). 보던 추천을 지우면 남은 최신으로 돌아가고, 다시 받아 오기 전에 지운 추천이 잠깐 되살아나지 않게 가린다.
  - docs/api 재생성(196 엔드포인트). 테스트: friendly 추천 삭제 2·지운 원본 기록 1, shared API 1, web 식단 1(취소·보던 추천 삭제·초안 출처·모두 삭제).
- **2026-10-04 — 남은 것: 후보 줄 조리형태 개수 · KIMI 재비교 · 프리셋 가중치 · 흔한 한 끼 점검 스크립트**: 사용자 "남은것 진행" + 결정 2건(남은 이유 오류는 '후보 줄에 사실 추가', 카탈로그에 없는 메뉴는 '점검 스크립트 + 운영 확인').
  - **후보 줄 조리형태 개수**(v5 에 포함): `recentDishTypeCounts(profile)` 로 후보 줄마다 '볶음 2주 3번'. gpt-oss 72회씩 같은 판정기로: 틀린 주장 3/70(4%) → 3/91(3%, 구체적인 주장이 늘고 비율은 비슷하거나 낮음 — 오징어볶음 '볶음 형태가 없다' 재발 없음), 세트 안 조리형태 겹침 7~8% → **2%**, 반복 일관성 56~60% → 62%. 유지.
  - **KIMI 재비교**(v5, 18 시나리오 × 2): 판정기 틀린 주장 gpt-oss 1/34 · kimi 4/80 — kimi 4건 중 3건은 '찌개·전골 4회 중 만두전골은 없어'처럼 범위를 좁힌 맞는 말이라 실제 오류는 둘 다 1건 남짓(kimi: '오늘 아침 시리얼'). kimi 는 여전히 3.4배 느리고(p50 6.5s vs 1.9s) 늘 5개를 골라 세트 안 겹침 24%·26%(gpt-oss 8%·6%), 고른 후보 점수 순위 8.0(5.8), 후보 밖 이름 1 → **gpt-oss 유지**. 판정기: '김밥류' 등 'X밥류'를 밥 전체로 보지 않게.
  - **'가볍게·건강' 균형 가중치 4 → 3·2**(점수 층, A·C·E × 점심·저녁 × 7일): 기본값과 상위 10 겹침 79% → 76%·73%, 건강 0.79 → 0.79·0.80, kcal 그대로 — 효과가 작아 **바꾸지 않음**.
  - **'내 취향대로' A/B**(v4 프롬프트 vs 지금, 사용자별 16회 번갈아): E 57% vs 64%, A 15% vs 15% — 앞서 본 74% → 60% 는 표본 잡음, 지금 프롬프트가 먹던 음식을 덜 고르지 않는다. 별개 발견: A 처럼 기록이 전부 최근 5일 안이면 '내 취향대로'여도 LLM 상위 25 에 먹던 음식이 1개뿐(겹침 회피·방금 먹음 배수가 이김). 취향 점수가 먹은 음식 이름에만 붙어 비슷한 새 음식(돼지고기·찌개 쪽)도 0 — 취향 유사도는 다음 후보.
  - **`check:common-meals`**(scripts/check-common-meals.ts, 읽기 전용 — 운영에서 돌려도 됨): 목록 이름(표기 변형 포함)이 추천 후보가 될 수 있는 카탈로그 행과 맞는지 무리별로 '후보로 쓰임 / 있지만 빠짐 / 없음'. 판정은 `isExplorableCatalogRow`(buildCandidates 적격 조건과 같음). dev: 209 중 쓰임 163 · 빠짐 7(미역국·소고기 미역국·소고기 무국·콩나물국 = 100kcal 미만 국이라 반찬급, 양장피 = 무침, 곱창·닭발 = 원재료) · 없음 39.
  - 최종: probe:meal-settings 63/23/0, probe:meal-recommend 118/0/0(LLM 28회 모두 응답, 점검 수는 응답 수에 따라 달라짐), friendly meal·추천·food 테스트 326 통과.
- **2026-10-04 — 추천 이유의 "안 드셨다" 오류 줄이기(프롬프트 v5)**: 흔한 한 끼 반영 뒤 남은 틀린 주장 12/65 를 나눠 보니 판정기 오탐 3(‘해산물 볶음’을 볶음 전체로, ‘초밥류’를 밥 전체로 셈)을 빼고 9건이 모두 **먹은 조리형태를 안 먹었다고** 한 것이었다(국물·국·탕 6, 볶음 2, 구이 1 — 찌개 네 번 먹은 E 에게 "90일 동안 국물 요리를 전혀"). 원인 셋: ① 프로필 요약이 축마다 상위 3개만 보여 줘 나머지를 안 먹은 것으로 읽었고, 머리말 '최근 90일 기록'과 2주 분포를 섞어 "90일 동안"이라 썼다 ② 균형 태그 '요즘 안 먹은 X'가 두 축 평균으로 붙어 제육볶음을 먹은 사람의 오징어볶음에도 '안 먹은 볶음' ③ 프롬프트의 이유 예시가 바로 "2주 동안 국물 음식을 안 드셨어요".
  - 요약(`describeProfile`): '최근 2주 주메뉴 N개' 아래 조리형태·주재료·계통을 먹은 것 전부 **개수로**, 그리고 **'안 먹은 조리형태·주재료'** 줄(끼니 후보가 될 수 있는 축만, 2주 기록이 없으면 생략). 자주 먹는 음식에 '(90일)'. 회는 '회'로 적는다 — 화면 이름 '회·초밥'인데 카탈로그는 초밥을 밥·죽으로 분류해 모둠초밥 먹은 사람에게도 '안 먹은 회·초밥'이 된다. `PatternProfile.balanceItemCount`(분포의 분모) 추가.
  - 태그: 균형 0.85 초과이고 2주 기록이 있을 때, 실제로 2주간 안 먹은 축에만 **'2주간 안 먹은 X'**(조리형태 먼저, 아니면 주재료). 2주 기록이 없는 사용자에게 모든 후보 '요즘 안 먹은 X'가 붙던 것도 없어졌다.
  - 프롬프트 v5: 안 드셨다·없었다는 '안 먹은' 줄·태그에 있는 것만 그 기간(2주) 그대로, 개수가 적힌 축은 '적게'까지만. 이유 예시는 부재 주장이 아닌 것("요즘 면 요리를 많이 드셔서 밥 요리로 균형을 맞춰요").
  - 판정기(probe:meal-models) 보정: 조리형태 바로 앞 주재료 말('해산물 볶음'·'고기 구이')은 그 조합만 세고, '초밥류·덮밥류'는 밥 전체로 보지 않고, '많이 드시지 않았다'는 0 주장이 아니라 비율 주장으로 본다. 같은 판정기로 v4·v5 원 응답(`models-raw-2026-10-04-health.json`·`-v5.json`)을 다시 채점.
  - 결과(gpt-oss, 18 시나리오 × 2): **틀린 주장 9/64(14%) → 2/36(6%)** — 부재 주장 자체가 줄었고(64 → 36), 남은 2건은 E 의 오징어볶음에 '해산물·볶음 형태가 없다'(태그 '2주간 안 먹은 해산물'을 볶음까지 넓힘). 이유 길이 57 → 56자, 세트 안 주재료 겹침 15% → 8%, 반복 일관성 44% → 56%. 이유가 기록에 기대는 쪽으로 바뀜("고등어구이와는 다른 고기·구이", "자주 드시는 김치찌개·된장찌개와 차별"). probe:meal-recommend 128/0/0, probe:meal-settings 61/25/0 — 늘어난 확인 2건은 LLM 단발(프리셋별 8회 반복: 기본 먹던 음식 0%·건강 0.76, '내 취향대로' 60%(v4 74%, 이유 예시를 v4 로 되돌려도 65%), '가볍게·건강' 건강 0.79).
- **2026-10-04 — 실용적인 추천: 흔한 한 끼 목록 + 프롬프트 v4 + 건강 점수 보정**: 사용자 지적 — 무 어묵조림·가지전처럼 일반적이지 않은 메뉴가 추천된다. 원인은 카탈로그 탐색 후보(인기·새 음식)를 식약처 영양 DB 1,236행에서 고르게 섞어 뽑아(인기도가 전부 0이라 순서는 출처·씨앗 셔플뿐) 반찬·지역·희귀 메뉴(해신탕·오징어순대)가 김치찌개만큼 나온 것. 사용자 결정: 권장안 A(목록)+E(프롬프트), C(식당 인기 신호)·D(주메뉴+곁들임)는 나중.
  - `meal-recommendation/common-meals.ts` — 사람이 읽고 고치는 흔한 한 끼 목록(13무리 209개, 표기 변형은 메뉴 어휘 synonymPairs). 탐색 후보는 목록 음식(씨앗 셔플)부터, 목록 밖은 모자랄 때만 뒤에. 내 기록·좋아함은 목록과 무관. dev 카탈로그(식약처 1,236 + curated 30)엔 168개만 맞고 41개(제육덮밥·닭갈비·보쌈·양념치킨·마라샹궈·포케…)는 없다 — 운영 카탈로그(식당 메뉴)엔 있을 수 있어 남김.
  - 아침·간식 무리(토스트·시리얼…)는 `MORNING_ONLY_MEALS` — 점심·저녁·야식 후보에서 뺀다(좋아함·그 끼니 습관이면 남김). 아침에 먹던 토스트가 '내 취향대로' 점심 상위를 차지했다.
  - 프롬프트 v4: "반찬·안주·간식(조림·무침·나물·전·떡 등)은 그것만으로 한 끼가 되기 어려우면 고르지 않는다". "흔히 먹는 메뉴를 우선"까지 넣으면 '내 취향대로'의 먹던 음식 비율이 78% → 42% 로 떨어져 뺐다(반찬 금지만 남긴 뒤 64% vs 64%, 최종 코드 8회 반복 74%). 건강 중심 힌트에 '전'.
  - **건강 점수 보정** — 목록 반영 뒤 설정 점검에서 '가볍게·건강' 상위에 족발·돼지갈비찜·김치전이 올랐다. 찜은 '가벼운 한 끼' 가점에서 빼고(족발·갈비찜·아귀찜이 다 찜), 전 −0.15, **100g당 열량 200 이상 −0.15**(`CandidateInput.kcalPer100g`, `food-serving` `kcalPer100gOf`) — 1인분 열량은 식약처 1회 제공량이 작아 흔한 한 끼 대부분이 500kcal 아래로 나와 못 가렸다(족발 583·함박스테이크 348). 지방 열량 비율은 고등어구이 63%·김치찌개 55% 라 기각. 건강 중심 필터는 중립(0.5)과 후보 중앙값 중 높은 쪽 아래를 뺀다(균형과 같은 방식) — LLM 이 받는 상위 25 의 건강 평균 0.66 → 0.71.
  - 결과(gpt-oss, probe:meal-models 18 시나리오 × 2): 흔한 한 끼 비율 추천 기준 35% → 100%(가짓수 14/34 → 33/33) · 최근 7일 먹은 음식 2% → 0% · 틀린 주장 15/74 → 12/65 · 메모 '가볍게'의 김치전(두 번 다 첫째) → 없음. probe:meal-settings 63/23/0 — LLM '가볍게·건강' 건강 평균 0.62 → 0.85(저녁)·0.50 → 0.75(점심), 메모 '가볍게' 669 → 276kcal. probe:meal-recommend 128/0/0(LLM 포함).
  - 확인 필요가 반영 전(67/19)보다 는 이유: 기록이 짧고 다양한 E 는 기본값부터 새 음식만 골라 '새로운 도전'·'골고루'·'가볍게·건강' 상위 10 이 기본값과 90% 안팎 겹친다 — 새 음식끼리는 균형:건강 가중치 비만 순위를 가른다(기본 3:2 = 도전 3:2). 예전엔 이상한 후보(냉국·채소밥)가 섞여 우연히 갈렸다. LLM 층에선 고르는 음식이 달라진다. 후보 풀 40 → 60·80 은 기각 — 프리셋 구분은 안 늘고(A 99%) 이웃한 날 상위 10 겹침만 15% → 28%·48%.
- **2026-10-04 — 추천 모델 비교(gpt-oss:120b vs kimi-k3)**: `probe:meal-models [--models=…] [--repeat N] [--from-raw <json>]`(scripts/probe-meal-models.ts) — 서비스와 같은 후보 경로·프롬프트를 시나리오마다 한 번 만들고 모델만 바꿔 LLM 을 직접 부른다(분당 제한·일일 한도 없음, think 는 thinkOptionForModel — gpt-oss low·kimi 끔). 시나리오 18(A·B·C·E × 아침·점심·저녁 + E 의 가볍게·건강/골고루 × 점심·저녁 + 메모 국물·가볍게) × 2회. 원 응답 `data/meal-probe/models-raw-날짜.json` 을 남겨 판정 규칙을 고친 뒤 `--from-raw` 로 다시 낸다. **이유의 사실 확인**: 기록과 대조할 수 있는 주장만 — "최근 N일 [조리형태] 전혀·거의 안 드셨다"(이름만 봐도 그 조리형태인 음식으로 세고, 떡볶이=볶음처럼 카탈로그 분류로만 걸리면 보류), "어제 X·X(N일 전)", "N%"(0% 는 실제 0인지), 먹은 음식에 '처음'.
  - **결과**(성공 36/36·지어낸 이름 0·최근 2일 0·'가능하면 피함' 0 은 둘 다 같음): 지연 p50/p90 gpt-oss **2.0/2.6s** vs kimi **5.7/7.3s** · 고른 수 3.3 vs **5.0**(늘 최대) · 세트 안 조리형태 겹침 3% vs 15%, 주재료 11% vs 17% · 최근 7일 먹은 음식 2% vs 6% · **틀린 주장 10/69(14%) vs 40/192(21%)** · 한자 섞임 0 vs 1('단백질来源') · 이유 길이 56 vs 75자 · 반복 일관성 61% vs 74% · 설정 반영은 비슷(메모 '국물' 국·찌개 비율 1.00 vs 0.80).
  - 정성: kimi 는 이유가 구체적·개인화('어제 드신 고등어구이와 달리', '최근 7일에 드신 순두부찌개·부대찌개와 다른 재료')·말투가 부드럽지만, 단정('전혀 없었고')이 많고 자기모순('최근 2주간 구이류가 전혀 없었고, 9월 27일 이후 먹지 않아')이 있으며 C 점심에선 일주일 안에 먹은 음식을 5개 중 3개 골랐다. gpt-oss 는 짧고 일반적('다양성을 제공합니다')이지만 덜 틀린다.
  - **두 모델 공통 원인(우리 쪽)**: 프롬프트의 식사 패턴 요약이 축마다 **상위 3개 분포만** 보여 주고(찜 5%·전·부침 2% 는 안 보임), 후보 태그가 균형 0.85 초과면 **'요즘 안 먹은 X'** 라 실제로 두 번 먹은 찜에도 붙는다 → 두 모델 모두 "찜 요리를 전혀 드시지 않았고"를 따라 쓴다. 틀린 주장의 대부분이 이 유형.
  - 판단: 기본 모델은 gpt-oss:120b 유지 권장(3배 빠르고 덜 틀리고 세트가 더 고르다). kimi 는 위 공통 원인을 고친 뒤 다시 비교할 가치(구체성·말투). 미착수.
- **2026-10-04 — 추천 탭 '최근 추천' 목록 UX(웹·앱)**: 사용자 지적 — 지난 추천을 누르면 목록이 바뀌어 헷갈린다. 원인은 목록이 "최근 5개 − 지금 보는 추천"이라 누를 때마다 누른 줄이 빠지고 보던 추천이 끼어들어 순서가 바뀌었고, 바뀐 카드는 목록 위(화면 밖)에 있었으며, 카드에 최신인지 표시가 없고, 같은 날·끼니 추천이 시각 없이 같은 줄로 보였고, 지난 추천을 보는 중에도 '다시 추천'이 남아 그 추천을 다시 만드는 것처럼 보였다. 사용자 결정: 권장안 A.
  - 목록은 늘 최신순 그대로, 보고 있는 줄만 강조('보는 중', 웹 `aria-current`·앱 selected). 제목 '지난 추천' → **'최근 추천'**. 줄마다 `오늘 저녁 · 19:12 · 음식` + 진행(기록 완료·선택됨, 웹은 👍 도) — 문구는 `@repo/shared` `meal/recommendationHistory`(recommendationWhenLabel·HistoryFoods·ProgressLabel, 웹·앱 공용)
  - 목록에서 고르면 카드로 스크롤(웹 scrollIntoView + 상단바 높이 scroll-mt-20, 앱 ScrollView.scrollTo 카드 onLayout y). 최신이 아니면 카드 머리에 **'지난 추천 · 오늘 점심 · 12:30' + [최신 추천으로]**, 그동안 '다시 추천'은 숨김. '지난 추천 보는 중'은 사용자가 목록에서 고른 경우만(같은 날·끼니 재요청으로 캐시된 예전 추천이 돌아온 경우는 지금 요청한 것이라 아님) — 새로 받거나 최신으로 돌아가면 풀린다
  - 노출('shown') 이벤트는 새로 받은(또는 화면 진입 때 보인) 추천만 — 목록에서 예전 추천을 다시 여는 건 새 노출이 아니다
  - 검증: shared 113(문구 3 신규)·web 식단 28(최근 추천 1 신규 — 순서 유지·보는 중 이동·배너·다시 추천 숨김·노출은 최신만), web·mobile·shared typecheck. Aside 브라우저(niney@life.com, 추천 7건)로 3번째 줄 선택 → 순서 그대로·보는 중 이동·배너·스크롤·'최신 추천으로' 복귀 확인. 앱 화면 미확인.
- **2026-10-04 — 설정 점검 프로빙(수정 전)**: `probe:meal-settings [--score-only] [--undo]`(scripts/probe-meal-settings.ts) — 기록이 다양한 가상 사용자 E(`meal-probe-e@probe.local`, 2주 35끼)에게 설정만 바꿔 가며 추천이 따라 움직이는지 본다. 점수 층(결정적: 기본·프리셋 4·한 축 올리기 7·날씨 고정값·식사 방식·제외/알레르기/덜 선호/좋아함과 그 조합)과 LLM 층(실제 라우트 13회: 기본·프리셋×점심/저녁·메모 2·알레르기). 알레르기는 서버 판정과 별개로 스크립트의 이름 단어표로도 본다 — 서버 판정만 쓰면 재료 정보가 없는 카탈로그에서 검사가 늘 통과한다(기존 probe:meal-recommend C 의 알레르기 검사가 그랬다). 리포트 `data/meal-probe/settings-report-날짜.md`, 끝나면 E 설정은 기본값. **결과 통과 66·확인 14·실패 5.**
  - **동작함**: 가중치 한 축 올리기(취향·건강·새로움·균형)는 기대 방향으로 움직인다. 기온·비를 넣으면 날씨가 국물/면 비율을 바꾼다. 제외(오이·돼지·김치 7개 → 0)·덜 선호(1위 → 36위)·좋아함(후보 아님 → 1위)·좋아함+덜 선호(덜 선호 우선, 38위)·좋아함+제외(빠짐).
  - **실패 — 알레르기가 걸러지지 않는다(안전)**: 서버는 재료·표시·검수 근거가 있는 행만 거르는데 dev 카탈로그 1,266행 중 근거가 있는 행이 0개(`allergenData` 는 이름을 보지 않는다). 새우 이름 17행·게 8행 중 걸러지는 행 0. 새우·게 알레르기에 꽃게찜(12위)·새우전(15위)이 후보에 남고, 좋아함 '깐풍새우' + 새우 알레르기면 **점수 1위·LLM 추천 1번**으로 나왔다(LLM 프롬프트에도 알레르기가 없어 이유에 언급 없음).
  - **효과 없음(확인)**: ① 위치 없이 봄·가을(이번 10월)은 날씨 요소가 모든 후보 0.5 — 날씨 가중치 무효(웹·앱은 저장한 내 대기 위치가 있으면 좌표를 보내지만 8°C 초과 26°C 미만·비 없음이면 역시 중립) ② 간편함 — 집밥은 재료 수, 외식·배달은 인기도로 매기는데 dev 는 둘 다 없어 모든 후보 같은 값 ③ 그래서 설정 '주로 하는 식사'(mealTypes[0] 은 간편함에만 쓰임)를 집밥 ↔ 외식으로 바꿔도 상위 10 이 100% 같다 ④ 프리셋 '골고루'와 '새로운 도전'의 상위 10 이 100% 같고, '골고루'는 균형 지표를 못 올린다(새로움 3·겹침 회피 5 가 미경험 음식을 밀어 올려 균형 5 를 덮는다 — 균형만 5 는 0.74 → 0.83).
  - **설정과 별개로 보인 것 — 반찬급 후보 쏠림**: 해파리냉채(26kcal)·무생채(73)·양배추부추무침(30)·오이냉국(19) 같은 저칼로리 무침·냉국이 건강 가산(샐러드 +0.25·500kcal 이하 +0.1)과 새로움을 함께 받아 거의 모든 설정에서 상위 → LLM 추천 13회 중 12회에 해파리냉채. 분류 '기타'(소스/드레싱 890kcal·견과)도 탐색 후보에 들어온다. 추운 날·비 오는 날 1위가 오이냉국(국 분류라 '따뜻한 국물'로 셈), 메모 '국물 있는 걸로'에도 오이냉국이 1번.
  - LLM 층: 13회 전부 done, 후보 밖 이름 0. 프리셋별 방향은 LLM 결과에서 약하다(확인 5) — 후보 상위가 프리셋과 무관하게 비슷해서다. 메모 '가볍게'는 맞게 가벼운 쪽, '국물'은 3개 모두 국·찌개.
  - **수정(사용자 결정: 권장 1~3 진행, 날씨·간편함·식사 방식은 운영 데이터 확인 뒤로 보류)**:
    ① 알레르기 — `allergensInFoodName`(food-allergen, 재료 규칙 단어 + 이름 전용 단어, 굴비 예외): 카탈로그 메타·화면 경고에는 쓰지 않고(배합 보장 없음·모든 사용자 카드에 '돼지고기·밀' 경고가 붙는다) 후보의 `allergenNameHints` 로만 실어 **사용자가 밝힌 알레르기면 좋아함·내 기록이어도 후보에서 뺀다**(`hitsUserAllergen`, 운영자 검수 행은 이름 단서 없음). 프롬프트 v3 — `[알레르기 — 이 재료가 든 음식은 절대 고르지 말 것]`. probe:meal-recommend C 의 위반 판정도 이름 기준 포함.
    ② 반찬급 — `isSideLikeCatalogRow`: 카탈로그 **탐색 후보에서만**(내 기록·좋아함은 그대로) 조리형태 other(dev 13행 전부 양념·소스·견과·과일·팝콘 — 출처 무관, 이전의 "레시피·영양 출처 other 는 남긴다" 결정을 바꿈) / 무침·국 1인분 100kcal 미만 / 식약처 생채·무침류 중 샐러드가 아닌 300kcal 미만(무침·겉절이·생채·냉채, 물회는 남음)을 뺀다. 날씨: 이름에 냉국·냉채·냉면·물회·콩국수·냉모밀·냉소바가 있으면 국 분류여도 시원한 쪽.
    ③ 프리셋 '골고루' 7가지 중요도 = 겹침 피하기 3·취향 2·골고루 5·건강 2·새로움 1·날씨 1·간편함 1(이전 5·3·5·3·3·1·2). 새로움 3 이 미경험 음식을 밀어 올려 '새로운 도전'과 같았다.
  - **수정 후**: 설정 점검 **통과 76·확인 9·실패 0**(점수 층 상위가 오징어순대·어묵 매운탕·미더덕찜·미트 스파게티 같은 실제 요리로, 해파리냉채 사라짐). 알레르기 새우·게: 이름 기준 2개 → 0, 좋아함 깐풍새우+새우 알레르기 → 후보 아님, LLM 결과 소안심스테이크·어묵 매운탕·미더덕찜. 골고루: 균형 0.72~0.74 → 0.79, 기본값과 겹침 70~80%, 새로운 도전과 70%. probe:meal-recommend 48·0·0. 남은 확인 9 = 보류한 날씨·간편함(3)·식사 방식 5건 + LLM 방향 4건(골고루 균형 0.76 → 0.77, 가볍게·건강 저녁에 LLM 이 양념 돼지고기튀김·야채빵을 골라 건강 평균 하락, 새로운 도전은 기본값 추천이 이미 100% 새 음식).
  - 테스트: 추천 51(이름 단서·굴비 예외·냉국 날씨·반찬급 판정·프롬프트 알레르기·후보 풀 반찬급/내 기록 반찬/알레르기 이름 제외 신규, other 기대값 변경).
  - **LLM 방향 보강(사용자 선택)**: ① `filterForWeights`(서비스·두 프로브 공용, 끼니 필터 다음) — 건강 중요도 4 이상이면 건강 요소가 중립(0.5) 아래인 후보(튀김·빵·900kcal 이상·고나트륨)를 LLM·폴백 후보에서 뺀다. 좋아함은 남기고, 3개 미만이면 뒤에 붙인다 ② 프롬프트 v3 에 `[이번 추천의 중심]` — 가장 높은 중요도(4 이상, 동률이면 모두)를 고르는 기준 문장으로(건강 "튀김·빵·고열량·짠 음식은 피하고…", 골고루 "최근 적게 먹은 조리형태·주재료를 채우는 쪽으로…"). 기본값은 겹침 피하기·내 취향 ③ 프로브 판정: 기준이 이미 끝(1·0)이면 그대로여도 통과('새로운 도전'은 기본값 추천이 이미 전부 새 음식).
  - **보강 후**: 설정 점검 **통과 77·확인 8·실패 0**, probe:meal-recommend 48·0·0, friendly 식단·음식·추천 311 통과(추천 54). '가볍게·건강' LLM 결과에서 튀김·빵이 사라졌다(점심 어묵 매운탕·두부 청국장찌개·미더덕찜). 남은 LLM 확인 3: '골고루' 균형이 LLM 결과에선 기본값과 비슷하거나 낮음(점수 층은 0.79 로 오름 — LLM 이 양념 돼지고기튀김을 계속 섞는다), 메모 '가볍게'(건강 중요도 기본 2)에 계란빵 — 메모는 LLM 에만 가고 후보 필터가 없다.
  - **남은 확인 진행(사용자 지시)**: ① 균형 계산 — 모르는 축(조리형태·주재료·계통이 빈 값)을 비중 0('안 먹은 축')으로 세던 것을 아는 축만 평균, 셋 다 모르면 중립 0.5. 주재료·계통이 빈 카레라이스가 균형 0.90 → 0.71, 미트 스파게티 0.77 → 0.66 ② `filterForWeights` → **`filterForFocus` + `recommendationFocus(weights, note)`** — 프롬프트의 `[이번 추천의 중심]`과 같은 판정(`focusWeightKeys`, 점수 서비스로 옮겨 프롬프트가 가져다 쓴다)으로 후보를 거른다. 건강 중심: 건강 요소 0.5 미만 제외 / **균형 중심: 균형 요소가 후보 중앙값 아래인 절반 제외** / 메모에 가볍·가벼·담백·다이어트·저칼로리·라이트·건강이 있으면 건강 중심을 더한다. 중심 판정이 가장 높은 중요도(4 이상)만이라 '가볍게·건강'(건강 5·균형 4)엔 균형 필터가 안 걸린다 ③ 프로브 판정 — kcal 은 상대 변화(2%), 메모 '가볍게'는 '튀김·빵 없음'(필터가 보장 → 어기면 실패)과 'kcal'(확인)로 분리, '주로 하는 식사'는 간편함이 후보마다 달라야 통과(같은 상수가 음식별 배수와 곱해져 한 칸 바뀐 겹침 90% 가 '통과'로 보였다).
  - **결과(최종 실행)**: 설정 점검 **통과 78·확인 8·실패 0** — 확인 5 는 보류한 날씨 1·간편함 3·식사 방식 1, 나머지 3 은 LLM 결과의 작은 차이(골고루 저녁 균형 0.69 → 0.67, 가볍게·건강 건강 0.82 → 0.83·0.83 → 0.85 — 방향은 맞지만 기본값 추천이 이미 건강 쪽이라 2% 문턱 근처). probe:meal-recommend 48·0·0, friendly 식단·음식·추천 314 통과(추천 57). 메모 '가볍게'·'가볍게·건강'에서 튀김·빵 0(메모 '가볍게' 두 점검 통과). 골고루는 점수 층에선 균형이 오르지만 LLM 이 균형 필터 뒤 후보 안에서도 한식(비중 49%)·양념 돼지고기튀김(균형 0.77 로 높은 편)을 고르는 경향 — 3~4개 결과의 편차와 구분하려면 반복 실행이 필요하다.
  - **웹 화면 확인(Aside 브라우저, 가상 사용자 E)**: 설정 탭 프리셋 '골고루' → 3·2·5·2·1·1·1 로 채워짐. 알레르기 새우·게 + 좋아함 '깐풍새우' 저장 후 저녁 '다시 추천' → 오징어순대·소안심스테이크·김치전(새우·게 0, 카드마다 '알레르기 원재료 정보 부족'과 상단 확인 안내). '가볍게·건강' 저장 후 저녁 → 소안심스테이크·두부 청국장찌개·어묵 매운탕(튀김·빵 0). 확인 뒤 E 설정을 기본값으로 되돌림. 설정의 좋아하는 음식 안내를 "추천 후보에 항상 넣되, 알레르기 주의 항목에 걸리는 음식은 빼요"로 고침(앱엔 해당 안내 없음). 화면에서 오징어순대·어묵 매운탕이 '분식·패스트푸드'로 표시 — 카탈로그 계통 오분류(균형 계산에도 영향), 미수정.
  - **남은 것 진행(사용자 지시, 커밋·운영·데이터 정리는 제외)**:
    ① 계통 — `@repo/utils guessCuisineFromName`: 분식 단어(어묵·순대·튀김…)가 걸려도 이름이 한식 요리형(탕·찌개·전골·국·국밥·찜·조림·볶음·구이·무침·나물·전)으로 끝나면 한식. `fix:food-labels` ③ 으로 소급(curated 제외) — dev 14행(어묵 매운탕·어묵볶음·어묵조림·순대국·순대볶음…). 판단이 갈리는 오징어순대(순대로 끝남)·튀김류 전반·라면(일식 규칙 '라면$')은 그대로.
    ② 표기 — `FoodService.matchFood` 에 정확·별칭 다음 단계로 표기 변형(메뉴 어휘 synonymPairs 재사용 + '둣국↔두국'·'크루아상↔크로와상' 추가)과 식단 전용 다른 이름 표(동그랑땡=완자전, 치킨무, 요거트, 콘푸레이크, 후라이드치킨=닭튀김, 쿠키). 직접 입력에서 비었던 15개 중 9개가 이제 매칭(계란찜·만둣국도). 비슷하기만 한 음식(까르보나라·피자 종류)은 넣지 않음 — 메뉴 칼로리 엔진의 별칭(extraAliases)에 넣지 않은 이유는 '후라이드치킨' 메뉴가 한 마리라서.
    ③ 시리얼 1인분 — 코드 기본 어휘 portionGrams 에 음식명 지정 `시리얼: 40`(빵류 통상 100g 으로 445kcal 이던 것). dev `backfill:meal-nutrition --refresh` 4건(445 → 178).
    ④ 건강 판정 kcal 기준 — 추천 후보의 kcal·단백질·나트륨을 식단 저장과 같은 `mealServingNutrition`(주식 통상 1인분)으로. 식약처 식품중량(대개 100g)을 그대로 써 거의 모든 음식이 '500kcal 이하' 가점을 받던 것. 어휘는 MealPatternService 가 10분 캐시.
    ⑤ 프로브 — 웹에서 로그인·로그아웃하면 tokenVersion 이 올라 프로브가 서명한 토큰이 'Session expired'(첫 3회 반복이 조용히 실패했다) → 두 프로브 모두 현재 tokenVersion(tv)으로 서명.
  - **'골고루' 반복 판정(설정 점검 3회, 프리셋당 점심·저녁 6표본)**: LLM 결과 평균 — 가볍게·건강 건강 0.80 → 0.88(4/6), 내 취향대로 먹던 음식 비율 뚜렷이 상승(5/6), 새로운 도전 6/6, **골고루 균형 0.68 → 0.68(2/6)** — 편차가 아니라 LLM 단계에서 효과가 거의 없다(점수 층은 0.79 로 오름). E 는 기록이 이미 다양해 기본값 추천도 균형 0.68 이고, 균형 중앙값 필터 뒤에도 LLM 이 그 안의 아래쪽(한식 국·찌개)을 고른다. 설정 점검 3회 79·7·0 / 78·8·0 / 78·8·0, probe:meal-recommend 48·0·0, friendly 318·utils 390·web 식단 27 통과.
  - **'골고루' 실험(임시 스크립트로 LLM 직접 호출 — 라우트 제한 없이, 서비스와 같은 후보 경로·provider)**: E(다양)·A(돼지고기·찌개 편중, 한식 93%) × 점심·저녁 × 3회. 변형 — 현재 / 균형 필터 상위 1/3 / 프롬프트 보강(많이 먹은 쪽 피하라는 줄 + 후보마다 조리형태·주재료·계통) / 둘 다 / 균형에서 계통 축 제외. 결과: ① A 에선 현재 골고루도 이미 효과(편중 3축 0.31 → 0.15, 조리형태·주재료 0.07 → 0.00) — E 의 '효과 없음'은 지표에 계통이 섞여서였다(조리형태·주재료로는 0.09 → 0.03) ② **계통 축이 '한식만 아니면 아무거나'로 작동** — A 한식 비율 0.72 → 0.39, 머핀·마카로니 샐러드 ③ 필터 강화는 미음·머핀이 늘어 끼니 품질이 떨어지고, 프롬프트 보강은 효과 미미 ④ 계통을 빼면 조리형태·주재료 편중 0 유지·한식 비율 자연스러움 ⑤ 미음·마카로니 샐러드·연근튀김·사골국 같은 끼니답지 않은 후보가 따로 남음. 리포트 `data/meal-probe/balance-experiment-2026-10-04*.md`.
  - **권장 반영(사용자 결정)**: ① 균형 = 조리형태·주재료 두 축(계통 제외, 계통은 프로필 요약으로만 LLM 에) ② 균형 필터(중앙값)·프롬프트는 그대로 ③ `isSideLikeCatalogRow` 보강(탐색 후보만) — 단백질 없는 샐러드(주재료 채소·과일·없음, 샌드위치 제외), 채소·곡물·유제품 튀김, 미음·응이·이유식·사골국·육수 ④ 설정 점검 프로브의 '골고루' 판정을 균형 평균 ↑ 대신 **최근 1위 조리형태·주재료와 겹치는 정도 ↓**('많이 먹은 쪽' 열), 건강의 '평균 kcal ↓'는 보조 지표라 반대로 가도 확인.
  - **반영 후**: 최종 비교(새 코드, 기본값 vs 골고루) — 조리형태·주재료 편중 E 0.03 → 0.00, A 0.06 → 0.00, 한식 비율 E 0.94 → 1.00·A 1.00(자연스러움), A 의 추천이 채소밥·소불고기·닭다리조림·모듬채소전골·뼈다귀해장국(미음·머핀·마카로니 샐러드 사라짐). 설정 점검 **67·19·0**(실패 0) — 늘어난 확인은 E 가 이미 고루 먹는 사용자라 계통을 뺀 뒤 기본값 상위가 이미 '많이 먹은 쪽' 0.05 로 골고루여서 프리셋 상위 10 이 기본값·새로운 도전과 90% 겹치는 것(편중 사용자에선 갈린다), 건강의 kcal(253 → 273, 건강 0.80 → 0.87), 보류 5. probe:meal-recommend 48·0·0, friendly 식단·음식·추천 319 통과(추천 59). 설정 점검에 편중 사용자를 넣으면 프리셋 구분을 제대로 볼 수 있다(미착수).
- **2026-10-04 — 추천 프로빙과 점수 보정**: `probe:meal-recommend`(scripts/probe-meal-recommend.ts) — 가상 사용자 4명(A 돼지고기·찌개 편중 / B 아침 거르고 야식 / C 새우·게 알레르기·오이 제외 / D 추천 반응)의 일주일 식단을 **dev.db 에 실제 라우트로** 넣고 오늘 끼니별 추천을 자동 점검한다(웹에서 그 계정으로 로그인해 볼 수 있게 — 계정·비밀번호·리포트는 `data/meal-probe/`, git 제외, `--undo` 로 정리, prod.db 거부). 점수표(7요소+배수)와 LLM 결과를 리포트로 남긴다.
  - **수정 전 결과(통과 32·확인 15·실패 1)**: 4명·세 끼 모두 거의 같은 "감자 / 시금치 / 가자미식해". 원인 ① 생재료(`mfds-raw`)·반찬류(김치·나물)가 끼니 후보에 들어감 ② 겹침 회피·균형·새로움이 모두 미경험에 만점 → 기본 가중치에서 취향이 늘 짐(상위 8개 전부 미경험, 취향 0) ③ 👎·덜 선호가 취향 감점뿐이라 안 먹어 본 음식(취향 0)에 효과 없음(👎 한 시금치 0.67 그대로 1위) ④ 점수에 끼니 구분 없음 ⑤ 인기 동률(dev 는 인기 0)이면 가나다순 앞쪽만 후보.
  - **수정(`meal-pattern.service`)**: 후보에서 김치·나물 조리형태와 원재료 카탈로그 제외 / 미경험 variety 1 → 0.5(새로움은 novelty 한 곳에서만) / 싫다는 신호는 최종 점수 배수(덜 선호 −50%, 👎 −40%×세기, 상한 90%) / 아침엔 구이·튀김·찌개·조림·볶음·회 ×0.75, 그 끼니에 자주 먹던 음식 ×1.1 / 방금 먹은 음식 오늘 ×0.2·어제 ×0.5·그제 ×0.8(미경험 가산을 줄이자 점심에 먹은 음식이 높은 취향으로 저녁 1위가 되던 것) / 카탈로그 후보는 적격 행 전체를 인기 → 출처(curated·800선·외식·레시피·영양) → 날짜 씨앗 고정 순서로 정렬(`buildCandidates(profile, pref, today)`). 점수 요소에 `slot`·`aversion`·`recent` 배수를 남겨 리포트·디버깅에 보인다.
  - **수정 후 결과(통과 47·확인 1·실패 0)**: 생재료·반찬·가나다순 편향 사라짐, C 는 먹던 음식(카레라이스·고등어구이·된장찌개)이 다시 섞임, D 는 먹은 음식 저녁 1위 → 40위·👎 2위 → 35위. 남은 확인 1건은 A 의 세 끼 결과가 같음(아침 습관이 없고 상위가 가벼운 음식) — LLM 이 끼니 맥락으로 갈라야 하는 몫.
  - **LLM 단계(같은 날 이어서)**: dev `.env` 에 `OLLAMA_MEAL_RECOMMEND_MODEL=gpt-oss:120b`(채팅과 같은 모델) — 끼니당 3회씩 **통과 128·확인 0·실패 0**, 전부 `done`. 끼니 맥락으로 갈라 고른다(A 점심엔 두부국, B 아침엔 호박 된장국·가자미찜, C 아침엔 굴죽). 이유 문장은 대체로 기록과 맞지만 1건 어긋남 — 면을 먹은 적 없는 A 에게 "면 요리는 최근에 많이 먹었지만"(자동 점검 대상이 아니라 리포트 육안 확인). **남은 쏠림**: 감자샐러드가 4명 거의 모든 추천에 들어간다 — 카탈로그 후보 섞기 씨앗이 날짜만이라 같은 날엔 모든 사용자가 같은 탐색 후보를 받고, 그중 감자샐러드(무침·채소·가벼움)가 늘 상위다. → 씨앗을 `사용자|날짜`로(같은 날 같은 사람은 같은 후보 — 캐시와 맞물림). 재실행(끼니당 1회)에서 4명이 각자 다른 탐색 후보를 받았고 쏠림이 사라졌다. 새로 확인 2건: B·C 아침에 LLM 이 스테이크(구이)를 골랐다 — 점수는 아침 구이를 ×0.75 로 낮추지만 LLM 은 후보 안에서 그대로 고른다. → `filterForSlot`(순수 함수, 서비스·프로브 공용): 아침엔 구이·튀김·찌개·조림·볶음·회를 LLM·폴백 후보에서 **빼되 내가 아침에 먹던 음식은 남기고**(그런 습관 음식은 감점도 안 함), 남은 게 3개 미만이면 가벼운 것을 앞에 두고 무거운 것을 뒤에 붙인다(추천이 비지 않게). 재실행 **통과 48·확인 0·실패 0** — 아침 결과에서 무거운 요리가 사라졌다.
  - **상세 화면 버튼(웹·앱)**: 수정이 맨 앞 기본 버튼, "이 식단 다시 기록" → **"같은 메뉴로 새 기록"** 보조 버튼(설명: 원래 기록은 그대로 남는다). 새 기록 저장 후에는 **방금 만든 기록의 상세**로 간다(입력 화면 자리를 바꿔 뒤로 가면 들어온 화면) — 원래 기록 상세로 돌아가 저장이 안 된 것처럼 보이던 혼동(2026-10-02) 해소. 앱 수정 저장은 종전대로 뒤로.
  - **카탈로그 표기(식약처 원본은 그대로)**: "돼지고기"(찜류 대표 행)는 실제로 허파·간·머리고기(순대 부속) 묶음, "달걀"은 삶은 달걀인데 분류 "수·조·어·육류"를 통째로 회(raw_fish)로 옮긴 매핑 탓에 회가 됐다(소시지·대구포도). ① `@repo/utils` 매핑에서 수조어육류를 빼 이름 규칙에 맡긴다(모듬회·육회는 이름 규칙이 회로) ② 적재 정규화에 대표식품명 보정표 `MFDS_REP_NAME_OVERRIDES`(돼지고기(찜류) → "돼지 부속고기(허파·간·머리고기)", 달걀(수조어육류) → "삶은 달걀") — 적재는 이름으로 기존 행을 찾으므로 보정표 없이 행 이름만 바꾸면 재적재 때 원래 이름 행이 다시 생긴다 ③ 이미 적재된 행은 `fix:food-labels [--dry-run]`(어드민 편집 경로, 멱등) — dev 4행 적용(이름 2·회 분류 비움 3). **운영 배포 뒤에도 `fix:food-labels` 한 번 필요**.
  - 테스트: 추천 43(점수 6·후보 풀 2·끼니 필터 1 신규, 미경험 variety 기대값 1 → 0.5 갱신), friendly 식단·음식·추천 30파일 300 · utils foodTaxonomy 6 · web 식단 27 통과.
- **2026-10-02 — 입력 화면 빠른 추가 칩(웹·앱)**: 공기밥·김치처럼 매번 다시 치는 음식을 한 번에 넣는다. 사용자 결정: 웹·앱 둘 다 / 공기밥 기본 구분은 **반찬(곁들임)** / 기본 목록 7개로 시작(직접 고정하는 "내 단골" 설정은 다음 단계) / 자동완성 개인화(내가 먹어 본 음식을 위로)는 다음 단계.
  - **서버** `GET /meals/items/frequent?slot=&limit=12`(`meal-frequent.ts` rankFrequentMealItems, 순수 함수): 최근 90일 기록을 **끼니(entry) 단위**로 세고 최근일수록(반감기 30일)·고른 끼니와 같을수록(×2) 앞에. 값(표기·카탈로그 연결·양)은 가장 최근 기록, 주식/반찬은 2번 이상이면 다수결 — 기록이 한 번뿐인 기본 목록 음식은 기본값(반찬)을 따른다(입력 화면이 새 항목을 '주식'으로 넣던 한 번이 굳지 않게). 모자라면 기본 목록(공기밥·배추김치·깍두기·달걀후라이·김구이·된장국·미역국, 전부 반찬)으로 채우고 카탈로그 연결을 붙인다(없으면 이름만 — 저장 때 서버가 매칭).
  - **shared** `useFrequentMealItems(slot)`(기록 저장 시 무효화), draft 액션 `toggleQuickItem`(같은 이름이면 빼고, 이름이 빈 줄이 있으면 그 자리에 넣는다) + `mealItemNameKey`. 웹 `MealEntryFormPage`·앱 `MealEntryEditor` "먹은 음식" 카드 위에 칩 줄(선택 표시 = 이미 들어 있음).
  - **반찬 구분이 중요한 이유**: 1인분 보정(아래)은 주식만 통상 중량으로 키운다 — 멸치볶음(카탈로그 50g 138kcal)을 주식으로 넣으면 볶음 통상 250g 으로 690kcal. 빠른 추가는 이력·기본값의 반찬 구분을 그대로 싣는다. 직접 입력은 여전히 기본 '주식'이라 입력 줄의 예상 kcal 표시가 다음 후보.
  - `docs/api` 재생성(로그인 95개) — 직전 1인분 보정 커밋에서 빠진 `typical_portion` 근거값도 이번에 함께 반영됐다.
  - 테스트: friendly 식단·음식 30파일 292(순위 5·라우트 1 신규), shared 110(토글 2 신규), web 168(칩 1 신규). Aside 브라우저로 새 기록 화면 칩(기록 3 + 기본 6)·공기밥 → 빈 첫 줄·반찬 확인. 앱 화면 미확인.
- **2026-10-02 — 한 끼 1인분 중량 보정(식약처 원본은 그대로)**: 저녁 기록의 제육볶음이 151kcal 로 남은 걸 확인하다 발견. 카탈로그 1인분은 식약처 '식품중량'을 그대로 썼는데, 이 열은 한 끼 1인분이 아니라 분석 시료·급식 1회 제공량이다(제육볶음 외식 행 100ml, '1인(회)분량 참고량' 열은 비어 있음). 100g당 값은 믿을 만하므로 원본은 고치지 않고 **1인분 중량만 우리 쪽에서 정한다**.
  - **규칙(`food/food-serving.ts` mealServingNutrition)**: ① 어드민 메뉴 어휘 `portion` 에 **음식명**으로 1인분 중량을 정했으면 그것(직접값) ② 카탈로그 1인분이 기준량(100g)보다 크면 그대로 ③ **주식**이면 종류별 통상 1인분(볶음 250g·국 500g … 메뉴 칼로리와 같은 표) × 100g당 → 새 근거값 `typical_portion`, `nutritionFrom` "볶음 통상 1인분 250g" ④ 반찬·통상 중량 모름은 카탈로그 그대로(반찬은 원래 적은 양이 맞다). 같은 계열에서 빌린 영양(donor)은 중량 근거가 없어 손대지 않는다.
  - 메뉴 칼로리 엔진은 이미 "100g 이하는 1인분 아님 + 통상 중량표"를 쓰고 있었고 식단만 빠져 있었다(같은 제육볶음이 메뉴 탭 378kcal, 식단 151kcal). 이번에 어휘 `portion` 의 말로 **음식명**도 받게 해 두 곳이 같이 쓴다 — 음식명 지정이 있으면 메뉴 칼로리도 `per_serving`(지정 중량). 말은 종류 키이거나 카탈로그 음식명이어야 한다(오타 400). 원본 재적재는 어휘 테이블을 건드리지 않는다.
  - 통계의 "추정값" 에 `typical_portion` 을 포함하고 문구를 "추정값(유사 음식·통상 1인분)" 으로, 웹·앱 상세는 "{근거} 기준 추정" 을 같이 보인다. `backfill:meal-nutrition` 은 같은 함수를 쓰게 바꿨고(사용자 인분 수·근거값을 빠뜨리던 것도 수정) dev DB 에 `--refresh` 적용 — 제육볶음 151 → 378kcal, 그날 저녁 합계 약 790kcal.
  - **운영 배포 시**: 마이그레이션 없음(근거값은 문자열 열). 배포 뒤 `backfill:meal-nutrition --dry-run --refresh` 로 바뀔 항목을 보고 `--refresh`. 통상표는 ±30% 근사라 자주 먹는 음식은 어드민 > 음식 > 메뉴 어휘에서 음식명 단위로 지정한다.
  - 테스트: friendly food·meal·추천·인식 29파일 286(1인분 규칙 8·엔진 지정 4·라우트 2·어휘 검증 1 신규), web 39, 메뉴 칼로리 골든셋 정밀도 99.5%(388/390) 그대로.
- **2026-09-29 — 웹 수동 입력 개방(1단계)**: 결정 3 을 일부 번복해 웹에서도 식단을 남긴다. 사용자 결정: ① 1단계만(수동 입력 + 상세·수정·삭제 + 추천→기록) ② 웹은 **수동 입력만** — 사진 촬영·인식·첨부·삭제는 앱에 남긴다 ③ 입력은 모달이 아닌 **별도 주소**.
  - **웹 라우트**: `/me/meals/new`(새 기록) · `/me/meals/:id`(상세 — 수정·다시 기록·삭제) · `/me/meals/:id/edit`(수정). 목록 카드가 상세 링크가 됐고(식당 링크는 상세로 옮김 — 링크 중첩 금지), 헤더에 "기록하기", 추천 카드에 "먹은 메뉴 기록"(이미 기록으로 이어진 추천은 "기록 보기"), 목록 탭은 `?tab=` 으로 주소에 둬 상세에서 뒤로 오면 보던 탭으로 돌아온다.
  - **draft 공유**: 웹도 앱과 같은 `mealDraftStore`(웹은 sessionStorage, 탭 수명)를 쓴다 — 새로고침해도 쓰던 기록이 남고, 탭에 쓰다 만 새 기록은 이어 쓴다(앱과 같은 규칙). 기록→draft 변환 3종(`mealDraftInitFromEntry`·`mealDraftInitForRepeat`·`startMealDraftFromRecommendation`)을 앱 화면에서 shared 로 올려 앱·웹이 같이 쓴다(앱 동작 무변경).
  - **복원 대기 함정**: 앱은 부팅에서 principal 전환을 기다린 뒤 화면을 열지만, 웹은 `/me` 응답 뒤에야 `useCurrentUser` 가 전환한다. 그 전에 draft 를 쓰면 저장되지 않고 전환이 메모리를 비우며 사라진다 → shared 에 "복원까지 끝난 principal" 신호(`useMealDraftReadyPrincipal`, 전환 시작에 null·rehydrate 뒤 채움)를 더하고, 웹 입력 화면과 "수정/다시 기록/먹은 메뉴 기록" 버튼은 그 값이 로그인 사용자와 같을 때만 draft 를 건드린다.
  - **사진 보존**: 웹 수정 저장은 `photoTokens` 를 **보내지 않는다** — 서버가 필드가 없으면 사진 연결을 그대로 둔다(보내면 전량 교체). 기존 사진은 읽기 전용으로만 보인다. 새 기록은 `photoTokens: []`, 출처는 추천이면 `recommendation`, 아니면 `manual`.
  - 테스트: shared 108(+5: 복원 신호 2·변환 3), web 167(+15: 입력 7·상세 5·목록 링크 1·추천→기록 2, 빈 목록 안내 1건은 문구 교체). 웹·앱·shared 타입체크 통과, 변경 파일 lint 신규 경고 0. **화면 육안 확인은 미완**(브라우저 확장 미연결).
- **2026-08-24 — 음식 근거·실동작 검증 보강**:
  - **알레르기 provenance**: 19종 enum을 공통 계약으로 분리하고 `FoodItem`에 `unknown|inferred|verified` 상태를 추가했다. 자동 판정은 음식명이 아니라 공개 재료 문자열만 사용하며 근거 문구를 함께 저장하고, 운영자 검수값은 재적재·백필이 덮지 않는다. 어드민에는 상태 필터·통계·근거 툴팁·재료 편집·19종 검수 UI를 연결했다.
  - **원천 감사 활성화**: 운영 DB를 별도 SQLite online backup으로 보존한 뒤 식약처 영양 1,236건, 한식 800선 800건, 외식 canonical 1,311건을 다시 병합했다. 최종 3,879종 중 재료가 있는 1,138종을 추론(알레르기 가능 1,011, 알려진 항목 없음 127)했고, source observation 28,379건과 검토 대기 conflict 1,545건을 만들었다. 복제본에서 동일 수집 2회째 수치가 늘지 않는 멱등성과 운영 DB `integrity_check=ok`를 확인했다.
  - **평가·E2E**: 개인정보 보호형 v2 디버그 덤프(`photoTokenHashes`, `rawIncluded`)와 legacy 덤프를 함께 읽고, 원문 미보관 성공을 음식 0개로 오해하지 않는 evaluator 및 `--require-raw|--json`을 추가했다. 비운영 DB만 허용하는 E2E는 실제 사진 2장으로 업로드 → gemma4 인식 → lineage 저장 → 통계 → 추천 immutable event/`logged` → 사진 포함 백업·멱등 복원 → 텍스트를 남기는 사진 retention까지 통과했고 합성 사용자·파일을 정리한다.
  - **네이티브·전체 검증**: clean Expo prebuild 후 iOS Release simulator 빌드·설치·실행과 권한 문구 반영을 확인했다. Android JS export는 통과했으나 로컬 Android SDK가 없고 연결된 iPhone은 offline이라 Android native/실기기 카메라·HEIC 확인은 남았다. 전체 typecheck·build 통과, lint 오류 0, friendly 1,063 + shared 65 + web 77 + utils 180 테스트 통과(실데이터 조건부 1건 skip).
- **2026-08-23 — 권장 고도화 일괄 구현**:
  - **기록 안정성·입력 UX**: `(eatenAt,id)` 복합 커서 기반 무한 목록, 달력 월 전환 정합성, 사진 저장 트랜잭션·공통 한도·파일 GC, 재인식 시 사용자가 고친 항목 보존, 외식 장소 선택, 기존 기록을 현재 시각으로 다시 기록하는 빠른 복사를 추가했다. 모든 식단 쓰기와 전체 삭제는 사용자별 공통 FIFO 장벽을 공유해 진행 중 저장이 삭제 응답 뒤 데이터를 되살리지 못하며, 사진 폴더 삭제 실패는 성공으로 숨기지 않고 재호출로 복구한다.
  - **추천 폐쇄 루프**: 추천 카드의 선택 → `이거 먹었어요` 초안 → 저장 성공 시에만 피드백 연결, 추천 출처 스냅샷(`originRecommendationId`), 선택·실제 기록·평가의 시간 감쇠 학습과 수락률 통계를 연결했다. 추천 캐시 적중은 일일 쿼터를 쓰지 않고, 같은 요청은 진행 중 호출을 공유한다.
  - **개인화·발견**: 절대 제외와 소프트 비선호를 분리하고, 저장된 위치의 실시간 날씨·선호 끼니/식사 방식·온보딩을 추천에 반영했다. 추천 음식은 canonical 근거를 우선하는 서버 역검색으로 실제 판매 식당과 연결하고, 근거·거리·비보장 안내를 앱·웹에 동일하게 노출한다.
  - **습관 형성·데이터 권리**: 홈의 오늘 식단 카드, 명시적 권한 요청을 거치는 로컬 끼니 알림, 최근 7일과 직전 7일을 비교하는 비의료적 주간 인사이트, 버전 명시 JSON 내보내기, 확인 문구 기반 전체 식단 삭제를 추가했다. 사진 바이너리는 내보내기에서 제외됨을 명시하고, 계정은 유지한다.
  - **운영 품질 루프**: 인식 스냅샷의 중첩 스키마를 엄격화하고 레거시 데이터는 안전하게 필터링한다. 어드민에는 교정·삭제·수동 추가·미매칭 집계를 추가하되 서로 다른 사용자 2명 이상인 음식명만 노출해 희소 사용자 입력을 보호한다.
  - **계정 전환 격리**: API 요청이 실제 사용한 토큰을 401 처리 경계까지 전달하고 현재 토큰과 같을 때만 자동 로그아웃한다. 자동 로그아웃과 로그인·가입 principal 전환에서 진행 쿼리와 캐시를 제거해 A 계정 식단이 B 계정에 보이거나 A의 지연 401이 B 세션을 끊지 못하게 했다.
  - Prisma 마이그레이션: `20260823160000_add_meal_recommendation_origin`, `20260823170000_add_meal_photo_user_fk`, `20260823180000_add_meal_disliked_foods`. 빈 SQLite DB에서 전체 64개 마이그레이션 순차 적용을 확인했다.
  - 최종 검증: friendly 89파일 1,019건 통과(실데이터 조건부 1건 skip), shared 53건, web 76건 통과. 전체 워크스페이스 typecheck 통과, lint 오류 0건(기존 경고만 유지), `git diff --check` 통과.
- **2026-08-23 — 시간 입력 프리셋**: 시각 이동 수단이 `±30분` 뿐이라 목표가 멀수록 탭이 선형으로 늘었다(밤 11시에 어제 점심 12:40 을 적으면 `◀하루` 1탭 + `-30분` 21탭 = 22탭). 네이티브 시간 피커는 **새 네이티브 의존성 → 재빌드**가 필요해 보류하고, 두 가지로 해결했다. ① **끼니별 '내가 보통 먹는 시각' 칩** — `GET /meals/time-presets` 가 최근 90일 기록의 **중앙값**을 끼니별로 준다(평균은 어쩌다 새벽에 먹은 한 끼가 통째로 끌고 간다). 표본 3건 미만이면 일반값(`MEAL_SLOT_DEFAULT_TIME`)으로 폴백하고 `fromRecords=false` 로 알린다. 야식은 자정을 걸쳐 단순 중앙값이 정오로 튀므로 새벽 시각을 +24시로 펴서 계산하고 되감는다. 칩은 **시각과 끼니를 함께** 정하고 **날짜는 안 건드린다**(`◀하루`로 옮긴 날짜가 되돌아가면 안 된다) → 어제 점심이 2탭. ② **시각 직접 입력** — 시각 텍스트를 탭하면 편집 상태가 되고 `12:40`·`1240`·`840` 을 모두 받는다(형식이 틀리면 조용히 되돌린다). 테스트: friendly 972(중앙값 5·라우트 2), utils 177(파서 6).
- **2026-08-23 — 수동 입력 보조 "지난번대로"**: 자동완성으로 음식을 넣을 때 사진이 같이 붙으면 좋겠다는 요청. 쓸 수 있는 이미지 자산을 재어 보니 ① 식약처 레시피 사진 1,101종은 **인기 음식에 거의 없고**(인기 상위 300종 중 레시피 출처 4종) 조리 예시라 '내가 먹은 것'이 아니다, ② 크롤링한 식당 메뉴 사진은 336개뿐인 제3자 저작물, ③ AI Hub 이미지는 연구용 라이선스라 서비스 노출 불가. → **내가 지난번에 먹은 그 사진**만 쓴다. 라이선스 문제가 없고, 반복 식사가 많은 이 기능 특성상 두 번째부터는 거의 항상 있다. `GET /meals/items/recent?name=` 이 같은 이름(정규화)으로 먹은 최근 기록의 **양·분류·그때 대표 사진**을 돌려주고, 항목 행에 `지난 08/10 · 많이` + 썸네일 + `지난번대로` 버튼으로 보여 준다. **자동으로 붙이지 않는다** — 오늘 먹은 게 지난번과 같게 생겼을 리 없어 자동 첨부는 사실과 다른 기록이 된다. 사진은 참조 공유가 아니라 `POST /meals/photos/:token/copy` 로 **복제**한다(원본 기록을 지워도 새 기록이 멀쩡해야 한다). 복제본은 entryId=null 이라 저장하지 않고 나가면 기존 고아 사진 청소(24시간)가 지운다. 조회는 타이핑 중이 아니라 **이름이 확정된 뒤**에만 부른다. 테스트: friendly 964(라우트 5개 추가 — 정규화 매칭·없음·타인 격리·복제·타인 복제 403).
- **2026-08-23 — 마무리**: meal-photo 기본 모델을 **gemma4:31b** 로 전환(실측 근거는 위 재측정 — 정확도 동률·2배 빠름). AI 설정은 `llm_provider_configs` 가 비어 있어 `.env` 가 유일한 설정원이다(어드민에서 등록하면 DB 가 우선). AI Hub 원본 `kfood.zip`(16GB)은 평가셋 추출(150클래스 × 5장, 91MB)을 확인한 뒤 삭제했다 — 재추출 코드는 docs/data-sources.md 에 있다. `data/open` 은 이제 194MB(food 7.1M · life 96M · eval 91M).
- **2026-08-23 — 표준데이터 대표 행 선택 버그(영양값이 틀렸다)**: E2E 로 실동작을 보다가 김치찌개 1인분이 **93kcal** 로 나오는 걸 발견했다. 원인 둘. ① 대표식품 그룹은 변형까지 묶는다(`김치찌개` 그룹 = 34행: 김치찌개_햄·김치찌개_참치…). 그런데 대표 행을 **식품기원 우선순위만으로** 골라서 이름이 같은 행(`김치찌개` 외식 분석함량 61kcal/100g·400g)이 아니라 임의의 변형(`김치찌개_햄` 가정식 31kcal/100g·300g)이 뽑혔다. ② 우선순위 표의 `/외식\(분석\)/` 이 실제 값 `외식(분석함량)` 과 매칭되지 않아 **재료량 기반 산출값이 실측 분석값을 이기고 있었다** (국물 요리에서 산출값은 체계적으로 낮다 — 김치찌개 실측 61 vs 산출 19kcal). → 대표 행 선택을 `식품명 == 대표식품명` 우선 + `분석함량` 우선으로 고치고, 정규화 수정 뒤 기존 값을 바로잡을 경로(`--refresh-nutrition`, `backfill:meal-nutrition --refresh`)를 만들었다. `upsertFoodSeeds` 는 원래 빈 필드만 채우므로 재적재만으로는 안 고쳐진다. 실측 교정: 김치찌개 93 → **244kcal**(400g), 비빔밥 → 639kcal(450g), 사용자 기록의 라면 528 → 451kcal. 남는 한계: 표준데이터의 `식품중량` 은 급식 기준이 섞여 있어 외식 1인분보다 작을 수 있다(제육볶음 100g). 양(portion) 배수로만 보정한다.
- **2026-08-23 — 재료 활용 + 인식 모델 재측정**: 재료 이름(레시피 출처 1,097종)이 개수만 쓰이고 이름은 안 쓰이고 있었다. **별도 '비선호 재료' 설정을 새로 만들지 않았다** — 기존 `못 먹는/싫어하는 음식` 필드가 이미 '오이, 고수' 같은 재료를 예시로 받고 있어 필드가 둘이면 어느 쪽에 적어야 할지 모호해진다. 대신 `isExcluded` 가 이름뿐 아니라 **카탈로그 재료 목록**까지 보게 했다 (오이 → 오이냉국은 이름으로, 오이가 든 김밥은 재료로 걸린다). 추천 결과에 `ingredients`(최대 5개)를 실어 카드에 주재료를 보여 준다. **평가셋 60장(150클래스에 균등 분포)으로 재측정**: gemma4:31b top-1 55% · 후보포함 68% · 평균 2.4s / qwen3.5:397b top-1 52% · 후보포함 63% · 평균 4.9s. 이전 8장 측정(qwen 75%)은 표본이 '가~' 클래스에 치우쳐 있었다. 표본오차(±6pp)를 감안하면 정확도는 사실상 동률이고 **gemma4 가 2배 빠르다** — meal-photo 기본 모델 재검토 근거. 테스트: friendly 957, web 75, utils 171, shared 45 통과.
- **2026-08-23 — 끼니 영양 표시**: 영양 데이터가 추천 점수 계산에만 쓰이고 사용자에겐 안 보였다. `MealItem` 에 **저장 시점 스냅샷**(kcal·proteinG·sodiumMg·nutritionFrom)을 더한다 — 분류 스냅샷과 같은 결이고, 카탈로그가 나중에 바뀌어도 과거 기록이 흔들리지 않는다. 값은 **1인분 × 양 배수**(small 0.6 / normal 1.0 / large 1.5, `mealPortionFactor`). 비전 모델의 그램 추정은 오차가 커서 서수 3단계만 받는 기존 결정과 이어진다. **커버리지가 100% 가 아니므로**(활성 62%, 대표 한식 80%) 없는 값은 0 이 아니라 null 로 두고, 합계에는 몇 개가 반영됐는지를 항상 함께 보여 준다(`summarizeMealNutrition`/`mealNutritionLabel` 을 @repo/utils 에 두어 앱·웹이 같은 문구를 쓴다). 통계는 `nutrition.avgKcalPerDay`(분모 = **기록이 있는 날**)와 `coverage` 를 함께 내려보낸다. 앱: 목록 카드 한 줄 + 상세 항목별 kcal·추정 출처 + 합계, 통계 타일. 웹: 동일. 기존 기록은 `backfill:meal-nutrition` 으로 채운다(실측 4항목 중 2건 — 나머지는 양념치킨·맥주로 공개 영양이 없다). 테스트: friendly 954, web 75, utils 171, shared 45 통과.
- **2026-08-23 — 영양 커버리지 보강**: 카탈로그 영양이 61%(2,346/3,876)뿐이고 **대표 한식 150종 기준 76%**였다. 원인은 데이터 부재가 아니라 **이름 불일치** — 병합 키가 nameNorm 이라 표준데이터의 `소불고기`가 있어도 외식 어휘 `불고기` 행은 비었다. 한국어 음식명이 head-final 인 점을 이용해 **후보명이 대상명으로 끝날 때만** 1인분 영양을 빌려온다(`소불고기`→`불고기` ⭕ / `불고기피자`→`불고기` ❌). 조리형태가 양쪽에 있으면 일치해야 하고, 조리형태 낱말(구이·볶음·찌개…)은 범주라 건너뛴다. 후보가 여럿이면 **kcal 중앙값에 가장 가까운 행**을 쓴다(불고기 10종이 138~382kcal 로 2.5배 벌어져 '최단 이름' 규칙은 꿩불고기를 뽑았다). 빌려온 행은 `FoodItem.nutritionFrom` 에 `"버섯콩불고기 외 8종 중앙값"` 식으로 출처를 남겨 UI 가 추정임을 밝힌다. 결과 **72행 보강 → 대표 한식 76%→80%**, 카탈로그 61%→62%. 남은 공백(간장게장·보쌈·삼겹살·양념치킨·계란말이…)은 공개 데이터에 어떤 이름으로도 없다 — 외식 브랜드 메뉴는 애초에 영양 공개가 없다. `load:food-catalog --backfill-nutrition [--dry-run]`.
- **2026-08-22 — 1차 기반 구현(미커밋)**: 계약(`schemas/food.ts`·`Routes.Food`·purpose 2개·`OperationFeature` `food-import`) / `@repo/utils` `foodTaxonomy.ts`(2축 키·라벨·원본 분류 매핑·이름 규칙) / Prisma `FoodItem`·`FoodImportConfig`·`FoodImportRun` + 마이그레이션 `20260822105913_add_food_catalog`(prod.db 적용, dev.db 는 `db push`로 동기화) / friendly `modules/food/`(data.go.kr·식품안전나라·MAFRA 어댑터, 정규화 순수 함수 5종, upsert 병합, LLM 2축 분류, 적재 잡 레지스트리·서비스·SSE 라우트, 자동완성·어드민 CRUD·통계) + `plugins/food-import.ts` + `server.ts` 부팅 + `RATE.foodSearch` + env `DATA_GO_KR_API_KEY`/`FOOD_RECIPE_API_KEY`/`MAFRA_API_KEY` / AI purpose 배관(`buildLlmProviderEnv` 헬퍼로 9곳 통합, `isVisionModel` 현행 cloud 멀티모달 패밀리 인식, 어드민 AI 키 행 2개) / `@repo/shared` `foodApi`·`useFood*` 훅 / 웹 `/admin/food`(적재 잡·통계·카탈로그 편집) / 스크립트 `probe:food-api`·`load:food-catalog`. 테스트: friendly 77 파일 884 통과(food 3 파일 30), utils·shared·web 통과, 전 워크스페이스 typecheck 통과.
- **2026-08-22 — 2~5차 구현(브랜치 `feat/meal-food`)**:
  - **2차(앱 입력·사진 인식)**: `schemas/meal.ts` + Prisma `add_meal_log`(MealEntry/Item/Photo/Preference/Recommendation) / friendly `meal`·`meal-recognition` 모듈(사진 저장·썸네일·EXIF 제거·소유 검증·고아 정리 cron, 인식 1콜 + 수리 재시도 + 카탈로그 매칭, 일일 한도·RATE) / `@repo/shared` api·훅·`mealDraftStore` / 앱 `app/meal/*`(사진 5장 순차 업로드 → 인식 → 편집 → 저장, EXIF 촬영시각으로 끼니 추정).
  - **3차(조회·통계)**: 앱 3탭(기록·달력·통계) + 웹 `/me/meals`(로그인 전용, 네비는 로그인 시만). 통계는 순수 함수(`computeMealStats` — 분포는 주식만, 겹침 7일, 연속일).
  - **4차(추천)**: `meal-pattern`(프로필·후보 풀·가중치 점수 7종) + `meal-recommendation`(LLM 선택·이유, 후보 밖 이름 드롭, 부족분 점수 채움, 캐시·폴백) + 앱/웹 추천·설정 화면(가중치 0~5, 프리셋 4종, 제외·선호 음식).
  - **5차 일부**: 실시간 날씨(기상청 초단기실황) 연결, 인식 측정 도구(`MEAL_RECOGNITION_DEBUG` 덤프 + `eval:meal-recognition` + `probe:meal-vision`), 추천 → 맛집 검색("파는 곳 찾기", 앱 맛집 탭 `?q=`).
  - 테스트: friendly 81파일(식단 44건 추가) / 웹 75건 / shared 45건 / utils — 전 워크스페이스 typecheck·lint green.
- **2026-08-22 — 실데이터 검증·시드 완료**:
  - 준비된 데이터가 API 가 아니라 **배포 파일**이라 파일 적재 경로를 더했다(표준데이터 CSV 한글 헤더 매핑 + XLSX 최소 리더). **카탈로그 1,688종 적재 완료**(영양성분 1,236 + 800선 신규 452·병합 348), LLM 분류까지 돌려 3축 모두 채운 행 1,687/1,688, 1인분 영양 1,235행.
  - **인식 실측**(AI Hub 라벨 사진 8장): 프롬프트 v1 → qwen3.5 top-1 63%·후보포함 63% / gemma4 38%·63%. **후보를 강제하는 v2 로 바꾼 뒤 qwen3.5 top-1 75%·후보포함 88%, gemma4 25%·88%**. 파싱 실패 0. `.env` 의 meal-photo 는 qwen3.5:397b(정확도 우선), 속도·비용 우선이면 gemma4:31b.
  - **추론 모델 함정**: think 를 안 보내면 qwen3.5·gpt-oss 가 출력 토큰을 사고에 다 써 content 가 빈다(실측). JSON 을 받는 호출 전부에 thinkOptionForModel 을 실었다 — 영수증 추출도 같은 손해를 보고 있었다.
  - **식품안전나라 레시피 적재 완료**(2026-08-22): 1,156행 → 1,101종(중복 14 제외). 최종 카탈로그 **2,789종**(영양성분 1,236 + 레시피 1,101 + 800선 452), 3축 분류 2,789/2,789, 영양 2,346·재료 1,138·별칭 1,003행. 검색·퍼지 매칭 스모크 통과("김치찌게" → 김치찌개).
  - 실적재로 드러난 것: 레시피 재료 문자열은 첫 줄이 요리명이고 '고명' 같은 섹션 제목이 낀다(제거) / LLM 이 이름 표기를 흔들어 분류 반영이 누락된다(정규화 키로 매칭) / 창작 반찬은 cuisine 을 비워 둔다(레시피 DB 는 korean 폴백).
  - 남은 데이터 소스: MAFRA(패스), **menu-canonical 은 global_menu_canonicals 0행**이라 비어 있다 — 어드민 > AI 분석 관리에서 글로벌 메뉴 병합을 한 번 돌려야 외식 메뉴 어휘가 합류한다.
- **2026-08-22 — 남은 데이터·검증 마무리**:
  - **글로벌 메뉴 병합 실행**: 7,480종 → 5,446 그룹, 1,352 청크 전부 성공(실패 0), categoryPath 100%. 머지 호출도 사고를 끄니 청크 처리량 11/분 → **52/분**(코드 주석이 지목만 하고 안 끄고 있었다).
  - **외식 어휘 합류**: 식당 2곳 이상 1,297 시드 → 989종 신규. **최종 카탈로그 3,778종**(영양성분 1,236 + 레시피 1,101 + 외식 989 + 800선 452), 3축 분류 100%.
  - **노이즈 처리**: 조리형태 'other' 인 외식 어휘 458건은 "고기/반찬/사이드/소스/세트/마늘" 같은 범주어라 **자동완성에는 남기고 추천 후보에서만** 뺐다. LLM 이 비음식을 응답에서 빼 매 실행 재질의하던 것도 버전 표식으로 끊었다.
  - **전 구간 E2E**(`probe:meal-e2e`, 실제 사진·LLM): 업로드 200 → 인식 7.6초(카탈로그 매칭 성공, 후보 3개 제시) → 저장 201 → 통계 200 → 추천 1.8초("최근 7일간 해물탕만 먹었고, 면 요리는 전혀…") → 캐시 재사용 5ms → 피드백 200.
  - 앱 사진 권한 문구를 영수증+식단 둘 다 덮게 수정(적용은 prebuild 후 재빌드).
- **남은 것**:
  1. ~~식품안전나라 레시피~~ / ~~글로벌 메뉴 병합 + 외식 어휘~~ / ~~앱 권한 문구~~ — 2026-08-22 완료.
  2. ~~**앱 재빌드**~~ — 2026-08-24 clean prebuild와 iOS Release simulator 빌드·설치·실행 완료. Android JS export는 완료했으나 이 환경에는 Android SDK가 없어 Gradle native build는 실행하지 못했다.
  3. **실기기 확인** — 카메라 촬영·HEIC·업로드·인식 흐름. 서버 파이프라인은 사진 2장 E2E로 backup/restore/retention까지 확인했고 iOS simulator Release도 실행했지만, 연결된 iPhone이 offline이라 단말 카메라 경로는 남았다.
  4. ~~더 큰 평가셋 재비교~~ / ~~서버 메뉴→식당 역검색~~ / ~~끼니 시간 로컬 알림~~ / ~~`meal`·`food` 위키 컴파일~~ — 2026-08-23 완료.
  5. ~~운영 DB 마이그레이션 적용~~ — 2026-08-23 완료. `20260823160000_add_meal_recommendation_origin`의 선반영 스키마를 migration history와 맞춘 뒤, 사진 소유자 FK와 비선호 음식 분리 마이그레이션까지 `prod.db`에 적용했다.
