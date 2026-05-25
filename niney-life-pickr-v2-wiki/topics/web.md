---
topic: web
last_compiled: 2026-05-25
sources_count: 81
status: active
aliases: [vite, react, web-app, frontend-web, admin-discover, admin-auto-discover, admin-diningcode, admin-catchtable, panel-side-toggle, batch-crawl, naver-search-results, panelPrefsStore, usePanelSide, mobile-ux, route-split, korean-ime, lightbox-snap, body-scroll-mobile, ios-zoom-fix, canonical-merge, merge-proposal-queue, sticky-action-bar, fused-detail, show-on-map-button, restaurants-v2, bottom-sheet, joblog-tab, restaurant-crawl-logs-section, summary-cancel-button, summary-resume-button, public-restaurant-list-split, location-based-first-entry, public-reviews-pagination, settlement, settlement-stepper, settlement-share, settlement-history, ContactsPage, ParticipantEditDialog, ai-purpose, card-padding-fix, lightbox-dvh, map-zoom-label-toggle]
---

# web — Vite + React 웹 앱

**2026-05-25 변경 흡수** — 정산 라우트 15+ 파일 통째 신규 (`routes/settlement/`) + 라이트박스/지도/카드 패딩 UI 버그 3건 수정 + AI provider `purpose` (chat / image) 카드 분리. 정산 UI 패턴(4-step Stepper, Step1→Step3 점프, 공유 토큰 read-only, 참여자 수정 다이얼로그, 영수증 미리보기 JWT 우회) 만 web 토픽에서 다루고, 도메인 자체는 [settlement.md](settlement.md) 위임. `PublicRestaurantDetail` 헤더에 정산 진입 버튼 + `PublicTopBar` 에 "내 정산" 링크 + `App.tsx` 에 `/restaurants/:placeId/settle/new|:id`, `/share/settlements/:token`, `/me/settlements`, `/me/contacts` 라우트 추가 + `RequireUser` 가드(USER 허용, role 무관) 신설. UI 버그: (1) `CardContent` 기본 `pt-0` 제거 — `CardHeader` 와 짝지을 때만 의미 있던 패턴이 단독 `CardContent` (홈 랭킹 카드 등) 에서 상단 패딩 통째 사라짐. (2) `Lightbox` — 첫 mount `instant` jump + 가드 80ms / 이후 `smooth` + 가드 600ms (3번째 클릭 오인덱스 fix) + dialog 와 슬라이드 모두 `dvh` 기반(모바일 주소창 토글 잘림 fix) + slide `w-full` (`min-w-full` 폭주 fix). (3) `MapCanvas` declutter 해제 + 줌 14 임계값 라벨 토글 + 0.55배 축소 핀 (줌 아웃 시 핀까지 통째 가려지던 OL feature-단위 declutter 버그). 추가: `AdminAiKeysPage` 가 `{id, purpose}` ProviderKey 페어 단위 카드 + "다른 용도 추가" outline 영역, `AdminRestaurantsPage` 서버 페이징 + URL state(`sort/page/pageSize`) + `Pager`, `AdminRestaurantDetailPage` / `detail/shared.tsx` 메뉴 가격 `formatWonPrice` 통일, `restaurant-v2/BottomSheet` `viewKey` 메모리 제거 + `disableScrollLock` + 시트 maxHeight 명시 (2-시트 list/detail 분리 회귀 fix).

**2026-05-19 변경** — 세 가지 큰 줄기: (A) **요약 운영 UI**: `SummaryProgressSection` (`sections.tsx`) 에 "요약 중지"(`StopCircle`) / "요약 재개"(`PlayCircle`) 버튼 + 큐/대기/진행/완료/실패/중지/누락(amber) 7배지, 누락 = `totalReviews - accountedFor` (chain 휘발 잔여 표식). `ActiveJobPanel` 이 [진행도]/[로그] 탭 분리 + 신규 [JobLogTab.tsx](../../apps/web/src/components/restaurant/JobLogTab.tsx) — 크롤 SSE + 요약 SSE + DB 폴백 세 소스를 `(jobId, seq)` Map 으로 dedup 후 통합 렌더. 신규 [RestaurantCrawlLogsSection.tsx](../../apps/web/src/components/restaurant/RestaurantCrawlLogsSection.tsx) 아코디언 — 상세 페이지에서 placeId 단위 누적 로그를 lazy fetch + LIVE Radio 배지 + `useRestaurantSummaryEvents(open ? placeId : null, { onLog })` 로 실시간 추가. `AdminRestaurantDetailPage` 가 카드 가시성 조건 확장 (`summaryInFlight > 0 || cancelled > 0`) + `useCancelSummary`/`useResumeSummary` mutation 두 confirm dialog 연결. (B) **공개 맛집 v2 + 위치 기반 진입**: 신규 [RestaurantsV2Page.tsx](../../apps/web/src/routes/RestaurantsV2Page.tsx) + [restaurant-v2/BottomSheet.tsx](../../apps/web/src/components/restaurant-v2/BottomSheet.tsx) — 풀스크린 지도 + 바텀시트(드래그 스냅 3단계) + 시트 안 상세 in-place 전환 패턴. `PublicRestaurantsMap` 가 첫 진입 시 `useUserLocation` + `computeBboxAround(coords, 1.5km)` 로 자동 fly + "내 위치" 버튼 추가, 한국 밖이면 `isInKorea` 가드. 신규 [RestaurantDetailRoute.tsx](../../apps/web/src/routes/RestaurantDetailRoute.tsx) — placeId 라우트 분리. detail/ 디렉터리 통합 (`HomeTab`/`PhotosTab`/`ReviewsTab`/`PublicRestaurantDetail`) — 모바일 v2 와 같은 컴포넌트 트리 공유. `PublicRestaurantList` 헤더/본체 분리 리팩터. (C) **공개 리뷰 페이지네이션 분리**: 첫 페이지만 detail 동봉(`reviewsFirstPage`), `useRestaurantPublicReviews(placeId, { sentiment, sort })` 가 2 페이지부터 lazy. `ReviewsTab` 가 chip(전체/긍정/부정) + 정렬(최신/평점) URL state 동기화. **공개 사이드바/탑바 추가** ([PublicLayout/PublicSidebar/PublicTopBar.tsx](../../apps/web/src/components/PublicLayout.tsx)).

## Purpose [coverage: high — 6 sources]

`apps/web/`는 Life Pickr 서비스의 브라우저용 SPA다. 두 가지 사용 흐름을 한
번들 안에 담는다.

- **공개 사용자 화면** — 로그인 없이 누구나 접근 가능한 맛집 탐색 영역.
  - `/` HomePage — AI 분석된 리뷰의 긍정/부정 비율로 정렬한 식당 랭킹
    ([HomePage](../../apps/web/src/routes/HomePage.tsx))
  - `/restaurants` RestaurantsPage — 네이버 지도 패턴의 풀 뷰포트 검색 UI
    ([RestaurantsPage](../../apps/web/src/routes/RestaurantsPage.tsx))
  - `/login` LoginPage — 이메일 로그인 + 회원가입 + 게스트 진입
- **어드민 콘솔** — `/admin/*`. 역할이 `ADMIN`인 계정만 접근.
  사용자/역할 + canonical 단위 맛집 관리(병합·분리·삭제) + 다이닝코드 정식
  크롤링 + 캐치테이블 / 다이닝코드 / 네이버 크롤링 테스트 + 맛집 발견
  (네이버 PC 지도 검색) + 맛집 자동 발견 (AI 키워드 → 그룹 직렬 크롤·등록)
  + AI 분석 관리 + LLM/지도 키 설정.

`apps/mobile`(React Native)와 동일한 백엔드(`apps/friendly`)를 바라보며,
공통 도메인 로직은 `@repo/shared`에서 끌어 쓴다. 공개 페이지는 사용자
대상 — 디자인은 Pretendard + 네이버 지도 톤. 어드민은 운영 도구 — shadcn
디폴트 + system-ui.

## Architecture [coverage: high — 30 sources]

### 빌드 / 런타임

- **Vite 6 + `@vitejs/plugin-react`** — 정적 SPA 번들러
  ([vite.config.ts](../../apps/web/vite.config.ts)).
- **React 19 + react-dom 19** — `createRoot`/`StrictMode`로 마운트
  ([main.tsx](../../apps/web/src/main.tsx)).
- **TypeScript 5.7**, `@repo/config/tsconfig/react.json` 확장.
- 경로 별칭 `~/* → ./src/*` (Vite alias + tsconfig paths 양쪽).
- `extensions` 우선순위에 `.web.tsx`/`.web.ts` 포함.
- 진입 HTML 한국어 로케일 + jsDelivr Pretendard variable dynamic-subset
  preload + `lp:theme` localStorage FOUC 방지 인라인 스크립트.
- **OpenLayers 10.7** (`ol@^10.7.0`) — vworld JS SDK 대신 WMTS 직접.

### 라우팅

`react-router-dom` v7을 `BrowserRouter`로 사용한다
([App.tsx](../../apps/web/src/App.tsx)). 셸은 두 갈래로 분기.

| Path | Element | Wrapper |
| --- | --- | --- |
| `/` | `HomePage` | `PublicLayout` |
| `/restaurants` | `RestaurantsPage` (Outlet 포함) | `PublicLayout` |
| `/restaurants/:placeId` | `RestaurantDetailRoute` → `PublicRestaurantDetail` | ↑ (nested) |
| `/restaurants-v2/:placeId?` | `RestaurantsV2Page` (Outlet, BottomSheet) | `PublicLayout` |
| `/me/settlements` | `SettlementHistoryPage` | `PublicLayout` + `RequireUser` |
| `/me/contacts` | `ContactsPage` (단골 관리) | `PublicLayout` + `RequireUser` |
| `/restaurants/:placeId/settle/new` | `SettlementNewPage` (4-step) | `RequireUser` (단독) |
| `/restaurants/:placeId/settle/:id` | `SettlementResultPage` (저장 후 보기) | `RequireUser` (단독) |
| `/share/settlements/:token` | `SharedSettlementPage` (read-only) | (단독, 인증 X) |
| `/login` | `LoginPage` | (단독) |
| `/admin` (index) | `AdminHomePage` | `AdminLayout` + `RequireAdmin` |
| `/admin/discover` | `AdminDiscoverPage` | ↑ |
| `/admin/auto-discover` | `AdminAutoDiscoverPage` | ↑ (신규 — AI 키워드 → 그룹 직렬 크롤) |
| `/admin/restaurants` | `AdminRestaurantsPage` | ↑ |
| `/admin/restaurants/:placeId` | `AdminRestaurantDetailPage` | ↑ |
| `/admin/crawl-test`, `:jobId` | `AdminCrawlTestPage` | ↑ (네이버 검증) |
| `/admin/catchtable-test` | `AdminCatchtableTestPage` | ↑ |
| `/admin/catchtable-test/:shopRef` | `AdminCatchtableShopPage` | ↑ |
| `/admin/diningcode-test` | `AdminDiningcodeTestPage` | ↑ |
| `/admin/diningcode-test/:vRid` | `AdminDiningcodeShopPage` | ↑ (검증 진입) |
| `/admin/diningcode` | `AdminDiningcodePage` | ↑ (정식 — 검색/등록) |
| `/admin/diningcode/:vRid` | `AdminDiningcodeShopPage` | ↑ (정식 진입 — 같은 컴포넌트 재사용) |
| `/admin/analytics` | `AdminAnalyticsPage` | ↑ |
| `/admin/ai-test` | `AdminAiTestPage` | ↑ |
| `/admin/ai-keys` | `<Navigate to="/admin/settings/ai-keys" replace>` | ↑ (옛 북마크) |
| `/admin/settings` | `AdminSettingsPage` (Outlet) | ↑ |
| `/admin/settings` (index) | `<Navigate to="ai-keys" replace>` | ↑ |
| `/admin/settings/ai-keys` | `AdminAiKeysPage` | ↑ |
| `/admin/settings/map` | `AdminMapKeysPage` | ↑ |

`RequireAdmin`은 `useCurrentUser()`로 역할을 검증하고, 캐시된 `user`가
없을 때만 로딩 화면을 띄워 깜빡임 최소화. 신규 `RequireUser` 가드는 정산
라우트용 — `useAuthStore.token` 만 보고 비로그인이면 `/login` 으로 보내며
role 검사는 안 한다 (정산은 USER 도 사용). 가드 컴포넌트는 [App.tsx](../../apps/web/src/App.tsx)
안에 함께 정의 (별도 파일 분리 안 함 — 30줄 정도라 한 눈에 보이는 게 낫다).

### 정산 라우트 트리 [신규]

`src/routes/settlement/` 가 통째로 신설 — 15+ 파일. web 토픽에서는 라우트
등록 + UI 패턴만 다루고, 도메인 (분배 규칙·서버 스키마·draftStore) 은
[settlement.md](settlement.md) 참조.

```
src/routes/settlement/
├── SettlementNewPage.tsx     # 4-step stepper 셸 (Step1/2/3/4)
├── Step1Participants.tsx     # 참여자 입력 + 단골 자동완성/picker
├── Step2Source.tsx           # 직접 입력 / 영수증 사진 분기
├── Step3Edit.tsx             # 항목 편집 + MenuPickerDialog + 영수증 미리보기
├── Step4Review.tsx           # 분배 결과 미리보기 + 저장
├── SettlementResultPage.tsx  # 저장된 세션 단건 보기 (편집/공유 진입)
├── SettlementHistoryPage.tsx # /me/settlements — 카드 리스트
├── SharedSettlementPage.tsx  # /share/settlements/:token — read-only
├── ContactsPage.tsx          # /me/contacts — 단골 관리
├── ContactEditDialog.tsx     # 단골 한 명 편집
├── ContactPickerDialog.tsx   # 다중 선택으로 참여자 추가
├── ContactSuggestions.tsx    # 이름 입력 시 자동완성 드롭다운
├── MenuPickerDialog.tsx      # Step3 메뉴 추가 모달
├── ParticipantEditDialog.tsx # 저장 후 참여자/옵션 수정
├── SettlementShareDialog.tsx # 공유 토큰 생성/취소 + Copy/Web Share
└── SettlementCards.tsx       # 결과 페이지 공용 카드 (요약/항목/참여자)
```

각 파일의 도메인 의미와 mutation/store 연결은 [settlement.md](settlement.md) 가
다룬다. 이 토픽에서는 (Stepper 게이팅 / 영수증 미리보기 fetch+blob / 공유
토큰 read-only / 참여자 수정 다이얼로그) 4개 UI 패턴만 깊이 본다 — 아래
"Key Decisions" 참조.

### 모바일 UX 규율 (2026-05-13 도입)

`/restaurants`/`/admin/discover` 의 모바일 스크롤·sticky 패턴은 별도
문서 ([docs/mobile-public-restaurant-ux.md](../../docs/mobile-public-restaurant-ux.md))
참고. 모바일은 body 스크롤 + 상세 별도 라우트 + 탭 URL 의 일부 + 100dvh
+ 한글 IME 보호 + scroll-to-top 환경 자동 분기 + 16px 폰트 강제.

### 공개 셸 — `PublicLayout`

[`PublicLayout`](../../apps/web/src/components/PublicLayout.tsx)은
`flex min-h-screen flex-col font-pretendard` 컨테이너 + `PublicTopBar` +
`PublicSidebar`(모바일 햄버거) + `<Outlet/>`. 공개 페이지만 Pretendard,
어드민은 system-ui fallback.

### 어드민 셸

[`AdminLayout`](../../apps/web/src/components/admin/AdminLayout.tsx)이
좌측 사이드바(NavLink) + 상단 `AdminTopBar` + `<Outlet/>` 본문 패턴.
메뉴 항목 11개 (맛집 자동 발견 추가):

| Icon (lucide) | Label | Path |
| --- | --- | --- |
| `Home` | 홈 | `/admin` (`end: true`) |
| `Compass` | 맛집 발견 | `/admin/discover` |
| `Wand2` | 맛집 자동 발견 | `/admin/auto-discover` |
| `UtensilsCrossed` | 맛집 | `/admin/restaurants` |
| `Utensils` | 다이닝코드 크롤링 | `/admin/diningcode` |
| `BarChart3` | AI 분석 관리 | `/admin/analytics` |
| `Beaker` | 네이버 크롤링 테스트 | `/admin/crawl-test` |
| `Beaker` | 캐치테이블 크롤링 테스트 | `/admin/catchtable-test` |
| `Beaker` | 다이닝코드 크롤링 테스트 | `/admin/diningcode-test` |
| `Sparkles` | AI 테스트 | `/admin/ai-test` |
| `Settings` | 설정 | `/admin/settings` |

`AdminTopBar` 의 `TITLE_RULES` 도 `/admin/auto-discover` 매칭이 추가됐다
(`/admin/restaurants` 보다 뒤, `/admin/discover` 보다 앞 — `startsWith` 길이
순으로 더 구체적인 prefix 가 먼저 매칭되도록).

사이드바는 **md+ sticky aside, 모바일 드로어** (햄버거 트리거 +
ESC/backdrop 닫기). 활성 NavLink 는 `bg-primary text-primary-foreground`
강조.

### 공개 맛집 페이지 — 3-column 풀 뷰포트

[`RestaurantsPage`](../../apps/web/src/routes/RestaurantsPage.tsx) — xl+
에서만 풀-뷰포트 sticky 컬럼(list / Outlet / map), 모바일은 body 스크롤
자연 흐름. detail 활성 판단 `useMatch('/restaurants/:placeId')`. 패널
좌/우 토글 `panelPrefsStore` (xl+ 한정). URL state — `q/category/sort/bbox/placeId`.

공개 컴포넌트 트리 (변경 없음): `PublicRestaurantList`, `PublicRestaurantCard`,
`PublicRestaurantsMap`, `MapCanvas`, 5탭 상세 디렉토리
(`detail/PublicRestaurantDetail` + `HomeTab`/`MenuTab`/`ReviewsTab`/`PhotosTab`/
`InfoTab` + `Lightbox` + `shared.tsx`/`tabs.ts`). 자세한 내부 패턴은 이전
컴파일 본 참고 — 이번 라운드 변경 없음.

### 어드민 발견 페이지 [coverage: high — 4 sources]

[`AdminDiscoverPage`](../../apps/web/src/routes/admin/AdminDiscoverPage.tsx)
— 네이버 PC 지도 검색 → 결과 마커 → 다중 선택 일괄 크롤링. `DiscoverMap`
+ `DiscoverPanel`. 검색(빨강 `'primary'`) + 등록(회색 `'muted'`) 합성
마커. xl 미만 `mobileView: 'panel'|'map'` pill 토글, 선택 시 토글
`bottom-20` 상승. `PublicRestaurantDetail` 그대로 재사용 — 입력 prop 으로
들어오는 `RestaurantPublicDetailType` 자체가 백엔드에서 Naver+다이닝코드
fused 된 shape 이라 어드민 상세에서도 DC 형제의 사진/메뉴/리뷰가 같이 노출
(`HomeTab.SourceRatingLine` / `ReviewCountLine` 가 `detail.sources.naver` /
`detail.sources.diningcode` 둘 다 있을 때 분리 라벨, `storedReviewCount.naver
+ diningcode > 0` 일 때 ReviewCard 에 출처 배지). 다중 선택은 직렬 await +
시작 거부 보존(`setCheckedIds(failedIds)`).

**[변경] 행 → 지도 이동 = 호버가 아닌 명시적 버튼** —
[`DiscoverPanel`](../../apps/web/src/components/admin/discover/DiscoverPanel.tsx)
의 리스트 행은 식당명 라인 우측에 `MapPin` `ShowOnMapButton` 을 노출하고,
그 버튼 클릭만 `onHover(placeId)` (= 지도 `flyTo`) 를 발사한다. 행 본문은
상세 열기 전용 — `stopPropagation` 으로 두 액션을 분리. 모바일에서는 호버
이벤트가 없어 옛 hover 트리거가 동작하지 않던 문제 + 데스크톱에서 의도하지
않은 fly 가 일어나던 문제 둘 다 해소. 버튼은 active 일 때 `text-primary` 로
어느 행이 마지막 동기화 대상인지 표시.

**[변경] 등록 리스트 카드의 리뷰/요약 카운트** — `RestaurantPublicListItemType`
의 `totalReviews` / `summaryDone` 가 한 canonical 안 Naver + DC 형제의 합산
값으로 BE 에서 머지돼 들어오므로, 카드 배지("리뷰 N개", "요약 N/M")는 그
합산을 그대로 보여준다. FE 는 추가 분리 없이 단일 카운트만 노출.

### 어드민 자동 발견 페이지 [신규 / coverage: high — 3 sources]

[`AdminAutoDiscoverPage`](../../apps/web/src/routes/admin/AdminAutoDiscoverPage.tsx)
— "영역/카테고리" 입력 한 줄로 AI 가 검색어 8 개를 만들고, 네이버 PC 지도에서
중복 제거 후 그룹 5 개씩 직렬로 크롤·등록하는 잡 컨트롤러. 동시 잡 1개 — 페이지
체류 동안 1개의 활성 잡만 추적 (`useActiveAutoDiscoverJobStore`). 잡 종료(done/
failed/cancelled) 후 60초 setTimeout 자동 clear (`useEffect` — 외부 시스템
동기화 케이스). 동작 상세는 [auto-discover](auto-discover.md) 참조.

- **`AutoDiscoverForm`** ([소스](../../apps/web/src/components/admin/auto-discover/AutoDiscoverForm.tsx))
  — `q` 입력 (예: "강남역", "압구정 파스타") + 카테고리 칩 다중 선택 (한식·중식·
  일식·양식·분식·치킨·카페·술집·디저트·아시안 10개 프리셋, multi-toggle) +
  목표 등록 수 슬라이더 (range 1~50, 기본 10). 잡 진행 중이면 "시작" 비활성 +
  버튼 라벨 "진행 중". onStart 는 `AutoDiscoverJobInputType` 으로 부모에 위임.
- **`AutoDiscoverJobCard`** ([소스](../../apps/web/src/components/admin/auto-discover/AutoDiscoverJobCard.tsx))
  — SSE 스냅샷 한 장으로 잡 전체 시각화:
  - **헤더** — phase 배지 (queued / generating_keywords / searching / crawling
    / done), 상태 아이콘(spinner/checkmark/X/error), 메타("등록 N / 목표 M ·
    성공/실패/건너뜀 · 총 후보"), 진행 중 [취소], 종료 후 [닫기].
  - **진행률 바** — `newlyRegistered / targetCount` 비율. failed = destructive,
    cancelled = muted, 그 외 primary.
  - **키워드 패널 — 최대 8칸 그리드** (`grid-cols-2 sm:grid-cols-4`).
    `KeywordTile` 이 keyword.state (`pending/searching/done/failed`) 별 아이콘
    + done 시 hitCount 배지. failed 시 errorMessage 를 `title` 로.
  - **이미 등록된 후보 섹션** — `groupIndex < 0` 인 후보(=`already_registered`)
    를 별도 회색 리스트로 분리. "이미 등록됨" outline 배지.
  - **그룹별 후보 리스트** — `groupIndex >= 0` 을 `useMemo` 로 Map 그루핑 후
    오름차순 정렬. 각 그룹 헤더는 "그룹 N (done/total 완료)". 한 행
    (`CandidateRow`) 은 이름 + 카테고리 + `stateBadge` (대기/등록 중/등록 완료/
    실패/건너뜀, skipReason 별 라벨 분기 — `target_reached` / `cancelled`) +
    `sourceKeyword` + done 일 때 `Link to=/admin/restaurants/:placeId` "보기".

### 어드민 다이닝코드 정식 페이지 [신규 / coverage: high]

[`AdminDiningcodePage`](../../apps/web/src/routes/admin/AdminDiningcodePage.tsx)
— 운영용 다이닝코드 크롤링 페이지. 테스트 페이지와 검색·상세는 동일하나
검증 요소(원본 JSON 패널, vRid 노출, source 메타 배지)는 제거하고
**등록 흐름** 을 더했다.

- **결과 카드 (`ResultCard`)** — 체크박스 + 썸네일 + 이름/카테고리 +
  Stars + 키워드 칩 + displayReview 인용. 등록된 가게는 [등록됨] 초록
  배지 + 체크박스 비활성 + "등록된 가게 보기" 라벨. 잡 진행 중 카드엔
  추가로 `ItemStateBadge` (대기/저장 중/저장 완료/실패/건너뜀).
  - 카드의 "상세 보기" 링크는 `/admin/diningcode/${vRid}` (정식 경로) —
    검증용 `/admin/diningcode-test/:vRid` 가 아니다.
- **선택 액션 바 (sticky)** — 결과가 있을 때만 `sticky top-2` 로 노출:
  현재 페이지 전체 선택 토글 + "선택 N / 최대 50" 배지 + 선택 해제 +
  **"선택 N개 저장" 버튼**. 잡 진행 중엔 시작 비활성 (`isJobRunning`).
- **일괄 저장 잡 카드 (`BulkSaveJobCard`)** —
  `useDiningcodeBulkSaveJob(activeJobId)` (SSE 진행 추적) + 활성 잡 id
  는 `useActiveDiningcodeBulkSaveJobStore` 가 보관. 진행률 막대(처리/
  전체) + 성공/실패/건너뜀 카운트 + 현재 vRid + 취소/닫기.
  - 잡 종료(done/failed) 후 60초 뒤 `clearActiveJob()` 자동 — 다음 작업
    전 결과 배지 정리. "닫기" 누르면 즉시 clear.
  - 동시 잡은 1개로 제한 (BE 가 동시 잡 1개라는 가정 + store 가 하나의
    jobId 만 보관).
- **검색 조건** — `q/from/size/order` + 좌표 사용(`useCoord`) 시 lat/lng/
  distance + `MiniMapPicker` (vworld). 좌표 사용 모드는 다이닝코드 "내주변".
- **registered 매칭** — 페이지 vRid 들로 `useDiningcodeRegistered` 호출 →
  맵 lookup. 이미 등록된 vRid 는 선택 불가 + 배지 노출.
- **검색/페이지/정렬/좌표 변경 시 선택 자동 초기화** — 현재 페이지에 보이지
  않는 vRid 의 체크 상태는 사용자가 확인할 길이 없으므로 매번 비운다.

### 다이닝코드 상세 컴포넌트 두 라우트 재사용 [신규]

[`AdminDiningcodeShopPage`](../../apps/web/src/routes/admin/AdminDiningcodeShopPage.tsx)
한 컴포넌트가 두 라우트에 마운트:

- `/admin/diningcode-test/:vRid` (검증)
- `/admin/diningcode/:vRid` (정식)

`useLocation()` 으로 `pathname` 을 읽어 back-link 분기:

```ts
const backTo = pathname.startsWith('/admin/diningcode-test')
  ? '/admin/diningcode-test'
  : '/admin/diningcode';
```

본문(헤더 + 메뉴 + 사진 + 리뷰 페이지네이션 + 블로그 + 평점 분포 + DB 저장
버튼) 은 동일. `/API/profile/` 한 방으로 메인 데이터 단일 fetch, 리뷰만
페이지 단위 lazy fetch (`useDiningcodeShopReviews`).

**[변경] 리뷰 카드에 AI 요약 라인** — `DiningcodeShopReviewType` 에
`summaryText` 가 채워져 있으면 본문 위에 `bg-primary/10` "AI 요약" 칩 + 요약
한 줄을 함께 노출. BE 가 다이닝코드 저장 시 큐잉한 분석이 끝난 행부터 비어 있던
자리가 차오른다. summary 가 없는 리뷰는 옛 레이아웃 그대로.

### 다이닝코드 / 캐치테이블 검증 페이지 [신규]

- [`AdminDiningcodeTestPage`](../../apps/web/src/routes/admin/AdminDiningcodeTestPage.tsx)
  — 다이닝코드 자체 검색 API 응답을 그대로 노출하는 검증 도구. 좌표/정렬/
  반경까지 노출해 다이닝코드 응답 변동을 확인. SSE 잡 없음 — 동기 검색,
  결과 카드의 "상세 보기" 가 `/admin/diningcode-test/:vRid` 진입.
- [`AdminCatchtableTestPage`](../../apps/web/src/routes/admin/AdminCatchtableTestPage.tsx)
  — 캐치테이블 자체 검색 API 검증. offset 토큰 한 단계 페이지네이션
  ("더 보기" = 다음 페이지로 갈아탐, 누적 X).
- [`AdminCatchtableShopPage`](../../apps/web/src/routes/admin/AdminCatchtableShopPage.tsx)
  — 캐치테이블 가게 상세. `/admin/catchtable-test/:shopRef`. 메뉴 + 리뷰
  overview + 운영 시간/지하철/예산 + DB 저장 버튼.

### 어드민 맛집 페이지 [refactor / coverage: high — 4 sources]

[`AdminRestaurantsPage`](../../apps/web/src/routes/admin/AdminRestaurantsPage.tsx)
는 이번 라운드에서 **canonical 단위** 그룹핑 리스트로 대대적 개편. 한 행
= 한 canonical (Naver + 다이닝코드 등 복수 source 가 한 카드).

- **MergeProposalQueue 상단 카드** — `useCanonicalProposals` 큐 표시. 펼침
  토글, count 배지(0건이면 "없음"), "전체 다시 돌리기"(`useRunCanonicalProposals`)
  버튼이 항상 닿는다. 각 proposal 행은 좌·우 두 canonical 카드(`CanonicalCard`)
  를 나란히 — `keepSide: 'A'|'B'` 토글 + 수락(`useAcceptCanonicalProposal`) /
  거절(`useRejectCanonicalProposal`). DC 칩과 Naver 칩 모두 외부 링크
  (`/admin/diningcode/:vRid`, `/admin/restaurants/:placeId`).
- **suggestion 인라인 알림** — 각 행 위에 한 줄짜리 amber 배경 dashed
  카드. `item.suggestion` 이 있을 때만 노출. "같은 가게일 수 있음:
  {name} · {category} · 점수 N% · Nm" + [병합] 버튼 (해당 행
  `CanonicalMergePanel` 펼침) + [무시] (`useDismissCanonicalSuggestion`,
  variables = canonicalId 로 in-flight 추적).
- **출처 칩 분리 액션** — 행의 source 칩 옆에 `Scissors` 작은 버튼
  (sources >= 2 일 때만). `useSplitCanonical` 로 그 restaurantId 를 새
  canonical 로 분리. variables.input.restaurantId 로 해당 행만 disable.
- **DC 칩 클릭 = 정식 페이지 진입** — 다이닝코드 source 칩은 `Link to=
  '/admin/diningcode/:sourceId'` (검증 페이지 X). 행 클릭 자체는 Naver
  placeId 라우트 `/admin/restaurants/:placeId` — Naver source 가 없는
  canonical (DC 만 있는 가게) 은 행 네비 + 업데이트/재크롤 모두 disabled,
  DC 칩으로만 들어갈 수 있다.
- **DC 재수집 버튼** — DC source 가 있는 행에 노출
  (`useSaveDiningcodeShop`, variables=vRid 로 in-flight 식별). 응답 후
  list invalidate.
- **병합 버튼 + `CanonicalMergePanel`** — 한 번에 한 행만 펼침
  (`mergeOpenCanonicalId`). 후보 수 > 0 이면 outline + count 배지로 강조,
  0 이면 ghost. 패널은 인라인 (Dialog 안 씀 — 다른 행과 비교 쉽도록).
  내부는 `useCanonicalCandidates` 리스트 + `useMergeCanonical`
  (source/target — 현재 보고 있는 행이 target = "정사본" 유지).
- **canonical 단위 삭제** — `useDeleteCanonical`. 이전엔 placeId 기반,
  지금은 canonicalId 기반 → DC 만 등록된 행도 삭제 가능 + 매달린 sources
  모두 FK Cascade. 인라인 confirm-delete (sources >= 2 일 때 "정말
  삭제 (N개 출처)" 라벨).
- **SSE 구독 = canonicalId 단위** — `useRestaurantListSummaryEvents(rawItems
  .map(it => it.canonicalId))`. 한 canonical 의 모든 source(Naver+DC) 가
  한 connection 으로 풀려 들어와 진행 배지가 출처 무관 라이브 갱신.
- **활성 잡 매칭** — Naver placeId 가 list 의 어느 행 source 와도 매칭
  안 되면 상단 `newJobs` 카드, 매칭되면 그 canonical 행 밑에 panel.
- **DC 안내 줄** — 카드 하단 dashed 박스 — "다이닝코드에서 가게 찾기"
  → `/admin/diningcode-test` 새 탭 (정식 페이지 메뉴에서 진입하라는
  안내는 사이드바 NavLink 가 맡으므로 폼 안내는 검증 페이지를 가리킴).

신규 컴포넌트:

- [`components/restaurant/CanonicalMergePanel.tsx`](../../apps/web/src/components/restaurant/CanonicalMergePanel.tsx)
  — 한 canonical 의 후보 목록 + 병합 트리거. 인라인 (Dialog X).
- [`components/restaurant/MergeProposalQueue.tsx`](../../apps/web/src/components/restaurant/MergeProposalQueue.tsx)
  — 검토 대기 큐 카드. proposal 행 A/B 비교 + keepSide 토글 + accept/
  reject + 전체 다시 돌리기.

기존: `ActiveJobPanel`, `MenuRankingSection`, `sections.tsx`,
`VWorldMap`, `MapCanvas`, `ReanalyzeFailedBadge` 그대로.

### 어드민 detail / 설정 / 분석 / UI 시스템

이전 라운드와 동일 — `AdminRestaurantDetailPage` xl+ 2-column + `Maximize2`
슬라이드오버, `AdminSettingsPage` 탭 셸 (`/ai-keys`, `/map`), `AdminAnalyticsPage`
4카드 + 진행 패널, shadcn 프리미티브, Pretendard 공개 한정, Tailwind v4
`@theme inline`. 자세한 내용은 [이전 컴파일 변경 없음].

## Talks To [coverage: high — 13 sources]

- **`@repo/api-contract`** — 공유 zod 스키마 타입. 이번 라운드 신규:
  `CanonicalListItemType`, `RestaurantSourceSummaryType`,
  `CanonicalProposalItemType`, `DiningcodeBulkSaveJobItemType`,
  `DiningcodeBulkSaveJobSnapshotType`, `DiningcodeRegisteredEntryType`,
  `DiningcodeSearchResultType`, `DiningcodeShopDataType`,
  `DiningcodeShopReviewType` (이번 라운드부터 `summaryText` 필드 노출),
  `DiningcodeShopReviewsResponseType`,
  `CatchtableSearchResultType`, `CatchtableShopDataType`,
  `CatchtableShopMenusResponseType`, `CatchtableShopReviewOverviewResponseType`,
  **`AutoDiscoverJobInputType`, `AutoDiscoverJobSnapshotType`,
  `AutoDiscoverKeywordType`, `AutoDiscoverCandidateType`,
  `AutoDiscoverPhaseType`** (자동 발견 잡 스냅샷 — phase / keywords[] /
  candidates[] / newlyRegistered / targetCount).
- **`@repo/shared`** — 신규 훅:
  - canonical 관리 — `useDeleteCanonical`, `useSplitCanonical`,
    `useMergeCanonical`, `useCanonicalCandidates`, `useCanonicalProposals`,
    `useAcceptCanonicalProposal`, `useRejectCanonicalProposal`,
    `useRunCanonicalProposals`, `useDismissCanonicalSuggestion`.
  - 다이닝코드 — `useDiningcodeSearch`, `useDiningcodeShop`,
    `useDiningcodeShopReviews`, `useSaveDiningcodeShop`,
    `useDiningcodeRegistered`, `useStartDiningcodeBulkSave`,
    `useCancelDiningcodeBulkSave`, `useDiningcodeBulkSaveJob`,
    `useActiveDiningcodeBulkSaveJobStore`.
  - 캐치테이블 — `useCatchtableSearch`, `useCatchtableShop`,
    `useCatchtableShopMenus`, `useCatchtableShopReviewOverview`.
  - 자동 발견 [신규] — `useStartAutoDiscover`, `useCancelAutoDiscover`,
    `useAutoDiscoverJob` (SSE 진행 추적), `useActiveAutoDiscoverJobStore`
    (jobId 영속).
  - 기존 다수 (`useCurrentUser`, `useLogin`, `useLogout`,
    `useRestaurantList`, `useRestaurantByPlaceId`,
    `useRestaurantListSummaryEvents`, `useRestaurantSummaryEvents`,
    `useStartCrawl`, `useCancelCrawl`, `useNaverSearch`,
    `useActiveCrawlJobStore`, 지도 키 훅, 분석/메뉴 그루핑 훅 등).
- **`@repo/utils`** — 썸네일 프록시 헬퍼 (어드민 비디오 모달 등).
- **TanStack Query 캐시 직접 패치** — `ActiveJobPanel` 의 SSE 머지 패턴
  유지. 다이닝코드 bulk save 는 SSE 구독을 훅 안에서 처리.
- **Zustand 스토어** — `useAuthStore`, `useActiveCrawlJobStore`,
  `panelPrefsStore`, **`useActiveDiningcodeBulkSaveJobStore`**
  (jobId 영속 — 페이지 이동/새로고침 후 이어보기), **신규
  `useActiveAutoDiscoverJobStore`** (자동 발견 단일 jobId 영속, 패턴 동일).
- **URL = state** — 이전 라운드 패턴 유지. AdminDiningcodePage 는 URL
  state 미사용 (검색 폼만, 일괄 저장 진행은 store).
- **OpenLayers / vworld WMTS** — 이전과 동일.
- **백엔드 friendly** — 신규 endpoint group:
  `/api/v1/admin/crawl/diningcode/*`(search, shops/:vRid, reviews,
  registered, save, bulk-save/start, bulk-save/cancel/:jobId,
  bulk-save/:jobId/stream — SSE), `/api/v1/admin/crawl/catchtable/*`,
  `/api/v1/admin/restaurants/canonical/*` (candidates, merge, split,
  proposals, accept/reject/run, suggestions/dismiss),
  **`/api/v1/admin/auto-discover/*`** (start, cancel/:jobId, :jobId/stream
  — SSE; 자세한 phase/그룹 직렬 규약은 [auto-discover](auto-discover.md)).
- **Radix UI** — `@radix-ui/react-dialog` 어드민 detail 슬라이드오버.
- **lucide-react** — 신규 아이콘: `Utensils`, `Scissors`, `Link2`,
  `Database`, `Crosshair`, `CheckCircle2` (다이닝코드 정식 페이지 / 출처
  분리 / 병합 / DC 재수집), **`Wand2`** (자동 발견 NAV), **`MapPin`**
  (DiscoverPanel ShowOnMapButton).

크롤링 백엔드 / SSE / 분석은 [shared](shared.md), [crawl](crawl.md),
[analytics](analytics.md), [menu-grouping](menu-grouping.md) 참조.

## API Surface [coverage: high — 12 sources]

웹 앱은 HTTP 엔드포인트가 아닌 **브라우저 URL** + 재사용 컴포넌트 노출.

URL:

- `/` — 공개 홈
- `/restaurants` / `/restaurants/:placeId` — 풀 뷰포트 검색 + 상세 outlet
- `/restaurants-v2[/:placeId]` — 모바일 시트 v2 (옵셔널 placeId nested)
- **`/restaurants/:placeId/settle/new`** — 정산 입력 4-step (`RequireUser`)
- **`/restaurants/:placeId/settle/:id`** — 저장된 정산 단건 보기
- **`/share/settlements/:token`** — 공유 토큰 read-only (인증 X)
- **`/me/settlements`** — 내 정산 이력 카드 리스트
- **`/me/contacts`** — 단골 관리
- `/login` — 로그인 + 회원가입 + 게스트
- `/admin` — 어드민 대시보드
- `/admin/discover` — 맛집 발견 (네이버 PC 지도 검색 + 다중 선택 크롤)
- `/admin/auto-discover` — **맛집 자동 발견 (AI 키워드 → 그룹 직렬 크롤·등록,
  SSE 진행 카드)**
- `/admin/restaurants` — canonical 그룹핑 리스트 (병합/분리/삭제 + 큐
  카드 + suggestion 알림)
- `/admin/restaurants/:placeId` — 단일 맛집 상세
- `/admin/diningcode` — **다이닝코드 정식 크롤링 (검색 + 등록 + 일괄
  저장 SSE)**
- `/admin/diningcode/:vRid` — 다이닝코드 가게 상세 (정식 진입)
- `/admin/diningcode-test`, `/:vRid` — 다이닝코드 검증 도구
- `/admin/catchtable-test`, `/:shopRef` — 캐치테이블 검증 도구
- `/admin/crawl-test`, `/:jobId` — 네이버 크롤링 검증
- `/admin/analytics` — AI 분석 관리
- `/admin/ai-test` — LLM 호출 실험
- `/admin/settings`, `/ai-keys`, `/map` — 설정 셸 (탭)
- `/admin/ai-keys` — `<Navigate>` 자동 리다이렉트

내부 재사용 컴포넌트 (변경/신규만):

- 어드민 다이닝코드: `AdminDiningcodePage` (`ResultCard`/`Pager`/
  `BulkSaveJobCard`/`MiniMapPicker` 내부), `AdminDiningcodeShopPage` (두
  라우트 공유 컴포넌트, 리뷰 카드에 `summaryText` 라인 추가)
- 어드민 캐치테이블: `AdminCatchtableTestPage`, `AdminCatchtableShopPage`
- 어드민 맛집: `CanonicalMergePanel`, `MergeProposalQueue`,
  `ActiveJobPanel`, `MenuRankingSection`, `sections.tsx`, `VWorldMap`,
  `MapCanvas`, `ReanalyzeFailedBadge` (유지)
- 어드민 자동 발견 [신규]: `AutoDiscoverForm`, `AutoDiscoverJobCard`
  (내부 `KeywordTile` / `CandidateRow`)
- 어드민 발견: `DiscoverPanel` 의 `ShowOnMapButton` 추가 — 행 hover→fly 제거
- 공개/검색 + 상세 탭: detail 파일 자체는 그대로지만, 어드민 진입 시 입력
  prop 이 Naver+DC fused 된 `RestaurantPublicDetailType` 이므로 `HomeTab` /
  `InfoTab` / `ReviewsTab` / `shared.tsx` 가 다중 출처 라벨 분기를 노출
  (변경 없는 컴포넌트가 새 데이터를 그대로 받아 표현)

## Data [coverage: high — 7 sources]

- 로컬 DB 없음. 상태는 다섯 갈래.
  - **서버 상태** — TanStack Query 캐시.
  - **클라이언트 인증** — Zustand `useAuthStore`.
  - **다중 슬롯 잡 (네이버 크롤링)** — Zustand `useActiveCrawlJobStore`
    (`jobs: Record<jobId, ActiveCrawlJob>`).
  - **다이닝코드 일괄 저장 잡** — Zustand
    `useActiveDiningcodeBulkSaveJobStore` (`jobId: string|null`).
    localStorage 영속 — 페이지 이동/새로고침 후 이어보기. 동시 잡 1개
    제한.
  - **자동 발견 잡** [신규] — Zustand `useActiveAutoDiscoverJobStore`
    (`jobId: string|null`). 같은 패턴 — localStorage 영속, 동시 1개,
    종료 후 60초 자동 clear.
  - **URL = state** — RestaurantsPage, RestaurantDetailRoute,
    AdminAnalyticsPage, AdminDiscoverPage 가 useSearchParams 직접 사용.
    AdminDiningcodePage 는 검색 폼 로컬 useState (일괄 저장 상태는 store).
  - **로컬 useState (page-scope)** — RestaurantsPage `mobileView`,
    AdminDiningcodePage `selected: Set<vRid>`, AdminRestaurantsPage
    `mergeOpenCanonicalId` / `confirmDeleteCanonicalId` / `sortBy`,
    AdminCatchtableTestPage `offsetToken` 등.
- **TanStack Query 키 신규** —
  - `['diningcode', 'search', q, ...]`, `['diningcode', 'shop', vRid]`,
    `['diningcode', 'shop', vRid, 'reviews', page]`,
    `['diningcode', 'registered', vRids]`,
    `['diningcode', 'bulk-save', jobId]` (SSE 구독).
  - `['catchtable', 'search', ...]`, `['catchtable', 'shop', shopRef]`,
    `['catchtable', 'menus', shopRef]`, `['catchtable', 'reviews',
    shopRef]`.
  - `['canonical', 'candidates', canonicalId]`, `['canonical',
    'proposals']`.
  - `['auto-discover', 'job', jobId]` (SSE 구독, `useAutoDiscoverJob`).
- **localStorage** —
  - `lp:token`, `lp:guest`, `lp:theme`, `lp:panelPrefs` (기존)
  - `lp:adminSidebarCollapsed` (어드민 사이드바 접힘)
  - 다이닝코드 활성 잡 id (`useActiveDiningcodeBulkSaveJobStore` 저장 키)
  - 자동 발견 활성 잡 id (`useActiveAutoDiscoverJobStore` 저장 키)
- **API 클라이언트 토큰 주입** — `configureApi({ getToken })`, 401 →
  `onUnauthorized: clearSession` (이전과 동일).

## Key Decisions [coverage: high — 31 sources]

이전 라운드 결정(모바일 UX 8조, `/restaurants` 라우트 분리, AdminLayout
드로어, AdminDiscover 토글, ReviewCard LLM 풀 노출, 캐러셀 = scroll-snap,
shadcn 모바일 패딩, 풀 뷰포트 3-column, useSearchParams + replace, 5탭 1회
fetch, panel/→detail/ 명명, 라이트박스 단일 시퀀스, ImgWithFallback 공용화,
Pretendard 공개 한정 + 텍스트 사이즈 시프트, OL + WMTS, MapCanvas
imperative, 사용자 vs programmatic move, /admin/settings 통합, AdminDetail
Maximize2, 연결 테스트 즉시, 공개 vworld 키 평문, 어드민 발견 통합 마커,
패널 좌/우, panel side OL reflow, 등록 행 클릭 = 별도 column)는 그대로
유지. 이번 라운드 신규/변경:

- **다이닝코드 = 테스트 페이지 vs 정식 페이지 분리** — 같은 검색 흐름이지만
  운영 도구(`/admin/diningcode`)와 검증 도구(`/admin/diningcode-test`)를
  나란히 유지. 검증 페이지엔 원본 JSON 패널 / vRid 노출 / source 메타
  배지 — 다이닝코드 응답 변동 디버깅용. 정식 페이지는 디자인 정리 + 등록
  배지 + 체크박스 + sticky 액션바 + SSE 일괄 저장. 두 페이지가 같은
  검색 hook(`useDiningcodeSearch`)을 쓰므로 분기 비용 ≈ 0.
- **`AdminDiningcodeShopPage` 한 컴포넌트 → 두 라우트** — 가게 상세 자체는
  진입 경로와 무관해 동일. `useLocation().pathname.startsWith(
  '/admin/diningcode-test')` 로 back-link 만 분기. 별도 페이지 두 벌을
  유지하면 가게 상세에 새 기능 추가할 때 동시 수정 부담 — 단일 컴포넌트로
  통일이 옳다.
- **일괄 저장 = 동시 잡 1개 + jobId persist + 60초 TTL** —
  `useActiveDiningcodeBulkSaveJobStore` 가 단일 `jobId` 보관 +
  localStorage 영속. 페이지 이동 → 돌아오면 SSE 자동 재구독, 새로고침 후
  진행 상황 그대로. 잡 종료 후 60초 setTimeout 으로 자동 clear — 결과를
  볼 시간은 충분히 주되 다음 작업 시 깔끔. "닫기" 누르면 즉시 clear.
  동시 잡 2개 이상은 store 가 한 jobId 만 들고 있고 BE 도 actor 단일
  잡 가정이라 시작 거부.
- **AdminRestaurantsPage 행 = canonical 단위 그룹** — 한 가게가 Naver +
  DC 두 출처에 있어도 한 행으로 묶여 보인다. `item.sources` 배열 + 출처
  칩 + 칩 옆 `Scissors` 분리 액션 (sources >= 2 일 때만). 행 클릭은
  Naver placeId 라우트 — Naver 가 없는 canonical 은 행 네비 + 액션 모두
  disabled. 삭제 단위도 canonicalId 기반 (옛 placeId 기반 → DC-only 행
  삭제 불가 회귀).
- **suggestion 알림 = 인라인 한 줄** — 별도 카드로 빼지 않고 행 위에 amber
  배경 dashed 한 줄. 행 옆 [병합] 버튼이 같은 `CanonicalMergePanel` 을
  여는 게이트라 중복 UI 회피. 무시(`dismiss`)는 한 번 누르면 영구.
- **MergeProposalQueue 상단 카드** — 큐가 비어도 헤더는 노출 — "전체 다시
  돌리기" 버튼이 항상 닿을 수 있어야 함. 펼침 토글로 시각적 무게 감소
  (기본 닫힘). proposal 카드는 A/B 좌·우 + `keepSide` 토글 — accept 시
  어느 쪽을 정사본으로 유지할지 어드민이 결정.
- **DC 칩 클릭 = 정식 페이지** — 출처 칩의 다이닝코드 링크는 항상
  `/admin/diningcode/:sourceId` (검증 X). 검증 페이지는 사이드바 NavLink
  로만 접근 — 운영 흐름에서 사용자를 검증 도구로 흘려보내지 않는다.
- **DC 재수집 = 별도 mutation + variables=vRid** — Naver 의 startCrawl +
  SSE 잡 패턴과 다르게 `useSaveDiningcodeShop` 단일 mutation 으로 완결.
  variables 가 vRid 라 in-flight 행만 식별. AI 분석 큐잉은 BE 가
  `dc:<vRid>` 채널로 따로 — 현재 list SSE 통합 전이라 라이브 갱신은 list
  invalidate 로 폴백.
- **출처 분리 = canonicalId + restaurantId pair** — `useSplitCanonical
  ({ canonicalId, input: { restaurantId } })`. 같은 mutation 인스턴스로
  여러 행에 작용 — variables.input.restaurantId 로 in-flight 행만 disable.
  병합과 짝을 이루는 안전망 (잘못 묶였을 때 되돌릴 수 있어야 한다).
- **발견 리스트 행 hover→fly 폐기 + 명시적 [지도] 버튼** — 모바일은 hover
  이벤트가 없어 옛 호버 트리거가 동작하지 않았고, 데스크톱에서도 리스트를
  스크롤하다 의도하지 않은 fly 가 발생. 식당명 라인 우측 `ShowOnMapButton`
  으로 단일 액션화 — 클릭만 `flyTo`. 행 본문 클릭은 상세 열기 전용
  (`stopPropagation`).
- **어드민 발견 상세 = 백엔드 fused detail 그대로 재사용** — Naver + 다이닝코드
  형제의 사진/메뉴/리뷰 융합은 BE 가 `RestaurantPublicDetailType` shape 으로
  머지해 보낸다. FE 는 같은 `PublicRestaurantDetail` 컴포넌트로 어드민/공개
  양쪽 렌더 — `detail.sources.naver` / `detail.sources.diningcode` 둘 다 있을
  때만 분리 라벨(평점 라인, 리뷰 카운트 라인, ReviewCard 출처 배지)이 켜진다.
  "어드민 전용 fused 컴포넌트" 를 따로 두지 않는 게 핵심 — 단일 컴포넌트가
  fused / single-source 둘 다 표현 가능해야 BE 변경 시 동기화 부담 최소.
- **자동 발견 = 발견(`/admin/discover`) 과 별도 라우트** — 두 페이지 모두
  네이버 검색을 쓰지만 발견은 "사람이 검색어 입력 → 다중 선택", 자동 발견은
  "AI 키워드 8 개 → 그룹 5 개씩 직렬 크롤". UX 가 달라 한 페이지로 묶으면
  복잡도 폭증 — `Wand2` NAV 로 명시 분리. 잡 진행 시각화는
  `AutoDiscoverJobCard` 한 컴포넌트가 phase / keywords / groups / 진행률을
  모두 떠안는다.
- **자동 발견 잡 1개 + jobId persist + 60초 TTL** — 다이닝코드 일괄 저장과
  동일 패턴 — `useActiveAutoDiscoverJobStore` 단일 jobId, localStorage 영속,
  잡 종료 후 60초 setTimeout 으로 자동 clear. 동시 잡 2개 이상은 store 가
  허용하지 않고 BE 도 actor 단일 잡 가정.
- **자동 발견 후보 그루핑 = `groupIndex` 분기** — `groupIndex < 0` 은 사전
  제외(이미 등록됨) 으로 별도 섹션, `>= 0` 은 그룹 N 별로 Map 그루핑 후
  오름차순 정렬. `useMemo` 로 `snapshot.candidates` 가 바뀔 때만 재계산 —
  SSE 패치마다 그루핑이 다시 도는 것 방지.
- **기존 결정들 유지** — React 19, Tailwind v4 + shadcn 토큰,
  `@repo/shared` 경유, stream-driven cache merge, 역할 기반 가드, 다중 슬롯
  잡, 재크롤 시 detail 리뷰 비우기, `fetchedAt-asc` 의미, 비디오 프록시
  정책, 인라인 confirm-delete (2-step), Vite dev proxy, AdminAiKeysPage "변경
  시에만 입력", panelPrefsStore 페이지 namespace, `MapCanvas` ResizeObserver.

### 2026-05-25 라운드 결정

- **정산 4-step Stepper = 현재 단계 표시 + 완료된 단계 자유 점프** —
  [`SettlementNewPage.tsx`](../../apps/web/src/routes/settlement/SettlementNewPage.tsx)
  헤더의 `Stepper` 가 (1인원 / 2방식 / 3편집 / 4결과) 를 가로 4분할로 그린다.
  현재 단계는 `bg-primary text-primary-foreground` + `aria-current="step"`,
  완료 단계는 클릭 가능, 미완 단계는 `disabled + opacity-50`. 게이팅 함수
  `canJumpTo(target, source, participantsCount, itemsCount)` 가 "Step N+1 =
  Step N 산출물이 draft 에 존재" 정책 — `source` 단계는 `participantsCount>0`,
  `edit` 는 `source != null`, `review` 는 `itemsCount > 0` 일 때만 활성.
- **Step1 → Step3 직행 (영수증 재업로드 회피)** — `Step1Participants` 의
  `onNext` 는 `draft.source ? 'edit' : 'source'` — 이미 한 번 흐름을 마치고
  참여자만 수정하러 돌아온 경우 Step2(영수증/직접입력 선택) 를 건너뛰고
  곧장 Step3 (편집) 로. 영수증 사진을 다시 찍어 올리지 않아도 된다. `source`
  가 `null` 인 첫 진입에서만 정상 경로(1→2→3→4) 를 탄다.
- **저장 후 참여자/옵션 수정 = `ParticipantEditDialog` + '수정됨' 배지** —
  [`ParticipantEditDialog.tsx`](../../apps/web/src/routes/settlement/ParticipantEditDialog.tsx).
  결과 페이지에서 "참여자 수정" 으로 열면 items 는 건드리지 않고 participants
  배열만 PATCH (서버가 받아 `calculateShares` 로 shareAmount 재계산).
  Step1 의 단골 자동완성/picker 는 이 다이얼로그에서는 생략 — 이미 저장된
  세션이라 단골 적립도 끝났고 정정이 주 용도. 수정 후 결과 카드에 "수정됨"
  배지 노출.
- **공유 토큰 read-only 페이지 = 인증 X + TopBar 없음** — `/share/settlements/:token`
  은 `PublicLayout` 밖 라우트라 `PublicTopBar` 도 안 뜬다. 받는 사람이
  단순히 결과만 보게 하기 위함. 서버가 토큰만 검증, 영수증 미리보기/소유자
  식별 필드는 응답에서 제거. `SettlementShareDialog` 는 다이얼로그 open 시
  `POST /share` 를 자동 호출하는데 BE 가 멱등이라 이미 토큰이 있으면 같은
  토큰을 돌려준다 (재호출 안전). Web Share API(`navigator.share`) 가
  지원되면 카톡/메시지 네이티브 시트 호출, 미지원이면 Copy 만 노출.
- **영수증 미리보기 = fetch + blob + objectURL** — `/preview/:token` 라우트가
  JWT 인증 필요라 `<img src>` 직접 호출 불가. `ReceiptPreviewImage`
  (Step3Edit) / `ReceiptCard` (SettlementResultPage) 가 `settlementExtractionApi.previewBlob`
  로 받아 `URL.createObjectURL` 로 변환해 표시. unmount 시 `URL.revokeObjectURL`
  cleanup. 외부 시스템(브라우저 URL 캐시) 동기화라 useEffect 가 맞다 — 회피
  대상이 아님.
- **`CardContent` 기본 `pt-0` 제거** — 이전엔 `p-4 pt-0 sm:p-6 sm:pt-0`,
  지금은 `p-4 sm:p-6`. `pt-0` 패턴은 `CardHeader` 와 짝지을 때만(`CardHeader`
  의 `pb-*` 가 책임) 의미 있었는데, 홈 랭킹 카드처럼 `CardContent` 만 단독
  사용하는 곳에서 상단 패딩이 통째로 사라지는 회귀. shadcn 의 디폴트가 우리
  사용 패턴과 안 맞으니 디폴트를 바꾸고, `CardHeader + CardContent` 조합에서
  중복 패딩이 신경 쓰이면 호출부에서 `pt-0` 을 명시한다 (회귀 위험을
  명시적으로 노출).
- **`Lightbox` mount 는 instant / 이후는 smooth** — 이전엔 `behavior: 'smooth'`
  하나로 통일이라 모바일에서 smooth scroll 이 가드(setTimeout 200ms) 보다
  늦게 끝나 도중의 `onScroll` 이 가드를 빠져나와 인덱스를 잘못 보정 — "3번째
  이미지를 눌렀는데 2번째가 뜨던" 버그. 첫 mount 는 `instant` + 80ms 가드,
  이후 키보드/버튼은 `smooth` + 600ms 가드 (모바일 smooth 가 300ms+ 걸리므로
  마진 2배). 첫 진입은 도착 위치가 곧 보일 화면이라 애니메이션 불필요.
- **`Lightbox` dvh + slide `w-full`** — dialog/이미지 `h-[100dvh]` /
  `max-h-[88dvh]` 로 통일 (vh = layout viewport 기준이라 주소창 토글 시
  잘림). slide 는 `min-w-full` → `w-full + shrink-0` (콘텐츠 부풀어 scroller
  보다 커져 `max-w-full` 무력화되던 가로 잘림 fix).
- **`MapCanvas` declutter 해제 + 줌 14 라벨 토글** — OL의 layer-level
  `declutter:true` 가 Feature 단위라 라벨이 겹치는 순간 핀까지 통째로 가려졌다.
  declutter 를 끄고 라벨 가시성은 style function 안에서 `LABEL_VISIBLE_ZOOM = 14`
  기준으로 직접 분기: 미만 = 0.55배 축소 핀(라벨 없음), 이상 = 풀사이즈 핀
  + 라벨. 선택 마커는 줌과 무관하게 풀 + 라벨로 유지. 핵심은 "라벨 영역을
  떼서 충돌 박스를 작게 만드는 것" — feature 가 충돌해도 핀 본체는 가려지지
  않게.
- **AI provider 카드 = `{id, purpose}` 페어 단위** — `AdminAiKeysPage` 가
  이전엔 provider id 만 키였는데 `chat` / `image` 용도를 분리하면서 카드
  하나가 `(id, purpose)` 페어로 바뀜. `existingKeys` Set 에 `${id}::${purpose}`
  로 캐시 + `ADDABLE_PURPOSES = ['chat', 'image']` 를 ollama-cloud 와
  교차해 등록 안 된 조합만 "다른 용도 추가" outline 버튼으로 노출. 첫 클릭은
  `enabled:true` 빈 입력으로 카드만 만들고, 키는 다음 저장에서. 모든 훅
  (`useUpdateProvider`, `useDeleteProvider`, `useTestProvider`,
  `useProviderModels`) 이 `ProviderKey` 페어를 받는 형태로 시그니처 변경 —
  자세한 백엔드 컨트랙트는 [shared.md](shared.md), [analytics.md](analytics.md)
  참조. `AdminAiTestPage` 는 chat 용도만 다루므로 `{id:'ollama-cloud', purpose:'chat'}`
  하드코딩.
- **`AdminRestaurantsPage` 서버 페이징 + URL state** — 이전엔 list 전체
  fetch 후 클라이언트 정렬, 지금은 `useRestaurantList({ limit, offset, sort })`
  로 서버 정렬·페이징. URL state (`?sort=&page=&pageSize=`) 동기화 +
  `setSearchParams(..., { replace: true })`. 정렬 변경 시 페이지 1로 리셋
  (다른 페이지에 있던 채로 정렬을 바꾸면 결과가 어색하게 어긋남). SSE 구독은
  **현재 페이지의 canonicalId 만** — 다른 페이지의 잡은 상단 newJobs 카드로
  올라가 사라지지 않는다.
- **메뉴 가격 원화 콤마 포맷 통일 = `formatWonPrice`** — `@repo/utils` 에서
  공통 헬퍼. `detail/shared.tsx` MenuGrid, `AdminRestaurantDetailPage`
  MenuSection 둘 다 적용. "15000" → "15,000원" 으로 정규화. 컨테이너 쿼리
  (`@container` + `@md:grid-cols-2`) 로 패널 폭에 반응하는 그리드 — 부모
  컨테이너가 좁으면 1열, 넓으면 2열 (옛 `sm:grid-cols-2` 는 뷰포트 기준이라
  사이드 패널 폭 변화에 둔감).
- **`restaurant-v2/BottomSheet` 2-시트 분리 + `disableScrollLock`** — 이전엔
  `viewKey` prop 으로 한 sheet 안에서 list↔detail 스크롤 메모리를 관리했는데,
  list/detail 을 형제 sheet 로 분리하면서 이 패턴이 깨졌다 (활성 sheet 가
  overflow='hidden' 으로 잠근 직후 비활성 sheet 의 cleanup 이 풀어 버려 body
  스크롤 회귀). `disableScrollLock=true` 면 overflow 조작/body 스크롤 복원에
  개입하지 않고, fixed 모드 inner 컨테이너에 `scrollPosRef` 만 적용. unmount
  cleanup 은 `useLayoutEffect` 로 옮겨 다음 커밋의 setup 보다 먼저 발화하도록
  순서 보장. inner 컨테이너에 `maxHeight: currentH - 48px` 명시 — 시트 DOM
  높이는 항상 availableH 라 half/peek 에선 하단이 viewport 밖으로 흘러나가
  스크롤이 안 발화하던 회귀 fix.

## Gotchas [coverage: high — 24 sources]

- **AdminDiningcodePage 선택 자동 초기화** — 검색/페이지/정렬/좌표 변경 시
  `selected: Set<vRid>` 가 비워진다. 현재 페이지에 보이지 않는 vRid 의 체크
  를 유지해도 어드민이 확인할 수 없어 혼란만 키운다 — 의도적. 일괄 저장
  도중엔 잡 카드 진행 배지로 결과 확인.
- **일괄 저장 잡 카드 60초 TTL** — done/failed 후 60초 뒤 자동 clear.
  사용자가 결과 화면을 너무 오래 띄워 둔 채 작업했다면 다음 작업과 겹쳐
  지표가 헷갈릴 수 있다. 안전망으로 "닫기" 즉시 clear.
- **DC-only canonical 은 상세 페이지 접근 불가** — 행 클릭이
  `/admin/restaurants/:placeId` 로 이동하는데 그 라우트는 Naver placeId
  필요. DC 만 있는 가게는 "행 클릭" 불활성 + 업데이트/재크롤 disabled —
  **출처 칩(다이닝코드)** 으로만 진입. 일관 정책상 의도적이지만 신규
  어드민이 헤맬 수 있는 지점.
- **DC 칩 클릭이 검증 페이지가 아닌 정식 페이지** — `/admin/diningcode/:vRid`.
  검증 페이지(`/admin/diningcode-test/:vRid`) 는 다이닝코드 사이드바
  NavLink + 정식 페이지 결과 카드의 백 버튼 분기에서만 등장. AdminRestaurantsPage
  의 출처 칩에서 검증 페이지를 기대하면 안 됨.
- **AdminDiningcodeShopPage pathname 분기 = startsWith** — `/admin/diningcode/:vRid`
  와 `/admin/diningcode-test/:vRid` 둘 다 매칭. 새 라우트 추가 시 분기
  로직을 같이 갱신해야 함.
- **MergeProposalQueue "전체 다시 돌리기" = 큐 비우지 않음** — 큐를 리셋
  하지 않고 **새 매칭만 추가**한다 (`runMutation.data.created` = 새로
  적재된 건수). 이미 있는 proposal 은 그대로 — accept/reject 로 제거해야.
- **canonicalId 단위 삭제 = sources 모두 cascade** — 행 = canonical 통째로
  삭제. sources >= 2 일 때 "정말 삭제 (N개 출처)" 라벨로 경고하지만,
  사용자가 한 출처만 빼고 싶다면 `Scissors` 분리 후 삭제해야.
- **suggestion 무시 = 영구** — `useDismissCanonicalSuggestion` 은 BE 에
  영구 기록. "잘못 무시했네" 는 BE 데이터를 직접 조작하지 않으면 복구
  불가 — 어드민 UI 에는 되돌리기 없음.
- **sticky 액션바 z-index** — AdminDiningcodePage 의 `sticky top-2 z-10`
  은 일반 본문에 잘 작동하지만, 잡 카드 + 검색 메타 카드와 동시에 있으면
  스크롤 중 묘하게 겹쳐 보일 수 있다 (의도적 — 백드롭 블러로 가독성 보존).
- **AdminDiningcodePage MAX_BULK=50** — 한 번에 50개 초과 선택은 BE 가
  거부하지 않더라도 UI 에서 잘라 보낸다 (`slice(0, MAX_BULK)`). 51번째
  이후는 다음 작업으로 분리.
- **AutoDiscoverJobCard `groupIndex = -1` 은 별도 섹션** — `< 0` 으로
  들어오는 후보는 "이미 등록된 후보" 회색 리스트로 따로 모이고, `>= 0` 만
  그룹 N 으로 묶인다. BE 가 미래에 다른 음수 값을 새 의미로 보내면 같은
  사전 제외 섹션에 묶여 들어올 수 있으니 그 시점에 분기 추가 필요.
  `<` 가 아니라 `===-1` 로 두지 않은 건 의도 — BE 가 새 "pre-skip" 종류를
  추가해도 UI 가 그대로 흡수.
- **자동 발견 진행률 = `newlyRegistered / targetCount`** — "처리한 후보 수"
  가 아니라 "**새로** 등록된 가게 수" 기준. 이미 등록된 후보(`groupIndex<0`)
  는 카운트 안 됨. failed/skipped 도 분모 채우지 않음 — 100% 도달 = 목표
  도달.
- **자동 발견 후보 행 "보기" = `/admin/restaurants/:placeId` (Naver 라우트)**
  — 자동 발견은 항상 네이버 placeId 기반으로 등록되므로 Naver canonical
  라우트로 직진. DC-only 가게가 자동 발견에서 등록될 수는 없다 (검색 자체가
  네이버).
- **DiscoverPanel 행 클릭 vs ShowOnMapButton** — 행 본문 클릭 = `onSelect`
  (상세 열기), 버튼 클릭 = `onHover` (지도 fly). 두 액션이 동시에 발사되지
  않도록 버튼이 `stopPropagation`. 이벤트 핸들러 순서를 바꾸거나 버튼을
  행 밖으로 빼면 단번에 깨지므로 행 구조 리팩토링 시 주의.
- **정산 Stepper 점프 게이팅 = "산출물 존재" 기준** — `canJumpTo` 가
  source != null / participantsCount > 0 / itemsCount > 0 셋만 본다.
  "단계가 한 번이라도 활성화됐는가" 가 아니라 "현재 draft 에 그 단계의 산출물이
  살아있는가". `draftStore` 가 `startFor(placeId)` 로 새 식당 진입 시
  reset 되므로 식당을 바꾸면 모든 단계가 다시 잠긴다. Step1 만 항상 활성.
- **Step1→Step3 직행은 source 가 살아있을 때만** — 새로 정산을 시작한 직후
  Step1 의 "다음" 은 항상 Step2 로 가야 한다 (source 가 `null`). 같은 식당에서
  이미 Step2 를 거친 뒤 Step1 로 돌아와 참여자만 수정하고 "다음" 을 누르면
  Step3 직행. 영수증 사진을 또 올리지 않아도 되는 게 핵심. source 가 살아있는
  상태에서 다른 source 로 바꾸려면 Stepper 의 Step2 칸을 직접 클릭해야 한다.
- **영수증 미리보기 = JWT 필요 → `<img src>` 직접 X** — `/preview/:token`
  은 인증 헤더가 있어야 200, 없으면 401. `<img src="/preview/...">` 로 직접
  렌더링하면 헤더가 안 붙어 broken image. `settlementExtractionApi.previewBlob`
  로 fetch → blob → `URL.createObjectURL` → `<img src={objectUrl}>` 패턴
  필수. unmount 시 `URL.revokeObjectURL` 잊지 말 것 — `useEffect` cleanup
  으로 묶음.
- **공유 토큰 페이지 = `PublicLayout` 밖** — `/share/settlements/:token` 은
  PublicLayout 의 `<Outlet>` 자식이 아니라 별도 라우트. TopBar 의 "내 정산"
  링크나 햄버거 사이드바가 안 보이는 게 의도 — 받는 사람은 보내는 사람의
  계정/네비를 볼 필요 없다. 신규 페이지에서 PublicTopBar 가 안 뜨는 게 버그
  처럼 보일 수 있으니 주의.
- **`SettlementShareDialog` 자동 POST = 멱등** — 다이얼로그 open 즉시
  `useCreateSettlementShare.mutateAsync(sessionId)` 발사. BE 가 이미 토큰이
  있으면 같은 토큰을 돌려준다는 가정에 의존 — BE 컨트랙트가 바뀌면(예: 매번
  새 토큰 생성) FE 가 무한 회전한다. `settlement.md` 의 share 정책 참조.
- **`ParticipantEditDialog` 는 items 안 건드림** — 저장된 세션의 participants
  만 PATCH. items 수정 동선은 별도 (현재 라운드 미구현 — 향후 추가 예정).
  서버가 받아 `calculateShares` 로 shareAmount 재계산이라 FE 에서 다시 분배
  계산할 필요 없음. 다이얼로그 닫기는 호출자(결과 페이지) 가 결정, 캐시
  갱신은 훅이 onSuccess 에서 처리.
- **`RequireUser` ≠ `RequireAdmin`** — 정산은 USER 도 사용 가능이라
  `RequireUser` 가 token 만 보고 role 검사 X. `RequireAdmin` 라우트에 정산
  페이지를 잘못 끼우면 USER 가 진입 못 함. 두 가드 모두 [App.tsx](../../apps/web/src/App.tsx)
  안 정의 — 별도 파일 분리 안 했으니 새 가드 추가 시 같은 자리에.
- **`AdminAiKeysPage` "다른 용도 추가" 빈 카드** — 첫 클릭은 `enabled: true`
  빈 입력으로 카드만 생성. 키 입력 화면이 자동으로 뜨지 않고, 새 카드가
  목록에 추가된 후 사용자가 그 카드의 "API 키" 필드를 직접 입력해야 한다.
  카드 생성과 키 저장이 2-step 인 게 의도 (PR 분리). 키 입력 잊으면 `hasApiKey
  = false` 배지가 노출되므로 누락 가시화는 됨.
- **`AdminRestaurantsPage` 페이저 정렬 변경 = 페이지 1 리셋** — 다른 페이지에
  있던 채로 정렬 셀렉트만 바꾸면 결과가 어색하게 어긋난다 (3페이지에 있던
  특정 식당이 정렬 후엔 어디 있는지 모름). `updateParams({ sort, page: null })`
  로 page 도 같이 비운다 (URL 에서 제거 → 기본값 1).
- **`BottomSheet` `disableScrollLock` 안 켜진 형제 sheet 가 락 풀어버림** —
  list/detail 2-시트 패턴에서 list sheet 가 detail 시트 mount 시 `disableScrollLock=true`
  로 두지 않으면, detail unmount 시 list 의 overflow 락이 풀린다. 형제 sheet
  중 활성 하나만 락을 잡고 나머지는 `disableScrollLock`. unmount cleanup 이
  `useLayoutEffect` 인 것도 같은 이유 (paint 이전에 순서 보장).
- **이전 라운드 함정들 유지** — sticky containing block trap,
  `overflow-y:auto` 안 sticky 동작, 모바일 body 스크롤 + `100dvh`,
  한글 IME 미완성 조합, Pretendard CDN 의존, 텍스트 사이즈 시프트 어드민
  영향, ImgWithFallback src 변경 reset, 5탭 placeId 변경 옛 데이터 잠시
  보임, vworld 키 미등록 placeholder, OL apiKey 변경만 재생성, MapCanvas
  첫 렌더 moveend 무시, 모바일 detail 활성 시 list/map hidden, Lightbox
  글로벌 keydown, Radix Dialog 안 OL, 직렬 await 만으로 부족 — BE
  rate-limit 제거, 디바운스 cleanup, 검색 placeId 등록 list 체크,
  tailwindcss-animate 미설치, `global.css` unlayered anchor, 재크롤 시
  detail 리뷰 비우기, 방문일 정규화, 다중 슬롯 무제한, `.tsx` 옆 `.js`
  잔재, SSE `?token` 쿼리 인증, 서명 video URL TTL, VideoPlayerModal
  body lock, logout localStorage 정리, admin 링크 게이트, OKLCH 일부 도구
  미지원, Vite deps prebundle 캐시, store 셀렉터 안정성, SSE 구독 원본
  기준, `window.confirm` 잔존, 글로벌 머지 409, `?menu`/`?category` replace,
  MenuRankingSection 글로벌 매핑 의존, AdminAiKeysPage useEffect 잔존.

## Sources [coverage: high — 81 sources]

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
- [apps/web/src/routes/RestaurantDetailRoute.tsx](../../apps/web/src/routes/RestaurantDetailRoute.tsx)
- [docs/mobile-public-restaurant-ux.md](../../docs/mobile-public-restaurant-ux.md)
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
- [apps/web/src/routes/admin/AdminAutoDiscoverPage.tsx](../../apps/web/src/routes/admin/AdminAutoDiscoverPage.tsx)
- [apps/web/src/components/admin/auto-discover/AutoDiscoverForm.tsx](../../apps/web/src/components/admin/auto-discover/AutoDiscoverForm.tsx)
- [apps/web/src/components/admin/auto-discover/AutoDiscoverJobCard.tsx](../../apps/web/src/components/admin/auto-discover/AutoDiscoverJobCard.tsx)
- [apps/web/src/routes/admin/AdminCatchtableTestPage.tsx](../../apps/web/src/routes/admin/AdminCatchtableTestPage.tsx)
- [apps/web/src/routes/admin/AdminCatchtableShopPage.tsx](../../apps/web/src/routes/admin/AdminCatchtableShopPage.tsx)
- [apps/web/src/routes/admin/AdminDiningcodePage.tsx](../../apps/web/src/routes/admin/AdminDiningcodePage.tsx)
- [apps/web/src/routes/admin/AdminDiningcodeShopPage.tsx](../../apps/web/src/routes/admin/AdminDiningcodeShopPage.tsx)
- [apps/web/src/routes/admin/AdminDiningcodeTestPage.tsx](../../apps/web/src/routes/admin/AdminDiningcodeTestPage.tsx)
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
- [apps/web/src/components/restaurant/CanonicalMergePanel.tsx](../../apps/web/src/components/restaurant/CanonicalMergePanel.tsx)
- [apps/web/src/components/restaurant/MergeProposalQueue.tsx](../../apps/web/src/components/restaurant/MergeProposalQueue.tsx)
- [apps/web/src/components/restaurant/ReanalyzeFailedBadge.tsx](../../apps/web/src/components/restaurant/ReanalyzeFailedBadge.tsx)
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
- [apps/web/src/routes/RestaurantsV2Page.tsx](../../apps/web/src/routes/RestaurantsV2Page.tsx)
- [apps/web/src/components/restaurant-v2/BottomSheet.tsx](../../apps/web/src/components/restaurant-v2/BottomSheet.tsx)
- [apps/web/src/routes/settlement/SettlementNewPage.tsx](../../apps/web/src/routes/settlement/SettlementNewPage.tsx)
- [apps/web/src/routes/settlement/Step1Participants.tsx](../../apps/web/src/routes/settlement/Step1Participants.tsx)
- [apps/web/src/routes/settlement/Step2Source.tsx](../../apps/web/src/routes/settlement/Step2Source.tsx)
- [apps/web/src/routes/settlement/Step3Edit.tsx](../../apps/web/src/routes/settlement/Step3Edit.tsx)
- [apps/web/src/routes/settlement/Step4Review.tsx](../../apps/web/src/routes/settlement/Step4Review.tsx)
- [apps/web/src/routes/settlement/SettlementResultPage.tsx](../../apps/web/src/routes/settlement/SettlementResultPage.tsx)
- [apps/web/src/routes/settlement/SettlementHistoryPage.tsx](../../apps/web/src/routes/settlement/SettlementHistoryPage.tsx)
- [apps/web/src/routes/settlement/SharedSettlementPage.tsx](../../apps/web/src/routes/settlement/SharedSettlementPage.tsx)
- [apps/web/src/routes/settlement/ContactsPage.tsx](../../apps/web/src/routes/settlement/ContactsPage.tsx)
- [apps/web/src/routes/settlement/ContactEditDialog.tsx](../../apps/web/src/routes/settlement/ContactEditDialog.tsx)
- [apps/web/src/routes/settlement/ContactPickerDialog.tsx](../../apps/web/src/routes/settlement/ContactPickerDialog.tsx)
- [apps/web/src/routes/settlement/ContactSuggestions.tsx](../../apps/web/src/routes/settlement/ContactSuggestions.tsx)
- [apps/web/src/routes/settlement/MenuPickerDialog.tsx](../../apps/web/src/routes/settlement/MenuPickerDialog.tsx)
- [apps/web/src/routes/settlement/ParticipantEditDialog.tsx](../../apps/web/src/routes/settlement/ParticipantEditDialog.tsx)
- [apps/web/src/routes/settlement/SettlementShareDialog.tsx](../../apps/web/src/routes/settlement/SettlementShareDialog.tsx)
- [apps/web/src/routes/settlement/SettlementCards.tsx](../../apps/web/src/routes/settlement/SettlementCards.tsx)
