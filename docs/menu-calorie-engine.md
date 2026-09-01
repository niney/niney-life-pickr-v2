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
| `resolve.ts` | 캐스케이드 exact/alias → synonym → modifier → variant(부위+구이 / 조리접미→원재료) → suffix → hint(생재료 제외). 등급 판정과 트레이스. |
| `engine.ts` | `MenuNutritionEngine` — 인덱스·어휘를 들고 동기로 판정. DB·LLM·웹 의존 없음. |

`menu-nutrition.ts` 는 호환 파사드(re-export + Prisma 로 인덱스·어휘를 읽는 `MenuNutritionResolver`).
LLM 매칭·웹 실측은 엔진 **뒤** 계층이고, LLM 표준명은 다시 엔진에 넣어 판정한다(등급 규칙이 한 곳에만).

## 등급

- `per_serving`: exact/alias/synonym/modifier 매칭이고 중량·인분·크기·수량·양 수식어(미니) 표식이 없으며 카탈로그 1인분 중량이 100g 초과.
- `per_100g` / `per_100ml`: 그 외 100g당 값이 있을 때. variant/hint/suffix/llm/web 은 항상 이 등급.
- `components`: "문어+소라+새우장" 같은 결합 기호 세트 — `parts` 에 구성요소별 판정. 합계(`kcal`)는 구성 전부가 1인분일 때만, 아니면 null.
- 미표시: 세트어(모듬·N가지 선택)·판정 없음. 수량어(한판·반판)는 뒤 부위를 찾으면 100g당, 못 찾으면 세트.
- 세트 규칙: 결합 기호(+ & , /)가 세트어보다 먼저("샤브 + 닭꼬치 세트"는 나열), 괄호 안 나열("정식(새우장+양념게장+…)")도 구성,
  괄호 안 세트어("(찍먹 세트)")는 옵션 설명, 주메뉴 하나짜리 세트("와규꽃살 2인 세트"·"보쌈 정식")는 그 음식의 100g당.

## 검증

- 골든셋 `apps/friendly/golden/menu-nutrition.golden.json` — 로컬 470 메뉴명 중 444건(판단 불가 26건 제외).
  `expect`(정답 음식명 복수 허용 | null=미표시가 정답), `basis`, `reviewed`(approved=현재 판정 승인, corrected=정정).
- `pnpm --filter friendly measure:menu-golden` — 계층별 **정밀도**(표시한 것 중 정답)와 재현율. LLM·웹은 캐시만 읽으니
  먼저 `probe:menu-coverage --ask=N --web=N` 으로 채운다. 척도는 정밀도다 — 표시율을 올리는 규칙이 정밀도를 깎으면 거부.
- 2026-09-03 기준: 정밀도 99.5%(383건 중 381), 재현율 99.0%. 엔진 전환 전 기준선 97.6% / 93.5%.
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
