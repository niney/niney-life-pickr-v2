---
concept: 견주기 전에 견줄 만한지 — 기록량·표본·어림 오차가 문턱 안일 때만 "늘었다·줄었다·N배" 를 말한다
last_compiled: 2026-11-15
topics_connected: [meal, meal-nutrition, meal-story, web, utils, api-contract, menu-grouping]
status: active
---

# 견주기 전에 견줄 만한지 — 기록량·표본·어림 오차가 문턱 안일 때만 "늘었다·줄었다·N배" 를 말한다

## Pattern

식단은 사용자가 **스스로 적은 기록**이 원천이다. 그래서 두 값의 차이에는 늘 두 가지가 섞인다 — 실제로 먹은 것이 달라진 몫과, **적은 양이 달라진 몫**. 2026-11 식단 통계·영양 점검·건강식단 스토리가 "직전 기간보다 나트륨 55% 줄었어요" 같은 비교 문장을 늘리자, 실제 계정에서 나트륨·식이섬유가 함께 55%·58% '줄었어요' 로 나왔는데 식단이 바뀐 게 아니라 두 기간의 하루 평균 열량이 1,047 대 1,495kcal 로 **덜 적었을 뿐**이었다(`504bd68c`). 덜 적은 것을 좋아진 것으로 읽게 만드는 문장은 틀린 숫자보다 해롭다 — 사용자는 그 문장을 믿고 행동한다.

그래서 비교·어림 문장 앞에 **자격 검사**를 둔다. ① 각 쪽이 판정을 낼 만큼 기록이 있는가(평균에 든 날 4일 이상, 정보 비율 60% 이상), ② 두 쪽의 기록량이 비슷한가(하루 평균 열량 15% 안쪽), ③ 차이가 잡음 문턱을 넘는가(10% — 5% 로는 단백질 5%·지방 8% 같은 잡음까지 '줄었어요' 가 됐다), ④ 어림 표현이 실제 비와 맞는가('약 N분의 1' 은 실제 비와 15% 넘게 어긋나면 내지 않는다). 하나라도 실패하면 숫자를 지어내지 않고 **왜 견주지 않았는지**를 말한다("직전 1주는 평균에 든 날이 2일뿐이라 견주지 않았어요", "직전 1달은 기록한 양이 달라 열량 말고는 견주지 않았어요"). 그리고 이 문턱들은 화면마다 따로 두지 않고 한 모듈(웹 `mealNutrientChange.ts`, utils `isCountedMealDay`, 계약 `MEAL_NUTRIENT_MIN_COVERAGE`)에 모아, 통계 탭·이야기·홈 줄이 같은 문턱·같은 문구를 쓴다.

## Instances

- **2026-11-12** in [meal-story](../topics/meal-story.md) (`fd61e986`): 막대 둘의 어림 쪽지가 작은 쪽에만 '약 N분의 1' 을 붙이던 것을, 강조한 막대가 큰 쪽이면 '약 N배'(`bars.fraction.multiple`)로 — 같은 비라도 **읽는 방향**이 맞아야 어림이 참이다(한 접시가 권장량보다 많은 편에서 기준 막대에 '2분의 1' 이 붙어 거꾸로 읽혔다).
- **2026-11-11** in [meal-story](../topics/meal-story.md) / [web](../topics/web.md) / [meal](../topics/meal.md) (`504bd68c`): '기록한 뒤의 변화' — 이야기의 내 값·홈 건강식단 줄에 "직전 2주보다 하루 2.1g(20%) 늘었어요". 통계 탭의 직전 대비 규칙을 `apps/web/src/routes/meal/mealNutrientChange.ts` 로 옮기며 **기록량 동등성**을 더했다 — `comparableNutrientChange` 는 두 기간의 하루 평균 열량 차가 `ENERGY_CHANGE_MAX = 0.15` 안쪽이고 어느 쪽도 '기록 더 필요' 가 아닐 때만 영양소 하나의 변화를 말한다. 열량 줄 자체는 달라진 대로 말한다(기록량 차이가 곧 열량 차이이므로).
- **2026-11-10** in [meal-story](../topics/meal-story.md) (`cdab9359`): '약 N분의 1' 을 화면 반올림에서 서버 `fractionOf`(`meal-story.defs.ts`)로 — N 은 2 이상의 정수, 실제 비와 15% 넘게 벗어나면 `null`(2.4배를 '2분의 1' 이라 하지 않는다), 막대가 셋이면 없음. 점검 스크립트 `check:meal-stories` 가 사람 확인 목록에 찍는다.
- **2026-11-09** in [web](../topics/web.md) / [meal](../topics/meal.md) (`34b47c6f`): 통계 영양소에 직전 같은 길이 기간 대비. 두 기간 모두 판정이 나왔을 때(평균에 든 날 4일 이상)만 견주고, 정보 60% 아래인 쪽이 있는 줄은 뺀다. 문턱 `NUTRIENT_CHANGE_MIN = 0.1`. **기간을 바꾸는 동안 남아 있는 앞 값끼리는 견주지 않는다** — 쿼리 두 개가 서로 다른 시점에 도착하는 클라이언트 비교의 함정.
- **2026-11-08~09** in [meal](../topics/meal.md) / [meal-nutrition](../topics/meal-nutrition.md) / [utils](../topics/utils.md) / [api-contract](../topics/api-contract.md) (`937f2dd2`·`90ccdff6`·`46134eb8`): "평균에 넣는 날" 을 하나로. 통계 하루 평균 열량·단백질·나트륨이 예전엔 기록한 모든 날로 나눠 점심만 적은 날이 많으면 낮게 나왔다 → 두 끼 이상 기록한 날만. 이어 끼니 '안 먹음' 이 들어오며 규칙이 `@repo/utils` `isCountedMealDay(meals, skipped)` 하나로 모였고, **하루 만에 한 번 고쳐졌다** — 11-08 판(기록 + '안 먹음' 두 칸 이상)은 점심만 적은 날 아침 하나만 표시해도 평균에 들어, 먹고 안 적은 저녁이 빠진 채 하루 평균이 낮아졌다(아침을 늘 거르는 사람에게 흔한 경로 — '부족' 이 거짓으로 나온다). 11-09 판은 `끼니 ≥ 2` 또는 `(끼니 > 0 이고 끼니 + 안 먹음 ≥ 3)` — 두 끼 이상 기록했거나, 한 끼만 기록하고 남은 아침·점심·저녁을 **모두** '안 먹음' 으로 채워 그날 먹은 전부를 아는 날만. 기록이 없는 날은 '안 먹음' 만으로 넣지 않는다. 이 규칙은 영양소 점검(`analyzeMealNutrition`)·통계(`computeMealStats`)·영양소별 통계(`statsMealNutrients`)가 같이 쓴다. 판단 보류 문턱 0.6 도 계약 상수 `MEAL_NUTRIENT_MIN_COVERAGE` 하나로(서버 점검·웹 표).
- **2026-11-07** in [meal-nutrition](../topics/meal-nutrition.md) (`f4cec51d`): 판정과 기록 부족을 가른다 — 열량을 필요량만큼 채웠다면 기준에 닿았을 '부족' 은 판정을 바꾸지 않고 `recordGap`('기록 더 필요', 점선 주황)으로 표시(사용자 결정 A안). 기록 열량 안내 문턱 70% → 85%. 비교가 아니라 **한 기간 안의 판정**에도 같은 질문("모자란 건 영양소인가 기록인가")이 걸린다.
- ⚠️ [2026-05, 앞선 형태] in [menu-grouping](../topics/menu-grouping.md): 식당 상세의 `GlobalCompareBadge`(이 식당 vs 전체 평균)는 ±5%p 를 넘을 때만 추세를 표시했다 — 잡음 문턱만 있고 표본·기록량 동등성 검사는 없던 첫 비교 표면.

## What This Means

1. **자기 기록 데이터의 차이는 "기록량 차이" 를 먼저 의심한다.** 같은 사람의 두 기간이라도 적은 양이 다르면 영양소 총량은 따라 움직인다. 비교의 분모(평균에 든 날)와 기록량(하루 열량)을 먼저 맞추고, 맞지 않으면 그 사실을 말한다. 열량 자체는 기록량의 지표라 예외로 말한다.
2. **문턱은 실데이터로 정하고 근거를 남긴다.** 10%(5% 는 잡음), 15%(기록량 동등), 4일(판정 가능), 0.6(정보 비율), 85%(기록 열량 안내) — 모두 운영 사본이나 실제 계정에서 틀린 문장을 보고 정한 값이고 커밋 본문에 근거가 있다. 문턱을 바꿀 땐 그 근거부터 다시 본다.
3. **"견주지 않았다" 도 결과다.** 빈칸으로 두지 않고 이유를 말해야 사용자가 기록을 더 하거나 기간을 바꾼다 — [unknown-vs-zero](unknown-vs-zero.md) 의 '말하지 않음' 이 표본 하한 때문이라면, 여기는 비교 자격 때문이다.
4. **규칙은 한 곳에.** 화면이 셋(통계·이야기·홈)으로 늘자 문턱이 갈라질 뻔했고, 공용 모듈로 옮긴 뒤에야 "같은 기간이면 같은 문장" 이 보장됐다. 서버 판정(평균에 든 날·판정 가능)은 utils·계약에, 화면 문장 규칙은 웹 모듈에 둔 분업이다 — 앱으로 옮길 때는 웹 모듈을 shared 로 올려야 한다([platform-ui-split](platform-ui-split.md)).
5. **어림 표현도 비교다.** '약 N분의 1'·'약 N배'·'숟가락 N개' 는 비교를 말로 바꾼 것이라 같은 자격 검사(오차 15%·읽는 방향)가 필요하고, 계산은 서버가 한다([server-decides-llm-narrates](server-decides-llm-narrates.md) — 여기선 LLM 이 아니라 사람이 쓴 원고가 서술자다).

관련: [unknown-vs-zero](unknown-vs-zero.md) — '안 먹음' 은 "기록 없음(모름)" 과 "안 먹음(없음)" 을 갈라 평균에 든 날 판정의 입력이 된다. [synthetic-persona-probe](synthetic-persona-probe.md) — 문턱을 정한 실측은 대부분 운영 사본·가상 사용자 프로브에서 나왔다.

## Sources

- [meal](../topics/meal.md)
- [meal-nutrition](../topics/meal-nutrition.md)
- [meal-story](../topics/meal-story.md)
- [web](../topics/web.md)
- [utils](../topics/utils.md)
- [api-contract](../topics/api-contract.md)
- [menu-grouping](../topics/menu-grouping.md)
- [apps/web/src/routes/meal/mealNutrientChange.ts](../../apps/web/src/routes/meal/mealNutrientChange.ts) — `NUTRIENT_CHANGE_MIN`·`ENERGY_CHANGE_MAX`·`comparableNutrientChange`
- [apps/friendly/src/modules/meal-story/meal-story.defs.ts](../../apps/friendly/src/modules/meal-story/meal-story.defs.ts) — `fractionOf`
- [apps/friendly/src/modules/meal-story/meal-story.resolve.ts](../../apps/friendly/src/modules/meal-story/meal-story.resolve.ts) — 막대 `fraction`(`multiple`)
- [packages/utils/src/mealSlot.ts](../../packages/utils/src/mealSlot.ts) — `isCountedMealDay`
- [packages/api-contract/src/constants.ts](../../packages/api-contract/src/constants.ts) — `MEAL_NUTRIENT_MIN_COVERAGE`·`MEAL_SKIPPABLE_SLOTS`
- [apps/friendly/src/modules/meal-nutrition/meal-nutrition-stats.ts](../../apps/friendly/src/modules/meal-nutrition/meal-nutrition-stats.ts) — 날마다 `skipped`·`counted`
- [unknown-vs-zero](unknown-vs-zero.md) · [server-decides-llm-narrates](server-decides-llm-narrates.md) · [platform-ui-split](platform-ui-split.md) · [synthetic-persona-probe](synthetic-persona-probe.md)
