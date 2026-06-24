---
topic: utils
last_compiled: 2026-06-25
sources_count: 9
status: active
aliases: ["@repo/utils", pure-functions, helpers, slugify, pick-random, thumbnail-url, geo, bbox, compute-bbox-around, is-in-korea, lat-lng, restaurantCategory, formatWonPrice, 원화, 콤마, 카테고리매핑, resolveRestaurantCategoryKey, buildRestaurantMarkerSvg, aiModel, parseModelFamily, groupModelsByFamily, recommendModelForPurpose, isVisionModel, model-family, 모델계열]
---

# utils — 순수 유틸 패키지

**2026-06-25 변경 흡수 — `aiModel.ts` 신규 (모델 id → 계열 묶음 + 용도별 추천)**: AI 모델 선택 UX 를 돕는 순수 휴리스틱이 [`aiModel.ts`](../../packages/utils/src/aiModel.ts) 한 파일로 추가. `parseModelFamily`(Ollama 모델 id `<brand><version>[-variant][:tag]` 에서 첫 콜론/숫자 앞 brand 추출 + 끝 버전 접두 정리) → `groupModelsByFamily`(평면 모델 리스트를 계열별 그룹으로 — 모델 선택 팝업에서 긴 리스트를 사람이 훑기 좋게) + `isVisionModel`(이름 휴리스틱으로 vision 계열 판별) + `recommendModelForPurpose('chat' | 'image' | 'log-analysis', models)`(용도별 기본 모델 프리필 — image=가장 작은 vision, log-analysis=가장 큰 텍스트, chat=중간 규모). 완벽 분류가 아니라 [ai](ai.md) 의 용도별 모델 선택([AdminAiKeysPage](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx))·[logs](logs.md) LLM 실패 분석 모델 추천의 시작점 헬퍼. 순수 문자열 처리라 utils leaf 에 적합.

**2026-05-25 변경 흡수 — `restaurantCategory.ts` 신규 (카테고리 매핑) + `format.ts` 에 원화 콤마 포맷 통일**: 식당 카테고리 → 아이콘 키 정규화 + 마커 SVG 빌더가 [`restaurantCategory.ts`](../../packages/utils/src/restaurantCategory.ts) 한 파일로 들어옴 — 8종 라인 아이콘(korean/japanese/chinese/cafe/dessert/bar/western/snack) + primary/muted 2-variant × selected 2-state 마커. 같은 룰을 [map](map.md) 토픽의 웹/앱 마커 양쪽에서 공유. [`format.ts`](../../packages/utils/src/format.ts) 에 `formatWonPrice(price: string | null): string | null` 추가 — 자유 입력 메뉴 가격을 `12,000원` / `12,000원 ~ 18,000원` 콤마 포맷으로 통일 (커밋 `078cbe1`). 단일 숫자/범위(`~`/`-`/`–`/`—`)/혼합 문자열 모두 처리, 0 이하/숫자 외 입력은 원문 보존.

**2026-05-19 변경 흡수 — geo 모듈 신규**: [geo.ts](../../packages/utils/src/geo.ts) 가 위경도 다루는 순수 유틸 한 파일로 추가. (1) `computeBboxAround(center: LatLng, radiusKm: number): Bbox` — 사용자 위치 주변 정사각형 bbox. 1° latitude ≈ 111.32 km 평균 + cos(lat) longitude 보정. 짧은 거리(≤수 km) 정사각 근사로 Haversine 등 측지 거리 불필요. (2) `isInKorea(coords): boolean` — vworld 타일 가드 (본토·제주·울릉 포함 124.5~131.9 lng, 33.0~38.7 lat). 시뮬레이터/실 사용자가 한국 밖이면 vworld 타일이 전부 404 떨어지므로 폴백 트리거. `LatLng`/`Bbox` 인터페이스 export — 웹(`useUserLocation`) 과 앱(`useUserLocationNative`) 양쪽이 같은 모양으로 소비.

## Purpose [coverage: high — 2 sources]

`@repo/utils` — 순수 함수 모음. FE/BE 모두에서 import 가능한 사이드 이펙트 없는 헬퍼만 모아 둔다. 외부 npm 의존이 0개고 어떤 런타임(Node, 브라우저, RN)에서도 실행된다. CLAUDE.md의 의존 그래프상 leaf 노드 — `shared`, `api-contract`, 모든 앱이 여기로 들어올 수 있지만 utils는 어디로도 의존하지 않는다. 도메인 함수(`pickRandom`/`shuffle`은 Pick 추첨, `restaurantCategory`는 지도 마커 분류)와 표현 헬퍼(`reviewThumbnailUrl`은 friendly 미디어 프록시 URL, `formatWonPrice`는 메뉴 가격 통일)가 공존한다.

## Architecture [coverage: high — 7 sources]

`src/{domain}.ts` 단일 도메인 단위 + `src/index.ts` 배럴:

```
packages/utils/
├── src/
│   ├── index.ts             // export * (각 모듈 re-export)
│   ├── date.ts              // toISOString, fromISOString, isValidDate
│   ├── format.ts            // truncate, capitalize, slugify, formatWonPrice (신설, 078cbe1)
│   ├── geo.ts               // LatLng, Bbox, computeBboxAround, isInKorea
│   ├── random.ts            // pickRandom, shuffle
│   ├── restaurantCategory.ts // 카테고리 키 정규화 + 마커 SVG 빌더 (신설)
│   ├── thumbnail.ts         // reviewThumbnailUrl
│   └── vworld.ts            // vworld 타일 헬퍼
├── package.json             // build 없음 — src 그대로 export
└── tsconfig.json
```

api-contract와 같은 빌드 없는 패턴: `package.json`이 `./src/*.ts`를 직접 main/types/exports로 노출. 서브패스 import 지원: `@repo/utils/date`, `@repo/utils/format`, `@repo/utils/random`. (참고: `thumbnail` / `geo` / `restaurantCategory` 는 `package.json`의 `exports`에 서브패스가 아직 등록돼 있지 않아 배럴 경유로만 접근 — `import { ... } from '@repo/utils'`)

## Talks To [coverage: medium — 1 sources]

- 컨슈머: `apps/friendly`, `apps/web`, `apps/mobile`, `packages/shared` — 어디서나 import 가능
- 의존: 없음 (외부 npm 0개, 워크스페이스 0개) — 진짜 leaf 노드
- `reviewThumbnailUrl`은 friendly의 `/api/v1/media/thumbnail` 프록시 라우트 (friendly 의 [media 모듈](friendly.md))를 가리키므로 클라이언트에서 friendly 도메인과 같은 origin이거나 base URL이 적용된 fetcher와 함께 쓰여야 한다
- `restaurantCategory` 의 마커 SVG 는 [map 토픽](map.md) 의 OpenLayers (웹) / React Native Maps (앱) 양쪽에서 카테고리별 라인 아이콘 8종으로 직접 사용 — data URL 형태로 OL Icon.src 에 그대로 들어감

## API Surface [coverage: high — 7 sources]

[`date.ts`](../../packages/utils/src/date.ts):
- `toISOString(date?: Date): string` — 기본값 `new Date()`
- `fromISOString(iso: string): Date`
- `isValidDate(date: unknown): date is Date` — 타입 가드

[`format.ts`](../../packages/utils/src/format.ts):
- `truncate(text: string, max: number): string` — 초과 시 `…` (말줄임표) 추가
- `capitalize(text: string): string` — 첫 글자 대문자
- `slugify(text: string): string` — lowercase + trim + 비단어 제거 + 공백/언더스코어 → 하이픈
- `formatWonPrice(price: string | null | undefined): string | null` — 신설 (078cbe1). 빈/falsy → `null`. 단일 숫자(`12000` / `12,000원` / `₩12000`) → `12,000원`. 범위(`12000~18000`, `12,000 - 18,000원`, `–`/`—` 구분자 포함) → `12,000원 ~ 18,000원`. 혼합 텍스트는 안에 등장한 `숫자+원` 패턴만 콤마로 재포맷 (예: `점심 12000원 / 저녁 18000원` → `점심 12,000원 / 저녁 18,000원`). 0 이하 / 숫자 외 입력은 원문 그대로 보존 — 파싱 실패 시 안전한 fallback

[`geo.ts`](../../packages/utils/src/geo.ts):
- `interface LatLng { lat: number; lng: number }`
- `interface Bbox { minLng: number; minLat: number; maxLng: number; maxLat: number }`
- `computeBboxAround(center: LatLng, radiusKm: number): Bbox` — 정사각 근사
- `isInKorea(coords: LatLng): boolean` — vworld 타일 가드

[`random.ts`](../../packages/utils/src/random.ts):
- `pickRandom<T>(items: readonly T[]): T` — 빈 배열 시 throw
- `shuffle<T>(items: readonly T[]): T[]` — Fisher-Yates, 입력 비변경

[`restaurantCategory.ts`](../../packages/utils/src/restaurantCategory.ts) — 신설:
- `RESTAURANT_CATEGORY_KEYS` — `readonly ['korean', 'japanese', 'chinese', 'cafe', 'dessert', 'bar', 'western', 'snack']`
- `type RestaurantCategoryKey` — 위 배열의 union
- `type RestaurantMarkerVariant = 'primary' | 'muted'` — 빨강(기본/검색결과) vs 회색(이미 등록됨)
- `resolveRestaurantCategoryKey(category: string | null | undefined): RestaurantCategoryKey | null` — 백엔드 자유 문자열(`"한식 > 백반"`, `"이자카야"`, `"디저트카페"`)을 정규식 우선순위 테이블로 매칭. `bar > dessert > cafe > japanese > chinese > western > snack > korean` 순 (이자카야가 일식이 아닌 술집으로, 디저트카페가 카페가 아닌 디저트로 잡히도록)
- `buildRestaurantMarkerSvg(key: RestaurantCategoryKey | null, selected: boolean, variant?: RestaurantMarkerVariant): string` — selected = 32×48 핀(꼭지점이 좌표), 비선택 = 26×26 원(중심이 좌표). 안쪽에 24px viewBox 라인 아이콘 8종 + GENERIC fallback
- `buildRestaurantMarkerDataUrl(key, selected, variant?): string` — 위 SVG 를 `data:image/svg+xml;charset=utf-8,` URL 로 — OpenLayers `Icon.src` 에 직접 주입 가능

[`thumbnail.ts`](../../packages/utils/src/thumbnail.ts):
- `reviewThumbnailUrl(originalUrl: string, width = 300, quality?: number): string` — friendly의 `/api/v1/media/thumbnail?url=…&w=…&q=…` 프록시 URL을 빌드. FE가 직접 query string을 조립하지 않게 중앙화

## Data [coverage: low — 0 sources]

상태/저장소 없음 — 순수 함수만.

## Key Decisions [coverage: medium — 3 sources]

- **순수 함수만** — 상태/IO 있는 헬퍼는 여기 들어오지 않는다 ([shared](shared.md) 또는 앱 내부로). 도메인 로직(`reviewThumbnailUrl`처럼 friendly URL을 알고 있는 함수, `buildRestaurantMarkerSvg`처럼 SVG 문자열을 빌드하는 함수)은 "문자열만 만든다"는 순수성 한도 내에서만 허용
- **외부 의존 0** — 가벼운 leaf 패키지로 유지해 트리 셰이킹/배포 부담 최소화. `restaurantCategory` 도 SVG 빌더를 순수 문자열 concat 으로 작성 — DOM API / React Native View 의존 없이 어디서나 import 가능
- **카테고리 매핑을 utils 에** — 웹(`apps/web`)·앱(`apps/mobile`) 양쪽 지도 마커가 같은 정규화 룰 + 동일 아이콘 세트를 써야 디자인 일관성 유지. 한쪽 앱에 두면 다른 쪽이 dup 매핑을 만들기 쉬워 utils 의 leaf 위치가 적합. 백엔드 category 필드가 자유 문자열이라 정규식 contains 매칭 — enum 화는 백엔드 데이터 정리 후로 미룸
- **빌드 없음** — `src/*.ts`를 직접 export. tsx (friendly), Vite (web), Metro (mobile) 모두 그대로 처리
- **서브패스 export** — 트리셰이킹 안 되는 컨슈머도 `@repo/utils/random`만 가져갈 수 있음 (단 `thumbnail`/`geo`/`restaurantCategory` 는 아직 서브패스 미등록)
- **원화 포맷 통일** — 메뉴 가격은 백엔드/크롤러가 `12000`, `12,000원`, `12000~18000` 등 자유 입력 — `formatWonPrice` 한 함수로 통일해 웹/앱이 같은 표기 (콤마 + `원` + 범위는 `~` 구분자). 파싱 실패는 원문 보존 — 절대 빈 문자열로 변질되지 않음

## Gotchas [coverage: medium — 3 sources]

- 새 헬퍼 모듈 추가 시 [`index.ts`](../../packages/utils/src/index.ts) 배럴에 `export *`를 빠뜨리기 쉬움 — `thumbnail.ts` / `geo.ts` / `restaurantCategory.ts` 모두 추가 때 같이 갱신해야 컨슈머가 찾을 수 있다 (현재 7개 모듈 전부 등록됨)
- 새 모듈을 서브패스로 노출하려면 [`package.json`](../../packages/utils/package.json) `exports` 맵도 추가해야 함 — `thumbnail` / `geo` / `restaurantCategory` 는 현재 미등록 (배럴 경유만 가능)
- `pickRandom`은 빈 배열 시 throw — 호출자가 사전 체크 필요
- `Math.random()` 사용 — 암호학적 안전성이 필요하면 `crypto.getRandomValues()` 기반 별도 헬퍼를 추가할 것 (현재는 Pick 추첨용으로 충분)
- `reviewThumbnailUrl`은 절대 URL이 아닌 path만 반환 — 다른 origin에서 호출한다면 base URL을 별도로 prepend해야 함
- `resolveRestaurantCategoryKey` 의 키워드 테이블에 새 카테고리 enum 을 추가했다면 `ICON_PATHS` (라인 아이콘) 도 같이 추가해야 — 매핑은 성공하는데 아이콘이 없으면 TS 타입 에러로 빌드 시점에 잡히긴 하지만 runtime 색만 보이고 모양은 GENERIC 으로 떨어지는 실수 가능
- 카테고리 매칭 우선순위는 정규식 순서 의존 — `bar > dessert > cafe > japanese > chinese > western > snack > korean`. 새 키워드 추가 시 더 specific 한 것을 위로 둬야 (예: "이자카야" 가 일식보다 술집으로 잡혀야 함)
- `formatWonPrice` 의 범위 구분자는 `~|〜|-|–|—` 만 인식 — `to`, `→` 등은 단일 숫자/혼합 텍스트 분기로 빠짐. 백엔드/크롤러가 다른 구분자를 쓰기 시작하면 정규식 보강 필요

## Sources [coverage: high — 8 sources]

- [packages/utils/package.json](../../packages/utils/package.json)
- [packages/utils/src/index.ts](../../packages/utils/src/index.ts)
- [packages/utils/src/date.ts](../../packages/utils/src/date.ts)
- [packages/utils/src/format.ts](../../packages/utils/src/format.ts)
- [packages/utils/src/geo.ts](../../packages/utils/src/geo.ts)
- [packages/utils/src/random.ts](../../packages/utils/src/random.ts)
- [packages/utils/src/restaurantCategory.ts](../../packages/utils/src/restaurantCategory.ts)
- [packages/utils/src/thumbnail.ts](../../packages/utils/src/thumbnail.ts)
