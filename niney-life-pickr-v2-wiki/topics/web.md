---
topic: web
last_compiled: 2026-05-07
sources_count: 28
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
  네이버 플레이스 크롤링 실험, **LLM 키 관리 + AI 호출 테스트 도구**
  (`/admin/*`). 역할이 `ADMIN`인 계정만 접근 가능.

`apps/mobile`(React Native)와 동일한 백엔드(`apps/friendly`)를 바라보며,
공통 도메인 로직은 `@repo/shared`에서 끌어 쓴다.

## Architecture [coverage: high — 11 sources]

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
| `/admin/crawl-test` | `AdminCrawlTestPage` | ↑ |
| `/admin/crawl-test/:jobId` | `AdminCrawlTestPage` | ↑ |
| `/admin/ai-keys` | `AdminAiKeysPage` | ↑ |
| `/admin/ai-test` | `AdminAiTestPage` | ↑ |

`RequireAdmin`은 `useCurrentUser()`로 역할을 검증하고, 캐시된 `user`가
없을 때만 로딩 화면을 띄우는 식으로 깜빡임을 줄인다.

### 어드민 셸

[`AdminLayout`](../../apps/web/src/components/admin/AdminLayout.tsx)이
좌측 사이드바(NavLink) + `<Outlet/>` 본문 패턴. 메뉴 항목은 5개:

| Icon (lucide) | Label | Path |
| --- | --- | --- |
| `Home` | 홈 | `/admin` (`end: true`) |
| `UtensilsCrossed` | 맛집 | `/admin/restaurants` |
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
  placeId에 묶인 `ActiveJobPanel`이 안커처럼 매달린다.
- [`AdminRestaurantDetailPage`](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx)
  — `useRestaurantByPlaceId`로 단일 GET, 상단 헤더 + flat divide-y
  레이아웃의 정보/영업시간/메뉴/사진 섹션, AI 요약 진행 카드(잡이 없을
  때만 별도 표시), 방문자 리뷰(별점/요약 필터 + 정렬 + 20개 페이지
  pagination), 블로그 리뷰(12 + 더보기). 헤더 우측 업데이트/재크롤/삭제는
  모두 in-page에서 동작 — 재크롤 시 detail 캐시의 `reviews`를 즉시
  비워서 새 배치가 stale id와 섞이지 않게 한다.
- [`components/restaurant/`](../../apps/web/src/components/restaurant/)
  — 두 페이지가 공유하는 컴포넌트 디렉토리.
  - [`ActiveJobPanel.tsx`](../../apps/web/src/components/restaurant/ActiveJobPanel.tsx)
    — 단일 잡의 SSE 카드. `useCrawlJobStream(jobId)` + `useRestaurantSummaryEvents(placeId)`를
    구독하고 `visitor_batch.persistedReviews`를 detail 캐시에 직접
    머지. `done` 시 list/detail 둘 다 invalidate, `onFinished`를 정확히
    한 번 호출. props: `showInlineReviewList`(detail은 false로 자기
    리스트 중복 방지), `onPlaceIdResolved`, `onCancel`, `onDismiss`,
    `onFinished`.
  - [`sections.tsx`](../../apps/web/src/components/restaurant/sections.tsx)
    — `SectionHeader`, `SummaryProgressSection`, `ReviewSummaryItem`,
    `ReviewSummarySection`. `ReviewSummaryItem`은 본문 ≈ 요약(짧은
    리뷰에서 AI가 그대로 따라 쓴 케이스)을 감지해 dimmed로 렌더.
  - `ImgWithFallback` 헬퍼 — detail 페이지 내부에 정의. 모든 `<img>`에
    `referrerPolicy="no-referrer"`를 주어 Naver 이미지 CDN(ldb-phinf
    등)의 referer 검사 우회. onError 시 placeholder 박스로 스왑.

### UI 시스템

- **shadcn/ui 스타일 프리미티브** — `~/components/ui/`에 손으로 들고 온
  컴포넌트들: `Button`(class-variance-authority + Radix Slot),
  `Card`/`CardHeader`/`CardContent`/`CardTitle`/`CardDescription`/`CardFooter`,
  `Input`, `Table`(+ Header/Body/Row/Head/Cell), `Badge`.
- **Tailwind CSS v4** — `@tailwindcss/vite` 플러그인 + `@import "tailwindcss";`
  단일 진입점([tailwind.css](../../apps/web/src/styles/tailwind.css)).
  shadcn 색 토큰을 OKLCH로 정의하고 `@theme inline`으로 Tailwind 색상
  매핑. `.dark` 클래스 토글로 다크 모드 지원(현재 light 고정).
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
  `AiCompleteResultType`).
- **`@repo/shared`** — API 클라이언트 부트스트랩(`configureApi`),
  Zustand 스토어(`useAuthStore`, **`useActiveCrawlJobStore`**), React
  Query 훅들 (`useCurrentUser`, `useLogin`, `useRegister`, `useLogout`,
  `usePicks`, `useRandomPick`, `useAdminUsers`, `useSetUserRole`,
  `useCrawlJobs`, `useCrawlJobStream`, `useStartCrawl`,
  `useCancelCrawl`, **`useRestaurantList`, `useRestaurantByPlaceId`,
  `useRestaurantSummaryEvents`, `useRestaurantListSummaryEvents`,
  `useDeleteRestaurant`**, `useProviders`, `useUpdateProvider`,
  `useDeleteProvider`, `useTestProvider`, `useProviderModels`,
  `useCompleteAi`, `useCompleteBatchAi`), 테마(`ThemeProvider`/
  `lightTheme`/`applyCssVars`), 공통 상수(`APP_NAME`, `QUERY_STALE_TIME`,
  `QUERY_GC_TIME`), 에러 클래스(`ApiError`), 타입(`ActiveCrawlJob`).
- **TanStack Query 캐시 직접 패치** — `ActiveJobPanel`은 SSE
  `visitor_batch.persistedReviews`를 받아 `qc.setQueryData(['restaurant',
  placeId], …)`로 detail 캐시의 `reviews` 배열에 직접 합친다(중복 id
  필터링). 재크롤 시작 시에는 detail 페이지가 미리 같은 키에 빈
  `reviews: []`를 써서 stale을 비우고, 잡 종료 시엔 list/detail 둘 다
  `invalidateQueries` 한다.
- **`useActiveCrawlJobStore`(zustand singleton)** — `jobs:
  Record<jobId, ActiveCrawlJob>`. 리스트와 detail이 같은 스토어를 읽기
  때문에 어느 쪽에서 시작한 잡이든 모든 화면에 즉시 보인다.
  `add/remove/resolvePlaceId` 액션. `source: 'new' | 'list-row'`로
  렌더 위치를 결정.
- **백엔드 friendly** — `VITE_API_URL`(예: `http://localhost:3000`)을
  `configureApi({ baseUrl })`에 흘려보낸다
  ([.env.example](../../apps/web/.env.example),
  [main.tsx](../../apps/web/src/main.tsx)). 개발 시에는 Vite 서버의
  `proxy: { '/api': 'http://localhost:3000' }` 덕분에 CORS 회피 가능
  ([vite.config.ts](../../apps/web/vite.config.ts)).
- **Radix UI** — `@radix-ui/react-slot`, `react-dialog`,
  `react-dropdown-menu`(현 시점에 광범위하게 쓰진 않으나 의존성 등록).
- **lucide-react** — 모든 아이콘 (어드민 메뉴: `Home`,
  `UtensilsCrossed`, `Beaker`, `KeyRound`, `Sparkles`; 맛집:
  `ChevronRight`, `Link`, `Loader2`, `Play`, `RefreshCw`, `Trash2`,
  `XCircle`, `ArrowLeft`, `Clock`, `ExternalLink`, `Image`, `Info`,
  `Star`, `AlertCircle`, `CheckCircle2`, `X`; AI 화면: `PlugZap`,
  `Save`, `Plus`).

크롤링 SSE/요약 이벤트 hook의 내부는 [shared](shared.md), 서버 측
스트림 형식은 [crawl](crawl.md) 토픽 참고.

## API Surface [coverage: high — 4 sources]

웹 앱은 HTTP 엔드포인트가 아니라 **브라우저 URL** + 재사용 가능한 React
컴포넌트를 노출한다.

URL:

- `/` — 홈 (로그인/게스트/관리자 분기)
- `/login` — 로그인 + 회원가입 + 게스트 진입
- `/picks` — 내 Pick 목록 + 랜덤 추첨 (세션 필수)
- `/admin` — 어드민 대시보드 (사용자 목록 + 역할 토글)
- `/admin/restaurants` — 네이버 플레이스 URL 적재 폼 + 등록된 맛집
  리스트 + 행 단위 업데이트/재크롤/삭제 + 다중 슬롯 active job panel
- `/admin/restaurants/:placeId` — 단일 맛집 상세 (정보/영업시간/메뉴/
  이미지 + 방문자 리뷰 필터·정렬·pagination + 블로그 리뷰 + AI 요약 진행)
- `/admin/crawl-test` — URL 입력 후 크롤링 잡 시작 (구버전, 그대로 유지)
- `/admin/crawl-test/:jobId` — 특정 잡의 SSE 스트림 실시간 표시
- `/admin/ai-keys` — provider 카드 리스트
  ([AdminAiKeysPage](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx))
- `/admin/ai-test` — LLM 호출 실험 도구
  ([AdminAiTestPage](../../apps/web/src/routes/admin/AdminAiTestPage.tsx))

내부 재사용 컴포넌트:

- [`ActiveJobPanel`](../../apps/web/src/components/restaurant/ActiveJobPanel.tsx)
  — 리스트의 행별 패널과 detail의 진행 카드 양쪽에서 공유.
- [`SectionHeader`/`SummaryProgressSection`/`ReviewSummaryItem`/`ReviewSummarySection`](../../apps/web/src/components/restaurant/sections.tsx)
  — flat 섹션 레이아웃의 공통 빌딩 블록.

## Data [coverage: high — 4 sources]

- 로컬 DB 없음. 모든 상태는 세 갈래로 갈린다.
  - **서버 상태** — TanStack Query 캐시. `staleTime`, `gcTime`,
    `retry: 1`, `refetchOnWindowFocus: false`로 글로벌 설정
    ([main.tsx](../../apps/web/src/main.tsx)).
  - **클라이언트 인증 상태** — Zustand `useAuthStore` (`token`, `user`,
    `isGuest`).
  - **다중 슬롯 잡 상태** — Zustand `useActiveCrawlJobStore`
    (`jobs: Record<jobId, ActiveCrawlJob>`). 리스트·상세 어느 쪽에서
    시작했든 같은 스토어를 보기 때문에 화면 전환 사이에서 잡이 살아있다.
- **TanStack Query 키 컨벤션** —
  - `['restaurant', 'list']` — 리스트 페이지가 사용. 각 행 카운터/요약
    버킷 새로고침 대상.
  - `['restaurant', placeId]` — 상세 + `ActiveJobPanel`이 공유. SSE
    배치는 이 캐시에 직접 머지(`setQueryData`), 잡 `done`은
    invalidate.
  - `['restaurant', placeId, 'summary-status']` 형태의 보조 키는
    `useRestaurantSummaryEvents` 내부에서 관리(상세는 [shared](shared.md)).
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

## Key Decisions [coverage: high — 7 sources]

- **React 19** — 모바일은 RN 0.76 호환을 위해 React 18에 묶여 있지만,
  웹은 최신을 따라간다. 결과적으로 두 앱이 다른 React 메이저를 쓰며,
  공유 컴포넌트는 두 버전 모두에서 동작하는 형태로 작성돼야 한다.
- **Next.js 미채택** — 풀텍스트 SEO나 SSR 요구사항이 없고, 어드민 콘솔
  성격이 강해 단순 SPA로 충분하다고 판단.
- **Tailwind v4 + shadcn 토큰** — CSS-in-JS를 도입하지 않고 OKLCH
  변수 + `cn()` 유틸 + class-variance-authority로 정리.
- **`@repo/shared` 경유 API/스토어** — 모바일과 동일한 React Query
  훅을 그대로 호출. 웹 전용 API 함수를 따로 두지 않는다.
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
- **`visitor_batch.persistedReviews`를 detail 캐시에 직접 머지** —
  리스트만 invalidate하면 detail에서 재요청이 늦게 들어오고 사용자가
  빈 화면을 본다. 배치 자체에 충분한 정보(`id`, `body`, `rating`,
  `fetchedAt`, `imageUrls` 등)가 들어 있어 그대로 머지 가능.
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
- **클라이언트 항목 상한 10** — batch/multi-model/multi-sample 모두
  `items.length > 10`을 사전 차단(서버도 동일 상한).

## Gotchas [coverage: high — 6 sources]

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
- **logout 시 localStorage 정리** — `useAuthStore.subscribe`가
  스토어 변경을 localStorage로 미러링하므로, 로그아웃은 토큰을
  `null`로 되돌리기만 하면 자동으로 키가 지워진다.
- **HomePage admin 링크 게이트** — 새로고침 직후 토큰만 복원되고
  `user`가 비어 있는 상황을 위해, `App` 루트가 마운트되자마자
  `useCurrentUser()`를 호출해 역할까지 hydrate한다.
- **Tailwind v4 + OKLCH** — 일부 브라우저/스크린샷 도구가 OKLCH
  채도 표현을 정확히 렌더링하지 못할 수 있다.
- **Vite deps prebundle 캐시 vs `@repo/shared` 변경** —
  `@repo/shared`에 새 export(예: `useRestaurantList`,
  `useActiveCrawlJobStore`)를 추가했는데 Vite dev 서버가 이전
  prebundle을 들고 있으면 `does not provide an export named 'X'` 런타임
  에러. `apps/web/node_modules/.vite`를 지우고 dev 재시작.
- **`useActiveCrawlJobStore` 셀렉터 안정성** — detail에서 placeId 매칭
  잡 하나만 뽑아 쓸 때, 매번 새 객체를 만들면 zustand 기본 reference
  equality가 깨져 무관한 잡 변경에도 리렌더가 일어난다. 현재 코드는
  `for ... return j`로 매칭 객체를 그대로 반환해 안정성을 유지.
- **`window.confirm`은 AdminAiKeysPage에만 남아 있다** — 맛집 쪽은
  이미 인라인 confirm-delete로 마이그레이션됨. AI 키 삭제도 추후 같은
  패턴으로 옮기는 게 적절.

## Sources [coverage: high — 28 sources]

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
- [apps/web/src/routes/admin/AdminAiKeysPage.tsx](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx)
- [apps/web/src/routes/admin/AdminAiTestPage.tsx](../../apps/web/src/routes/admin/AdminAiTestPage.tsx)
- [apps/web/src/components/admin/AdminLayout.tsx](../../apps/web/src/components/admin/AdminLayout.tsx)
- [apps/web/src/components/restaurant/ActiveJobPanel.tsx](../../apps/web/src/components/restaurant/ActiveJobPanel.tsx)
- [apps/web/src/components/restaurant/sections.tsx](../../apps/web/src/components/restaurant/sections.tsx)
- [apps/web/src/components/ui/button.tsx](../../apps/web/src/components/ui/button.tsx)
- [apps/web/src/components/ui/card.tsx](../../apps/web/src/components/ui/card.tsx)
- [apps/web/src/components/ui/input.tsx](../../apps/web/src/components/ui/input.tsx)
- [apps/web/src/components/ui/table.tsx](../../apps/web/src/components/ui/table.tsx)
- [apps/web/src/components/ui/badge.tsx](../../apps/web/src/components/ui/badge.tsx)
- [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts)
- [apps/web/src/styles/global.css](../../apps/web/src/styles/global.css)
- [apps/web/src/styles/tailwind.css](../../apps/web/src/styles/tailwind.css)
- [apps/web/src/main.tsx](../../apps/web/src/main.tsx)
