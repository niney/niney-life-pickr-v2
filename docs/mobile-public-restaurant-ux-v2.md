# 공개 맛집 페이지 — 모바일 바텀시트 패턴 (v2)

> Status: **적용 완료**
> Last updated: 2026-05-18
> Base: `/restaurants` (v1, [mobile-public-restaurant-ux.md](./mobile-public-restaurant-ux.md))
> 관련 커밋: `6adf917` `6899e30` `5cfd186` `36ba145` `8a09b34`

## 0. TL;DR

`/restaurants-v2` 신설. 모바일에서 **목록/지도 탭 토글** → **네이버 지도식 바텀시트 + sticky 통합 헤더** 로 전환. 데스크톱(xl+ 1280px 이상) 은 기존 3-column 그대로.

핵심 결정:

- **3-snap 시트 (peek / half / full)** — `@use-gesture/react` 드래그. snap 전환 220ms transform animation
- **Dual-mode 시트 (fixed ↔ scroll)** — peek/half 는 `position:fixed` + transform, full 정착 시 `position:static` 으로 swap. body 스크롤이 활성화되어 모바일 브라우저 주소창 자동 minify 발동
- **단일 sticky 통합 헤더** — `PublicTopBar` 의 root `<header>` 안에 검색·카테고리 행을 `subBar` slot 으로 주입. 두 sticky 가 별도 element 면 dvh 변동 시 paint 어긋남 발생 → 한 몸으로 묶어 회피
- **ResizeObserver 로 헤더 실측** — 시트의 `topOffset` 을 상수가 아닌 실측 px. subBar 컨텐츠가 변하거나 detail 진입으로 사라져도 자동 동기화
- **viewKey per-view 스크롤 메모리** — list↔detail 전환 시 list 의 스크롤 자동 저장/복원, detail 은 항상 top 부터

## 1. 배경

v1 `/restaurants` 의 모바일 동작 (기존 문서 [mobile-public-restaurant-ux.md](./mobile-public-restaurant-ux.md) 참조):

- xl 미만: 하단 fixed pill `[목록 | 지도]` 토글로 list / fixed map 전환
- 카드 클릭 시 상세 라우트 풀스크린 진입, 전역 TopBar hidden

문제 / 한계:

1. 토글 방식이라 list 와 map 을 동시에 못 봄 (네이버 지도식 부분 노출 UX 가 더 자연스러움)
2. 상세 진입 시 전역 TopBar 가 사라져 글로벌 네비 접근 불가
3. 모바일에서 목록 → 지도 전환 시 컨텍스트 단절 (사용자가 보던 카드 위치 잃음)

v2 목표:
- 한 화면에 맵 + 목록 부분 노출
- 시트가 맵을 가리는 정도를 사용자가 조절 (peek/half/full)
- TopBar 는 어느 상태에서도 노출
- 상세 진입 시에도 TopBar 유지 + 시트 안에 상세 컨텐츠

## 2. 핵심 결정

### 2-1. 모바일 브라우저 주소창 minify 메커니즘 (제약 사실)

- iOS Safari / Chrome Android 공통: 주소창은 **body(window) 스크롤이 아래로 움직일 때만** 자동으로 줄어듦
- JS 로 강제 못 함 — `window.scrollTo(0, 1)` 트릭은 iOS 8+ 부터 무효
- transform 기반 드래그는 body 스크롤이 아니므로 미동작
- 내부 div 의 `overflow-y:auto` 스크롤도 미동작
- viewport units: `100svh`(small, 주소창 보임) / `100lvh`(large, 숨김) / `100dvh`(dynamic)

⇒ **주소창을 줄이려면 그 순간엔 body 가 실제로 스크롤되는 구조여야 한다.** 이게 dual-mode 의 존재 이유.

### 2-2. Dual-mode 시트

|                       | mode='fixed'                | mode='scroll'                          |
|-----------------------|-----------------------------|----------------------------------------|
| snap=peek/half        | ✅ transform 드래그          | (사용 안 함)                            |
| snap=full (드래그 중) | ✅ (마지막 프레임)            | ✗                                       |
| snap=full (정착 후)   | (transition 직후)            | ✅ body 스크롤 → **주소창 minify**       |

전이 타이밍:

- **peek/half → full**: 드래그 종료 후 transition (220ms) 완료 시 `fixed→scroll` swap. 두 모드 모두 viewport 를 정확히 덮으므로 시각 점프 X
- **full → peek/half**: 드래그 시작 시 `scroll→fixed` swap (즉시). scrollY 를 scrollPosRef 에 저장해 fixed 모드 inner 컨테이너에 미러
- **외부 snap 변화 (예: 카드 클릭으로 setSnap('half'))**: useLayoutEffect 가 mode 를 자동 동기화 (snap≠full + mode=scroll → setMode('fixed') 즉시 / snap=full + mode=fixed → 220ms 후 setMode('scroll'))

### 2-3. 한 몸 sticky 통합 (v1 sticky 구조의 한계 해결)

초기 v2 구현은 TopBar(`PublicLayout`) 와 SearchRow(`RestaurantsV2Page`) 가 각자 별도 sticky element. 증상:

- snap=full 에서 시트를 collapse 할 때 브라우저가 주소창을 다시 표시 → dvh 가 jump
- 두 sticky 가 서로 다른 타이밍에 reflow → 한 프레임 겹침 / TopBar 잠시 사라짐

해결: PublicTopBar 에 `subBar` slot prop 추가. root `<header>` 안에 두 번째 row 로 렌더 → **단일 sticky element**. dvh 변동이 한 단위로 일어나 어긋남 없음.

### 2-4. viewKey 스크롤 메모리

BottomSheet 의 `viewKey` prop. 값이 바뀌면:

1. 이전 viewKey 의 scroll 위치를 `scrollByViewKeyRef[prev]` 에 저장
2. 새 viewKey 의 저장된 scroll (없으면 0=top) 을 `scrollPosRef` 에 로드
3. 다음 mode 적용 단계에서 inner.scrollTop 또는 window.scrollY 에 적용

결과:
- list (scrollY=1200) → 카드 클릭 → detail 진입: detail 은 top 부터, list 의 1200 저장
- detail → 닫기 → list 복귀: list 의 1200 자동 복원

## 3. 아키텍처 (모바일 xl-)

```
┌────────────────────────────────────────────────────┐ y=0
│  PublicTopBar (sticky top-0, single element)       │
│  ┌──────────────────────────────────────────────┐  │
│  │  row 1: 햄버거 + 로고 + NAV (h-14)            │  │
│  ├──────────────────────────────────────────────┤  │
│  │  row 2: subBar slot                          │  │
│  │  → list 모드: PublicRestaurantListHeader     │  │
│  │     (검색 input + 카테고리 칩 + 총/정렬)      │  │
│  │  → detail 모드: null (헤더 영역 회수)         │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  headerHeight = ResizeObserver(headerRef).height   │
├────────────────────────────────────────────────────┤ y=headerHeight
│  PublicRestaurantsMap (fixed inset-x-0 bottom-0,    │
│                          top:${headerHeight}, z-0)  │
│  ...                                                │
│                                                    │
│  BottomSheet (topOffset = headerHeight, z-20)      │
│  ┌──────────────────────────────────────────────┐  │
│  │  drag handle (sticky, hit-area 48px)         │  │
│  ├──────────────────────────────────────────────┤  │
│  │  content (list body or detail Outlet)        │  │
│  │  ...                                          │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘ y=100dvh
```

## 4. 데스크톱 (xl+) 분기

같은 페이지 컴포넌트 안에서 CSS 로 분기:

- `<div className="hidden xl:flex">` 데스크톱 3-column (기존 RestaurantsPage 동일):
  - 좌: `PublicRestaurantList` (sticky 헤더 내장, 좌/우 패널 토글)
  - 중: nested `<Outlet />` (detail 컬럼)
  - 우: `PublicRestaurantsMap`
- `<div className="xl:hidden">` 모바일 시트 패턴
- subBar 컨테이너에 `xl:hidden` → 데스크톱은 display:none → headerHeight 자동으로 56 (TopBar 만)
- BottomSheet 는 xl- 영역 안에서만 mount → 데스크톱은 시트 무관

## 5. 코드 위치

| 파일 | 역할 |
|---|---|
| `apps/web/src/components/PublicTopBar.tsx` | subBar slot + ResizeObserver 로 headerHeight 측정 |
| `apps/web/src/components/PublicLayout.tsx` | subBar/headerHeight state, outlet context, `usePublicLayout()` 훅 |
| `apps/web/src/components/restaurant/PublicRestaurantList.tsx` | `PublicRestaurantListHeader` / `PublicRestaurantListBody` / `PublicRestaurantList` 세 export — v2 가 헤더만 따로 가져다 쓰기 위한 분리 |
| `apps/web/src/components/restaurant-v2/BottomSheet.tsx` | dual-mode 시트, 3-snap, viewKey 메모리, snap 자동 동기화 |
| `apps/web/src/routes/RestaurantsV2Page.tsx` | xl+ 3-column + xl- 시트 패턴. subBar 등록/해제. snap 진입/복귀 |
| `apps/web/src/routes/RestaurantDetailRoute.tsx` | useMatch 로 v2 경로 감지해 닫기 navigate 경로 동적 분기 |
| `apps/web/src/App.tsx` | `/restaurants-v2` 와 nested `:placeId` 라우트 |
| `apps/web/vite.config.ts` | React duplicate 방지용 root react alias |

## 6. BottomSheet 동작 세부

### 6-1. props

```ts
interface Props {
  children: React.ReactNode;
  snap?: Snap;                 // 'peek' | 'half' | 'full' — 외부 제어
  onSnapChange?(next: Snap): void;
  peekHeight?: number;         // peek 일 때 최소 시각 높이 (px)
  halfRatio?: number;          // half 비율 (vh - topOffset 대비)
  topOffset?: number;          // 시트가 침범 못하는 상단 영역 (px)
  viewKey?: string;            // 컨텐츠 식별자 — per-view scroll 메모리
}
```

### 6-2. 내부 state / ref

- `vh` (state): `window.innerHeight` — visualViewport resize 이벤트로 추적
- `snap` / `dragDy` / `isDragging` (state): 시트 위치
- `mode` (state): 'fixed' | 'scroll'
- `scrollPosRef` (ref): 현재 viewKey 의 적용 대상 scroll 위치
- `scrollByViewKeyRef` (ref): `{ [viewKey]: scrollY }` 메모리
- `innerContentRef` (ref): fixed 모드 inner overflow 컨테이너
- `modeRef` / `snapRef` (ref): 드래그 핸들러에서 동기 참조용

### 6-3. 드래그 처리 (`useDrag`)

- 핸들에만 바인딩 (`{...bind()}` on handle div)
- `filterTaps: true`, `axis: 'y'`
- `first` 이고 `mode === 'scroll'` 이면 `beginDragFromScroll()`:
  - `scrollPosRef.current = window.scrollY`
  - `setMode('fixed')` — 이후 transform 드래그
  - **scrollY 가드 없음** — 핸들은 sticky 라 항상 받음 (initial 가드는 사용자 보고 후 제거됨)
- `last` 이면 `pickSnap(finalH, vy, dyDir)` 으로 가장 가까운 스냅 선택 (velocity 가속 적용)

### 6-4. 두 useLayoutEffect

**mode + viewKey 변화 effect** (`[mode, viewKey]`):
1. viewKey 가 바뀌었으면: outgoing scroll 저장, 새 키 scroll 로드
2. mode === 'fixed': html overflow 잠금, inner.scrollTop = scrollPosRef
3. mode === 'scroll': html overflow 해제, window.scrollTo(0, scrollPosRef)

**snap → mode reconciliation effect** (`[snap, mode, isDragging]`):
- 드래그 중이면 skip
- snap=full + mode=fixed: `setTimeout(setMode('scroll'), 220)`
- snap≠full + mode=scroll: 즉시 setMode('fixed')

## 7. 페이지의 detail 진입/복귀 처리

```ts
// RestaurantsV2Page
const snapBeforeDetailRef = useRef<Snap>('peek');

const handleSelectItem = useCallback((id: string) => {
  snapBeforeDetailRef.current = snap;           // 진입 전 snap 보존
  navigate({ pathname: `/restaurants-v2/${id}`, search: ... });
  setSnap('half');                              // 상세가 잘 보이도록
}, [navigate, snap]);

// 닫기는 RestaurantDetailRoute 의 onClose 가 navigate('/restaurants-v2') 처리.
// 그 결과 placeId 가 null 이 되는 걸 감지해 snap 복원.
const prevPlaceIdRef = useRef(placeId);
useEffect(() => {
  if (prevPlaceIdRef.current !== null && placeId === null) {
    setSnap(snapBeforeDetailRef.current);
  }
  prevPlaceIdRef.current = placeId;
}, [placeId]);
```

viewKey 자동 메모리와 결합:

| 단계 | snap | mode | view | body scrollY | inner scrollTop |
|---|---|---|---|---|---|
| 초기 | peek | fixed | list | 0 | 0 |
| 핸들 → full | full | scroll | list | 0 | — |
| body 스크롤 600 | full | scroll | list | **600** | — |
| 카드 클릭 | half | fixed | **detail** | 0 | **0** (top) |
| 닫기 (X) | **full** | scroll | **list** | **600** (복원) | — |

## 8. 실패한 시도와 회복

| # | 시도 | 결과 | 해결 |
|---|---|---|---|
| 1 | `@use-gesture/react` 의 `pointer: { touch: true }` 옵션 | Chrome 데스크톱 mouse 드래그 무시 | 옵션 제거 (pointer events 가 mouse+touch 모두 처리) |
| 2 | scroll 모드에서 핸들 드래그 시 `scrollY > 0` 면 cancel | scrollY > 0 일 때 핸들 무반응 (사용자 보고) | 가드 제거. scroll mode 진입 시 scrollY 저장 후 fixed swap |
| 3 | TopBar + SearchRow 별도 sticky | 주소창 변동 시 paint 어긋남 (사용자 보고) | PublicTopBar 에 subBar slot 통합 |
| 4 | SEARCH_ROW_HEIGHT=140 상수 | subBar 컨텐츠 변동 시 시트 위치 어긋남 | ResizeObserver 실측 |
| 5 | scrollPosRef 를 매번 0 reset | detail 닫고 돌아오면 list 가 top 으로 (사용자 보고) | viewKey per-view 메모리 |
| 6 | (별도) root `react@19.1.0` + `react-dom@19.2.6` 버전 mismatch | "Invalid hook call" / useMemo=null | 모든 워크스페이스의 react 를 19.1.0 으로 통일 + vite alias 강제 |

## 9. 검증 시나리오 (실기기)

1. **peek → drag up → half → drag up → full**: 시트 부드럽게 확장, full 정착 후 220ms 내 mode swap
2. **full + body 스크롤**: 주소창 자동 minify
3. **full + 스크롤된 상태 + 핸들 collapse**: scroll 모드에서 fixed 모드로 swap, body scrollY 0 로 reset, inner.scrollTop 에 이전 값 미러
4. **카드 클릭**: snap=half, viewMode='detail', subBar 사라짐, detail content top 부터
5. **detail 에서 body 스크롤 후 닫기**: list 복귀 시 진입 전 snap 복원 + 진입 전 scroll 위치 복원
6. **주소창 minify 변동**: visualViewport resize 이벤트가 vh state 갱신 → 시트 위치 즉시 따라감
7. **데스크톱 폭 (xl+)**: 시트/subBar 안 보임, 기존 3-column 동작

## 10. 알려진 트레이드오프

- **fixed 모드 inner 직접 스크롤은 메모리에 안 반영** — peek/half 에서 inner 컨테이너를 직접 스크롤한 경우, 다음 mode 전환 시 scrollPosRef 가 덮어씀
- **subBar 등장/사라짐 transition 없음** — detail 진입 시 헤더 영역 즉시 변동 (시트 transform 만 부드러움). 어색하면 추후 height transition 추가
- **scrollPosRef 가 list 진입 직전 값으로 복원** — 만약 detail 에서 다른 식당 detail 로 직접 이동(현재 없음)하면 그 시점의 scrollPosRef 가 list 의 옛 값. 식당별 분리 메모리 안 함 (단순 'list'/'detail' 두 키)
- **데스크톱에서도 PublicTopBar 가 block(이전엔 flex)** — 두 번째 row 가 세로 stack 가능하도록. xl+ 에서 subBar 가 xl:hidden 이라 시각적 영향 없음
- **React 19.1.0 다운그레이드** — workspace 일관성 위해. 19.2 신규 API 사용처는 현재 없음

## 11. 후속 작업 후보

- **본문 pull-down 인터셉트**: 현재 scroll 모드에서 collapse 는 드래그 핸들로만. 본문 영역에서 scrollY=0 인 채 pull-down 하면 iOS 의 native overscroll refresh 가 동작 — 핸들 sticky 라 큰 문제 X 지만 자연 제스처는 아님
- **헤더 transition**: subBar 등장/사라짐을 height transition 으로 부드럽게
- **시트 snap 가속 튜닝**: 빠른 플릭의 다음 스냅 예측 weight (현재 200ms)
- **deep link 도착 시 mobile 초기 snap**: 외부 링크로 `/restaurants-v2/{id}` 도착 시 모바일 snap 기본값 (현재 peek → detail 진입 자동 half)
- **번들 사이즈**: 1.1MB (gzip 305KB). 코드 스플릿 대상 (PublicRestaurantsMap 의 ol 가 큼)

## 12. 사용자 관점 결정 사항

이번 작업에서 사용자에게 명시적으로 묻고 결정한 항목:

| 질문 | 결정 |
|---|---|
| 데스크톱(xl+) 레이아웃 | 기존 3-column 그대로 |
| PublicTopBar 공통화 | 기존 PublicTopBar 그대로 재사용 (코드 이중화 없음) |
| 데이터 소스 | 실 API (`useRestaurantsPublic` 등) |
| 카드 클릭 시 snap | half 로 자동 조정 |
| 한 몸 sticky 방식 | PublicTopBar 에 slot prop 추가 |
| 시트 topOffset 계산 | ResizeObserver 로 실측 |
| 5173 에러 해결 | 사용자가 직접 dev 서버 재시작 |
| PoC 범위 | 전체 (상세까지) |
| 스냅 단계 | 3단계 (peek / half / full) |
| 드래그 라이브러리 | `@use-gesture/react` |
