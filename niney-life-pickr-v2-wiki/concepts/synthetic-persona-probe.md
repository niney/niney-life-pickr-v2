---
concept: 가상 사용자 프로브 — 성향을 설계한 사람을 실제 경로에 태워 결정적 층과 LLM 층을 따로 판정한다
last_compiled: 2026-10-04
topics_connected: [meal, meal-nutrition, food, ai, friendly]
status: active
---

# 가상 사용자 프로브 — 성향을 설계한 사람을 실제 경로에 태워 결정적 층과 LLM 층을 따로 판정한다

## Pattern

식단 추천·영양 조언은 정답표를 만들 수 없는 기능이다 — "오늘 점심에 뭘 먹어야 맞는가"에 골든셋이 없다. 그래서 2026-10-04 하루에 프로브 4종(`probe:meal-recommend`·`probe:meal-settings`·`probe:meal-models`·`probe:meal-nutrition`)과 점검 1종(`check:common-meals`)이 같은 모양으로 굳었다. [golden-set-precision-gate](golden-set-precision-gate.md) 가 "정답을 커밋한다"라면, 이건 **"기대를 가진 사람을 커밋한다"**:

1. **성향이 뚜렷한 가상 사용자를 설계한다** — A 돼지고기·찌개 편중 / B 아침 거르고 야식 / C 새우·게 알레르기·오이 제외 / D 추천에 반응(👎·덜 선호) / E 기록이 다양한 사람(설정 점검용). 각자에게 "이렇게 나와야 한다"는 방향이 있다(C 에겐 새우가 절대 안 나온다, D 가 👎 한 음식은 내려간다).
2. **서비스와 같은 경로로 태운다** — 기록 저장·추천은 `app.inject` 로 실제 라우트를, 모델 비교는 서비스와 같은 후보 경로(후보 풀 → 점수 → 끼니 필터 → 중심 필터)·같은 프롬프트·같은 `thinkOptionForModel`·같은 검사(`sanitizeAdvice`)를 쓰고 LLM 만 바꾼다. 경로가 어긋나면 프로브가 아니라 다른 프로그램을 재는 셈이라, `8e32a49` 는 프로브를 서비스의 `filterForFocus` 와 현재 `tokenVersion` 서명에 맞추는 데 커밋 하나를 썼다.
3. **두 층을 따로 판정한다** — 점수 층(결정적, LLM 없음: 후보 상위 25·상위 10 비교, 매번 같다)과 LLM 층(같은 입력을 N번 — 결과가 매번 다르므로 반복으로 안정성을 본다). 판정은 통과·**확인**·실패 세 칸: 반대로 가면 실패, 기대 방향이면 통과, **움직이지 않으면 "효과 없음"으로 확인** — 이 세 번째 칸이 "설정은 있는데 아무 일도 안 하는" 기능을 잡는다.
4. **LLM 이 쓴 이유를 기록과 대조한다** — "최근 2주 동안 볶음을 전혀 안 드셨다", "어제 X", "N%", "처음 드시는" 같은 확인 가능한 주장만 골라 실제 기록으로 맞춰 보고, 틀린 문장은 리포트에 그대로 남긴다.
5. **dev.db 에 일부러 남기고, 지우는 길과 막는 길을 같이 둔다** — 사람이 웹에서 그 가상 계정으로 로그인해 기록·추천을 눈으로 볼 수 있게 dev.db 에 쓴다. 계정·비밀번호·리포트는 `data/meal-probe/`(git 제외), `--undo` 로 정확히 되돌리고, `prod.db`·비 SQLite 는 거부(알려진 비밀번호의 계정을 만들기 때문).

## Instances

- **2026-10-04** in [meal](../topics/meal.md) (`3fd971b`, `probe:meal-recommend`): 수정 전 **통과 32·확인 15·실패 1** — 4명·세 끼 모두 거의 같은 "감자 / 시금치 / 가자미식해". 원인 다섯(생재료·반찬이 끼니 후보, 미경험 음식이 세 요소에서 만점이라 취향이 늘 짐, 👎 가 취향 감점뿐이라 안 먹어 본 음식엔 무효, 끼니 구분 없음, 인기 동률이면 가나다순)을 고쳐 **47·1·0**, LLM 층 128·0·0.
- **2026-10-04** in [meal](../topics/meal.md) / [food](../topics/food.md) (`8e32a49`·`e3afe9c`·`f5ebf86`·`51dfa7d`, `probe:meal-settings`): E 한 명에 설정만 바꿔 가며 66·14·5 → 79·7·0. **알레르기가 걸러지지 않던 안전 결함**을 찾았다 — 서버는 재료·표시 근거가 있는 행만 거르는데 dev 카탈로그 1,266행 중 근거 있는 행 0, 그래서 새우 알레르기 + 좋아함 '깐풍새우'가 LLM 추천 1번. 이름 단서 `allergensInFoodName` 으로 후보에서 빼고 프롬프트 v3 에 알레르기 줄. 프리셋 '골고루' = '새로운 도전'(상위 10 이 100% 같음), 위치 없는 봄·가을의 날씨 가중치·dev 의 간편함은 "효과 없음"으로 확인(보류).
- **2026-10-04** in [meal](../topics/meal.md) / [ai](../topics/ai.md) (`2aaaa7e`·`7056244`, `probe:meal-models`): gpt-oss:120b vs kimi-k3 를 같은 후보·같은 프롬프트로(18 시나리오 × 2) — 지연 p50 2.0s vs 5.7s, 틀린 주장 14% vs 21%, kimi 는 더 구체적이지만 단정·자기모순이 많아 gpt-oss 유지. 틀린 주장 대조로 프롬프트 v5 의 '안 드셨다' 근거를 고쳐 **9/64(14%) → 2/36(6%)**, 흔한 한 끼 목록(`common-meals.ts`) 도입으로 흔한 한 끼 비율 35% → 100%. `--from-raw` 로 저장한 원 응답에서 지표만 다시 낸다(판정 규칙을 고친 뒤 LLM 을 다시 부르지 않게).
- **2026-10-04** in [meal-nutrition](../topics/meal-nutrition.md) / [ai](../topics/ai.md) (`3d067a0`·`c502759`, `probe:meal-nutrition`): 가상 A·B·C·E + 지정 이메일 사용자로 점검 결과를 뽑고 모델별 조언을 견준다. 지표는 "서버 문장으로 바꾼 칸"(프롬프트에 없는 용량·한자·치료/예방 주장·점검 밖 영양소)과 제품·브랜드 의심 표현 — kimi-k3 5/5·바꾼 칸 0 / gpt-oss 5/5·4.3s 지만 나열식 → kimi 유지.
- **2026-10-04** in [food](../topics/food.md) (`e4ce0e6`·`95ec0cd`): 프로브 출력을 사람이 읽다가 카탈로그 표기 결함이 드러났다 — 끼니 추천에 식약처 대표식품명 '돼지고기'(실은 순대 부속 묶음)·'달걀'(삶은 달걀)이 재료처럼 뜨고, 분류 매핑이 수·조·어·육류를 통째로 회로 옮겨 삶은 달걀·소시지까지 회가 되고, 분식 단어가 재료일 뿐인 한식이 분식으로 분류되는 등. `fix:food-labels`(scripts/fix-food-catalog-labels.ts, 어드민 편집 경로라 여러 번 돌려도 같다)와 적재 보정표 `MFDS_REP_NAME_OVERRIDES` 로 보정.
- **선례(2026-08-23)** in [meal](../topics/meal.md) / [friendly](../topics/friendly.md): `seed:meal-samples`(검증용 15끼, memo 표식으로 `--undo`, prod.db 는 `--yes` 없이 거부) — 데이터를 넣는 골격은 같지만 판정이 없는 씨앗이었다. 이번 라운드에 "기대를 가진 사람 + 자동 판정"이 얹혔다.

## What This Means

**프로브의 판정자는 피검 시스템과 독립이어야 한다** — 이번 라운드의 가장 비싼 교훈이다. `probe:meal-recommend` 의 C(알레르기) 검사는 원래 **서버가 붙인 경고값**을 봤고, 서버가 아무것도 못 거르는 dev 카탈로그에서 그 검사는 늘 통과했다(`8e32a49` 본문: "늘 통과하던 검사였다"). 스크립트가 자기 이름 단어표로 따로 보게 바꾸자 즉시 실패가 나왔다. 같은 원리로 "효과 없음" 칸이 필요하다 — 통과/실패 둘뿐이면 움직이지 않는 설정은 통과로 숨는다.

둘째, **결정적 층과 확률적 층을 섞지 않는다.** 점수 층이 맞아야 LLM 층을 볼 의미가 있고(후보에 감자·시금치만 있으면 어떤 모델도 다양하게 못 고른다), LLM 층의 실패는 반복으로만 판정할 수 있다. 수정은 거의 항상 결정적 층에서 일어났다(후보 필터·점수 배수·1인분 환산) — LLM 프롬프트 수정(v3 알레르기 줄, v5 근거)은 그 뒤 마지막 한 걸음이었다.

셋째, 이 패턴은 **dev 데이터의 빈곤을 드러내는 장치**이기도 하다. 인기도 0·재료 정보 0·알레르기 근거 0 인 dev 카탈로그에선 날씨·간편함·식사 방식이 구조적으로 "효과 없음"이고, `check:common-meals` 는 dev 에 제육덮밥·닭갈비가 없다는 것을 알려 준다 — 그래서 "운영에서 확인" 항목이 남는다(읽기 전용 점검만 운영에서 돌릴 수 있게 설계). 다음에 정답표가 없는 LLM 기능(예: 사주에 묻기·여행 코스)을 만들면, 기대를 가진 가상 사용자 3~5명과 두 층 판정, `--undo`·prod 거부를 먼저 세우는 것이 이 프로젝트의 표준 절차다.

## Sources

- [../topics/meal](../topics/meal.md)
- [../topics/meal-nutrition](../topics/meal-nutrition.md)
- [../topics/food](../topics/food.md)
- [../topics/ai](../topics/ai.md)
- [../topics/friendly](../topics/friendly.md)
- [../../docs/PLAN-meal.md](../../docs/PLAN-meal.md)
- [../../apps/friendly/scripts/probe-meal-recommend.ts](../../apps/friendly/scripts/probe-meal-recommend.ts)
- [../../apps/friendly/scripts/probe-meal-settings.ts](../../apps/friendly/scripts/probe-meal-settings.ts)
- [../../apps/friendly/scripts/probe-meal-models.ts](../../apps/friendly/scripts/probe-meal-models.ts)
- [../../apps/friendly/scripts/probe-meal-nutrition.ts](../../apps/friendly/scripts/probe-meal-nutrition.ts)
- [../../apps/friendly/scripts/check-common-meals.ts](../../apps/friendly/scripts/check-common-meals.ts)
