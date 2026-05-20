// 식당 카테고리 → 아이콘 키 매핑 + 마커 SVG 빌더.
// 백엔드의 category 필드는 자유 문자열 ("한식 > 백반", "이자카야", "디저트카페" 등)
// 이라 contains 매칭으로 정규화. 같은 룰을 앱/웹 모두에서 사용해 마커 디자인
// 일관성 유지.

export const RESTAURANT_CATEGORY_KEYS = [
  'korean',
  'japanese',
  'chinese',
  'cafe',
  'dessert',
  'bar',
  'western',
  'snack',
] as const;

export type RestaurantCategoryKey = (typeof RESTAURANT_CATEGORY_KEYS)[number];

// 우선순위 순서. "이자카야" 는 일식보다 술집으로 매칭되어야 하므로 bar 가 먼저.
// "디저트카페" 는 cafe 보다 dessert 가 먼저 (디저트 비중이 더 직관적).
const KEYWORD_TABLE: ReadonlyArray<readonly [RestaurantCategoryKey, RegExp]> = [
  ['bar', /이자카야|포차|호프|선술집|와인바?|위스키|맥주|술집|\bbar\b|\bpub\b/i],
  ['dessert', /디저트|베이커리|제과|빵집|케이크|아이스크림|도넛|마카롱|쿠키|타르트/i],
  ['cafe', /카페|커피|coffee|에스프레소|로스터/i],
  ['japanese', /일식|초밥|스시|라멘|돈카츠|규동|텐동|사시미|우동|소바/i],
  ['chinese', /중식|중국집|짜장|짬뽕|마라|훠궈|딤섬|양꼬치/i],
  [
    'western',
    /양식|이태리|이탈리|파스타|피자|스테이크|버거|샌드위치|브런치|패밀리레스토랑/i,
  ],
  ['snack', /분식|떡볶이|김밥|순대|어묵|튀김/i],
  [
    'korean',
    /한식|한정식|국밥|백반|찌개|구이|보쌈|족발|삼겹|곰탕|설렁탕|냉면|불고기|쌈밥|해장/i,
  ],
];

export function resolveRestaurantCategoryKey(
  category: string | null | undefined,
): RestaurantCategoryKey | null {
  if (!category) return null;
  for (const [key, re] of KEYWORD_TABLE) {
    if (re.test(category)) return key;
  }
  return null;
}

// 24×24 viewBox 안의 단색 라인 아이콘. 모두 fill=none, stroke=흰색 일관 사용.
// 작은 크기(16px)에서도 형태가 인식되도록 디테일 최소화.
const ICON_PATHS: Record<RestaurantCategoryKey, string> = {
  // 그릇 입구선 + 반원 바닥 + 김 3가닥
  korean:
    '<path d="M3 12h18"/><path d="M4 12c0 4 4 7 8 7s8-3 8-7"/><path d="M9 4v3"/><path d="M12 3v4"/><path d="M15 4v3"/>',
  // 단순 물고기 — 타원 몸통 + V꼬리 + 눈
  japanese:
    '<path d="M3 12c2-3 6-5 10-5s7 2 8 5c-1 3-4 5-8 5s-8-2-10-5z"/><path d="M1 10l2 2-2 2"/><circle cx="17" cy="11" r="1" fill="#fff" stroke="none"/>',
  // 만두 — 반원 + 주름 세줄
  chinese:
    '<path d="M3 16h18"/><path d="M4 16a8 8 0 0 1 16 0"/><path d="M8 14v3"/><path d="M12 13v4"/><path d="M16 14v3"/>',
  // 커피컵 + 손잡이 + 김 3가닥 비스듬
  cafe:
    '<path d="M6 8h10v6a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4z"/><path d="M16 10h2a2 2 0 0 1 0 4h-2"/><path d="M9 3l-1 2"/><path d="M12 3l-1 2"/><path d="M15 3l-1 2"/>',
  // 케이크 슬라이스 — 삼각형 + 베이스 + 가운데 데코 줄
  dessert:
    '<path d="M5 19h14"/><path d="M7 19 12 7l5 12"/><path d="M9.5 14h5"/>',
  // 맥주잔 — 사각 + 손잡이 + 세로 줄 2
  bar:
    '<path d="M7 5h9v15H7z"/><path d="M16 8h3v8h-3"/><path d="M10 5v15"/><path d="M13 5v15"/>',
  // 포크 (왼쪽) + 나이프 (오른쪽)
  western:
    '<path d="M9 3v18"/><path d="M7 3v5"/><path d="M11 3v5"/><path d="M7 8h4"/><path d="M16 3l-1 6h3l-1-6"/><path d="M16 9v12"/>',
  // 떡꼬치 — 막대 + 원 3개
  snack:
    '<path d="M12 2v20"/><circle cx="12" cy="6" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="18" r="2.2"/>',
};

// 매칭 실패 시 일반 식기 아이콘. dot 만 두면 카테고리 마커들 사이에서 위화감.
const GENERIC_ICON_PATH =
  '<path d="M8 3v18"/><path d="M6 3v6h4v-6"/><path d="M16 3v18"/><path d="M14 3v6"/>';

// 마커 색 팔레트. primary = 빨강(기본/검색결과), muted = 회색(이미 등록된 항목).
// 어느 쪽이든 selected 시 톤이 한 단계 진해진다 — 카테고리는 안쪽 아이콘으로
// 구분, 색 차이는 "상태(선택/등록 여부)" 만 담당.
export type RestaurantMarkerVariant = 'primary' | 'muted';

const MARKER_COLORS: Record<
  RestaurantMarkerVariant,
  { base: string; selected: string }
> = {
  primary: { base: '#ef4444', selected: '#dc2626' },
  muted: { base: '#94a3b8', selected: '#64748b' },
};

// 선택 핀: 32×48, 좌표는 핀 꼭지점. 비선택 원: 26×26, 좌표는 중심.
// 카테고리는 안쪽 아이콘, variant 는 배경색 톤.
export function buildRestaurantMarkerSvg(
  key: RestaurantCategoryKey | null,
  selected: boolean,
  variant: RestaurantMarkerVariant = 'primary',
): string {
  const inner = key ? ICON_PATHS[key] : GENERIC_ICON_PATH;
  const color = MARKER_COLORS[variant];
  if (selected) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="48" viewBox="0 0 32 48">' +
      `<path fill="${color.selected}" stroke="#fff" stroke-width="2" ` +
      'd="M16 2C8.268 2 2 8.268 2 16c0 10 14 30 14 30s14-20 14-30c0-7.732-6.268-14-14-14z"/>' +
      // 아이콘 16×16 영역 (8..24). viewBox 24의 0.667 scale + offset 8.
      '<g transform="translate(8 8) scale(0.667)" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
      inner +
      '</g>' +
      '</svg>'
    );
  }
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">' +
    `<circle fill="${color.base}" stroke="#fff" stroke-width="2" cx="13" cy="13" r="11.5"/>` +
    // 아이콘 16×16 영역 (5..21). 24의 0.667 scale + offset 5.
    '<g transform="translate(5 5) scale(0.667)" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
    inner +
    '</g>' +
    '</svg>'
  );
}

// data URL 직접 사용 시 — 호출처에서 OL Icon.src 에 그대로 넣을 수 있다.
export function buildRestaurantMarkerDataUrl(
  key: RestaurantCategoryKey | null,
  selected: boolean,
  variant: RestaurantMarkerVariant = 'primary',
): string {
  return (
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(buildRestaurantMarkerSvg(key, selected, variant))
  );
}
