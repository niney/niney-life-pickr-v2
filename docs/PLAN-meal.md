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
3. 평소 식단 입력은 **앱(Expo)에서만**, 편의를 위해 **사진 인식**(Ollama Cloud 상위 비전 모델).
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

- [ ] data.go.kr 에서 **전국통합식품영양성분정보(음식) 표준데이터(15100070)** 활용신청(자동승인) → 기존 `BUS_API_KEY` 계정 키 재사용 가능(계정당 1키, 데이터셋별 활용신청). 별도 계정이면 `FOOD_API_KEY=`. (선택) 15127578 식품영양성분DB정보 API 도 신청해 두면 교차검증 가능
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
- 새 purpose 추가 시 건드릴 곳(확인됨): `schemas/ai.ts` enum · `config/env.ts` + `.env.example` · `ai.config.service.ts ALL_PURPOSES` · **`LlmProviderEnv.defaultModels` 리터럴 9곳 + 테스트 픽스처**(→ `buildLlmProviderEnv()` 헬퍼로 1곳에 모으는 리팩터를 1차에 같이) · `utils/aiModel.ts recommendModelForPurpose` · `AdminAiKeysPage PURPOSE_META`. `AdapterCache MAX_ENTRIES=8` 은 5 purpose 로 여유.

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

- **2026-08-23 — 끼니 영양 표시**: 영양 데이터가 추천 점수 계산에만 쓰이고 사용자에겐 안 보였다. `MealItem` 에 **저장 시점 스냅샷**(kcal·proteinG·sodiumMg·nutritionFrom)을 더한다 — 분류 스냅샷과 같은 결이고, 카탈로그가 나중에 바뀌어도 과거 기록이 흔들리지 않는다. 값은 **1인분 × 양 배수**(small 0.6 / normal 1.0 / large 1.5, `mealPortionFactor`). 비전 모델의 그램 추정은 오차가 커서 서수 3단계만 받는 기존 결정과 이어진다. **커버리지가 100% 가 아니므로**(활성 62%, 대표 한식 80%) 없는 값은 0 이 아니라 null 로 두고, 합계에는 몇 개가 반영됐는지를 항상 함께 보여 준다(`summarizeMealNutrition`/`mealNutritionLabel` 을 @repo/utils 에 두어 앱·웹이 같은 문구를 쓴다). 통계는 `nutrition.avgKcalPerDay`(분모 = **기록이 있는 날**)와 `coverage` 를 함께 내려보낸다. 앱: 목록 카드 한 줄 + 상세 항목별 kcal·추정 출처 + 합계, 통계 타일. 웹: 동일. 기존 기록은 `backfill:meal-nutrition` 으로 채운다(실측 4항목 중 2건 — 나머지는 양념치킨·맥주로 공개 영양이 없다). 테스트: friendly 954, web 75, utils 171, shared 45 통과.
- **2026-08-23 — 영양 커버리지 보강**: 카탈로그 영양이 61%(2,346/3,876)뿐이고 **대표 한식 150종 기준 76%**였다. 원인은 데이터 부재가 아니라 **이름 불일치** — 병합 키가 nameNorm 이라 표준데이터의 `소불고기`가 있어도 외식 어휘 `불고기` 행은 비었다. 한국어 음식명이 head-final 인 점을 이용해 **후보명이 대상명으로 끝날 때만** 1인분 영양을 빌려온다(`소불고기`→`불고기` ⭕ / `불고기피자`→`불고기` ❌). 조리형태가 양쪽에 있으면 일치해야 하고, 조리형태 낱말(구이·볶음·찌개…)은 범주라 건너뛴다. 후보가 여럿이면 **kcal 중앙값에 가장 가까운 행**을 쓴다(불고기 10종이 138~382kcal 로 2.5배 벌어져 '최단 이름' 규칙은 꿩불고기를 뽑았다). 빌려온 행은 `FoodItem.nutritionFrom` 에 `"버섯콩불고기 외 8종 중앙값"` 식으로 출처를 남겨 UI 가 추정임을 밝힌다. 결과 **72행 보강 → 대표 한식 76%→80%**, 카탈로그 61%→62%. 남은 공백(간장게장·보쌈·삼겹살·양념치킨·계란말이…)은 공개 데이터에 어떤 이름으로도 없다 — 외식 브랜드 메뉴는 애초에 영양 공개가 없다. `load:food-catalog --backfill-nutrition [--dry-run]`.
- **2026-08-22 — 1차 기반 구현(미커밋)**: 계약(`schemas/food.ts`·`Routes.Food`·purpose 2개·`OperationFeature` `food-import`) / `@repo/utils` `foodTaxonomy.ts`(2축 키·라벨·원본 분류 매핑·이름 규칙) / Prisma `FoodItem`·`FoodImportConfig`·`FoodImportRun` + 마이그레이션 `20260822105913_add_food_catalog`(prod.db 적용, dev.db 는 `db push`로 동기화) / friendly `modules/food/`(data.go.kr·식품안전나라·MAFRA 어댑터, 정규화 순수 함수 5종, upsert 병합, LLM 2축 분류, 적재 잡 레지스트리·서비스·SSE 라우트, 자동완성·어드민 CRUD·통계) + `plugins/food-import.ts` + `server.ts` 부팅 + `RATE.foodSearch` + env `FOOD_API_KEY`/`FOOD_RECIPE_API_KEY`/`MAFRA_API_KEY` / AI purpose 배관(`buildLlmProviderEnv` 헬퍼로 9곳 통합, `isVisionModel` 현행 cloud 멀티모달 패밀리 인식, 어드민 AI 키 행 2개) / `@repo/shared` `foodApi`·`useFood*` 훅 / 웹 `/admin/food`(적재 잡·통계·카탈로그 편집) / 스크립트 `probe:food-api`·`load:food-catalog`. 테스트: friendly 77 파일 884 통과(food 3 파일 30), utils·shared·web 통과, 전 워크스페이스 typecheck 통과.
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
  2. **앱 재빌드**: 권한 문구는 `app.config.ts` 에 들어갔지만 `ios/` 는 gitignored 라 `prebuild` 후 재빌드해야 plist 에 반영된다.
  3. **실기기 확인** — 카메라 촬영·HEIC·업로드·인식 흐름. 서버 파이프라인은 `probe:meal-e2e` 로 실제 사진·LLM 까지 확인했지만(업로드→인식→저장→통계→추천→피드백) 단말 카메라 경로는 남았다.
  4. 더 큰 평가셋으로 인식 모델 재비교(`probe:meal-vision --label-from-filename`, AI Hub 폴더명이 곧 라벨), 서버 쪽 메뉴→식당 매칭(현재는 검색어 전달), 끼니 시간 로컬 알림, 위키 재컴파일(`meal`/`food` 토픽 — `/wiki-compile`).
