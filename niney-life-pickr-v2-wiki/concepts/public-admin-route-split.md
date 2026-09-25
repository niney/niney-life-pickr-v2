---
concept: 공개/어드민 라우트 페어 분리
last_compiled: 2026-09-26
topics_connected: [friendly, api-contract, shared, web, map, project-overview, settlement, review-search, review-clustering, logs, tour, api-docs, canonical]
status: active
---

# 공개/어드민 라우트 페어 분리

## Pattern

같은 데이터를 어드민 운영 표면과 사용자 공개 표면 양쪽에 노출해야 할 때, 이 모노레포는 **하나의 라우트에 가드만 토글하지 않고 라우트·스키마·훅을 페어로 분리**한다. 즉 `Routes.X.list` 옆에 `Routes.X.publicList` 가 따로 살고, `RestaurantListItem` 옆에 `RestaurantPublicListItem` 이 따로 산다. 두 표면은 같은 DB 행을 바라보지만 응답 셋이 다르고 (운영 메타 제거), 캐시 키가 다르고, OpenAPI 태그가 다르고, 변경의 폭발 반경이 다르다.

가드만 다르게 두는 단일 라우트 모델 — 예: `if (req.user) return adminShape(...) else return publicShape(...)` — 은 매력적이지만 두 가지가 깨진다: (1) 응답 셋이 같아져 운영 메타 (분석 진행 상태·에러·모델·내부 ID 등) 가 사용자에게 노출되거나, 아니면 가드 분기가 service 레이어까지 침투하면서 한 함수가 두 책임을 진다. (2) 한 라우트의 변경이 두 표면 모두를 흔들어 어드민 회귀 위험이 자동으로 공개로 번진다. 페어 분리는 두 라이프사이클을 독립화한다.

## Instances

- **2026-09-26**(`420a6be`) in [../topics/web](../topics/web.md) / [../topics/canonical](../topics/canonical.md) / [../topics/shared](../topics/shared.md): **페어를 한 화면에서 합성** — 어드민 맛집 상세(`/admin/restaurants/:placeId`)가 공개 상세의 탭 구성(홈·분석·여행자·메뉴·리뷰·질문·사진·정보 + 어드민 전용 로그, `?tab=`)을 그대로 따르면서, 한 페이지가 **두 표면을 동시에 부른다**: 어드민 라우트(`useRestaurantByPlaceId` — 운영 메타·canonical 전체 출처 리뷰 `AdminVisitorReview`·출처 행 `sources`)와 공개 라우트(`useRestaurantPublic`·`useRestaurantPublicInsights` — 사용자 화면 데이터 그대로). 홈·분석·질문·사진·정보·메뉴·여행자 탭은 공개 컴포넌트(`HomeTab`·`InsightsTab`·`AskTab`·`PhotosTab`·`InfoTab`·`MenuTab`·`TourTab`)에 **공개 응답을 그대로** 넣고, 어드민 몫(메뉴 순위·원시 값·출처 표·여행자 근거 `TourEvidenceSection`·출처 통합 리뷰 탭·크롤/요약 카드)만 옆에 덧붙인다. 공개 컴포넌트 쪽 변경은 **선택 prop 두 개뿐**(`HomeTab.availableTabs` — 어드민에 없는 '가는 법' 링크 숨김, `ParkingSummaryLine.onOpen`) — 생략하면 공개 동작 그대로. 서버에서도 경계 안쪽 코어를 공유한다: 어드민 `GET /admin/restaurants/place/:placeId/review-match` 가 공개 리뷰 목록과 **같은 팁·메뉴 매칭 함수**(`filterReviewsByTipMenu` 로 추출)를 쓴다. 즉 라우트·스키마·가드는 여전히 둘이고, 합쳐진 건 UI 조각과 서비스 내부 함수다.
- **2026-09-24**(`1b621c4`) in [../topics/api-docs](../topics/api-docs.md) / [../topics/friendly](../topics/friendly.md) / [../topics/project-overview](../topics/project-overview.md): **prefix 가 곧 공개 정책의 술어** — "어드민 빼고 전부 연다" 는 사용자 결정(다른 프로젝트가 브라우저에서 직접 호출)이 `plugins/cors.ts` 한 곳의 판정으로 끝났다: `/api/v1/admin/**`(퍼센트 인코딩 경로도 어드민으로 판정) 는 `PUBLIC_ORIGIN` 만, 나머지는 `origin: '*'` + `credentials: false`. 같은 경계가 문서에도 그대로 쓰인다 — `export:openapi` 가 어드민 경로를 빼고 `docs/api/`(192개 = 공개 83·선택 인증 15·로그인 94)를 만들고, swagger transform 이 가드 훅에서 `x-auth`(public·optional·user·admin)를 자동으로 읽어 붙인다. 2026-05 부터 "`/api/v1/admin/*` prefix 가 가드의 유일한 신호" 로 지켜 온 규약이 CORS·외부 문서라는 **두 번째·세 번째 정책 축**을 비용 없이 받아낸 사례.
- **2026-09-13**(여행로그 1~5차, `c777380`·`99991da`·`cfa276b`) in [../topics/tour](../topics/tour.md) / [../topics/api-contract](../topics/api-contract.md) / [../topics/web](../topics/web.md): **페어가 아니라 3층** — 같은 `Tour*` 표를 (1) 공개 집계 `GET /tour/public/*`·`/restaurants/public/:placeId/tour-stats`(집계값만, 여행자 5명·평가 3건 하한, 응답 스키마에 여행·방문·사진 식별자가 아예 없음 — 테스트가 키 스캔), (2) 어드민 운영 `/admin/tour/status·seeds·match/run·biz-status/run`(장소 단위 집계 + 매칭·폐업 상태, 관리자 가드), (3) **원본 열람** `/admin/tour/places/:id/{visits,spend,photos…}`·`/trips/:travelId`·`/photos/:photoId/:size` 로 갈랐다. 3층은 어드민 안에서 한 번 더 갈라진 **개인 승인 티어** — AI 허브 다운로드 승인을 받은 본인(`TOUR_RAW_USER_IDS`, user id 또는 이메일)만 통과하고 밖이면 403 이 아니라 **404**(존재를 숨김), onSend 로 `private, no-store`·`noindex`, 사진은 `?token=` 도 인증. 라이선스(원본 제3자 열람 불가·국외 반출 금지)가 권한 축을 하나 더 만든 첫 사례이며, 공개 층은 서면 회신 전 운영 노출 금지라는 **배포 게이트**까지 층마다 다르다. 계약도 층별 스키마(`Tour*Public*` 에는 식별자 없음 / `TourRaw*` 는 원문)로 분리.
- **2026-05-09** in [../topics/friendly](../topics/friendly.md): `Routes.Restaurant.publicList` / `publicByPlaceId` / `publicInsights` 3개 공개 라우트가 `Routes.Restaurant.list` / `byPlaceId` / `insights` 의 어드민 페어 옆에 신설됨. 핸들러는 다르지만 service 레이어의 `getPublicList` / `getPublicDetail` / `getInsights` 가 어드민 메소드와 분리되어 있어 응답 셋의 차이가 service 안에서 끝남. publicList 는 `snapshotJson` 메모리 파싱 후 bbox 필터 → 그 이후의 ids 만 분석 집계 (검색 범위 밖 식당 통계 호출 회피). publicDetail 은 `ReviewSummary` 의 운영 메타 (`status` / `errorCode` / `model` / `startedAt` 등) 를 service 단에서 제거하고 done 행만 평탄화한 `PublicReviewAnalysis` 로 변환.
- **2026-05-09** in [../topics/api-contract](../topics/api-contract.md): 새 zod 스키마 5종이 어드민 페어 옆에 신설 — `RestaurantPublicListQuery` / `RestaurantPublicListItem` / `RestaurantPublicListResult` (어드민 `RestaurantListItem`/`RestaurantListResult` 와 페어), `PublicReviewAnalysis` / `PublicVisitorReview` / `RestaurantPublicDetail` (어드민 `ReviewSummary` / `VisitorReviewWithSummary` / `RestaurantDetail` 와 페어). `MapProviderPublicConfig` 가 `MapProviderSecret` 와 페어 (둘 다 평문 키를 노출하지만 다른 라우트로). `Routes.Restaurant.publicList`/`SettingsMap.publicConfig` 같은 라우트 상수도 같은 namespace 안에서 페어로 분리.
- **2026-05-09** in [../topics/shared](../topics/shared.md): `restaurantApi.publicList`/`publicByPlaceId`/`publicInsights` 가 어드민 `restaurantApi.list`/`getByPlaceId` 옆에 추가. 훅도 페어 — `useRestaurantsPublic` / `useRestaurantPublic` / `useRestaurantPublicInsights` (어드민 `useRestaurantList`/`useRestaurantByPlaceId` 페어). queryKey 도 분리 (`['restaurant','public','list',...]` vs `['restaurant','list']`) 라 캐시 정책이 독립. `useMapPublicConfig` (404 OK + retry: false + staleTime Infinity) 가 어드민 `useMapProviderSecret` 와 페어.
- **2026-05-09** in [../topics/web](../topics/web.md): RestaurantsPage 의 공개 페이지가 `useRestaurantsPublic` / `useRestaurantPublic` / `useMapPublicConfig` 만 호출 — 어드민 훅에 의존하지 않음. `AdminRestaurantsPage` 와 코드 공유는 0. 결과: 공개 페이지의 디자인/상태 모델이 어드민 운영 화면을 끌어다니지 않고 자유롭게 진화.
- **2026-05-09** in [../topics/map](../topics/map.md): `Routes.SettingsMap.secret(':id')` (어드민, JSON `MapProviderSecret`) 와 `Routes.SettingsMap.publicConfig` (공개, JSON `MapProviderPublicConfig`) 가 페어로 공존. 같은 vworld WMTS 키를 노출하지만 라우트 prefix (`/admin/settings/map/{id}/secret` vs `/settings/map/public`) 와 응답 스키마 (`apiKey: nullable + domains` vs `apiKey: 평문` 만) 가 다르다. 핸들러는 둘 다 `service.getSecret('vworld')` 한 함수를 호출하고 차이만 라우트 핸들러에서 만든다.
- **2026-05-09** in [../topics/project-overview](../topics/project-overview.md): "공개 vs 어드민 분리 정책" 이 모노레포 수준의 결정으로 정착 — 백엔드는 `/api/v1/admin/*` prefix 가 가드의 유일한 신호이고, FE 는 `PublicLayout` vs `AdminLayout` 으로 분기. 새 도메인이 사용자 노출이 필요해질 때 동일한 페어 분리를 따른다.
- **2026-05-09 (follow-up)** in [../topics/web](../topics/web.md): 페어 경계 흐림의 첫 사례 — 어드민 발견 페이지(`/admin/discover`) 가 등록 맛집 데이터를 어드민 hook 이 아니라 **공개 hook (`useRestaurantsPublic`) 을 호출해 가져온다**. 이유는 어드민 `RestaurantListItem` 응답에 좌표(`latitude`/`longitude`) 가 없어서 — 공개 `RestaurantPublicListItem` 만이 좌표를 노출. 어드민 발견 페이지가 지도 마커를 그리려면 좌표가 필요하므로 공개 응답 셋을 그대로 차용하는 게 가장 단순. 또 등록 행 클릭 시 `PublicRestaurantDetail` 컴포넌트도 그대로 재사용 — 어드민 발견 전용 상세 컴포넌트 별도로 만들지 않음. 이는 페어 분리의 합당성을 흔들지 않는다 — 어드민이 공개 표면을 호출할 때는 응답 셋이 어드민에서 부족해서이지, 같은 데이터를 두 표면에 묶으려는 게 아니다.
- **2026-05-25** in [../topics/settlement](../topics/settlement.md) / [../topics/api-contract](../topics/api-contract.md) / [../topics/friendly](../topics/friendly.md) / [../topics/shared](../topics/shared.md) / [../topics/web](../topics/web.md): **새 결 — 권한 분리 축이 "role" 이 아니라 "토큰 소유"** 인 공유 토큰 페어. 같은 `SettlementSession` 데이터에 (a) 소유자만 `GET /api/v1/settlements/:id` (Bearer 인증, owner=userId 일치 검사), (b) 토큰 가진 사람만 `GET /api/v1/share/settlements/:token` (비인증, read-only). 응답 스키마도 분리 — `SettlementSession` 옆에 `SharedSettlementSession` 페어, 후자는 `.omit({ userId: true, receiptPreviewUrl: true })` 로 소유자 식별 + 영수증 원본 미리보기 제거 (토큰 받은 사람도 영수증 사진은 못 봄 — 개인정보 우려). 라우트 상수도 페어 — `Routes.Settlement.one(:id)` vs `Routes.Settlement.shared(:token)`, URL prefix 도 `/api/v1/settlements/` vs `/api/v1/share/settlements/`. shared 의 훅도 페어 — `useSettlement(id)` vs `useSharedSettlement(token)`, **queryKey 도 다른 namespace 라 캐시 격리** (`['settlement','one',id]` vs `['settlement','shared',token]`). web 도 페이지 분리 — `SettlementResultPage` (소유자) vs `SharedSettlementPage` (토큰), 라우트도 `/restaurants/:placeId/settle/:id` vs `/share/settlements/:token`, 후자는 `RequireUser` 가드 없이 직접 라우트. **결의 차이**: 기존 인스턴스들은 "역할(어드민/공개)" 축으로 분리됐는데, 여기는 "토큰 소유 vs 소유자" 축. 둘 다 같은 패턴 — 가드만 토글하지 않고 라우트·스키마·훅·페이지 전부 페어. 페어 분리 원칙이 "어드민/공개" 라는 특정 차원이 아니라 **"권한 차원이 다르면 페어로 분리한다"** 라는 일반화로 확장됐음을 보여주는 사례.
- **2026-05-28** in [../topics/settlement](../topics/settlement.md) / [../topics/friendly](../topics/friendly.md) / [../topics/api-contract](../topics/api-contract.md): 권한 축에 새 결 — **드래프트는 소유자 전용, 공개 짝 없음**. `SettlementDraft` 라우트군(`GET/PUT/DELETE /api/v1/settlements/drafts/...`) 이 owner-only 인증으로만 노출되고 share-token 짝이 의도적으로 부재. 드래프트는 "사용자 편집 진행 중인 사적 입력 상태" 라서 다른 사람과 공유될 의미 자체가 없음 — share 짝을 두지 않는 게 도메인 의미와 정합. 권한 축이 "owner / token / 없음" 세 가지로 표현 가능해졌고, 도메인마다 적용 짝의 부분집합만 선택. 동시에 **owner 축 안에서 라우트 표면이 축소** — 기존 `PATCH /api/v1/settlements/:id/participants` (참석자 부분 업데이트) 가 `PUT /api/v1/settlements/:id` (세션 전체 교체) 로 통합. 다라운드 모델로 진화하면서 부분 PATCH 가지가 폭발할 위험을 owner 표면 단일 PUT 으로 흡수. **새 차원 추가가 아니라 같은 축(owner vs token) 위의 부분집합 + 표면 축소** 두 움직임이 한 라운드에 같이 일어남.
- **2026-06-25**(18차) in [../topics/review-search](../topics/review-search.md) / [../topics/review-clustering](../topics/review-clustering.md): 리뷰 지능화 두 도메인이 **같은 도메인을 어드민/공개로, 게다가 식별자 축까지 갈라** 페어 분리. review-search 는 어드민(`/admin/review-search/*` — `authenticate`+`requireAdmin`, **`restaurantId` 단위**, enrich/ask/status/SSE) vs 공개 QA(`/restaurants/:placeId/qa`·`/qa/ready` — **무가드, `placeId` 단위**, IP 레이트리밋 + graceful 폴백). review-clustering 도 어드민 4개(가드, run/status/bg/pending) vs 공개 `clusters`(무인증 read-only). **식별자 자체가 페어의 일부** — 어드민은 내부 restaurantId, 공개는 안정적 placeId. 응답 셋도 다름(어드민은 enrich 진행/스킵 사유 등 운영 메타, 공개는 답변·인용·confidence 또는 군집 라벨만). [[canonical-corpus-fanout]] 와 맞물려 공개 측은 placeId→canonical primaryId 로 fold.
- **2026-06-25**(18차) in [../topics/logs](../topics/logs.md) / [../topics/friendly](../topics/friendly.md): **원칙의 경계 사례 — 어드민 전용, 공개 짝 없음**. `logs`(`/admin/logs/*`)·`telegram` 설정(`/admin/settings/telegram/*`) 은 모든 엔드포인트가 `authenticate`+`requireAdmin` 이고 공개 카운터파트가 의도적으로 없다. "권한 차원이 다르면 페어로 분리한다" 가 "항상 양쪽을 만든다" 는 뜻이 아님을 명확히 — 공개 표면이 도메인 의미상 없으면(운영 로그·봇 토큰) 어드민-only 로 닫는다(settlement-draft 의 owner-only 와 같은 결의 "부분집합 선택"). 페어 분리는 **표면을 강제로 둘로 늘리는 규칙이 아니라, 권한 차원이 갈릴 때 그 경계를 라우트/스키마/훅에 명시하는 규칙**이다.

## What This Means

이 패턴은 단지 "보안 분리" 가 아니라 **두 표면의 라이프사이클을 독립적으로 진화시키기 위한 인프라**다. 어드민 표면은 운영 진단을 위해 noisy 한 메타데이터 (분석 진행률·에러 코드·내부 모델 식별자) 를 다 보여줘야 하고, 공개 표면은 사용자에게 깨끗한 결과만 보여야 한다. 응답 셋이 다르고, 깨지는 방식도 다르고, 캐시·rate limit·로깅 정책도 다르다. 한 라우트에 두 라이프사이클을 묶으면 그 차이가 service 레이어 또는 핸들러 안에서 if-else 가지로 흩어지면서 long-term 으로 정리가 안 된다.

명시적인 비용:
- 라우트 상수가 두 배 (`list` 옆에 `publicList`)
- 스키마가 두 배 (`RestaurantListItem` 옆에 `RestaurantPublicListItem`)
- 훅이 두 배 (`useRestaurantList` 옆에 `useRestaurantsPublic`)

이 비용은 의도한 것 — 변경이 한쪽에서 다른쪽으로 자동 번지지 않게 하는 게 목적. 어드민 list API 의 응답 모양이 바뀌어도 공개 list API 는 깨지지 않는다 (같은 service 메소드를 안 쓰니까). 공개 detail 에 새 필드를 넣어도 어드민 detail OpenAPI 가 안 흔들린다.

이 패턴이 깨질 수 있는 시점:
- **service 레이어를 공유하면서 핸들러만 분리할 때** — `getPublicList` 와 `getList` 가 모두 같은 prisma 쿼리를 호출하는 헬퍼를 공유한다면, 그 헬퍼가 두 라이프사이클의 합집합이 되면서 다시 if-else 분기가 service 안으로 빨려 들어간다. 현재는 `getPublicList` 가 어드민 `list()` 와 별도 메소드라 깨끗.
- **공개 표면에 운영 메타가 우연히 새는 경우** — `PublicVisitorReview` 가 어드민 `VisitorReviewWithSummary` 의 `summary.status` 같은 필드를 z.infer 한다면 공개 응답에 운영 진행률이 새기 시작한다. 페어 분리는 컴파일러가 강제하지 않는다 — 사람이 의도적으로 새 스키마를 짜야 한다.
- **rate limit / 캐싱 정책이 동일해질 때** — 두 표면이 같은 cache TTL 을 쓴다면 분리의 의미가 줄어든다. 현재 공개 ranking 60s server cache + 30s client staleTime, 어드민 list 는 캐시 없음 — 정책이 독립.
- **vworld 스타일의 "응답 데이터는 같지만 라우트만 다른" 케이스** — `MapProviderSecret` 와 `MapProviderPublicConfig` 가 그런 경우다. 데이터는 같은 평문 키지만 의도가 다르다 (admin 진단 reveal vs 사용자 페이지 사용). 컴파일러는 이 둘이 사실상 같은 데이터임을 모른다 — 사람이 의도를 분리해 둬야 의미가 있다.

페어 분리는 어드민 회귀 위험을 0 으로 만들고 두 표면이 다른 속도로 진화하게 한다. 이 코드베이스의 "공개 vs 어드민" 경계는 이제 라우트 prefix / 스키마 / 훅 / 페이지 4 단계에서 모두 명시적이다.

**부수 효과 — 공개 표면이 더 풍부할 때 어드민이 차용 가능** (2026-05-09 follow-up). 어드민 발견 페이지가 공개 hook 을 그대로 호출하는 케이스 — 어드민 응답 셋이 좌표를 노출하지 않아 마커 그리려면 공개 응답이 필요. 또 `PublicRestaurantDetail` 컴포넌트도 어드민 페이지에서 재사용. 페어 분리의 한쪽이 다른 쪽에서 차용되는 첫 사례인데, 분리의 합당성을 흔들지 않는다 — 차용의 이유가 "응답 셋이 어드민에서 부족해서" 라는 의도이고, 운영 메타가 우연히 새는 케이스가 아니다. 페어 분리는 어드민이 공개 응답을 호출하는 것을 금지하지 않는다 — 두 표면의 응답 셋을 명확히 하는 데 의의가 있고, 어드민이 부족한 응답을 공개 응답으로 보강하는 건 분리가 잘 되어 있을 때만 가능한 자연스러운 흐름.

**경계는 가장자리에, 코어는 공유** (2026-09-24~26 추가). 두 사례가 페어 분리의 "무엇을 나누고 무엇을 나누지 않는가" 를 선명하게 했다. (1) CORS 개방(`1b621c4`)은 prefix 경계가 명시적이었기에 "어드민 제외 전부" 라는 정책이 술어 하나로 끝났다 — 경계가 서비스 안의 if 문이었다면 라우트마다 판단해야 했을 것이다. 외부 문서도 같은 prefix 로 어드민을 뺀다. (2) 어드민 상세 재구성(`420a6be`)은 반대 방향 — 어드민 화면이 공개 **표면을 호출**하고 공개 **컴포넌트를 재사용**해, 운영자가 사용자와 똑같은 화면을 보면서 운영 메타를 옆에 얹는다. 이게 가능한 조건이 바로 페어 분리다: 공개 응답이 운영 메타 없이 깨끗하니 어드민이 그대로 가져다 써도 새지 않고, 어드민 응답은 공개 컴포넌트에 억지로 맞출 필요 없이 출처 통합 리뷰·출처 행 같은 운영 모양을 유지한다. 공유는 **선택 prop(생략 시 공개 동작)** 과 **서비스 내부 순수 함수(`filterReviewsByTipMenu`)** 수준에서만 일어나고, 라우트·스키마·queryKey·가드는 여전히 둘이다. 2026-05-09 의 "어드민 발견 페이지가 공개 hook 차용" 이 우연한 첫 사례였다면, 이번엔 **합성이 설계 방침**이 됐다(공개 상세에만 있던 AI 집계·주제 군집·메뉴 그룹·칼로리·질문을 어드민에 따로 만들지 않은 이유). 남은 틈: 공개 인사이트(`getInsights`)는 네이버 행만 집계하고 어드민 리뷰 탭은 canonical 전체라, 같은 화면 안에서 '목살 N회 언급' 과 리뷰 필터 결과 수가 어긋난다(공개 화면에도 원래 있던 불일치 — 후속 결정 대기, [canonical-corpus-fanout](canonical-corpus-fanout.md)).

## Sources

- [../topics/api-docs](../topics/api-docs.md)
- [../topics/canonical](../topics/canonical.md)
- [../topics/friendly](../topics/friendly.md)
- [../topics/api-contract](../topics/api-contract.md)
- [../topics/shared](../topics/shared.md)
- [../topics/web](../topics/web.md)
- [../topics/map](../topics/map.md)
- [../topics/project-overview](../topics/project-overview.md)
- [../topics/settlement](../topics/settlement.md)
- [../topics/review-search](../topics/review-search.md)
- [../topics/review-clustering](../topics/review-clustering.md)
- [../topics/logs](../topics/logs.md)
- [../topics/tour](../topics/tour.md)
