# 메뉴 상위-하위 카테고리 (categoryPath) — 구현 스펙

> Status: **계획 단계 (미구현)**
> Last updated: 2026-05-09
> 상위 작업: `feat(analytics): 메뉴 그룹핑 + 식당별/전역 통계 파이프라인` (596f5bc)

## 0. TL;DR

`GlobalMenuCanonical` 에 `categoryPath: String?` 컬럼 1개를 추가해 `"한식 > 찌개 > 김치찌개"` 같은 계층 분류를 부여한다. 글로벌 머지 LLM 단계에서 이름 매핑과 함께 path 를 출력하도록 프롬프트를 확장하고, 통계 API 에 `category` 파라미터를 추가한다. 별도 트리 테이블 없이 prefix-LIKE 쿼리로 충분.

작업량: **소규모 (반나절)**. 마이그레이션 1 컬럼, 프롬프트 v2, 통계 라우트 1 파라미터, FE 검색 입력 1개.

## 1. 동기

현재 메뉴 그룹핑은 평면 구조다 — `김치찌개` / `된장찌개` 가 같은 "찌개류" 라는 사실을 시스템이 모른다. 다음 질문에 답하지 못한다:

- "이 식당의 **찌개류** 전반의 평가는?"
- "면류 중에 가장 인기 있는 메뉴는?"
- "디저트 카테고리 평균 긍정률"

`Restaurant.category` 필드가 있긴 하지만 그건 **식당 자체의 업종** (한식/일식/카페 등) 이지 메뉴 분류가 아니다.

`MenuMention.traits` (`["진한", "얼큰한"]`) 가 부분적으로 같은 역할을 하나, traits 는 형용 태그라 카테고리 트리에 부적합 — 동의어 정리 안 되고, 계층도 없다.

## 2. 설계 원칙

- **별도 트리 테이블을 만들지 않는다** — `categoryPath` 단일 컬럼으로 시작. 트리 편집 UI 가 필요해질 정도로 카테고리가 안정되면 그때 별도 테이블로 격상.
- **카테고리 결정은 글로벌 머지 단계에 통합** — 별도 LLM 호출 추가 안 함. 이미 글로벌 머지가 메뉴 단위로 LLM 을 부르므로 그 응답에 path 한 줄 더 받으면 된다.
- **path 는 입력 free-form, 정규화는 코드에서** — 모델이 `"한식 > 찌개 > 김치찌개"` 를 출력하면 trim + 단일 공백 + ` > ` 구분자로 정규화. 분리자는 `> ` (공백 포함) 로 통일.
- **선택적** — `categoryPath` 가 null 이어도 모든 기능 정상 동작. 글로벌 머지가 한 번도 안 돌아간 상태와 동일한 fallback.

## 3. 데이터 모델 변경

### Prisma 스키마

```prisma
model GlobalMenuCanonical {
  id            String   @id @default(cuid())
  displayName   String
  globalKey     String   @unique
  // NEW: 계층 카테고리 path (예: "한식 > 찌개 > 김치찌개").
  // null = 분류 안 됨 (글로벌 머지 v1 이전 데이터 호환).
  // 마지막 segment 는 displayName 과 같은 게 일반적이지만 강제하지 않는다 —
  // 모델이 다른 표기를 줄 수도 있고, 통계 GROUP BY 는 globalKey 로 한다.
  categoryPath  String?
  version       Int      @default(1)
  model         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  links GlobalMenuCanonicalLink[]

  @@index([categoryPath]) // prefix LIKE 쿼리 가속화
  @@map("global_menu_canonicals")
}
```

### 마이그레이션

```sh
pnpm --filter friendly exec prisma migrate dev --name add_global_menu_category_path
```

기존 행은 모두 `categoryPath = NULL` 로 남는다. 다음 글로벌 머지 실행에서 자동 채워짐.

## 4. LLM 프롬프트 변경

### `apps/friendly/src/modules/analytics/global-merge.prompts.ts`

#### 버전 올리기

```ts
export const GLOBAL_MERGE_VERSION = 2; // 1 → 2 (categoryPath 추가)
```

#### 출력 모양 변경

기존: `{ "변형": "전역대표" }` (string → string)

신규: `{ "변형": { "canonical": "전역대표", "categoryPath": "한식 > 찌개 > 김치찌개" } }`

또는 path 만 따로 받는 것이 더 단순할 수도 있으나, 같은 LLM 호출에서 묶음/분류를 한 번에 처리해야 토큰 비용·정확도가 좋다.

#### JSON schema

```ts
export const GLOBAL_MERGE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: {
    type: 'object',
    properties: {
      canonical: { type: 'string' },
      categoryPath: { type: 'string' },
    },
    required: ['canonical', 'categoryPath'],
  },
} as const;
```

#### 시스템 프롬프트 추가 규칙

기존 프롬프트의 `[그룹화 규칙]` `[전역 대표 표기 결정 규칙]` 뒤에 다음 블록 추가:

```
[카테고리 path 규칙]
- 형식: "최상위 > 중위 > 메뉴이름". 슬래시 아니라 공백 포함 " > " 로 구분.
- 최상위는 "한식" / "중식" / "일식" / "양식" / "분식" / "디저트" / "음료" / "기타" 중 하나로 통일.
- 중위는 조리법 또는 재료 카테고리 (예: "찌개", "면류", "구이", "튀김", "초밥", "파스타").
  · 메뉴 1개로 카테고리가 안 잡히는 경우 (사이드/공깃밥 등) 중위 생략 가능: "한식 > 공깃밥".
- 마지막 segment 는 메뉴의 canonical 과 같거나 약간 더 일반적인 표기.
- path 의 모든 segment 는 한국어, 짧게.
- 같은 그룹의 모든 변형은 같은 categoryPath 를 가져야 한다.

[예시]
입력: ["김치찌개", "묵은지김치찌개", "차돌박이된장찌개", "냉면", "비빔국수", "참치초밥", "치즈돈까스", "공깃밥"]
출력: {
  "김치찌개":            { "canonical": "김치찌개",        "categoryPath": "한식 > 찌개 > 김치찌개" },
  "묵은지김치찌개":      { "canonical": "김치찌개",        "categoryPath": "한식 > 찌개 > 김치찌개" },
  "차돌박이된장찌개":    { "canonical": "차돌박이된장찌개", "categoryPath": "한식 > 찌개 > 된장찌개" },
  "냉면":               { "canonical": "냉면",            "categoryPath": "한식 > 면류 > 냉면" },
  "비빔국수":           { "canonical": "비빔국수",         "categoryPath": "한식 > 면류 > 비빔국수" },
  "참치초밥":           { "canonical": "참치초밥",         "categoryPath": "일식 > 초밥 > 참치초밥" },
  "치즈돈까스":         { "canonical": "치즈돈까스",       "categoryPath": "일식 > 튀김 > 돈까스" },
  "공깃밥":             { "canonical": "공깃밥",          "categoryPath": "한식 > 공깃밥" }
}
```

### path 정규화 헬퍼

`apps/friendly/src/modules/analytics/analytics.service.ts` 에 추가:

```ts
// LLM 출력 path 의 좌우 공백·구분자 변형 정리. 입력이 깨졌으면 null 반환 (저장 안 함).
const normalizeCategoryPath = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // 다양한 구분자(>, /, ›, →, |) 와 공백을 표준 " > " 로 통일.
  const segments = trimmed
    .split(/\s*[>\/›→|]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (segments.length === 0) return null;
  // 최상위는 화이트리스트로 강제. 모르는 값이면 "기타" 로.
  const TOP_WHITELIST = new Set([
    '한식', '중식', '일식', '양식', '분식', '디저트', '음료', '주류', '기타',
  ]);
  if (!TOP_WHITELIST.has(segments[0])) {
    segments.unshift('기타');
  }
  return segments.join(' > ');
};
```

## 5. service 변경

### `runGlobalMerge` 의 LLM 호출 응답 처리

기존:
```ts
const c = map[v];
const canonical = typeof c === 'string' && c.trim().length > 0 ? c.trim() : v;
variantToCanonical.set(v, canonical);
```

신규:
```ts
const entry = map[v];
const canonical =
  entry && typeof entry === 'object' && typeof entry.canonical === 'string' && entry.canonical.trim().length > 0
    ? entry.canonical.trim()
    : v;
const categoryPath = entry && typeof entry === 'object' ? normalizeCategoryPath(entry.categoryPath) : null;
variantToCanonical.set(v, canonical);
variantToCategoryPath.set(v, categoryPath);
```

`callOneChunk` 의 반환 타입도 `Record<string, { canonical: string; categoryPath: string | null }>` 로 변경.

### `globalMenuCanonical` 저장 시 categoryPath 채움

기존 upsert 블록에서 `data` 에 `categoryPath` 추가:

```ts
await tx.globalMenuCanonical.update({
  where: { id: keyToId.get(info.globalKey)! },
  data: {
    displayName: info.displayName,
    categoryPath: info.categoryPath, // NEW
    version: GLOBAL_MERGE_VERSION,
    model,
    updatedAt: now,
  },
});
```

`finalByNorm` 의 값 타입도 `{ displayName, globalKey, categoryPath }` 로 확장.

같은 `globalKey` 안에서 path 충돌 시(같은 그룹의 변형들이 다른 path 를 받은 경우) **최빈값** 또는 **첫번째 non-null** 을 채택. 단순화로 첫 non-null 채택 추천:

```ts
// finalByNorm 채울 때:
for (const [norm, name] of nameByNorm) {
  const finalName = variantToFinal.get(name) ?? name;
  const globalKey = normalizeTerm(finalName) || norm;
  const path = variantToCategoryPath.get(name) ?? null;
  const existing = finalByNorm.get(norm);
  finalByNorm.set(norm, {
    displayName: finalName,
    globalKey,
    categoryPath: existing?.categoryPath ?? path,
  });
}
// 같은 globalKey 가 여러 norm 에서 나오는 경우는 위에서 set 으로 덮어쓰지 말고
// 별도 globalKeyToPath 맵으로 first non-null 유지.
```

### pass2 도 같은 모양 — pass1 결과의 canonical 들 사이 충돌 해소 시 path 도 같이 변경

pass2 입력은 `pass1Canonicals: string[]` 인데, 이 단계에서 categoryPath 도 다시 받아야 한다. 청크 사이 같은 음식이 다른 path 로 분류되는 케이스 정리.

대안: pass2 는 path 유지하고 canonical 만 통합 — 단순. 첫 시도 권장.

## 6. 통계 API 변경

### `GlobalMenuStat` 에 categoryPath 추가

`packages/api-contract/src/schemas/analytics.ts`:

```ts
export const GlobalMenuStat = z.object({
  globalKey: z.string(),
  displayName: z.string(),
  categoryPath: z.string().nullable(), // NEW
  // ... 나머지 동일
});
```

### `GlobalMenuQuery` 에 category 필터

```ts
export const GlobalMenuQuery = z.object({
  q: z.string().optional(),
  // NEW: 카테고리 path prefix 필터.
  // - "한식" → "한식 > %" 모두 포함
  // - "한식 > 찌개" → 그 prefix 만
  // - "한식 > 찌개 > 김치찌개" → 정확히 그 path
  category: z.string().optional(),
  sort: GlobalMenuQuerySort.default('mentions'),
  minMentions: z.coerce.number().int().min(1).default(5),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  includeUnlinked: z.coerce.boolean().default(false),
});
```

### `getGlobalMenus` 의 필터 로직

기존 q 필터 뒤에 추가:

```ts
if (query.category) {
  const cat = query.category.trim();
  filtered = filtered.filter((i) => {
    if (i.categoryPath === null) return false;
    return i.categoryPath === cat || i.categoryPath.startsWith(`${cat} > `);
  });
}
```

DB 단에서 거를 수도 있지만 (`@@index([categoryPath])` + Prisma `startsWith`) 현재 `getGlobalMenus` 가 모든 `linked` 를 메모리에 올려놓고 필터하므로 메모리 단에서 처리해도 충분. 식당당 100개대 메뉴 × 식당 100개대 = 1만 row 이하.

### NEW: 카테고리 트리 API

`Routes.Analytics.categoryTree`:

```ts
categoryTree: `${API_PREFIX}/admin/analytics/category-tree`,
```

응답 — 카테고리별 집계:

```ts
export const CategoryTreeNode = z.object({
  // 이 노드까지의 path (예: "한식 > 찌개").
  path: z.string(),
  // 마지막 segment (예: "찌개"). 표시용.
  label: z.string(),
  // 이 path 직속 + 하위 모든 메뉴의 합산.
  totalMentions: z.number().int(),
  positive: z.number().int(),
  negative: z.number().int(),
  positiveRatio: z.number().nullable(),
  // 직속 자식 노드들. leaf (메뉴) 면 빈 배열.
  children: z.array(CategoryTreeNode).optional(), // recursive 는 z.lazy 필요
});
```

zod 의 recursive 타입은 `z.lazy` 로:

```ts
type CategoryTreeNodeType = z.infer<typeof CategoryTreeNode> & {
  children?: CategoryTreeNodeType[];
};
const CategoryTreeNode: z.ZodType<CategoryTreeNodeType> = z.lazy(() =>
  z.object({
    path: z.string(),
    label: z.string(),
    totalMentions: z.number().int(),
    positive: z.number().int(),
    negative: z.number().int(),
    positiveRatio: z.number().nullable(),
    children: z.array(CategoryTreeNode).optional(),
  }),
);
```

서비스 메서드 `getCategoryTree()`:

1. 모든 `GlobalMenuCanonical` (categoryPath 가 non-null 인 것만) + 멘션 통계 조회.
2. path 를 segment 별로 split → 트리 구성.
3. leaf 통계를 부모로 누적 합산.
4. 빈도 desc 로 자식 정렬.

## 7. FE 변경

### `@repo/shared` 에 추가

`packages/shared/src/api/analytics.api.ts`:

```ts
analyticsApi.globalMenus({ category: '한식 > 찌개' })  // 기존 함수의 옵션만 확장
analyticsApi.categoryTree: () => apiFetch<...>(Routes.Analytics.categoryTree)
```

`packages/shared/src/hooks/useAnalytics.ts` 에 `useCategoryTree`.

### Web admin

`AdminAnalyticsPage` 의 `GlobalMenusSection` 에 카테고리 입력 추가:

```tsx
<input
  type="text"
  value={category}
  onChange={(e) => setCategory(e.target.value)}
  placeholder="카테고리 (예: 한식 > 찌개)"
  list="category-suggestions"
/>
<datalist id="category-suggestions">
  {/* useCategoryTree 결과의 path 들 */}
</datalist>
```

또는 별도 `CategoryTreeSection` 컴포넌트로 트리 뷰 (접고/펼치기). 우선 datalist 자동완성으로 시작 권장.

### Mobile

식당 상세에 "카테고리별 보기" 토글이 의미 있을지는 아직 불확실. 우선 admin 만 노출.

## 8. 마이그레이션 / 백필 전략

기존 글로벌 머지가 한 번 이상 돌았던 환경에서 categoryPath 만 채우려면:

1. 마이그레이션 적용 (categoryPath nullable 추가)
2. 관리자 페이지 "전체 재실행" — `GLOBAL_MERGE_VERSION = 2` 라 모든 row 가 stale 로 표시됨
3. LLM 한 바퀴 돌면 path 채워짐

또는 path 만 채우는 가벼운 backfill 모드:
- `runGlobalMerge({ categoryPathOnly: true })` — 캐논 매핑은 그대로 두고 categoryPath 만 LLM 으로 받아 update.
- LLM 입력은 distinct displayName + globalKey, 출력은 `{ "displayName": "categoryPath" }`.
- 이건 정확히 1패스이므로 비용 절약. 유지비용 vs 단순성 trade-off — 처음엔 안 만들고 전체 재실행으로 처리 권장.

## 9. 테스트 계획

`apps/friendly/src/modules/analytics/analytics.test.ts` (현재 없음, 이번 기회에 추가):

- `normalizeCategoryPath` 단위 테스트:
  - `"한식 > 찌개 > 김치찌개"` → 그대로
  - `"한식/찌개/김치찌개"` → `"한식 > 찌개 > 김치찌개"`
  - `"  한식  >  찌개  "` → `"한식 > 찌개"`
  - `"디저트>케이크"` → `"디저트 > 케이크"`
  - `"미지의카테고리 > foo"` → `"기타 > 미지의카테고리 > foo"`
  - `""` → `null`
- `runGlobalMerge` mock LLM:
  - LLM 이 `{canonical, categoryPath}` 형태로 응답할 때 `GlobalMenuCanonical.categoryPath` 가 채워지는지
  - 같은 그룹의 변형들이 다른 path 로 분류된 경우 first non-null 채택
- `getGlobalMenus({ category: '한식 > 찌개' })` — prefix 매칭 동작
- `getCategoryTree()` — 트리 구조 + 자식 합산

## 10. 주의 사항

- **카테고리 일관성** — LLM 이 같은 의미를 다른 path 로 부르는 케이스 (예: `한식 > 면류 > 냉면` vs `한식 > 면 > 냉면`). 정규화 헬퍼가 잡을 수 없는 의미적 변동은 모델 재호출 + ANALYSIS_VERSION 올리기로 해결. 사전 + 동의어 처리 까지 가면 별도 트리 테이블(옵션 B) 영역.
- **categoryPath 가 globalKey 의 종속 변수가 아니다** — 같은 globalKey 라도 path 가 추후 모델 변경으로 달라질 수 있음. 통계 GROUP BY 는 항상 `globalKey` 로 하고 categoryPath 는 표시·필터용.
- **traits 와 혼동 금지** — `traits` 는 한 메뉴에 대한 형용 태그 (`["진한", "얼큰한"]`). categoryPath 는 분류. 둘은 직교.
- **검색 q 와 category 동시 적용** — AND 로 필터.

## 11. 참고

- 참조 프로젝트(`niney-life-pickr`)의 `food-category` 시스템 — 별도 `food_categories` 테이블 + classify/merge 두 단계 LLM. 우리는 단계 통합으로 단순화.
- 현재 `Restaurant.category` 와 헷갈리지 말 것 — 식당 업종 분류이고 메뉴 카테고리와 별개.

## 12. 작업 체크리스트

- [ ] Prisma 스키마: `GlobalMenuCanonical.categoryPath` 추가 + `@@index`
- [ ] 마이그레이션 `add_global_menu_category_path`
- [ ] `global-merge.prompts.ts` v2 — JSON schema, system prompt, examples
- [ ] `analytics.service.ts` — `normalizeCategoryPath`, `callOneChunk` 반환 타입, `runGlobalMerge` 의 path 처리, `getGlobalMenus` 의 category 필터
- [ ] `getCategoryTree()` 구현
- [ ] api-contract: `GlobalMenuStat.categoryPath`, `GlobalMenuQuery.category`, `CategoryTreeNode`, `Routes.Analytics.categoryTree`
- [ ] shared: `analyticsApi.categoryTree`, `useCategoryTree`
- [ ] web admin: 카테고리 input + datalist (또는 트리 뷰)
- [ ] 테스트: `analytics.test.ts` 신규
- [ ] 운영: 관리자 페이지에서 "전체 재실행" 1회

## 13. 추정 작업량

| 항목 | 예상 |
|---|---|
| 스키마 + 마이그 | 10분 |
| 프롬프트 v2 + few-shot | 30분 |
| service 수정 | 1~2시간 |
| API 라우트 + zod | 30분 |
| 트리 빌더 (재귀 + 누적 합산) | 30분 |
| FE 검색 input + datalist | 30분 |
| 테스트 | 1시간 |
| **합계** | **반나절~하루** |
