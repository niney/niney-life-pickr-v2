---
concept: ssr-lite-head-injection
last_compiled: 2026-06-25
topics_connected: [friendly, settlement, web]
status: active
---

# SSR-lite head 주입 (메타만 서버 렌더)

## Pattern

SPA 라우트를 백엔드가 가로채, 빌드된 `index.html` 의 `<head>` 에만 OG/SEO 메타(+JSON-LD)를 서버에서 주입해 내려준다. 본문(`<body>` 안의 React 마운트 포인트)은 그대로 두고, 자산도 그대로 정적 서빙한다 — 풀 SSR 프레임워크(Next 등)도 hydration 도 없다. **JS 를 실행하지 않는 크롤러(SNS 링크 언펌·검색봇)만 이 서버 주입 메타를 읽고, JS 를 실행하는 실제 사용자는 같은 HTML 위에서 SPA 가 평소대로 부팅**한다. 즉 같은 URL 이 두 소비자에게 다른 의미를 갖는다: 봇에겐 메타가 채워진 정적 문서, 사람에겐 SPA 부트스트랩 HTML.

`og:image` 는 두 갈래다 — 서버가 즉석 렌더한 PNG(satori+resvg 로 정산표 매트릭스를 그림) 거나, 도메인이 이미 가진 대표 이미지(식당 사진)다. 메타가 비어 보이는 순수 SPA 의 SNS 미리보기 문제를, 라우트 하나를 prefix 밖(`/api/v1` 가 아닌 origin 루트)에 명시 등록하는 최소 침습으로 푼다.

핵심은 **"메타만"** 이다. body 를 서버에서 렌더하지 않으므로(noscript 정적 본문은 예외 — 아래) 서버가 React 트리·라우터·데이터 패칭을 알 필요가 없고, 빌드된 SPA 산출물(`index.html` + nginx 정적 자산)을 그대로 재사용한다. 백엔드는 `index.html` 텍스트를 읽어 `<title>` 을 교체하고 `</head>` 앞에 메타 문자열을 끼워 넣을 뿐이다.

## Instances

- **2026-06-01 (16차 도입)** in [../topics/settlement](../topics/settlement.md) / [../topics/friendly](../topics/friendly.md): **정산 공유 OG**. [share-preview.ts](../../apps/friendly/src/modules/settlement/share-preview.ts) 의 `registerSharePreview(app)` 가 `/share/settlements/:token` 과 단축 별칭 `/s/:token` 을 가로채, 빌드된 `index.html` 의 `<head>` 에 정산 요약 OG 메타(`og:title`=식당명+"정산", `og:description`=`총 N원 · M명`)를 주입한다. **프라이버시 — 참가자 '이름'은 넣지 않는다**(식당명·총액·인원수까지만, 크롤러 캐시 박제 회피). `og:image` 는 owner 가 공유 시 고른 모드에 따라 동적: `restaurant`(식당 사진 — 갤러리 특정 1장 고정 또는 `seedFromToken` 토큰 시드 결정적 랜덤) 또는 정산표 PNG. PNG 는 [settlement-card.ts](../../apps/friendly/src/modules/settlement/settlement-card.ts) 가 satori(레이아웃→SVG) + resvg(SVG→PNG) 로 즉석 렌더(폰트 IBMPlexSansKR 번들), `/share/settlements/:token/image.png` 라우트로 노출. 만료/없는 토큰 → 일반 OG 폴백(`OG_IMAGE_PATH` 기본 이미지), PNG 라우트는 404. 사람은 같은 URL 의 [SharedSettlementPage](../../apps/web/src/routes/settlement/SharedSettlementPage.tsx) SPA 로 본다.
- **2026-06-25 (18차 신규)** in [../topics/friendly](../topics/friendly.md) / [../topics/web](../topics/web.md): **맛집 공유/SEO**. [restaurant-preview.ts](../../apps/friendly/src/modules/restaurant/restaurant-preview.ts) 의 `registerRestaurantPreview(app)` 가 `/r/:placeId`(상세 대표 URL) + `/sitemap.xml` + `/robots.txt` 를 등록한다. `/r/:placeId` 는 같은 SSR-lite head 주입(`getPublicSeoMeta(placeId)` 로 canonical 병합한 식당명·카테고리·주소·평점·리뷰수)에 더해 **두 가지가 정산보다 풍부**하다: ① **JSON-LD** — `<script type="application/ld+json">` 에 schema.org `Restaurant`(+ `AggregateRating`/`GeoCoordinates`/`PostalAddress`/`servesCuisine`/`telephone`) 를 박아 검색엔진 리치 결과를 노린다. ② **`<noscript>` SEO 본문** — `injectOg` 가 `<body>` 직후에 `<h1 itemprop="name">`·대표 메뉴 `<ul>`·대표 사진 `<img>` 를 가진 microdata 본문을 추가(정산 OG 는 head 메타만, 여기는 head + noscript body). 없는 placeId → 404 + `<meta name="robots" content="noindex">`. 봇=서버 HTML, 사람=`/r` SPA([RestaurantsV2Page](../../apps/web/src/routes/RestaurantsV2Page.tsx) 가 `useMatch('/r/:placeId')` → `isShareRoute` 로 리스트를 숨기고 지도+상세 레이아웃 재사용 — 공개 페이지 코드 0 추가).
- **공통 메커니즘 (두 파일이 사실상 같은 골격을 복제)** — `candidateIndexPaths()` 가 `__dirname` 과 `process.cwd()` 에서 위로 **7단계** 올라가며 `apps/web/dist/index.html`·`web/dist/index.html` 후보를 만들어 처음 읽히는 것을 쓴다(dev=tsx src 실행 vs prod=tsup 번들 dist 라 `__dirname` 이 달라 고정 상대경로 불가). `WEB_INDEX_PATH` env 가 있으면 그것만. 읽은 HTML 은 `cachedIndex` 로 **프로세스 수명 1회 캐시 — 재배포 후 `pm2 reload` 필수**(해시 자산명이 바뀐 새 index.html 을 다시 읽으려면 프로세스 재기동). `getPublicOrigin(req)` 는 `PUBLIC_ORIGIN` env → `X-Forwarded-Proto` + `host` → `ninelife.kr` 폴백 순으로 origin 을 도메인 하드코딩 없이 파생. `injectOg()` 는 `<title>` 정규식 교체 + `</head>` 앞 메타 삽입(맛집은 추가로 `<body>` 직후 noscript 삽입). 둘 다 [app.ts](../../apps/friendly/src/app.ts) 가 autoload 밖에서 `registerSharePreview(app)` / `registerRestaurantPreview(app)` 로 명시 호출 — `/api/v1` prefix 가 붙으면 안 되는 origin 루트 경로라서.

## What This Means

이 패턴은 **풀 SSR 프레임워크(Next 등)를 도입하지 않고도 SPA 를 유지하면서 SNS/검색 미리보기만 해결하는 최소 침습 기법**이다. CLAUDE.md 의 "Docker 추가 금지 / 단일 인스턴스" 전제, 그리고 SSR 런타임을 새로 들이지 않는다는 결과 일관성과 맞물린다 — 백엔드가 이미 떠 있는 Fastify 인스턴스에 라우트 셋 개만 더 등록하고, 빌드된 SPA 산출물을 그대로 재사용한다. 서버가 React 를 렌더하지 않으므로 hydration mismatch·SSR 데이터 패칭·런타임 추가 의존이 전부 없다.

**왜 16차에 보류했다가 18차에 추출했나** — 16차(2026-06-01)에 정산 공유 한 곳에만 있을 땐 "이 도메인 고유의 OG 처리" 로 보였다. 추출 임계(동형 인스턴스 2개)에 못 미쳐 "다른 공유 도메인(식당/랭킹)으로 번지면 추출" 로 후보 보류했다. 18차(2026-06-25) 에 맛집 공유/SEO 가 같은 골격(`candidateIndexPaths`/`cachedIndex`/`getPublicOrigin`/`injectOg` 복제)으로 등장하면서 동형 인스턴스 2개가 됐고, 임계를 충족해 컨셉으로 추출한다.

**두 인스턴스의 결 차이** — 정산은 *공유 토큰* 소비자(메신저 언펌)만 노리고 head 메타까지만 담는다(프라이버시상 이름·noscript body 둘 다 회피). 맛집은 *검색엔진* 까지 노리므로 JSON-LD + noscript microdata body 로 한 발 더 나간다(공개 정보라 박제 우려 없음). 같은 패턴의 "메타만 주입" 골격 위에서, 소비자가 메신저냐 검색봇이냐에 따라 head-only ↔ head+JSON-LD+noscript 로 페이로드가 갈린다.

[[public-admin-route-split]] 과 인접하다 — 그쪽은 같은 데이터를 두 *응답 셋*(어드민/공개)으로 가르는 라우트 페어이고, 이쪽은 같은 *URL* 을 두 *소비자*(JS 미실행 봇 / JS 실행 사람)에게 다른 표현으로 내려주는 가로채기다. 둘 다 "공개 비인증 read 경로" 를 다루지만, 분리 축이 다르다(응답 셋 vs 렌더 시점·소비자).

**공통 운영 함정(Gotcha)** — SSR-lite 라우트가 origin 루트에 사니 nginx·CDN 레이어에서 세 가지가 물린다:
- **nginx prefix 우선권** — `/share/settlements/<token>/image.png` 처럼 `.png` 로 끝나는 경로는 정적 캐싱용 `location ~* \.(png|...)$` 정규식 location 에 가로채여 `root`(web/dist)에서 파일을 찾다 404 가 된다(dev 는 Vite proxy 라 정상 → "dev OK / prod 404" 의 전형). `location ^~ /share/settlements/` 처럼 **`^~` prefix 우선권**으로 정규식 검사를 건너뛰게 해야 한다. ([docs/deploy-friendly.md](../../docs/deploy-friendly.md) 에 정산 경로는 문서화됨 — 단, 18차 신규 `/r/`·`/sitemap.xml`·`/robots.txt` 는 아직 가이드 미반영이라 같은 prefix 처리가 필요.)
- **Cloudflare 엣지 캐시 Purge** — `.png` 라 Cloudflare 가 엣지 캐시한다. 잘못된 404 가 한 번 캐시되면 nginx 를 고쳐도 한동안(관측 ≈ 4h) 404 가 보인다 — nginx 수정 후 해당 URL 을 **Purge** 해야 즉시 반영. 성공 응답은 origin `cache-control: public, max-age=300` 을 따라 5분 엣지 캐시.
- **index.html 캐시 무효화** — `cachedIndex` 가 프로세스 수명 1회 캐시라, 웹을 재배포해(해시 자산명이 바뀜) friendly 를 `pm2 reload` 안 하면 옛 index.html 골격(존재하지 않는 옛 자산을 가리키는 `<script>`)을 계속 내려준다. 재배포 절차에 friendly reload 가 묶여야 한다.

이 패턴이 약해지는 시점: (1) **body 가 진짜 서버 데이터로 채워져야 할 때** — noscript microdata 가 충분치 않고 봇이 본문 텍스트를 실제로 인덱싱해야 하면 결국 풀 SSR/프리렌더로 넘어가야 한다(현재는 head 메타 + noscript 정적 본문이 상한). (2) **두 파일이 골격을 계속 복제할 때** — `candidateIndexPaths`/`cachedIndex`/`getPublicOrigin`/`injectOg`/`escapeHtml`/`formatWon`↔`formatCount` 가 거의 동일하게 두 파일에 살아 있다. 세 번째 인스턴스가 생기면 공유 헬퍼(`@repo/...` 또는 friendly lib)로 추출 압력이 커진다 — 지금은 인스턴스 2개라 복제 비용이 추출 비용보다 싸다.

## Sources

- [../topics/settlement](../topics/settlement.md)
- [../topics/friendly](../topics/friendly.md)
- [../topics/web](../topics/web.md)
- [../../apps/friendly/src/modules/settlement/share-preview.ts](../../apps/friendly/src/modules/settlement/share-preview.ts)
- [../../apps/friendly/src/modules/settlement/settlement-card.ts](../../apps/friendly/src/modules/settlement/settlement-card.ts)
- [../../apps/friendly/src/modules/restaurant/restaurant-preview.ts](../../apps/friendly/src/modules/restaurant/restaurant-preview.ts)
- [../../apps/friendly/src/app.ts](../../apps/friendly/src/app.ts)
- [../../apps/web/src/routes/RestaurantsV2Page.tsx](../../apps/web/src/routes/RestaurantsV2Page.tsx)
- [../../docs/deploy-friendly.md](../../docs/deploy-friendly.md)
