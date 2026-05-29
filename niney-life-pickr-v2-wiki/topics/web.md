---
topic: web
last_compiled: 2026-05-28
sources_count: 93
status: active
aliases: [vite, react, web-app, frontend-web, admin-discover, admin-auto-discover, admin-diningcode, admin-catchtable, panel-side-toggle, batch-crawl, naver-search-results, panelPrefsStore, usePanelSide, mobile-ux, route-split, korean-ime, lightbox-snap, body-scroll-mobile, ios-zoom-fix, canonical-merge, merge-proposal-queue, sticky-action-bar, fused-detail, show-on-map-button, restaurants-v2, bottom-sheet, joblog-tab, restaurant-crawl-logs-section, summary-cancel-button, summary-resume-button, public-restaurant-list-split, location-based-first-entry, public-reviews-pagination, settlement, settlement-stepper, settlement-share, settlement-history, ContactsPage, ai-purpose, card-padding-fix, lightbox-dvh, map-zoom-label-toggle, settlement-rounds, N차, Step2Rounds, RoundDiscountEditor, RoundCategoryAdjuster, RoundExceptionsEditor, SettlementBreakdownTable, MultiReceiptSplitDialog, RestaurantSearchDialog, confirm-dialog, settlementPrefsStore, tailwind-dark-v4, single-field-participant, alias-toggle, multi-select-bulk-delete, ai-models-preview, z-30-sticky, breakdown-matrix, copy-attendances, 1차와동일, exclude-default-toggle]
---

# web — Vite + React 웹 앱

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

## Architecture [coverage: high — 33 sources]

### 빌드 / 런타임

- **Vite 6 + `@vitejs/plugin-react`** — 정적 SPA 번들러.
- **React 19 + react-dom 19** — `createRoot`/`StrictMode`로 마운트.
- **TypeScript 5.7**, `@repo/config/tsconfig/react.json` 확장.
- 경로 별칭 `~/* → ./src/*`, extensions 우선 `.web.tsx`/`.web.ts`.
- jsDelivr Pretendard variable + `lp:theme` localStorage FOUC 방지.
- **OpenLayers 10.7** — vworld JS SDK 대신 WMTS 직접.
- **Tailwind v4** — `@custom-variant dark (&:where(.dark, .dark *))` 명시 binding
  ([tailwind.css](../../apps/web/src/styles/tailwind.css)). 이 한 줄이 없으면 v4
  기본(미디어쿼리 `prefers-color-scheme`)이 발동해 `.dark` 클래스 토글 방식과
  엇갈리고 `dark:bg-*` 같은 모든 utility 가 시스템 다크 사용자한테만 작동한다.

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
| `/restaurants/:placeId/settle/new` | `SettlementNewPage` (4-step, N차) | `RequireUser` (단독) |
| **`/me/settlements/new`** | `SettlementNewPage` (식당 없이 진입) | `RequireUser` (단독) |
| `/restaurants/:placeId/settle/:id` | `SettlementResultPage` (저장 후 보기) | `RequireUser` (단독) |
| **`/restaurants/:placeId/settle/:id/edit`** | `SettlementNewPage` (edit 모드) | `RequireUser` (단독) |
| `/share/settlements/:token` | `SharedSettlementPage` (read-only) | (단독, 인증 X) |
| `/login` | `LoginPage` | (단독) |
| `/admin/*` | (이전과 동일 — 11개 메뉴) | `AdminLayout` + `RequireAdmin` |

`RequireUser` 는 token 만 보고 role 검사 X (정산은 USER 도 사용). `RequireAdmin` 은
역할까지 검증. 두 가드 모두 [App.tsx](../../apps/web/src/App.tsx) 안에 정의.

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

### 모바일 UX 규율 / 공개 셸 / 어드민 셸

[이전 라운드 컴파일 동일 — `PublicLayout`, `AdminLayout`(11개 메뉴), 모바일
body 스크롤 + 100dvh + 한글 IME, 어드민 발견/자동 발견 카드, 다이닝코드 정식/
검증 페이지, 캐치테이블 테스트, canonical 그룹핑 + Scissors 분리 + MergeProposalQueue,
RestaurantsV2 BottomSheet 등 — 모두 그대로]. 자세한 내용은
[이전 컴파일 본 참고].

## Talks To [coverage: high — 14 sources]

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
  - **AI** — `usePreviewModels` [신규] (저장 전 모델 미리보기), 기존
    `useProviderModels`/`useUpdateProvider`/`useDeleteProvider`/`useTestProvider`
    그대로 (`ProviderKey` 페어 시그니처 유지).
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
  **`useSettlementPrefsStore` [신규]** (localStorage — 다음 정산까지 유지).
  draft vs prefs 수명이 달라 분리.
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
- `/share/settlements/:token` — 공유 토큰 read-only (수정됨 배지)
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
- UI 공용 [신규] — `components/ui/confirm-dialog.tsx`.
- 어드민 — `AdminAiKeysPage` 에 "모델 미리보기" 추가 + 모바일 카드 정돈.
- 그 외 모든 컴포넌트는 2026-05-25 라운드와 동일.

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

## Key Decisions [coverage: high — 33 sources]

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

### 기존 결정 유지

React 19, Tailwind v4 + shadcn 토큰, `@repo/shared` 경유, stream-driven cache merge,
역할 기반 가드, 다중 슬롯 잡, 재크롤 시 detail 리뷰 비우기, `fetchedAt-asc`,
비디오 프록시 정책, `MapCanvas` ResizeObserver, panelPrefsStore 페이지 namespace,
정산 Stepper 점프 게이팅 = "산출물 존재" 기준 (이번 라운드도 `participantsCount>0`/
`rounds.every(source!=null)`/`itemsCount>0` 으로 유지).

## Gotchas [coverage: high — 27 sources]

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
- **이전 라운드 함정들 유지** — sticky containing block trap, `overflow-y:auto`
  안 sticky 동작, 모바일 body 스크롤 + `100dvh`, 한글 IME 미완성 조합, Pretendard
  CDN 의존, ImgWithFallback src 변경 reset, OL apiKey 변경만 재생성, Lightbox
  글로벌 keydown, Radix Dialog 안 OL, SSE `?token` 쿼리 인증, AdminDiningcodePage
  선택 자동 초기화, DC-only canonical 행 클릭 불활성, MergeProposalQueue "전체
  다시 돌리기" 큐 비우지 않음, sticky 액션바 z-index, MAX_BULK=50, 자동 발견
  groupIndex<0 분기, 영수증 미리보기 = JWT 필요 → `<img src>` 직접 X, 그 외
  이전 라운드 다수.

## Sources [coverage: high — 93 sources]

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
- [apps/web/src/routes/RestaurantsV2Page.tsx](../../apps/web/src/routes/RestaurantsV2Page.tsx)
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
- [apps/web/src/stores/settlementPrefsStore.ts](../../apps/web/src/stores/settlementPrefsStore.ts)
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
- [apps/web/src/components/restaurant-v2/BottomSheet.tsx](../../apps/web/src/components/restaurant-v2/BottomSheet.tsx)
- [apps/web/src/components/ui/button.tsx](../../apps/web/src/components/ui/button.tsx)
- [apps/web/src/components/ui/card.tsx](../../apps/web/src/components/ui/card.tsx)
- [apps/web/src/components/ui/input.tsx](../../apps/web/src/components/ui/input.tsx)
- [apps/web/src/components/ui/table.tsx](../../apps/web/src/components/ui/table.tsx)
- [apps/web/src/components/ui/badge.tsx](../../apps/web/src/components/ui/badge.tsx)
- [apps/web/src/components/ui/pager.tsx](../../apps/web/src/components/ui/pager.tsx)
- [apps/web/src/components/ui/confirm-dialog.tsx](../../apps/web/src/components/ui/confirm-dialog.tsx)
- [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts)
- [apps/web/src/lib/vworld.ts](../../apps/web/src/lib/vworld.ts)
- [apps/web/src/styles/global.css](../../apps/web/src/styles/global.css)
- [apps/web/src/styles/tailwind.css](../../apps/web/src/styles/tailwind.css)
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
