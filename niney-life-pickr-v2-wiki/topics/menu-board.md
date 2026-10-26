---
topic: menu-board
last_compiled: 2026-10-26
sources_count: 53
status: active
aliases: [menu-board, 메뉴판 읽기, 메뉴판 사진, 메뉴판 사진 읽기, 메뉴판 이미지로 보기, placeDetail.menuImages, menuImages, MenuBoardService, MenuBoardError, prepareMenuBoardImage, MENU_BOARD_IMAGE_SIDE, MENU_BOARD_PROMPT, MENU_BOARD_PROMPT_VERSION, 프롬프트 v2, 크기별 가격, 규칙 보강, parseMenuBoardItems, MenuBoardItem, MenuBoardReadResult, MENU_BOARD_MAX_UPLOAD_MB, Routes.MenuBoard, /admin/menu-board, NaverMenuBoardReader, needsMenuBoardRead, NAVER_MENU_BOARD_MAX_READS, readMenuBoardsAfterCrawl, menu-board-read, buildMenuBoardMenus, carryMenuBoardReads, toPublicMenuBoard, menuMatchName, menuBoardPriceCheck, menuBoardImages, menuBoardMenus, menuUpdatedOn, NaverMenuBoardImage, NaverMenuBoardRead, promptVersion, MenuBoardMenu, MenuBoardMenuOrigin, origin, 구분값, 사진에만 있는 메뉴, registered, priceCheck, RestaurantPublicMenuBoard, addedMenus, newerPrices, findNaverMenuBoardState, saveNaverMenuBoardReads, findPreviousNaverSnapshot, extractNaverMenuBoardImages, extractNaverPlaceMenus, scoreBoard, pairTruth, nameScore, normalizeName, headName, parsePrice, summarize, MATCH 0.75, 표지 오인, 검수 정답, golden/menu-boards, eval:menu-boards, eval-report.json, collect:menu-boards, read:naver-menu-boards, probe:naver-menu-boards, data/menu-boards, OLLAMA_MENU_BOARD_MODEL, kimi-k3, gemma4:31b, PaddleOCR, OCR 비교, menu-board-ocr-probe, apps/smartly, smartly, dev:smartly, AI 허브 71553, 관광 음식메뉴판, 메뉴판 AI, AdminMenuBoardPage, ReadTab, EvalTab, ZoomableImage, AdminMenuBoardSection, MenuBoardSection, useReadMenuBoard, useMenuBoardSamples, useMenuBoardEvalReport, menuBoardApi]
---

# menu-board — 메뉴판 사진 읽기(kimi-k3 + 규칙 프롬프트, OCR 없이) · 네이버 메뉴판 사진 자동 읽기와 등록 메뉴 짝짓기

**2026-10-10 신규 토픽 — 메뉴판 사진을 비전 LLM 한 번으로 메뉴·가격·설명 목록으로 읽는 friendly `menu-board` 모듈(`4597294b`), 어드민 '메뉴판 읽기' 화면(`9e4c598c`), 네이버 '메뉴판 이미지로 보기' 사진 수집·크롤 직후 자동 읽기·등록 메뉴와 짝짓기(`0408f2f2`), 공개 맛집 메뉴 탭 노출(`ee70bc2d`), 크기별 가격 프롬프트 v2(`faa12818`).** 같은 날 오전에 AI 허브 관광 음식메뉴판(71553) 모델을 돌리는 Python 체험 서버 `apps/smartly`(`96df0e70`)와 어드민 체험 페이지 `/admin/smartly-test`(`448b4cd4`)가 먼저 들어왔다. 그 뒤 통사진 비교([menu-board-ocr-probe.md](../../docs/menu-board-ocr-probe.md) — OCR 3종·ollama cloud 비전 모델 9개·Claude·Codex, 검수 정답 20장)에서 kimi-k3 + 규칙 프롬프트가 F1 99.8% 로 골라졌고, AI 허브 모델은 쓸 곳이 없어 저녁에 서버째 폐기됐다(`63c7658a`, Key Decisions). 이번 라운드 이후 이 모듈을 고친 커밋은 없다(2026-10-26 기준, `faa12818` 가 마지막). 앱(`apps/mobile`)은 아직 메뉴판 필드를 쓰지 않는다. 화면 세부는 [web](web.md), 크롤 쪽 수집 세부는 [crawl](crawl.md), purpose 설정은 [ai](ai.md).

## Purpose [coverage: high — 8 sources]

가게가 올린 **메뉴판 사진**(메뉴 안내판·메뉴책 사진 — 메뉴 항목마다 붙은 음식 사진과 다르다)을 읽어 메뉴 목록으로 바꾸는 도메인이다. 쓰임은 둘이다.

1. **어드민 테스트 '메뉴판 읽기'**(`/admin/menu-board`) — 사진 한 장(업로드·끌어다 놓기·수집 샘플)을 읽어 메뉴·가격·설명 표로 보고, 회귀 평가 리포트(F1·정밀도·재현율·이름 정확·가격 일치·지어냄·표지 오인)를 본다. 모델·프롬프트를 바꿀 때의 확인대다.
2. **네이버 맛집 메뉴판 사진 자동 읽기** — 네이버 플레이스의 '메뉴판 이미지로 보기' 사진(`placeDetail.menuImages`)을 크롤이 모으고, 크롤 직후 백그라운드에서 새 사진만 읽어 **등록 메뉴와 짝짓는다**. 결과의 구분값 `origin` 이 'menu-board'(사진에만 있는 메뉴) / 'registered'(등록 메뉴와 같은 메뉴)다. 공개 맛집 상세 메뉴 탭은 그중 "사진에서 찾은 등록 메뉴에 없는 메뉴"와 "사진이 등록 메뉴 업데이트보다 최신이면서 가격이 다른 메뉴"만 보인다.

넣은 이유(`0408f2f2` 커밋 본문): 크롤러가 메뉴판 사진을 버리고 있었는데, 프리뷰(10곳·33장)에서 등록 메뉴 167개 대 사진에서 읽은 383개, **사진에만 있는 메뉴 264개**였다 — 주류·음료·사리·세트처럼 사장님이 네이버 메뉴에 올리지 않은 것들이다.

사진 읽기는 OCR 없이 비전 LLM 호출 한 번(purpose `menu-board`, 기본 `kimi-k3`)이다. 판단 근거는 [menu-board-ocr-probe.md](../../docs/menu-board-ocr-probe.md): 로컬 OCR 엔진(Paddle·EasyOCR·Surya)은 글자는 읽지만 메뉴명·설명·가격·가게 소개를 구분하지 못해 F1 25~64%, 메뉴 없는 사진 4장에서도 문구 21~37개를 메뉴로 잡았다. 비전 LLM 상위권은 표지 오인 0.

## Architecture [coverage: high — 22 sources]

### 읽기 한 번 — `MenuBoardService.read(buffer, { model? })`

[menu-board.service.ts](../../apps/friendly/src/modules/menu-board/menu-board.service.ts). 어드민 라우트·크롤 뒤 자동 읽기·`eval:menu-boards`·`probe:naver-menu-boards` 가 모두 이 한 함수를 부른다.

1. **설정** — `aiConfig.getResolved('ollama-cloud', 'menu-board')`. 모델은 `opts.model`(평가 스크립트의 모델 비교용) → 용도 기본 모델(`resolved.defaultModel` — DB row 또는 env `OLLAMA_MENU_BOARD_MODEL`, 코드 기본값 `kimi-k3`). 둘 다 없으면 `MenuBoardError('no_provider')`. 키는 다른 용도처럼 chat 계정 키를 상속한다([ai](ai.md)).
2. **사진 처리** — `prepareMenuBoardImage`: sharp `rotate()`(EXIF 방향) → `resize({ width: 2000, height: 2000, fit: 'inside' })` → `flatten({ background: '#ffffff' })`(투명 배경 흰색) → JPEG 품질 90. `withoutEnlargement` 를 주지 않아 **작은 사진은 긴 변 2,000px 로 키운다**(`MENU_BOARD_IMAGE_SIDE`). 디코드 실패는 `invalid_image`.
3. **호출** — `adapterCache.get(resolved).complete({ prompt: MENU_BOARD_PROMPT, model, images: [base64], temperature: 0, think: thinkOptionForModel(model) })`. 사진 + 규칙 프롬프트 한 번이고 OCR 글자 힌트는 넣지 않는다. 생각 모드는 끈다(`thinkOptionForModel` — gpt-oss 만 'low', 나머지 false). 어드민 추론 설정(`thinking`)은 읽지 않는다. 호출 예외는 `llm_failed`.
4. **파싱** — [menu-board.prompt.ts](../../apps/friendly/src/modules/menu-board/menu-board.prompt.ts) `parseMenuBoardItems(text)`: 후보를 `'</think>'` 뒤 → 코드 블록들 → 본문 전체 순으로 보고, 각 후보의 첫 `{` ~ 마지막 `}` 를 `JSON.parse` 해 `{items:[…]}` 또는 루트 배열에서 항목을 꺼낸다. `name` 이 없는 항목은 버리고, `price`·`description` 은 문자열로 바꿔 trim(빈 값은 null). 아무 후보도 안 되면 `parse_failed`. `'</think>'` 처리는 생각을 꺼도 본문에 생각을 쓰고 그 뒤에 답을 붙이는 glm 계열 때문이다(비교 보고서).
5. **반환** — `MenuBoardReadResult{ model, items[{name, price, description}], durationMs, promptTokens, completionTokens, image{width, height}(모델에 넘긴 크기), rawText }`. 가격은 사진 표기 그대로('10,000'·'11.0'·'시가') 숫자로 바꾸지 않는다.

### 프롬프트 — `MENU_BOARD_PROMPT`, `MENU_BOARD_PROMPT_VERSION = 2`

한국어 지시 + 형식 `{"items": [{"name", "price" | null, "description" | null}]}` + 규칙 목록: 이름은 사진 글자 그대로(번역·교정 금지), 지어내지 말되 읽기 어려워도 빼먹지 말 것, 분류 제목·가게 소개는 항목 아님, 가격은 표기 그대로, 주류·음료·추가·사리도 가격과 함께 있으면 항목. 점수를 가른 **규칙 보강 두 줄**: ① 분류 제목 아래 'A'·'B'·'1번'처럼 혼자 뜻이 없는 이름은 분류 제목을 앞에 붙인다("LUNCH COURSE A") ② 코스·세트는 이름(위)과 1인 가격(아래)이 떨어져 있어도 한 항목, 딸린 구성 요리는 `price: null` 로 따로. 구성 요리를 "넣지 말라"고 하면 코스 사진에서 요리 이름이 사라지고(16 → 2개), 말이 없으면 코스 가격을 구성 요리마다 붙여서 지금 문장이 됐다(파일 주석·비교 보고서).

**v2(2026-10-10 `faa12818`)** — 크기·인분·용량별 가격은 **크기마다 한 항목**, 이름 뒤에 크기를 괄호로("꽃게탕 (중)" 45,000 / "꽃게탕 (대)" 65,000). v1 은 "여러 개면 첫 번째만"이었다(검수 정답이 첫 가격 기준이라 넣었던 규칙). 네이버 주막해물촌 사진의 꽃게탕·아구찜·해물찜·백골뱅이탕·세트·포장 간장게장이 첫 크기만 남은 것이 계기다.

### 네이버 메뉴판 사진 흐름 (`0408f2f2`·`faa12818`)

```
크롤(naver-place 어댑터)                    저장(RestaurantService)                      자동 읽기(fire-and-forget)
extractMenuBoardImages ─ menuBoardImages ─▶ upsertRestaurantFromCrawl                     readMenuBoardsAfterCrawl(placeId)
extractMenuUpdatedOn   ─ menuUpdatedOn   ─▶   carryMenuBoardReads(같은 주소 → 직전 read)    └ NaverMenuBoardReader.readPending
                                              menuBoardFields → buildMenuBoardMenus(짝)         ├ needsMenuBoardRead(안 읽음·옛 버전) ≤ 12장
                                                                                                ├ 사진 fetch(20초) → MenuBoardService.read
                                              saveNaverMenuBoardReads(placeId, reads) ◀──────────┘
                                                └ 최신 스냅샷에 주소로 붙이고 짝 재계산
공개 상세 getPublicDetail → toPublicMenuBoard(snapshot) → menuBoard{images, addedMenus, newerPrices}
```

- **수집** — [naver-place.playwright.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/naver-place.playwright.adapter.ts) `extractMenusWithFallback` 이 메뉴와 같은 홈 Apollo 상태에서 `extractMenuBoardImages`(`placeDetail.menuImages[].imageUrl`, http(s)만, `normalizeImageUrl` 로 https, 같은 주소 한 번, 올린 날짜 = 주소의 `pstatic.net/YYYYMMDD_` → 'YYYY-MM-DD', 못 읽으면 null)와 `extractMenuUpdatedOn`(`placeMenus.updatedAt` '26.07.16' 또는 ISO → 'YYYY-MM-DD')을 뽑는다. 필드가 응답에 없으면 `menuBoardImages: null` → 스냅샷에서 키를 뺀다. 크롤 `parsing_main` 로그가 "메뉴 N개 추출 · 메뉴판 사진 n장". 상세는 [crawl](crawl.md).
- **저장(크롤 upsert)** — [restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts) `upsertRestaurantFromCrawl`: 사진 키가 없으면(undefined) 직전 스냅샷의 `menuBoardImages` 를 그대로 두고, 있으면 `carryMenuBoardReads(새 목록, 직전 목록)` 로 **같은 주소의 읽기 결과를 이어받은 뒤** `buildMenuBoardMenus(메뉴, 사진)` 로 짝(`menuBoardMenus`)을 매번 다시 계산한다. 빈 배열은 "사진을 내렸다" 로 보고 그대로 비운다. 메뉴 0건 보호로 직전 메뉴를 쓰는 경우엔 그 메뉴로 짝짓는다. 직전 스냅샷 조회는 `findPreviousNaverMenus` 가 `findPreviousNaverSnapshot`(스냅샷 통째)으로 바뀌었다. 메뉴 백필(`backfill:naver-menus` → `updateNaverMenus(…, { menuBoardImages, menuUpdatedOn })`)도 같은 규칙.
- **자동 읽기** — [crawl.service.ts](../../apps/friendly/src/modules/crawl/crawl.service.ts) 가 네이버 크롤 성공 뒤(다이닝코드 자동 매칭 다음) `void this.readMenuBoardsAfterCrawl(placeId)` — `done` 을 막지 않는다. `pendingCount` 가 0 이면 run 도 안 만든다. 아니면 작업 로그 run(`feature: 'menu-board-read'`, `trigger: 'crawl'`, meta `pending`)을 열고 `readPending` 요약으로 `read` 스텝 로그 한 줄("메뉴판 사진 n장 읽음(전체 N장) · 사진에만 있는 메뉴 k개 · 실패 f장", 모델 없음이면 "메뉴판 읽기 모델·키가 없어 건너뜀" warn) + `finishRun`(전부 실패면 `failed`/`menu_board_read_failed`, 예외면 `menu_board_read_error`). 리더는 [plugins/crawl.ts](../../apps/friendly/src/plugins/crawl.ts) 가 조립해 `CrawlService` 7번째 인자로 주고, 테스트 환경(`isTest`)에선 null.
- **리더** — [menu-board.naver.ts](../../apps/friendly/src/modules/menu-board/menu-board.naver.ts) `NaverMenuBoardReader.readPending(placeId)`: `findNaverMenuBoardState` 로 등록 메뉴·사진 목록을 읽고(사진 목록을 모르면 null), `needsMenuBoardRead`(read 없음 또는 `read.promptVersion ?? 1` < 현재 버전)인 사진을 **가게당 12장**(`NAVER_MENU_BOARD_MAX_READS` — 로컬 23곳은 1~10장, 평균 3.2장)까지 **차례로** 받아(UA 고정, 20초 타임아웃) 읽는다. `no_provider` 면 남은 사진도 같은 결과라 바로 멈추고(`noProvider: true`), 다른 실패는 사진별로 `failed` 에 모은다. 읽은 결과 `{ items, model, readAt, promptVersion }` 를 `saveNaverMenuBoardReads` 가 **저장 직전 스냅샷에** 주소로 붙인다 — 읽는 동안 재크롤이 목록을 바꿨으면 목록에서 빠진 사진의 결과는 버린다. 반환 요약 `{ total, alreadyRead, read, failed[], added(origin='menu-board' 수), noProvider }`.

### 등록 메뉴와 짝짓기 — `buildMenuBoardMenus(registered, images)`

[menu-board.naver-match.ts](../../apps/friendly/src/modules/menu-board/menu-board.naver-match.ts), 모델 호출 없는 순수 함수(저장·자동 읽기 뒤·프리뷰가 같이 쓴다).

1. 사진을 **올린 날짜 최근 순**(모르면 뒤)으로 놓고 읽은 항목을 모은다 — `normalizeName` 이 같은 이름은 처음(= 최근 사진) 것만. 옛 가격판이 섞여 있어도 최근 사진 가격을 쓴다.
2. 짝짓기는 **메뉴판 읽기 채점기와 같은 알고리즘**이다: 등록 메뉴를 정답(`parseTruth`)으로, 읽은 항목을 답으로 놓고 `pairTruth`(이름 유사도 ≥ `MATCH` 0.75 후보를 유사도 높은 순 1:1, 같으면 가격이 맞는 쪽). 짝짓기 전에만 `menuMatchName` 으로 한글 이름의 영문 병기('커플 세트 Couple SET' → '커플 세트')를 뺀다 — 등록 메뉴는 대개 한글만.
3. 1:1 짝이 없어도 **이미 짝지어진 등록 메뉴와 이름이 거의 같으면**(크기·옵션 변형) 그 등록 메뉴로 보고 `origin: 'registered'` 로 두되 가격은 견주지 않는다(`priceCheck: null`).
4. 가격 비교 `menuBoardPriceCheck` 는 1:1 짝만: 등록 가격에 '~' 가 있으면 `range`, 어느 쪽이든 `parsePrice` 가 null 이면 `unknown`, 아니면 `same`/`different`.
5. 결과 `MenuBoardMenu{ name(사진 그대로), price, description, origin, registeredName, registeredPrice, priceCheck, imageUrl(근거 사진), uploadedOn }`.

공개용 `toPublicMenuBoard(snapshot)`: 사진이 없으면 undefined(필드 생략). `images`(주소·날짜), `addedMenus`(origin 'menu-board' 만 — 이름·가격·설명·날짜), `newerPrices`(`priceCheck === 'different'` 이고 사진 날짜·`menuUpdatedOn` 을 둘 다 알고 사진이 더 늦을 때만, 이름은 **등록 메뉴 이름**). 가격은 숫자로 읽히면 원 단위 숫자 문자열('17,9' → '17900'), 아니면 표기 그대로. 사진별 읽기 원문·짝 정보는 어드민에만 있다.

### 회귀 평가와 채점 — `eval:menu-boards`

- **검수 정답** [golden/menu-boards](../../apps/friendly/golden/menu-boards/) 20장(커밋됨) — 파일명 = 사진 키 `<shopRef>__board-N.json`, `{ shop, note, items: [[이름, 가격] | {name, price, alt[]}], optional?: [이름] }`. 메뉴 0~50개·합 308개, 메뉴 없는 사진 4장(표지 3장 + 소스 안내판 — `items: []`)으로 지어냄을 잰다. `alt` 는 같은 메뉴의 다른 표기(묶음 '콜라.사이다.환타' 를 낱개로 뽑아도 정답), `optional` 은 뽑아도 틀린 것이 아닌 이름(세트 선택지·코스 구성 요리·외국어 병기·옵션 안내).
- **채점** [menu-board.score.ts](../../apps/friendly/src/modules/menu-board/menu-board.score.ts) — 비교 때의 Python 채점기를 옮긴 것(그때 29개 방식을 다시 매겨 지표가 모두 같았다). `normalizeName`(NFKC·소문자·앞 번호·기호 제거) / `coreName`(괄호 속 제거) / `headName`(괄호와 '|' 뒤 수식어 제거). `nameScore` = 다섯 조합의 편집거리 유사도·포함 관계(짧은 쪽이 2자 이상 들어 있으면 길이비 + 0.15, 3자 이상이 끝에 붙으면 `MATCH` — '바질쌈' ↔ '향긋한 바질쌈') 중 최대. `parsePrice` 는 '1만5천'·'4P 22,000'(쉼표 숫자 우선)·'11.0'·'25,9'(1,000 미만은 천 원 단위 → 25,900원) 등을 원 단위로, 100~500만 원 밖이면 null. `scoreBoard` 는 같은 이름 항목을 한 번만 세고 놓침·지어냄(`wrong` — 정답·optional·맞힌 메뉴의 alt 어디에도 없음)·오독(짝은 맞았는데 `headName` 다름)·가격 불일치를 나눈다. `summarize` 는 실패한 사진을 지표에서 빼고 `failed` 로 세며, 메뉴 없는 사진에서 뽑은 항목 수를 `coverFalseItems`(표지 오인)로, 장당 중앙 시간을 `medianMs` 로.
- **실행** [menu-board.eval.ts](../../apps/friendly/src/modules/menu-board/menu-board.eval.ts) `runMenuBoardEval` — 사진 키마다 **동시 호출 없이 차례로**(ollama 계정 한도) 읽고 `buildMenuBoardReport` 로 `MenuBoardEvalReport{ createdAt, model, totals, boards[] }`. 스크립트가 `data/menu-boards/eval-report.json` 에 쓰고 어드민 '정확도' 탭이 그 파일을 읽는다.

### 어드민·공개 화면 (요약 — 세부는 [web](web.md))

- **어드민 '메뉴판 읽기'**([AdminMenuBoardPage.tsx](../../apps/web/src/routes/admin/AdminMenuBoardPage.tsx), 어드민 테스트 메뉴, lazy 청크 17.1kB): 읽기 탭([ReadTab.tsx](../../apps/web/src/components/admin/menu-board/ReadTab.tsx) — 업로드·끌어다 놓기·샘플(검수 정답 있는 사진 먼저), 20MB·형식은 올리기 전에 거름, '메뉴 읽기' 를 눌러야 모델 호출, 결과 표 + 모델·시간·토큰·넘긴 사진 크기·응답 원문) + 크게 보기([ZoomableImage.tsx](../../apps/web/src/components/admin/menu-board/ZoomableImage.tsx) — 맞춤·100%·200%, 누른 지점 확대, 끌어 이동, 전체 화면) + 정확도 탭([EvalTab.tsx](../../apps/web/src/components/admin/menu-board/EvalTab.tsx) — 리포트 지표와 사진별 틀린 곳).
- **어드민 맛집 상세 메뉴 탭** [AdminMenuBoardSection.tsx](../../apps/web/src/components/admin/restaurant-detail/AdminMenuBoardSection.tsx) — `snapshot.menuBoardImages` 가 있을 때만: 사진·읽음 수, 사진에만 있는 메뉴, 가격이 다른 등록 메뉴와 어느 쪽 날짜가 최신인지.
- **공개 맛집 메뉴 탭** [MenuBoardSection.tsx](../../apps/web/src/components/restaurant/detail/MenuBoardSection.tsx) — 등록 메뉴 아래 '메뉴판 사진' 섹션(썸네일 → 사진 탭과 같은 라이트박스, 사진 날짜 범위, `addedMenus` 처음 8개 + 더 보기, "AI 가 읽은 결과라 실제와 다를 수 있으니 사진으로 확인" 안내). 등록 메뉴가 없는 가게는 이 섹션만. 등록 메뉴 카드에는 `newerPrices` 에 이름이 있으면 '메뉴판 사진 14,000원 · 날짜' 한 줄([MenuTab.tsx](../../apps/web/src/components/restaurant/detail/MenuTab.tsx)).

### `apps/smartly` 경위 (2026-10-10 오전 생성 → 저녁 폐기)

`96df0e70` 이 AI 허브 71553 배포본의 두 모델 — 메뉴명 한 줄 OCR(deep-text-recognition-benchmark TPS-VGG-BiLSTM-Attn)과 4개 언어 번역(OpenNMT-py 2.2 포크 + 메뉴 사전 11.7만 개) — 을 도커 없이 윈도우에서 돌리는 Python 서버(uv·Python 3.10·FastAPI, `127.0.0.1:8700`, 로컬 전용, 루트 `dev:smartly`, turbo 공통 태스크엔 안 낌)로 넣었고, `448b4cd4` 가 Vite 개발 프록시(`/smartly-api`)로 부르는 6탭 체험 화면을 넣었다. 재측정은 문서와 같았다(OCR 5,000장 CER 2.97%, 번역 글자 BLEU en .721 등). 같은 날 `9e4c598c` 가 화면·프록시를, `63c7658a` 가 서버(onmt 포크·인식기·테스트·lockfile importer·CLAUDE.md 명령 줄)를 지웠다. 비교에 쓴 `probe/` 스크립트와 OCR 엔진 환경은 커밋한 적 없이 로컬에서 함께 지웠다 — 보고서의 OCR·하이브리드 숫자는 다시 돌릴 코드가 없는 기록이다. 검수 정답은 friendly `golden/menu-boards` 로 옮겼다.

## Talks To [coverage: high — 18 sources]

- **[ai](ai.md)** — 열 번째 purpose `menu-board`(비전). `AiConfigService.getResolved('ollama-cloud', 'menu-board')`·`adapterCache`·`thinkOptionForModel`(`@repo/utils`). 모델 폴백 `OLLAMA_MENU_BOARD_MODEL`(코드 기본값 kimi-k3, [env.ts](../../apps/friendly/src/config/env.ts)·[.env.example](../../apps/friendly/.env.example))이 [llm-provider-env.ts](../../apps/friendly/src/modules/ai/llm-provider-env.ts) `defaultModels['menu-board']` 로 들어간다. 키는 chat 계정 키를 상속 — 계정 게이트를 다른 LLM 기능과 나눈다. 어드민 AI 키 화면에 '메뉴판 읽기' 행([AdminAiKeysPage.tsx](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx), 아이콘 `ScanText`, 추론 선택 없음), 추천 모델은 [aiModel.ts](../../packages/utils/src/aiModel.ts) `recommendModelForPurpose` 가 kimi-k3 우선, 없으면 image 규칙(가장 작은 비전 모델).
- **[crawl](crawl.md)** — 네이버 어댑터의 사진·`menuUpdatedOn` 추출, `CrawlService.readMenuBoardsAfterCrawl`(fire-and-forget), [plugins/crawl.ts](../../apps/friendly/src/plugins/crawl.ts) 의 리더 조립. 백필 [backfill-naver-menus.ts](../../apps/friendly/scripts/backfill-naver-menus.ts) 가 옛 스냅샷에 사진 목록을 채운다(그 뒤 `read:naver-menu-boards`). 프리뷰는 어댑터의 공개 함수 `extractNaverMenuBoardImages`·`extractNaverPlaceMenus` 를 쓴다. 샘플 수집은 캐치테이블 [catchtable-shop.playwright.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/catchtable-shop.playwright.adapter.ts) `fetchCatchtableShopMenus().menuBoards`(2026-05 부터 있던 필드)를 쓴다.
- **RestaurantService** — 스냅샷에 사진·읽기 결과·짝을 보관(`findNaverMenuBoardState`·`saveNaverMenuBoardReads`·`upsertRestaurantFromCrawl`·`updateNaverMenus`), 공개 상세 `getPublicDetail` 이 `toPublicMenuBoard` 결과를 `menuBoard` 로 싣는다. 메뉴 그룹·0건 보호와 같은 함수 안이라 [menu-grouping](menu-grouping.md) 의 원본 메뉴 그룹 계층과 붙어 있지만 `restaurant_menus` 행에는 메뉴판 메뉴를 넣지 않는다.
- **[logs](logs.md)** — `OperationFeature` 에 `'menu-board-read'`([logs.ts](../../packages/api-contract/src/schemas/logs.ts)), 어드민 작업 로그 라벨 '메뉴판 사진 읽기'. 어드민 테스트 화면의 읽기는 run 을 남기지 않는다.
- **[api-contract](api-contract.md)** — [menu-board.ts](../../packages/api-contract/src/schemas/menu-board.ts)(읽기·샘플·평가 리포트), [crawl.ts](../../packages/api-contract/src/schemas/crawl.ts)(`NaverMenuBoardImage`·`NaverMenuBoardRead`·`MenuBoardMenu`·`NaverPlaceData` 세 필드), [restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts)(`RestaurantPublicMenuBoard`, `RestaurantPublicDetail.menuBoard?`), [routes.ts](../../packages/api-contract/src/routes.ts) `Routes.MenuBoard`, [constants.ts](../../packages/api-contract/src/constants.ts) `MENU_BOARD_MAX_UPLOAD_MB`(zod 없는 상수 모듈), [ai.ts](../../packages/api-contract/src/schemas/ai.ts) purpose enum.
- **[shared](shared.md)** — [menu-board.api.ts](../../packages/shared/src/api/menu-board.api.ts) `menuBoardApi`(read = `FormData` `file` 필드, 웹 Blob 전용 / samples / sampleImage = 어드민 토큰을 직접 실은 `fetch` → Blob / evalReport), [useMenuBoard.ts](../../packages/shared/src/hooks/useMenuBoard.ts)(`useMenuBoardSamples`(staleTime 5분)·`useMenuBoardEvalReport`·`useReadMenuBoard`·`useMenuBoardSampleImage` — 키 `['admin','menu-board',…]`).
- **[web](web.md)** — 어드민 '메뉴판 읽기' 페이지, 어드민 상세·공개 상세 메뉴 탭 섹션(위 요약).
- **[api-docs](api-docs.md)** — 공개 상세 응답에 `menuBoard` 가 생겨 [openapi.json](../../docs/api/openapi.json) 을 재생성했다(`0408f2f2`). 메뉴판 읽기 라우트 4개는 어드민이라 문서 대상이 아니다.
- **앱(`apps/mobile`)** — 없음. 공개 상세 `menuBoard` 필드는 공용 계약이라 앱도 받지만 그리지 않는다(`ee70bc2d` "앱은 아직").

## API Surface [coverage: high — 10 sources]

### HTTP (전부 어드민 — `authenticate + requireAdmin`, `tags: ['admin']`)

| 메서드·경로 | 입력 | 응답 | 비고 |
|---|---|---|---|
| `POST /api/v1/admin/menu-board/read` | multipart 파일 1개(`file`) | `MenuBoardReadResult` | 이 라우트만 `MENU_BOARD_MAX_UPLOAD_MB` = **20MB**(전역 multipart 5MB — 캐치테이블 원본 최대 9MB). 넘으면 413. rate limit 분당 20. multipart 라 zod body 대신 일반 `app.post` + 응답 `MenuBoardReadResult.parse`. 오류: `invalid_image` 400, `no_provider` 503, `llm_failed`·`parse_failed` 502 — 단 공통 에러 핸들러가 5xx 를 **500** 으로 접는다(Gotchas) |
| `GET /api/v1/admin/menu-board/samples` | — | `{ samples: MenuBoardSample[] }` | `data/menu-boards/<shop>/meta.json` 에서. `key = '<shopRef>__board-N'`, `hasTruth` = 검수 정답 파일 존재 |
| `GET /api/v1/admin/menu-board/samples/:key/image` | `key` 1~80자 | 사진 바이너리 | 키는 정규식 `^([A-Za-z0-9_-]+)__(board-\d+)$` 만(경로 조립 전), jpg·jpeg·png·webp. `Cache-Control: private, max-age=3600`. 없으면 404 |
| `GET /api/v1/admin/menu-board/eval` | — | `{ report: MenuBoardEvalReport \| null }` | 리포트 파일이 없거나 형식이 어긋나면 null |

공개 쪽은 새 라우트 없이 기존 `GET /api/v1/restaurants/public/:placeId` 응답에 `menuBoard?: { images[{url, uploadedOn}], addedMenus[{name, price, description, uploadedOn}], newerPrices[{name, price, uploadedOn}] }` 가 더해졌다(네이버 메뉴판 사진이 있을 때만).

### CLI (`pnpm --filter friendly …`, [package.json](../../apps/friendly/package.json))

| 명령 | 옵션 | 동작 |
|---|---|---|
| `eval:menu-boards` ([eval-menu-boards.ts](../../apps/friendly/scripts/eval-menu-boards.ts)) | `--model=<id>`(용도 기본 대신) · `--only=<key>,…` · `--rescore`(모델 안 부르고 지난 리포트 항목을 지금 정답으로 다시 채점) | 검수 정답 사진을 라우트와 같은 서비스로 한 장씩 읽어 채점 → `data/menu-boards/eval-report.json` + 표준 출력(지표·사진별 틀린 곳). 사진은 `data/menu-boards` 에 있어야 함 |
| `collect:menu-boards` ([collect-menu-boards.ts](../../apps/friendly/scripts/collect-menu-boards.ts)) | `--shops 30` · `--per-shop 3` · `--per-keyword 3` · `--min-menus 5` · `--out data/menu-boards` · `--keywords a,b` | 캐치테이블 키워드 검색(기본 20개 업종) → 메뉴판 사진 있고 메뉴 목록 5개 이상인 가게의 사진 + 가게 메뉴 목록("약한 정답")을 `<out>/<shopRef>/meta.json + board-N.<ext>`. 있는 가게는 건너뜀 |
| `read:naver-menu-boards` ([read-naver-menu-boards.ts](../../apps/friendly/scripts/read-naver-menu-boards.ts)) | `--place=a,b` · `--limit=N` | 이미 크롤된 네이버 가게 중 다시 읽을 사진(안 읽음 또는 `promptVersion` 이 현재보다 낮음)이 있는 곳을 SQLite JSON 함수(`json_each`·`json_extract`)로 골라 최근 크롤 순으로 한 가게씩 `readPending`. 사진 목록이 없으면 "backfill:naver-menus 먼저" |
| `probe:naver-menu-boards` ([probe-naver-menu-boards.ts](../../apps/friendly/scripts/probe-naver-menu-boards.ts)) | `--places=…` · `--limit=10` · `--rescore` | 네이버 페이지를 새로 받아 사진을 읽고 등록 메뉴와 대조한 HTML 리포트(`data/menu-boards/naver-preview/`). 사진은 `data/menu-boards/naver-<placeId>/` 에 받아 두어 어드민 샘플 목록에 그대로 뜬다. DB 는 읽기만 |

## Data [coverage: high — 12 sources]

**DB 테이블·마이그레이션 없음.** 네이버 메뉴판 데이터는 전부 `restaurants.snapshotJson`(네이버 행) 안에 있고, 어드민 테스트·평가는 파일이다.

### 스냅샷 필드 (`NaverPlaceData`, 전부 optional)

| 필드 | 모양 | 규칙 |
|---|---|---|
| `menuBoardImages` | `NaverMenuBoardImage[]` = `{ url(https), uploadedOn: 'YYYY-MM-DD' \| null, read?: { items: MenuBoardItem[], model, readAt, promptVersion? } }` | 키 없음 = 수집 전이거나 응답에 필드가 없던 크롤(직전 값 유지), `[]` = 사진을 내림. `read` 없음 = 안 읽었거나 실패(다음 크롤에서 다시). `promptVersion` 없으면 1 로 본다 |
| `menuBoardMenus` | `MenuBoardMenu[]`(위 Architecture) | 저장 때마다 등록 메뉴 + 사진 읽기 결과로 다시 계산(모델 호출 없음) |
| `menuUpdatedOn` | `'YYYY-MM-DD' \| null` | 등록 메뉴 최근 업데이트(`placeMenus.updatedAt`). `newerPrices` 판정에 쓴다 |

로컬 실측: `0408f2f2` 커밋 본문 — 네이버 23곳 `backfill --all` 뒤 사진 74장을 실패 없이 읽어 menu-board 510·registered 321(가격 같음 211·다름 56·범위 12). `faa12818` — 주막해물촌만 v2 로 다시 읽어 27 → 37개, 나머지 22곳·73장은 v1. 2026-10-26 로컬 `dev.db` 읽기 전용 조회로는 23곳 74장이 **모두 `promptVersion` 2** 로 읽혀 있고, `menuBoardMenus` 는 menu-board 600·registered 391(같음 227·다름 46·범위 12·unknown 8·크기/옵션 변형으로 가격 비교 없음 98).

### 파일

| 위치 | git | 내용 |
|---|---|---|
| `apps/friendly/golden/menu-boards/<key>.json` | 커밋 | 검수 정답 20장(형식은 Architecture). 사진은 커밋하지 않는다 |
| `apps/friendly/data/menu-boards/<shopRef>/meta.json` + `board-N.*` | 제외(`apps/friendly/data/*`) | `collect:menu-boards`(캐치테이블) · `probe:naver-menu-boards`(`naver-<placeId>`) 가 받은 샘플. `meta = { shopRef, shopName, boards[{file}], … }` |
| `apps/friendly/data/menu-boards/eval-report.json` | 제외 | 마지막 회귀 평가 `MenuBoardEvalReport` |
| `apps/friendly/data/menu-boards/naver-preview/` | 제외 | 프리뷰 `index.html`·`report.json` |

경로는 `process.cwd()` 기준(`resolve(cwd, 'data', 'menu-boards')`) — friendly 디렉터리에서 실행하는 것을 전제한다.

### 평가 리포트 (`MenuBoardEvalReport`)

`totals{ boards, failed, required, matched, wrong, precision, recall, f1, exactName(짝 중 핵심 이름 그대로), priceAccuracy, coverFalseItems, medianMs }`, `boards[]{ key, shop, note, required, matched, missed[], wrong[], misread[{expected, got}], priceMismatch[{name, expected, got}], durationMs, error, items[] }`. 기준값: kimi-k3 F1 99.8%(308개 중 307개, 지어냄 0, 가격 일치 100% — v2), friendly 경로 첫 측정 99.7%·장당 중앙 5.5초([menu-board-ocr-probe.md](../../docs/menu-board-ocr-probe.md)).

## Key Decisions [coverage: high — 10 sources]

- **kimi-k3 + 규칙 프롬프트, OCR 없이** (`4597294b`) — 비교에서 kimi-k3 는 단독 97.4% → Paddle 힌트 98.2% → 규칙 99.5% → 규칙 + 작은 사진 확대 99.8% 였고, 규칙 + 확대 위에 Paddle 힌트를 더해도 99.8% 그대로였다. 힌트가 더하는 게 없으니 GPU·Python·OCR 없이 friendly 의 기존 ollama 호출 하나로 끝난다. 더 빠른 대안 gemma4:31b + Paddle + 규칙(99.4%·장당 2.7초)은 OCR 이 필요하고, gemma4 는 힌트 없이 규칙만이면 89.6%(세로로 긴 3661×7205 메뉴판에서 38개를 지어냄). Claude Sonnet(99.2%)·Codex(98.0%)는 CLI 구독 호출이라 서비스엔 API 키가 따로 필요하다.
- **사진 긴 변을 2,000px 로 "맞춘다"(작은 사진은 키운다)** — kimi-k3 는 해상도만큼 토큰을 써서, 420×596 손글씨 메뉴판을 키워 넘기자 '논알콜맥주' → '늦안콜백주' 오독이 사라졌다(99.5 → 99.8%, 그 사진 입력 토큰 약 740 → 4,240). gemma4 는 사진을 정해진 토큰으로 보므로 영향이 거의 없다. 처음 비교 표의 '규칙' 실행에 확대가 섞여 있던 것을 뒤에 찾아 보고서를 정정했다.
- **생각 모드는 끈다** — gemma4 생각 켬은 정확도가 오르지 않고(같은 사진끼리 96.1 → 94.5% 등) 장당 3배 느리며 60번 중 7번 5분 넘게 무응답, kimi-k3 생각 켬은 97.9%·장당 중앙 71초. "첫 답을 사진과 대조해 고쳐라" 두 번째 호출도 20장 모두 초안을 그대로 돌려줬다. 남은 오류는 글자 모양 오독이라 추론으로 안 고쳐진다.
- **크기별 가격은 크기마다 한 항목(v2)** (`faa12818`) — 정답과 맞추기 쉬운 "첫 가격만" 규칙이 실제로는 가격을 버렸다. 바꿔도 검수 20장 F1 은 99.8% 그대로(채점이 크기 변형을 같은 메뉴로 보고 정답의 첫 가격과 맞는 항목을 짝짓기 때문). 네이버 등록 메뉴도 '아구찜(소)/(중)/(대)' 처럼 나눠 적어 크기별 1:1 짝·가격 비교가 맞아졌다.
- **읽기 결과에 프롬프트 버전을 남기고 낮은 버전만 다시 읽는다** — `MENU_BOARD_PROMPT_VERSION` 을 올리면 다음 크롤 자동 읽기와 `read:naver-menu-boards` 가 옛 결과를 다시 읽는다(같은 주소·같은 버전만 건너뜀). 문구를 바꾸면 `eval:menu-boards` 로 다시 재고 올린다(파일 주석). [versioned-llm-prompts](../concepts/versioned-llm-prompts.md).
- **회귀 평가는 커밋된 검수 정답으로** — 정답 20장을 사진을 직접 보고 썼고(처음 12장은 가게 12곳에서 한 장씩, 뒤 8장은 상위 방식 답이 가장 많이 갈린 사진), 메뉴 없는 사진 4장으로 지어냄을 잰다. 가게가 올린 메뉴 목록은 사진과 어긋나는 "약한 정답"이라 방식 간 순서를 보는 데만 쓴다. [golden-set-precision-gate](../concepts/golden-set-precision-gate.md).
- **짝짓기는 채점기를 그대로 쓴다** — 등록 메뉴를 정답, 사진 항목을 답으로 놓으면 "같은 메뉴인가" 판정이 채점과 같은 문제가 된다. 저장·자동 읽기·프리뷰 셋이 한 순수 함수를 써서 화면과 리포트가 어긋나지 않는다.
- **구분값은 짝지은 결과에 붙이고, 공개는 두 갈래만** — 사진을 등록 메뉴와 섞지 않는다. 공개 화면은 '등록 메뉴에 없는 메뉴'(사진 날짜·AI 안내와 함께)와 '사진이 더 최신인 다른 가격'만 보이고, 날짜를 모르면 가격 차이를 내보내지 않는다. 사진별 원문·짝 정보는 어드민 전용. [public-admin-route-split](../concepts/public-admin-route-split.md).
- **크롤 `done` 을 막지 않는다** — 가게당 평균 3장·장당 약 6초라 fire-and-forget 으로 돌리고 결과는 작업 로그 run 으로 남긴다. 상한 12장을 넘는 사진은 다음 크롤에서 이어 읽는다. [static-first-llm-enrichment](../concepts/static-first-llm-enrichment.md)·[operation-log-instrumentation](../concepts/operation-log-instrumentation.md).
- **"모름"과 "없음"을 가른다** — 응답에 `menuImages` 필드가 없으면(구조 변경 의심) 직전 사진 목록을 두고, 빈 배열이면 비운다. 메뉴 0건 보호와 같은 원칙. [unknown-vs-zero](../concepts/unknown-vs-zero.md).
- **새 테이블 없이 스냅샷에** — 사진 목록·읽기 결과·짝이 가게 단위로 함께 바뀌고, 같은 주소의 읽기 결과는 재크롤 때 주소로 이어받는다.
- **AI 허브 메뉴판 모델(apps/smartly) 폐기** (`63c7658a`) — 메뉴명 인식기는 LLM 이 골라 준 위치를 잘라 줘도 정답 161개 중 104개(65%)만 그대로 읽었고(LLM + Paddle 은 159개), 검출기를 붙인 통사진 F1 25~27%. 번역 모델 몫은 BLEU 0.03~0.12(점수 대부분이 사전 조회), 메뉴 사전은 실제 메뉴판 메뉴명의 37~52% 만 있고 흔한 메뉴일수록 다른 가게 번역이 붙어 있었다(비빔밥 → "Meat-free Gimbap"). 번역이 필요하면 kimi-k3 로 한다(보고서 다음 단계).
- **어드민 화면은 모델을 버튼으로만 부른다** — 사진을 고르는 것만으로는 호출하지 않는다('메뉴 읽기'). 샘플 사진은 어드민 인증이 필요해 `<img src>` 대신 Blob → object URL 이고, 같은 Blob 을 읽기에 올린다.

## Gotchas [coverage: high — 14 sources]

- **503·502 로 던져도 응답은 500** — 라우트 `throwAsHttp` 는 `no_provider` 503, `llm_failed`·`parse_failed` 502 를 던지지만 [error-handler.ts](../../apps/friendly/src/plugins/error-handler.ts) 가 5xx 를 500 으로 접는다(개발 모드에서만 메시지를 싣는다). [menu-board.route.test.ts](../../apps/friendly/src/modules/menu-board/menu-board.route.test.ts) 도 500 을 기대한다. 화면은 상태 코드로 원인을 가를 수 없다.
- **`sharp` 정적 import 가 부팅 경로에 다시 들어왔다(미수정)** — [menu-board.service.ts](../../apps/friendly/src/modules/menu-board/menu-board.service.ts) 는 `import sharp from 'sharp'` 인데, 2026-10-05 성능 감사 2차가 sharp·satori·playwright 를 "전 모듈에서 사용 시점 import(남은 것은 `import type` 뿐)" 로 바꿨다([PLAN-perf-2.md](../../docs/PLAN-perf-2.md) X-3·통합 완료 상태). 영수증·식단 사진은 `loadSharp()` 지연 import 다([settlement-extraction.service.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts)·[meal-photo.service.ts](../../apps/friendly/src/modules/meal/meal-photo.service.ts)). [plugins/crawl.ts](../../apps/friendly/src/plugins/crawl.ts) 가 부팅 때 `MenuBoardService` 를 import 하고 라우트도 autoload 라, 메뉴판을 읽지 않는 프로세스도 sharp 를 올린다. [lazy-heavy-imports](../concepts/lazy-heavy-imports.md).
- **계약·화면 주석이 공개 노출 전 상태로 남았다(미수정)** — [crawl.ts](../../packages/api-contract/src/schemas/crawl.ts) `MenuBoardMenu` 위 주석 "어드민 전용 — 공개 화면·칼로리·정산엔 아직 안 쓴다" 와 [AdminMenuBoardSection.tsx](../../apps/web/src/components/admin/restaurant-detail/AdminMenuBoardSection.tsx) "공개 화면·칼로리·정산에는 아직 쓰지 않는다" 는 `ee70bc2d` 이후 공개 메뉴 탭이 그 파생값을 쓰므로 낡았다(칼로리·정산은 여전히 안 씀). 같은 파일 `MenuBoardPriceCheck` 의 `'range'` 주석 "사진은 첫 가격만 읽어" 는 v2 이전 설명이다(`menu-board.naver-match.ts` 쪽 주석은 `faa12818` 에서 고쳐졌다). [restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts) 는 `RestaurantPublicMenuBoard` 블록이 `RestaurantPublicDetail` 의 설명 주석 첫 줄("공개 식당 상세. 기존 스칼라 필드 … 는")과 나머지 사이에 끼어 그 문장이 끊겼다. [ai.ts](../../packages/api-contract/src/schemas/ai.ts) purpose 주석도 "(어드민 테스트)" 만 적어 크롤 자동 읽기를 말하지 않는다.
- **자동 읽기 run 이 열린 채 남을 수 있다** — `readMenuBoardsAfterCrawl` 은 `startRun` 뒤 `readPending` 이 null 이면(그 사이 스냅샷이 바뀐 경우) `finishRun` 없이 return 한다. `pendingCount > 0` 이면 보통 null 이 아니라 드문 경합이다.
- **읽기 저장과 재크롤 upsert 는 잠금 없는 read-modify-write** — `saveNaverMenuBoardReads` 와 `upsertRestaurantFromCrawl` 이 각자 스냅샷을 읽고 통째로 쓴다. 읽기 저장이 upsert 의 조회와 쓰기 사이에 끼면 그 읽기 결과는 사라진다(다음 크롤·`read:naver-menu-boards` 에서 다시 읽힌다 — 비용만 든다).
- **가게당 12장, 한 장씩** — 상한을 넘는 사진·실패한 사진은 다음 크롤까지 안 읽힌다. `read:naver-menu-boards` 도 가게마다 `readPending` 한 번이라 12장 넘는 가게는 다시 돌려야 한다.
- **옛 스냅샷엔 사진 목록이 없다** — `menuBoardImages` 키가 없는 가게는 리더가 null(읽을 게 없음)이다. 재크롤 또는 `backfill:naver-menus`(그 뒤 `read:naver-menu-boards`)가 먼저다. 운영 데이터도 같은 순서가 필요하다(마이그레이션은 없음).
- **프롬프트를 올리면 비용이 다시 든다** — v1 → v2 전환은 사진 전부를 다시 읽는 것이다(로컬 74장). 프롬프트 문구를 고칠 때는 버전을 올릴지(재읽기)부터 정해야 한다.
- **검수 정답의 한계** — 20장, 업종이 한식·고기·중식·돈까스에 몰렸고, 정답을 비교 대상과 같은 계열(Claude)이 썼으며, 규칙 보강은 이 20장의 실수를 보고 쓴 것이다(나머지 50장 가게 목록으로는 잃은 메뉴 0). 같은 조건에서도 실행마다 한두 개가 달라 99.7~99.8% 가 이 세트의 실력이다. 크기별 가격 정답은 여전히 첫 가격 기준이다.
- **비교 실행이 ollama cloud Pro 5시간 한도를 소진했다** — 같은 키를 쓰는 식단 추천·AI 분석 등도 그동안 막혔다(보고서). 모델 비교·`eval:menu-boards --model` 반복은 같은 계정 한도를 쓴다. `eval` 이 동시 호출 없이 한 장씩인 이유.
- **`OLLAMA_IMAGE_MODEL` 예시 모델이 퇴역했다** — 비교 중 발견: 영수증 추출이 쓰는 `qwen3.5:397b-cloud` 는 2026-09-25 ollama cloud 에서 퇴역했다. [.env.example](../../apps/friendly/.env.example) 은 아직 그 값이다(미수정, [ai](ai.md)).
- **샘플 목록에 네이버 프리뷰 사진도 섞인다** — `probe:naver-menu-boards` 가 `data/menu-boards/naver-<placeId>/` 에 사진·meta 를 남겨 어드민 샘플에 그대로 뜬다(정답은 없음).
- **경로가 실행 위치에 묶인다** — `MENU_BOARDS_DIR`·`MENU_BOARD_GOLDEN_DIR` 이 `process.cwd()` 기준이라 friendly 디렉터리가 아닌 곳에서 서버·스크립트를 띄우면 샘플·정답·리포트를 못 찾는다(빈 목록·null).

## Sources [coverage: high — 53 sources]

- [apps/friendly/src/modules/menu-board/menu-board.route.ts](../../apps/friendly/src/modules/menu-board/menu-board.route.ts) (어드민 라우트 4개, 20MB 라우트 한도, 분당 20, 오류 → HTTP)
- [apps/friendly/src/modules/menu-board/menu-board.service.ts](../../apps/friendly/src/modules/menu-board/menu-board.service.ts) (`MenuBoardService.read`, `prepareMenuBoardImage` 2,000px 맞춤, 샘플·정답·리포트 파일, 정적 `sharp` import)
- [apps/friendly/src/modules/menu-board/menu-board.prompt.ts](../../apps/friendly/src/modules/menu-board/menu-board.prompt.ts) (`MENU_BOARD_PROMPT`, `MENU_BOARD_PROMPT_VERSION = 2`, `parseMenuBoardItems`)
- [apps/friendly/src/modules/menu-board/menu-board.score.ts](../../apps/friendly/src/modules/menu-board/menu-board.score.ts) (채점 — `nameScore`·`parsePrice`·`pairTruth`·`scoreBoard`·`summarize`)
- [apps/friendly/src/modules/menu-board/menu-board.eval.ts](../../apps/friendly/src/modules/menu-board/menu-board.eval.ts) (정답 적재·차례 실행·리포트)
- [apps/friendly/src/modules/menu-board/menu-board.naver.ts](../../apps/friendly/src/modules/menu-board/menu-board.naver.ts) (`NaverMenuBoardReader`, 12장 상한, `needsMenuBoardRead`)
- [apps/friendly/src/modules/menu-board/menu-board.naver-match.ts](../../apps/friendly/src/modules/menu-board/menu-board.naver-match.ts) (`buildMenuBoardMenus`·`carryMenuBoardReads`·`toPublicMenuBoard`·`menuMatchName`)
- [apps/friendly/src/modules/menu-board/menu-board.test.ts](../../apps/friendly/src/modules/menu-board/menu-board.test.ts) (파싱·채점·리포트·사진 처리·서비스·샘플 파일)
- [apps/friendly/src/modules/menu-board/menu-board.naver.test.ts](../../apps/friendly/src/modules/menu-board/menu-board.naver.test.ts) (origin·최근 사진 우선·변형·가격 비교·이어받기·공개·리더)
- [apps/friendly/src/modules/menu-board/menu-board.route.test.ts](../../apps/friendly/src/modules/menu-board/menu-board.route.test.ts) (어드민 전용·업로드·5xx → 500·5MB 넘는 사진·샘플·리포트)
- [apps/friendly/scripts/eval-menu-boards.ts](../../apps/friendly/scripts/eval-menu-boards.ts) (`eval:menu-boards` `--model`·`--only`·`--rescore`)
- [apps/friendly/scripts/collect-menu-boards.ts](../../apps/friendly/scripts/collect-menu-boards.ts) (캐치테이블 샘플 수집, 2026-10-10 신규)
- [apps/friendly/scripts/read-naver-menu-boards.ts](../../apps/friendly/scripts/read-naver-menu-boards.ts) (이미 크롤된 가게 일괄 읽기, 프롬프트 버전 조건)
- [apps/friendly/scripts/probe-naver-menu-boards.ts](../../apps/friendly/scripts/probe-naver-menu-boards.ts) (네이버 프리뷰 HTML 리포트)
- [apps/friendly/scripts/backfill-naver-menus.ts](../../apps/friendly/scripts/backfill-naver-menus.ts) (메뉴 백필이 사진 목록·`menuUpdatedOn` 도 채움)
- [apps/friendly/golden/menu-boards/](../../apps/friendly/golden/menu-boards/) (검수 정답 20장)
- [apps/friendly/package.json](../../apps/friendly/package.json) (스크립트 4종)
- [apps/friendly/src/plugins/crawl.ts](../../apps/friendly/src/plugins/crawl.ts) (리더 조립, 테스트에선 null)
- [apps/friendly/src/modules/crawl/crawl.service.ts](../../apps/friendly/src/modules/crawl/crawl.service.ts) (`readMenuBoardsAfterCrawl`, `menu-board-read` run)
- [apps/friendly/src/modules/crawl/crawl.service.test.ts](../../apps/friendly/src/modules/crawl/crawl.service.test.ts) (크롤 뒤 자동 읽기·읽을 사진 없으면 호출 없음)
- [apps/friendly/src/modules/crawl/adapters/naver-place.playwright.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/naver-place.playwright.adapter.ts) (`extractMenuBoardImages`·`extractMenuUpdatedOn`·공개 추출 함수)
- [apps/friendly/src/modules/crawl/adapters/naver-place.adapter.test.ts](../../apps/friendly/src/modules/crawl/adapters/naver-place.adapter.test.ts) (menuImages·updatedAt 추출)
- [apps/friendly/src/modules/crawl/adapters/catchtable-shop.playwright.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/catchtable-shop.playwright.adapter.ts) (`fetchCatchtableShopMenus().menuBoards` — 샘플 원천)
- [apps/friendly/src/modules/restaurant/restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts) (스냅샷 보관·이어받기·짝 재계산·공개 `menuBoard`)
- [apps/friendly/src/modules/restaurant/restaurant.test.ts](../../apps/friendly/src/modules/restaurant/restaurant.test.ts) (upsert 사진 보존/비움, 읽기 저장·이어받기, `updateNaverMenus`, 공개 응답)
- [apps/friendly/src/modules/ai/llm-provider-env.ts](../../apps/friendly/src/modules/ai/llm-provider-env.ts) (`defaultModels['menu-board']`)
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) (`OLLAMA_MENU_BOARD_MODEL` 기본 kimi-k3)
- [apps/friendly/.env.example](../../apps/friendly/.env.example) (`OLLAMA_MENU_BOARD_MODEL=kimi-k3`, 퇴역한 `OLLAMA_IMAGE_MODEL` 예시)
- [apps/friendly/src/plugins/error-handler.ts](../../apps/friendly/src/plugins/error-handler.ts) (5xx → 500)
- [apps/friendly/src/plugins/multipart.ts](../../apps/friendly/src/plugins/multipart.ts) (전역 5MB)
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts) (비교 — `loadSharp()` 지연 import)
- [apps/friendly/src/modules/meal/meal-photo.service.ts](../../apps/friendly/src/modules/meal/meal-photo.service.ts) (비교 — `loadSharp()` 지연 import)
- [packages/api-contract/src/schemas/menu-board.ts](../../packages/api-contract/src/schemas/menu-board.ts) (읽기·샘플·평가 리포트 스키마)
- [packages/api-contract/src/schemas/crawl.ts](../../packages/api-contract/src/schemas/crawl.ts) (`NaverMenuBoardImage`·`NaverMenuBoardRead.promptVersion`·`MenuBoardMenu`·origin·priceCheck)
- [packages/api-contract/src/schemas/restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts) (`RestaurantPublicMenuBoard`, `menuBoard?`)
- [packages/api-contract/src/schemas/ai.ts](../../packages/api-contract/src/schemas/ai.ts) (purpose `menu-board`)
- [packages/api-contract/src/schemas/logs.ts](../../packages/api-contract/src/schemas/logs.ts) (`menu-board-read`)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) (`Routes.MenuBoard`)
- [packages/api-contract/src/constants.ts](../../packages/api-contract/src/constants.ts) (`MENU_BOARD_MAX_UPLOAD_MB = 20`)
- [packages/shared/src/api/menu-board.api.ts](../../packages/shared/src/api/menu-board.api.ts) (`menuBoardApi`)
- [packages/shared/src/hooks/useMenuBoard.ts](../../packages/shared/src/hooks/useMenuBoard.ts) (훅 4종)
- [packages/utils/src/aiModel.ts](../../packages/utils/src/aiModel.ts) (`recommendModelForPurpose` kimi-k3 우선, `thinkOptionForModel`)
- [apps/web/src/routes/admin/AdminMenuBoardPage.tsx](../../apps/web/src/routes/admin/AdminMenuBoardPage.tsx) (어드민 '메뉴판 읽기')
- [apps/web/src/components/admin/menu-board/ReadTab.tsx](../../apps/web/src/components/admin/menu-board/ReadTab.tsx) (읽기 탭)
- [apps/web/src/components/admin/menu-board/EvalTab.tsx](../../apps/web/src/components/admin/menu-board/EvalTab.tsx) (정확도 탭)
- [apps/web/src/components/admin/menu-board/ZoomableImage.tsx](../../apps/web/src/components/admin/menu-board/ZoomableImage.tsx) (크게 보기)
- [apps/web/src/components/admin/restaurant-detail/AdminMenuBoardSection.tsx](../../apps/web/src/components/admin/restaurant-detail/AdminMenuBoardSection.tsx) (어드민 상세 메뉴판 사진 섹션)
- [apps/web/src/components/restaurant/detail/MenuBoardSection.tsx](../../apps/web/src/components/restaurant/detail/MenuBoardSection.tsx) (공개 메뉴 탭 섹션)
- [apps/web/src/components/restaurant/detail/MenuTab.tsx](../../apps/web/src/components/restaurant/detail/MenuTab.tsx) (등록 메뉴 카드의 최신 사진 가격 한 줄)
- [apps/web/src/routes/admin/AdminAiKeysPage.tsx](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx) ('메뉴판 읽기' purpose 행, 추론 선택 없음)
- [docs/menu-board-ocr-probe.md](../../docs/menu-board-ocr-probe.md) (통사진 비교 보고서 — 결론·순위·생각 모드·규칙·최종 선택·v2·한계)
- [docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md) (X-3 — 무거운 의존성 사용 시점 import, 통합 완료 상태)
- [docs/api/openapi.json](../../docs/api/openapi.json) (공개 상세 `menuBoard` 재생성)
