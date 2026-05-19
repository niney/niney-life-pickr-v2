---
topic: map
type: codebase
last_compiled: 2026-05-19
source_count: 21
status: active
aliases: [muted-marker, gray-pin, map-resize-observer, discover-map, registered-vs-search-marker, webview-vworld, fly-to-zoom, marker-fly, selected-marker-pin, label-always-visible, location-fly-bbox, public-restaurants-webview-map]
---

# map

**2026-05-19 변경 흡수**: (1) **WebView 기반 모바일 지도** — RN 가 OpenLayers 를 네이티브로 카리지 못해 [PublicRestaurantsWebMap.native.tsx](../../apps/mobile/src/components/PublicRestaurantsWebMap.native.tsx) 가 WebView 안에 [publicRestaurantsMapHtml.ts](../../apps/mobile/src/components/publicRestaurantsMapHtml.ts) 의 인라인 HTML(vworld WMTS + OpenLayers + 마커 클릭 → `window.ReactNativeWebView.postMessage` 브릿지) 주입. Expo Web 은 [.web.tsx](../../apps/mobile/src/components/PublicRestaurantsWebMap.web.tsx) 로 web 컴포넌트 직접 재사용. (2) **위치 기반 첫 진입** — `MapCanvas`/`VWorldMap`/`PublicRestaurantsMap` 가 첫 진입 시 `useUserLocation` (브라우저) / `useUserLocationNative` (앱) + `computeBboxAround` 로 자동 fly. "내 위치" 버튼 추가. 한국 밖이면 `isInKorea` 폴백. (3) **마커 fly + zoom + 스타일 분기** — 리스트 선택 시 지도 자동 fly + zoom in, 비선택은 dot 만 / 선택은 핀 + 라벨 항상 표시. 모바일은 Reanimated 워클릿 폭주를 막기 위해 selection 채널과 marker 채널을 분리.

## Purpose [coverage: high -- 7 sources]

vworld 지도 타일을 OpenLayers 위에 직접 그려, 세 화면에 한 가지 렌더링 코어를 공급하는 도메인. 첫째는 어드민 식당 상세 페이지 우측 사이드바의 단일 마커 위치 카드(작은 사이드 박스 + 우측 슬라이드오버 풀 사이즈), 둘째는 공개 `/restaurants` 지도 페이지의 다중 마커 + "이 지역에서 재검색" 위젯, 셋째는 어드민 발견(`/admin/discover`) 페이지의 검색 결과·등록 맛집 합성 마커 화면이다. 어드민 키 등록·연결 테스트 UI(`/admin/settings/map`) 까지가 이 도메인의 책임 범위 — friendly 의 `MapProviderConfig` 테이블에서 시작해 web 의 OpenLayers `Map` 인스턴스까지 끊김 없이 한 줄로 이어진다.

키는 운영자가 vworld 콘솔에서 발급받아 어드민 화면에 붙여넣어 등록한다. 어드민 화면은 평문 `apiKey` 를 다시 받아 `probeVworldKey` 로 한 장 타일을 fetch 해 보고 OK/거부를 즉시 보여준다. 같은 키를 공개 페이지가 호출할 수 있도록 `/api/v1/settings/map/public` 만 인증 없이 열어두고, 어드민 보호 라우트와 평문 응답을 그대로 공유한다 (보안 등급 동일 — 키는 어차피 브라우저 Network 탭에 노출되는 클라이언트 사이드 자원).

`MapCanvas` 호출자 요약:

| 호출자 | 라우트 | 마커 | variant |
|---|---|---|---|
| `VWorldMap` | 어드민 식당 상세 사이드 카드 + 슬라이드오버 | 1개 | primary |
| `PublicRestaurantsMap` | 공개 `/restaurants` | N개 (검색 결과) | primary |
| `DiscoverMap` | 어드민 `/admin/discover` | N개 (검색 + 등록 합성) | primary (검색) / muted (등록) |

## Architecture [coverage: high -- 9 sources]

저레벨 캔버스 한 개와 세 개의 화면별 wrapper 로 구성된다.

1. **`MapCanvas`** ([apps/web/src/components/restaurant/MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx)) — vworld WMTS 키를 받아 OpenLayers `Map` 인스턴스를 만들고, 마커 배열·선택 상태·viewport 콜백·tile 에러 콜백을 props 로 받는다. 마커 클릭 → `onMarkerSelect`, 사용자 패닝/줌 → `onViewportChangeEnd`. `useImperativeHandle` 로 `flyTo` / `fitToMarkers` 를 외부에 노출 — 카드 호버 시 부드럽게 마커로 이동하는 식의 imperative 동작 전용.
2. **`VWorldMap`** ([apps/web/src/components/restaurant/VWorldMap.tsx](../../apps/web/src/components/restaurant/VWorldMap.tsx)) — 어드민 식당 상세 단일 마커 wrapper. `useMapProviderSecret('vworld')` 로 평문 키를 가져와 `MapCanvas` 에 박는다. 좌표 누락/키 누락/로딩/타일에러 4가지를 `<Placeholder>` 로 분기. 한 줄짜리 컴포넌트 — 책임은 admin secret hook + placeholder UI 뿐.
3. **`PublicRestaurantsMap`** ([apps/web/src/components/restaurant/PublicRestaurantsMap.tsx](../../apps/web/src/components/restaurant/PublicRestaurantsMap.tsx)) — 공개 `/restaurants` 지도 wrapper. `useMapPublicConfig` (인증 없는 라우트) 로 키 가져옴. 마커 hover/select 동기화, "이 지역에서 재검색" 버튼, "전체 영역" 토글이 여기 살고, 핸들 ref 로 `flyTo` 를 호출해 카드 호버를 마커 이동에 매핑한다.
4. **`DiscoverMap`** ([apps/web/src/components/admin/discover/DiscoverMap.tsx](../../apps/web/src/components/admin/discover/DiscoverMap.tsx)) — 어드민 발견(`/admin/discover`) 페이지 wrapper. 검색 결과(빨강) + 이미 등록된 맛집(회색) 을 한 지도에 합성. 같은 placeId 가 양쪽에 있으면 `muted` 우선해 중복 크롤 방지. 디테일은 [web](web.md) 토픽 참고.

`MapCanvas` 의 `MapMarker` 는 색 분기를 위한 `variant` 필드를 받는다. 내부 헬퍼 `PIN_COLORS: Record<NonNullable<MapMarker['variant']>, { base, selected }>` 가 `'primary'` (빨강 — `#ef4444`/`#dc2626`) 와 `'muted'` (회색 — `#94a3b8`/`#64748b`) 두 톤을 제공한다. variant 미지정 시 `'primary'` 가 기본 — 기존 호출자 전부 backward compat. selected 강조는 양 variant 공통 — 색 톤이 진해지고 핀 사이즈 32x48 → 40x60.

`MapCanvas` 는 컨테이너 사이즈 변화를 자체 감지한다. `ResizeObserver` 가 `containerRef` 를 관찰하다가 변동 시 `map.updateSize()` 를 자동 호출, cleanup 에서 `disconnect()` 한다. OpenLayers 는 컨테이너 reflow 를 자체적으로 감지하지 않아 호출자가 명시적으로 `updateSize()` 를 부르지 않으면 패널 토글 직후 지도가 일그러질 수 있는데, 이걸 컴포넌트 레벨에서 한 번에 흡수한다 — 좌/우 패널 토글 (어드민 발견, 공개 맛집), 윈도우 리사이즈, 어드민 detail 슬라이드오버 모두 호출자가 신경쓸 일이 없다.

키 저장은 `MapProviderConfig` 테이블 단일. AI 키와 같은 patten 이지만 모델/동시성 같은 LLM 옵션이 없어 더 단순하다 — `provider` 유니크 키 + `apiKey` 평문 + `domains` 자유 메모 + `updatedAt`/`updatedById` 가 끝.

라우트는 admin 보호 4개 + 공개 1개로 분리 ([apps/friendly/src/modules/settings/map.route.ts](../../apps/friendly/src/modules/settings/map.route.ts)):

```
GET    /api/v1/admin/settings/map              -- list + 합성 빈 행 (vworld)
PUT    /api/v1/admin/settings/map/:id          -- upsert (apiKey 빈문자열은 무시)
DELETE /api/v1/admin/settings/map/:id          -- 행 삭제
GET    /api/v1/admin/settings/map/:id/secret   -- 평문 키 (admin 가드)
GET    /api/v1/settings/map/public             -- 평문 키 (공개; 미등록 시 404)
```

URL helper 는 `Routes.SettingsMap` ([packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) line 124-130) 한 자리에서 정의.

지원 provider 는 zod enum `MapProviderId = z.enum(['vworld'])` ([packages/api-contract/src/schemas/settings-map.ts](../../packages/api-contract/src/schemas/settings-map.ts)) — 카카오/네이버 추가 시 enum 만 늘리면 된다. 현재 `MapSettingsService.list()` 가 `known: MapProviderIdType[] = ['vworld']` 를 상수로 들고 있어 실제 row 가 없어도 빈 카드 한 장은 늘 응답에 들어간다.

## Talks To [coverage: high -- 8 sources]

- **friendly DB (`MapProviderConfig`)** -- 평문 키 1행 저장. AI 와 달리 env fallback 없음 — vworld 키는 운영자가 콘솔에서 직접 발급받는 1:1 자원이라 `.env` 기본값 개념이 어색하다 ([map.service.ts](../../apps/friendly/src/modules/settings/map.service.ts) line 11-13).
- **vworld API CDN (`https://api.vworld.kr/req/wmts/1.0.0/`)** -- 직접 타일만 호출. JS SDK (`vw.ol3.Map`) 는 안 쓴다 — SDK 는 init URL 의 도메인 화이트리스트 검증이 fragile (localhost/staging/prod 마다 별도 등록). WMTS 직접 호출은 키만 검증하고 origin 검증을 안 해서 어떤 origin 에서도 동작한다 ([apps/web/src/lib/vworld.ts](../../apps/web/src/lib/vworld.ts) line 1-3).
- **api-contract (zod 스키마)** -- `MapProviderId`, `MapProviderConfig`, `MapProviderListResult`, `UpdateMapProviderInput`, `MapProviderSecret`, `MapProviderPublicConfig`. `Routes.SettingsMap` 5개 URL helper.
- **shared (`settingsMapApi`, `useSettingsMap`)** -- `list/update/remove/getSecret/publicConfig` API 함수와 동명 React Query hooks. `useUpdateMapProvider` 의 `onSuccess` 가 secret 캐시도 같이 invalidate — stale 키로 OL `Map` 이 init 되면 도메인 화이트리스트 가설 하에 (혹시라도) 거부될 수 있어 보수적으로 같이 비운다 ([useSettingsMap.ts](../../packages/shared/src/hooks/useSettingsMap.ts) line 24-30).
- **admin UI** -- `AdminSettingsPage` 가 탭 컨테이너 (AI 키 / 지도 두 탭), `AdminMapKeysPage` 가 provider 카드 + 폼 + 연결 테스트, `AdminLayout` sidebar 의 "설정" 항목이 진입점.
- **admin restaurant detail** -- `AdminRestaurantDetailPage` 의 우측 사이드바 카드(280px) + Maximize2 버튼 → Radix Dialog 우측 슬라이드오버 (740px) 에 별도 `VWorldMap` 인스턴스. 한 OL Map 을 두 컨테이너로 옮기는 setTarget 트릭은 view/layer 상태가 어색해져 안 쓴다 — 두 인스턴스 비용은 무시할 만하다 ([AdminRestaurantDetailPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx) line 700-706 주석).
- **public restaurants page** -- `RestaurantsPage` (라우트 `/restaurants`) → `PublicRestaurantsMap` 가 `appliedBbox` URL 쿼리와 viewport 변경을 비교해 "이 지역에서 재검색" 버튼을 토글.
- **admin discover page** -- `AdminDiscoverPage` (라우트 `/admin/discover`) → `DiscoverMap` ([apps/web/src/components/admin/discover/DiscoverMap.tsx](../../apps/web/src/components/admin/discover/DiscoverMap.tsx)) 가 검색 결과 (`primary`) 와 이미 등록된 맛집 (`muted`) 을 한 지도에 합성해 `MapCanvas` 로 넘긴다. 같은 placeId 가 양쪽에 있으면 muted 우선 — 중복 크롤 방지를 위해 회색 핀이 검색 빨강을 가린다.

## API Surface [coverage: high -- 6 sources]

**HTTP — admin (인증 + ADMIN 가드, [map.route.ts](../../apps/friendly/src/modules/settings/map.route.ts)):**

- `GET Routes.SettingsMap.list` → `{ providers: MapProviderConfig[] }`. 등록 row 가 없어도 `vworld` 한 장이 항상 합성된 빈 카드로 들어옴 (`hasApiKey: false`, `apiKeyMasked: null`).
- `PUT Routes.SettingsMap.provider(:id)` body=`UpdateMapProviderInput` → `MapProviderConfig`.
  - `apiKey?: string` — 빈/생략은 보존 (변경 안 함). 첫 등록인데 키가 비어 있으면 `400 API 키가 필요합니다`.
  - `domains?: string|null` — `undefined` 보존 / `null` 클리어 / 문자열 set.
- `DELETE Routes.SettingsMap.provider(:id)` → 204 (행 삭제, idempotent — 행이 없어도 204).
- `GET Routes.SettingsMap.secret(:id)` → `{ provider, apiKey: string|null, domains: string|null }`. admin 가드 통과 후 평문 반환. AdminMapKeysPage 의 "연결 테스트" 와 별개로, 어드민 reveal 본 목적은 변경 전 현재 값 확인용.

**HTTP — public (인증 없음):**

- `GET Routes.SettingsMap.publicConfig` → `{ provider: 'vworld', apiKey: string }`. 키 미등록이면 `404 지도 키가 등록되지 않았습니다`. 호출자가 `ApiError.statusCode === 404` 로 분기해 placeholder 노출 ([PublicRestaurantsMap.tsx](../../apps/web/src/components/restaurant/PublicRestaurantsMap.tsx) line 32-33).

**Zod 계약 ([settings-map.ts](../../packages/api-contract/src/schemas/settings-map.ts)):**

| Schema | 형태 |
|---|---|
| `MapProviderId` | `z.enum(['vworld'])` |
| `MapProviderConfig` | `{ provider, hasApiKey, apiKeyMasked, domains, updatedAt }` (기본 GET — 마스킹된 키만) |
| `MapProviderSecret` | `{ provider, apiKey: nullable, domains: nullable }` (admin 평문) |
| `MapProviderPublicConfig` | `{ provider, apiKey: string }` (공개 평문, 미등록 시 라우트가 404) |
| `UpdateMapProviderInput` | `{ apiKey?: string, domains?: string\|null }` (`undefined` = no change, `null` = clear) |

**FE hooks ([useSettingsMap.ts](../../packages/shared/src/hooks/useSettingsMap.ts)):**

- `useMapProviders()` — `['settings', 'map', 'providers']` (어드민 카드 리스트).
- `useUpdateMapProvider()` — onSuccess 시 providers + secret 캐시 둘 다 invalidate.
- `useDeleteMapProvider()` — 동일 캐시 invalidate.
- `useMapProviderSecret(id, enabled=true)` — admin 식당 상세에서. `staleTime: Infinity` + `gcTime: Infinity` (키는 자주 안 바뀜). `enabled` 로 좌표 없는 카드에서 secret 호출을 차단.
- `useMapPublicConfig(enabled=true)` — 공개 페이지. 동일 무한 캐시. `retry: false` — 404 (키 미등록) 는 정상 상태이므로 자동 retry 안 함.

**`MapCanvas` props ([MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx)):**

```ts
interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  variant?: 'primary' | 'muted';                         // 'primary' default — 빨강 핀.
                                                          // 'muted' — 회색 핀 (등록된 맛집 표시용).
}
interface Props {
  apiKey: string;
  markers: MapMarker[];
  selectedMarkerId?: string | null;
  initialCenter?: { lat: number; lng: number; zoom?: number };
  onMarkerSelect?(markerId: string): void;
  onViewportChangeEnd?(viewport: MapViewport): void;     // 사용자 패닝/줌 종료 — programmatic 무시
  onTileError?(): void;                                  // 첫 tileloaderror 한 번만
  className?: string;
}
interface MapCanvasHandle {
  flyTo(lat: number, lng: number, zoom?: number): void;
  fitToMarkers(padding?: number): void;
}
interface MapViewport {
  centerLng: number; centerLat: number; zoom: number;
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number };
}
```

**`VWorldMap` props ([VWorldMap.tsx](../../apps/web/src/components/restaurant/VWorldMap.tsx)):**

```ts
interface Props {
  lat: number | null;
  lng: number | null;
  name: string;          // 마커 라벨 + Dialog 타이틀
  className?: string;    // 사이즈 오버라이드 — 기본 'h-[280px] w-full'
}
```

**`probeVworldKey(apiKey)` ([apps/web/src/lib/vworld.ts](../../apps/web/src/lib/vworld.ts) line 21-35):** `WMTS/{KEY}/Base/7/44/109.png` 한 장을 fetch. `200` + `content-type: image/*` 면 OK. 어드민 카드의 "연결 테스트" 버튼이 호출.

## Data [coverage: high -- 3 sources]

`MapProviderConfig` ([schema.prisma](../../apps/friendly/prisma/schema.prisma) line 56-72, [migration](../../apps/friendly/prisma/migrations/20260508173216_add_map_provider_configs/migration.sql)):

```
id          String   @id @default(cuid())
provider    String   @unique     -- 'vworld' (현재). 카카오/네이버 추가 가능성.
apiKey      String                -- 평문. admin secret + public 라우트 모두 그대로 반환.
domains     String?               -- vworld 콘솔에 등록된 도메인 화이트리스트 메모. 콤마 구분
                                     자유 입력. 서버는 검증 안 함 — UI 카드의 운영자 메모용.
updatedAt   DateTime @updatedAt
updatedById String?               -- 마지막 수정한 admin user id (감사 로그).
```

`provider` 유니크 — 한 provider 당 정확히 한 행. `MapSettingsService.list` 가 `known = ['vworld']` 를 상수로 들고 빈 행을 합성하므로 DB 가 비어 있어도 어드민 화면이 깨지지 않는다 ([map.service.ts](../../apps/friendly/src/modules/settings/map.service.ts) line 17-22).

`apiKeyMasked` 는 GET 응답 가공용 — `maskApiKey` ([ai.config.service.ts](../../apps/friendly/src/modules/ai/ai.config.service.ts) 재사용) 가 앞 4자리 + `***` + 뒤 4자리 형태로 줄인다. 평문 키는 secret/publicConfig 라우트를 거쳐야만 나온다.

env fallback 없음 — `.env` 에 vworld 키를 두지 않는다. 이유는 [Key Decisions](#key-decisions-coverage-high----10-sources) 참고.

## Key Decisions [coverage: high -- 12 sources]

- **vworld JS SDK 거부, OpenLayers + WMTS 직접** -- vworld JS SDK (`vw.ol3.Map`) 는 init URL 에 등록된 도메인 화이트리스트를 매칭한다. localhost/staging/prod 마다 별도 키 또는 콘솔 등록이 필요해 fragile. WMTS 직접 호출은 키만 검증하고 origin 검증을 안 한다. v1 niney-life-pickr 도 같은 결정 — OpenLayers + WMTS 조합은 검증 끝.
- **WMTS endpoint 형태** -- `https://api.vworld.kr/req/wmts/1.0.0/{KEY}/{LAYER}/{z}/{y}/{x}.png`. layer 는 `Base`/`gray`/`midnight`/`Satellite`/`Hybrid`. 현재 `MapCanvas` 는 `Base` 고정 ([MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx) line 100). 위성/다크 등 추가가 필요해지면 prop 으로 노출.
- **tile load 에러 1회 플래그** -- `tileSource.on('tileloaderror', ...)` 핸들러는 한 번 발화 후 `errored = true` 로 잠근다. 한 화면에 타일 수십 장이 동시에 실패할 수 있어 필터링 안 하면 onTileError 가 폭주. 실제로 키가 거부됐는지 한 번만 알면 된다 ([MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx) line 103-108).
- **DB 저장 (`MapProviderConfig`) vs env/yaml** -- 어드민 UI 에서 운영자가 직접 등록·수정·삭제·테스트할 수 있어야 한다. `LlmProviderConfig` 와 같은 패턴. env fallback 을 두지 않는 이유는 vworld 키가 운영자가 콘솔에서 도메인과 짝지어 발급받는 1:1 자원이라 "기본값" 개념이 어색하기 때문 ([map.service.ts](../../apps/friendly/src/modules/settings/map.service.ts) line 11-13).
- **admin secret + public 라우트 보안 등급 동등** -- 분리는 라우트 명/가드만. WMTS 키는 어차피 브라우저 Network 탭에 평문으로 노출되는 클라이언트 사이드 자원이라 "secret" 이라는 이름은 어드민 관리상의 의미일 뿐 실제 비밀이 아니다. 공개 페이지가 admin 가드를 통과 못 하니 라우트만 분리. 어드민의 "현재 키 reveal" 기능을 위해 admin 라우트도 별도로 둔다 ([map.route.ts](../../apps/friendly/src/modules/settings/map.route.ts) line 84-99).
- **`MapCanvas` vs `VWorldMap` 분리** -- 원래 `VWorldMap` 한 컴포넌트 (어드민 단일 마커 전용) 였다. 공개 `/restaurants` 의 다중 마커 + viewport 콜백 + imperative API 요구가 들어오면서 저레벨 wrapper 인 `MapCanvas` 를 추출. 지금 `VWorldMap` 은 placeholder 분기 + admin secret hook 만 담당하는 thin wrapper.
- **imperative API (`flyTo`/`fitToMarkers`)** -- `useImperativeHandle` 로 ref 메서드 노출. 카드 호버 → 마커 이동은 외부 시스템 (OL Map) 동기화에 가까운 side effect 지 derived state 가 아니다 — 매번 props 로 좌표를 내려보내는 declarative 방식은 `<select>` 의 controlled/uncontrolled 같은 어색함을 만든다. ref + animate 가 자연스럽다.
- **사용자 vs programmatic 이동 구분** -- OL `moveend` 는 둘 다 발화한다. 처음 mount 시 `setCenter`/`animate` 한 번 도는 자동 이동까지 잡으면 페이지 로드와 동시에 "이 지역에서 재검색" 버튼이 뜨는 버그. `pointerdrag` + 컨테이너의 `wheel` 이벤트에 hook 을 박아 사용자 인터랙션이 시작된 적 있을 때만 `userInteractedRef = true` 로 마크한다. `flyTo`/`fitToMarkers` 는 호출 직전 `userInteractedRef = false` 로 재설정해 자기 자신이 발사한 moveend 를 무시한다 ([MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx) line 128-153, 200-218).
- **키 미등록은 placeholder** -- 공개 페이지는 `useMapPublicConfig` 의 `error.statusCode === 404` 로 분기, "관리자가 설정 > 지도에서 vworld 키를 등록하면 표시됩니다" 안내. 어드민 식당 상세는 `useMapProviderSecret` 결과의 `apiKey === null` 분기에 `Link to="/admin/settings/map"` 으로 직행. 둘 다 빈 회색 사각형이 아니라 다음 행동이 명시된 카드.
- **마커 스타일 — SVG data-URL Icon** -- 외부 이미지 의존성 없이 한 폴더 안에서 닫힌다. 선택된 마커는 `40x60` (일반은 `32x48`) + 진한 빨강 (`#dc2626` vs `#ef4444`) 으로 톤 강조. 라벨은 선택된 마커에만 — 모든 마커에 라벨 띄우면 시각 노이즈가 심하고 텍스트 collision 처리 비용도 든다 ([MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx) line 237-264, [PublicRestaurantsMap.tsx](../../apps/web/src/components/restaurant/PublicRestaurantsMap.tsx) line 50-51).
- **`MapMarker.variant` 로 marker 색 분기 — 어드민 발견의 검색·등록 통합 마커** -- 어드민 발견 페이지에서 검색 결과(빨강 `primary`) 와 이미 등록된 맛집(회색 `muted`) 을 한 지도에 합성해 보여줘야 한다. 같은 placeId 가 양쪽에 있으면 `muted` 우선해 회색 핀이 빨강을 가리고, 운영자가 "이미 등록됨"을 시각적으로 인지해 중복 크롤을 피한다. 별도 layer 가 아니라 `markers` 배열에 `variant` 만 다르게 박아 한 layer 에서 처리 — `PIN_COLORS` 헬퍼만 분기하면 끝나서 추가 분기 비용이 거의 없다.
- **ResizeObserver 자동 reflow — `map.updateSize()` 분산 호출 회피** -- OpenLayers 는 컨테이너 사이즈 변화를 자체 감지하지 않고 `updateSize()` 를 명시적으로 불러야 한다. 호출자(좌/우 패널 토글, 윈도우 리사이즈, 어드민 detail 슬라이드오버 등) 마다 같은 코드를 반복하는 대신 `MapCanvas` 가 `ResizeObserver` 로 컨테이너를 관찰하고 자동 호출. cleanup 에서 `disconnect()`. 호출자는 사이즈 변경을 신경쓸 필요가 없다.

## Gotchas [coverage: high -- 7 sources]

- **JS SDK 회귀 시 도메인 화이트리스트 부활** -- 만약 누군가 `vw.ol3.Map` 으로 되돌리면 vworld 콘솔에 등록된 도메인과 init URL host 가 정확히 일치해야 한다. `localhost:5173` / `localhost:5174` / staging / prod 다 따로 등록하거나 `*` 와일드카드를 콘솔이 허용하는지 확인 필수. WMTS 직접 호출이 이 부담을 통째로 빼는 이유.
- **`tileloaderror` 플래그는 세션당 1회** -- 한 번 에러를 본 후엔 `errored = true` 로 잠겨 더 이상 콜백이 안 뜬다. 키를 바꾸고도 재시도 시 시각 알림이 안 뜰 수 있으니, 키 변경 후엔 페이지 새로고침이 가장 확실 (or `apiKey` 변경으로 effect 가 통째로 재실행 — 그러면 새 `tileSource` 가 만들어져 플래그도 리셋).
- **programmatic 이동이 user 이동으로 잘못 분류되면 무한 재검색** -- 카드 클릭 → 마커로 fly-to → moveend → 재검색 표시 → URL 갱신 → 데이터 새로고침 → 또 fly-to … 무한 루프. `flyTo`/`fitToMarkers` 가 호출 직전 `userInteractedRef = false` 로 강제 리셋하는 게 이 루프를 끊는 핵심. 새 imperative 메서드를 추가할 때 같은 패턴 유지 필수.
- **평문 키 노출은 의도** -- 어드민 secret 라우트와 public publicConfig 라우트 모두 키를 평문으로 응답한다. WMTS 호출이 어차피 클라이언트에서 일어나기 때문. 보안 등급 차이가 있는 것처럼 라우트를 분리한 건 단지 admin guard vs 비로그인 분리이고 응답 데이터 민감도는 동일. "secret" 이라는 이름이 헷갈리게 만들 수 있어 [Key Decisions](#key-decisions-coverage-high----10-sources) 에 명시.
- **선택된 마커만 라벨** -- 다중 마커 페이지에서 모든 마커에 식당명을 띄우면 시각이 망가진다. `selectedPlaceId === id` 일 때만 `label` 채움 ([PublicRestaurantsMap.tsx](../../apps/web/src/components/restaurant/PublicRestaurantsMap.tsx) line 50-51). hover 시점에는 라벨을 띄우지 않는다 — 호버는 fly-to 만 하고, 라벨이 등장하려면 클릭으로 select 까지 가야 한다.
- **단일 슬라이드오버는 별도 인스턴스** -- 어드민 식당 상세의 280px 사이드 카드와 풀 슬라이드오버는 각각 별도 `VWorldMap` (= 별도 OL `Map`) 을 그린다. 한 인스턴스를 `setTarget` 으로 옮기는 트릭은 OL view/layer 상태가 어색해져 안 쓴다. 메모리/렌더 비용은 무시할 만함 — 두 인스턴스 모두 마커 1개짜리 작은 지도.
- **첫 등록인데 apiKey 빈 PUT 은 거절** -- AI 와 달리 env fallback 이 없어 빈 행은 그대로 "키 없음" 과 동일하다. 그래서 `update()` 가 `existing` 이 없고 `apiKey` 도 비면 `apiKey is required for first registration` 에러를 던지고 라우트가 400 으로 변환 ([map.service.ts](../../apps/friendly/src/modules/settings/map.service.ts) line 42-48).
- **DELETE 후 어드민 카드 즉시 갱신** -- `useDeleteMapProvider` 의 `onSuccess` 가 providers + secret 캐시 둘 다 invalidate. 키 삭제 직후 어드민 식당 상세를 보면 placeholder 가 즉시 "키 미설정" 으로 바뀌어야 정상.
- **ResizeObserver 도입 전엔 명시적 `updateSize()` 호출이 필요했음** -- 회귀 가능성 있는 사이즈 변경 케이스 (예: detail 패널 expand) 가 있으면 자동으로 처리되긴 하나, 컨테이너 자체가 detach/reattach 되는 경우는 ResizeObserver 도 cleanup 됨에 유의. 컨테이너가 unmount → 새 mount 인 케이스라면 새 `MapCanvas` 인스턴스에서 ResizeObserver 가 다시 붙으니 정상 작동, 다만 동일 인스턴스를 다른 DOM 위치로 옮기는 케이스는 없도록 주의.

## Sources

- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)
- [apps/friendly/prisma/migrations/20260508173216_add_map_provider_configs/migration.sql](../../apps/friendly/prisma/migrations/20260508173216_add_map_provider_configs/migration.sql)
- [apps/friendly/src/modules/settings/map.service.ts](../../apps/friendly/src/modules/settings/map.service.ts)
- [apps/friendly/src/modules/settings/map.route.ts](../../apps/friendly/src/modules/settings/map.route.ts)
- [apps/friendly/src/modules/settings/map.test.ts](../../apps/friendly/src/modules/settings/map.test.ts)
- [packages/api-contract/src/schemas/settings-map.ts](../../packages/api-contract/src/schemas/settings-map.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)
- [packages/shared/src/api/settings-map.api.ts](../../packages/shared/src/api/settings-map.api.ts)
- [packages/shared/src/hooks/useSettingsMap.ts](../../packages/shared/src/hooks/useSettingsMap.ts)
- [apps/web/src/lib/vworld.ts](../../apps/web/src/lib/vworld.ts)
- [apps/web/src/components/restaurant/MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx)
- [apps/web/src/components/restaurant/VWorldMap.tsx](../../apps/web/src/components/restaurant/VWorldMap.tsx)
- [apps/web/src/components/restaurant/PublicRestaurantsMap.tsx](../../apps/web/src/components/restaurant/PublicRestaurantsMap.tsx)
- [apps/web/src/routes/admin/AdminSettingsPage.tsx](../../apps/web/src/routes/admin/AdminSettingsPage.tsx)
- [apps/web/src/routes/admin/AdminMapKeysPage.tsx](../../apps/web/src/routes/admin/AdminMapKeysPage.tsx)
- [apps/web/src/components/admin/AdminLayout.tsx](../../apps/web/src/components/admin/AdminLayout.tsx)
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx)
- [apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx)
- [apps/web/package.json](../../apps/web/package.json)
