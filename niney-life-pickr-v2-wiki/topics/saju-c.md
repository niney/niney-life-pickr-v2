---
topic: saju-c
last_compiled: 2026-09-07
sources_count: 73
status: active
aliases: [사주, 사주(C), saju-c, 사주팔자, 만세력, 명식, 원국, 천문도, 일간, 십신, 신살, 대운, 오늘의 운세, 택일, 궁합, 오행 음식, computeSajuChart, SajuService, SajuJobRegistry, useSajuJob, sajuProfileStore, saju-reading, OLLAMA_SAJU_MODEL, SajuReadingPanel, kimi-k3]
---

# saju-c — 사주(C), 생년월일시로 세우는 사주팔자와 풀이

**2026-09-06~07 신설 — 0차 엔진(`db1415f`) → 1·4차 API(`f8e5dd0`) → 2~4차 웹·앱(`0a7f637`) → 5·6·7차 콘텐츠 확장(`ab2988f`·`f47e963`·`7358c86`)**. "계산은 코드, 문장은 LLM, 무대는 천문도" 라는 원칙으로, 사주 계산은 `@repo/utils` 순수 코드가 결정적으로 하고 LLM(Ollama Cloud, 기본 `kimi-k3`)은 계산된 사실을 문장으로 엮기만 한다. LLM 이 없거나 한도를 넘어도 정적 풀이로 항상 동작한다. 타로([tarot](tarot.md))와 같은 골격(게스트 키 한도·공유 토큰·OG·satori 이미지·앱 WebView 임베드)을 쓰되 무대 연출은 흑요석 천문도 원판·인장·먹 번짐으로 다르게 만들었다. 경로는 `/saju-c`, 표시 명칭은 "사주(C)"(`5f49026`) — 같은 날 다른 세션이 만든 별도 구현 [saju-g](saju-g.md)와 나란히 두기 위해서다. `docs/PLAN-saju.md` 가 결정·기본값·엔진 규칙·차수별 진행 기록의 단일 출처다.

## Purpose [coverage: high — 8 sources]

생년월일시·성별을 넣으면 사주팔자(8글자, 시간 모르면 6글자)를 세우고 성격·올해·대운·조언 4섹션을 풀어 준다. 여기에 서비스 컨셉("선택을 대신 골라주는")과 잇는 도구 4종 — **오늘의 운세**(일진 점수·별점), **오행 음식**(메뉴 3개), **택일**(최대 60일 히트맵 + 상위 3), **궁합**(100점 5항목) — 을 풀이 패널 탭으로 붙였다. 접근 정책은 타로와 같다: 로그인 없이 무료, 공용 익명 한도([usage-quota](usage-quota.md)) feature `saju-reading`, 회원은 자동 저장 + 한도 면제.

의존하는 곳: 웹 `/saju-c`(공개)·`/saju-c/s/:token`(공유)·`/me/saju-c`(회원 프로필·기록), 웹 홈 진입 카드·사이드바·상단바 메뉴, 앱 `app/saju-c`(웹 WebView 임베드) + 홈 `SajuEntryCard`, 어드민 "사용량 한도" 탭(`saju-reading` 행)·AI 키 화면(purpose `saju`). 사주(G)와는 코드·DB·env·한도 키·경로가 전부 분리돼 서로 의존하지 않는다.

## Architecture [coverage: high — 30 sources]

**엔진(`@repo/utils`, 평면 파일)** — 웹·앱·friendly 가 같은 코드로 계산한다. 웹은 입력 즉시 원국을 계산해 연출을 시작하고, 서버는 입력만 받아 **다시 계산**한다(클라이언트가 보낸 원국은 믿지 않음).
- [sajuAstroTable.ts](../../packages/utils/src/sajuAstroTable.ts) — **생성물**(손으로 고치지 말 것). 24절기 시각 1899~2051(UTC 분, 첫 값 10진 + 이후 base36 4자리 차분) + 음력 월 표 1900~2050(연도별 `시작일수,윤달,월길이비트`). `build:saju-tables` 가 astronomy-engine 2.1.19 + 무중치윤법으로 만들었고 `--source=kasi` 로 data.go.kr 공식값으로 다시 만들 수 있다.
- [sajuCalendar.ts](../../packages/utils/src/sajuCalendar.ts) — 율리우스일(1900-01-01 = 일수 0), 절기 조회(이분 탐색), 한국 표준시 4구간(IANA Asia/Seoul: LMT 8:27:52 → 1908-04-01 8:30 → 1912 9:00 → 1954-03-21 8:30 → 1961-08-10 9:00)·서머타임 12구간(1948~51·55~60·87~88), 서울 평균태양시(UTC+8:30) 보정, 음력↔양력. 런타임 천문 계산 없음.
- [saju.ts](../../packages/utils/src/saju.ts) — 천간·지지·오행·60갑자 표, `computeSajuChart`(원국), 십신·지장간·십이운성·공망·신살 14종·관계 12종(합충형파해원진)·오행 분포·신강약·보완 오행·대운 10개·세운. 입력 오류는 `SajuInputError(code)`.
- [sajuText.ts](../../packages/utils/src/sajuText.ts) — 일간 10종 캐릭터(성향·강점·주의·연애·일), 십신·십이운성·신살·관계·오행 행운 표(색·방향·숫자·계절·맛·음식·활동·키워드), `sajuFactLines`(LLM 프롬프트·정적 풀이 공용 사실 목록), 5차 요약 헬퍼(`sajuBirthSummary`·`sajuTenGodSummary`·`zodiacTraitLine`).
- [sajuDaily.ts](../../packages/utils/src/sajuDaily.ts) — `scoreGanzhiForChart`(간지 하나를 원국에 대 본 점수, 일진·월운·세운·시진 공용 규칙) · `scoreDayForChart` · `dailyFortune` · `kstDayKey`.
- [sajuInsights.ts](../../packages/utils/src/sajuInsights.ts)(6차) — 격국(월지 정기 십신 → 8격 + 건록·양인격), 오신(용신=보완 오행·희신·기신·구신·한신), 삼재(띠 삼합의 묘 지지에서 끝나는 3년), 월운 12개월(입춘~다음 입춘, 절기 표), 향후 5년 세운(테마·변동/인연/공망 표식), 하루 12시진(그날 일간 오서둔), 오행 건강 힌트(최대 3), 지장간 숨은 십신.
- [sajuDayPillar.ts](../../packages/utils/src/sajuDayPillar.ts)(7차) — 60갑자 일주론: 손글 별칭·성향 60종 + 일지(배우자 자리) 십신·십이운성·공망을 규칙으로 엮은 본문.
- [sajuMatch.ts](../../packages/utils/src/sajuMatch.ts) · [sajuDatePick.ts](../../packages/utils/src/sajuDatePick.ts) · [sajuFood.ts](../../packages/utils/src/sajuFood.ts) — 궁합·택일·오행 음식(아래 규칙 표).
- [sajuFlow.ts](../../packages/utils/src/sajuFlow.ts) — 연출 상태 머신 리듀서 `setup → casting → stamping → reading`. 결과 상태(`idle/pending/partial/ready/failed`)는 phase 와 독립. 인장 수 = 시주 있으면 8, 없으면 6.
- [sajuImages.ts](../../packages/utils/src/sajuImages.ts) — 이미지 id(`stem-gap`…`stem-gye` 10, `branch-rat`…`branch-pig` 12)·경로 `/saju-c/images/<id>-{512|1024}.webp`.

**엔진 규칙(코드 기준 — PLAN "엔진 설계" 와 일치)**

| 항목 | 규칙 |
|---|---|
| 시각 → UTC | 입력 벽시계를 당시 표준시 + 서머타임으로 UTC 분(1900-01-01T00:00Z 기준)으로 복원 |
| 진태양시 | 기본 켬: UTC+8:30(서울 평균태양시) 지방시로 일주·시주 결정 — 현행 KST 에선 −30분, 서머타임 중 −90분. 균시차 없음. 옵션 끄면 벽시계 그대로 |
| 년주 | 그 해 **입춘 시각** 이전이면 전년. `(Y−4) mod 60` |
| 월주 | 12절(소한·입춘·경칩…대설)로 월지, 월간은 오호둔 `((년간 mod 5)×2 + 2 + 인월기준) mod 10` |
| 일주 | `(일수 + 10) mod 60`(1900-01-01 = 갑술). 보정 지방시 **23시 이후는 다음날**(자시). `lateRatHour`(야자시) 옵션이면 당일 유지 + 시간 천간만 다음날 일간 기준 |
| 시주 | 시지 `floor(((h+1) mod 24)/2)`, 시간은 오서둔 `((일간 mod 5)×2 + 시지) mod 10`. `hour: null` = 시간 모름 → 정오로 년·월·일주만, 시주 null |
| 십신 | 일간 오행 vs 대상(같음/생/극/피극/피생) × 음양 같음/다름. 지지는 **정기(본기)** 기준 |
| 오행 점수 | 천간 1.0, 지장간 3개면 여기 0.2·중기 0.3·정기 1.0(2개면 0.3·1.0). 과다 = 30% 이상, 부족 = 0 |
| 신강약 | 월지 3 / 일지 2 / 시지 1.5 / 년지 1 / 천간 각 1 가중, 비겁·인성이면 득점 → 점수 ≥55 신강, ≤35 신약 |
| 보완 오행 | 신약 → 인성(보조 비겁), 신강 → 식상·재·관 중 점수 낮은 순, 중화 → 가장 적은 오행. 조후: 겨울생 화·여름생 수가 0.5 미만이면 앞세움(`reason: 'season'`). UI 는 "보완하면 좋은 기운" |
| 대운 | 양남음녀 순행. 시작 = 다음(순행)/이전(역행) 절까지 분 ÷ 1440 × 4 개월 → "N세 M개월". 월주부터 10개, 각 10년 |
| 신살 14종 | 천을·문창·양인·도화·역마·화개·괴강·백호(0차) + 홍염·귀문관·천라지망·금여·천덕·월덕(7차). 도화·역마·화개는 년지·일지 삼합 기준 |
| 경고 | 절기 경계 ±120분 → "월주가 달라질 수 있어요", 입춘 ±120분 → "년주(띠)", 시간 모름, 서머타임 적용 |
| 오늘의 운세 | 50 기준: 일진 천간 십신(정재·정관 +12 … 편관 −8) + 십이운성(장생·건록·제왕 +8 … 사·절 −6) + 관계(일지 가중 1·년지 0.5·기타 0.25, 육합 +12·충 −14 …) + 천을 +10·문창 +4·공망 −8·도화/역마 +3·보완 오행 +6·과다 −3 → 5~98 클램프, 별 1~5(80/65/50/35) |
| 궁합 100 | 일간 25(천간합 25/상생 18/비화 14/상극 8) + 일지 25(육합·반합 25/같은 계절 18/같은 글자 14/무관계 12/해 6/형·원진 4/충 3) + 띠 15(같은 표) + 오행 보완 20(상대 ≥1.5 가 내 <0.6 을 채우면 +5씩, 없으면 6) + 십신 15(정관·정재 7.5 …). 등급 85/70/55/40 |
| 택일 | 일진 점수 + 용도 가중(이사: 손 없는 날 +10 / 계약: 정재 +8·정관 +6 / 면접: 정관·정인 +8·문창 +6 / 여행: 역마 +8 / 데이트: 도화 +8·육합 +5), 최대 60일, 상위 3 |
| 오행 음식 | `TAROT_MENU_ITEMS` 100종 × `SAJU_FOOD_WUXING` 친화도(1·2). 점수 = 보완×3 + 보조×1.5 − 과다×1 (+ 오늘 일진 오행×1) + 시드 난수 0.75. 조리형태·계통 비중복 3개 |

**API(`apps/friendly/src/modules/saju/`)**
- [saju.route.ts](../../apps/friendly/src/modules/saju/saju.route.ts) — 공개 5 + job poll + 공유 2 + 회원 프로필 4 + 기록 3. `actorOf` 가 옵셔널 인증·게스트 키 헤더(`x-guest-key`, 타로와 같은 상수)·IP 를 묶는다.
- [saju.service.ts](../../apps/friendly/src/modules/saju/saju.service.ts) — 원국 재계산 → 섹션별 LRU 캐시 → 한도 1건 소비 → provider 해석(purpose `saju`) → 섹션 4개 병렬 LLM(`requestSajuLlm`: `format` JSON 스키마 + zod + 수리 재시도 1회, 25초 타임아웃) → 실패 섹션만 정적 → 회원 저장. 오늘·궁합·택일·음식은 단일 호출. `sectionsForShare` 는 캐시만 보고 LLM 을 새로 부르지 않는다.
- [saju-jobs.ts](../../apps/friendly/src/modules/saju/saju-jobs.ts) — 메모리 job 레지스트리(`SajuJobRegistry`): 섹션 확정마다 `version+1`, `wait(after, ms)` long-poll, 회원 저장까지 `persistPending`, 완료 후 TTL 5분·최대 200·미완 30분 유령 제거.
- [saju.prompts.ts](../../apps/friendly/src/modules/saju/saju.prompts.ts) — `SAJU_PROMPT_VERSION = 2`, 시스템 프롬프트(존댓말·단정 금지·"[사주 사실] 밖의 십신·오행·신살 금지"·입력 속 지시 무시·JSON 단일 객체), 섹션 4 + 오늘·궁합·택일·음식 프롬프트 + JSON 스키마. 6차부터 사실 블록에 격국·오신·삼재 줄.
- [saju-static.ts](../../apps/friendly/src/modules/saju/saju-static.ts) — 정적 섹션·오늘·궁합·택일 이유·음식 이유 조립(sajuText × 원국).
- [saju-records.service.ts](../../apps/friendly/src/modules/saju/saju-records.service.ts) — 공유(토큰)·회원 기록·프로필 CRUD. 저장 계층 분리.
- [saju-share-card.ts](../../apps/friendly/src/modules/saju/saju-share-card.ts) — satori + resvg + sharp 로 OG 1200×630 / story 1080×1920. 한자는 `assets/saju-glyphs` PNG(인장 안 `<img>`, 본문은 `graphemeImages`).
- [saju-preview.ts](../../apps/friendly/src/modules/saju/saju-preview.ts) — `/saju-c/s/:token`(OG 주입 index.html) + `/saju-c/s/:token/image.png?format=og|story`. `app.ts` 에서 명시 등록(autoload 밖 루트 경로). PNG 는 LRU 100.

**계약·공용** — [schemas/saju.ts](../../packages/api-contract/src/schemas/saju.ts)(입력·원국 스냅샷·섹션 4·job poll·오늘·궁합·택일·음식·프로필·기록·공유; enum 은 utils 와 같은 값이어야 하고 friendly `saju.test` 가 동일성을 검증) · `Routes.Saju` · [saju.api.ts](../../packages/shared/src/api/saju.api.ts) · [useSaju.ts](../../packages/shared/src/hooks/useSaju.ts) · [sajuProfileStore.ts](../../packages/shared/src/stores/sajuProfileStore.ts).

**웹(`apps/web/src/`)** — [routes/SajuPage.tsx](../../apps/web/src/routes/SajuPage.tsx)(리듀서 + `useCreateSajuReading` + `useSajuJob` 병합, `?embed=1`·`?tool=daily|food|date|match` 딥링크, 효과음 토글, 3D 실패 시 에러 바운더리 → Lite) · [components/saju/](../../apps/web/src/components/saju/) — `SajuForm`(양/음력·윤달·시 모름·성별·고급 옵션·프로필 칩·저장 체크) · `SajuStage`(lazy R3F Canvas) · `stage/SajuScene`(흑요석 원판 + 별자리 선각 + 고리 3겹 다이얼 회전·정지 → 인장 낙하·먹 번짐 리플·오행색 파티클 → 일간 카드·띠 카드 → 오행 구슬) · `stage/sajuLayout`(치수·타이밍: cast 3.0s, 인장 간격 0.55s) · `stage/sajuTextures`(캔버스 한자 글리프 — WebGL 에 CJK 폰트를 싣지 않음) · `SajuReadingPanel`(탭 10개: 원국/성격/오행/흐름/올해/조언 + 오늘/음식/택일/궁합, 데스크톱 오른쪽 32~34rem / 세로 폰 바닥 시트 접기, 섹션 도착 순 타자 효과, 5·6·7차 카드 컴포넌트를 export 해 2D 뷰와 공유) · `SajuChartTable`(원국 표 2D) · `SajuTools`(도구 4 박스, 탭을 열면 query 자동 호출) · `SajuReadingView`(공유·기록용 2D) · `SajuShareSheet` · `SajuLite` · `sajuTheme`(먹 `#0b0b0f`·한지 `#efe6d3`·주사 `#b8322a`·금 `#d9b65b`) · `sajuSound`(WebAudio 합성) · 라우트 `SajuSharedPage`·`saju/MySajuPage`·`saju/MySajuReadingPage`.

**앱(`apps/mobile/`)** — [app/saju-c/index.tsx](../../apps/mobile/app/saju-c/index.tsx): 웹 `/saju-c?embed=1` WebView(타로 판 복제). 로드 전 토큰·게스트 키·테마 주입(`buildLpEmbedInjection`), 웹→앱 `share`/`open`/`title` 메시지, 같은 origin 은 WebView 안·밖은 외부 브라우저, Android 뒤로가기는 WebView 히스토리 우선, `androidLayerType="hardware"`(WebGL). [SajuEntryCard](../../apps/mobile/src/components/home/SajuEntryCard.tsx) 는 홈 카드("사주 보기"·"오늘의 운세" = `?tool=daily`).

**요청 흐름(웹 기준, `SajuPage`)**
1. `submit` — 리듀서가 클라이언트에서 `computeSajuChart` 로 원국을 계산하고(실패면 `setup` 에 `error`) `casting` 으로 간다. 같은 순간 `useCreateSajuReading.mutate({ birth })` 를 보내고, 저장 체크가 켜져 있고 기존 프로필을 고른 게 아니면 회원은 서버 프로필·게스트는 기기 프로필을 upsert 한다. Lite 면 즉시 `skip_animation`.
2. 무대 — `casting`(고리 3겹 회전 → 바깥부터 정지, 3.0s, `onCastingDone` 에 종소리) → `stamping`(인장이 0.55s 간격으로 낙하, 착지마다 `onStamp` → `stamp` 이벤트·'쿵') → 인장 수(8 또는 6)가 차면 `reading`. HUD 의 "건너뛰기" 는 `skip_animation`.
3. 응답 — 서버는 정적 본문(`pending`) + `jobId` 를 즉시 준다. `useSajuJob(jobId)` 가 `after=version` 으로 long-poll(서버 최대 20초 대기, 재연결 틈 200ms) 해 도착한 섹션을 받고, 페이지는 `initial` 과 job 스냅샷을 **렌더 중 병합**(sections·readingId·source, useEffect 없음). 상태 `pending → partial → ready`, 실패 `failed`, 410 `gone`.
4. 패널 — `reading` 이 열리면 `SajuReadingPanel` 이 탭별로 그린다. 섹션이 `pending` 이면 정적 본문 위에 "AI 가 읽는 중" 껍데기, `ready` 면 타자 효과(3D 모드일 때만). 도구 탭 4개는 열리는 순간 `useSaju*Query` 로 부른다(같은 입력은 10분 캐시). 공유 시트는 회원이면 `readingId`, 게스트면 `birth` 를 근거로.
5. `edit`/`reset` — 입력 유지·초기화. mutation·jobId 도 함께 리셋.

**스크립트·자산** — `build:saju-tables`(표 생성) · `build:saju-images`(`assets-src/saju/raw/<id>.png` → 1:1 중앙 크롭 → webp 1024/512, `--placeholders`·`--only`, manifest.json) · `build:saju-glyphs`(개발 머신 Noto Serif CJK KR 로 천간 10·지지 12·오행 5 = 27자 × 3색 PNG) · `probe:saju-reading`(모델 비교) · [apps/web/public/saju-c/images/](../../apps/web/public/saju-c/images/) 22장 × 2 크기 + manifest(45 파일, placeholder 0) · [apps/friendly/assets/saju-glyphs/](../../apps/friendly/assets/saju-glyphs/) 81 PNG.

## Talks To [coverage: high — 12 sources]

- **[usage-quota](usage-quota.md)** — feature `saju-reading`, 코드 기본값 게스트 30/IP 300/분당 20/전역 3000/게스트 컷 90%(타로보다 낮게 — 전체 풀이 1건 = LLM 4호출). 전체 풀이·오늘·궁합·택일·음식 각 1건. 캐시 히트는 소비 없음. 분당 IP 버스트는 설정의 `ipPerMinute` 를 라우트 `rateLimit.max` 함수로 읽는다.
- **[ai](ai.md)** — `AiConfigService.getResolved('ollama-cloud', 'saju')` → `adapterCache`. purpose `saju`(`LlmProviderPurpose`), env `OLLAMA_SAJU_MODEL`(기본 `kimi-k3`), `thinkOptionForModel`, `aiModel` 추천 규칙은 "텍스트 계열 중 가장 큰 모델"(log-analysis 와 동급). 사주(G)의 `OLLAMA_SAJU_G_MODEL` 과 상호 fallback 없음.
- **[tarot](tarot.md)** — 재사용: 게스트 키 헤더 상수(`SAJU_GUEST_KEY_HEADER = TAROT_GUEST_KEY_HEADER`), `detectTarotRender`(3D/Lite 판정: `?lite=1`·reduced-motion·WebGL2 없음)·`TarotQuality`, `useTypewriter`, `TAROT_MENU_ITEMS`·`createSeededRng`(오행 음식 후보 풀), 공유 토큰·OG·satori 파이프라인, `RATE.tarotShare`(공유 생성 10/분). three 벤더 청크 공유. **컴포넌트는 재사용하지 않는다**(무대가 다르다).
- **rate-limit** — job poll·공유 조회 `RATE.publicShare`(120/분), 공유 생성 `RATE.tarotShare`(10/분).
- **[food](food.md)** — 오행 음식 kcal: `foodItem.nameNorm` 으로 카탈로그 1인분 kcal 조회(타로 메뉴와 같은 규칙).
- **web-index / share-fonts**(friendly lib) — OG 주입·IBM Plex Sans KR 폰트. 한자는 글리프 PNG.
- **[shared](shared.md)** — `guestKeyStore.getGuestKey`(헤더), `authStore`(회원 판정), `embedBridge`(`postLpEmbedMessage`·`isLpEmbedded`·`buildLpEmbedInjection`·`parseLpEmbedMessage`), `injectableStorage`(프로필 스토어 주입).
- **[web](web.md)** — `lib/embed.ts`(`?embed=1` → sessionStorage `lp:embed`, PublicLayout 이 헤더 숨김), 라우트 4개, 사이드바·상단바 메뉴 `사주(C)`, 홈 카드. Vite dev 프록시 `^/saju-c/s/[^/]+/image\.png` → 3000.
- **[mobile](mobile.md)** — WebView 임베드 + `setSajuProfileStorage(AsyncStorage)` 주입(`api-setup.ts`).
- **nginx**([friendly](friendly.md)·`ops/nginx/`) — `location ^~ /saju-c/s/` 프록시(OG·PNG), `^~ /saju-c/images/` 7일 캐시·진짜 404, SPA 폴백 `try_files $uri /index.html`(`$uri/` 제거).
- **[saju-g](saju-g.md)** — 관계 없음(의도적 분리). 2026-09-07 리베이스에서 양쪽을 나란히 연결한 경위는 그 문서의 "사주(C) 통합" 절과 [docs/MIGRATION-saju-g.md](../../docs/MIGRATION-saju-g.md).

## API Surface [coverage: high — 6 sources]

`Routes.Saju` — 전부 `/api/v1/saju-c/*`(`5f49026` 에서 `/saju/*` 로부터 이동).

| 메서드 | 경로 | 인증 | 비고 |
|---|---|---|---|
| POST | `/saju-c/readings` | optional | 입력 → 원국 + 섹션 4. 전부 캐시면 즉시 `ready`(한도 소비 없음), 아니면 정적 본문(`pending`) + `jobId`. 회원은 저장 후 `readingId` |
| GET | `/saju-c/readings/jobs/:jobId?after=n&wait=ms` | 없음 | long-poll(기본 20s, 최대 25s). job 없으면 **410** |
| POST | `/saju-c/daily` | optional | `date` 는 오늘 ±7일. 회원+오늘은 하루 1회 잠금 행 |
| POST | `/saju-c/match` | optional | 두 입력 + `labels{a,b}`(≤20자) |
| POST | `/saju-c/date-pick` | optional | `purpose`·`from`(≤ 1년 뒤)·`days` 1~60(기본 30) |
| POST | `/saju-c/food` | optional | `today`(기본 true) — 일진 오행 가점 |
| POST | `/saju-c/shares` | optional | `readingId`(회원) 또는 `birth`(게스트) + `includeBirth`. 응답 `{token, path, includeBirth}` |
| GET | `/saju-c/shares/:token` | 공개 | `includeBirth` 아니면 생년월일 마스킹 |
| GET/POST | `/saju-c/me/profiles` · PUT/DELETE `/:id` | Bearer | 최대 10, primary 1, 같은 사주면 라벨만 갱신 |
| GET | `/saju-c/me/readings?cursor&limit` · GET/DELETE `/:id` | Bearer | kind `full` 만(daily 잠금 행은 내부용) |
| GET | `/saju-c/s/:token` · `/saju-c/s/:token/image.png?format=og\|story` | 공개 | origin 루트 — OG 주입 SPA index / satori PNG |

응답 `SajuReadingResult` = `{ readingId, jobId, chart(스냅샷), sections{personality,year,cycle,advice}(각 status pending/ready/static · source · model), source llm/static/mixed, model, createdAt, quota.remainingToday(게스트만 숫자) }`. 오류: 입력 400 / 없음 404 / job 소멸 410.

섹션 모양과 LLM 출력 검증(서버 zod, 위반 시 수리 재시도 1회 → 그래도 실패면 그 섹션만 정적):

| 섹션 | 필드 | LLM 출력 제약 | 정적 폴백 근거 |
|---|---|---|---|
| personality | headline·body·strengths[]·cautions[] | strengths 1~5, cautions 1~4 | 일간 캐릭터 텍스트(tagline·personality·strengths·cautions) |
| year | body·months[{month,note}] | months ≤ 6, month 1~12 | 세운 십신·관계 문장 |
| cycle | body·current·next | — | 대운 방향·현재/다음 대운 십신·십이운성 |
| advice | body·keyword·lucky{element,colors,directions,numbers,foods} | lucky 는 서버가 **정적값으로 덮는다**(LLM 이 옮겨 쓴 값을 믿지 않음) | 보완 오행 행운 표 |

오늘(`body`·`advice`, 400토큰)·궁합(`summary`·`strengths`·`cautions`·`advice`, 900)·택일(`reasons[{date,reason}]`, 600 — 서버가 고른 상위 3의 date 만 채택)·음식(`picks[{menuId,reason}]`, 500 — 후보 밖 menuId 는 버림)도 같은 방식이며, 점수·후보·별점은 항상 utils 계산값이다.

**utils export(주요)**: `computeSajuChart`, `chartSignature`("경오 신사 경진 계미"), `yearLuckOf`, `findRelations`, `tenGodOf`, `twelveStageOf`, `voidBranchesOf`, `dailyFortune`, `scoreDayForChart`, `scoreGanzhiForChart`, `matchCharts`, `pickDates`, `selectSajuFood`, `sajuFlowReducer`·`createSajuFlowState`·`sajuStampTotal`, `sajuFactLines`, `sajuPatternOf`·`sajuFiveGodsOf`·`sajuSamjaeOf`·`sajuMonthLucksOf`·`sajuYearOutlooksOf`·`sajuHourLucksOf`·`sajuHealthHintsOf`·`sajuHiddenGodsOf`, `sajuDayPillarReadingOf`, `sajuImagePath`·`sajuStemImageId`·`sajuBranchImageId`, `lunarToSolar`·`solarToLunar`·`resolveKoreaWallClock`·`solarTermUtcMinutes`.

**shared 훅**: `useCreateSajuReading`(mutation) · `useSajuJob(jobId)` → `{data, gone, polling}`(`refetchInterval` 200ms 로 long-poll 연결, 410 이면 `gone`) · `useSajuDaily/Match/DatePick/Food`(mutation) · `useSajuDailyQuery/FoodQuery/DatePickQuery/MatchQuery`(탭 자동 호출, staleTime 10분) · `useCreateSajuShare` · `useSharedSajuReading` · `useSajuProfiles`·`useUpsertSajuProfile`·`useDeleteSajuProfile` · `useMySajuReadingsInfinite`·`useMySajuReading`·`useDeleteSajuReading`. 스토어: `useSajuProfileStore`(`upsert`·`remove`·`setPrimary`), `getPrimarySajuProfile`, `sameSajuBirth`, `setSajuProfileStorage`.

## Data [coverage: high — 8 sources]

마이그레이션 `20260906110442_add_saju_profile_and_reading`:
- `saju_profiles`(SajuProfile) — userId(FK cascade)·label·calendar·birthYear/Month/Day·leapMonth·birthHour?·birthMinute?·gender·optionsJson·isPrimary·createdAt·updatedAt. 인덱스 `(userId, isPrimary)`.
- `saju_readings`(SajuReading) — userId?·guestKey?·shareToken?(unique)·kind(`full|daily|match|date-pick|food` 선언, 실제 저장은 `full`·`daily` 만)·inputJson(생년월일시 — 로그 금지)·chartJson(스냅샷)·resultJson(섹션)·source·model?·promptVersion·dayKey·dailyLockKey?(unique)·shareBirth·createdAt. 인덱스 `(userId, createdAt)`.
- `dailyLockKey` = `userId:<sha1(8글자|성별) 16자>:yyyy-mm-dd` — 프로필 id 가 아니라 사주 자체로 잠가 게스트 입력·프로필 어느 경로든 같다.

**메모리** — `SajuService.cache`: lru-cache max 4000·TTL 24h. 섹션 키 = sha1(`section:<id>:` + JSON[promptVersion, 8글자, 성별, 대운 방향·시작 나이, 기준 연도, 보완 오행]) → 같은 사람은 연도가 바뀔 때까지 히트. 오늘 키 = (promptVersion, 일주, 보완 오행, dayKey). 궁합·택일·음식도 각자 키. `SajuJobRegistry`: Map, 완료 후 5분, 최대 200. `saju-preview` PNG LRU 100.

**로컬** — `saju-profiles-v1`(zustand persist, 게스트 프로필 최대 10 + primaryId; 앱은 AsyncStorage 주입) · `saju-sound-v1`(효과음 on/off) · `lp:embed`(sessionStorage, 웹 공용). WebView 안 웹의 localStorage 와 앱의 AsyncStorage 프로필은 **별개 저장소**다.

**자산** — 이미지 22장(일간 10 + 띠 12, Gemini 생성, 민화 + 흑요석 천문도 + 금선 톤, 프롬프트북 `docs/saju-image-prompts.md`) webp 512/1024 + `manifest.json`(missing 빈 배열). 글리프 81 PNG(27자 × `''`/`-hanji`/`-gold`). 절기·음력 표는 utils 소스에 문자열로 내장.

## Key Decisions [coverage: high — 10 sources]

- **2026-09-07 (`7358c86`) 7차** — 60갑자 일주론(손글 별칭 60 + 규칙 조립 본문), 신살 6종 확장(`SajuStarId` 계약 확장, LLM 사실 목록 포함), 대운 타임라인은 3D "강물" 대신 **SVG**(0~100세, 구간 색 = 대운 천간 오행), 효과음은 파일 없이 **WebAudio 합성**(인장 '쿵' 140→45Hz + 노이즈, 다이얼 종소리 880/1320Hz), 기본 꺼짐·기기 기억·제출 클릭에서 컨텍스트 프라임(자동재생 정책).
- **2026-09-07 (`f47e963`) 6차** — 격국·오신·삼재·월운·5년 세운·12시진·건강·숨은 십신을 **순수 계산**으로 utils 에 두고 웹·서버가 같은 함수를 쓴다. 일진 규칙을 `scoreGanzhiForChart` 로 추출해 일진·월운·세운·시진이 같은 점수. 사실 블록에 격국·오신·삼재 줄 추가 → `SAJU_PROMPT_VERSION` 1 → 2(기존 캐시 무효). 같은 입력을 다시 세우면 프로필이 매번 새로 생기던 것을 `sameSajuBirth` 로 로컬·서버 모두 라벨만 갱신.
- **2026-09-07 (`e40b4c0`, 다른 세션) 사주(G) 리베이스 통합** — C 는 `/saju-c`·`/api/v1/saju-c`·`saju_*` 테이블·purpose `saju`·`saju-reading`·`OLLAMA_SAJU_MODEL` 을 그대로 두고, G 가 `saju-g` 식별자로 독립 생성(`20260906170000_add_saju_g`). C 데이터·설정을 G 로 옮기지 않는다.
- **2026-09-06 (`ab2988f`) 5차** — "계산은 해 놓고 화면에 없던 것"을 전부 표시(엔진 변경 없음): 띠 이미지 12장(미사용이었음)을 원국 헤더·3D 띠 카드·공유 카드·궁합 배지에, 십신 5그룹·연애/일 스타일·대운 칩 십신·세운 관계·행운 확장·출생 요약. 패널 컴포넌트를 export 해 **2D 뷰(공유·기록)도 동일**.
- **2026-09-06 (`5f49026`) 경로 `saju` → `saju-c`, 명칭 "사주(C)"** — URL·API·OG·이미지 경로·앱 화면 전부 이동. 명칭은 메뉴·홈 카드·앱 헤더·내 사주 제목·공유/OG 제목만 바꾸고 **모듈·파일·DB·한도 feature 이름은 그대로**.
- **2026-09-06 (`30a9f52`·`3235daa`) 패널 폭** — 탭 10개가 27rem 에 안 들어가 가로 스크롤이 남던 것을 lg 32rem·xl 34rem + `flex-wrap` 으로. 무대 시선 `focusX` 1.4 → 1.7. 궁합 입력 그리드는 `min-w-0`·`w-full`.
- **2026-09-06 (`7d2d401`) 회원 프로필 + 오늘의 운세 하루 1회** — 회원은 서버 프로필 칩("계정" 배지)·"이 계정에 저장", 게스트는 기기 칩·"이 기기에 저장". 저장된 칩을 골라 입력이 그대로면 저장 체크를 숨겨 중복 방지. 오늘 운세는 `SajuReading(kind daily)` 행으로 잠가 캐시·재시작과 무관하게 하루 1회만 LLM(다른 날짜 조회는 잠그지 않음). 기록 목록·상세는 `full` 만.
- **2026-09-06 (`d31843b`) 기본 모델 `kimi-k3`** — `probe:saju-reading` 3사주 × 4섹션: 4모델 모두 JSON 12/12·수리 0, p50 gpt-oss:120b 2.0s / deepseek-v4-pro 3.5s / qwen3.5:397b 5.5s / kimi-k3 5.6s. 문장은 kimi-k3 가 계절·오행 맥락을 가장 자연스럽게 엮어 채택, 빠른 대안 deepseek-v4-pro. "사실 오염" 근사치는 거친 지표라 기준에서 제외.
- **2026-09-06 (`142e116`·`67c8a38`) 이미지 22/22** — Gemini 생성 원본을 `build:saju-images` 로 webp 변환·커밋, placeholder 제거.
- **2026-09-06 (`f8e5dd0`·`0a7f637`) 4차 공유** — 게스트는 입력만 보내고 서버가 **캐시된 섹션 또는 정적**으로 행을 만든다(LLM·한도 소비 없음), 회원은 저장 행에 토큰만. 생년월일은 `shareBirth` 일 때만 노출(기본 숨김 — `maskBirth` 가 월·일·시각·음력·순간을 지우고 원국·띠·연도는 남김). 앱은 RN 포팅 대신 WebView 임베드.
- **2026-09-06 (`f8e5dd0`) 1차 — 섹션 병렬 + long-poll** — 전체 풀이는 섹션 4개를 동시에 호출하고 정적 본문 + jobId 를 즉시 응답, 클라이언트가 job 을 long-poll 해 **도착 순 리빌**(SSE 는 v2). 무대 연출(≈ 3 + 4.4 + 1.2초)이 첫 섹션 도착을 덮는다. 회원 저장은 4개가 다 끝난 뒤 1회. 한도 기본 30/300/20/3000/90%.
- **2026-09-06 (`db1415f`) 0차 엔진 기본값(학파 차이 항목)** — 진태양시 보정 켬(고급 옵션 끔), 자시 시작(23:00)에 날 바뀜(고급 옵션 야자시), 출생 시간 모름 허용(3기둥), 양력/음력(윤달), 1900~2050, 만 나이, 출생지 서울 고정(해외는 v2). 절기·음력은 **빌드 시 표로 내장**(런타임 천문 계산 없음) — KASI 공개값 대조 절기 ±1분, 설날 1990~2050 61건·윤달 1900~2050 전부 일치.
- **2026-09-06 계획 결정 5** — 택일·궁합·오행 음식 전부 v1 / 3D 무대는 타로와 다른 연출 / 이미지 Gemini 생성(사용자 작업) / 섹션 병렬 + kimi 계열 후보 / 접근 정책 타로와 동일.

## Gotchas [coverage: high — 9 sources]

- **기록 삭제 후 이동 경로가 낡았다** — `MySajuReadingPage` 가 삭제 성공 시 `navigate('/me/saju')` 로 가는데 그 라우트는 없다(`5f49026` 개명 누락). 올바른 경로는 `/me/saju-c`.
- **git 이력 함정** — `modules/saju/*`·`components/saju/*`·`schemas/saju.ts`·`utils/saju.ts`·`sajuProfileStore.ts` 의 `1c60ad8`·`8ffedb9` 는 사주(G) 세션이 같은 파일명에 G 코드를 넣은 커밋이고 `e40b4c0` 이 C 로 원복하며 G 를 `saju-g` 로 옮겼다. blame 을 볼 땐 `7358c86`·`f47e963`·`ab2988f` 등 C 커밋을 기준으로.
- **PLAN 과 코드가 다른 곳** — ① 한도: PLAN 본문(§Prisma)은 "타로와 동일 50/500/5000" 이라 쓰지만 코드·PLAN 1차 기록은 30/300/20/3000/90. ② 섹션 토큰: PLAN ≈ 500/400/400/300, 코드 `SAJU_SECTION_MAX_TOKENS` 900/700/700/700. ③ `sajuHistoryStore.ts`(게스트 로컬 기록 30건)·`useSaju*.ts` 여러 파일은 없다 — 게스트 로컬 기록은 미구현, 훅은 `useSaju.ts` 하나. ④ stage 가 `Disc/Seal/InkRipple/ElementOrbs/LuckRiver/MatchDiscs.tsx` 로 나뉘지 않고 `SajuScene.tsx` 하나 안의 내부 컴포넌트, 3D 대운 강물·궁합 두 원판은 미구현(SVG 타임라인·DOM 점수 링으로 대체). ⑤ `SajuChart.tsx`·`SajuDatePick/Match/Food.tsx` 대신 `SajuChartTable.tsx`·`SajuTools.tsx`. ⑥ `SajuReading.kind` 의 match/date-pick/food 는 저장 경로가 없다. ⑦ Prisma 주석의 `dailyLockKey = userId:profileId:날짜` 는 낡음(실제는 사주 해시). ⑧ 택일 `from` 은 오늘 이후 365일까지 허용(PLAN "오늘~+60일"). ⑨ PLAN "v2 후보" 행의 월운·신살 확장·효과음은 6·7차에서 이미 구현됐다. ⑩ `saju-jobs.ts` 머리 주석의 `/saju/readings` 경로는 옛 경로.
- **job 은 메모리** — 서버 재시작(pm2 reload)이나 TTL 뒤엔 poll 이 410 → 클라이언트는 이미 받은 정적 본문을 유지하고 "다시 시도" 를 보인다. 회원 저장은 4섹션 완료 후 1회라 중간에 죽으면 저장되지 않는다(다음 요청은 캐시 미스로 재시도). `useSajuJob` 은 410 이면 재시도하지 않고 `gone`.
- **게스트 공유의 LLM 본문은 캐시 의존** — `sectionsForShare` 는 24h LRU 캐시만 본다. 캐시가 비면(재시작·만료) 공유 행이 정적 본문으로 만들어진다. 캐시 키에 기준 연도·보완 오행이 들어 있어 입춘이 지나면 같은 사람도 새 호출.
- **한자 렌더** — satori 폰트(IBM Plex Sans KR)에 한자가 없어 □ 로 나왔다(실측 버그). `build:saju-glyphs` 로 만든 PNG 81장을 커밋했으니 운영엔 CJK 폰트가 필요 없지만, 글리프 파일을 못 찾으면 인장 안에 원문 한자가 그대로 들어가 다시 □ 가 된다. 웹 3D 는 캔버스 텍스처라 브라우저 폰트(Noto Serif KR 폴백)를 쓴다.
- **nginx 3종 필수** — `^~ /saju-c/s/`(없으면 아래 `.png` 정규식 location 이 이미지를 가로채 404, SPA 는 동작하고 OG·이미지만 빠짐), `^~ /saju-c/images/`(진짜 404 라야 웹이 한자 placeholder 를 그림), SPA 폴백 `try_files $uri /index.html`(`$uri/` 가 있으면 dist 의 `saju-c/` 디렉터리 때문에 `/saju-c` 직접 진입·새로고침이 301 → 403). `ops/nginx/` 원본(`35b35fd`)에는 반영됐고, 개명 뒤 운영 서버 적용 여부는 PLAN 에 "⚠️ 운영 nginx 블록 이름 변경 필요" 로 남아 있다(확인 안 됨).
- **3D 무대 실패 → Lite** — 실측에서 `Seal` 이 `return null` 뒤에 `useMemo` 를 둬 훅 순서 오류로 무대 전체가 흰 화면이 됐다. 훅을 앞으로 옮기고 `StageErrorBoundary` 를 둬 런타임 오류 시 `SajuLite` 로 폴백한다(풀이 패널은 그대로). jsdom·WebGL2 없음·reduced-motion·`?lite=1` 은 처음부터 Lite(연출 건너뜀, `skip_animation`). 3D 는 Playwright + SwiftShader 로만 실측했고 실기기·크롬 확장 검증은 미완.
- **앱 WebView** — 주입 스크립트(토큰·게스트 키·테마)는 첫 마운트 값으로 고정된다(WebView 가 prop 변경을 다시 주입하지 않음). 로그인이 바뀌면 화면을 다시 열어야 한다. 앱 `setSajuProfileStorage(AsyncStorage)` 는 향후 네이티브 화면 대비이며, WebView 안 웹은 자기 localStorage 프로필을 쓴다(두 저장소가 동기화되지 않음). 앱 실기기 확인 미완.
- **시간·달력 엣지** — 시간 모름은 정오로 계산하되 `hourKnown=false`, 시주 null·인장 6개, 시주 의존 항목(시주 십신·십이운성) 생략. 보정 지방시 23시대는 다음날 일주(야자시 옵션 시 당일 + 시간 천간만 다음날). 절기·입춘 ±2시간, 서머타임은 `chart.warnings` 로 UI 에 뜬다. 음력 표는 1900-01-31 이전을 못 돌려준다(`lunar: null`).
- **오늘의 운세 잠금은 회원·오늘만** — 게스트는 잠그지 않고 캐시(일주·보완 오행·dayKey)만. 동시 요청은 unique 위반을 삼켜 먼저 저장된 행이 이긴다.
- **프라이버시** — 생년월일시는 info 로그·텔레메트리에 남기지 않는다(토큰 수만). 게스트 결과는 공유 전엔 서버에 없다(job 메모리 5분). 공유는 기본 생년월일 숨김. LLM 프롬프트에는 사실 블록에만 들어간다.
- **select 팝업 색**(`ff9300f`) — 크롬이 네이티브 `<select>` 팝업에 select 의 배경·글자색을 그대로 써서 `bg-black/30` 이 회색 상자 + 저대비 크림 글자가 됐다. `scheme-dark` + `[&>option]` 색을 명시해야 한다(폼·도구 공통 `field`).
- **테스트** — utils 5파일(`saju`·`sajuCalendar`·`sajuExtras`·`sajuInsights`·`sajuStars`, 마지막 커밋 `75b8667` 은 읽기 전용 배열 정렬 수정) / friendly `saju.test.ts` 21건(계약↔utils enum 동기화·정적 풀이·job·격리 DB 서비스·라우트·공유·프로필·잠금) / 웹 `SajuPage.test` 7 + `SajuSharedPage.test` 2(Lite 경로). 3D 무대는 테스트 밖.

## Sources [coverage: high — 73 sources]

- [packages/utils/src/saju.ts](../../packages/utils/src/saju.ts) — 원국·십신·신살·관계·대운
- [packages/utils/src/sajuCalendar.ts](../../packages/utils/src/sajuCalendar.ts) — 절기·표준시·서머타임·음력
- [packages/utils/src/sajuAstroTable.ts](../../packages/utils/src/sajuAstroTable.ts) — 생성물(절기 1899~2051·음력 1900~2050)
- [packages/utils/src/sajuText.ts](../../packages/utils/src/sajuText.ts) — 정적 텍스트·사실 목록·요약
- [packages/utils/src/sajuDaily.ts](../../packages/utils/src/sajuDaily.ts) — 일진 점수·오늘의 운세
- [packages/utils/src/sajuInsights.ts](../../packages/utils/src/sajuInsights.ts) — 격국·오신·삼재·월운·세운·시진·건강·숨은 십신(6차)
- [packages/utils/src/sajuDayPillar.ts](../../packages/utils/src/sajuDayPillar.ts) — 60갑자 일주론(7차)
- [packages/utils/src/sajuMatch.ts](../../packages/utils/src/sajuMatch.ts) — 궁합 100점
- [packages/utils/src/sajuDatePick.ts](../../packages/utils/src/sajuDatePick.ts) — 택일 6용도
- [packages/utils/src/sajuFood.ts](../../packages/utils/src/sajuFood.ts) — 오행 음식 친화도 100종
- [packages/utils/src/sajuFlow.ts](../../packages/utils/src/sajuFlow.ts) — 연출 상태 머신
- [packages/utils/src/sajuImages.ts](../../packages/utils/src/sajuImages.ts) — 이미지 id·경로
- [packages/utils/src/saju.test.ts](../../packages/utils/src/saju.test.ts) (+[sajuCalendar](../../packages/utils/src/sajuCalendar.test.ts)·[sajuExtras](../../packages/utils/src/sajuExtras.test.ts)·[sajuInsights](../../packages/utils/src/sajuInsights.test.ts)·[sajuStars](../../packages/utils/src/sajuStars.test.ts)) — KASI 대조 골든셋 포함
- [packages/utils/src/aiModel.ts](../../packages/utils/src/aiModel.ts) — purpose `saju` 추천 규칙
- [apps/friendly/src/modules/saju/saju.route.ts](../../apps/friendly/src/modules/saju/saju.route.ts)
- [apps/friendly/src/modules/saju/saju.service.ts](../../apps/friendly/src/modules/saju/saju.service.ts)
- [apps/friendly/src/modules/saju/saju-jobs.ts](../../apps/friendly/src/modules/saju/saju-jobs.ts)
- [apps/friendly/src/modules/saju/saju.prompts.ts](../../apps/friendly/src/modules/saju/saju.prompts.ts) — `SAJU_PROMPT_VERSION = 2`
- [apps/friendly/src/modules/saju/saju-static.ts](../../apps/friendly/src/modules/saju/saju-static.ts)
- [apps/friendly/src/modules/saju/saju-records.service.ts](../../apps/friendly/src/modules/saju/saju-records.service.ts)
- [apps/friendly/src/modules/saju/saju-share-card.ts](../../apps/friendly/src/modules/saju/saju-share-card.ts)
- [apps/friendly/src/modules/saju/saju-preview.ts](../../apps/friendly/src/modules/saju/saju-preview.ts)
- [apps/friendly/src/modules/saju/saju.test.ts](../../apps/friendly/src/modules/saju/saju.test.ts) — 21건
- [apps/friendly/src/app.ts](../../apps/friendly/src/app.ts) — `registerSajuPreview`
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) (+[.env.example](../../apps/friendly/.env.example)) — `OLLAMA_SAJU_MODEL=kimi-k3`
- [apps/friendly/src/modules/usage-quota/usage-quota.service.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.service.ts) — `saju-reading` 기본값
- [apps/friendly/scripts/build-saju-tables.ts](../../apps/friendly/scripts/build-saju-tables.ts)
- [apps/friendly/scripts/build-saju-images.ts](../../apps/friendly/scripts/build-saju-images.ts)
- [apps/friendly/scripts/build-saju-glyphs.ts](../../apps/friendly/scripts/build-saju-glyphs.ts)
- [apps/friendly/scripts/probe-saju-reading.ts](../../apps/friendly/scripts/probe-saju-reading.ts)
- [apps/friendly/package.json](../../apps/friendly/package.json) — `build:saju-tables`·`build:saju-images`·`build:saju-glyphs`·`probe:saju-reading`
- [apps/friendly/assets/saju-glyphs/](../../apps/friendly/assets/saju-glyphs/) — 81 PNG(27자 × 3색)
- [apps/friendly/prisma/migrations/20260906110442_add_saju_profile_and_reading/migration.sql](../../apps/friendly/prisma/migrations/20260906110442_add_saju_profile_and_reading/migration.sql)
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — `SajuProfile`·`SajuReading`
- [packages/api-contract/src/schemas/saju.ts](../../packages/api-contract/src/schemas/saju.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.Saju`
- [packages/api-contract/src/schemas/usage-quota.ts](../../packages/api-contract/src/schemas/usage-quota.ts) — `saju-reading`
- [packages/api-contract/src/schemas/ai.ts](../../packages/api-contract/src/schemas/ai.ts) — purpose `saju`
- [packages/shared/src/api/saju.api.ts](../../packages/shared/src/api/saju.api.ts)
- [packages/shared/src/hooks/useSaju.ts](../../packages/shared/src/hooks/useSaju.ts)
- [packages/shared/src/stores/sajuProfileStore.ts](../../packages/shared/src/stores/sajuProfileStore.ts) — `saju-profiles-v1`
- [apps/web/src/routes/SajuPage.tsx](../../apps/web/src/routes/SajuPage.tsx) (+[test](../../apps/web/src/routes/SajuPage.test.tsx))
- [apps/web/src/routes/SajuSharedPage.tsx](../../apps/web/src/routes/SajuSharedPage.tsx) (+[test](../../apps/web/src/routes/SajuSharedPage.test.tsx))
- [apps/web/src/routes/saju/MySajuPage.tsx](../../apps/web/src/routes/saju/MySajuPage.tsx)
- [apps/web/src/routes/saju/MySajuReadingPage.tsx](../../apps/web/src/routes/saju/MySajuReadingPage.tsx) — 삭제 후 `/me/saju` 이동(낡은 경로)
- [apps/web/src/components/saju/SajuForm.tsx](../../apps/web/src/components/saju/SajuForm.tsx)
- [apps/web/src/components/saju/SajuReadingPanel.tsx](../../apps/web/src/components/saju/SajuReadingPanel.tsx) — 탭 10·공용 카드 export
- [apps/web/src/components/saju/SajuReadingView.tsx](../../apps/web/src/components/saju/SajuReadingView.tsx)
- [apps/web/src/components/saju/SajuChartTable.tsx](../../apps/web/src/components/saju/SajuChartTable.tsx)
- [apps/web/src/components/saju/SajuTools.tsx](../../apps/web/src/components/saju/SajuTools.tsx) — 오늘·음식·택일·궁합
- [apps/web/src/components/saju/SajuShareSheet.tsx](../../apps/web/src/components/saju/SajuShareSheet.tsx)
- [apps/web/src/components/saju/SajuStage.tsx](../../apps/web/src/components/saju/SajuStage.tsx)
- [apps/web/src/components/saju/SajuLite.tsx](../../apps/web/src/components/saju/SajuLite.tsx)
- [apps/web/src/components/saju/sajuTheme.ts](../../apps/web/src/components/saju/sajuTheme.ts)
- [apps/web/src/components/saju/sajuSound.ts](../../apps/web/src/components/saju/sajuSound.ts) — `saju-sound-v1`
- [apps/web/src/components/saju/stage/SajuScene.tsx](../../apps/web/src/components/saju/stage/SajuScene.tsx)
- [apps/web/src/components/saju/stage/sajuLayout.ts](../../apps/web/src/components/saju/stage/sajuLayout.ts)
- [apps/web/src/components/saju/stage/sajuTextures.ts](../../apps/web/src/components/saju/stage/sajuTextures.ts)
- [apps/web/src/components/tarot/tarotQuality.ts](../../apps/web/src/components/tarot/tarotQuality.ts) — 3D/Lite 판정 재사용
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx) — 라우트 4
- [apps/web/src/components/PublicSidebar.tsx](../../apps/web/src/components/PublicSidebar.tsx) (+[PublicTopBar](../../apps/web/src/components/PublicTopBar.tsx)) — 메뉴 "사주(C)"
- [apps/web/src/routes/HomePage.tsx](../../apps/web/src/routes/HomePage.tsx) — 홈 진입 카드
- [apps/web/src/lib/embed.ts](../../apps/web/src/lib/embed.ts)
- [apps/web/vite.config.ts](../../apps/web/vite.config.ts) — `/saju-c/s/*/image.png` 프록시
- [apps/web/public/saju-c/images/](../../apps/web/public/saju-c/images/) — 22장 × 2 + manifest(45 파일)
- [apps/mobile/app/saju-c/index.tsx](../../apps/mobile/app/saju-c/index.tsx)
- [apps/mobile/src/components/home/SajuEntryCard.tsx](../../apps/mobile/src/components/home/SajuEntryCard.tsx)
- [apps/mobile/src/lib/api-setup.ts](../../apps/mobile/src/lib/api-setup.ts) — `setSajuProfileStorage(AsyncStorage)`
- [docs/PLAN-saju.md](../../docs/PLAN-saju.md) — 결정·기본값·엔진 규칙·진행 기록 0~7차
- [docs/saju-image-prompts.md](../../docs/saju-image-prompts.md) — 이미지 22장 프롬프트북
- [docs/deploy-friendly.md](../../docs/deploy-friendly.md) — nginx `^~ /saju-c/s/`·`/saju-c/images/`·SPA 폴백·글리프
- [ops/nginx/niney_life_pickr_v2_projects](../../ops/nginx/niney_life_pickr_v2_projects) — 운영 원본 saju-c 블록 2개
- [docs/MIGRATION-saju-g.md](../../docs/MIGRATION-saju-g.md) — 사주(G)와의 분리 원칙
