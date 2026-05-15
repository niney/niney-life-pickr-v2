# Wiki Compile Log

## 2026-05-15 (10th compile)

**Topics updated:** crawl, friendly, web, shared, api-contract, project-overview
**New topics:** canonical
**New concepts:** none
**Concepts updated:** sse-token-auth, stream-driven-cache-merge, in-memory-singleton-gates

**Sources scanned:** ~315 (knowledge files + canonical module 4 files + matching lib + adapters 4개 + Prisma migrations 4개 + AdminDiningcodePage + AdminCatchtable* + CanonicalMergePanel + MergeProposalQueue + DC bulk-save-registry + canonical.api/useCanonical + activeDiningcodeBulkSaveJobStore + 갱신된 schemas/crawl.ts·canonical.ts·restaurant.ts·routes.ts)
**Sources changed:** ~49 files (15 modified + 3 new web/shared/friendly modules + 4 Prisma migrations + 4 catchtable/diningcode adapters + 다수)

**Major changes since last compile (2026-05-14):**
- **신규 토픽 `canonical`** — 출처(Naver/다이닝코드/캐치테이블) 가로지르는 같은 가게 묶기. `apps/friendly/src/modules/canonical/` (CanonicalService + ProposalService + canonical.route + 8 테스트) + `apps/friendly/src/lib/matching.ts` (bigram Jaccard + Haversine, 임계 0.45/0.7 + 500m + bbox prefilter ±0.007°) + `packages/api-contract/src/schemas/canonical.ts` (14 zod) + `packages/shared/src/api/canonical.api.ts` + `useCanonical.ts` (9 훅) + `apps/web/src/components/restaurant/CanonicalMergePanel.tsx` + `MergeProposalQueue.tsx`. **정책: 자동 머지 없음, 전부 검토 큐 + 등록 후크 자동 + 수동 버튼.**
- **다이닝코드 통합** — 검색 (`diningcode-search.http.adapter.ts` HTTP 직접) + 가게 상세 (`diningcode-shop.http.adapter.ts` POST `/API/profile/` 한 방) + DB 저장 (`saveDiningcodeShop` — vRid 모든 리뷰 페이지 끌어와 persist + summary 큐) + 검증 페이지 (`/admin/diningcode-test`).
- **다이닝코드 정식 페이지 + SSE 일괄 저장** — `/admin/diningcode` 검색 + 등록 배지 + 체크박스 + sticky 액션바 + SSE 진행 카드. `diningcode-bulk-save-registry.ts` 신규 (per-actor 단일 잡, 60초 TTL GC, snapshot/item/done events). EventSource 백오프 재연결 + localStorage activeStore.
- **캐치테이블 통합** — 검색 (`catchtable-search.playwright.adapter.ts` 페이지 안 fetch 가로채기 — CF 봇 보호 우회) + 가게 상세 + 메뉴 (lazy) + AI 리뷰 종합. 검증 페이지 (`/admin/catchtable-test`).
- **AdminRestaurantsPage 대대적 개편** — list 가 canonical 그룹 단위로 (`CanonicalListItem.sources[]`), source 칩 + 분리 액션, MergeProposalQueue 상단 카드, 행 위 suggestion 알림 줄(amber dashed), 병합 후보 수 배지, canonical 단위 삭제 (placeId → canonicalId).
- **Prisma schema 확장** — `CanonicalRestaurant`, `CanonicalMergeProposal` 신규 + Restaurant `(source, sourceId)` 분리 + `Restaurant.canonicalId` FK (NOT Cascade, 의도) + `suggestionDismissedAt`. 마이그레이션 4개 (20260515063258 / 083303 / 100910 / 104718).
- **crawl.service 후크** — 가게 등록 직후 `generateProposalsForRestaurant(restaurantId)` 호출 (idempotent, 실패해도 등록 흐름 안 막음).
- **DC 출처 칩 link** — 어드민 맛집/MergeProposalQueue 에서 `/admin/diningcode-test/:vRid` → `/admin/diningcode/:vRid` 로 교체 (AdminDiningcodeShopPage 컴포넌트가 두 라우트에서 마운트되어 pathname 으로 back-link 분기).
- **명명 변경** — naver-search 어댑터가 Playwright → HTTP 직접 호출로 이전 (`naver-search.http.adapter.ts`).

**Concept updates:**
- `sse-token-auth` — DC bulk save events 엔드포인트 추가 (7번째 SSE 엔드포인트, `buildDiningcodeBulkSaveEventsUrl` 가 useGroupingJob 빌더와 동형). topics_connected 변동 없음.
- `stream-driven-cache-merge` — `useDiningcodeBulkSaveJob` 추가. `useGroupingJob` 의 카피 ("패턴 머지 카피의 첫 사례") — snapshot/item/done event 머지 + 종료 시 `['crawl','diningcode-registered']` 등 cache invalidate.
- `in-memory-singleton-gates` — `diningcodeBulkSaveRegistry` 추가 (8번째 인스턴스). `groupingJobRegistry` 와 동형이지만 per-actor **단일 잡** 정책 (다이닝코드 부담 의식). topics_connected 에 `canonical` 추가.

**No new concept this round:** canonical 의 "자동 매칭 후보 → 어드민 검토 큐 → 수동 확정" 패턴은 흥미롭지만 아직 한 도메인에만 존재 — 3+ 토픽에서 같은 모양이 반복될 때 컨셉화. 같은 패턴이 LLM 평가나 그룹 머지 큐로 번지면 그 때 추출.

**Notes:**
- canonical 토픽은 신규지만 cross-cutting 강도가 매우 높음 (friendly, api-contract, shared, web, crawl 5개 토픽이 자기 섹션에서 참조). 별도 토픽으로 분리한 이유는 (a) 충분한 양 — 14 zod + 9 훅 + matching lib + 2 service + 2 web component (b) 활발한 활동 — 한 라운드에 4개 마이그레이션 동반.
- `topics/crawl.md` 가 11 라우트 + 4 어댑터(Naver + 캐치테이블 + 다이닝코드 + Naver 검색 HTTP) + 2 잡 패턴(SSE 단일 + SSE 일괄)로 가장 큰 토픽으로 굳어짐. 다음 라운드에 캐치테이블이 더 늘면 별도 토픽 분리 후보.
- 다이닝코드 정식 페이지 + bulk save SSE 가 menu-grouping 패턴을 거의 그대로 카피한 점 — 두 컨셉(`stream-driven-cache-merge` / `in-memory-singleton-gates`) 의 적용 깊이가 커진 신호.

## 2026-05-14 (9th compile)

**Topics updated:** mobile, project-overview
**New topics:** none
**New concepts:** none
**Concepts updated:** none

**Sources scanned:** ~280
**Sources changed:** ~5 (4 commits since 8th compile)

**Knowledge file 추가/변경**:
- `CLAUDE.md` — "용어" 섹션 신설 (웹/앱/모바일 분리 규칙)
- `niney-life-pickr-v2-wiki/schema.md` — Terminology SSOT
- `TECH_STACK.md`, `README.md` — prose "모바일/mobile" → "앱/웹"
- `docs/mobile-analytics-screen.md` → `docs/app-analytics-screen.md` rename + 본문 정리
- `apps/mobile/metro.config.js` — platform-aware resolver + react/react-dom alias
- `apps/mobile/app.config.ts` — `web.output: 'static'` → `'single'`
- 루트 `package.json` — `dev:ios` / `dev:android` 단축 스크립트

**Highlights**:

### 용어 규칙 — 웹 / 앱 / 모바일 의미 분리
한국어 "모바일" 단어가 `apps/web`의 작은 화면 / `apps/mobile`(Expo 앱) 둘 다를 가리켜 혼동되던 문제. 이번 컴파일부터 다음 규칙 적용:
- **웹** = `apps/web` / **앱** = `apps/mobile` 통합 (+ **iOS앱** / **Android앱** / **Expo Web** RN-Web 출력)
- **모바일** = **웹**의 작은 화면(반응형)만
- 식별자(슬러그·디렉터리·스크립트)는 `mobile`/`web` 그대로
SSOT: [schema.md Terminology](schema.md#terminology--웹--앱--모바일). 이번 회차에는 mobile/project-overview 두 토픽만 우선 적용. 나머지 토픽(web, shared, friendly 등)의 prose 는 다음 사실 변경이 일어날 때 함께 갱신.

### 앱 Metro — 플랫폼 확장자 우선 탐색 + 단일 React 사본
shared 패키지가 `Comp.tsx`(=`.web` 셔틀) + `Comp.native.tsx` + `Comp.web.tsx` quad 패턴인데, Metro 커스텀 resolver 가 `./Foo.js` → `.ts`/`.tsx` 만 시도해서 native 빌드에서도 셔틀(=`.web` 구현)이 픽돼 `<h1>` Invariant 같은 에러로 뜨던 버그. iOS/Android 면 `.ios.tsx` → `.native.tsx` → `.tsx` 순, web 이면 `.web.tsx` → `.tsx` 순으로 시도하도록 수정. 이게 곧 [platform-ui-split](concepts/platform-ui-split.md) quad 패턴의 작동 보장. 동시에 앱 의 `extraNodeModules` 로 react/react-dom 을 앱 로컬 사본으로 강제해 워크스페이스에 공존하는 React 18(앱) / React 19(웹·shared) 사본이 같은 번들에 섞이는 사고를 방지.

### Expo Web — SPA 모드 (`output: 'single'`)
`apps/mobile`의 RN-Web 빌드는 SPA. 정적 사전렌더(`'static'`)는 expo-router 가 Node 의 hoist 된 react-dom@19 로 앱이 번들한 React 18 element 를 렌더하다 `$$typeof` 불일치로 SSR 500 을 낸다. 앱 브라우저 미리보기 용도라 SSR/SEO 불요 → SPA 로 떨어뜨려 브라우저에서만 렌더. 정적 export 가 필요해지면 react/react-dom 을 워크스페이스 전역 단일 버전으로 정렬해야 함.

### 루트 `dev:ios` / `dev:android` 단축
`pnpm dev:mobile` → `turbo dev --filter=mobile` → `expo start` 인데, turbo 가 stdin 을 자식 프로세스로 패스스루하지 않아 `i`(iOS 시뮬레이터) / `a`(Android 에뮬레이터) 같은 expo CLI 인터랙티브 키가 안 먹는다. `pnpm dev:ios` / `pnpm dev:android` 는 turbo 우회: `pnpm --filter mobile ios` (= `expo start --ios`) 를 직접 실행해 시뮬레이터/에뮬레이터를 자동 기동. 기존 `dev:mobile` 도 그대로 — 웹/QR 같이 키 입력 안 받는 시나리오용.

---

## 2026-05-14 (8th compile)

**Topics updated:** web, project-overview
**New topics:** none
**New concepts:** none
**Concepts updated:** none (모바일 UX 패턴은 `web` 한 토픽에 닫혀 있어 3+ 토픽 연결 임계 미달 — `docs/mobile-public-restaurant-ux.md` 가 SSOT 역할)

**Sources scanned:** ~280
**Sources changed:** ~30 (24개 commit, 주로 `apps/web/src/` 하위)

**Knowledge file 추가**:
- `docs/mobile-public-restaurant-ux.md` — 공개 맛집 페이지 모바일 스크롤·sticky 패턴의 SSOT. 핵심 규칙 8조 + 함정 사례 + 파일 매핑. project-overview Key Decisions "모바일 UX 규율" 섹션에 흡수.

**Highlights**:

### 모바일 UX 규율 — 프로젝트 단위 정책으로 격상
공개 `/restaurants` + 어드민 `/admin/discover` 두 페이지에 동일 패턴 적용. SSOT: `docs/mobile-public-restaurant-ux.md`. 8조:

1. **모바일 = body 스크롤** — `fixed inset-0` 풀스크린 모달 금지. URL bar collapse 가 동작하려면 document/window 자체가 스크롤되어야 한다. 상세 화면은 라우트 분리로 자연 페이지화.
2. **sticky element wrapping 금지** — wrapping div 가 containing block 트랩. 분기는 sticky element 자체 className 에서.
3. **sticky 묶음은 `overflow:auto` 컨테이너 밖에** — 안에 두면 자체 containing block 형성, 모바일에서 깨짐.
4. **`100vh` → `100dvh`** — iOS Safari dynamic viewport.
5. **탭은 URL 의 일부** — `?tab=menu` 푸시(replace 금지), 뒤로가기 1회 = 직전 탭.
6. **한글 IME** — `compositionStart/End` + 로컬 draft state. controlled `value={q}` 가 미완성 조합 덮어쓰는 "ㅇ으음" 회피.
7. **scroll-to-top 환경 자동 분기** — `scrollHeight > clientHeight + 1` 로 `scrollRef.scrollTo` vs `window.scrollTo` 결정.
8. **iOS Safari focus 자동 줌 차단** — `Input` 컴포넌트 `text-base sm:text-sm` + 전역 `@media (max-width:639px) { input,textarea,select { font-size: 16px; } }`.

### 공개 맛집 페이지 — 라우트 분리 + 모바일 body 스크롤
- `/restaurants` (layout) + `/restaurants/:placeId` (outlet) nested route. `RestaurantDetailRoute.tsx` 신규.
- 컨테이너 풀뷰포트 고정 해제 (`h-[calc(100vh-3.5rem)] overflow-hidden` 제거). 각 aside/section 은 `xl:sticky xl:top-14 xl:h-[calc(100dvh-3.5rem)]` 컬럼 패턴.
- 모바일 상세 진입 시 list/map/토글 hidden → outlet 만 노출 + 자체 sticky 헤더(식당명+탭).
- 모바일 `PublicTopBar` hidden (`hidden xl:flex` via `useMatch('/restaurants/:placeId')`).
- 탭 전환 `setSearchParams` push — 뒤로가기 1회 = 직전 탭.
- 카테고리 칩 모바일 가로 스크롤, 검색 인풋 한글 IME 대응, 재검색 버튼 상단 중앙 (지도 앱 표준).

### 어드민 발견 페이지 — 동일 패턴 미러링
- 단일 페이지 + `?placeId=` 쿼리. 컨테이너 모바일에서 자연 흐름, xl+ 만 풀뷰포트 고정.
- `DiscoverPanel` 내부 `h-full` / `overflow-y-auto` → `xl:` 분기.
- 모바일 패널 모드 = body 스크롤, 지도 모드 = `fixed` 풀스크린, 상세 모드 = 자연 흐름.
- `AdminTopBar`: `/admin/discover` + 모바일 + `?placeId` 있으면 `hidden xl:flex`.
- 모바일 토글 + sticky 크롤바 (`sticky bottom-0 z-20`). selection > 0 시 토글이 `bottom-20` 자동 상승해 겹침 회피.

### 관리자 페이지 전반
- `AdminLayout`: `<md` fixed 드로어 + backdrop, `md+` sticky aside.
- `AdminTopBar`: `md:hidden` 햄버거, "일반 화면으로" 사이드바에서 TopBar 우측으로 이전.
- 컨테이너 패딩 통일 `px-4 py-6 sm:px-6 sm:py-10` (6개 페이지).
- `AdminAnalyticsPage` 8컬럼 테이블 `min-w-[760px]` (가로 스크롤 의도화).

### Card 컴포넌트 글로벌 모바일 패딩
- `p-6` → `p-4 sm:p-6` (Header/Content/Footer). 콘텐츠 가용 폭 ~12% 회수.

### 리뷰 카드 LLM 분석 풀 노출
- `analysis.menus` (메뉴별 sentiment + traits) + `analysis.tips` 노출 — 데이터에 있던 정보가 UI 에 안 보이던 거.
- menus: 메뉴별 한 줄 + 좌측 sentiment-color stripe + traits 점 구분.
- tips: muted 박스 + 💡 amber 아이콘.
- keywords: 기존 칩 유지.
- 이미지 `size-16` → `h-56 sm:h-64` 가로 스냅 캐러셀, slice(0,6) 제거, 클릭 → Lightbox.
- `Lightbox` 재구성: 네이티브 scroll-snap 캐러셀 — 모바일 손가락 스와이프(브라우저 momentum/snap), 데스크톱 chevron `hidden sm:inline-flex`, 키보드 화살표 유지.
- `SatisfactionChip`: 헤더 작성자 옆 sentiment 색 도트 + 환산 점수. 카드 자체는 균일 중립 border — 시각화를 칩 한 곳으로 집중.

### iOS Safari focus 자동 줌 차단
- `Input` 컴포넌트 + global.css `@media (max-width:639px)` 두 레이어. raw textarea/select 인라인 사용처(다수) 글로벌 룰로 한 번에 커버.

**Sources 신규**:
- `docs/mobile-public-restaurant-ux.md`
- `apps/web/src/routes/RestaurantDetailRoute.tsx` (NEW)
- `apps/web/src/components/restaurant/detail/Lightbox.tsx` (rewritten)
- `apps/web/src/components/ui/card.tsx`, `input.tsx`
- `apps/web/src/styles/global.css`
- `apps/web/vite.config.ts`

---

## 2026-05-09 (7th compile, follow-up)

**Topics updated:** crawl, friendly, api-contract, shared, web, map, project-overview
**New topics:** none
**New concepts:** none
**Concepts updated:**
- `in-memory-singleton-gates` — actor rate-limit 제거 인스턴스 추가 (학습 케이스 — 윈도우 기반 rate-limit 은 다중 시작 패턴과 충돌. 게이트가 dedup + max_concurrent 두 layer 로 충분하면 윈도우는 빼라). What This Means 6번째 항목 신규.
- `public-admin-route-split` — 페어 경계 흐림 첫 사례 (어드민 발견 페이지가 공개 hook `useRestaurantsPublic` + `PublicRestaurantDetail` 컴포넌트를 차용 — 어드민 응답 셋이 좌표를 노출 안 해서). What This Means 보강.
- `zod-ssot-buildless` — 검색 스키마 페어 추가 (`NaverSearchResult`/`CrawlSearchQuery`/`CrawlSearchResult` + `Routes.Crawl.search`). `source: z.enum(['playwright'])` 어댑터 fallback 노출 enum.

**Sources scanned:** ~276 (직전 270 + 6 신규)
**Sources changed:** ~18 (신규 6 + 변경 12 — commit 56c5615 + ed041fb)

**Highlights:**
- **신규 어드민 발견 페이지** (`/admin/discover`) — 어드민 사이드바에 "맛집 발견" (Compass 아이콘) 메뉴 추가, 7개 메뉴로 확장. 풀블리드 vworld 지도 + 우측(또는 좌측) 패널. 패널 = [검색결과 / 등록맛집] 두 탭 + 검색바 (디바운스 300ms + Enter 즉시).
- **Playwright 기반 네이버 PC 지도 검색** — `naver-search.playwright.adapter.ts` 신규. `https://map.naver.com/p/search/{q}` 헤드리스로 띄우고 첫 `/p/api/search/allSearch` 응답 가로채는 방식. **직접 fetch 는 ncaptcha 봇 보호로 차단** — 페이지 자체의 captcha 토큰 + 세션 쿠키를 활용해야만 정상 응답. 검색당 ~1.1초.
- **검색·등록 통합 마커** — 검색 결과 = 빨강 (`MapMarker.variant: 'primary'`), 등록 = 회색 (`'muted'`). 같은 placeId 가 양쪽에 있으면 등록 우선해 중복 크롤 방지.
- **다중 선택 일괄 크롤링** — 검색 결과 행 체크박스(등록 항목은 비활성+[등록됨] 배지). [N개 크롤링] sticky 바 → 직렬 await 호출. 시작 거부된 placeId 는 체크 상태로 남겨 재시도 편의.
- **actor 단위 rate-limit 완전 제거** — `RATE_LIMIT_WINDOW_MS` 상수 + `lastCallByActor: Map` + 검사 블록 모두 삭제. 어드민 발견의 정상 사용이 다중 시작이라 어떤 윈도우(1초 → 50ms 시도) 길이도 둘째부터 차단되어 1개만 통과되던 버그. spam 방어는 in-flight dedup(`findInFlightByPlace`) + `MAX_CONCURRENT_PER_ACTOR=3` + FIFO 큐 두 layer 로 충분. `error: 'rate_limited'` enum 은 backward-compat 으로 잔존하지만 emit 안 됨.
- **패널 좌/우 토글** — `panelPrefsStore` (Zustand + localStorage `lp:panelPrefs`). PanelKey = `'admin.discover' | 'public.restaurants'` 페이지별 namespace. `usePanelSide(key)` selector hook. xl+ 한정 ⇄ 토글 버튼. 어드민 발견(default `right`) + 공개 맛집(default `left`) 양쪽 적용. 컨테이너 `flex-row-reverse` + aside `border-l` ↔ `border-r` swap.
- **MapCanvas variant + ResizeObserver** — `MapMarker.variant?: 'primary' | 'muted'` 색 분기 (회색 핀 `#94a3b8`/`#64748b`). ResizeObserver 자동 reflow — 좌/우 패널 토글, 윈도우 리사이즈, 슬라이드오버 등 모든 사이즈 변경 케이스 한 곳에서 처리.
- **상세는 별도 column** — 처음엔 패널 안 absolute 슬라이드였으나 사용자 요청으로 list/detail/map 3-column 으로 변경. `PublicRestaurantDetail` 그대로 재사용 — 어드민 발견 전용 상세 컴포넌트 별도 X (페어 경계 흐림 첫 사례).
- **검색 라우트 + 스키마** — GET `/api/v1/admin/crawl/search?q=&bbox=`. `CrawlSearchResult.source` enum (`'playwright'`) — 추후 비공식 fallback 가능성을 enum 으로 한 곳에 기록.

**Suggested for next round:** 검색 결과 페이지네이션 (네이버 첫 페이지 ~20개 한도), bbox 검색 영역 한정 (현재 어댑터 무시 — page.goto URL 에 `searchCoord`/`boundary` 추가하면 가능), 검색 결과 마커 클러스터링, 어드민 발견의 모바일/태블릿 패턴 (현재 xl 미만 패널만 풀블리드), tailwindcss-animate 도입 (`animate-in slide-in-from-right-4` 가 미설치 시 슬라이드 효과 미작동).

## 2026-05-09 (6th compile)

**Topics updated:** friendly, api-contract, shared, web, project-overview
**New topics:** map
**New concepts:** public-admin-route-split
**Concepts updated:**
- `zod-ssot-buildless` — `topics_connected` 에 `map` 추가. 새 인스턴스 한 줄 추가 — `schemas/settings-map.ts` 4종 + 공개 맛집 페어 6종 (`RestaurantPublicListQuery/Item/Result`, `PublicReviewAnalysis`, `PublicVisitorReview`, `RestaurantPublicDetail`) 이 같은 SSOT 모델로 흡수, 신규 토픽이 늘어도 컨슈머 4-5개가 컴파일 타임 동기화. 두 라운드 연속 깨지지 않음.

**Sources scanned:** ~270 (직전 245 + apps/web public components 6개 + apps/web admin settings 2개 + ImgWithFallback + lib/vworld + 신규 친구 settings 모듈 3개 + api-contract 신규 6 zod + shared 신규 4훅 + Prisma migration 1개 + index.html + tailwind.css)
**Sources changed:** ~45 (커밋 8e62270 · 129e696 · 966979c · d1ca1df · ffd27cb · f83fe10 · 04af127 · 974de88)

**Highlights:**
- **공개 사용자 페이지 도입** — 이전엔 어드민 위주 SPA + 루트 랭킹 페이지 정도였지만, 이제 본격 공개 영역 확장: `/restaurants` 풀 뷰포트 (xl+ 3-column 목록/상세/지도, xl- 토글) + 5탭 상세 패널 (홈/메뉴/리뷰/사진/정보) + 다중 마커 지도 + URL state 동기화 (`?q=&category=&sort=&bbox=&placeId=`).
- **신규 토픽 `map`** — vworld JS SDK 거부, OpenLayers (`ol@^10.7.0`) + WMTS XYZ 타일 직접. 도메인 화이트리스트 부담 회피. `MapProviderConfig` DB-backed 키 (env fallback 없음 — vworld 키는 1:1 운영자 자원). `MapCanvas` (저레벨, 다중 마커 + viewport 이벤트 + flyTo/fitToMarkers imperative API) + `VWorldMap` (어드민 단일 마커 thin wrapper) + `PublicRestaurantsMap` (공개 다중 마커 + "이 지역에서 재검색"). 어드민 `/admin/settings/map` 등록 UI + 공개 페이지가 같은 키 사용 (admin secret 과 보안 등급 동등 — WMTS 키는 클라사이드 자원).
- **신규 컨셉 `public-admin-route-split`** — 공개/어드민 같은 데이터에 가드만 토글하지 않고 라우트·스키마·훅을 페어로 분리. `Routes.Restaurant.publicList` ↔ `Routes.Restaurant.list`, `RestaurantPublicListItem` ↔ `RestaurantListItem`, `useRestaurantsPublic` ↔ `useRestaurantList`. 어드민 회귀 위험 0, 운영 메타 (`status`/`errorCode`/`model`) 의도적 제거, 캐싱 정책 분리. 5 토픽에 일관 등장 (friendly + api-contract + shared + web + map + project-overview).
- **friendly settings 모듈 신규** — `MapSettingsService` (LlmProviderConfig 패턴이지만 모델/동시성/env fallback 없음). admin 4 라우트 + 공개 1 라우트 (`/api/v1/settings/map/public`). 9 tests.
- **friendly restaurant 공개 라우트 3개** — `getPublicList` (snapshotJson 메모리 파싱 → bbox 필터 → 그 이후 ids 만 분석 집계), `getPublicDetail` (done 행만 평탄화한 `PublicReviewAnalysis`, 운영 메타 제거), `getInsights` (가드만 빠짐). 11 새 테스트.
- **공개 zod 페어 6종** — `RestaurantPublicListQuery/Item/Result`, `PublicReviewAnalysis`, `PublicVisitorReview`, `RestaurantPublicDetail`. bbox 는 string + regex (4개 숫자 콤마 구분 — query string 친화). mixed sentiment 카운트 분포 4범주 → 3범주 (라이트한 UI 표면).
- **공개 훅 4개** — `useRestaurantsPublic` (placeholderData prev, staleTime 30s), `useRestaurantPublic`, `useRestaurantPublicInsights`, `useMapPublicConfig` (404 OK + retry: false + staleTime Infinity).
- **5탭 상세 패널** — `apps/web/src/components/restaurant/detail/` 디렉토리. root + HomeTab + MenuTab + ReviewsTab + PhotosTab + InfoTab + Lightbox + shared. 데이터 fetch 1회, 탭 전환은 컨텐츠만. **placeId 변경 시 자동 'home' 탭 reset**. 명명 정리 라운드 — 처음 단일 파일이었다가 `panel/` 분해, 다시 `detail/` 로 명명 정리 ("목록 패널" 좌측 vs "상세 패널" 가운데 구분 명료화).
- **`ImgWithFallback` 공용화** — 어드민 로컬 → `~/components/`. `referrerPolicy="no-referrer"` (네이버 CDN hotlink 차단 회피) + onError fallback + src 변경 시 failed 자동 reset (캐러셀 edge case).
- **Pretendard + 텍스트 시프트** — Pretendard Variable 동적 서브셋 jsDelivr CDN, `font-pretendard` 유틸 PublicLayout 한정. Tailwind v4 `@theme inline` 의 `--text-*` 변수를 한 단계 시프트 (12→13/14→15/16→17/18→19/20→22/24→26/30→32) — spacing/icon 그대로, 사이트 전체 본문 가독성 ↑.
- **어드민 `/admin/settings` 통합** — 옛 `/admin/ai-keys` → `/admin/settings/ai-keys` 자동 redirect (북마크 호환). NavLink 탭 (AI 키 / 지도). 사이드바 "AI 키" → "설정". `AdminMapKeysPage` 신규 — provider 카드 + 연결 테스트 (probeVworldKey).
- **어드민 식당 상세 vworld 사이드바** — xl+ 우측 sticky 위치 카드 + Maximize2 → Radix Dialog 우측 슬라이드오버 풀 높이 지도 (별도 VWorldMap 두 인스턴스, `setTarget` 라이프사이클 부담 회피).
- **Prisma 신규 테이블 `MapProviderConfig`** + 마이그레이션 `20260508173216_add_map_provider_configs`.

**Suggested for next round:** 마커 클러스터링 (식당 수 100+ 대비), 거리순 정렬 (사용자 위치 옵션), 공개 list q LIKE 인덱싱 시점 (식당 1k+), 공개 사용자 인증 도입 시 (즐겨찾기/평가) 라우트 페어 정책 재평가.

---

## 2026-05-09 (5th compile)

**Topics updated:** friendly, ai, api-contract, web, mobile, shared, project-overview
**New topics:** menu-grouping, analytics
**New concepts:** versioned-llm-prompts
**Concepts updated:**
- `in-memory-singleton-gates` — `groupingJobRegistry` (multi-job + actorId 격리 + per-job AbortController + TTL 10분), `globalMergeJobRegistry` (single-job inflight 가드 + 409 with snapshot + chunk publish) 추가. 6개 인스턴스로 패턴 굳어짐.
- `sse-token-auth` — `Routes.Analytics.groupingJobEvents`, `Routes.Analytics.globalMergeJobEvents` 두 신규 SSE 엔드포인트 추가. 5개/6개 인스턴스로 "오래 걸리는 잡 = SSE 스트림"이 일급 패턴으로 정착.
- `stream-driven-cache-merge` — `useGroupingJob` (snapshot/item/done 머지 + ranking·status invalidate), `useGlobalMergeJob` (snapshot/chunk/done + overview·global-menus invalidate) 추가. 흥미로운 변형: 잡 단위 훅은 `summarySseManager` 같은 공유 매니저 없이 hook 안에서 EventSource 라이프사이클 직접 관리.
- `zod-ssot-buildless` — `schemas/menu-grouping.ts` + `schemas/analytics.ts` 모듈 추가. **첫 z.lazy 재귀 (`CategoryTreeNode`)** + SSE event payload 를 discriminated union 없이 개별 스키마로 둠. 확장 마찰 없이 흡수.

**Sources scanned:** ~245 (직전 205 + analytics 모듈 4 + menu-grouping 모듈 5 + 4 마이그레이션 + 신규 admin 페이지 + 신규 mobile 화면 3 + 신규 shared API/훅 4 + api-contract 신규 스키마 2 + 신규 docs 1)
**Sources changed:** ~37 (커밋 596f5bc · 2856686 · 249b9f6 · 738b000 · d1cfe2c)

**Highlights:**
- 신규 도메인 `analytics`: 식당 가로지르기 글로벌 메뉴 머지 (두-패스 LLM, full/incremental 모드, 단일-잡 inflight 가드 + 409 snapshot 응답). `categoryPath` 단일 컬럼으로 계층 분류 — 별도 트리 테이블 없이 prefix-LIKE + 메모리 빌더(`getCategoryTree`). `normalizeCategoryPath` 가 다양한 구분자 / 화이트리스트 외 segment 에 "기타" prepend.
- 신규 도메인 `menu-grouping`: 식당당 1회 LLM 호출로 메뉴 표기 변형 정규화 (chunk 80, 단일 청크 압도적). 두 진입점 — 단일 동기 + batch SSE. fallback to nameNorm 으로 즉시 동작 + `unmappedMenus` 배열로 미분류 노출 → UI 분류 버튼.
- 분석 파이프라인 3단계 정리: 리뷰 분석(summary v4, traits + sentiment 강제) → 식당별 그룹핑(MENU_GROUPING_VERSION) → 전역 머지(GLOBAL_MERGE_VERSION + categoryPath).
- 5개 신규 Prisma 테이블 (`menu_mentions`, `review_tags`, `menu_canonicals`, `global_menu_canonicals`, `global_menu_canonical_links`) + 4개 마이그레이션.
- **신규 컨셉 `versioned-llm-prompts`**: 도메인별 `*_VERSION` 상수 + DB 컬럼 + UI stale 배지 + 수동 재실행. summary(자동 큐잉) vs grouping/global-merge(명시 트리거) — 비용 기반 다이얼 차이.
- web admin 신규 페이지 "AI 분석 관리" — 4 섹션 (카운터 / 전역 머지 SSE / 카테고리 트리 / 전역 메뉴 통계 검색·필터). `?menu=`/`?category=` URL 동기화는 useEffect 회피 (single source of truth = useSearchParams).
- 식당 상세에 `MenuRankingSection` + `GlobalCompareBadge` (이 식당 vs 전체 평균, ±5%p 트렌드, "전체 보기" deep-link).
- mobile 맛집 탭(ADMIN gated) + 식당 상세 라우트 + `MenuRankingCard` (분류 버튼·정렬·SentimentBar·글로벌 비교 라벨).
- `restaurant.getInsights.topMenus` 가 menusJson 파싱 → MenuMention + MenuCanonical JOIN 으로 갈아탐.
- `extractFirstJsonObject` 가 summary → menu-grouping/analytics 로 cross-module export. 도메인별 prompts 모듈에 차이는 system prompt + JSON schema + chunk size 만.

**Suggested for next round:** mobile 글로벌 통계 화면(현재 식당별만), categoryPath 의 카테고리별 비교 위젯 ("이 식당의 찌개류 vs 평균"), "전역 stats lru-cache 60s" 도입 시점.

---

## 2026-05-08 (4th compile)

**Topics updated:** crawl, friendly, ai, api-contract, web, shared, utils
**New topics:** none (`summary` 모듈은 활동량이 크지만 friendly 내부로 유지 — 다음 라운드에서 재평가)
**New concepts:** none
**Concepts updated:**
- `stream-driven-cache-merge` — `VisitorReview.videos` SSE 머지 인스턴스, ReviewSummary 구조화 분석 필드 머지 인스턴스 추가 (페이로드만 풍부해지고 머지 인프라는 동일)
- `in-memory-singleton-gates` — placeId별 summary run 직렬화(Promise 체인), Ollama 429 슬롯-보유 백오프 인스턴스 추가
**Sources scanned:** ~205 (직전 178개 + media 모듈 신규 + summary 분석 필드 + thumbnail 헬퍼 + 비디오 스키마 + 웹 모달/뱃지/정렬)
**Sources changed:** ~30 (커밋 eafe74b · cbc1595 · d8e08d7 · d9b331a · 620ed6f · 399e088 · ad51c07 · 05e12e2)
**Highlights:**
- friendly에 첫 media 모듈(`/api/v1/media/thumbnail` — Naver CDN 호스트 allowlist + sharp 리사이즈 + 디스크 캐시 + ETag/304)
- crawl: 방문자 리뷰 최신순 + SSR 초기 24건 즉시 영속, VisitorReviewMedia 정확 매칭(이미지 다중 수집 회복), `type==='video'` 분리해 `videos[{posterUrl, videoUrl}]`로 추출, 수집 개수 상한 제거
- summary: 구조화 분석(sentiment/satisfaction/menus/tips/keywords) + Ollama JSON Schema/`num_ctx`/`num_predict` 명시 + 균형괄호 JSON 파서 + reasoning `<think>` 제거
- summary 직렬화·자동 재시도(3회+백오프) + Ollama 429 슬롯-보유 백오프(200·400·800ms+jitter)
- web: 비디오 타일(▶ 오버레이) + 인라인 `VideoPlayerModal`(ESC/배경 닫기, body scroll lock); 감정 뱃지·메뉴 칩·만족도/긍정/부정비율 정렬 dropdown; visitedAt YY.M.D 정렬 버그 수정(visitedSortKey)

## 2026-05-07 (3rd compile)

**Topics updated:** crawl, friendly, web, shared, api-contract
**New topics:** none
**New concepts:** stream-driven-cache-merge, in-memory-singleton-gates
**Concepts updated:** sse-token-auth (멀티플렉싱 endpoint instance 추가)
**Sources scanned:** ~178 (이전 145개 + restaurant/summary 모듈 + ActiveJobPanel/sections + summarySseManager + activeCrawlJobStore + 테스트 + 마이그레이션)
**Sources changed:** ~30 (커밋 337d343, 60c2cd2, 51cf54d, ab5f2fa, 0e926c2, 31efdd5, cd81583, b6185b5의 변경 파일)
**Notes:** 맛집 도메인 통합 (DB 영속화 + 다중 크롤 + AI 요약 + SSE 멀티플렉싱)을 incremental로 흡수. 5개 토픽이 영향받음. project-overview / mobile / ai / utils / config는 변경 없음. 신규 컨셉 두 개는 모두 4토픽 이상에 걸쳐 일관되게 등장 — `stream-driven-cache-merge`는 visitor_batch.persistedReviews + summary review/snapshot 이벤트가 모두 같은 "완성된 페이로드 → setQueryData" 모양, `in-memory-singleton-gates`는 ai의 `adapter-cache` + crawl의 JobRegistry+pending 큐 + persistTail Promise 체인 + 클라의 `summarySseManager`가 모두 "외부 큐 없이 모듈 싱글턴 + FIFO" 모양. 토픽별 article 분량은 crawl 134, friendly 191, web 312, shared 215, api-contract 309 lines.

## 2026-05-07 (2nd compile)

**Topics updated:** ai (new), friendly, api-contract, shared, web
**New topics:** ai
**New concepts:** workspace-package-resolution
**Concepts updated:** zod-ssot-buildless (ai instance 추가)
**Sources scanned:** ~145 (이전 126개 + AI 모듈 신규 ~19개)
**Sources changed:** ~25 (AI 통합 커밋 `6fb1515`의 변경 파일 + 마이그레이션 1개)
**Notes:** AI 도메인 추가에 따른 incremental 재컴파일. `ai` 토픽은 `crawl`과 동일한 기준으로 friendly에서 분리(독립 모듈, 8개 src 파일 + 4개 schema/migration). `workspace-package-resolution` 컨셉은 작업 도중 반복적으로 부닥친 `Routes.Ai` namespace 깨짐 + pnpm symlink/inject 함정 + vite extensionAlias 필요성을 cross-cutting 패턴으로 묶은 결과. project-overview/mobile/utils/config/crawl 토픽은 변경 없음.

## 2026-05-07 (initial compile)

**Topics updated:** project-overview, friendly, crawl, web, mobile, api-contract, shared, utils, config
**New topics:** project-overview, friendly, crawl, web, mobile, api-contract, shared, utils, config (initial compile)
**New concepts:** zod-ssot-buildless, sse-token-auth, platform-ui-split
**Sources scanned:** 126 (knowledge files + key source files per topic; deep_scan=false but adapter modules were read where needed for accurate Architecture/API Surface)
**Sources changed:** 126 (first run — all sources are new)
**Notes:** 토픽별 분량 균형 — friendly + crawl + shared + web가 article 분량 상위, utils + config가 하위. crawl을 friendly에서 분리한 이유는 5개 src 파일 + 최근 5개 커밋 모두 crawl 관련이라 모듈 자체가 충분한 양을 차지하기 때문.
