---
concept: 판단은 서버, LLM 은 범위 안에서 서술만 — 후보·대상·숫자를 서버가 정하고 출력은 칸 단위로 검사해 서버 문장으로 바꾼다
last_compiled: 2026-11-15
topics_connected: [meal, meal-nutrition, tarot, saju-c, ai, meal-story, food]
status: active
---

# 판단은 서버, LLM 은 범위 안에서 서술만 — 후보·대상·숫자를 서버가 정하고 출력은 칸 단위로 검사해 서버 문장으로 바꾼다

## Pattern

LLM 을 붙인 개인화 기능이 늘면서, "무엇을 고를지·몇이라고 말할지"는 서버의 결정적 코드가 정하고 LLM 은 **서버가 준 목록 안에서 고르고 그 이유를 쓰는 일만** 하는 구조가 굳었다. [static-first-llm-enrichment](static-first-llm-enrichment.md) 가 "언제"(정적 결과 먼저, LLM 은 나중)의 규약이라면, 이건 "**무엇을 LLM 에 맡기는가**"의 규약이다. 세 겹으로 이뤄진다.

1. **입력을 좁힌다** — 서버가 후보·대상을 고르고 그 밖은 프롬프트에 아예 넣지 않는다. 식단 추천은 점수 상위 후보(`candidateNames`)만, 그것도 끼니 필터(`filterForSlot`)·이번 추천의 중심 필터(`filterForFocus`)를 지난 것만 보낸다. 영양제 조언은 서버가 점검 결과에서 고른 대상 영양소(최대 6)만 보낸다. 메뉴 타로는 카드로 `selectTarotMenus` 가 메뉴를 결정적으로 정한 뒤 LLM 은 후보별 이유만 쓴다. 사주(C)는 명식·대운·택일 점수(`applyDatePurposeRule`)를 utils 가 계산해 넘긴다.
2. **출력을 화이트리스트로 검사한다** — 후보 밖 이름은 거부(`'추천 후보에 없는 음식입니다.'`, 타로 `menuId` 검증 — 없는 메뉴 금지). 영양제 조언은 칸마다 `textProblem` 이 프롬프트에 없던 숫자(`number` — 용량을 지어내지 못하게 허용 숫자 집합 `allowedNumbers`)·한자(`hanja`)·치료/예방/완치 주장(`claim`)·점검 밖 영양소(`offlist`)를 잡는다.
3. **걸린 칸만 서버 문장으로 바꾼다** — 응답 전체를 버리지 않고 문제 칸만 결정적 대체 문장(`fallbackAdviceItem`, 식단 추천 `fallbackReason`)으로 갈아 끼우고, 무엇을 바꿨는지(`repairs: ["vitaminD.supplementTip:number", "iron:missing"]`)를 남긴다. LLM 이 아예 없거나 실패하면 같은 대체 문장으로 응답 전체가 `status: 'fallback'` — 기능은 늘 돈다.

## Instances

- **2026-11-09~13** in [meal-story](../topics/meal-story.md) (`e3c6f6e5`·`cdab9359`·`5f3c33cd`, 32차): **서술자가 LLM 이 아니라 사람이어도 같은 분업.** 건강식단 원고(`content/meal-stories/<slug>/story.json`)는 사람이 쓰지만 숫자는 쓰지 않는다 — 섭취기준(KDRI 2020)·식약처 표준데이터·레시피 합계로 서버가 계산해 내려 주고(소금 환산 나트륨 ÷ 400 과 그 근거 출처 자동, '약 N분의 1'·'약 N배'), `check:meal-stories` 가 사람 확인 목록을 찍는다. 재료 값 파일(`foods.json`)이 낡으면 숫자가 틀리므로 낡은 파일을 테스트가 잡게 했다.
- **2026-11-14** in [food](../topics/food.md) / [meal](../topics/meal.md) (`0d21d4d3`, 32차): 메뉴 구성 읽기 — LLM 은 코스·세트 설명에서 구성 음식 이름만 고르고, 서버가 채택을 판정한다: high 만, **이름은 원문 글에 적혀 있어야 하고**(줄임말을 편 것은 인정) 글에 없는 이름이 하나라도 끼면 통째로 버리며, 범주어·묶음 이름·둘 이상 고르기는 거른다. 운영 메뉴 표본 160개 채점으로 채택 정밀도 83% → 약 96%. 숫자(열량)는 LLM 에게 묻지 않는다.
- **2026-11-07** in [meal](../topics/meal.md) / [meal-nutrition](../topics/meal-nutrition.md) (`cd17ebf3`·`f4cec51d`, 32차): 식단 추천 프롬프트 v6 — 서버 `nutrition-signals` 가 최근 14일 점검에서 나트륨 많음·부족 영양소(최대 5)를 골라 '건강' 요소 점수로 넣고(짠 1인분 −0.25 · 국물 −0.15 · 부족 영양소 보충 최대 +0.3 과 태그 '○○ 보충'), LLM 은 그 후보의 태그에 적힌 영양소만 말할 수 있다. LLM 이 "콩국수 — 칼륨 보충으로 비타민 C·칼슘·엽산 보완" 처럼 태그 밖 영양소를 지어낸 문장은 서버가 지우고(다 빠지면 서버 문장), 내부 용어('보충 태그가 있어'·'건강 점수')는 조사까지 맞춰 다듬는다. 영양제 조언은 '지난 조언' 여부도 서버가 판정한다(조언 판 또는 재점검 판정 지문이 다르면 `stale`).
- **2026-10-04** in [meal-nutrition](../topics/meal-nutrition.md) / [ai](../topics/ai.md) (`3d067a0`): 원형에 가장 가까운 완성형. KDRI 2020 대조로 "부족한 영양소"는 서버가 판정하고(건강 진단이 아니라 기록 기반 관찰), kimi-k3 는 대상 영양소마다 성분·형태 조언 문장만 쓴다. `sanitizeAdvice` 의 칸 단위 교체와 `repairs` 집계가 프로브(`probe:meal-nutrition`)의 지표 "서버 문장으로 바꾼 칸"이 된다 — 모델 비교의 핵심 숫자가 곧 이 가드레일이 몇 번 발동했는지다.
- **2026-10-04** in [meal](../topics/meal.md) (`3fd971b`·`e3afe9c`·`2aaaa7e`·`7056244`): 식단 추천. 점수(7요소+배수)·필터가 후보를 정하고 LLM 은 고르기·이유만. 하루 동안 프롬프트가 v3(알레르기·이번 추천의 중심)→v4(반찬·간식을 혼자 권하지 않기, 후보는 흔한 한 끼 목록 `common-meals.ts` 먼저)→v5('안 드셨다'는 요약·태그에 있는 것만)로 바뀌었는데, 매번 **LLM 의 자유를 더 좁히는 방향**이었다 — 틀린 주장 9/64 → 2/36. 이유 문장의 사실 확인은 아직 프로브 쪽에만 있고 서비스 응답에선 하지 않는다.
- **2026-09-05** in [tarot](../topics/tarot.md): 메뉴 타로 — `selectTarotMenus` 가 카드로 후보 메뉴를 고르고 LLM 은 이유만, `menuId` 검증, 칼로리는 카탈로그 이름 매칭. LLM 실패·한도 초과 시 정적 해석 폴백.
- **2026-09-06~12** in [saju-c](../topics/saju-c.md): 명식·십신·대운·택일 점수는 utils 의 결정적 계산(KASI 대조 골든셋 — [golden-set-precision-gate](golden-set-precision-gate.md)), LLM 은 섹션별 해석 문장. '사주에 묻기'는 차단 정규식으로 범위 밖 질문을 서버가 먼저 거른다.

## What This Means

이 구조가 주는 것은 **책임의 위치가 분명하다**는 점이다 — 알레르기 음식이 추천되면 그건 LLM 의 실수가 아니라 후보 필터의 결함이고(실제로 `e3afe9c` 의 수정은 프롬프트가 아니라 후보 단계 `allergensInFoodName` 였다), 프롬프트에 없던 "비타민 D 2000IU" 같은 용량이 화면에 나오면 그건 검사의 구멍이다. 그래서 고칠 곳도, 테스트할 곳도 결정적 코드에 모인다. [synthetic-persona-probe](synthetic-persona-probe.md) 가 점수 층과 LLM 층을 나눠 판정할 수 있는 것도 이 분리 덕이다.

대가는 두 가지. (1) LLM 의 장점인 구체성과 개인화가 깎인다 — kimi-k3 가 gpt-oss 보다 이유가 구체적이지만 단정·자기모순이 많아 추천에선 gpt-oss 를 유지했고, 조언에선 "가끔 보는 리포트라 지연보다 구체성"으로 kimi 를 택했다(같은 판단 기준이 용도마다 다른 답을 낸다). (2) 검사 정규식은 언어 규칙이라 새는 곳이 있다 — 사주 차단 정규식의 `\b` 가 한글에서 무력하다는 지적(26차)처럼, 화이트리스트가 아닌 블랙리스트 검사(`claim`·`hanja`)는 늘 보강 대상이다. 다음 LLM 기능은 "서버가 무엇을 정하고, LLM 출력의 어느 칸을 어떤 규칙으로 검사해, 걸리면 무슨 문장으로 바꾸는가"를 설계 단계에서 표로 적는 것이 이 프로젝트의 관례다.

1. **(32차) 서술자는 LLM 만이 아니다.** 사람이 쓰는 원고도 숫자를 적어 두면 기준·데이터가 바뀔 때 서술만 남아 틀린다. 숫자·판정은 서버가 데이터에서 계산하고, 서술자(LLM·사람)는 그 숫자를 부르는 자리만 갖는 구조가 둘 다에 맞다. 그리고 LLM 이 원문에서 "골라 오는" 작업(메뉴 구성)은 **원문 대조**가 가장 싼 검사다 — 글에 없는 이름은 지어낸 것이다.

## Sources

- [meal-story](../topics/meal-story.md) · [food](../topics/food.md) — 32차
- [apps/friendly/src/modules/meal-recommendation/nutrition-signals.ts](../../apps/friendly/src/modules/meal-recommendation/nutrition-signals.ts) — 32차 영양 신호
- [apps/friendly/src/modules/meal-story/meal-story.resolve.ts](../../apps/friendly/src/modules/meal-story/meal-story.resolve.ts) — 32차 원고 숫자 계산
- [apps/friendly/src/modules/food/menu-composition.ts](../../apps/friendly/src/modules/food/menu-composition.ts) — 32차 원문 대조 채택
- [../topics/meal-nutrition](../topics/meal-nutrition.md)
- [../topics/meal](../topics/meal.md)
- [../topics/tarot](../topics/tarot.md)
- [../topics/saju-c](../topics/saju-c.md)
- [../topics/ai](../topics/ai.md)
- [../../apps/friendly/src/modules/meal-nutrition/meal-nutrition-advice.service.ts](../../apps/friendly/src/modules/meal-nutrition/meal-nutrition-advice.service.ts)
- [../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.service.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.service.ts)
- [../../apps/friendly/src/modules/tarot/tarot.service.ts](../../apps/friendly/src/modules/tarot/tarot.service.ts)
- [../../packages/utils/src/sajuDatePick.ts](../../packages/utils/src/sajuDatePick.ts)
