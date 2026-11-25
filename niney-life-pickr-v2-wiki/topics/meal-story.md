---
topic: meal-story
last_compiled: 2026-11-15
sources_count: 108
status: active
aliases: [meal-story, 건강식단, 건강식단 스토리, 건강식단 이야기, 스토리 코너, 이야기, 원고, story.json, foods.json, images/, originals/, content/meal-stories, MEAL_STORY_DIR, mealStoryDir, MealStoryStore, mealStoryStore, loadMealStoryDir, resolveMealStory, ResolvedMealStory, MealStoryScript, MealStoryValueRef, MealStoryFoodSpec, MealStoryRecipeSpec, MealStoryFoodsFile, MealStoryPer100, MEAL_STORY_KDRI_KEYS, MEAL_STORY_CAUTION_KEYS, MEAL_STORY_NUTRIENTS, MEAL_STORY_RECIPE_NUTRIENTS, MEAL_STORY_LOOK_SCENES, MEAL_STORY_BUILTIN_SOURCES, SODIUM_TO_SALT, fractionOf, kdriFigure, ageNotes, cautionText, MEAL_STORY_FOOD_FILES, MEAL_STORY_PER100_KEYS, loadFoodTables, buildMealStoryFoods, dishProblem, checkMealStory, motionLimitWarnings, kickerClashWarnings, CLAIM_PATTERNS, ensureMealStoryFood, mealStoryFoodIds, recipeFoodValues, MealStoryFoodError, meal-story:<slug>, registerMealStoryPreview, build:meal-stories, check:meal-stories, export:meal-story, --find, --mine, --standard, --change, --dark, 식품코드 찾기, MealStory, MealStoryListItem, MealStoryListResult, MealStoryFigure, MealStoryEquivalent, MealStoryScene, MealStoryIcon, MealStoryLook, MealStoryTopic, MealStoryTopicNutrient, MealStoryNutrient, MealStoryAction, MealStoryFoodResult, recipeFoodId, kicker, 머리말, Routes.MealStory, mealStoryApi, useMealStories, useMealStory, useMealStoryFood, RATE.mealStoryRead, RATE.mealStoryImage, /meal/stories, MEAL_STORY_PATH, MealEntry, MealStoryApp, MealStoriesPage, MealStoryPlayerPage, MealStoryRecipePage, MealStoryList, MealStoryCards, MealStoryPlayer, MealStoryMotion, MealStoryScenes, MealStoryFigure, MealStoryRecipe, MealStoryAside, 이야기 옆 칸, useLeaveStory, '← 뒤로', useStoryParams, STORY_ASIDE_QUERY, RecordRecipeButton, ShareStoryButton, 이 레시피로 기록, startStoryFonts, useStoryFontsReady, 글꼴 미리 받기, useStoryMyStats, storyStatus, 기준 안, storyChange, toMotionMine, 영상으로 보기, 글로 보기, ?view=text, ?s=, 장면 틀 9종, cover, stat, bars, lineup, 줄 세우기, list, ingredients, step, nutrition, outro, 소금 숟가락, isSaltSpoonScene, 소금 환산, 약 N분의 1, 약 N배, equivalent, fraction, Remotion, @remotion/player, @remotion/transitions, StoryVideo, TransitionSeries, timeline.ts, buildTimeline, chapterAt, TRANSITION_FRAMES, READ_FRAMES_PER_CHAR, TEMPO, useClock, TYPE 글씨 하한, theme.ts, layout.ts, balanceLines, barsLayout, lineupLayout, ownStandardText, fractionText, storyProps, dishIcon, coverIcons, storyFixture, variantStory, variantChalkStory, chapters.test, 종이 오리기, look paper, motion/paper, tornRect, tornEllipse, tornPath, boil, PaperPalette, TOPIC_STAGE, DARK, PALS, 소품, props.tsx, PROP_FOR, 칠판 메뉴판, 칠판 그림체, look chalk, motion/chalk, chalkLayout, chalkDraws, ChalkChapter, 개구, Gaegu, 원티드 산스, motion/fonts.ts, FONT_STYLESHEETS, tools/meal-motion, meal-motion, npm run frames, npm run sheet, npm run render, Variants, VariantsChalk, Props 컴포지션, 프레임 격자, out/review, REVIEW.md, 식단 홈 건강식단 줄, HomeStory, 맞는 이야기 N편 더, NutrientStoryLink, RecipeStoryLink, 줄이는 법 보기, 채우는 법 보기, findStoryFor, storyDirectionFor, storyForFood, mealNutrientChange, comparableNutrientChange, comparableRecording, ENERGY_CHANGE_MAX, NUTRIENT_CHANGE_MIN, 기록한 뒤의 변화, 직전 2주, guestTo, sodium-tomato-pasta, fiber-mushroom-bibimbap, calcium-anchovy-kale-rice, vitamin-c-paprika-salad, kcal-half-konjac-noodles, sodium-eating-out-menus, 나트륨 줄이기, 식이섬유 채우기, 칼슘 채우기, 비타민 C 채우기, 국수 열량 줄이기, 외식 나트륨 줄이기, mfds-raw, mfds-processed, mfds-dish, who-sodium-2012, kdri-2020, rda-fct-10, mfds-processed-full, 국가표준식품성분 DB, 음식 표준데이터 15100070, 외식(분석함량), 두부면, 잔멸치, 양조간장, 토마토 빌린 영양, 연두부 토마토]
---

# meal-story — 건강식단 스토리(손수 만드는 장면형 콘텐츠: 원고는 서버 파일 · 숫자는 서버 계산 · 종이 오리기/칠판 영상 · 식단 안 융합)

**2026-11-09~11-13 신설 (32차)**: 주제 하나(영양소 하나 + 줄이기·채우기)를 장면 여러 장으로 보는 **손수 만든 콘텐츠 코너 '건강식단'**이다. 44커밋에 걸쳐 들어왔다. 11-09 첫날(`e3c6f6e5`·`c6132034`·`9b456263`)에 friendly `meal-story` 모듈, 계약·공용 훅, 웹 `/meal/stories/*`, 첫 편 초안이 생겼다. 같은 날 선행 수정으로 운영 '토마토'가 '연두부 토마토' 값을 빌려 쓰던 문제를 고쳤다(`ac3e0066`, [food](food.md)). 사용자 결정은 다섯 가지다. ① SNS 영상이 아니라 서비스 안 화면이다. ② 누구나 본다(내 데이터 장면과 [이 레시피로 기록]만 로그인). ③ 영양 목표는 두지 않고, 영양 탭 판정이 이야기를 고른다. ④ 슬라이드가 아니라 **모션 그래픽**으로 보여 준다(Remotion — 11-10 `281318cc`·`6ed5df07`). 그림체는 시안 셋 중 **종이 오리기**다. ⑤ 별도 메뉴로 두지 않고 **식단 안에 녹인다**(11-10 `6fb948c3`). 홈 한 줄과 영양 탭·통계 링크로 들어오고, 로그인하면 식단 셸 안에서 연다. 그 뒤 서버 환산(소금·'약 N분의 1'·'약 N배'), 이야기와 기록 잇기, '기록한 뒤의 변화', 줄 세우기 장면(9종째), 주제에 열량, 식당 음식 한 그릇(`dish`)이 차례로 붙었다. 마지막으로 둘째 그림체 **칠판 메뉴판**(`look: "chalk"`, 11-13 `4df0c852`)이 들어왔다. 초안은 **6편**이다(나트륨·식이섬유·칼슘·비타민 C·국수 열량·외식 나트륨 — Purpose 절 표). 6편 모두 `status: "draft"` · `reviewedAt: null` · 사진 0장이라 **아직 게시본이 없다**. 그래서 일반 사용자에게는 홈 줄도 목록도 보이지 않고, 관리자만 '초안' 표시와 함께 본다. 게시는 사람이 해야 한다. 레시피를 실제로 조리하고 사진을 찍은 뒤 손으로 적은 값을 원본과 맞춰 보고 `reviewedAt` 을 채운다. 외식 편은 레시피가 없어 가장 먼저 게시할 수 있지만, 그래도 표지 사진 한 장은 필요하다. 운영 반영은 이렇다. 마이그레이션·적재는 없다. 원고·`foods.json` 은 git 으로 올라가고 서버가 5초마다 다시 읽는다. 공유 미리보기에는 nginx `location ^~ /meal/stories` 가 필요하다. 토마토·자두 값은 배포 뒤 `load:food-catalog --source=raw` 를 한 번 돌려야 바뀐다. 2026-11-15 로컬의 `origin/main` 이 44커밋을 모두 품고 있다. 운영 배포 여부는 확인하지 않았다. 앱(`apps/mobile`)은 아직 없다([PLAN-mobile-meal.md](../../docs/PLAN-mobile-meal.md) 후보). 식단 쪽 화면(홈·영양·통계·기록 상세)의 짜임은 [meal](meal.md)이 주인이고, 이 토픽은 그 화면에 붙은 건강식단 연결만 설명한다. 웹 전반은 [web](web.md)에 있다.

## Purpose [coverage: high — 9 sources]

**무엇** — 주제 하나를 장면 3~14장(권장 13장 안쪽, 영상 약 80초)으로 보여 주는 손수 만든 콘텐츠다. 예: '토마토 스파게티로 나트륨 줄이기'. 한 편에는 원인과 방법 목록, 숫자 비교(섭취기준·시판품 대 직접 만든 것·바꿔 먹기), 레시피(재료·만드는 법·1인분 영양정보), 마무리 행동([이 레시피로 기록]·레시피·통계·공유)이 들어간다. 콘텐츠는 **사람이 Claude Code 로 만든다**. 서비스가 그때그때 LLM 으로 만드는 것이 아니다([meal-story-authoring.md](../../docs/meal-story-authoring.md)). 사람의 몫은 넷이다. 주제·레시피를 정하고, 직접 조리해 사진을 찍고, 출처를 확인하고, 게시를 정한다. Claude Code 의 몫은 원고 작성, 식품코드 찾기, build·check 실행, 캡처와 MP4 렌더다.

**왜** — 식단 영양 탭이 '나트륨 많음'·'식이섬유 부족'을 알려 줘도 그다음에 무엇을 하면 되는지가 없었다. 영양 목표 기능은 두지 않기로 했다(PLAN 결정 표). 대신 **내 판정에 맞는 이야기**를 맥락에서 보여 준다. 로그인 전에는 사이트 메뉴 '식단'이 이 목록으로 와서 식단의 공개 얼굴이 된다. 공유 링크는 카카오톡 미리보기(OG)가 뜬다.

**원칙 — 원고에 숫자를 적지 않는다**. 섭취기준(KDRI 2020, 영양 탭과 같은 표)·식품 100g당 값(식약처 표준데이터 식품코드)·레시피 1인분 합계·내 기록을 *가리키면* 서버가 계산하고, 값마다 출처를 단다. 상식으로 적은 숫자는 틀리기 쉽기 때문이다. '통밀면은 열량이 적다'는 실제로는 거의 같고 식이섬유만 는다. '두부는 칼슘이 많다'는 실제로 100g당 64mg 이다. 그런 숫자는 영양 탭 판정과도 어긋난다.

**6편(전부 초안, 사진 없음, `reviewedAt: null`)** — 원고의 표지 `kicker` 가 목록 카드의 이름이다. 값은 서버 계산이고 [PLAN-meal-story.md](../../docs/PLAN-meal-story.md) 한 일 3·11·13·15·16·17 의 기록이다.

| # | slug(`publishedAt`) | 제목 / 머리말 | `topic` | 그림체 · 장면 | 레시피 | 손으로 적은 값(`manual`) | 핵심 계산값 |
|---|---|---|---|---|---|---|---|
| 1 | `sodium-tomato-pasta`(11-09) | 토마토 스파게티로 나트륨 줄이기 / 나트륨 줄이기 | sodium·reduce | paper · 13장(83.1초) | 저염 토마토 스파게티(`noodle`·`western`, 재료 7·단계 3) | 없음(시판 소스·통밀 스파게티는 가공식품 묶음 중앙값) | 성인 기준 2,300mg. 시판 소스 150g 953mg(12개 제품 중앙값) 대 직접 만든 소스 97mg. 1인분 481kcal·나트륨 99mg·칼륨 960mg. 면 바꾸기: 건면 80g 292 → 애호박면 44·곤약면 14kcal. 통밀 덤: 식이섬유 2.2·4.3·6.4g(표시한 제품 4개의 중앙값) |
| 2 | `fiber-mushroom-bibimbap`(11-10) | 버섯 나물 비빔밥으로 식이섬유 채우기 / 식이섬유 채우기 | fiber·increase | paper · 13장(85초) | 현미 버섯 나물 비빔밥(`rice`·`korean`, 9·3) | 양조간장(`rda-fct-10`, 색인 3011) | 남 30g·여 20g(성별 둘로 나란히). 한 공기 210g: 흰쌀 1.9·현미 4.6·보리 6.9g. 1인분 549kcal·식이섬유 14g·단백질 23g·나트륨 339mg |
| 3 | `calcium-anchovy-kale-rice`(11-11) | 멸치 케일 볶음밥으로 칼슘 채우기 / 칼슘 채우기 | calcium·increase | paper · 13장(82초) | 멸치 케일 볶음밥(`rice`·`korean`, 7·3) | 잔멸치·두부·요거트·체다(`rda-fct-10`) | 남 800·여 700mg. 케일 60g 197·두부 150g 96·잔멸치 15g 93mg. 1인분 503kcal·칼슘 365mg·나트륨 495mg. 덤: 우유 200g 236·요거트 100g 136·체다 20g 125mg |
| 4 | `vitamin-c-paprika-salad`(11-11) | 파프리카 샐러드로 비타민 C 채우기 / 비타민 C 채우기 | vitaminC·increase | paper · 13장 | 파프리카 닭가슴살 샐러드(`salad`·`western`, 9·3) | 없음 | 권장 100mg(덧말 없음). 노란 파프리카 70g 77mg. 1인분 421kcal·비타민 C 201mg(권장량의 '약 2배') |
| 5 | `kcal-half-konjac-noodles`(11-12) | 곤약면·두부면으로 국수 열량 줄이기 / 국수 열량 줄이기 | kcal·reduce | paper · 13장(77초) | 반반 비빔국수(`noodle`·`korean`, 9·3) | 두부면(`mfds-processed-full` 22제품 중앙값)·고추장·양조식초(`rda-fct-10`) | 삶은 면 100g 114~132kcal(거의 같음). 한 번 먹는 양: 소면 370·두부면 170·국수호박 32·곤약면 14kcal. 반반 196kcal('약 2분의 1'). 1인분 357kcal·나트륨 541mg |
| 6 | `sodium-eating-out-menus`(11-12) | 메뉴 고르기로 외식 나트륨 줄이기 / 외식 나트륨 줄이기 | sodium·reduce | **chalk** · 8장(58초) | **없음** | 없음(19메뉴 모두 음식 표준데이터 '외식(분석함량)') | 2,300mg 대 중식 우동 한 그릇 1,000g 3,400mg. 면 7·밥 6·찌개와 탕 6을 세 번 줄 세운다(열무냉면 3,152 … 토마토 스파게티 1,510 / 국밥 2,304 … 회덮밥 745 / 뼈다귀해장국 3,090 … 초당순두부 1,206) |

## Architecture [coverage: high — 80 sources]

### 한눈에

```
content/meal-stories/<slug>/story.json ─┐                     (git, 사람·Claude Code 가 쓴다)
                    foods.json  ─────────┤ ← build:meal-stories ← data/open/food/*.csv (git 밖, 작업 컴퓨터)
                    images/*.jpg ────────┤ ← build:meal-stories ← originals/ (git 밖)
                                         ▼
 MealStoryStore(5초마다 mtime 확인) → loadMealStoryDir → MealStoryScript(zod) → resolveMealStory(순수 — 숫자·출처 계산, issues)
        │                                                                           │
        ├ GET /api/v1/meal-stories(…)  → MealStory / MealStoryListResult(@repo/api-contract) → @repo/shared 훅 → 웹
        ├ GET /meal/stories(…)          → index.html 에 OG 주입(registerMealStoryPreview)
        └ POST …/:slug/food             → FoodItem(source manual, sourceId meal-story:<slug>) → 새 기록 draft
 웹: 글로 보기(MealStoryScenes, CSS) │ 영상으로 보기(MealStoryMotion → @remotion/player → motion/StoryVideo)
 MP4: export:meal-story → JSON → tools/meal-motion(npm, Remotion CLI) → 같은 motion/StoryVideo
```

### 서버 — `apps/friendly/src/modules/meal-story/`

- **원고 형식** [meal-story.script.ts](../../apps/friendly/src/modules/meal-story/meal-story.script.ts) — 원고(`story.json`)와 `foods.json` 의 zod 스키마다. 서버와 스크립트만 쓴다. 화면이 받는 모양은 계약의 `MealStory` 다.
  - **`MealStoryValueRef` 숫자 가리킴 7종**:
    - `{ kdri, sex? }` — 섭취기준(`MEAL_STORY_KDRI_KEYS` = sodium·potassium·fiber·calcium·vitaminC).
    - `{ food, nutrient, grams }` — 식품 100g당 값 × 그램.
    - `{ foods: [{food, grams}×2~4], nutrient }` — 섞은 값. 하나라도 값을 모르면 합을 내지 않는다.
    - `{ dish, nutrient }` — 식당 음식 한 그릇. 무게는 원고가 적지 않는다.
    - `{ recipe, part? }` — 레시피 1인분 합계, 또는 그 묶음.
    - `{ my }` — 보는 사람의 최근 2주. 화면이 채운다.
    - `{ value, unit, source }` — 출처 id 가 꼭 있는 고정값.
  - **글자 수 상한** — 휴대폰 360px 한 장에 맞췄다. 제목 32, 요약 90, 머리말 16, 막대 이름 24, 줄 세우기 이름 14·옆 글 16·덧말 60, 목록 항목 22/70, 단계 100·팁 60.
  - **장면 수** — 3~14.
  - **재료(`foods`)** — `ref{db: raw|processed|dish, code}` · `group{db, all, any, none, category, min}` · `manual{per100, source, note}` 가운데 **정확히 하나**다(refine). 식품코드 형식은 `R101-024020002-0000` 이다.
  - **레시피** — 1~4인분, 재료 1~20(그램은 조리 전 무게, 묶음 `part`, 소품 `icon`), 단계 1~8. `dishType` 과 선택 `cuisine` 을 단다.
  - **원고 머리 필드** — `look?`(paper|chalk) · `topic?` · `cover?` · `sources[≤12]` · `foods[≤30]`.
- **해석(순수 함수)** [meal-story.resolve.ts](../../apps/friendly/src/modules/meal-story/meal-story.resolve.ts) `resolveMealStory(script, foodsFile, imageUrl)` → `{ story, listItem, issues }`. 파일·DB 를 모른다. 못 푼 가리킴(없는 식품·출처·단계·사진)은 `issues` 로 모은다. 서버는 issues 가 있어도 값을 null 로 두고 보여 주고, 점검과 내용 테스트는 issues 를 실패로 센다. 숫자 하나(`MealStoryFigure`)에는 `value·unit·basis·detail·sources·my·equivalent` 가 붙는다.
  - **레시피 합** — 값을 모르는 재료는 빼고 세며, `detail` 에 '값을 모르는 재료(…)는 빼고 셌어요' 를 단다.
  - **섞은 값** — 하나라도 모르면 null 이다.
  - **묶음 중앙값** — 값을 적은 제품이 묶음보다 적으면 `detail` 에 '표시한 제품 N개의 중앙값' 을 단다.
  - **한 그릇(`dish`)** — 100g당 값 × `servingG`.
  - **큰 숫자(`stat`)의 나트륨 숫자** — `equivalent`(소금)가 붙는다.
  - **막대가 둘이고 단위가 같으면** — `fraction{bar, denominator, multiple}` 가 붙는다.
  - **레시피 영양 표** — 늘 보이는 8줄(`MEAL_STORY_RECIPE_NUTRIENTS` — kcal·탄수화물·당류·단백질·지방·식이섬유·나트륨·칼륨)에, 그 편의 영양정보 장면이 가리키는 영양소(칼슘·비타민 C)만 덧붙인다.
- **표·규칙** [meal-story.defs.ts](../../apps/friendly/src/modules/meal-story/meal-story.defs.ts):
  - `MEAL_STORY_NUTRIENTS` — 이름과 단위 10개.
  - `roundForUnit` — mg·kcal 는 정수, g 은 10 미만이면 소수 한 자리.
  - `MEAL_STORY_BUILTIN_SOURCES` — 서버가 스스로 다는 출처. `kdri-2020`, `mfds-raw`(15100065), `mfds-processed`(15100066), `mfds-dish`(15100070), `who-sodium-2012`(환산 비율의 근거일 뿐 기준값은 KDRI).
  - `SODIUM_TO_SALT = { label '소금', unit 'g', per 400 }` — 2,300mg → 5.8g.
  - `fractionOf(small, large)` — N 은 2 이상의 정수다. 실제 비와 15% 넘게 벗어나면 null 이다.
  - `KDRI_KIND` — 나트륨 cdrr(이보다 적게), 칼륨·식이섬유 ai(충분섭취량), 칼슘·비타민 C rni(권장섭취량).
  - `kdriFigure(nutrient, sex?)` — 성인(19~29세) 값과, 나이·성별 차이를 담은 덧말을 낸다. 성별을 안 고르면 남자 값이고 basis 가 '성인 남자 …' 가 된다. 이어진 같은 값은 묶는다(`ageNotes` — '65세 이상 700mg').
  - `MEAL_STORY_LOOK_SCENES` — 칠판이 그릴 수 있는 장면 6종.
  - `cautionText` — 영양 탭 `NUTRIENT_DEFS` 의 주의 문구를 그대로 쓴다.
- **재료 값 빌더** [meal-story.foods.ts](../../apps/friendly/src/modules/meal-story/meal-story.foods.ts):
  - `MEAL_STORY_FOOD_FILES` — raw `mfds-nutrition-15100065.csv`, processed `-15100066.csv`, dish `mfds-nutrition.csv`.
  - 머리글은 이름으로 찾는다(`HEADER` 표, `looseNutrientHeader`). 배포본마다 열이 붙고 빠지기 때문이다.
  - `MEAL_STORY_PER100_KEYS` — 값 이름 10개. 표준데이터로 푼 식품은 이 이름을 모두 적는다. 모르는 값은 null 로 적는다.
  - `loadFoodTables(roots)` — 지금 폴더와 저장소 뿌리의 `data/open/food/` 에서 찾는다.
  - 묶음은 영양소마다 값을 적은 제품만으로 중앙값을 낸다. 그 수가 `min`(기본 3)보다 적으면 그 영양소를 비운다.
  - `dishProblem(row)` — '분석한 한 그릇'만 통과시킨다. 식품기원에 '분석'이 있어야 하고, 간편조리세트가 아니어야 하고, 식품중량이 100g 을 넘어야 한다.
- **점검** [meal-story.check.ts](../../apps/friendly/src/modules/meal-story/meal-story.check.ts) `checkMealStory` → `{ errors, warnings, review }`. `check:meal-stories` 와 내용 테스트가 같이 쓴다.
  - 오류: 효능 단정(`CLAIM_PATTERNS` — 치료·완치·예방된다·특효·해독·디톡스·살 빠진다·무조건·100%).
  - 오류: 글에 박힌 영양 값(`NUMBER_IN_TEXT` — mg·㎎·kcal·칼로리·μg).
  - 경고: 그 밖의 숫자('N인분'은 빼고, 양을 적는 칸이 아닌 글).
  - 게시 조건(오류): `published` 면 `reviewedAt` 과 `cover` 가 있어야 한다.
  - 사진(오류): 600KB·긴 변 1,600px 이하.
  - 칠판 + 레시피 장면은 오류다.
  - 경고: 첫 장 cover·끝 장 outro 권장, 13장 초과, 레시피 단계 중 장면에 없는 것, 영상 틀 한도(`motionLimitWarnings` — 제목 두 줄·막대 이름표·목록 설명 줄 수·재료 9개 초과·줄 세우기 이름+옆 글), 머리말 겹침(`kickerClashWarnings` — 한 편만 볼 때도 모든 편과 견준다).
  - 사람 확인 목록(`review`) — 소금 환산·'약 N분의 1/N배'·줄 세우기의 가장 작은·큰 값과 배수, 손으로 적은 값.
- **저장소** [meal-story.store.ts](../../apps/friendly/src/modules/meal-story/meal-story.store.ts) `MealStoryStore` + [meal-story.instance.ts](../../apps/friendly/src/modules/meal-story/meal-story.instance.ts) 싱글턴(라우트와 OG 가 같은 캐시를 쓴다).
  - 폴더는 `MEAL_STORY_DIR` 이고, 없으면 `process.cwd()/content/meal-stories` 다.
  - 다시 살피는 간격은 5초(`recheckMs`, 테스트는 0)다. 캐시 키는 story·foods·사진 각각의 수정 시각이다.
  - `.`·`_` 로 시작하는 폴더는 건너뛴다.
  - slug 가 폴더 이름과 다르거나 형식이 틀리면 그 편만 건너뛰고 경고 로그를 남긴다. 다른 편은 그대로 보인다.
  - `list` 는 게시일 내림차순(같으면 slug 오름차순)이다. `get`·`imagePath` 는 초안의 사진도 준다(`<img>` 는 인증을 못 싣는다).
  - 사진 주소에는 `?v=<mtime>` 이 붙는다.
- **[이 레시피로 기록]** [meal-story.service.ts](../../apps/friendly/src/modules/meal-story/meal-story.service.ts) `ensureMealStoryFood`:
  - 레시피를 카탈로그 `FoodItem` 으로 맞춘다(`source 'manual'`, `sourceId 'meal-story:<slug>'`, `sourceCategory '건강식단'`, `nutritionFrom null` — 빌린 값이 아니라 직접 값).
  - `servingG` = 재료 그램 합 ÷ 인분이다. 1인분 값과 100g당 값(`nutrientsPer100gJson` — 칼슘·비타민 C 포함)을 적는다.
  - 알레르기는 `inferFoodAllergens(재료 이름)` 로 정한다. 계통은 `recipe.cuisine ?? 'other'` 다.
  - 처음 부르면 만들고, 다음부터는 원고 숫자로 덮어쓴다(update).
  - 이름이 겹치면 '이름(건강식단)', 그것도 겹치면 '이름(건강식단·slug)' 을 쓴다. 셋 다 겹치면 `name_taken` → 409 다.
  - 둘이 동시에 처음 누르면 먼저 만든 행을 쓴다.
  - `mealStoryFoodIds` 는 목록의 `recipeFoodId` 를 한 번의 조회로 채운다.
- **라우트** [meal-story.route.ts](../../apps/friendly/src/modules/meal-story/meal-story.route.ts) — API Surface 절. **공유 미리보기** [meal-story-preview.ts](../../apps/friendly/src/modules/meal-story/meal-story-preview.ts) `registerMealStoryPreview` 는 `.route.ts` 가 아니라 autoload 대상이 아니다. 그래서 [app.ts](../../apps/friendly/src/app.ts) 가 직접 등록한다. 타로 공유와 같은 방식이다([ssr-lite-head-injection](../concepts/ssr-lite-head-injection.md)).

### 원고 파일 — `apps/friendly/content/meal-stories/<slug>/`

`story.json`(원고) · `foods.json`(`generatedBy: 'build:meal-stories'` — 식품 id 별 `per100`·`basis(100g|100ml)`·`provenance`·`source`·`servingG?`·`matched{count, names≤10, counts?}`, 손으로 고치지 않는다) · `images/*.jpg`(build 가 만든 화면용 사진) · `originals/`(찍은 원본 — [.gitignore](../../.gitignore) 로 git 밖. 위치 정보가 있을 수 있다). 형식 예시는 첫 편 [sodium-tomato-pasta/story.json](../../apps/friendly/content/meal-stories/sodium-tomato-pasta/story.json).

### 스크립트 — `apps/friendly/scripts/`

- [build-meal-stories.ts](../../apps/friendly/scripts/build-meal-stories.ts) `pnpm --filter friendly build:meal-stories [--slug=]`:
  1. `foods.json` 을 표준데이터 CSV 에서 만든다.
  2. `originals/` 사진을 긴 변 1,440px JPEG 로 줄여 `images/` 에 쓴다. EXIF 회전은 바로잡고 메타는 지운다. 원본이 결과보다 새것일 때만 다시 만든다.
  - `--find=스파게티,파마산` 은 이름에 그 말이 든 식품의 코드·분류·100g당 열량·나트륨을 보이고 끝난다. 음식 데이터는 한 그릇으로 쓸 수 있는 행만, 한 그릇 무게와 함께 보인다.
- [check-meal-stories.ts](../../apps/friendly/scripts/check-meal-stories.ts) `check:meal-stories [--slug=]` — 순서는 형식 → 가리킴 → 말투 → 게시 조건 → 사진 크기(sharp 로 잰다) → `foods.json` 과 원본 대조(`data/open/food/` 가 있을 때만) → '계산된 숫자'·'값의 출처' 목록이다. 오류가 있으면 끝 코드 1 이다.
- [export-meal-story.ts](../../apps/friendly/scripts/export-meal-story.ts) `export:meal-story --slug= [--out=] [--mine=] [--standard=] [--change=] [--dark]` — 화면이 받는 모양(`{ story, mine, loggedIn, dark }`)을 JSON 으로 쓴다. MP4 도구의 입력이다.
  - `--mine` 은 원고의 '내 기록' 숫자가 가리키는 영양소의 예시 값이다(나트륨 mg·식이섬유 g).
  - `--standard` 는 기준이 다른 사람의 화면이다(65~74세 2,100·여자 20g).
  - `--change` 는 변화 쪽지 문구를 넣는다.
- [apps/friendly/package.json](../../apps/friendly/package.json) 의 스크립트 3종.

### 웹 — 진입과 라우팅

- [App.tsx](../../apps/web/src/App.tsx) 의 `/meal/*` 는 모두 [MealEntry](../../apps/web/src/routes/meal/MealEntry.tsx) 가 가른다.
  - 로그인했으면 `MealApp`(식단 셸)이다. 그 `stories`·`stories/:slug`·`stories/:slug/recipe` 라우트가 각각 [MealStoriesPage](../../apps/web/src/routes/meal-story/MealStoriesPage.tsx) · `MealStoryPlayerPage` · `MealStoryRecipePage` 다([MealApp.tsx](../../apps/web/src/routes/meal/MealApp.tsx) — lazy).
  - 로그인 전에는 `/meal/stories…` 만 [MealStoryApp](../../apps/web/src/routes/meal-story/MealStoryApp.tsx) 기본 내보내기(셸 없음, 식단 테마 `.meal-app` 만)로 연다. 그 밖의 식단 주소는 `/login` 이다.
- [mealPaths.ts](../../apps/web/src/routes/meal/mealPaths.ts) `MEAL_STORY_PATH{list, story, recipe}`. 목록은 `MEAL_SECTION_PATHS`·`SECTION_SEGMENTS('stories')` 에 들어 있다. 그래서 기록 상세 패널로 열리지 않고 하단 탭이 보인다.
- [MealShell](../../apps/web/src/routes/meal/MealShell.tsx) 은 `/meal/stories` 에서 '홈'을 켠다(메뉴 항목이 없다).
- 사이트 메뉴 '식단'([PublicSidebar](../../apps/web/src/components/PublicSidebar.tsx)·[PublicTopBar](../../apps/web/src/components/PublicTopBar.tsx))은 `guestTo: '/meal/stories'` 다. 예전에는 '식단'이 로그인 전에 숨겨져 있었다.
- [LoginPage](../../apps/web/src/routes/LoginPage.tsx) `?next=` 는 사이트 안 경로만 받는다(`safeNextPath` — `//`·`/\` 로 시작하는 주소는 버린다). [이 레시피로 기록]을 로그인 전에 누르면 그 장면으로 돌아온다.

### 웹 — 목록·재생기·레시피 (`apps/web/src/routes/meal-story/`, 59파일)

- **목록**:
  - [MealStoryList](../../apps/web/src/routes/meal-story/MealStoryList.tsx) — 로그인 전, 공개 목록.
  - [MealStoriesPage](../../apps/web/src/routes/meal-story/MealStoriesPage.tsx) — 식단 안. `useMealNutrition(14)` 로 내 판정에 맞는 편에 '내 기록 · 나트륨 많음' 표시를 달아 앞에 둔다.
  - 두 목록 모두 [MealStoryCards](../../apps/web/src/routes/meal-story/MealStoryCards.tsx) 격자를 쓴다. 카드 이름은 [mealStoryTopic.ts](../../apps/web/src/routes/meal-story/mealStoryTopic.ts) `mealStoryCardLabel` 이고, 머리말을 쓰되 없으면 주제 이름을 쓴다.
- **재생기** [MealStoryPlayer](../../apps/web/src/routes/meal-story/MealStoryPlayer.tsx) — 보기가 둘이다.
  - **영상으로 보기**(기본)는 [MealStoryMotion](../../apps/web/src/routes/meal-story/MealStoryMotion.tsx) 이다(lazy 조각, 운영 빌드 약 143kB gzip — 첫 로드에는 안 실린다). 스토리 응답을 기다리는 동안 미리 받기 시작한다.
  - **글로 보기**(`?view=text`)는 예전 장면 넘기기다([MealStoryScenes](../../apps/web/src/routes/meal-story/MealStoryScenes.tsx) 장면 틀 9종 + [mealStory.css](../../apps/web/src/routes/meal-story/mealStory.css) 의 CSS 움직임 — 숫자 0~9 띠 굴리기·막대 자라기·떠오르기·켄 번스). '동작 줄이기'가 켜져 있거나 `ResizeObserver` 가 없으면 이것이 기본이다. 다음 장면 사진을 미리 받는다.
  - 주소 `?s=N`(1부터)은 두 보기가 같이 쓴다. 바꿀 때 `replace` 라 뒤로 가기는 스토리를 떠난다([mealStoryNav.ts](../../apps/web/src/routes/meal-story/mealStoryNav.ts)).
- **영상 재생기 조작**:
  - 진행 막대 한 칸이 한 장면이다.
  - 오른쪽 누르기·왼쪽 밀기·→ 는 다음 장면, 왼쪽 30%(`PREV_ZONE`)·오른쪽 밀기·← 는 이전 장면이다(`SWIPE_PX` 48·`TAP_PX` 10).
  - 길게 누르면 멈추고, Space 는 재생·멈춤, Esc 는 나가기다.
  - 마무리 장면 위에 진짜 단추(기록·레시피·통계·공유)와 출처를 얹는다.
  - 휴대폰(폭 640 미만)은 아래 단추 줄을 없애 영상을 키운다(360×640 에서 폭 280 → 321px). 재생 단추는 위 막대에 있고, 첫 장면에 손짓 안내가 뜬다.
  - 다른 탭·앱으로 가면 멈추고, 돌아오면 이어 튼다(`visibilitychange`).
  - 영상 영역은 읽기 프로그램에 숨긴다. 굴러가는 숫자의 0~9 띠가 통째로 읽히기 때문이다. 읽을 글은 '글로 보기'에 있다.
- **나가기** — `useLeaveStory`. 앞 화면이 있으면 뒤로 간다. 주소로 바로 들어왔으면 글자가 '건강식단'이고 목록으로 간다. 레시피 화면에서 바로 들어왔으면 '이야기'이고 그 이야기로 간다. 단추는 왼쪽 위 '← 뒤로' 하나다(식단 상세 `MealSurface` 와 같은 규칙).
- **식단 셸 안의 배치**:
  - `.meal-story-inshell` — 48rem 이상에서는 재생기가 본문 자리의 카드가 되고 사이드 메뉴가 남는다. 휴대폰은 화면 가득이다.
  - 64rem 이상(`STORY_ASIDE_QUERY`)이고 셸 안이면 [MealStoryAside](../../apps/web/src/routes/meal-story/MealStoryAside.tsx) 옆 칸을 둔다. 주제·제목·요약, 장면 차례(누르면 이동, 지금 장면 표시), 끝까지 안 봐도 쓰는 기록·레시피·공유 단추가 들어간다.
- **내 값** [mealStoryMine.ts](../../apps/web/src/routes/meal-story/mealStoryMine.ts):
  - `useStoryMyStats` — 로그인했을 때 통계 영양소(`useMealStatsNutrients`)를 최근 14일과 그 직전 14일, 두 번 부른다.
  - `storyStatus` — 지킨 나트륨 기준(cdrr)은 '충분'이 아니라 **'기준 안'**이다.
  - `storyChange`·`toMotionMine` — 변화 한 줄과 영상 입력을 만든다.
  - 글 장면의 숫자는 [MealStoryFigure](../../apps/web/src/routes/meal-story/MealStoryFigure.tsx) `FigureValue`·`RollingNumber` 가 그린다.
- **행동** [mealStoryActions.tsx](../../apps/web/src/routes/meal-story/mealStoryActions.tsx):
  - `RecordRecipeButton` — `useMealStoryFood` → [mealDraftStart](../../apps/web/src/routes/meal/mealDraftStart.ts) `prepareMealEntry({ quick: { foodId, name, dishType, … } })` → `/meal/new` 로 간다. 로그인 전이면 `/login?next=` 로 보낸다.
  - `ShareStoryButton` — 휴대폰 공유창을 열고, 없으면 링크를 복사한다.
- **레시피 전체 보기** [MealStoryRecipe](../../apps/web/src/routes/meal-story/MealStoryRecipe.tsx) — 재료·만드는 법·1인분 영양정보·출처·검수일을 한 장에 담는다. 제목 아래에 '… 이야기 보기 →' 가 있다.
- **글꼴** [mealStoryFont.ts](../../apps/web/src/routes/meal-story/mealStoryFont.ts) `startStoryFonts`·`useStoryFontsReady` — 스토리 응답이 오자마자 원고 글자로 두 글꼴 조각을 받는다. 다 받았거나 `WAIT_MS` 1,500ms 가 지나면 재생기를 붙인다.

### 영상 — `motion/`(Remotion 컴포지션, 웹 재생기와 MP4 도구가 같이 쓴다)

- **규칙** — 이 폴더는 `remotion`·`@remotion/transitions`·`react`·상대 경로·`@repo/api-contract` 타입만 import 한다. `~/` 별칭·CSS·공용 훅은 쓰지 않는다. 그래야 렌더 도구가 그대로 묶는다([theme.ts](../../apps/web/src/routes/meal-story/motion/theme.ts)). 움직임은 모두 프레임에서 계산하고 CSS 애니메이션은 없다([anim.ts](../../apps/web/src/routes/meal-story/motion/anim.ts) `useClock` = 실제 프레임 ÷ `TEMPO`).
- [StoryVideo.tsx](../../apps/web/src/routes/meal-story/motion/StoryVideo.tsx) — 스토리 한 편이 영상 한 편이다. 원고 장면마다 장면 틀 하나를 `TransitionSeries` 로 잇는다. 전환은 종이 오리기면 종이가 번갈아 밀려 들어오고, 칠판이면 지우개처럼 왼쪽에서 닦인다. 장면마다 그림체를 고르고, 칠판이 못 그리는 장면은 그 장면만 종이로 그린다.
- [timeline.ts](../../apps/web/src/routes/meal-story/motion/timeline.ts) — 시각표 한곳이다. 장면 그림과 길이 셈, 웹의 진행 막대·건너뛰기가 같이 쓴다(`buildTimeline`·`chapterAt`·`chapterSeekFrame`·`chapterProgress`).
  - 장면 길이 = max(움직임 끝, 글이 다 보인 때 + 읽을 시간) + 머묾.
  - 글 읽는 시간은 `READ_FRAMES_PER_CHAR` 2.4(공백 뺀 글자당, 초당 약 12.5자)이고, `TEMPO` 로 줄지 않는다.
  - 이웃 장면은 `TRANSITION_FRAMES` 12 만큼 겹친다.
  - 숟가락 장면의 읽는 시간은 `SPOON_READ` 85(약 2.8초)다.
  - `isSaltSpoonScene` — 나트륨 주제의 큰 숫자 장면에 값이 있는 mg 기준 숫자(내 기록 아님)가 있고, 그림체가 칠판이 아닐 때만 숟가락이다.
- [theme.ts](../../apps/web/src/routes/meal-story/motion/theme.ts) — 1080×1920·30fps. `TEMPO` 0.72(설계보다 약 1.4배 빠름). `TYPE`(글씨 하한 — 본문 40·보조 34·각주 30, 1080 폭 기준). `FONT`(원티드 산스)·`HAND`(개구).
- [layout.ts](../../apps/web/src/routes/meal-story/motion/layout.ts) — 자리 계산이다(컴포넌트 없음). `balanceLines`·`headingSize`(세 줄이면 줄인다)·`barsLayout`·`lineupLayout`·`lineupBand`(값이 1.3배 안이면 점선 둘)·`ownStandardText`('내 기준 20g의 82%')·`fractionText`('약 N분의 1'/'약 N배').
- **장면 틀 9종** — 종이 오리기 기준이다.
  - `ChapterCover` — 부엌·제목 카드·소금통.
  - [ChapterStat](../../apps/web/src/routes/meal-story/motion/ChapterStat.tsx) — 나트륨이면 소금 숟가락 둘(기준이 쌓이고 내 값이 차오르다 넘치면 땀·판정 도장), 아니면 일반 숫자 쪽지.
  - `ChapterBars` — 벽의 색종이 띠.
  - [ChapterLineup](../../apps/web/src/routes/meal-story/motion/ChapterLineup.tsx) — 줄마다 종이 띠가 들어와 막대가 자란다. 강조한 줄은 노랑이다.
  - `ChapterList` — 소품 카드가 날아와 붙는다.
  - `ChapterIngredients` — 레시피 카드. 재료가 그램 쪽지를 달고 그릇으로 들어간다.
  - `ChapterStep` — 식탁 위 냄비·팬, 번호 스티커, 노란 팁.
  - `ChapterNutrition` — 종이 라벨, 분홍 주의 쪽지.
  - [ChapterOutro](../../apps/web/src/routes/meal-story/motion/ChapterOutro.tsx) — 색종이가 흩날리고 주제별 짝 `PALS` 가 손을 흔든다.
- **종이 오리기 `paper/`**:
  - [torn.ts](../../apps/web/src/routes/meal-story/motion/paper/torn.ts) — 찢긴 가장자리 `tornRect`·`tornEllipse`·`tornPath`. 모양·씨앗별로 한 번만 계산해 둔다(SVG 변형 필터를 쓰지 않는다). 2프레임마다 가장자리 셋이 바뀌어 떨린다(boil).
  - [kit.tsx](../../apps/web/src/routes/meal-story/motion/paper/kit.tsx) — Paper·Tape·Note·얼굴·김·종이 결. 그림자는 흐림 없이 세 겹이다.
  - [palette.ts](../../apps/web/src/routes/meal-story/motion/paper/palette.ts) — 크림 바탕이다. `TOPIC_STAGE` 는 나트륨 파랑 `#4c6fb5`, 식이섬유 초록, 칼슘 보라, 비타민 C 귤색, 열량 청록이다. 빨강은 판정에만 쓴다. `DARK` 는 밝은 종이를 6~8% 낮추고, 보조 글 `#584940`, 판지 `#221f1b` 다.
  - `shadow.ts` — 그림자 컨텍스트.
  - [props.tsx](../../apps/web/src/routes/meal-story/motion/paper/props.tsx) — 소품 79종, 1,147줄. 원점 가운데, 약 240 크기다. 흰 면·두부면 밑에는 채반·짙은 접시를 깐다.
  - [icons.ts](../../apps/web/src/routes/meal-story/motion/paper/icons.ts) `PROP_FOR` — 계약 `MealStoryIcon` 이름에서 소품으로. 빠지면 타입 오류가 난다.
  - `grains.tsx`·`saltPose.ts` — 쏟아지는 소금·소금통 동작.
- **칠판 메뉴판 `chalk/`**:
  - [kit.tsx](../../apps/web/src/routes/meal-story/motion/chalk/kit.tsx) — 나무 테·짙은 칠판·분필 결(정적 무늬 한 장)·분필 받침.
  - [chalkLayout.ts](../../apps/web/src/routes/meal-story/motion/chalk/chalkLayout.ts) — `CHALK` 색, `CHALK_AREA`, `chalkDraws`(그리는 장면 목록).
  - 장면 여섯(`ChalkCover`·`ChalkStat`·`ChalkBars`·`ChalkLineup`·`ChalkList`·`ChalkOutro`)과 [index.tsx](../../apps/web/src/routes/meal-story/motion/chalk/index.tsx) `ChalkChapter`.
  - 손글씨(개구) 제목·이름·숫자를 쓴다. 이름 옆 점선 끝에 값이 오고, 분필 빗금 막대는 선이 그어지듯 자란다. 강조는 노란 동그라미다(줄 세우기는 초록 분필 + 노랑). 글은 왼쪽부터 써진다(clip).
  - 목록은 소품 없이 번호 동그라미이고, 원고 `icon` 은 무시한다. 표지는 사진이 있으면 그릇 선 그림 대신 사진을 쓴다.
  - 다크 모드와 무관하다. 재생기 바탕만 칠판 테 색이 된다.
- [storyProps.ts](../../apps/web/src/routes/meal-story/motion/storyProps.ts) — 그 편의 소품은 원고가 정한다. `dishIcon` = 마지막 만드는 법 단계의 `icon`(완성 그릇). `coverIcons` = 첫째·둘째 재료 + 완성 그릇이고, 레시피가 없으면 줄 세우기·목록에 나온 소품 앞의 셋(가장 먼저 나온 것이 가운데)이다. `ingredientIcons` 도 여기 있다.
- [fonts.ts](../../apps/web/src/routes/meal-story/motion/fonts.ts) — `FONT_STYLESHEETS`(jsDelivr 원티드 산스 split 가변판·Google Fonts 개구), `FONT_LOADS`, `motionFontText`(틀의 고정 문구 + 영상 입력 JSON 전체 = 받을 글자).
- **검사**:
  - [storyFixture.ts](../../apps/web/src/routes/meal-story/motion/storyFixture.ts) `variantStory`·`variantChalkStory`·`variantMine` — 첫 편에 없는 모양을 모은 지어낸 원고다.
  - [chapters.test.tsx](../../apps/web/src/routes/meal-story/motion/chapters.test.tsx) — 모든 장면 × 프레임 × 보는 사람 5종을 그려 예외·NaN·글씨 하한을 본다.
  - `timeline.test.ts`.
  - [MealStory.test.tsx](../../apps/web/src/routes/meal-story/MealStory.test.tsx) — 가짜 `@remotion/player` 를 쓰는 재생기·목록·연결 테스트.

### 영상 렌더 도구 — `tools/meal-motion`(pnpm 워크스페이스 밖, npm)

- [package.json](../../tools/meal-motion/package.json) — 의존성은 `remotion`·`@remotion/cli`·`@remotion/transitions` 4.0.541, react 19.1.0 이고 자기 `package-lock.json` 을 쓴다. 스크립트는 `studio`·`render`(MealStory MP4)·`frames`(6프레임마다 1장, 1/4 크기 JPEG)·`sheet`다.
- **왜 밖인가** — 렌더러(웹팩·헤드리스 크롬·ffmpeg)가 웹·서버 설치에 섞이지 않게 하려는 것이다. [pnpm-workspace.yaml](../../pnpm-workspace.yaml) 은 `apps/*`·`packages/*` 만 품는다. 그래서 `pnpm install` 과 무관하고, 처음 한 번 `cd tools/meal-motion && npm ci` 를 한다.
- [remotion.config.ts](../../tools/meal-motion/remotion.config.ts) — `resolve.modules` 에 도구의 `node_modules` 를 먼저 둔다. 웹 폴더의 장면 코드가 부르는 react·remotion 도 도구의 것 한 벌만 싣기 위해서다(두 벌이면 Remotion 오류).
- [src/index.ts](../../tools/meal-motion/src/index.ts) — 웹과 같은 글꼴 주소·글자 묶음으로 `delayRender` 하며 미리 받는다.
- [src/Root.tsx](../../tools/meal-motion/src/Root.tsx) — 컴포지션 4개. `MealStory`(`--props` JSON, 길이는 원고 장면으로)·`Variants`·`VariantsChalk`·`Props`.
- [src/PropsSheet.tsx](../../tools/meal-motion/src/PropsSheet.tsx) — 소품 79개 + 짝을 아홉 칸 한 장에 보인다.
- [sheet.mjs](../../tools/meal-motion/sheet.mjs) — 프레임 JPEG 를 격자 한 장으로 만든다(`--every`·`--at`·`--cols`). sharp 는 `apps/friendly` 의 것을 `createRequire` 로 빌린다.
- 결과 `out/`(MP4·격자·검수 묶음 `out/review/REVIEW.md`)은 git 밖이다.
- 첫 편 97.3초 MP4 를 약 50초에 렌더했다(1단계 기준).

### 식단 안 연결 — `apps/web/src/routes/meal/` 의 건강식단 부분

- **홈의 건강식단 한 줄** — [MealHomePage](../../apps/web/src/routes/meal/MealHomePage.tsx) `HomeStory`.
  - 늘 있는 자리다. 홈이 이미 부르는 14일 영양 점검에서 판정 차례(많음 → 부족 → 조금 부족 — `FLAG_ORDER`)대로 맞는 이야기를 찾는다. 첫째를 '**건강식단** · 식이섬유 부족' 머리말과 제목으로 보인다.
  - 맞는 이야기가 없으면 가장 새 이야기를 보인다. 게시 30일 안이면 ' 새 이야기'를 붙인다(`NEW_STORY_DAYS`).
  - 초안이면 '· 초안'을 붙인다.
  - 오른쪽 단추는 '모두 보기'다. 맞는 이야기가 여럿이면 '맞는 이야기 N편 더'가 된다.
  - 이을 이야기가 있을 때만 직전 14일 통계를 한 번 더 불러 '직전 2주보다 하루 …(N%) 늘었어요/줄었어요' 한 줄을 단다.
  - 이야기가 하나도 없으면 줄이 없다.
- **영양 탭·통계 영양소 흐름** — [MealNutritionTab](../../apps/web/src/routes/meal/MealNutritionTab.tsx)·[MealStatsNutrients](../../apps/web/src/routes/meal/MealStatsNutrients.tsx) 가 [MealStoryLink.tsx](../../apps/web/src/routes/meal/MealStoryLink.tsx) `NutrientStoryLink` 를 쓴다. '많음'이면 '줄이는 법 보기 — 제목', '부족'·'조금 부족'이면 '채우는 법 보기 — 제목'이다. 초안이면 '(초안)' 을 붙인다.
- **기록 상세 → 이야기** — [MealDetailPage](../../apps/web/src/routes/meal/MealDetailPage.tsx) 가 `RecipeStoryLink` 를 쓴다. 건강식단 레시피로 적은 음식 줄 아래에 '건강식단 레시피 — 이야기 보기' 가 붙는다. 항목 `foodId` 가 목록의 `recipeFoodId` 와 같을 때만이고, 이름으로는 잇지 않는다.
- **잇는 규칙 한곳** — [mealStoryMatch.ts](../../apps/web/src/routes/meal/mealStoryMatch.ts):
  - `storyDirectionFor` — high → reduce, low·borderline → increase. '충분'·'기록 더 필요'·'판단 보류'는 잇지 않는다.
  - `findStoryFor` — 목록이 새 것 먼저라 처음 맞는 것이 가장 새 이야기다.
  - `storyForFood`.
- **변화 규칙 한곳** — [mealNutrientChange.ts](../../apps/web/src/routes/meal/mealNutrientChange.ts). 통계 탭에 있던 규칙을 11-11 옮겨 와 이야기·홈·통계가 같이 쓴다.
  - `NUTRIENT_CHANGE_MIN` 0.1 — 10% 넘게 달라졌을 때만 말한다.
  - 두 기간 모두 판정이 나왔고 coverage 가 충분해야 한다.
  - `comparableNutrientChange` 는 더 엄하다. 두 기간의 하루 평균 열량이 `ENERGY_CHANGE_MAX` 15% 안이고, 어느 쪽도 '기록 더 필요'가 아닐 때만 말한다.
  - 문구는 `nutrientChangeText`('직전 2주보다 하루 2.1g(20%) 늘었어요 · 직전엔 부족')·`nutrientChangeShort`(영상 쪽지)가 만든다.
- **'기준 안' 글자** — [MealNutrientLine](../../apps/web/src/routes/meal/MealNutrientLine.tsx) `MealNutrientChip` 에 `label` 을 더했다. 색·모양은 판정 그대로 두고 글자만 바꾼다. 영양 탭·통계의 글자는 그대로 '충분'이다.
- 글꼴 훅을 [mealFont.ts](../../apps/web/src/routes/meal/mealFont.ts) 로 빼서 스토리와 식단이 같이 쓴다. 홈 줄 스타일은 [mealTheme.css](../../apps/web/src/routes/meal/mealTheme.css) `.meal-story-card*` 다(`word-break: keep-all`).

## Talks To [coverage: high — 22 sources]

- **[meal-nutrition](meal-nutrition.md)** — 섭취기준은 [kdri.ts](../../apps/friendly/src/modules/meal-nutrition/kdri.ts) `nutrientReference`·`KDRI_AGE_GROUPS` 를 서버가 그대로 읽는다. 영양 탭과 같은 표라 숫자가 판정과 어긋나지 않는다. 주의 문구는 [meal-nutrition.defs.ts](../../apps/friendly/src/modules/meal-nutrition/meal-nutrition.defs.ts) `NUTRIENT_DEFS[].caution` 이다(potassium·fiber·calcium). 웹 쪽 영양 판정(`useMealNutrition(14)` — 홈 줄·식단 안 목록)이 어떤 이야기를 이을지 고른다.
- **[meal](meal.md)** — 내 값과 변화는 통계 영양소(`useMealStatsNutrients` → `/meals/stats/nutrients`, 하루 평균·판정·`reference.amount`·`reference.kind`)에서 온다. [이 레시피로 기록]은 식단 입력 draft(`prepareMealEntry` → `/meal/new`)로 이어진다. 기록 상세·홈·영양 탭·통계·식단 셸이 입구다(위 Architecture 의 '식단 안 연결'). 식단 기록 응답·테이블은 바꾸지 않았다. 목록이 `recipeFoodId` 를 실어 보낼 뿐이다.
- **[food](food.md)** — 레시피를 카탈로그 `FoodItem`(source `manual`)으로 만든다. 알레르기 추정은 `food-allergen.inferFoodAllergens`·`serializeFoodAllergenMetadata`, 이름 정규화는 `lib/text.normalizeTerm` 이다. 표준데이터 머리글 정규화는 `food-nutrients.looseNutrientHeader` 를 쓴다. 선행 수정 `ac3e0066`(11-09)은 [food-import.service.ts](../../apps/friendly/src/modules/food/food-import.service.ts) `upsertFoodSeeds` 를 고쳤다. 빌려 온 영양(`nutritionFrom`)이 있는 행에 직접 값 시드가 오면 통째로 바꾸고 빌린 표시를 지운다. [food-nutrition.service.ts](../../apps/friendly/src/modules/food/food-nutrition.service.ts) `backfillNutrition` 는 100g당 직접 값이 있는 행을 빌려 오기 대상에서 뺀다. 운영 '토마토'(연두부 토마토 155g 110kcal)·'자두'(상큼하자두)가 계기다. 첫 편이 토마토를 다루니 기록 값부터 바로잡은 것이다.
- **[life-map](life-map.md)** — 표준데이터 CSV 인코딩 해독에 [life-map-master.service.ts](../../apps/friendly/src/modules/life-map/life-map-master.service.ts) `decodeLifeCsv` 를 빌려 쓴다(EUC-KR/UTF-8). 모듈 경계를 넘는 import 다(Gotchas).
- **[api-contract](api-contract.md)** — [schemas/meal-story.ts](../../packages/api-contract/src/schemas/meal-story.ts) 가 `MealNutrientKey`·`MealStatsNutrientKey`(meal)·`FoodDishType`(food)를 가져다 쓴다. `routes.ts` `Routes.MealStory`. [zod-ssot-buildless](../concepts/zod-ssot-buildless.md).
- **[shared](shared.md)** — [meal-story.api.ts](../../packages/shared/src/api/meal-story.api.ts) `mealStoryApi` 와 [useMealStory.ts](../../packages/shared/src/hooks/useMealStory.ts) 훅 3개. 쿼리 키는 `['meal-story', 'list'|'detail', …, audience]` 다(`audience` = ADMIN ? 'admin' : 'public'). 로그인·로그아웃 뒤 초안이 섞이지 않게 하려는 것이다([principal-scoped-client-state](../concepts/principal-scoped-client-state.md)).
- **[friendly](friendly.md)** — [app.ts](../../apps/friendly/src/app.ts) 가 OG 를 등록한다. OG 는 `lib/web-index` 의 `loadWebIndex`·`injectOg`·`getPublicOrigin`·`defaultOgImage` 를 쓴다. [rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) 는 `RATE.mealStoryRead`(분당 120 — 목록·한 편·OG, DB 0콜)·`RATE.mealStoryImage`(분당 300)다. `resolveOptionalUser` 로 관리자를 가른다. OG 방식은 [tarot](tarot.md) 공유와 같다.
- **[web](web.md)** — 식단 셸, 사이트 메뉴(`guestTo`), 로그인 `?next=`, 테마 스토어(다크). 웹 의존성 [package.json](../../apps/web/package.json) 은 `remotion`·`@remotion/player`·`@remotion/transitions` 4.0.541 고정이다.
- **[api-docs](api-docs.md)** — 비어드민 라우트라 [endpoints.md](../../docs/api/endpoints.md)·[openapi.json](../../docs/api/openapi.json) 에 `meal-story` 태그 4줄이 있다. 계약을 바꿀 때마다 `export:openapi` 를 다시 돌렸다(8커밋).
- **[mobile](mobile.md)** — 아직 없다. [PLAN-mobile-meal.md](../../docs/PLAN-mobile-meal.md) 후보다. 같은 API·공용 훅으로 RN 재생기만 만들면 된다. 사진 주소가 `/api/v1/...` 상대라 API 기준 주소를 붙여야 한다.
- **외부** — 식약처 전국통합식품영양성분정보 표준데이터 CSV 3종(원재료성 15100065·가공식품 15100066·음식 15100070, `data/open/food/`, git 밖 — [data-sources.md](../../docs/data-sources.md)). 국가표준식품성분 DB 10.4(농촌진흥청 xlsx — 손으로 적은 값의 원본). 가공식품 전체판 엑셀(`YYYYMMDD_가공식품DB_*.xlsx`, 시트 2.3GB — 두부면). Remotion(개인 사용 무료 라이선스). 글꼴 CDN 둘(jsDelivr 원티드 산스·Google Fonts 개구, OFL). 종이 오리기 기법은 cth9191/animate(MIT)의 cut-paper·riso 문서를 참고만 했다(코드는 직접 짰다).

## API Surface [coverage: high — 14 sources]

**HTTP(friendly, `Routes.MealStory`)** — [meal-story.route.ts](../../apps/friendly/src/modules/meal-story/meal-story.route.ts), 태그 `meal-story`:

| 메서드·경로 | 인증 | 한도 | 응답 | 동작 |
|---|---|---|---|---|
| `GET /api/v1/meal-stories` | 선택(`OPTIONAL_BEARER`) | 120/분 | `MealStoryListResult{ items: MealStoryListItem[] }` | 게시본(관리자면 초안도), 게시일 최근 순. `recipeFoodId` 는 레시피 음식이 만들어진 편만 |
| `GET /api/v1/meal-stories/:slug` | 선택 | 120/분 | `MealStory` | 초안·없음 → 404('스토리를 찾을 수 없습니다'). 숫자는 서버 계산값, `figure.my` 는 value null |
| `GET /api/v1/meal-stories/:slug/images/:file` | 없음 | 300/분 | 사진 스트림 | `?v=` 가 있으면 `public, max-age=31536000, immutable`, 없으면 1시간. jpg/jpeg/png/webp 만 |
| `POST /api/v1/meal-stories/:slug/food` | 로그인(`authenticate`) | 전역만 | `MealStoryFoodResult{ foodId, name, dishType }` | 레시피 → 카탈로그 음식. 레시피 없음 404, 이름 충돌 409 |

**공유 미리보기(OG, `/api` 밖)** — [meal-story-preview.ts](../../apps/friendly/src/modules/meal-story/meal-story-preview.ts) 가 `GET /meal/stories`·`/meal/stories/:slug`·`/meal/stories/:slug/recipe` 를 맡는다. index.html 에 OG 를 넣어 돌려준다(`cache-control: public, max-age=60`, `RATE.mealStoryRead`). 한 편이면 제목이 '건강식단 · {title}' 이고 요약·표지 사진이 따라간다(없으면 기본 이미지). 목록·초안·없는 편이면 'Life Pickr 건강식단' 기본값이다. 초안 제목이 링크로 새지 않게 하려는 것이다. index.html 을 못 찾으면 500 'preview unavailable' 이다.

**계약** — [schemas/meal-story.ts](../../packages/api-contract/src/schemas/meal-story.ts):
- `MEAL_STORY_SLUG_PATTERN`·`MEAL_STORY_IMAGE_PATTERN`.
- `MealStoryNutrient`(10 — kcal·carbG·proteinG·fatG·sugarG·fiberG·sodiumMg·potassiumMg·calciumMg·vitaminCMg).
- `MealStoryIcon`(79종 — 첫 편 23 · 식이섬유 12 · 칼슘 8 · 비타민 C 7 · 면 12 · 외식 17).
- `MealStoryStatus`(draft|published).
- `MealStoryTopic{ nutrient: MealStoryTopicNutrient(= MealNutrientKey + 'kcal'), direction: reduce|increase }`.
- `MealStoryEquivalent{ label, value|null, unit, per }`.
- `MealStoryFigure`.
- `MealStoryScene` 9종(cover·stat·bars{…, fraction|null}·lineup{basis, rows[{label, sub, figure, icon, highlight}]}·list·ingredients{servings, items}·step{number, total, text, tip, image, icon}·nutrition{servings, rows, cautions}·outro{actions}).
- `MealStoryAction`(record·recipe·share·stats).
- `MealStoryLook`(paper|chalk).
- `MealStory{ slug, status, title, summary, topic|null, publishedAt, reviewedAt|null, coverUrl|null, look, scenes, recipe|null{name, servings, dishType, ingredients, steps, nutrition}, sources }`.
- `MealStoryListItem{ slug, status, title, summary, topic, kicker|null, publishedAt, coverUrl, sceneCount, recipeFoodId|null }`.
- `MealStorySlugParams`·`MealStoryImageParams`(정규식이 경로 밖 이름을 막는다).
- `MealStoryFoodResult`.

라우트 상수는 [routes.ts](../../packages/api-contract/src/routes.ts) `Routes.MealStory{ list, detail, image, food }` 다.

**공용(FE)** — `mealStoryApi.list/get/food`, `useMealStories(enabled)`·`useMealStory(slug)`(`retry: false`)·`useMealStoryFood()`(성공하면 목록 캐시의 그 편 `recipeFoodId` 를 바로 적는다). `staleTime` 은 5분이다 — 원고는 배포로만 바뀌기 때문이다.

**웹 주소** — `/meal/stories`(목록) · `/meal/stories/:slug?s=N&view=text|motion` · `/meal/stories/:slug/recipe`.

**스크립트(friendly)** — `build:meal-stories [--slug=] [--find=a,b]` · `check:meal-stories [--slug=]` · `export:meal-story --slug= [--out=] [--mine=] [--standard=] [--change=] [--dark]`.

**MP4 도구(`tools/meal-motion`, npm)** — `npm run studio|render|frames|sheet`, `npx remotion render src/index.ts Variants|VariantsChalk …`, `npx remotion still src/index.ts Props out/props.png --scale=0.6`.

## Data [coverage: high — 20 sources]

- **DB 테이블 없음 · 마이그레이션 없음** — 원고·재료 값·사진은 파일이다. DB 에 쓰는 것은 [이 레시피로 기록]이 만드는 `food_items` 행 하나(편마다)뿐이다. 그 행은 `source='manual'`, `sourceId='meal-story:<slug>'`, `sourceCategory='건강식단'`, 1인분·100g당 값·`nutrientsPer100gJson`·알레르기·`dishType`·`cuisine` 을 갖는다. 그 음식으로 적은 기록은 영양 점검에서 칼슘·비타민 C 도 세어진다. 누가 처음 누르기 전에는 행이 없고, 목록의 `recipeFoodId` 도 null 이다.
- **원고 파일** — `apps/friendly/content/meal-stories/<slug>/`([폴더](../../apps/friendly/content/meal-stories/)). 6편의 `story.json`:
  - [sodium-tomato-pasta](../../apps/friendly/content/meal-stories/sodium-tomato-pasta/story.json) — 재료 11, 묶음 `store-sauce`·`wholewheat-spaghetti`.
  - [fiber-mushroom-bibimbap](../../apps/friendly/content/meal-stories/fiber-mushroom-bibimbap/story.json) — 재료 14, manual `soy-sauce`, 출처 `rda-fct-10`.
  - [calcium-anchovy-kale-rice](../../apps/friendly/content/meal-stories/calcium-anchovy-kale-rice/story.json) — 재료 11, manual `small-anchovy`·`tofu`·`yogurt`·`cheddar`.
  - [vitamin-c-paprika-salad](../../apps/friendly/content/meal-stories/vitamin-c-paprika-salad/story.json) — 재료 12, 모두 원재료 표준데이터.
  - [kcal-half-konjac-noodles](../../apps/friendly/content/meal-stories/kcal-half-konjac-noodles/story.json) — 재료 18, manual `tofu-noodle`·`gochujang`·`vinegar`, 출처 `rda-fct-10`·`mfds-processed-full`.
  - [sodium-eating-out-menus](../../apps/friendly/content/meal-stories/sodium-eating-out-menus/story.json) — 재료 19, 모두 `ref.db: "dish"`, `look: "chalk"`, 레시피 없음.
  - `foods.json` 은 편마다 있다. `images/` 는 아직 어느 편에도 없다(사진 0장). `originals/` 는 git 밖이다.
- **재료 값의 출처 규칙**:
  - 원재료 표준데이터 코드(`ref.db raw`)를 먼저 쓴다.
  - 시판품은 가공식품 묶음 중앙값(`group`)으로 낸다. 특정 제품을 고르지 않으니 브랜드를 밝히지 않아도 된다. 완성 요리('토마토소스파스타')는 `none` 으로 뺀다.
  - 식당 한 그릇은 음식 표준데이터의 외식(분석함량)이다. 2012~2017 식약처 외식 영양성분 조사이며, 쓸 수 있는 행은 198행이다.
  - 표준데이터에 없으면 국가표준식품성분 DB 10.4 값을 `manual` + `sources` + `note`(식품명·색인)로 적는다.
  - 생것·말린것·삶은것을 가른다. 스파게티 건면은 `_말린것`이다. 소금이 든 마른 면(소면 100g 1,274mg)은 삶은 것(68mg)으로 적는다.
  - 크기를 가린다. 멸치 평균은 1,857mg 이고 잔멸치는 620mg 이다.
- **음식 표준데이터의 함정**(외식 편, [PLAN-meal-story.md](../../docs/PLAN-meal-story.md) 17) — `mfds-nutrition.csv`(15100070, 19,495행)에는 같은 이름이 조사 종류마다 여러 행 있다('짬뽕' 11행: 545~7,338mg). 식품기원별로 업체 제공 15,225 · 재료량 산출 1,008 · 급식 산출 2,132 · 외식(분석함량) 648 · 가정식(분석 함량) 482 행이다. 외식(분석함량) 가운데 2022년 분석 289행은 식품중량이 100g(무게 없음)이거나 간편조리세트(밀키트 1~2kg)다.
- **두부면**(다섯째 편) — 원재료 표준데이터에도, 5만 행에서 잘린 가공식품 CSV 에도 없다. 그래서 가공식품 전체판 엑셀의 시트를 `unzip -p … sheet1.xml` 으로 `</row>` 마다 끊어 흘려 읽었다. 이름이 맞는 146행이 나왔다. 같은 이름이 세 물건이다 — 두부(100g 171kcal), 곤약 바탕(15kcal), 밀가루 숙면(245kcal). 이 가운데 두부 22개 제품의 중앙값(169.5kcal·단백질 16g)을 썼다. 나트륨(0~260mg)과 식이섬유·칼슘(적은 제품 셋뿐)은 비웠다.
- **서버 메모리 캐시** — `MealStoryStore.cache: Map<slug, {key, loaded|null, error}>`. key 는 story·foods·사진 mtime 이다. 사라진 폴더는 지운다. 편 수만큼만 커진다.
- **브라우저** — React Query 는 5분이고 관리자·일반 키가 따로다. 사진은 `?v=mtime` 1년 immutable 이다. OG HTML 은 60초다.
- **git 밖 작업 산출물** — `tools/meal-motion/out/`(MP4·프레임·격자·`look/looks.png` 시안·`review/` 검수 묶음 — 편마다 확인할 것·레시피·점검 출력·게시하는 법을 담은 `REVIEW.md` 한 장). 이 컴퓨터 전용 스킬 `.claude/skills/meal-story/SKILL.md`(`.claude/` 는 git 밖) — 문서를 가리키는 요약 절차다.

## Key Decisions [coverage: high — 12 sources]

- **2026-11-13 둘째 그림체 '칠판 메뉴판'은 외식 편에 쓴다(`82e02c3d`·`4df0c852`·`ffe17e37`)** — 사용자가 "외식 편은 완전히 다른 스타일이면 좋겠다"고 했다. 이번에는 검토 의견도 찬성이었다. 근거는 셋이다. 내용의 종류가 다르고, 같은 틀로 외식 열량·당류 편이 이어질 수 있고, 레시피 장면을 그리지 않아도 된다. 시안 둘(칠판·영수증)을 지금 그림체와 한 장(`out/look/looks.png`)과 15초 영상으로 보인 뒤 1안을 골랐다. **장면 시각표는 같이 쓰고 그림만 바꾼다**(길이·진행 막대·건너뛰기가 그대로다). 칠판은 레시피 장면을 그리지 않는다. 원고가 쓰면 점검이 막고, 혹시 오면 종이로 그린다. 시안에서 쓴 SVG 타원 강조는 늘린 비율 때문에 줄마다 선 길이가 어긋나서 테두리로 바꿨다.
- **2026-11-12 레시피 없는 편 — 값 확인만으로 게시할 수 있는 이야기(`12b58ea5`)** — 다섯 편이 모두 조리·사진을 기다려 게시본이 없었다. 외식 편은 식당 음식을 줄 세우기만 하므로 조리가 없다. **제목은 데이터가 받쳐 주는 만큼만 붙였다.** 처음 생각한 '국물 적은 메뉴로'는 자장면(국물 없음 2,392)이 쌀국수(1,650)보다 높아 버렸다. 덧말도 '그릇이 크고 국물이 많을수록 높은 편'까지만 적었다. 국물을 남긴 값(데이터 없음)과 프랜차이즈 메뉴(업체 제공 값 — 브랜드가 드러나고 조사 방식이 다르다)는 다루지 않았다.
- **2026-11-12 식당 음식은 '분석한 한 그릇'만, 무게는 원고가 적지 않는다(`82e02c3d`)** — 같은 이름의 값이 몇 배씩 다르다. 그래서 빌더가 식품기원으로 막는다(`dishProblem`). 한 그릇의 크기가 값의 절반을 설명하므로(우동 1,000g · 김밥 250g) 줄 세우기는 옆 글이 없어도 무게를 보인다.
- **2026-11-12 줄 세우기(`lineup`) — 틀 9종째, 그림체는 그대로 두고 뼈대만 바꾼다(`9ff7e2ee`·`e7941047`)** — 네 편이 모두 '영양소 하나 → 집에서 한 접시' 꼴이었다. 이번에는 여럿을 같은 저울에 올리고 그 답으로 레시피를 낸다. 데이터가 전제를 바꿨다. 삶은 면은 100g 에 114~132kcal 로 거의 같고, 소면은 밥 한 공기보다 많다. 그래서 줄거리가 '면을 바꾸자'에서 '비슷한 면과 크게 다른 면 → 반반 섞고 단백질을 얹는다'로 바뀌었다. '비슷하다'·'크게 다르다'는 원고가 말하고, 틀은 점선만 그린다. 점검이 최솟값·최댓값·배수를 찍어 말과 맞춰 보게 한다. 같은 무게냐 한 번 먹는 양이냐에 따라 결론이 뒤집힐 수 있다(두부면). 그래서 고른 잣대를 밝히고 반대쪽 사실도 덧말에 적는다.
- **2026-11-12 주제에 열량을 더하되 내 기록에는 잇지 않는다(`9ff7e2ee`)** — 열량은 판정이 없다. 영양 탭에 줄이 없고, 통계 열량 줄도 판정을 주지 않는다. 실제 계정은 기록이 적어 하루 1,047kcal 로 보이는데, 거기에 '열량 줄이기'를 권하면 틀린 말이다. 그래서 이 편에는 '내 최근 2주' 숫자도 넣지 않았다. 목록·홈의 가장 새 이야기·기록 상세로만 들어온다.
- **2026-11-12 목록 카드의 이름 = 그 편의 머리말(`kicker`), 원고에 목록용 이름을 따로 두지 않는다(`9ff7e2ee`·`e7941047`)** — 사용자가 "리스트에서 열량 줄이기가 또 나올 경우"를 걱정했다. 주제 이름으로 자동으로 만든 카드는 같은 주제의 두 편을 구분하지 못한다. 목록용 이름을 따로 두면 머리말과 어긋나기 쉽다. 그래서 목록 응답에 표지 kicker 를 싣는다. 편이 여럿 나올 주제는 머리말에 대상(국수·밥·간식)을, 제목에 수단을 넣는다. 머리말이 겹치면 점검이 경고한다. 내 기록에 잇는 규칙은 그대로 주제로 맞춘다.
- **2026-11-11 '약 N배' — 강조한 막대가 큰 쪽이면 거꾸로 읽히지 않게(`fd61e986`)** — 한 접시(201mg)가 권장량(100mg)보다 크다. 그런데 기준 막대에 '약 2분의 1'이 붙으면 거꾸로 읽힌다. 그래서 `fraction.multiple` 을 두었다.
- **2026-11-11 넷째 주제 비타민 C 를 고른 근거(`b17e4f71`)** — 실제 계정은 기록량이 필요량의 절반 아래라 13/15 영양소가 '부족'이다. 기록량을 필요량만큼 늘려 어림하면 식이섬유·칼륨·마그네슘은 80%대로 오른다. 비타민 D(26%)·A(33%)·C(33%)는 그래도 크게 모자란다. C 는 한 접시로 하루치를 채울 수 있고, 조리·사진이 쉽고, 주의 문구가 필요 없다. 칼륨은 신장 질환·약 주의가 따른다. 비타민 D 는 음식만으로 어렵고 값이 빈 행이 많다. 마그네슘·아연·엽산은 표준데이터 CSV 에 값이 없다. 영양 탭의 비타민 C 주의 문구는 하루 2,000mg 고용량 이야기라 달지 않았다.
- **2026-11-11 재료 값은 흔한 말이 아니라 데이터로, 표준데이터에 없으면 공공 원본을 손으로(`ec280085`·`bdbaec07`)** — 간장은 원재료 표준데이터에 재래식(100g 7,999mg)뿐이다. 그래서 국가표준식품성분 DB '간장, 개량, 양조'(4,783mg)를 손으로 적었다. 둘째 편 한 그릇의 나트륨이 499 → 339mg 이 됐다. 가공식품 간장은 100ml 기준 제품이 섞여 묶음으로 쓰지 않았다. 볶음밥에는 평균 멸치가 아니라 잔멸치 값을 쓴다(평균이면 한 그릇이 550mg 으로 부푼다). 두부는 '아주 많지는 않아도'라고 적었다. 올리브유는 칼슘 값이 비어 '일부만 셌어요'가 되니 참기름으로 바꿨다.
- **2026-11-11 기록한 뒤의 변화 — 혼자 서는 한 줄은 통계보다 엄하게(`504bd68c`)** — 마무리가 "기록해 두면 통계에서 보여요"라고 하는데, 돌아와도 달라진 것이 보이지 않았다. 이야기의 내 값 아래와 홈 줄에 직전 2주 대비를 단다. 서버·DB 는 그대로이고 통계 조회만 한 번 더 한다. 실제 계정에서 나트륨·식이섬유가 함께 55%·58% '줄었어요'로 나왔는데, 원인은 기록량 차이였다(하루 1,047 대 1,495kcal). 그래서 하루 열량이 15% 안으로 비슷하고 '기록 더 필요'가 아닐 때만 말한다. 같은 날 통계 탭도 이 규칙으로 맞췄다. 영양소 줄은 기록량이 비슷할 때만 견주고, 열량 줄은 그대로 말한다. 다르면 까닭을 한 줄로 알린다.
- **2026-11-11 레시피 표는 8줄 + 그 편이 가리키는 영양소만(`650aea40`)** — 모든 편에 칼슘 줄을 늘리면, 값을 모르는 가공식품 묶음이 있는 첫 편이 '일부만 셌어요'가 된다. 같은 커밋에서 이어진 같은 값의 나이를 묶었다('65세 이상 700mg').
- **2026-11-11 검수를 돕는 쪽으로 — 콘텐츠를 늘리기보다(`19da748d`, 사용자 "권장 진행 — 위키는 아직")** — 초안 셋에 게시본이 없고 막힌 곳은 사람 검수였다. 그래서 `out/review/` 에 MP4 와 `REVIEW.md` 한 장을 만들었다. 그 뒤에도 넷째~여섯째 편이 같은 이유(사용자 "다음 진행")로 초안으로 늘었다.
- **2026-11-10 이야기와 기록은 id 로 잇는다, 식단 테이블은 그대로(`c01a1e31`·`2d701405`)** — 기록 항목은 `foodId` 만 갖는다. 그래서 목록 API 가 편마다 `recipeFoodId` 를 실어 보내고 화면이 id 로 맞춘다. 이름이 같다고 잇지 않는다. [이 레시피로 기록]이 성공하면 캐시에 바로 적는다. 레시피 음식의 계통이 '양식'으로 박혀 있던 것도 원고 `recipe.cuisine` 으로 바꿨다.
- **2026-11-10 남녀 값이 다른 기준은 숫자 둘로 나란히(`c01a1e31`)** — 한 숫자만 보이면 절반에게 틀린 기준이다(식이섬유 30·20g, 칼슘 800·700mg). 원고가 `sex` 를 골라 둘을 놓는다. 내 값의 '기준 대비 %'는 기준이 여럿이거나 내 기준이 다르면 '내 기준 20g의 82%' 로 밝힌다(`ownStandardText` — 글로 보기·영상 공용).
- **2026-11-10 그 편의 그림은 원고가 정한다, 무대 색과 짝은 주제로(`6ba01a2c`)** — 첫 편의 토마토·파스타 접시·소금통이 틀에 박혀 둘째 편에도 나왔다. 그래서 `storyProps` 가 레시피에서 고르고, `TOPIC_STAGE`·`PALS` 는 주제에서 고른다. 흰 손글씨 머리말과의 대비는 4.5:1 안팎으로 맞췄다.
- **2026-11-10 별도 메뉴가 아니라 식단 안으로(`6fb948c3`·`b8b89540`, 사용자 "식단 사이트 안에 융합되게")** — 이야기가 한 편이고 가끔 느는 콘텐츠라 메뉴 한 칸보다 필요한 순간에 보이는 편이 맞다고 봤다. 그래서 사이트 메뉴와 식단 메뉴의 '건강식단'을 뺐다. 로그인 전에는 '식단'이 목록으로 온다.
  - **초안도 받은 대로 보인다** — 처음에는 게시본에만 걸었다. 첫 편이 초안이고 메뉴도 없앤 뒤라 관리자가 들어갈 길이 없었다(사용자 "홈 화면을 봐도 들어가는 방법이 없다").
  - **이야기·레시피도 셸 안에서 연다**(사용자 "나가기가 애매하다 — 사이드바는 유지"). 나가는 단추는 하나다.
  - 같은 날 옆 칸을 더했다.
  - 하지 않은 것: 홈 '식사 습관 한 줄'(통계 insights)에 잇기 — 서버 글에 영양소 키가 없다. 하단 탭 칸·추천 탭 묶기·레시피를 추천 후보에 넣기는 이야기가 쌓인 뒤로 미뤘다.
- **2026-11-10 '기준 안' — 스토리에서만(`f3586a7d`, 사용자 결정)** — 나트륨이 기준 안일 때 영양 탭 라벨 '충분'은 '나트륨이 충분하다'로 읽힌다. 그래서 스토리의 영상 도장과 글 칩만 바꿨다. 영양 탭·통계는 그대로 두었고, 바꾸려면 따로 정한다.
- **2026-11-10 화면이 숫자를 지어내지 않는다 — 소금 환산·'약 N분의 1'도 서버가(`cdab9359`·`f3586a7d`)** — 영상이 2.5배를 직접 곱했고 출처가 없었다. 막대 비도 영상이 반올림했다(2.5배 → 3). 이제 서버가 `equivalent`·`fraction` 을 주고 글로 보기에도 같은 줄이 나온다. WHO 2012 는 환산 비율의 근거로만 쓰고, 기준값은 KDRI 로 둔다. 숟가락이 차는 비율도 통계의 내 기준 대비 % 로 바꿨다. 전에는 65세 이상(2,100mg)이 2,200mg 일 때 숟가락은 안 넘치는데 '많음'이 찍혔다.
- **2026-11-10 종이 오리기 그림체(`281318cc`, 시안 3안 중 3안)** — 조건은 둘이었다. ① 숫자·작은 글은 앱 글꼴(원티드 산스), 손글씨(개구)는 제목·짧은 덧말에만 쓴다. ② 휴대폰 성능을 지킨다. 그래서 가장자리는 미리 계산하고, SVG 필터를 쓰지 않고, 그림자는 흐림 없이 세 겹으로 그렸다. 운영 빌드 390×844 2배 화면에서 CPU 4배 감속 29.3~29.9fps, 6배 감속 27.5~28.6fps 였다.
- **2026-11-10 빠르기와 읽는 시간을 떼어 놓는다(`281318cc`, 사용자 "조금 더 빠르게")** — 움직임은 `TEMPO` 0.72 하나로 빨라진다. 글은 글자 수대로 읽을 시간을 따로 지킨다. 첫 편이 97.3초 12장 → 81.6초 13장 → 83.1초(보강)가 됐다. 통밀 덤은 열량이 1할쯤 적을 뿐이라 열량 덤과 따로 둔다(사용자).
- **2026-11-10 렌더 도구는 pnpm 워크스페이스 밖(`6ed5df07`)** — 렌더러·크롬·ffmpeg 가 웹·서버 설치에 섞이지 않게 했다. 장면 코드는 웹 폴더의 것을 그대로 묶는다.
- **2026-11-09 움직임 = 모션 그래픽(Remotion), 장면 넘기기는 '글로 보기'로 남긴다(사용자 "프레젠테이션 같은 것 말고 애니메이션이 잔뜩 들어간 모션 그래픽")** — 저장소 밖 시제품(숟가락 장면, CPU 4배 감속 29.7fps)을 옮겼다. 동작 줄이기·낡은 브라우저에서는 글로 본다([webgl-stage-lite-fallback](../concepts/webgl-stage-lite-fallback.md) 와 같은 결 — 연출은 선택, 내용은 항상).
- **2026-11-09 원고 = 서버 파일(git), DB·어드민 업로드는 편이 쌓인 뒤(`e3c6f6e5`)** — 공유 미리보기(OG)를 서버가 만들어야 해서 웹 `public/` 이 아니라 friendly 가 읽는다. 배포(git pull)만으로 올라가고 서버가 5초마다 다시 읽는다.
- **2026-11-09 숫자는 가리키기만, 값마다 출처, 시판품은 여러 제품의 중앙값(`e3c6f6e5`·`6a3f4b49`)** — 제품 하나의 값을 중앙값이라 부르지 않는다(최소 3). 값을 적은 제품 수가 묶음보다 적으면 화면이 밝힌다. 섞은 값은 하나라도 모르면 내지 않는다(반쪽 합은 틀린 값이다). [provenance-tagged-fill](../concepts/provenance-tagged-fill.md)·[unknown-vs-zero](../concepts/unknown-vs-zero.md).
- **2026-11-09 [이 레시피로 기록]은 레시피를 카탈로그 음식으로 맞춘다 — 스토리 숫자 = 기록 숫자(`e3c6f6e5`)** — 식단 기록은 카탈로그 행으로 영양을 계산한다. 그래서 빌린 값이 아니라 직접 값을 가진 `manual` 음식을 만들고, 그 음식으로 draft 를 채운다.
- **2026-11-09 누구나 보되 초안은 관리자만, 사진은 인증 없이(`e3c6f6e5`)** — 같은 라우트에서 선택 인증으로 가른다. 공개/어드민 라우트 쌍([public-admin-route-split](../concepts/public-admin-route-split.md))을 두지 않았다. 초안 사진은 열리지만 글은 새지 않는다(OG 도 기본값).
- **2026-11-09 영양 목표는 하지 않는다 — 영양 탭 판정이 이야기를 고른다(사용자)** — 첫 편은 나트륨 + 토마토 스파게티이고, 면 바꾸기는 같은 편의 덤 장면이다. 효능 단정 말투와 글 속 영양 값은 점검이 막는다(식품 표시·광고 기준과 같은 결).

## Gotchas [coverage: high — 30 sources]

- **(2026-11-15 기준) 6편 모두 초안이라 일반 사용자에게는 아무것도 보이지 않는다.** 목록 API 가 빈 배열을 준다. 그러면 홈 줄이 그려지지 않고, 영양 탭·통계 링크도 없고, 공개 목록은 '아직 올라온 이야기가 없어요'다. 로그인 전 사이트 메뉴 '식단'이 그 빈 목록으로 온다. 관리자만 '초안' 표시와 함께 본다. 게시하려면 사람이 해야 할 일이 남아 있다. 조리·사진(표지 + 단계), 손으로 적은 값을 원본과 대조, 목록 문구의 근거 확인을 거쳐 `reviewedAt`·`status: "published"`·`cover` 를 채운다([PLAN-meal-story.md](../../docs/PLAN-meal-story.md) 남은 일). 실기기(저사양 안드로이드·아이폰)의 글씨와 끊김도 아직 사람이 보지 않았다.
- **재료 값 이름을 더하면 모든 편의 `foods.json` 을 다시 만들어야 한다(`5f3c33cd`).** 칼슘 열을 더한 `650aea40` 에서 첫 편·둘째 편을 다시 만들지 않았다. 점검은 ✗ 였는데 테스트는 통과해 그대로 커밋됐다. 화면 값은 같았다. 지금은 내용 테스트가 `MEAL_STORY_PER100_KEYS` 를 대조하므로, 표준데이터가 없는 컴퓨터에서도 `pnpm test` 가 잡는다. 새 영양소를 열 때는 `build:meal-stories`(slug 없이)를 돌린다.
- **`foods.json` 은 원본 CSV 가 있는 작업 컴퓨터에서만 만들 수 있다.** `data/open/food/` 가 git 밖이라, 없으면 `check:meal-stories` 도 원본 대조를 건너뛰고 형식만 본다. 운영에서 돌릴 일은 없다. 결과를 커밋한다([deploy-friendly.md](../../docs/deploy-friendly.md)).
- **내용 테스트는 오류만 막는다.** [meal-story.content.test.ts](../../apps/friendly/src/modules/meal-story/meal-story.content.test.ts) 는 `errors` 만 본다. 영상 틀 한도·머리말 겹침·영양 단위 없는 글 속 숫자 같은 경고는 `check:meal-stories` 를 사람이 돌려야 보인다.
- **칠판이 그리는 장면 목록이 두 곳에 있다.** 서버 `MEAL_STORY_LOOK_SCENES` 와 웹 `chalkLayout.ts` 의 `DRAWS` 다. 한쪽만 고치면 점검은 통과하는데 웹이 그 장면을 종이로 그려 섞여 보인다. 같이 고친다.
- **새 주제·새 소품·새 고정 문구는 여러 곳을 함께 고친다.**
  - **새 주제** — `TOPIC_STAGE`(무대 색)와 `PALS`(마무리 짝)를 같이 고친다. 안 하면 나트륨의 파랑·소금통이 나온다. 이야기가 다루지 않는 영양소면 서버·계약(`MealStoryNutrient`·foods 열·`kdri`)부터 넓힌다.
  - **새 소품** — 계약 enum, `paper/icons.ts` `PROP_FOR`(빠지면 타입 오류), `paper/props.tsx` 를 같이 고친다.
  - **틀의 새 고정 문구** — `motion/fonts.ts` 글자 묶음에 넣는다. 안 넣으면 그 글자만 재생 중에 글꼴이 바뀐다.
- **`motion/` 폴더는 import 제한을 지켜야 MP4 도구가 묶는다.** `~/` 별칭·CSS·`@repo/shared` 훅을 쓰면 웹은 돌아가도 `tools/meal-motion` 렌더가 깨진다. 웹과 도구의 Remotion 버전(둘 다 4.0.541 고정)도 함께 올려야 한다. 그렇지 않으면 같은 장면 코드가 두 판의 Remotion 에서 달리 돌 수 있다(추론).
- **Remotion 재생기 함정(실제 브라우저에서 찾음).**
  - ① 재생 중의 `seekTo` 는 스스로 다시 튼다. 여기에 또 `play()` 하면 영상이 끝나 멈출 때 처음부터 다시 돈다. 그래서 멈춰 있을 때만 `play()` 한다.
  - ② 소리 없는 영상도 음소거가 아니면 오디오 시작 허락을 기다려, 첫 프레임에 멈춘 채 '재생 중'이 된다. 그래서 `initiallyMuted` 를 쓴다.
  - ③ 웹 재생기는 페이지 CSS(줄 높이)를 물려받아 MP4 와 달라진다. 그래서 영상 맨 바깥에서 글 기본값을 고정한다.
  - ④ 숨은 탭에서도 타이머로 계속 돈다. 그래서 `visibilitychange` 로 멈춘다.
  - ⑤ `<Freeze frame>` 으로 한 장 시안을 세울 때 컴포지션 길이가 1이면 프레임이 0으로 잘린다.
- **작은 화면 글씨.** 실제 휴대폰 브라우저는 화면이 낮아 영상이 높이에 맞춰 줄어든다(360×640 에서 폭 280~321px, 1080 의 0.26~0.3배). 기기 화면 크기(390×844)로 캡처하면 실제보다 크게 보인다. 360×640·390×664 로 본다. 틀은 `TYPE` 하한 아래로 글을 줄이지 않는다.
- **글꼴은 외부 CDN 두 곳이다.** jsDelivr 와 Google Fonts 의 분할판이라, 미리 받지 않으면 표지 제목이 0.6초 넘게 다른 글꼴이다. 웹은 최대 1.5초 기다린 뒤 재생한다. CDN 이 막힌 환경이면 대체 글꼴로 돌고, 늦게 오면 재생 중에 바뀐다(코드 읽기).
- **식단 테마의 `.meal-app :focus-visible` 이 재생기 틀에 큰 네모를 그렸다.** 재생기 틀은 키를 받으려고 포커스를 갖는다. 그래서 `.meal-app .msp:focus-visible { outline: none }` 로 껐다.
- **원고 폴더는 실행 위치에 묶인다.** `MEAL_STORY_DIR` 이 없으면 `process.cwd()/content/meal-stories` 다. 폴더를 못 읽으면 `refresh` 가 조용히 빈 목록을 만든다. 오류 로그가 없고 화면은 '아직 올라온 이야기가 없어요'다(코드 읽기). 운영 pm2 가 `apps/friendly` 에서 떠야 한다. [menu-board](menu-board.md) 의 같은 함정과 같은 결이다.
- **형식이 틀린 원고는 그 편만 조용히 사라진다.** 경고 로그 `[meal-story] 원고를 읽지 못함 — 건너뜀` 만 남긴다. 배포 전에 `check:meal-stories` 를 돌린다.
- **공유 미리보기는 nginx `location ^~ /meal/stories` 가 있어야 산다.** 없어도 SPA 는 정적 index.html 로 뜨고 미리보기만 기본값이다. 사진은 `/api/v1/meal-stories/<slug>/images/` 라 기존 `/api` 프록시를 탄다.
- **토마토·자두의 빌린 영양은 배포만으로는 안 고쳐진다.** 배포 뒤 `pnpm --filter friendly load:food-catalog --source=raw` 를 한 번 돌린다(로컬 운영 사본: 갱신 2·건너뜀 865). `SELECT kcalPer100g, nutritionFrom FROM food_items WHERE name='토마토'` 가 `21|` 이면 된 것이다.
- **POST `/meal-stories/:slug/food` 에는 라우트 한도가 없다(코드 읽기).** `config.rateLimit` 이 없어 전역 분당 1,000 만 걸린다. 누를 때마다 `food_items` 행을 update 하니, 로그인 사용자 하나가 연타하면 SQLite 쓰기가 그만큼 일어난다. 원고 숫자가 바뀐 뒤 다시 누르면 기존 음식 행이 새 값으로 덮인다. 그 행을 쓴 지난 기록에 이 변경이 번지는지는 식단 기록이 영양을 저장하는 방식에 달렸다(확인하지 않음 — [meal](meal.md)).
- **로그인한 상태로 영상을 열면, 내 값이 없는 편에서도 통계 조회가 두 번 나간다(코드 읽기).** [MealStoryMotion](../../apps/web/src/routes/meal-story/MealStoryMotion.tsx) 은 원고에 `my` 숫자가 있는지 보지 않고 `useStoryMyStats()`(최근 14일 + 직전 14일)를 부른다. 열량 편(`kcal-half-konjac-noodles`)처럼 '내 기록' 숫자가 없는 편에도 요청이 나간다. 홈 줄은 이을 이야기가 있을 때만 직전 기간을 부른다.
- **음식 표준데이터 값은 2012~2017 조사다.** 덧말('식약처가 식당 음식을 모아 분석한 값이에요. 가게와 양에 따라 달라요')로 밝힌다. 고른 메뉴가 높은 것만·낮은 것만이 아닌지는 사람이 검수할 거리다.
- **레시피 그램은 조리 전 무게다. 단 지은 밥과 소금이 든 마른 면은 조리된 것으로 적는다.** 스파게티 건면 80g 은 마른 무게다. 소면은 마른 50g 으로 세면 나트륨이 1,080mg, 삶은 145g 으로 세면 541mg 이다. 열량은 어느 쪽으로 세도 같다.
- **제목은 낱말 사이에서만 줄이 바뀐다.** '하루 비타민 C, 이만큼'은 '하루 비타민 / C, 이만큼'으로 갈려 '비타민 C, 하루 이만큼'으로 고쳤다.
- **`tools/meal-motion` 은 friendly 설치에 기대는 곳이 있다.** `sheet.mjs` 가 `apps/friendly` 의 sharp 를 빌린다. 그래서 워크스페이스 `pnpm install` 이 안 된 컴퓨터에서는 격자 만들기가 실패한다(코드 읽기). 처음 렌더할 때 헤드리스 크롬(약 100MB)을 `node_modules/.remotion` 에 받는다. 이미 있는 것을 쓰려면 `--browser-executable` 을 준다.
- **Remotion 은 개인 사용 무료 라이선스 전제다([PLAN](../../docs/PLAN-meal-story.md) 결정 표).** 운영 주체가 바뀌면 라이선스 조건을 다시 봐야 한다(추론 — 저장소에 라이선스 확인 기록은 없다).
- **⚠️ 문서·주석이 코드보다 낡은 곳(미수정, 2026-11-15 위키 점검).**
  - [PLAN-meal-story.md](../../docs/PLAN-meal-story.md) 28행은 "이웃 장은 전환 14프레임만큼 겹친다"인데, `timeline.ts` `TRANSITION_FRAMES` 는 처음(`281318cc`)부터 12다.
  - [mealPaths.ts](../../apps/web/src/routes/meal/mealPaths.ts) 17~18행 "이야기 한 편과 레시피는 … 식단 셸 밖에서 띄운다(App 의 /meal/stories/:slug/* 가 /meal/* 보다 먼저 잡힌다)"는 낡았다. 11-10 에 App 의 따로 있던 라우트를 없앴고, 로그인하면 셸 안에서 뜬다.
  - [MealStoriesPage.tsx](../../apps/web/src/routes/meal-story/MealStoriesPage.tsx) 14행 "이야기 한 편은 전체 화면 재생기(MealStoryApp)로 나간다"도 같은 이유로 낡았다(로그인하면 `MealStoryPlayerPage`).
  - [palette.ts](../../apps/web/src/routes/meal-story/motion/paper/palette.ts) 머리 주석의 주제색 목록에 열량(청록)이 없다.
  - [data-sources.md](../../docs/data-sources.md) 92행은 `build:meal-stories` 가 "이 두 CSV(15100065·15100066)"를 쓴다고 하는데, 11-13 부터 음식 `mfds-nutrition.csv`(15100070)도 읽는다. [build-meal-stories.ts](../../apps/friendly/scripts/build-meal-stories.ts) 머리 주석 4~5행도 두 CSV 만 적는다(9~10행은 음식을 말한다).
  - [PLAN-mobile-meal.md](../../docs/PLAN-mobile-meal.md) 100~104행은 "장면 틀 8종"·"움직임은 웹이 CSS 라"인데, 지금은 9종이고 기본 보기가 Remotion 영상이다.
- **`resolveMealStory` 의 출처 대체값이 음식 데이터를 모른다(코드 읽기, 영향 작음).** `foods.json` 에 그 식품이 없을 때 출처를 `ref/group.db === 'processed' ? 'mfds-processed' : 'mfds-raw'` 로 둔다. 그래서 `ref.db: "dish"` 식품도 `mfds-raw` 로 표시된다. 이 경우 issues 가 함께 잡혀 점검이 막으므로 게시본에는 나가지 않는다.
- **`meal-story.foods.ts` 가 일상지도 서비스 파일에서 CSV 해독을 가져온다.** `decodeLifeCsv`(life-map-master.service)다. 표준데이터 해독이 두 모듈의 공통 몫인데 `lib/` 가 아니라 다른 도메인 서비스에 있어, 일상지도 쪽을 고치면 이 빌더가 따라 바뀐다(코드 읽기).

## Sources [coverage: high — 108 sources]

### 문서
- [docs/PLAN-meal-story.md](../../docs/PLAN-meal-story.md) — *2026-11-09~11-13 결정 표·설계·한 일 1~18·남은 일(편마다 게시 조건)*
- [docs/meal-story-authoring.md](../../docs/meal-story-authoring.md) — *만드는 절차 — 파일·원고 형식·숫자 가리키기·재료·레시피·장면 틀 9종·영상 한도·그림체·소품·말투·절차 11단계·화면*
- [CLAUDE.md](../../CLAUDE.md) — *건강식단 단락(build·check, `tools/meal-motion` 은 워크스페이스 밖)*
- [docs/deploy-friendly.md](../../docs/deploy-friendly.md) — *마이그레이션 없음·nginx `location ^~ /meal/stories`·토마토 재적재 확인 SQL*
- [docs/data-sources.md](../../docs/data-sources.md) — *표준데이터 CSV 3종의 받는 곳(빌더 설명은 두 CSV 로 낡음)*
- [docs/PLAN-mobile-meal.md](../../docs/PLAN-mobile-meal.md) — *앱 재생기 후보(같은 API·공용 훅, 메뉴 없음)*
- [docs/api/endpoints.md](../../docs/api/endpoints.md) — *`meal-story` 4줄(인증·한도)*
- [docs/api/openapi.json](../../docs/api/openapi.json) — *계약 변경마다 재생성*

### friendly — meal-story 모듈
- [apps/friendly/src/modules/meal-story/meal-story.route.ts](../../apps/friendly/src/modules/meal-story/meal-story.route.ts) — *API 4개, 선택 인증 초안 가름, 사진 캐시, 레시피 음식 409/404*
- [apps/friendly/src/modules/meal-story/meal-story-preview.ts](../../apps/friendly/src/modules/meal-story/meal-story-preview.ts) — *공유 미리보기 OG 3경로, 초안은 기본값*
- [apps/friendly/src/modules/meal-story/meal-story.instance.ts](../../apps/friendly/src/modules/meal-story/meal-story.instance.ts) — *저장소 싱글턴(테스트 0ms)*
- [apps/friendly/src/modules/meal-story/meal-story.store.ts](../../apps/friendly/src/modules/meal-story/meal-story.store.ts) — *`MealStoryStore`·`loadMealStoryDir`·`mealStoryDir`, mtime 캐시*
- [apps/friendly/src/modules/meal-story/meal-story.script.ts](../../apps/friendly/src/modules/meal-story/meal-story.script.ts) — *원고·foods.json zod, 가리킴 7종, 글자 수*
- [apps/friendly/src/modules/meal-story/meal-story.resolve.ts](../../apps/friendly/src/modules/meal-story/meal-story.resolve.ts) — *`resolveMealStory` — 숫자·출처·equivalent·fraction·issues*
- [apps/friendly/src/modules/meal-story/meal-story.defs.ts](../../apps/friendly/src/modules/meal-story/meal-story.defs.ts) — *영양 이름·레시피 표 8줄·그림체 장면·내장 출처·소금 환산·`fractionOf`·`kdriFigure`*
- [apps/friendly/src/modules/meal-story/meal-story.foods.ts](../../apps/friendly/src/modules/meal-story/meal-story.foods.ts) — *표준데이터 → foods.json, 묶음 중앙값, `dishProblem`, `MEAL_STORY_PER100_KEYS`*
- [apps/friendly/src/modules/meal-story/meal-story.check.ts](../../apps/friendly/src/modules/meal-story/meal-story.check.ts) — *말투·글 속 숫자·게시 조건·사진·영상 한도·머리말 겹침·사람 확인 목록*
- [apps/friendly/src/modules/meal-story/meal-story.service.ts](../../apps/friendly/src/modules/meal-story/meal-story.service.ts) — *`ensureMealStoryFood`·`mealStoryFoodIds`·`recipeFoodValues`*
- [apps/friendly/src/modules/meal-story/meal-story.content.test.ts](../../apps/friendly/src/modules/meal-story/meal-story.content.test.ts) — *저장소의 모든 원고 점검 + foods.json 값 이름 가드*
- [apps/friendly/src/modules/meal-story/meal-story.resolve.test.ts](../../apps/friendly/src/modules/meal-story/meal-story.resolve.test.ts) — *해석·환산·N분의 1/N배·성별 기준·dish*
- [apps/friendly/src/modules/meal-story/meal-story.route.test.ts](../../apps/friendly/src/modules/meal-story/meal-story.route.test.ts) — *초안 가림·사진·음식 맞추기·OG*

### friendly — 스크립트·배선·이웃 모듈
- [apps/friendly/scripts/build-meal-stories.ts](../../apps/friendly/scripts/build-meal-stories.ts) — *foods.json·사진 1,440px·`--find`*
- [apps/friendly/scripts/check-meal-stories.ts](../../apps/friendly/scripts/check-meal-stories.ts) — *점검 전 과정, 끝 코드 1*
- [apps/friendly/scripts/export-meal-story.ts](../../apps/friendly/scripts/export-meal-story.ts) — *MP4 입력 JSON, `--mine`·`--standard`·`--change`·`--dark`*
- [apps/friendly/package.json](../../apps/friendly/package.json) — *스크립트 3종*
- [apps/friendly/src/app.ts](../../apps/friendly/src/app.ts) — *`registerMealStoryPreview` 등록*
- [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — *`mealStoryRead` 120·`mealStoryImage` 300, 전역 1,000*
- [apps/friendly/src/modules/meal-nutrition/kdri.ts](../../apps/friendly/src/modules/meal-nutrition/kdri.ts) — *섭취기준 표(`nutrientReference`)*
- [apps/friendly/src/modules/meal-nutrition/meal-nutrition.defs.ts](../../apps/friendly/src/modules/meal-nutrition/meal-nutrition.defs.ts) — *주의 문구(`NUTRIENT_DEFS[].caution`)*
- [apps/friendly/src/modules/food/food-import.service.ts](../../apps/friendly/src/modules/food/food-import.service.ts) — *`ac3e0066` 빌린 영양은 직접 값에 물러난다*
- [apps/friendly/src/modules/food/food-nutrition.service.ts](../../apps/friendly/src/modules/food/food-nutrition.service.ts) — *`ac3e0066` 100g당 직접 값 행은 빌려 오지 않는다*
- [apps/friendly/src/modules/life-map/life-map-master.service.ts](../../apps/friendly/src/modules/life-map/life-map-master.service.ts) — *`decodeLifeCsv`(빌더가 빌려 씀)*
- [.gitignore](../../.gitignore) — *`content/meal-stories/*/originals/` git 밖*

### 원고
- [apps/friendly/content/meal-stories/](../../apps/friendly/content/meal-stories/) — *편 폴더(story.json·foods.json)*
- [apps/friendly/content/meal-stories/sodium-tomato-pasta/story.json](../../apps/friendly/content/meal-stories/sodium-tomato-pasta/story.json) — *첫 편(나트륨, 13장)*
- [apps/friendly/content/meal-stories/fiber-mushroom-bibimbap/story.json](../../apps/friendly/content/meal-stories/fiber-mushroom-bibimbap/story.json) — *둘째 편(식이섬유, 양조간장 manual)*
- [apps/friendly/content/meal-stories/calcium-anchovy-kale-rice/story.json](../../apps/friendly/content/meal-stories/calcium-anchovy-kale-rice/story.json) — *셋째 편(칼슘, manual 넷)*
- [apps/friendly/content/meal-stories/vitamin-c-paprika-salad/story.json](../../apps/friendly/content/meal-stories/vitamin-c-paprika-salad/story.json) — *넷째 편(비타민 C, '약 2배')*
- [apps/friendly/content/meal-stories/kcal-half-konjac-noodles/story.json](../../apps/friendly/content/meal-stories/kcal-half-konjac-noodles/story.json) — *다섯째 편(국수 열량, 줄 세우기, 두부면)*
- [apps/friendly/content/meal-stories/sodium-eating-out-menus/story.json](../../apps/friendly/content/meal-stories/sodium-eating-out-menus/story.json) — *여섯째 편(외식 나트륨, chalk, 레시피 없음)*

### 계약·공용
- [packages/api-contract/src/schemas/meal-story.ts](../../packages/api-contract/src/schemas/meal-story.ts) — *`MealStory`·장면 9종·`MealStoryIcon` 79·`MealStoryLook`·`MealStoryListItem.kicker/recipeFoodId`*
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — *`Routes.MealStory`*
- [packages/shared/src/api/meal-story.api.ts](../../packages/shared/src/api/meal-story.api.ts) — *`mealStoryApi`*
- [packages/shared/src/hooks/useMealStory.ts](../../packages/shared/src/hooks/useMealStory.ts) — *훅 3개, audience 키, `recipeFoodId` 캐시 적기*

### 웹 — 식단 쪽 연결
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx) — *`/meal/*` → `MealEntry`*
- [apps/web/src/routes/meal/MealEntry.tsx](../../apps/web/src/routes/meal/MealEntry.tsx) — *로그인 가름*
- [apps/web/src/routes/meal/MealApp.tsx](../../apps/web/src/routes/meal/MealApp.tsx) — *셸 안 stories 라우트 3개(lazy)*
- [apps/web/src/routes/meal/mealPaths.ts](../../apps/web/src/routes/meal/mealPaths.ts) — *`MEAL_STORY_PATH`, 구역 목록(낡은 주석)*
- [apps/web/src/routes/meal/MealShell.tsx](../../apps/web/src/routes/meal/MealShell.tsx) — *목록에서 홈 켜짐*
- [apps/web/src/routes/meal/MealHomePage.tsx](../../apps/web/src/routes/meal/MealHomePage.tsx) — *`HomeStory` 홈 한 줄·맞는 이야기 N편 더·직전 2주*
- [apps/web/src/routes/meal/MealStoryLink.tsx](../../apps/web/src/routes/meal/MealStoryLink.tsx) — *`NutrientStoryLink`·`RecipeStoryLink`*
- [apps/web/src/routes/meal/mealStoryMatch.ts](../../apps/web/src/routes/meal/mealStoryMatch.ts) — *잇는 규칙*
- [apps/web/src/routes/meal/mealNutrientChange.ts](../../apps/web/src/routes/meal/mealNutrientChange.ts) — *변화 규칙(10%·열량 15%)*
- [apps/web/src/routes/meal/MealNutritionTab.tsx](../../apps/web/src/routes/meal/MealNutritionTab.tsx) — *영양 탭 '줄이는/채우는 법 보기'*
- [apps/web/src/routes/meal/MealStatsNutrients.tsx](../../apps/web/src/routes/meal/MealStatsNutrients.tsx) — *통계 영양소 흐름 링크*
- [apps/web/src/routes/meal/MealDetailPage.tsx](../../apps/web/src/routes/meal/MealDetailPage.tsx) — *기록 상세 → 이야기*
- [apps/web/src/routes/meal/MealNutrientLine.tsx](../../apps/web/src/routes/meal/MealNutrientLine.tsx) — *`MealNutrientChip.label`('기준 안')*
- [apps/web/src/routes/meal/mealDraftStart.ts](../../apps/web/src/routes/meal/mealDraftStart.ts) — *`prepareMealEntry`(이 레시피로 기록 → draft)*
- [apps/web/src/routes/meal/mealFont.ts](../../apps/web/src/routes/meal/mealFont.ts) — *식단·스토리 공용 글꼴 훅*
- [apps/web/src/routes/meal/mealTheme.css](../../apps/web/src/routes/meal/mealTheme.css) — *`.meal-story-card*`*
- [apps/web/src/components/PublicSidebar.tsx](../../apps/web/src/components/PublicSidebar.tsx) — *'식단' `guestTo`*
- [apps/web/src/components/PublicTopBar.tsx](../../apps/web/src/components/PublicTopBar.tsx) — *'식단' `guestTo`*
- [apps/web/src/routes/LoginPage.tsx](../../apps/web/src/routes/LoginPage.tsx) — *`?next=`(`safeNextPath`)*
- [apps/web/package.json](../../apps/web/package.json) — *Remotion 3종 4.0.541 고정*

### 웹 — 건강식단 화면
- [apps/web/src/routes/meal-story/MealStoryApp.tsx](../../apps/web/src/routes/meal-story/MealStoryApp.tsx) — *로그인 전 앱, 셸 안 이야기·레시피 페이지*
- [apps/web/src/routes/meal-story/MealStoriesPage.tsx](../../apps/web/src/routes/meal-story/MealStoriesPage.tsx) — *식단 안 목록(내 기록 표시·앞에)*
- [apps/web/src/routes/meal-story/MealStoryList.tsx](../../apps/web/src/routes/meal-story/MealStoryList.tsx) — *공개 목록*
- [apps/web/src/routes/meal-story/MealStoryCards.tsx](../../apps/web/src/routes/meal-story/MealStoryCards.tsx) — *카드 격자(머리말 이름)*
- [apps/web/src/routes/meal-story/mealStoryTopic.ts](../../apps/web/src/routes/meal-story/mealStoryTopic.ts) — *주제 이름·카드 이름·소개 문구*
- [apps/web/src/routes/meal-story/MealStoryPlayer.tsx](../../apps/web/src/routes/meal-story/MealStoryPlayer.tsx) — *두 보기·글로 보기 재생기*
- [apps/web/src/routes/meal-story/MealStoryMotion.tsx](../../apps/web/src/routes/meal-story/MealStoryMotion.tsx) — *영상 재생기(조작·휴대폰 배치·숨은 탭·마무리 단추)*
- [apps/web/src/routes/meal-story/MealStoryScenes.tsx](../../apps/web/src/routes/meal-story/MealStoryScenes.tsx) — *글로 보기 장면 틀 9종*
- [apps/web/src/routes/meal-story/MealStoryFigure.tsx](../../apps/web/src/routes/meal-story/MealStoryFigure.tsx) — *굴러가는 숫자·내 값·소금 줄*
- [apps/web/src/routes/meal-story/MealStoryRecipe.tsx](../../apps/web/src/routes/meal-story/MealStoryRecipe.tsx) — *레시피 전체 보기*
- [apps/web/src/routes/meal-story/MealStoryAside.tsx](../../apps/web/src/routes/meal-story/MealStoryAside.tsx) — *이야기 옆 칸(64rem~)*
- [apps/web/src/routes/meal-story/mealStoryActions.tsx](../../apps/web/src/routes/meal-story/mealStoryActions.tsx) — *기록·공유 단추*
- [apps/web/src/routes/meal-story/mealStoryFont.ts](../../apps/web/src/routes/meal-story/mealStoryFont.ts) — *글꼴 미리 받기(1.5초)*
- [apps/web/src/routes/meal-story/mealStoryMine.ts](../../apps/web/src/routes/meal-story/mealStoryMine.ts) — *내 값·'기준 안'·변화*
- [apps/web/src/routes/meal-story/mealStoryNav.ts](../../apps/web/src/routes/meal-story/mealStoryNav.ts) — *손짓·주소·`useLeaveStory`·`STORY_ASIDE_QUERY`*
- [apps/web/src/routes/meal-story/mealStory.css](../../apps/web/src/routes/meal-story/mealStory.css) — *글로 보기 CSS 움직임·셸 안 배치*
- [apps/web/src/routes/meal-story/MealStory.test.tsx](../../apps/web/src/routes/meal-story/MealStory.test.tsx) — *가짜 재생기 테스트 1,029줄*

### 웹 — 영상(motion/)
- [apps/web/src/routes/meal-story/motion/StoryVideo.tsx](../../apps/web/src/routes/meal-story/motion/StoryVideo.tsx) — *장면 잇기·전환·그림체 고르기*
- [apps/web/src/routes/meal-story/motion/timeline.ts](../../apps/web/src/routes/meal-story/motion/timeline.ts) — *시각표·장면 길이·`TRANSITION_FRAMES` 12·`isSaltSpoonScene`*
- [apps/web/src/routes/meal-story/motion/theme.ts](../../apps/web/src/routes/meal-story/motion/theme.ts) — *1080×1920·30fps·`TEMPO`·`TYPE`·import 규칙*
- [apps/web/src/routes/meal-story/motion/anim.ts](../../apps/web/src/routes/meal-story/motion/anim.ts) — *`useClock`·`prog`·`pop`*
- [apps/web/src/routes/meal-story/motion/layout.ts](../../apps/web/src/routes/meal-story/motion/layout.ts) — *자리 계산·`ownStandardText`·`fractionText`*
- [apps/web/src/routes/meal-story/motion/ChapterStat.tsx](../../apps/web/src/routes/meal-story/motion/ChapterStat.tsx) — *소금 숟가락·일반 숫자*
- [apps/web/src/routes/meal-story/motion/ChapterLineup.tsx](../../apps/web/src/routes/meal-story/motion/ChapterLineup.tsx) — *줄 세우기 영상*
- [apps/web/src/routes/meal-story/motion/ChapterOutro.tsx](../../apps/web/src/routes/meal-story/motion/ChapterOutro.tsx) — *마무리·주제별 `PALS`*
- [apps/web/src/routes/meal-story/motion/storyProps.ts](../../apps/web/src/routes/meal-story/motion/storyProps.ts) — *그 편의 소품 고르기*
- [apps/web/src/routes/meal-story/motion/fonts.ts](../../apps/web/src/routes/meal-story/motion/fonts.ts) — *글꼴 CDN·받을 글자*
- [apps/web/src/routes/meal-story/motion/storyFixture.ts](../../apps/web/src/routes/meal-story/motion/storyFixture.ts) — *변형 원고(종이·칠판)*
- [apps/web/src/routes/meal-story/motion/chapters.test.tsx](../../apps/web/src/routes/meal-story/motion/chapters.test.tsx) — *모든 장면·프레임·보는 사람 그리기 테스트*
- [apps/web/src/routes/meal-story/motion/paper/torn.ts](../../apps/web/src/routes/meal-story/motion/paper/torn.ts) — *찢긴 가장자리(미리 계산)*
- [apps/web/src/routes/meal-story/motion/paper/kit.tsx](../../apps/web/src/routes/meal-story/motion/paper/kit.tsx) — *종이 도구*
- [apps/web/src/routes/meal-story/motion/paper/palette.ts](../../apps/web/src/routes/meal-story/motion/paper/palette.ts) — *`TOPIC_STAGE`·`DARK`*
- [apps/web/src/routes/meal-story/motion/paper/props.tsx](../../apps/web/src/routes/meal-story/motion/paper/props.tsx) — *소품 79종*
- [apps/web/src/routes/meal-story/motion/paper/icons.ts](../../apps/web/src/routes/meal-story/motion/paper/icons.ts) — *`PROP_FOR`*
- [apps/web/src/routes/meal-story/motion/chalk/kit.tsx](../../apps/web/src/routes/meal-story/motion/chalk/kit.tsx) — *칠판 그림 도구*
- [apps/web/src/routes/meal-story/motion/chalk/chalkLayout.ts](../../apps/web/src/routes/meal-story/motion/chalk/chalkLayout.ts) — *칠판 색·자리·`chalkDraws`*
- [apps/web/src/routes/meal-story/motion/chalk/index.tsx](../../apps/web/src/routes/meal-story/motion/chalk/index.tsx) — *`ChalkChapter`*

### MP4 도구(워크스페이스 밖)
- [tools/meal-motion/package.json](../../tools/meal-motion/package.json) — *npm·Remotion 4.0.541·스크립트 4*
- [tools/meal-motion/remotion.config.ts](../../tools/meal-motion/remotion.config.ts) — *`resolve.modules` 한 벌*
- [tools/meal-motion/src/index.ts](../../tools/meal-motion/src/index.ts) — *글꼴 `delayRender`*
- [tools/meal-motion/src/Root.tsx](../../tools/meal-motion/src/Root.tsx) — *컴포지션 4개*
- [tools/meal-motion/src/PropsSheet.tsx](../../tools/meal-motion/src/PropsSheet.tsx) — *소품 한 장(아홉 칸)*
- [tools/meal-motion/sheet.mjs](../../tools/meal-motion/sheet.mjs) — *프레임 격자, friendly sharp 빌림*
- [pnpm-workspace.yaml](../../pnpm-workspace.yaml) — *`apps/*`·`packages/*` 만(도구는 밖)*
