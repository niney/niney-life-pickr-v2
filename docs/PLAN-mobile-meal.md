# 앱 — 식단 영양·추천·메뉴 칼로리 남은 확인과 작업 (2026-11-08)

2026-11-07~08 에 서버·웹에 들어간 변경 중 **앱(apps/mobile) 화면으로 아직 못 본 것**과 앱에만 남은 작업.
2026-11-08 Windows 개발 PC 에서는 앱 의존성이 설치돼 있지 않아 Expo Web 번들이 통째로 실패해 확인하지 못했다(아래 0).

## 0. 준비 — 앱 의존성 설치

- **증상**: Metro(`http://localhost:8081`)의 번들 요청이 HTTP 500 `UnableToResolveError: Unable to resolve module expo-haptics
  from apps/mobile/src/lib/haptics.ts` — 식단 화면만이 아니라 앱 전체가 뜨지 않는다. `pnpm typecheck` 의 mobile 도 같은 원인으로
  실패한다(`MealTimeSheet.tsx`·`haptics.ts`·`nativeDateTimePicker.ts`).
- **원인**: 39276581(2026-10-25, Mac 에서 커밋)이 `expo-haptics ~15.0.8`·`@react-native-community/datetimepicker 8.4.4` 를 더했는데
  그 PC 에서 `pnpm install` 을 하지 않았다(`pnpm-lock.yaml` 에는 들어 있다).
- **할 일**
  1. 개발 서버를 끈다 — 적어도 Metro(8081). 설치가 `node_modules` 의 파일을 바꾸므로 API(3000)·웹(5173)도 끄는 편이 안전하다
     (Windows 는 실행 중인 프로세스가 잡은 파일에서 EPERM).
  2. 저장소 루트에서 `pnpm install --frozen-lockfile`.
  3. `pnpm dev` 로 다시 띄우고 `curl http://localhost:8081/status` → `packager-status:running`, 브라우저 `http://localhost:8081` 이
     "Life Pickr" 화면을 그리는지 본다.
  4. `pnpm typecheck` 가 mobile 까지 통과하는지 본다.
- **기기(개발 빌드)**: 두 모듈은 네이티브라 개발 빌드(dev client)를 다시 만들어야 기기에서 동작한다(새 JS 만 받은 옛 빌드도 죽지는
  않게 해 두었다 — 39276581 본문). iOS 는 `pod install` 뒤 [mobile-ios-build.md](mobile-ios-build.md) 대로 prebuilt RN 을 Debug 로
  맞춘다. **Android 는 39276581 이후 어디서도 실행 확인을 못 했다**(날짜·시각 피커 대화상자·햅틱).
- **서버 쪽 전제**: API 가 2026-11-08 코드로 떠 있어야 하고(DB 에 `20261108090000_meal_recommendation_sides` 적용), 운영에서 볼 때는
  배포 뒤 [deploy-friendly.md](deploy-friendly.md)의 영양 단계까지 끝나 있어야 한다.

## 1. 확인할 화면

Expo Web 은 포트가 달라 웹과 로그인 저장소가 다르다 — 따로 로그인한다. 로컬 운영 사본(`apps/friendly/data/prod.db`)의
niney@life.com 에 최근 14일 기록이 있어 아래 예시 값으로 맞춰 볼 수 있다.

### 식단 › 분석 탭 › 영양소 점검 — `src/components/meal/MealNutritionView.tsx`(2026-11-07)

- [ ] 기준에 못 미치지만 빠진 끼니를 채우면 닿는 영양소가 빨간 '부족'이 아니라 **'기록 더 필요'** 로 보인다(예: 식이섬유·아연).
- [ ] 부족한 영양소에 **곁들임 제안** 줄이 있다(예: 비타민 C → 파프리카·딸기·키위 — 한 끼 제안 없이 곁들임만, 칼슘 → 우유).
- [ ] 성별·출생연도 안내 옆 **설정 링크**가 `/meal/settings` 로 연다.
- [ ] 영양 판정이 바뀐 뒤의 예전 조언은 **'지난 조언'** 안내와 함께 보이고, 새 조언을 받으면 사라진다.
- [ ] 열량을 모르는 음식 안내가 줄었다 — 이름 추정이 닭가슴살·참치·두부·상추쌈·그래놀라·돼지곱창을 채운다(로컬 사본은 0건).

### 식단 › 추천 탭 — `src/components/meal/MealRecommendView.tsx`(2026-11-08)

- [ ] 새로 받은 추천의 요약 아래에 **"곁들이면 좋아요 · …"** 한 줄(muted `Note`). 웹 실측 예: 토스트·오믈렛·누룽지 →
      "파프리카(비타민 C) · 당근(비타민 A) · 브로콜리(엽산)".
- [ ] 예전 추천(서버가 `sides` 를 주지 않은 것)·건강 중요도 0·부족 영양소가 없을 때는 줄이 없고 오류도 없다.
- [ ] 추천 이유가 카드의 '○○ 보충' 칩에 없는 영양소를 말하지 않는다. 훈제오리에 '비타민 C 보충'이 붙지 않는다(가공육 규칙).

### 맛집 상세 › 메뉴 탭 칼로리 칩(2026-11-08 서버 변경 — 앱 코드 변경 없음)

- [ ] 예전엔 칼로리가 안 뜨던 메뉴가 처음엔 비어 있다가 몇 초 안에 100g당으로 채워진다(서버가 LLM·웹으로 판정하는 동안 공유 훅이
      3초마다 다시 읽는다 — `useRestaurant.ts`, 최대 10번) — 로컬 사본 예: 칠리새우 → 깐쇼새우 150,
      청국장 → 청국장찌개 47, 후라이드치킨 → 닭튀김 301, 수육국밥 → 국밥 52, 웹 실측 편육 251·크림새우 247·마라샹궈 188.
- [ ] '음료수'·'주류' 같은 범주어와 '돼지한판(600g)' 같은 모듬은 계속 미표시.

### 식단 기록 상세(이름 추정)

- [ ] 카탈로그에 영양이 없던 이름의 열량이 '추정'으로 보인다 — 예: 닭가슴살 159kcal(닭가슴 · 고기 통상 1인분 150g),
      두부 72kcal(fatsecret.kr 중앙값 · 통상 1인분 80g), 돼지곱창 273kcal(고기 통상 1인분 150g).

## 2. 앱에만 남은 구현 후보

- **추천 카드 곁들임 줄 → 분석 탭 이동**: 웹에는 '영양 보기' 링크가 있지만 앱에는 없다. 분석 탭은 같은 화면(`app/meal/index.tsx`)의
  탭 상태라 `router.push('/meal?tab=analysis')` 는 같은 화면을 한 겹 더 쌓을 수 있다 — 넣는다면 `MealRecommendView` 가
  `onOpenAnalysis` 콜백을 받고 `app/meal/index.tsx` 가 `setTab('analysis')` 로 넘겨 주는 방식.
- **음식 찾기(웹 휴대폰과 같은 흐름)**: 2026-11-08 웹 리뉴얼 3단계에서 서버가 준비됐다 — `/food/search` 결과에 `servingKcal`(넣을 때와
  같은 규칙의 1인분 열량)·`myCount`(최근 180일 내가 적은 횟수, 이 값이 있으면 앞에 온다), `/meals/items/frequent` 에 `q`(이름으로 찾는
  내 기록·최근 1년)와 항목별 `kcal`. 앱 `MealItemRow` 자동완성은 지금 이 값을 안 쓴다(타입만 늘었다). 웹 `MealFoodSheet.tsx` 가 기준 —
  치기 전 자주 먹은 음식·최근 끼니 통째로, 치는 중 '그대로 넣기' → 내 기록 → 음식 목록, 김치·나물은 반찬으로
  (`MEAL_SIDE_DEFAULT_DISH_TYPES`). 레이아웃 리뉴얼과 함께 하는 게 낫다([PLAN-meal-web-redesign.md](PLAN-meal-web-redesign.md)).
- **통계 묶음별 영양**: `GET /meals/stats/nutrition?from&to`(공용 훅 `useMealStatsNutrition`) — 웹은 분포 막대 기준(끼니 수·열량·
  나트륨)과 막대를 누르면 펼치는 묶음 카드(`MealGroupBars.tsx`). 앱 분석 탭 분포에 같은 기준·카드를 붙일 수 있다(앱은 누르면 펼침만).
  카드의 '열량 구성' 두 줄(이 묶음·내 평균, 응답 `composition`)과 열량·나트륨 기준일 때 막대 위 판정 한 줄(`MealBarSummary.tsx` —
  최근 14일 점검 `useMealNutrition(14)` 의 하루 평균·많음 표시)도 함께 옮긴다. 막대만 보면 '나트륨이 높다'가 안 보인다는 물음에서 나왔다.
  → 2026-11-08 같은 날 웹은 이 한 줄과 카드 판정을 `useMealStatsNutrients(from, to)`(고른 기간, 영양 탭과 같은 셈)로 바꿨다.
- **통계 영양정보**: `GET /meals/stats/nutrients?from&to`(공용 훅 `useMealStatsNutrients`) — 영양소별 하루 평균(두 끼 이상
  기록한 날)·판정·열량 중 비율과 적정 범위·날마다 값·많이 준 음식. 웹은 `MealStatsNutrients.tsx` — 영양 탭과 같은 줄 부품
  (`MealNutrientLine.tsx`: 이름·판정 칩·"양 / 기준 (N%)"·막대)에 흐름 막대. 앱도 영양 화면의 줄 모양을 그대로 쓰고 '누르면 줄
  아래로 펼침'만 더하면 된다(넓은 화면 오른쪽 카드는 웹 전용). 위 묶음은 서버 차례 그대로, 비타민·무기질은 판정 순·부족만 펼침.
  통계 타일의 하루 평균도 서버에서 같은 셈으로 바뀌어 앱 숫자도 함께 바뀐다(두 끼 이상 기록한 날만).

## 3. 끝났다고 볼 기준

- Expo Web 에서 1 의 체크리스트를 통과하고 `pnpm typecheck` 가 mobile 까지 통과한다.
- iOS 개발 빌드에서 추천 탭·분석 탭을 한 번씩 본다(가능하면 Android 도 — 피커·햅틱 포함).
- 확인한 날짜와 결과를 이 문서와 [PLAN-meal.md](PLAN-meal.md) 진행 기록에 남긴다.
