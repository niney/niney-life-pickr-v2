# 메뉴 칼로리 판정 엔진

맛집 상세 > 메뉴 탭의 칼로리 칩을 만드는 규칙 엔진. 코드는 `apps/friendly/src/modules/food/engine/`.
데이터 출처와 적재는 [data-sources.md](data-sources.md), 계약은 `packages/api-contract/src/schemas/menu-nutrition.ts`.

## 구조

| 파일 | 역할 |
|---|---|
| `lexicon.ts` | 어휘(수식어·동의어·세트어·옵션어·접미·별칭). 코드 기본값 `DEFAULT_LEXICON_SOURCE`. 규칙(코드)과 어휘(데이터)를 분리한다. |
| `lexicon-db.ts` | `menu_lexicon` 테이블(어드민 편집)을 기본 어휘 위에 얹는다. 종류: modifier·size·synonym·set·option·suffix_block·raw_suffix·quantifier·alias. |
| `parse.ts` | 메뉴명 전처리 — 태그·장식(한자·★·"72시간 숙성")·중량·인분·수량·크기·옵션 슬래시·수량어(한판) 분리, 결합 기호 세트의 구성요소 분해. |
| `catalog-index.ts` | 카탈로그 2천 행의 메모리 인덱스(이름·별칭 exact, 접미 조회). 부팅 시 만들고 10분마다 다시 읽는다. |
| `resolve.ts` | 캐스케이드 exact/alias → synonym → modifier → variant(부위+구이 / 조리접미→원재료) → suffix → hint(생재료 제외). 등급 판정과 트레이스. 영양 없는 행(외식 어휘가 이름만 차지)에 걸리면 끝내지 않는다 — 같은 키의 영양 있는 별칭 행(`exactWithKcal`: 닭가슴살 → 닭가슴·공깃밥 → 공기밥) → 남은 같은 음식 단계 → **조리형태가 같은** 접미(돼지국밥(밥) → 국밥, 기타·미분류 어휘는 접미 안 봄), 끝까지 없으면 예전처럼 no_kcal. |
| `engine.ts` | `MenuNutritionEngine` — 인덱스·어휘를 들고 동기로 판정. DB·LLM·웹 의존 없음. |

`menu-nutrition.ts` 는 호환 파사드(re-export + Prisma 로 인덱스·어휘를 읽는 `MenuNutritionResolver`).
LLM 매칭·웹 실측은 엔진 **뒤** 계층이고, LLM 표준명은 다시 엔진에 넣어 판정한다(등급 규칙이 한 곳에만).
규칙이 못 잡은 이름(no_match·fuzzy_rejected)과 **영양 없는 행에서 끝난 이름(no_kcal)** 이 LLM 단계로 간다 — no_kcal 은
2026-11-08 전엔 막다른 길이라 운영 사본 맛집 메뉴 이름 6,056종의 23.5%(1,426종: 칠리새우·청국장·후라이드치킨·편육…)가
칼로리를 못 받았다. LLM 매칭 v2(`menu-llm-match.prompts.ts`)는 후보·표준명 조회에 100g당 열량이 있는 행만 쓰고, 범주어 행
(음료·고기·술… 어휘 suffixBlock)은 답으로 받지 않는다. v1 판정 중 열량 있는 행을 고른 것은 그대로 쓰고 나머지만 다시 묻는다.

## 등급

- `per_serving`: exact/alias/synonym/modifier 매칭이고 중량·인분·크기·수량·양 수식어(미니) 표식이 없으며 카탈로그 1인분 중량이 100g 초과.
- `per_100g` / `per_100ml`: 그 외 100g당 값이 있을 때. variant/hint/suffix/llm/web 은 항상 이 등급.
- `components`: "문어+소라+새우장" 같은 결합 기호 세트 — `parts` 에 구성요소별 판정. 합계(`kcal`)는 구성 전부가 1인분일 때만, 아니면 null.
- `portion`(100g당 항목의 부가 환산): 메뉴명에 중량이 있으면 그 양의 kcal(`stated`, 가정 없음 — "항정살 150g 약 461kcal"),
  없으면 카탈로그 1인분 중량, 그것도 없으면 종류별 1인분 기준 중량표(`lexicon.portionGrams`, 어휘 DB kind `portion`)로
  "1인분 약 488kcal (150g)"(`typical`, ±30% 근사 — 테두리 칩으로 구분, 100g당·기준 중량은 툴팁). 칩엔 숫자 하나만 보인다. 1인분 등급 항목엔 없다.
  중량표 키는 조리음식이면 dishType, 원재료 DB(mfds-raw) 행이면 식품군 — 육류·수산물 150g(고기집 관행)과 2026-10 에 더한
  과일 100·채소 70·버섯 30·감자 140·곡류 90·견과 10·콩 20·달걀 60g(2020 KDRI 1인 1회 분량). 해조류는 마른 것·생것이 섞여 없다.
- 식단 기록도 같은 엔진·LLM·웹 캐시를 쓴다: 카탈로그로 못 채운 식단 항목 이름은 `meal/meal-nutrition-estimate.ts` 가
  규칙 → LLM 매칭 → 웹 실측 순으로 "○○ 기준 추정"(donor_estimate)을 붙이고, 아직 안 물어본 이름은 저장 뒤 백그라운드로 묻는다.
- 미표시: 세트어(모듬·N가지 선택)·판정 없음. 수량어(한판·반판)는 뒤 부위를 찾으면 100g당, 못 찾으면 세트.
- 세트 규칙: 결합 기호(+ & , /)가 세트어보다 먼저("샤브 + 닭꼬치 세트"는 나열), 괄호 안 나열("정식(새우장+양념게장+…)")도 구성,
  괄호 안 세트어("(찍먹 세트)")는 옵션 설명, 주메뉴 하나짜리 세트("와규꽃살 2인 세트"·"보쌈 정식")는 그 음식의 100g당.

## 검증

- 골든셋 `apps/friendly/golden/menu-nutrition.golden.json` — 로컬 470 메뉴명 중 444건(판단 불가 26건 제외).
  `expect`(정답 음식명 복수 허용 | null=미표시가 정답), `basis`, `reviewed`(approved=현재 판정 승인, corrected=정정).
- `pnpm --filter friendly measure:menu-golden` — 계층별 **정밀도**(표시한 것 중 정답)와 재현율. LLM·웹은 캐시만 읽으니
  먼저 `probe:menu-coverage --ask=N --web=N` 으로 채운다. 척도는 정밀도다 — 표시율을 올리는 규칙이 정밀도를 깎으면 거부.
- 2026-09-03 기준: 정밀도 99.5%(383건 중 381), 재현율 99.0%. 엔진 전환 전 기준선 97.6% / 93.5%.
- 2026-11-08 영양 없는 행 처리(위 `resolve.ts`): 운영 사본 카탈로그(영양 없는 행 1,506 중 외식 어휘 1,160, 영양 없는 이름 행이 가린
  별칭 94개)에서 정밀도 93.9 → **95.1%**(214건 중 201 → 266건 중 253)·재현율 51.0 → **64.2%**, 새 오답 0. dev.db 는 99.5% / 98.5%
  그대로. 버린 변형: 영양 없는 더 긴 접미 키를 건너뛰기(왕갈비 → 갈비 3건 오답 — 93.8%), 접미에서 별칭으로 바꿔치기(칠리새우 →
  대하 5건), 조리형태를 안 보는 접미(어향가지 → 가지).
- 2026-11-08 LLM 매칭 v2 + no_kcal 의 LLM 단계(운영 사본, 골든 규칙 밖 130개를 gemma4:31b 로 다시 물음): v1 은 음식을 고른 104개 중
  71개(68%)가 영양 없는 행이었다. LLM 계층 — 운영 그대로(v1, no_match 만) 표시 20·정답 20, v1 을 no_kcal 까지 33·30(90.9%),
  **v2 86·80(93.0%)**. 전체(규칙+LLM+웹) 정밀도 94.4%·재현율 **89.1%**(규칙만 95.1% / 64.2%) — 정밀도 −0.7%p 와 재현율 +25%p 를
  맞바꿨다. 남은 오답 8건 중 5건은 이름만 다르고 열량은 맞는 것(모츠나베 → 소곱창전골·가브리보쌈 → 고기수육·왕갈비 → 갈비).
  같이 넣은 규칙: 수량어(한판)는 영양 없는 행만 걸리면 세트(돼지한판(600g) → 돼지고기 방지), 범주어 답 거부(음료수 → 음료 방지).
  맛집 메뉴 표본(no_kcal 상위 60개): LLM 35·웹 20·미표시 5(짬짜면·술국·주류·바질새우춘권·볼로냐 두부).
- 단위 테스트 `menu-nutrition.test.ts`(엔진 인메모리 인덱스), `menu-nutrition.service.test.ts`(LLM·웹·세트 흐름).
- 스팟체크 `pnpm --filter friendly probe:menu-resolve "항정살 150g" "生生生연어사시미"` — 트레이스로 어느 단계에서 붙었는지 본다.

## 어휘 편집(어드민)

어드민 > 음식 카탈로그 > "메뉴 칼로리 판정 어휘". API `GET/POST /api/v1/admin/food/menu-lexicon`, `DELETE …/:id`.
값(칼로리)은 카탈로그에만 있고 여기엔 이름 규칙만 있어 잘못 넣어도 칼로리가 생기지는 않는다. 저장 후 10분 안에 반영.
운영 절차: `probe:menu-coverage` 의 "LLM hit" 목록에서 자주 나오는 표기를 alias 로 승격 → `measure:menu-golden` 으로 정밀도 확인.

## LLM 분해·구성요소 연결

- 결합 기호 세트의 구성요소가 규칙에 안 잡히면 LLM 매칭(menu-llm-match)·웹 실측이 채운다(단독 메뉴명과 같은 경로).
- 구성이 이름에 없는 세트("돼지모듬"·"모듬회 대")는 `menu-llm-decompose.service.ts` 가 구성 음식명을 추정한다
  (같은 모델, `menu_llm_decompositions` 어휘 캐시, high 만·1~8개·범주어 제외). 구성 1개면 그 음식의 100g당 단독 항목.
  구성요소 칼로리는 다시 엔진·LLM 매칭으로 잡고 숫자는 LLM 이 만들지 않는다. 응답의 `partsEstimated: true`, 칩은 "AI 추정 구성".
  식당마다 다른 이름(커플세트·A세트)은 LLM 이 low 를 주어 빠진다.
- 앱(apps/mobile) 메뉴 탭도 같은 훅으로 칩을 그린다(MenuGrid kcalByName).
- 분해 골든셋 `apps/friendly/golden/menu-decompose.golden.json` 37건(로컬 불투명 세트 32 + 관용 세트 5) + `measure:menu-decompose [--ask]`.
  2026-09-03(프롬프트 v3, high 만, 범주어 제거): 분해 정밀도 15/16(93.8%), 재현율 15/15. 남은 1건은 "닭꼬치 모듬"을 맛 종류가 아닌 부위 꼬치로 나눈 것.

## 남은 것

- ML 증류(LLM 판정을 소형 모델로)는 어휘가 1만 건을 넘고 LLM 호출이 부담될 때.
