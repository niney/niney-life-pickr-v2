# 앱 글로벌 통계 화면 — 구현 스펙

> Status: **계획 단계 (미구현)**
> Last updated: 2026-05-09
> 상위 작업: 후보 리스트 #5 (`feat(analytics): 메뉴 계층 카테고리` 이후 남은 항목)

## 0. TL;DR

`apps/mobile/app/(tabs)/analytics.tsx` 신규 탭 + 1~2개 보조 라우트로 식당 가로지르기 글로벌 메뉴 통계를 앱에 노출. ADMIN gated. 데이터는 기존 admin API (`/admin/analytics/*`) 그대로 사용 — 신규 백엔드 변경 0. RN 컴포넌트 3~4개 신규 + 기존 `useGlobalMenus` / `useCategoryTree` / `useAnalyticsOverview` 훅 재사용.

작업량: **중간 (반나절~하루)**.

## 1. 동기

현재 앱에는 식당별 메뉴 순위 (`MenuRankingCard`, 식당 상세 안)만 있음. 글로벌 통계 (식당 가로지르기 — "전체 식당 통틀어 김치찌개는 1,243번 언급, 긍정률 72%") 는 web admin 페이지에만 존재. 앱 ADMIN 사용자가 출퇴근 중 또는 식당에서 빠르게 확인할 수 없다.

## 2. 설계 원칙

- **읽기 전용** — 글로벌 머지/그룹핑 트리거 같은 운영 액션은 web 에만 (큰 잡, 비용 큼, 앱에서 실행 위험). 앱은 통계 조회만.
- **데이터 소스 동일** — `useAnalyticsOverview`, `useGlobalMenus`, `useCategoryTree`, `useGlobalMergeJob` (옵션). 신규 API 호출 없음.
- **UI 는 앱 제스처에 맞게** — 검색 입력 + 정렬 토글 + 무한스크롤 풍의 메뉴 카드 리스트. 카테고리 트리는 접고/펼치는 단순 인덴트 리스트.
- **ADMIN gated** — `useCurrentUser().role === 'ADMIN'` 체크. 비-ADMIN 은 안내 메시지만.

## 3. 신규 파일

```
apps/mobile/
├── app/(tabs)/
│   ├── _layout.tsx                  ← 탭 추가
│   └── analytics.tsx                ← 신규: 메인 통계 화면
├── app/menu/
│   └── [globalKey].tsx              ← (선택) 글로벌 메뉴 상세 화면
└── src/components/
    ├── GlobalMenuCard.tsx           ← 신규: 메뉴 1건 카드 (식당 수 / 긍정률 / 대표 식당 TOP3)
    ├── GlobalCategoryTree.tsx       ← 신규: 접고/펼치기 트리
    └── AnalyticsOverviewCard.tsx    ← 신규: 상단 카운터 카드
```

`app/menu/[globalKey].tsx` 는 옵션. 카드 탭 시 카테고리/식당 별 상세를 보여줄 수 있는데, 같은 데이터를 어차피 `useGlobalMenus({q:displayName})` 로 가져올 수 있어 시작은 카드 안에 inline expand 로 단순화 권장.

## 4. UI 구성안

### `app/(tabs)/analytics.tsx` 메인 화면

```
┌─────────────────────────────────┐
│ 분석                             │  ← 탭 타이틀
├─────────────────────────────────┤
│ ┌─────────┬─────────┬─────────┐│
│ │식당 24  │분석 1.2k│멘션 4.5k││ ← AnalyticsOverviewCard
│ └─────────┴─────────┴─────────┘│
│                                 │
│ [🔍 김치찌개_______________] [⌫]│ ← 검색 입력
│ [언급][긍정][긍정률][식당수]    │ ← 정렬 칩 (가로 스크롤)
│ [한식▾][2회 이상▾][미머지×]    │ ← 필터 칩
│                                 │
│ 카테고리 트리                   │ ← 접고/펼치기
│ ▾ 한식 (2,341회)                │
│   ▾ 찌개 (834회)                │
│     김치찌개 (412회)            │
│     된장찌개 (267회)            │
│   ▸ 면류 (412회)                │
│ ▸ 일식 (892회)                  │
│                                 │
│ ─── 글로벌 메뉴 ───             │
│ ┌─────────────────────────────┐│
│ │ 1. 김치찌개   1,243회  72%  ││ ← GlobalMenuCard
│ │    한식 > 찌개 > 김치찌개   ││
│ │    ▰▰▰▰▰▱▱  4개 식당         ││
│ │    A식당 (412회) B식당 ...   ││
│ └─────────────────────────────┘│
│ ...                             │
│                                 │
│ [pull to refresh / 더 보기]     │
└─────────────────────────────────┘
```

### 비-ADMIN 일 때

```
┌─────────────────────────────────┐
│ 분석                             │
│                                 │
│   🔒 관리자만 조회 가능합니다.   │
│                                 │
└─────────────────────────────────┘
```

### 글로벌 머지 미실행 (overview.globalGroupCount === 0) 일 때

```
┌─────────────────────────────────┐
│ 분석                             │
│                                 │
│   ⚠ 전역 머지를 한 번도          │
│      실행하지 않아 통계가 비어   │
│      있습니다.                   │
│                                 │
│      관리자 웹에서 "AI 분석      │
│      관리 > 전역 메뉴 머지 >     │
│      전체 재실행" 을 한 번        │
│      실행하세요.                 │
│                                 │
└─────────────────────────────────┘
```

머지 트리거를 앱에서 막는 이유: LLM 비용 + 시간이 큰 작업이라 스크린 락/네트워크 끊김 위험. web 에서 명시적으로.

## 5. 컴포넌트 명세

### `AnalyticsOverviewCard`

```tsx
// useAnalyticsOverview() → { restaurantCount, analyzedReviewCount, totalMentionCount, ... }
<AnalyticsOverviewCard data={overview.data} />
```

3개 카운터 (식당/분석 리뷰/멘션 합) 가로 정렬. TouchableOpacity 처리 안 함 (read only).

### `GlobalCategoryTree`

```tsx
// useCategoryTree() → { roots: CategoryTreeNodeType[] }
<GlobalCategoryTree
  roots={tree.data?.roots ?? []}
  onPick={(path) => setCategory(path)}
  initialDepthOpen={1}  // 기본 최상위만 펼침
/>
```

내부적으로 자기 자신을 재귀 렌더 (`apps/web/src/routes/admin/AdminAnalyticsPage.tsx` 의 `CategoryTreeRow` 와 같은 모양, RN 으로 포팅). 노드 클릭 시 부모의 검색 상태 변경.

### `GlobalMenuCard`

```tsx
<GlobalMenuCard
  item={item}            // GlobalMenuStatType
  onPressCategory={(path) => setCategory(path)}
  onPressRestaurant={(placeId) => router.push(`/restaurant/${placeId}` as never)}
/>
```

내용:
- 순위 + displayName + categoryPath (있으면, 클릭 가능)
- mentionCount + 긍정률 + 식당 수
- SentimentBar (이미 `MenuRankingCard` 에 있음 — 추출해서 공유 컴포넌트로 분리 권장)
- topRestaurants TOP3 (Pressable, 누르면 식당 상세로)

### `analytics.tsx` (탭 화면)

```tsx
const { data: me } = useCurrentUser();
const isAdmin = me?.role === 'ADMIN';
const overview = useAnalyticsOverview();
const tree = useCategoryTree();

const [q, setQ] = useState('');
const [category, setCategory] = useState('');
const [sort, setSort] = useState<GlobalMenuQuerySortType>('mentions');
const [minMentions, setMinMentions] = useState(2);

const menus = useGlobalMenus({
  q,
  category,
  sort,
  minMentions,
  limit: 50,
  includeUnlinked: false,
});

if (!isAdmin) return <AdminGate />;
if (overview.data?.globalGroupCount === 0) return <NeedsMergeNotice />;

return (
  <FlatList
    ListHeaderComponent={
      <>
        <AnalyticsOverviewCard data={overview.data} />
        <SearchInput value={q} onChange={setQ} />
        <SortChips value={sort} onChange={setSort} />
        <FilterChips
          category={category}
          onChangeCategory={setCategory}
          minMentions={minMentions}
          onChangeMinMentions={setMinMentions}
        />
        {tree.data?.roots && tree.data.roots.length > 0 && (
          <GlobalCategoryTree roots={tree.data.roots} onPick={setCategory} />
        )}
      </>
    }
    data={menus.data?.items ?? []}
    keyExtractor={(it) => it.globalKey}
    renderItem={({ item, index }) => (
      <GlobalMenuCard item={item} rank={index + 1} ... />
    )}
    onRefresh={() => menus.refetch()}
    refreshing={menus.isFetching}
  />
);
```

`useState` 4개 (q/category/sort/minMentions) — useEffect 회피 (직접 onChange 핸들러 안에서 set).

## 6. 데이터 흐름

```
┌─ 앱 analytics 탭 ─┐         ┌─ friendly /admin/analytics/* ─┐
│                       │  GET    │                                │
│ useAnalyticsOverview ─┼────────▶│ overview                        │
│ useCategoryTree ──────┼────────▶│ category-tree                   │
│ useGlobalMenus ───────┼────────▶│ global-menus?q=&category=&sort= │
│                       │         │                                │
└───────────────────────┘         └────────────────────────────────┘
```

기존 web 의 데이터 흐름과 완전히 동일. 백엔드 변경 0건.

## 7. 정렬 / 필터 UX

### 정렬 칩 (가로 스크롤 ScrollView)
- 언급순 (`mentions`, default)
- 긍정순 (`positive`)
- 긍정률 (`positiveRatio`)
- 식당수 (`restaurants`)

선택된 칩은 `backgroundColor: '#1e293b'` + `color: '#fff'`, 미선택은 light gray.

### 필터 칩
- **카테고리**: 트리에서 선택하거나 카테고리 칩 클릭. "한식 > 찌개" 같이 표시 + ✕ 버튼으로 제거.
- **최소 언급 수**: ActionSheet 또는 Picker 로 1/2/3/5/10. 기본 2.
- **미머지 포함** 체크박스 — default off (web 과 동일).

작은 화면에서는 칩이 가로 스크롤로 흐르도록 `<ScrollView horizontal>`.

### 검색 입력
- 입력 변화 시 즉시 React Query refetch. debounce 300ms 권장 (`useDebouncedValue` 헬퍼 또는 useState + setTimeout). 현 단계에서는 단순 즉시도 OK — ranking 응답이 가벼움.
- ✕ 버튼으로 클리어.

## 8. 빈 상태 / 에러 / 로딩

| 상태 | 표시 |
|---|---|
| 비-ADMIN | "관리자만 조회 가능" |
| ADMIN + 머지 미실행 | "전역 머지를 실행해야 통계가 채워집니다" 안내 + web admin 으로 가는 link 텍스트 (앱에서 직접 트리거 X) |
| 로딩 | `<ActivityIndicator />` 가운데 |
| 검색 결과 없음 | "결과가 없습니다. 검색어 또는 필터를 바꿔보세요." |
| 네트워크 오류 | `useGlobalMenus` 의 isError → "다시 시도" 버튼 + `refetch()` |

## 9. 라우팅 / 네비게이션

- **탭 추가**: `app/(tabs)/_layout.tsx` 의 Tabs 에 `<Tabs.Screen name="analytics" options={{ title: '분석' }} />` 추가.
- **상세 (옵션)**: 카드 탭 시 `/menu/[globalKey]` 로. 첫 라운드는 카드 안에 inline expand 로 갈음 권장 — 라우트는 추후 진짜 필요해지면 추가.
- **식당으로 deep-link**: topRestaurants 의 식당 누르면 기존 `/restaurant/[placeId]` 로 `router.push(\`/restaurant/${placeId}\` as never)`.

## 10. 다크 모드 / 스타일

현재 `apps/mobile/` 는 light only. 다크 모드 도입은 별도 작업. 색상 직접 hex 로 (기존 `MenuRankingCard` 와 같은 톤): emerald `#10b981`, zinc `#94a3b8`, red `#ef4444`, slate `#1e293b`/`#475569`/`#64748b`/`#94a3b8`/`#cbd5e1`.

### 폰트 / 간격
- 카드 padding 12, 카드 사이 gap 8
- 메뉴 이름 16px bold, 카테고리 path 11px slate-500
- 카운터 숫자 18px bold, 라벨 11px slate-500

## 11. 성능 고려

- `FlatList` 에 `keyExtractor: it.globalKey`, `getItemLayout` 은 카드 높이 가변이라 생략. `windowSize: 5`, `maxToRenderPerBatch: 10`.
- `useGlobalMenus` 의 결과는 React Query 캐시 (이미 backend 60s TTL + 클라이언트 캐시 자동). 다른 탭 들렀다 와도 즉시 표시.
- `useCategoryTree` 는 페이지 진입 1회만 — 트리는 자주 안 변함.

## 12. 테스트 계획

앱 단위 테스트 인프라가 없음 (현재). 테스트 옵션:
- (A) **수동 QA 만** — 가장 단순, 첫 라운드 권장.
- (B) `@testing-library/react-native` 도입해서 컴포넌트 스냅샷/상호작용 테스트 — 인프라 비용 추가.
- (C) shared 훅은 이미 friendly + web 에서 검증됨, 앱 컴포넌트는 표시만 → A 로 시작.

수동 QA 체크리스트:
- ADMIN 로그인 → 분석 탭 진입 → overview/카테고리 트리/메뉴 리스트 모두 표시
- 검색 입력 → 결과 즉시 반영
- 정렬 칩 토글 → 순서 바뀜
- 카테고리 트리 노드 탭 → 필터 적용 + 메뉴 리스트 그 카테고리만
- 식당 누르기 → 식당 상세로 이동
- 비-ADMIN 로그인 → "관리자만" 메시지
- 네트워크 끄고 진입 → 에러 메시지 + 다시 시도 동작
- iOS / Android 모두 layout 확인

## 13. 작업 체크리스트

- [ ] `app/(tabs)/_layout.tsx` 에 analytics 탭 추가
- [ ] `app/(tabs)/analytics.tsx` — 메인 화면, ADMIN gating + 빈 상태들
- [ ] `src/components/AnalyticsOverviewCard.tsx`
- [ ] `src/components/GlobalCategoryTree.tsx` — 재귀 트리, 인덴트, 접고/펼치기
- [ ] `src/components/GlobalMenuCard.tsx`
- [ ] (옵션) `src/components/SentimentBar.tsx` — `MenuRankingCard` 에서 추출해서 공유
- [ ] (옵션) `src/hooks/useDebouncedValue.ts` — 검색 입력 debounce
- [ ] 정렬/필터 칩 컴포넌트 (`SortChips`, `FilterChips`)
- [ ] 빈 상태 / 에러 / 로딩 UI
- [ ] 식당으로 deep-link (`router.push`)
- [ ] iOS/Android 양쪽 layout 점검 (수동 QA)

## 14. 주의 사항

- **expo-router typed paths** 는 첫 빌드 전엔 stale 이라 `router.push(\`/restaurant/${placeId}\` as never)` 캐스트가 필요 (기존 `restaurants.tsx` 와 동일 패턴).
- **`useGlobalMenus` 의 query key** 가 8-튜플이라 파라미터 default 변경 시 신중. 기본값 그대로 유지 권장.
- **카테고리 path 가 null 인 메뉴** — 글로벌 머지가 v1 결과만 가지고 있고 v2 (categoryPath 추가) 안 돌렸을 때. UI 가 "-" 또는 비어 있게 처리. 안내 메시지로 admin 에 재실행 유도.
- **`includeUnlinked`** — 앱은 default false 권장. true 면 "미머지" 라벨이 시각적으로 노이즈.
- **무한스크롤** 은 첫 라운드 X — `limit: 50` 한 번 가져와서 끝. 50개 넘으면 "더 정밀한 검색어" 또는 "minMentions 올리기" 로 안내.
- **검색 입력 한국어 IME** — onChangeText 가 글자 조립 중에도 발화함. debounce 300ms 가 깔끔.

## 15. 참고

- web 구현: `apps/web/src/routes/admin/AdminAnalyticsPage.tsx` (`GlobalMenusSection`, `CategoryTreeSection`, `GlobalMergeSection`)
- 기존 앱 메뉴 카드: `apps/mobile/src/components/MenuRankingCard.tsx`
- 토픽: [analytics](../niney-life-pickr-v2-wiki/topics/analytics.md), [mobile](../niney-life-pickr-v2-wiki/topics/mobile.md), [shared](../niney-life-pickr-v2-wiki/topics/shared.md)

## 16. 추정 작업량

| 항목 | 예상 |
|---|---|
| 탭 + 레이아웃 + ADMIN 게이트 | 30분 |
| AnalyticsOverviewCard | 30분 |
| GlobalCategoryTree (재귀 + 인덴트 + 접기) | 1시간 |
| GlobalMenuCard + SentimentBar 추출 | 1시간 |
| 정렬/필터 칩 | 30분 |
| 빈 상태 / 에러 / 로딩 | 30분 |
| 검색 debounce + IME 대응 | 30분 |
| iOS/Android QA + 미세 조정 | 1~2시간 |
| **합계** | **반나절~하루** |

## 17. 미래 확장 (out of scope)

- 메뉴 글로벌 상세 화면 `app/menu/[globalKey].tsx` (식당별 비교 차트 + 시간 흐름 그래프)
- 즐겨찾기 — 자주 보는 메뉴 핀
- 푸시 알림 — 새 글로벌 머지 끝났을 때 ADMIN 에게
- iPad / 태블릿 split-view 레이아웃
- 다크 모드
- 앱에서도 글로벌 머지 트리거 (지금은 web 에서만)
