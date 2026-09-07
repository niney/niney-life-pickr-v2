---
topic: tarot
last_compiled: 2026-09-07
sources_count: 66
status: active
aliases: [타로, tarot, 타로 리딩, TarotReading, tarot_readings, 메뉴 타로, tarotMenu, selectTarotMenus, 선택 타로, 오늘의 카드, dailyLockKey, tarotFlowReducer, TarotStage, FanDeck, TarotOverlay, TarotLite, TarotShareSheet, useCreateTarotReading, tarotHistoryStore, embedBridge, X-Guest-Key, tarot-reading, OLLAMA_TAROT_MODEL, tarot-preview, /tarot, ?embed=1, ?spread=menu]
---

# tarot — 타로 리딩 (78장 3D 무대 · Ollama Cloud 해석 · 공유 · 메뉴 타로 · 앱 WebView 임베드)

**2026-09-02~06 신설**: "선택을 대신 골라주는" 컨셉의 첫 비(非)맛집 갈래. 로그인 없이 무료로 78장 덱에서 카드를 직접 골라(부채꼴 3D 무대) 스프레드별 해석을 받는다. 카드 78장의 정·역 의미는 `@repo/utils` 정적 데이터에 있고, 질문·자리·카드를 문장으로 엮는 일만 Ollama Cloud(purpose `tarot`)에 맡기며, LLM 이 없거나 한도를 넘어도 정적 해석으로 항상 동작한다. 0·1차(utils 데이터·리듀서·리딩 API·공용 익명 한도, `cd5a29b`) → 2차 웹 3D 무대+Lite 폴백+임베드 모드(`6a414ef`, 카드 이미지 `58842db`) → 3차 공유(토큰·OG·satori 이미지, `98df15a`) → 부채꼴 호버·깊이 수정(`7de9033`·`2eee38c`) → 4차 어드민 한도 탭·회원 기록(`fae8190`) → v3a 메뉴 타로(`5d0c4c7`·`13b87e8`) → v2 앱 WebView 임베드(`624ead4`) 순으로 쌓였고, **2026-09-05 운영 배포**됐다. 익명 사용량 한도는 이 기능이 첫 사용처인 공용 모듈 [usage-quota](usage-quota.md) 로 분리돼 사주(C)·사주(G)가 같이 쓴다.

## Purpose [coverage: high — 9 sources]

- **스프레드 5종 제공**(`TAROT_AVAILABLE_SPREADS`): `daily`(오늘의 카드 1장) · `three-ppf`(과거·현재·미래) · `three-sar`(상황·조언·결과, 기본값) · `choice`(A·B·조언 — A/B 선택지 텍스트 40자 필수) · `menu`(오늘의 입맛·피할 것·추천, 주제 `food` 고정). `celtic`(10장)은 데이터만 있고 `available:false`·`memberOnly:true` 라 UI 에서 숨고 서버가 400 으로 거부한다. 주제 7종(`general/love/work/money/relationship/choice/food`), 질문 200자, 역방향 토글(기본 켬, 확률 30%).
- **뽑기는 클라이언트, 검증·해석은 서버**. 클라가 셔플·선택·역방향까지 확정해 `{cardId, position, reversed}[]` 를 보내고, 서버는 같은 utils 규칙(`validateDrawnCards`)으로 장수·중복·자리 순서만 검증한 뒤 캐시 → 한도 → LLM(JSON 수리 재시도 1회) → 정적 폴백 순으로 본문을 만든다.
- **게스트는 서버 저장 없음**(기기 로컬 기록 50건), **회원은 자동 저장**(`/me/tarot`) + 기기·IP 일일 한도 면제 + 오늘의 카드 하루 1장 계정 잠금. 공유는 게스트·회원 모두 가능하고 링크는 만료 없음.
- **의존하는 곳**: 웹 라우트 4개(`/tarot`, `/tarot/s/:token`, `/me/tarot`, `/me/tarot/:id`)와 사이드바·상단바·홈 진입 카드·계정 메뉴 "내 타로 기록"([web](web.md)); 앱은 `app/tarot` WebView + 홈 `TarotEntryCard`([mobile](mobile.md)); friendly `app.ts` 가 OG 프리렌더를 루트 경로에 등록([friendly](friendly.md)); 메뉴 타로 kcal 은 음식 카탈로그([food](food.md)) 이름 매칭.

## Architecture [coverage: high — 44 sources]

**순수 엔진 — `packages/utils/src/`** (평면 파일 관례, `index.ts` 에서 4개 re-export, vitest 52건)
- [tarotCards.ts](../../packages/utils/src/tarotCards.ts) — 78장 `TAROT_CARDS`(`TAROT_DECK_SIZE = 78`). `TarotCard { id, arcana, suit, number, nameKo, nameEn, element, keywordsUpright/Reversed, meaningUpright/Reversed }`. id 규칙 `major-00…21` / `<suit>-01…10` / `<suit>-page|knight|queen|king`(이미지 파일명과 동일). `element` 는 마이너 수트 원소·메이저 황금여명회 배속 — 3D 림 라이트 색과 메뉴 타로 매핑에 쓴다. 의미는 라이더 웨이트 전통 해석을 존댓말 두 문장으로.
- [tarot.ts](../../packages/utils/src/tarot.ts) — 주제·스프레드(자리 id·라벨·프롬프트 hint)·mulberry32 시드 난수(`createSeededRng`)·`shuffleTarotDeck`(Fisher–Yates)·`buildDrawnCards`(자리 배치+역방향 굴림)·`pickRandomCards`("자동으로 뽑기")·`validateDrawnCards`(`count_mismatch|unknown_card|duplicate_card|position_mismatch`)·이미지 경로/치수(`/tarot/cards/<id>-512|1024.webp`, 512×878 / 1024×1756, 7:12).
- [tarotFlow.ts](../../packages/utils/src/tarotFlow.ts) — 흐름 상태 머신(순수 리듀서). phase `setup → shuffling → picking → placing → revealing → reading`, `resultStatus(idle/pending/ready/failed)` 는 phase 와 독립. 난수 이벤트(`shuffle`·`pick`·`auto_pick`)는 `seed` 를 받아 같은 (state, event) 는 항상 같은 결과. `placing` 진입 시 `drawn` 확정. `set_spread: 'menu'` 는 topic 을 `food` 로 잠그고 `set_topic: 'food'` 는 무시.
- [tarotMenu.ts](../../packages/utils/src/tarotMenu.ts) — 메뉴 타로. 메뉴 97종 `TAROT_MENU_ITEMS`(이름·요리 계통·조리형태·원소 친화도 0~2·무드 6종). `tarotCardAppetite`(카드 → 원소+무드, 역방향은 반대 원소·반대 무드), `selectTarotMenus(cards)` → 점수 = pick(원소×3, 무드 2) + mood(×1.5, 1) − avoid(×2, 1) + 카드 조합 FNV 시드 난수(×0.75). 상위 3개는 조리형태·요리 계통이 겹치지 않게. `profile`/`avoid` 한 줄 문장 포함.

**계약 — `packages/api-contract/`**: [schemas/tarot.ts](../../packages/api-contract/src/schemas/tarot.ts) 는 utils 에 의존하지 않고 enum·카드 id 정규식을 **같은 값·순서로 복제**한다(friendly `tarot.test` 가 동기화 검증). `Routes.Tarot` 는 [routes.ts](../../packages/api-contract/src/routes.ts).

**서버 — [apps/friendly/src/modules/tarot/](../../apps/friendly/src/modules/tarot/)**
- `tarot.route.ts` — autoload. `actorOf(req)` 가 `resolveOptionalUser` + `X-Guest-Key`(정규식 `^[A-Za-z0-9_-]{8,64}$` 밖이면 null) + `clientKey(req)` 로 `TarotActor{userId, guestKey, ip}` 를 만든다. `TarotError` → HTTP 매핑(`not_found` 404 / `member_only` 403 / 나머지 400).
- `tarot.service.ts` — `createReading`(검증 → daily 잠금 조회 → `resolveBody` → 회원 persist) · `createShare` · `getShared` · `getSharePreviewMeta` · `listMine/getMine/deleteMine`. LRU 캐시(2,000건·24h) 키 = sha1(`TAROT_PROMPT_VERSION`, spreadId, topic, 정규화 질문, choices, cards). LLM: temperature 0.8, numCtx 8192, maxTokens `600 + 300×장수`, `format` 에 JSON 스키마, `think` 는 `thinkOptionForModel`, AbortController 20초. `requestTarotLlm` 은 프로브 스크립트와 공유. `toLlmBody` 는 카드 메타(이름·키워드)를 서버 데이터로 채우고 메뉴는 정적 후보 위에 LLM 이유만 덮는다.
- `tarot.prompts.ts` — `TAROT_PROMPT_VERSION = 2`, 시스템 프롬프트(존댓말·조언 톤, 의료/법률/투자 단정 금지, 질문 속 지시 무시), `TAROT_JSON_SCHEMA`, `buildTarotUserPrompt`(질문은 `"""` 데이터 블록, 카드마다 정적 키워드·전통 의미 첨부, 메뉴면 `[자리별 입맛 기운]`·`[메뉴 후보 — 이 안에서만]` 블록).
- `tarot-static.ts` — `buildStaticReading`(자리 라벨 × 정적 의미 × 주제 프레임, 조언/추천 자리 카드가 키워드·조언 근거, 선택 타로는 정·역 방향만으로 판정)·`buildStaticMenuVerdict`(후보 3개 + 정적 이유 + kcal).
- `tarot-share-card.ts` — satori + resvg 2D 합성. `og` 1200×630 / `story` 1080×1920. 카드 그림은 웹 정적 자산 512 webp 를 sharp 로 폭 360 JPEG data URI 로(satori 는 webp 를 못 읽음), 없으면 이름 박스. 폰트 IBM Plex Sans KR(`lib/share-fonts.ts`).
- `tarot-preview.ts` — `/tarot/s/:token`(OG 주입 index.html) + `/tarot/s/:token/image.png?format=og|story`. `.route.ts` 가 아니라 autoload 밖 — `app.ts` 가 `registerTarotPreview(app)` 로 명시 등록. PNG 는 LRU 100.
- 테스트 `tarot.test.ts` 26건(계약↔utils 동기화·정적·파싱·캐시 키·서비스 격리 DB·라우트) + `tarot-share.test.ts` 6건.

**FE 공통 — `packages/shared/src/`**: [api/tarot.api.ts](../../packages/shared/src/api/tarot.api.ts) · [hooks/useTarot.ts](../../packages/shared/src/hooks/useTarot.ts) · [stores/tarotHistoryStore.ts](../../packages/shared/src/stores/tarotHistoryStore.ts) · [embedBridge.ts](../../packages/shared/src/embedBridge.ts)(앱↔웹 WebView 계약, 테스트 3건). 게스트 키 스토어는 [usage-quota](usage-quota.md).

**웹 — `apps/web/src/`**
- 라우트: [routes/TarotPage.tsx](../../apps/web/src/routes/TarotPage.tsx)(`/tarot`, lazy) — `useReducer(tarotFlowReducer)` + `send()` 가 dispatch 전에 같은 (state, event) 로 다음 상태를 미리 계산해 `picking → placing` 전이를 감지하면 **즉시** `useCreateTarotReading().mutate` (useEffect 없음). `?spread=` 딥링크, `detectTarotRender()` 로 3D/Lite 결정. [TarotSharedPage.tsx](../../apps/web/src/routes/TarotSharedPage.tsx)(`/tarot/s/:token`, 2D) · [tarot/MyTarotPage.tsx](../../apps/web/src/routes/tarot/MyTarotPage.tsx)(`/me/tarot`, 커서 더 보기·행 내 2단계 삭제) · [tarot/MyTarotReadingPage.tsx](../../apps/web/src/routes/tarot/MyTarotReadingPage.tsx)(`/me/tarot/:id`, 공유·삭제).
- 3D 무대 [components/tarot/TarotStage.tsx](../../apps/web/src/components/tarot/TarotStage.tsx)(lazy 청크, R3F `Canvas`, 바깥 div 가 부채꼴 드래그 훑기) + `stage/`: [Scene.tsx](../../apps/web/src/components/tarot/stage/Scene.tsx)(카메라 리그 마우스 시차·세로 화면 줌아웃, 테이블·별·Sparkles·조명·원소 림 라이트·슬롯 윤곽·Bloom/Vignette) · [FanDeck.tsx](../../apps/web/src/components/tarot/stage/FanDeck.tsx)(78장 `InstancedMesh` 드로우콜 1, 스택 → 4박자 산개 셔플 → 부채꼴 → 물러난 스택; 호버는 **정지 포즈의 화면 투영 x 최근접** + 히스테리시스) · [DrawnCard.tsx](../../apps/web/src/components/tarot/stage/DrawnCard.tsx)(뽑힌 카드 개별 mesh, 6재질, 앞면 512 지연 로드, 시간 기반 플립 yaw π→0·역방향 roll 0→π·발광 피크·Sparkles 버스트) · [layout.ts](../../apps/web/src/components/tarot/stage/layout.ts)(카드 치수·카메라·포즈 수학·`TIMING`) · [textures.ts](../../apps/web/src/components/tarot/stage/textures.ts)(URL 별 1회 로드, 미생성 카드는 캔버스 placeholder) · [StageContext.ts](../../apps/web/src/components/tarot/stage/StageContext.ts)(`segmentKey`/`syncTimeline`/`fireOnce` — 세그먼트 타임라인 단일화).
- DOM: [TarotOverlay.tsx](../../apps/web/src/components/tarot/TarotOverlay.tsx)(설정 패널·HUD·해석 패널·로컬 기록·공유 근거 산출, `pointer-events-none` 컨테이너) · [TarotLite.tsx](../../apps/web/src/components/tarot/TarotLite.tsx)(가로 스크롤 부채꼴 + CSS 3D 플립) · [TarotCardImage.tsx](../../apps/web/src/components/tarot/TarotCardImage.tsx)(실패 시 이름 박스) · [TarotShareSheet.tsx](../../apps/web/src/components/tarot/TarotShareSheet.tsx) · [TarotReadingView.tsx](../../apps/web/src/components/tarot/TarotReadingView.tsx)(공유·기록 상세 공용 2D) · [TarotMenuBox.tsx](../../apps/web/src/components/tarot/TarotMenuBox.tsx) · [tarotQuality.ts](../../apps/web/src/components/tarot/tarotQuality.ts) · [tarotTheme.ts](../../apps/web/src/components/tarot/tarotTheme.ts)(원소색·면책 문구) · [useTypewriter.ts](../../apps/web/src/components/tarot/useTypewriter.ts)(60cps).
- 임베드: [lib/embed.ts](../../apps/web/src/lib/embed.ts)(`isEmbedMode`) → `PublicLayout` 이 상단바·사이드바 없이 `headerHeight 0` 으로 그린다. `main.tsx` 가 부팅 시 `readLpEmbedInit()` 로 토큰·게스트 키·테마를 스토어에 주입.
- 빌드: `vite.config.ts` 의 `three` 벤더 청크(three·@react-three·postprocessing 등)와 dev 프록시 `^/tarot/s/[^/]+/image\.png` → friendly.
- 자산 [apps/web/public/tarot/cards/](../../apps/web/public/tarot/cards/) — webp 158장(79 × 512/1024) + `manifest.json`. 웹 테스트 10건(TarotPage 6·Shared 2·My 2, jsdom 은 Lite).

**앱 — `apps/mobile/`**: [app/tarot/index.tsx](../../apps/mobile/app/tarot/index.tsx) 가 `${webUrl}/tarot?embed=1[&spread=]` 를 `react-native-webview` 로 연다. `injectedJavaScriptBeforeContentLoaded` 로 `window.__LP_EMBED__ = {token, guestKey, theme}` 주입, `onMessage` 로 `share`(OS 공유 시트)·`open`(외부 브라우저)·`title` 처리, 같은 origin 만 WebView 안(밖은 `Linking.openURL`), Android 하드웨어 뒤로가기는 WebView 히스토리 먼저. [TarotEntryCard.tsx](../../apps/mobile/src/components/home/TarotEntryCard.tsx) 는 홈에서 `/tarot`·`/tarot?spread=menu` 로. [lib/api-setup.ts](../../apps/mobile/src/lib/api-setup.ts) 가 `webUrl`(운영 = apiUrl, 개발 `:3000 → :5173`, 또는 `EXPO_PUBLIC_WEB_URL`)과 `setGuestKeyStorage(AsyncStorage)` 를 둔다.

**스크립트**: [scripts/build-tarot-deck.ts](../../apps/friendly/scripts/build-tarot-deck.ts)(`assets-src/tarot/raw/<id>.png|jpg|webp` → 7:12 중앙 크롭 → webp q82 두 사이즈, 뒷면은 4방향 강제 대칭, `--placeholders`·`--only`·`--no-symmetrize`, `manifest.json` 에 placeholder/missing 기록) · [scripts/probe-tarot-reading.ts](../../apps/friendly/scripts/probe-tarot-reading.ts)(`--models=a,b --samples --seed --show`, 샘플 풀 8, 서비스와 같은 `requestTarotLlm`).

## Talks To [coverage: high — 15 sources]

- **[ai](ai.md)** — `AiConfigService.getResolved('ollama-cloud', 'tarot')` 로 키·모델을 받고 `adapterCache` 어댑터로 호출. purpose `tarot` 은 `LlmProviderPurpose` 에 추가돼 어드민 AI 키 화면에 자동 노출되고, `OLLAMA_TAROT_MODEL`(기본 `gpt-oss:120b`) 은 DB 행이 없을 때 초기값. `aiModel.ts` 의 추천 규칙은 `chat·meal-recommend` 와 같이 규모 중앙값. 키 미설정이면 경고 로그 후 정적 해석.
- **[usage-quota](usage-quota.md)** — `app.usageQuota`(플러그인 싱글턴) 의 `consume('tarot-reading', actor)` → `{allowed, reason, remainingToday}`, `remainingForGuest`, `getSetting`(30초 캐시 — 리딩 라우트의 rate-limit `max` 가 매 요청 `ipPerMinute` 을 여기서 읽는다), `today()`(KST 날짜 키). 기본값 게스트 50/일·IP 500/일·IP 20/분·전역 5,000/일·게스트 컷 90%. 캐시 히트는 한도를 소비하지 않는다.
- **jwt 플러그인** `resolveOptionalUser` — 무효 토큰도 401 이 아니라 게스트로. **rate-limit** `RATE.tarotShare`(10/분, 무인증 쓰기) · `RATE.publicShare`(120/분).
- **[food](food.md)** — 메뉴 후보 이름을 `normalizeTerm` 으로 정규화해 `foodItem.nameNorm` 정확 일치 + `kcal not null` 만 1인분 kcal 로. 실패해도 warn 만.
- **[friendly](friendly.md) 공용 lib** — `web-index.ts`(`loadWebIndex`·`injectOg`·`candidateWebAssetRoots` — dist/public 탐색) · `share-fonts.ts`(Plex KR ttf). 정산·투표·사주 프리렌더와 같은 패턴([vote](vote.md) 의 vote-preview 미러).
- **운영 nginx**([project-overview](project-overview.md)) — `location ^~ /tarot/s/` 프록시, `location ^~ /tarot/cards/`(7일 캐시·진짜 404), SPA 폴백 `try_files $uri /index.html`(`$uri/` 제거).
- **[web](web.md)** — `PublicLayout` 임베드 분기, `PublicSidebar`/`PublicTopBar` "타로"(대기질 다음), `HomePage` 진입 카드, `AccountMenu` "내 타로 기록". **[shared](shared.md)** — 게스트 키·persist 주입 패턴·임베드 브리지. **[mobile](mobile.md)** — WebView 화면.
- **[saju-c](saju-c.md)** · **[saju-g](saju-g.md)** — 같은 뼈대(옵셔널 인증 + 게스트 키 + usage-quota, 루트 경로 OG 프리렌더 + satori 이미지, 앱 WebView 임베드)를 재사용한 후속 기능.

## API Surface [coverage: high — 10 sources]

| 메서드 | 경로 | 인증 | 한도 | 비고 |
|---|---|---|---|---|
| POST | `/api/v1/tarot/readings` | optional + `X-Guest-Key` | IP `ipPerMinute`(설정값) + usage-quota | `CreateTarotReadingInput{spreadId, topic='general', question≤200, choices?, cards 1~10}` → `TarotReadingResult`. 회원은 저장 후 `readingId`, 게스트는 `quota.remainingToday` 숫자. daily 는 회원이면 오늘 것 재반환 |
| POST | `/api/v1/tarot/shares` | optional | `tarotShare` 10/분 | `{readingId}`(회원) 또는 `{reading}`(게스트·회원 로컬 기록) + `includeQuestion` → `{token, path:'/tarot/s/<t>', includeQuestion}` |
| GET | `/api/v1/tarot/shares/:token` | 공개 | `publicShare` | `SharedTarotReading`(readingId·quota 없음, 질문은 포함 시에만). 없음 404 |
| GET | `/api/v1/tarot/me/readings?cursor&limit` | Bearer | | `ListTarotReadingsResult`(limit 1~50, 기본 20, 최신순 id 커서) |
| GET / DELETE | `/api/v1/tarot/me/readings/:id` | Bearer | | 200 `TarotReadingResult` / 204. 타인·없음 404 |
| GET | `/tarot/s/:token` | 공개(origin 루트) | `publicShare` | OG 주입 index.html(`[타로] {키워드} · {스프레드}`), cache 60s. 없는 토큰은 일반 OG |
| GET | `/tarot/s/:token/image.png?format=og\|story` | 공개(origin 루트) | `publicShare` | PNG, cache 300s. 없음 404 |

응답 `TarotReadingResult`: `readingId, spreadId, topic, question, choices, source('llm'|'static'), model, cards[{cardId, position, positionLabel, reversed, nameKo, nameEn, keywords, text}], summary, advice, keyword, choice{recommended A|B|either, confidence low|mid|high, reason}|null, menu{picks[{menuId, name, cuisine, dishType, kcal|null, reason}], profile, avoid}|null(기본 null), createdAt, quota{remainingToday}`.

**shared** — `tarotApi.{createReading, createShare, getShared, listMine, getMine, deleteMine}`(게스트 키는 `getGuestKey()` 로 헤더 첨부). 훅 `useCreateTarotReading`(성공 시 `['tarot','mine']` 무효화) · `useCreateTarotShare` · `useSharedTarotReading`(staleTime 10분, retry 없음) · `useMyTarotReadings` · `useMyTarotReadingsInfinite`(커서) · `useMyTarotReading` · `useDeleteTarotReading`. 스토어 `useTarotHistoryStore{entries, add, remove, clear}` + `setTarotHistoryStorage`. 브리지 `isLpEmbedded` · `readLpEmbedInit` · `postLpEmbedMessage` · `buildLpEmbedInjection` · `parseLpEmbedMessage`, 타입 `LpEmbedInit{token, guestKey, theme?}` · `LpEmbedMessage(share|open|title)`.

**utils** — `TAROT_CARDS/TAROT_CARD_BY_ID/getTarotCard/isTarotCardId`, `TAROT_TOPICS/TAROT_TOPIC_LABEL`, `TAROT_SPREADS/TAROT_SPREAD_LIST/TAROT_AVAILABLE_SPREADS/getTarotSpread`, `createSeededRng/shuffleTarotDeck/buildDrawnCards/pickRandomCards/validateDrawnCards`, `tarotCardImagePath/tarotCardBackImagePath/TAROT_CARD_DIMENSIONS`, `createTarotFlowState/tarotFlowReducer/getTarotSetupError/tarotRequiredPicks/tarotRemainingPicks/canPickTarotCard/newTarotSeed`, `TAROT_MENU_ITEMS/tarotCardAppetite/selectTarotMenus/tarotAppetiteLabel` + 라벨 상수.

**웹 쿼리** — `/tarot?spread=<id>`(제공 중·비회원 스프레드만) · `?embed=1`(크롬 제거, 세션 기억) · `?lite=1`(Lite 강제) · `?3d=1`(reduced-motion 무시). **스크립트** — `pnpm --filter friendly build:tarot-deck` · `probe:tarot-reading`.

## Data [coverage: high — 10 sources]

- **`TarotReading`(`tarot_readings`)** — 마이그레이션 `20260903120000_add_tarot_reading_and_usage_quota`(usage_quota_settings/counters 동반 생성) + `20260903130000_add_tarot_share_question`. 컬럼: `id cuid` · `userId?`(FK users cascade) · `guestKey?`(게스트 공유 행만) · `shareToken? unique` · `spreadId` · `topic` · `question ''` · `choicesJson?` · `cardsJson`(`[{cardId, position, reversed}]`) · `resultJson`(해석 본문 = `source, model, cards, summary, advice, keyword, choice, menu`) · `source` · `model?` · `promptVersion Int 기본 1` · `dayKey`(KST) · `dailyLockKey? unique`(`userId:dayKey`, daily 스프레드 회원 저장분만; 공유용 행은 `skipDailyLock`) · `shareQuestion 기본 false` · `createdAt`. 인덱스 `(userId, createdAt)`. 읽을 때 `parseBody` 가 계약 검증 실패 행도 필드 단위로 최대한 살린다.
- **행이 생기는 경우**: 회원 리딩(자동), 게스트/회원 공유(`POST /shares` 에 `reading`). 게스트 일반 리딩은 서버에 흔적이 없다(질문은 로그·텔레메트리에도 안 남김).
- **메모리 캐시**: `TarotService.cache` LRU 2,000 · 24h(프로세스별, 재기동 시 소멸) · `tarot-preview` `pngCache` LRU 100(`token:format`) · `tarot-share-card` `imageCache`(cardId → data URI Promise, 무제한 Map) · 웹 `textures.ts` URL 별 텍스처 Map + placeholder 캔버스 Map.
- **클라이언트 저장**: `tarot-history-v1`(zustand persist, 게스트 로컬 기록 최대 50, `{id, createdAt, cards, result}`) · `guest-key-v1`(기기 UUID, [usage-quota](usage-quota.md)) · sessionStorage `lp:embed`(임베드 기억) · `lp:token`/`lp:guest`(웹 세션, 임베드 주입값이 우선). 앱은 `setGuestKeyStorage(AsyncStorage)` 만 주입(타로 기록 스토어는 WebView 안 웹 localStorage 가 담당).
- **정적 자산**: `apps/web/public/tarot/cards/` 158 webp(78장 + `back`, 각 512·1024) + `manifest.json`(79 entries, placeholder 0, missing 0, builtAt 2026-09-02T12:01Z, 원본 `assets-src/tarot/raw/*.jpg` 는 gitignore). 웹 dist 에 포함돼 nginx 가 서빙하고 앱 WebView 도 같은 URL.
- **정적 데이터 규모**: 카드 78(메이저 22 + 수트 4×14), 스프레드 6(제공 5), 주제 7, 메뉴 97, 메이저 무드 표 22.

## Key Decisions [coverage: high — 13 sources]

- **2026-09-06 (`624ead4`) 앱은 WebView 임베드, RN 포팅 안 함** — 브리지 계약은 `@repo/shared` `embedBridge.ts` 한 곳. 앱 → 웹은 로드 전 `window.__LP_EMBED__` 주입(JSON 직렬화라 인젝션 없음), **토큰은 URL 에 싣지 않는다**. 웹 → 앱은 `postMessage(JSON)` `share/open/title`(WebView 는 `navigator.share`·`<a download>` 가 안 됨). 주입값은 첫 마운트에 고정. `?embed=1` 을 한 번 보면 sessionStorage 에 기억해 링크 이동한 공유·기록 페이지도 크롬 없이.
- **2026-09-05 (`13b87e8`) 피할 것이 추천과 같은 원소면 "과한 쪽만"** — `avoid === pick` 원소일 때 `TAROT_MENU_ELEMENT_EXCESS` 로 풀어 "피할 것 = 추천" 으로 읽히지 않게. 같은 커밋에 운영 nginx SPA 폴백 충돌 기록.
- **2026-09-05 (`5d0c4c7`, v3a) 메뉴 타로 — 후보는 코드가 결정적으로, LLM 은 이유만** — 없는 메뉴를 지어내지 못하게 서버가 `menuId` 를 후보와 대조(모르는 id 버림, 빠진 후보는 정적 이유 유지). 같은 카드면 늘 같은 후보라 캐시·공유·**결과 전 미리보기**(웹 `previewMenu` 가 같은 utils 규칙)가 일치. 주제 `food` 는 리듀서와 서버 `normalizeTarotInput` 이 이중으로 잠근다. 키워드는 추천 메뉴 이름으로 고정(OG 제목·기록 목록에 메뉴가 보임). 프롬프트 v2 → 캐시 키 갱신. kcal 은 카탈로그 정확 일치일 때만.
- **2026-09-02 (`fae8190`, 4차) 기본 한도 상향** — 계획 초안 5/60/6/300/80 → 50/500/20/5000/90("정상 사용자가 걸리지 않게, 비용이 문제 되면 어드민에서 내린다"). 값의 단일 출처는 `USAGE_QUOTA_DEFAULTS`, 운영 조정은 `/admin/settings/quotas`. 해석 패널은 **결과가 오면 결과의 카드 메타를 진실로**(회원 daily 잠금으로 뽑은 카드와 다른 카드가 돌아올 수 있음). 설정 패널은 오늘 daily 가 있으면 섞기 비활성 + "오늘 카드 보기".
- **2026-09-02 (`7de9033`·`2eee38c`) 부채꼴 호버는 정지 포즈 투영 기준** — 레이캐스트 호버는 들린 카드가 포인터 밑에서 빠지며 이웃으로 바뀌는 "팝콘" 떨림. 정지 포즈의 화면 x 최근접 + 히스테리시스 0.004 NDC + 세로 띠 ±0.42, 이웃 7장은 거리 반비례로 밀어 자리를 내준다. 겹침 순서는 `fanDepthRank` **엄격 단조**(78장 정중앙 두 장 동점 제거) z 후퇴 0.008, 물결은 부채꼴 전체 동일 위상.
- **2026-09-02 (`98df15a`, 3차) 공유는 서버가 만든 해석만 게시** — 게스트는 리딩 **입력**을 다시 보내고 서버가 캐시/LLM/정적으로 본문을 확보해 행을 만든다(클라 텍스트를 우리 도메인 아래 게시하지 않기 위해). 회원은 `readingId` 로 저장 행에 토큰만(재요청 시 같은 토큰, `shareQuestion` 만 갱신). 토큰은 정산과 같은 7바이트 base64url(10자). 만료 없음. 질문 기본 숨김. 이미지는 WebGL 캡처가 아니라 satori+resvg 2D 합성이라 서버에서 결정적.
- **2026-09-02 (`6a414ef`, 2차) 하이브리드 무대 + Lite 폴백 + 시드 결정 리듀서** — Canvas 는 무대, 한글 텍스트·입력·해석은 DOM. WebGL2 없음·`prefers-reduced-motion`·`?lite=1` 은 `TarotLite`(애니메이션 두 벌 안 만듦, 결정 13). 품질 등급 high(dpr≤2, Sparkles 360, Stars 2400, bloom) / medium(coarse pointer 또는 폭<768: dpr≤1.5, 1/3 파티클, bloom 끔). 텍스처 예산: 부채꼴은 뒷면 1장 공유, 앞면은 뽑힌 카드만 512 지연 로드. 리듀서를 `seed` 기반 결정적으로 바꿔 StrictMode 이중 호출·"dispatch 전에 next 미리 계산해 API 발사" 가 안전. 사이드바 "타로"(대기질 다음), 홈 카드, Noto Serif KR 타이틀(`font-serif-kr`).
- **2026-09-02 (`58842db`) 카드 webp 산출물은 커밋, raw 는 gitignore** — 웹 dist 가 서빙하고 앱도 같은 URL.
- **2026-09-02 (`cd5a29b`, 0·1차)** — 뽑기는 클라이언트(부채꼴에서 직접 고르는 경험이 핵심, 결과에 이해관계 없음), 서버는 검증만. 카드 의미는 정적 데이터를 프롬프트에 그대로 넣어 전통 의미와 어긋나지 않게 하고 LLM 은 "엮기"만. 질문은 데이터 블록(주입 방어)·로그 미기록. 정적 폴백으로 화면은 절대 비지 않음. 역방향 30%(50% 는 체감상 너무 어두움). 회원 daily 잠금은 `dailyLockKey` unique 로(초안의 복합 unique 대신). 한도 env(`TAROT_*_LIMIT`)는 두지 않고 코드 기본값 + 어드민 DB 행. 기본 모델 `gpt-oss:120b`(프로브 4/4·p50 2.1s vs `gemma4:31b` 4/4·3.1s). api-contract 는 utils 에 의존하지 않고 enum 을 복제 + 테스트로 동기화.
- **2026-09-02 계획 결정 1~16**([docs/PLAN-tarot.md](../../docs/PLAN-tarot.md)) — 웹 먼저·앱은 WebView, 78장 전부 장면형, 제미나이 생성(민화풍+금박 1순위), WebGL 수준, 로그인 없이 무료 + 공통 익명 한도 + 회원 면제, 한도는 어드민, 역방향 30%, 질문 칩+200자, 게스트 공유 시에만 저장, satori v1, 효과음 기본 꺼짐, Lite 최소 모드, 3D 는 테스트 없이 흐름만, 켈틱 v2·메뉴 v3, 오늘의 카드 하루 1장.

## Gotchas [coverage: high — 16 sources]

- **nginx SPA 폴백 `$uri/` 충돌(운영 실측 2026-09-05)** — dist 에 `tarot/cards/` 가 생겨 `/tarot` 가 실제 디렉터리가 됐고 `try_files $uri $uri/ /index.html` 이면 직접 진입·새로고침이 `301 /tarot/` → 403. `try_files $uri /index.html` 로 고쳤고 `absolute_redirect off` 권장. SPA 내부 이동은 멀쩡해 늦게 발견된다.
- **`location ^~ /tarot/s/` 필수** — 없으면 `.png` 정규식 location 이 이미지를 가로채 404, SPA 는 동작하고 OG·이미지만 빠진다. `/tarot/cards/` 는 index.html 폴백이 아니라 **진짜 404** 여야 웹이 이름 박스 대체 카드를 그린다(7일 캐시 — 같은 파일명으로 재생성 가능해 1년 immutable 아님). index.html 은 프로세스 수명 1회 캐시(`loadWebIndex`)라 웹 재배포 후 friendly 재시작 필요.
- **PLAN 과 코드 차이** — ① 계획은 "정적 해석이면 'AI 해석 다시 시도' 버튼" 이라 했지만 코드는 `resultStatus === 'failed'`(요청 실패)일 때만 재시도 버튼, `source:'static'` 은 "카드 기본 해석" 배지만. ② 메뉴 "100종" 이라 쓰였지만 `TAROT_MENU_ITEMS` 는 97개(테스트는 ≥80 만 검사). ③ 결정 16 "오늘의 카드는 게스트 기기·회원 계정 잠금" 이지만 서버 잠금은 **회원만**(`dailyLockKey` = userId) — 게스트는 다시 뽑을 수 있다(캐시 156 조합이라 LLM 비용은 없음). ④ 효과음(결정 12)은 미구현(v2 후보). ⑤ 계획의 컴포넌트 명(`Deck/CardMesh/Particles/Effects/Table.tsx`)·`GET /tarot/shares/:token/image.png` 는 실제 `stage/FanDeck·DrawnCard·Scene` / 루트 `/tarot/s/:token/image.png` 로 바뀌었다. ⑥ 커밋 `58842db` 메시지는 "52장 + 뒷면, 27장 미생성" 이지만 커밋된 트리와 manifest 는 79장 전부 실제 이미지.
- **`?embed=1` 은 탭 세션에 남는다** — 일반 브라우저에서 한 번 열면 그 탭에서 이동하는 모든 페이지가 크롬 없이 그려진다(sessionStorage `lp:embed`). 새 탭으로 열면 복귀.
- **임베드 주입값은 첫 마운트 고정** — 앱에서 로그인 상태가 바뀌어도 열려 있는 WebView 는 모른다(타로 화면을 다시 열어야 반영). 반대로 웹 `main.tsx` 는 브리지가 있으면 localStorage 토큰보다 주입값을 우선하고, 주입값에 토큰이 없으면 저장된 토큰을 **지운다**(앱 로그아웃 뒤 옛 세션 방지). **iOS 실기기(WKWebView WebGL·성능)는 미확인**(PLAN 2026-09-05).
- **회원 daily 는 다른 카드가 돌아올 수 있다** — 새로 뽑아도 서버가 오늘 저장분을 돌려주므로 3D 에 뒤집힌 카드와 패널 카드가 다를 수 있다. 패널은 결과 카드를 진실로 쓰고, `todayDailyId` 는 최근 20건 목록에서 KST 날짜로 찾는다(오늘 20건 넘게 뽑은 회원은 잠금 안내가 빠질 수 있으나 서버는 여전히 잠근다).
- **게스트 키는 신뢰 경계가 아니다** — 클라 선언값(형식 밖이면 null → IP 한도만). 기기 한도 우회는 IP 일일·전역 예산이 2차 방어. 캐시 히트는 한도를 소비하지 않지만 `remainingToday` 는 매번 계산해 내려준다.
- **게스트 공유는 LLM 을 다시 부를 수 있다** — `POST /shares` 에 입력을 보내면 `resolveBody` 가 다시 돌아 캐시(24h)가 식었으면 한도 소비 + LLM 호출. 분당 10 으로 막는다. 게스트 공유 행은 삭제 경로가 없다(계획 기본값: 게스트 삭제 불가, 회원 삭제 시 공유도 404).
- **토큰 5회 충돌 시 `TarotError('not_found')` → 404** — 정산·투표는 같은 상황을 500 으로 고쳤다([vote](vote.md) `6a3a022`). 56bit 5연속 충돌은 사실상 서버 이상.
- **`promptVersion` 컬럼 기본 1, 현재 상수 2** — 캐시 키에 버전이 들어가 배포 시 자동 무효화되지만 저장 행은 당시 버전을 유지. `menu` 필드는 구행 호환으로 기본 null.
- **3D 구현 함정(코드 주석에 기록)** — three 는 `InstancedMesh.boundingSphere` 를 첫 레이캐스트 때 한 번만 계산해 스택 상태 구 밖의 부채꼴은 클릭이 안 잡힘 → 고정 구(반지름 60). 무대 안 여러 `useFrame` 이 서로 다른 세그먼트 키로 타임라인을 리셋하면 셔플이 영영 안 끝남 → `segmentKey(phase, revealed)` 단일화. 드래그 끝 클릭은 `e.delta > 6` 이면 무시.
- **LLM 타임아웃 20초 안에 수리 재시도까지** — AbortController 하나가 두 호출을 덮는다. 초과·파싱 실패·provider 예외는 전부 warn 로그 + 정적 해석(에러 응답 없음). 운영 모델은 어드민 DB 값이 우선(PLAN 진행 기록은 `gemma4:31b`, env 기본은 `gpt-oss:120b`).
- **익명 트래픽이 Ollama Cloud 계정 쿼터를 공유** — 식단 기능과 같은 키를 쓰면 한도를 나눠 쓴다. purpose 전용 키(own) 권장(env 주석).
- **kcal 은 거의 null** — 메뉴 이름이 카탈로그 `nameNorm` 과 정확히 같을 때만. 선택 타로 정적 판정은 정·역 방향만으로(같으면 `either`·low).
- **테스트 환경은 항상 Lite** — jsdom 에 WebGL2 가 없어 `data-tarot-mode="lite"`. 3D 레이어는 단위 테스트 없음(결정 14). 웹 테스트는 `?lite` 판정·설정→섞기→3장→해석·메뉴 미리보기·딥링크·선택지 검증·실패 재시도를 친다.

## Sources [coverage: high — 66 sources]

- [packages/utils/src/tarotCards.ts](../../packages/utils/src/tarotCards.ts) (+[test](../../packages/utils/src/tarotCards.test.ts) 6건) — 78장 데이터
- [packages/utils/src/tarot.ts](../../packages/utils/src/tarot.ts) (+[test](../../packages/utils/src/tarot.test.ts) 18건) — 주제·스프레드·난수·뽑기·검증·이미지 경로
- [packages/utils/src/tarotFlow.ts](../../packages/utils/src/tarotFlow.ts) (+[test](../../packages/utils/src/tarotFlow.test.ts) 16건) — 흐름 리듀서
- [packages/utils/src/tarotMenu.ts](../../packages/utils/src/tarotMenu.ts) (+[test](../../packages/utils/src/tarotMenu.test.ts) 12건) — 메뉴 97종·기운·선택
- [packages/api-contract/src/schemas/tarot.ts](../../packages/api-contract/src/schemas/tarot.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.Tarot`
- [packages/shared/src/api/tarot.api.ts](../../packages/shared/src/api/tarot.api.ts)
- [packages/shared/src/hooks/useTarot.ts](../../packages/shared/src/hooks/useTarot.ts)
- [packages/shared/src/stores/tarotHistoryStore.ts](../../packages/shared/src/stores/tarotHistoryStore.ts) — `tarot-history-v1`
- [packages/shared/src/embedBridge.ts](../../packages/shared/src/embedBridge.ts) (+[test](../../packages/shared/src/embedBridge.test.ts) 3건)
- [apps/friendly/src/modules/tarot/tarot.route.ts](../../apps/friendly/src/modules/tarot/tarot.route.ts)
- [apps/friendly/src/modules/tarot/tarot.service.ts](../../apps/friendly/src/modules/tarot/tarot.service.ts)
- [apps/friendly/src/modules/tarot/tarot.prompts.ts](../../apps/friendly/src/modules/tarot/tarot.prompts.ts) — `TAROT_PROMPT_VERSION = 2`
- [apps/friendly/src/modules/tarot/tarot-static.ts](../../apps/friendly/src/modules/tarot/tarot-static.ts)
- [apps/friendly/src/modules/tarot/tarot-share-card.ts](../../apps/friendly/src/modules/tarot/tarot-share-card.ts)
- [apps/friendly/src/modules/tarot/tarot-preview.ts](../../apps/friendly/src/modules/tarot/tarot-preview.ts)
- [apps/friendly/src/modules/tarot/tarot.test.ts](../../apps/friendly/src/modules/tarot/tarot.test.ts) — 26건
- [apps/friendly/src/modules/tarot/tarot-share.test.ts](../../apps/friendly/src/modules/tarot/tarot-share.test.ts) — 6건
- [apps/friendly/scripts/build-tarot-deck.ts](../../apps/friendly/scripts/build-tarot-deck.ts)
- [apps/friendly/scripts/probe-tarot-reading.ts](../../apps/friendly/scripts/probe-tarot-reading.ts)
- [apps/friendly/prisma/migrations/20260903120000_add_tarot_reading_and_usage_quota/migration.sql](../../apps/friendly/prisma/migrations/20260903120000_add_tarot_reading_and_usage_quota/migration.sql)
- [apps/friendly/prisma/migrations/20260903130000_add_tarot_share_question/migration.sql](../../apps/friendly/prisma/migrations/20260903130000_add_tarot_share_question/migration.sql)
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — `TarotReading`
- [apps/friendly/src/app.ts](../../apps/friendly/src/app.ts) — `registerTarotPreview`
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) — `OLLAMA_TAROT_MODEL`
- [apps/friendly/.env.example](../../apps/friendly/.env.example) — 프로브 실측 주석
- [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — `RATE.tarotShare`
- [apps/friendly/src/plugins/jwt.ts](../../apps/friendly/src/plugins/jwt.ts) — `resolveOptionalUser`
- [apps/friendly/src/modules/usage-quota/usage-quota.service.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.service.ts) — `USAGE_QUOTA_DEFAULTS['tarot-reading']`
- [apps/web/src/routes/TarotPage.tsx](../../apps/web/src/routes/TarotPage.tsx) (+[test](../../apps/web/src/routes/TarotPage.test.tsx) 6건)
- [apps/web/src/routes/TarotSharedPage.tsx](../../apps/web/src/routes/TarotSharedPage.tsx) (+[test](../../apps/web/src/routes/TarotSharedPage.test.tsx) 2건)
- [apps/web/src/routes/tarot/MyTarotPage.tsx](../../apps/web/src/routes/tarot/MyTarotPage.tsx) (+[test](../../apps/web/src/routes/tarot/MyTarotPage.test.tsx) 2건)
- [apps/web/src/routes/tarot/MyTarotReadingPage.tsx](../../apps/web/src/routes/tarot/MyTarotReadingPage.tsx)
- [apps/web/src/components/tarot/TarotStage.tsx](../../apps/web/src/components/tarot/TarotStage.tsx)
- [apps/web/src/components/tarot/stage/Scene.tsx](../../apps/web/src/components/tarot/stage/Scene.tsx)
- [apps/web/src/components/tarot/stage/FanDeck.tsx](../../apps/web/src/components/tarot/stage/FanDeck.tsx)
- [apps/web/src/components/tarot/stage/DrawnCard.tsx](../../apps/web/src/components/tarot/stage/DrawnCard.tsx)
- [apps/web/src/components/tarot/stage/layout.ts](../../apps/web/src/components/tarot/stage/layout.ts)
- [apps/web/src/components/tarot/stage/textures.ts](../../apps/web/src/components/tarot/stage/textures.ts)
- [apps/web/src/components/tarot/stage/StageContext.ts](../../apps/web/src/components/tarot/stage/StageContext.ts)
- [apps/web/src/components/tarot/TarotOverlay.tsx](../../apps/web/src/components/tarot/TarotOverlay.tsx)
- [apps/web/src/components/tarot/TarotLite.tsx](../../apps/web/src/components/tarot/TarotLite.tsx)
- [apps/web/src/components/tarot/TarotCardImage.tsx](../../apps/web/src/components/tarot/TarotCardImage.tsx)
- [apps/web/src/components/tarot/TarotShareSheet.tsx](../../apps/web/src/components/tarot/TarotShareSheet.tsx)
- [apps/web/src/components/tarot/TarotReadingView.tsx](../../apps/web/src/components/tarot/TarotReadingView.tsx)
- [apps/web/src/components/tarot/TarotMenuBox.tsx](../../apps/web/src/components/tarot/TarotMenuBox.tsx)
- [apps/web/src/components/tarot/tarotQuality.ts](../../apps/web/src/components/tarot/tarotQuality.ts)
- [apps/web/src/components/tarot/tarotTheme.ts](../../apps/web/src/components/tarot/tarotTheme.ts)
- [apps/web/src/components/tarot/useTypewriter.ts](../../apps/web/src/components/tarot/useTypewriter.ts)
- [apps/web/src/lib/embed.ts](../../apps/web/src/lib/embed.ts) — `lp:embed`
- [apps/web/src/main.tsx](../../apps/web/src/main.tsx) — `readLpEmbedInit` 부팅 주입
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx) — 타로 라우트 4개(lazy)
- [apps/web/src/components/PublicLayout.tsx](../../apps/web/src/components/PublicLayout.tsx) — 임베드 분기
- [apps/web/src/components/PublicSidebar.tsx](../../apps/web/src/components/PublicSidebar.tsx) · [PublicTopBar.tsx](../../apps/web/src/components/PublicTopBar.tsx) — "타로" 메뉴
- [apps/web/src/components/AccountMenu.tsx](../../apps/web/src/components/AccountMenu.tsx) — "내 타로 기록"
- [apps/web/src/routes/HomePage.tsx](../../apps/web/src/routes/HomePage.tsx) — 진입 카드
- [apps/web/vite.config.ts](../../apps/web/vite.config.ts) — `three` 벤더 청크·이미지 dev 프록시
- [apps/web/public/tarot/cards/](../../apps/web/public/tarot/cards/) — webp 158장 + manifest.json
- [apps/web/index.html](../../apps/web/index.html) · [styles/tailwind.css](../../apps/web/src/styles/tailwind.css) — Noto Serif KR `font-serif-kr`
- [apps/mobile/app/tarot/index.tsx](../../apps/mobile/app/tarot/index.tsx) — WebView 화면
- [apps/mobile/src/components/home/TarotEntryCard.tsx](../../apps/mobile/src/components/home/TarotEntryCard.tsx)
- [apps/mobile/src/lib/api-setup.ts](../../apps/mobile/src/lib/api-setup.ts) — `webUrl`·`setGuestKeyStorage`
- [docs/PLAN-tarot.md](../../docs/PLAN-tarot.md) — 결정 표·로드맵·진행 기록
- [docs/tarot-deck-prompts.md](../../docs/tarot-deck-prompts.md) — 스타일 바이블·뒷면·78장 프롬프트·검수표
- [docs/deploy-friendly.md](../../docs/deploy-friendly.md) — nginx 타로 절·SPA 폴백 충돌
- [ops/nginx/niney_life_pickr_v2_projects](../../ops/nginx/niney_life_pickr_v2_projects) — `^~ /tarot/s/`·`^~ /tarot/cards/`
