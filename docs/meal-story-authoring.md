# 건강식단 스토리 만들기

'건강식단'은 주제 하나(나트륨 줄이기 …)를 장면 여러 장으로 넘겨 보는 손수 만든 콘텐츠다. 누구나 보고(`/meal/stories`),
공유 링크는 카카오톡 미리보기가 뜬다. 콘텐츠는 **사람이 Claude Code 로 만든다** — 서비스가 그때그때 LLM 으로 만들지 않는다.
계획·결정은 [PLAN-meal-story.md](PLAN-meal-story.md).

## 한눈에

| 누가 | 무엇을 |
|---|---|
| 사람 | 주제·레시피를 정하고 **직접 만들어 보고 사진을 찍는다**(완성 1장 + 단계별). 출처를 확인하고, 화면에서 움직임 느낌을 보고, 게시를 정한다 |
| Claude Code | 원고(`story.json`)를 쓰고, 재료의 식품코드를 찾고, `build:meal-stories`·`check:meal-stories` 를 돌려 고치고, 화면을 캡처해 보여 준다 |

원고에는 **숫자를 직접 적지 않는다**. 섭취기준·식품 100g당 값·레시피 합계·내 기록을 *가리키면* 서버가 계산한다. 숫자를 상식으로
적으면 틀리기 쉽고(예: "통밀면은 열량이 적다" — 실제로는 거의 같고 식이섬유가 늘어난다), 영양 탭 판정과 어긋난다.

## 파일

```
apps/friendly/content/meal-stories/<slug>/
  story.json      원고 — 사람·Claude Code 가 쓴다
  foods.json      재료 100g당 값 — build:meal-stories 가 만든다(손으로 고치지 않는다)
  images/*.jpg    화면에 쓰는 사진 — build:meal-stories 가 originals/ 에서 만든다
  originals/      찍은 원본 사진 — git 밖(.gitignore), 위치 정보가 있을 수 있다
```

- `slug` 는 폴더 이름과 같다(소문자·숫자·하이픈, 예: `sodium-tomato-pasta`).
- 형식(zod)은 `apps/friendly/src/modules/meal-story/meal-story.script.ts`, 화면이 받는 모양은 `@repo/api-contract` 의
  `MealStory`. 첫 편 `sodium-tomato-pasta` 가 예시다.
- 원본 식품 데이터: `data/open/food/mfds-nutrition-15100065.csv`(원재료성식품)·`-15100066.csv`(가공식품) — git 밖,
  받는 곳은 [data-sources.md](data-sources.md). 이 컴퓨터에 없으면 `foods.json` 을 새로 만들 수 없다(점검은 형식만 본다).

## 원고(story.json)

```jsonc
{
  "slug": "sodium-tomato-pasta",
  "status": "draft",                 // draft = 관리자만 본다, published = 누구나
  "title": "…",                      // 32자
  "summary": "…",                    // 90자 — 목록·카톡 미리보기
  "topic": { "nutrient": "sodium", "direction": "reduce" },  // 영양 탭 '많음'(reduce)·'부족'(increase) 줄에 링크
  "publishedAt": "2026-11-09",
  "reviewedAt": null,                // 사람이 출처·숫자를 확인한 날 — 게시하려면 필수
  "cover": "cover.jpg",              // 게시하려면 필수
  "sources": [{ "id": "mfds-sodium-guide", "label": "…", "url": "…" }],
  "foods": [ … ],
  "recipe": { … },
  "scenes": [ … ]                    // 3~14장(12장 안쪽 권장), 첫 장 cover · 끝 장 outro
}
```

### 숫자 가리키기(value)

| 쓰는 법 | 값 | 출처 |
|---|---|---|
| `{ "kdri": "sodium" }` | 2020 한국인 영양소 섭취기준 성인 값(나트륨 2,300mg = 만성질환위험감소섭취량, 칼륨 3,500mg). 나이별로 다르면 서버가 덧말로 붙인다 | 자동 |
| `{ "food": "spaghetti", "nutrient": "kcal", "grams": 80 }` | foods 의 100g당 값 × 그램 | 자동(식품의 출처) |
| `{ "recipe": "sodiumMg", "part": "sauce" }` | 레시피 1인분 합계(`part` 를 주면 그 묶음 재료만) | 자동 |
| `{ "my": "sodium" }` | 보는 사람의 최근 2주 하루 평균 — 로그인했을 때만, 화면이 통계로 채운다 | — |
| `{ "value": 3000, "unit": "mg", "source": "id" }` | 출처가 있는 고정값(예: 국민건강통계 평균). **sources 의 id 필수** | 그 출처 |

영양 값 이름: `kcal` `carbG` `proteinG` `fatG` `sugarG` `fiberG` `sodiumMg` `potassiumMg`.
기준값은 영양 탭과 같은 KDRI 를 쓴다 — WHO 2,000mg 같은 다른 기준을 글로 섞지 않는다.

### 재료(foods)

하나만 고른다.

- `"ref": { "db": "raw" | "processed", "code": "R101-024020002-0000" }` — 한 식품. 코드는
  `pnpm --filter friendly build:meal-stories --find=스파게티,파마산` 으로 찾는다(이름에 그 말이 든 식품의 코드·분류·100g당
  열량·나트륨). 생것·말린것·데친것을 구별해 고른다(스파게티 건면은 `_말린것`, 삶은 면은 `_말린것을 삶은것`).
- `"group": { "db": "processed", "all": ["토마토","소스"], "any": ["스파게티","파스타"], "none": ["소스파스타"] }` — 시판
  제품 여러 개의 **중앙값**. 특정 제품을 고르지 않아 브랜드를 밝히지 않아도 된다. build 출력의 제품 이름을 보고 다른 것이 섞였으면
  `none` 으로 뺀다(첫 편: 완성 요리 '토마토소스파스타'를 뺐다). 최소 3개(`min`).
- `"manual": { "per100": { … }, "source": "id", "note": "…" }` — 표준데이터에 없을 때만. 점검이 '사람 확인 목록'에 올린다.

### 레시피(recipe)

`name`(30자) · `servings` · `dishType`(카탈로그 조리형태, 예: `noodle`) · `ingredients`(식품 id·그램·표시 이름 24자·메모 30자·묶음
`part`) · `steps`(100자, 팁 60자, 사진). 그램은 **조리 전 무게**로 적는다(건면 80g — 삶으면 두 배 넘게 늘어난다).
[이 레시피로 기록]을 누르면 서버가 이 레시피를 카탈로그 음식(`source manual`, `sourceId meal-story:<slug>`)으로 맞춰,
기록에도 스토리와 같은 1인분 값이 들어간다.

### 장면(scenes) — 틀 8종

| type | 쓰는 곳 | 필드(글자 수) |
|---|---|---|
| `cover` | 표지 | kicker 16 · title 32 · subtitle 70 · image(없으면 cover) |
| `stat` | 큰 숫자 1~3개 | title 32 · figures[{label 24, value}] · note 90 |
| `bars` | 막대 비교 2~4개(바꿔 먹기 포함) | title · bars[{label 24, value, aside?, highlight?}] · note |
| `list` | 방법·원인 목록 2~6개 | title · items[{title 22, text 70}] · note |
| `ingredients` | 재료(레시피에서) | title |
| `step` | 만드는 법 한 단계(레시피에서) | step(1부터) |
| `nutrition` | 1인분 영양정보 라벨 | title · nutrients[2~6] · cautions(`potassium` — 영양 탭과 같은 주의 문구) · note |
| `outro` | 마무리 + 행동 | title · text · actions(`record` `recipe` `share` `stats`) |

`bars` 의 `aside` 는 막대 옆 작은 값(예: 열량 막대 옆 단백질) — food·recipe 값만. `highlight` 막대만 먹색이고 나머지는 회색이다
(식단 화면은 색을 상태에만 쓴다).

## 말투

- 효능을 단정하지 않는다 — 치료·완치·예방된다·디톡스·해독·살 빠진다·무조건·100% 는 점검이 오류로 막는다. '~할 수 있어요',
  '~에 도움이 될 수 있어요'까지.
- 영양 값(mg·kcal)을 글에 쓰지 않는다 — 숫자 장면으로 가리킨다(점검이 막는다). 양(80g·10분·1인분)은 글에 써도 된다.
- 칼륨을 권하거나 저나트륨 소금(염화칼륨)을 말할 때는 신장 질환·혈압약 주의를 꼭 붙인다(`cautions: ["potassium"]` 또는 note).
- 협찬 제품이 생기면 광고임을 밝힌다. 끝 장의 '출처'와 레시피 전체 보기의 출처·검수일은 자동으로 붙는다.

## 절차

1. **주제·slug** — 영양 탭 영양소 하나와 방향(줄이기·채우기). 폴더 `content/meal-stories/<slug>/` 를 만든다.
2. **출처** — 공공기관 자료를 먼저(식약처·질병관리청·보건복지부). 고정값을 쓸 때만 `sources` 에 넣는다(섭취기준·식품 표준데이터는
   자동).
3. **재료 코드** — `build:meal-stories --find=…` 로 코드를 고른다. 시판 제품은 `group`.
4. **원고** — `status: "draft"`, `reviewedAt: null` 로 쓴다.
5. **사진** — 찍은 사진을 `originals/` 에 `cover.jpg`·`step-1.jpg` 처럼 소문자·하이픈 이름으로(아이폰 HEIC 는 JPG 로 내보낸다).
6. **만들기** — `pnpm --filter friendly build:meal-stories --slug=<slug>` → `foods.json`·`images/`.
7. **점검** — `pnpm --filter friendly check:meal-stories --slug=<slug>` — 오류(✗)는 고치고 경고(△)는 판단한다. 출력의
   '계산된 숫자'와 '값의 출처'를 사람이 원본과 맞춰 본다. `pnpm --filter friendly test` 의 내용 테스트도 같은 규칙으로 막는다.
8. **화면** — 로컬 웹(`/meal/stories/<slug>`)을 관리자로 열면 초안이 보인다(목록·장면에 '초안' 표시). 휴대폰 폭 360·390,
   다크 모드, 데스크톱에서 장면마다 캡처해 글이 넘치지 않는지 본다. 움직임(숫자 굴러가기·막대 자라기)은 캡처로는 일부만 보이니
   사람이 직접 넘겨 본다. 시스템 '동작 줄이기'가 켜져 있으면 움직임 없이 끝 상태만 보인다.
9. **검수·게시** — 사람이 레시피를 실제로 만들어 보고 출처를 확인한 뒤 `reviewedAt` 을 채우고 `status: "published"`. 점검을
   다시 돌린다(게시본은 검수일·표지가 없으면 오류).
10. **올리기** — 커밋 → 배포(git pull). 서버는 몇 초마다 파일을 다시 읽어 재시작 없이도 보인다. 공유 미리보기는 nginx
    `location ^~ /meal/stories` 가 있어야 한다([deploy-friendly.md](deploy-friendly.md)).

## 화면

- 목록 `/meal/stories` · 스토리 `/meal/stories/<slug>?s=N`(N 번째 장면) · 레시피 전체 보기 `/meal/stories/<slug>/recipe`.
- 넘기기: 오른쪽 누르기·왼쪽으로 밀기·→ = 다음, 왼쪽 30% 누르기·오른쪽으로 밀기·← = 이전, Esc = 닫기. 장면은 저절로 넘어가지
  않는다(장면 안의 움직임만 돈다).
- 입구: 사이트 메뉴 '건강식단', 식단 사이드 메뉴 '건강식단', 식단 홈 '건강식단 새 이야기'(게시 30일 안), 영양 탭에서 그 영양소가
  '많음'·'부족'이면 '줄이는 법 보기'·'채우는 법 보기'.
