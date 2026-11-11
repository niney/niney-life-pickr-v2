# 건강식단 스토리 만들기

'건강식단'은 주제 하나(나트륨 줄이기 …)를 장면 여러 장으로 넘겨 보는 손수 만든 콘텐츠다. 누구나 보고(`/meal/stories`),
공유 링크는 카카오톡 미리보기가 뜬다. 콘텐츠는 **사람이 Claude Code 로 만든다** — 서비스가 그때그때 LLM 으로 만들지 않는다.
계획·결정은 [PLAN-meal-story.md](PLAN-meal-story.md).

## 한눈에

| 누가 | 무엇을 |
|---|---|
| 사람 | 주제·레시피를 정하고 **직접 만들어 보고 사진을 찍는다**(완성 1장 + 단계별). 출처를 확인하고, 화면에서 움직임 느낌을 보고, 게시를 정한다 |
| Claude Code | 원고(`story.json`)를 쓰고, 재료의 식품코드를 찾고, `build:meal-stories`·`check:meal-stories` 를 돌려 고치고, 화면을 캡처하고 영상(MP4)·프레임 격자를 렌더해 보여 준다 |

원고에는 **숫자를 직접 적지 않는다**. 섭취기준·식품 100g당 값·레시피 합계·내 기록을 *가리키면* 서버가 계산한다. 숫자를 상식으로
적으면 틀리기 쉽고(예: "통밀면은 열량이 적다" — 실제로는 거의 같고 식이섬유가 늘어난다), 영양 탭 판정과 어긋난다.

## 파일

```
apps/friendly/content/meal-stories/<slug>/
  story.json      원고 — 사람·Claude Code 가 쓴다
  foods.json      재료 100g당 값 — build:meal-stories 가 만든다(손으로 고치지 않는다)
  images/*.jpg    화면에 쓰는 사진 — build:meal-stories 가 originals/ 에서 만든다
  originals/      찍은 원본 사진 — git 밖(.gitignore), 위치 정보가 있을 수 있다

apps/web/src/routes/meal-story/motion/   장면 틀 8종의 영상 그림(Remotion) — 편마다 고치지 않는다
tools/meal-motion/                       영상(MP4)·프레임 렌더 — 검수용, npm(워크스페이스 밖)
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
  "scenes": [ … ]                    // 3~14장(13장 안쪽 권장 — 영상 약 80초), 첫 장 cover · 끝 장 outro
}
```

### 숫자 가리키기(value)

| 쓰는 법 | 값 | 출처 |
|---|---|---|
| `{ "kdri": "sodium" }` | 2020 한국인 영양소 섭취기준 성인 값(나트륨 2,300mg = 만성질환위험감소섭취량, 칼륨 3,500mg, 식이섬유 `fiber`, 칼슘 `calcium` = 권장섭취량). 나이별로 다르면 서버가 덧말로 붙인다 | 자동 |
| `{ "kdri": "fiber", "sex": "female" }` | 남녀 값이 다른 기준(식이섬유 남자 30g·여자 20g, 칼슘 800mg·700mg)은 **성별을 골라 숫자 둘로 나란히** 보인다 — 한 숫자만 보이면 절반에게 틀린 기준이다. 성별을 안 고르면 남자 값이 나오고 여자 값은 덧말로 간다 | 자동 |
| `{ "food": "spaghetti", "nutrient": "kcal", "grams": 80 }` | foods 의 100g당 값 × 그램 | 자동(식품의 출처) |
| `{ "foods": [{ "food": "spaghetti", "grams": 40 }, { "food": "wholewheat-spaghetti", "grams": 40 }], "nutrient": "fiberG" }` | 섞은 값 — 식품마다 100g당 값 × 그램의 합(2~4가지). 하나라도 값을 모르면 합을 내지 않는다 | 자동 |
| `{ "recipe": "sodiumMg", "part": "sauce" }` | 레시피 1인분 합계(`part` 를 주면 그 묶음 재료만) | 자동 |
| `{ "my": "sodium" }` | 보는 사람의 최근 2주 하루 평균 — 로그인했을 때만, 화면이 통계로 채운다 | — |
| `{ "value": 3000, "unit": "mg", "source": "id" }` | 출처가 있는 고정값(예: 국민건강통계 평균). **sources 의 id 필수** | 그 출처 |

영양 값 이름: `kcal` `carbG` `proteinG` `fatG` `sugarG` `fiberG` `sodiumMg` `potassiumMg` `calciumMg`(재료 값에 이름을 더하면
`build:meal-stories` 를 slug 없이 돌려 **모든 편**의 `foods.json` 을 다시 만든다 — 안 하면 점검이 ✗, 내용 테스트도 막는다). 레시피 전체 보기의 표는 앞의
여덟 줄이 늘 나오고, 칼슘은 그 편의 영양정보 장면(`nutrition`)이 가리킬 때만 붙는다.
기준값은 영양 탭과 같은 KDRI 를 쓴다 — WHO 2,000mg 같은 다른 기준을 글로 섞지 않는다.

**서버가 스스로 붙이는 어림 두 가지** — 원고에 적지 않는다(적으면 점검이 글 속 숫자로 잡는다).

- **소금으로 환산** — 큰 숫자(`stat`) 장면의 나트륨 숫자(`kdri sodium`·`my sodium`·`sodiumMg`)에는 '소금 약 5.8g' 이 함께
  나온다(나트륨 ÷ 400, 출처 `who-sodium-2012` 가 자동으로 붙는다 — 환산 비율의 근거일 뿐 기준값은 KDRI). 내 기록 숫자는
  화면이 같은 식으로 환산한다.
- **약 N분의 1** — 막대(`bars`)가 둘이고 단위가 같으면 작은 쪽에 '약 10분의 1' 쪽지가 붙는다. N 이 정수로 잘 떨어질 때만
  (실제 비와 15% 넘게 벗어나면 붙지 않는다 — 2.4배는 '2분의 1'도 '3분의 1'도 아니다).

둘 다 점검 출력의 '사람이 확인할 값'에 찍힌다 — 환산 값과 말이 어색하지 않은지 본다.

내 값(`my`) 옆의 '기준 대비 %' 도 화면이 붙인다 — 그 장면의 기준 숫자가 하나이고 보는 사람의 기준과 같으면 '기준의 136%',
기준 숫자가 여럿이거나(남·여) 그 사람의 기준이 다르면(나이) '내 기준 20g의 82%'. 글로 보기와 영상이 같은 규칙이다.
그 아래에는 **직전 2주보다 달라진 정도**가 붙는다('직전 2주보다 하루 2.1g(20%) 늘었어요') — 하루 평균이 10% 넘게 달라졌고, 두
기간 모두 판정이 나왔고, 두 기간의 기록량(하루 평균 열량)이 15% 안쪽으로 비슷할 때만. 원고에서 할 일은 없다.

**큰 숫자 장면의 쪽지 수** — 기준 숫자를 남·여 둘로 놓고 둘 다 나이 덧말이 있으면(칼슘), 내 값의 쪽지 둘까지 넷이 붙는다.
이때는 장면 덧말(`note`)을 두지 않는다(자리가 모자라 숫자가 덧말과 겹친다). 성별을 고른 기준의 나이 덧말은 값이 같은 이어진
나이를 서버가 묶는다('65세 이상 700mg').

**재료를 고를 때** — 같은 이름이라도 표준데이터의 값은 종류에 따라 크게 다르다(말린 멸치 평균 1,857mg, 잔멸치 620mg — 레시피가
쓰는 것을 고른다). 흔한 말(두부는 칼슘이 많다)과 값이 다르면 값을 따르고 글도 그렇게 쓴다. 표준데이터에 그 영양소 값이 빈
재료(올리브유의 칼슘)는 레시피 합을 '일부만 셌어요'로 만드니, 값이 있는 비슷한 재료로 바꾸거나 그대로 둘지 정한다.

### 재료(foods)

하나만 고른다.

- `"ref": { "db": "raw" | "processed", "code": "R101-024020002-0000" }` — 한 식품. 코드는
  `pnpm --filter friendly build:meal-stories --find=스파게티,파마산` 으로 찾는다(이름에 그 말이 든 식품의 코드·분류·100g당
  열량·나트륨). 생것·말린것·데친것을 구별해 고른다(스파게티 건면은 `_말린것`, 삶은 면은 `_말린것을 삶은것`).
- `"group": { "db": "processed", "all": ["토마토","소스"], "any": ["스파게티","파스타"], "none": ["소스파스타"] }` — 시판
  제품 여러 개의 **중앙값**(영양소마다 값을 적은 제품만으로 — 그 수가 묶음보다 적으면 화면이 '표시한 제품 N개의 중앙값'이라고
  밝히고, 최소 수(`min`, 기본 3)보다 적으면 그 영양소는 비운다. 통밀 파스타 식이섬유는 17개 중 4개). 특정 제품을 고르지 않아 브랜드를 밝히지 않아도 된다. build 출력의 제품 이름을 보고 다른 것이 섞였으면
  `none` 으로 뺀다(첫 편: 완성 요리 '토마토소스파스타'를 뺐다). 최소 3개(`min`).
- `"manual": { "per100": { … }, "source": "id", "note": "…" }` — 표준데이터에 없을 때만. 점검이 '사람 확인 목록'에 올린다.
  값은 공공 자료에서 가져온다 — 식약처 표준데이터에 없는 원재료(양조간장 등)는 **국가표준식품성분 DB**(농촌진흥청,
  `data/open/food/식품성분표(N개정판).xlsx` — [data-sources.md](data-sources.md))에 있는 경우가 많다. `sources` 에 그 자료를 적고
  `note` 에 식품명·색인을 남긴다(둘째 편의 양조간장이 예시).

### 레시피(recipe)

`name`(30자) · `servings` · `dishType`(카탈로그 조리형태, 예: `noodle`) · `cuisine`(요리 계통 `korean` `western` … — 안 적으면 `other`) · `ingredients`(식품 id·그램·표시 이름 24자·메모 30자·묶음
`part`·소품 `icon`) · `steps`(100자, 팁 60자, 사진, 소품 `icon`). 그램은 **조리 전 무게**로 적는다(건면 80g — 삶으면 두 배 넘게 늘어난다).
[이 레시피로 기록]을 누르면 서버가 이 레시피를 카탈로그 음식(`source manual`, `sourceId meal-story:<slug>`)으로 맞춰,
기록에도 스토리와 같은 1인분 값이 들어간다. 그렇게 적은 기록의 상세에는 '건강식단 레시피 — 이야기 보기'가 붙는다(목록 API 가
레시피 음식 id 를 실어 보낸다 — 원고에서 할 일은 없다). 밥처럼 지은 것을 재료로 쓸 때는 지은 무게로 적고 식품도 지은 것
(`멥쌀밥_현미`)을 고른다.

### 장면(scenes) — 틀 8종

| type | 쓰는 곳 | 필드(글자 수) |
|---|---|---|
| `cover` | 표지 | kicker 16 · title 32 · subtitle 70 · image(없으면 cover) |
| `stat` | 큰 숫자 1~3개 | title 32 · figures[{label 24, value}] · note 90 |
| `bars` | 막대 비교 2~4개(바꿔 먹기 포함) | title · bars[{label 24, value, aside?, highlight?}] · note |
| `list` | 방법·원인 목록 2~6개 | title · items[{title 22, text 70}] · note |
| `ingredients` | 재료(레시피에서) | title |
| `step` | 만드는 법 한 단계(레시피에서) | step(1부터) |
| `nutrition` | 1인분 영양정보 라벨 | title · nutrients[2~6] · cautions(`potassium` `fiber` `calcium` — 영양 탭과 같은 주의 문구) · note |
| `outro` | 마무리 + 행동 | title · text · actions(`record` `recipe` `share` `stats`) |

`bars` 의 `aside` 는 막대 옆 작은 값(예: 열량 막대 옆 단백질) — food·foods·recipe 값만. `highlight` 막대만 강조(글로 보기는 먹색,
영상은 노란 색종이)이고 나머지는 회색·옅은 하늘색이다.

**영상에서 잘 보이는 길이** — 위 글자 수는 형식 한도다. 영상(세로 한 화면)은 넘치는 글을 보여 줄 자리가 없어 틀이 글씨를
줄이거나 말줄임표로 자른다. 아래를 넘으면 점검(`check:meal-stories`)이 경고(△)로 알린다 — 글로 보기에는 다 보이므로 오류는
아니다.

| 무엇 | 영상에서 온전한 길이 | 넘으면 |
|---|---|---|
| `stat`·`bars`·`list`·`nutrition` 제목 | 두 줄(한글 약 16자) | 세 줄이 되며 글씨가 작아진다 |
| `bars` 막대 이름(label) | 한글 약 15자 | 값 쪽지와 겹칠 수 있다 |
| `list` 설명(text) | 항목 2~4개(5개에 덧말 없음)는 두 줄(약 40자), 그보다 많으면 한 줄(약 20자) | 끝이 … 로 잘린다 |
| 재료 수 | 9개 | 재료 이름 글씨가 작아진다 |

막대는 둘일 때 띠와 숫자가 가장 크다(가장 힘주어 보일 비교는 둘로).

### 소품 그림(icon) — 영상

영상은 종이 오리기 그림체다(찢긴 색종이·테이프·손글씨 제목·얼굴 있는 소금통과 숟가락). 목록 항목(`items[].icon`)·레시피 재료
(`ingredients[].icon`)·만드는 법 단계(`steps[].icon`)에 소품 이름을 달면 그 그림이 카드 옆에서 움직이고, 재료는 그램 쪽지를 달고
그릇으로 날아든다. 없으면 번호·첫 글자 동그라미. 쓸 수 있는 이름(계약 `MealStoryIcon`):

`bowl`(국그릇) `kimchi` `sauce`(소스병) `can`(햄 통조림) `ramen`(컵라면) `shaker`(소금통) `spoon` `lemon` `magnifier`(돋보기)
`label`(성분표 — '나트륨' 줄이 칠해져 있다) `dip`(덜어 먹는 종지) `noodle`(면 다발) `tomato` `onion` `garlic` `oil`(올리브유) `leaf`(바질·나물)
`cheese` `pot`(냄비) `pan`(토마토 소스 팬) `plate`(파스타 접시) `timer` `clock` `rice`(잡곡 밥공기) `mushroom` `carrot` `egg` `sprout`(콩나물)
`bean` `apple` `water`(물컵) `sesame`(참기름) `soy`(간장) `stirfry`(버섯·당근 볶는 팬) `bibimbap`(비빔밥 그릇) `milk`(우유곽)
`anchovy`(멸치) `kale` `tofu` `yogurt` `scallion`(대파) `sesameseed`(깨 종지) `friedrice`(볶음밥 접시)

**그 편의 그림은 원고가 정한다** — 표지 식탁에는 그 편 레시피의 재료 둘(첫째·둘째 재료의 소품)과 완성 그릇이, 영양정보 장면의
식탁 끝에도 완성 그릇이 놓인다. 완성 그릇 = **마지막 만드는 법 단계의 `icon`** 이니 거기에 그 요리의 그림을 단다(첫 편 `plate`,
식이섬유 편 `bibimbap`). 소품을 달지 않으면 그 자리는 빈다. 무대 색과 마무리 장면에서 손 흔드는 짝은 `topic.nutrient` 로 정해진다
(나트륨 = 파랑·소금통과 숟가락, 식이섬유 = 초록·밥공기와 버섯, 칼슘 = 보라·우유곽과 멸치). **새 주제를 열 때**는 `paper/palette.ts` 의
`TOPIC_STAGE` 에 색을, `ChapterOutro.tsx` 의 `PALS` 에 짝을 더한다 — 안 하면 나트륨의 색과 소금통이 나온다.

새 소품이 필요하면 `apps/web/src/routes/meal-story/motion/paper/props.tsx` 에 그리고(원점 가운데, 약 240 크기, 찢긴 가장자리는
`tornRect`·`tornEllipse`·`tornPath`), 계약 enum 과 `paper/icons.ts` 에 이름을 더한다. 한 장으로 보기:
`cd tools/meal-motion && npx remotion still src/index.ts Props out/props.png --scale=0.6`. 숫자·작은 글은 앱 글꼴, 손글씨(개구)는
제목·짧은 덧말에만 쓴다.

**장면 틀을 고칠 때**(편이 아니라 `motion/Chapter*.tsx`·`motion/layout.ts`) 지킬 것:

- 읽으라고 놓는 글은 `motion/theme.ts` 의 `TYPE` 아래로 줄이지 않는다(본문 40·보조 34·각주 30 — 1080 폭 기준. 실제 휴대폰
  브라우저에서는 영상이 폭 320~340px 로 줄어 0.3배가 된다). 소품 안의 꾸밈 글자만 예외(`data-deco`).
- 첫 편에 없는 모양도 함께 본다 — `motion/storyFixture.ts`(사진 있는 표지·단계, 일반 숫자, 소품 없는 항목, 값 없는 막대, 한도까지
  찬 줄 수)를 `pnpm --filter web exec vitest run src/routes/meal-story/motion` 이 모든 프레임으로 그려 예외·NaN·글씨 하한을 보고,
  눈으로는 `cd tools/meal-motion && npx remotion render src/index.ts Variants out/frames-variants --sequence --every-nth-frame=6
  --image-format=jpeg --scale=0.5` → `npm run sheet -- out/frames-variants out/variants.png --cols=4 --every=4`.
- 틀에 새 고정 문구를 넣으면 `motion/fonts.ts` 의 글자 묶음에도 넣는다(웹·MP4 가 그 글자의 글꼴 조각을 미리 받는다).

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
8. **화면** — 로컬 웹(`/meal/stories/<slug>`)을 관리자로 열면 초안이 보인다(목록·장면에 '초안' 표시). 기본은 영상으로 보기,
   위의 '글로 보기'로 장면 글을 넘겨 본다. 휴대폰 폭 360·390, 다크 모드, 데스크톱에서 글로 보기 장면마다 캡처해 글이 넘치지
   않는지 본다. 시스템 '동작 줄이기'가 켜져 있으면 글로 보기가 기본이고 움직임 없이 끝 상태만 보인다. 휴대폰은 화면 높이를
   실제 브라우저처럼 낮게 잡아 본다(360×640·390×664 — 주소창을 뺀 높이. 기기 화면 크기 390×844 로 보면 영상이 실제보다 크게
   나온다). 휴대폰의 영상 보기는 아래 단추 줄이 없다(누르기·밀기·길게 누르기, 재생 단추는 위 막대).
9. **영상 검수** — 영상은 캡처 몇 장으로는 흐름이 안 보여 프레임 격자와 MP4 로 본다. 처음 한 번 `cd tools/meal-motion && npm ci`.

   ```bash
   pnpm --filter friendly export:meal-story --slug=<slug> --out=../../tools/meal-motion/out/<slug>.json            # 로그인 전 화면
   pnpm --filter friendly export:meal-story --slug=<slug> --out=../../tools/meal-motion/out/<slug>-mine.json --mine=3120  # 로그인 화면(예시 값)
   cd tools/meal-motion
   npm run frames -- out/frames --props=out/<slug>.json       # 6프레임마다 1장(1/4 크기)
   npm run sheet -- out/frames out/sheet.png --every=2        # 2초마다 한 칸 격자(--at=1.5,3 으로 골라도 된다)
   npm run render -- out/<slug>.mp4 --props=out/<slug>.json   # 전체 MP4(1080×1920·30fps)
   ```

   `--mine` 은 '내 최근 2주 하루 평균' 예시 값이다(진짜 기록이 아니다) — 어느 영양소인지는 원고의 '내 기록' 숫자가 정한다
   (`{ "my": "sodium" }` 이면 나트륨 mg, `{ "my": "fiber" }` 면 식이섬유 g — `--mine=10.6`). `--standard=2100` 을 더하면 기준이 다른 사람
   (나트륨 65~74세, 식이섬유는 `--standard=20` 이 여자)의 화면 — 숟가락·%·도장이 그 기준을 따르고 쪽지가 '내 기준 2,100mg의 N%'로 밝히는지 본다.
   `"--change=직전 2주보다 20% 늘었어요"` 를 더하면 변화 쪽지가 하나 더 붙은 화면(쪽지가 가장 많은 경우 — 겹치지 않는지 본다). `--dark` 는 다크 모드. 격자에서 글이 넘치거나 겹치는 장면, 읽기 전에
   넘어가는 장면을 찾는다. 전체 빠르기는 `motion/theme.ts` 의 `TEMPO` 하나(움직임만 빨라지고 글 읽는 시간 — 공백 뺀 글자당
   2.4프레임 — 은 `motion/timeline.ts` 가 따로 지킨다), 장면별 시각표·길이는 `motion/timeline.ts`, 그림은 `motion/Chapter*.tsx`
   (편마다가 아니라 틀을 고친다). 렌더러는
   처음 렌더할 때 크롬 헤드리스(약 100MB)를 `node_modules/.remotion` 에 받는다 — 이미 있는 것을 쓰려면 `--browser-executable=<경로>`.
   `out/` 은 git 밖이다.
10. **검수·게시** — 사람이 레시피를 실제로 만들어 보고 출처를 확인한 뒤 `reviewedAt` 을 채우고 `status: "published"`. 점검을
   다시 돌린다(게시본은 검수일·표지가 없으면 오류).
11. **올리기** — 커밋 → 배포(git pull). 서버는 몇 초마다 파일을 다시 읽어 재시작 없이도 보인다. 공유 미리보기는 nginx
    `location ^~ /meal/stories` 가 있어야 한다([deploy-friendly.md](deploy-friendly.md)).

## 화면

- 목록 `/meal/stories` · 스토리 `/meal/stories/<slug>?s=N`(N 번째 장면) · 레시피 전체 보기 `/meal/stories/<slug>/recipe`.
- **영상으로 보기**(기본) — 장면이 저절로 이어 재생된다. 위 막대 한 칸 = 장면. 오른쪽 누르기·왼쪽으로 밀기·→ = 다음 장면,
  왼쪽 30% 누르기·오른쪽으로 밀기·← = 이전 장면, 길게 누르기 = 멈춤(떼면 다시), Space = 재생·멈춤, Esc = 닫기. 마무리 장면에서
  원고 `actions` 의 단추(기록·레시피·통계·공유)와 출처가 영상 위에 진짜 단추로 뜬다. 내 평균은 로그인했을 때 통계 영양소에서.
- **글로 보기**(위 단추, `?view=text`) — 장면을 손으로 넘기고 장면 안의 움직임만 돈다. 같은 손짓·키. '동작 줄이기'를 켰거나
  영상을 돌릴 수 없는 브라우저면 이게 기본이다. 영상에서 글로 바꾸면 보던 장면(`?s=`)에서 이어진다.
- 기록에서 돌아오는 길: 이 레시피로 적은 기록의 상세에 '건강식단 레시피 — 이야기 보기'. 레시피 전체 보기의 나가는 단추도 왼쪽 위
  '← 뒤로' 하나(바로 들어왔으면 '← 이야기')이고, 이야기로 가는 링크는 제목 아래에 있다.
- 입구(메뉴 항목은 없다 — 식단 안에서 맥락으로): 식단 홈의 건강식단 한 줄(내 14일 판정에 맞는 이야기 먼저, 없으면 가장 새 것 ·
  '모두 보기'), 영양 탭과 통계 영양소 흐름에서 그 영양소가 '많음'·'부족'이면 '줄이는 법 보기'·'채우는 법 보기', 식단 안 목록
  `/meal/stories`. 로그인하면 이야기·레시피도 식단 셸 안에 뜬다(넓은 화면은 사이드 메뉴 옆, 휴대폰은 화면 가득 — 나가는 단추는
  왼쪽 위 '← 뒤로' 하나, 데스크톱은 카드 오른쪽에 장면 차례·기록·레시피·공유 단추). 로그인 전에는 사이트 메뉴 '식단'이 공개 목록으로 오고 이야기는 셸 없이 전체 화면이다. 그래서 `topic`(영양소·방향)을 꼭 단다 — 이것으로 잇는다.
