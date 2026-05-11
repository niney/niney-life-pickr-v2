---
topic: web
last_compiled: 2026-05-09
sources_count: 54
status: active
aliases: [vite, react, web-app, frontend-web, admin-discover, panel-side-toggle, batch-crawl, naver-search-results, panelPrefsStore, usePanelSide]
---

# web — Vite + React 웹 앱

## Purpose [coverage: high — 6 sources]

`apps/web/`는 Life Pickr 서비스의 브라우저용 SPA다. 두 가지 사용 흐름을 한
번들 안에 담는다.

- **공개 사용자 화면** — 로그인 없이 누구나 접근 가능한 맛집 탐색 영역.
  - `/` HomePage — AI 분석된 리뷰의 긍정/부정 비율로 정렬한 식당 랭킹
    ([HomePage](../../apps/web/src/routes/HomePage.tsx))
  - `/restaurants` RestaurantsPage — 네이버 지도 패턴의 풀 뷰포트 검색 UI.
    좌측 결과 리스트 + (선택 시) 가운데 상세 패널 + 우측 OpenLayers 지도
    ([RestaurantsPage](../../apps/web/src/routes/RestaurantsPage.tsx))
  - `/login` LoginPage — 이메일 로그인 + 회원가입 + 게스트 진입
    ([LoginPage](../../apps/web/src/routes/LoginPage.tsx))
- **어드민 콘솔** — 사용자/역할 관리, 맛집 등록·상세 보기·재크롤링,
  네이버 플레이스 크롤링 실험, **LLM 키 + 지도 키 통합 설정 페이지**,
  **AI 분석 관리(메뉴 정규화 + 전역 머지 + 카테고리 트리 + 전역 메뉴 통계)**,
  **맛집 발견 페이지 (네이버 PC 지도 검색 + 다중 선택 일괄 크롤링)**
  (`/admin/*`). 역할이 `ADMIN`인 계정만 접근 가능.

`apps/mobile`(React Native)와 동일한 백엔드(`apps/friendly`)를 바라보며,
공통 도메인 로직은 `@repo/shared`에서 끌어 쓴다. 공개 페이지는 사용자
대상 — 디자인은 Pretendard 폰트 + 네이버 지도 톤. 어드민은 운영 도구
— shadcn 디폴트 + system-ui.

## Architecture [coverage: high — 22 sources]

### 빌드 / 런타임

- **Vite 6 + `@vitejs/plugin-react`** — 정적 SPA 번들러
  ([vite.config.ts](../../apps/web/vite.config.ts)).
- **React 19 + react-dom 19** — `createRoot`/`StrictMode`로 마운트
  ([main.tsx](../../apps/web/src/main.tsx),
  [package.json](../../apps/web/package.json)).
- **TypeScript 5.7**, `@repo/config/tsconfig/react.json` 확장
  ([tsconfig.json](../../apps/web/tsconfig.json)).
- 경로 별칭 `~/* → ./src/*` (Vite alias + tsconfig paths 양쪽에 정의).
- `extensions` 우선순위에 `.web.tsx`/`.web.ts`가 들어 있어, 향후
  플랫폼 분기 파일을 만들 여지가 있다.
- 진입 HTML은 한국어 로케일 + `Life Pickr` 타이틀
  ([index.html](../../apps/web/index.html)). `<head>`에서 jsDelivr CDN
  으로 **Pretendard variable** dynamic-subset CSS를 미리 로드 +
  `lp:theme` localStorage 값으로 다크모드 FOUC 방지 인라인 스크립트.
- **OpenLayers 10.7** (`ol@^10.7.0`) 의존성 추가 — 지도 캔버스 라이브러리.
  vworld JS SDK 대신 OL을 쓴다.

### 라우팅

`react-router-dom` v7을 `BrowserRouter`로 사용한다
([App.tsx](../../apps/web/src/App.tsx)). 셸은 두 갈래로 분기.

| Path | Element | Wrapper |
| --- | --- | --- |
| `/` | `HomePage` | `PublicLayout` |
| `/restaurants` | `RestaurantsPage` | `PublicLayout` |
| `/login` | `LoginPage` | (단독) |
| `/admin` (index) | `AdminHomePage` | `AdminLayout` + `RequireAdmin` |
| `/admin/discover` | `AdminDiscoverPage` | ↑ |
| `/admin/restaurants` | `AdminRestaurantsPage` | ↑ |
| `/admin/restaurants/:placeId` | `AdminRestaurantDetailPage` | ↑ |
| `/admin/analytics` | `AdminAnalyticsPage` | ↑ |
| `/admin/crawl-test`, `:jobId` | `AdminCrawlTestPage` | ↑ |
| `/admin/ai-test` | `AdminAiTestPage` | ↑ |
| `/admin/ai-keys` | `<Navigate to="/admin/settings/ai-keys" replace>` | ↑ (북마크 호환) |
| `/admin/settings` | `AdminSettingsPage` (Outlet) | ↑ |
| `/admin/settings` (index) | `<Navigate to="ai-keys" replace>` | ↑ |
| `/admin/settings/ai-keys` | `AdminAiKeysPage` | ↑ |
| `/admin/settings/map` | `AdminMapKeysPage` | ↑ |

`RequireAdmin`은 `useCurrentUser()`로 역할을 검증하고, 캐시된 `user`가
없을 때만 로딩 화면을 띄우는 식으로 깜빡임을 줄인다.

### 공개 셸 — `PublicLayout`

[`PublicLayout`](../../apps/web/src/components/PublicLayout.tsx)은
`flex min-h-screen flex-col font-pretendard` 컨테이너 +
`PublicTopBar` + `PublicSidebar`(모바일 햄버거) + `<Outlet/>`. `font-pretendard`
는 root 에 박혀 공개 페이지 전체에 Pretendard 가 적용되고, 어드민은
이 클래스가 없어 system-ui fallback.

- [`PublicTopBar`](../../apps/web/src/components/PublicTopBar.tsx) —
  sticky h-14 헤더. md 이상에서 inline NavLink (`홈` / `맛집`),
  md 미만에서 햄버거 버튼. 우측에 `ThemeToggle` + 로그인/유저 정보 +
  ADMIN 사용자에겐 "관리자" 링크.
- [`PublicSidebar`](../../apps/web/src/components/PublicSidebar.tsx) —
  md 미만에서만 작동하는 좌측 슬라이드 패널. ESC + backdrop 클릭 닫기,
  `pointer-events-none` 으로 닫혔을 때 클릭 통과. NAV 항목 클릭 시
  자동 닫기.

### 어드민 셸

[`AdminLayout`](../../apps/web/src/components/admin/AdminLayout.tsx)이
좌측 사이드바(NavLink) + 상단 `AdminTopBar` + `<Outlet/>` 본문 패턴.
메뉴 항목은 7개 (홈 다음에 "맛집 발견" 신규 추가):

| Icon (lucide) | Label | Path |
| --- | --- | --- |
| `Home` | 홈 | `/admin` (`end: true`) |
| `Compass` | 맛집 발견 | `/admin/discover` |
| `UtensilsCrossed` | 맛집 | `/admin/restaurants` |
| `BarChart3` | AI 분석 관리 | `/admin/analytics` |
| `Beaker` | 크롤링 테스트 | `/admin/crawl-test` |
| `Sparkles` | AI 테스트 | `/admin/ai-test` |
| `Settings` | 설정 | `/admin/settings` |

활성 NavLink는 `bg-primary text-primary-foreground`로 강조, 그 외엔
`text-muted-foreground hover:bg-accent`. 하단에 "← 일반 화면으로"
탈출 링크가 항상 박혀 있다.

### 공개 맛집 페이지 — 3-column 풀 뷰포트

[`RestaurantsPage`](../../apps/web/src/routes/RestaurantsPage.tsx)는
네이버 지도와 같은 풀 뷰포트 검색 UI. 헤더 h-14 를 빼면
`h-[calc(100vh-3.5rem)]` 가 페이지 영역 — 스크롤 없이 내부에서 자기
스크롤만.

- **xl(>=1280) 이상** — 3-column 레이아웃:
  - 좌측 `aside` (400px) → `PublicRestaurantList`
  - 가운데 `aside` (440px, **placeId 있을 때만 mount**) →
    `PublicRestaurantDetail`. xl+ 에서는 list 와 map 사이의 별도
    column 으로 박힌다.
  - 우측 `section` (flex-1) → `PublicRestaurantsMap`
- **xl 미만** — `mobileView: 'list' | 'map'` 토글 (페이지 하단 중앙
  rounded pill 버튼 두 개). 상세 패널은 mount 됐을 때 list aside 영역
  위에 `absolute inset-y-0 z-30` 으로 덮어쓰기. mobileView=map 이면
  상세도 같이 숨김 (사용자가 명시적으로 지도 모드로 갔으니).
- **패널 좌/우 토글 적용** — `PublicRestaurantList` 검색 input 옆에
  ⇄ 버튼(`PanelLeftOpen`/`PanelRightOpen` 아이콘) 추가. xl+ 에서만 노출.
  컨테이너에 `xl:flex-row-reverse` 조건부 + list aside 와 detail aside
  양쪽 모두 `xl:border-l` ↔ `xl:border-r` swap. xl 미만의 detail
  absolute 패턴은 그대로 (mobileView 토글 영향 없음). 페이지별 namespace
  로 `panelPrefsStore` 관리 — 기본값 `public.restaurants: 'left'`.

URL state — `useSearchParams`가 single source of truth:

| Param | 의미 |
| --- | --- |
| `q` | 검색어 (식당명/카테고리/메뉴 contains) |
| `category` | 카테고리 칩 (한식/일식/중식/카페/디저트/술집/양식/분식 8종 + free text) |
| `sort` | `recent` (기본, URL에 없음) / `satisfaction` / `positive` / `rating` |
| `bbox` | "minLng,minLat,maxLng,maxLat" 5자리 소수 — "이 지역 재검색" 후 적용된 영역 |
| `placeId` | 상세 패널 열림 — 닫힘일 땐 키 자체가 없음 |

`setParam(key, value)` 헬퍼는 `setSearchParams((prev) => {...})` +
`{replace: true}` — 입력 한 글자마다 history entry 가 쌓이지 않도록.
`useEffect` 로 useState 와 URL 을 동기화하는 패턴 회피 — onChange 안에서
즉시 URL 갱신. `hoveredPlaceId` 만 일시적이라 로컬 useState (마커 강조
즉시 반영, URL 까진 안 가져감).

### 공개 맛집 — 컴포넌트 트리

`apps/web/src/components/restaurant/` 디렉토리 한 묶음.

- **`PublicRestaurantList.tsx`** — 좌측 패널.
  - 헤더: 검색 input(`Search` 아이콘 + 입력 비우기 `XCircle`) +
    카테고리 칩 8종 (toggle — 동일 카테고리 재클릭 시 해제) + 결과 카운트
    + 정렬 select.
  - 본문: 스크롤 가능한 `<ul>` of `PublicRestaurantCard`. 빈 상태 분기
    (loading/error/empty).
- **`PublicRestaurantCard.tsx`** — 한 행의 식당 카드.
  - 80x80 썸네일(`ImgWithFallback`) + 이름 + 카테고리 + 도로명/지번 주소
    + 별점 + 리뷰수 + 만족도 + **좌표 없음 뱃지**(amber).
  - AI 분석된 리뷰가 있으면 가로 막대(emerald/zinc/rose) + 긍정/부정/
    분석 카운트.
  - selected 상태(`border-primary/60 bg-primary/5`) + hover 효과.
- **`PublicRestaurantsMap.tsx`** — 우측 지도 wrapper.
  - `useMapPublicConfig()` 로 vworld 공개 키 fetch — 키 미등록 시
    (`ApiError.statusCode === 404`) "관리자가 설정 > 지도에서..."
    placeholder.
  - 좌표 있는 식당만 `MapMarker` 로 변환. `selectedPlaceId` 의 마커는
    label 노출(다른 마커는 라벨 숨김으로 시각 노이즈 줄임).
  - 호버 우선 강조 (`hoveredPlaceId ?? selectedPlaceId`) → `flyTo`
    imperative.
  - 사용자가 패닝/줌으로 `pendingViewport` 가 URL `appliedBbox` 와 다른
    영역으로 이동하면 하단 중앙 "이 지역에서 재검색" 버튼 노출.
    `appliedBbox` 가 있으면 우상단 "전체 영역" 해제 버튼.
  - `tileError` 발생 시 (vworld 키 거부 등) 상단에 destructive 배너.
- **`MapCanvas.tsx`** — OpenLayers 저레벨 캔버스.
  - vworld WMTS XYZ source + VectorLayer(마커).
  - 마커 SVG 핀 (32x48, selected 시 40x60 + 더 진한 빨강). `MapMarker.variant?:
    'primary' | 'muted'` 필드 — 'primary' 기본 (`#ef4444`/`#dc2626`
    빨강), 'muted' 회색 (`#94a3b8`/`#64748b`). `makeMarkerStyle(label,
    selected, variant)` 시그니처.
  - imperative API: `flyTo(lat, lng, zoom?)`, `fitToMarkers(padding)` —
    `forwardRef + useImperativeHandle`.
  - `userInteractedRef` flag — `pointerdrag` / `wheel` 이벤트로 사용자
    인터랙션 마크. programmatic move(`flyTo`) 직후 발사되는 moveend 는
    무시 (false 로 리셋).
  - 콜백은 ref 보관 — `onMarkerSelect`/`onViewportChangeEnd`/`onTileError`
    가 매번 새 effect 를 만들지 않게.
  - `apiKey` 변경 시에만 map 재생성 (드물게 일어남). 마커 변경은
    `vectorSource.clear() + addFeature` 로 패치.
  - **`ResizeObserver`** — 컨테이너 크기 변화 감지해 `mapRef.current
    .updateSize()` 자동 트리거. 좌/우 패널 토글, 윈도우 리사이즈, 어드민
    detail 슬라이드오버 등 모든 사이즈 변경 케이스를 한 곳에서 커버.
    `apiKey` mount effect 안에서 같이 init/disconnect.

### 공개 맛집 — 5탭 상세 패널

`apps/web/src/components/restaurant/detail/` 디렉토리. 옛
`panel/PublicRestaurantPanel.tsx` 단일 파일에서 두 차례 리팩터로 분해됨
(panel 단일 → panel/ 5탭 분해 → detail/ 디렉토리 + `PublicRestaurantDetail`
export 로 재명명, 좌측 "목록 패널" 과 가운데 "상세 패널" 명료화).

- **`PublicRestaurantDetail.tsx`** — root.
  - `useRestaurantPublic(placeId)` + `useRestaurantPublicInsights(placeId)`
    한 번씩 fetch — 탭 전환은 컨텐츠만 바꾸고 추가 호출 없음.
  - 헤더(목록 버튼 + 식당명 + 닫기 X) + sticky 탭 바
    (`role="tablist"`) + 활성 탭 컨텐츠.
  - 탭 상태는 내부 `useState<TabKey>('home')`. **placeId 가 바뀌면**
    (다른 식당 클릭) `useEffect([placeId])` 로 자동 'home' reset —
    어떤 식당이든 첫 인상은 홈 탭.
  - 404 분기 (`ApiError.statusCode === 404`) — "요청한 식당을 찾을 수
    없습니다.".
- **`tabs.ts`** — `TabKey = 'home' | 'menu' | 'reviews' | 'photos' | 'info'`
  + `TAB_ORDER` 라벨 매핑. 단일 source.
- **`HomeTab.tsx`** — 홈 탭.
  - 헤더 사진 (16:9 hero, 클릭 → photos 탭. `imageUrls.length > 1` 이면
    "사진 N장" 뱃지)
  - 이름/카테고리/별점/리뷰수 + `QuickActions` (네이버 지도 / 길찾기 /
    전화)
  - AI 분석 카드 (`insights.analyzedCount > 0` 일 때만, 아니면 "분석 없음"
    or loading)
  - 대표 메뉴 4개 + "메뉴 전체 보기 (N)" → menu 탭 (4개 이하면 버튼 숨김)
  - 대표 리뷰 3개 — **분석된 리뷰 우선**으로 정렬
    (`Number(!!b.analysis) - Number(!!a.analysis)`) + "리뷰 전체 보기"
    → reviews 탭
  - 영업 정보 1줄 (주소만) + "정보 전체 보기" → info 탭
- **`MenuTab.tsx`** — `snapshot.menus` 전체를 `MenuGrid` 로 노출.
  insights 의 `topMenus` 매칭으로 멘션 카운트 (긍정/부정/총) 표시.
- **`ReviewsTab.tsx`** — 전체 방문자 리뷰.
  - 감정 필터 칩 (전체/긍정/부정 + 카운트 표시 — `analysis.sentiment`
    기반)
  - 정렬 select — "최근 방문순" (`fetchedAt asc`) / "별점 높은순"
  - **`fetchedAt asc` = 방문일 desc** — 어댑터가 SSR 최신 방문 →
    더보기 옛 방문 순서로 즉시 저장하므로. 어드민 detail 정렬과 동일.
  - 빈 결과 ("조건에 맞는 리뷰가 없습니다.") 분기.
- **`PhotosTab.tsx`** — 카테고리별 사진 그리드 + 라이트박스.
  - 3섹션 (`hero`/`menu`/`reviews`) — 각 섹션은 자기 사진 수와 그리드.
  - 모든 사진을 평탄화한 `allImages` 시퀀스 + `sectionOffsets` 맵 —
    클릭 시 `offset + i` 인덱스로 라이트박스 진입. 모달 안에서 다음
    섹션으로 자연스럽게 넘어갈 수 있다.
- **`Lightbox.tsx`** — 풀스크린 캐러셀.
  - `fixed inset-0 z-50 bg-black/85` overlay + 가운데 큰 이미지.
  - 좌우 화살표 키보드 + ChevronLeft/Right 클릭 + ESC 닫기 + backdrop
    클릭 닫기. `e.stopPropagation()` 으로 이미지 영역 클릭은 통과 안 함.
  - `n / total` 카운터 표시.
- **`InfoTab.tsx`** — 영업 정보 + 블로그 리뷰 + 등록일.
  - 도로명 + 지번 / `businessHours` 원문 (`whitespace-pre-line`) /
    `tel:` 링크 / "네이버 지도에서 보기".
  - 블로그 리뷰는 외부 링크 카드 리스트.
  - 푸터에 `firstCrawledAt` 등록일.
- **`shared.tsx`** — 탭들 공유 visual primitive.
  - `QuickActions` — `https://map.naver.com/p/...` deep-link (검색,
    좌표 있을 시 길찾기) + `tel:` 전화.
  - `AiSummary` — 평균 만족도 / 평균 감정 점수 / 가로 4-색 막대(긍정/
    중립/혼합/부정) / topKeywords 뱃지 / topTips 리스트.
  - `MenuGrid` — 메뉴 카드 리스트, insights 의 `topMenus` 매칭으로
    멘션 카운트 표시.
  - `ReviewCard` — 리뷰 한 카드. `analysis.sentiment` 에 따라 emerald/
    rose 톤 보더 + analysis.text(요약) + 본문 + 사진 가로 스크롤 +
    keywords 칩.

### 어드민 발견 페이지 [coverage: high — 4 sources]

[`AdminDiscoverPage`](../../apps/web/src/routes/admin/AdminDiscoverPage.tsx)
는 네이버 PC 지도에서 키워드로 검색 → 결과 마커를 지도에 표시 → 다중
선택 후 일괄 크롤링 흐름을 한 페이지로 묶는다. 이미 등록된 가게는
회색 마커 + [등록됨] 배지 + 체크박스 비활성으로 중복 크롤 방지.

컴포넌트 트리:

- **[`AdminDiscoverPage`](../../apps/web/src/routes/admin/AdminDiscoverPage.tsx)**
  — 페이지 컨테이너. URL `?q=&bbox=&tab=&placeId=` 단일 source of
  truth, 선택 state(`Set<placeId>`), 일괄 startCrawl 트리거.
  - DOM 순서: `[map, detail-aside, list-aside]`. flex 방향 토글로
    자연 좌/우 swap — `panelSide='right'` (일반 flex-row) → 시각적
    [좌:map, 중:detail, 우:list], `panelSide='left'` (flex-row-reverse)
    → 시각적 [좌:list, 중:detail, 우:map]. detail 은 항상 list 옆 (지도
    쪽 방향) 에 붙는다.
  - xl 미만에선 detail 이 absolute 로 패널 영역 위에 덮어쓰기 (xl 미만
    에서 패널이 풀블리드라 자연스럽게 detail 이 그 위로). `animate-in
    slide-in-from-right-4 duration-200` (tailwindcss-animate, 미설치
    시 슬라이드 효과만 빠지고 즉시 표시).
  - 등록 행 클릭 시 detail 은 [`PublicRestaurantDetail`](../../apps/web/src/components/restaurant/detail/PublicRestaurantDetail.tsx)
    그대로 재사용 — 어드민 발견에서도 같은 5탭 컴포넌트.
- **[`DiscoverMap`](../../apps/web/src/components/admin/discover/DiscoverMap.tsx)**
  — vworld 풀블리드 지도. 검색(빨강 = `'primary'`) + 등록(회색 =
  `'muted'`) 합성 마커, 호버/선택 fly-to, 진입 시 등록 마커
  `fitToMarkers`, "이 지역 재검색" 버튼(URL `bbox` 갱신). 컨트롤
  (전체영역 등) 위치는 패널 반대편 모서리(`panelSide` 의존).
  - 같은 placeId 가 검색·등록 양쪽에 있으면 등록(muted) 우선해 중복
    크롤 방지.
- **[`DiscoverPanel`](../../apps/web/src/components/admin/discover/DiscoverPanel.tsx)**
  — 우측(또는 좌측) 패널.
  - 헤더: 검색 input + 좌/우 토글 ⇄ 버튼 (xl+ 만 노출)
  - 검색 디바운스 300ms + Enter 즉시 실행 (clearTimeout 으로 cleanup)
  - URL `q` 가 외부에서 바뀌면 input 동기화 (useEffect — 외부 system
    동기화 케이스라 OK)
  - 탭 바 [검색결과 N | 등록 M]
  - 검색 결과 행 = 체크박스(등록된 항목은 비활성) + 이름/카테고리/
    도로명. 행 클릭 = `onSelectItem` (URL `placeId` 갱신). 등록된
    항목엔 [등록됨] 배지.
  - 등록 맛집 행 = 이름/카테고리/리뷰수/별점/분석수.
  - 활성 잡 N개 안내 카드 (전역 `useActiveCrawlJobStore` 의 jobs.length)
    — 헤더 아래.
  - sticky 하단 바 — `[N개 크롤링 시작]` 버튼 (검색 탭에서 체크된
    항목 있을 때만 노출).

다중 선택 일괄 크롤링 — **직렬 await + 시작 거부 보존**:

```ts
const handleStartSelected = async () => {
  const selected = searchItems.filter((it) => checkedIds.has(it.placeId));
  const failedIds = new Set<string>();
  for (const it of selected) {
    try {
      const r = await startMutation.mutateAsync({ url: it.rawSourceUrl, mode: 'create' });
      if (r.ok) addJob({ jobId: r.jobId, placeId: it.placeId, source: 'list-row', mode: 'create' });
      else failedIds.add(it.placeId);
    } catch { failedIds.add(it.placeId); }
  }
  setCheckedIds(failedIds);  // 시작 거부된 placeId는 체크 상태 유지 → 사용자 재시도 편의
};
```

처음에는 `Promise.allSettled` 병렬이었는데, 백엔드 actor 단위
rate-limit 1초 윈도우에 모두 동시 도착해 1개만 통과되던 버그가 있었다.
직렬 await 로 바꿔 응답 사이 자연 stagger 를 만들었지만, 응답이
수 ms 안에 떨어져 50ms 윈도우로 줄여도 여전히 막힘. 결국 BE 의 actor
rate-limit 자체를 제거 ([crawl](crawl.md) 참조).

### 패널 좌/우 토글 (panelPrefsStore) [coverage: high — 1 source]

신규 [`apps/web/src/stores/panelPrefsStore.ts`](../../apps/web/src/stores/panelPrefsStore.ts)
— Zustand 단일 store. 페이지별 namespace 로 패널 좌/우 위치를 영속화.

- `sides: Record<PanelKey, 'left' | 'right'>`. PanelKey = `'admin.discover'
  | 'public.restaurants'` (네임스페이스로 페이지별 독립).
- localStorage `lp:panelPrefs` 영속화. **zustand persist 미들웨어 안
  쓰고** `setSide` 안에서 직접 `writeStorage` (theme store 와 같은 패턴,
  persist 미들웨어 추가 의존 회피).
- 기본값 — `'admin.discover': 'right'` (사용자 요청), `'public.restaurants':
  'left'` (기존 유지).
- `usePanelSide(key): readonly [PanelSide, () => void]` selector hook
  — useState 와 동일 모양.

xl+ 에서만 토글 버튼 노출 (xl 미만 풀블리드라 의미 없음). 컨테이너
`flex-row-reverse` + aside `xl:border-l ↔ xl:border-r` swap. 두 페이지
(`AdminDiscoverPage`, `RestaurantsPage`) 모두 같은 hook 으로 적용.

### 어드민 맛집 화면

`/admin/restaurants` 흐름은 두 페이지 + 공유 컴포넌트 디렉토리로 구성된다.

- [`AdminRestaurantsPage`](../../apps/web/src/routes/admin/AdminRestaurantsPage.tsx)
  — URL 추가 폼 + 등록 맛집 리스트. 각 행은 클릭 시 detail로 navigate,
  업데이트/재크롤/삭제 버튼은 `stopPropagation`으로 행 클릭과 분리된다.
  삭제는 trash 아이콘 1차 클릭 → "정말 삭제 / 취소" 인라인 확인(2-step).
  리스트 위쪽엔 placeId가 아직 없는 "new" 잡이 쌓이고, 행마다 자기
  placeId에 묶인 `ActiveJobPanel`이 안커처럼 매달린다. 헤더 우측의
  정렬 dropdown은 `recent | satisfaction | positive | negativeRatio` —
  `avgSatisfactionScore` / `avgSentimentScore` / `negativeCount /
  summaryDone` 비율 기준으로 클라이언트 정렬하며, 분석이 없는 행
  (점수 `null`)은 항상 아래로 떨어진다. SSE 구독은 `rawItems` 기준이라
  정렬 변경만으로 EventSource가 끊기지 않는다.
- [`AdminRestaurantDetailPage`](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx)
  — `useRestaurantByPlaceId`로 단일 GET, **xl+ 에서는 2-column 그리드**
  (`xl:max-w-7xl xl:grid-cols-[minmax(0,1fr)_360px]`) — 좌측 본문 +
  우측 sticky 사이드바. 사이드바엔 위치 카드(`VWorldMap` 280px 컴팩트
  + `MapPin` 헤더 + `Maximize2` 버튼). xl 미만에서는 사이드바 숨김
  (좌측 InfoSection 좌표 정보로 대체).
  - `Maximize2` 버튼 클릭 시 우측 슬라이드오버(`@radix-ui/react-dialog`
    `Dialog.Root`/`Portal`/`Overlay`/`Content`) — `inset-y-0 right-0
    sm:max-w-[740px]` 풀 높이 지도. 별도 VWorldMap 인스턴스를 렌더
    (같은 ol Map 을 두 컨테이너에 옮겨 다는 건 `setTarget` 으로 가능
    하긴 하나 view/layer 상태가 어색해진다 — 두 인스턴스 비용은 무시할
    만함).
  - 본문은 상단 헤더 + flat divide-y 레이아웃의 정보/영업시간/메뉴/사진
    섹션, AI 요약 진행 카드(잡이 없을 때만 별도 표시), **메뉴 순위
    카드(`MenuRankingSection`)**, 방문자 리뷰(별점/요약 필터 + 정렬 +
    20개 페이지 pagination), 블로그 리뷰 (12 + 더보기). 정렬 기본값은
    `fetchedAt-asc`. 헤더 우측 업데이트/재크롤/삭제는 모두 in-page에서
    동작 — 재크롤 시 detail 캐시의 `reviews`를 즉시 비워서 새 배치가
    stale id와 섞이지 않게 한다.
- [`components/restaurant/`](../../apps/web/src/components/restaurant/)
  — 공유 컴포넌트 디렉토리.
  - [`ActiveJobPanel.tsx`](../../apps/web/src/components/restaurant/ActiveJobPanel.tsx)
    — 단일 잡의 SSE 카드. `useCrawlJobStream(jobId)` + `useRestaurantSummaryEvents(placeId)`를
    구독하고 `visitor_batch.persistedReviews`를 detail 캐시에 직접
    머지(중복 id 필터링 + `videos` 필드 포함). `done` 시 list/detail
    둘 다 invalidate, `onFinished`를 정확히 한 번 호출.
  - [`sections.tsx`](../../apps/web/src/components/restaurant/sections.tsx)
    — `SectionHeader`, `SummaryProgressSection`, `ReviewSummaryItem`,
    `ReviewSummarySection` + 인라인 `VideoPlayerModal`.
  - [`MenuRankingSection.tsx`](../../apps/web/src/components/restaurant/MenuRankingSection.tsx)
    — 식당 상세에 마운트되는 메뉴 순위 카드 (`SentimentBar`,
    `GlobalCompareBadge` 포함).
  - [`VWorldMap.tsx`](../../apps/web/src/components/restaurant/VWorldMap.tsx)
    — 어드민 식당 상세의 단일 마커 지도. `MapCanvas` thin wrapper —
    `useMapProviderSecret('vworld', hasCoords)` 로 평문 키 받아 전달.
    좌표/키 미충족은 placeholder 분기 (키 없으면 "/admin/settings/map"
    링크 노출).
  - [`MapCanvas.tsx`](../../apps/web/src/components/restaurant/MapCanvas.tsx)
    — 위 공개 페이지와 공유. 단일/다중 마커 모두 처리.

### 어드민 설정 통합 페이지 [신규]

옛 `/admin/ai-keys` 단독 라우트 대신 `/admin/settings` 부모 + 탭 자식
구조로 변경. `/admin/ai-keys` 로 들어오는 옛 북마크는 `<Navigate
to="/admin/settings/ai-keys" replace>` 로 자동 리다이렉트.

- [`AdminSettingsPage`](../../apps/web/src/routes/admin/AdminSettingsPage.tsx)
  — 헤더(설정 아이콘 + 제목/설명) + NavLink 탭 바 (`AI 키` / `지도`)
  + `<Outlet/>`. index 라우트는 `ai-keys` 로 리다이렉트.
- [`AdminAiKeysPage`](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx)
  — provider 카드 리스트. 옛 단독 페이지에 있던 wrapper div/헤더 제거,
  본체만 남겨 부모 셸이 헤더를 담당.
- [`AdminMapKeysPage`](../../apps/web/src/routes/admin/AdminMapKeysPage.tsx)
  [신규] — vworld provider 카드. AI 키 카드와 비슷한 폼 패턴
  (`apiKey`/`domains` 필드 + "변경 시에만 입력" + 마스킹 표시 + 인라인
  "연결 테스트" via `probeVworldKey` — 서울 시청 부근 1:1 줌 타일을
  fetch 해 image/* 응답이 오면 OK).

### AI 분석 관리 화면

[`AdminAnalyticsPage`](../../apps/web/src/routes/admin/AdminAnalyticsPage.tsx)는
하나의 페이지에 4개의 카드 + 1개 진행 패널을 쌓는다 (옛 라운드 그대로).

1. **전체 카운터** — 전체 식당 / 정규화 완료 / 처리 필요.
2. **`GlobalMergeSection`** — 전역 메뉴 머지 진행 + 결과 metric.
3. **`CategoryTreeSection`** — `useCategoryTree` 재귀 트리 + 라벨 클릭
   시 `setSearchParams({category: node.path})`.
4. **`GlobalMenusSection`** — `?menu=`/`?category=` URL state 기반 검색/
   통계 테이블.
5. **정규화 진행 패널 + 식당별 정규화 상태 테이블** — 식당 선택 + 잡
   시작 + SSE 진행.

서버 측 SSE/잡 형식과 분석 엔드포인트 상세는 [analytics](analytics.md)
와 [menu-grouping](menu-grouping.md), 훅 시그니처는 [shared](shared.md)
참조.

### UI 시스템

- **Pretendard 폰트 (공개 한정)** — `index.html` 에서 jsDelivr CDN 로드,
  `tailwind.css` `@theme inline` 의 `--font-pretendard` 변수 +
  `font-pretendard` 유틸로 적용. `PublicLayout` root 에만 클래스를 박아
  공개 페이지 전체에 적용, 어드민은 system-ui fallback 유지.
- **본문 텍스트 사이즈 한 단계 시프트 (전역 영향)** — `tailwind.css`
  `@theme inline` 에서 Tailwind v4 의 `--text-*` 변수를 1px씩 위로:
  `--text-xs: 0.8125rem` (13/12), `--text-sm: 0.9375rem` (15/14),
  `--text-base: 1.0625rem` (17/16), `--text-lg: 1.1875rem` (19/18),
  `--text-xl: 1.375rem` (22/20), `--text-2xl: 1.625rem` (26/24),
  `--text-3xl: 2rem` (32/30). spacing/icon 은 그대로 — 레이아웃이
  비례 비대해지지 않으면서 본문 가독성만 ↑. **어드민까지 영향**
  (의도적 — 사이트 전체 가독성 일관성).
- **shadcn/ui 스타일 프리미티브** — `~/components/ui/`에 손으로 들고 온
  컴포넌트들 (`Button`, `Card`/Header/Content/Title/Description/Footer,
  `Input`, `Table`, `Badge`).
- **Tailwind CSS v4** — `@tailwindcss/vite` 플러그인 + `@import
  "tailwindcss";` 단일 진입점([tailwind.css](../../apps/web/src/styles/tailwind.css)).
  shadcn 색 토큰 OKLCH + `@theme inline` 매핑. `.dark` 클래스 토글
  다크 모드.
- **`cn()` 유틸** — `clsx + tailwind-merge`
  ([lib/utils.ts](../../apps/web/src/lib/utils.ts)).
- **`ImgWithFallback`** — 옛 어드민 detail 페이지에 로컬로 있던 헬퍼를
  공용 [`~/components/ImgWithFallback.tsx`](../../apps/web/src/components/ImgWithFallback.tsx)
  로 빼냄. `referrerPolicy="no-referrer"` 로 Naver 이미지 CDN
  hotlink 차단 회피, onError 시 placeholder 박스, **src 변경 시 failed
  자동 reset** (`useEffect([src])` — 라이트박스/캐러셀에서 한 번 실패한
  뒤 다음 이미지가 안 보이는 회귀 방지). 사용처: AdminRestaurantDetailPage,
  PublicRestaurantCard, HomeTab, MenuGrid, ReviewCard, PhotosTab,
  Lightbox, InfoTab.
- **레거시 글로벌 CSS** — [global.css](../../apps/web/src/styles/global.css)는
  body·앵커 기본만 다루는 얇은 시트.

## Talks To [coverage: high — 10 sources]

- **`@repo/api-contract`** — 공유 zod 스키마 기반 타입을 직접 import.
  맛집/AI 키/메뉴 분석 외 신규: `RestaurantPublicListItemType`,
  `RestaurantPublicListQueryType`, `RestaurantPublicDetailType`,
  `RestaurantInsightsType`, `RestaurantRankingQueryType`,
  `PublicVisitorReviewType`, `MapProviderConfigType`, `MapProviderIdType`,
  `UpdateMapProviderInputType`.
- **`@repo/shared`** — API 클라이언트 부트스트랩(`configureApi`),
  Zustand 스토어(`useAuthStore`, `useActiveCrawlJobStore`), React Query
  훅들. 공개 맛집 신규 훅: `useRestaurantsPublic`, `useRestaurantPublic`,
  `useRestaurantPublicInsights`, `useRestaurantRanking`. 지도 키 신규
  훅: `useMapProviders`, `useUpdateMapProvider`, `useDeleteMapProvider`,
  `useMapProviderSecret`, `useMapPublicConfig`. **어드민 발견 신규 훅**:
  `useNaverSearch` (`['crawl', 'search', q, bbox]`, staleTime 30s).
  `useActiveCrawlJobStore.add(...)` 신규 호출자 (어드민 발견 — list-row
  source). 기존 훅 다수 (`useCurrentUser`, `useLogin`, `useLogout`,
  `useRestaurantList`, `useRestaurantByPlaceId`, `useRestaurantSummaryEvents`,
  `useDeleteRestaurant`, `useProviders`, `useUpdateProvider`,
  `useDeleteProvider`, `useTestProvider`, `useProviderModels`,
  `useCompleteAi`, `useCompleteBatchAi`, `useMenuRanking`,
  `useGroupForRestaurant`, `useAnalyticsOverview`, `useCategoryTree`,
  `useGlobalMenus`, `useGroupingRestaurantsStatus`,
  `useCreateGroupingJob`, `useGroupingJob`, `useStartGlobalMerge`,
  `useGlobalMergeJob`).
- **`@repo/utils`** — 썸네일 프록시 헬퍼 `reviewThumbnailUrl(originalUrl,
  size)` (어드민 비디오 모달 등). 공개 페이지 이미지 표시는
  `referrerPolicy="no-referrer"` 만으로 충분해 프록시를 안 거친다.
- **TanStack Query 캐시 직접 패치** — `ActiveJobPanel`은 SSE
  `visitor_batch.persistedReviews`를 받아 `qc.setQueryData(['restaurant',
  placeId], …)`로 detail 캐시의 `reviews` 배열에 직접 합친다(중복 id
  필터링, `videos` 필드 포함). 잡 종료 시엔 list/detail 둘 다
  `invalidateQueries`.
- **`useActiveCrawlJobStore`(zustand singleton)** — `jobs:
  Record<jobId, ActiveCrawlJob>`. 리스트와 detail이 같은 스토어를 읽기
  때문에 어느 쪽에서 시작한 잡이든 모든 화면에 즉시 보인다.
- **URL = state** — `RestaurantsPage`의 `?q=&category=&sort=&bbox=&placeId=`
  와 `AdminAnalyticsPage`의 `?menu=&category=`는 모두 `useSearchParams`
  로 직접 read/write. `setSearchParams(_, { replace: true })` 로 즉시
  갱신. useState/useEffect 미러링 회피 — useEffect 회피 원칙.
- **OpenLayers** — `ol@^10.7.0`. `ol/Map`, `ol/View`, `ol/layer/Tile`,
  `ol/layer/Vector`, `ol/source/Vector`, `ol/source/XYZ`, `ol/Feature`,
  `ol/geom/Point`, `ol/proj` (fromLonLat/toLonLat), `ol/style`
  (Style/Icon/Text/Fill/Stroke), `ol/ol.css`. vworld JS SDK 대신 OL 이
  WMTS 타일을 직접 받아 그린다 — vworld 도메인 화이트리스트 부담 없음
  (WMTS 는 키만 검증).
- **vworld WMTS 1.0.0** —
  `https://api.vworld.kr/req/wmts/1.0.0/{KEY}/{LAYER}/{z}/{y}/{x}.png`,
  Layer 는 `Base` (다른 옵션 — `gray`/`midnight`/`Satellite`/`Hybrid`).
  연결 테스트는 작은 타일 한 장 fetch 후 content-type 검사.
- **백엔드 friendly** — `VITE_API_URL`(예: `http://localhost:3000`)을
  `configureApi({ baseUrl })`에 흘려보낸다
  ([.env.example](../../apps/web/.env.example),
  [main.tsx](../../apps/web/src/main.tsx)). 개발 시 Vite 서버의
  `proxy: { '/api': 'http://localhost:3000' }` 로 CORS 회피. 신규 외부
  통신 — `/api/v1/admin/crawl/search` (어드민 발견의 네이버 PC 지도
  검색 프록시).
- **Radix UI** — `@radix-ui/react-slot`, `@radix-ui/react-dialog`(어드민
  detail 의 우측 슬라이드오버), `@radix-ui/react-dropdown-menu` (현
  시점 광범위 사용 X).
- **lucide-react** — 모든 아이콘. 공개 맛집 신규: `Search`, `XCircle`,
  `Star`, `MapPin`, `MapIcon`/`Map`, `List`, `Loader2`, `RefreshCcw`,
  `ChevronLeft`, `ChevronRight`, `X`, `ArrowRight`, `Phone`,
  `Navigation`, `ExternalLink`, `Image`. 어드민 설정 신규: `Settings`,
  `KeyRound`, `Map`, `PlugZap`, `Save`, `Trash2`, `Maximize2`. 어드민
  발견 + 패널 토글 신규: `Compass`, `PanelLeftOpen`, `PanelRightOpen`,
  `Play`.

크롤링 SSE/요약 이벤트 hook의 내부는 [shared](shared.md), 서버 측
스트림 형식은 [crawl](crawl.md), 분석 엔드포인트는 [analytics](analytics.md),
메뉴 정규화 잡은 [menu-grouping](menu-grouping.md), 썸네일 프록시는
[media](media.md), 지도 키 관리는 [map](map.md) 참고.

## API Surface [coverage: high — 8 sources]

웹 앱은 HTTP 엔드포인트가 아니라 **브라우저 URL** + 재사용 가능한 React
컴포넌트를 노출한다.

URL:

- `/` — 공개 홈. AI 분석 리뷰 긍정/부정 비율 랭킹 (멘션 5건 이상,
  `?sort=positive|negative` + 중립 토글, 20개 페이지)
- `/restaurants` — **풀 뷰포트 맛집 검색**. xl+ 3-column (목록/상세/지도),
  xl 미만 토글 + 상세 absolute. URL params: `q/category/sort/bbox/placeId`
- `/login` — 로그인 + 회원가입 + 게스트 진입
- `/admin` — 어드민 대시보드 (사용자 목록 + 역할 토글)
- `/admin/discover` — 맛집 발견 (네이버 PC 지도 검색 + 다중 크롤링)
  — `?q=&bbox=&tab=&placeId=`
- `/admin/restaurants` — 네이버 플레이스 URL 적재 + 등록 맛집 리스트.
  행 단위 업데이트/재크롤/삭제 + 다중 슬롯 active job panel + 만족도/
  긍정/부정비율 정렬
- `/admin/restaurants/:placeId` — 단일 맛집 상세 (좌측 본문 + xl+ 우측
  지도 사이드바 + Maximize2 슬라이드오버)
- `/admin/analytics` — AI 분석 관리 (`?menu=`/`?category=` deep-link)
- `/admin/crawl-test`, `/:jobId` — URL 입력 후 크롤링 잡 시작 + SSE
- `/admin/ai-test` — LLM 호출 실험 도구
- `/admin/settings` — **설정 셸 (탭 — AI 키 / 지도)**. index 는
  ai-keys 리다이렉트
- `/admin/settings/ai-keys` — provider 카드 리스트 + 연결 테스트
- `/admin/settings/map` — vworld 키 관리 + probeVworldKey
- `/admin/ai-keys` — `<Navigate>` 자동 리다이렉트 (옛 북마크 호환)

내부 재사용 컴포넌트:

- `PublicLayout` / `PublicTopBar` / `PublicSidebar` — 공개 셸
- `AdminLayout` / `AdminTopBar` — 어드민 셸
- `RestaurantsPage` 의 3-column 서브트리:
  - `PublicRestaurantList` (좌측 목록 패널)
  - `PublicRestaurantDetail` (가운데 5탭 상세 — 같은 디렉토리 안에
    `HomeTab` / `MenuTab` / `ReviewsTab` / `PhotosTab` / `InfoTab` +
    `Lightbox` + `shared.tsx` 의 QuickActions/AiSummary/MenuGrid/ReviewCard)
  - `PublicRestaurantsMap` (우측 지도 wrapper)
- `MapCanvas` — 공개/어드민 모두 공유하는 OL 저레벨 캔버스
- `VWorldMap` — 어드민 단일 마커 wrapper
- `ImgWithFallback` — 공용 이미지 헬퍼
- 어드민 맛집: `ActiveJobPanel`, `MenuRankingSection`, sections.tsx
  (SectionHeader/SummaryProgressSection/ReviewSummaryItem/ReviewSummarySection/
  VideoPlayerModal)
- `AdminAnalyticsPage` 비공개 컴포넌트: `GlobalMergeSection`,
  `CategoryTreeSection`, `CategoryTreeRow`, `GlobalMenusSection`, etc.
- 어드민 발견: `AdminDiscoverPage`, `DiscoverMap`, `DiscoverPanel`
  (`PublicRestaurantDetail` 5탭 컴포넌트는 어드민 발견에서도 그대로
  재사용 — 어드민 전용 상세 컴포넌트 별도 X)

## Data [coverage: high — 6 sources]

- 로컬 DB 없음. 모든 상태는 다섯 갈래로 갈린다.
  - **서버 상태** — TanStack Query 캐시. `staleTime`, `gcTime`,
    `retry: 1`, `refetchOnWindowFocus: false`로 글로벌 설정
    ([main.tsx](../../apps/web/src/main.tsx)).
  - **클라이언트 인증 상태** — Zustand `useAuthStore` (`token`, `user`,
    `isGuest`).
  - **다중 슬롯 잡 상태** — Zustand `useActiveCrawlJobStore`
    (`jobs: Record<jobId, ActiveCrawlJob>`).
  - **URL 쿼리 = 단일 source of truth** — 세 페이지에서 사용:
    - `RestaurantsPage`: `?q&category&sort&bbox&placeId`
    - `AdminAnalyticsPage`: `?menu&category`
    - `AdminDiscoverPage`: `?q&bbox&tab&placeId`
    - 모두 `useSearchParams` 가 직접 read/write, useState +
      `useEffect 동기화` 회피. `setSearchParams(_, { replace: true })`
      로 history entry 적층 차단.
  - **로컬 useState (page-scope)** — `RestaurantsPage` 의 `mobileView`
    (list/map 토글), `hoveredPlaceId` (즉시 마커 강조), `Lightbox` 의
    `lightboxIndex`, `PublicRestaurantDetail` 의 활성 탭, `ReviewsTab`
    의 sentiment 필터/정렬.
- **TanStack Query 키 컨벤션** —
  - `['restaurant', 'list']` — 어드민 리스트.
  - `['restaurant', placeId]` — 어드민 상세 + `ActiveJobPanel`.
  - `['restaurant', 'public', query]` — 공개 검색 (q/category/sort/bbox/limit).
  - `['restaurant', 'public', placeId]` — 공개 단일.
  - `['restaurant', 'public', placeId, 'insights']` — AI 분석.
  - `['restaurant', 'ranking', query]` — 공개 랭킹.
  - `['map-public-config']`, `['map-providers']`, `['map-secret', id]` —
    지도 키.
  - `['menu-ranking', placeId, sort, minMentions]` 등 분석 키.
  - `['crawl', 'search', q, bbox]` — 어드민 발견 네이버 PC 지도 검색
    (staleTime 30s).
- **localStorage** —
  - `lp:token` — JWT 토큰
  - `lp:guest` — 게스트 플래그
  - `lp:theme` — `light`/`dark` (FOUC 방지로 `index.html` 인라인 스크립트
    가 React 마운트 전에 `<html>` 클래스 토글)
  - `lp:panelPrefs` — 페이지별 패널 좌/우 위치 (`{ "admin.discover":
    "right", "public.restaurants": "left" }`). `panelPrefsStore` 가
    `setSide` 안에서 직접 writeStorage (zustand persist 미들웨어 미사용).
- **API 클라이언트 토큰 주입** — `configureApi({ getToken: () =>
  useAuthStore.getState().token })`. 401 응답 시
  `onUnauthorized: clearSession`으로 자동 로그아웃.
- **AdminAiKeysPage / AdminMapKeysPage 폼 동기화** — 각 카드는 자체
  `useState<FormState>`를 유지하되, `useEffect([provider])`로 부모가 새로
  받아온 데이터에 맞춰 폼을 리셋. 저장 성공 후 `apiKey` 필드만 비워서
  password input이 마스킹 상태로 돌아간다.

## Key Decisions [coverage: high — 16 sources]

- **공개 맛집 = 풀 뷰포트 + 3-column / 토글** — 네이버 지도 패턴을
  그대로. xl+ 에서는 좌측 결과 / 가운데 상세 / 우측 지도를 동시 노출,
  xl 미만에서는 [목록/지도] 탭 토글로 좁은 화면 답답함 회피. 상세
  패널은 placeId 가 있을 때만 mount 되며 좁은 화면에서는 list aside 위에
  `absolute z-30` 으로 덮어쓰기. 컨테이너 높이는 `h-[calc(100vh-3.5rem)]`
  (TopBar h-14 빼기) — 페이지 자체는 스크롤 없이, 안쪽 패널이 자기
  스크롤만.
- **URL state 동기화 = useSearchParams + replace** —
  `q/category/sort/bbox/placeId` 5종을 useSearchParams 가 single source
  of truth. onChange 안에서 즉시 `setSearchParams(_, { replace: true })`,
  useEffect 미러링 회피. 입력 한 글자마다 history entry 가 쌓이지 않고
  새로고침/링크 공유 시에도 상태가 그대로 복구. **단 호버는
  로컬 useState** (`hoveredPlaceId`) — 일시적이라 URL 까지 안 가져가는
  게 마커 강조 즉시 반영에 유리.
- **5탭 상세 = 데이터 fetch 1회 + 탭 전환은 컨텐츠만** —
  `PublicRestaurantDetail` root 에서 `useRestaurantPublic` +
  `useRestaurantPublicInsights` 한 번씩만 fetch. 탭 전환은 활성 컴포넌트만
  스왑하므로 추가 호출 없음. 탭 상태는 내부 useState — URL 까지 안 가져
  가도 사용자 흐름엔 충분. **placeId 변경 시 useEffect 로 자동 'home'
  reset** — 다른 식당 클릭 시 첫 인상은 항상 홈 탭. 이 한 곳은
  useEffect 회피 원칙을 깨고 사용.
- **`panel/` → `detail/` 명명 정리** — 처음엔 단일 파일
  `panel/PublicRestaurantPanel.tsx`. 1차 리팩터로 5개 탭 파일 분해
  (panel/ 디렉토리). 2차 리팩터로 `detail/` 로 디렉토리 리네이밍 +
  `PublicRestaurantDetail` 로 export 변경 — 좌측 "목록 패널"
  (`PublicRestaurantList`) 과 가운데 "상세 패널" 의 명료한 구분이
  목적.
- **사진 라이트박스 = 카테고리 평탄화된 단일 시퀀스** — 사진 탭의 3섹션
  (대표/메뉴/리뷰) 사진을 모두 평탄화한 `allImages` 배열 + 섹션별
  offset 매핑. 클릭 시 `offset + i` 인덱스로 라이트박스 진입. 모달
  안에서 좌우 키보드 / 화살표 클릭만으로 다음 섹션 사진까지 자연스럽게
  이동 가능 — 각 섹션마다 라이트박스를 따로 띄우는 패턴보다 UX 가 좋다.
- **`ImgWithFallback` 공용화 + src 변경 시 failed reset** — 옛
  AdminRestaurantDetailPage 안에 로컬로 정의돼 있던 컴포넌트를
  `~/components/` 로 이동. `referrerPolicy="no-referrer"` 로 Naver
  이미지 CDN hotlink 차단 회피, onError 시 placeholder. 추가로
  `useEffect([src])` 로 **src 변경 시 failed 자동 리셋** — 라이트박스/
  캐러셀처럼 같은 컴포넌트가 다른 이미지를 연속으로 그리는 케이스에서
  한 번 실패한 뒤 다음 이미지가 안 보이는 회귀 방지.
- **Pretendard 공개 한정 + 텍스트 사이즈 시프트 전역** — `PublicLayout`
  root 에 `font-pretendard` 클래스를 박아 공개 페이지 한정으로
  Pretendard 적용 (어드민은 system-ui fallback). 다만 `--text-*`
  Tailwind v4 변수는 `@theme inline` 에서 1px 씩 위로 시프트
  (12→13/14→15/16→17/...) — **사이트 전체에 영향**. 이는 의도적
  결정 — 디자인 일관성 우선. spacing/icon 은 그대로라 레이아웃이
  비례 비대해지지 않는다.
- **OpenLayers + WMTS = vworld JS SDK 우회** — vworld 의 `vw.ol3.Map`
  같은 SDK 를 안 쓰고 OL 로 vworld 의 WMTS 1.0.0 타일을 직접 받는다.
  WMTS 는 키만 검증하고 도메인 화이트리스트 검증을 안 해, 어떤 origin
  에서도 그대로 동작. SDK 의존성 + 도메인 등록 부담 동시 회피.
- **`MapCanvas` imperative API + ref 콜백** — `flyTo`/`fitToMarkers` 는
  `forwardRef + useImperativeHandle` 로 노출. 콜백
  (`onMarkerSelect`/`onViewportChangeEnd`/`onTileError`) 은 ref 보관
  으로 effect 의존성에서 제외 — 매번 새 effect 가 생성되는 걸 방지.
  `apiKey` 가 바뀔 때만 map 재생성, 마커는 `vectorSource.clear() +
  addFeature` 로 패치.
- **사용자 인터랙션 vs programmatic move 분리** — `userInteractedRef`
  flag. 사용자 `pointerdrag`/`wheel` 시 true, `flyTo`/`fitToMarkers`
  호출 직전 false. moveend 콜백에서 false 면 무시 — programmatic
  fly-to 직후 false positive `onViewportChangeEnd` 발사로 "이 지역
  재검색" 버튼이 잘못 뜨는 사고 방지.
- **`/admin/settings` 통합 + 옛 경로 redirect** — `/admin/ai-keys` 단독
  페이지를 폐기하고 `/admin/settings` 부모 + 탭 자식으로 옮김. 옛
  북마크는 `<Navigate to="/admin/settings/ai-keys" replace>` 로 자동
  처리. 사이드바 라벨도 "AI 키" → "설정" + Settings 아이콘.
- **어드민 detail 위치 카드 + Maximize2 슬라이드오버** — xl+ 에서
  본문 우측에 sticky 위치 카드 (`VWorldMap` 280px 고정). 더 크게 보고
  싶으면 헤더 `Maximize2` 버튼 → Radix Dialog 우측 슬라이드오버 (sm+
  740px) 로 풀 높이 지도. 같은 ol Map 인스턴스를 두 컨테이너에 옮기는
  대신 별개 `VWorldMap` 두 인스턴스를 렌더 — `setTarget` 으로 가능
  하긴 하나 view/layer 상태가 어색해지고, 두 인스턴스 비용은 무시할
  만함.
- **연결 테스트는 키 입력 후 즉시 가능** — `AdminMapKeysPage` 의
  `handleTest` 는 `form.apiKey` (저장 안 한 입력값) 로 `probeVworldKey`
  호출. 사용자가 저장 전에 키 유효성을 확인할 수 있다. 비어 있으면
  안내 문구로 fallback. AI 키 페이지의 `useTestProvider` 도 같은
  패턴 — `form.defaultModel` 의 즉석 입력값으로 호출.
- **공개 페이지 vworld 키는 평문 노출** — `useMapPublicConfig` 가
  반환하는 `apiKey` 는 평문. 어드민의 `useMapProviderSecret` 도 같음.
  vworld WMTS 는 도메인 화이트리스트로 가드되지 않으므로 키가 노출돼도
  치명적이지 않다 (단 트래픽 한도는 공유). 운영 정책 측면에서는 추후
  도메인 화이트리스트 + 키 회전 검토 가능.
- **어드민 발견 = 검색·등록 통합 마커 + 다중 선택 일괄 크롤링** — 검색
  결과는 빨강 (`'primary'`), 등록은 회색 (`'muted'`). 같은 placeId 가
  양쪽에 있으면 등록(muted) 우선해 중복 크롤 방지. 다중 선택은 직렬
  `await` 로 호출, 시작 거부된 placeId 는 체크 상태 유지해 사용자
  재시도 편의 (`setCheckedIds(failedIds)`). 처음에는 `Promise.allSettled`
  병렬이었으나 BE rate-limit 에 걸려 직렬로 변경 → 응답이 ms 단위라
  결국 BE actor rate-limit 자체 제거.
- **패널 좌/우 토글 = 페이지별 namespace + localStorage 직접 + xl+
  한정** — `panelPrefsStore` 가 `Record<PanelKey, 'left' | 'right'>`,
  PanelKey = `'admin.discover' | 'public.restaurants'`. Zustand persist
  미들웨어 안 쓰고 `setSide` 안에서 직접 `writeStorage` (theme store
  와 같은 패턴, 의존성 회피). 모바일은 풀블리드라 토글 의미 없음 —
  xl+ 에서만 ⇄ 버튼 노출. 기본값 `admin.discover: 'right'`,
  `public.restaurants: 'left'`.
- **panel side 변경 시 OL reflow = ResizeObserver 자동** — `MapCanvas`
  안에서 `ResizeObserver` 로 컨테이너 사이즈 변화 감지 → `map.updateSize()`
  자동 호출. window resize, panel toggle, dialog 슬라이드오버 모두
  한 곳에서 처리 → `map.updateSize()` 호출처 분산 회피.
- **등록 행 클릭 → 별도 column 상세 = 공개 맛집 페이지 패턴 재현** —
  처음엔 패널 안 absolute 슬라이드였으나 사용자 요청으로 list/detail/map
  3-column 으로 변경. DOM 순서 `[map, detail-aside, list-aside]` +
  flex 방향 토글로 좌/우 swap. detail 은 항상 list 옆 (지도 쪽 방향)
  에 붙는다. `PublicRestaurantDetail` 그대로 재사용 — 어드민 발견
  전용 상세 컴포넌트 별도 X.
- **기존 결정들 (변경 없음)** — React 19 (모바일은 RN 0.76 호환 React 18,
  공유 컴포넌트는 두 버전 호환), Next.js 미채택 (SPA 충분), Tailwind v4
  + shadcn 토큰, `@repo/shared` 경유 API/스토어, stream-driven cache
  merge, 역할 기반 라우트 가드, 다중 슬롯 잡 글로벌 zustand, 재크롤
  시 detail 캐시 review 비우기, `fetchedAt-asc == 최근 수집순`, 방문일
  정규화 후 비교, 비디오는 프록시 우회·썸네일만 프록시, `VideoPlayerModal`
  no-portal, `visitor_batch.persistedReviews` 직접 머지, 인라인
  confirm-delete (2-step), Vite dev proxy, opt-in temperature, AdminAiKeysPage
  "변경 시에만 입력", datalist 자동완성, 클라이언트 항목 상한 10,
  분석 페이지 = compose-of-hooks, MenuRankingSection trend 임계값 5%p,
  재귀 컴포넌트 + depth=0 default open.

## Gotchas [coverage: high — 14 sources]

- **Pretendard 외부 CDN 의존** — jsDelivr 가 다운되거나 응답이 느리면
  공개 페이지의 첫 페인팅이 system-ui 로 되다가 폰트 적용으로 깜빡인다
  (FOUT). dynamic-subset 이 가벼워 영향은 작지만, self-host 옵션은
  현재 검토 안 함.
- **텍스트 사이즈 시프트가 어드민까지 영향** — `--text-*` Tailwind v4
  변수는 `@theme inline` 에서 전역 변경. 공개/어드민 둘 다 본문이 1px
  커진 상태로 렌더된다. 어드민의 빡빡한 dropdown / select 폼이 살짝
  덜 들어맞을 수 있다 (의도적 — 가독성 일관성 우선).
- **`ImgWithFallback` src 변경 시 failed 리셋 필수** — 라이트박스 /
  캐러셀처럼 같은 컴포넌트 노드에 다른 src 를 연속으로 흘릴 때, 최초
  failed 를 리셋 안 하면 다음 사진이 placeholder 로 떨어진다. 현재
  `useEffect([src])` 로 자동 리셋 — 이 로직을 빼면 회귀 발생. 라이트
  박스 키보드 좌우로 빠르게 넘기면 한 번 실패한 사진이 다음 사진
  로딩까지 막던 실제 사고 사례.
- **5탭 상세에서 placeId 변경 시 옛 데이터 잠시 보임** — `useRestaurantPublic`
  은 placeId 키로 query 가 새로 fetch 되지만, React Query 가 옛
  `data` 를 기본 stale 그대로 들고 있다. 새 식당 데이터가 들어오기
  전까지 헤더에 옛 식당 이름이 잠깐 보일 수 있다 — 의도적 (skeleton
  대신 staleness 허용으로 깜빡임 줄이기). 신규 키 fetch 후 자동 갱신.
- **vworld 키 미등록 시 placeholder** — 공개 페이지는
  `useMapPublicConfig` 가 404 (`ApiError.statusCode === 404`) 면 "관리자
  설정 > 지도..." 안내. 어드민 단일 마커 (`VWorldMap`) 도 동일 분기
  + `/admin/settings/map` 링크. 키 등록 후엔 query 가 자동 refetch 되며
  복구.
- **OpenLayers `apiKey` 변경만 map 재생성** — `MapCanvas` 의 mount
  effect 는 `[apiKey]` 만 deps. `markers`/`initialCenter` 가 바뀌어도
  map 재생성 X — 마커는 `vectorSource.clear() + addFeature` 로 패치.
  `initialCenter` 는 첫 렌더 후엔 외부에서 바꿀 수 없다 (`flyTo`
  imperative 사용). 이 패턴을 모르면 마커가 안 바뀐다고 오해할 수 있음.
- **`MapCanvas` 첫 렌더 후 자동 moveend 무시** — `initialCenter` /
  `markers[0]` 로 view 가 처음 세팅되면 OL 이 moveend 를 발사하지만,
  `userInteractedRef` 가 false 라 `onViewportChangeEnd` 는 안 호출된다.
  사용자가 `pointerdrag` / `wheel` 한 뒤부터만 콜백이 동작 — 의도적이며,
  처음 렌더만으로 "이 지역에서 재검색" 버튼이 뜨는 사고 방지.
- **모바일 토글 시 상세 패널 숨김** — `mobileView=map` 이면 list aside
  영역 위 absolute 로 덮어 있던 detail 도 같이 `hidden` 처리 (꼭 list
  와 같이 보임). placeId 가 살아 있어도 렌더 안 됨 — 사용자가 명시적으로
  지도 모드로 갔으니. 다시 list 토글하면 자동 복귀 (URL placeId 가
  남아있어 mount 가능).
- **Lightbox key handler 글로벌 등록** — `Lightbox` 가 mount 되면
  `window` 에 `keydown` 리스너를 박는다. 라이트박스 안에서 ESC 가
  뒤집힌 상위 modal 도 같이 닫히는 케이스가 있을 수 있다 (현재는 없음
  — 부모 PublicRestaurantDetail 의 ESC 처리는 별도 안 함).
- **블로그 리뷰 외부 링크는 referrer 통과** — `target="_blank"
  rel="noreferrer"` 만 박혀 있고 `<img>` 의 `referrerPolicy` 와는
  분리. blogReviews thumbnail 은 ImgWithFallback 으로 처리되므로 안전.
- **Radix Dialog Portal 안의 OpenLayers** — 어드민 detail 의 슬라이드
  오버 안에서 `VWorldMap` 이 다시 마운트되면 OL 이 새 컨테이너 사이즈를
  detect 못 할 수 있다 (Portal 의 z-index/transform 컨텍스트). 현재
  코드는 별개 인스턴스라 자체 mount effect 가 다시 동작 — 정상. 같은
  ol Map 을 `setTarget` 으로 옮기면 잠금/언락 처리가 어색해진다는 게
  코드 주석에서 명시.
- **직렬 await 만으론 부족 — BE rate-limit 자체 제거** — 어드민 발견
  의 다중 선택 일괄 크롤링은 처음 `Promise.allSettled` → 직렬 `await`
  로 옮겨도 응답이 수 ms 안에 떨어져 50ms 윈도우조차 둘째부터 막혔다.
  결국 BE actor rate-limit 자체를 제거. 자세한 건 [crawl](crawl.md)
  의 actor rate-limit 제거 결정 참고.
- **어드민 발견 검색 디바운스 cleanup 누락 시 unmount 후 setParam** —
  `DiscoverPanel` 의 검색 디바운스 300ms 는 `useEffect` cleanup 으로
  unmount 시 timeout clear 필수. 또 URL `q` 외부 변경 시 input 동기화
  useEffect 한 곳 — useEffect 회피 원칙 예외 (외부 system 동기화 케이스).
- **검색 결과 등록 항목 클릭 시 placeId 가 등록 list 에 있는지 체크** —
  `detailPlaceId` 결정 로직에서 등록 list 에 없는 검색 결과 placeId
  는 detail 슬라이드 안 띄움 (DB 데이터 없음). 검색 마커 클릭 시
  detail 이 안 뜨는 게 정상.
- **tailwindcss-animate 미설치 시 슬라이드 효과 없음** — `animate-in
  slide-in-from-right-4` 가 미작동, detail 즉시 표시. 기능 자체엔
  영향 없음.
- **기존 함정들 (유지)** — `global.css` 의 unlayered `a { color }`
  Tailwind 우선순위 함정, 재크롤 시 detail 캐시 미리 비우기 필수, 방문일
  정규화 누락 시 8월 > 12월, 다중 슬롯 무제한 start, `.tsx` 옆 `.js`
  빌드 잔재 무시, SSE `?token=` 쿼리 인증, 서명 video URL TTL,
  VideoPlayerModal body scroll lock, logout 시 localStorage 자동 정리,
  HomePage admin 링크 게이트, OKLCH 일부 도구 미지원, Vite deps
  prebundle 캐시 함정, `useActiveCrawlJobStore` 셀렉터 안정성, 리스트
  정렬은 클라 측 SSE 구독은 원본 기준, `window.confirm` AdminAiKeys/
  AdminMapKeys/Restaurants 일부 잔존, 글로벌 머지 409 = 이미 진행 중,
  `?menu=`/`?category=` replace 모드, MenuRankingSection 의 글로벌
  매핑 의존, AdminAiKeysPage 의 useEffect 잔존.

## Sources [coverage: high — 54 sources]

- [apps/web/package.json](../../apps/web/package.json)
- [apps/web/index.html](../../apps/web/index.html)
- [apps/web/vite.config.ts](../../apps/web/vite.config.ts)
- [apps/web/tsconfig.json](../../apps/web/tsconfig.json)
- [apps/web/.env.example](../../apps/web/.env.example)
- [apps/web/src/main.tsx](../../apps/web/src/main.tsx)
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx)
- [apps/web/src/routes/HomePage.tsx](../../apps/web/src/routes/HomePage.tsx)
- [apps/web/src/routes/LoginPage.tsx](../../apps/web/src/routes/LoginPage.tsx)
- [apps/web/src/routes/RestaurantsPage.tsx](../../apps/web/src/routes/RestaurantsPage.tsx)
- [apps/web/src/routes/admin/AdminHomePage.tsx](../../apps/web/src/routes/admin/AdminHomePage.tsx)
- [apps/web/src/routes/admin/AdminCrawlTestPage.tsx](../../apps/web/src/routes/admin/AdminCrawlTestPage.tsx)
- [apps/web/src/routes/admin/AdminRestaurantsPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantsPage.tsx)
- [apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx)
- [apps/web/src/routes/admin/AdminAnalyticsPage.tsx](../../apps/web/src/routes/admin/AdminAnalyticsPage.tsx)
- [apps/web/src/routes/admin/AdminAiKeysPage.tsx](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx)
- [apps/web/src/routes/admin/AdminAiTestPage.tsx](../../apps/web/src/routes/admin/AdminAiTestPage.tsx)
- [apps/web/src/routes/admin/AdminSettingsPage.tsx](../../apps/web/src/routes/admin/AdminSettingsPage.tsx)
- [apps/web/src/routes/admin/AdminMapKeysPage.tsx](../../apps/web/src/routes/admin/AdminMapKeysPage.tsx)
- [apps/web/src/routes/admin/AdminDiscoverPage.tsx](../../apps/web/src/routes/admin/AdminDiscoverPage.tsx)
- [apps/web/src/components/admin/discover/DiscoverMap.tsx](../../apps/web/src/components/admin/discover/DiscoverMap.tsx)
- [apps/web/src/components/admin/discover/DiscoverPanel.tsx](../../apps/web/src/components/admin/discover/DiscoverPanel.tsx)
- [apps/web/src/stores/panelPrefsStore.ts](../../apps/web/src/stores/panelPrefsStore.ts)
- [apps/web/src/components/PublicLayout.tsx](../../apps/web/src/components/PublicLayout.tsx)
- [apps/web/src/components/PublicTopBar.tsx](../../apps/web/src/components/PublicTopBar.tsx)
- [apps/web/src/components/PublicSidebar.tsx](../../apps/web/src/components/PublicSidebar.tsx)
- [apps/web/src/components/ImgWithFallback.tsx](../../apps/web/src/components/ImgWithFallback.tsx)
- [apps/web/src/components/ThemeToggle.tsx](../../apps/web/src/components/ThemeToggle.tsx)
- [apps/web/src/components/admin/AdminLayout.tsx](../../apps/web/src/components/admin/AdminLayout.tsx)
- [apps/web/src/components/admin/AdminTopBar.tsx](../../apps/web/src/components/admin/AdminTopBar.tsx)
- [apps/web/src/components/restaurant/ActiveJobPanel.tsx](../../apps/web/src/components/restaurant/ActiveJobPanel.tsx)
- [apps/web/src/components/restaurant/sections.tsx](../../apps/web/src/components/restaurant/sections.tsx)
- [apps/web/src/components/restaurant/MenuRankingSection.tsx](../../apps/web/src/components/restaurant/MenuRankingSection.tsx)
- [apps/web/src/components/restaurant/MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx)
- [apps/web/src/components/restaurant/VWorldMap.tsx](../../apps/web/src/components/restaurant/VWorldMap.tsx)
- [apps/web/src/components/restaurant/PublicRestaurantList.tsx](../../apps/web/src/components/restaurant/PublicRestaurantList.tsx)
- [apps/web/src/components/restaurant/PublicRestaurantCard.tsx](../../apps/web/src/components/restaurant/PublicRestaurantCard.tsx)
- [apps/web/src/components/restaurant/PublicRestaurantsMap.tsx](../../apps/web/src/components/restaurant/PublicRestaurantsMap.tsx)
- [apps/web/src/components/restaurant/detail/PublicRestaurantDetail.tsx](../../apps/web/src/components/restaurant/detail/PublicRestaurantDetail.tsx)
- [apps/web/src/components/restaurant/detail/HomeTab.tsx](../../apps/web/src/components/restaurant/detail/HomeTab.tsx)
- [apps/web/src/components/restaurant/detail/MenuTab.tsx](../../apps/web/src/components/restaurant/detail/MenuTab.tsx)
- [apps/web/src/components/restaurant/detail/ReviewsTab.tsx](../../apps/web/src/components/restaurant/detail/ReviewsTab.tsx)
- [apps/web/src/components/restaurant/detail/PhotosTab.tsx](../../apps/web/src/components/restaurant/detail/PhotosTab.tsx)
- [apps/web/src/components/restaurant/detail/Lightbox.tsx](../../apps/web/src/components/restaurant/detail/Lightbox.tsx)
- [apps/web/src/components/restaurant/detail/InfoTab.tsx](../../apps/web/src/components/restaurant/detail/InfoTab.tsx)
- [apps/web/src/components/restaurant/detail/shared.tsx](../../apps/web/src/components/restaurant/detail/shared.tsx)
- [apps/web/src/components/restaurant/detail/tabs.ts](../../apps/web/src/components/restaurant/detail/tabs.ts)
- [apps/web/src/components/ui/button.tsx](../../apps/web/src/components/ui/button.tsx)
- [apps/web/src/components/ui/card.tsx](../../apps/web/src/components/ui/card.tsx)
- [apps/web/src/components/ui/input.tsx](../../apps/web/src/components/ui/input.tsx)
- [apps/web/src/components/ui/table.tsx](../../apps/web/src/components/ui/table.tsx)
- [apps/web/src/components/ui/badge.tsx](../../apps/web/src/components/ui/badge.tsx)
- [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts)
- [apps/web/src/lib/vworld.ts](../../apps/web/src/lib/vworld.ts)
- [apps/web/src/styles/global.css](../../apps/web/src/styles/global.css)
- [apps/web/src/styles/tailwind.css](../../apps/web/src/styles/tailwind.css)
