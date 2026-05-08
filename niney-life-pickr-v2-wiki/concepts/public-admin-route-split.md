---
concept: 공개/어드민 라우트 페어 분리
last_compiled: 2026-05-09
topics_connected: [friendly, api-contract, shared, web, map, project-overview]
status: active
---

# 공개/어드민 라우트 페어 분리

## Pattern

같은 데이터를 어드민 운영 표면과 사용자 공개 표면 양쪽에 노출해야 할 때, 이 모노레포는 **하나의 라우트에 가드만 토글하지 않고 라우트·스키마·훅을 페어로 분리**한다. 즉 `Routes.X.list` 옆에 `Routes.X.publicList` 가 따로 살고, `RestaurantListItem` 옆에 `RestaurantPublicListItem` 이 따로 산다. 두 표면은 같은 DB 행을 바라보지만 응답 셋이 다르고 (운영 메타 제거), 캐시 키가 다르고, OpenAPI 태그가 다르고, 변경의 폭발 반경이 다르다.

가드만 다르게 두는 단일 라우트 모델 — 예: `if (req.user) return adminShape(...) else return publicShape(...)` — 은 매력적이지만 두 가지가 깨진다: (1) 응답 셋이 같아져 운영 메타 (분석 진행 상태·에러·모델·내부 ID 등) 가 사용자에게 노출되거나, 아니면 가드 분기가 service 레이어까지 침투하면서 한 함수가 두 책임을 진다. (2) 한 라우트의 변경이 두 표면 모두를 흔들어 어드민 회귀 위험이 자동으로 공개로 번진다. 페어 분리는 두 라이프사이클을 독립화한다.

## Instances

- **2026-05-09** in [../topics/friendly](../topics/friendly.md): `Routes.Restaurant.publicList` / `publicByPlaceId` / `publicInsights` 3개 공개 라우트가 `Routes.Restaurant.list` / `byPlaceId` / `insights` 의 어드민 페어 옆에 신설됨. 핸들러는 다르지만 service 레이어의 `getPublicList` / `getPublicDetail` / `getInsights` 가 어드민 메소드와 분리되어 있어 응답 셋의 차이가 service 안에서 끝남. publicList 는 `snapshotJson` 메모리 파싱 후 bbox 필터 → 그 이후의 ids 만 분석 집계 (검색 범위 밖 식당 통계 호출 회피). publicDetail 은 `ReviewSummary` 의 운영 메타 (`status` / `errorCode` / `model` / `startedAt` 등) 를 service 단에서 제거하고 done 행만 평탄화한 `PublicReviewAnalysis` 로 변환.
- **2026-05-09** in [../topics/api-contract](../topics/api-contract.md): 새 zod 스키마 5종이 어드민 페어 옆에 신설 — `RestaurantPublicListQuery` / `RestaurantPublicListItem` / `RestaurantPublicListResult` (어드민 `RestaurantListItem`/`RestaurantListResult` 와 페어), `PublicReviewAnalysis` / `PublicVisitorReview` / `RestaurantPublicDetail` (어드민 `ReviewSummary` / `VisitorReviewWithSummary` / `RestaurantDetail` 와 페어). `MapProviderPublicConfig` 가 `MapProviderSecret` 와 페어 (둘 다 평문 키를 노출하지만 다른 라우트로). `Routes.Restaurant.publicList`/`SettingsMap.publicConfig` 같은 라우트 상수도 같은 namespace 안에서 페어로 분리.
- **2026-05-09** in [../topics/shared](../topics/shared.md): `restaurantApi.publicList`/`publicByPlaceId`/`publicInsights` 가 어드민 `restaurantApi.list`/`getByPlaceId` 옆에 추가. 훅도 페어 — `useRestaurantsPublic` / `useRestaurantPublic` / `useRestaurantPublicInsights` (어드민 `useRestaurantList`/`useRestaurantByPlaceId` 페어). queryKey 도 분리 (`['restaurant','public','list',...]` vs `['restaurant','list']`) 라 캐시 정책이 독립. `useMapPublicConfig` (404 OK + retry: false + staleTime Infinity) 가 어드민 `useMapProviderSecret` 와 페어.
- **2026-05-09** in [../topics/web](../topics/web.md): RestaurantsPage 의 공개 페이지가 `useRestaurantsPublic` / `useRestaurantPublic` / `useMapPublicConfig` 만 호출 — 어드민 훅에 의존하지 않음. `AdminRestaurantsPage` 와 코드 공유는 0. 결과: 공개 페이지의 디자인/상태 모델이 어드민 운영 화면을 끌어다니지 않고 자유롭게 진화.
- **2026-05-09** in [../topics/map](../topics/map.md): `Routes.SettingsMap.secret(':id')` (어드민, JSON `MapProviderSecret`) 와 `Routes.SettingsMap.publicConfig` (공개, JSON `MapProviderPublicConfig`) 가 페어로 공존. 같은 vworld WMTS 키를 노출하지만 라우트 prefix (`/admin/settings/map/{id}/secret` vs `/settings/map/public`) 와 응답 스키마 (`apiKey: nullable + domains` vs `apiKey: 평문` 만) 가 다르다. 핸들러는 둘 다 `service.getSecret('vworld')` 한 함수를 호출하고 차이만 라우트 핸들러에서 만든다.
- **2026-05-09** in [../topics/project-overview](../topics/project-overview.md): "공개 vs 어드민 분리 정책" 이 모노레포 수준의 결정으로 정착 — 백엔드는 `/api/v1/admin/*` prefix 가 가드의 유일한 신호이고, FE 는 `PublicLayout` vs `AdminLayout` 으로 분기. 새 도메인이 사용자 노출이 필요해질 때 동일한 페어 분리를 따른다.

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

## Sources

- [../topics/friendly](../topics/friendly.md)
- [../topics/api-contract](../topics/api-contract.md)
- [../topics/shared](../topics/shared.md)
- [../topics/web](../topics/web.md)
- [../topics/map](../topics/map.md)
- [../topics/project-overview](../topics/project-overview.md)
