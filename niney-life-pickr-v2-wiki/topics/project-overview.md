---
topic: project-overview
last_compiled: 2026-05-25
sources_count: 24
status: active
aliases: [monorepo, life-pickr, niney, root, turbo, pnpm-workspace, settlement, 정산, settlement-domain, share-token, public-share-read, ai-purpose, vision-llm, receipt-extraction, contacts-page, settlement-stepper, edited-badge, admin-discover, admin-auto-discover, panel-side-toggle, batch-crawl, naver-search-results, panelPrefsStore, captcha-aware-capture, mobile-ux, body-scroll, sticky-containing-block, terminology, web-mobile-app, expo-web, diningcode, catchtable, canonical-restaurant, multi-source, auto-dc-merge, sse-heartbeat, stale-summary-cleanup, crawl-job-log, summary-queued-cancelled, summary-resume, app-level-singleton-plugin, mobile-native-tabs, dev-client, webview-vworld, location-first-entry, public-reviews-pagination, naver-stealth, db-path-unified, mobile-production-build]
---

# project-overview — 모노레포 개요

**2026-05-25 변경 흡수 — 정산(settlement) 도메인 통째 신규 + AI purpose 분리 + 공유 토큰 비인증 read 패턴 도입.** 새 사용자 기능 "정산하기"가 한 줄 들어왔다 — 식당 상세에서 영수증을 찍으면 vision LLM 이 메뉴/금액/카테고리(4종) 를 뽑고, 4단계 stepper(참여자 / 입력 방식 / 항목 편집 / 결과) 로 분배까지 마치면 `SettlementSession` 으로 저장. 저장 후엔 owner 가 멱등한 `shareToken` 을 발급해 `/share/settlements/:token` 으로 **비인증 read-only** 공유 — 프로젝트 첫 공유 토큰 패턴(이전 `sse-token-auth` 와는 결이 다름: SSE 인증 보강이 아닌 HTTP 비인증 read). 백엔드는 3 모듈 신규 — `settlement-extraction` (영수증 업로드/추출), `settlement` (세션 CRUD + 분배 + share), `contact` (단골 자동 적립). 4 마이그레이션으로 `SettlementSession`/`SettlementItem`/`SettlementParticipant`/`SettlementContact` 테이블 + `LlmProviderConfig.purpose` 컬럼이 박혔다 — 같은 provider 를 chat(텍스트 추론) / image(vision) 용도로 분리 등록한다. DB 경로도 이참에 `apps/friendly/data/dev.db` 한 곳으로 통일(이전 `.env` 가 `./data/...` 로 friendly CWD 기준이라 분산되었던 걸 `../data/...` 로 정리). 저장 후 참여자/옵션은 무제한 수정 가능하되 items 는 불변 — 수정되면 `editedAt` 이 박히고 화면에 "수정됨" 배지가 뜬다. ContactsPage(`/me/contacts`) 는 자동 적립된 단골을 직접 관리하는 동선이고, 정산 입력에선 자동완성 + 다중 선택 모달로 끌어쓴다. 부수로 네이버 크롤러에 stealth + 더보기 jitter (429 우회), 카드/라이트박스/메뉴 가격 포맷/지도 마커 누락 등 자잘한 UI 버그 묶음 + 앱 운영 빌드 가이드(`apps/mobile/docs/production-build.md`) 추가.

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
- **맛집 분석** — 어드민이 다양한 출처에서 식당을 크롤링하고 리뷰를 LLM으로 분석해 메뉴 통계 트리까지 빌드한다 ([crawl](crawl.md), [ai](ai.md), [menu-grouping](menu-grouping.md), [analytics](analytics.md)). 출처는 3종 — **네이버 플레이스 / 다이닝코드 / 캐치테이블**. 어드민의 진입 경로는 네 갈래 — 단건 placeId 입력 (`/admin/restaurants`), 키워드 검색→다중 선택 일괄 등록 (`/admin/discover`), 다이닝코드 일괄 저장 (`/admin/diningcode`), **AI 자동 발견** (`/admin/auto-discover` — 영역명 한 줄 + 카테고리 + 목표 수 만으로 키워드 8개 자동 생성 → 다중 검색·dedupe → 그룹 5병렬 직렬 크롤·등록. 자세한 건 [auto-discover](auto-discover.md)). 결과물은 공개 페이지에서 비로그인 사용자가 그대로 본다.
- **정산하기 (신규)** — 식당 상세에서 진입하는 사용자 기능. 영수증 사진을 vision LLM 으로 4 카테고리(ALCOHOL/NON_ALCOHOL/SIDE/UNCATEGORIZED) 메뉴·금액 추출 → 4단계 stepper(참여자/입력 방식/항목 편집/결과 분배) → 저장 → 공유 토큰(`/share/settlements/:token`) 비인증 read. 단골 참여자는 자동 적립(`SettlementContact`) 되어 다음 정산에서 자동완성으로 끌어쓴다. 자세한 건 [settlement](settlement.md).

세 개의 클라이언트가 동일 백엔드를 공유한다:
- **friendly** — Fastify + Prisma + SQLite 백엔드 ([friendly](friendly.md))
- **웹** (`apps/web`) — Vite + React 19 SPA. 공개 영역(`/`, `/restaurants`, `/restaurants/:placeId`, `/share/settlements/:token`) + 인증 사용자 영역(`/me/*`, `/restaurants/:placeId/settle/*`) + 어드민 콘솔(`/admin/*`) 세 묶음이 한 SPA 안에 공존
- **앱** (`apps/mobile`) — Expo SDK 52 + React Native 0.76. 맛집 탭은 있으나 어드민 UI 없음 — 의도. 정산 UI 는 현재 웹 전용 (앱 미이식)

공개 영역은 비로그인 호출 가능 — 데이터 자체는 어드민이 본 것과 차이가 없고 (운영 메타만 제거), 사용자 정책상 그대로 노출한다. 공유 정산 토큰 경로(`/share/settlements/:token`) 도 비인증으로 열려 있으나 추측 불가능한 32바이트 base64url 토큰 보호.

## Architecture [coverage: high — 10 sources]

pnpm workspaces + Turborepo 기반 모노레포.

```
niney-life-pickr-v2/
├── apps/
│   ├── friendly/          Fastify 백엔드 → friendly 토픽
│   │   ├── data/
│   │   │   ├── dev.db           SQLite (경로 통일됨 — DATABASE_URL=file:../data/dev.db)
│   │   │   ├── receipts/        영수증 이미지 디스크 저장 (신규)
│   │   │   └── thumbs/          네이버 CDN 썸네일 캐시
│   │   └── src/modules/
│   │       ├── settlement-extraction/  영수증 업로드 + vision LLM 추출 (신규)
│   │       ├── settlement/             정산 세션 CRUD + 분배 + 공유 토큰 (신규)
│   │       └── contact/                단골 참여자 자동 적립 + /me/contacts (신규)
│   ├── web/               Vite + React SPA (공개 + 어드민 + /me) → web 토픽
│   │   └── src/routes/
│   │       ├── settlement/      Step1~Step4 + History/Result/Shared/Contacts (신규)
│   │       └── admin/
│   └── mobile/            Expo + RN 앱 → mobile 토픽
│       └── docs/production-build.md  앱 운영 빌드 가이드 (신규)
├── packages/
│   ├── api-contract/      Zod SSOT → api-contract 토픽
│   │   └── src/schemas/
│   │       ├── settlement.ts            세션/항목/참여자 스키마 (신규)
│   │       ├── settlement-extraction.ts vision 추출 입출력 (신규)
│   │       └── settlement-contact.ts    단골 CRUD (신규)
│   ├── shared/            FE 공통 (API/hooks/store/UI) → shared 토픽
│   │   └── src/
│   │       ├── stores/settlementDraftStore.ts  Step1~4 draft (Zustand, persist)
│   │       └── api/settlement*.api.ts          + useSettlement* 훅
│   ├── utils/             순수 유틸 → utils 토픽
│   └── config/            tsconfig + ESLint 공유 → config 토픽
├── pnpm-workspace.yaml    apps/* + packages/*
├── turbo.json             dev / build / typecheck / lint / test 파이프라인
├── tsconfig.base.json     루트 TS 베이스 (ES2022, strict, noUncheckedIndexedAccess)
├── CLAUDE.md              에이전트 가이드 (이 위키와 함께 본다) — "용어" 섹션 포함
└── TECH_STACK.md          전체 기술 스택 명세
```

### 출처 3종 + canonical 그룹핑 레이어

크롤 출처가 한 개에서 셋으로 늘어나면서 "출처 가로지르는 같은 가게" 문제가 생겼다. 해결 구조:

```
Naver Place ──┐
Diningcode  ──┼──→ Restaurant (source, sourceId)  ──→  CanonicalRestaurant (N:1)
Catchtable  ──┘     ^                                    ^
                    │                                    │
                    각 출처 행 하나씩                     같은 가게 묶음 (어드민 수락 시에만)
```

- `Restaurant` 는 `(source, sourceId)` 로 unique — 네이버는 `source='naver'` 이고 `sourceId=placeId`, 다이닝코드/캐치테이블은 자체 id 사용 + `placeId=null`
- 같은 가게의 다른 출처 행들은 `canonicalId` 를 공유 — 마이그레이션 직후엔 모든 Restaurant 가 자기 전용 Canonical 을 가지고(1:1), merge 수락 시 점진적으로 N:1 로 압축됨
- **자동 DC 머지 후크 (C안 정착)** — Naver 크롤 done 직후 `tryAutoMatchDiningcode` 가 좌표 기반 DC 후보(200m 반경)를 점수화해 임계 통과(nameScore ≥ AUTO_DC_NAME_THRESHOLD, distance ≤ AUTO_DC_DISTANCE_THRESHOLD_M, 차순위와 점수 격차 ≥ AUTO_DC_TIE_GAP) 시 **자동으로 DC 저장 + canonical 머지**까지 수행. 이전 "수동 확정만" 정책에서 한 단계 진화 — 잘못된 머지의 복구 비용이 큰 케이스만 사람 컨펌으로 남기는 절충
- **검토 큐는 임계 못 넘는 케이스 fallback** — score ≥ 0.45 이되 자동 임계까지는 못 닿는 후보는 `CanonicalMergeProposal` 큐로. 머지 큐 자동 적재 트리거 — (a) 새 출처 등록 후크 자동, (b) 어드민 수동 "병합 후보 찾기" 버튼

자세한 모델·매칭 로직: [friendly](friendly.md), [canonical](canonical.md).

### 백엔드 도메인 맵 (`apps/friendly/src/modules/`)

| 도메인 | 역할 | 위키 |
|---|---|---|
| `auth` | 회원가입 / 로그인 / JWT | — |
| `user` | 프로필 / 관리자 role 토글 | — |
| `picks` | 선택지 등록 + 무작위 픽 | — |
| `crawl` | 네이버 플레이스 / 다이닝코드 / 캐치테이블 크롤 (Playwright + 어댑터별 분기, Naver done 후 자동 DC 매칭+머지 후크 + naver stealth/jitter 신규) | [crawl](crawl.md) |
| `auto-discover` | AI 키워드 8개 → 다중 검색 → 그룹 5병렬 자동 발견 잡 | [auto-discover](auto-discover.md) |
| `ai` | LLM 라우팅 (요약/분석/그룹핑/머지). **`purpose` 컬럼 도입** — 같은 provider 를 `chat` / `image` 용도로 분리 등록. 영수증 추출은 `purpose='image'` (vision) | [ai](ai.md) |
| **`settlement-extraction`** | 영수증 업로드 + vision LLM 추출 (4 카테고리 메뉴·금액). `data/receipts/<token>.jpg` 디스크 저장 (신규) | [settlement](settlement.md) |
| **`settlement`** | 정산 세션 CRUD + 분배 계산 + 공유 토큰 생성/회수. owner 본인 + 토큰 알면 read-only (신규) | [settlement](settlement.md) |
| **`contact`** | 단골 참여자 자동 적립 + `/me/contacts` 관리. 정산 저장 시 모든 participant 가 `(userId, normalizedKey)` upsert (신규) | [settlement](settlement.md) |
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

라우트 prefix 로 가른다 — 백엔드의 모든 어드민 엔드포인트는 `/api/v1/admin/*` 아래에 모이고, 사용자 본인 자원은 `/api/v1/me/*` 또는 `/api/v1/settlements/*` (인증 필요), 그 외는 공개. `app.requireAdmin` 가드는 `admin/` prefix 라우트에만, `app.requireAuth` 는 사용자 자원 라우트에 붙는다. FE 도 같은 정책:

| 영역 | 레이아웃 | 라우트 | 가드 |
|---|---|---|---|
| 공개 | `PublicLayout` (TopBar + 모바일 사이드바) | `/`, `/restaurants`, `/restaurants/:placeId`, `/share/settlements/:token` | 없음 |
| 인증 사용자 | `PublicLayout` 또는 단독 | `/me/settlements`, `/me/contacts`, `/restaurants/:placeId/settle/new`, `/restaurants/:placeId/settle/:id` | `RequireUser` (token, role 무관) |
| 인증 진입 | (단독) | `/login` | 없음 |
| 어드민 | `AdminLayout` (좌측 사이드바 — 홈 / 맛집 발견 / 맛집 자동 발견 / 맛집 / 다이닝코드 / AI 분석 관리 / 네이버·다이닝코드·캐치테이블 크롤링 테스트 / AI 테스트 / 설정) | `/admin/*` | `RequireAdmin` (token + role=ADMIN) |

공개 영역은 Pretendard 변수 폰트 + 텍스트 사이즈 시프트가 적용되고(`font-pretendard` + `--text-*` CSS 변수), 어드민은 시스템 폰트 fallback 그대로 둔다. 공유 정산 토큰 경로(`/share/settlements/:token`) 는 비인증이지만 `PublicLayout` 의 TopBar 도 띄우지 않아 받는 사람이 단순히 결과만 보게 한다.

### 정산 도메인 흐름 (신규)

```
식당 상세 → "정산하기" 버튼
   ▼
/restaurants/:placeId/settle/new (RequireUser)
   ▼ Step1 — 참여자 입력 (단골 자동완성 + 다중 선택 모달)
   ▼ Step2 — 입력 방식 (영수증 사진 / 직접 입력)
   ▼   영수증인 경우: POST /settlement-extraction/upload (multipart, jpg)
   ▼               → POST /settlement-extraction/extract (vision LLM, purpose='image')
   ▼               → items[] + warning(합계 불일치 시) + receiptImageToken
   ▼ Step3 — 항목 편집 (메뉴 추가/금액 수정/카테고리 변경)
   ▼ Step4 — 결과 분배 (excludeAlcohol/NonAlcohol/Side 토글 → server 가 shareAmount 재계산)
   ▼ POST /settlements → SettlementSession 저장 + 모든 participant 가 SettlementContact upsert
   ▼
/restaurants/:placeId/settle/:id (결과 단건 보기)
   ▼ owner 가 PUT /settlements/:id/participants 로 무제한 수정 (items 는 불변)
   ▼ POST /settlements/:id/share → shareToken 멱등 발급
   ▼
/share/settlements/:token (비인증 read-only — receiptPreviewUrl/userId 제거된 응답)
```

stepper UI 패턴 — 헤더에 sticky, 현재 단계 강조, **완료된 단계만 자유 점프** 가능 (앞으로 가려면 현재 단계 valid 필요). 저장 후 참여자/옵션 수정되면 `editedAt` 박힘 → 화면에 "수정됨" 배지. 자세한 동선·검증: [settlement](settlement.md).

### 어드민 발견 페이지 흐름 (`/admin/discover` — 네이버 출처)

키워드 → 다중 선택 → 일괄 크롤 한 번에 처리하는 진입점이다. 흐름:

```
검색어 입력
   ▼
naver-search.playwright.adapter (Playwright 페이지로 응답 가로채기 — 직접 fetch 는 ncaptcha 차단)
   ▼
검색 결과 마커(빨강 primary) + 등록된 가게 마커(회색 muted) 통합 — 같은 placeId 면 등록 우선
   ▼
다중 선택 (등록된 placeId 는 체크박스 비활성)
   ▼
직렬 await 루프로 BE 크롤 시작 (Promise.allSettled 병렬은 큐에 막혀 1개만 통과)
   ▼
시작 거부된 placeId 는 체크 상태 보존 → 재시도 편의
   ▼
선택 항목은 우측 상세 컬럼에서 PublicRestaurantDetail 재사용으로 미리보기
```

URL state 는 `?q=&bbox=&tab=&placeId=` — useSearchParams 직접 read/write. 검색당 ~1.1초.

발견 리스트 카드는 노출 행마다 같은 canonical 의 **다이닝코드 형제 행을 합산해** 표시한다 — `totalReviews / summaryPending·Running·Done·Failed / analyzedCount / positive·negative·neutralCount` 두 출처 합산, 평균 점수는 가중평균. 응답 행 키는 Naver placeId 그대로라 라우팅/캐시/UI 스키마 변경 없음. SSE snapshot 이 합산 카운트를 덮어쓰지 않도록 후속 패치도 포함. 또한 행 호버 자동 지도 이동은 **"지도" 버튼 클릭 트리거로 변경** — 모바일 터치에서 호버가 의도와 다르게 발화하던 문제 해결.

상세 패널은 **Naver + 다이닝코드 융합 detail** 을 보여준다 — 백엔드 `restaurant.merge.ts` (순수 함수 모음) 가 canonical 그룹의 Naver 행 + DC 형제들을 단일 detail 로 머지해 응답하면, FE 는 `PublicRestaurantDetail` 컴포넌트 그대로 렌더. 필드별 머지 규칙: rating/reviewCount/phone/address 는 Naver 우선·없으면 DC, businessHours 는 DC summary 우선, menus 는 Naver 비어 있을 때만 DC, photos/reviews 는 두 출처 합치고 dedup, descTags/facilities/scoreDetail/wordcloud 는 DC 전용이라 항상 노출. canonical 정책 진화의 다음 단계 ([canonical](canonical.md)).

### 어드민 자동 발견 페이지 (`/admin/auto-discover` — AI 키워드 → 다중 검색 → 그룹 5병렬)

영역명 한 줄("강남역") + 카테고리 칩 + 목표 수만 입력하면 한 번의 잡으로 끝나는 페이지. 흐름:

```
입력: { area, categories[], targetCount } → POST /admin/auto-discover/jobs (즉시 jobId 반환)
   ▼ (백그라운드 SSE 스트림)
Phase 1: generating_keywords — AI(ollama-cloud, JSON schema 강제) 가 정확히 8개 생성 (부족 시 fallback 보충)
   ▼
Phase 2: searching — 키워드 8개 Promise.all 병렬 네이버 지도 검색 + placeId dedupe + 이미 등록은 skipped
   ▼
Phase 3: crawling — 남은 후보를 5개 단위 그룹으로, 그룹 직렬 + 그룹 내 5병렬 Naver Place 크롤·등록
   ▼ (newlyRegistered >= targetCount 면 조기 종료)
markFinished('done'|'cancelled'|'failed')
```

actor 당 잡은 1 개 제한. 자세한 건 [auto-discover](auto-discover.md).

### 다이닝코드 어드민 페이지 (`/admin/diningcode` — 정식)

다이닝코드 출처를 위한 **정식 어드민 페이지** — 기존 `/admin/diningcode-test` (검증용) 와 별도로 분리. 둘 다 유지. 일괄 저장은 **SSE 스트림**으로 진행률 + 실패 사유를 흘려보낸다 (menu-grouping 잡 스트리밍 차용). 자세한 라우트·정책: [crawl](crawl.md).

## Talks To [coverage: high — 7 sources]

내부 패키지 의존 그래프 (단방향 — 순환 금지):

```
api-contract  ← 의존 ←  friendly, shared
shared        ← 의존 ←  web, mobile
utils         ← 의존 ←  friendly, web, mobile, shared (순수 함수만)
config        ← 의존 ←  모든 워크스페이스 (tsconfig/eslint)
```

런타임 통신:
- 웹 → friendly (`VITE_API_URL`, dev에선 Vite proxy `/api` → `:3000`; `server.host: true` 로 LAN/모바일 단말에서도 dev 서버 접근)
- 앱 → friendly (`EXPO_PUBLIC_API_URL`, 빌드 시점 주입. **운영 빌드는 `.env.production` 자동 로드 — `apps/mobile/docs/production-build.md` 참조**)
- friendly → SQLite 파일 (`apps/friendly/data/dev.db` — **경로 통일**, `.env` `DATABASE_URL=file:../data/dev.db`)
- friendly → 디스크 (`apps/friendly/data/receipts/<token>.jpg` — 영수증 이미지, settlement-extraction 모듈이 단독 관리)
- friendly → 네이버 플레이스 / 다이닝코드 / 캐치테이블 (Playwright + 출처별 어댑터, naver 는 stealth + 더보기 jitter 로 429 우회)
- friendly → 네이버 CDN (`/api/v1/media/thumbnail` 프록시 — 호스트 allowlist) → [media](media.md)
- friendly → LLM provider — **`purpose` 분리**: `chat` (요약/분석/그룹핑/머지), `image` (vision — 영수증 추출 전용). 같은 provider 행이 purpose 별로 따로 등록됨 — [ai](ai.md)
- 웹 → vworld WMTS (`https://api.vworld.kr/req/wmts/1.0.0/{KEY}/{LAYER}/{z}/{y}/{x}.png`) — OpenLayers 가 직접 타일 fetch. 백엔드 경유 안 함
- 웹 → jsDelivr CDN (Pretendard 변수 폰트 — 공개 페이지 한정)
- 공유 정산 토큰 read 는 비인증 — `GET /api/v1/share/settlements/:token`. 토큰 알면 누구나 read, 응답에서 `receiptPreviewUrl`/`userId` 제거

스키마 1개 변경으로 FE/BE 모두 컴파일 타임 불일치 감지 — 자세한 건 [api-contract 토픽](api-contract.md).

## API Surface [coverage: high — 5 sources]

루트 `package.json`이 노출하는 명령어 (turbo 위임):

| 명령 | 동작 |
|---|---|
| `pnpm dev` | 전체 dev (웹 + 앱 + friendly 동시) |
| `pnpm dev:api` | friendly만 (`http://localhost:3000`, docs `/docs`) |
| `pnpm dev:web` | 웹만 (`http://localhost:5173`, LAN host 노출) |
| `pnpm dev:mobile` | 앱 (Expo Dev Tools — turbo가 stdin을 패스스루하지 않아 `i`/`a` 인터랙티브 키는 안 먹음) |
| `pnpm dev:ios` / `pnpm dev:android` | 앱 iOS/Android 시뮬레이터 직행 (turbo 우회: `pnpm --filter mobile ios`/`android`) |
| `pnpm dev:mobile:local` / `:prod` | 앱 dev 서버 + API URL 변형 (local LAN / prod 분기) |
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
│   ├── ranking .................... 공개 랭킹 (긍정/부정 비율)
│   ├── public ..................... 공개 리스트 (좌표 + 썸네일 + AI 통계)
│   ├── public/:placeId ............ 공개 상세 (운영 메타 제거)
│   └── public/:placeId/insights ... 공개 인사이트
├── settlement-extraction/         정산 영수증 vision 추출 (인증, 신규)
│   ├── upload .................... POST multipart jpg → imageToken
│   ├── extract ................... POST { imageToken, placeId } → items[] (vision LLM)
│   └── preview/:token ............ GET 영수증 이미지 (owner 본인)
├── settlements/                   정산 세션 CRUD (인증, 신규)
│   ├── GET /, POST / ............. list / create
│   ├── /:id ...................... get / delete
│   ├── /:id/participants ......... PUT (items 불변, participants/excludes 수정 → editedAt)
│   └── /:id/share ................ POST 멱등 토큰 발급 / DELETE 회수
├── share/settlements/:token ...... GET 공개 read-only (비인증, 신규)
├── me/contacts ................... 단골 참여자 CRUD (인증, 신규)
├── health
└── admin/
    ├── crawl/* .................... 크롤 잡 + SSE (출처 3종 분기, Naver done 후 자동 DC 매칭 후크)
    ├── auto-discover/* ............ AI 키워드 → 다중 검색 → 그룹 5병렬 자동 발견 잡
    ├── ai/* ....................... LLM 호출 + provider 키 (purpose=chat/image 분리)
    ├── analytics/* ................ 그룹핑 잡 + 글로벌 머지 + 카테고리 트리
    ├── canonical/* ................ 머지 제안 큐 / 수락·거절
    ├── settings/map ............... 지도 SDK 키 (admin)
    └── restaurants/* .............. 어드민 식당 CRUD + 인사이트 + smart-pick + summary SSE
```

### 웹 라우트 트리 (요약)

```
PublicLayout
  /                          HomePage (랭킹, 게스트 가능)
  /restaurants               RestaurantsPage (네이버 지도식 풀 뷰포트)
    /restaurants/:placeId    RestaurantDetailRoute (nested Outlet)
  /me/settlements            SettlementHistoryPage (RequireUser, 신규)
  /me/contacts               ContactsPage (RequireUser, 단골 관리, 신규)
  /login                     LoginPage (단독, 레이아웃 없음)
RequireUser (단독 — PublicLayout 외)
  /restaurants/:placeId/settle/new   SettlementNewPage (Step1~4 stepper, 신규)
  /restaurants/:placeId/settle/:id   SettlementResultPage (수정 가능, 신규)
공개 (레이아웃 없음 — TopBar 도 없음)
  /share/settlements/:token  SharedSettlementPage (비인증 read-only, 신규)
AdminLayout (RequireAdmin 가드)
  /admin                     AdminHomePage
  /admin/discover            AdminDiscoverPage (네이버 검색·다중 등록)
  /admin/auto-discover       AdminAutoDiscoverPage (AI 키워드 → 다중 검색 → 그룹 5병렬)
  /admin/diningcode          AdminDiningcodeShopPage (다이닝코드 정식, SSE 일괄 저장)
  /admin/diningcode-test     AdminDiningcodeTestPage (검증용 — 유지)
  /admin/catchtable-test     AdminCatchtableTestPage (검증용)
  /admin/restaurants         AdminRestaurantsPage / .../:placeId (URL state 페이징 + 서버 정렬)
  /admin/canonical           AdminCanonicalPage (머지 제안 큐)
  /admin/analytics           AdminAnalyticsPage
  /admin/crawl-test          AdminCrawlTestPage / .../:jobId
  /admin/ai-test             AdminAiTestPage
  /admin/settings            AdminSettingsPage (탭 컨테이너 — ai-keys / map; ai-keys 는 purpose 분리 UI)
```

옛 `/admin/ai-keys` 북마크는 `/admin/settings/ai-keys` 로 redirect. 공개 상세는 옛 `?placeId=xxx` 모달 패턴을 **버리고** 별도 라우트(`/restaurants/:placeId`)로 분리 — 모바일 body 스크롤 + 탭 history 를 위한 결정 ([mobile UX docs](../../docs/mobile-public-restaurant-ux.md)).

## Data [coverage: high — 7 sources]

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

영속 데이터: SQLite 파일 (**`apps/friendly/data/dev.db` — 경로 통일**, `.env` `DATABASE_URL=file:../data/dev.db`), Prisma 마이그레이션. 영수증 이미지는 **DB 가 아닌 디스크** (`apps/friendly/data/receipts/<token>.jpg`) — DB 에는 `receiptImageToken` 만. 클라이언트 토큰: 웹은 `localStorage` `lp:token`, 앱은 AsyncStorage `lp:token`. 이외 웹 localStorage: `lp:panelPrefs` — 페이지별 사이드 패널 좌/우 위치, `lp:settlement-draft` — Step1~4 진행 중 draft (`settlementDraftStore` Zustand persist).

### 도메인 테이블 그룹 (전 19개)

| 그룹 | 테이블 (카운트만 — 자세한 모델은 friendly/canonical/analytics/settlement 토픽) |
|---|---|
| 사용자 (3) | `User`, `Pick`, `PickResult` |
| 외부 SDK 키 (2) | `LlmProviderConfig` (**`purpose` 컬럼 신규, `@@unique(provider, purpose)`**), `MapProviderConfig` |
| canonical (2) | `CanonicalRestaurant`, `CanonicalMergeProposal` |
| 식당/크롤 (3) | `Restaurant` (← `(source, sourceId)` unique + `canonicalId` FK), `VisitorReview`, `ReviewSummary` |
| 분석 v4 — 리뷰 단위 (2) | `MenuMention`, `ReviewTag` |
| 메뉴 그룹핑 — 식당별 (1) | `MenuCanonical` |
| 전역 머지 + 통계 (2) | `GlobalMenuCanonical`, `GlobalMenuCanonicalLink` |
| **정산 (4) 신규** | `SettlementSession` (shareToken @unique, editedAt), `SettlementItem` (4 카테고리), `SettlementParticipant` (shareAmount 스냅샷), `SettlementContact` ((userId, normalizedKey) unique) |

`LlmProviderConfig.purpose` 는 `'chat' | 'image'` — 같은 provider 를 용도별로 분리 등록. 마이그레이션 시점에 기존 행은 `purpose='chat'` 으로 채움. env 파일 fallback 은 `chat` purpose 에만 적용 — `image` 는 DB row 필수.

자세한 모델·인덱스: [friendly](friendly.md), [canonical](canonical.md), [settlement](settlement.md).

### 분석 LLM 파이프라인 (3단계)

```
크롤 (출처 3종)
   ▼
1) 리뷰 단위 분석 (summary v4)        → menu_mentions + review_tags
   ▼  (수동 트리거)
2) 식당별 메뉴 그룹핑 (menu-grouping) → menu_canonicals
   ▼  (수동 트리거)
3) 전역 머지 + 카테고리 path (analytics) → global_menu_canonicals(+links)
   ▼
통계 트리 활성 (categoryPath 기준 메모리 빌더)
   ▼
공개 영역 노출 (랭킹·인사이트·식당 카드)
```

각 단계는 독립된 `*_VERSION` 상수(예: `ANALYSIS_VERSION`, `MENU_GROUPING_VERSION`, `GLOBAL_MERGE_VERSION`)를 들고 있다. 프롬프트/스키마가 바뀌면 상수를 올려서 기존 산출물을 자동으로 **stale**로 표시.

## Key Decisions [coverage: high — 13 sources]

CLAUDE.md / TECH_STACK.md / 도메인 토픽에 명시된 핵심 결정.

| 결정 | 이유 |
|---|---|
| **정산 도메인을 별도 토픽으로 분리 (신규)** | 영수증 추출 + 세션 CRUD + 공유 토큰 + 단골 자동 적립 네 갈래가 한 도메인. project-overview 는 "신규 도메인 들어옴 + 결정·정책" 만 다루고, 모듈 디테일은 [settlement](settlement.md) 위임. 백엔드 3 모듈(`settlement-extraction`/`settlement`/`contact`) + DB 4 테이블 + 웹 라우트 5개로 묶인 한 단위 |
| **AI provider 의 `purpose` 분리 정책 (신규)** | `LlmProviderConfig` 가 `(provider, purpose)` unique — 같은 provider 를 chat / image 용도로 따로 등록. 텍스트 추론과 비전이 보통 다른 모델이라 한 행으로 묶기 어색함. 마이그레이션 시점에 기존 행은 `purpose='chat'` 자동 채움. env 파일 fallback 은 chat 에만, image 는 DB row 필수 — 영수증 추출의 비용·모델 선택을 운영자가 명시적으로 관리 |
| **공유 토큰 패턴 — settlement 첫 사례 (신규)** | `SettlementSession.shareToken @unique` (32 바이트 base64url, 추측 불가). owner 가 `POST /:id/share` 로 멱등 발급 / `DELETE` 로 회수. 공개 read 는 `GET /share/settlements/:token` 비인증. 응답에서 `receiptPreviewUrl`/`userId` 제거. **이전 `sse-token-auth` (SSE 인증 보강) 와 결이 다름** — HTTP 비인증 read 라 운영 부담 0. 향후 공유 가능한 다른 자원(픽 결과 등)에 같은 패턴 재사용 가능 |
| **DB 경로 통일 (신규)** | `.env` `DATABASE_URL=file:./data/dev.db` (friendly CWD 기준) → `file:../data/dev.db` (prisma/ CWD 기준)로 변경. 어디서 prisma 명령을 돌리든 `apps/friendly/data/dev.db` 한 파일을 가리키게. 분산되어 있던 dev DB / 어디 어떤 게 진짜냐 헷갈리던 문제 정리 |
| **참여자 수정 무제한 정책 + '수정됨' 배지 (신규)** | 저장 후 owner 가 participants / 각 카테고리 exclude 토글을 무제한 PUT 가능 — items 는 불변. 수정되면 `editedAt` 박힘 → 화면 "수정됨" 배지. `updatedAt` 과 분리한 이유: updatedAt 은 shareToken 발급/회수에도 갱신되어 배지 기준으로 부적합 |
| **4단계 stepper UI 패턴 (신규)** | 정산 입력은 sticky 헤더 stepper. 완료된 단계만 자유 점프 가능 (앞으로는 현재 단계 valid 필요). 한 화면 한 단계 — 모바일 단말에서 폼이 길어지는 걸 막고 진행도가 시각적으로 보임. 정산 외 화면에선 아직 미사용 — 향후 비슷한 다단계 입력에 재사용 후보 |
| **단골 참여자 자동 적립 (신규)** | 정산 저장 시 모든 participant 가 `SettlementContact` 에 `(userId, normalizedKey)` upsert — 다음 정산 입력에서 자동완성으로 끌어쓴다. `normalizedKey = lower(trim(name)) \| lower(trim(nickname))` — 사용자가 직접 같은 이름을 타이핑해도 같은 row 와 매칭. 단골 삭제 시 `SettlementParticipant.contactId` 는 `SetNull` (정산 본체 이력 보존) |
| **용어 규약 — 웹 / 앱 / 모바일 분리** | "모바일"의 모호함 제거. 웹은 `apps/web`, 앱은 `apps/mobile`, "모바일"은 웹의 반응형만. 코드 식별자(`mobile`/`web` 슬러그)는 그대로 |
| **출처 3종 + canonical 1:N 묶음** | 크롤 출처 확장 (Naver + 다이닝코드 + 캐치테이블). `Restaurant.(source, sourceId)` unique 로 출처별 행 분리, `CanonicalRestaurant` 가 같은 가게 묶음 |
| **C안 — 자동 DC 머지 정착** | Naver 크롤 done 직후 `tryAutoMatchDiningcode` 가 임계 통과 시 DC 저장 + canonical 머지 자동 수행. 임계 못 넘는 케이스는 silent skip 후 `CanonicalMergeProposal` 큐 fallback |
| **AI 자동 발견 — 영역명 한 줄로 N건 신규 등록** | `/admin/auto-discover` — area + 카테고리 + targetCount 만 받아 AI 가 키워드 8개 생성 → 그룹 5병렬 직렬 크롤. actor 당 잡은 1개 제한 |
| **MAX_CONCURRENT_PER_ACTOR 3 → 5** | auto-discover 의 그룹 크기 5와 정렬. in-flight dedup + FIFO 큐 두 layer 그대로 |
| **부팅 시 stale 요약 행 정리** | `cleanupStaleReviewSummaries` 가 부팅 직후 `ReviewSummary.status in ('pending','running')` 행을 `failed + errorCode='server_restart'` 마킹 |
| **SSE liveness 패턴 — heartbeat 15s + idle timeout** | summary/crawl/auto-discover/analytics SSE 모두 15s heartbeat 코멘트 + idle timeout |
| **AdminDiningcodePage 정식 / 테스트 페이지 둘 다 유지** | 정식은 운영자 일괄 등록 동선, 테스트는 어댑터 회귀·검증용 |
| **공개 영역 도입 — 사용자 대상 페이지 vs 어드민 운영 도구 분리** | 분석 결과(랭킹/메뉴 통계)는 사용자 자산. 공개는 비로그인 가능 |
| **공개 API 별도 라우트 (`/api/v1/restaurants/public/*`)** | admin 라우트와 service 메서드는 공유하되 라우트만 분리 |
| **어드민 발견 = 검색·등록 통합 마커 + 다중 선택 일괄 크롤링** | 네이버 PC 지도 직접 fetch 는 ncaptcha 차단 → Playwright 페이지로 응답 가로채기 |
| **발견 리스트 카드 = canonical 단위 합산** | 같은 canonical 의 DC 형제를 합산해 표시. 응답 행 키는 Naver placeId 그대로 |
| **발견 리스트 행 호버 자동 이동 → "지도" 버튼 클릭** | 데스크탑 호버 트리거는 모바일 터치에서 의도와 다르게 발화 |
| **공개 상세 = Naver + 다이닝코드 융합** | `restaurant.merge.ts` 가 canonical 그룹을 단일 detail 로 머지 |
| **actor 단위 rate-limit 제거** | in-flight dedup + `MAX_CONCURRENT_PER_ACTOR=5` FIFO 큐 두 layer 로 충분 |
| **패널 좌/우 토글 = 페이지별 namespace + xl+ 한정** | `panelPrefsStore` Zustand + localStorage `lp:panelPrefs` |
| **vworld JS SDK 거부, OpenLayers + WMTS 직접 호출** | 도메인 화이트리스트 부담 회피 |
| **공개 키 노출 = admin secret 과 보안 등급 동등** | WMTS 키는 어차피 클라사이드 자원 |
| **Pretendard 공개 한정 + 텍스트 시프트 전역** | 일반 사용자는 Pretendard 가독성에 익숙. 어드민은 system-ui fallback |
| **`ImgWithFallback` 공용 컴포넌트** | 네이버 CDN Referer 검사 회피 |
| **모바일 UX = body 스크롤 + 라우트 분리 + sticky containing block 규율** | 공개 맛집 페이지에서 정착시킨 프로젝트 차원의 모바일 패턴 묶음 |
| **앱 운영 빌드 — `.env.production` 자동 로드 (신규)** | Expo 가 production 모드에서 자동 로드하는 파일명 규약. `EXPO_PUBLIC_API_URL` 등 운영 변수는 `.env.production` 한 곳에. 절차는 `apps/mobile/docs/production-build.md` (Release / EAS / 실기기) |
| **pnpm + Turbo + Node 22 LTS** | 디스크/속도/엄격성 + 캐싱 + 최신 LTS |
| **Zod SSOT (api-contract)** | FE/BE 동기화 — 빌드 없는 src export 로 tsx/Vite/Metro 모두 호환 |
| **SQLite + Prisma** | MVP 규모엔 충분 — WAL, Litestream 으로 운영 백업 가능 |
| **Vite 6 + React 19** (웹) | SEO/SSR 불필요한 SPA → 단순화 |
| **TanStack Query + Zustand** | Redux 대비 보일러플레이트 ↓, 서버/클라 상태 분리 |
| **로직만 공유, UI는 플랫폼별** | Tamagui/RN-Web 통합 복잡도가 이득보다 큼 |
| **분석은 수동 LLM 트리거 우선** | 비용 예측 가능성 + 재현성 |
| **`*_VERSION` 상수로 stale 판정** | 프롬프트/스키마 변경 시 상수만 올려도 재실행 대상 자동 식별 |
| **통계 트리는 `categoryPath` 단일 컬럼 + 메모리 빌더** | 별도 트리 테이블 없음 |
| **Docker / Redis 없음** | SQLite 파일 DB라 컨테이너 불필요. 단일 인스턴스 + lru-cache 로 충분 |

`tsconfig.base.json`은 `strict + noUncheckedIndexedAccess + verbatimModuleSyntax + isolatedModules` — 엄격 모드 풀스택.

### 모바일 UX 규율 (프로젝트 차원) [coverage: high — 1 doc + 8 source files]

전체 명세는 [docs/mobile-public-restaurant-ux.md](../../docs/mobile-public-restaurant-ux.md). 공개 `/restaurants` + `/restaurants/:placeId` 에서 정착시켰지만 **공개·어드민·정산 모두에 동일하게 적용되는 프로젝트 규율**이다.

1. **모바일 = body 스크롤** — 페이지 자체를 `fixed inset-0` 풀스크린 모달로 만들지 않는다. 모바일 브라우저의 URL bar collapse 가 동작하려면 document/window 자체가 스크롤되어야 한다.
2. **sticky element 는 wrapping 금지** — wrapping div 가 sticky containing block 을 자기 boundary 로 묶어 본문 스크롤 시 함께 사라진다. 분기는 sticky element 자체 className 에서.
3. **sticky 묶음은 `overflow:auto` 컨테이너 밖에 둔다** — `overflow-y:auto` div 안에 sticky 를 두면 자체 sticky containing block 이 형성된다.
4. **`100vh` 대신 `100dvh`** — iOS Safari dynamic viewport 합치.
5. **탭 상태는 URL 의 일부, push 로 전환** — `?tab=menu`. `replace` 옵션 사용 금지.
6. **한글 IME 대응** — `compositionStart/End` + 로컬 `draft` state 필수.
7. **scroll-to-top 환경 자동 분기** — `scrollHeight > clientHeight + 1` 판정.
8. **iOS Safari focus zoom 회피** — `input`/`textarea`/`select` 의 font-size ≥ 16px.

부가 — dev 서버에서 모바일 단말 테스트하려면 `apps/web/vite.config.ts` 의 `server.host: true` 가 LAN IP 노출을 켠다.

## Gotchas [coverage: medium — 9 sources]

- **SQLite 락 + Prisma migrate dev (정산 도메인 추가 후 새로 알게 된 것)** — 정산 마이그레이션 4 개 연속 적용 중 friendly dev 서버가 떠 있으면 SQLite 의 `database is locked` 가 더 자주 난다. `pnpm --filter friendly db:migrate` 전엔 dev 서버를 끄는 게 안전 — `db:generate` 도 마찬가지. Windows 에선 Prisma DLL 락도 같이 발생
- **영수증 이미지는 디스크 별도 저장** — DB 에는 `SettlementSession.receiptImageToken` UUID 만. 실파일은 `apps/friendly/data/receipts/<token>.jpg`. 백업 정책에서 DB dump + receipts/ 디렉터리 둘 다 챙겨야 함
- **공유 토큰 응답에서 받는 사람 보호 필드 제거** — `/share/settlements/:token` 응답은 `receiptPreviewUrl` / `userId` 제거됨. 정산 결과 + 참여자 분담만 노출. 토큰 노출 ≠ 영수증 노출
- **'수정됨' 배지 기준은 `editedAt` (별도)** — `updatedAt` 이 아닌 이유: updatedAt 은 shareToken 발급/회수에도 갱신됨. participants/excludes 수정에만 박히는 별도 컬럼
- **AI provider `purpose='image'` 는 env fallback 없음** — `purpose='chat'` 만 env (`OLLAMA_CLOUD_API_KEY` 등) backed 가상 row 합성. image 는 반드시 DB row — 영수증 추출 안 되면 어드민이 `LlmProviderConfig` 의 image purpose 등록부터 확인
- **DB 경로 통일 후 옛 `.env` 호환성** — `.env.example` 이 `file:../data/dev.db` 로 바뀜. 기존 개발자의 `.env` 는 수동으로 갱신 필요 — 안 그러면 friendly 가 옛 경로(`apps/friendly/data/dev.db` 안의 다른 파일) 를 쓰던 잔존 행동이 남을 수 있음
- **단골 normalizedKey 정규화는 service 전담** — `(userId, normalizedKey)` unique 키. 직접 SQL 로 row 만들면 정규화 함수를 거치지 않아 매칭 깨짐. application layer 의 `ContactService.normalize` 만 통해서 upsert
- **stepper 자유 점프는 "완료된 단계만"** — 앞으로 가려면 현재 단계 valid 필요 — Step1 참여자 0명이면 Step2 점프 거부. 뒤로/이미 갔던 단계로는 자유. 모바일에서 진행도 회복 편의
- **"모바일" 단어의 의미 (재강조)** — 한국어 본문에서 "모바일" 단독은 **웹의 반응형**만 가리킨다. `apps/mobile` 의 Expo 앱을 지칭하고 싶을 땐 항상 "앱"
- **출처별 행이 분리됨 — `(source, sourceId)` unique** — 같은 가게라도 출처가 다르면 Restaurant 행이 따로 생긴다. 임계 못 넘으면 silent skip → `CanonicalMergeProposal` 큐
- **`placeId` 는 nullable (네이버 외 출처는 null)** — 공개 라우트 `/restaurants/:placeId` 는 네이버 행에만. 정산도 `restaurantPlaceId` 에 네이버 placeId 만 들어감 — DC/캐치테이블 식당에서는 현재 정산 시작 불가
- **패키지 간 순환 의존 금지** — `shared → api-contract`는 OK, 반대는 금지
- **공유 스키마는 반드시 `@repo/api-contract`에 zod로** — 직접 `apps/friendly`에 정의하면 웹/앱이 못 쓴다
- **vworld 키 미등록 시 placeholder** — 공개 `/restaurants` 페이지는 `useMapPublicConfig` 가 404 면 "지도 키가 등록되지 않았습니다" placeholder fallback
- **공개 list 의 `q` 쿼리는 LIKE 기반 (인덱스 없음)** — 식당 수가 1k+ 로 늘면 FTS5 등 재고 필요
- **공개 list 의 bbox 필터는 메모리 처리** — Prisma where 가 아닌 enriched 후 `.filter()`
- **ncaptcha — 네이버 PC 지도 검색 직접 fetch 차단** — Playwright 페이지를 띄워 응답 가로채는 방식. 크롤러는 stealth 플러그인 + 더보기 jitter (429 우회) 도 추가됨
- **OpenLayers `ol/ol.css` import 필수** — 마커가 안 보이거나 어택 영역이 망가지면 보통 이 import 빠진 게 원인
- **첫 관리자 만들기** — 회원가입은 항상 `role=USER`. 승격은 CLI: `pnpm --filter friendly promote-admin you@example.com`. 정산 기능은 USER 도 사용
- **분석 단계 실행 순서 강제** — 리뷰 분석 → 식당별 그룹핑 → 전역 머지
- **모바일 sticky 함정 (재강조)** — sticky 가 깨질 때 99%는 (a) wrapping div 또는 (b) `overflow:auto` 컨테이너 안
- **부팅 직후 stale 요약 행은 자동으로 failed 처리** — `errorCode='server_restart'` 의 failed 상태로 바뀐다
- **자동 발견 잡은 actor 당 1 개 제한** — 무거운 파이프라인이라 동시 1개
- **HANDOFF 문서는 git에 넣지 말 것** — `docs/HANDOFF-*.md`는 untracked 유지
- **버전 매트릭스** — 웹은 React 19, 앱은 React 18 — `@repo/shared`가 React 18+ peer로 양쪽 호환
- **앱 운영 빌드는 `.env.production` 자동 로드** — `EXPO_PUBLIC_API_URL` 같은 변수는 빌드 시점에 굳는다(런타임 변경 불가). 절차는 [production-build.md](../../apps/mobile/docs/production-build.md)
- **앱 Expo Web 은 SPA 모드 고정** — `web.output: 'single'`. 정적 사전렌더(`'static'`)는 워크스페이스 두 React 사본 환경에서 SSR 500

## Sources [coverage: high — 24 sources]

- [README.md](../../README.md)
- [CLAUDE.md](../../CLAUDE.md) — "용어" 섹션 포함
- [TECH_STACK.md](../../TECH_STACK.md)
- [package.json](../../package.json)
- [pnpm-workspace.yaml](../../pnpm-workspace.yaml)
- [turbo.json](../../turbo.json)
- [tsconfig.base.json](../../tsconfig.base.json)
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — `SettlementSession`/`SettlementItem`/`SettlementParticipant`/`SettlementContact` + `LlmProviderConfig.purpose`
- [apps/friendly/prisma/migrations/20260523012752_add_settlement_models/](../../apps/friendly/prisma/migrations/) — 정산 4 마이그레이션
- [apps/friendly/.env.example](../../apps/friendly/.env.example) — `DATABASE_URL=file:../data/dev.db` (경로 통일)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — Settlement / SettlementExtraction / SettlementContact 신규
- [packages/api-contract/src/schemas/settlement.ts](../../packages/api-contract/src/schemas/settlement.ts) — 세션/항목/참여자 (신규)
- [packages/api-contract/src/schemas/settlement-extraction.ts](../../packages/api-contract/src/schemas/settlement-extraction.ts) — vision 추출 입출력 (신규)
- [packages/api-contract/src/schemas/settlement-contact.ts](../../packages/api-contract/src/schemas/settlement-contact.ts) — 단골 CRUD (신규)
- [packages/api-contract/src/settlement.calculator.ts](../../packages/api-contract/src/settlement.calculator.ts) — 분배 계산 순수 함수 (신규)
- [apps/friendly/src/modules/settlement/](../../apps/friendly/src/modules/settlement/) — 세션 CRUD + 공유 토큰 (신규)
- [apps/friendly/src/modules/settlement-extraction/](../../apps/friendly/src/modules/settlement-extraction/) — 영수증 업로드 + vision LLM (신규)
- [apps/friendly/src/modules/contact/](../../apps/friendly/src/modules/contact/) — 단골 자동 적립 + /me/contacts (신규)
- [apps/friendly/src/modules/ai/ai.config.service.ts](../../apps/friendly/src/modules/ai/ai.config.service.ts) — `purpose` 분리, env fallback 은 chat 에만
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx) — `RequireUser` + 정산 라우트 5개 추가
- [apps/web/src/routes/settlement/](../../apps/web/src/routes/settlement/) — Step1~4 + History/Result/Shared/Contacts (신규)
- [packages/shared/src/stores/settlementDraftStore.ts](../../packages/shared/src/stores/settlementDraftStore.ts) — Step1~4 draft (Zustand persist, 신규)
- [packages/shared/src/api/settlement.api.ts](../../packages/shared/src/api/settlement.api.ts) — + settlement-extraction.api.ts + settlement-contact.api.ts (신규)
- [packages/shared/src/hooks/useSettlement.ts](../../packages/shared/src/hooks/useSettlement.ts) — + useSettlementContact / useSettlementExtraction (신규)
- [apps/mobile/docs/production-build.md](../../apps/mobile/docs/production-build.md) — 앱 운영 빌드 가이드 (신규)
- [apps/mobile/.env.production](../../apps/mobile/.env.production) — 운영 API URL 자동 로드 (신규)
- [apps/friendly/src/modules/crawl/crawl.service.ts](../../apps/friendly/src/modules/crawl/crawl.service.ts) — naver stealth + 더보기 jitter
- [docs/menu-hierarchy.md](../../docs/menu-hierarchy.md)
- [docs/mobile-public-restaurant-ux.md](../../docs/mobile-public-restaurant-ux.md)
- [apps/web/vite.config.ts](../../apps/web/vite.config.ts) — `server.host: true` LAN/모바일 단말 dev 접근
- 토픽 — [settlement](settlement.md) (신규 위임), [auto-discover](auto-discover.md), [friendly](friendly.md), [web](web.md), [api-contract](api-contract.md), [analytics](analytics.md), [menu-grouping](menu-grouping.md), [media](media.md), [ai](ai.md), [map](map.md), [crawl](crawl.md), [canonical](canonical.md)
