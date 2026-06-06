---
topic: friendly
last_compiled: 2026-06-06
status: active
aliases: [naver-search-adapter, search-route, crawl-job-log, plugins-summaries, settlement, 정산, multipart, vision LLM, 단골, contacts, llm-purpose, settlement-rounds, settlement-draft, settlement-draft-module, well-known, well-known-module, universal-links, app-links, assetlinks-json, AASA, RFC1918, cors-dev, dev-cors-private-lan, dev-cors-reflect-all, cors-preflight-fix, multi-receipt-split, ExtractReceiptSplit, roundIndex, roundTotal, settlement-PUT, full-replace-update, ai-model-preview, models-preview, attendees-100, items-200, calculateMultiRoundShares, SettlementRound, SettlementRoundAttendee, SettlementDraft, placeIdKey-sentinel, fromDraftId, public-reviews-sort-recent, fetchedAt-asc, contentHash-NUL, assemblePublicReviews, share-preview, og-ssr-lite, og-image, settlement-card-png, satori, resvg, IBMPlexSansKR, getPhotoUrls, getSharePreviewMeta, shareOgImage, shareOgImageUrl, pickRestaurantOgImageUrl, seedFromToken, sharePreviewCache, ALLOWED_HOSTS-export, isThumbnailProxyable, OG_IMAGE_PATH, WEB_INDEX_PATH, eval-extraction, probe-extraction, probe-vision, eslint-config, FastifyError-annotation, schedule, scheduler, cron, croner, normalize-merge, ScheduleConfig, ScheduleRun, scheduleRegistry, plugins-schedule, bootstrap, interrupted-run, isPlaceCrawling, forceCloseConnections, publicCategoryTree, getCategoryTree]
sources_count: 99
---

# friendly — Fastify 백엔드

**2026-06-06 변경 흡수 — 주기 스케줄러(schedule) 모듈 신규.** croner 기반 in-process cron 으로 "메뉴 정규화 → 글로벌 머지" 파이프라인을 야간 배치로 자동 실행한다(no-Redis, CLAUDE.md). 신규 `modules/schedule/` (service + registry + route + test) + `plugins/schedule.ts` 가 `ScheduleService` 를 `app.decorate('schedule', ...)` 로 전역 singleton 등록(`dependencies: ['prisma']`). 부팅 시 `server.ts` 가 `app.schedule.bootstrap()` 으로 (1) 직전 인스턴스에서 `running` 으로 남은 `ScheduleRun` 을 `interrupted` 로 정리 + (2) `ScheduleConfig` 를 읽어 cron 등록. graceful shutdown 에서 `scheduleRegistry.stopAllCrons()` + `abortInflight()`. cron 타이머·진행 상태는 `scheduleRegistry`(모듈 singleton — jobType 당 croner `Cron` 하나 + 동시 1개 inflight run, overlap 가드 + live SSE + graceful abort). 어드민 라우트 5종(`/admin/schedule/*`: config GET/PUT · run POST · runs GET · preview POST · run-events SSE). 신규 테이블 `ScheduleConfig`/`ScheduleRun` 2종 + croner 의존 추가. `app.ts` 는 `forceCloseConnections: 'idle'` 추가(shutdown 시 idle keep-alive 즉시 닫아 close 매달림 방지). crawl `job-registry.ts` 에 actor-agnostic `isPlaceCrawling(placeId)` 신규 — 스케줄러가 크롤 진행 중 식당을 건너뛰는 가드. restaurant 에 공개 카테고리 트리 라우트(`publicCategoryTree`/`getCategoryTree`) 추가. 파이프라인 로직 자체(정규화/머지 진행률·SSE 이벤트)는 [schedule 토픽](./schedule.md), 글로벌 머지 v3 택소노미/배열 스키마/청크 10/categoryPath 복구는 [analytics 토픽](./analytics.md) 참조 — friendly 문서는 "백엔드 셸/부팅/플러그인/모듈 목록" 관점만 흡수.

**2026-06-01 변경 흡수 — 정산 공유 OG SSR-lite + 정산표 PNG 서버 렌더 + 동적 og:image(식당 사진/특정 1장/토큰 시드) + ESLint 합류 + 식당 사진 경량 조회.** (1) 신규 [modules/settlement/share-preview.ts](../../apps/friendly/src/modules/settlement/share-preview.ts) 가 `/share/settlements/:token` (+ 별칭 `/s/:token`) 을 가로채 빌드된 웹 `index.html` 의 `<head>` 에만 OG 메타(식당명·총액·인원수 + `og:image`) 를 주입해 반환한다 — 풀 SSR 이 아니라 **head 메타만 서버 주입**(SSR-lite). 카카오톡/텔레그램 크롤러가 JS 없이 긁어도 미리보기가 채워지고, 실제 사용자도 같은 HTML 위에서 SPA 가 평소대로 부팅. `app.ts` 가 `registerSharePreview(app)` 으로 `/api/v1` prefix 밖 루트 경로에 등록. (2) 신규 [settlement-card.ts](../../apps/friendly/src/modules/settlement/settlement-card.ts) 가 화면의 정산표(`SettlementBreakdownTable`) 와 동일한 매트릭스를 **satori(레이아웃→SVG) + resvg(SVG→PNG)** 로 서버 렌더해 `/share/settlements/:token/image.png` 로 노출 — 한글 글리프는 번들된 `assets/fonts/IBMPlexSansKR-{Regular,Bold}.ttf` 로 커버. (3) `og:image` 는 owner 가 공유 시 고른 모드에 따라 동적: `restaurant`(기본 — 정산 식당 사진 갤러리에서 1장) / 특정 1장 고정(`shareOgImageUrl`) / `table`(정산표 PNG). 식당 사진은 `seedFromToken(token)` 으로 **토큰 시드 결정적 랜덤** — 같은 링크는 항상 같은 사진(카카오 OG 캐시와 일관). (4) `media.route.ts` 가 `ALLOWED_HOSTS` 를 export 해 정산이 "이 URL 을 thumbnail 프록시로 띄울 수 있나" 판정에 재사용. (5) `restaurant.service.ts` 에 `getPhotoUrls(placeId)` 신규 — `snapshotJson` 만 select + `mergePhotos` 재사용해 OG/갤러리용 사진 URL 만 경량 산출(visitorReviews/summary 미로드). (6) `getSharePreviewMeta` 가 메타 컬럼 + `_count` 만 읽고 `(token, origin)` 단위 5분 in-memory 캐시로 반복 크롤을 흡수. (7) friendly 가 ESLint 에 합류 — `eslint.config.mjs` 신규 + `lint` 스크립트(turbo lint 4/4 green). env 키 3종 추가(`WEB_INDEX_PATH`/`OG_IMAGE_PATH` + 기존 deep-link 키). `error-handler.ts` 의 setErrorHandler 콜백 `error` 파라미터에 `FastifyError` 타입 주석(추론이 `unknown` 으로 떨어지던 것 — 런타임 불변). 영수증 OCR 평가/비전 프로브 스크립트 3종(`eval-extraction.ts`/`probe-extraction.ts`/`probe-vision.ts`) 추가.

**2026-05-31 변경 흡수 — dev CORS 전면 반사 허용 + 공개 리뷰 최신순 정렬 버그 fix + 소스 NUL 제거.** (1) `plugins/cors.ts` 의 dev 분기가 RFC1918 화이트리스트 거부를 폐기하고 **모든 origin 을 반사 허용**(`cb(null, true)`)으로 바뀌었다 — 개발 머신 IP 가 공인/사설/VPN/WSL 대역으로 수시로 바뀌어 화이트리스트가 무의미한데다, 이전 `cb(Error)` 거부가 로그인 같은 **preflight 요청을 통째로 깨뜨리던** 회귀를 해소. RFC1918 정규식은 이제 "예상된 LAN origin" 분류용으로만 남아, 비-LAN origin 일 때만 origin 당 1회 `app.log.warn` 으로 오설정/오접속을 가시화한다. production 은 여전히 env `CORS_ORIGIN` list 로 엄격 차단 — 보안 영향 0. (2) **공개 리뷰 `sort=recent` 가 가장 오래된 리뷰를 맨 위에 내보내던 버그** — `restaurant.service.ts` 의 `assemblePublicReviews` 최종 정렬이 `fetchedAt desc` 라, 크롤러가 네이버 최신순으로 받아 저장한 순서(`fetchedAt asc = 최신순`)를 거꾸로 뒤집고 있었음 → `asc` 로 교정. (3) `contentHashOf` 의 해시 필드 구분자가 소스에 실제 NUL(`0x00`) 바이트로 박혀 git/ripgrep 이 파일을 바이너리로 취급하던 것을, 런타임 charCode 가 동일한 유니코드 이스케이프 시퀀스로 치환 — **해시값 불변(기존 `contentHash` 와 동일, dedup 영향 0)** + 파일이 순수 텍스트가 되어 diff 정상화(겸사겸사 EOL 을 형제 파일과 같은 CRLF 로 통일).

**2026-05-28 변경 흡수 — 정산 도메인 차수(round) 확장 + 자동 임시저장(draft) + Universal/App Links 검증 + dev CORS RFC1918 자동 허용.** 한 세션이 N차 회식을 표현할 수 있도록 `SettlementSession → SettlementRound → (items / attendees)` 로 데이터 모델이 한 단계 깊어졌다. 영수증도 한 장 안에 2~5 차가 가로로 붙어 있는 경우를 지원해 `ExtractReceiptInput.split: { count, index }` 가 추가되고 sharp 가 N 등분 중 한 슬라이스를 잘라 vision LLM 에 넘긴다. 정산 입력은 클라이언트 debounce 로 서버에 자동 임시저장되며 — 신규 `settlement-draft` 모듈 (`/me/settlements/drafts`) 이 `(userId, placeIdKey)` 복합 unique 로 upsert, `placeIdKey=''` 가 식당 미지정 슬롯 sentinel 이다. 정산 본저장이 성공하면 같은 트랜잭션 안에서 `SettlementDraftService.deleteByIdInTxIfOwner` 로 해당 draft 만 정리. iOS Universal Links / Android App Links 검증을 위한 신규 `well-known` 모듈이 `/.well-known/apple-app-site-association` 와 `/.well-known/assetlinks.json` 을 env (`APP_TEAM_ID`/`APP_BUNDLE_ID`/`ANDROID_APP_PACKAGE`/`ANDROID_SHA256_FINGERPRINTS`) 기반으로 동적 응답하며, 비어 있으면 404 — 잘못된 빈 JSON 으로 검증 실패하는 사고를 피하기 위함. `plugins/cors.ts` 는 dev 한정으로 RFC1918 사설 LAN IP 와 localhost origin 을 regex 로 자동 허용해 LAN IP 로 붙은 Expo Web 의 friendly API 호출이 .env 수정 없이 통과한다. settlement 라우트는 PATCH `/api/v1/settlements/:id/participants` 가 제거되고 PUT `/api/v1/settlements/:id` 전체 replace 로 단일화 (서버는 deleteMany 후 재삽입). AI provider 카드는 form 의 key 를 저장 전에 검증할 수 있게 신규 GET `/admin/ai/providers/:id/:purpose/models/preview` 가 추가 — 어드민이 키를 입력하는 도중 그 키로 모델 목록을 받아 select 에서 고른 뒤 저장.

이전 (2026-05-25) 흡수 분도 그대로 유효: 정산 도메인 3 모듈 (`settlement-extraction` / `settlement` / `contact`) + `plugins/multipart.ts` (5MB) + LLM provider × purpose 분리 + DB 경로 통일 (`file:../data/dev.db`) + vitest `fileParallelism: false` + 부팅 시 `PRAGMA foreign_keys=ON` 강제.

## Purpose [coverage: high — 10 sources]

`apps/friendly`는 niney-life-pickr-v2 모노레포의 유일한 백엔드 서비스다. Fastify 5 위에 zod 기반 스키마 검증, JWT 인증, Prisma+SQLite 영속화, OpenAPI/Swagger 문서, Playwright 크롤링 런타임, Naver 이미지 썸네일 프록시(sharp), Ollama Cloud 기반 리뷰 요약 + 구조화 분석 + 메뉴 정규화/통계, vworld 지도 SDK 키 관리, multi-source 가게 통합(canonical), **정산하기(receipt OCR/vision → 세션 CRUD → 분배 → 공유 토큰) + 단골 참여자 자동 적립 + 정산 공유 OG 미리보기(SSR-lite head 주입 + 정산표 PNG 서버 렌더)** 까지 얹어 web(`apps/web`)과 mobile(`apps/mobile`)이 동시에 호출하는 단일 API를 제공한다. **(2026-06-01)** 정산 공유 링크의 SNS 미리보기를 위해 `/api/v1` prefix 밖 루트 경로(`/share/settlements/:token`, `/s/:token`, `*/image.png`)를 직접 등록하는 신규 표면이 추가됐다.

도메인 표면은 모듈 디렉터리로 나뉜다.

- **auth** — 회원가입/로그인/내 정보/로그아웃 (`Routes.Auth.*`)
- **picks** — 사용자별 "선택지" CRUD + 랜덤 추첨 (`Routes.Picks.*`)
- **admin** — 사용자 목록·역할 변경 (`Routes.Admin.*`, `requireAdmin`)
- **restaurant** — 크롤된 맛집 + 방문자 리뷰 영속화, 요약/분석 진행률 SSE, reanalyze/insights/smart-pick + 메뉴 그룹핑/순위/분석 백필 라우트, 공개 list/detail/insights + 공개 ranking (`Routes.Restaurant.*`). admin list 는 **페이징 + 서버 정렬** 로 진화 (recent/satisfaction/positive/negativeRatio).
- **summary** — 리뷰 단위 AI 요약+구조화 분석 라이프사이클 (HTTP 라우트 없음, 내부 모듈)
- **menu-grouping** — 식당별 메뉴 표기 변형을 LLM으로 canonical 그룹핑 + 순위. 자세한 건 [menu-grouping 토픽](./menu-grouping.md).
- **analytics** — 글로벌 메뉴 통계 + 전역 LLM 머지 + 카테고리 트리. 자세한 건 [analytics 토픽](./analytics.md).
- **schedule** — **(NEW 2026-06-06)** croner 기반 in-process 주기 스케줄러. "메뉴 정규화(menu-grouping) → 글로벌 머지(analytics)" 파이프라인을 cron(기본 매일 03:00 KST) 으로 자동 실행 + 어드민 "지금 실행"(manual). 동시 1개만(overlap skip), 식당별 정규화는 멱등이라 재실행 안전, 크롤 진행 중 식당은 건너뜀. 자세한 건 [schedule 토픽](./schedule.md).
- **canonical** — cross-source 가게 동일성(canonical) + 자동 매칭 제안 큐. CanonicalService + ProposalService. 자세한 건 [canonical 토픽](./canonical.md).
- **auto-discover** — 어드민 키워드 한 줄 + 카테고리 칩 입력으로 AI 키워드 8 개 생성 → 다중 검색 → dedupe → 등록된 placeId 분리 → 그룹 5 개씩 직렬 크롤까지 한 잡으로 묶는 자동 발견 워크플로. 자세한 건 [auto-discover 토픽](./auto-discover.md).
- **settlement-extraction** — **(2026-05-25)** 영수증 multipart 업로드(JPEG/PNG/WebP, 5MB) → vision LLM 으로 메뉴/금액 추출 → 식당 메뉴 매칭/카테고리 분류 → 디스크 보관 (`data/receipts/<token>.jpg`). **(2026-05-28)** `ExtractReceiptInput.split: { count, index }` (count 2..5, 1-based index) + `roundIndex/roundTotal` 힌트 추가 — 한 장에 여러 차수 영수증이 가로로 붙어 있을 때 sharp 로 좌→우 N 등분 중 한 슬라이스만 잘라 LLM 에 넘긴다. 자세한 건 [settlement 토픽](./settlement.md).
- **settlement** — **(2026-05-25)** 정산 세션 CRUD + 카테고리별 분배 계산 + 공유 토큰 발급/회수. owner 본인만 보고 편집 가능, `shareToken` 으로 공개 read-only 페이지에 노출. **(2026-05-28)** 차수(N차) 정산 도입 — `SettlementSession → SettlementRound → (items / attendees)`. PATCH `/:id/participants` 가 제거되고 PUT `/:id` 전체 replace 로 통합. 자세한 건 [settlement 토픽](./settlement.md).
- **settlement-draft** — **(NEW 2026-05-28)** 정산 입력의 서버측 자동 임시저장 (`/me/settlements/drafts`). `(userId, placeIdKey)` 복합 unique 로 upsert — 식당 미지정 슬롯은 `placeIdKey=''` sentinel. payload 는 그대로 JSON 보관(검증 없음). 본저장 성공 시 같은 트랜잭션 안에서 `deleteByIdInTxIfOwner` 로 정리 (없거나 권한 없으면 silent skip — 정산 저장 자체는 성공해야 하므로).
- **settlement/share-preview** — **(NEW 2026-06-01)** 정산 공유 링크의 SNS 미리보기(OG) 처리. `app.ts` 가 `registerSharePreview(app)` 로 `/api/v1` 밖에 `/share/settlements/:token`·`/s/:token`(HTML) + `*/image.png`(PNG) 를 등록. HTML 핸들러는 빌드된 웹 `index.html` 의 `<head>` 에만 OG/twitter 메타를 주입(SSR-lite), 프라이버시상 참가자 이름은 안 넣고 식당명·총액·인원수까지만. PNG 핸들러는 `settlement-card.ts` 로 정산표를 렌더. 둘 다 토큰 기반 공개 라우트(인증 불필요), 만료/없음 → HTML 은 일반 OG 폴백·PNG 는 404. `getBySharedToken`/`getSharePreviewMeta` 를 직접 호출하는 `SettlementService` 인스턴스를 라우트에서 생성.
- **contact** — **(2026-05-25)** 사용자별 "단골 참여자" CRUD (`/me/contacts`). 정산 저장 시 participant 가 `(userId, normalizedKey)` 로 자동 upsert 되어 다음 정산에서 자동완성·다중 선택 모달로 재사용. 자세한 건 [settlement 토픽](./settlement.md).
- **well-known** — **(NEW 2026-05-28)** iOS Universal Links / Android App Links 검증 파일을 동적 응답. `/.well-known/apple-app-site-association` (AASA) + `/.well-known/assetlinks.json`. env (`APP_TEAM_ID`/`APP_BUNDLE_ID`/`ANDROID_APP_PACKAGE`/`ANDROID_SHA256_FINGERPRINTS`) 기반, 비어 있으면 404. components 의 path 가 `/share/settlements/*` 라 설치된 앱이 정산 공유 링크를 인터셉트. 인증 불필요, `Cache-Control: public, max-age=300`.
- **media** — Naver CDN 이미지 썸네일 프록시 + 디스크 캐시 (`Routes.Media.*`)
- **settings** — 외부 지도 SDK 키(vworld) 관리. admin CRUD + 평문 reveal + 공개 키 노출 (`Routes.SettingsMap.*`)
- **health** — 라이브니스 체크 (`Routes.Health`, `/health`)
- **crawl** — 별도 위키 토픽 ([crawl 토픽 참조](./crawl.md))
- **ai** — 별도 위키 토픽 ([ai 토픽 참조](./ai.md))

CLAUDE.md 규약상 모든 모듈은 `*.route.ts`(HTTP) + `*.service.ts`(비즈니스) + `*.test.ts`(Vitest) 트리오로 구성하고, FE/BE가 공유하는 타입/검증 로직은 모두 `@repo/api-contract`의 zod 스키마로만 정의한다. [apps/friendly/package.json](../../apps/friendly/package.json)의 `name: "friendly"`가 워크스페이스 식별자이며, `pnpm dev:api`/`pnpm --filter friendly <cmd>`로 단독 실행한다.

## Architecture [coverage: high — 21 sources]

엔트리 흐름은 `server.ts → buildApp() → autoload(plugins) → autoload(modules/*.route.ts) → registerSharePreview(app)` 로 단방향이고, listen 직전에 부팅 hook 3종(`cleanupStaleReviewSummaries` → `rescheduleStaleSummaries` → `app.schedule.bootstrap()`)이 순차 실행된다.

- [src/server.ts](../../apps/friendly/src/server.ts) — `buildApp()` 호출 직후 부팅 정리 3단계: (1) `cleanupStaleReviewSummaries(app.prisma, app.log)` 로 stale 요약 행 정리, (2) `rescheduleStaleSummaries(...)` 로 자동 재큐잉, **(3) (NEW 2026-06-06) `await app.schedule.bootstrap()`** — 직전 인스턴스에서 `running` 으로 남은 `ScheduleRun` 을 `interrupted` 로 마킹 + `ScheduleConfig` 를 읽어 cron 등록. 그 뒤 `env.HOST:env.PORT` 로 listen. SIGTERM/SIGINT 핸들러는 중복 호출 가드 후 **`scheduleRegistry.stopAllCrons()` + `abortInflight()`** 로 cron 타이머 정지·진행 중 주기작업 취소 → `app.close()` → `process.exit(0)`. close 가 15s 안에 안 끝나면 unref 된 safety 타이머가 `exit(1)`. 부팅 실패 시 `process.exit(1)`. abort 된 주기작업이 DB 에 `running` 으로 남으면 다음 부팅의 `bootstrap()` 이 `interrupted` 로 정리하고 다음 tick 에 재개.
- [src/app.ts](../../apps/friendly/src/app.ts) — Fastify 인스턴스를 만들고 **(NEW 2026-06-06) `forceCloseConnections: 'idle'`** 로 graceful shutdown 시 idle keep-alive 연결을 즉시 닫는다(처리 중 요청은 완료 대기) — 스케줄러 정리 후 `app.close()` 가 매달리지 않게. 그다음 `withTypeProvider<ZodTypeProvider>()`를 적용한 뒤 `validatorCompiler`/`serializerCompiler`를 등록한다. `serializers.req`에서 `?token=` 쿼리스트링을 `[REDACTED]`로 마스킹(SSE 인증용 JWT가 매 로그 라인에 박히지 않도록). `dev`에서는 `pino-pretty` 트랜스포트. 그다음 `@fastify/autoload`로 두 단계 등록:
  1. `plugins/` 디렉터리 전체 자동 로드
  2. `modules/` 하위에서 `*.route.(ts|js)`만 골라 자동 로드 (`dirNameRoutePrefix: false` — URL prefix는 `Routes.*` 상수가 결정)
  그 직후 **(NEW 2026-06-01)** `await registerSharePreview(app)` 로 정산 공유 OG 미리보기 라우트를 `/api/v1` prefix **밖** 루트 경로에 직접 등록한다(autoload 가 아니라 명시 호출 — `/share/settlements/*`, `/s/*` 는 OG 크롤러가 origin 루트에서 찾는 경로라 prefix 가 붙으면 안 됨).
- [src/types/fastify.d.ts](../../apps/friendly/src/types/fastify.d.ts) — `FastifyInstance`에 `prisma`, `authenticate`, `requireAdmin` 데코레이터, `FastifyRequest.user`에 `{ userId, email, role }` 타입을 선언.

플러그인 레이어 (모두 `fastify-plugin`으로 감싸 데코레이터를 부모 스코프에 노출):

- [plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts) — `env.CORS_ORIGIN`이 `*`이면 `true`, 아니면 콤마 분리. `credentials: true`. **(2026-05-31 갱신)** dev (`isDev`) 에선 origin 을 **제한하지 않고 전부 반사 허용**(`cb(null, true)`) — 개발 머신 IP 가 수시로 바뀌어 화이트리스트가 무의미 + prod 는 아래 env list 로 막으므로 보안 영향 없음. 이전(2026-05-28)의 `PRIVATE_LAN_ORIGIN` regex(`localhost`/`127.0.0.1`/`10.x`/`192.168.x`/`172.16~31.x`, optional `:port`)는 이제 거부용이 아니라 **분류용** — 매칭 안 되는 비-LAN origin 만 `warned` Set 으로 origin 당 1회 `app.log.warn`. (이전엔 비-LAN origin 을 `cb(Error)` 로 거부 → 로그인 등 preflight 가 통째로 깨졌음.) production 은 dev 분기 자체가 없어 env CORS_ORIGIN 만 사용.
- [plugins/helmet.ts](../../apps/friendly/src/plugins/helmet.ts) — `contentSecurityPolicy: false` (Swagger UI 호환).
- [plugins/sensible.ts](../../apps/friendly/src/plugins/sensible.ts) — `reply.unauthorized()`/`reply.forbidden()`/`app.httpErrors.*`.
- [plugins/jwt.ts](../../apps/friendly/src/plugins/jwt.ts) — `@fastify/jwt` + `authenticate`/`requireAdmin` 데코레이터.
- [plugins/prisma.ts](../../apps/friendly/src/plugins/prisma.ts) — `PrismaClient` 인스턴스, `app.prisma` 노출, `onClose`에 `$disconnect`. 부팅 시 PRAGMA 셋업: **`journal_mode=WAL`** (동시 읽기), **`synchronous=NORMAL`**, **`busy_timeout=30000`** (SQLITE_BUSY → "Transaction not found" 회피), **`foreign_keys=ON`** (SQLite 기본 OFF — Cascade 가 실제 동작하려면 필수). `name: 'prisma'` 로 다른 플러그인이 `dependencies: ['prisma']` 로 줄 세울 수 있게 등록.
- [plugins/swagger.ts](../../apps/friendly/src/plugins/swagger.ts) — OpenAPI 메타 + `bearerAuth` 시큐리티 스킴, Zod→JSON Schema 변환. UI는 `/docs`.
- [plugins/error-handler.ts](../../apps/friendly/src/plugins/error-handler.ts) — `ZodError`/Fastify validation/4xx/5xx 정규화. dev에서만 5xx 메시지 노출. **(2026-06-01)** `setErrorHandler((error: FastifyError, ...))` — 콜백의 `error` 가 타입 추론상 `unknown` 으로 떨어지던 것을 `FastifyError` 명시 주석으로 좁혀 `error.validation`/`error.statusCode`/`error.name` 접근의 타입 안전을 회복(런타임 동작 불변).
- [plugins/empty-body-parser.ts](../../apps/friendly/src/plugins/empty-body-parser.ts) — 빈 `application/json` body를 `{}`로 해석(action 없는 POST용).
- [plugins/summaries.ts](../../apps/friendly/src/plugins/summaries.ts) — `SummaryService` + `JobLogService` + `AiConfigService` 셋을 `app.decorate('summaries' | 'jobLog' | 'aiConfig', ...)` 로 노출. `dependencies: ['prisma']`.
- **[plugins/multipart.ts](../../apps/friendly/src/plugins/multipart.ts) — (NEW 2026-05-25)** `@fastify/multipart` 등록. `fileSize: 5 * 1024 * 1024` (5MB), `files: 1`, `fields: 5`. 한도 초과 시 multipart 가 자동 413. 영수증 업로드 (`settlement-extraction`) 가 사용. 다른 multipart 소비자가 생기면 한도 상향은 여기서 한 번에.
- **[plugins/schedule.ts](../../apps/friendly/src/plugins/schedule.ts) — (NEW 2026-06-06)** `ScheduleService` 를 `app.decorate('schedule', ...)` 로 노출하는 app-level singleton — `summaries.ts` 와 같은 plugin-singleton 패턴. `dependencies: ['prisma']`. **자체 `AiConfigService` 를 생성**해 `MenuGroupingService`/`AnalyticsService` 를 직접 만든다(`app.aiConfig` 재사용 안 함) — autoload 알파벳순상 `'schedule' < 'summaries'` 라 schedule plugin 이 먼저 잡혀 `app.aiConfig`(summaries 가 decorate) 가 아직 없기 때문. `onClose` hook 에서 `scheduleRegistry.stopAllCrons()` + `abortInflight()` (server.ts shutdown 과 중복이지만 멱등 — 테스트의 `app.close()` 에서도 정리). 라우트(`schedule.route.ts`)와 부팅 cron tick(`server.ts`)이 같은 `app.schedule` 인스턴스를 공유하고, cron 타이머·진행 상태만 모듈 singleton `scheduleRegistry` 가 보유.

모듈 레이어 — 현재 디렉터리:

```
modules/
├── admin/
├── ai/
├── analytics/                ← 글로벌 메뉴 통계 + 전역 LLM 머지 (analytics 토픽)
├── auth/
├── auto-discover/            ← AI 키워드 → 다중 검색 → 그룹 직렬 크롤 자동 발견 잡 (auto-discover 토픽)
├── canonical/                ← cross-source 가게 통합 + 자동 매칭 제안 (canonical 토픽)
├── contact/                  ← /me/contacts — 단골 참여자 CRUD (settlement 토픽)
├── crawl/
├── health/
├── media/
├── menu-grouping/            ← 식당별 메뉴 LLM 그룹핑 + 순위 (menu-grouping 토픽)
├── picks/
├── restaurant/
├── schedule/                 ← (NEW 2026-06-06) croner 주기 스케줄러 (schedule 토픽)
│   ├── schedule.service.ts                  ← 파이프라인 로직 + config/run/preview/이력
│   ├── schedule-registry.ts                 ← 모듈 singleton: cron 타이머 + inflight run(동시 1개) + SSE
│   ├── schedule.route.ts                    ← /admin/schedule/* 5종(config·run·runs·preview·run-events SSE)
│   └── schedule.service.test.ts
├── settings/                 ← 지도 SDK 키 관리 (vworld)
├── settlement/               ← 정산 세션 CRUD + 차수(round) + 분배 + 공유 토큰
│   ├── settlement.{route,service,*.test}.ts
│   ├── settlement-draft.{route,service,route.test}.ts   ← (NEW 2026-05-28) /me/settlements/drafts
│   ├── share-preview.ts                                 ← (NEW 2026-06-01) OG SSR-lite HTML + image.png 라우트 (app.ts 명시 등록)
│   └── settlement-card.ts                               ← (NEW 2026-06-01) 정산표 PNG 서버 렌더 (satori + resvg)
├── settlement-extraction/    ← 영수증 multipart → vision LLM 추출 + (2026-05-28) split 분할
├── summary/
├── user/
└── well-known/               ← (NEW 2026-05-28) AASA + assetlinks.json (universal/app links)
```

autoload는 route 파일만 픽업하므로 `summary/`처럼 라우트 파일이 없는 모듈은 외부에서 모듈 싱글턴(`summaryEventsBus`)과 명시적 import로만 접근한다. analytics/menu-grouping/settings/canonical/contact/settlement/settlement-extraction/**schedule** 은 자체 `*.route.ts` 가 있어 자동 등록.

**가게 동일성 매칭 라이브러리** — [src/lib/matching.ts](../../apps/friendly/src/lib/matching.ts) 는 모듈에 속하지 않는 순수 유틸. 가게명 정규화(`normalizeName` — 소문자/공백/구두점 제거 + 분점 suffix `본점/지점/점` 제거) + bigram Jaccard 이름 유사도(`nameSimilarity`) + Haversine 거리(`distanceMeters`) + 둘을 0.6/0.4 가중한 `scoreMatch` 와 임계(`MATCH_THRESHOLDS`: 좌표 있을 때 score ≥ 0.45 + 거리 ≤ 500m, 좌표 없으면 name ≥ 0.7). `restaurant.list()` 의 1차 suggestion 산출과 canonical 의 ProposalService 가 둘 다 호출.

**공개 vs admin 라우트 분리 정책** — 같은 도메인이라도 (1) 응답 스키마가 다르거나 (2) 가드만 빠진 게 아니라 캐싱/SEO 정책이 다른 경우에는 별도 라우트로 분리한다. 핸들러 안에서 `if (req.user) {…} else {…}` 분기보다 라우트 자체가 둘이라 OpenAPI/Swagger 가 두 응답 셋을 분리해 표시하고 어드민 회귀 위험이 0이 된다. restaurant 의 `publicList`/`publicByPlaceId`/`publicInsights`/`ranking`, settings 의 `publicConfig`, **settlement 의 owner 라우트 vs `/share/settlements/:token` 공개 read-only 라우트** 가 같은 패턴.

**crawl 모듈 변경 흡수 (2026-05-15)** — 자세한 건 [crawl 토픽](./crawl.md). friendly 차원에선 `CrawlService` 생성자에 `ProposalService` 가 추가 주입돼 (`new CrawlService(restaurants, summaries, jobRegistry, proposals)`) 신규 등록 후크에서 자동 매칭 후보를 적재한다.

**crawl 모듈 변경 흡수 (2026-05-17)** — `CrawlService` 생성자에 `CanonicalService` 가 한 번 더 주입돼 (`new CrawlService(restaurants, summaries, jobRegistry, proposals, canonical)`) 신규 메소드 `tryAutoMatchDiningcode(canonicalId)` 가 Naver 잡 done 후크에서 fire-and-forget 으로 호출된다. 자세한 건 [crawl 토픽](./crawl.md) / [canonical 토픽](./canonical.md).

**restaurant 모듈 변경 흡수 (2026-05-17)** — 신규 파일 [restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts) 가 canonical 그룹(Naver + DC 형제) 을 단일 public detail 로 융합하는 순수 함수 군을 모아둔다.

**plugins/summaries.ts — app-level singleton 패턴 (2026-05-19)** — 신규 [plugins/summaries.ts](../../apps/friendly/src/plugins/summaries.ts) 가 `SummaryService` + `JobLogService` + `AiConfigService` 셋을 `fastify-plugin` 으로 묶어 `app.decorate('summaries' | 'jobLog' | 'aiConfig', ...)` 로 노출.

**CrawlJobLog 시스템 (2026-05-19)** — 신규 [modules/crawl/job-log.service.ts](../../apps/friendly/src/modules/crawl/job-log.service.ts) 가 크롤+요약 단계별 로그를 세 곳에 동시 흘려보내는 단일 진입점: (1) `app.log` pino 콘솔, (2) `prisma.crawlJobLog` DB 영속화, (3) SSE 채널. 모노톤 `seq` 카운터를 발급해 `(jobId, seq)` 로 클라이언트 dedup.

**Summary 라이프사이클 확장 — queued / cancelled / 부팅 자동 재큐잉 (2026-05-19)** — `ReviewSummary.status` enum 6종(queued/pending/running/done/failed/cancelled). 부팅 시 `cleanupStaleReviewSummaries` + `rescheduleStaleSummaries` 가 자동 재개.

**restaurant.list 페이징·정렬 (2026-05-25)** — 어드민 list 가 page state 를 URL 동기화 + 서버 정렬로 진화. `RestaurantListQuery` (offset/limit/sort) zod 스키마가 추가되고 `RestaurantService.list(query)` 가 `RestaurantListResultType` (`{ items, total, limit, offset }`) 반환. 정렬 키 `recent` (lastCrawledAt desc — 기본) / `satisfaction` (avgSatisfactionScore desc) / `positive` (avgSentimentScore desc) / `negativeRatio` (negativeCount/summaryDone asc). null 분석값은 항상 nulls-last. canonical 집계가 sources 합산이라 DB 정렬을 못 빼므로 **모든 canonical 후보까지 계산 후 메모리에서 정렬·slice** — 데이터 규모(< 1k canonical) 가정. handler 도 `service.list(req.query)` 한 줄로 단순화.

**LLM provider purpose 분리 (2026-05-25)** — [adapter-cache.ts](../../apps/friendly/src/modules/ai/adapter-cache.ts) 의 캐시 키에 `provider|purpose` prefix 가 들어가 chat/image 가 서로 다른 어댑터 인스턴스를 갖는다. `AiConfigService.getResolved(provider, purpose)` 는 모든 호출처가 `purpose` 인자를 명시적으로 넘기게 변경 — summary/analytics/menu-grouping/auto-discover 가 일괄 `'chat'` 으로 호출, settlement-extraction 만 `'image'` 로 호출. `AiConfigService.list()` 는 DB 행 + env-backed 가상 row (purpose='chat' 한정) 를 합성해 어드민 카드에 표시 — DB 에 chat row 가 없으면 env fallback 가상 카드 1개, image 는 DB row 가 있어야만 카드로 노출.

**정산하기 도메인 분리 (2026-05-25)** — `settlement-extraction` / `settlement` / `contact` 세 모듈은 friendly 안에서 자기 라우트 트리(`/settlement-extractions`, `/settlements`, `/me/contacts`, `/share/settlements/:token`) 와 자기 prisma 모델 4종 (`SettlementSession` / `SettlementItem` / `SettlementParticipant` / `SettlementContact`) 을 갖는다. friendly 차원에선 (1) `plugins/multipart.ts` 로 영수증 업로드 채널 제공, (2) `User → SettlementSession/SettlementContact` Cascade 관계 + `SettlementParticipant.contactId` SetNull 관계 추가, (3) `apps/friendly/data/receipts/` 디렉터리에 영수증 jpg 보관 — 까지가 인프라 책임. 라우트 스키마·분배 계산·UI 시나리오는 [settlement 토픽](./settlement.md) 으로 위임.

**정산 차수(round) 모델 도입 (2026-05-28)** — 한 세션 = 한 식당 한 영수증 가정이 깨졌다. 회식이 1차/2차/3차 로 이어지면서 같은 멤버 집합이라도 차수마다 식당·금액·참석자·할인 정책이 달라진다. 모델은 한 단계 깊어져:
- `SettlementSession` 은 세션 머리 (`userId`/`restaurantPlaceId`/`restaurantName`/`grandTotal`/`shareToken`/`editedAt`/`createdAt`/`updatedAt`) 만 보유.
- `SettlementRound` 가 차수별 `orderIndex`/`restaurantPlaceId`/`restaurantName`/`source` (`MANUAL`|`RECEIPT`)/`totalAmount?`/`warning?`/`receiptImageToken?`/`itemsSubtotal`/`discountAmount?`/`discountCategory?`/`categoryAdjustments?` (JSON) 를 가진다. `SettlementItem.sessionId` 는 `roundId` 로 옮겨졌다 — 마이그레이션이 SQLite 의 table-redefine 패턴 (`new_*` 테이블 → INSERT → DROP → RENAME) 으로 백필.
- `SettlementRoundAttendee` (테이블명 `settlement_round_participants`) 가 차수 × 마스터참여자 join — `attended`/`excludeAlcoholOverride?`/`excludeNonAlcoholOverride?`/`excludeSideOverride?`/`shareAmount` (차수별 스냅샷). 마스터 `SettlementParticipant` 의 `excludeAlcohol/NonAlcohol/Side` 는 default 정책으로 남고 차수에서 override.
- service 의 `create` 트랜잭션 흐름: session → participants (clientId → cuid 매핑) → rounds → 각 round 의 items + attendees → `calculateMultiRoundShares()` 가 모든 차수를 합산해 마스터 `participant.shareAmount` 와 round attendee 의 `shareAmount` 스냅샷을 채운다 → `fromDraftId` 가 들어왔으면 같은 트랜잭션에서 `SettlementDraftService.deleteByIdInTxIfOwner(tx, userId, fromDraftId)` 로 해당 draft 정리.
- `update` 는 PUT 한 라우트로 통합 — 부분 PATCH 가 사라지고 클라이언트가 전체 draft 를 보낸다. 서버는 `deleteMany` 로 child rows (items / attendees / rounds / participants) 를 전부 비우고 재삽입. 부분 갱신의 race 가 사라지고 차수 추가/삭제도 같은 경로.
- `getBySharedToken` 은 차수 응답에서 `userId` 와 round 의 `receiptPreviewUrl` 을 제거 — 공개 read-only 라 영수증 원본 사진 노출 금지.

**영수증 분할 추출 — 한 장에 여러 차수 (2026-05-28)** — 회식 영수증을 한 장의 사진에 가로로 붙여 찍는 사용자가 많아 `ExtractReceiptInput` 이 optional `split: { count, index }` (count 2..5, 1-based) + optional `roundIndex/roundTotal` (1..20) 을 받는다. `settlement-extraction.service` 의 `cropForSplit` 이 sharp 로 원본을 좌→우 N 등분 후 `index` 번째 슬라이스만 잘라 vision LLM 에 전달 (`split.index === split.count` 면 잔여 폭 보정해서 마지막 슬라이스가 전체를 cover). count=1 이거나 split 미지정이면 원본 그대로. `EXTRACTION_VERSION = 2` (이전 1). `settlement-extraction.prompts.ts` 가 `roundHint` 일 때 "이 영수증은 N차 회식 중 K차 영수증입니다" 라인을 프롬프트 헤더에 prepend 해 LLM 컨텍스트 보강. 같은 imageToken 을 N 번 extract 호출하면 N 차의 items 를 각각 얻는다.

**자동 임시저장(draft) 모듈 (2026-05-28)** — 신규 [modules/settlement/settlement-draft.{route,service}.ts](../../apps/friendly/src/modules/settlement/settlement-draft.route.ts). 정산 입력 화면이 debounce 자동 저장 → `PUT /me/settlements/drafts` 로 보내고, 본저장 시 `CreateSettlementInput.fromDraftId` 에 그 draft id 를 실어 보내면 settlement.service 의 트랜잭션이 같은 tx 안에서 draft 를 지운다. service 가 `placeIdToKey(placeId: string|null): string` 로 변환하는 이유는 SQLite 의 NULL unique 가 다중 NULL 을 distinct 취급해 `(userId, placeId)` 로는 식당 미지정 슬롯이 무한정 늘어나기 때문 — `placeIdKey=''` sentinel 로 '식당 미지정' 슬롯 1개를 user 당 보장. payload 는 그대로 JSON 문자열 보관(검증/파싱 없음) — 클라이언트 store 진화에 유연하게.

**Universal/App Links 검증 모듈 (2026-05-28)** — 신규 [modules/well-known/well-known.route.ts](../../apps/friendly/src/modules/well-known/well-known.route.ts). 정적 파일 대신 라우트로 만든 이유: (1) env 변경만으로 즉시 반영 (재배포·dist 복사 불필요), (2) 비어 있을 때 명확히 404 — 잘못된 빈 JSON 으로 iOS/Android 의 검증을 실패시키는 사고 회피. `apple-app-site-association` 의 components 가 `"/share/settlements/*"` 로 박혀 있어 설치된 앱이 공유 정산 링크를 자동 인터셉트. `assetlinks.json` 은 `sha256_cert_fingerprints` 를 콤마 분리 env 로 받아 debug/release 지문을 둘 다 등록 가능.

**dev CORS RFC1918 자동 허용 (2026-05-28)** — [plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts) 가 dev 분기에서 `PRIVATE_LAN_ORIGIN` regex (localhost / 127.0.0.1 / 10.x / 192.168.x / 172.16~31.x, optional `:port`, http/https 모두) 매칭 origin 을 자동 허용. 폰이 LAN IP 로 띄운 Expo Web 을 열고 그 안에서 friendly API 를 호출할 때 origin 이 `http://192.168.x.x:8081` 이 되는데, `.env` 의 `CORS_ORIGIN` 에 IP 를 매 dev 세션마다 박는 마찰을 없애기 위함. production 분기는 regex 미사용 — env 명시 origin 만 통과.

**정산 공유 OG SSR-lite (share-preview.ts, NEW 2026-06-01)** — 신규 [modules/settlement/share-preview.ts](../../apps/friendly/src/modules/settlement/share-preview.ts). 웹은 순수 Vite SPA 라 카카오톡/텔레그램 OG 크롤러가 JS 없이 `index.html` 을 긁으면 OG 태그가 비어 미리보기가 빈칸이다. 이 모듈이 `/share/settlements/:token` (+별칭 `/s/:token`) 을 가로채 **빌드된 웹 `index.html` 의 `<head>` 에만** OG/twitter 메타(`<title>` 교체 + `</head>` 앞 주입) 를 넣어 반환한다 — 자산·그 외 경로는 nginx 정적 서빙 그대로, 풀 SSR 아님. 핵심 설계 포인트:
- **index.html 경로 탐색** — dev(tsx, `__dirname=.../modules/settlement`) 와 prod(tsup 번들, `__dirname=.../dist`) 가 달라 고정 상대경로 하나로 못 맞춘다. `candidateIndexPaths()` 가 `__dirname` 과 `process.cwd()` 에서 위로 7단계 올라가며 `apps/web/dist/index.html` 과 `web/dist/index.html` 두 형태를 모두 후보로 만들어 처음 읽히는 것을 사용. `env.WEB_INDEX_PATH` 가 있으면 그것만. 읽은 HTML 은 프로세스 수명 동안 모듈 변수 `cachedIndex` 로 캐시(pm2 reload 시 자연 비워짐), 어느 후보에서도 못 읽으면 시도한 경로 전부를 `app.log.error` 로 남기고 500.
- **프라이버시** — OG description 은 `총 {grandTotal}원 · {N}명` 까지만. 참가자 이름은 크롤러 캐시에 박제되지 않게 넣지 않는다(정산표 PNG 를 og:image 로 고른 경우는 이름 노출 — owner 의 명시 선택).
- **만료/없는 토큰** — `getSharePreviewMeta` 가 null 이면 일반 OG(`Life Pickr 정산`) 로 폴백하고 SPA 가 자체 에러 화면을 띄운다. 응답은 `cache-control: no-cache`(SPA HTML 자체는 매번 신선).

**정산표 PNG 서버 렌더 (settlement-card.ts, NEW 2026-06-01)** — 신규 [settlement-card.ts](../../apps/friendly/src/modules/settlement/settlement-card.ts) 가 화면의 `SettlementBreakdownTable` 매트릭스(행=참여자, 열=차수×카테고리+차수소계, 끝에 총계, 하단 합계 행)를 **satori(VDOM→SVG) + @resvg/resvg-js(SVG→PNG)** 로 렌더한다. JSX 없이 `h(type, style, children)` 헬퍼로 satori VDOM 을 직접 빌드(satori 는 `display:table` 미지원이라 고정폭 flex 박스로 격자). 분담 계산은 화면의 `useMatrix` 와 동일하게 `@repo/api-contract` 의 `calculateMultiRoundShares`/`effectiveExcludes` 를 그대로 호출해 웹·앱·서버 결과가 100% 동일. 폰트는 번들된 `assets/fonts/IBMPlexSansKR-{Regular,Bold}.ttf` 를 `fontCandidates()`(share-preview 와 동일한 위로-탐색 전략) 로 찾아 프로세스당 1회 읽어 캐시(satori 는 system 폰트 못 씀 → ttf 버퍼 명시 주입). 출력 폭에 따라 resvg `fitTo` 스케일을 1/1.5/2x 로 낮춰 넓은 표의 PNG 크기를 억제. height 미지정으로 satori 가 내용 높이를 자동 계산(참여자/차수 많아도 안 잘림). `/share/settlements/:token/image.png` 로 노출, `cache-control: public, max-age=300`.

**동적 og:image 선택 (2026-06-01)** — owner 가 공유 다이얼로그에서 고른 모드(`SettlementSession.shareOgImage` enum + `shareOgImageUrl`) 에 따라 og:image 가 갈린다. `restaurant`(기본): `SettlementService.pickRestaurantOgImageUrl` 이 정산에 묶인 식당들의 사진(네이버 호스트 = thumbnail 프록시 가능 것만)을 모아 owner 가 고른 `shareOgImageUrl` 이 후보에 살아 있으면 그것, 아니면 `seedFromToken(token) % images.length` 로 **토큰 시드 결정적 랜덤** 1장을 골라 `Routes.Media.thumbnail?url=...&w=1200&q=80` 프록시 URL 로 반환. `table` 이거나 사진이 없으면 null → 정산표 PNG(`*/image.png`) 로 폴백. 시드라 같은 링크는 항상 같은 사진(카카오 OG 캐시와 일관, 매 크롤마다 안 바뀜). 후보 수집(`collectCandidateImageUrls`)은 placeId 별로 `RestaurantService.getPhotoUrls` 를 호출해 dedup + thumbnail 프록시 가능 호스트만 + 12장 상한.

**식당 사진 경량 조회 getPhotoUrls (2026-06-01)** — [restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts) 에 `getPhotoUrls(placeId): Promise<string[]>` 신규. `getPublicDetail` 이 식당당 수십~수백 행의 visitorReviews/summary 를 로드하는 것과 달리, 네이버 행 + 같은 canonical 의 DC 형제 행의 `snapshotJson` **만** select 해 `mergePhotos` 로 사진 URL 배열을 산출(결과는 `getPublicDetail().imageUrls` 와 동일). 정산 OG/갤러리는 사진 URL 만 필요하므로 리뷰 코퍼스 로드를 통째 생략 — OG 미리보기·갤러리 다이얼로그의 백엔드 측 경량화. 깨진 snapshotJson 은 빈 배열로 폴백.

**OG 미리보기 메타 경량 캐시 (2026-06-01)** — `getSharePreviewMeta(token, origin)` 가 풀 로우(rounds→items/attendees, participants) 대신 메타 컬럼 + `_count.participants` + `rounds[].restaurantPlaceId` 만 select 하고, 카카오/슬랙 OG 크롤러가 같은 링크를 짧은 시간에 여러 번 펼치므로 `(token, origin)` 키로 5분 in-memory `Map`(`sharePreviewCache`) 캐시 — 성공(non-null) 결과만 캐시, 사이즈 5000 초과 시 통째 clear. owner 가 share 를 갱신/회수하면 `invalidateSharePreview(token)` 가 그 토큰의 모든 origin 변형 엔트리를 제거. Redis 불필요(단일 인스턴스 전제, CLAUDE.md). `media.route.ts` 가 `ALLOWED_HOSTS` Set 을 export 해 정산 측 `isThumbnailProxyable(url)` 이 동일 화이트리스트로 프록시 가능 여부를 판정(SSRF 가드 일원화).

**friendly ESLint 합류 (2026-06-01)** — 신규 [eslint.config.mjs](../../apps/friendly/eslint.config.mjs) 가 `@repo/config/eslint/node` (base + Node 글로벌) 를 spread 한 뒤, 기존 스크래핑 어댑터·dev 스크립트의 잔존 위반(`no-useless-assignment`/`no-useless-escape`/`prefer-const`/`@typescript-eslint/consistent-type-imports`)을 우선 `warn` 으로 도입(점진 정리). `dist`/`.turbo`/`node_modules`/`prisma/migrations` ignore. `package.json` 에 `"lint": "eslint ."` 추가 — web/friendly/api-contract/mobile 4개가 turbo lint 에 합류(4/4 green).

**주기 스케줄러 모듈 (schedule, NEW 2026-06-06)** — 신규 [modules/schedule/](../../apps/friendly/src/modules/schedule/schedule.service.ts). "어드민이 식당을 등록·크롤한 뒤 메뉴 정규화(menu-grouping)와 글로벌 머지(analytics)를 매번 손으로 돌려야 하는" 마찰을 야간 배치로 자동화. CLAUDE.md no-Redis 전제라 외부 큐/스케줄러 없이 **croner 로 in-process cron** 을 돈다. 책임 분리:
- [schedule.service.ts](../../apps/friendly/src/modules/schedule/schedule.service.ts) — 파이프라인 로직 + 설정/실행/미리보기/이력. `runScheduled(trigger)` 흐름: `scheduleRegistry.beginRun()`(overlap 가드) → `collecting`(처리 필요 식당 수집 = `menuGrouping.getRestaurantsStatus({attention:true, sort:'unmapped'})` − 크롤 중 식당) → `grouping`(식당별 `menuGrouping.groupForRestaurant` 순차, 식당 경계마다 abort 체크 + `isPlaceCrawling` 재확인, 개별 실패는 로그만) → `merging`(`analytics.runGlobalMerge({full:false})`, `AnalyticsError code='no_inputs'` 는 정상 skip) → `finishRun` + `ScheduleRun`/`ScheduleConfig` 업데이트. 한 주기 최대 `MAX_TARGETS_PER_RUN=200`(초과분은 멱등하므로 다음 주기). cron 검증/미리보기는 `new Cron(expr, {paused:true}).nextRuns(5)`.
- [schedule-registry.ts](../../apps/friendly/src/modules/schedule/schedule-registry.ts) — 모듈 singleton(`scheduleRegistry`). jobType 당 croner `Cron` 하나(`unref:true`, `catch:true`, `paused`/in-place 변경 불가라 재등록 시 stop 후 재생성) + **동시 1개 inflight run**(`global-merge-job-registry` 와 같은 단일 슬롯 모델 — overlap 가드 `beginRun`, live 진행 `setPhase/markProcessing/incProcessed/incSkipped`, SSE `subscribe/publish`, graceful `abortInflight`). 끝난 run 의 `active` 는 직후 조회/SSE 가 마지막 스냅샷을 볼 수 있게 의도적으로 유지(다음 `beginRun` 이 교체). 자세한 진행률/SSE 이벤트 모델은 [schedule 토픽](./schedule.md). [in-memory singleton gates](../concepts/in-memory-singleton-gates.md) 컨셉의 또 한 사례.
- 현재 `jobType` 은 `'normalize-merge'` 하나 — 추후 다른 주기작업이 생기면 jobType 으로 분기. 기본 cron `0 3 * * *`(매일 03:00) + tz `Asia/Seoul`, 어드민이 `ScheduleConfig` 로 변경(런타임 reschedule).

## Talks To [coverage: high — 16 sources]

- **`@repo/api-contract`** — `Routes.*` URL 상수와 모든 zod 스키마(인증/픽/식당/요약/분석/미디어/AI/메뉴 그룹핑/애널리틱스/지도 설정/canonical/**settlement/settlement-contact/settlement-extraction**)의 단일 출처.
- **`@repo/utils`** — `picks.service.ts`의 랜덤 추첨에서 `pickRandom(options)`.
- **Prisma + SQLite** — [prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)는 `provider = "sqlite"`. `DATABASE_URL` 은 `.env.example` 기준 `file:../data/dev.db` — Prisma CLI 의 cwd 가 `apps/friendly/prisma/` 이고 서버 cwd 가 `apps/friendly/` 라 `../data/dev.db` 가 양쪽 모두 `apps/friendly/data/dev.db` 를 가리키도록 통일 (이전엔 마이그레이션이 `prisma/dev.db` 를 만들고 서버는 `data/dev.db` 를 보던 분기 사고가 있었음).
- **bcryptjs** — [src/lib/hash.ts](../../apps/friendly/src/lib/hash.ts)의 `hashPassword`/`verifyPassword`가 10 라운드 솔트.
- **sharp ^0.34** — media 모듈의 썸네일 리사이즈/JPEG 인코딩, settlement-extraction 의 영수증 split crop.
- **satori ^0.26 + @resvg/resvg-js ^2.6** — **(NEW 2026-06-01)** 정산표 PNG 서버 렌더 (`settlement-card.ts`): satori 가 VDOM→SVG, resvg 가 SVG→PNG. 번들 폰트 `assets/fonts/IBMPlexSansKR-{Regular,Bold}.ttf` 를 명시 주입.
- **Playwright + playwright-extra/stealth** — crawl 모듈이 사용. **(2026-05-25)** `playwright-extra ^4.3.6` + `puppeteer-extra-plugin-stealth ^2.11.2` 의존성 추가 — 네이버 크롤러 stealth 적용 + 429 차단 우회.
- **Naver Place 페이지 + Naver CDN** — crawl 이 SSR/AJAX, media 가 `phinf.pstatic.net` 호스트군 썸네일 프록시.
- **Naver PC 지도 페이지 (`map.naver.com`)** — 검색 어댑터.
- **Diningcode / Catchtable** — crawl 의 추가 소스. 자세한 건 [crawl 토픽](./crawl.md).
- **Ollama Cloud** — ai/summary/menu-grouping/analytics 가 LLM chat 호출, **settlement-extraction 이 vision (image) 호출**. provider 설정 row 는 `(provider, purpose)` 복합 unique 라 같은 ollama-cloud 라도 chat/image 가 서로 다른 model/concurrency 로 등록 가능.
- **`@fastify/multipart` ^10** — 영수증 업로드용. 5MB / 1 파일 / 5 필드 한도.
- **croner ^10** — **(NEW 2026-06-06)** schedule 모듈의 in-process cron 타이머 + cron 식 파싱/검증/다음 실행 시각 미리보기. 외부 큐/Redis 없이 단일 인스턴스 안에서 도는 유일한 스케줄러 의존(CLAUDE.md no-Redis).
- **외부 지도 키(vworld)** — settings 가 평문 보관.
- **소비자** —
  - `apps/web` 어드민 화면이 `@repo/shared`의 API 클라이언트로 모든 admin 라우트 호출.
  - `apps/web` 공개 화면(루트 랭킹·맛집 지도·식당 상세) + **로그인 후 정산하기 stepper + /me/settlements 이력 + /me/contacts 단골 + /share/settlements/:token 공개 결과**.
  - `apps/mobile` 도 같은 클라이언트 (CLAUDE.md 핵심 규칙 #2).
- **모듈 간 토폴로지** —
  - `crawl → restaurant` — 신규 행 생성 시 nested `canonical: { create: {...} }`.
  - `crawl → canonical (ProposalService → CanonicalService)`.
  - `crawl → summary` — `persistReviewBatch` 가 돌려준 새 리뷰 id 배열을 `SummaryService.queueSummariesForReviews(busKey, ids)` 로 fire-and-forget.
  - `summary → ai` — adapter-cache 의 공유 FIFO 게이트.
  - `summary → restaurant.route` — `summaryEventsBus` 모듈 싱글턴.
  - `summary → menu-grouping/analytics` — `extractFirstJsonObject` / `normalizeTerm` 공유 export.
  - `restaurant.route → summary` — reanalyze/analyticsBackfill.
  - `restaurant.route → menu-grouping` — menusGroup/menusRanking.
  - `settings.route → settings.service` — 공개/admin 모두 같은 `getSecret('vworld')`.
  - `auto-discover → ai + crawl + restaurant + crawl/job-registry` — 자세한 건 [auto-discover 토픽](./auto-discover.md).
  - **`settlement-extraction → ai + media-like 디스크 보관`** — `AiConfigService.getResolved('ollama-cloud', 'image')` 로 vision 어댑터 획득 후 LLM 호출, multipart 로 받은 영수증 바이트를 `apps/friendly/data/receipts/<uuid>.jpg` 로 저장 + 토큰만 응답에 반환.
  - **`settlement → contact`** — `settlement.service.createSession` 이 모든 participant 를 `(userId, normalizedKey)` 로 SettlementContact 에 upsert 하고 `participant.contactId` 를 채운다 (자동 적립). 자세한 건 [settlement 토픽](./settlement.md).
  - **`settlement (public read) ← /share/settlements/:token`** — owner 본인 라우트와 별도 path, 가드 없이 read-only.
  - **`share-preview → settlement.service + restaurant.service + settlement-card + media.ALLOWED_HOSTS`** — **(NEW 2026-06-01)** OG HTML 핸들러가 `getSharePreviewMeta` 로 메타+og:image 를 모으고(내부에서 `RestaurantService.getPhotoUrls` 로 식당 사진 후보 수집 + `ALLOWED_HOSTS` 로 프록시 가능 판정), PNG 핸들러가 `getBySharedToken` → `renderSettlementCardPng(session)`. share-preview/settlement-card 둘 다 `@repo/api-contract` 의 calculator 를 import.
  - `server.ts → summary` — 부팅 직후 stale 행 정리 + 자동 재큐잉.
  - **`schedule → menu-grouping + analytics + crawl/job-registry`** — **(NEW 2026-06-06)** `ScheduleService` 가 `menuGrouping.getRestaurantsStatus`/`groupForRestaurant` 로 식당별 정규화, `analytics.runGlobalMerge` 로 전역 머지, `jobRegistry.isPlaceCrawling(placeId)` 로 크롤 진행 중 식당 가드. menuGrouping/analytics 는 plugin 이 자체 생성한 인스턴스(app.aiConfig 미사용). 파이프라인 상세는 [schedule 토픽](./schedule.md) / [analytics 토픽](./analytics.md) / [menu-grouping 토픽](./menu-grouping.md).
  - **`server.ts ↔ plugins/schedule.ts → scheduleRegistry`** — 부팅 `app.schedule.bootstrap()` 과 shutdown `stopAllCrons/abortInflight` 가 모듈 singleton `scheduleRegistry` 를 공유. cron tick 콜백은 `app.schedule.runScheduled('cron')` 을 fire-and-forget.

## API Surface [coverage: high — 10 sources]

라우트 경로는 모두 `@repo/api-contract`의 [`Routes.*`](../../packages/api-contract/src/routes.ts)에서 가져온다.

라우트 트리 (요약):

```
/api/v1
├── /auth/*                                       (public mix)
├── /admin/users/*                                (admin)
├── /picks/*                                      (bearer)
├── /media/thumbnail                              (public)
├── /restaurants
│   ├── /ranking                                  (public)        ← AI 분포 정렬
│   ├── /public                                   (public)        ← 공개 리스트
│   ├── /public/:placeId                          (public)        ← 공개 상세
│   ├── /public/:placeId/insights                 (public)        ← 공개 인사이트
│   ├── /public/:placeId/category-tree            (public)        ← (NEW 2026-06-06) 메뉴 카테고리 트리
│   └── /admin/restaurants/*                      (admin)         ← 어드민 CRUD/SSE/smart-pick/페이징·정렬
├── /admin/crawl/*                                (admin)         ← crawl 토픽
├── /admin/canonical/*                            (admin)         ← canonical 토픽
├── /admin/auto-discover/jobs[/:id[/events]]      (admin + SSE)   ← auto-discover 토픽
├── /admin/ai/*                                   (admin)         ← ai 토픽 (provider × purpose)
│   └── /providers/:id/:purpose/models/preview    (admin)         ← (NEW 2026-05-28) 미저장 key 로 모델 list
├── /admin/analytics/*                            (admin)         ← analytics 토픽
├── /admin/schedule                               (admin)         ← (NEW 2026-06-06) GET 설정 / PUT 설정변경
│   ├── /run                                      (admin)         ← POST 지금 실행(manual)
│   ├── /runs                                     (admin)         ← GET 실행 이력 + inflightRunId
│   ├── /preview                                  (admin)         ← POST cron 식 검증 + 다음 실행 미리보기
│   └── /run-events                               (admin + SSE)   ← ?token=<jwt> live 진행
├── /admin/settings/map[/...]                     (admin)
├── /settings/map/public                          (public)
├── /settlement-extractions/*                     (bearer)        ← 영수증 multipart → vision LLM + split
├── /settlements/*                                (bearer, owner) ← 세션 CRUD + 차수 + 분배 + 공유 토큰
│   └── PUT /:id                                  (bearer, owner) ← (UPDATED 2026-05-28) 전체 replace
├── /share/settlements/:token                     (public)        ← 공개 read-only (API JSON)
├── /me/contacts[/:id]                            (bearer)        ← 단골 CRUD
├── /me/settlements/drafts[/:id]                  (bearer)        ← (NEW 2026-05-28) 자동 임시저장
├── /.well-known/apple-app-site-association       (public)        ← (NEW 2026-05-28) iOS Universal Links
├── /.well-known/assetlinks.json                  (public)        ← (NEW 2026-05-28) Android App Links
└── /health                                       (public)

(루트 — /api/v1 prefix 밖, registerSharePreview 직접 등록, NEW 2026-06-01)
├── GET /share/settlements/:token | /s/:token        (public)     ← OG 메타 주입한 SPA index.html (text/html)
└── GET /share/settlements/:token/image.png | /s/:token/image.png (public) ← 정산표 PNG (image/png)
```

> 참고: `.well-known/*` 두 라우트는 `/api/v1` prefix 가 없는 라우트 트리 — iOS/Android 가 항상 origin 루트 (`https://api.example.com/.well-known/...`) 에서 검증 파일을 찾기 때문. 마찬가지로 OG share-preview 의 `/share/settlements/*`·`/s/*`·`*/image.png` 도 `/api/v1` 밖 origin 루트 — OG 크롤러가 공유 링크 그 자체(SPA 라우트와 같은 path)를 펼치기 때문이다. **이 라우트들은 `/api/v1/share/settlements/:token`(인증 없는 정산 JSON API) 과 path 가 다르다** — 전자는 사람/크롤러가 보는 HTML·PNG, 후자는 FE 가 fetch 하는 JSON.

`/settlement-extractions` / `/settlements/*` / `/share/settlements/:token` / `/me/contacts` / `/me/settlements/drafts` 의 메소드·body·response 상세는 [settlement 토픽](./settlement.md) 참고. settlement 의 `update` 는 2026-05-28 부터 PUT `/api/v1/settlements/:id` (전체 replace) 한 라우트로 통일 — 이전 `PATCH /:id/participants` 는 제거. settlement-draft 는 GET `/me/settlements/drafts` (list) + PUT `/me/settlements/drafts` (upsert by `(userId, placeIdKey)`) + DELETE `/me/settlements/drafts/:id` 세 라우트. well-known 두 라우트는 env 가 비어 있을 때 404 + `{ error: 'apple-app-site-association not configured' }` (or `assetlinks.json`) 본문, configured 면 `Content-Type: application/json` + `Cache-Control: public, max-age=300`. AI 의 `models/preview` 는 저장 전 form 의 key 를 body 로 받아 모델 list 응답 — 저장된 row 의 key 가 아직 비어도 동작. **(NEW 2026-06-06)** `/admin/schedule` 5종은 모두 `[authenticate, requireAdmin]` 가드(`run-events` SSE 만 `?token=<jwt>` 쿼리 인증 — EventSource 가 헤더를 못 보냄): GET 설정(현재 cron/enabled + `nextRunAt`) · PUT 설정변경(잘못된 cron 은 service 가 throw → route 가 400) · POST `/run`(manual, 진행 중이면 `skipped` run 반환) · GET `/runs`(이력 50건 + `inflightRunId`) · POST `/preview`(cron 검증 + 다음 5회 시각) · GET `/run-events`(초기 `snapshot` 이벤트 후 진행 중 run 이면 `progress`/`done` 스트림, 없으면 즉시 닫음 — 15s comment heartbeat). 스키마는 `@repo/api-contract` 의 `ScheduleConfig`/`ScheduleConfigInput`/`ScheduleRun`/`ScheduleRunList`/`SchedulePreviewInput`/`SchedulePreviewResult`, 자세한 건 [schedule 토픽](./schedule.md). restaurant 의 공개 `publicCategoryTree(:placeId)` 는 가드 없이 `getCategoryTree` 결과(`{ roots }`) 반환, 식당 없으면 404.

restaurant 의 admin `list` 응답은 multi-source 통합 + **페이징** 형태로 진화 — `{ items, total, limit, offset }`. 한 행 = 한 canonical, 그 안에 `sources[]` 배열로 네이버/다이닝코드 행이 들어가고 `candidateCount`/`suggestion` 도 포함. 공개 표면(`publicList`/`publicByPlaceId`/`ranking`/`smartPick`) 도 detail 단계에선 같은 canonical 그룹의 DC 형제를 함께 읽어 [restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts) 의 머지 함수 군으로 단일 응답으로 융합.

### auth — [auth.route.ts](../../apps/friendly/src/modules/auth/auth.route.ts)

| Method | Path                   | Auth   | 설명                                 |
| ------ | ---------------------- | ------ | ------------------------------------ |
| POST   | `Routes.Auth.register` | public | 가입 → `{ token, user }` (201, USER) |
| POST   | `Routes.Auth.login`    | public | 로그인 → `{ token, user }`           |
| GET    | `Routes.Auth.me`       | bearer | 현재 사용자 정보                     |
| POST   | `Routes.Auth.logout`   | bearer | 204 (stateless NOP)                  |

### picks — [picks.route.ts](../../apps/friendly/src/modules/picks/picks.route.ts)

`addHook('onRequest', app.authenticate)`로 모듈 전역 인증. CRUD + `POST :id/random`.

### admin — [admin.route.ts](../../apps/friendly/src/modules/admin/admin.route.ts)

각 라우트마다 `onRequest: [authenticate, requireAdmin]`. `Routes.Admin.listUsers`, `Routes.Admin.setUserRole(:id)`.

### restaurant — [restaurant.route.ts](../../apps/friendly/src/modules/restaurant/restaurant.route.ts)

| Method | Path (`Routes.Restaurant.*`)                  | Auth          | 설명                                                                              |
| ------ | --------------------------------------------- | ------------- | --------------------------------------------------------------------------------- |
| GET    | `ranking`                                     | public        | 60s TTL + dogpile-guard. 네이버 전용.                                             |
| GET    | `publicList`                                  | public        | 좌표·도로명·썸네일·AI 통계. q/category/bbox/sort. 네이버 전용. nullsLast.        |
| GET    | `publicByPlaceId(:placeId)`                   | public        | 공개 상세. `analysis` 는 done 행만 평탄화.                                        |
| GET    | `publicInsights(:placeId)`                    | public        | 어드민 `insights` 와 동일 응답 스키마, 가드만 빠짐.                                |
| GET    | `list`                                        | bearer+admin  | **multi-source 통합 리스트 + 페이징/정렬**. `?offset&limit&sort=recent|satisfaction|positive|negativeRatio`. 응답 `{ items, total, limit, offset }`. |
| GET    | `byPlaceId(:placeId)`                         | bearer+admin  | 디테일 (네이버 단일 행).                                                          |
| DELETE | `delete(:placeId)`                            | bearer+admin  | 캐스케이드 삭제. in-flight 크롤이 같은 placeId면 409.                            |
| POST   | `reanalyze(:placeId)`                         | bearer+admin  | 구버전/failed 분석 행 재큐잉.                                                     |
| GET    | `insights(:placeId)`                          | bearer+admin  | MenuMention + MenuCanonical JOIN.                                                 |
| POST   | `menusGroup(:placeId)`                        | bearer+admin  | 식당 메뉴 LLM canonical 그룹핑.                                                   |
| GET    | `menusRanking(:placeId)`                      | bearer+admin  | 그룹된 메뉴 순위.                                                                 |
| POST   | `analyticsBackfill`                           | bearer+admin  | menus/tips/keywords JSON → 정규화 테이블 1회 백필.                                |
| POST   | `smartPick`                                   | bearer+admin  | 가중 랜덤 픽. 네이버 전용.                                                        |
| GET    | `summaryStatus(:placeId)`                     | bearer+admin  | 요약 진행률 스냅샷.                                                               |
| GET    | `summaryEvents`                               | query token   | Multiplexed SSE. `?placeId=…&canonicalId=…&token=<jwt>`. named heartbeat 5s.       |
| POST   | `cancelSummary(:placeId)`                     | bearer+admin  | 진행 중 요약 중지.                                                                 |
| POST   | `resumeSummary(:placeId)`                     | bearer+admin  | cancelled 행만 재큐잉.                                                            |
| GET    | `crawlLogs(:placeId)`                         | bearer+admin  | 누적 크롤+요약 로그 cursor pagination.                                            |

> 글로벌 통계 라우트는 [analytics 토픽](./analytics.md), 가게 통합/제안 라우트는 [canonical 토픽](./canonical.md), 자동 발견 잡 라우트는 [auto-discover 토픽](./auto-discover.md), 정산/단골/영수증 라우트는 [settlement 토픽](./settlement.md) 참고.

### settings — [settings/map.route.ts](../../apps/friendly/src/modules/settings/map.route.ts)

vworld JS SDK 키. 공개 한 개 + admin 네 개.

### media — [media.route.ts](../../apps/friendly/src/modules/media/media.route.ts) — public

`?url=<naver-cdn-url>&w=300&q=78` → JPEG. ALLOWED_HOSTS 화이트리스트, sharp 리사이즈, `data/thumbs/<sha1>.jpg` 디스크 캐시.

### health — [health.route.ts](../../apps/friendly/src/modules/health/health.route.ts)

`Routes.Health` + `/health` (스모크 프로브).

## Data [coverage: high — 18 sources]

[prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) 모델 — 코어:

| 모델 | 테이블 | 핵심 필드 / 인덱스 | 비고 |
| ---- | ------ | -------------------- | ---- |
| `User` | `users` | `email @unique`, `role Role` | picks/settlements/contacts Cascade |
| `Pick` | `picks` | `userId @index`, `options` JSON | User Cascade |
| `PickResult` | `pick_results` | `pickId @index` | Pick Cascade |
| `Role` | enum | `USER \| ADMIN` | |
| `LlmProviderConfig` | `llm_provider_configs` | **`(provider, purpose) @@unique`**, `purpose` default `'chat'`, `apiKey`, `maxConcurrent`, `defaultModel` | **2026-05-25 purpose 컬럼 추가** — 같은 provider 를 chat/image 따로 등록. env fallback 은 chat 한정 |
| `MapProviderConfig` | `map_provider_configs` | `provider @unique`, `apiKey`(평문), `domains?` | env fallback 없음 |
| `CanonicalRestaurant` | `canonical_restaurants` | `id`, `name`, `primaryCategory?`, `latitude?`, `longitude?`, `searchKey?`, `suggestionDismissedAt?`, `@@index([searchKey])` | [canonical 토픽](./canonical.md) |
| `CanonicalMergeProposal` | `canonical_merge_proposals` | `(A,B)` 정규화 unique, `score`/`nameScore`/`distanceM?`, `status` | 둘 FK Cascade |
| `Restaurant` | `restaurants` | `source` default `'naver'`, `sourceId` NOT NULL, `placeId?` (nullable, 네이버만), `canonicalId` NOT NULL (FK Restrict), `@@unique([source, sourceId])`, `placeId @unique` | snapshotJson 안에 메뉴/블로그/영업시간/이미지/좌표 |
| `VisitorReview` | `visitor_reviews` | `restaurantId @index`, dedup `@@unique([restaurantId, externalId])` + `@@unique([restaurantId, contentHash])` | Restaurant Cascade |
| `ReviewSummary` | `review_summaries` | `reviewId @unique`, `status` 6종 (queued/pending/running/done/failed/cancelled), `sentiment?`, scores, JSON 분석 컬럼 | `ANALYSIS_VERSION = 4` |
| `CrawlJobLog` | `crawl_job_logs` | `jobId`, `placeId?`, `stage`, `level`, `message`, `meta?`, `@@index([jobId, createdAt])`, `@@index([placeId, createdAt])` | FK 미선언 — 잡 휘발 후도 살아남음 |
| `MenuMention` | `menu_mentions` | `summaryId`/`restaurantId` + `name`/`nameNorm`/`sentiment`/`traitsJson` | summary done 시 평탄화 |
| `ReviewTag` | `review_tags` | `kind` ('tip'/'keyword') + `term`/`termNorm` | tip+keyword 통합 |
| `MenuCanonical` | `menu_canonicals` | `(restaurantId, nameNorm) @@unique` | 식당 내 canonical |
| `GlobalMenuCanonical` | `global_menu_canonicals` | `globalKey @unique`, `categoryPath?` | 전역 canonical |
| `GlobalMenuCanonicalLink` | `global_menu_canonical_links` | `menuCanonicalId @unique` + `globalCanonicalId @index` | 다대일 링크 |
| **`SettlementSession`** | **`settlement_sessions`** | **`userId`, `restaurantPlaceId`, `restaurantName` (스냅샷), `grandTotal`, `shareToken? @unique`, `editedAt?`, `@@index([userId, createdAt])`, `@@index([restaurantPlaceId])`** | **(2026-05-25, 2026-05-28 차수 도입으로 축소)**. User Cascade. 차수 단위 컬럼(source/totalAmount/warning/receiptImageToken/itemsSubtotal) 은 `SettlementRound` 로 이동, 본 테이블은 `grandTotal` (= 모든 round itemsSubtotal 합) 만 보유. `shareToken` 발급 시 unique 인덱스로 공개 read-only 라우트가 O(1) 조회. `editedAt` 은 participants/rounds 수정 시각 — updatedAt 과 분리한 이유는 share 토큰 발급/회수도 updatedAt 을 갱신해 '수정됨' 배지 기준으로 부적합 |
| **`SettlementRound`** | **`settlement_rounds`** | **`sessionId`, `orderIndex`, `restaurantPlaceId`, `restaurantName`, `source` ('MANUAL'/'RECEIPT'), `totalAmount?`, `warning?`, `receiptImageToken?`, `itemsSubtotal`, `discountAmount?`, `discountCategory?`, `categoryAdjustments?` (JSON 문자열), `@@index([sessionId])`** | **NEW (2026-05-28)**. Session Cascade. N차 회식의 각 차수 — 차수마다 식당/영수증/할인 정책이 다를 수 있다. `categoryAdjustments` 는 카테고리별 수동 보정값을 JSON 으로 보관 |
| **`SettlementItem`** | **`settlement_items`** | **`roundId` (← sessionId 였음), `name`, `unitPrice?`, `quantity?`, `amount`, `category` ('ALCOHOL'/'NON_ALCOHOL'/'SIDE'/'UNCATEGORIZED'), `matchedMenuName?`, `orderIndex`, `@@index([roundId])`** | **(2026-05-25, 2026-05-28 roundId 로 이동)**. Round Cascade. 분배 계산은 `amount` 만 사용. SQLite table redefine 패턴으로 마이그레이션 (`new_settlement_items` 생성 → INSERT → DROP 구버전 → RENAME) |
| **`SettlementParticipant`** | **`settlement_participants`** | **`sessionId`, `name?`/`nickname?` (둘 중 하나 필수), `excludeAlcohol/NonAlcohol/Side` (default 정책), `shareAmount` (모든 차수 합산 스냅샷), `orderIndex`, `contactId?` (FK SetNull), `@@index([sessionId])`, `@@index([contactId])`** | **(2026-05-25)**. Session Cascade. Contact SetNull — 단골이 삭제돼도 정산 본체는 보존. 차수별 참석/제외 override 는 `SettlementRoundAttendee` 가 담당 |
| **`SettlementRoundAttendee`** | **`settlement_round_participants`** | **`roundId`, `participantId`, `attended` default true, `excludeAlcoholOverride?`/`excludeNonAlcoholOverride?`/`excludeSideOverride?`, `shareAmount` (차수 분담 스냅샷), `@@unique([roundId, participantId])`, `@@index([roundId])`, `@@index([participantId])`** | **NEW (2026-05-28)**. Round Cascade + Participant Cascade. 차수 × 마스터참여자 join. override 가 null 이면 마스터 participant 의 default exclude 정책 사용 |
| **`SettlementDraft`** | **`settlement_drafts`** | **`userId`, `placeIdKey` default `''` (sentinel), `payload` (JSON 문자열), `placeNameHint?`, `@@unique([userId, placeIdKey])`, `@@index([userId, updatedAt])`** | **NEW (2026-05-28)**. User Cascade. 정산 입력 자동 임시저장. `placeIdKey=''` = 식당 미지정 슬롯 (SQLite 의 multi-NULL unique 회피) |
| **`SettlementContact`** | **`settlement_contacts`** | **`userId`, `name?`/`nickname?`, `normalizedKey` (= `lower(trim(name))\|lower(trim(nickname))`), `lastExcludeAlcohol/NonAlcohol/Side`, `useCount` default 1, `lastUsedAt`, `@@unique([userId, normalizedKey])`, `@@index([userId, lastUsedAt])`** | **(2026-05-25)**. User Cascade. 정산 저장 시 자동 upsert. 자동완성 / 다중 선택 / `/me/contacts` CRUD 의 원천 |
| **`ScheduleConfig`** | **`schedule_configs`** | **`jobType @unique` (현재 `'normalize-merge'` 하나), `enabled` default false, `cronExpr`, `timezone` default `'Asia/Seoul'`, `lastRunAt?`/`lastStatus?` (빠른 표시용 비정규화), `createdAt`/`updatedAt`** | **NEW (2026-06-06)**. FK 없음. jobType 당 1행 — 주기 설정. `nextRunAt` 은 저장 안 함(croner 로 매번 계산, 저장하면 stale). 행이 없으면 service 가 기본값(disabled + `0 3 * * *`)으로 응답 |
| **`ScheduleRun`** | **`schedule_runs`** | **`jobType`, `trigger` ('cron'/'manual'), `status` ('running'/'done'/'failed'/'skipped'/'interrupted'), `totalTargets?`, `processedCount` default 0, `skippedCount` default 0, `error?`, `startedAt`, `finishedAt?`, `@@index([jobType, startedAt])`** | **NEW (2026-06-06)**. FK 없음 — 잡 휘발 후도 살아남음(CrawlJobLog 와 같은 사상). 실행 이력 1행 = 1 run. `running` 으로 남은 행은 다음 부팅 `bootstrap()` 이 `interrupted` 로 정리. `phase`/live 진행은 DB 미저장 — SSE 로만 |

**Restaurant ↔ Canonical 관계 핵심**:
- 신규 Restaurant 생성 시 항상 nested `canonical: { create: {...} }` 로 자기 전용 CanonicalRestaurant 1행을 동시 생성.
- `Restaurant.canonicalId` FK 는 `onDelete: Restrict` (Cascade **아님**) — 다른 source 행이 남아있을 때 한 source 만 지워도 canonical 은 보존.
- `CanonicalMergeProposal.canonicalA/BId` FK 는 반대로 Cascade.

**Settlement 관계 핵심**:
- `SettlementSession → SettlementRound → SettlementItem` / `→ SettlementRoundAttendee` Cascade 체인 — 세션 삭제 시 모든 차수와 그 안의 items/attendees 가 같이 삭제.
- `SettlementSession → SettlementParticipant` Cascade — 마스터 참여자 명단.
- `SettlementParticipant → SettlementRoundAttendee` Cascade — 마스터에서 참여자가 삭제되면 모든 차수 attendee 행도 같이 정리.
- `User → SettlementSession` / `→ SettlementContact` / `→ SettlementDraft` 모두 Cascade — 회원 탈퇴 시 정산/단골/임시저장 모두 같이 삭제.
- `SettlementParticipant → SettlementContact` 는 **SetNull** — 단골을 삭제해도 과거 정산의 참여자 행은 남고 `contactId` 만 null 로 끊긴다 (이력 보존).
- `SettlementSession.shareToken @unique` — null 인 행이 여러 개여도 unique 제약 위반 아님 (SQLite 기준), 토큰 발급된 한 행만 토큰으로 O(1) 조회 가능.
- `SettlementDraft.placeIdKey` — `''` sentinel 로 NULL 회피. `(userId, placeIdKey) @@unique` 가 강제하는 1:1 슬롯 가정이 깨지지 않게.

**`Restaurant.source` 분기**: `naver` (`sourceId == placeId`) / `diningcode` (`sourceId = vRid`, `placeId = null`) / `catchtable` (검증 단계). cross-source unique = `(source, sourceId)`.

캐스케이드 체인:
- `Restaurant → VisitorReview → ReviewSummary → MenuMention/ReviewTag`, `Restaurant → MenuCanonical → GlobalMenuCanonicalLink` (모두 Cascade).
- `Restaurant → CanonicalRestaurant` Restrict.
- `CanonicalRestaurant → CanonicalMergeProposal` Cascade.
- `User → SettlementSession → SettlementParticipant` Cascade.
- `User → SettlementSession → SettlementRound → SettlementItem` Cascade.
- `User → SettlementSession → SettlementRound → SettlementRoundAttendee` Cascade (+ `SettlementParticipant → SettlementRoundAttendee` Cascade).
- `User → SettlementContact` Cascade, `SettlementContact → SettlementParticipant` SetNull.
- `User → SettlementDraft` Cascade.

**SQLite Cascade 가 실제 동작하려면 `PRAGMA foreign_keys=ON` 이 필수** — [plugins/prisma.ts](../../apps/friendly/src/plugins/prisma.ts) 가 부팅마다 켠다. 끄면 ON DELETE CASCADE 가 silent 무시되어 orphan 자식 행이 남는다.

마이그레이션 (최근순):
- **`20260605135918_add_schedule_tables`** — **(NEW 2026-06-06)** `ScheduleConfig` (`schedule_configs`, `jobType @unique`) + `ScheduleRun` (`schedule_runs`, `@@index([jobType, startedAt])`) 2종. FK 없음.
- **`20260525235559_add_settlement_drafts`** — **(NEW 2026-05-28)** `SettlementDraft` 테이블 (`(userId, placeIdKey)` 복합 unique, placeIdKey default `''`)
- **`20260525220309_add_settlement_round_category_adjustments`** — **(NEW 2026-05-28)** `SettlementRound.categoryAdjustments` JSON 컬럼
- **`20260525110000_add_settlement_round_discount`** — **(NEW 2026-05-28)** `SettlementRound.discountAmount/discountCategory` 컬럼
- **`20260525100000_add_settlement_rounds`** — **(NEW 2026-05-28)** `SettlementRound` + `SettlementRoundAttendee` (테이블명 `settlement_round_participants`) 추가. `settlement_items.sessionId → roundId` redefine + `settlement_sessions` 의 차수 단위 컬럼 제거 + `grandTotal` 신설. 기존 세션은 round 1개로 자동 백필 (`round.id = session.id` 규약).
- **`20260524112443_add_settlement_edited_at`** — **(2026-05-25)** `SettlementSession.editedAt` 컬럼
- **`20260524000000_add_settlement_contacts`** — **(2026-05-25)** `SettlementContact` 테이블 + `SettlementParticipant.contactId` FK(SetNull) 컬럼
- **`20260523030833_add_settlement_share_token`** — **(2026-05-25)** `SettlementSession.shareToken @unique` 컬럼
- **`20260523012752_add_settlement_models`** — **(2026-05-25)** `SettlementSession` + `SettlementItem` + `SettlementParticipant` 테이블 (3종)
- **`20260523010655_pnpm_filter_friendly_test_src_modules_ai`** — **(2026-05-25)** `LlmProviderConfig` 테이블 재정의: `purpose` 컬럼 default `'chat'` 추가 + `(provider, purpose) @@unique` 로 unique 키 교체. 기존 행은 chat 으로 백필.
- `20260518014530_add_crawl_job_log` — `CrawlJobLog` 테이블
- `20260515104718_add_canonical_merge_proposals` — `CanonicalMergeProposal` 테이블
- `20260515100910_add_canonical_suggestion_dismissed` — `CanonicalRestaurant.suggestionDismissedAt`
- `20260515083303_add_canonical_restaurant` — `CanonicalRestaurant` + Restaurant.canonicalId 백필
- `20260515063258_add_restaurant_source_split` — Restaurant.source/sourceId + unique 키
- `20260508173216_add_map_provider_configs` — `MapProviderConfig`
- `20260509_add_global_menu_category_path` — `GlobalMenuCanonical.categoryPath`
- `20260509_add_global_menu_canonicals` — `GlobalMenuCanonical` + Link
- `20260509_add_menu_canonicals` — `MenuCanonical`
- `20260509_add_analytics_tables` — `MenuMention` + `ReviewTag`
- `20260508122321_add_visitor_review_videos` — `videosJson`
- `20260508095207_add_review_analysis_fields`
- `20260506205226_add_restaurant_review_summary`
- `20260506191413_add_llm_provider_config`

디스크 영속:
- `apps/friendly/data/dev.db` — SQLite DB 파일 (Prisma CLI + 서버 + vitest 가 모두 같은 파일 가리킴)
- `apps/friendly/data/thumbs/<sha1>.jpg` — media 모듈 썸네일 캐시
- `apps/friendly/data/receipts/<uuid>.jpg` — settlement-extraction 이 업로드받은 영수증 원본 보관 (split 호출 시에도 원본 1장만 저장, 슬라이스는 메모리에서만 만들어 LLM 에 전달)
- `apps/friendly/assets/fonts/IBMPlexSansKR-{Regular,Bold}.ttf` — **(NEW 2026-06-01)** 정산표 PNG 렌더(satori) 용 한글 폰트. tsx/tsup 양쪽에서 `fontCandidates()` 가 위로-탐색해 로드, 프로세스당 1회 캐시. 빌드 산출물에 함께 배포돼야 prod 렌더가 동작.

또한 `SettlementSession` 에 OG 이미지 선택 컬럼 2종이 추가됐다 — **`shareOgImage`** (`'restaurant'|'table'|null`, 기본 동작 `restaurant`) + **`shareOgImageUrl`** (owner 가 갤러리에서 고른 특정 사진 URL, null=시드 랜덤). 둘 다 공유 다이얼로그(POST `/settlements/:id/share`)에서 갱신, 공개 read-only 응답에서는 노출 안 함. (스키마 SSOT 는 [api-contract 토픽](./api-contract.md) / [settlement 토픽](./settlement.md).)

JWT payload: `{ userId: string; email: string; role: 'USER' | 'ADMIN' }`.

환경 변수 — [src/config/env.ts](../../apps/friendly/src/config/env.ts) 의 `EnvSchema` (zod):

| 키                            | 기본값               | 비고                                                                |
| ----------------------------- | -------------------- | ------------------------------------------------------------------- |
| `NODE_ENV`                    | `development`        |                                                                     |
| `PORT`                        | `3000`               |                                                                     |
| `HOST`                        | `0.0.0.0`            |                                                                     |
| `DATABASE_URL`                | (필수)               | **`.env.example` 기준 `file:../data/dev.db`** — Prisma cwd 와 서버 cwd 양쪽에서 같은 `apps/friendly/data/dev.db` 를 가리킨다 |
| `JWT_SECRET`                  | (필수)               | min 32 chars                                                        |
| `JWT_EXPIRES_IN`              | `7d`                 |                                                                     |
| `CORS_ORIGIN`                 | `*`                  |                                                                     |
| `LOG_LEVEL`                   | `info`               |                                                                     |
| `OLLAMA_CLOUD_API_KEY`        | `''`                 | DB 의 `LlmProviderConfig.apiKey` 가 비어있을 때 fallback. **purpose='chat' 한정** |
| `OLLAMA_CLOUD_BASE_URL`       | `https://ollama.com` |                                                                     |
| `OLLAMA_CLOUD_TIMEOUT_MS`     | `60000`              |                                                                     |
| `OLLAMA_CLOUD_MAX_CONCURRENT` | `15`                 |                                                                     |
| `OLLAMA_DEFAULT_MODEL`        | `''`                 | **purpose='chat' 한정** — image purpose 는 DB row 의 `defaultModel` 만 사용 |
| `APP_TEAM_ID`                 | `''`                 | **(NEW 2026-05-28)** Apple Developer Team ID (10자). AASA `appIDs = "${teamId}.${bundleId}"`. 비면 AASA 라우트 404 |
| `APP_BUNDLE_ID`               | `'com.niney.lifepickr'` | **(NEW 2026-05-28)** iOS bundle id. apps/mobile 의 `ios.bundleIdentifier` 와 동일해야 함 |
| `ANDROID_APP_PACKAGE`         | `'com.niney.lifepickr'` | **(NEW 2026-05-28)** 안드로이드 package. apps/mobile 의 `android.package` 와 동일해야 함 |
| `ANDROID_SHA256_FINGERPRINTS` | `''`                 | **(NEW 2026-05-28)** 콤마 구분 SHA-256 지문 (대문자 16진수, 콜론 구분 64자). debug/release 둘 다 권장. 비면 assetlinks.json 라우트 404 |
| `WEB_INDEX_PATH`              | (optional)           | **(NEW 2026-06-01)** 정산 공유 OG 미리보기가 `<head>` 주입할 빌드된 웹 `index.html` 경로. 미설정 시 `__dirname`/`cwd` 에서 위로 탐색해 `apps/web/dist/index.html` 등 후보 자동 발견 |
| `OG_IMAGE_PATH`              | `/og-default.png`    | **(NEW 2026-06-01)** OG 기본(폴백) 이미지. 만료/없는 토큰일 때 og:image 로 쓰는 same-origin path(또는 절대 URL). `http` 로 시작하면 그대로, 아니면 origin prefix |

스크립트 (`apps/friendly/scripts/`):
- `promote-admin.ts` — 첫 ADMIN 승격 (`pnpm --filter friendly promote-admin`)
- **`backfill-contacts.ts` — (NEW 2026-05-25)** 기존 `SettlementParticipant` 들을 `(userId, normalizedKey)` 로 그룹화해 `SettlementContact` 를 만들고 `participant.contactId` 를 채우는 1회 멱등 마이그레이션. `session.createdAt asc + participant.orderIndex asc` 순회로 최신 정산의 exclude* 가 `lastExclude*` 로 남도록 보장. 실행: `pnpm --filter friendly backfill:contacts`.
- `dev-capture-visitor.ts` / `dev-fetch-visitor-html.ts` / `dev-open-visitor-page.ts` / `dev-capture-catchtable.ts` — crawl 디버그 도구.
- **`eval-extraction.ts` / `probe-extraction.ts` / `probe-vision.ts` — (NEW 2026-06-01)** 영수증 OCR(vision) 추출 평가·프로브 도구. `probe-vision.ts` 는 같은 영수증 이미지(`data/receipts/<token>.jpg`)로 (1) 현재 설정 재현 (2) numCtx 확대 (3) format 제거 (4) `format='json'` (5) 단순 프롬프트 다섯 변주를 돌려 raw 응답을 그대로 출력 — vision 추출이 빈 items 를 내는 원인을 provider 레벨에서 가린다. `AiConfigService.getResolved('ollama-cloud', 'image')` + `adapterCache` + settlement-extraction 의 prompts 를 직접 import. 실행: `pnpm --filter friendly probe:vision -- <token>` / `eval:extraction` / `probe:extraction`.
- **`probe-merge.ts` / `run-global-merge.ts` — (NEW 2026-06-06)** 글로벌 머지 프로브/수동 실행 도구(`probe:merge` / `run-merge`). analytics 의 `runGlobalMerge` 를 CLI 에서 직접 돌려 스케줄러 파이프라인의 머지 단계를 단독 디버그. 상세는 [analytics 토픽](./analytics.md).

## Key Decisions [coverage: high — 32 sources]

- **17차(2026-06): 주기 스케줄러는 in-process croner — no-Redis** — 정규화→글로벌 머지를 야간 배치로 자동화하면서 외부 큐/스케줄러(BullMQ+Redis 등)를 들이지 않았다. CLAUDE.md no-Redis + 단일 인스턴스 전제라 `croner` 의 in-process `Cron` 하나로 충분. cron 타이머·overlap·진행상태는 `scheduleRegistry`(모듈 singleton, 동시 1개 inflight), 설정/이력은 DB 2테이블. 분산 환경으로 가면 이 가정이 깨진다(다중 인스턴스가 각자 cron tick → 중복 실행) — 그땐 리더 선출/외부 스케줄러 필요. 식당별 정규화·글로벌 머지가 멱등이라 재실행/중단 후 재개가 안전한 게 이 단순함을 떠받친다.
- **17차(2026-06): schedule plugin 이 자체 `AiConfigService` 생성 — autoload 순서 회피** — `plugins/schedule.ts` 는 `app.aiConfig`(summaries plugin 이 decorate)를 재사용하지 않고 자기 `AiConfigService`/`MenuGroupingService`/`AnalyticsService` 를 직접 만든다. `@fastify/autoload` 가 plugin 파일을 **알파벳순**으로 로드해 `'schedule' < 'summaries'` — schedule 이 먼저 잡힐 때 `app.aiConfig` 가 아직 없어 참조하면 undefined. plugin 순서를 강제하느니(취약) 자체 인스턴스를 만드는 게 결합도가 낮다. 두 인스턴스가 같은 env 설정을 쓰므로 동작은 동일.
- **17차(2026-06): cron tick 은 fire-and-forget + overlap skip** — croner 콜백은 즉시 반환하고 실제 작업은 `runScheduled` 가 백그라운드로 돈다. 이전 주기가 안 끝났는데 다음 tick(또는 manual)이 오면 `beginRun` 이 null 을 돌려 `skipped` run 한 행만 남기고 끝낸다 — 시스템 전체 작업이라 중첩 의미가 없고, 멱등이라 다음 주기에 마저 처리. `forceCloseConnections:'idle'` 과 unref 된 croner 타이머로 graceful shutdown 이 매달리지 않게.
- **Zod = 단일 진실 (SSOT)** — 라우트 스키마는 모두 `@repo/api-contract`. `fastify-type-provider-zod`가 런타임 검증 + TS 타입 추론 + OpenAPI 자동 생성.
- **autoload 두 단계** — `plugins/`는 무조건 전부, `modules/`는 `*.route.ts` 파일만.
- **모듈 레이아웃** — CLAUDE.md 규칙대로 모듈마다 `*.route.ts` + `*.service.ts` + `*.test.ts` 트리오.
- **공개 라우트는 별도 라우트로 분리, 응답 스키마도 다르게** — restaurant 의 `publicList/publicByPlaceId/publicInsights/ranking`, settings 의 `publicConfig`, **settlement 의 `/share/settlements/:token`** 모두 admin/owner 라우트와 path 자체가 다르고 service 메소드도 별개.
- **공개 list 의 메모리 파싱 + bbox 필터** — snapshotJson 안의 좌표/사진/도로명을 SQL where 로 못 거름 → 메모리 파싱.
- **restaurant.list canonical 정렬은 메모리에서** — 정렬 키(만족도/긍정/부정비율) 가 sources 합산이라 DB SQL 로 못 빼므로 모든 canonical 의 메타·집계·후보매칭을 계산한 뒤 메모리 정렬·slice. < 1k canonical 가정.
- **cross-source 가게는 `Restaurant` 다행 + `CanonicalRestaurant` 1행 패턴**.
- **`(source, sourceId)` 가 cross-source unique 키** — 공개 라우트 호환을 위해 `placeId @unique` (nullable) 도 그대로 유지.
- **`Restaurant.canonicalId` FK 가 Cascade 아님 (Restrict) — 의도된 trap**.
- **자동 매칭은 큐만 적재, 머지는 사람이 확정** (단, Naver→DC 한정 자동 머지).
- **(A,B) 쌍 정규화 (A<B cuid 사전순)**.
- **bigram Jaccard + Haversine 200m 선형 감쇠**.
- **`PRAGMA foreign_keys=ON` 부팅 강제** — SQLite 의 기본 OFF 상태에선 Prisma 스키마의 `onDelete: Cascade` 가 silent 무시되어 자식 행이 orphan 으로 남는다. `plugins/prisma.ts` 가 `$executeRawUnsafe('PRAGMA foreign_keys = ON')` 으로 매 연결 켠다 (SQLite 는 connection-scoped). WAL + busy_timeout 30s 와 묶음 — Prisma 의 "Transaction not found" 가 SQLITE_BUSY 에서 비롯되는 케이스 차단.
- **DB 경로는 `apps/friendly/data/dev.db` 한 곳** — `.env.example` 의 `DATABASE_URL=file:../data/dev.db` 가 Prisma CLI cwd (`apps/friendly/prisma/`) 와 서버 cwd (`apps/friendly/`) 양쪽 모두에서 같은 파일을 가리키도록 설계. 마이그레이션이 `prisma/dev.db` 를 만들고 서버는 `data/dev.db` 를 보는 분기 사고를 막는다. vitest 도 같은 `.env` 를 수동 로드해 동일 DB.
- **vitest `fileParallelism: false` (직렬 실행)** — 단일 `dev.db` 를 공유하면서 한 테스트가 `restaurant.deleteMany` 로 cascade 삭제 중일 때 다른 파일의 read 가 중간 상태를 잡아 "Field review is required ... got null" 단속 오류가 발생한다. 격리 DB 인스턴스를 따로 안 쓰는 한 직렬화가 가장 단순하고 안정적. + `deps.inline: [/^@repo\//, '@fastify/autoload']` 로 autoload 의 dynamic import 가 vite 의 `extensionAlias` 를 타도록.
- **LLM provider × purpose 분리** — `LlmProviderConfig` 의 unique 가 `(provider, purpose)`. chat 과 image 가 서로 다른 model/concurrency/baseUrl 을 가질 수 있다. `AiConfigService.getResolved(provider, purpose)` 가 모든 호출처에서 명시적이고, `adapter-cache` 키도 `provider|purpose` prefix 포함이라 두 어댑터가 독립 게이트. **env fallback 은 chat 만** — image 는 환경변수로 묶기 어려운 다른 vendor/model 인 경우가 많아 DB row 가 명시적으로 등록되어야 동작.
- **multipart 한도는 영수증 한 장 (5MB)** — `plugins/multipart.ts` 의 `fileSize: 5 * 1024 * 1024 + files: 1 + fields: 5`. 한도 초과 시 fastify-multipart 가 자동 413. 다른 multipart 소비자가 생기면 한도/필드 수 상향은 같은 플러그인에서.
- **영수증 jpg 는 `data/receipts/<uuid>.jpg` 디스크 보관** — DB 에는 토큰 (`SettlementSession.receiptImageToken`) 만 저장. media 모듈의 `data/thumbs/` 와 같은 사상.
- **단골 자동 적립 — `(userId, normalizedKey)` upsert** — 정산 저장 시 `settlement.service` 가 모든 participant 를 `SettlementContact` 에 upsert 하고 `participant.contactId` 를 채운다 (FK SetNull). 자동완성 / 다중 선택 모달 / `/me/contacts` 모두 같은 테이블. `normalizedKey = lower(trim(name))|lower(trim(nickname))` — 사용자가 같은 이름을 다른 대소문자/공백으로 다시 쳐도 같은 row 로 매칭.
- **공유 토큰은 32바이트 base64url + unique 인덱스** — `SettlementSession.shareToken` 이 null 일 땐 비공개, owner 가 POST `/settlements/:id/share` 로 멱등 발급 / DELETE 로 회수. 토큰 자체가 추측 불가능해 인증 없이 `/share/settlements/:token` 으로 O(1) read-only 조회 가능. 토큰 발급/회수는 `updatedAt` 을 갱신하지만 `editedAt` 은 건드리지 않아 '수정됨' 배지가 오해 없이 동작.
- **차수(round) 모델 vs 단일 세션 (2026-05-28)** — 한 세션 = 한 식당 가정을 깨고 `SettlementSession → SettlementRound → (items / attendees)` 로 한 단계 깊어졌다. 차수별 식당/영수증/할인/카테고리 보정을 독립적으로 운용. `SettlementParticipant` 는 마스터 명단으로 남기고, 차수 참석/제외는 `SettlementRoundAttendee` 가 override. `participant.shareAmount` 는 모든 차수 합산 스냅샷, `roundAttendee.shareAmount` 는 차수 분담 스냅샷. 분배 계산은 `calculateMultiRoundShares` 가 모든 차수를 순회해 두 스냅샷을 함께 채운다.
- **PUT `/:id` 전체 replace vs 이전 PATCH `/:id/participants`** — 차수 추가/삭제, 참여자 명단 변경, items 수정 등 부분 갱신의 race / consistency 문제를 회피. 클라이언트가 전체 draft 를 보내면 서버가 단일 트랜잭션에서 deleteMany 후 재삽입. 코드 경로가 `create` 와 거의 같아 round/attendee 백필 로직이 한 곳.
- **자동 임시저장 — `(userId, placeIdKey)` upsert + 본저장 트랜잭션 안 정리** — `placeIdKey` 가 `''` sentinel 인 이유는 SQLite 의 NULL unique 가 다중 NULL 을 distinct 취급하기 때문 — 식당 미지정 슬롯이 무한정 늘어나는 걸 막고 user 당 정확히 1슬롯 강제. 본저장 시 `CreateSettlementInput.fromDraftId` 에 draft id 를 실어 보내면 settlement.service 의 같은 tx 에서 `SettlementDraftService.deleteByIdInTxIfOwner(tx, userId, fromDraftId)` 가 호출 — id 가 없거나 권한 없으면 silent skip (정산 저장 자체는 반드시 성공해야 하므로 throw 하지 않음).
- **영수증 분할 추출 — 클라이언트가 split 좌표 결정** — sharp 가 좌→우 N 등분 + index 슬라이스만 vision LLM 에 보낸다. 같은 imageToken 을 N 번 호출해 N 차 items 를 각각 얻는 방식이라 LLM 호출도 N 번. 한 번에 추출하지 않는 이유는 영수증마다 메뉴 카탈로그/할인 정책이 달라 컨텍스트 윈도우 안에서 충돌 위험.
- **`.well-known` 동적 응답 + 비어있을 때 404** — 정적 파일 대신 라우트로 만들어 env 변경만으로 즉시 반영 + 잘못된 빈 JSON 으로 검증 실패하는 사고 회피. iOS/Android 가 검증 파일 부재 (404) 면 검증 실패로 폴백(브라우저 오픈) — 빈 200 JSON 보다 명확.
- **dev CORS 전면 반사 허용 — production 미적용 (2026-05-31 갱신)** — dev 는 origin 화이트리스트를 폐기하고 모든 origin 을 반사(`cb(null,true)`). 화이트리스트(RFC1918 거부)는 개발 머신 IP 가 공인/사설/VPN/WSL 로 수시로 바뀌어 무의미했고, 무엇보다 거부(`cb(Error)`)가 로그인 같은 **preflight(OPTIONS) 요청을 통째로 깨뜨려** 로그인 자체가 막혔다. 이제 RFC1918 regex 는 "예상된 LAN origin" 분류용 — 비-LAN origin 만 origin 당 1회 warn 로 가시화. production 은 env `CORS_ORIGIN` list 로 엄격 차단(dev 분기 자체가 없음)이라 보안 영향 0.
- **공개 리뷰 정렬은 `fetchedAt asc` = 최신순 (2026-05-31 fix)** — 크롤러가 네이버 최신순으로 받아 저장하므로 저장 순서(`fetchedAt asc`)가 곧 최신순이다. `assemblePublicReviews` 의 최종 정렬이 `desc` 였어서 `sort=recent` 가 가장 오래된 리뷰를 맨 위로 내보내던 버그를 `asc` 로 교정. web 토픽의 "fetchedAt-asc" 정책과 같은 방향.
- **정산 공유 OG 는 풀 SSR 이 아니라 head 메타만 주입 (SSR-lite)** — 웹은 순수 Vite SPA 라 OG 크롤러가 JS 없이 긁으면 미리보기가 빈칸. 그렇다고 정산 페이지를 SSR 로 바꾸면 React 트리·라우터·인증을 서버에서 또 돌려야 한다. 대신 빌드된 `index.html` 의 `<head>` 에만 OG/twitter 메타를 문자열 치환으로 주입(`<title>` 교체 + `</head>` 앞 삽입)하고 그 외는 nginx 정적 서빙 그대로 — 크롤러는 메타를 보고 사람은 같은 HTML 위에서 SPA 부팅. 가장 작은 표면으로 OG 만 해결. index.html 은 배포마다 해시 자산명이 바뀌므로 경로를 후보 탐색 + 프로세스 수명 캐시(`cachedIndex`), 못 찾으면 시도 경로 전부 로그.
- **정산표 PNG 는 satori+resvg 로 서버 렌더, 분담은 동일 calculator 재사용** — 카카오톡에 '이미지로' 바로 보내려면 정산표를 PNG 로 줘야 한다. 웹/앱 캡처가 아니라 서버에서 `@repo/api-contract` 의 `calculateMultiRoundShares` 를 그대로 호출해 화면 `useMatrix` 와 픽셀 단위로 동일한 매트릭스를 satori(VDOM→SVG)+resvg(SVG→PNG)로 렌더 — 플랫폼 무관 단일 URL, 받는 사람은 로그인/클릭 없이 본다. 한글은 satori 가 system 폰트를 못 써 IBM Plex Sans KR ttf 를 번들·명시 주입. 폭에 따라 1/1.5/2x 스케일로 PNG 크기 억제.
- **og:image 는 토큰 시드 결정적 랜덤 (식당 사진 기본)** — `og:image` 기본을 정산 식당 사진으로 두면 참가자 이름이 크롤러 캐시에 박제되지 않는다(정산표 PNG 는 이름 노출 — owner 가 `table` 모드를 명시 선택했을 때만). 어느 사진을 고를지는 `seedFromToken(token)` 으로 결정 — 같은 공유 링크는 매번 같은 사진을 골라 카카오 OG 캐시와 일관(매 크롤마다 안 바뀜). owner 가 갤러리에서 특정 사진(`shareOgImageUrl`)을 고르면 그게 후보에 살아 있는 한 우선. `restaurant`/`table`/특정 1장 3-state 를 `shareOgImage` enum + `shareOgImageUrl` 두 컬럼으로 표현.
- **OG/갤러리 사진은 `getPhotoUrls` 경량 조회 — 리뷰 코퍼스 미로드** — 정산 OG/갤러리는 식당 사진 URL 만 필요한데 `getPublicDetail` 은 visitorReviews/summary 수백 행을 로드한다. `getPhotoUrls(placeId)` 가 `snapshotJson` 만 select + `mergePhotos` 재사용으로 같은 사진 배열을 산출 — 코퍼스 로드 제거. OG 크롤러 반복 펼침은 `getSharePreviewMeta` 의 `(token, origin)` 5분 in-memory 캐시로 추가 흡수(성공 결과만, owner share 변경 시 invalidate).
- **`ALLOWED_HOSTS` 단일 화이트리스트 — media + OG 공유** — thumbnail 프록시의 SSRF 가드(`ALLOWED_HOSTS`)를 media 모듈이 export 하고, 정산 OG 의 `isThumbnailProxyable` 이 같은 Set 을 재사용. 프록시 가능 호스트 정의가 한 곳 — OG 이미지 후보를 "어차피 프록시가 거부할 호스트" 로 채우는 사고 방지 + 화이트리스트 확장 시 양쪽 자동 반영.
- **friendly ESLint 합류 — 기존 위반은 warn 우선** — `eslint.config.mjs` 가 `@repo/config/eslint/node` 기반. 스크래핑 어댑터·dev 스크립트의 잔존 룰 위반을 error 로 막으면 도입 자체가 불가하니 `no-useless-assignment`/`no-useless-escape`/`prefer-const`/`consistent-type-imports` 를 warn 으로 내려 점진 정리. `prisma/migrations/**` 은 ignore. 이로써 turbo lint 가 web/friendly/api-contract/mobile 4/4 green.
- **`contentHashOf` 구분자는 유니코드 이스케이프 (NUL 금지)** — 해시 필드 구분자를 소스에 실제 NUL(`0x00`) 로 박으면 git/ripgrep 이 파일을 바이너리로 취급해 diff 가 `Binary files differ` 로만 떠 리뷰 불가. 런타임 charCode 동일한 이스케이프 시퀀스로 치환하면 **해시값은 그대로**(기존 `contentHash` 와 일치 — dedup 영향 0) 면서 파일이 순수 텍스트가 된다. 해시 구분자에 제어문자를 쓸 땐 항상 이스케이프로.
- **`models/preview` 라우트 — 저장 전 키 검증** — 어드민이 새 provider key 를 입력하는 도중 그 키로 모델 list 를 받아 select 에서 모델을 고른 뒤 row 를 저장. 키 → 모델 → 저장 순서가 가능해 잘못된 키나 잘못된 모델 id 로 row 가 생성되는 사고 방지.
- **vworld 키는 LlmProviderConfig 와 같은 DB-backed 패턴이지만 env fallback 없음**.
- **vworld secret 라우트는 평문 reveal**, **vworld `publicConfig` 는 admin secret 과 보안 등급이 동등**.
- **JWT `?token=` 쿼리 + 로그 redaction**.
- **Multiplexed Summary SSE + canonicalId 구독**.
- **요약 이벤트 두 종류** — `progress`/`review`.
- **리뷰 dedup = externalId + contentHash 이중 키**.
- **1 review = 1 ReviewSummary** — `reviewId @unique`.
- **Summary placeId-level 직렬화 + 어댑터 공유 FIFO 게이트**.
- **부팅 시 stale 요약 행 정리 + 자동 재큐잉**.
- **`ReviewSummary.status` enum 6종 — 단계별 의미 분리**.
- **SummaryService 는 app 전역 singleton (`plugins/summaries.ts`)**.
- **CrawlJobLog 시스템 — 한 진입점 / 세 채널 / `(jobId, seq)` dedup**.
- **canonical 그룹 detail = response-time fusion**.
- **`MAX_CONCURRENT_PER_ACTOR = 5`**.
- **리뷰 단위 자동 재시도 3회**.
- **`ANALYSIS_VERSION = 4`**.
- **Ollama structured output + numCtx=4096**.
- **`extractFirstJsonObject` / `normalizeTerm` 공유 export**.
- **분석 정규화 테이블 도입 동기** — 글로벌 통계용 GROUP BY 가능 행 단위 필요.
- **Summary는 fire-and-forget + 공유 FIFO 게이트**.
- **Media는 디스크 캐시 + sharp**.
- **No Docker / No Redis** — CLAUDE.md 규칙.
- **dev = `tsx watch`, prod = `tsup` 번들** — `target: node22`, ESM.
- **Vitest는 `extensionAlias` + 수동 .env 로드 + 직렬 실행**.

## Gotchas [coverage: high — 19 sources]

- **부팅 시 stale `running` run → `interrupted`** — `app.schedule.bootstrap()` 가 직전 인스턴스에서 `ScheduleRun.status='running'` 으로 남은 행을 `updateMany` 로 `interrupted`(+ `error='server restart'`)로 정리한다. 이 호출을 빼먹으면(예: 다른 부팅 경로) 죽은 run 이 영원히 running 으로 남아 이력이 오염된다. SummaryService 의 `cleanupStaleReviewSummaries` 와 같은 부팅 hook 패턴 — 단일 인스턴스 가정.
- **autoload 알파벳순 → schedule plugin 이 `app.aiConfig` 를 못 쓴다** — `'schedule' < 'summaries'` 라 schedule plugin 이 먼저 로드되는데, `app.aiConfig` 는 summaries plugin 이 decorate 한다. 그래서 schedule plugin 은 자체 AiConfig 를 만든다(Key Decisions 참조). schedule plugin 안에서 `app.aiConfig` 를 참조하도록 "단순화" 하면 undefined 로 깨진다 — 의도된 중복.
- **croner 타이머는 `unref` — 혼자선 프로세스를 못 붙잡는다** — `scheduleRegistry.setCron` 이 `unref:true` 로 croner 를 만들어 cron 타이머만 남았을 때 이벤트 루프가 살아 프로세스가 안 죽는 일을 막는다. 반대로 cron 만으로 프로세스를 keep-alive 하려 기대하면 안 된다(listen 소켓이 살아있는 게 본체). graceful shutdown 은 `stopAllCrons` + `abortInflight` 로 명시 정리하고, croner 인스턴스는 패턴 in-place 변경을 지원 안 해 reschedule 시 stop 후 재생성.
- **schedule 은 동시 1개 — 다중 인스턴스 배포 금지 가정** — `scheduleRegistry` 의 inflight 가드와 croner 타이머가 모두 in-process 라, 같은 DB 를 보는 friendly 를 2개 이상 띄우면 각 인스턴스가 독립 cron tick 을 쏴 중복 실행 + overlap 가드가 무력화된다. no-Redis/단일 인스턴스 전제(CLAUDE.md) 위에서만 안전.
- **canonical 1:1 시작 → merge 로 N:1 로 진화**.
- **`canonicalId` FK 가 Cascade 아니라 Restrict**.
- **`CanonicalMergeProposal` 의 (A,B) 쌍은 항상 A<B 정규화**.
- **`Restaurant.source` 분기 라우팅 — 공개 표면은 네이버 전용**.
- **`Restaurant.placeId` 가 nullable** — `r.placeId!` 는 모두 `source = 'naver'` 필터와 짝.
- **lib/matching 의 임계 변경 = 큐 폭증 위험**.
- **`snapshotJson` 파손 시 좌표/사진만 null fallback**.
- **bbox NaN/length 방어**.
- **공개 list 정렬에서 null 은 항상 뒤** (`nullsLast` 헬퍼).
- **공개 detail 의 `analysis` 는 done 한정**, **mixed 카운트 누락은 의도**.
- **vworld `publicConfig` 키 미등록 시 404 → FE 가드 필요**.
- **공개 vs admin getInsights — 응답 스키마는 같지만 가드만 다르다**.
- **Windows에서 Prisma DLL lock (EPERM)**.
- **`extractFirstJsonObject` cross-module 의존성**.
- **v3 행 + v4 코드 공존** — null sentiment 는 'neutral' 로 폴백.
- **`JWT_SECRET` 32자 미만 → 부팅 실패**.
- **회원가입은 무조건 USER** — 첫 ADMIN은 `scripts/promote-admin.ts`.
- **`?token=` 마스킹은 app.ts에만 있다**.
- **DELETE restaurant ↔ in-flight crawl = 409**.
- **summary 모듈은 라우트 미노출** — restaurant 라우트가 호스팅.
- **`cleanupStaleReviewSummaries` 는 단일 인스턴스 가정**.
- **summary SSE heartbeat 는 `named heartbeat` 이벤트** (다른 SSE 는 comment).
- **`MAX_CONCURRENT_PER_ACTOR = 5` 와 auto-discover GROUP_SIZE 동일**.
- **`createMany skipDuplicates` SQLite 미지원**.
- **Ollama `num_ctx` 기본 2048 함정** — 4096 + maxTokens 1500 명시.
- **autoload는 vite resolve를 우회한다** — vitest 통합 부팅 깨지기 쉬움.
- **media `data/thumbs/` 디렉터리 누적** — 만료 로직 없음. **`data/receipts/<uuid>.jpg` 도 동일** — settlement 세션 삭제 시 jpg 파일은 그대로 남는다 (현재 GC 없음).
- **media는 public(인증 없음)** — ALLOWED_HOSTS 가 SSRF 가드 전부. **`/share/settlements/:token` 도 인증 없음** — 토큰의 추측 불가능성에 보안 전부 의존.
- **`tsx watch`는 `src/`만 감시한다**.
- **crawl 검색/다이닝코드/캐치테이블 적응형 의존**.
- **`DATABASE_URL` 의 `..` 상대 경로 함정** — Prisma CLI 와 서버 cwd 가 다르면 같은 URL 이 다른 파일을 가리킨다. `apps/friendly/.env` 의 `file:../data/dev.db` 는 prisma 디렉터리 (`apps/friendly/prisma/`) → `apps/friendly/data/dev.db` + 서버 cwd (`apps/friendly/`) → `apps/friendly/data/dev.db` 로 우연히 일치하도록 설계된 것이지, 임의의 cwd 에서 안전하지 않다. 다른 디렉터리에서 prisma 명령을 돌리면 엉뚱한 dev.db 가 생긴다.
- **SQLite `PRAGMA foreign_keys` 는 connection-scoped** — Prisma 가 연결을 새로 만들 때마다 OFF 로 돌아간다. `plugins/prisma.ts` 가 부팅 1회만 켜므로 같은 PrismaClient 인스턴스의 connection pool 안에서만 유효. dev 에서 `prisma migrate dev` 같은 외부 CLI 는 자체 연결을 쓰므로 별개.
- **`LlmProviderConfig` unique 키 변경 (2026-05-25)** — `provider @unique` → `(provider, purpose) @@unique` 로 바뀌었다. 같은 provider 의 새 row 를 추가할 땐 반드시 `purpose` 도 명시. 기존 백필은 `purpose='chat'` 으로 채워졌으므로 image purpose 카드는 어드민이 명시적으로 추가해야 노출. `getResolved` 는 인자에 `purpose` 필수.
- **env fallback 은 purpose='chat' 한정** — image purpose 는 환경변수 fallback 없음. DB row 가 없으면 settlement-extraction 의 `getResolved('ollama-cloud', 'image')` 가 null 을 돌려준다 → 추출 라우트가 503 또는 명시 에러로 떨어짐.
- **`SettlementSession.shareToken @unique` + nullable** — 토큰이 null 인 행이 여러 개여도 SQLite 의 unique 제약은 NULL 을 distinct 취급해 허용. 토큰 발급된 행만 토큰으로 검색.
- **단골 `normalizedKey` 계산은 service 전담** — 직접 SQL 로 SettlementContact 를 만들면 normalizedKey 가 어긋나 정산 저장 시 자동 적립이 새 row 를 만들어 버린다 (같은 사람이 두 행으로 분기). `settlement.service` 의 `normalizeContactKey` 함수만 거쳐야 함 — `backfill-contacts.ts` 가 같은 함수를 import 한다.
- **`backfill-contacts.ts` 정렬은 createdAt asc 필수** — `lastExcludeAlcohol/NonAlcohol/Side` 가 가장 최근 정산의 값으로 남으려면 오래된 정산부터 순회해야 한다. desc 로 돌리면 가장 오래된 exclude 값이 마지막에 덮어써 default 제안이 의도와 반대로 나옴.
- **SQLite multi-NULL unique 함정 → `placeIdKey=''` sentinel** — `SettlementDraft` 의 식당 미지정 슬롯을 `(userId, placeId NULL)` 로 두면 SQLite 가 NULL 을 distinct 취급해 동일 사용자의 미지정 슬롯이 무한정 늘어난다. 그래서 NOT NULL 컬럼 `placeIdKey` 에 `''` 를 sentinel 로 박고 service 의 `placeIdToKey()` 가 변환. 직접 prisma 호출로 draft 를 만들 때 `placeId=null` 을 그대로 넣지 말 것 — 서비스 메소드만 거치게.
- **`SettlementDraftService.deleteByIdInTxIfOwner` 는 missing/foreign 행을 swallow** — `deleteMany({ where: { id, userId } })` 로 0행 매치여도 throw 하지 않는다. 정산 본저장이 draft 정리 실패로 깨지지 않도록 의도. 반대로 draft 가 남았다고 정산이 깨지는 회귀가 없는지는 service 테스트에서 확인.
- **dev CORS 는 모든 origin 을 반사한다 (prod 와 동작이 다름)** — `isDev` 분기는 origin 검사 없이 `cb(null,true)`. 로컬에서 "CORS 가 통과하니 됐다" 고 판단하면 prod 에서 `CORS_ORIGIN` 미설정으로 깨질 수 있다 — prod 는 dev 분기가 없어 env list 만 본다. prod 에서 새 origin(앱 웹호스트 등)을 허용하려면 `CORS_ORIGIN` 에 명시 추가. dev 로그에 `CORS(dev): 비-LAN origin 반사 허용 — <origin>` warn 이 뜨면 의도한 origin 인지 한 번 확인(오설정/오접속 신호).
- **`.well-known` 라우트는 env 비면 404 (5xx 아님)** — config 누락은 서버 오류가 아니라 "검증 미설정" 의미. iOS/Android 가 200+빈 JSON 으로 검증 실패하는 것보다 404 폴백이 명확. 200 응답을 기대하고 헬스체크 거는 외부 모니터링을 well-known 에 걸지 말 것.
- **차수 마이그레이션의 backfill 규약 — `round.id = session.id`** — `20260525100000_add_settlement_rounds` 가 기존 세션을 1개 round 로 백필할 때 `round.id` 를 `session.id` 와 동일하게 설정. 이후 `settlement_items.sessionId → roundId` rename 이 추가 매핑 없이 동작. 새 코드가 round.id 와 session.id 의 동일성을 가정하면 안 된다 — backfill 규약일 뿐, 새로 만드는 세션의 round.id 는 별개 cuid.
- **PUT `/:id` 전체 replace 의 side effect — child rows 가 매번 새 id** — items / attendees / rounds 의 prisma id 가 PUT 마다 바뀐다. 클라이언트가 이전 id 를 기억해 부분 갱신을 시도하면 안 됨. 정산 store 는 본저장 응답으로 받은 fresh id 만 사용.
- **`ExtractReceiptInput.split` 의 sharp 메타데이터 누락 케이스** — 손상된 이미지여서 `metadata.width` 가 없으면 service 가 `split skipped — missing metadata` log + 원본 전체로 폴백. 클라이언트가 split 을 명시해도 LLM 이 전체 이미지를 보는 케이스가 있을 수 있다. (조용한 정확도 저하 — 디버깅 시 friendly log 확인 포인트.)
- **OG share-preview 는 빌드된 웹 `index.html` 에 의존** — `apps/web` 을 빌드하지 않았거나 dist 경로가 후보 탐색 범위 밖이면 `/share/settlements/:token` HTML 핸들러가 500(`preview unavailable`) — SPA 자체는 nginx 가 서빙하므로 사람은 멀쩡히 열리지만 **카카오/텔레그램 미리보기만 깨진다**. dev 에서 `apps/friendly` 만 띄우고 web 을 안 빌드하면 재현. 운영에선 `env.WEB_INDEX_PATH` 로 명시 지정 권장(후보 탐색 의존 제거). 실패 시 시도한 경로 전부가 `app.log.error` 에 찍힌다.
- **`cachedIndex` 는 프로세스 수명 캐시 — 웹 재배포 시 stale 위험** — share-preview 가 읽은 index.html 을 모듈 변수로 캐시한다. 웹을 재배포(해시 자산명 변경)했는데 friendly 를 재기동(pm2 reload)하지 않으면 OG HTML 이 옛 자산을 가리킨다 — `<head>` 메타만 쓰므로 미리보기엔 영향 없지만, 그 HTML 로 SPA 가 부팅되면 옛 청크를 로드할 수 있다. 웹 배포 후 friendly reload 가 정석.
- **정산표 PNG 는 IBM Plex Sans KR ttf 가 배포에 포함돼야 한다** — satori 는 system 폰트를 못 써 번들 ttf 버퍼를 명시 주입한다. `assets/fonts/IBMPlexSansKR-*.ttf` 가 prod 빌드 산출물에 함께 안 가면 `폰트를 찾지 못함` throw → `/image.png` 가 500(`render error`). tsup 번들만 옮기고 assets 를 빠뜨리는 배포 사고 주의.
- **og:image 식당 사진은 네이버 호스트(ALLOWED_HOSTS) 만** — 다이닝코드/캐치테이블 호스트 사진은 `isThumbnailProxyable` 이 false 라 OG 후보에서 빠진다. 정산 식당이 네이버 사진이 하나도 없으면 `restaurant` 모드라도 og:image 가 정산표 PNG 로 폴백한다(빈 미리보기 아님 — 의도된 폴백).
- **`SettlementSession` 의 OG 컬럼은 공개 응답에서 누락** — `shareOgImage`/`shareOgImageUrl` 은 owner 의 공유 설정이라 `getBySharedToken`/공개 스키마에 노출되지 않는다. og:image 선택 결과는 share-preview 가 서버에서 풀어 og:image URL 로만 반환.

## Sources [coverage: high — 99 sources]

- [apps/friendly/package.json](../../apps/friendly/package.json) — *modified: satori/@resvg/resvg-js 의존성 + croner ^10(NEW) + lint/eval:extraction/probe:extraction/probe:vision/probe:merge/run-merge 스크립트*
- [apps/friendly/src/modules/schedule/schedule.service.ts](../../apps/friendly/src/modules/schedule/schedule.service.ts) — *NEW 2026-06-06: 정규화→머지 파이프라인 + config/run/preview/이력*
- [apps/friendly/src/modules/schedule/schedule-registry.ts](../../apps/friendly/src/modules/schedule/schedule-registry.ts) — *NEW 2026-06-06: 모듈 singleton cron 타이머 + inflight run + SSE*
- [apps/friendly/src/modules/schedule/schedule.route.ts](../../apps/friendly/src/modules/schedule/schedule.route.ts) — *NEW 2026-06-06: /admin/schedule/* 5종*
- [apps/friendly/src/modules/schedule/schedule.service.test.ts](../../apps/friendly/src/modules/schedule/schedule.service.test.ts) — *NEW 2026-06-06*
- [apps/friendly/src/plugins/schedule.ts](../../apps/friendly/src/plugins/schedule.ts) — *NEW 2026-06-06: ScheduleService app-level singleton (자체 AiConfig)*
- [apps/friendly/prisma/migrations/20260605135918_add_schedule_tables/migration.sql](../../apps/friendly/prisma/migrations/20260605135918_add_schedule_tables/migration.sql) — *NEW 2026-06-06: schedule_configs + schedule_runs*
- [apps/friendly/scripts/probe-merge.ts](../../apps/friendly/scripts/probe-merge.ts) — *NEW 2026-06-06: 글로벌 머지 프로브*
- [apps/friendly/scripts/run-global-merge.ts](../../apps/friendly/scripts/run-global-merge.ts) — *NEW 2026-06-06: 글로벌 머지 수동 실행*
- [apps/friendly/eslint.config.mjs](../../apps/friendly/eslint.config.mjs) — *NEW 2026-06-01: @repo/config/eslint/node 기반, 기존 위반 warn*
- [apps/friendly/src/modules/settlement/share-preview.ts](../../apps/friendly/src/modules/settlement/share-preview.ts) — *NEW 2026-06-01: OG SSR-lite HTML + image.png 라우트*
- [apps/friendly/src/modules/settlement/settlement-card.ts](../../apps/friendly/src/modules/settlement/settlement-card.ts) — *NEW 2026-06-01: 정산표 PNG 서버 렌더 (satori + resvg)*
- [apps/friendly/scripts/eval-extraction.ts](../../apps/friendly/scripts/eval-extraction.ts) — *NEW 2026-06-01: 영수증 추출 평가*
- [apps/friendly/scripts/probe-extraction.ts](../../apps/friendly/scripts/probe-extraction.ts) — *NEW 2026-06-01: 추출 프로브*
- [apps/friendly/scripts/probe-vision.ts](../../apps/friendly/scripts/probe-vision.ts) — *NEW 2026-06-01: vision provider 프로브*
- [apps/friendly/src/plugins/summaries.ts](../../apps/friendly/src/plugins/summaries.ts)
- [apps/friendly/src/plugins/multipart.ts](../../apps/friendly/src/plugins/multipart.ts)
- [apps/friendly/src/plugins/prisma.ts](../../apps/friendly/src/plugins/prisma.ts)
- [apps/friendly/src/modules/crawl/job-log.service.ts](../../apps/friendly/src/modules/crawl/job-log.service.ts)
- [apps/friendly/src/modules/well-known/well-known.route.ts](../../apps/friendly/src/modules/well-known/well-known.route.ts)
- [apps/friendly/src/modules/settlement/settlement-draft.route.ts](../../apps/friendly/src/modules/settlement/settlement-draft.route.ts)
- [apps/friendly/src/modules/settlement/settlement-draft.service.ts](../../apps/friendly/src/modules/settlement/settlement-draft.service.ts)
- [apps/friendly/src/modules/settlement/settlement-draft.route.test.ts](../../apps/friendly/src/modules/settlement/settlement-draft.route.test.ts)
- [apps/friendly/prisma/migrations/20260525235559_add_settlement_drafts/migration.sql](../../apps/friendly/prisma/migrations/20260525235559_add_settlement_drafts/migration.sql)
- [apps/friendly/prisma/migrations/20260525220309_add_settlement_round_category_adjustments/migration.sql](../../apps/friendly/prisma/migrations/20260525220309_add_settlement_round_category_adjustments/migration.sql)
- [apps/friendly/prisma/migrations/20260525110000_add_settlement_round_discount/migration.sql](../../apps/friendly/prisma/migrations/20260525110000_add_settlement_round_discount/migration.sql)
- [apps/friendly/prisma/migrations/20260525100000_add_settlement_rounds/migration.sql](../../apps/friendly/prisma/migrations/20260525100000_add_settlement_rounds/migration.sql)
- [apps/friendly/prisma/migrations/20260524112443_add_settlement_edited_at/migration.sql](../../apps/friendly/prisma/migrations/20260524112443_add_settlement_edited_at/migration.sql)
- [apps/friendly/prisma/migrations/20260524000000_add_settlement_contacts/migration.sql](../../apps/friendly/prisma/migrations/20260524000000_add_settlement_contacts/migration.sql)
- [apps/friendly/prisma/migrations/20260523030833_add_settlement_share_token/migration.sql](../../apps/friendly/prisma/migrations/20260523030833_add_settlement_share_token/migration.sql)
- [apps/friendly/prisma/migrations/20260523012752_add_settlement_models/migration.sql](../../apps/friendly/prisma/migrations/20260523012752_add_settlement_models/migration.sql)
- [apps/friendly/prisma/migrations/20260523010655_pnpm_filter_friendly_test_src_modules_ai/migration.sql](../../apps/friendly/prisma/migrations/20260523010655_pnpm_filter_friendly_test_src_modules_ai/migration.sql)
- [apps/friendly/prisma/migrations/20260518014530_add_crawl_job_log/migration.sql](../../apps/friendly/prisma/migrations/20260518014530_add_crawl_job_log/migration.sql)
- [apps/friendly/prisma/migrations/20260515104718_add_canonical_merge_proposals/migration.sql](../../apps/friendly/prisma/migrations/20260515104718_add_canonical_merge_proposals/migration.sql)
- [apps/friendly/prisma/migrations/20260515100910_add_canonical_suggestion_dismissed/migration.sql](../../apps/friendly/prisma/migrations/20260515100910_add_canonical_suggestion_dismissed/migration.sql)
- [apps/friendly/prisma/migrations/20260515083303_add_canonical_restaurant/migration.sql](../../apps/friendly/prisma/migrations/20260515083303_add_canonical_restaurant/migration.sql)
- [apps/friendly/prisma/migrations/20260515063258_add_restaurant_source_split/migration.sql](../../apps/friendly/prisma/migrations/20260515063258_add_restaurant_source_split/migration.sql)
- [apps/friendly/prisma/migrations/20260508173216_add_map_provider_configs/migration.sql](../../apps/friendly/prisma/migrations/20260508173216_add_map_provider_configs/migration.sql)
- [apps/friendly/prisma/migrations/20260508122321_add_visitor_review_videos/migration.sql](../../apps/friendly/prisma/migrations/20260508122321_add_visitor_review_videos/migration.sql)
- [apps/friendly/prisma/migrations/20260508095207_add_review_analysis_fields/migration.sql](../../apps/friendly/prisma/migrations/20260508095207_add_review_analysis_fields/migration.sql)
- [apps/friendly/prisma/migrations/20260506205226_add_restaurant_review_summary/migration.sql](../../apps/friendly/prisma/migrations/20260506205226_add_restaurant_review_summary/migration.sql)
- [apps/friendly/prisma/migrations/20260506191413_add_llm_provider_config/migration.sql](../../apps/friendly/prisma/migrations/20260506191413_add_llm_provider_config/migration.sql)
- `apps/friendly/prisma/migrations/*_add_analytics_tables/migration.sql`
- `apps/friendly/prisma/migrations/*_add_menu_canonicals/migration.sql`
- `apps/friendly/prisma/migrations/*_add_global_menu_canonicals/migration.sql`
- `apps/friendly/prisma/migrations/*_add_global_menu_category_path/migration.sql`
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)
- [apps/friendly/scripts/promote-admin.ts](../../apps/friendly/scripts/promote-admin.ts)
- [apps/friendly/scripts/backfill-contacts.ts](../../apps/friendly/scripts/backfill-contacts.ts)
- [apps/friendly/src/server.ts](../../apps/friendly/src/server.ts) — *modified: app.schedule.bootstrap() 부팅 + shutdown 시 scheduleRegistry 정리*
- [apps/friendly/src/app.ts](../../apps/friendly/src/app.ts) — *modified: registerSharePreview(app) 등록 + forceCloseConnections:'idle'(2026-06-06)*
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) — *modified: WEB_INDEX_PATH/OG_IMAGE_PATH 키*
- [apps/friendly/src/lib/hash.ts](../../apps/friendly/src/lib/hash.ts)
- [apps/friendly/src/lib/matching.ts](../../apps/friendly/src/lib/matching.ts)
- [apps/friendly/src/types/fastify.d.ts](../../apps/friendly/src/types/fastify.d.ts)
- [apps/friendly/src/plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts) — *modified: dev 전면 반사 허용 + 비-LAN origin warn*
- [apps/friendly/src/plugins/empty-body-parser.ts](../../apps/friendly/src/plugins/empty-body-parser.ts)
- [apps/friendly/src/plugins/error-handler.ts](../../apps/friendly/src/plugins/error-handler.ts) — *modified: setErrorHandler error 파라미터 FastifyError 주석*
- [apps/friendly/src/plugins/helmet.ts](../../apps/friendly/src/plugins/helmet.ts)
- [apps/friendly/src/plugins/jwt.ts](../../apps/friendly/src/plugins/jwt.ts)
- [apps/friendly/src/plugins/sensible.ts](../../apps/friendly/src/plugins/sensible.ts)
- [apps/friendly/src/plugins/swagger.ts](../../apps/friendly/src/plugins/swagger.ts)
- [apps/friendly/src/modules/auth/auth.route.ts](../../apps/friendly/src/modules/auth/auth.route.ts)
- [apps/friendly/src/modules/auth/auth.service.ts](../../apps/friendly/src/modules/auth/auth.service.ts)
- [apps/friendly/src/modules/auth/auth.test.ts](../../apps/friendly/src/modules/auth/auth.test.ts)
- [apps/friendly/src/modules/picks/picks.route.ts](../../apps/friendly/src/modules/picks/picks.route.ts)
- [apps/friendly/src/modules/picks/picks.service.ts](../../apps/friendly/src/modules/picks/picks.service.ts)
- [apps/friendly/src/modules/health/health.route.ts](../../apps/friendly/src/modules/health/health.route.ts)
- [apps/friendly/src/modules/admin/admin.route.ts](../../apps/friendly/src/modules/admin/admin.route.ts)
- [apps/friendly/src/modules/admin/admin.service.ts](../../apps/friendly/src/modules/admin/admin.service.ts)
- [apps/friendly/src/modules/restaurant/restaurant.route.ts](../../apps/friendly/src/modules/restaurant/restaurant.route.ts) — *modified: publicCategoryTree 공개 라우트 추가(2026-06-06)*
- [apps/friendly/src/modules/restaurant/restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts) — *modified: getPhotoUrls 신규(2026-06-01) + getCategoryTree(2026-06-06) + assemblePublicReviews fetchedAt asc 교정 + contentHashOf NUL→이스케이프*
- [apps/friendly/src/modules/restaurant/restaurant.test.ts](../../apps/friendly/src/modules/restaurant/restaurant.test.ts) — *modified: category-tree 테스트 추가(2026-06-06)*
- [apps/friendly/src/modules/crawl/job-registry.ts](../../apps/friendly/src/modules/crawl/job-registry.ts) — *modified: isPlaceCrawling actor-agnostic 가드 추가(2026-06-06)*
- [apps/friendly/src/modules/restaurant/restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts)
- [apps/friendly/src/modules/restaurant/restaurant.merge.test.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.test.ts)
- [apps/friendly/src/modules/canonical/](../../apps/friendly/src/modules/canonical/)
- [apps/friendly/src/modules/auto-discover/auto-discover.route.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.route.ts)
- [apps/friendly/src/modules/auto-discover/auto-discover.service.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.service.ts)
- [apps/friendly/src/modules/auto-discover/auto-discover-registry.ts](../../apps/friendly/src/modules/auto-discover/auto-discover-registry.ts)
- [apps/friendly/src/modules/auto-discover/auto-discover.prompts.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.prompts.ts)
- [apps/friendly/src/modules/auto-discover/auto-discover.test.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.test.ts)
- [apps/friendly/src/modules/crawl/crawl.route.ts](../../apps/friendly/src/modules/crawl/crawl.route.ts)
- [apps/friendly/src/modules/crawl/crawl.service.ts](../../apps/friendly/src/modules/crawl/crawl.service.ts)
- [apps/friendly/src/modules/summary/summary.service.ts](../../apps/friendly/src/modules/summary/summary.service.ts)
- [apps/friendly/src/modules/summary/summary-events-bus.ts](../../apps/friendly/src/modules/summary/summary-events-bus.ts)
- [apps/friendly/src/modules/summary/summary.test.ts](../../apps/friendly/src/modules/summary/summary.test.ts)
- [apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts)
- [apps/friendly/src/modules/analytics/analytics.service.ts](../../apps/friendly/src/modules/analytics/analytics.service.ts) — *modified: 글로벌 머지 v3 택소노미 + mappings 배열 스키마 + 청크 10 + categoryPath 복구 + runGlobalMerge(스케줄러 호출). 상세는 analytics 토픽*
- [apps/friendly/src/modules/analytics/](../../apps/friendly/src/modules/analytics/)
- [apps/friendly/src/modules/media/media.route.ts](../../apps/friendly/src/modules/media/media.route.ts) — *modified: ALLOWED_HOSTS export (OG 공유 재사용)*
- [apps/friendly/src/modules/media/media.test.ts](../../apps/friendly/src/modules/media/media.test.ts)
- [apps/friendly/src/modules/settings/map.route.ts](../../apps/friendly/src/modules/settings/map.route.ts)
- [apps/friendly/src/modules/settings/map.service.ts](../../apps/friendly/src/modules/settings/map.service.ts)
- [apps/friendly/src/modules/settings/map.test.ts](../../apps/friendly/src/modules/settings/map.test.ts)
- [apps/friendly/src/modules/ai/adapter-cache.ts](../../apps/friendly/src/modules/ai/adapter-cache.ts)
- [apps/friendly/src/modules/ai/ai.config.service.ts](../../apps/friendly/src/modules/ai/ai.config.service.ts)
- [apps/friendly/src/modules/contact/contact.route.ts](../../apps/friendly/src/modules/contact/contact.route.ts)
- [apps/friendly/src/modules/contact/contact.service.ts](../../apps/friendly/src/modules/contact/contact.service.ts)
- [apps/friendly/src/modules/contact/contact.route.test.ts](../../apps/friendly/src/modules/contact/contact.route.test.ts)
- [apps/friendly/src/modules/settlement/settlement.route.ts](../../apps/friendly/src/modules/settlement/settlement.route.ts)
- [apps/friendly/src/modules/settlement/settlement.service.ts](../../apps/friendly/src/modules/settlement/settlement.service.ts) — *modified: getSharePreviewMeta + pickRestaurantOgImageUrl + collectCandidateImageUrls + sharePreviewCache + shareOgImage/shareOgImageUrl 처리*
- [apps/friendly/src/modules/settlement/settlement.route.test.ts](../../apps/friendly/src/modules/settlement/settlement.route.test.ts)
- [apps/friendly/src/modules/settlement/settlement.calculator.test.ts](../../apps/friendly/src/modules/settlement/settlement.calculator.test.ts)
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts)
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts)
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts)
- [apps/friendly/tsconfig.json](../../apps/friendly/tsconfig.json)
- [apps/friendly/tsup.config.ts](../../apps/friendly/tsup.config.ts)
- [apps/friendly/vitest.config.ts](../../apps/friendly/vitest.config.ts)
- [apps/friendly/.env.example](../../apps/friendly/.env.example)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)
