import type { ReceiptItemCategoryType } from './schemas/settlement-extraction.js';

// 술·음료 '종류' 사전 — 단일 소스로 세 군데를 먹인다:
//   ① FE 세부 분배 그룹 제안 (@repo/shared groupSuggestion)
//   ② 영수증 추출 후 카테고리 결정적 보정 (friendly settlement-extraction)
//   ③ 추출 프롬프트의 제품명 힌트 (DRINK_BRAND_PROMPT_HINT)
// '새로/대선/시원' 같은 제품명은 일반 단어와 겹쳐 vision 모델이 안주로 찍기
// 쉽다 — ②③ 이 그 오인식을 잡으므로, 브랜드 추가는 여기 한 곳이면 된다.

export const GROUPABLE_CATEGORIES = [
  'ALCOHOL',
  'NON_ALCOHOL',
] as const satisfies readonly ReceiptItemCategoryType[];
export type GroupableCategoryType = (typeof GROUPABLE_CATEGORIES)[number];

export const isGroupableCategory = (
  category: ReceiptItemCategoryType,
): category is GroupableCategoryType =>
  (GROUPABLE_CATEGORIES as readonly ReceiptItemCategoryType[]).includes(category);

// 평문 키워드 = 느슨한 부분 문자열 매칭. 일반 단어나 다른 메뉴와 겹칠 수 있는
// 키워드는 noHangul 가드 — 매칭 위치의 지정한 방향에 한글이 붙어 있으면 다른
// 단어의 일부로 보고 무시한다. (이름은 공백 제거 후 비교하므로 띄어쓰기 무관)
//   { kw: '새로', noHangul: 'around' }  "새로 360ml" ✅ / "새로운안주" ❌
//   { kw: '카스', noHangul: 'after' }   "생카스" ✅ / "카스테라" ❌
//   { kw: '테라', noHangul: 'before' }  "테라(병)" ✅ / "카스테라" ❌
export type DrinkKeywordDef =
  | string
  | { kw: string; noHangul: 'before' | 'after' | 'around' };

export interface DrinkKindDef {
  label: string;
  category: GroupableCategoryType;
  keywords: DrinkKeywordDef[];
  // 추출 프롬프트에 노출할 대표 제품명 — 모델이 헷갈리는 브랜드만 소수 엄선
  // (프롬프트 비대 방지). 없으면 힌트에서 생략.
  promptBrands?: string[];
}

// 순서 = 매칭 우선순위 (첫 매칭 종류 승리).
export const DRINK_KINDS: DrinkKindDef[] = [
  {
    label: '소주',
    category: 'ALCOHOL',
    keywords: [
      '참이슬',
      '처음처럼',
      '좋은데이',
      '잎새주',
      '이제우린',
      '진로이즈백',
      '진로골드',
      '새로살구',
      { kw: '소주', noHangul: 'after' }, // "안동소주" ✅ / "소주한잔(상호)" ❌
      { kw: '맛있는참', noHangul: 'after' }, // 맛있는참치…
      { kw: '진로', noHangul: 'around' },
      { kw: '새로', noHangul: 'around' }, // 새로운…
      { kw: '대선', noHangul: 'around' },
      { kw: '선양', noHangul: 'around' }, // 생선양념…
      { kw: '시원', noHangul: 'around' }, // 시원한…
      { kw: '한라산', noHangul: 'around' }, // 한라산볶음밥
      { kw: '화요', noHangul: 'around' }, // 화요일
    ],
    promptBrands: ['참이슬', '처음처럼', '진로', '새로', '좋은데이', '대선'],
  },
  {
    label: '맥주',
    category: 'ALCOHOL',
    keywords: [
      '생맥',
      '병맥',
      '켈리',
      '클라우드',
      '하이트',
      '라거',
      '필스너',
      '하이네켄',
      '아사히',
      '삿포로',
      '칭따오',
      '코로나',
      '버드와이저',
      '기네스',
      '호가든',
      '스텔라',
      '산미구엘',
      { kw: '맥주', noHangul: 'after' }, // "흑맥주" ✅ / "맥주안주모듬" ❌
      { kw: '카스', noHangul: 'after' }, // 카스테라
      { kw: '테라', noHangul: 'before' }, // 카스테라
      { kw: '타이거', noHangul: 'after' }, // 타이거새우
      { kw: '블랑', noHangul: 'before' }, // 몽블랑
      { kw: '에일', noHangul: 'around' }, // 케일주스…
    ],
    promptBrands: ['카스', '테라', '켈리', '클라우드'],
  },
  { label: '막걸리', category: 'ALCOHOL', keywords: ['막걸리', '동동주', '탁주'] },
  { label: '하이볼', category: 'ALCOHOL', keywords: ['하이볼'] },
  {
    label: '와인',
    category: 'ALCOHOL',
    keywords: [
      { kw: '와인', noHangul: 'after' }, // "레드와인" ✅ / "와인숙성삼겹살" ❌
      '샴페인',
      { kw: '스파클링', noHangul: 'after' }, // 스파클링워터
    ],
  },
  {
    label: '사케·청주',
    category: 'ALCOHOL',
    keywords: [
      { kw: '사케', noHangul: 'after' }, // 사케동
      { kw: '청주', noHangul: 'after' }, // 청주해장국
      '정종',
      '준마이',
      '청하',
    ],
  },
  {
    label: '위스키',
    category: 'ALCOHOL',
    keywords: [
      '위스키',
      '발렌타인',
      '조니워커',
      '잭다니엘',
      '글렌',
      '시바스',
      '맥캘란',
      '버번',
      '짐빔',
    ],
  },
  {
    label: '칵테일',
    category: 'ALCOHOL',
    keywords: [
      { kw: '칵테일', noHangul: 'after' }, // 칵테일새우
      '모히토',
      '마가리타',
      '진토닉',
    ],
  },
  {
    label: '콜라',
    category: 'NON_ALCOHOL',
    keywords: [
      { kw: '콜라', noHangul: 'after' }, // "제로콜라" ✅ / "콜라겐족발" ❌
      '펩시',
    ],
  },
  {
    label: '사이다',
    category: 'NON_ALCOHOL',
    keywords: [
      '사이다',
      '스프라이트',
      { kw: '칠성', noHangul: 'after' }, // 칠성장어
    ],
  },
  {
    label: '주스·에이드',
    category: 'NON_ALCOHOL',
    keywords: ['주스', '쥬스', '에이드'],
  },
  {
    label: '커피·차',
    category: 'NON_ALCOHOL',
    keywords: [
      { kw: '커피', noHangul: 'after' }, // 커피콩빵
      '아메리카노',
      '라떼',
      '아이스티',
      { kw: '녹차', noHangul: 'after' }, // 녹차빙수
      '유자차',
    ],
  },
  {
    label: '음료',
    category: 'NON_ALCOHOL',
    keywords: ['음료', '환타', '웰치', '밀키스', '탄산수', '식혜', '수정과'],
  },
];

const normalize = (s: string): string => s.toLowerCase().replace(/\s+/g, '');

const HANGUL_RE = /[가-힣]/;

const matchesKeyword = (haystack: string, def: DrinkKeywordDef): boolean => {
  const kw = typeof def === 'string' ? def : def.kw;
  const needle = normalize(kw);
  if (needle.length === 0) return false;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    if (typeof def === 'string') return true;
    const before = idx > 0 ? haystack[idx - 1]! : '';
    const after = haystack[idx + needle.length] ?? '';
    const beforeOk = def.noHangul === 'after' || !HANGUL_RE.test(before);
    const afterOk = def.noHangul === 'before' || !HANGUL_RE.test(after);
    if (beforeOk && afterOk) return true;
    idx = haystack.indexOf(needle, idx + 1);
  }
  return false;
};

/**
 * 이름 후보들(영수증 표기, 매칭된 식당 메뉴명 등)로 술·음료 종류를 찾는다.
 * 사전 순서가 우선순위 — 첫 매칭 종류 승리. 못 찾으면 null.
 */
export const matchDrinkKind = (
  names: ReadonlyArray<string | null | undefined>,
): DrinkKindDef | null => {
  const haystacks = names
    .filter((n): n is string => Boolean(n && n.trim()))
    .map(normalize);
  if (haystacks.length === 0) return null;
  for (const kind of DRINK_KINDS) {
    for (const def of kind.keywords) {
      if (haystacks.some((h) => matchesKeyword(h, def))) return kind;
    }
  }
  return null;
};

// 추출 프롬프트용 제품명 힌트 — "참이슬/…(소주), 카스/…(맥주)" 형태.
export const DRINK_BRAND_PROMPT_HINT = DRINK_KINDS.filter(
  (k) => (k.promptBrands?.length ?? 0) > 0,
)
  .map((k) => `${k.promptBrands!.join('/')}(${k.label})`)
  .join(', ');
