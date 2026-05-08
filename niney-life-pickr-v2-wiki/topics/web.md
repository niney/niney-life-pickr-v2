---
topic: web
last_compiled: 2026-05-09
sources_count: 30
status: active
aliases: [vite, react, web-app, frontend-web]
---

# web — Vite + React 웹 앱

## Purpose [coverage: high — 4 sources]

`apps/web/`는 Life Pickr 서비스의 브라우저용 SPA다. 두 가지 사용 흐름을 한
번들 안에 담는다.

- **공개 사용자 화면** — 게스트/로그인 사용자가 자신의 Pick 목록을 보고
  랜덤 추첨을 돌리는 곳 ([HomePage](../../apps/web/src/routes/HomePage.tsx),
  [LoginPage](../../apps/web/src/routes/LoginPage.tsx),
  [PicksPage](../../apps/web/src/routes/PicksPage.tsx)).
- **어드민 콘솔** — 사용자/역할 관리, 맛집 등록·상세 보기·재크롤링,
  네이버 플레이스 크롤링 실험, **LLM 키 관리 + AI 호출 테스트 도구**,
  **AI 분석 관리(메뉴 정규화 + 전역 머지 + 카테고리 트리 + 전역 메뉴 통계)**
  (`/admin/*`). 역할이 `ADMIN`인 계정만 접근 가능.

`apps/mobile`(React Native)와 동일한 백엔드(`apps/friendly`)를 바라보며,
공통 도메인 로직은 `@repo/shared`에서 끌어 쓴다.

## Architecture [coverage: high — 12 sources]

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
- 진입 HTML은 한국어 로케일 + `Life Pickr` 타이틀 한 장
  ([index.html](../../apps/web/index.html)).

### 라우팅

`react-router-dom` v7을 `BrowserRouter`로 사용한다
([App.tsx](../../apps/web/src/App.tsx)).

| Path | Component | Guard |
| --- | --- | --- |
| `/` | `HomePage` | 없음 |
| `/login` | `LoginPage` | 없음 |
| `/picks` | `PicksPage` | `RequireSession` (token 또는 guest) |
| `/admin` | `AdminLayout` (Outlet) | `RequireAdmin` |
| `/admin` (index) | `AdminHomePage` | ↑ 상속 |
| `/admin/restaurants` | `AdminRestaurantsPage` | ↑ |
| `/admin/restaurants/:placeId` | `AdminRestaurantDetailPage` | ↑ |
| `/admin/analytics` | `AdminAnalyticsPage` | ↑ |
| `/admin/crawl-test` | `AdminCrawlTestPage` | ↑ |
| `/admin/crawl-test/:jobId` | `AdminCrawlTestPage` | ↑ |
| `/admin/ai-keys` | `AdminAiKeysPage` | ↑ |
| `/admin/ai-test` | `AdminAiTestPage` | ↑ |

`RequireAdmin`은 `useCurrentUser()`로 역할을 검증하고, 캐시된 `user`가
없을 때만 로딩 화면을 띄우는 식으로 깜빡임을 줄인다.

### 어드민 셸

[`AdminLayout`](../../apps/web/src/components/admin/AdminLayout.tsx)이
좌측 사이드바(NavLink) + 상단 `AdminTopBar` + `<Outlet/>` 본문 패턴.
메뉴 항목은 6개:

| Icon (lucide) | Label | Path |
| --- | --- | --- |
| `Home` | 홈 | `/admin` (`end: true`) |
| `UtensilsCrossed` | 맛집 | `/admin/restaurants` |
| `BarChart3` | AI 분석 관리 | `/admin/analytics` |
| `Beaker` | 크롤링 테스트 | `/admin/crawl-test` |
| `KeyRound` | AI 키 | `/admin/ai-keys` |
| `Sparkles` | AI 테스트 | `/admin/ai-test` |

활성 NavLink는 `bg-primary text-primary-foreground`로 강조, 그 외엔
`text-muted-foreground hover:bg-accent`. 하단에 "← 일반 화면으로"
탈출 링크가 항상 박혀 있다.

### 맛집 화면 트리

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
  — `useRestaurantByPlaceId`로 단일 GET, 상단 헤더 + flat divide-y
  레이아웃의 정보/영업시간/메뉴/사진 섹션, AI 요약 진행 카드(잡이 없을
  때만 별도 표시), **메뉴 순위 카드(`MenuRankingSection`)**, 방문자
  리뷰(별점/요약 필터 + 정렬 + 20개 페이지 pagination), 블로그 리뷰
  (12 + 더보기). 정렬 기본값은 `fetchedAt-asc` (Naver가 최신 방문→옛
  방문 순으로 내려주고 어댑터가 그 순서대로 저장하므로 `fetchedAt asc
  == 최근 수집순`). 방문일 정렬은 `visitedSortKey`로 `"YY.M.D"`를
  `"YYYY-MM-DD"`로 정규화 후 비교한다 (원문 그대로 비교하면 `"25.8" >
  "25.12"`로 오판됨). 헤더 우측 업데이트/재크롤/삭제는 모두 in-page에서
  동작 — 재크롤 시 detail 캐시의 `reviews`를 즉시 비워서 새 배치가
  stale id와 섞이지 않게 한다.
- [`components/restaurant/`](../../apps/web/src/components/restaurant/)
  — 두 페이지가 공유하는 컴포넌트 디렉토리.
  - [`ActiveJobPanel.tsx`](../../apps/web/src/components/restaurant/ActiveJobPanel.tsx)
    — 단일 잡의 SSE 카드. `useCrawlJobStream(jobId)` + `useRestaurantSummaryEvents(placeId)`를
    구독하고 `visitor_batch.persistedReviews`를 detail 캐시에 직접
    머지(중복 id 필터링 + `videos` 필드 포함). `done` 시 list/detail
    둘 다 invalidate, `onFinished`를 정확히 한 번 호출. props:
    `showInlineReviewList`(detail은 false로 자기 리스트 중복 방지),
    `onPlaceIdResolved`, `onCancel`, `onDismiss`, `onFinished`.
  - [`sections.tsx`](../../apps/web/src/components/restaurant/sections.tsx)
    — `SectionHeader`, `SummaryProgressSection`, `ReviewSummaryItem`,
    `ReviewSummarySection`. `ReviewSummaryItem`은 본문 ≈ 요약(짧은
    리뷰에서 AI가 그대로 따라 쓴 케이스)을 감지해 dimmed로 렌더하며,
    감정 뱃지(`positive/negative/mixed/neutral` → emerald/rose/amber/
    muted), `만족도 N/5` 칩, 메뉴 칩(메뉴별 sentiment 색상), `💡 팁`
    리스트를 한 카드 안에 늘어놓는다. 비디오 타일은 `posterUrl`을
    `reviewThumbnailUrl(_, 200)`로 프록시 통과시켜 16x16 그리드에
    `▶` 오버레이로 렌더, 클릭 시 인라인 `VideoPlayerModal`이 뜬다.
  - [`MenuRankingSection.tsx`](../../apps/web/src/components/restaurant/MenuRankingSection.tsx)
    — 식당 상세에 마운트되는 메뉴 순위 카드. `useMenuRanking(placeId,
    { sort, minMentions })`로 데이터를 받아 정렬 dropdown
    (언급/긍정/긍정률/부정), 최소 언급 dropdown(1/2/3/5), 상위 10개 +
    "전체 보기" 토글. 미분류 메뉴가 있거나 `modelVersion < currentVersion`
    이면 상단에 amber 알림 + "분류하기" 버튼(`useGroupForRestaurant`
    mutate). 각 행은 순번/메뉴명/미분류 배지/variants/topTraits + **
    `SentimentBar`** (긍정 emerald / 중립 zinc / 부정 red, 너비 32 / 높이
    2의 가로 막대) + 언급 수 + 긍정률. 글로벌 매핑이 있으면
    **`GlobalCompareBadge`**: 전체 평균 긍정률 + 식당 수 + 자기 식당
    delta(절댓값 5%p 이상일 때만 ↑/↓ 트렌드, emerald/red), "전체 보기"
    `<Link to="/admin/analytics?menu=...">` deep-link.
  - **`VideoPlayerModal`** (`sections.tsx` 내부) — portal/포커스 트랩
    없는 가벼운 다이얼로그. ESC 키와 backdrop 클릭 모두 닫기. 마운트
    시 `document.body.style.overflow = 'hidden'`로 스크롤 락,
    언마운트에서 원복. `<video controls autoPlay>`로 서명된 akamaized
    video URL을 그대로 재생(프록시 우회).
  - `ImgWithFallback` 헬퍼 — detail 페이지 내부에 정의. 모든 `<img>`에
    `referrerPolicy="no-referrer"`를 주어 Naver 이미지 CDN(ldb-phinf
    등)의 referer 검사 우회. onError 시 placeholder 박스로 스왑.

### AI 분석 관리 화면 [신규]

[`AdminAnalyticsPage`](../../apps/web/src/routes/admin/AdminAnalyticsPage.tsx)는
하나의 페이지에 4개의 카드 + 1개 진행 패널을 쌓는다. 모든 데이터는
`@repo/shared`의 분석 훅 (`useAnalyticsOverview`, `useCategoryTree`,
`useGlobalMenus`, `useGroupingRestaurantsStatus`, `useCreateGroupingJob`,
`useGroupingJob`, `useStartGlobalMerge`, `useGlobalMergeJob`)에서 끌어
온다 — 페이지 본체엔 fetch 로직이 없다.

1. **전체 카운터** — `Card` 3개 그리드. 전체 식당 / 정규화 완료(emerald)
   / 처리 필요(amber). `needsAttention(r)`는 `unmappedMenus > 0` 또는
   `storedVersion < currentVersion`.
2. **`GlobalMergeSection`** — 전역 메뉴 머지. 4개 metric 그리드(식당
   그룹 합계 / 전역 그룹 / 매핑 비율 % / 마지막 머지 시각) + "증분 머지"
   "전체 재실행" 버튼. `lastGlobalMergeAt === null && perRestaurantGroupCount
   > 0`이면 amber 안내 문구. 잡 시작 후 `useGlobalMergeJob(jobId)`가 chunk
   진행바(`doneChunks/totalChunks`)와 결과 metric을 SSE로 갱신. 시작
   시 409 응답(이미 진행 중)은 `ApiError.statusCode === 409`로 잡아 alert
   처리.
3. **`CategoryTreeSection`** — `useCategoryTree`의 `roots`를 재귀
   `CategoryTreeRow`로 렌더. 각 노드는 `depth * 16px` 들여쓰기 +
   접기/펼치기 버튼(`▾`/`▸`, depth=0은 default open) + 라벨 클릭 시
   `setSearchParams({category: node.path})` → 같은 페이지의 메뉴 통계
   섹션 자동 필터링. 노드 옆에 `totalMentions`, `positiveRatio` 표시.
   roots가 비면 "전역 머지를 한 번 실행해야 카테고리 path가 채워집니다"
   안내.
4. **`GlobalMenusSection`** — 전역 메뉴 검색/통계 테이블.
   `useSearchParams` 가 single source of truth — `?menu=`, `?category=`
   를 직접 읽어 `useGlobalMenus({ q, category, sort, minMentions, limit:
   50, includeUnlinked })`에 흘려보낸다. 입력 onChange 안에서 즉시
   `setSearchParams(_, { replace: true })`로 URL 갱신, 별도 `useState`
   + `useEffect` 동기화 없음. 카테고리 인풋은 `<datalist>`로 트리 path
   자동완성. sort dropdown은 `mentions/positive/positiveRatio/restaurants`,
   minMentions는 1/3/5/10, "미머지 포함" 체크박스. 결과 테이블은 메뉴/
   카테고리(클릭 시 `setCategory`로 self-filter)/언급/식당/긍정·부정/
   긍정률/대표 식당 2개. `globalKey.startsWith('unlinked:')`이면 "미머지"
   라벨.
5. **정규화 진행 패널 + 식당별 정규화 상태 테이블** — `useGroupingRestaurantsStatus`
   로 식당 리스트를 받아 체크박스 + sort dropdown(unmapped/analyzed/name)
   으로 보여주고, "선택 N개 정규화"와 "처리 필요 N개 일괄 정규화" 버튼.
   `useCreateGroupingJob`으로 잡 시작 → `setJobId(snap.jobId)` →
   `useGroupingJob(jobId)`이 SSE 진행을 받아 진행바 + per-item 리스트
   (`pending/running/done/failed/skipped` 아이콘). `done|failed`이면
   "닫기" 버튼으로 패널 언마운트.

### 메뉴 분석 ↔ 식당 상세 데이터 흐름

```
AdminRestaurantDetailPage
  └─ MenuRankingSection (placeId)
       ├─ useMenuRanking(placeId)            ─── /restaurants/{id}/menu-ranking
       ├─ useGroupForRestaurant().mutate     ─── 분류 잡 단일 식당
       └─ GlobalCompareBadge → <Link to="/admin/analytics?menu=…">

AdminAnalyticsPage
  ├─ GlobalMergeSection
  │    ├─ useAnalyticsOverview                ─── /analytics/overview
  │    ├─ useStartGlobalMerge / useGlobalMergeJob (SSE)
  │    └─ 409 → ApiError 분기
  ├─ CategoryTreeSection
  │    └─ useCategoryTree                     ─── /analytics/category-tree
  │       클릭 → setSearchParams({category})
  ├─ GlobalMenusSection (URL-driven)
  │    └─ useGlobalMenus({ q, category, … })  ─── /analytics/global-menus
  │       ?menu=, ?category= 가 single source of truth
  └─ 정규화 잡
       ├─ useGroupingRestaurantsStatus
       ├─ useCreateGroupingJob / useGroupingJob (SSE)
       └─ 처리 필요 일괄 = filter(needsAttention).map(placeId)
```

서버 측 SSE/잡 형식과 분석 엔드포인트 상세는 [analytics](analytics.md)
와 [menu-grouping](menu-grouping.md), 훅 시그니처는 [shared](shared.md)
참조.

### UI 시스템

- **shadcn/ui 스타일 프리미티브** — `~/components/ui/`에 손으로 들고 온
  컴포넌트들: `Button`(class-variance-authority + Radix Slot),
  `Card`/`CardHeader`/`CardContent`/`CardTitle`/`CardDescription`/`CardFooter`,
  `Input`, `Table`(+ Header/Body/Row/Head/Cell), `Badge`.
- **Tailwind CSS v4** — `@tailwindcss/vite` 플러그인 + `@import "tailwindcss";`
  단일 진입점([tailwind.css](../../apps/web/src/styles/tailwind.css)).
  shadcn 색 토큰을 OKLCH로 정의하고 `@theme inline`으로 Tailwind 색상
  매핑. `.dark` 클래스 토글로 다크 모드 지원.
- **`cn()` 유틸** — `clsx + tailwind-merge`
  ([lib/utils.ts](../../apps/web/src/lib/utils.ts)).
- **레거시 글로벌 CSS** — [global.css](../../apps/web/src/styles/global.css)는
  body·앵커 기본만 다루는 얇은 시트. 앵커 색은 `@layer base`로 감싸서
  Tailwind 유틸리티가 항상 이긴다.
- 공유 RN-친화 컴포넌트(`Button`, `Input`, `Screen`, `Stack`,
  `SegmentedControl` 등)는 `@repo/shared`에서 가져와 `LoginPage`처럼
  모바일과 시각적 일관성이 중요한 화면에서 사용. 어드민은 shadcn 쪽을 쓴다.

## Talks To [coverage: high — 5 sources]

- **`@repo/api-contract`** — 공유 zod 스키마 기반 타입을 직접 import
  (`Role`, `CrawlJobType`, `CrawlModeType`, `CrawlStageType`,
  `CrawlNaverPlaceResultType`, `NaverPlaceDataType`, `BlogReviewType`,
  `VisitorReviewType`, `VisitorReviewWithSummaryType`, `MenuItemType`,
  `ReviewStatsType`, `ReviewSummaryStatusType`, `RestaurantListItemType`,
  `RestaurantDetailType`, `RestaurantSummaryProgressType`,
  `LlmProviderConfigType`, `LlmProviderIdType`,
  `TestLlmProviderResultType`, `UpdateLlmProviderInputType`,
  `AiCompleteBatchInputType`, `AiCompleteBatchResultItemType`,
  `AiCompleteResultType`, **`MenuRankingItemType`, `MenuRankingSortType`,
  `CategoryTreeNodeType`, `GlobalMenuQuerySortType`,
  `MenuGroupingRestaurantStatusType`**).
- **`@repo/shared`** — API 클라이언트 부트스트랩(`configureApi`),
  Zustand 스토어(`useAuthStore`, **`useActiveCrawlJobStore`**), React
  Query 훅들 (`useCurrentUser`, `useLogin`, `useRegister`, `useLogout`,
  `usePicks`, `useRandomPick`, `useAdminUsers`, `useSetUserRole`,
  `useCrawlJobs`, `useCrawlJobStream`, `useStartCrawl`,
  `useCancelCrawl`, `useRestaurantList`, `useRestaurantByPlaceId`,
  `useRestaurantSummaryEvents`, `useRestaurantListSummaryEvents`,
  `useDeleteRestaurant`, `useProviders`, `useUpdateProvider`,
  `useDeleteProvider`, `useTestProvider`, `useProviderModels`,
  `useCompleteAi`, `useCompleteBatchAi`, **`useMenuRanking`,
  `useGroupForRestaurant`, `useAnalyticsOverview`, `useCategoryTree`,
  `useGlobalMenus`, `useGroupingRestaurantsStatus`,
  `useCreateGroupingJob`, `useGroupingJob`, `useStartGlobalMerge`,
  `useGlobalMergeJob`**), 테마(`ThemeProvider`/`lightTheme`/
  `applyCssVars`), 공통 상수(`APP_NAME`, `QUERY_STALE_TIME`,
  `QUERY_GC_TIME`), 에러 클래스(`ApiError`), 타입(`ActiveCrawlJob`).
- **`@repo/utils`** — 썸네일 프록시 헬퍼 `reviewThumbnailUrl(originalUrl,
  size)` 사용. 비디오 `posterUrl`/리뷰 이미지 모두 같은 헬퍼로 프록시
  경유시킨다(상세는 [media](media.md)).
- **TanStack Query 캐시 직접 패치** — `ActiveJobPanel`은 SSE
  `visitor_batch.persistedReviews`를 받아 `qc.setQueryData(['restaurant',
  placeId], …)`로 detail 캐시의 `reviews` 배열에 직접 합친다(중복 id
  필터링, `videos` 필드 포함). 재크롤 시작 시에는 detail 페이지가
  미리 같은 키에 빈 `reviews: []`를 써서 stale을 비우고, 잡 종료 시엔
  list/detail 둘 다 `invalidateQueries` 한다.
- **`useActiveCrawlJobStore`(zustand singleton)** — `jobs:
  Record<jobId, ActiveCrawlJob>`. 리스트와 detail이 같은 스토어를 읽기
  때문에 어느 쪽에서 시작한 잡이든 모든 화면에 즉시 보인다.
  `add/remove/resolvePlaceId` 액션. `source: 'new' | 'list-row'`로
  렌더 위치를 결정.
- **URL = state** — `AdminAnalyticsPage`의 `?menu=`, `?category=`는
  `useSearchParams`로 직접 읽고, 입력 onChange 안에서
  `setSearchParams(_, { replace: true })`로 즉시 갱신. `MenuRankingSection`
  의 `GlobalCompareBadge`는 `<Link to="/admin/analytics?menu=…">`로
  같은 URL state에 deep-link.
- **백엔드 friendly** — `VITE_API_URL`(예: `http://localhost:3000`)을
  `configureApi({ baseUrl })`에 흘려보낸다
  ([.env.example](../../apps/web/.env.example),
  [main.tsx](../../apps/web/src/main.tsx)). 개발 시에는 Vite 서버의
  `proxy: { '/api': 'http://localhost:3000' }` 덕분에 CORS 회피 가능
  ([vite.config.ts](../../apps/web/vite.config.ts)).
- **Radix UI** — `@radix-ui/react-slot`, `react-dialog`,
  `react-dropdown-menu`(현 시점에 광범위하게 쓰진 않으나 의존성 등록).
- **lucide-react** — 모든 아이콘 (어드민 메뉴: `Home`,
  `UtensilsCrossed`, `BarChart3`, `Beaker`, `KeyRound`, `Sparkles`;
  맛집: `ChevronRight`, `Link`, `Loader2`, `Play`, `RefreshCw`, `Trash2`,
  `XCircle`, `ArrowLeft`, `Clock`, `ExternalLink`, `Image`, `Info`,
  `Star`, `AlertCircle`, `CheckCircle2`, `X`; 분석: `BarChart3`,
  `AlertTriangle`, `PlayCircle`, `TrendingUp`, `TrendingDown`, `Sparkles`;
  AI 화면: `PlugZap`, `Save`, `Plus`).

크롤링 SSE/요약 이벤트 hook의 내부는 [shared](shared.md), 서버 측
스트림 형식은 [crawl](crawl.md), 분석 엔드포인트는 [analytics](analytics.md),
메뉴 정규화 잡은 [menu-grouping](menu-grouping.md), 썸네일 프록시는
[media](media.md) 참고.

## API Surface [coverage: high — 4 sources]

웹 앱은 HTTP 엔드포인트가 아니라 **브라우저 URL** + 재사용 가능한 React
컴포넌트를 노출한다.

URL:

- `/` — 홈 (로그인/게스트/관리자 분기)
- `/login` — 로그인 + 회원가입 + 게스트 진입
- `/picks` — 내 Pick 목록 + 랜덤 추첨 (세션 필수)
- `/admin` — 어드민 대시보드 (사용자 목록 + 역할 토글)
- `/admin/restaurants` — 네이버 플레이스 URL 적재 폼 + 등록된 맛집
  리스트 + 행 단위 업데이트/재크롤/삭제 + 다중 슬롯 active job panel +
  만족도/긍정/부정비율 정렬 dropdown
- `/admin/restaurants/:placeId` — 단일 맛집 상세 (정보/영업시간/메뉴/
  이미지 + AI 요약 진행 + **메뉴 순위 카드(GlobalCompareBadge 포함)**
  + 방문자 리뷰 필터·정렬(`fetchedAt-asc` 기본)·pagination + 블로그
  리뷰 + 리뷰별 비디오 인라인 재생)
- `/admin/analytics` — **AI 분석 관리. `?menu=`, `?category=` query
  param 으로 deep-link 가능. 카운터 카드 + 전역 머지 + 카테고리 트리 +
  전역 메뉴 통계 + 식당별 정규화 상태 테이블**
- `/admin/crawl-test` — URL 입력 후 크롤링 잡 시작 (구버전, 그대로 유지)
- `/admin/crawl-test/:jobId` — 특정 잡의 SSE 스트림 실시간 표시
- `/admin/ai-keys` — provider 카드 리스트
  ([AdminAiKeysPage](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx))
- `/admin/ai-test` — LLM 호출 실험 도구
  ([AdminAiTestPage](../../apps/web/src/routes/admin/AdminAiTestPage.tsx))

내부 재사용 컴포넌트:

- [`ActiveJobPanel`](../../apps/web/src/components/restaurant/ActiveJobPanel.tsx)
  — 리스트의 행별 패널과 detail의 진행 카드 양쪽에서 공유.
- [`MenuRankingSection`](../../apps/web/src/components/restaurant/MenuRankingSection.tsx)
  — `placeId` props 하나로 식당 상세에 마운트. `SentimentBar`,
  `GlobalCompareBadge`는 같은 파일 내 비공개 helper.
- [`SectionHeader`/`SummaryProgressSection`/`ReviewSummaryItem`/`ReviewSummarySection`/`VideoPlayerModal`](../../apps/web/src/components/restaurant/sections.tsx)
  — flat 섹션 레이아웃의 공통 빌딩 블록. `VideoPlayerModal`은 inline
  비공개 export(같은 파일 내에서만 사용).
- `AdminAnalyticsPage` 내부 비공개 컴포넌트: `GlobalMergeSection`,
  `CategoryTreeSection`, `CategoryTreeRow`(재귀), `GlobalMenusSection`,
  `Metric`, `JobStateBadge`, `ItemStateIcon`.

## Data [coverage: high — 4 sources]

- 로컬 DB 없음. 모든 상태는 네 갈래로 갈린다.
  - **서버 상태** — TanStack Query 캐시. `staleTime`, `gcTime`,
    `retry: 1`, `refetchOnWindowFocus: false`로 글로벌 설정
    ([main.tsx](../../apps/web/src/main.tsx)).
  - **클라이언트 인증 상태** — Zustand `useAuthStore` (`token`, `user`,
    `isGuest`).
  - **다중 슬롯 잡 상태** — Zustand `useActiveCrawlJobStore`
    (`jobs: Record<jobId, ActiveCrawlJob>`). 리스트·상세 어느 쪽에서
    시작했든 같은 스토어를 보기 때문에 화면 전환 사이에서 잡이 살아있다.
  - **URL 쿼리 = 분석 필터** — `AdminAnalyticsPage`의 `?menu=`,
    `?category=`는 `useSearchParams`가 직접 read/write. `useState +
    useEffect 동기화` 회피 — `useEffect 회피 원칙`. 새로고침/공유 가능,
    race 없음.
- **TanStack Query 키 컨벤션** —
  - `['restaurant', 'list']` — 리스트 페이지가 사용. 각 행 카운터/요약
    버킷 새로고침 대상.
  - `['restaurant', placeId]` — 상세 + `ActiveJobPanel`이 공유. SSE
    배치는 이 캐시에 직접 머지(`setQueryData`, `videos` 포함), 잡
    `done`은 invalidate.
  - `['restaurant', placeId, 'summary-status']` 형태의 보조 키는
    `useRestaurantSummaryEvents` 내부에서 관리(상세는 [shared](shared.md)).
  - `['menu-ranking', placeId, sort, minMentions]` 등 분석 키는
    `@repo/shared` 분석 훅 내부에서 관리(상세는 [shared](shared.md)
    + [analytics](analytics.md)).
- **토큰 영속화** — `localStorage` 키 `lp:token` (게스트 플래그는
  `lp:guest`). 부팅 시 한 번 읽어 스토어에 주입하고,
  `useAuthStore.subscribe`로 스토어 변경을 다시 localStorage로
  반영한다.
- **API 클라이언트 토큰 주입** — `configureApi({ getToken: () =>
  useAuthStore.getState().token })`. 401 응답 시
  `onUnauthorized: clearSession`으로 자동 로그아웃.
- **AdminAiKeysPage 폼 동기화** — 각 카드는 자체 `useState<FormState>`를
  유지하되, `useEffect([provider])`로 부모(`useProviders`)가 새로 받아온
  데이터에 맞춰 폼을 리셋한다. 저장 성공 후 `apiKey` 필드만 비워서
  password input이 마스킹 상태로 돌아간다.
- **AdminAiTestPage 결과 누적** — `singleResult`, `batchResults` 두
  state로 분리. 새 실행 전에 `reset()`이 둘 다 비운다.
- **AdminAnalyticsPage 잡 ID** — 정규화 잡과 글로벌 머지 잡 두 개를
  각각 로컬 `useState<jobId|null>`로 들고, `useGroupingJob(jobId)` /
  `useGlobalMergeJob(jobId)`이 SSE를 구독. 잡 종료(`done|failed`) 후
  "닫기"로 `null` 리셋. 페이지를 떠나면 잡은 살아있지만 SSE 구독은
  끊긴다 — 다시 들어와도 `?` 형태로 재구독하지 않으므로, 진행 중인
  잡이라도 `useGroupingRestaurantsStatus`가 자동 invalidate되며 UI는
  복구된다.

## Key Decisions [coverage: high — 8 sources]

- **React 19** — 모바일은 RN 0.76 호환을 위해 React 18에 묶여 있지만,
  웹은 최신을 따라간다. 결과적으로 두 앱이 다른 React 메이저를 쓰며,
  공유 컴포넌트는 두 버전 모두에서 동작하는 형태로 작성돼야 한다.
- **Next.js 미채택** — 풀텍스트 SEO나 SSR 요구사항이 없고, 어드민 콘솔
  성격이 강해 단순 SPA로 충분하다고 판단.
- **Tailwind v4 + shadcn 토큰** — CSS-in-JS를 도입하지 않고 OKLCH
  변수 + `cn()` 유틸 + class-variance-authority로 정리. Tamagui 같은
  RN-호환 스타일 시스템은 명시적으로 거부 — 웹/모바일 UI를 한 트리에
  엮지 않고 platform-ui-split 정책을 따른다(웹=shadcn, 모바일=RN).
- **`@repo/shared` 경유 API/스토어** — 모바일과 동일한 React Query
  훅을 그대로 호출. 웹 전용 API 함수를 따로 두지 않는다.
- **stream-driven cache merge** — SSE 배치를 받자마자 detail 쿼리
  캐시(`['restaurant', placeId]`)에 직접 `setQueryData`로 머지한다.
  서버를 다시 때리지 않고도 새 리뷰가 즉시 화면에 박힌다.
- **역할 기반 라우트 가드** — `RequireSession`(token 또는 guest),
  `RequireAdmin`(token + role==='ADMIN')을 컴포넌트로 분리해 라우트
  트리에 직접 끼워 넣는다.
- **다중 슬롯 잡 = 글로벌 zustand 싱글턴** — `useActiveCrawlJobStore`로
  잡을 전역 상태에 두고, 리스트/상세 어느 컴포넌트도 같은 스토어에서
  자기 슬롯을 골라 본다. 리스트는 모든 잡을 렌더하고(new는 상단,
  list-row는 행 아래), 상세는 자기 placeId에 매칭되는 잡 하나만
  렌더. 페이지를 옮겨도 잡이 끊기지 않는다.
- **상세 페이지의 in-page 잡** — 업데이트/재크롤을 눌러도 navigate-back
  하지 않고 같은 페이지에 `ActiveJobPanel`을 마운트. `onFinished`로
  헤더 버튼을 다시 활성화하고 패널을 언마운트한다.
- **재크롤 시작 시 detail 캐시 review 비우기** — 서버가 cascade로 옛
  리뷰를 지우므로, 클라가 미리 `reviews: []`로 set 해 stale id가 새
  배치와 섞이지 않게 한다.
- **`fetchedAt-asc == 최근 수집순`** — Naver는 최신 방문→옛 방문 순으로
  내려주고 어댑터가 그 순서대로 즉시 저장하기 때문에, `fetchedAt`
  오름차순이 곧 "Naver가 최신순으로 내려준 수집 순서"가 된다. 정렬
  레이블 의미를 코드 주석으로 못 박았다.
- **방문일 정렬은 정규화 후 비교** — 원문 `"YY.M.D"`는 zero-pad가 안 돼
  있어 문자열 비교 시 `"25.8" > "25.12"`로 뒤집힌다. `visitedSortKey`가
  `"YYYY-MM-DD"`로 정규화 후 `localeCompare`.
- **비디오는 프록시 우회, 썸네일만 프록시** — `<video src>`는 서명된
  akamaized URL을 그대로 사용(스트리밍 트래픽을 friendly로 끌어오지
  않음). 반면 `posterUrl`/리뷰 이미지는 referer 검사 때문에
  `reviewThumbnailUrl`로 프록시 경유.
- **인라인 모달 (no portal)** — `VideoPlayerModal`은 portal/포커스 트랩
  없이 `fixed inset-0` + `z-50`으로 띄운다. ESC + backdrop 클릭으로
  닫고, body scroll lock으로 배경 스크롤만 잠근다.
- **`visitor_batch.persistedReviews`를 detail 캐시에 직접 머지** —
  리스트만 invalidate하면 detail에서 재요청이 늦게 들어오고 사용자가
  빈 화면을 본다. 배치 자체에 충분한 정보(`id`, `body`, `rating`,
  `fetchedAt`, `imageUrls`, `videos` 등)가 들어 있어 그대로 머지 가능.
- **`ImgWithFallback` + `referrerPolicy="no-referrer"`** — Naver 이미지
  CDN이 referer를 검사해 외부 origin 요청을 403으로 떨어뜨린다. 모든
  `<img>`에 `no-referrer`를 강제하고 onError 시 placeholder로 스왑.
- **인라인 confirm-delete (2-step)** — 리스트 행과 상세 헤더 모두
  trash 아이콘 1차 클릭으로 "정말 삭제 / 취소" 두 버튼이 인라인으로
  뜨고 2차 클릭에서만 mutate. `window.confirm` OS 다이얼로그 없이
  화면 안에서 끝난다.
- **Vite dev proxy** — `/api`만 friendly로 프록시. 운영 환경에서는
  `VITE_API_URL`로 절대 URL.
- **Opt-in temperature** —
  [AdminAiTestPage](../../apps/web/src/routes/admin/AdminAiTestPage.tsx)는
  `useTemperature` 체크박스를 기본 off로 둔다. off일 때는 페이로드에서
  `temperature` 필드 자체를 빼서 보내, provider/모델 고유 기본값을
  보존한다.
- **AdminAiKeysPage의 "변경 시에만 입력" 패턴** — `apiKey` 필드는
  password input + `autoComplete="new-password"`로 마스킹하고, 폼 값이
  비어 있으면 `buildUpdateInput`이 `apiKey` 키를 PATCH 페이로드에서
  생략한다.
- **datalist + 자유 입력 fallback** — 모델 선택은 `<input list>` +
  `<datalist>`로 처리해 키가 없거나 모델 목록이 없어도 수동 ID 입력 가능.
  `AdminAnalyticsPage` 카테고리 인풋도 같은 패턴 — 트리 path를 datalist에
  넣어 자동완성 + 자유 입력.
- **클라이언트 항목 상한 10** — batch/multi-model/multi-sample 모두
  `items.length > 10`을 사전 차단(서버도 동일 상한).
- **URL = single source of truth** — `AdminAnalyticsPage`의 `?menu=`,
  `?category=`는 `useSearchParams`가 직접 read/write. `useState +
  useEffect로 query를 미러링`하는 패턴은 `useEffect 회피 원칙` 위반
  + race + 동기화 버그 위험이 크다. onChange 안에서 즉시
  `setSearchParams(_, { replace: true })`를 호출하면 뒤로가기 히스토리가
  쌓이지 않고, 페이지 새로고침/링크 공유 시에도 상태가 그대로 복구된다.
  `MenuRankingSection`의 `<Link to="/admin/analytics?menu=...">`도 같은
  계약으로 deep-link 한다.
- **분석 페이지 = compose-of-hooks** — 페이지 본체가 SSE를 직접 다루지
  않는다. `useGroupingJob/useGlobalMergeJob` 훅이 백엔드 SSE를 React
  Query 캐시로 흘려보내 주고, 페이지는 결과만 렌더한다. 모바일이 같은
  훅으로 같은 데이터를 그릴 수 있는 이유.
- **`MenuRankingSection`의 trend 임계값 5%p** — `Math.abs(delta) >= 0.05`
  일 때만 ↑/↓ 화살표를 노출한다. 노이즈 수준 차이를 트렌드로 오해석하지
  않게 막는 의도. 식당이 1개뿐(`g.restaurantCount <= 1`)이면 비교 자체가
  무의미하므로 trend 표시를 완전 생략.
- **재귀 컴포넌트 + depth=0 default open** — `CategoryTreeRow`는
  `depth < 1`을 default open으로 잡아 root 레벨이 항상 펼쳐진 상태로
  뜬다. 깊은 레벨은 사용자가 명시적으로 열어야 — 화면이 너무 길어지지
  않도록.

## Gotchas [coverage: high — 7 sources]

- **`global.css`의 unlayered `a { color }`은 Tailwind 유틸을 이긴다** —
  CSS cascade-layer 규칙상 unlayered가 layered보다 우선. 그래서
  `text-muted-foreground` 같은 클래스를 줘도 색이 안 바뀌는 사고가
  난다. 현재는 `@layer base { a { color: inherit } }` + `.link-primary`
  유틸로 정리. 새 글로벌 룰 추가 시 반드시 layer 안에 둘 것
  ([global.css](../../apps/web/src/styles/global.css)).
- **재크롤 시 detail 캐시를 미리 비워야 한다** — 서버가 옛 리뷰를
  cascade-delete하기 때문에, 캐시를 그대로 두면 SSE batch가 도착하면서
  곧 사라질 row와 새 row가 섞인다. detail 페이지가
  `qc.setQueryData([..., placeId], prev => ({ ...prev, reviews: [] }))`로
  먼저 비우는 이유.
- **방문일 정렬 정규화 누락 시 8월 > 12월** — `visitedAt`은 Naver 원문
  `"25.8.3.일"` 같은 형태라 `localeCompare` 직빵으로 쓰면 월 1자리 vs
  2자리에서 뒤집힌다. 항상 `visitedSortKey`를 거쳐야 한다.
- **다중 슬롯 = 동시 다발 start** — 글로벌 zustand 스토어 덕에 UI는
  잡을 무제한 띄울 수 있고, 서버 큐가 동시성 캡을 넘는 제출을 흡수한다
  (상세는 [crawl](crawl.md)). UI 쪽 가드는 행 단위 `busy` 정도로 충분.
- **하이드레이션 안전 스타일링** — `RestaurantRow`가 `cursor-pointer`/
  `cursor-default`를 props 기반으로 토글하는데, SSR이 없는 SPA라
  미스매치 자체는 발생하지 않지만, 추후 SSR 도입 시엔 동일한 className
  분기 패턴이 깨질 수 있다는 점에 주의.
- **`.tsx` 옆에 따라다니는 `.js` 파일은 빌드 잔재**다. 소스가 아니므로
  편집/참조하지 말 것.
- **SSE 인증** — `EventSource`가 커스텀 헤더를 못 보내기 때문에
  `useCrawlJobStream`은 토큰을 `?token=` 쿼리스트링으로 붙인다.
  서버 라우트도 이 형태를 받도록 맞춰져 있다(상세는 [crawl](crawl.md)).
- **서명된 video URL 만료** — Naver의 akamaized 비디오 URL은 일정
  TTL이 박힌 서명을 포함한다. detail 캐시에 머지된 `videos[].videoUrl`
  은 시간이 지나면 403이 될 수 있어, 화면을 오래 띄워둔 뒤
  `VideoPlayerModal`을 열면 재생이 실패할 수 있다. 새로고침으로 단순
  복구 — 별도 refresh 로직은 없다.
- **`VideoPlayerModal` body scroll lock** — 모달이 마운트되는 동안
  `document.body.style.overflow = 'hidden'`이 박힌다. 컴포넌트가 정상
  언마운트되지 않고 트리에서 쳐내지면 락이 남아 페이지가 스크롤
  안 되는 상태로 멎을 수 있다. 현재 코드는 `useEffect` cleanup으로
  원복하므로 정상 흐름에선 안전.
- **logout 시 localStorage 정리** — `useAuthStore.subscribe`가
  스토어 변경을 localStorage로 미러링하므로, 로그아웃은 토큰을
  `null`로 되돌리기만 하면 자동으로 키가 지워진다.
- **HomePage admin 링크 게이트** — 새로고침 직후 토큰만 복원되고
  `user`가 비어 있는 상황을 위해, `App` 루트가 마운트되자마자
  `useCurrentUser()`를 호출해 역할까지 hydrate한다.
- **Tailwind v4 + OKLCH** — 일부 브라우저/스크린샷 도구가 OKLCH
  채도 표현을 정확히 렌더링하지 못할 수 있다.
- **Vite deps prebundle 캐시 vs `@repo/shared` 변경** —
  `@repo/shared`에 새 export(예: `useMenuRanking`,
  `useAnalyticsOverview`, `useGlobalMergeJob`)를 추가했는데 Vite dev
  서버가 이전 prebundle을 들고 있으면 `does not provide an export named
  'X'` 런타임 에러. `apps/web/node_modules/.vite`를 지우고 dev 재시작.
- **`useActiveCrawlJobStore` 셀렉터 안정성** — detail에서 placeId 매칭
  잡 하나만 뽑아 쓸 때, 매번 새 객체를 만들면 zustand 기본 reference
  equality가 깨져 무관한 잡 변경에도 리렌더가 일어난다. 현재 코드는
  `for ... return j`로 매칭 객체를 그대로 반환해 안정성을 유지.
- **리스트 정렬은 클라이언트 측, SSE 구독은 원본 기준** —
  `AdminRestaurantsPage`의 정렬 dropdown은 `rawItems`를 다시 정렬해
  렌더만 바꾼다. `useRestaurantListSummaryEvents`는 정렬되지 않은
  `rawItems.map(placeId)`를 받아야 정렬 변경 시 EventSource가 끊겼다
  다시 붙는 일을 막는다.
- **`window.confirm`은 AdminAiKeysPage에만 남아 있다** — 맛집 쪽은
  이미 인라인 confirm-delete로 마이그레이션됨. AI 키 삭제도 추후 같은
  패턴으로 옮기는 게 적절.
- **글로벌 머지 409 = 이미 진행 중** — `useStartGlobalMerge.mutateAsync`
  가 409를 던지면 `ApiError.statusCode === 409`로 잡아야 한다. 현재
  `GlobalMergeSection`은 단순 `alert()`로 처리 — 더 친절한 처리는
  inflight 잡 drawer 노출이지만 이번 단계는 단순화. `ApiError` 인스턴스에
  서버 body가 들어 있지 않아 진행 중인 jobId 복원도 어렵다.
- **`?menu=`, `?category=`는 replace 모드** — `setSearchParams(_, {
  replace: true })`로 호출하므로 입력 한 글자마다 history entry가 쌓이지
  않는다. 다만 deep-link로 들어온 첫 진입은 `push` 결과로 남아 정상적인
  뒤로가기가 가능.
- **`MenuRankingSection`의 글로벌 매핑 의존** — `GlobalCompareBadge`는
  `item.global`이 채워졌을 때만 렌더된다. 즉 전역 머지(`/admin/analytics`
  의 "전역 메뉴 머지")를 한 번도 안 돌렸다면 식당 상세에서 비교 배지가
  전혀 안 보인다. UX상 명시 안내는 없으므로, 처음 페이지를 본 관리자가
  "왜 비교가 안 보이지" 헷갈릴 여지가 있다.
- **`useEffect 회피 원칙`을 깬 코드 한 곳** — `AdminAiKeysPage`의
  카드별 `useEffect([provider])`는 부모 데이터 변동에 폼을 리셋해야
  하기 때문에 남아 있다. `AdminAnalyticsPage`는 의도적으로 `useEffect`
  없이 onChange + setSearchParams로만 동기화한다.

## Sources [coverage: high — 30 sources]

- [apps/web/package.json](../../apps/web/package.json)
- [apps/web/index.html](../../apps/web/index.html)
- [apps/web/vite.config.ts](../../apps/web/vite.config.ts)
- [apps/web/tsconfig.json](../../apps/web/tsconfig.json)
- [apps/web/.env.example](../../apps/web/.env.example)
- [apps/web/src/main.tsx](../../apps/web/src/main.tsx)
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx)
- [apps/web/src/routes/HomePage.tsx](../../apps/web/src/routes/HomePage.tsx)
- [apps/web/src/routes/LoginPage.tsx](../../apps/web/src/routes/LoginPage.tsx)
- [apps/web/src/routes/PicksPage.tsx](../../apps/web/src/routes/PicksPage.tsx)
- [apps/web/src/routes/admin/AdminHomePage.tsx](../../apps/web/src/routes/admin/AdminHomePage.tsx)
- [apps/web/src/routes/admin/AdminCrawlTestPage.tsx](../../apps/web/src/routes/admin/AdminCrawlTestPage.tsx)
- [apps/web/src/routes/admin/AdminRestaurantsPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantsPage.tsx)
- [apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx)
- [apps/web/src/routes/admin/AdminAnalyticsPage.tsx](../../apps/web/src/routes/admin/AdminAnalyticsPage.tsx)
- [apps/web/src/routes/admin/AdminAiKeysPage.tsx](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx)
- [apps/web/src/routes/admin/AdminAiTestPage.tsx](../../apps/web/src/routes/admin/AdminAiTestPage.tsx)
- [apps/web/src/components/admin/AdminLayout.tsx](../../apps/web/src/components/admin/AdminLayout.tsx)
- [apps/web/src/components/restaurant/ActiveJobPanel.tsx](../../apps/web/src/components/restaurant/ActiveJobPanel.tsx)
- [apps/web/src/components/restaurant/sections.tsx](../../apps/web/src/components/restaurant/sections.tsx)
- [apps/web/src/components/restaurant/MenuRankingSection.tsx](../../apps/web/src/components/restaurant/MenuRankingSection.tsx)
- [apps/web/src/components/ui/button.tsx](../../apps/web/src/components/ui/button.tsx)
- [apps/web/src/components/ui/card.tsx](../../apps/web/src/components/ui/card.tsx)
- [apps/web/src/components/ui/input.tsx](../../apps/web/src/components/ui/input.tsx)
- [apps/web/src/components/ui/table.tsx](../../apps/web/src/components/ui/table.tsx)
- [apps/web/src/components/ui/badge.tsx](../../apps/web/src/components/ui/badge.tsx)
- [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts)
- [apps/web/src/styles/global.css](../../apps/web/src/styles/global.css)
- [apps/web/src/styles/tailwind.css](../../apps/web/src/styles/tailwind.css)
- [apps/web/src/main.tsx](../../apps/web/src/main.tsx)
