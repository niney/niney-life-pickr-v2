---
topic: web
last_compiled: 2026-05-07
sources_count: 24
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
- **어드민 콘솔** — 사용자/역할 관리, 맛집 등록, 네이버 플레이스 크롤링
  실험, **LLM 키 관리 + AI 호출 테스트 도구** (`/admin/*`). 역할이
  `ADMIN`인 계정만 접근 가능.

`apps/mobile`(React Native)와 동일한 백엔드(`apps/friendly`)를 바라보며,
공통 도메인 로직은 `@repo/shared`에서 끌어 쓴다.

## Architecture [coverage: high — 9 sources]

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
  `body`/링크 기본 색만 다루는 얇은 시트. 새 화면은 모두 Tailwind.
- 공유 RN-친화 컴포넌트(`Button`, `Input`, `Screen`, `Stack`,
  `SegmentedControl` 등)는 `@repo/shared`에서 가져와 `LoginPage`처럼
  모바일과 시각적 일관성이 중요한 화면에서 사용. 어드민은 shadcn 쪽을 쓴다.

## Talks To [coverage: high — 4 sources]

- **`@repo/api-contract`** — 공유 zod 스키마 기반 타입을 직접 import
  (`Role`, `CrawlJobType`, `NaverPlaceDataType`, `BlogReviewType`,
  `VisitorReviewType`, `MenuItemType`, `ReviewStatsType`,
  `CrawlNaverPlaceResultType`, `CrawlStageType`, `LlmProviderConfigType`,
  `LlmProviderIdType`, `TestLlmProviderResultType`,
  `UpdateLlmProviderInputType`, `AiCompleteBatchInputType`,
  `AiCompleteBatchResultItemType`, `AiCompleteResultType`).
- **`@repo/shared`** — API 클라이언트 부트스트랩(`configureApi`),
  Zustand 스토어(`useAuthStore`), React Query 훅들
  (`useCurrentUser`, `useLogin`, `useRegister`, `useLogout`,
  `usePicks`, `useRandomPick`, `useAdminUsers`, `useSetUserRole`,
  `useCrawlJobs`, `useCrawlJobStream`, `useStartCrawl`,
  `useCancelCrawl`, **`useProviders`, `useUpdateProvider`,
  `useDeleteProvider`, `useTestProvider`, `useProviderModels`,
  `useCompleteAi`, `useCompleteBatchAi`**), 테마(`ThemeProvider`/
  `lightTheme`/`applyCssVars`), 공통 상수(`APP_NAME`, `QUERY_STALE_TIME`,
  `QUERY_GC_TIME`), 에러 클래스(`ApiError`).
- **백엔드 friendly** — `VITE_API_URL`(예: `http://localhost:3000`)을
  `configureApi({ baseUrl })`에 흘려보낸다
  ([.env.example](../../apps/web/.env.example),
  [main.tsx](../../apps/web/src/main.tsx)). 개발 시에는 Vite 서버의
  `proxy: { '/api': 'http://localhost:3000' }` 덕분에 CORS 회피 가능
  ([vite.config.ts](../../apps/web/vite.config.ts)).
- **Radix UI** — `@radix-ui/react-slot`, `react-dialog`,
  `react-dropdown-menu`(현 시점에 광범위하게 쓰진 않으나 의존성 등록).
- **lucide-react** — 모든 아이콘 (어드민 메뉴: `Home`,
  `UtensilsCrossed`, `Beaker`, `KeyRound`, `Sparkles`; AI 화면 내부:
  `PlugZap`, `Save`, `Trash2`, `Play`, `Plus`, `CheckCircle2`,
  `AlertCircle`, `XCircle`, `Loader2`).

## API Surface [coverage: high — 3 sources]

웹 앱은 HTTP 엔드포인트가 아니라 **브라우저 URL**을 노출한다.

- `/` — 홈 (로그인/게스트/관리자 분기)
- `/login` — 로그인 + 회원가입 + 게스트 진입
- `/picks` — 내 Pick 목록 + 랜덤 추첨 (세션 필수)
- `/admin` — 어드민 대시보드 (사용자 목록 + 역할 토글)
- `/admin/restaurants` — 네이버 플레이스 URL 적재 폼 (현재는 클라이언트
  메모리에만 저장; 백엔드 연결은 TODO)
- `/admin/crawl-test` — URL 입력 후 크롤링 잡 시작
- `/admin/crawl-test/:jobId` — 특정 잡의 SSE 스트림 실시간 표시
  (단계 stepper, 부분 결과, 방문자 리뷰 라이브 카운트, 취소 버튼)
- `/admin/ai-keys` — provider 카드 리스트
  ([AdminAiKeysPage](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx)).
  카드별로 `apiKey`(password input, 마스킹), `baseUrl`, `defaultModel`
  (datalist 자동완성), `enabled`(체크박스), `maxConcurrent`(number)
  편집 폼 + "연결 테스트" 버튼(폼의 `defaultModel`을 즉시 사용) +
  "키 삭제" 버튼(`window.confirm` 후 `useDeleteProvider`).
  `provider.updatedAt`이 없으면(env-backed) 삭제 비활성.
- `/admin/ai-test` — LLM 호출 실험 도구
  ([AdminAiTestPage](../../apps/web/src/routes/admin/AdminAiTestPage.tsx)).
  4개 모드 토글 — `single`(단건), `batch`(서로 다른 prompt N개),
  `multi-model`(같은 prompt × 여러 모델 체크박스),
  `multi-sample`(같은 prompt × 같은 모델 × N회). 결과는 우측 그리드에
  카드로 누적, 배치는 실제 경과 시간(`performance.now()` 차)도 표시.

## Data [coverage: high — 3 sources]

- 로컬 DB 없음. 모든 상태는 두 갈래로 갈린다.
  - **서버 상태** — TanStack Query 캐시. `staleTime`, `gcTime`,
    `retry: 1`, `refetchOnWindowFocus: false`로 글로벌 설정
    ([main.tsx](../../apps/web/src/main.tsx)).
  - **클라이언트 상태** — Zustand `useAuthStore` (`token`, `user`,
    `isGuest`).
- **토큰 영속화** — `localStorage` 키 `lp:token` (게스트 플래그는
  `lp:guest`). 부팅 시 한 번 읽어 스토어에 주입하고,
  `useAuthStore.subscribe`로 스토어 변경을 다시 localStorage로
  반영한다.
- **API 클라이언트 토큰 주입** — `configureApi({ getToken: () =>
  useAuthStore.getState().token })`. 401 응답 시
  `onUnauthorized: clearSession`으로 자동 로그아웃.
- **AdminCrawlTestPage 캐시 갱신** — 활성 잡이 끝나면 (`stream.result
  !== null`) `['crawl', 'jobs']` 쿼리만 invalidate. SSE를 쓰는
  취지를 살려 폴링하지 않는다.
- **AdminAiKeysPage 폼 동기화** — 각 카드는 자체 `useState<FormState>`를
  유지하되, `useEffect([provider])`로 부모(`useProviders`)가 새로 받아온
  데이터에 맞춰 폼을 리셋한다. 저장 성공 후 `apiKey` 필드만 비워서
  password input이 마스킹 상태로 돌아간다.
- **AdminAiTestPage 결과 누적** — `singleResult`, `batchResults` 두
  state로 분리. 새 실행 전에 `reset()`이 둘 다 비운다. 모델 후보는
  `useProviderModels('ollama-cloud')`로 best-effort 조회 (키 없거나
  실패 시 빈 배열).

## Key Decisions [coverage: high — 5 sources]

- **React 19** — 모바일은 RN 0.76 호환을 위해 React 18에 묶여 있지만,
  웹은 최신을 따라간다. 결과적으로 두 앱이 다른 React 메이저를 쓰며,
  공유 컴포넌트는 두 버전 모두에서 동작하는 형태로 작성돼야 한다.
- **Next.js 미채택** — 풀텍스트 SEO나 SSR 요구사항이 없고, 어드민 콘솔
  성격이 강해 단순 SPA로 충분하다고 판단. 빌드 단순성 + Vite의 빠른
  HMR이 이점.
- **Tailwind v4 + shadcn 토큰** — CSS-in-JS를 도입하지 않고 OKLCH
  변수 + `cn()` 유틸 + class-variance-authority로 정리. global.css는
  최소화.
- **`@repo/shared` 경유 API/스토어** — 모바일과 동일한 React Query
  훅을 그대로 호출. 웹 전용 API 함수를 따로 두지 않는다.
- **역할 기반 라우트 가드** — `RequireSession`(token 또는 guest),
  `RequireAdmin`(token + role==='ADMIN')을 컴포넌트로 분리해 라우트
  트리에 직접 끼워 넣는다.
- **Vite dev proxy** — `/api`만 friendly로 프록시. 운영 환경에서는
  `VITE_API_URL`로 절대 URL을 가리킨다.
- **Opt-in temperature** —
  [AdminAiTestPage](../../apps/web/src/routes/admin/AdminAiTestPage.tsx)는
  `useTemperature` 체크박스를 기본 off로 둔다. off일 때는 페이로드에서
  `temperature` 필드 자체를 빼서 보내고, on일 때만 슬라이더 값(0–2)을
  실어 보낸다. 이렇게 해야 provider/모델 고유 기본값(특히
  reasoning 계열)이 클라이언트가 무심코 0.7을 덮어쓰는 일을 막는다.
- **AdminAiKeysPage의 "변경 시에만 입력" 패턴** — `apiKey` 필드는
  password input + `autoComplete="new-password"`로 마스킹하고, 폼 값이
  비어 있으면 `buildUpdateInput`이 `apiKey` 키를 PATCH 페이로드에서
  생략한다. 이렇게 해야 사용자가 "수정 안 함"을 명시적으로 표현할
  필요 없이 다른 필드만 저장 가능. `baseUrl`/`defaultModel`은 빈 문자열
  vs 원본 비교로 `null` 전송 ↔ 미전송을 구분한다.
- **datalist + 자유 입력 fallback 패턴** — 모델 선택은 `<input
  list="...">`+`<datalist>` 조합으로 처리한다. provider가 모델 목록을
  못 주거나 키가 없을 때도 사용자가 수동으로 모델 ID를 입력 가능
  (예: 신규/사설 모델). select가 아니라 input이라 "타이핑 = 자동완성
  필터"가 자연스럽고, 모바일에서도 동작.
- **multi-model 모드 시작값은 빈 배열** — `multiModelChoices`는
  `useState<string[]>([])`로 시작한다. 의도는 "AI 키가 없으면 알 수
  있는 모델도 없다 → 추정으로 alias를 미리 채우지 말 것". 사용자가
  체크박스로 명시 선택해야만 실행 항목이 생기고, prompt만 있고 선택이
  0개면 `buildBatchItems`가 `[]`를 반환해 즉시 차단된다.
- **클라이언트 측 항목 상한 = 10** — batch/multi-model/multi-sample
  모드 모두 `items.length > 10` 검사로 사전 차단. 서버 측에서도 같은
  상한을 강제하지만 UI에서 먼저 막아 네트워크 왕복을 줄인다.

## Gotchas [coverage: high — 4 sources]

- **`.tsx` 옆에 따라다니는 `.js` 파일은 빌드 잔재**다. 소스가 아니므로
  편집/참조하지 말 것. (`tsc -b` 출력이 dist가 아닌 트리에 떨어진
  상태로 커밋된 흔적.)
- **SSE 인증** — `EventSource`가 커스텀 헤더를 못 보내기 때문에
  `useCrawlJobStream`은 토큰을 `?token=` 쿼리스트링으로 붙인다.
  서버 라우트도 이 형태를 받도록 맞춰져 있다(상세는 friendly 토픽 참고).
- **logout 시 localStorage 정리** — `useAuthStore.subscribe`가
  스토어 변경을 localStorage로 미러링하므로, 로그아웃은 토큰을
  `null`로 되돌리기만 하면 자동으로 키가 지워진다. 직접
  `localStorage.removeItem`을 부를 필요 없다.
- **AdminRestaurantsPage는 아직 백엔드 미연결** — 제출한 URL은
  컴포넌트 state에만 머문다. 새로고침하면 사라짐. UI 자체에도
  "현재 화면 세션에만 보관됩니다"라는 디스클레이머가 박혀 있다.
- **HomePage admin 링크 게이트** — 새로고침 직후 토큰만 복원되고
  `user`가 비어 있는 상황을 위해, `App` 루트가 마운트되자마자
  `useCurrentUser()`를 호출해 역할까지 hydrate한다. 이 호출을 빼면
  관리자 링크가 잠깐 사라졌다 다시 나타나는 깜빡임이 생긴다.
- **Tailwind v4 + OKLCH** — 일부 브라우저/스크린샷 도구가 OKLCH
  채도 표현을 정확히 렌더링하지 못할 수 있다. 디자인 검수 시 유의.
- **Vite deps prebundle 캐시 vs `@repo/shared` 변경** —
  `@repo/shared`에 새 export(예: `useProviders`, `useCompleteAi`)를
  추가했는데 Vite dev 서버가 이전 prebundle을 들고 있으면
  `does not provide an export named 'X'` 런타임 에러가 뜬다.
  `apps/web/node_modules/.vite`를 지우고 dev 서버를 재시작하면 해결.
  CI 빌드는 매번 새로 prebundle하므로 영향 없음.
- **`window.confirm` 사용** —
  [AdminAiKeysPage](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx)의
  "키 삭제" 버튼은 OS 다이얼로그(`window.confirm`)로 확인을 받는다.
  접근성/디자인 일관성이 떨어지고, 자동화 테스트(Playwright 등)에서
  특수 처리가 필요하다는 단점이 있다. 추후 shadcn `AlertDialog` 또는
  Radix `react-dialog`로 옮기는 게 적절.
- **AdminAiTestPage 모델 목록은 단일 provider 가정** — 현재
  `useProviderModels('ollama-cloud')`로 한 provider의 모델만 datalist에
  채운다. 다른 provider(OpenAI 등)의 모델을 비교하려면 사용자가 직접
  ID를 타이핑해야 한다. 모드별 입력은 모두 같은 datalist를 공유한다
  (`MODELS_DATALIST_ID = 'ai-test-models'`).

## Sources [coverage: high — 24 sources]

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
- [apps/web/src/routes/admin/AdminAiKeysPage.tsx](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx)
- [apps/web/src/routes/admin/AdminAiTestPage.tsx](../../apps/web/src/routes/admin/AdminAiTestPage.tsx)
- [apps/web/src/components/admin/AdminLayout.tsx](../../apps/web/src/components/admin/AdminLayout.tsx)
- [apps/web/src/components/ui/button.tsx](../../apps/web/src/components/ui/button.tsx)
- [apps/web/src/components/ui/card.tsx](../../apps/web/src/components/ui/card.tsx)
- [apps/web/src/components/ui/input.tsx](../../apps/web/src/components/ui/input.tsx)
- [apps/web/src/components/ui/table.tsx](../../apps/web/src/components/ui/table.tsx)
- [apps/web/src/components/ui/badge.tsx](../../apps/web/src/components/ui/badge.tsx)
- [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts)
- [apps/web/src/styles/global.css](../../apps/web/src/styles/global.css)
- [apps/web/src/styles/tailwind.css](../../apps/web/src/styles/tailwind.css)
