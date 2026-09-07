---
concept: 골든셋 정밀도 게이트 — 규칙 엔진은 커밋된 정답표로, LLM 모델은 프로브 수치로 결정한다
last_compiled: 2026-09-07
topics_connected: [food, saju-c, saju-g, ai, utils, friendly]
status: active
---

# 골든셋 정밀도 게이트 — 규칙 엔진은 커밋된 정답표로, LLM 모델은 프로브 수치로 결정한다

## Pattern

이번 라운드의 세 도메인이 서로 모른 채 같은 방법론에 도달했다: **결정적 계산은 리포에 커밋한 정답표(golden)와 측정 스크립트로 정밀도를 숫자로 고정하고, 그 숫자를 넘어야 규칙을 바꾼다.** LLM 이 끼는 자리는 별도의 `probe:*` 스크립트로 모델 후보를 같은 입력으로 돌려 JSON 유효율·지연·문장 품질을 표로 만든 뒤 기본 모델을 고른다.

- **정답표는 커밋** — `apps/friendly/golden/menu-nutrition.golden.json`·`menu-decompose.golden.json`(메뉴 칼로리), `packages/utils` 의 사주 테스트 안 KASI 대조 표(절기 ±1분·설날 61건·윤달 전부), 사주(G)의 KASI·IANA 53개 고정 자료.
- **측정은 스크립트** — `measure-menu-golden.ts`(정밀도 99.5%)·`measure-menu-decompose.ts`(93.8%)·`measure-menu-nutrition.ts`·`probe-menu-coverage.ts`(표시율 49.8%→77.9% — 척도는 표시율이 아니라 정밀도), 사주 `build:saju-tables` 가 astronomy-engine 결과를 KASI 공개값과 대조.
- **모델은 프로브** — `probe:tarot-reading`·`probe:saju-reading --models=…`·`probe:saju-g-reading`. 사주(C)는 4모델 × 3사주 × 4섹션에서 JSON 12/12·수리 오류 0 을 확인하고 문장 자연스러움으로 kimi-k3 를 골랐다(속도만 보면 gpt-oss:120b 2.0s). 결과·근거는 `.env.example` 주석과 PLAN 에 남긴다.

## Instances

- **2026-09-06** in [saju-c](../topics/saju-c.md) / [utils](../topics/utils.md) (`db1415f`, `d31843b`): 절기·음력 표 생성 스크립트가 KASI 골든셋과 일치할 때만 커밋, 표본 사주(1990-05-15 경오 신사 경진 계미 등) 테스트 고정. 모델 프로브 → 기본 kimi-k3, 대안 deepseek-v4-pro.
- **2026-09-06~07** in [saju-g](../topics/saju-g.md): KASI·IANA 53 대조 테스트 + 프롬프트 v3 의 K3 12/12 실측 — 다른 세션이 독립적으로 같은 형태.
- **2026-09-02** in [food](../topics/food.md) (`0d2584a`…`51de12a`, 커밋은 전부 09-02): 원형. 메뉴명 3등급 판정 골든 444건 99.5%(기준선 97.6%), 세트 분해 골든 37건 93.8%, 불투명 세트 45→34건 — 규칙 4종·LLM 분해 v3 채택이 전부 숫자로 기록됐다. `measure:menu-golden` 은 LLM·웹 캐시만 읽으므로 `probe:menu-coverage --ask --web` 으로 먼저 채운다.
- **2026-09-03** in [ai](../topics/ai.md) / [tarot](../topics/tarot.md): `probe-tarot-reading.ts` 가 모델별 JSON 유효율을 재고 purpose `tarot` 기본 모델을 정함.

## What This Means

리뷰 군집화·요약 시절엔 "LLM 이 잘하는지"를 눈으로 봤다면, 이제는 **결정을 숫자로 남기는 것**이 규범이 됐다. 이점은 두 가지 — 규칙을 손볼 때 회귀가 바로 잡히고, "왜 이 모델인가"에 답이 있다. 한계도 분명하다: 골든셋은 만든 사람의 편향을 그대로 고정하고(사주는 유파별 차이를 "가장 널리 쓰는 규칙 하나"로 못 박음), 프로브의 "사실 오염" 같은 근사 지표는 판단에서 제외했다는 기록이 필요하다. 다음 규칙 엔진(예: 대운·신살 확장)을 만들 땐 정답표부터 커밋하고, 모델 교체는 프로브 표 갱신이 선행돼야 한다.

## Sources

- [../topics/food](../topics/food.md)
- [../topics/saju-c](../topics/saju-c.md)
- [../topics/saju-g](../topics/saju-g.md)
- [../topics/ai](../topics/ai.md)
- [../topics/utils](../topics/utils.md)
- [../topics/friendly](../topics/friendly.md)
