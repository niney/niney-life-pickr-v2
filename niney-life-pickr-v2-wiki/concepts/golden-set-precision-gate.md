---
concept: 골든셋 정밀도 게이트 — 규칙 엔진은 커밋된 정답표로, LLM 모델은 프로브 수치로 결정한다
last_compiled: 2026-10-26
topics_connected: [food, saju-c, saju-g, ai, utils, friendly, meal, menu-board, hiking]
status: active
---

# 골든셋 정밀도 게이트 — 규칙 엔진은 커밋된 정답표로, LLM 모델은 프로브 수치로 결정한다

## Pattern

이번 라운드의 세 도메인이 서로 모른 채 같은 방법론에 도달했다: **결정적 계산은 리포에 커밋한 정답표(golden)와 측정 스크립트로 정밀도를 숫자로 고정하고, 그 숫자를 넘어야 규칙을 바꾼다.** LLM 이 끼는 자리는 별도의 `probe:*` 스크립트로 모델 후보를 같은 입력으로 돌려 JSON 유효율·지연·문장 품질을 표로 만든 뒤 기본 모델을 고른다.

- **정답표는 커밋** — `apps/friendly/golden/menu-nutrition.golden.json`·`menu-decompose.golden.json`(메뉴 칼로리), `packages/utils` 의 사주 테스트 안 KASI 대조 표(절기 ±1분·설날 61건·윤달 전부), 사주(G)의 KASI·IANA 53개 고정 자료.
- **측정은 스크립트** — `measure-menu-golden.ts`(정밀도 99.5%)·`measure-menu-decompose.ts`(93.8%)·`measure-menu-nutrition.ts`·`probe-menu-coverage.ts`(표시율 49.8%→77.9% — 척도는 표시율이 아니라 정밀도), 사주 `build:saju-tables` 가 astronomy-engine 결과를 KASI 공개값과 대조.
- **모델은 프로브** — `probe:tarot-reading`·`probe:saju-reading --models=…`·`probe:saju-g-reading`. 사주(C)는 4모델 × 3사주 × 4섹션에서 JSON 12/12·수리 오류 0 을 확인하고 문장 자연스러움으로 kimi-k3 를 골랐다(속도만 보면 gpt-oss:120b 2.0s). 결과·근거는 `.env.example` 주석과 PLAN 에 남긴다.

## Instances

- **2026-10-26** in [hiking](../topics/hiking.md) / [utils](../topics/utils.md) (9차 보강, 작업 트리): **정답표를 남의 공식 안내로** 삼은 변형. 등산 예상 시간 식(`estimateHikingMinutes`)을 국립공원 공식 소요시간으로 다시 맞췄다 — 공식 안내는 편도·왕복이 섞여 있어 "당일·공식 거리와 선 길이 차이 15% 안·끊김 300m 미만" 으로 거른 **103코스** + 2차 표본 7구간을 정답으로, 배율·피로 상한·피로 분모를 격자 탐색(목적함수 = 중앙 절대 오차 + 치우침 + 이동 시간대별 치우침 최댓값)해 1.12/360/600 → **1.35/180/1500**(중앙 오차 16.4 → 11.8%, 치우침 −6.9 → +0.1%, 시간대마다 ±5% 안). 판정에 난이도 분포 변화(쉬움 4,738 → 4,478)와 공식 상·중·하 일치 수(87/153 그대로)도 같이 봤다. 지형 고도(SRTM)는 GPX 고도가 있는 코스 60개를 지형 고도로 다시 만들어 예상 시간 중앙 오차 4.3% 를 확인한 뒤 채택. **다만 이번 표본·측정 스크립트는 커밋하지 않았다** — 수치는 `docs/PLAN-hiking.md` §9차 보강에만 있어 다음 재보정은 프로브를 다시 써야 한다(아래 What This Means).
- **2026-10-23** in [meal](../topics/meal.md) / [food](../topics/food.md) (`92e79e9a`): 원재료 1회 분량 규칙(과일 100g·채소 70g …)을 넣으면서 메뉴 칼로리 골든 정밀도·재현율이 바꾸기 전과 같은 99.5%/98.5% 임을 확인 — 기존 골든셋이 인접 규칙의 회귀 게이트로 다시 쓰였다.
- **2026-10-10** in [menu-board](../topics/menu-board.md) / [ai](../topics/ai.md) (`4597294b`·`faa12818`): 메뉴판 사진 읽기. 비교 단계(`docs/menu-board-ocr-probe.md` — OCR 3종·ollama 비전 9모델·Claude·Codex)에서 사진을 직접 보고 쓴 **검수 정답 20장**(`apps/friendly/golden/menu-boards/`)을 만들고, 그 정답으로 모델(kimi-k3)·프롬프트 규칙(규칙 없이 97.4% → 규칙 99.5%)·사진 크기(긴 변 2,000px 로 키워 99.5 → 99.8%)·생각 모드(끔)를 숫자로 골랐다. 결과는 F1 99.8%(308개 중 307개, 지어냄 0), friendly 경로로 다시 재서 99.7%. 회귀 게이트는 `eval:menu-boards`(라우트와 같은 서비스로 읽고 채점해 `data/menu-boards/eval-report.json` — 어드민 '정확도' 탭)이고, 채점기는 비교 때의 Python 채점기를 옮겨 예전 결과 29개를 다시 매겨 같은 점수를 확인했다. 프롬프트 v2(크기별 항목)도 이 평가를 거쳐 들어왔다.
- **2026-10-04** in [meal](../topics/meal.md) / [food](../topics/food.md): 정답표를 만들 수 없는 기능(식단 추천·영양 조언)에서 이 방법론이 **가상 사용자 프로브**로 갈라져 나왔다 — 정답 대신 "기대를 가진 사람"을 커밋하고 점수 층·LLM 층을 따로 판정한다([synthetic-persona-probe](synthetic-persona-probe.md)). 1인분 규칙을 바꾼 `9019cf5` 뒤에도 메뉴 칼로리 골든 정밀도 99.5% 가 그대로임을 확인 — 기존 골든셋은 인접 규칙 변경의 회귀 게이트로도 쓰인다.
- **2026-09-06** in [saju-c](../topics/saju-c.md) / [utils](../topics/utils.md) (`db1415f`, `d31843b`): 절기·음력 표 생성 스크립트가 KASI 골든셋과 일치할 때만 커밋, 표본 사주(1990-05-15 경오 신사 경진 계미 등) 테스트 고정. 모델 프로브 → 기본 kimi-k3, 대안 deepseek-v4-pro.
- **2026-09-06~07** in [saju-g](../topics/saju-g.md): KASI·IANA 53 대조 테스트 + 프롬프트 v3 의 K3 12/12 실측 — 다른 세션이 독립적으로 같은 형태.
- **2026-09-02** in [food](../topics/food.md) (`0d2584a`…`51de12a`, 커밋은 전부 09-02): 원형. 메뉴명 3등급 판정 골든 444건 99.5%(기준선 97.6%), 세트 분해 골든 37건 93.8%, 불투명 세트 45→34건 — 규칙 4종·LLM 분해 v3 채택이 전부 숫자로 기록됐다. `measure:menu-golden` 은 LLM·웹 캐시만 읽으므로 `probe:menu-coverage --ask --web` 으로 먼저 채운다.
- **2026-09-03** in [ai](../topics/ai.md) / [tarot](../topics/tarot.md): `probe-tarot-reading.ts` 가 모델별 JSON 유효율을 재고 purpose `tarot` 기본 모델을 정함.

## What This Means

리뷰 군집화·요약 시절엔 "LLM 이 잘하는지"를 눈으로 봤다면, 이제는 **결정을 숫자로 남기는 것**이 규범이 됐다. 이점은 두 가지 — 규칙을 손볼 때 회귀가 바로 잡히고, "왜 이 모델인가"에 답이 있다. 한계도 분명하다: 골든셋은 만든 사람의 편향을 그대로 고정하고(사주는 유파별 차이를 "가장 널리 쓰는 규칙 하나"로 못 박음), 프로브의 "사실 오염" 같은 근사 지표는 판단에서 제외했다는 기록이 필요하다. 다음 규칙 엔진(예: 대운·신살 확장)을 만들 땐 정답표부터 커밋하고, 모델 교체는 프로브 표 갱신이 선행돼야 한다.

2026-10 의 두 사례가 경계를 보여 준다. 메뉴판은 정답표(사진 20장)·채점기·평가 스크립트를 **모두 커밋**해 프롬프트 v2 를 같은 자로 잴 수 있었다. 등산 시간 보정은 남의 공식 안내를 정답으로 쓰는 **더 싼 변형**이지만 거른 표본 목록과 측정 스크립트를 임시로만 써서, 숫자만 문서에 남고 자는 사라졌다 — 공원마다 안내 관행이 다른(월악산 −18%·오대산 +38%) 시끄러운 정답일수록 표본 목록을 커밋해 두는 편이 다음 보정의 비용을 줄인다.

## Sources

- [../topics/food](../topics/food.md)
- [../topics/saju-c](../topics/saju-c.md)
- [../topics/saju-g](../topics/saju-g.md)
- [../topics/ai](../topics/ai.md)
- [../topics/utils](../topics/utils.md)
- [../topics/friendly](../topics/friendly.md)
- [../topics/menu-board](../topics/menu-board.md)
- [../topics/hiking](../topics/hiking.md)
- [../topics/meal](../topics/meal.md)
