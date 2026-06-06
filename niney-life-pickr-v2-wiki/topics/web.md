---
topic: web
last_compiled: 2026-06-06
sources_count: 98
status: active
aliases: [vite, react, web-app, frontend-web, admin-discover, admin-auto-discover, admin-diningcode, admin-catchtable, panel-side-toggle, batch-crawl, naver-search-results, panelPrefsStore, usePanelSide, mobile-ux, route-split, korean-ime, lightbox-snap, body-scroll-mobile, ios-zoom-fix, canonical-merge, merge-proposal-queue, sticky-action-bar, fused-detail, show-on-map-button, restaurants-v2, bottom-sheet, joblog-tab, restaurant-crawl-logs-section, summary-cancel-button, summary-resume-button, public-restaurant-list-split, location-based-first-entry, public-reviews-pagination, settlement, settlement-stepper, settlement-share, settlement-history, ContactsPage, ai-purpose, card-padding-fix, lightbox-dvh, map-zoom-label-toggle, settlement-rounds, N차, Step2Rounds, RoundDiscountEditor, RoundCategoryAdjuster, RoundExceptionsEditor, SettlementBreakdownTable, MultiReceiptSplitDialog, RestaurantSearchDialog, confirm-dialog, settlementPrefsStore, tailwind-dark-v4, single-field-participant, alias-toggle, multi-select-bulk-delete, ai-models-preview, z-30-sticky, breakdown-matrix, copy-attendances, 1차와동일, exclude-default-toggle, home-ranking-link, lightbox-portal, createPortal, sticky-stacking-context-trap, lightbox-backdrop-close, my-location-guide, geolocation-permission-change, insecure-context-http, code-splitting, route-lazy, AdminRoutes, manualChunks, codeSplitting-groups, vite8, rolldown, react-memo, interaction-hot-path, setQueryData-batch-merge, lightbox-promoted, eslint-web, react-compiler-lint, s-token-route, og-proxy, dark-mode-web, theme-store, lp-theme, MapLayerControl, midnight-layer, satellite-layer, vworld-dark, MyLocationButton, soft-tonal-variant, tonal-button, tonal-badge, detail-CategoryTree, insight-tip-filter, menu-filter, lightbox-thumbnail, card-borderless-tab, review-photo-fullwidth, card-click-flyto, card-doubleclick-zoom, flyToZoomIn, admin-scheduler-ui, ScheduleSection, cron-preset, schedule-sse, admin-category-tree-collapsed]
---

# web — Vite + React 웹 앱

**2026-06-06 변경 흡수 — 17차: 웹 다크 모드(localStorage 테마 스토어 + tailwind `@custom-variant dark` 명시 binding + vworld midnight/위성 레이어 토글) + soft tonal 색 variant(badge/button) + 분석 인터랙션(메뉴·방문팁 클릭 → 리뷰 필터, 메뉴 썸네일 → 라이트박스) + 상세 탭 카드 테두리 제거·리뷰 사진 풀폭(앱 통일) + 목록 카드 클릭=지도 이동/더블클릭=확대 + AdminAnalyticsPage 스케줄러 UI 통합.** (1) **다크 모드** — `lp:theme` localStorage 영속 [`useThemeStore`](../../apps/web/src/stores/theme.ts)(`light`/`dark` + `toggle`, `ThemeToggle` 가 `html.dark` 토글) + [tailwind.css](../../apps/web/src/styles/tailwind.css) 의 `@custom-variant dark` 명시 binding. vworld 지도가 테마를 따라 일반(`Base`)↔야간(`midnight`)으로 전환 + 좌하단 신규 [MapLayerControl.tsx](../../apps/web/src/components/restaurant/MapLayerControl.tsx)(일반/다크/위성 토글). 앱과는 디자인 토큰(@repo/shared)만 공유하고 저장소·구현은 분리([platform-ui-split](../concepts/platform-ui-split.md) 의 새 인스턴스). 지도 코어 상세는 [map](map.md). (2) **신규 컴포넌트** — `MapLayerControl`, [MyLocationButton.tsx](../../apps/web/src/components/restaurant/MyLocationButton.tsx)("내 위치" — 공개·어드민 발견 지도 공용, denied/insecure 구분 callout), [detail/CategoryTree.tsx](../../apps/web/src/components/restaurant/detail/CategoryTree.tsx)(식당별 메뉴 카테고리 트리). (3) **soft tonal variant** — [badge.tsx](../../apps/web/src/components/ui/badge.tsx)/[button.tsx](../../apps/web/src/components/ui/button.tsx) 에 blue/amber/violet/green/red/teal 6색 추가(무테두리+틴트배경, 토큰은 tailwind.css), 맛집·분석 어드민에 일괄 적용. (4) **분석 인터랙션** — 분석 탭 카테고리 트리 + 인기 메뉴/방문팁 클릭 → 해당 리뷰만 필터 + 메뉴 썸네일 탭 → 라이트박스. (5) **상세 탭 카드 테두리 제거 + 리뷰 사진 풀폭**(앱 통일). (6) **목록 카드 클릭=지도 fly-to / 더블클릭=확대**(`flyToZoomIn`) — 공개 + 어드민 발견 통일. (7) **AdminAnalyticsPage 스케줄러 UI** — cron preset/커스텀 + 다음 실행 preview + 지금 실행 + 이력 + live SSE(도메인은 [schedule](schedule.md)). 어드민 카테고리 트리 기본 접힘.

**2026-06-01 변경 흡수 — perf 라운드 (코드 스플리팅 + 핫패스 memo + 배치 setQueryData 머지) + Lightbox 공용화 + ESLint 인프라 연결.** (1) **라우트 코드 스플리팅** — [App.tsx](../../apps/web/src/App.tsx) 가 공개 진입(`/`, `/login`)과 셸(`PublicLayout`)만 메인 번들에 두고, 무거운 라우트(`RestaurantsPage`/`RestaurantsV2Page`/`RestaurantDetailRoute`/정산 5개 페이지/어드민 전체)를 `React.lazy` + 최상위 `<Suspense fallback={PageFallback}>` 로 분할. 어드민 16개 페이지 + OpenLayers(`ol`) 를 끌어오는 식당/정산 페이지가 메인 청크에서 빠져 익명 사용자가 받는 첫 청크가 대폭 작아진다. 어드민은 신규 [AdminRoutes.tsx](../../apps/web/src/routes/admin/AdminRoutes.tsx) 로 서브트리를 한 모듈로 묶어 단일 lazy 청크. [vite.config.ts](../../apps/web/vite.config.ts) 는 Vite 8 / Rolldown 의 `codeSplitting.groups` 로 vendor 청크 4개(`ol`/`react-vendor`/`query`/`radix`) 고정. (2) **interaction 핫패스 React.memo** — `PublicRestaurantCard` 가 `memo` 로 호버 시 80개 카드 통째 리렌더 차단, `AdminDiningcodePage` 의 `ResultCard` 가 `memo` + `toggleOne` 안정 `useCallback` 으로 체크박스/SSE 틱 시 해당 카드만 리렌더. (3) **크롤 배치 setQueryData 머지** — `AdminCrawlTestPage` 가 `visitor_batch` SSE 마다 `stream.lastPersistedBatch` 를 detail 캐시(`['restaurant', placeId]`)에 `setQueryData` 직접 머지(post-dedup 서버 id 그대로, 신규만 prepend) — 배치마다 리뷰 리스트 전체 re-GET 을 없앤다([stream-driven-cache-merge.md](../concepts/stream-driven-cache-merge.md) 의 새 인스턴스). (4) **Lightbox 공용화** — `components/restaurant/detail/Lightbox.tsx` → [components/Lightbox.tsx](../../apps/web/src/components/Lightbox.tsx) 로 승격(정산·상세 공용), `PhotosTab`/`shared.tsx` 가 `~/components/Lightbox` 로 import. portal/backdrop 닫기 동작은 아래 그대로. (5) **ESLint 연결** — 신규 [eslint.config.mjs](../../apps/web/eslint.config.mjs)(`@repo/config/eslint/react` flat config, React Compiler 진단 룰 warn) + `package.json` `lint` 스크립트 — `turbo lint` 합류(eslint ^10, vite ^8). (6) 다이닝코드 메뉴 컴포넌트의 Rules of Hooks 위반 수정.

**2026-05-31 변경 흡수 — 홈 랭킹 행 클릭 → 상세 진입 + 상세 리뷰 라이트박스 잘림(portal) / 바깥 클릭 닫기 + "내 위치" 버튼 권한·HTTP 막다른 길 해소.** (1) `HomePage` 의 `RankingRow` 가 `<Link to="/restaurants-v2/:placeId">` 로 감싸져 랭킹 한 줄을 누르면 신버전 맛집 레이아웃 상세로 진입 (Link 라 Cmd/Ctrl+클릭 새 탭·키보드 포커스 유지, hover 배경 강조). (2) 공개 맛집 상세 리뷰 라이트박스([components/Lightbox.tsx](../../apps/web/src/components/Lightbox.tsx) — 이번 라운드에 detail/ 에서 승격)가 `createPortal(…, document.body)` 로 빠졌다 — 데스크톱 상세는 `[리스트|상세|지도]` 3-컬럼이고 각 컬럼이 `position: sticky` 라 저마다 stacking context 를 만들어, `z-50` 이 상세 컬럼 안에서만 유효해 DOM 뒤의 지도 컬럼이 이미지 오른쪽을 덮어 잘렸다. body 로 빼면 컬럼 context 밖이라 전체 화면을 정상으로 덮는다. 더해 어두운 backdrop 클릭으로도 닫기 — `pointerdown` 좌표를 기록해 `click` 시 이동거리 10px 초과면 스와이프/드래그로 보고 닫지 않아(캐러셀 스와이프 끝의 click 으로 의도치 않게 닫히는 것 방지), 이미지·버튼 클릭도 제외. (3) `PublicRestaurantsMap` 의 "내 위치" 버튼([PublicRestaurantsMap.tsx](../../apps/web/src/components/restaurant/PublicRestaurantsMap.tsx))이 `denied`(권한 차단)와 `unavailable` 중 평문 HTTP(`insecure`)를 구분 — 둘 다 비활성 대신 클릭 시 해제 방법 callout 을 띄우고, denied 는 refetch 도 같이 걸어 사용자가 이미 설정을 풀어뒀으면 즉시 재시도(설정을 푸는 즉시 `useUserLocation` 의 permission `change` 구독이 자동 반영해 클릭조차 안 해도 버튼이 살아남). 손쓸 수 없는 진짜 미지원 `unavailable` 만 비활성 유지. 권한/HTTP 판정 로직 자체는 [shared.md](shared.md) 의 `useUserLocation`.

**2026-05-28 변경 흡수** — 정산 라우트가 **N차(차수) 모델**로 통째 리라이트:
`Step2Source.tsx`/`ParticipantEditDialog.tsx` 삭제 + `Step2Rounds.tsx` 신규 + 차수별
편집기(`RoundDiscountEditor`/`RoundExceptionsEditor`/`RoundCategoryAdjuster`) + 다중
영수증 분할 다이얼로그(`MultiReceiptSplitDialog`) + 식당 검색 다이얼로그
(`RestaurantSearchDialog`) + 정산표 매트릭스(`SettlementBreakdownTable`). Step1 은
단일 이름 필드 + 별칭 토글로 단순화 + Enter 로 다음 행 추가 + 새 행 기본 exclude
토글(`settlementPrefsStore` localStorage 영속). `useSettlementDraftAutoSync` /
`useSettlementDraftHydrate` 로 서버 임시저장 자동 동기화 — `/me/settlements` 상단에
"이어 입력" 행 추가. 결과/공유 헤더 z-index 10→30 (sticky 정산표 헤더와 충돌 fix) +
데스크톱 2-column 정산표 sticky. `confirm-dialog.tsx` 공용화로 인라인 `confirm()`/
`window.confirm` 점진 대체. Tailwind v4 dark variant 명시 binding
(`@custom-variant dark (&:where(.dark, .dark *))`) — `.dark` 클래스 토글 방식이라
v4 기본(미디어쿼리)으로는 안 됨. `AdminAiKeysPage` 모델 미리보기(`usePreviewModels`)
+ 모바일 카드 레이아웃 정돈. 추가: `/me/settlements/new` 라우트(식당 없이 독립
진입 — Step2 에서 1차 식당 검색 강제), `/restaurants/:placeId/settle/:id/edit`
(같은 SettlementNewPage 가 id 받으면 edit 모드).

**2026-05-25 변경** — 정산 라우트 15+ 파일 통째 신규 (`routes/settlement/`) +
라이트박스/지도/카드 패딩 UI 버그 3건 수정 + AI provider `purpose` (chat / image)
카드 분리. 정산 UI 패턴(4-step Stepper, Step1→Step3 점프, 공유 토큰 read-only,
참여자 수정 다이얼로그, 영수증 미리보기 JWT 우회) 만 web 토픽에서 다루고, 도메인
자체는 [settlement.md](settlement.md) 위임. `CardContent` 기본 `pt-0` 제거 + `Lightbox`
mount instant + dvh + slide w-full + `MapCanvas` declutter 해제 + 줌 14 라벨 토글.

**2026-05-19 변경** — 요약 운영 UI (중지/재개 + 7배지 + JobLogTab + RestaurantCrawlLogsSection) +
공개 맛집 v2 (`/restaurants-v2` + BottomSheet) + 위치 기반 첫 진입 + 공개 리뷰
페이지네이션 분리 + 공개 사이드바/탑바.

## Purpose [coverage: high — 6 sources]

`apps/web/`는 Life Pickr 서비스의 브라우저용 SPA다. 세 가지 사용 흐름을 한
번들 안에 담는다.

- **공개 사용자 화면** — 로그인 없이 누구나 접근 가능한 맛집 탐색 영역.
  - `/` HomePage — AI 분석된 리뷰의 긍정/부정 비율로 정렬한 식당 랭킹
  - `/restaurants` RestaurantsPage — 네이버 지도 패턴의 풀 뷰포트 검색 UI
  - `/login` LoginPage — 이메일 로그인 + 회원가입 + 게스트 진입
- **로그인 사용자 도구** — `RequireUser` 가드 (역할 무관).
  - `/restaurants/:placeId/settle/new|/:id|/:id/edit` — 정산 입력/결과/편집 (N차)
  - `/me/settlements`, `/me/settlements/new` — 정산 이력 + 식당 없이 독립 진입
  - `/me/contacts` — 단골 관리
  - `/share/settlements/:token` — 공유 토큰 read-only (인증 X, PublicLayout 밖)
- **어드민 콘솔** — `/admin/*`. 역할이 `ADMIN`인 계정만 접근.
  사용자/역할 + canonical 단위 맛집 관리(병합·분리·삭제) + 다이닝코드 정식
  크롤링 + 캐치테이블 / 다이닝코드 / 네이버 크롤링 테스트 + 맛집 발견
  (네이버 PC 지도 검색) + 맛집 자동 발견 (AI 키워드 → 그룹 직렬 크롤·등록)
  + AI 분석 관리 + LLM/지도 키 설정 (`usePreviewModels` 모델 미리보기).

`apps/mobile`(React Native)와 동일한 백엔드(`apps/friendly`)를 바라보며,
공통 도메인 로직은 `@repo/shared`에서 끌어 쓴다. 공개 페이지는 사용자
대상 — 디자인은 Pretendard + 네이버 지도 톤. 어드민은 운영 도구 — shadcn
디폴트 + system-ui.

## Architecture [coverage: high — 42 sources]

### 빌드 / 런타임

- **Vite 8 + Rolldown + `@vitejs/plugin-react`** — 정적 SPA 번들러. 번들러가
  esbuild/Rollup 에서 Rolldown 으로 — 객체형 `manualChunks` 대신
  `build.rollupOptions.output.codeSplitting.groups` 로 vendor 청크를 고정한다
  ([vite.config.ts](../../apps/web/vite.config.ts)).
- **React 19 + react-dom 19** — `createRoot`/`StrictMode`로 마운트.
- **TypeScript** (`@repo/config/tsconfig/react.json` 확장).
- 경로 별칭 `~/* → ./src/*`, extensions 우선 `.web.tsx`/`.web.ts`.
  `react`/`react-dom` 은 root `node_modules` 카피로 alias 강제 + `dedupe`
  (`react`/`react-dom`/`@tanstack/react-query`/`zustand`) — 워크스페이스 패키지가
  자기 카피를 끌어와 "Invalid hook call" 나는 걸 막는다.
- jsDelivr Pretendard variable + `lp:theme` localStorage FOUC 방지.
- **OpenLayers 10.9** — vworld JS SDK 대신 WMTS 직접. `ol` 은 식당/어드민 청크가
  공유하므로 codeSplitting 의 단일 `ol` vendor 청크로 모은다.
- **Tailwind v4** — `@custom-variant dark (&:where(.dark, .dark *))` 명시 binding
  ([tailwind.css](../../apps/web/src/styles/tailwind.css)). 이 한 줄이 없으면 v4
  기본(미디어쿼리 `prefers-color-scheme`)이 발동해 `.dark` 클래스 토글 방식과
  엇갈리고 `dark:bg-*` 같은 모든 utility 가 시스템 다크 사용자한테만 작동한다.
- **ESLint flat config** — [eslint.config.mjs](../../apps/web/eslint.config.mjs) 가
  `@repo/config/eslint/react` 를 펼치고 React Compiler 진단 룰(`set-state-in-effect`/
  `rules-of-hooks`/`purity` 등)을 `warn` 으로 도입. web 은 Vite babel 에 React
  Compiler 를 켜지 않았지만, 룰은 "메모이즈 가능한 코드인지"를 보는 것이라 품질·향후
  도입 대비로 유효(`config.md` 의 base 와 한 묶음). `**/*.js`(tsc stale 산출물) 는
  대상 제외. `pnpm --filter web lint` = `eslint .` 가 `turbo lint` 에 합류.

### 코드 스플리팅 — 라우트 lazy + vendor 청크 [신규 — perf]

[App.tsx](../../apps/web/src/App.tsx) 가 첫 로드 바이트를 줄이는 코드 스플리팅의
중심. 메인 번들에는 공개 진입(`/` `HomePage`, `/login` `LoginPage`)과 셸
(`PublicLayout`)만 남기고 나머지는 모두 `React.lazy`:

- `RestaurantsPage` / `RestaurantsV2Page` / `RestaurantDetailRoute` — `ol`(지도)을
  끌어오는 무거운 식당 페이지.
- 정산 5개 — `SettlementHistoryPage` / `ContactsPage` / `SettlementNewPage` /
  `SettlementResultPage` / `SharedSettlementPage`.
- 어드민 전체 — `lazy(() => import('./routes/admin/AdminRoutes'))` 단일 청크.

최상위 `<Suspense fallback={<PageFallback/>}>`(중앙 스피너 — 페이지 자체 로딩
상태와 같은 모양이라 청크 로드→데이터 로드 전환 시 화면이 안 튄다)로 감싼다.
nested 상세(`/restaurants/:placeId`)는 부모 페이지가 `<Outlet>` 을 *자체*
`<Suspense>` 로 감싸 목록을 깜빡이지 않고 상세 패널만 로딩 표시한다
([RestaurantsPage.tsx](../../apps/web/src/routes/RestaurantsPage.tsx),
[RestaurantsV2Page.tsx](../../apps/web/src/routes/RestaurantsV2Page.tsx)).

[AdminRoutes.tsx](../../apps/web/src/routes/admin/AdminRoutes.tsx) [신규] — 어드민
16개 페이지 + `AdminLayout` 을 한 모듈로 모아 App 에서 1회만 lazy import. App 에
`path="/admin/*"` 로 마운트되므로 내부 라우트는 모두 `/admin` 기준 상대 경로
(`index === /admin`, `discover`/`auto-discover`/`restaurants`/`crawl-test`/
`catchtable-test`/`diningcode`/`diningcode-test`/`analytics`/`ai-test`/`settings`).
`Navigate` target 만 절대 경로 유지(옛 북마크 호환 — `ai-keys` → `settings/ai-keys`).

vendor 청크는 [vite.config.ts](../../apps/web/vite.config.ts) 의
`codeSplitting.groups` 4개로 고정 — `ol`(지도), `react-vendor`(react/react-dom/
react-router/scheduler), `query`(@tanstack), `radix`(@radix-ui). 자동 분할 위에
vendor 만 추가로 묶어, 앱 코드만 바뀌어도 벤더 캐시가 유지된다.

### 라우팅

`react-router-dom` v7을 `BrowserRouter`로 사용한다
([App.tsx](../../apps/web/src/App.tsx)). 셸은 두 갈래로 분기. 식당/정산/어드민
요소는 모두 `React.lazy`(위 코드 스플리팅 참조).

| Path | Element | Wrapper |
| --- | --- | --- |
| `/` | `HomePage` | `PublicLayout` |
| `/restaurants` | `RestaurantsPage` (Outlet 포함, lazy) | `PublicLayout` |
| `/restaurants/:placeId` | `RestaurantDetailRoute` → `PublicRestaurantDetail` (lazy) | ↑ (nested, 자체 Suspense) |
| `/restaurants-v2/:placeId?` | `RestaurantsV2Page` (Outlet, BottomSheet, lazy) | `PublicLayout` |
| `/me/settlements` | `SettlementHistoryPage` (lazy) | `PublicLayout` + `RequireUser` |
| `/me/contacts` | `ContactsPage` (단골 관리, lazy) | `PublicLayout` + `RequireUser` |
| `/restaurants/:placeId/settle/new` | `SettlementNewPage` (4-step, N차, lazy) | `RequireUser` (단독) |
| **`/me/settlements/new`** | `SettlementNewPage` (식당 없이 진입) | `RequireUser` (단독) |
| `/restaurants/:placeId/settle/:id` | `SettlementResultPage` (저장 후 보기, lazy) | `RequireUser` (단독) |
| **`/restaurants/:placeId/settle/:id/edit`** | `SettlementNewPage` (edit 모드) | `RequireUser` (단독) |
| **`/s/:token`** | `SharedSettlementPage` (read-only, lazy) | (단독, 인증 X) |
| `/login` | `LoginPage` | (단독) |
| `/admin/*` | `AdminRoutes` (16 라우트 단일 lazy 청크) | `RequireAdmin` |

`RequireUser` 는 token 만 보고 role 검사 X (정산은 USER 도 사용). `RequireAdmin` 은
역할까지 검증. 두 가드 모두 [App.tsx](../../apps/web/src/App.tsx) 안에 정의.

> **공유 토큰 SPA 경로가 `/share/settlements/:token` → `/s/:token` 으로 짧아졌다.**
> `/share/settlements/*` 는 이제 SPA 라우트가 아니라 **OG 미리보기 / 정산표 PNG**
> (Fastify 가 서버 렌더) 경로다 — dev 에서 [vite.config.ts](../../apps/web/vite.config.ts)
> 가 `/share/settlements` 를 백엔드(`:3000`)로 프록시하고, prod 는 nginx 가 동일
> prefix 를 Fastify 로 보낸다. 카카오톡 등에 링크를 붙이면 그 OG HTML 의 `og:image`
> 가 PNG 카드를 띄우고, 사람이 클릭하면 그 안의 링크가 `/s/:token` SPA 로 보낸다.
> 정산 공유 OG 렌더의 서버 쪽은 [settlement.md](settlement.md), [friendly.md](friendly.md).

`/me/settlements/new` 는 식당 없는 진입 — Step2 의 1차 차수 카드가 빈 식당으로
열려 사용자가 검색 다이얼로그로 직접 1차 식당을 고르게 한다.
`/restaurants/:placeId/settle/:id/edit` 는 같은 `SettlementNewPage` 가 `id` 가
있으면 edit 모드 — 저장된 세션을 fetch 해 draft 로 hydrate 후 4-step 진입.

### 정산 라우트 트리 [refactor — N차 모델로 리라이트]

`src/routes/settlement/` 가 차수(N차) 모델로 통째 리라이트. 한 정산 세션이
여러 차수(`rounds[]`)를 갖고, 각 차수가 자체 식당·source·discount·exceptions·
attendances 를 보관. web 토픽에서는 라우트 등록 + UI 패턴만 다루고, 도메인
(분배 규칙·서버 스키마·draftStore·`calculateMultiRoundShares`) 은
[settlement.md](settlement.md) 참조.

```
src/routes/settlement/
├── SettlementNewPage.tsx          # 4-step stepper 셸 (create/edit 분기 + draft hydrate)
├── Step1Participants.tsx          # 참여자 입력 (단일 필드 + 별칭 토글 + Enter 새 행)
├── Step2Rounds.tsx                # [NEW] 차수 카드 N개 — 식당/source/할인/제외/영수증
├── Step3Edit.tsx                  # 항목 편집 — 차수 탭으로 전환
├── Step4Review.tsx                # 분배 미리보기 + 저장 (fromDraftId 동시 정리)
├── SettlementResultPage.tsx       # 결과 — 좌(요약/차수별) + 우(sticky 정산표) 2-col
├── SettlementHistoryPage.tsx      # /me/settlements — 임시저장 + 완료 + 다중 삭제
├── SharedSettlementPage.tsx       # /share/settlements/:token — read-only (수정됨 배지)
├── ContactsPage.tsx               # /me/contacts — 단골 관리
├── ContactEditDialog.tsx          # 단골 한 명 편집
├── ContactPickerDialog.tsx        # 다중 선택 참여자 추가
├── ContactSuggestions.tsx         # 이름 입력 자동완성 드롭다운
├── RestaurantSearchDialog.tsx     # [NEW] 차수별 식당 선택 다이얼로그
├── MenuPickerDialog.tsx           # Step3 메뉴 추가 모달
├── MultiReceiptSplitDialog.tsx    # [NEW] 한 사진의 N개 영수증 분할 추출
├── RoundDiscountEditor.tsx        # [NEW] 차수별 할인 amount+category
├── RoundExceptionsEditor.tsx      # [NEW] 차수별 참여자 exclude override
├── RoundCategoryAdjuster.tsx      # [NEW] 분담 다듬기 — leftover 받을 사람 + 100/1000원 반올림
├── SettlementBreakdownTable.tsx   # [NEW] 참여자 × (차수×카테고리) 매트릭스
├── SettlementShareDialog.tsx      # 공유 토큰 생성/취소 + Copy/Web Share
└── SettlementCards.tsx            # 결과 페이지 공용 카드 — 차수별 + 수정됨 배지
```

삭제됨 (이전 컴파일에는 있었음):

- `Step2Source.tsx` — 직접 입력/영수증 단일 분기는 N차 모델에 흡수. 각
  차수 카드가 자체 source(MANUAL/RECEIPT) 를 갖는다.
- `ParticipantEditDialog.tsx` — 결과 페이지의 참여자 수정은 `/settle/:id/edit`
  진입(전체 4-step 재진입) 으로 통합. 인라인 다이얼로그 패턴 폐기.

### Step1Participants — 단일 필드 + 별칭 토글

이전: 이름 + 별명 두 칸 항상 노출. 지금: 기본 단일 "이름" 필드만,
같은 이름의 다른 사람을 구분하거나 단골에서 별칭이 같이 채워진 경우만
"+ 별칭" 으로 두 번째 칸 펼침. 95% 단순 케이스를 한 칸으로 끝낸다.

- Enter 로 다음 행 추가 + `nameRefs` Map 으로 새 행 input 에 focus 이동
  (`pendingFocusId` state + 다음 render 의 useEffect 가 ref 호출).
- 새 행의 기본 exclude (술/비주류/안주) 는
  [`settlementPrefsStore`](../../apps/web/src/stores/settlementPrefsStore.ts)
  가 localStorage 영속. 사용자가 매번 "비주류 제외" 토글하는 부담을 줄임.
  단골에서 추가하면 단골값이 우선이라 이 기본값은 무시.
- 자동완성 — 이름 input focus 시 `ContactSuggestions` 드롭다운 (해당 행
  하나만, `focusedClientId` 로 1개만 추적).

### Step2Rounds — 차수 카드 N개 [신규 — 핵심 UX]

[`Step2Rounds.tsx`](../../apps/web/src/routes/settlement/Step2Rounds.tsx) 가
이번 라운드의 중심 UX. 한 차수 = 한 카드, 카드 안에:

- **식당** — `RestaurantSearchDialog` 로 검색 후 선택. 식당 미선택이면 다른
  필드 비활성.
- **source 라디오** — MANUAL(직접 입력) / RECEIPT(영수증 사진). RECEIPT 선택
  시 사진 업로드 → 추출 → items prefill.
- **다중 영수증 분할** — 카드 외부 "한 사진에 영수증 N개" 버튼이 차수가
  2 개 이상이고 모든 차수에 식당이 잡혀 있을 때만 활성. `MultiReceiptSplitDialog`
  열림.
- **할인** — `RoundDiscountEditor` (amount + category, 단일).
- **제외 override** — `RoundExceptionsEditor` (마스터 exclude 와 별도, 차수별
  override).
- **참석자 토글** — 마스터 참여자 목록을 모두 노출, 체크박스로 차수별 참석
  결정. "1차와 동일" 버튼이 `copyRoundAttendancesFrom(round.clientId, '1차')`
  으로 1차 참석자 그대로 복사 — 4차 5차에서 같은 사람들이 계속 가는 경우 빠름.

차수 추가/삭제 + 최대 10차 enforced (zod schema). `+ 차수 추가` 가 식당 검색
다이얼로그를 먼저 띄우고 그 식당으로 새 차수 push.

게이팅: `rounds.length > 0 && rounds.every(r => r.source !== null)` 이면 다음
단계로. 한 차수라도 source 가 미정이면 Step3 진입 금지.

### Step3Edit — 차수 탭 + 항목 편집

[`Step3Edit.tsx`](../../apps/web/src/routes/settlement/Step3Edit.tsx) — 차수가
여러 개면 상단 sticky 탭으로 전환. 차수별로 기존 단일 차수 편집기와 같은
UI (`amount` × `name` × `category` × 삭제). `RoundDiscountEditor` 가 카드
하단에 같이 들어가 항목 추가/삭제 도중에도 할인을 바로 조정 가능.

영수증 미리보기는 차수별 `receiptPreviewToken` → `previewBlob` fetch →
`URL.createObjectURL` 패턴 그대로 (JWT 헤더 필요해 `<img src>` 직접 불가).

### Step4Review — 미리보기 + 저장 + draft 정리

[`Step4Review.tsx`](../../apps/web/src/routes/settlement/Step4Review.tsx) —
FE 에서 `calculateMultiRoundShares` 호출해 차수×참여자 분배를 즉시 계산해
보여준다 (서버도 저장 시 동일 계산 다시 — 단일 source of truth). 저장은
`useCreateSettlement({ fromDraftId })` 또는 `useUpdateSettlement(editingId)`.
`fromDraftId` 가 있으면 서버가 같은 트랜잭션 안에서 임시저장 draft 도 정리한다.

미리보기 도중 풀 초과 같은 invalid 상태도 calculator 의 `max(0)` 클램프로
그릴 수 있게 — 저장은 zod refine 에서 한 번 더 차단.

`RoundCategoryAdjuster` 가 차수별 카드에 들어가 1원 단위 잔여가 발생한
카테고리만 노출하고, "받을 사람" 선택 + 100/1000원 반올림 토글을 제공.
round(unit) 이 인원수로 떨어지는 unit 만 추천 칩 활성 — 안 떨어지면 회색.

### SettlementBreakdownTable — 정산표 매트릭스 [신규]

[`SettlementBreakdownTable.tsx`](../../apps/web/src/routes/settlement/SettlementBreakdownTable.tsx)
— 행 = 마스터 참여자, 열 = (차수 × 사용된 카테고리 + 차수 소계) × N차 + 총계.
하단에 합계 행. 이름·총계·합계 행은 `sticky left-0` / `sticky right-0` / `sticky bottom-0`
+ `z-10` 으로 가로 스크롤 시에도 보이게. 데스크톱(lg+) 에선
`SettlementResultPage` 가 2-column 레이아웃의 우측 sticky 패널로 띄워 좌측
스크롤 중에도 항상 정산표가 보인다 (`lg:sticky lg:top-[60px]`).

사용 카테고리만 컬럼 노출 — UNCATEGORIZED 가 한 번도 안 쓰였으면 컬럼 자체
빠진다. 데이터는 `calculateMultiRoundShares` 의 `perRound[].perCategoryShares` 를
매트릭스로 전개. 비참석/제외자는 0 = 빈 셀.

### SettlementResultPage — 차수별 카드 + sticky 정산표

[`SettlementResultPage.tsx`](../../apps/web/src/routes/settlement/SettlementResultPage.tsx)
— 헤더 `sticky top-0 z-30` (이전 z-10 → BreakdownTable 의 z-10 sticky 셀과
충돌해 헤더가 표 아래로 깔리던 회귀 fix). 데스크톱(lg+) 좌(요약·참여자·차수별
영수증/항목) + 우(정산표 sticky) 2컬럼. 모바일은 1컬럼 stack — 정산표는 가로
스크롤.

각 차수 카드: warning(분배 검증 실패 등) + 영수증 미리보기(RECEIPT 일 때) +
RoundItemsCard. 헤더 액션 = [이력] · [수정] · [공유] · [삭제]. "수정됨" 배지는
서버의 `updatedAt > createdAt` 기준으로 SettlementCards 가 표시.

### SettlementHistoryPage — 임시저장 + 완료 + 다중 삭제 [refactor]

[`SettlementHistoryPage.tsx`](../../apps/web/src/routes/settlement/SettlementHistoryPage.tsx)
— 1페이지 상단에 **"이어 입력" 임시저장 행** (`useListSettlementDrafts(true)`,
`PublicLayout` 안이라 PublicTopBar 도 같이 보임). 그 아래 완료된 정산 카드 리스트.
다중 선택 checkbox + 일괄 삭제 sticky 액션바 + 단건 휴지통 버튼 + 페이지/사이즈
변경 시 선택 자동 초기화. 삭제 확인은 신규 `ConfirmDialog` (이전엔 인라인
`confirm()` — focus/styling 문제 + async/cancel 불가).

일괄 삭제는 라운드트립 N번이지만 `useDeleteSettlement` 가 onSuccess 마다
invalidate → react-query 가 debounce → 마지막 한 번만 refetch.

### SharedSettlementPage — read-only + 수정됨 배지

[`SharedSettlementPage.tsx`](../../apps/web/src/routes/settlement/SharedSettlementPage.tsx)
— `/share/settlements/:token`. PublicLayout 밖 라우트라 TopBar 없음. 차수별
카드 렌더(영수증 미리보기는 서버가 응답에서 제외), 수정됨 배지 노출. 헤더는
`sticky top-0 z-30` 동일 패턴.

### ConfirmDialog 공용 컴포넌트 [신규]

[`components/ui/confirm-dialog.tsx`](../../apps/web/src/components/ui/confirm-dialog.tsx)
— fixed overlay + 외부 헤드리스 라이브러리 없이 ESC/배경 클릭 닫기, confirm/
cancel 두 버튼, `variant='destructive'` 일 때 confirm 버튼 빨강. `pending` prop 으로
액션 중 disable + 스피너. 인라인 `window.confirm()`/`window.alert()` 잔존을 점진적
대체 — 모바일에서 confirm() 의 폰트/포커스 이슈 + async/await 흐름과 어색하던 게
계기. 단 SettlementResultPage 의 삭제 confirm 은 아직 `window.confirm` (점진 마이그레이션).

### AdminAiKeysPage — 모델 미리보기

[`AdminAiKeysPage.tsx`](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx) —
저장 전에 API 키만 입력한 상태에서 "모델 미리보기" 버튼을 누르면
`usePreviewModels(providerId, { apiKey, baseUrl })` (신규) 가 라이브로 모델
목록을 가져와 dropdown 에 채운다. 사용자가 모델을 골라 저장 — 저장 후엔
기존 `useProviderModels` 가 저장된 키로 다시 가져와 같은 dropdown 유지.

모바일 카드 레이아웃 정돈: 컬럼 collapse 순서, 버튼 정렬, 비밀번호 마스킹.
`{id, purpose}` 페어 단위 카드 + "다른 용도 추가" 패턴은 2026-05-25 라운드부터
유지.

### interaction 핫패스 memo / 공용 Lightbox [신규 — perf/공용화]

리스트가 큰 화면의 인터랙션 리렌더를 `memo` + 안정 콜백으로 잘라낸다:

- [`PublicRestaurantCard`](../../apps/web/src/components/restaurant/PublicRestaurantCard.tsx)
  가 `memo` — 카드 호버 시 부모(목록 페이지)가 `hoveredPlaceId` 변경으로 리렌더돼도
  호버된 카드만 props 가 바뀌고 나머지(≤80개)는 bail-out. 부모는
  [`PublicRestaurantList`](../../apps/web/src/components/restaurant/PublicRestaurantList.tsx)
  가 인라인 클로저 없이 안정 콜백(`placeId` 인자형)을 그대로 넘겨 memo 가 실제로 동작.
- [`AdminDiningcodePage`](../../apps/web/src/routes/admin/AdminDiningcodePage.tsx) 의
  `ResultCard` 가 `memo` + `toggleOne` 을 `useCallback([])`(함수형 업데이터라 deps 빔)
  으로 안정화 — 체크박스 토글/일괄저장 SSE 틱마다 잡에 속한 카드(`jobItem` 변경)만
  리렌더, `jobItem=null` 카드는 그대로.

라이트박스는 [`components/restaurant/detail/Lightbox.tsx`](../../apps/web/src/components/restaurant/detail/) →
[`components/Lightbox.tsx`](../../apps/web/src/components/Lightbox.tsx) 로 승격 (정산·상세
공용). 옛 경로는 삭제됨 —
[`PhotosTab`](../../apps/web/src/components/restaurant/detail/PhotosTab.tsx),
[`shared.tsx`](../../apps/web/src/components/restaurant/detail/shared.tsx) 가
`~/components/Lightbox` 로 import. portal(`createPortal(document.body)`) + scroll-snap
캐러셀 + dvh + backdrop pointerdown-거리 닫기 동작은 그대로(아래 Key Decisions).

### 다크 모드 — 테마 스토어 + 지도 레이어 [신규 — 17차]

웹 자체 다크 모드. [`useThemeStore`](../../apps/web/src/stores/theme.ts)(zustand) 가
`mode: 'light' | 'dark'` + `setMode`/`toggle` 을 들고 `lp:theme` localStorage 에
영속. 초기값은 `document.documentElement.classList.contains('dark')` 를 읽어
`index.html` 의 FOUC 방지 인라인 스크립트(`lp:theme` → `<html class="dark">`)와
일치시킨다. `ThemeToggle` 이 토글하면 `.dark` 클래스가 붙고, tailwind.css 의
`@custom-variant dark (&:where(.dark, .dark *))` 가 `dark:*` utility 를 발동.

[`MapCanvas`](../../apps/web/src/components/restaurant/MapCanvas.tsx) 가
`useThemeStore` 를 구독해 vworld 베이스 레이어를 테마에 맞춰 선택
(`layerForTheme`: light→`Base`, dark→`midnight`). 좌하단 신규
[`MapLayerControl`](../../apps/web/src/components/restaurant/MapLayerControl.tsx)
이 일반(`Base`)/다크(`midnight`)/위성(`Satellite`) 를 수동 토글 —
`userPickedLayerRef` 가 한 번 수동 선택되면 이후 테마 변경에 더 끌려가지 않는다.
레이어 변경은 **map 재생성 없이** `tileSourceRef.setUrl(buildVworldTileUrl(...))`
로 URL 만 교체 + `vectorSource.changed()` 로 마커 라벨만 재평가(`isDarkBaseRef` =
midnight/satellite 일 때 라벨 흰 글자 + 어두운 외곽선으로 반전). `layerControl`
prop 으로 컨트롤 노출 on/off(기본 true). 지도 코어 상세는 [map](map.md), 앱과의
디자인 토큰 공유는 [shared](shared.md) / [mobile](mobile.md).

### "내 위치" 버튼 공용화 — MyLocationButton [신규 — 17차]

[`MyLocationButton.tsx`](../../apps/web/src/components/restaurant/MyLocationButton.tsx)
가 공개 맛집 지도(`PublicRestaurantsMap`)와 어드민 발견 지도(`DiscoverMap`)에서
공유된다 (2026-05-31 라운드에 `PublicRestaurantsMap` 인라인으로 들어갔던 분기를
별도 컴포넌트로 추출 + 어드민에도 적용). `status`(`UserLocationStatus`) + `onClick`
(refetch) 두 props. denied(권한 차단)·insecure(`window.isSecureContext === false`,
평문 HTTP)는 비활성 대신 클릭 시 해제 방법 callout; pending 만 disabled; 나머지
unavailable 은 재시도 여지. 바깥 클릭(`document mousedown`)으로 callout 닫기. 판정
로직 자체는 [shared](shared.md) 의 `useUserLocation`.

### soft tonal 색 variant — badge/button [신규 — 17차]

[`badge.tsx`](../../apps/web/src/components/ui/badge.tsx) /
[`button.tsx`](../../apps/web/src/components/ui/button.tsx) 에 blue/amber/violet/
green/red/teal 6색 tonal variant 추가 — 무테두리 + 옅은 틴트 배경 + 같은 hue
텍스트. 색 토큰은 [tailwind.css](../../apps/web/src/styles/tailwind.css) 의
`--tonal-{color}-bg` / `-bg-hover` / `-fg`(oklch, `:root` 라이트 + `.dark` 다크
한 쌍). 맛집 어드민(`AdminRestaurantsPage`/`AdminRestaurantDetailPage`)·병합
(`CanonicalMergePanel`/`MergeProposalQueue`)·AI 분석 관리(`AdminAnalyticsPage`)에
일괄 적용 — outline/default 액션 버튼을 의미별 색으로 구분.

### 상세 분석 인터랙션 — 팁/메뉴 클릭 필터 + 카테고리 트리 + 라이트박스 [신규 — 17차]

[`PublicRestaurantDetail`](../../apps/web/src/components/restaurant/detail/PublicRestaurantDetail.tsx)
가 `tipFilter`/`menuFilter` state 를 들고(동시 1개만 활성 — 한쪽 고르면 다른
쪽 해제, 식당 변경 시에만 리셋) 탭 간 공유:

- **분석 탭(`InsightsTab`)** — 신규 `CategoryTree`(식당별 메뉴 카테고리 멘션 트리,
  `useRestaurantPublicCategoryTree(placeId)` 별도 endpoint, roots 비면 섹션 숨김,
  루트 depth 0 만 기본 펼침) + 인기 메뉴/방문팁(`AiSummary`)이 클릭 가능한 `<button>`
  으로 — 누르면 `onSelectTip`/`onSelectMenu` 가 reviews 탭으로 전환 + 그 term 으로
  리뷰 필터.
- **메뉴 탭(`MenuTab`)** — 메뉴 클릭 시 동일 필터.
- **리뷰 탭(`ReviewsTab`)** — `tip`/`menu` prop 으로 필터된 리뷰만 + `onClearTip`/
  `onClearMenu` 칩.
- **메뉴 썸네일 → 라이트박스** — 메뉴 썸네일 탭 시 공용 `~/components/Lightbox` 확대.

### 상세 탭 카드 테두리 제거 + 리뷰 사진 풀폭 (앱 통일) [17차]

`HomeTab`/`InfoTab`/`InsightsTab`/`ReviewsTab` 등에서 리스트 항목의 카드
`border` + `rounded-md` 를 제거하고 `divide-y divide-border`(구분선만) + 풀폭
패딩으로 — 앱(`apps/mobile`)의 탭 카드 스타일과 통일. 리뷰 사진도 카드 안 박스
대신 풀폭. [mobile](mobile.md) 참조.

### 목록 카드 클릭=지도 이동 / 더블클릭=확대 [17차]

[`PublicRestaurantCard`](../../apps/web/src/components/restaurant/PublicRestaurantCard.tsx)
에 `onZoom(placeId)` prop 추가 — `onClick` = 선택(지도 fly-to), `onDoubleClick`
= 확대. [`PublicRestaurantList`](../../apps/web/src/components/restaurant/PublicRestaurantList.tsx)
가 `onZoomItem` 으로 전달. 지도 쪽은 [`MapCanvas`](../../apps/web/src/components/restaurant/MapCanvas.tsx)
에 신규 imperative `flyToZoomIn(lat, lng, minZoom)` — fly-to 와 같지만 최소
`minZoom` 까지만 확대(이미 더 확대돼 있으면 줌 유지·중심만 이동, 줌아웃 안 함).
공개(`RestaurantsPage`/`RestaurantsV2Page`/`PublicRestaurantsMap`) + 어드민 발견
(`AdminDiscoverPage`/`DiscoverMap`/`DiscoverPanel`)에 통일 적용.

### AdminAnalyticsPage — 자동 실행 스케줄러 UI [신규 — 17차]

[`AdminAnalyticsPage`](../../apps/web/src/routes/admin/AdminAnalyticsPage.tsx) 에
`ScheduleSection` 통합 — 주기마다 "미분류 식당 정규화 → 전역 머지"를 자동 실행.
- **cron preset/커스텀** — 친화 프리셋 4개(매일 3시/정오/6시간마다/매시간) + 커스텀
  직접 입력. preset 에 없는 cron 이면 자동 커스텀 모드.
- **다음 실행 preview** — `useSchedulePreview(cron, tz, true)` 가 valid 여부 + 다음
  실행 시각.
- **활성/비활성 토글 + 지금 실행** — `useUpdateScheduleConfig` / `useRunScheduleNow`.
- **이력 + live SSE** — `useScheduleRuns`(inflightRunId) + `useScheduleRunEvents`
  로 진행 중 run 의 실시간 진척 + `ScheduleStatusChip`(done/failed/running/skipped/
  interrupted). 설정은 서버 DB 영속(재시작 유지).

스케줄러 도메인(서버 cron 등록·run 모델·SSE)은 [schedule](schedule.md). 어드민
카테고리 트리는 기본 접힘으로 변경(과도한 노출 방지).

### 모바일 UX 규율 / 공개 셸 / 어드민 셸

[이전 라운드 컴파일 동일 — `PublicLayout`, `AdminLayout`, 모바일
body 스크롤 + 100dvh + 한글 IME, 어드민 발견/자동 발견 카드, 다이닝코드 정식/
검증 페이지, 캐치테이블 테스트, canonical 그룹핑 + Scissors 분리 + MergeProposalQueue,
RestaurantsV2 BottomSheet 등 — 모두 그대로]. 자세한 내용은
[이전 컴파일 본 참고]. (어드민 라우트 등록만 `AdminRoutes.tsx` 로 이전 — 위 코드
스플리팅 참조.)

## Talks To [coverage: high — 16 sources]

- **`@repo/api-contract`** — N차 모델 zod 스키마:
  - `SettlementSessionType` / `SettlementRoundType` (rounds[] 추가) / `DraftRound` /
    `DraftCategoryAdjustment` / `SharedSettlementSessionType` (수정됨 배지·소유자
    필드 제거) / `calculateMultiRoundShares` (단일 round → N round 일반화) /
    `effectiveExcludes` (round override 반영).
  - 이전 라운드 schemas (canonical, diningcode, catchtable, auto-discover) 변경 없음.
- **`@repo/shared`** — 신규/확장 훅:
  - 정산 — `useSettlementDraftStore` (rounds[] 배열로 일반화 + `addRound`/
    `removeRound`/`updateRoundMeta`/`setRoundItems`/`setRoundReceipt`/
    `copyRoundAttendancesFrom`/`setCategoryAdjustment` 등 차수 API), `useCreateSettlement`
    (`fromDraftId` 옵션), `useUpdateSettlement`, `useSettlement`, `useSharedSettlement`,
    `useDeleteSettlement`, `useCreateSettlementShare`.
  - **자동 저장** [신규] — `useSettlementDraftHydrate(placeId)` (서버 draft fetch +
    store hydrate), `useSettlementDraftAutoSync({ placeId, placeNameHint, hydrated,
    initialDraftId, enabled })` (디바운스 PUT), `useListSettlementDrafts(activeOnly)`,
    `useDeleteSettlementDraft`.
  - **AI** — `usePreviewModels` (저장 전 모델 미리보기), 기존
    `useProviderModels`/`useUpdateProvider`/`useDeleteProvider`/`useTestProvider`
    그대로 (`ProviderKey` 페어 시그니처 유지).
  - **스케줄러** [신규 — 17차] — `useScheduleConfig`/`useUpdateScheduleConfig`/
    `useRunScheduleNow`/`useSchedulePreview(cron, tz, enabled)`/`useScheduleRuns`/
    `useScheduleRunEvents(enabled)` — AdminAnalyticsPage `ScheduleSection` 소비.
    도메인은 [schedule](schedule.md).
  - **분석/상세** [신규 — 17차] — `useRestaurantPublicCategoryTree(placeId)`
    (식당별 메뉴 카테고리 트리 — `CategoryTreeNodeType[]`, insights 와 별도
    endpoint). 위치는 `useUserLocation`(`UserLocationStatus` — MyLocationButton).
  - 단골 — `useListContacts`, `useCreateContact`, `useUpdateContact`,
    `useDeleteContact`, `useSearchContacts`.
  - 영수증 추출 — `useUploadReceipt`, `useExtractReceipt`(splitIndex/splitTotal
    + roundIndex/roundTotal 컨텍스트 옵션), `settlementExtractionApi.previewBlob`.
  - 기존 (canonical 관리, 다이닝코드/캐치테이블 크롤, 자동 발견, 인증, 식당
    리스트, SSE) 모두 유지.
- **`@repo/utils`** — `formatWonPrice` (원화 콤마), 썸네일 프록시 헬퍼.
- **Zustand 스토어** — `useAuthStore`, `useActiveCrawlJobStore`, `panelPrefsStore`,
  `useActiveDiningcodeBulkSaveJobStore`, `useActiveAutoDiscoverJobStore`,
  `useSettlementDraftStore` (sessionStorage — 브라우저 닫으면 소멸),
  `useSettlementPrefsStore` (localStorage — 다음 정산까지 유지),
  **[`useThemeStore`](../../apps/web/src/stores/theme.ts)** (`lp:theme` localStorage —
  light/dark + toggle, `MapCanvas`/`ThemeToggle` 구독). draft vs prefs vs theme
  수명·스코프가 달라 각각 분리.
- **TanStack Query 키** —
  - `['settlements', 'list', query]`, `['settlements', 'detail', id]`,
    `['settlements', 'shared', token]`, `['settlement-drafts', 'list', activeOnly]`.
  - 기존 ai-providers / ai-providers-models / preview-models, restaurants,
    diningcode/catchtable, canonical, auto-discover 그대로.
- **localStorage / sessionStorage** —
  - localStorage: `lp:token`, `lp:guest`, `lp:theme`, `lp:panelPrefs`,
    `lp:adminSidebarCollapsed`, `lp:settlementPrefs` [신규], 다이닝코드/자동발견
    잡 id.
  - sessionStorage: 정산 draft (`settlementDraftStore` 의 persist key).
- **lucide-react** — `SplitSquareHorizontal` (다중 영수증 분할), `CopyCheck`
  (1차와 동일), `FileEdit`/`Receipt` (정산 이력 행), `History`/`Pencil`/`Share2`
  (결과 헤더 액션), `Camera`/`MapPin`/`Plus`/`Trash2` (차수 카드).
- **Tailwind v4** — `@custom-variant dark` 명시 binding (위 Architecture 참조).
- **OpenLayers / vworld WMTS / Radix UI / 백엔드 friendly** — 이전과 동일.

도메인 의미 / 분배 알고리즘은 [settlement.md](settlement.md), 크롤/SSE/분석은
[shared.md](shared.md), [crawl.md](crawl.md), [analytics.md](analytics.md) 참조.

## API Surface [coverage: high — 12 sources]

웹 앱은 HTTP 엔드포인트가 아닌 **브라우저 URL** + 재사용 컴포넌트 노출.

URL (정산 라우트가 차수 모델로 바뀌었지만 URL 자체는 동일 — 콘텐츠가 N차로):

- `/` — 공개 홈
- `/restaurants` / `/restaurants/:placeId` — 풀 뷰포트 검색 + 상세
- `/restaurants-v2[/:placeId]` — 모바일 시트 v2
- `/restaurants/:placeId/settle/new` — **정산 입력 4-step (N차)** (`RequireUser`)
- **`/me/settlements/new`** — 식당 없이 진입 (Step2 에서 1차 식당 검색)
- `/restaurants/:placeId/settle/:id` — 저장된 정산 결과 보기 (2-column sticky 정산표)
- **`/restaurants/:placeId/settle/:id/edit`** — 같은 SettlementNewPage, edit 모드
- **`/s/:token`** — 공유 토큰 read-only (수정됨 배지). 이전 `/share/settlements/:token`
  에서 짧아짐 — `/share/settlements/*` 는 이제 Fastify OG 미리보기/PNG 카드 경로
  (dev 프록시 + prod nginx).
- `/me/settlements` — 이력 (이어 입력 + 완료 + 다중 삭제)
- `/me/contacts` — 단골 관리
- `/login` — 로그인 + 회원가입 + 게스트
- `/admin/*` — (이전과 동일 — discover/auto-discover/restaurants/diningcode/
  catchtable/crawl-test/analytics/ai-test/settings/ai-keys/map)

내부 재사용 컴포넌트 (신규/변경):

- 정산 [신규] — `Step2Rounds`, `RoundDiscountEditor`, `RoundExceptionsEditor`,
  `RoundCategoryAdjuster`, `MultiReceiptSplitDialog`, `RestaurantSearchDialog`,
  `SettlementBreakdownTable`.
- 정산 [변경] — `Step1Participants` (단일 필드 + 별칭 토글), `Step3Edit` (차수 탭),
  `Step4Review` (multi-round + fromDraftId), `SettlementResultPage` (2-col +
  z-30 헤더), `SettlementHistoryPage` (드래프트 + 다중 삭제), `SettlementCards`
  (차수별 + 수정됨 배지), `SharedSettlementPage` (차수별 + 수정됨 배지).
- 정산 [삭제] — `Step2Source`, `ParticipantEditDialog` (N차 모델 + edit
  라우트로 흡수).
- UI 공용 — `components/ui/confirm-dialog.tsx`.
- 어드민 — `AdminAiKeysPage` "모델 미리보기" + `AdminAnalyticsPage` `ScheduleSection`.
- [신규 — 17차] — `restaurant/MapLayerControl`(레이어 토글), `restaurant/MyLocationButton`
  (공개·어드민 발견 공용 위치 버튼), `restaurant/detail/CategoryTree`(메뉴 카테고리 트리).
- [변경 — 17차] — `badge`/`button` tonal 6색 variant, 상세 탭(`HomeTab`/`InfoTab`/
  `InsightsTab`/`MenuTab`/`ReviewsTab`/`shared`) 카드 테두리 제거 + 팁/메뉴 클릭 필터,
  `MapCanvas.flyToZoomIn` imperative, `PublicRestaurantCard.onZoom`(더블클릭 확대).
- 그 외 모든 컴포넌트는 직전 라운드와 동일.

## Data [coverage: high — 8 sources]

- 로컬 DB 없음. 상태 갈래:
  - **서버 상태** — TanStack Query 캐시.
  - **클라이언트 인증** — Zustand `useAuthStore`.
  - **잡 슬롯** — Naver 크롤(`useActiveCrawlJobStore`), 다이닝코드 일괄 저장
    (`useActiveDiningcodeBulkSaveJobStore`), 자동 발견(`useActiveAutoDiscoverJobStore`).
  - **정산 draft** — `useSettlementDraftStore` (Zustand + sessionStorage). 식당
    `startFor(placeId)` 단위 보존, `startFromScratch` 로 식당 없이 시작 가능.
    서버 동기화는 `useSettlementDraftAutoSync` 가 디바운스 PUT 으로 위임.
  - **정산 prefs** [신규] — `useSettlementPrefsStore` (Zustand + localStorage).
    새 참여자 행 기본 exclude 토글만 보관. draft 와 수명이 다른 게 분리 이유.
  - **URL = state** — RestaurantsPage, RestaurantDetailRoute, AdminAnalyticsPage,
    AdminDiscoverPage, AdminRestaurantsPage (sort/page/pageSize) 가 useSearchParams.
    정산 페이지는 URL state 미사용 — step 은 page-local useState, draft 는
    sessionStorage.
- **TanStack Query 키 신규** —
  - `['settlements', 'list', query]`, `['settlements', 'detail', id]`,
    `['settlements', 'shared', token]`.
  - `['settlement-drafts', 'list', activeOnly]`, `['settlement-drafts', 'detail',
    placeId]`.
  - `['ai-providers-preview-models', providerId]` (저장 전 미리보기).
- **localStorage** —
  - `lp:token`, `lp:guest`, `lp:theme`, `lp:panelPrefs`, `lp:adminSidebarCollapsed`,
    `lp:settlementPrefs` [신규], 다이닝코드/자동 발견 잡 id (기존).
- **sessionStorage** — 정산 draft store (식당당 1개).
- **API 클라이언트 토큰 주입** — `configureApi({ getToken })`, 401 →
  `onUnauthorized: clearSession`.

## Key Decisions [coverage: high — 42 sources]

이전 라운드 결정(모바일 UX, 라우트 분리, AdminLayout 드로어, 풀 뷰포트
3-column, 5탭 1회 fetch, 라이트박스 단일 시퀀스, OL+WMTS, AdminDiningcode
정식/검증 분리, canonical 그룹핑, MergeProposalQueue, 자동 발견 잡 1개 + 60초 TTL,
2026-05-25 라운드의 CardContent pt-0 제거 / Lightbox mount instant / dvh /
MapCanvas declutter 해제 / AI provider {id,purpose} 페어 / AdminRestaurantsPage
서버 페이징, 정산 4-step Stepper + 영수증 미리보기 blob, 공유 토큰 read-only,
SettlementShareDialog 자동 POST 멱등)는 그대로 유지. 이번 라운드 신규/변경:

- **정산 = 차수(N차) 모델로 일반화** — 이전엔 한 정산 세션 = 한 영수증 / 한 식당.
  지금은 `rounds[]` 배열로 1차/2차/3차를 한 세션 안에 묶고, 각 차수가 자체
  식당(`placeId`/`placeName`)·source(MANUAL/RECEIPT)·할인·exception override·
  attendances 를 갖는다. `calculateMultiRoundShares` 가 단일 round 일반화의
  결과 — 1차만 있어도 같은 코드 경로. 결과 페이지가 차수별 카드 + 정산표
  매트릭스로 시각화. 1차/2차 식당이 다를 수 있어 `RestaurantSearchDialog` 가
  필수. 1차 만으로 끝나는 경우도 같은 N차 model 의 N=1 케이스라 별도 분기 없음.
- **Step2Source 삭제 + Step2Rounds 신규** — "직접 입력 / 영수증" 단일 분기는
  N차 모델에 흡수: 각 차수 카드가 자체 source 라디오. 다중 영수증 분할 같은
  새 흐름이 추가되니 단일 page 가 감당 못 하고, 차수 단위 카드가 자연스럽다.
  Step2Source 가 import 되던 모든 경로가 typecheck 로 잡혀 일괄 제거.
- **ParticipantEditDialog 삭제 + `/settle/:id/edit` 라우트 신규** — 저장 후
  참여자만 고치는 다이얼로그 패턴은 차수 모델에 안 맞는다 (어느 차수의 참석을
  바꿀지 분기가 필요). 그래서 결과 페이지의 "수정" 버튼이 같은
  `SettlementNewPage` 를 `id` 와 함께 열어 4-step 으로 재진입. session 을 fetch
  해서 draft 로 hydrate, 저장은 `useUpdateSettlement(id)`. "수정됨" 배지는
  서버의 `updatedAt > createdAt` 으로 판단해 결과 카드에 표시.
- **다중 영수증 분할 = 한 사진 N 슬라이스 × N차 매핑** — 사용자가 영수증
  여러 장을 한 컷에 찍어 올린 케이스 (테이블 위에 1차/2차/3차 영수증을 가로로
  놓고 한 번 찍음) 를 지원. `MultiReceiptSplitDialog` 가 업로드된 사진을 사용자가
  분할 개수 N(2~5) 와 "왼쪽부터 어느 차수" 매핑을 입력하면, 서버 split 옵션으로
  N 번 순차 추출 → 매핑된 차수에 적용. 사용자 인지 = "왼쪽부터 차례대로 1차/
  2차/...", 서버는 `splitIndex`/`splitTotal`/`roundIndex`/`roundTotal` 컨텍스트
  메타로 LLM 에 힌트. 진행 중 슬라이스 카운트(`done/total`) UI 표시 — N 번 LLM
  호출이라 한참 걸린다.
- **분담 다듬기 (RoundCategoryAdjuster) = leftover + round unit** — 1원 단위
  분배가 인원수로 안 나눠 떨어지는 경우의 정책. 기본은 calculator 가 첫 활성자에게
  잔여를 가산 (변하지 않은 동작). 사용자가 명시로 "받을 사람" 을 고르면 그 사람
  흡수. round unit (100/1000) 토글은 *그 unit 이 인원수로 떨어질 때만* 추천 칩
  활성화 — 안 떨어지면 회색 + 툴팁. 이렇게 두면 "1100원 부담을 5명이 균등하게"
  같은 무의미한 케이스에서 사용자가 헤매지 않는다.
- **`SettlementBreakdownTable` = 매트릭스 + sticky 셀 + 2-col 결과 페이지** —
  N차 정산은 "한 사람이 1차에 8천 / 2차에 5천 / ..." 같은 분해 표가 핵심.
  participant × (round × category) 매트릭스로 펼치고, 사용 카테고리만 컬럼
  노출 (UNCATEGORIZED 한 번도 안 쓰였으면 컬럼 자체 빠짐). 데스크톱은 결과
  페이지 우측 sticky 패널 — 좌측 스크롤 중에도 항상 보임. 모바일은 1컬럼 stack
  + 가로 스크롤. 이름·총계·합계 행은 sticky.
- **z-30 sticky 헤더** — `SettlementResultPage` / `SharedSettlementPage` 헤더가
  이전 `z-10` 에서 `z-30` 으로 상승. BreakdownTable 의 sticky 셀(`z-10`) 과
  같은 평면이라 헤더가 표 아래로 깔리던 회귀를 막는다. sticky 컨테인 관계와
  z 평면 — 한 번 sticky 가 들어가면 모든 sticky 요소의 z 를 한 번 재계산해야
  안전 (`SettlementBreakdownTable` 셀 z 도 같이 조정).
- **Tailwind v4 `@custom-variant dark` 명시 binding** — v4 의 dark variant 기본은
  `prefers-color-scheme` 미디어쿼리. 이 codebase 는 `html.dark` 클래스 토글
  방식이라 v4 기본으로는 작동하지 않는다 (CSS variable 만 토글되고
  `dark:bg-*` 등 모든 utility 가 시스템 다크 사용자한테만 작동하는 일관성
  깨진 상태). `@custom-variant dark (&:where(.dark, .dark *))` 한 줄로 binding —
  `.dark` 부모 안의 어떤 깊이의 요소에도 utility 가 발동.
- **`confirm-dialog.tsx` 공용화** — 인라인 `confirm()` 은 모바일에서 폰트/포커스
  이슈 + async/cancel/pending 흐름과 어색. fixed overlay + 두 버튼 + ESC/배경
  닫기 + `pending` 스피너 패턴으로 정리. 외부 헤드리스 라이브러리 안 끌어들이고
  내부 컴포넌트로. SettlementHistoryPage 의 단건/일괄 삭제부터 도입,
  SettlementResultPage 등 다른 잔존 `window.confirm` 은 점진 마이그레이션.
- **새 참여자 행 기본 exclude = localStorage 영속** — `useSettlementPrefsStore`
  가 새 행의 기본 exclude(주류/비주류/안주) 를 localStorage 에 영속. draft 와
  분리 — draft 는 sessionStorage(브라우저 닫으면 소멸), prefs 는 다음 정산까지
  유지. `panelPrefsStore` 와 같은 패턴. 단골에서 추가한 경우엔 단골값이 우선이라
  이 기본값은 무시 (사용자 의도가 명확한 경우 자동 적용 안 함).
- **Step1 = 단일 이름 필드 + 별칭 토글** — 이전엔 항상 이름+별명 두 칸. 95%
  케이스는 한 칸이면 충분 — 같은 이름의 다른 사람을 구분하거나 단골에서
  별칭이 같이 채워진 경우만 "+ 별칭" 으로 두 번째 칸 펼침. 충돌·중복 케이스만
  두 칸으로 명시. Enter 로 다음 행 추가 + nameRefs Map 으로 focus 이동
  (`pendingFocusId` + 다음 render useEffect — 외부 시스템(DOM focus) 동기화라
  useEffect 가 맞다).
- **"1차와 동일" 참석자 복사** — 4차/5차 같은 다차 정산에서 같은 사람들이
  계속 가는 케이스가 많다. 차수 카드에 `CopyCheck` 버튼 — `copyRoundAttendancesFrom
  (round.clientId, '1차')` 로 1차의 attendances 그대로 복사. 사용자가 매번 같은
  체크박스를 N번 누르는 부담 제거.
- **다중 선택 일괄 삭제 (SettlementHistoryPage)** — 단건 휴지통 + 다중 선택
  체크박스 + 일괄 삭제 sticky 액션바 + 페이지/사이즈 변경 시 선택 자동 초기화.
  일괄은 라운드트립 N번이지만 onSuccess 마다 invalidate → react-query 가 debounce
  → 마지막 호출에서 한 번만 refetch. 사용자가 50건씩 한 번에 정리하기 쉬워짐.
- **`AdminAiKeysPage` 모델 미리보기** — 이전엔 키 저장 → 저장된 키로 모델
  fetch → 모델 선택 → 다시 저장의 2 step. 지금은 키 입력 후 "모델 미리보기"
  버튼이 즉시 라이브 모델 목록을 가져와 dropdown 에 채운다 (`usePreviewModels`).
  사용자가 모델 고른 뒤 저장 한 번으로 끝 — 저장 전 키가 유효한지도 같은 호출에서
  검증. 모바일 카드 레이아웃은 칼럼 collapse / 버튼 정렬 / 마스킹.
- **`useSettlementDraftAutoSync` = 디바운스 PUT + 임시저장 hydrate** — 정산
  입력 도중 새로고침/이탈 시 복구를 위해 서버에 draft 자동 저장. 이전 라운드의
  client-only sessionStorage draft 위에 서버 동기화 레이어를 추가. `/me/settlements`
  1페이지 상단에 "이어 입력" 행으로 노출. 저장 완료(`useCreateSettlement`) 시
  `fromDraftId` 를 같이 보내 서버가 같은 트랜잭션에서 draft 도 정리한다.

- **(2026-05-31) 홈 랭킹 행 = `<Link>`, `<button>`/`onClick` 아님** — `RankingRow` 를
  `<Link to="/restaurants-v2/:placeId">` 로 감쌌다. `onClick` + `navigate` 대신 Link 라
  Cmd/Ctrl+클릭 새 탭·미들 클릭·키보드 포커스·우클릭 "새 탭에서 열기" 가 공짜로 동작.
  `placeId` 가 그대로 라우팅 키. 목적지는 `/restaurants` 가 아니라 신버전 `/restaurants-v2`
  레이아웃 — 홈에서 바로 시트형 상세로 들어간다.
- **(2026-05-31) 상세 라이트박스 = `createPortal(document.body)`** — 데스크톱 공개 상세는
  `[리스트|상세|지도]` 3-컬럼, 각 컬럼이 `position: sticky` 라 **저마다 stacking context** 를
  만든다. 라이트박스를 상세 컬럼 안에서 렌더하면 `z-50` 이 그 컬럼 context 안에서만 유효해,
  DOM 상 뒤에 오는 지도 컬럼(같은 `z:auto`)이 이미지 오른쪽을 덮어 잘렸다. `createPortal` 로
  `document.body` 에 빼면 컬럼 context 밖이라 전체 화면을 정상으로 덮는다. (기존 Gotchas 의
  "sticky containing block trap" 이 라이트박스에서 실제 회귀한 사례 + 그 해법.)
- **(2026-05-31) 라이트박스 backdrop 클릭 닫기 = pointerdown 좌표 비교** — X 버튼 외 보조
  닫기로 어두운 영역 클릭을 추가하되, 캐러셀 스와이프 끝에 발생하는 `click` 으로 의도치 않게
  닫히는 걸 막아야 한다. `pointerdown` 시 좌표를 기록하고 `click` 에서 이동거리가 10px 초과면
  스와이프/드래그로 보고 무시 (`Math.hypot`). 이미지(`IMG`)·버튼 클릭도 제외.
- **(2026-05-31) "내 위치" 버튼 = denied/insecure 는 비활성 대신 안내 callout** — 이전엔
  `denied`·`unavailable` 을 묶어 버튼을 disabled(클릭·title·재시도 전부 막힘) 했다. 지금은
  (a) `denied`(권한 차단) — 사용자가 브라우저 사이트 설정에서 직접 풀 수 있으므로 비활성하지
  않고 클릭 시 해제 방법 callout + `onClick`(refetch) 동시 — 이미 풀어뒀으면 즉시 재시도,
  (b) `insecure`(평문 HTTP — `window.isSecureContext === false`, 주로 dev/LAN 접속) — 앱에서
  못 푸니 callout 만(재시도 무의미), (c) 그 외 `unavailable`(timeout 등) — 비활성 대신 재시도
  여지, (d) `pending` 만 비활성. callout 은 바깥 클릭(`document mousedown` — 외부 시스템
  동기화라 useEffect 적합)으로 닫는다. 판정 로직은 [shared](shared.md) 의 `useUserLocation`.

- **(2026-06-01) 첫 로드 = 라우트 lazy, 캐시 안정 = vendor 청크 고정** — perf 의
  주된 레버는 **라우트 코드 스플리팅**(첫 청크에서 어드민 16페이지 + `ol` 지도 + 정산
  제거)이고, `codeSplitting.groups` 의 vendor 청크는 *바이트 절감이 아니라 캐시 안정*
  목적 — 앱 코드만 바뀌어도 `ol`/`react`/`@tanstack`/`@radix` 청크가 바뀌지 않아
  사용자가 재다운로드를 안 한다. 어드민은 `path="/admin/*"` 한 곳에 `AdminRoutes` 를
  단일 lazy 로 걸어, 익명 사용자는 어드민 코드를 0바이트 받는다. Suspense 폴백을
  페이지 자체 로딩 스피너와 같은 모양으로 맞춰 청크→데이터 전환 깜빡임 제거.
- **(2026-06-01) interaction 핫패스만 `memo` + 안정 콜백** — 전역 memo 대신 *큰 리스트
  위에서 부모 state 변경이 빈번한* 두 곳(`PublicRestaurantCard` 호버,
  `AdminDiningcodePage` `ResultCard` 체크박스/SSE)만 `memo`. 핵심 조건은 부모가
  **인라인 클로저를 끊고 안정 콜백(인자형 + `useCallback([])`)을 넘기는 것** — 안 그러면
  memo 가 매 렌더 새 함수 props 로 무력화된다. React Compiler 진단 룰(eslint warn)이
  같은 종류의 메모이즈 가능성을 코드 레벨로 본다.
- **(2026-06-01) 크롤 배치 = `setQueryData` 머지, 배치당 re-GET 0** —
  `AdminCrawlTestPage` 가 `visitor_batch` SSE 의 `stream.lastPersistedBatch`(post-dedup
  서버 id 포함)를 detail 캐시(`['restaurant', placeId]`)에 직접 머지(신규만 `summary:null`
  로 prepend, 기존 id skip). 배치마다 `invalidate` 하면 리뷰 리스트 전체를 다시 GET 하는데
  그걸 없앤다 — `useRestaurantSummaryEvents` 의 per-review 머지와 같은 모양. 최종
  `stream.result` 의 invalidate 한 번이 총계를 reconcile. ([stream-driven-cache-merge.md](../concepts/stream-driven-cache-merge.md)
  의 web 측 새 인스턴스 — 잡 SSE 외 어드민 크롤 테스트까지 같은 패턴이 번짐.)
- **(2026-06-01) Lightbox 를 `components/Lightbox.tsx` 로 승격** — 정산 영수증
  Lightbox 와 상세 사진 Lightbox 가 같은 구현(scroll-snap 캐러셀 + portal + dvh +
  backdrop 닫기)을 쓰게 되며 `detail/` 하위에 두던 걸 공용 `components/` 로 올렸다.
  옛 `components/restaurant/detail/Lightbox.tsx` 는 삭제 — import 가 남아 있으면
  typecheck 가 잡는다.
- **(2026-06-01) ESLint 인프라 web 합류** — `@repo/config/eslint/react` flat config 를
  펼치고 React Compiler 진단 룰을 `warn` 으로 도입(기존 코드 위반이 있어 우선 warn —
  회귀 방지·가시성, 점진 정리). web 은 React Compiler 를 빌드에 켜진 않았지만 룰은
  메모이즈 가능성 정적 검사라 유효. `turbo lint` 가 4 워크스페이스(web/friendly/
  api-contract/mobile) 모두 green. 자세한 base 는 [config.md](config.md).
- **(2026-06-01) 공유 SPA 경로 `/s/:token`, `/share/settlements/*` 는 서버 OG** —
  공유 링크를 메신저에 붙이면 미리보기(og:image)가 떠야 해서, `/share/settlements/*`
  를 Fastify 가 OG HTML + PNG 카드로 서버 렌더하는 경로로 비웠다. SPA 가 그 경로를
  먹으면 봇이 받는 건 빈 React 셸이라 미리보기가 안 뜬다. 그래서 사람이 보는 read-only
  SPA 는 `/s/:token` 으로 분리. dev 는 vite proxy, prod 는 nginx 가 `/share/settlements`
  를 Fastify 로 보낸다.

- **(2026-06, 17차) 웹 다크 모드 = localStorage 테마 스토어 + tailwind `@custom-variant
  dark` + vworld midnight/위성 레이어** — `useThemeStore`(`lp:theme`)가 `.dark` 클래스를
  토글하고, tailwind.css `@custom-variant dark (&:where(.dark, .dark *))` 한 줄이
  v4 의 미디어쿼리 기본을 덮어 클래스 토글 모드를 활성화(이 binding 없으면 시스템
  다크 사용자한테만 `dark:*` 발동). 지도는 `MapCanvas` 가 테마를 구독해 vworld
  `Base`↔`midnight` 자동 전환 + 좌하단 `MapLayerControl`(일반/다크/위성) 수동 토글
  — 한 번 수동 선택하면 테마에 더 끌려가지 않는다. 레이어 교체는 map 재생성 없이
  `tileSource.setUrl` + 라벨 색 반전만. **앱과는 디자인 토큰(@repo/shared)만 공유하고
  테마 저장소·구현은 플랫폼별로 분리** — 웹은 zustand+localStorage+`html.dark`,
  앱은 RN 자체 ([platform-ui-split](../concepts/platform-ui-split.md) 의 새 인스턴스).
- **(2026-06, 17차) soft tonal variant = CSS 토큰 한 쌍으로 라이트/다크 동시 정의** —
  badge/button 의 6색(blue/amber/violet/green/red/teal) 은 hex 직접이 아니라
  tailwind.css 의 `--tonal-{color}-bg/-bg-hover/-fg`(oklch) 토큰을 참조. `:root`(라이트)
  + `.dark`(다크) 두 곳에 같은 변수명으로 값만 다르게 둬, 다크 모드에서 자동으로
  어두운 틴트+밝은 글자로 뒤집힌다. 무테두리+틴트가 outline 보다 의미별 색 구분이
  명확해 어드민 액션 버튼을 일괄 교체.
- **(2026-06, 17차) 분석 인터랙션 = 팁/메뉴 클릭 → 리뷰 필터(동시 1개)** —
  `PublicRestaurantDetail` 가 `tipFilter`/`menuFilter` 두 state 를 들고 한쪽을
  고르면 다른 쪽을 해제(동시 1개만). 필터 리셋은 **식당 변경 시에만** — `?tab=` URL
  변경에 묶으면 "팁 클릭 → reviews 전환" 순간 tabProp 변경으로 필터가 즉시 풀리는
  회귀가 난다. 카테고리 트리는 insights 와 별도 endpoint(`useRestaurantPublicCategoryTree`)
  라 훅 규칙상 early-return 위에서 호출하고 roots 비면 섹션 숨김.
- **(2026-06, 17차) 카드 클릭=이동 / 더블클릭=확대 + `flyToZoomIn`(줌아웃 안 함)** —
  목록 카드의 단일 클릭은 선택(지도 fly-to), 더블클릭은 확대. `MapCanvas` 의 신규
  imperative `flyToZoomIn(lat, lng, minZoom)` 은 최소 `minZoom` 까지만 확대 — 이미
  더 확대된 상태면 줌은 유지하고 중심만 옮긴다(더블클릭으로 의도치 않게 줌아웃되는
  걸 방지). 공개·어드민 발견 지도에 통일.
- **(2026-06, 17차) 상세 탭 카드 테두리 제거·리뷰 사진 풀폭 = 앱과 통일** — 리스트
  항목의 `border`+`rounded` 박스를 `divide-y` 구분선 + 풀폭으로 — 모바일 단말에서
  카드 안 박스가 좁아 보이던 걸 앱 스타일에 맞췄다([mobile](mobile.md)).
- **(2026-06, 17차) AdminAnalyticsPage 에 스케줄러 UI 통합** — 별도 페이지가 아니라
  분석 관리 페이지 안 `ScheduleSection` — "정규화→머지" 운영을 보는 곳에서 그 주기
  자동화를 같이 설정. cron 직접 입력 부담을 친화 프리셋 4개로 낮추고, `useSchedulePreview`
  가 valid+다음 실행 시각을 미리 보여 잘못된 cron 을 저장 전 차단. 진행 중 run 은
  `useScheduleRunEvents` SSE 로 live. 서버 cron 등록·run 모델은 [schedule](schedule.md).

### 기존 결정 유지

React 19, Tailwind v4 + shadcn 토큰, `@repo/shared` 경유, stream-driven cache merge,
역할 기반 가드, 다중 슬롯 잡, 재크롤 시 detail 리뷰 비우기, `fetchedAt-asc`,
비디오 프록시 정책, `MapCanvas` ResizeObserver, panelPrefsStore 페이지 namespace,
정산 Stepper 점프 게이팅 = "산출물 존재" 기준 (이번 라운드도 `participantsCount>0`/
`rounds.every(source!=null)`/`itemsCount>0` 으로 유지).

## Gotchas [coverage: high — 30 sources]

- **`Step2Source` 삭제 후 typecheck 가 잡힘** — 이전 라운드에 있던 `import { Step2Source }`
  / `'source'` step key 가 어떤 곳에 남아 있으면 tsc 가 에러 — 모든 호출처를 일괄
  제거해야 한다. step key 도 `'participants' | 'rounds' | 'edit' | 'review'` 로 바뀜.
- **`ParticipantEditDialog` 삭제 = 결과 페이지 "수정" 은 4-step 재진입** —
  이전엔 결과 페이지에서 다이얼로그 만 띄워 참여자 PATCH. 지금은 같은
  `SettlementNewPage` 가 id 와 함께 열려 4-step 으로 진입. 큰 흐름 변화라 신규
  개발자가 "왜 다이얼로그가 아니라 페이지 전환이지?" 의문이 들 수 있다.
- **다중 영수증 추출 = N 번 LLM 호출** — 한 사진 → N 분할 → N 번 vision LLM 호출이라
  한참 걸린다. `MultiReceiptSplitDialog` 가 진행 상황(`done/total` 카운트) UI 를
  명시적으로 보여줘야 사용자가 멈춘 줄 안다 — 안 그러면 30초~1분 대기 중 새로고침.
  서버는 멱등이 아니라(이미 한 슬라이스가 적용된 차수에 다시 적용해도 덮어쓰기)
  중간 취소도 의미 있게 동작해야 함.
- **영수증 swap 시 `?? null` clear** — 차수 source 를 RECEIPT → MANUAL 로 바꿀
  때 `receiptImageToken`/`receiptPreviewUrl` 등 RECEIPT 전용 필드를 명시
  `?? null` 으로 비워야 한다. 옛 토큰이 남아 있으면 결과 페이지가 RECEIPT 모드로
  잘못 렌더링 (이전 라운드 한 번 회귀했던 지점).
- **Tailwind v4 dark 변형 — `@custom-variant dark` 필수** — `(&:where(.dark, .dark *))`
  로 명시 binding 안 하면 nested `dark:bg-*` 같은 utility 가 발동하지 않는다.
  v4 기본은 미디어쿼리 — 클래스 토글 모드와 엇갈림. shadcn CSS variable 만
  토글되니까 "왜 카드 배경은 다크로 바뀌었는데 `dark:text-red-300` 만 안
  바뀌지?" 같은 미묘한 버그로 표면화.
- **`ConfirmDialog` mount-on-demand + portal 고려** — 현재 구현은 `fixed inset-0`
  fixed overlay 패턴. sticky 테이블 안에서 띄우면 sticky 컨테인 블록이 fixed
  를 자기 기준으로 잡아 클리핑할 수 있다. 결과 페이지의 sticky 컬럼 안에서 confirm
  을 띄울 경우 portal 로 body 에 mount 하는 검토 필요 (현재는 sticky 컬럼 밖에서
  호출돼 문제 안 됨).
- **공유 토큰 페이지 = `PublicLayout` 밖** — `/share/settlements/:token` 은
  `PublicLayout` 의 `<Outlet>` 자식이 아니라 별도 라우트. TopBar/사이드바 없음 —
  받는 사람이 보내는 사람의 계정 메뉴를 볼 필요 없다. 신규 페이지에서 PublicTopBar
  안 뜨는 게 버그처럼 보일 수 있으니 주의.
- **`SettlementShareDialog` 자동 POST = 멱등 가정** — 다이얼로그 open 즉시
  `useCreateSettlementShare.mutateAsync(sessionId)`. BE 가 이미 토큰이 있으면
  같은 토큰을 돌려준다는 가정에 의존 — BE 컨트랙트가 바뀌면 FE 가 무한 회전.
- **`RequireUser` ≠ `RequireAdmin`** — 정산은 USER 도 사용 가능이라 `RequireUser`
  가 token 만 보고 role 검사 X. `RequireAdmin` 라우트에 정산 페이지를 잘못 끼우면
  USER 가 진입 못 함. 두 가드 모두 [App.tsx](../../apps/web/src/App.tsx) 안 정의.
- **정산 Stepper 점프 게이팅 = "산출물 존재" 기준** — `canJumpTo` 가
  `participantsCount>0` / `rounds.every(r=>r.source!=null)` / `itemsCount>0` 셋만
  본다. "단계가 한 번이라도 활성화됐는가" 가 아니라 "현재 draft 에 그 단계의
  산출물이 살아있는가". `startFor(placeId)` 로 새 식당 진입 시 reset 되므로 식당을
  바꾸면 모든 단계가 다시 잠긴다. Step1 만 항상 활성.
- **`useSettlementDraftAutoSync` enabled = !isEdit** — edit 모드는 저장된 세션이
  source of truth 라 자동 저장 OFF. create 모드만 디바운스 PUT 발사. 두 모드를
  한 페이지가 다루므로 hook 의 `enabled` 가 isEdit 분기 정확해야 한다 — 잘못
  켜지면 편집 중인 세션 위에 draft 가 덮어 쓰일 수 있다.
- **`copyRoundAttendancesFrom` = 마스터 참여자 기준** — "1차와 동일" 은 1차의
  attended/excludes override 를 그대로 복사. 1차 이후에 추가된 마스터 참여자는
  1차에 없었으므로 새 차수에도 attendances 가 비어 있다. 사용자가 후속 차수에
서 그 참여자를 별도로 체크해야 함.
- **`MAX_ROUNDS = 10`** — zod schema enforced. UI 에서도 "+ 차수 추가" 버튼이
  10차에서 disabled. 11차 이상의 정산은 zod 가 차단.
- **다중 영수증 분할 — placeId 없는 차수는 매핑 대상 X** — 식당 미선택 차수가
  섞이면 서버 추출 요청이 실패하므로 `MultiReceiptSplitDialog` 가 placeId 있는
  차수만 후보로 노출 (`canOpenSplit = splitCandidateRounds.length >= 2`).
- **`SettlementBreakdownTable` sticky z 평면** — 셀의 `sticky z-10` 이 결과 페이지
  헤더 `sticky z-30` 보다 낮아야 한다. 헤더가 표 아래로 깔리면 헤더의 액션 버튼이
  안 눌림. 새 sticky 요소를 추가할 때 z 평면 매번 재검토.
- **`AdminAiKeysPage` 모델 미리보기 = 저장 전 키 사용** — `usePreviewModels` 가
  사용자가 입력한 키를 그대로 백엔드로 보내 라이브 fetch. 잘못된 키면 에러 응답이
  와 노출. 키가 비어 있으면 버튼 disabled — 빈 키로 호출하지 않도록.
- **(2026-05-31) 라이트박스를 상세 컬럼 안에 두면 다시 잘린다** — `detail/Lightbox.tsx`
  는 `createPortal(document.body)` 가 필수. sticky 3-컬럼 레이아웃에서 컬럼별 stacking
  context 때문에 `z-50` 이 컬럼 안에 갇혀 지도 컬럼이 위를 덮는다. portal 을 떼거나 상세
  컬럼 내부 래퍼로 되돌리면 회귀. (Radix Dialog 등은 자체 portal 이 있어 무관하지만 이
  라이트박스는 순수 div 라 명시 portal 필요.)
- **(2026-05-31) 라이트박스 backdrop `onClick` 은 스와이프와 구분해야** — `pointerDownRef`
  좌표 비교(10px) 를 빼면 캐러셀을 스와이프하다 손을 뗀 위치에서 발생하는 click 으로
  라이트박스가 닫힌다. 이미지/버튼 타깃 제외도 같이 유지.
- **(2026-05-31) "내 위치" — `unavailable` 을 통째로 비활성하면 안 됨** — `unavailable` 은
  비-secure context(평문 HTTP)·미지원뿐 아니라 timeout/일시 실패도 포함한다. 통째 disabled
  하면 title 툴팁도 안 뜨고 재시도도 막힌다. 평문 HTTP 만 `window.isSecureContext === false`
  로 따로 분기해 안내, 나머지는 재시도 여지를 남긴다. denied 도 비활성하면 사용자가 설정을
  푼 뒤 다시 시도할 길이 막히므로 callout + refetch.
- **(2026-06-01) `AdminRoutes` 내부 라우트는 `/admin` 상대 경로** — App 에
  `path="/admin/*"` 로 마운트되므로 `AdminRoutes.tsx` 안의 `<Route path>` 는 모두
  `/admin` 기준 상대(`discover`, `settings/ai-keys` …). 절대 경로(`/admin/discover`)로
  쓰면 중첩 매칭이 깨진다. `Navigate` target 만 절대 경로 유지(옛 북마크 호환).
- **(2026-06-01) lazy 청크 + memo 는 안정 콜백 전제** — `memo` 카드(`PublicRestaurantCard`,
  `ResultCard`)는 부모가 인라인 클로저(`onClick={() => ...}` )를 넘기면 매 렌더 새 props 가
  돼 즉시 무력화된다. 반드시 인자형 콜백 + `useCallback([])`/함수형 업데이터로 안정화해야
  bail-out 이 실제로 일어난다. 새 prop 을 추가할 때도 그 prop 이 안정적인지 같이 봐야 함.
- **(2026-06-01) 크롤 배치 머지 — 최종 invalidate 가 총계 보정 역할** — `setQueryData`
  로 배치마다 신규 리뷰만 prepend 하므로, 서버 측 dedup/순서 차이로 클라 캐시 총계가
  미세하게 어긋날 수 있다. `stream.result` 도착 시의 `invalidate(['restaurant', placeId])`
  한 번이 전체를 다시 reconcile 한다 — 이 최종 invalidate 를 빼면 캐시가 영원히 부분
  상태로 남는다.
- **(2026-06-01) Lightbox 는 이제 `~/components/Lightbox`** — `detail/Lightbox.tsx` 는
  삭제됐다. 옛 경로로 import 하면 빌드 실패. 정산·상세가 같은 파일을 공유하므로 한쪽
  변경이 다른 쪽에 영향 — 변경 시 양쪽 사용처(`PhotosTab`/`shared.tsx`/정산) 확인.
- **(2026-06-01) `/s/:token` vs `/share/settlements/*` 혼동 주의** — read-only SPA 는
  `/s/:token`. `/share/settlements/*` 로 진입하면 SPA 가 잡지 않고 Fastify OG/PNG 가
  응답한다(dev 프록시·prod nginx). 공유 링크 생성 코드(`SettlementShareDialog`)가 어느
  URL 을 복사하는지 BE 컨트랙트와 맞춰야 한다 — SPA 경로와 OG 경로를 헷갈리면 미리보기가
  안 뜨거나 사람이 빈 페이지를 본다.
- **(2026-06-01) ESLint 룰은 전부 `warn`** — 기존 코드 위반(set-state-in-effect 등)이
  있어 우선 warn 으로 도입했다. `eslint .` 가 통과해도 경고가 잔존하므로 CI 가 warn 을
  error 로 격상하지 않도록 주의(점진 정리 정책). `**/*.js` 는 stale tsc 산출물이라
  대상 제외 — `.tsx` 만 lint.
- **(2026-06, 17차) `MapLayerControl` 수동 선택 후 테마 변경 무시** — `MapCanvas` 가
  `userPickedLayerRef` 로 사용자의 수동 레이어 선택을 기억한다. 한 번 토글하면 이후
  light↔dark 테마 변경에 지도 레이어가 더 따라가지 않는다(의도). "다크 모드로 바꿨는데
  지도는 그대로네?" 는 버그가 아니라 사용자가 이전에 위성/일반을 직접 골라둔 경우다.
- **(2026-06, 17차) 레이어 교체는 같은 URL `setUrl` 금지(첫 렌더 skip)** — `MapCanvas`
  의 레이어 effect 는 `layerInitRef` 로 첫 렌더를 건너뛴다. map-create effect 가 이미
  올바른 레이어로 만들었는데 같은 URL 로 `setUrl` 하면 OL 이 타일을 통째로 리프레시해
  깜빡인다. 라벨 색 반전은 `vectorSource.changed()`(재평가)만 — feature 재생성 X.
- **(2026-06, 17차) 팁/메뉴 필터 리셋은 식당 변경에만 묶어야** — `PublicRestaurantDetail`
  의 `tipFilter`/`menuFilter` 리셋을 `?tab=`(tabProp) 변경에 묶으면, controlled 모드에서
  "팁 클릭 → reviews 탭 전환" 순간 tabProp 이 바뀌며 방금 건 필터가 즉시 풀린다. 반드시
  placeId(식당) 변경만 트리거.
- **(2026-06, 17차) `useRestaurantPublicCategoryTree` 는 early-return 위에서 호출** —
  `InsightsTab` 이 `insightsLoading` early-return 을 갖는데, 카테고리 트리 훅을 그 아래
  두면 Rules of Hooks 위반. early-return 위에서 호출하고 `roots.length === 0` 이면
  섹션만 숨긴다(전역 머지가 닿은 식당만 roots 가 채워짐).
- **(2026-06, 17차) tonal variant 색은 tailwind.css 토큰 의존** — badge/button 의
  `bg-[var(--tonal-*-bg)]` 는 tailwind.css `:root`+`.dark` 에 정의된 CSS 변수를 읽는다.
  토큰을 지우거나 한쪽(라이트/다크)만 두면 그 모드에서 배경이 비어 투명/검정으로 깨진다.
  새 tonal 색 추가 시 `:root` 와 `.dark` 양쪽에 3개 변수 쌍을 모두 넣을 것.
- **(2026-06, 17차) `ScheduleSection` config draft 동기화 useEffect** — `config.data`
  도착 시 draftCron/timezone/customMode 를 동기화하는 useEffect 가 `cronExpr`/`timezone`
  deps 만 본다(`eslint-disable exhaustive-deps`). draft 가 dirty 한 상태에서 config 가
  refetch 되면 사용자 입력이 덮일 수 있으니 deps 변경 시 주의. cron 유효성은
  `useSchedulePreview` 의 `valid` 로 판단 — invalid 면 save 차단.
- **이전 라운드 함정들 유지** — sticky containing block trap, `overflow-y:auto`
  안 sticky 동작, 모바일 body 스크롤 + `100dvh`, 한글 IME 미완성 조합, Pretendard
  CDN 의존, ImgWithFallback src 변경 reset, OL apiKey 변경만 재생성, Lightbox
  글로벌 keydown, Radix Dialog 안 OL, SSE `?token` 쿼리 인증, AdminDiningcodePage
  선택 자동 초기화, DC-only canonical 행 클릭 불활성, MergeProposalQueue "전체
  다시 돌리기" 큐 비우지 않음, sticky 액션바 z-index, MAX_BULK=50, 자동 발견
  groupIndex<0 분기, 영수증 미리보기 = JWT 필요 → `<img src>` 직접 X, 그 외
  이전 라운드 다수.

## Sources [coverage: high — 98 sources]

- [apps/web/src/stores/theme.ts](../../apps/web/src/stores/theme.ts) — *17차: lp:theme localStorage 테마 스토어 (MapCanvas 가 구독)*
- [apps/web/src/components/restaurant/MapLayerControl.tsx](../../apps/web/src/components/restaurant/MapLayerControl.tsx) — *new 17차: 좌하단 일반/다크(midnight)/위성 레이어 토글*
- [apps/web/src/components/restaurant/MyLocationButton.tsx](../../apps/web/src/components/restaurant/MyLocationButton.tsx) — *new 17차: "내 위치" 공용 버튼 (공개+어드민 발견), denied/insecure callout*
- [apps/web/src/components/restaurant/detail/CategoryTree.tsx](../../apps/web/src/components/restaurant/detail/CategoryTree.tsx) — *new 17차: 식당별 메뉴 카테고리 트리*
- [apps/web/package.json](../../apps/web/package.json) — *modified: lint 스크립트 + eslint ^10 + vite ^8 + ol ^10.9*
- [apps/web/index.html](../../apps/web/index.html)
- [apps/web/vite.config.ts](../../apps/web/vite.config.ts) — *modified: Vite8/Rolldown codeSplitting.groups + /share/settlements OG 프록시*
- [apps/web/tsconfig.json](../../apps/web/tsconfig.json)
- [apps/web/.env.example](../../apps/web/.env.example)
- [apps/web/eslint.config.mjs](../../apps/web/eslint.config.mjs) — *new: @repo/config/eslint/react flat config + React Compiler 룰 warn*
- [apps/web/src/main.tsx](../../apps/web/src/main.tsx)
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx) — *modified: 라우트 React.lazy + 최상위 Suspense + /s/:token*
- [apps/web/src/routes/admin/AdminRoutes.tsx](../../apps/web/src/routes/admin/AdminRoutes.tsx) — *new: 어드민 16 라우트 단일 lazy 청크*
- [apps/web/src/components/Lightbox.tsx](../../apps/web/src/components/Lightbox.tsx) — *new (승격): detail/Lightbox.tsx 에서 정산·상세 공용으로 이동 — createPortal(body) + backdrop 닫기*
- [apps/web/src/routes/HomePage.tsx](../../apps/web/src/routes/HomePage.tsx) — *modified: 랭킹 행 → Link /restaurants-v2/:placeId*
- [apps/web/src/routes/LoginPage.tsx](../../apps/web/src/routes/LoginPage.tsx)
- [apps/web/src/routes/RestaurantsPage.tsx](../../apps/web/src/routes/RestaurantsPage.tsx) — *modified 17차: 카드 더블클릭=확대(flyToZoomIn) + Outlet Suspense + useCallback perf*
- [apps/web/src/routes/RestaurantDetailRoute.tsx](../../apps/web/src/routes/RestaurantDetailRoute.tsx)
- [apps/web/src/routes/RestaurantsV2Page.tsx](../../apps/web/src/routes/RestaurantsV2Page.tsx) — *modified 17차: 카드 더블클릭=확대(flyToZoomIn) + Outlet Suspense + useCallback perf*
- [docs/mobile-public-restaurant-ux.md](../../docs/mobile-public-restaurant-ux.md)
- [apps/web/src/routes/admin/AdminHomePage.tsx](../../apps/web/src/routes/admin/AdminHomePage.tsx)
- [apps/web/src/routes/admin/AdminCrawlTestPage.tsx](../../apps/web/src/routes/admin/AdminCrawlTestPage.tsx) — *modified: visitor_batch setQueryData 머지(상세 re-GET 제거)*
- [apps/web/src/routes/admin/AdminRestaurantsPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantsPage.tsx) — *modified 17차: soft tonal variant 적용*
- [apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx) — *modified 17차: soft tonal variant 적용*
- [apps/web/src/routes/admin/AdminAnalyticsPage.tsx](../../apps/web/src/routes/admin/AdminAnalyticsPage.tsx) — *modified 17차: ScheduleSection 스케줄러 UI(cron preset+preview+SSE) + tonal variant + 카테고리 트리 기본 접힘*
- [apps/web/src/routes/admin/AdminAiKeysPage.tsx](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx)
- [apps/web/src/routes/admin/AdminAiTestPage.tsx](../../apps/web/src/routes/admin/AdminAiTestPage.tsx)
- [apps/web/src/routes/admin/AdminSettingsPage.tsx](../../apps/web/src/routes/admin/AdminSettingsPage.tsx)
- [apps/web/src/routes/admin/AdminMapKeysPage.tsx](../../apps/web/src/routes/admin/AdminMapKeysPage.tsx)
- [apps/web/src/routes/admin/AdminDiscoverPage.tsx](../../apps/web/src/routes/admin/AdminDiscoverPage.tsx) — *modified 17차: 카드 클릭=이동/더블클릭=확대 + MyLocationButton*
- [apps/web/src/routes/admin/AdminAutoDiscoverPage.tsx](../../apps/web/src/routes/admin/AdminAutoDiscoverPage.tsx)
- [apps/web/src/components/admin/auto-discover/AutoDiscoverForm.tsx](../../apps/web/src/components/admin/auto-discover/AutoDiscoverForm.tsx)
- [apps/web/src/components/admin/auto-discover/AutoDiscoverJobCard.tsx](../../apps/web/src/components/admin/auto-discover/AutoDiscoverJobCard.tsx)
- [apps/web/src/routes/admin/AdminCatchtableTestPage.tsx](../../apps/web/src/routes/admin/AdminCatchtableTestPage.tsx)
- [apps/web/src/routes/admin/AdminCatchtableShopPage.tsx](../../apps/web/src/routes/admin/AdminCatchtableShopPage.tsx)
- [apps/web/src/routes/admin/AdminDiningcodePage.tsx](../../apps/web/src/routes/admin/AdminDiningcodePage.tsx) — *modified: ResultCard memo + toggleOne useCallback*
- [apps/web/src/routes/admin/AdminDiningcodeShopPage.tsx](../../apps/web/src/routes/admin/AdminDiningcodeShopPage.tsx) — *modified: 다이닝코드 메뉴 Rules of Hooks fix*
- [apps/web/src/routes/admin/AdminDiningcodeTestPage.tsx](../../apps/web/src/routes/admin/AdminDiningcodeTestPage.tsx)
- [apps/web/src/components/admin/discover/DiscoverMap.tsx](../../apps/web/src/components/admin/discover/DiscoverMap.tsx) — *modified 17차: MyLocationButton + flyToZoomIn 더블클릭 확대*
- [apps/web/src/components/admin/discover/DiscoverPanel.tsx](../../apps/web/src/components/admin/discover/DiscoverPanel.tsx) — *modified 17차: 카드 onZoom 전달*
- [apps/web/src/stores/panelPrefsStore.ts](../../apps/web/src/stores/panelPrefsStore.ts)
- [apps/web/src/stores/settlementPrefsStore.ts](../../apps/web/src/stores/settlementPrefsStore.ts)
- [apps/web/src/components/PublicLayout.tsx](../../apps/web/src/components/PublicLayout.tsx) — *modified: perf 소폭*
- [apps/web/src/components/PublicTopBar.tsx](../../apps/web/src/components/PublicTopBar.tsx)
- [apps/web/src/components/PublicSidebar.tsx](../../apps/web/src/components/PublicSidebar.tsx)
- [apps/web/src/components/ImgWithFallback.tsx](../../apps/web/src/components/ImgWithFallback.tsx)
- [apps/web/src/components/ThemeToggle.tsx](../../apps/web/src/components/ThemeToggle.tsx)
- [apps/web/src/components/admin/AdminLayout.tsx](../../apps/web/src/components/admin/AdminLayout.tsx)
- [apps/web/src/components/admin/AdminTopBar.tsx](../../apps/web/src/components/admin/AdminTopBar.tsx)
- [apps/web/src/components/restaurant/ActiveJobPanel.tsx](../../apps/web/src/components/restaurant/ActiveJobPanel.tsx)
- [apps/web/src/components/restaurant/sections.tsx](../../apps/web/src/components/restaurant/sections.tsx) — *modified: perf 소폭*
- [apps/web/src/components/restaurant/MenuRankingSection.tsx](../../apps/web/src/components/restaurant/MenuRankingSection.tsx)
- [apps/web/src/components/restaurant/MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx) — *modified 17차: 테마 구독 레이어 전환(Base/midnight/satellite) + setUrl 교체 + flyToZoomIn + 라벨 반전*
- [apps/web/src/components/restaurant/VWorldMap.tsx](../../apps/web/src/components/restaurant/VWorldMap.tsx)
- [apps/web/src/components/restaurant/PublicRestaurantList.tsx](../../apps/web/src/components/restaurant/PublicRestaurantList.tsx) — *modified 17차: onZoomItem 전달(더블클릭 확대) + 안정 콜백(카드 memo 용)*
- [apps/web/src/components/restaurant/PublicRestaurantCard.tsx](../../apps/web/src/components/restaurant/PublicRestaurantCard.tsx) — *modified 17차: onZoom 더블클릭 확대 + memo(호버 시 80카드 리렌더 차단)*
- [apps/web/src/components/restaurant/PublicRestaurantsMap.tsx](../../apps/web/src/components/restaurant/PublicRestaurantsMap.tsx) — *modified 17차: MyLocationButton 추출 사용 + flyToZoomIn*
- [apps/web/src/components/restaurant/CanonicalMergePanel.tsx](../../apps/web/src/components/restaurant/CanonicalMergePanel.tsx) — *modified 17차: soft tonal variant*
- [apps/web/src/components/restaurant/MergeProposalQueue.tsx](../../apps/web/src/components/restaurant/MergeProposalQueue.tsx) — *modified 17차: soft tonal variant*
- [apps/web/src/components/restaurant/ReanalyzeFailedBadge.tsx](../../apps/web/src/components/restaurant/ReanalyzeFailedBadge.tsx)
- [apps/web/src/components/restaurant/detail/PublicRestaurantDetail.tsx](../../apps/web/src/components/restaurant/detail/PublicRestaurantDetail.tsx) — *modified 17차: tipFilter/menuFilter state(동시 1개, 식당 변경 시 리셋)*
- [apps/web/src/components/restaurant/detail/HomeTab.tsx](../../apps/web/src/components/restaurant/detail/HomeTab.tsx) — *modified 17차: onSelectTip/onSelectMenu + 카드 테두리 제거(divide-y)*
- [apps/web/src/components/restaurant/detail/MenuTab.tsx](../../apps/web/src/components/restaurant/detail/MenuTab.tsx) — *modified 17차: onSelectMenu 클릭 필터*
- [apps/web/src/components/restaurant/detail/ReviewsTab.tsx](../../apps/web/src/components/restaurant/detail/ReviewsTab.tsx) — *modified 17차: tip/menu 필터 prop + clear 칩*
- [apps/web/src/components/restaurant/detail/InsightsTab.tsx](../../apps/web/src/components/restaurant/detail/InsightsTab.tsx) — *modified 17차: CategoryTree + 메뉴/팁 클릭 버튼 필터 + 카드 테두리 제거*
- [apps/web/src/components/restaurant/detail/PhotosTab.tsx](../../apps/web/src/components/restaurant/detail/PhotosTab.tsx) — *modified: import ~/components/Lightbox*
- ~~apps/web/src/components/restaurant/detail/Lightbox.tsx~~ — *삭제 (→ apps/web/src/components/Lightbox.tsx 로 승격)*
- [apps/web/src/components/restaurant/detail/InfoTab.tsx](../../apps/web/src/components/restaurant/detail/InfoTab.tsx) — *modified 17차: 블로그 리뷰 카드 테두리 제거(divide-y)*
- [apps/web/src/components/restaurant/detail/shared.tsx](../../apps/web/src/components/restaurant/detail/shared.tsx) — *modified 17차: AiSummary 팁 클릭 + 메뉴 썸네일 라이트박스 + import ~/components/Lightbox*
- [apps/web/src/components/restaurant/detail/tabs.ts](../../apps/web/src/components/restaurant/detail/tabs.ts)
- [apps/web/src/components/restaurant-v2/BottomSheet.tsx](../../apps/web/src/components/restaurant-v2/BottomSheet.tsx)
- [apps/web/src/components/ui/button.tsx](../../apps/web/src/components/ui/button.tsx) — *modified 17차: soft tonal 6색 variant*
- [apps/web/src/components/ui/card.tsx](../../apps/web/src/components/ui/card.tsx)
- [apps/web/src/components/ui/input.tsx](../../apps/web/src/components/ui/input.tsx)
- [apps/web/src/components/ui/table.tsx](../../apps/web/src/components/ui/table.tsx)
- [apps/web/src/components/ui/badge.tsx](../../apps/web/src/components/ui/badge.tsx) — *modified 17차: soft tonal 6색 variant*
- [apps/web/src/components/ui/pager.tsx](../../apps/web/src/components/ui/pager.tsx)
- [apps/web/src/components/ui/confirm-dialog.tsx](../../apps/web/src/components/ui/confirm-dialog.tsx)
- [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts)
- [apps/web/src/lib/vworld.ts](../../apps/web/src/lib/vworld.ts)
- [apps/web/src/styles/global.css](../../apps/web/src/styles/global.css)
- [apps/web/src/styles/tailwind.css](../../apps/web/src/styles/tailwind.css) — *modified 17차: --tonal-* 토큰(라이트/다크 한 쌍) + @custom-variant dark*
- [apps/web/src/components/ThemeToggle.tsx](../../apps/web/src/components/ThemeToggle.tsx) — *useThemeStore 소비(html.dark 토글) — 이번 라운드 다크 모드 진입점*
- [apps/web/src/routes/settlement/SettlementNewPage.tsx](../../apps/web/src/routes/settlement/SettlementNewPage.tsx)
- [apps/web/src/routes/settlement/Step1Participants.tsx](../../apps/web/src/routes/settlement/Step1Participants.tsx)
- [apps/web/src/routes/settlement/Step2Rounds.tsx](../../apps/web/src/routes/settlement/Step2Rounds.tsx)
- [apps/web/src/routes/settlement/Step3Edit.tsx](../../apps/web/src/routes/settlement/Step3Edit.tsx)
- [apps/web/src/routes/settlement/Step4Review.tsx](../../apps/web/src/routes/settlement/Step4Review.tsx)
- [apps/web/src/routes/settlement/SettlementResultPage.tsx](../../apps/web/src/routes/settlement/SettlementResultPage.tsx)
- [apps/web/src/routes/settlement/SettlementHistoryPage.tsx](../../apps/web/src/routes/settlement/SettlementHistoryPage.tsx)
- [apps/web/src/routes/settlement/SharedSettlementPage.tsx](../../apps/web/src/routes/settlement/SharedSettlementPage.tsx)
- [apps/web/src/routes/settlement/ContactsPage.tsx](../../apps/web/src/routes/settlement/ContactsPage.tsx)
- [apps/web/src/routes/settlement/ContactEditDialog.tsx](../../apps/web/src/routes/settlement/ContactEditDialog.tsx)
- [apps/web/src/routes/settlement/ContactPickerDialog.tsx](../../apps/web/src/routes/settlement/ContactPickerDialog.tsx)
- [apps/web/src/routes/settlement/ContactSuggestions.tsx](../../apps/web/src/routes/settlement/ContactSuggestions.tsx)
- [apps/web/src/routes/settlement/RestaurantSearchDialog.tsx](../../apps/web/src/routes/settlement/RestaurantSearchDialog.tsx)
- [apps/web/src/routes/settlement/MenuPickerDialog.tsx](../../apps/web/src/routes/settlement/MenuPickerDialog.tsx)
- [apps/web/src/routes/settlement/MultiReceiptSplitDialog.tsx](../../apps/web/src/routes/settlement/MultiReceiptSplitDialog.tsx)
- [apps/web/src/routes/settlement/RoundDiscountEditor.tsx](../../apps/web/src/routes/settlement/RoundDiscountEditor.tsx)
- [apps/web/src/routes/settlement/RoundExceptionsEditor.tsx](../../apps/web/src/routes/settlement/RoundExceptionsEditor.tsx)
- [apps/web/src/routes/settlement/RoundCategoryAdjuster.tsx](../../apps/web/src/routes/settlement/RoundCategoryAdjuster.tsx)
- [apps/web/src/routes/settlement/SettlementBreakdownTable.tsx](../../apps/web/src/routes/settlement/SettlementBreakdownTable.tsx)
- [apps/web/src/routes/settlement/SettlementShareDialog.tsx](../../apps/web/src/routes/settlement/SettlementShareDialog.tsx)
- [apps/web/src/routes/settlement/SettlementCards.tsx](../../apps/web/src/routes/settlement/SettlementCards.tsx)
