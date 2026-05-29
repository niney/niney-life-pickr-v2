---
topic: project-overview
last_compiled: 2026-05-28
sources_count: 31
status: active
aliases: [monorepo, life-pickr, niney, root, turbo, pnpm-workspace, settlement, 정산, settlement-domain, share-token, public-share-read, ai-purpose, vision-llm, receipt-extraction, contacts-page, settlement-stepper, edited-badge, admin-discover, admin-auto-discover, panel-side-toggle, batch-crawl, naver-search-results, panelPrefsStore, captcha-aware-capture, mobile-ux, body-scroll, sticky-containing-block, terminology, web-mobile-app, expo-web, diningcode, catchtable, canonical-restaurant, multi-source, auto-dc-merge, sse-heartbeat, stale-summary-cleanup, crawl-job-log, summary-queued-cancelled, summary-resume, app-level-singleton-plugin, mobile-native-tabs, dev-client, webview-vworld, location-first-entry, public-reviews-pagination, naver-stealth, db-path-unified, mobile-production-build, settlement-rounds, settlement-draft-auto-save, universal-links-iOS, app-links-android, well-known-AASA, well-known-assetlinks, RFC1918-dev-cors, expo-web-lan-ip, multi-receipt-split, roundUnit-100-1000, refinement-leftover, ai-models-preview, settlement-PUT-full-replace, items-mutable-after-save, tailwind-v4-dark-fix, deep-link-fallback, share-settlements-deep, settlement-mobile-implementation, attendees-100, items-200, EXTRACTION_VERSION, headerBackTitle-fix, sticky-breakdown-z-30]
---

# project-overview — 모노레포 개요

**2026-05-28 변경 흡수 — 정산 도메인이 1차 단일에서 N차(차수) 모델로 진화 + 서버 draft 자동저장(다기기 sync) + 분담 다듬기/차수 할인/멀티 영수증 분할 + 앱(모바일) 정산 풀구현 + Universal Links/App Links + 폰-LAN dev 패턴 정착.** 이전 컴파일에서 "정산은 mobile 미구현 — 웹만" 이라고 박았던 게 사라졌다 — `apps/mobile` 에 wizard / history / contacts / share / edit / breakdown 풀스택이 들어갔고, AsyncStorage draft 어댑터는 `setSettlementDraftStorage` injection 으로 store 의 web/native 분기 부담을 끊었다. 도메인 모델 자체는 **N차** — `SettlementRound` + `SettlementRoundAttendee` 두 테이블이 신설되고 items / attendees 가 session 레벨에서 round 레벨로 이동(4 마이그레이션). 마스터 참여자는 session 에 두고 차수별 출석 + 카테고리 exclude override 만 round 에 보관 — null 이면 마스터 default 상속, 명시값은 round override. 계산기는 `calculateMultiRoundShares` 로 round 별 `calculateShares` 를 attendee subset 으로 돌려 master-index 합산. 차수당 attendees 20→100, items 100→200 으로 상향. **분담 다듬기(refinement)** 가 들어왔다 — 차수별 카테고리 풀을 100/1000원 단위로 round 한 뒤 나머지를 leftoverParticipant 한 명에게 흡수, 인원으로 안 나눠지면 silent fallback (raw + leftover 가산). **차수 할인** 은 round 당 단일 카테고리 한 건 — `pool >= discountAmount` zod refine 으로 풀 음수 방어. **멀티 영수증 분할** 은 한 장의 사진을 N(2..5) 슬라이스로 잘라 같은 imageToken 재사용 + sharp crop + vision LLM 을 N 회 호출 — 비용 인지 UX. **서버 draft 자동저장** 은 `SettlementDraft` 테이블(`(userId, placeIdKey)` unique, SQLite 의 다중 NULL unique 우회로 빈 문자열 sentinel 사용) + `GET/PUT/DELETE /api/v1/settlement-drafts` 3 엔드포인트 — 5초 debounce 로 store 변화를 백엔드로 흘려보내고, 본 저장 성공 시 `fromDraftId` 가 트랜잭션 안에서 draft 행을 청소. 저장 어댑터는 **3 레이어** — 웹은 sessionStorage(브라우저 탭 scope), 앱은 AsyncStorage(앱 재시작), 서버는 다기기 canonical. **`PUT /settlements/:id` 풀 리플레이스** 가 옛 PATCH /:id/participants 자리를 대신한다 — 한 트랜잭션에서 rounds/participants/items 전체 교체, 저장 후 items 도 변경 가능 (이전 "items 불변" 정책 폐기). **Universal Links(iOS)/App Links(Android)** — friendly 의 `well-known` 모듈이 `/.well-known/apple-app-site-association` + `/.well-known/assetlinks.json` 을 env 기반(`APP_TEAM_ID` / `APP_BUNDLE_ID` / `ANDROID_APP_PACKAGE` / `ANDROID_SHA256_FINGERPRINTS`) 으로 동적 응답 — env 비면 의도적 404, 잘못된 빈 JSON 으로 검증 실패하는 사고 회피. 앱 `app.config.ts` 가 `associatedDomains` + `intentFilters(autoVerify)` 로 `/share/settlements/*` 가로채기 선언 — 미설치 단말은 같은 URL 로 웹 SPA(SharedSettlementPage) fallback. 셋업 절차는 `apps/mobile/DEEP_LINK_SETUP.md`. **CORS RFC1918 자동허용** — `apps/friendly/src/plugins/cors.ts` 가 dev 한정으로 localhost/127.0.0.1/10.x/192.168.x/172.16-31.x origin 을 regex 매칭해 자동 통과. 앱 Expo Web 도 `window.location.host` LAN IP 감지로 friendly base URL 을 같은 LAN IP 로 자동 매칭 — env 안 만지고 폰 단말에서 LAN 으로 dev 가능한 한 쌍의 패턴. **AI key 모델 preview** — `GET /admin/ai/providers/:id/:purpose/models/preview` 로 키 검증 + 모델 후보를 provider 의 authoritative list 에서 받아본 뒤 저장. **Tailwind v4 dark variant** 는 `@custom-variant dark` 를 `.dark` 클래스에 명시 바인딩 (v4 자동 detect 가 어긋난 케이스 fix). 자잘하게는 정산 참여자 입력이 단일 필드 + 별칭 토글 + Enter 추가 + 새 행 exclude default 토글로 바뀌고, exclude default 는 web `settlementPrefsStore`(localStorage) / mobile `settlementPrefsStore`(AsyncStorage) 에 영속(세션 단위 draft 와 분리된 장기 default). 이력은 bulk delete + "이어 입력" draft 행으로 진화, 결과/공유 페이지는 차수별 카드 + sticky 정산표(z-30, 데스크탑 2-col) 로 재단됨. Step2Source 는 사라지고 Step2Rounds 로 바로 직행 — N 차 입력이 디폴트.

루트 레벨에서 본 niney-life-pickr-v2 — "선택을 대신 골라주는 서비스" — 의 구조, 워크플로, 공통 규칙을 한 페이지로 정리한다. 공개 영역(사용자 대상 페이지) 과 어드민 영역(운영 도구) 으로 나뉘며, 양쪽 모두 단일 백엔드를 공유한다. 개별 모듈에 대한 자세한 내용은 각 토픽 문서로.

> **용어 (Terminology) — 프로젝트 단일 규약** (CLAUDE.md 의 "용어" 섹션을 그대로 반영):
> - **웹** = `apps/web` (Vite + React 19 SPA, 공개 + 어드민 두 레이아웃)
> - **앱** = `apps/mobile` (Expo + RN 앱). 플랫폼 별로는 **iOS앱**, **Android앱**, **Expo Web** (RN-Web 출력)
> - **모바일** = **웹**의 작은 화면(반응형 레이아웃)만 지칭 — 앱 가리키지 않음. 앱을 가리킬 땐 항상 "앱"
> - **모바일 단말** = 휴대전화로 **웹** 접속한 상태
> - 식별자(슬러그·디렉터리·스크립트·커밋 스코프) `mobile` / `web` 은 그대로 유지 — 디렉터리 슬러그 기준이라 변경 없음
> 자세한 규칙: [schema.md Terminology](../schema.md#terminology--웹--앱--모바일), [CLAUDE.md 용어](../../CLAUDE.md#용어).

## Purpose [coverage: high — 5 sources]

선택이 고민될 때 대신 골라주는 서비스다. 핵심 도메인은 세 축으로 갈린다:

- **선택 도우미(Pick)** — 사용자가 선택지(`options`)를 등록해 두면, API가 무작위 결과를 골라 `PickResult`로 기록한다. 식당이 등록되어 있으면 분석 점수(만족도/긍정 비율)를 가중치로 쓰는 `smart-pick` 가 활성된다.
- **맛집 분석** — 어드민이 다양한 출처에서 식당을 크롤링하고 리뷰를 LLM으로 분석해 메뉴 통계 트리까지 빌드한다 ([crawl](crawl.md), [ai](ai.md), [menu-grouping](menu-grouping.md), [analytics](analytics.md)). 출처는 3종 — **네이버 플레이스 / 다이닝코드 / 캐치테이블**. 어드민의 진입 경로는 네 갈래 — 단건 placeId 입력 (`/admin/restaurants`), 키워드 검색→다중 선택 일괄 등록 (`/admin/discover`), 다이닝코드 일괄 저장 (`/admin/diningcode`), **AI 자동 발견** (`/admin/auto-discover`). 결과물은 공개 페이지에서 비로그인 사용자가 그대로 본다.
- **정산하기 — N차 모델** — 식당 상세에서 진입하는 사용자 기능. 한 자리(session) 안에 1..10 차(round) — 차수마다 자기 식당 / 항목 / 출석한 attendees subset / source(MANUAL/RECEIPT) / 할인 / 다듬기 조정을 들고 있다. 마스터 참여자는 session 레벨, 차수별 출석/exclude override 만 round 레벨. 영수증 사진을 vision LLM 으로 4 카테고리(ALCOHOL/NON_ALCOHOL/SIDE/UNCATEGORIZED) 메뉴·금액 추출(차수당 1장 또는 멀티 분할로 1장→N슬라이스) → wizard(참여자/차수/항목 편집/결과) → 저장 → 공유 토큰(`/share/settlements/:token`) 비인증 read. 단골 참여자는 자동 적립(`SettlementContact`) 되어 다음 정산에서 자동완성으로 끌어쓴다. **앱(iOS/Android) 도 풀구현** — 웹과 동일 동선 + 네이티브 bottom sheet. 자세한 건 [settlement](settlement.md).

세 개의 클라이언트가 동일 백엔드를 공유한다:
- **friendly** — Fastify + Prisma + SQLite 백엔드 ([friendly](friendly.md))
- **웹** (`apps/web`) — Vite + React 19 SPA. 공개 영역(`/`, `/restaurants`, `/restaurants/:placeId`, `/share/settlements/:token`) + 인증 사용자 영역(`/me/*`, `/restaurants/:placeId/settle/*`) + 어드민 콘솔(`/admin/*`) 세 묶음이 한 SPA 안에 공존
- **앱** (`apps/mobile`) — Expo SDK 52 + React Native 0.76. 맛집/정산/단골/공유 라우트 풀구현. 어드민 UI 는 의도적 미포함

공개 영역은 비로그인 호출 가능 — 데이터 자체는 어드민이 본 것과 차이가 없고 (운영 메타만 제거), 사용자 정책상 그대로 노출한다. 공유 정산 토큰 경로(`/share/settlements/:token`) 도 비인증으로 열려 있으나 추측 불가능한 32바이트 base64url 토큰 보호. 같은 URL 을 앱이 설치된 단말에선 Universal/App Links 가 가로채 앱이 직접 열고, 미설치 단말은 웹 SPA 가 fallback.

## Architecture [coverage: high — 11 sources]

pnpm workspaces + Turborepo 기반 모노레포.

```
niney-life-pickr-v2/
├── apps/
│   ├── friendly/          Fastify 백엔드 → friendly 토픽
│   │   ├── data/
│   │   │   ├── dev.db           SQLite (DATABASE_URL=file:../data/dev.db)
│   │   │   ├── receipts/        영수증 이미지 디스크 저장 (멀티 분할 시에도 한 token 재사용)
│   │   │   └── thumbs/          네이버 CDN 썸네일 캐시
│   │   └── src/
│   │       ├── plugins/cors.ts                        dev RFC1918 사설 IP 자동 허용 (신규 정책)
│   │       ├── config/env.ts                          APP_TEAM_ID / APP_BUNDLE_ID / ANDROID_APP_PACKAGE / ANDROID_SHA256_FINGERPRINTS (신규)
│   │       └── modules/
│   │           ├── settlement-extraction/  영수증 업로드 + vision LLM 추출 + 멀티 영수증 분할(N슬라이스)
│   │           ├── settlement/             N차 세션 CRUD + 분배 계산 + 공유 토큰 + draft 자동저장
│   │           │   ├── settlement.service.ts
│   │           │   ├── settlement.route.ts
│   │           │   ├── settlement.calculator.test.ts
│   │           │   ├── settlement-draft.service.ts  (userId, placeIdKey) upsert
│   │           │   └── settlement-draft.route.ts
│   │           ├── contact/                단골 참여자 자동 적립 + /me/contacts
│   │           └── well-known/             AASA + assetlinks.json 동적 응답 (신규)
│   │               └── well-known.route.ts
│   ├── web/               Vite + React SPA (공개 + 어드민 + /me) → web 토픽
│   │   └── src/
│   │       ├── stores/settlementPrefsStore.ts        localStorage exclude default (신규)
│   │       └── routes/
│   │           ├── settlement/      Step1/Step2Rounds/Step3/Step4 + History/Result/Shared/Contacts + RoundCategoryAdjuster/RoundDiscountEditor/MultiReceiptSplitDialog/SettlementBreakdownTable
│   │           └── admin/
│   └── mobile/            Expo + RN 앱 → mobile 토픽
│       ├── DEEP_LINK_SETUP.md       Universal/App Links 설정 가이드 (신규)
│       ├── app.config.ts            associatedDomains + intentFilters(autoVerify) (수정)
│       ├── app/
│       │   ├── (tabs)/_layout.tsx                  웹/네이티브 분리 — ~/components/tabs-layout 위임 + 형제 .web.tsx 자동 채택
│       │   ├── restaurant/[placeId]/settle/        new + [id]/index/edit (신규 — 앱 정산)
│       │   ├── settlement/                         new + history + contacts (신규)
│       │   └── share/settlements/[token].tsx       Universal Link 진입점 (신규)
│       ├── src/
│       │   ├── lib/settlementPrefsStore.ts         AsyncStorage exclude default (신규)
│       │   └── components/settlement/              SettlementWizard / Step1~4 / *Sheet / *Editor (신규)
│       └── docs/production-build.md  앱 운영 빌드 가이드
├── packages/
│   ├── api-contract/      Zod SSOT → api-contract 토픽
│   │   └── src/
│   │       ├── settlement.calculator.ts            calculateShares + calculateMultiRoundShares (round 합산)
│   │       └── schemas/
│   │           ├── settlement.ts                   세션/차수/항목/참여자/round attendee
│   │           ├── settlement-extraction.ts        vision 추출 + ExtractReceiptSplit { count: 2..5, index: 1..count }
│   │           ├── settlement-contact.ts           단골 CRUD
│   │           └── settlement-draft.ts             서버 draft (payload unknown, 200KB cap, 신규)
│   ├── shared/            FE 공통 (API/hooks/store/UI) → shared 토픽
│   │   └── src/
│   │       ├── stores/settlementDraftStore.ts      storage 어댑터 injection (setSettlementDraftStorage)
│   │       └── api/settlement*.api.ts              + useSettlement* / useSharedSettlement / useCreateSettlement({ fromDraftId })
│   ├── utils/             순수 유틸 → utils 토픽
│   └── config/            tsconfig + ESLint 공유 → config 토픽
├── pnpm-workspace.yaml    apps/* + packages/*
├── turbo.json             dev / build / typecheck / lint / test 파이프라인
├── tsconfig.base.json     루트 TS 베이스 (ES2022, strict, noUncheckedIndexedAccess)
├── CLAUDE.md              에이전트 가이드 (이 위키와 함께 본다) — "용어" 섹션 포함
└── TECH_STACK.md          전체 기술 스택 명세
```

### 출처 3종 + canonical 그룹핑 레이어 (변동 없음)

크롤 출처가 한 개에서 셋으로 늘어나면서 "출처 가로지르는 같은 가게" 문제가 생겼다. 해결 구조:

```
Naver Place ──┐
Diningcode  ──┼──→ Restaurant (source, sourceId)  ──→  CanonicalRestaurant (N:1)
Catchtable  ──┘
```

자세한 모델·매칭 로직: [friendly](friendly.md), [canonical](canonical.md). 자동 DC 머지 + 검토 큐 정책은 이번 라운드 변동 없음.

### 백엔드 도메인 맵 (`apps/friendly/src/modules/`)

| 도메인 | 역할 | 위키 |
|---|---|---|
| `auth` | 회원가입 / 로그인 / JWT | — |
| `user` | 프로필 / 관리자 role 토글 | — |
| `picks` | 선택지 등록 + 무작위 픽 | — |
| `crawl` | 네이버 / DC / 캐치테이블 크롤 (Playwright + 어댑터별 분기, Naver done 후 자동 DC 매칭+머지 후크, naver stealth/jitter) | [crawl](crawl.md) |
| `auto-discover` | AI 키워드 8개 → 다중 검색 → 그룹 5병렬 자동 발견 잡 | [auto-discover](auto-discover.md) |
| `ai` | LLM 라우팅 + `purpose` 분리(chat/image) + **모델 preview**(`GET /admin/ai/providers/:id/:purpose/models/preview`) — 키 검증 + 모델 후보 받아본 뒤 저장 | [ai](ai.md) |
| `settlement-extraction` | 영수증 업로드 + vision LLM 추출 + **멀티 영수증 분할** (`ExtractReceiptSplit { count, index }` — 같은 imageToken 으로 N 회 sharp crop + vision 호출) | [settlement](settlement.md) |
| `settlement` | **N차 세션 CRUD** + 분배 계산(`calculateMultiRoundShares`) + 공유 토큰 + **draft 자동저장**(`SettlementDraft`, `(userId, placeIdKey)` upsert). `PUT /:id` 풀 리플레이스 (이전 PATCH /:id/participants 대체) | [settlement](settlement.md) |
| `contact` | 단골 참여자 자동 적립 + `/me/contacts` | [settlement](settlement.md) |
| **`well-known`** | `/.well-known/apple-app-site-association` + `/.well-known/assetlinks.json` 동적 응답 (env 기반, 미설정 시 404) (신규) | — |
| `summary` | 리뷰 단위 분석 v4 (메뉴 멘션 + 태그) | [ai](ai.md) |
| `restaurant` | 어드민 식당 CRUD + 공개 list/detail/insights/ranking | — |
| `canonical` | 출처 가로지르는 같은 가게 묶기 + 머지 제안 큐 | [canonical](canonical.md) |
| `media` | 리뷰 사진/동영상 + 썸네일 프록시 | [media](media.md) |
| `menu-grouping` | 식당별 메뉴 정규화 (synonym → canonical) | [menu-grouping](menu-grouping.md) |
| `analytics` | 전역 메뉴 머지 + 카테고리 path + 통계 트리 | [analytics](analytics.md) |
| `settings` | 외부 SDK 키 — 현재 `map.route.ts`만 (vworld) | — |
| `admin` / `health` | 어드민 메타 / 헬스체크 | — |

빌드 의존 관계: turbo가 `^build` 종속을 자동 추적한다. `dev` 태스크는 캐시 비활성화 + persistent로 워치 모드 유지.

### 공개 / 인증 사용자 / 어드민 3-레이어 분리 정책

라우트 prefix 로 가른다 — 백엔드의 모든 어드민 엔드포인트는 `/api/v1/admin/*` 아래에 모이고, 사용자 본인 자원은 `/api/v1/me/*` 또는 `/api/v1/settlements/*` / `/api/v1/settlement-drafts/*` (인증 필요), 그 외는 공개. `app.requireAdmin` 가드는 `admin/` prefix 라우트에만, `app.requireAuth` 는 사용자 자원 라우트에 붙는다. FE 도 같은 정책:

| 영역 | 레이아웃 | 라우트 | 가드 |
|---|---|---|---|
| 공개 | `PublicLayout` (TopBar + 모바일 사이드바) | `/`, `/restaurants`, `/restaurants/:placeId`, `/share/settlements/:token` | 없음 |
| 인증 사용자 | `PublicLayout` 또는 단독 | `/me/settlements`, `/me/contacts`, `/restaurants/:placeId/settle/new`, `/restaurants/:placeId/settle/:id` | `RequireUser` (token, role 무관) |
| 인증 진입 | (단독) | `/login` | 없음 |
| 어드민 | `AdminLayout` (좌측 사이드바) | `/admin/*` | `RequireAdmin` (token + role=ADMIN) |

공개 영역은 Pretendard 변수 폰트 + 텍스트 사이즈 시프트가 적용되고, 어드민은 시스템 폰트 fallback. 공유 정산 토큰 경로(`/share/settlements/:token`) 는 비인증이지만 `PublicLayout` TopBar 도 띄우지 않아 받는 사람이 단순히 결과만 보게 한다 — 앱이 설치된 단말에선 OS 가 인터셉트해 `apps/mobile/app/share/settlements/[token].tsx` 가 직접 열린다.

### 정산 도메인 흐름 (N차 모델)

```
식당 상세 → "정산하기" 버튼
   ▼
/restaurants/:placeId/settle/new (RequireUser) — 웹
restaurant/[placeId]/settle/new — 앱
   ▼ Step1 — 마스터 참여자 입력 (단골 자동완성 + 다중 선택, 단일 필드 + 별칭 토글 + Enter 추가, exclude default = settlementPrefsStore 영속)
   ▼ Step2Rounds — N 차(1..10) 입력. 차수마다 식당 / source(MANUAL|RECEIPT) / attendees subset / 항목 / 할인 / 다듬기
   ▼   영수증인 경우: POST /settlement-extraction/upload → POST /settlement-extraction/extract
   ▼     (멀티 영수증 1장 N분할이면 같은 imageToken 으로 count=N, index=1..N N 회 호출)
   ▼ Step3 — 차수별 항목 편집 (메뉴 추가/금액 수정/카테고리 변경) — items 200 cap, attendees 100 cap
   ▼ Step4 — 결과 분배 (excludeAlcohol/NonAlcohol/Side 토글 + RoundCategoryAdjuster(100/1000 round + leftoverParticipant) + RoundDiscountEditor)
   ▼ POST /settlements ({ fromDraftId? })
   ▼   server: calculateMultiRoundShares — round 별 calculateShares (attendee subset) → master-index 합산
   ▼   server: fromDraftId 가 본인 소유면 같은 트랜잭션에서 SettlementDraft 삭제
   ▼   server: 모든 participant → SettlementContact (userId, normalizedKey) upsert
   ▼
/restaurants/:placeId/settle/:id — 차수별 카드 + sticky 정산표 (z-30 헤더로 sticky 위 클리어)
   ▼ PUT /settlements/:id — 풀 리플레이스 (rounds/participants/items 전체 교체, items 도 변경 가능)
   ▼ POST /settlements/:id/share → shareToken 멱등 발급 / DELETE 회수
   ▼
/share/settlements/:token — 비인증 read-only (앱 설치 시 OS 인터셉트, 미설치 시 웹 SPA fallback)
```

stepper UI 패턴 — 헤더에 sticky, 현재 단계 강조, **완료된 단계만 자유 점프** 가능. **서버 draft 자동저장** 은 5초 debounce 로 store 변화를 PUT — placeId 가 null 이면 `/me/settlements/new` 슬롯, 문자열이면 해당 1차 식당 슬롯. 본 저장 성공 시 `fromDraftId` 로 클린업. 자세한 동선·검증: [settlement](settlement.md).

### 어드민 발견 페이지 흐름 (변동 없음 — `/admin/discover` 네이버)

키워드 → 다중 선택 → 일괄 크롤 한 번에 처리. 흐름·정책은 이전 라운드와 같음 ([crawl](crawl.md), [auto-discover](auto-discover.md)).

## Talks To [coverage: high — 8 sources]

내부 패키지 의존 그래프 (단방향 — 순환 금지):

```
api-contract  ← 의존 ←  friendly, shared
shared        ← 의존 ←  web, mobile
utils         ← 의존 ←  friendly, web, mobile, shared (순수 함수만)
config        ← 의존 ←  모든 워크스페이스 (tsconfig/eslint)
```

런타임 통신:
- 웹 → friendly (`VITE_API_URL`, dev에선 Vite proxy `/api` → `:3000`; `server.host: true` 로 LAN/모바일 단말에서도 dev 서버 접근)
- 앱 → friendly (`EXPO_PUBLIC_API_URL`, 빌드 시점 주입. **Expo Web 은 `window.location.host` 가 LAN IP 면 friendly base URL 도 같은 LAN IP 로 자동 매칭** — `apps/mobile/src/lib/api-setup.ts`. 운영 빌드는 `.env.production` 자동 로드)
- friendly → SQLite 파일 (`apps/friendly/data/dev.db` — 경로 통일)
- friendly → 디스크 (`apps/friendly/data/receipts/<token>.jpg` — 영수증 이미지. **멀티 분할은 같은 token 재사용** + sharp crop 으로 N 슬라이스)
- friendly → 네이버 / DC / 캐치테이블 (Playwright + 어댑터, naver stealth + jitter)
- friendly → 네이버 CDN (`/api/v1/media/thumbnail` 프록시) → [media](media.md)
- friendly → LLM provider — `purpose` 분리(`chat`/`image`). **모델 preview** 라우트로 키 검증 + 후보 모델을 provider 의 authoritative list 에서 받아본 뒤 `LlmProviderConfig` 저장
- 웹 → vworld WMTS (OpenLayers 직접 fetch)
- 웹 → jsDelivr CDN (Pretendard 변수 폰트 — 공개 페이지)
- 공유 정산 토큰 read 는 비인증 — `GET /api/v1/share/settlements/:token`. 응답에서 `receiptPreviewUrl`/`userId` 제거
- **iOS/Android → friendly `/.well-known/*`** — OS 가 설치 시 자동 검증해서 `/share/settlements/*` 매칭 URL 을 앱으로 인터셉트
- **앱(Expo Web) — dev CORS** — friendly 가 RFC1918 사설 LAN IP origin 을 dev 한정 자동 허용 (env 안 만지고 폰 단말 LAN 접근 가능)

스키마 1개 변경으로 FE/BE 모두 컴파일 타임 불일치 감지 — 자세한 건 [api-contract 토픽](api-contract.md).

## API Surface [coverage: high — 6 sources]

루트 `package.json`이 노출하는 명령어 (turbo 위임):

| 명령 | 동작 |
|---|---|
| `pnpm dev` | 전체 dev (웹 + 앱 + friendly 동시) |
| `pnpm dev:api` | friendly만 (`http://localhost:3000`, docs `/docs`) |
| `pnpm dev:web` | 웹만 (`http://localhost:5173`, LAN host 노출) |
| `pnpm dev:mobile` | 앱 (Expo Dev Tools) |
| `pnpm dev:ios` / `pnpm dev:android` | 앱 iOS/Android 시뮬레이터 직행 |
| `pnpm dev:mobile:local` / `:prod` | 앱 dev 서버 + API URL 변형 |
| `pnpm build` / `typecheck` / `lint` / `test` | 전체 turbo 태스크 |
| `pnpm format` | Prettier (semi, singleQuote, trailingComma=all, printWidth=100) |
| `pnpm clean` | turbo clean + node_modules 제거 |
| `pnpm --filter <name> ...` | 특정 워크스페이스 명령 위임 |

### 백엔드 라우트 트리 (요약)

```
/api/v1
├── auth/* ......................... 회원가입 / 로그인 / 내 정보
├── picks/* ........................ 선택 / 픽 결과
├── media/thumbnail ................ 네이버 CDN 프록시 (공개)
├── settings/map/public ............ vworld WMTS 키 (공개)
├── restaurants/
│   ├── ranking .................... 공개 랭킹
│   ├── public ..................... 공개 리스트
│   ├── public/:placeId ............ 공개 상세
│   └── public/:placeId/insights ... 공개 인사이트
├── settlement-extraction/         정산 영수증 vision 추출 (인증)
│   ├── upload .................... POST multipart jpg → imageToken
│   ├── extract ................... POST { imageToken, placeId, split?: { count, index } } → items[]
│   └── preview/:token ............ GET 영수증 이미지 (owner 본인)
├── settlements/                   N차 정산 세션 CRUD (인증)
│   ├── GET /, POST / ............. list / create({ fromDraftId? })
│   ├── /:id ...................... get / **PUT(풀 리플레이스)** / delete
│   └── /:id/share ................ POST 멱등 토큰 발급 / DELETE 회수
├── settlement-drafts/              서버 draft 자동저장 (인증, 신규)
│   ├── GET / ..................... list (updatedAt desc)
│   ├── PUT / ..................... upsert by (userId, placeIdKey) — body 만으로 식별, id 불필요
│   └── DELETE /:id ............... 본인 소유만
├── share/settlements/:token ...... GET 공개 read-only (비인증)
├── me/contacts ................... 단골 참여자 CRUD (인증)
├── .well-known/                    (신규)
│   ├── apple-app-site-association ... env 기반 동적 응답 (미설정 시 404)
│   └── assetlinks.json .............. env 기반 동적 응답 (미설정 시 404)
├── health
└── admin/
    ├── crawl/* .................... 크롤 잡 + SSE
    ├── auto-discover/* ............ AI 키워드 → 다중 검색 → 그룹 5병렬
    ├── ai/* ....................... LLM 호출 + provider 키 (purpose=chat/image) + **models/preview** (신규)
    ├── analytics/* ................ 그룹핑 잡 + 글로벌 머지 + 카테고리 트리
    ├── canonical/* ................ 머지 제안 큐 / 수락·거절
    ├── settings/map ............... 지도 SDK 키 (admin)
    └── restaurants/* .............. 어드민 식당 CRUD + 인사이트 + smart-pick + summary SSE
```

### 웹 라우트 트리 (요약)

```
PublicLayout
  /                          HomePage
  /restaurants               RestaurantsPage
    /restaurants/:placeId    RestaurantDetailRoute
  /me/settlements            SettlementHistoryPage (RequireUser, bulk delete + "이어 입력" draft 행)
  /me/contacts               ContactsPage (RequireUser)
  /login                     LoginPage (단독)
RequireUser (단독)
  /restaurants/:placeId/settle/new   SettlementNewPage (Step1/Step2Rounds/Step3/Step4, server draft 자동저장)
  /restaurants/:placeId/settle/:id   SettlementResultPage (차수별 카드 + sticky 정산표, PUT 풀 리플레이스)
공개 (레이아웃 없음)
  /share/settlements/:token  SharedSettlementPage (비인증 read-only)
AdminLayout (RequireAdmin)
  /admin / /admin/discover / /admin/auto-discover / /admin/diningcode / /admin/diningcode-test / /admin/catchtable-test / /admin/restaurants / /admin/canonical / /admin/analytics / /admin/crawl-test / /admin/ai-test / /admin/settings
```

옛 `/admin/ai-keys` 북마크는 `/admin/settings/ai-keys` 로 redirect. ai-keys UI 는 purpose 분리 + 저장 전 모델 preview 호출로 키 검증.

### 앱 라우트 (요약)

```
app/
├── (tabs)/_layout.tsx        ~/components/tabs-layout 위임 (web/native split — 형제 .web.tsx 자동 채택)
├── (tabs)/home.tsx
├── (tabs)/restaurants.tsx
├── (tabs)/profile.tsx
├── restaurant/[placeId]/
│   ├── index.tsx
│   └── settle/
│       ├── new.tsx                 SettlementWizard
│       └── [id]/{index, edit}.tsx
├── settlement/
│   ├── new.tsx                     식당 미지정 시작 슬롯 (placeId=null draft)
│   ├── history.tsx                 bulk delete + "이어 입력" rows
│   └── contacts.tsx
└── share/settlements/[token].tsx   Universal/App Link 진입점 — useSharedSettlement 호출, headerBackTitle 명시
```

## Data [coverage: high — 8 sources]

데이터 흐름 (단일 진실의 원천):

```
packages/api-contract (Zod schema)
     │ 검증+OpenAPI         │ 타입+fetch
     ▼                      ▼
  friendly                @repo/shared
  (Fastify)               (API client/hooks)
                           │           │
                           ▼           ▼
                          웹          앱
```

영속 데이터: SQLite 파일 (`apps/friendly/data/dev.db`, `.env` `DATABASE_URL=file:../data/dev.db`), Prisma 마이그레이션. 영수증 이미지는 디스크 (`apps/friendly/data/receipts/<token>.jpg`) — 멀티 분할도 같은 token 재사용. 클라이언트 토큰: 웹은 `localStorage` `lp:token`, 앱은 AsyncStorage `lp:token`. **세션·영구 저장 분리** 정착:

| 저장소 | 영역 | 키/이름 | 무엇 |
|---|---|---|---|
| 웹 localStorage | `lp:panelPrefs` | 페이지별 사이드 패널 좌/우 |
| 웹 localStorage | `lp:settlementPrefs` | 정산 새 행 exclude default (장기 default) |
| 웹 sessionStorage | `lp:settlement-draft` | wizard 진행 중 draft (브라우저 탭 scope) |
| 앱 AsyncStorage | `lp:settlementPrefs` | 같은 exclude default |
| 앱 AsyncStorage | `lp:settlement-draft` | wizard 진행 중 draft (앱 재시작 영속) |
| 서버 DB | `SettlementDraft` | 다기기 canonical draft (5s debounce upsert) |

`settlementDraftStore` (zustand) 는 storage 어댑터를 **외부 주입** — 부팅 직후 `setSettlementDraftStorage(...)` 가 호출되어야 store 의 첫 read/write 가 안전. 웹은 entry 에서 sessionStorage 어댑터, 앱은 `apps/mobile/src/lib/api-setup.ts` 에서 AsyncStorage 어댑터 주입.

### 도메인 테이블 그룹 (전 21개)

| 그룹 | 테이블 (자세한 모델은 friendly/canonical/analytics/settlement 토픽) |
|---|---|
| 사용자 (3) | `User`, `Pick`, `PickResult` |
| 외부 SDK 키 (2) | `LlmProviderConfig` (`@@unique(provider, purpose)`), `MapProviderConfig` |
| canonical (2) | `CanonicalRestaurant`, `CanonicalMergeProposal` |
| 식당/크롤 (3) | `Restaurant` ((source, sourceId) unique + canonicalId), `VisitorReview`, `ReviewSummary` |
| 분석 v4 (2) | `MenuMention`, `ReviewTag` |
| 메뉴 그룹핑 (1) | `MenuCanonical` |
| 전역 머지 + 통계 (2) | `GlobalMenuCanonical`, `GlobalMenuCanonicalLink` |
| **정산 (6)** | `SettlementSession`, `SettlementParticipant`, `SettlementItem`(→Round), **`SettlementRound`** (신규), **`SettlementRoundAttendee`** (신규), `SettlementContact` |
| **정산 보조 (2)** | **`SettlementCategoryAdjustment`** (round × category — leftoverParticipantId + roundUnit nullable, 신규), **`SettlementDraft`** ((userId, placeIdKey) unique — '' sentinel for null placeId, 신규) |

이전 컴파일 시점의 정산 4 테이블 → 8 테이블. items/attendees 가 session 에서 round 로 이동했고, 다듬기·draft·할인이 분리 테이블로. `LlmProviderConfig.purpose` 는 변동 없음.

자세한 모델·인덱스: [friendly](friendly.md), [canonical](canonical.md), [settlement](settlement.md).

### 분석 LLM 파이프라인 (3단계, 변동 없음)

```
크롤 → 1) 리뷰 단위 분석 (summary v4) → 2) 식당별 메뉴 그룹핑 → 3) 전역 머지 + 카테고리 path → 통계 트리
```

각 단계는 `*_VERSION` 상수(`ANALYSIS_VERSION`, `MENU_GROUPING_VERSION`, `GLOBAL_MERGE_VERSION`, **`EXTRACTION_VERSION`** — 영수증 추출 프롬프트/스키마 바뀔 때 올린다)를 들고 있어 자동 stale 식별 가능.

## Key Decisions [coverage: high — 16 sources]

CLAUDE.md / TECH_STACK.md / 도메인 토픽에 명시된 핵심 결정.

| 결정 | 이유 |
|---|---|
| **N차(차수) 정산 모델 — round 레벨 attendance + exclude override (신규)** | 마스터 참여자는 session 레벨, round 별 출석 + 카테고리 exclude override 만 round 레벨. override 가 null 이면 마스터 default 상속(merge), 명시값이면 round override. 한 자리에서 1차/2차/3차 다른 식당·다른 출석자 케이스가 흔해서 1차 단일 모델로는 표현 부족. 차수당 attendees 20→100, items 100→200 으로 상향 |
| **서버 draft 자동저장 + `fromDraftId` 트랜잭션 정리 (신규)** | wizard 진행 중 5s debounce 로 PUT `/settlement-drafts` → `SettlementDraft` upsert. 본 저장 시 `POST /settlements { fromDraftId }` 가 같은 트랜잭션에서 draft 삭제 — 저장 성공 직후 draft 가 한 박자 늦게 남는 경합 회피. 저장소 3 레이어: 웹 sessionStorage(탭 scope) / 앱 AsyncStorage(앱 재시작) / 서버 DB(다기기 canonical) |
| **storage 어댑터 외부 주입 (`setSettlementDraftStorage`)** | shared 패키지의 `settlementDraftStore` 는 storage 의존을 가지지 않고, 웹/앱 각각이 부팅 직후 어댑터를 주입. shared 가 react-native AsyncStorage 를 직접 import 하면 웹 번들에 RN 코드가 섞이는 문제 회피 |
| **분담 다듬기 (refinement) — leftover + 100/1000원 round (신규)** | 차수×카테고리별 `SettlementCategoryAdjustment` 행: `leftoverParticipantId` + `roundUnit (null|100|1000)`. 계산기는 풀을 단위로 round, 활성 인원으로 안 나눠지면 silent fallback (raw + leftover 가산). 깨지지 않게 보수적 — UI 가 활성 조건을 보여줘서 도달 안 하게 |
| **차수 할인 — 단일 카테고리 / 풀 음수 방어 (신규)** | round 당 옵션 단일 카테고리 할인. zod refine 으로 `pool >= discountAmount` — 풀이 음수 되는 입력 컷. 다중 카테고리 할인은 모델 복잡도가 가치보다 큼 |
| **멀티 영수증 분할 — 한 사진 N 슬라이스 N 콜 (신규)** | `ExtractReceiptSplit { count: 2..5, index: 1..count }`. 같은 imageToken 재사용 + sharp crop 으로 슬라이스 → 각각 vision LLM 호출 (N 회). 큰 영수증을 잘라 추출률 올리는 패턴 — N 콜이라 사용자에게 비용 인지 UX 노출 |
| **앱(iOS/Android) 정산 풀구현 (신규)** | 이전 "정산은 mobile 미구현" 정책 종료. wizard / history / contacts / share / edit / breakdown 모두 RN. 네이티브 bottom sheet 가 웹 dialog 자리에 |
| **Universal Links(iOS) / App Links(Android) — env 기반 .well-known (신규)** | friendly 의 `well-known` 모듈이 정적 파일 대신 라우트로 동적 응답 — env 변경만으로 즉시 반영, 재배포·dist 복사 불필요. env 비면 의도적 404 (잘못된 빈 JSON 으로 검증 실패하는 사고 회피). 앱 `app.config.ts` 가 `associatedDomains` + `intentFilters(autoVerify)` 로 `/share/settlements/*` 가로채기 선언. 미설치 단말은 같은 URL 로 웹 SPA(SharedSettlementPage) fallback — 한 URL 두 진입점 |
| **CORS RFC1918 dev 자동 허용 + Expo Web LAN IP 자동 매칭 (신규)** | 한 쌍의 패턴. friendly 의 `apps/friendly/src/plugins/cors.ts` 가 dev 한정으로 localhost/127.0.0.1/10.x/192.168.x/172.16-31.x origin 자동 통과. 앱 Expo Web 도 `window.location.host` LAN IP 감지로 friendly base URL 을 같은 LAN IP 로 자동 매칭. env 안 만지고 폰 단말 LAN 접근 가능 — dev 환경 마찰 제거 |
| **AI key 모델 preview before save (신규)** | `GET /admin/ai/providers/:id/:purpose/models/preview` — 키 검증 + provider 의 authoritative 모델 list 받아본 뒤 `LlmProviderConfig` row 저장. 잘못된 키 / 존재 안 하는 모델 저장하는 사고 컷 |
| **`PUT /settlements/:id` 풀 리플레이스 — items 도 변경 가능 (신규)** | 이전 PATCH `/:id/participants` 자리 대체. 한 트랜잭션에서 rounds / participants / items 전체 교체. 이전 "items 불변" 정책 폐기 — 저장 후 메뉴 추가/금액 수정도 가능 |
| **정산 prefs 영속 — exclude default 장기 vs draft 세션** | 웹 `settlementPrefsStore`(localStorage) / 앱 `settlementPrefsStore`(AsyncStorage) 가 새 참여자 행의 exclude default 토글을 보존. wizard draft 와는 **분리된** 장기 default — draft 는 진행 중 한 정산, prefs 는 사용자 long-term 선호 |
| **tabs-layout web/native split — `_layout.tsx` 는 wrapper 만** | `apps/mobile/app/(tabs)/_layout.tsx` 는 한 줄짜리 re-export. 실제 구현은 `~/components/tabs-layout` 으로 분리해 Metro 가 web 빌드에서 형제 `.web.tsx` 를 자동 채택. native-only RN 라이브러리가 RN-Web 번들에 들어가지 않게 |
| **Tailwind v4 `@custom-variant dark` 명시 바인딩** | `apps/web` 가 Tailwind v4 의 `@custom-variant dark` 를 `.dark` 클래스 토글에 명시 바인딩 — v4 자동 detect 가 어긋난 케이스 fix |
| **이전 라운드 결정들 (변동 없음, 요약)** | AI provider purpose 분리 / 공유 토큰 패턴(`SettlementSession.shareToken @unique`) / DB 경로 통일 / 4단계 stepper / 단골 참여자 자동 적립 / 용어 규약 / 출처 3종 + canonical / C안 자동 DC 머지 / auto-discover / MAX_CONCURRENT_PER_ACTOR=5 / 부팅 stale 정리 / SSE liveness / pnpm+Turbo / Zod SSOT / SQLite+Prisma / Vite 6 + React 19 / TanStack Query + Zustand / 로직만 공유 UI 는 플랫폼별 / 분석 수동 트리거 / `*_VERSION` stale / Docker / Redis 없음 |

`tsconfig.base.json`은 `strict + noUncheckedIndexedAccess + verbatimModuleSyntax + isolatedModules` — 엄격 모드 풀스택.

### 모바일 UX 규율 (프로젝트 차원) [coverage: high — 1 doc + 8 source files]

전체 명세는 [docs/mobile-public-restaurant-ux.md](../../docs/mobile-public-restaurant-ux.md). 이전 라운드에서 정착, 이번 라운드에 sticky 정산표 z-30 헤더 클리어 패턴이 추가.

1. **모바일 = body 스크롤** — `fixed inset-0` 풀스크린 금지
2. **sticky element 는 wrapping 금지** — 분기는 sticky element 자체 className 에서
3. **sticky 묶음은 `overflow:auto` 컨테이너 밖에** — overflow-y:auto 내부 sticky 는 자체 containing block
4. **`100vh` 대신 `100dvh`** — iOS Safari dynamic viewport
5. **탭 상태는 URL 의 일부, push 로 전환** — `replace` 금지
6. **한글 IME 대응** — `compositionStart/End` + 로컬 `draft` state
7. **scroll-to-top 환경 자동 분기**
8. **iOS Safari focus zoom 회피** — font-size ≥ 16px
9. **sticky breakdown — z-30 페이지 헤더 (신규)** — 결과/공유 페이지의 sticky 정산표가 sticky 페이지 헤더 아래로 들어가지 않도록 헤더에 z-30 명시. sticky끼리 겹치는 케이스의 일반 규율

부가 — dev 서버에서 모바일 단말 테스트하려면 `apps/web/vite.config.ts` 의 `server.host: true`. 앱 Expo Web 도 LAN IP 자동 매칭이 들어가서 dev 환경에서 폰-LAN 접근 부담이 더 적어졌다.

## Gotchas [coverage: medium — 12 sources]

- **SQLite 다중 NULL unique — `placeIdKey='' sentinel` (신규)** — `SettlementDraft.(userId, placeIdKey)` unique 제약은 SQLite 가 다중 NULL 을 unique 위반으로 안 보는 버그를 우회하려고 placeId 가 null 일 때 빈 문자열 '' 로 변환해 저장. 직접 SQL 로 row 만들 땐 `placeIdToKey` helper 통과 필수
- **storage 어댑터 주입 ordering (신규)** — `settlementDraftStore` 의 첫 read/write 전에 `setSettlementDraftStorage(...)` 가 반드시 호출되어 있어야 한다. 웹은 entry, 앱은 `apps/mobile/src/lib/api-setup.ts` 에서 부팅 직후. 안 주입하면 in-memory fallback 으로 떨어져 페이지 전환 시 draft 가 사라진다
- **.well-known 404 vs 500 — env 비면 404 (신규)** — `APP_TEAM_ID` / `ANDROID_SHA256_FINGERPRINTS` 비면 의도적 404 응답. 잘못된 빈 JSON 으로 검증 통과시키면 OS 가 "검증됐는데 매칭 실패" 상태로 빠져 디버깅 더 어렵다. iOS/Android 가 검증 실패 = 자동 폴백(브라우저 오픈) 이라 404 안전. 자세한 셋업은 `apps/mobile/DEEP_LINK_SETUP.md`
- **멀티 영수증 분할 = N 개의 별도 LLM 호출 (신규)** — 한 imageToken 으로 보이지만 sharp crop 후 vision LLM 을 N 회 부른다. 비용 계산 = N × 단일 호출. UI 가 분할 수를 보여주는 이유 — 사용자에게 비용 인지를 강제
- **iOS 뒤로가기 버튼 라벨에 디렉터리명 노출 (신규)** — `app/(tabs)/` 같은 expo-router segment 명이 명시 `headerBackTitle` 없을 때 iOS 백 라벨로 새어 나간다. `share/settlements/[token].tsx` 처럼 깊은 진입점에선 `Stack.Screen options` 에 `title` + 필요 시 `headerBackTitle` 명시 필수
- **`?? null` 클리어 패턴 (회귀 인용)** — `setRoundReceipt(roundId, token ?? null)` 처럼 `undefined` 전달은 store 의 partial update 로 해석돼 옛 값을 유지한다. 명시 `?? null` 로 클리어 의도를 분명히 — 영수증 제거가 안 먹는 회귀가 두 번 발생한 패턴
- **'수정됨' 배지 기준은 `editedAt`** — `updatedAt` 이 아닌 이유: updatedAt 은 shareToken 발급/회수에도 갱신됨. participants/excludes 수정에만 박히는 별도 컬럼
- **AI provider `purpose='image'` 는 env fallback 없음** — `purpose='chat'` 만 env backed 가상 row 합성. image 는 반드시 DB row
- **단골 normalizedKey 정규화는 service 전담** — application layer 의 `ContactService.normalize` 만 통해서 upsert
- **stepper 자유 점프는 "완료된 단계만"** — 앞으로 가려면 현재 단계 valid 필요
- **"모바일" 단어 — 한국어 본문에서 단독은 웹의 반응형만** — 앱은 항상 "앱"
- **출처별 행 분리 — `(source, sourceId)` unique** — 임계 못 넘으면 silent skip → 머지 큐
- **`placeId` 는 nullable** — DC/캐치테이블 식당에서 정산 시작은 현재 불가
- **패키지 간 순환 의존 금지** — `shared → api-contract`는 OK, 반대는 금지
- **공유 스키마는 반드시 `@repo/api-contract` zod 로**
- **vworld 키 미등록 시 placeholder fallback**
- **공개 list `q` 는 LIKE 기반 — 1k+ 면 FTS5 재고**
- **공개 list bbox 는 메모리 필터**
- **ncaptcha — 네이버 PC 지도 직접 fetch 차단** — Playwright 가로채기 + stealth + jitter
- **OpenLayers `ol/ol.css` import 필수**
- **첫 관리자 만들기** — `pnpm --filter friendly promote-admin <email>`
- **분석 단계 실행 순서 강제** — 리뷰 분석 → 식당별 그룹핑 → 전역 머지
- **모바일 sticky 함정** — 깨질 때 99%는 (a) wrapping div, (b) overflow:auto 안, (c) z-index 가 페이지 헤더보다 낮음
- **부팅 직후 stale 요약 행 — `errorCode='server_restart'` failed 자동 처리**
- **자동 발견 잡 actor 당 1 개 제한**
- **HANDOFF 문서는 git 에 넣지 말 것**
- **버전 매트릭스** — 웹은 React 19, 앱은 React 18 — `@repo/shared`가 React 18+ peer
- **앱 운영 빌드는 `.env.production` 자동 로드**
- **앱 Expo Web 은 SPA 모드 고정** — `web.output: 'single'`
- **SQLite 락 + Prisma migrate dev** — friendly dev 떠 있으면 `database is locked` 더 자주

## Sources [coverage: high — 31 sources]

- [README.md](../../README.md)
- [CLAUDE.md](../../CLAUDE.md) — "용어" 섹션 포함
- [TECH_STACK.md](../../TECH_STACK.md)
- [package.json](../../package.json)
- [pnpm-workspace.yaml](../../pnpm-workspace.yaml)
- [turbo.json](../../turbo.json)
- [tsconfig.base.json](../../tsconfig.base.json)
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — `SettlementRound`/`SettlementRoundAttendee`/`SettlementCategoryAdjustment`/`SettlementDraft` 추가
- [apps/friendly/prisma/migrations/20260525100000_add_settlement_rounds/](../../apps/friendly/prisma/migrations/) — 차수 모델
- [apps/friendly/prisma/migrations/20260525110000_add_settlement_round_discount/](../../apps/friendly/prisma/migrations/) — 차수 할인
- [apps/friendly/prisma/migrations/20260525220309_add_settlement_round_category_adjustments/](../../apps/friendly/prisma/migrations/) — 분담 다듬기
- [apps/friendly/prisma/migrations/20260525235559_add_settlement_drafts/](../../apps/friendly/prisma/migrations/) — 서버 draft
- [apps/friendly/.env.example](../../apps/friendly/.env.example) — APP_TEAM_ID 등 신규 env
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) — APP_TEAM_ID / APP_BUNDLE_ID / ANDROID_APP_PACKAGE / ANDROID_SHA256_FINGERPRINTS (신규)
- [apps/friendly/src/plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts) — RFC1918 dev 자동 허용 (수정)
- [apps/friendly/src/modules/well-known/well-known.route.ts](../../apps/friendly/src/modules/well-known/well-known.route.ts) — AASA + assetlinks.json 동적 응답 (신규)
- [apps/friendly/src/modules/settlement/](../../apps/friendly/src/modules/settlement/) — N차 세션 + draft + 풀 리플레이스 PUT
- [apps/friendly/src/modules/settlement/settlement-draft.service.ts](../../apps/friendly/src/modules/settlement/settlement-draft.service.ts) — `(userId, placeIdKey)` upsert (신규)
- [apps/friendly/src/modules/settlement-extraction/](../../apps/friendly/src/modules/settlement-extraction/) — 멀티 영수증 분할 sharp crop
- [apps/friendly/src/modules/ai/](../../apps/friendly/src/modules/ai/) — 모델 preview 라우트 신규
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — Settlement(PUT) / SettlementDraft / WellKnown / Ai.modelsPreview 등 추가
- [packages/api-contract/src/schemas/settlement.ts](../../packages/api-contract/src/schemas/settlement.ts) — round / attendee / categoryAdjustment / discount
- [packages/api-contract/src/schemas/settlement-extraction.ts](../../packages/api-contract/src/schemas/settlement-extraction.ts) — ExtractReceiptSplit
- [packages/api-contract/src/schemas/settlement-draft.ts](../../packages/api-contract/src/schemas/settlement-draft.ts) — 서버 draft (payload unknown, 200KB cap, 신규)
- [packages/api-contract/src/settlement.calculator.ts](../../packages/api-contract/src/settlement.calculator.ts) — `calculateMultiRoundShares` + 100/1000 round + leftover
- [packages/shared/src/stores/settlementDraftStore.ts](../../packages/shared/src/stores/settlementDraftStore.ts) — `setSettlementDraftStorage` 어댑터 주입
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx) — 정산 라우트
- [apps/web/src/routes/settlement/](../../apps/web/src/routes/settlement/) — Step2Rounds / RoundCategoryAdjuster / RoundDiscountEditor / RoundExceptionsEditor / MultiReceiptSplitDialog / SettlementBreakdownTable (신규)
- [apps/web/src/stores/settlementPrefsStore.ts](../../apps/web/src/stores/settlementPrefsStore.ts) — localStorage exclude default (신규)
- [apps/mobile/app.config.ts](../../apps/mobile/app.config.ts) — associatedDomains + intentFilters autoVerify (수정)
- [apps/mobile/DEEP_LINK_SETUP.md](../../apps/mobile/DEEP_LINK_SETUP.md) — Universal/App Link 운영 셋업 (신규)
- [apps/mobile/app/share/settlements/[token].tsx](../../apps/mobile/app/share/settlements/[token].tsx) — deep link 진입점 (신규)
- [apps/mobile/app/restaurant/[placeId]/settle/](../../apps/mobile/app/restaurant/[placeId]/settle/) — 앱 정산 wizard/result/edit (신규)
- [apps/mobile/app/settlement/](../../apps/mobile/app/settlement/) — 앱 history/contacts/new (신규)
- [apps/mobile/src/components/settlement/](../../apps/mobile/src/components/settlement/) — SettlementWizard / Step1~4 / *Sheet / *Editor (신규)
- [apps/mobile/src/lib/settlementPrefsStore.ts](../../apps/mobile/src/lib/settlementPrefsStore.ts) — AsyncStorage exclude default (신규)
- [apps/mobile/src/lib/api-setup.ts](../../apps/mobile/src/lib/api-setup.ts) — Expo Web LAN IP 자동 매칭 + storage 어댑터 주입
- [apps/mobile/app/(tabs)/_layout.tsx](../../apps/mobile/app/(tabs)/_layout.tsx) — web/native split wrapper
- [apps/mobile/docs/production-build.md](../../apps/mobile/docs/production-build.md) — 앱 운영 빌드 가이드
- [docs/menu-hierarchy.md](../../docs/menu-hierarchy.md)
- [docs/mobile-public-restaurant-ux.md](../../docs/mobile-public-restaurant-ux.md)
- [apps/web/vite.config.ts](../../apps/web/vite.config.ts) — `server.host: true`
- 토픽 — [settlement](settlement.md), [auto-discover](auto-discover.md), [friendly](friendly.md), [web](web.md), [api-contract](api-contract.md), [analytics](analytics.md), [menu-grouping](menu-grouping.md), [media](media.md), [ai](ai.md), [map](map.md), [crawl](crawl.md), [canonical](canonical.md), [shared](shared.md), [mobile](mobile.md)
