---
topic: meal
last_compiled: 2026-10-04
sources_count: 116
status: active
aliases: [식단, 식사기록, meal-log, meal-entry, meal-photo, meal-recognition, 식단인식, meal-recommendation, 식단추천, meal-preference, 알레르기, 식단통계, meal-reminder, 식단알림, meal-backup, 식단백업, photo-retention, 사진보존, MealMutationBarrier, FoodRestaurantMatches, 파는곳찾기, 판매처-탐색, 판매처-바텀시트, restaurant_opened, MealRecommendView, seed-meal-samples, 검증용-씨딩, prod-db-guard, 운영DB-안전장치, expo-document-picker, lazy-native-module, MealDataManagementCard, PLAN-meal, rec-user, MealPhoto-User-FK, FK-위반-테스트, 격리-DB, useIsolatedDatabase, seedAuthUsers, hookTimeout, 외부-API-문서, route-summary, mealDataArchive, mealRecognize, mealRecommend, mealPhotoUpload, 웹-식단-입력, MealEntryFormPage, MealDetailPage, MealItemInputRow, useMealDraftReady, useMealDraftReadyPrincipal, mealDraftInitFromEntry, mealDraftInitForRepeat, startMealDraftFromRecommendation, 같은-메뉴로-새-기록, 빠른-추가-칩, meal-frequent, rankFrequentMealItems, useFrequentMealItems, toggleQuickItem, MEAL_QUICK_DEFAULT_NAMES, typical_portion, 통상-1인분, mealServingNutrition, common-meals, 흔한-한-끼, COMMON_MEALS, MORNING_ONLY_MEALS, filterForSlot, filterForFocus, recommendationFocus, isSideLikeCatalogRow, isExplorableCatalogRow, allergenNameHints, 골고루, probe-meal-recommend, probe-meal-settings, probe-meal-models, check-common-meals, 추천-프로빙, 프롬프트-v5, 최근-추천, recommendationHistory, 추천-삭제, DELETE_MY_MEAL_RECOMMENDATIONS, useDeleteMealRecommendation, 달력-kcal, mealLayout, 데스크톱-두-단, useIsDesktopLg, scrollbar-gutter, 영양-탭]
---

# meal — 개인 식단 기록·인식·추천·휴대성

**2026-09-25~10-04 변경 흡수 — 웹 입력 개방·1인분 보정·빠른 추가·추천 점수/설정 보정과 프로브 3종·흔한 한 끼·프롬프트 v5·최근 추천 UX/삭제·달력 kcal·웹 데스크톱 두 단, 그리고 영양 탭 신설(`b5bfe77`·`9019cf5`·`162024d`·`d035560`·`3fd971b`·`e3afe9c`·`8e32a49`·`f5ebf86`·`51dfa7d`·`d467db0`·`2aaaa7e`·`7056244`·`867eb18`·`186d2bc`·`b09e0a4`, 영양은 `3d067a0`)**: (1) **웹도 손으로 적는다**(`b5bfe77`, 2026-09-29) — [PLAN-meal](../../docs/PLAN-meal.md) 결정 3("입력은 앱에서만")을 일부 번복했다. 사진이 편해서였지 기술 제약은 아니었고 Expo Web 은 이미 입력되는데 웹만 막혀 있었다. 웹 라우트 `/me/meals/new`·`/me/meals/:id`(상세 — 수정·다시 기록·삭제)·`/me/meals/:id/edit`([App.tsx](../../apps/web/src/App.tsx), 전부 `RequireUser`)를 [MealEntryFormPage](../../apps/web/src/routes/meal/MealEntryFormPage.tsx)·[MealDetailPage](../../apps/web/src/routes/meal/MealDetailPage.tsx)·[MealItemInputRow](../../apps/web/src/routes/meal/MealItemInputRow.tsx)(카탈로그 자동완성 — 고르면 `foodId`·분류 부착, 방향키·Enter)가 맡고, 탭은 `?tab=` 주소에 둬 상세에서 뒤로 오면 보던 탭으로 돌아온다. 사진 촬영·인식·첨부는 계속 앱에서만 — 웹 수정 저장은 `photoTokens` 를 **보내지 않아** 서버가 사진 연결을 그대로 둔다(보내면 전량 교체), 새 기록은 `photoTokens: []`. 웹도 같은 `mealDraftStore`(sessionStorage)를 쓰게 되면서 기록→draft 변환 3종(`mealDraftInitFromEntry`·`mealDraftInitForRepeat`·`startMealDraftFromRecommendation`)을 앱 화면에서 [mealDraftStore](../../packages/shared/src/stores/mealDraftStore.ts)로 올렸고, 웹은 `/me` 응답 뒤에야 principal 을 전환하므로 복원 완료 신호 `useMealDraftReadyPrincipal`(→ 웹 [useMealDraftReady](../../apps/web/src/routes/meal/useMealDraftReady.ts))이 true 일 때만 입력 화면·"먹은 메뉴 기록" 버튼이 draft 를 건드린다. `d035560` 은 상세의 기본 버튼을 **수정**으로 바꾸고 "이 식단 다시 기록"을 보조 "같은 메뉴로 새 기록"(설명 "이 기록은 그대로 남아요")으로 내렸다 — 사용자가 다시 기록을 수정으로 읽고 눌러 새 기록이 생겼는데 저장 뒤 원래 기록 상세로 돌아가 "수정이 반영 안 된다"고 보였던 일. 이제 새 기록 저장 뒤엔 방금 만든 기록의 상세로 `replace` 이동(웹·앱 동일). (2) **1인분 중량 보정**(`9019cf5`) — 저녁 제육볶음이 151kcal 로 남았다: 카탈로그 1인분이 식약처 '식품중량'(분석 시료·급식 1회 제공량, 외식 행 100ml)이라서다. `MealService` 저장 경로가 [food-serving](../../apps/friendly/src/modules/food/food-serving.ts) `mealServingNutrition` 을 쓰게 되어 "어휘 portion 음식명 지정 > 카탈로그 1인분(100g 초과) > **주식이면** 종류별 통상 1인분 × 100g당 > 그대로" 로 정하고, 새 근거값 `nutritionBasis='typical_portion'`(`nutritionFrom` "볶음 통상 1인분 250g")이 생겼다. 통계 '추정값' 에 포함, 상세는 "{근거} 기준 추정". 반찬·빌려온 영양(donor)은 손대지 않는다. 운영은 마이그레이션 없이 `backfill:meal-nutrition --dry-run --refresh` → `--refresh`(같은 함수 사용, 빠뜨리던 servings 도 반영) — dev 는 151 → 378kcal. 규칙 자체는 [food](food.md). (3) **빠른 추가 칩**(`162024d`) — `GET /meals/items/frequent?slot=&limit=`(기본 12, 최대 20)을 순수 함수 [meal-frequent](../../apps/friendly/src/modules/meal/meal-frequent.ts) `rankFrequentMealItems` 가 계산: 최근 90일을 끼니(entry) 단위로 세고 반감기 30일·같은 끼니 ×2, 표기·연결·양은 최근 기록, 주식/반찬은 2번 이상이면 다수결, 모자라면 `MEAL_QUICK_DEFAULT_NAMES`(공기밥·배추김치·깍두기·달걀후라이·김구이·된장국·미역국, **전부 반찬**)로 채운다. shared `useFrequentMealItems`(기록 저장 시 무효화, `keepPreviousData`)·draft `toggleQuickItem`(다시 누르면 빠짐, 이름 빈 첫 줄을 채움)을 웹 입력 화면·앱 `MealEntryEditor` 가 같이 쓴다. 반찬 구분을 싣는 이유는 (2)의 주식 환산 때문(멸치볶음을 주식으로 넣으면 138 → 690kcal). (4) **추천 보정 5커밋**(`3fd971b`·`e3afe9c`·`f5ebf86`, 프로브 `8e32a49`·`51dfa7d`) — 가상 사용자 4명의 일주일로 보니 모두·세 끼 거의 같은 "감자 / 시금치 / 가자미식해"(통과 32·확인 15·실패 1)였다. [meal-pattern.service](../../apps/friendly/src/modules/meal-recommendation/meal-pattern.service.ts) 변경: 후보에서 김치·나물 조리형태와 원재료(`mfds-raw`) 제외, 미경험 variety 1 → 0.5(새로움은 novelty 한 곳에서만), 덜 선호 −50%·👎 −40% 를 **최종 점수 배수**로(상한 90%), 아침 무거운 조리형태 ×0.75·그 끼니 습관 ×1.1, 오늘/어제/그제 먹은 음식 ×0.2/0.5/0.8, 카탈로그 후보 정렬을 인기 → 출처 → `사용자|날짜` 씨앗으로(날짜만이면 모든 사용자가 같은 탐색 후보), `filterForSlot`(아침 무거운 요리·점심 이후 아침 전용 음식 빼기)·`filterForFocus`(가장 높은 중요도 4 이상 = "이번 추천의 중심" — 건강이면 건강 요소 중앙값/중립 아래, 균형이면 균형 중앙값 아래를 빼기, 메모의 '가볍·담백·다이어트…'는 건강 중심 추가) 를 LLM·폴백 앞에 둔다. 설정 준수(`e3afe9c`): 알레르기를 이름 단서 `allergenNameHints`(food-allergen `allergensInFoodName`, 검수 행은 비움)로도 걸러 좋아함·내 기록이어도 빼고(깐풍새우 사례), 반찬급 `isSideLikeCatalogRow`(카탈로그 탐색 후보만 — 해파리냉채 26kcal 가 13회 중 12회), 균형은 아는 축만 평균, 건강 판정 영양도 `mealServingNutrition`, 프리셋 '골고루' = 겹침 피하기 3·취향 2·골고루 5·건강 2·새로움 1·날씨 1·간편함 1(새로움 3 이면 '새로운 도전'과 상위 10 이 90~100% 같았다). `f5ebf86` 은 균형을 **조리형태·주재료 두 축**으로 줄였다 — 계통이 섞이면 한식 9할 사용자에게 '골고루' 가 "한식만 아니면 아무거나"(한식 비율 0.72 → 0.39, 머핀·마카로니 샐러드)가 됐다. 프로브 [probe:meal-recommend](../../apps/friendly/scripts/probe-meal-recommend.ts)(A~D 4명)·[probe:meal-settings](../../apps/friendly/scripts/probe-meal-settings.ts)(E, 점수 층 + LLM 층)는 dev.db 에 가상 계정을 실제 라우트로 넣고 리포트를 `data/meal-probe/`(git 제외)에 남긴다 — 결과 48·0·0, 설정 점검 67·19·0(보류 5). (5) **흔한 한 끼·프롬프트 v5**(`2aaaa7e`·`7056244`) — 무 어묵조림·가지전 같은 메뉴가 나와, 탐색 후보를 [common-meals.ts](../../apps/friendly/src/modules/meal-recommendation/common-meals.ts) `COMMON_MEALS`(13무리 209개, 메뉴 어휘 표기 변형 포함)에서 먼저 뽑고 목록 밖은 모자랄 때만, '아침·간식' 무리는 `MORNING_ONLY_MEALS` 로 점심·저녁·야식에서 뺀다. 건강은 찜을 가벼운 가점에서 빼고 전 −0.15·100g당 200kcal 이상 −0.15. `MEAL_RECOMMENDATION_VERSION` 3(알레르기 줄) → 4(반찬·안주·간식 단독 금지) → **5**(프로필 요약에 2주 조리형태·주재료·계통 개수 전부 + '안 먹은 조리형태·주재료' 줄, 균형 태그는 실제로 안 먹은 축에만, 후보 줄에 '볶음 2주 3번', 예시를 부재 주장 아닌 것으로) — 틀린 이유 9/64 → 3/91. [probe:meal-models](../../apps/friendly/scripts/probe-meal-models.ts)(모델만 바꿔 직접 호출, 이유 사실 확인, `--from-raw` 재채점)로 gpt-oss:120b 유지, [check:common-meals](../../apps/friendly/scripts/check-common-meals.ts)(읽기 전용, dev 209 중 163·7·39). (6) **최근 추천 UX·삭제**(`d467db0`·`867eb18`) — 목록이 "최근 5개 − 지금 보는 추천"이라 누를 때마다 순서가 바뀌던 것을 최신순 고정 + '보는 중' 강조로, 고르면 카드로 스크롤·'지난 추천 · 오늘 점심 · 12:30' + [최신 추천으로] 배너·그동안 '다시 추천' 숨김, `shown` 은 새로 받은(또는 진입 때 보인) 추천만. 문구는 shared [recommendationHistory](../../packages/shared/src/meal/recommendationHistory.ts). 삭제는 `DELETE /meals/recommendations/:id`(204)·`DELETE /meals/recommendations`(본문 `DELETE_MY_MEAL_RECOMMENDATIONS`) — 반응 이벤트도 지워 학습·수락률에서 빠지고, 식단 기록·일일 한도는 그대로(지워서 한도를 늘릴 수 없음), `mealMutationBarrier` 안. 원본 추천이 지워진 초안의 저장은 `manual` 로 내려간다. (7) **달력 kcal·데스크톱 두 단**(`186d2bc`·`b09e0a4`) — `GET /meals/calendar` `days[].kcal`(값 있는 항목만 합, 없으면 `null`), 웹 공통 틀 [mealLayout.ts](../../apps/web/src/routes/meal/mealLayout.ts)(lg 1024px 이상 `max-w-6xl` + "본문 | 22rem sticky 패널", `.meal-page` 일 때만 `scrollbar-gutter: stable`). (8) **영양 탭** — 웹 `?tab=nutrition`·앱 '영양' 탭이 기록/달력/통계/추천 뒤·설정 앞에 생겨 탭이 6개(웹 탭바는 좁은 화면에서 아이콘 숨김·가로 스크롤), `MealPreference` 에 선택 입력 `sex`·`birthYear` 가 붙었다(백업 복원이 되살리고, 식단 전체 삭제가 조언 이력 `deleted.nutritionAdvices` 도 지움). 점검·조언 자체는 [meal-nutrition](meal-nutrition.md).

**2026-09-24~09-26 변경 흡수 — 식단 인식 테스트의 FK 실패 수정(`5d7b686`)과 meal 라우트 28개의 외부 문서용 한국어 summary(`1b621c4`), 동작 변경 0**: (1) [meal-recognition.service.test.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.service.test.ts)는 격리 DB([temp-db.ts](../../apps/friendly/src/test-utils/temp-db.ts) `useIsolatedDatabase` — dev.db 를 복사해 `_prisma_migrations` 외 모든 테이블을 `DELETE`)에서 `rec-user` 로 사진을 저장하는데, `MealPhoto.userId → User` FK(마이그레이션 `20260823170000_add_meal_photo_user_fk`)가 생긴 뒤로 그 사용자 행이 없어 FK 위반으로 늘 실패했다(`2ff2c31` 검증 기록의 "전체 실행 실패 2파일" 중 하나). `5d7b686`(2026-09-25)이 `beforeAll` 에서 `app.prisma.user.create({ data: { id: 'rec-user', … } })` 를 먼저 한다. 같은 커밋의 [vitest.config.ts](../../apps/friendly/vitest.config.ts) `hookTimeout: 60_000` 은 격리 DB 준비(dev.db 3.6GB 복사·비우기)가 기본 10초를 넘던 간헐 실패용으로, 격리 DB 를 쓰는 meal 테스트 5파일(meal.route·meal-data.route·meal-daily-quota·meal-recognition.service·meal-recommendation)에도 그대로 적용된다 — 결과 friendly 전체 143파일·1,522 통과. (2) `1b621c4`(2026-09-24): `meal.route.ts`·`meal-recognition.route.ts`·`meal-recommendation.route.ts` 의 모든 라우트 schema 에 한국어 `summary`(필요한 곳은 `description`)가 붙어 [docs/api/endpoints.md](../../docs/api/endpoints.md) meal 절(28개, 전부 인증 '로그인')로 외부에 나간다 — 일일 한도 기본값·사진 규격·백업 한도·확인 문구가 문서에 적혔다(아래 API Surface). 스키마·동작은 그대로(사진 라우트 3개는 한 줄 `schema` 객체를 여러 줄로 펼쳐 summary 를 넣은 것뿐). 같은 라운드의 바다 페이지 신설은 추천의 날씨 연동과 무관하다([weather](weather.md)).

**2026-08-23~24 변경 흡수 — 판매처 탐색 바텀시트(`0906df3`)·검증용 씨딩 운영 DB 안전장치(`037a4f2`)·네이티브 모듈 부재 빌드 가드(`0064ab9`)**: (1) 앱 추천 카드에서 선택·기록·판매처 버튼이 한 줄에 눌려 수십 px 폭으로 찌그러지던 것을 [MealRecommendView](../../apps/mobile/src/components/meal/MealRecommendView.tsx)가 위계를 나눠 고쳤다 — 메뉴 선택·먹은 메뉴 기록은 44pt 이상 버튼으로 분리하고, "파는 곳 찾기" 는 카드 전체 폭 CTA 가 신규 [FoodRestaurantMatches](../../apps/mobile/src/components/meal/FoodRestaurantMatches.tsx)(gorhom `BottomSheetModal`, 스냅 65%/90%, `enableDynamicSizing=false`, 아래로 끌어 닫기)를 연다. 조회 `useFoodRestaurants(foodId, { lat, lng, radiusM: 5_000, limit: 5 })` 는 **시트를 연 뒤에만**(`enabled: opened && !!foodId`) 돌고, 결과보다 먼저 판매 비보장 notice(`FOOD_RESTAURANT_DATA_NOTICE`)를 놓은 뒤 행마다 거리·카테고리·평점·리뷰 수 + '메뉴판 확인'/'리뷰 언급 N' 배지 + 일치 메뉴 2개를 보인다. `foodId` 가 없거나 결과가 비면 `/(tabs)/restaurants?q=음식명` 이름 검색으로 폴백, 행 탭은 `/restaurant/:placeId`. CTA 를 누르면 `restaurant_opened` 이벤트를 남긴다(`onOpened`). 서버 쪽은 [food](food.md) 역검색 정렬이 "근거 등급(메뉴판+리뷰 > 메뉴판 > 리뷰) → 거리" 로 바뀐 것뿐(계약·DB 무변경). (2) [seed-meal-samples.ts](../../apps/friendly/scripts/seed-meal-samples.ts)(`seed:meal-samples <userId> [--yes] [--undo]`) — 추천·통계 화면 검증용 15끼(9일치 `PLAN`)를 `MealService.create` 로 태워 앱과 같은 경로(카탈로그 매칭·분류·영양 스냅샷)를 지나고, memo `[검증용 샘플]` 표식으로 `--undo` 가 정확히 되돌린다. `DATABASE_URL` 이 `prod.db` 로 보이면 `--yes` 없이는 거부하고 사본(`DATABASE_URL="file:/tmp/seed.db"`) 절차를 안내한다 — 실사용 기록과 같은 테이블에 섞이고 구분은 memo 하나뿐이라서(`probe:meal-e2e` 와 같은 결). `--undo` 는 안전한 방향이라 막지 않는다. (3) [MealDataManagementCard](../../apps/mobile/src/components/meal/MealDataManagementCard.tsx)의 `expo-document-picker` 최상위 import 가 네이티브 모듈이 없는 dev client(JS 번들만 갱신)에서 모듈 로드 자체를 터뜨려 설정 탭은 물론 식단 화면 전체가 빈 화면이 됐다(시뮬레이터 실측 — 알레르기·백업·사진 정리 전부 접근 불가) → 파일을 고를 때만 `require` 로 지연 로드(`loadDocumentPicker`)하고 없으면 "이 앱 빌드에는 파일 선택 모듈이 없어요. 앱을 새로 빌드하면 백업 불러오기가 켜집니다." 로 끝낸다(가중치·알레르기·알림·내보내기·사진 정리·전체 삭제는 그대로). [PLAN-meal](../../docs/PLAN-meal.md) 진행 기록 최신: 앱 재빌드(clean prebuild + iOS Release 시뮬레이터) 2026-08-24 완료·운영 DB 마이그레이션 2026-08-23 적용 완료, 남은 것은 실기기 카메라·HEIC·업로드 경로 확인(연결 iPhone offline)과 Android native 빌드(이 환경에 SDK 없음).

**2026-08-22~24 신설·확장**: 로그인 사용자의 식사 기록, 사진 인식, 카탈로그 연결, 선호·알레르기, 추천과 행동 학습, 통계, 로컬 초안·알림, 백업·복원과 사진 보존까지 잇는 개인 도메인이다. 공개/공유 표면은 없고, 건강 진단이 아니라 기록 기반 관찰과 선택 보조에 한정한다.

## Purpose [coverage: high — 20 sources]

- 한 끼를 시각·끼니(`breakfast|lunch|dinner|snack|late_night`)·식사 방식·장소 스냅샷·음식·양·사진·메모로 남긴다. 항목은 수동 입력, [food](food.md) 카탈로그, 사진 인식, 추천에서 올 수 있다. → 2026-09-29 부터 **웹도 수동 입력·상세·수정·삭제**를 한다(사진 촬영·인식·첨부는 앱만). 입력 화면 위 빠른 추가 칩(자주 먹은 음식 + 기본 반찬 7종, 2026-10-02)이 반복 입력을 줄인다.
- 영양 스냅샷은 "한 끼 1인분" 기준이다 — 카탈로그 1인분이 식약처 시료 중량(≤100g)이면 주식은 종류별 통상 1인분으로 환산해 `typical_portion`(추정)으로 밝힌다(2026-10-02).
- 목록은 음식명·장소·메모 검색과 날짜·끼니·식사 방식·출처 필터를 서버 페이지네이션 전에 적용한다. 웹과 앱 모두 같은 무한 목록 계약을 쓴다.
- 앱에서 최대 5장 사진을 업로드하고 vision LLM이 최대 20개 음식을 제안한다. 결과는 바로 확정하지 않고 사용자가 이름·분류·양을 고친 뒤 저장하며, 인식 계보와 원본 스냅샷도 함께 남긴다.
- 최근 90일 패턴, 선호·비선호·제외, 최근 균형, 행동 이벤트, 날씨를 조합해 3~5개 후보를 추천한다. LLM이 실패하거나 설정되지 않아도 결정적 점수 순서로 결과가 남는다. → 2026-10-04 부터 탐색 후보는 "흔한 한 끼" 목록(209개)에서 먼저 고르고, 끼니(아침)·이번 추천의 중심(건강·균형·메모 '가볍게')에 맞지 않는 후보는 LLM 에 넘기기 전에 거른다. 추천 이력은 하나씩·모두 삭제할 수 있다.
- 영양 탭(2026-10-04)에서 기록 기반 영양소 점검과 영양제(성분·형태) 조언을 본다 — 세부는 [meal-nutrition](meal-nutrition.md).
- 선호 알레르기 19종을 추천 후보 이름·재료·카탈로그 근거와 best-effort로 대조한다. 메타데이터가 없다는 사실을 안전하다는 뜻으로 취급하지 않는다.
- 달력(2026-10-04 부터 날짜별 kcal 합 — 웹 데스크톱 칸에 표시), 연속 기록, 반복률, 분포, 영양정보 출처·커버리지, 추천 노출→선택→기록 funnel, 최근 7일 대 직전 7일 인사이트를 제공한다. 비교 표본이 3끼 미만이면 시작 안내만 보여 준다.
- 앱은 계정별 초안·대기 사진·사진 캐시·로컬 알림을 격리한다. 네트워크가 끊긴 동안 고른 사진은 앱 소유 저장소에 두고 재시도할 수 있다.
- 메타데이터 JSON export, 사진까지 포함한 검증 가능한 JSON+base64 백업·멱등 복원, 텍스트를 남기는 사진 보존 정리, 식단 전체 삭제를 제공한다.

## Architecture [coverage: high — 38 sources]

| 층 | 핵심 | 책임 |
|---|---|---|
| 계약 | `packages/api-contract/src/schemas/meal.ts`, `Routes.Meal` | 요청·응답, enum, 제한값, 확인 문자열과 백업 형식의 Zod SSOT |
| 기록 | `meal.route.ts` → `MealService` | 검색·필터·compound cursor 목록, 단건·달력(2026-10-04 날짜별 kcal)·최근 음식·시간 preset과 CRUD; 모든 쿼리를 `userId`로 한정. 저장 시 영양은 [food-serving](../../apps/friendly/src/modules/food/food-serving.ts) `mealServingNutrition`(2026-10-02, 주식 통상 1인분 환산) |
| 빠른 추가 | [meal-frequent.ts](../../apps/friendly/src/modules/meal/meal-frequent.ts) `rankFrequentMealItems` | 최근 90일 끼니 단위 빈도(반감기 30일·같은 끼니 ×2) + 기본 목록 7종(반찬)으로 칩 목록을 만드는 순수 함수(2026-10-02). DB 조회는 `MealService.frequentItems`(최대 3,000행) |
| 사진 | `MealPhotoService` | JPEG 정규화, 원본·320px 썸네일, 소유권·토큰 검증, 복제, 고아·미추적 파일 청소 |
| 인식 | `MealRecognitionService` | vision 호출, 결과 복구 재시도, 카탈로그 exact/alias/fuzzy 매칭, dish lineage·confidence·match 근거 영속 |
| 인식 평가 | `meal-recognition-eval.ts`, `eval-meal-recognition.ts` | 개인정보 보호형 v2·legacy 덤프 파싱, 모델별 호출/파싱과 raw 표본 품질·선택 라벨 집계 |
| 추천 | `MealPatternService` + `MealRecommendationService` | 패턴·균형·선호·날씨 후보 점수화, 알레르기 평가, LLM 선택/fallback, immutable event 학습. → 2026-10-04: 후보 풀(흔한 한 끼 우선·반찬급 제외·`사용자|날짜` 씨앗) → `scoreCandidate`(싫음·끼니·방금 먹음 배수) → `filterForSlot` → `filterForFocus` → LLM(프롬프트 v5)/폴백. 단건·전체 삭제(`remove`·`removeAll`) |
| 추천 후보 목록 | [common-meals.ts](../../apps/friendly/src/modules/meal-recommendation/common-meals.ts) | 사람이 고치는 "흔한 한 끼" 13무리 209개(`COMMON_MEALS`) + 아침·간식 전용(`MORNING_ONLY_MEALS`), `commonMealNorms` 가 메뉴 어휘 표기 변형까지 펼침(2026-10-04) |
| 추천 검증 스크립트 | `probe-meal-recommend`·`probe-meal-settings`·`probe-meal-models`·`check-common-meals` | 가상 사용자(A~D·E)를 dev.db 에 실제 라우트로 넣어 점수 층·LLM 층 점검 / 모델 비교·이유 사실 확인 / 목록-카탈로그 대조(읽기 전용) |
| 영양 점검 | `meal-nutrition` 모듈 | 영양 탭의 점검·영양제 조언 — 이 토픽 밖, [meal-nutrition](meal-nutrition.md) |
| 사용량 | `MealDailyQuotaService` | `(userId,date,purpose)` SQLite 원자적 upsert로 인식·추천의 KST 일일 한도 영속 |
| 통계 | `MealStatsService` + `computeWeeklyMealInsights` | 영양 provenance/coverage, 추천 funnel, 표본 안전한 주간 관찰 |
| 권리·휴대성 | `MealDataService` | metadata export, portable backup/restore, retention preview/delete, 전체 삭제 |
| 파일 삭제 복구 | `MealPhotoDeletion` outbox | retention DB commit과 삭제 의도를 함께 기록하고, 커밋 뒤 strict unlink 및 부팅·매일 재시도 |
| 공통 쓰기 | `mealMutationBarrier` | 같은 사용자의 기록·사진·추천·선호·복원·정리를 FIFO 직렬화; 다른 사용자는 병렬 |
| FE 공통 | `meal.api.ts`, `useMeal.ts`, `mealDraftStore.ts` | React Query 캐시, cursor 페이지, JWT 사진 바이트, 계정별 draft와 플랫폼 저장소 주입. → 2026-09-29~10-04: 기록→draft 변환 3종·복원 완료 신호 `useMealDraftReadyPrincipal`·`toggleQuickItem`, 훅 `useFrequentMealItems`·`useDeleteMealRecommendation`·`useDeleteAllMealRecommendations`, 최근 추천 문구 [recommendationHistory](../../packages/shared/src/meal/recommendationHistory.ts) |
| 앱 로컬 | `mealDraftPhotos`, `mealPhotoCache`, `mealReminders` | 계정 namespace의 대기 업로드, 인증 사진 cache, 로컬 알림 lifecycle |
| UI | 웹 `routes/meal/`, 앱 `app/meal/`·`components/meal/` | 웹은 조회·분석·추천·설정, 앱은 촬영·편집·오프라인 대기·백업·알림까지 전체 흐름. 추천 카드의 "파는 곳 찾기" 는 앱 전용 `FoodRestaurantMatches` 바텀시트(2026-08-24). → 2026-09-29 웹에 수동 입력(`MealEntryFormPage`·`MealItemInputRow`)·상세(`MealDetailPage`) 추가, 2026-10-04 탭 6개(기록/달력/통계/추천/영양/설정), 웹 데스크톱은 공통 틀 [mealLayout.ts](../../apps/web/src/routes/meal/mealLayout.ts) 두 단 |

`mealDraftStore`는 principal이 확정되기 전 읽기·쓰기를 하지 않고 `lp:meal-draft-v1:principal:<id>`에만 저장한다. 계정 전환은 이전 메모리·legacy 초안과 namespace를 동기적으로 버리며, session generation 검사로 늦게 끝난 hydrate가 새 계정을 덮지 못하게 한다. 저장소는 기본 `sessionStorage`(탭 수명), 앱은 entry 에서 `setMealDraftStorage(AsyncStorage)` 를 주입한다([platform-ui-split](../concepts/platform-ui-split.md)). ~~단 웹(`apps/web`)은 입력 UI 가 없어 이 store 를 읽고 쓰지 않는다~~ → **2026-09-29(`b5bfe77`) 부터 웹도 이 store 를 기본 `sessionStorage` 로 읽고 쓴다** — 새로고침해도 쓰던 기록이 남는다. [main.tsx](../../apps/web/src/main.tsx)·`LoginPage.tsx` 의 `setMealDraftPrincipal(null)` 경계는 그대로이고, 실제 계정 전환은 shared [useAuth](../../packages/shared/src/hooks/useAuth.ts)가 `/me`·로그인 성공 뒤에 한다. 앱은 부팅에서 전환을 기다린 뒤 화면을 열지만 웹은 `/me` 응답 전에 화면이 뜨므로, 전환 시작에 `null` 로 비우고 rehydrate 뒤 principal id 를 채우는 모듈 수준 신호(`useSyncExternalStore` 기반 `useMealDraftReadyPrincipal`)를 두었다. 웹 [useMealDraftReady](../../apps/web/src/routes/meal/useMealDraftReady.ts)는 "로그인 사용자 id == 복원 완료 principal" 일 때만 true — 입력 화면은 그 전엔 열지 않고, 상세의 수정·같은 메뉴로 새 기록·추천의 "먹은 메뉴 기록" 버튼도 그 뒤에만 draft 를 건드린다(그 전에 쓴 값은 저장되지 않고 전환이 메모리를 비울 때 사라진다).

**웹 데스크톱 두 단(2026-10-04 `b09e0a4`)** — 식단 페이지가 모바일 기준 한 단(896px)이라 데스크톱에서 영양제 조언·설정 저장·추천 결과가 첫 화면 밖이었고, 상세·입력은 `max-w-2xl` 가운데 정렬이라 목록에서 넘어가면 제목이 약 250px 옮겨 갔다. [mealLayout.ts](../../apps/web/src/routes/meal/mealLayout.ts) 상수 4개(`MEAL_PAGE_CLASS`·`MEAL_SPLIT_CLASS`·`MEAL_MAIN_CLASS`·`MEAL_SIDE_CLASS`)를 목록·상세·입력·수정이 모두 써 제목 자리가 같고, lg(1024px) 이상에서만 `max-w-6xl` + "본문 | 22rem 패널"(패널은 상단바 아래 sticky, 길면 패널 안 스크롤). 패널은 늘 맥락·동작 자리 — 기록: 검색·필터 + 최근 7일(데스크톱에서만 요청, [useMediaQuery.ts](../../apps/web/src/lib/useMediaQuery.ts) `useIsDesktopLg`), 본문은 날짜 묶음 카드 안 한 줄 행(첫 화면 4 → 10끼) / 달력: 고른 날(데스크톱은 오늘 기본), 칸에 그날 kcal / 추천: 조건·최근 추천 / 영양: 점검 | 조언 / 설정: 카드 2×2 + 바뀐 게 있으면 화면 아래 저장 줄(좁은 화면도) / 상세: 식당·메모·버튼 / 입력: 언제·어떻게, 저장 줄은 데스크톱에서 하단 고정. 좁은 화면은 한 단 그대로(`lg:` 접두로만). 스크롤바 출몰로 본문이 7px 흔들리던 것은 [global.css](../../apps/web/src/styles/global.css) `html:has(.meal-page) { scrollbar-gutter: stable; }` — 지도처럼 꽉 채우는 페이지에 빈 줄이 생기지 않게 전역이 아니다.

앱의 대기 사진은 picker/camera URI를 먼저 `documentDirectory/meal-draft-photos-v1/files`로 복사하고 `pendingPhotos`에 남긴다. 한 장씩 단일-flight로 올려 성공 토큰만 승격하며, 남은 대기/누락 사진이 있으면 인식과 저장을 막는다. 서버 사진 캐시는 별도의 `cacheDirectory`와 auth-token fingerprint를 쓰고, 모든 다운로드에 Bearer를 붙인다.

인증 주체 전환은 전역 private-cache 경계다. 공통 API client가 요청 시작 token과 401 callback을 캡처하고 응답 시 현재 token과 같을 때만 세션을 정리한다. 웹·앱은 유효한 현재 세션의 401에서 QueryClient 요청을 취소하고 캐시를 비우며, 로그인/가입 성공도 새 principal을 넣기 전에 기존 query를 취소·제거한다.

## Talks To [coverage: high — 19 sources]

- **[food](food.md)** — 이름 매칭, 분류·영양·알레르기 근거, 추천 후보와 식당 역검색을 소비한다. meal은 이름·영양·매칭 근거를 확정 시점 스냅샷으로 남긴다. 판매처 탐색(`useFoodRestaurants`, 반경 5km·5곳)은 2026-08-24 부터 근거 등급이 거리보다 먼저 정렬되며, 결과는 수집 근거이지 현재 판매 보장이 아니다. → 2026-10 새로 기대는 것: 저장·백필·추천 건강 판정이 함께 쓰는 [food-serving](../../apps/friendly/src/modules/food/food-serving.ts) `mealServingNutrition`·`kcalPer100gOf`(`FoodService.getServingRow`·`servingLexicon` 10분 캐시가 판정용 행·어휘 제공), 알레르기 이름 단서 [food-allergen](../../apps/friendly/src/modules/food/food-allergen.ts) `allergensInFoodName`(추천 후보 필터 전용 — 카탈로그 메타·화면 경고에는 안 씀), 흔한 한 끼의 표기 변형을 펼치는 메뉴 어휘 `synonymVariants`. 카탈로그 표기 정정(식약처 대표식품명·분식 분류)도 추천·자동완성에 그대로 반영된다.
- **[meal-nutrition](meal-nutrition.md)** — 같은 `/meals` 접두의 영양소 점검·영양제 조언 모듈(2026-10-04). meal 쪽 접점은 `MealPreference.sex`·`birthYear`(설정 탭에서 입력), 영양 탭(웹 [MealNutritionTab](../../apps/web/src/routes/meal/MealNutritionTab.tsx)·앱 [MealNutritionView](../../apps/mobile/src/components/meal/MealNutritionView.tsx)), 식단 전체 삭제가 조언 이력까지 지우는 것, 그리고 한 끼 후보가 이 토픽의 흔한 한 끼 목록을 재사용하는 것.
- **AI provider** — 인식은 전용 purpose `meal-photo`(vision), 추천은 `meal-recommend`(text)를 쓴다(`cc8399a`; 서비스가 `aiConfig.getResolved('ollama-cloud', 'meal-photo' | 'meal-recommend')` 로 해석 — 영수증 `image`/일반 `chat` 과 모델·동시성 게이트를 분리해 독립 튜닝. 2026-08-30 정정). model/version을 저장하는 [versioned-llm-prompts](../concepts/versioned-llm-prompts.md) 인스턴스이며 provider 실패에도 추천 fallback은 동작한다. → 추천 프롬프트는 2026-10-04 하루에 v3(알레르기 줄)·v4(반찬·안주·간식 단독 금지)·v5(2주 분포 전체·'안 먹은 축' 줄·후보 줄 '볶음 2주 3번')로 올랐다(`MEAL_RECOMMENDATION_VERSION = 5`, `promptVersion` 열이 이벤트의 `rankingVersion` 으로 실린다). dev `meal-recommend` 모델은 gpt-oss:120b — kimi-k3 는 3배 느리고 틀린 주장이 많아 유지 권장(probe:meal-models).
- **날씨/대기 위치** — 저장 위치 또는 요청 좌표가 있으면 기상청 현재 날씨를 추천 context에 넣고, 실패하면 계절 fallback을 쓴다.
- **operation-log** — 인식·추천의 모델/단계/실패를 범용 작업 로그에 남긴다. 사진·메모·사용자 식별자는 어드민 품질 aggregate에 노출하지 않는다([operation-log-instrumentation](../concepts/operation-log-instrumentation.md)).
- **SQLite quota + route rate limit** — 인식·추천의 일일 사용자 quota는 DB에 남아 재시작을 우회하지 못한다. 추천 cache hit와 같은 요청의 in-flight join은 다시 소비하지 않고, `force` cache miss는 소비한다. multipart/route 제한은 별도로 겹친다.
- **앱 파일·알림 API** — Expo FileSystem/DocumentPicker/Sharing/Notifications로 대기 사진, backup 파일, 로컬 일일 알림을 다룬다. 알림은 서버·다른 기기와 동기화하지 않는다.

관련 횡단 결정은 [zod-ssot-buildless](../concepts/zod-ssot-buildless.md), [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md), [platform-ui-split](../concepts/platform-ui-split.md), [versioned-llm-prompts](../concepts/versioned-llm-prompts.md)에 연결된다. 단, 영속 일일 quota는 메모리 singleton이 아니라 SQLite가 진실이다.

## API Surface [coverage: high — 23 sources]

전부 Bearer 로그인 필수이며 공개·공유 API가 없다.

| 메서드 | 경로 | 역할 |
|---|---|---|
| `GET` / `POST` | `/api/v1/meals` | 날짜·slot·mealType·source·`q` 검색/필터 + `(eatenAt,id)` cursor 목록 / 기록 생성 |
| `GET` / `PATCH` / `DELETE` | `/api/v1/meals/:id` | 소유자 단건 조회·전량 교체 성격 수정·삭제 |
| `GET` | `/api/v1/meals/calendar`, `/stats`, `/time-presets`, `/items/recent` | 달력·기간 통계·개인 시각 preset·최근 음식 보조. 달력 `days[]` 에 2026-10-04 `kcal`(number \| null) 추가 — 기존 필드 그대로라 옛 앱은 무시 |
| `GET` | `/api/v1/meals/items/frequent?slot=&limit=` | 2026-10-02 — 빠른 추가 칩. `limit` 1~20(기본 12), 응답 `items[]`(`name`·`foodId`·분류 3종·`isMain`·`portion`·`servings`·`portionSource`·`count`·`lastEatenDate`·`from: history\|default`) |
| `POST` / `GET` / `DELETE` | `/api/v1/meals/photos...` | 업로드, JWT 원본·썸네일, 독립 복제, 고아 토큰 삭제 |
| `POST` | `/api/v1/meals/recognize` | 소유 사진 토큰 배열 동기 인식 |
| `GET` / `PUT` | `/api/v1/meals/preference` | 기본값 합성 조회 / 알레르기 포함 사용자당 1행 upsert |
| `GET` / `POST` | `/api/v1/meals/recommendations` | 최근 이력 / 추천 생성(`force`는 cache 우회) |
| `DELETE` | `/api/v1/meals/recommendations` | 2026-10-04 — 본문 `{ confirmation: 'DELETE_MY_MEAL_RECOMMENDATIONS' }`(strict) 후 추천·반응 이벤트 전체 삭제, 응답 `deleted.{recommendations,recommendationEvents}` |
| `DELETE` | `/api/v1/meals/recommendations/:id` | 2026-10-04 — 단건 삭제 204, 남의 것·없는 것 404. 이벤트도 함께, 그 추천으로 만든 식단 기록은 유지 |
| `GET` | `/api/v1/meals/recommendations/context` | 기록 수·최근 음식·선호·최신 추천 진입 context |
| `POST` | `/api/v1/meals/recommendations/:id/events` | 후보 노출·선택·평가·식당 열기·dismiss 이벤트; client의 `logged` 제출은 금지. 웹 추천 탭([MealRecommendTab](../../apps/web/src/routes/meal/MealRecommendTab.tsx))은 추천 id 당 `shown` 1회(`platform:'web'`, `shownEventIds` ref 로 중복 차단, 실패 시 ref 에서 빼 재시도 허용; 2026-10-04 부터 목록에서 다시 연 지난 추천(`viewingPast`)엔 보내지 않음); 앱 판매처 CTA 는 `restaurant_opened` |
| `POST` | `/api/v1/meals/recommendations/:id/feedback` | 구버전 호환 latest projection 갱신 |
| `GET` | `/api/v1/meals/data/export` | 사진 binary가 없는 metadata JSON 스냅샷 |
| `GET` / `POST` | `/api/v1/meals/data/backup[/restore]` | version 1 JSON+base64 백업 / 참조·hash 검증 후 멱등 추가 복원 |
| `GET` / `DELETE` | `/api/v1/meals/data/photos/retention` | 대상·용량 preview / `DELETE_OLD_MEAL_PHOTOS` 확인 후 텍스트 보존 사진 정리 |
| `DELETE` | `/api/v1/meals/data` | `DELETE_ALL_MY_MEAL_DATA` 확인 후 도메인 전체 삭제; 계정 유지 |

사진은 `<img src>`에 Bearer header를 실을 수 없어 인증 fetch 후 웹은 object URL, 앱은 인증 cache의 `file://` URI를 쓴다. 목록 cursor는 opaque이고 구버전 ISO cursor는 읽기 호환만 제공한다.

**외부 문서(2026-09-24 `1b621c4`)** — 위 표의 라우트 28개가 `export:openapi` 로 [docs/api/endpoints.md](../../docs/api/endpoints.md) meal 절에 나간다(인증 열 전부 '로그인'). 한도 열이 채워진 건 6개 — 백업·복원 10/시간(`RATE.mealDataArchive`), 사진 업로드·복제 30/분(`mealPhotoUpload`), 인식·추천 생성 10/분(`mealRecognize`·`mealRecommend`, [rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts)). summary/description 이 적은 값은 코드와 일치한다(2026-09-26 대조): 인식 일일 30회·추천 20회(`MEAL_RECOGNIZE_DAILY_LIMIT`·`MEAL_RECOMMEND_DAILY_LIMIT` 기본값, [env.ts](../../apps/friendly/src/config/env.ts), KST 자정 기준, 초과 429, 추천 캐시 히트 미차감·`force` 는 차감), 사진 multipart 1개 5MB([multipart.ts](../../apps/friendly/src/plugins/multipart.ts))·HEIC 수용·긴 변 1600px JPEG 재인코딩·EXIF 제거·썸네일 320px·24시간 안에 기록에 안 붙은 업로드 자동 정리·사용자당 3,000장 초과 409, 백업은 기록 5,000·추천 1,000·사진 100장(합계 50MB) 초과 413·복원 본문 JSON 최대 75MB, 확인 문구 `DELETE_OLD_MEAL_PHOTOS`/`DELETE_ALL_MY_MEAL_DATA`. 표에 없던 의미도 문서에 드러났다 — `PATCH /meals/:id` 는 `items`·`photoTokens` 를 보내면 전량 교체, `PUT /preference` 는 보낸 필드만 갱신(서비스가 현재 행과 병합 후 upsert), `GET /items/recent?name=` 은 음식명으로 지난번 섭취(마지막 날짜·양·분류·그때 사진 토큰), `POST /recognize` 는 `placeId` 를 주면 그 식당 메뉴를 힌트로 쓰고 모델 미설정이면 503. 파이프라인·규약은 [api-docs](api-docs.md).

**2026-10-04 기준 외부 문서** — meal 절은 34개: 위 28개 + `GET /items/frequent`·`DELETE /recommendations`·`DELETE /recommendations/:id`(이 토픽) + `GET /nutrition`·`GET`·`POST /nutrition/advice`([meal-nutrition](meal-nutrition.md)). 새 3개는 한도 열이 비어 있다(라우트 전용 rate limit 없음 — 전체 삭제는 확인 문구, 단건은 소유권 검사로만 막는다). 추천 단건 삭제 description: "같은 날짜·끼니로 다시 요청하면 저장된 추천 대신 새로 만들어 일일 한도를 1회 차감한다". `nutritionBasis` enum 에 `typical_portion` 이 붙은 것도 `162024d` 의 재생성에서야 [openapi.json](../../docs/api/openapi.json)에 반영됐다(직전 `9019cf5` 는 재생성 누락).

## Data [coverage: high — 22 sources]

| 모델/형식 | 핵심 데이터와 수명 |
|---|---|
| `MealEntry` | `userId`, UTC `eatenAt` + 로컬 `eatenDate`, slot/type/place snapshot/memo/source/originRecommendationId, `photoPurgedAt`. `originRecommendationId` 는 FK 가 아닌 출처 스냅샷 — 추천을 지워도 남는다(2026-10-04) |
| `MealItem` | 이름·분류·양·source·`foodId` 힌트, kcal/protein/sodium snapshot, `nutritionBasis=direct|donor_estimate|typical_portion|missing`(`typical_portion` 2026-10-02 — 문자열 열이라 마이그레이션 없음), `nutritionFrom`(예: "볶음 통상 1인분 250g"), recognition lineage·confidence·match 근거 |
| `MealPhoto` | token, `userId`, nullable `entryId`, 크기·byte·순서. 원본과 thumb는 사용자 전용 디렉터리 |
| `MealPreference` | 사용자당 1행, 가중치·liked/disliked/excluded, 19종 allergens, 허용 mealTypes/slots. 2026-10-04 선택 열 `sex`(`male|female`)·`birthYear`(1900~2100) — 영양 점검 섭취기준용(마이그레이션 [20261004060205_add_meal_nutrition](../../apps/friendly/prisma/migrations/20261004060205_add_meal_nutrition/migration.sql)), PUT 에서 `null`=지움·생략=유지, 백업 복원이 되살림(옛 백업은 비움) |
| `MealNutritionAdvice` | 2026-10-04, 영양제 조언 저장본 — 구조·수명은 [meal-nutrition](meal-nutrition.md). meal 관점에선 식단 전체 삭제 대상(`deleted.nutritionAdvices`)이라는 것만 |
| `MealRecommendation` | 후보/context/profile, model/version/fallback, latest `feedbackJson`; 반응 없는 옛 행만 제한 정리 |
| `MealRecommendationEvent` | `shown|candidate_picked|set_rated|candidate_rated|restaurant_opened|logged|dismissed` 불변 이벤트, candidate/rank/rating/platform/rankingVersion |
| `MealDailyQuota` | `(userId,date,purpose)` unique count. DB 재시작 뒤에도 인식·추천 일일 한도를 유지 |
| `MealDataImport` | `(userId,archiveId)` 복원 결과 ledger. 같은 archive의 재전송을 중복 생성 없이 응답 |
| `MealPhotoDeletion` | `userId+token` unique, attempts/lastError. User FK 없이 전체 삭제 뒤에도 파일 재시도 가능 |

영양 합계는 kcal가 알려진 항목만 더하므로 coverage와 provenance를 반드시 함께 읽는다. `mainItemCoverage < 0.6`이거나 영양 표본이 없으면 일평균은 `null`; direct/estimated/missing 항목 수와 `averageReliable`가 화면의 신뢰 경계다. 값이 있는 항목만 합친 합계도 실제 섭취량보다 작을 수 있다. 2026-10-04 달력 `days[].kcal` 도 같은 규칙(값 있는 항목만, 하나도 없으면 `null`, 반올림) — 없는 값을 0 으로 채우면 '안 먹었다'가 되기 때문이다([unknown-vs-zero](../concepts/unknown-vs-zero.md)). 통계의 '추정값' 개수는 `donor_estimate` + `typical_portion`, 문구 "추정값(유사 음식·통상 1인분)".

**1인분 결정 순서(2026-10-02, `mealServingNutrition`)** — ① 메뉴 어휘 portion 에 음식명 지정이 있으면 그 중량 ② 카탈로그 1인분 중량이 100g 초과면 그대로(`direct`) ③ **주식(`isMain`)이면** 종류별 통상 1인분 × 100g당(`typical_portion`) ④ 반찬이거나 통상 중량을 모르면 카탈로그 그대로. 빌려온 영양(`donor_estimate`)은 중량 근거가 없어 손대지 않고, 단백질·나트륨은 카탈로그 1인분 중량이 있을 때만 100g당을 역산한다. 같은 규칙이 저장(`MealService`)·백필([backfill-meal-nutrition.ts](../../apps/friendly/scripts/backfill-meal-nutrition.ts))·추천 후보 건강 판정(`isMain: true` 고정)에 쓰인다 — 그래서 사용자가 고르는 **주식/반찬 구분이 kcal 을 바꾼다**(빠른 추가 기본 목록이 전부 반찬인 이유).

**빠른 추가 집계** — `MealItem` 을 최근 90일·최대 3,000행(최신순)만 읽어 `nameNorm`(없으면 trim 이름)으로 묶는다. 한 끼에 같은 음식이 여러 줄이면 한 번만 센다. 기록이 1번뿐이고 기본 목록에 있는 음식은 `isMain=false` 로 고정 — 입력 화면이 새 항목을 '주식'으로 넣던 시절의 한 번이 굳지 않게. 기본 목록은 카탈로그에서 `nameNorm` 으로 찾아 연결을 붙이고, 없으면 이름만(저장 때 서버가 다시 매칭).

인식 결과는 각 dish의 UUID `recognitionDishId`, 선택 후보 rank, `catalogMatchedBy`, score, confidence를 draft에서 최종 `MealItem`까지 보존한다. 품질 비교는 lineage를 최우선으로 하고, 구형 데이터만 food/name 및 마지막 order fallback을 쓴다. confidence bucket은 low `<0.4`, medium `<0.75`, high 그 이상이다.

portable backup은 `format='niney-life-pickr.meal-backup'`, `version=1` JSON이다. 연결 사진 JPEG를 canonical base64로 넣고 byteSize·SHA-256·모든 참조를 strict 검증한다. 최대 사진 100개/개별 5MB/합계 50MB/JSON 75MB, 기록 5,000개, 추천 1,000개, 추천당 이벤트 200개다. 복원은 새 id/token을 만들고 기존 preference는 유지한다.

## Key Decisions [coverage: high — 35 sources]

- **2026-09-29 — 웹 입력은 1단계(수동만)·별도 주소·같은 draft store** — 사용자 결정: ① 수동 입력 + 상세·수정·삭제 + 추천→기록만 ② 사진 촬영·인식·첨부·삭제는 앱에 남김 ③ 모달이 아닌 별도 주소. 입력만 열면 오타를 웹에서 못 고치므로 상세·수정·삭제를 한 묶음으로 열었다. 웹 수정은 `photoTokens` 를 생략해 사진을 건드리지 않는다(기존 사진은 읽기 전용 표시). 기록→draft 변환은 shared 로 올려 앱·웹이 한 구현을 쓴다(앱 동작 무변경).
- **2026-10-04 — 상세의 기본 동작은 수정, 새 기록 저장 뒤엔 새 기록 상세로** — 버튼 위계가 의미를 정한다: 맨 앞 기본 버튼을 사용자는 "고치기"로 읽는다. 새 기록 저장 뒤 들어온 화면(원래 기록 상세)으로 돌아가면 저장이 안 된 것처럼 보이므로 `replace` 로 새 상세에 간다. 수정 저장은 종전대로 들어온 화면.
- **2026-10-02 — 원본 영양은 고치지 않고 1인분 중량만 우리 쪽에서 정한다** — 식약처 100g당 값은 믿을 만하고 '식품중량'만 한 끼 양이 아니다('1인(회)분량 참고량' 열은 비어 있다). 메뉴 칼로리 엔진은 이미 "100g 이하는 1인분 아님 + 종류별 통상 중량"이었고 식단만 빠져 같은 제육볶음이 메뉴 탭 378kcal·식단 151kcal 였다. 추정임은 `typical_portion` + 근거 문구로 밝힌다.
- **2026-10-02 — 빠른 추가 칩은 "누르면 항목, 다시 누르면 빠짐"·주식/반찬까지 싣는다** — 매번 다시 치는 공기밥·김치가 입력 시간의 대부분. 반찬 구분을 실어야 1인분 보정이 반찬을 주식 중량으로 키우지 않는다. 공기밥 기본 구분도 반찬 — 통계 음식 분포가 주식만 세서 밥으로 쏠리지 않게.
- **2026-10-04 — 추천 품질은 가상 사용자 프로브로 판정하고, 점수만으로 못 막는 건 LLM 앞 필터로** — 점수 감점만으로는 LLM 이 후보 안에서 그대로 골랐다(아침 스테이크, '가볍게·건강' 저녁에 양념 돼지고기튀김). 그래서 `filterForSlot`·`filterForFocus` 가 LLM·폴백 후보를 거르되, 좋아함·그 끼니 습관은 남기고 3개 미만이면 뺀 것을 뒤에 붙인다(빈 추천 방지). 싫다는 신호는 취향 감점이 아니라 **최종 점수 배수** — 안 먹어 본 음식은 taste 가 이미 0 이라 감점이 듣지 않았다. 판정은 점수 층(결정적)과 LLM 층(여러 번)을 나눠 본다.
- **2026-10-04 — 탐색 후보는 사람이 고치는 "흔한 한 끼" 목록에서 먼저** — 인기도가 전부 0 인 dev 카탈로그에서 식약처 1,236행을 고르게 섞으면 반찬·지역·희귀 메뉴가 김치찌개만큼 나왔다. 목록 밖은 모자랄 때만, 내 기록·좋아함은 목록과 무관. 후보 풀 60·80 확대는 기각. 운영 카탈로그(식당 메뉴 정규명)에만 있는 이름은 `check:common-meals` 로 운영에서 확인한다.
- **2026-10-04 — '골고루'는 조리형태·주재료 두 축, 계통은 LLM 요약으로만** — 계통 축은 한식 9할 사용자에게 "한식만 아니면 아무거나"로 작동했다. 균형 필터 강화(상위 1/3)·프롬프트 보강은 효과가 미미하거나 끼니 품질을 떨어뜨려 기각. 판정 지표도 "균형 평균 ↑" 에서 "최근 1위 조리형태·주재료와의 겹침 ↓" 로 바꿨다(`51dfa7d`).
- **2026-10-04 — 알레르기 이름 단서는 추천 후보 필터에만** — 재료·표시 근거가 있는 카탈로그 행이 dev 에 0 이라 서버 판정이 사실상 꺼져 있었고 프롬프트에도 알레르기가 없었다(좋아함 '깐풍새우'가 1번). 이름 단어로 거르되 카탈로그 메타·화면 경고에는 쓰지 않는다 — 배합 보장이 없고 모든 카드에 '돼지고기·밀'이 붙는다. 검수 행은 이름 단서 없음.
- **2026-10-04 — '안 드셨다'는 근거가 있는 것만** — 틀린 이유가 모두 먹은 조리형태를 안 먹었다고 한 것이었다. 원인은 요약이 상위 3개만 보여 주고 균형 태그가 먹은 축에도 붙고 예시 문장이 부재 주장이었던 것. 프롬프트 v5 는 2주 분포 전체 + 안 먹은 축 줄 + 후보 줄 개수를 주고 그 범위 안에서만 말하게 한다. "흔히 먹는 메뉴 우선" 문구는 '내 취향대로' 에서도 새 메뉴를 고르게 해(먹던 음식 78% → 42%) 넣지 않았다.
- **2026-10-04 — 최근 추천 목록은 순서 고정, '지난 추천 보는 중'은 사용자가 고른 경우만** — 같은 날·끼니 재요청으로 캐시된 예전 추천이 돌아온 건 지금 요청한 것이라 '지난 추천'이 아니다. 목록에서 다시 여는 건 새 노출이 아니므로 `shown` 을 보내지 않는다(funnel 분모 보호).
- **2026-10-04 — 추천 삭제는 숨기기가 아니라 완전 삭제 + 모두 삭제, 둘 다 확인창** — 사용자 결정. 이벤트까지 지워 학습·수락률에서 빠지게 하되, 식단 기록(출처 스냅샷)·일일 한도는 남겨 지워서 한도를 늘릴 수 없게 했다. 원본 추천이 사라진 초안이 저장을 못 하면 먹은 사실까지 막히므로 `manual` 로 강등(남의 추천 id 는 그대로 400).
- **2026-10-04 — 웹 데스크톱만 두 단, 모든 식단 화면이 한 틀** — 사용자 결정: lg 이상에서만 같은 틀 + "왼쪽 본문 | 오른쪽 맥락·동작 패널", 기록 목록은 한 줄 행. 좁은 화면 배치는 `lg:` 접두로만 바꿔 그대로 둔다(그 대가로 좁은 화면에서 상세의 식당 카드가 음식·사진 뒤로, 입력의 사진 카드가 먹은 음식 바로 뒤로 온다).

- **2026-08-24 — 판매처 탐색은 카드 안 목록이 아니라 독립 바텀시트, 열어야 조회** — 추천 카드 폭에 식당 목록까지 펼치면 선택·기록·판매처 세 액션이 서로 찌그러지고 판매 여부가 과장돼 읽힌다. 전체 폭 CTA → `BottomSheetModal`, 시트가 열릴 때만 `useFoodRestaurants` 를 enabled(추천 카드가 마운트만으로 역검색을 후보 수만큼 부르지 않게), 비보장 notice 를 결과 위에 고정, 근거 배지를 이름과 함께 보인다.
- **2026-08-23 — 검증 씨딩은 서비스 경로를 그대로 타되 운영 DB 는 명시 승인** — 씨딩이 앱과 다른 경로면 검증 가치가 없어 `MealService.create` 를 쓴다(1끼일 땐 "기록이 적어 근거가 약해요", 15끼면 "돼지고기 비중 32%" 류 근거·커버리지까지 검증됨). `prod.db` 감지 시 `--yes` 없이는 거부하고 사본을 안내, 되돌리기는 막지 않는다.
- **2026-08-23 — 새 네이티브 모듈은 사용 시점 지연 로드로 격리** — JS 번들만 갱신된 빌드에서 최상위 import 하나가 화면 전체를 죽이지 않도록 `require` 를 실제 동작 시점으로 미루고 없으면 안내로 끝낸다. 네이티브 모듈이 실린 빌드에서는 동작 동일.
- **확정 전 인간 교정 + lineage** — vision 출력은 draft 제안이다. 원본 snapshot과 최종 항목 사이의 dish id·match·confidence를 보존해 순서 변화에도 교정 품질을 비교한다.
- **카탈로그는 참조, 기록은 스냅샷** — `foodId`만 믿지 않고 이름·분류·영양·provenance를 복사한다. 마스터 변경이 과거 식단과 통계를 소급 변경하지 않는다.
- **알레르기는 best-effort 차단** — 검수된 카탈로그 값은 그대로 쓰고, 미검수 행은 공개 재료 문자열에서만 알려진 일치를 추론해 제외한다. `possible|none_known|unknown`을 구분하며, 음식명이나 빈 metadata는 안전 보증도 교차접촉 보증도 아니다.
- **결정적 후보 생성 → 제한된 LLM 선택** — hard excluded와 알려진 알레르기를 제거한 pool을 먼저 점수화한다. LLM은 후보 밖 음식을 만들 수 없고 실패하면 점수 상위 결과를 쓴다.
- **추천 행동은 불변 event** — 노출, 후보 선택, 후보별 평가, 식당 열기, dismiss를 append한다. 실제 기록 저장 transaction만 `logged`를 만들며 `feedbackJson`은 호환용 최신 projection이다.
- **latest candidate learning** — 같은 추천·정규화 후보의 최신 rating만 쓰고, 최신 pick/logged를 시간 감쇠한다. `logged`는 선택보다 강하고 옛 set rating을 모든 후보에 임의 분배하지 않는다.
- **funnel denominator 보존** — feedback 없는 추천도 `shown` 분모에 포함한다. `pickRate=chosen/shown`, `loggedFromShown=logged/shown`을 구분한다.
- **영속 quota와 단일-flight 분리** — DB quota가 일일 사용권을 원자적으로 소비하고, in-flight map은 동일 요청 중복만 join한다. 사용자 write barrier는 더 넓은 mutation 순서 경계다.
- **표본에 맞춘 통계** — 최근 7일 대 직전 7일을 결정적으로 비교하며 합계 3끼 미만이면 비의료 시작 안내만 표시한다.
- **계정별 local-first 상태** — 초안·알림·대기 사진·사진 cache는 principal/token fingerprint namespace다. 계정 전환은 이전 schedule·파일·cache를 지우고 늦은 비동기 완료를 epoch/token guard로 거부한다.
- **백업은 추가 복원 + ledger 멱등성** — restore는 기존 기록을 지우지 않고 새 id로 추가한다. 동일 `archiveId`는 원래 결과를 반환하며 기존 preference를 덮어쓰지 않는다.
- **retention은 DB outbox first** — 사진 행 삭제와 `photoPurgedAt`, 삭제 의도를 한 transaction에 commit한 뒤 strict unlink한다. 성공 outbox만 지우고 실패는 `pendingFileSets`로 알리며 재호출·부팅·매일 04:30 drain으로 복구한다.
- **전체 삭제의 파일 성공 경계** — DB commit 뒤 사용자 사진 폴더 strict 삭제가 실패하면 200을 막는다. 재호출은 DB가 비어도 파일을 재시도하고, 폴더 성공 뒤 outbox를 비운다.
- **token guard + principal cache barrier** — A 요청의 늦은 401은 B session을 해제하지 않는다. 현재 session 401과 로그인/가입 전환은 query cancel/clear를 session 변경보다 먼저 수행한다.

## Gotchas [coverage: high — 38 sources]

- **(2026-09-29) 웹 수정에서 `photoTokens` 를 실으면 앱에서 붙인 사진이 사라진다.** `PATCH /meals/:id` 는 `photoTokens` 가 있으면 전량 교체다. 웹 [MealEntryFormPage](../../apps/web/src/routes/meal/MealEntryFormPage.tsx)는 수정 때 필드를 아예 빼고, 새 기록만 `photoTokens: []`. 웹에 사진 편집을 열 때 이 계약부터 본다.
- **(2026-09-29) 웹에서 draft 를 `useMealDraftReady` 전에 쓰면 조용히 사라진다.** 새로고침 직후엔 `/me` 응답 뒤 principal 전환이 메모리를 비운다. 새 버튼·진입점이 draft 를 시작하면 반드시 이 값을 기다릴 것(기존 웹 화면은 그 전엔 입력 화면을 열지 않거나 버튼을 막는다). 테스트는 `await setMealDraftPrincipal('u1')` 로 준비한다.
- **(2026-10-02) 주식/반찬 토글이 kcal 을 바꾼다.** 주식만 통상 1인분으로 키우므로 같은 음식이라도 구분에 따라 스냅샷이 다르다(멸치볶음 50g 138kcal → 주식이면 690kcal). 운영 배포 뒤 과거 행은 `backfill:meal-nutrition --dry-run --refresh` 로 바뀔 항목부터 보고 `--refresh`.
- **(2026-10-02) 빠른 추가의 이름 비교 키가 서버·클라이언트에서 다르다.** 서버 집계는 `normalizeTerm`(소문자·공백 제거 + 글자·숫자 외 기호 제거) 기반 `nameNorm`, draft `toggleQuickItem` 은 `mealItemNameKey`(trim·소문자·공백 제거만). 직접 친 항목과 칩 이름이 기호("닭볶음 닭갈비" vs "닭볶음(닭갈비)")나 표기(계란/달걀)만 다르면 칩이 "이미 있음"으로 못 알아보고 한 줄을 더 넣는다(작은 불일치라 해는 적다 — 지우면 된다). 항목 상한(`MEAL_MAX_ITEMS_PER_ENTRY`)이면 조용히 무시한다.
- **(2026-10-04) 추천 프로브는 dev.db 에 알려진 비밀번호의 가상 계정을 만든다.** `probe:meal-recommend`·`probe:meal-settings` 는 `prod.db`·비SQLite 를 거부하고 `--undo` 로 지운다. 계정·리포트는 `data/meal-probe/`(git 제외). 토큰은 현재 `tokenVersion` 으로 서명해야 한다 — 웹에서 그 계정으로 로그인·로그아웃하면 예전 토큰이 'Session expired' 가 되어 반복 실행이 조용히 실패했다(`8e32a49`). 추천 분당 10회 제한엔 61초 기다려 재시도, 가상 사용자당 일일 한도 20 안에서 돈다. `probe:meal-models` 는 라우트를 거치지 않아 한도와 무관하고 기록을 바꾸지 않는다.
- **(2026-10-04) dev 카탈로그엔 인기도·재료 정보가 없어 설정 점검의 날씨·간편함·식사 방식 5건은 '보류'다.** 이 확인 건수를 회귀로 읽지 말 것. 흔한 한 끼 209개 중 dev 에서 후보로 쓰이는 건 163(빠짐 7·없음 39) — 제육덮밥·닭갈비·보쌈·양념치킨 등은 운영 카탈로그에서 `check:common-meals` 로 확인해야 한다.
- **(2026-10-04) 흔한 한 끼 목록을 고치면 영양 탭의 한 끼 후보도 바뀐다.** `commonMealNorms` 를 [meal-nutrition](meal-nutrition.md) 서비스도 쓴다. 목록 이름은 카탈로그 표기(띄어쓰기 무관)라 표기 변형은 함께 적거나 메뉴 어휘 synonymPairs 로 이어야 한다.
- **(2026-10-04) 추천을 지운 뒤 같은 날·끼니로 다시 받으면 한도를 1회 쓴다.** 캐시였던 저장 추천이 없어져 새로 만들기 때문. 지운 추천에서 시작한 draft 는 shared 훅이 `originRecommendationId` 를 떼고, 다른 기기 초안이 남아 있어도 서버가 `manual` 로 저장한다.
- **(2026-10-04) Expo Web 에선 추천 삭제가 안 된다.** 앱의 확인창이 RN `Alert` 라 Expo Web 에서 뜨지 않는다(기존 식단 데이터 삭제와 같은 한계).
- **(2026-10-04) 데스크톱 전용 요청이 있다.** 기록 탭의 최근 7일 요약은 `useIsDesktopLg` 가 true 일 때만 부른다 — `matchMedia` 가 없으면(테스트) 좁은 화면으로 본다. 두 단 묶음 때문에 좁은 화면의 카드 순서가 바뀌었다(상세: 식당이 음식·사진 뒤, 입력: 사진이 먹은 음식 바로 뒤).

- **(2026-09-25 `5d7b686`) 격리 DB 테스트는 `User` 까지 비운다 — 사용자 FK 가 걸린 행(`MealPhoto` 등)을 만들기 전에 사용자부터 심을 것.** [temp-db.ts](../../apps/friendly/src/test-utils/temp-db.ts)는 FK 를 끈 채 `_prisma_migrations` 외 전 테이블을 `DELETE` 하므로, 앱이 붙은 뒤엔 FK 가 다시 살아 있다. `meal-recognition.service.test.ts` 만 이 준비를 빠뜨려 `MealPhoto.userId → User` FK 위반으로 늘 실패하다가 `beforeAll` 의 `app.prisma.user.create({ data: { id: 'rec-user', email: 'rec-user@example.com', passwordHash: 'unused' } })` 로 고쳐졌다. 다른 meal 격리 DB 테스트는 이미 심고 있었다 — `meal.route`·`meal-data.route`·`meal-recommendation` 은 공용 [seed-users.ts](../../apps/friendly/src/test-utils/seed-users.ts) `seedAuthUsers(app, [{ id, role }])`(id upsert, 멱등), `meal-daily-quota` 는 `prisma.user.create`. 인증 라우트 테스트면 토큰 검증이 DB 의 `tokenVersion`·role 을 보므로 `seedAuthUsers` 쪽이 맞다. 또 격리 DB 준비(dev.db 3.6GB 복사·비우기)는 느려 [vitest.config.ts](../../apps/friendly/vitest.config.ts) `hookTimeout` 60초(같은 커밋)에 기대고 있다 — dev.db 가 더 커지면 이 한도부터 다시 본다.
- **판매처 결과는 판매 보장이 아니다.** 반경 5km·최대 5곳, 정렬은 근거 등급 우선이라 "가장 가까운 식당" 이 1등이 아닐 수 있다. 0건은 "수집 근거 없음"이지 "근처에 없음"이 아니며, 이름 검색 폴백은 exact 근거 없이 전체 식당 검색이다.
- **추천의 날씨 조회는 `/weather` 라우트와 별도 `WeatherService` 인스턴스다.** [meal-recommendation.route.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.route.ts)가 `new WeatherService({ serviceKey: env.DATA_GO_KR_API_KEY })`(2026-09-02 `3d9dfed` 부터 — 그 전엔 `KMA_API_KEY || BUS_API_KEY`; 이 라운드 식단 모듈의 유일한 변경) 를 자체 생성하므로 발표 슬롯 캐시와 일일 업스트림 쿼터(`DEFAULT_DAILY_UPSTREAM_LIMIT` 9,000 — 인스턴스 필드 `quota`)가 날씨 페이지 쪽 인스턴스와 분리된다. 같은 data.go.kr 계정 공용 키를 두 카운터가 나눠 쓰고 캐시도 공유하지 않는다 — 합산 소비는 어느 쪽 카운터에도 안 보인다([weather](weather.md)). 운영 `.env` 에 옛 이름만 남아 있으면 키 없음으로 취급돼 추천은 계절 추정으로만 돈다(에러는 아님).
- **`seed:meal-samples` 는 `.env` 의 `DATABASE_URL` 을 그대로 쓴다.** 막는 건 `prod.db` 패턴뿐이라 다른 이름의 운영 DB 는 못 막는다 — 사본 절차가 기본. 표식은 memo 하나라 memo 를 편집한 기록은 `--undo` 대상에서 빠진다.
- **`expo-document-picker` 는 지연 로드 — 모듈 없는 빌드에선 백업 불러오기만 꺼진다.** 다른 새 네이티브 모듈을 더할 때도 최상위 import 를 피해야 같은 사고가 안 난다(prebuilt RN Release 링크 문제는 [mobile](mobile.md)).
- **검색은 페이지를 받은 뒤 하는 client filter가 아니다.** `q`, 날짜·slot·mealType·source를 server cursor 전에 적용한다. cursor는 `(eatenAt,id)`라 같은 시각 기록도 건너뛰지 않는다.
- **`late_night`는 자정을 넘는다.** preset 계산은 KST 자정 뒤를 다음 날 축으로 펼쳤다가 감는다. `eatenAt`은 UTC, 달력은 저장된 `eatenDate`를 쓴다.
- **사진 제한과 저장소가 여러 겹이다.** 기록당 5장, 사용자 3,000장, backup 별도 한도가 있다. 앱 대기 저장소(document)와 내려받기 cache(cache)는 수명·정리 규칙이 다르다.
- **Expo Web 의 사진 실패는 네이티브와 다르다.** iOS앱/Android앱은 앱 소유 파일을 재시도하지만 Expo Web(`MealEntryEditor` 의 `Platform.OS === 'web'` 분기)은 즉시 업로드하며 실패한 picker 파일을 다시 골라야 한다. 웹(`apps/web`)은 ~~입력 UI 자체가 없다~~ → 2026-09-29 부터 수동 입력만 있고 사진 선택 자체가 없다(용어 규약: 여기의 "web" 은 앱의 RN-Web 출력).
- **대기 사진은 저장·인식을 차단한다.** 관리 파일 copy가 실패해 원래 picker URI만 남은 사진은 현재 session에서만 쓸 수 있다. 앱은 관리 디렉터리의 직계 자식만 삭제한다.
- **사진 cache의 stale fallback은 제한적이다.** 같은 principal의 network/5xx에서만 허용한다. 401/403/404는 cache를 지우며, token이 바뀐 뒤 끝난 download는 채택하지 않는다.
- **재인식은 모든 현재 사진을 다시 본다.** `userEdited`와 manual/catalog/recommendation 항목은 보존하고 untouched recognition 항목만 교체하는 draft merge 규칙을 지켜야 한다.
- **알레르기 `unknown`을 `none_known`으로 표시하면 안 된다.** `inferred`의 빈 목록도 공개 재료에서 알려진 항목을 못 찾았다는 뜻뿐이다. 음식명은 배합 근거가 아니며 숨은 재료·미표기·교차접촉은 알 수 없다.
- **인식 prompt 버전 필터는 손상 데이터 제외용이다.** 정상적인 과거 model/version snapshot도 품질 비교에 포함하고, version별로 필터할 수 있다. top correction/unmatched는 서로 다른 사용자 2명 이상만 노출한다.
- **추천 event는 수정·삭제가 아니라 append다.** client는 `logged`를 보낼 수 없고 식단 저장이 만든다. 후보 rating은 누적 합이 아니라 후보별 최신값이 학습 신호다.
- **추천 cache hit는 quota를 쓰지 않는다.** `force=true`는 cache를 우회하므로 quota를 소비한다. quota `limit<=0`은 기능을 막는 값이 아니라 해당 quota 검사를 끄는 무제한 설정이다.
- **일일 quota만 SQLite 영속이다.** write barrier와 동일 추천 single-flight는 단일 프로세스 메모리라 다중 인스턴스 확장 시 분산 조정이 필요하다([in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md)).
- **영양 합계와 평균에는 누락 편향이 있다.** `averageReliable`과 main/direct/estimated coverage 없이 kcal 숫자만 해석하지 않는다.
- **base64는 암호화가 아니다.** backup은 사진·메모·선호를 담은 민감한 평문 JSON 구조다. 파일을 안전한 위치에 보관하고 전체 body limit을 75MB 이상으로 넓히지 않는다.
- **복원 archive는 strict하다.** canonical base64, byteSize/hash, ref, 개수·문자열 한도 중 하나라도 어긋나면 전체 거부한다. 실패 뒤 임시 사진 행·파일도 정리한다.
- **retention과 전체 삭제는 다르다.** retention은 텍스트·항목을 남기고 `before` 이전 및 고아 사진만 지운다. `before`가 없으면 모든 사진이 대상이다. 전체 삭제는 import ledger와 quota까지 비운다.
- **retention 성공 응답에도 pending이 있을 수 있다.** DB 상태는 이미 정리됐고 outbox가 파일 삭제를 재시도한다. 낮은 attempts 순으로 제한 batch를 돌려 poison row 독점을 피한다.
- **사진을 다시 붙이면 purge 표시를 되돌린다.** nonempty `photoTokens` PATCH는 attach transaction에서 `photoPurgedAt=null`로 만든다.
- **전체 삭제는 부분 성공 오류를 낼 수 있다.** DB는 이미 commit됐지만 폴더 삭제 실패로 응답은 error다. 같은 요청을 다시 보내는 것이 복구 절차다.
- **meal query key는 user id namespace가 아니다.** 공식 bootstrap과 auth hook의 cancel/clear 및 request-token guard가 보안 계약의 일부다.

## Sources [coverage: high — 116 sources]

- [docs/PLAN-meal.md](../../docs/PLAN-meal.md)
- [packages/api-contract/src/schemas/meal.ts](../../packages/api-contract/src/schemas/meal.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.Meal`
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — Meal/Food 모델
- [apps/friendly/prisma/migrations/20260822113321_add_meal_log/migration.sql](../../apps/friendly/prisma/migrations/20260822113321_add_meal_log/migration.sql)
- [apps/friendly/prisma/migrations/20260823000000_add_meal_item_nutrition/migration.sql](../../apps/friendly/prisma/migrations/20260823000000_add_meal_item_nutrition/migration.sql)
- [apps/friendly/prisma/migrations/20260823160000_add_meal_recommendation_origin/migration.sql](../../apps/friendly/prisma/migrations/20260823160000_add_meal_recommendation_origin/migration.sql)
- [apps/friendly/prisma/migrations/20260823170000_add_meal_photo_user_fk/migration.sql](../../apps/friendly/prisma/migrations/20260823170000_add_meal_photo_user_fk/migration.sql)
- [apps/friendly/prisma/migrations/20260823180000_add_meal_disliked_foods/migration.sql](../../apps/friendly/prisma/migrations/20260823180000_add_meal_disliked_foods/migration.sql)
- [apps/friendly/prisma/migrations/20260823190000_meal_safety_events_lineage/migration.sql](../../apps/friendly/prisma/migrations/20260823190000_meal_safety_events_lineage/migration.sql)
- [apps/friendly/prisma/migrations/20260823210000_meal_backup_restore/migration.sql](../../apps/friendly/prisma/migrations/20260823210000_meal_backup_restore/migration.sql)
- [apps/friendly/prisma/migrations/20260823220000_meal_photo_deletion_outbox/migration.sql](../../apps/friendly/prisma/migrations/20260823220000_meal_photo_deletion_outbox/migration.sql)
- [apps/friendly/src/modules/meal/meal.route.ts](../../apps/friendly/src/modules/meal/meal.route.ts) — *전 라우트 한국어 summary(+description) 추가(`1b621c4`, 동작 무변경)*
- [apps/friendly/src/modules/meal/meal.service.ts](../../apps/friendly/src/modules/meal/meal.service.ts) — *2026-10: 저장 영양 `mealServingNutrition`·`frequentItems`·달력 kcal·삭제된 원본 추천 → manual*
- [apps/friendly/src/modules/meal/meal.service.test.ts](../../apps/friendly/src/modules/meal/meal.service.test.ts)
- [apps/friendly/src/modules/meal/meal-photo.service.ts](../../apps/friendly/src/modules/meal/meal-photo.service.ts)
- [apps/friendly/src/modules/meal/meal-photo-delete.test.ts](../../apps/friendly/src/modules/meal/meal-photo-delete.test.ts)
- [apps/friendly/src/modules/meal/meal-data.service.ts](../../apps/friendly/src/modules/meal/meal-data.service.ts)
- [apps/friendly/src/modules/meal/meal-data.route.test.ts](../../apps/friendly/src/modules/meal/meal-data.route.test.ts)
- [apps/friendly/src/modules/meal/meal-mutation-barrier.ts](../../apps/friendly/src/modules/meal/meal-mutation-barrier.ts)
- [apps/friendly/src/modules/meal/meal-mutation-barrier.test.ts](../../apps/friendly/src/modules/meal/meal-mutation-barrier.test.ts)
- [apps/friendly/src/modules/meal/meal-preference.service.ts](../../apps/friendly/src/modules/meal/meal-preference.service.ts)
- [apps/friendly/src/modules/meal/meal-preference.service.test.ts](../../apps/friendly/src/modules/meal/meal-preference.service.test.ts)
- [apps/friendly/src/modules/meal/meal-daily-quota.service.ts](../../apps/friendly/src/modules/meal/meal-daily-quota.service.ts) (+[test](../../apps/friendly/src/modules/meal/meal-daily-quota.service.test.ts))
- [apps/friendly/src/modules/meal/meal-stats.service.ts](../../apps/friendly/src/modules/meal/meal-stats.service.ts)
- [apps/friendly/src/modules/meal/meal-stats.service.test.ts](../../apps/friendly/src/modules/meal/meal-stats.service.test.ts)
- [apps/friendly/src/modules/meal/meal-stats.insights.ts](../../apps/friendly/src/modules/meal/meal-stats.insights.ts) (+[test](../../apps/friendly/src/modules/meal/meal-stats.insights.test.ts))
- [apps/friendly/src/modules/meal-recognition/meal-recognition.route.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.route.ts) — *summary + description(일일 한도·placeId 힌트·503) 추가(`1b621c4`)*
- [apps/friendly/src/modules/meal-recognition/meal-recognition.service.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.service.ts)
- [apps/friendly/src/modules/meal-recognition/meal-recognition-quota.test.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition-quota.test.ts)
- [apps/friendly/src/modules/meal-recognition/meal-recognition.prompts.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.prompts.ts) · [service test](../../apps/friendly/src/modules/meal-recognition/meal-recognition.service.test.ts) — *service test: 2026-09-25 `5d7b686` beforeAll 에서 `rec-user` 선생성(MealPhoto→User FK 실패 수정)*
- [apps/friendly/src/modules/meal-recognition/meal-recognition-eval.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition-eval.ts) (+[test](../../apps/friendly/src/modules/meal-recognition/meal-recognition-eval.test.ts))
- [apps/friendly/scripts/eval-meal-recognition.ts](../../apps/friendly/scripts/eval-meal-recognition.ts)
- [apps/friendly/scripts/probe-meal-e2e.ts](../../apps/friendly/scripts/probe-meal-e2e.ts)
- [apps/friendly/scripts/seed-meal-samples.ts](../../apps/friendly/scripts/seed-meal-samples.ts) — *검증용 15끼 씨딩(prod.db 가드, --undo)*
- [apps/friendly/package.json](../../apps/friendly/package.json) — *seed:meal-samples · probe:meal-* · backfill:meal-nutrition · eval:meal-recognition 스크립트*
- [apps/friendly/src/modules/meal-recommendation/meal-recommendation.route.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.route.ts) — *라우트 5개 summary(+추천 생성 description) 추가(`1b621c4`); 2026-10-04 DELETE 단건·전체 추가(`867eb18`)*
- [apps/friendly/src/modules/meal-recommendation/meal-recommendation.service.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.service.ts) — *2026-10-04: slot·focus 필터 적용, `사용자|날짜` 씨앗, `remove`·`removeAll`*
- [apps/friendly/src/modules/meal-recommendation/meal-recommendation.test.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.test.ts)
- [apps/friendly/src/modules/meal-recommendation/meal-pattern.service.ts](../../apps/friendly/src/modules/meal-recommendation/meal-pattern.service.ts) — *2026-10-04: 점수 배수·`filterForSlot`·`filterForFocus`·`isSideLikeCatalogRow`·2축 균형·흔한 한 끼 우선*
- [apps/friendly/src/modules/meal-recommendation/meal-recommendation.prompts.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.prompts.ts) · [meal-recommendation.feedback.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.feedback.ts)
- [apps/friendly/src/plugins/meal.ts](../../apps/friendly/src/plugins/meal.ts)
- [packages/shared/src/api/meal.api.ts](../../packages/shared/src/api/meal.api.ts) (+[test](../../packages/shared/src/api/meal.api.test.ts))
- [packages/shared/src/hooks/useMeal.ts](../../packages/shared/src/hooks/useMeal.ts) — *2026-10: `useFrequentMealItems`·추천 삭제 훅 2종(지운 추천에서 시작한 초안의 출처 떼기)*
- [packages/shared/src/stores/mealDraftStore.ts](../../packages/shared/src/stores/mealDraftStore.ts) (+[test](../../packages/shared/src/stores/mealDraftStore.test.ts)) — *2026-09-29~10-02: 변환 3종·`useMealDraftReadyPrincipal`·`toggleQuickItem`*
- [apps/web/src/routes/meal/MealPage.tsx](../../apps/web/src/routes/meal/MealPage.tsx) (+[test](../../apps/web/src/routes/meal/MealPage.test.tsx))
- [apps/web/src/routes/meal/MealPreferenceTab.tsx](../../apps/web/src/routes/meal/MealPreferenceTab.tsx) · [MealRecommendTab.tsx](../../apps/web/src/routes/meal/MealRecommendTab.tsx) · [MealPhotoImg.tsx](../../apps/web/src/routes/meal/MealPhotoImg.tsx) — *2026-10-04: 설정 성별·출생연도·2×2 카드·저장 줄 / 최근 추천 순서 고정·보는 중·삭제·"먹은 메뉴 기록"*
- [apps/mobile/app/meal/](../../apps/mobile/app/meal/) — 목록·신규·상세 라우트
- [apps/mobile/src/components/meal/MealEntryEditor.tsx](../../apps/mobile/src/components/meal/MealEntryEditor.tsx) · [MealItemRow.tsx](../../apps/mobile/src/components/meal/MealItemRow.tsx) · [MealEntryCard.tsx](../../apps/mobile/src/components/meal/MealEntryCard.tsx) · [MealPhotoGallery.tsx](../../apps/mobile/src/components/meal/MealPhotoGallery.tsx)
- [apps/mobile/src/components/meal/MealCalendarView.tsx](../../apps/mobile/src/components/meal/MealCalendarView.tsx) · [MealStatsView.tsx](../../apps/mobile/src/components/meal/MealStatsView.tsx) · [MealRecommendView.tsx](../../apps/mobile/src/components/meal/MealRecommendView.tsx) · [MealPreferenceView.tsx](../../apps/mobile/src/components/meal/MealPreferenceView.tsx) — *2026-10-04: 앱 최근 추천 UX·삭제(`Alert`), 설정 성별·출생연도. `MealEntryEditor` 는 빠른 추가 칩·저장 뒤 새 상세(`162024d`·`d035560`)*
- [apps/mobile/src/components/meal/FoodRestaurantMatches.tsx](../../apps/mobile/src/components/meal/FoodRestaurantMatches.tsx) — *판매처 탐색 바텀시트(2026-08-24)*
- [apps/mobile/src/components/meal/MealDataManagementCard.tsx](../../apps/mobile/src/components/meal/MealDataManagementCard.tsx) · [MealReminderSettingsCard.tsx](../../apps/mobile/src/components/meal/MealReminderSettingsCard.tsx)
- [apps/mobile/src/lib/mealDraftPhotos.ts](../../apps/mobile/src/lib/mealDraftPhotos.ts) · [MealPendingPhotoThumb.tsx](../../apps/mobile/src/components/meal/MealPendingPhotoThumb.tsx)
- [apps/mobile/src/lib/mealPhotoCache.ts](../../apps/mobile/src/lib/mealPhotoCache.ts) · [useCachedMealPhoto.ts](../../apps/mobile/src/hooks/useCachedMealPhoto.ts)
- [apps/mobile/src/lib/mealReminders.ts](../../apps/mobile/src/lib/mealReminders.ts)
- [apps/mobile/src/components/home/TodayMealCard.tsx](../../apps/mobile/src/components/home/TodayMealCard.tsx) · [apps/mobile/app/_layout.tsx](../../apps/mobile/app/_layout.tsx) — *루트 알림 handler(`setNotificationHandler`, 식사·하차 알림 공용, `shouldPresentMealReminder` 로 표시 판정) + `NotificationNavigation`(식사 알림 탭 → 허용된 내부 경로로만 이동)*
- [packages/shared/src/api/client.ts](../../packages/shared/src/api/client.ts) (+[test](../../packages/shared/src/api/client.test.ts))
- [packages/shared/src/hooks/useAuth.ts](../../packages/shared/src/hooks/useAuth.ts) · [apps/web/src/main.tsx](../../apps/web/src/main.tsx)
- [apps/mobile/src/lib/api-setup.ts](../../apps/mobile/src/lib/api-setup.ts) · [queryClient.ts](../../apps/mobile/src/lib/queryClient.ts)

**2026-09-24~09-26 라운드 (테스트 인프라·외부 문서)**
- [apps/friendly/src/test-utils/temp-db.ts](../../apps/friendly/src/test-utils/temp-db.ts) — *격리 DB: dev.db 복사 후 FK 끄고 전 테이블 DELETE(User 포함)*
- [apps/friendly/src/test-utils/seed-users.ts](../../apps/friendly/src/test-utils/seed-users.ts) — *`seedAuthUsers` 공용 사용자 upsert(tokenVersion·role 검증 대응)*
- [apps/friendly/vitest.config.ts](../../apps/friendly/vitest.config.ts) — *`hookTimeout: 60_000`(`5d7b686`), `fileParallelism: false`*
- [docs/api/endpoints.md](../../docs/api/endpoints.md) — *meal 절 28개(전부 로그인, 한도 6개)*
- [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — *`mealDataArchive` 10/시간·`mealPhotoUpload` 30/분·`mealRecognize`·`mealRecommend` 10/분*
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) — *`MEAL_RECOGNIZE_DAILY_LIMIT` 30·`MEAL_RECOMMEND_DAILY_LIMIT` 20 기본값*
- [apps/friendly/src/plugins/multipart.ts](../../apps/friendly/src/plugins/multipart.ts) — *파일 1개 5MB*

**2026-09-25~10-04 라운드 (웹 입력·1인분·빠른 추가·추천 보정·최근 추천·데스크톱)**
- [apps/friendly/src/modules/meal/meal-frequent.ts](../../apps/friendly/src/modules/meal/meal-frequent.ts) (+[test](../../apps/friendly/src/modules/meal/meal-frequent.test.ts)) — *빠른 추가 순위 순수 함수·기본 목록 7종(`162024d`)*
- [apps/friendly/src/modules/meal/meal.route.test.ts](../../apps/friendly/src/modules/meal/meal.route.test.ts) — *1인분 보정·frequent·달력 kcal·삭제된 원본 추천 → manual*
- [apps/friendly/src/modules/food/food-serving.ts](../../apps/friendly/src/modules/food/food-serving.ts) — *`mealServingNutrition`·`kcalPer100gOf`(`9019cf5`·`2aaaa7e`, 규칙 상세는 [food](food.md))*
- [apps/friendly/src/modules/food/food-allergen.ts](../../apps/friendly/src/modules/food/food-allergen.ts) — *`allergensInFoodName`(추천 후보 이름 단서, `e3afe9c`)*
- [apps/friendly/scripts/backfill-meal-nutrition.ts](../../apps/friendly/scripts/backfill-meal-nutrition.ts) — *같은 1인분 함수로 재계산, servings 반영(`9019cf5`)*
- [apps/friendly/src/modules/meal-recommendation/common-meals.ts](../../apps/friendly/src/modules/meal-recommendation/common-meals.ts) — *흔한 한 끼 13무리 209개·아침 전용(`2aaaa7e`)*
- [apps/friendly/scripts/probe-meal-recommend.ts](../../apps/friendly/scripts/probe-meal-recommend.ts) — *가상 A~D 일주일 → 끼니별 추천 점검(`3fd971b`·`8e32a49`)*
- [apps/friendly/scripts/probe-meal-settings.ts](../../apps/friendly/scripts/probe-meal-settings.ts) — *가상 E 2주 35끼, 설정만 바꿔 점수 층·LLM 층(`8e32a49`·`51dfa7d`)*
- [apps/friendly/scripts/probe-meal-models.ts](../../apps/friendly/scripts/probe-meal-models.ts) — *모델 비교·이유 사실 확인·`--from-raw`(`7056244`)*
- [apps/friendly/scripts/check-common-meals.ts](../../apps/friendly/scripts/check-common-meals.ts) — *목록-카탈로그 대조, 읽기 전용(`7056244`)*
- [apps/friendly/prisma/migrations/20261004060205_add_meal_nutrition/migration.sql](../../apps/friendly/prisma/migrations/20261004060205_add_meal_nutrition/migration.sql) — *`meal_preferences.sex`·`birthYear`(나머지는 [meal-nutrition](meal-nutrition.md)·[food](food.md))*
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx) — *`/me/meals/new`·`/:id`·`/:id/edit`(`b5bfe77`)*
- [apps/web/src/routes/meal/MealEntryFormPage.tsx](../../apps/web/src/routes/meal/MealEntryFormPage.tsx) (+[test](../../apps/web/src/routes/meal/MealEntryFormPage.test.tsx)) — *웹 새 기록·수정, 빠른 추가 칩, 저장 뒤 새 상세로*
- [apps/web/src/routes/meal/MealDetailPage.tsx](../../apps/web/src/routes/meal/MealDetailPage.tsx) (+[test](../../apps/web/src/routes/meal/MealDetailPage.test.tsx)) — *상세 — 수정(기본)·같은 메뉴로 새 기록·삭제*
- [apps/web/src/routes/meal/MealItemInputRow.tsx](../../apps/web/src/routes/meal/MealItemInputRow.tsx) · [useMealDraftReady.ts](../../apps/web/src/routes/meal/useMealDraftReady.ts)
- [apps/web/src/routes/meal/mealLayout.ts](../../apps/web/src/routes/meal/mealLayout.ts) · [apps/web/src/lib/useMediaQuery.ts](../../apps/web/src/lib/useMediaQuery.ts) · [apps/web/src/styles/global.css](../../apps/web/src/styles/global.css) — *데스크톱 두 단·`useIsDesktopLg`·`scrollbar-gutter`(`b09e0a4`)*
- [apps/web/src/routes/meal/MealNutritionTab.tsx](../../apps/web/src/routes/meal/MealNutritionTab.tsx) · [apps/mobile/src/components/meal/MealNutritionView.tsx](../../apps/mobile/src/components/meal/MealNutritionView.tsx) — *영양 탭(연결만, 세부는 [meal-nutrition](meal-nutrition.md))*
- [apps/mobile/app/meal/[id].tsx](../../apps/mobile/app/meal/[id].tsx) — *앱 상세 — shared 변환 3종 사용, 수정 기본 버튼(`b5bfe77`·`d035560`)*
- [packages/shared/src/meal/recommendationHistory.ts](../../packages/shared/src/meal/recommendationHistory.ts) (+[test](../../packages/shared/src/meal/recommendationHistory.test.ts)) — *최근 추천 문구 3종(`d467db0`)*
