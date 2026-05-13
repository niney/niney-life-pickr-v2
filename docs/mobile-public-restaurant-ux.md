# 공개 맛집 페이지 — 모바일 스크롤·sticky 패턴

> Status: **적용 완료**
> Last updated: 2026-05-13
> 관련 커밋: `9c245ae` `fb7c00f` `4d4439f` `302f37c` `ddbcb10`

## 0. TL;DR

`/restaurants` 목록 + 지도와 `/restaurants/:placeId` 상세를 **별도 라우트**로 분리하고, 모바일에서는 페이지 자체가 body 스크롤되도록 풀스크린 모달/scroll lock 우회 코드를 제거했다. 모바일 상세에서는 전역 `PublicTopBar` 를 숨겨 자체 헤더(식당명 + 탭바)가 화면 최상단에 단독 sticky 한다.

핵심 결정:
- **모바일 페이지 스크롤 = body 스크롤** — 모바일 브라우저(iOS Safari / Android Chrome) 의 URL bar collapse 가 동작하려면 document/window 자체가 스크롤되어야 한다. 페이지 내부 `overflow-y:auto` 컨테이너의 스크롤은 트리거되지 않는다.
- **sticky element 는 wrapping 금지** — wrapping div 가 sticky containing block 을 자기 boundary 로 묶어 본문 스크롤 시 함께 사라진다. 분기는 sticky element 자체 className 에서.
- **sticky 묶음은 본문 scroll 컨테이너 밖에** — `overflow-y:auto` 인 div 안에 sticky 를 두면 자체 sticky containing block 이 형성되는데, 모바일에서 그 div 가 실제 scroll 되지 않으면 sticky 동작이 깨진다.
- **탭은 URL 의 일부** — `/restaurants/:placeId?tab=menu`. 탭 전환은 push 라 모바일 뒤로가기로 이전 탭으로 복귀.

## 1. 배경

이전 구조 (`9c245ae` 이전):
- `/restaurants` 단일 라우트, `?placeId=xxx` 로 상세 표시.
- 상세는 `fixed inset-0` 풀스크린 모달 + `document.body.style.overflow = 'hidden'` scroll lock.
- 탭은 컴포넌트 내부 `useState` — URL 미반영.
- 페이지 루트 `h-[calc(100vh-3.5rem)] overflow-hidden` 으로 풀-뷰포트 고정 + 내부 `overflow-y:auto` 스크롤.

발견된 문제들:
1. **모바일 브라우저 주소창이 minify 되지 않음** — body 스크롤이 없어서.
2. **상단 3중 레이어** — 전역 PublicTopBar(56) + 상세 헤더(44) + 탭바(44) = ~144px.
3. **불필요한 페이지 스크롤** — 모달이 뒤 페이지(list) 위에 떠 있어 body 스크롤 누수.
4. **탭 history 부재** — 뒤로가기 시 상세 통째 닫힘. 딥링크/공유 불가.
5. **검색 인풋 한글 IME 중복** — controlled `value={q}` + URL re-render 가 미완성 한글 조합을 덮어써 "ㅇ으음" 발생.
6. **카테고리 칩 wrap** — 모바일에서 한식/일식/중식… 칩이 여러 줄로 wrap 되어 헤더가 두꺼움.

## 2. 적용된 패턴

### 2.1 라우트 분리 + Outlet (`4d4439f`)

```tsx
// App.tsx
<Route path="/restaurants" element={<RestaurantsPage />}>
  <Route path=":placeId" element={<RestaurantDetailRoute />} />
</Route>
```

- `/restaurants` 가 layout — 리스트 aside + Outlet + 지도 section.
- `/restaurants/:placeId` 가 자식 — `<Outlet />` 자리에 `RestaurantDetailRoute` 가 들어옴.
- xl+ 데스크톱: 3-column (list / detail / map) 동시 표시. xl- 모바일: detail 활성 시 list/map/토글 모두 hidden, detail 만 페이지 흐름으로.

`RestaurantsPage` 안에서 detail 활성 여부 판단:
```tsx
const detailMatch = useMatch('/restaurants/:placeId');
const placeId = detailMatch?.params.placeId ?? null;
const mobileHasDetail = placeId !== null;
```

### 2.2 모바일 body 스크롤

루트에서 `h-[calc(100vh-3.5rem)] overflow-hidden` 제거. 모바일에서 detail aside 는 `fixed` 가 아닌 자연 흐름. body 가 콘텐츠 만큼 늘어나 스크롤 → 브라우저 주소창 자동 minify.

xl+ 컬럼은 그대로 sticky 풀-뷰포트 패턴 유지:
```tsx
className="xl:sticky xl:top-14 xl:h-[calc(100dvh-3.5rem)] xl:w-[440px] xl:shrink-0 xl:overflow-hidden"
```

`100vh` → `100dvh` 로 iOS Safari viewport 잘림 회피.

### 2.3 모바일 전역 TopBar 숨김 (`ddbcb10`)

모바일 상세에서는 자체 헤더가 상단을 담당하므로 전역 TopBar 56px 회수.

```tsx
// PublicTopBar.tsx
const detailMatch = useMatch('/restaurants/:placeId');
const hideOnMobile = !!detailMatch;
return (
  <header className={cn(
    'sticky top-0 z-30 flex h-14 ...',
    hideOnMobile && 'hidden xl:flex',
  )}>
```

xl+ 데스크톱은 3-column 표시 중이라 글로벌 네비 접근 위해 유지.

⚠️ **함정**: PublicLayout 에서 `<div className="hidden xl:block"><PublicTopBar /></div>` 로 wrapping 하면 wrapping div 가 sticky containing block 이 되어 본문 스크롤 시 PublicTopBar 가 wrapper(56px) 안에서만 stick 하다 함께 사라진다. 반드시 sticky element root 자체에 hidden 클래스를 적용한다.

### 2.4 sticky 묶음 (식당명 + 탭바)

`PublicRestaurantDetail` 의 root header 와 nav 를 한 div 로 묶고 sticky 처리. 본문 `overflow-y-auto` div **밖**, detail 루트 직계 자식으로:

```tsx
<div className="flex h-full flex-col bg-background ...">
  {/* 묶음 sticky — detail 루트 직계 자식 (containing block = overflow:visible) */}
  <div className="sticky top-0 z-10 bg-background">
    <header>...</header>
    {detail.data && <nav role="tablist">...</nav>}
  </div>

  <div ref={scrollRef} className="flex-1 overflow-y-auto">
    {/* 본문 ActiveTab — admin/xl+ 에선 자체 scroll */}
  </div>
</div>
```

⚠️ **함정**: 묶음을 본문 div 안에 두면 본문 div(`overflow-y:auto`) 가 자체 sticky containing block 을 형성한다. xl+/admin 은 본문 div 가 실제 scroll 되므로 정상이지만, 모바일은 부모 height 가 없어 본문 div 자체 scroll 이 일어나지 않고 body 가 scroll 되는 구조 → sticky 동작이 어색하게 깨진다 (브라우저별 quirk). 묶음은 반드시 본문 div 밖에 둔다.

`top-0` 통일 가능한 이유:
- 모바일: PublicTopBar 가 hidden → 화면 최상단 sticky.
- xl+ 컬럼: 부모 aside 가 `xl:top-14` sticky 라 이미 화면 56px 부터 시작. 그 안에서 top-0 = aside 시작점.
- admin 패널: 부모 aside 가 어떤 위치이든 그 안 top-0 자연 stick.

### 2.5 탭 URL 라우팅 (`4d4439f` + `302f37c`)

```tsx
// RestaurantDetailRoute.tsx
const [searchParams, setSearchParams] = useSearchParams();
const tab: TabKey = isTabKey(searchParams.get('tab')) ? searchParams.get('tab') : 'home';

const handleChangeTab = useCallback((next: TabKey) => {
  setSearchParams((prev) => {
    const params = new URLSearchParams(prev);
    if (next === 'home') params.delete('tab');
    else params.set('tab', next);
    return params;
  }); // push (replace 옵션 미지정) — 뒤로가기 1회 = 직전 탭
}, [setSearchParams]);
```

`PublicRestaurantDetail` 은 `tab` / `onChangeTab` 을 **optional** props 로 받는다:
- 라우트 사용처(공개): URL 과 sync (controlled).
- admin 사이드 패널: 기존 내부 `useState` 유지 (uncontrolled).

### 2.6 탭 변경 시 scroll-to-top 환경 분기

탭 변경 직후 본문을 맨 위로:
```tsx
const el = scrollRef.current;
if (el && el.scrollHeight > el.clientHeight + 1) {
  el.scrollTo({ top: 0 });           // 자체 scroll — admin/xl+
} else {
  window.scrollTo({ top: 0, behavior: 'instant' });  // body 스크롤 — 모바일 라우트
}
```

`scrollHeight > clientHeight` 로 자체 scroll 여부 자동 판단.

### 2.7 검색 인풋 한글 IME 대응 (`c2b722e`)

```tsx
const composingRef = useRef(false);
const [draft, setDraft] = useState(q);

<Input
  value={draft}
  onChange={(e) => {
    setDraft(e.target.value);
    if (!composingRef.current) onChangeQ(e.target.value);
  }}
  onCompositionStart={() => { composingRef.current = true; }}
  onCompositionEnd={(e) => {
    composingRef.current = false;
    setDraft(e.currentTarget.value);
    onChangeQ(e.currentTarget.value);
  }}
/>
```

- 로컬 `draft` state 로 input 즉시 반영 (IME 미완성 조합 그대로 보임).
- composition 중에는 상위 `onChangeQ`(URL sync) 보류 → URL → re-render 가 IME 깨뜨림 회피.
- `compositionEnd` 시 최종 조합을 한 번에 sync.

### 2.8 모바일 floating UI 위치 (`9c245ae` + `2148fd5`)

| 요소 | 위치 |
|------|------|
| 카테고리 칩 (한식/일식…) | 모바일 가로 스와이프 (`-mx-3 px-3 overflow-x-auto whitespace-nowrap`), md+ wrap |
| "이 지역 재검색" | 상단 중앙 (지도 앱 표준) |
| `tileError` 토스트 | 좌상단 |
| `전체 영역` 해제 | 우상단 |
| 목록/지도 토글 | 하단 중앙 (z-40, fixed) — detail 활성 시 hidden |

## 3. 핵심 규칙 요약

1. **모바일에서 페이지를 fixed 모달로 만들지 않는다** — body 스크롤이 사라져 주소창 minify 가 안 된다. 대신 라우트 분리로 자연 페이지화.
2. **sticky element 를 wrapping 하지 않는다** — wrapping div 가 containing block 을 묶어 sticky 가 wrapper 안에서만 동작. 분기는 sticky element 자체 className 에서.
3. **sticky 묶음은 `overflow:auto` 컨테이너 밖에 둔다** — 안에 두면 자체 sticky containing block 형성. 모바일에서 그 컨테이너가 실제 scroll 되지 않으면 sticky 가 깨진다.
4. **`100vh` 대신 `100dvh`** — iOS Safari 의 dynamic viewport 와 합치.
5. **탭은 URL 의 일부** — `?tab=xxx`. 탭 전환 push, replace 는 금지(뒤로가기 = 이전 탭 기대).
6. **한글 IME 대응** — URL/상위 state 와 sync 되는 controlled input 에는 `compositionStart/End` + 로컬 draft 패턴 필수.
7. **scroll-to-top 은 환경 자동 분기** — `scrollHeight>clientHeight` 로 자체 scroll 여부 판단해 `scrollRef.scrollTo` vs `window.scrollTo`.

## 4. 관련 파일

- `apps/web/src/App.tsx` — nested route 정의
- `apps/web/src/components/PublicLayout.tsx` — 전역 layout (단순)
- `apps/web/src/components/PublicTopBar.tsx` — 모바일 상세 hide 분기
- `apps/web/src/routes/RestaurantsPage.tsx` — list + map layout, mobileHasDetail 분기
- `apps/web/src/routes/RestaurantDetailRoute.tsx` — `/restaurants/:placeId` outlet, 탭 URL sync
- `apps/web/src/components/restaurant/detail/PublicRestaurantDetail.tsx` — sticky 묶음 + 환경 분기 scroll
- `apps/web/src/components/restaurant/PublicRestaurantList.tsx` — sticky 검색 헤더 + IME 대응
- `apps/web/src/components/restaurant/PublicRestaurantsMap.tsx` — floating UI 위치
