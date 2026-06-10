import type { ReceiptItemCategoryType } from '@repo/api-contract';

// 항목명 키워드로 주류/음료를 종류 그룹(소주/맥주/콜라…)으로 묶는 제안.
// 서버 변경 없이 영수증·직접 입력 모두에서 동작하는 FE 전용 사전 — 저장
// 페이로드에는 명시적 그룹 정의가 실리므로 서버는 이 사전을 모른다.
//
// 매칭: 공백 제거 + 소문자화 후 부분 문자열 포함. 사전 순서가 우선순위 —
// 첫 매칭 종류 승리. 매칭 안 된 항목은 그룹에 안 들어가고 '나머지 풀'로
// 남아 기존 카테고리 균등 분배를 따른다.

// 세부 분배 UI 를 노출하는 카테고리. 스키마·계산기는 범용이지만 그룹핑이
// 의미 있는 건 잔 단위로 소비되는 주류/음료뿐이다.
export const GROUPABLE_CATEGORIES = [
  'ALCOHOL',
  'NON_ALCOHOL',
] as const satisfies readonly ReceiptItemCategoryType[];
export type GroupableCategoryType = (typeof GROUPABLE_CATEGORIES)[number];

export const isGroupableCategory = (
  category: ReceiptItemCategoryType,
): category is GroupableCategoryType =>
  (GROUPABLE_CATEGORIES as readonly ReceiptItemCategoryType[]).includes(category);

interface KindDef {
  label: string;
  keywords: string[];
}

const ALCOHOL_KINDS: KindDef[] = [
  {
    label: '소주',
    keywords: [
      '소주',
      '참이슬',
      '처음처럼',
      '진로',
      '새로',
      '좋은데이',
      '한라산',
      '잎새주',
      '대선',
      '선양',
    ],
  },
  {
    label: '맥주',
    keywords: [
      '맥주',
      '생맥',
      '병맥',
      '카스',
      '테라',
      '켈리',
      '클라우드',
      '하이트',
      '라거',
      '에일',
      '필스너',
      '하이네켄',
      '아사히',
      '삿포로',
      '칭따오',
      '타이거',
      '코로나',
      '버드와이저',
      '기네스',
      '블랑',
      '호가든',
      '스텔라',
      '산미구엘',
    ],
  },
  { label: '막걸리', keywords: ['막걸리', '동동주', '탁주'] },
  { label: '하이볼', keywords: ['하이볼'] },
  { label: '와인', keywords: ['와인', '샴페인', '스파클링'] },
  { label: '사케·청주', keywords: ['사케', '청주', '정종', '준마이', '청하'] },
  {
    label: '위스키',
    keywords: ['위스키', '발렌타인', '조니워커', '잭다니엘', '글렌', '시바스', '맥캘란', '버번', '짐빔'],
  },
  { label: '칵테일', keywords: ['칵테일', '모히토', '마가리타', '진토닉'] },
];

const NON_ALCOHOL_KINDS: KindDef[] = [
  { label: '콜라', keywords: ['콜라', '펩시'] },
  { label: '사이다', keywords: ['사이다', '스프라이트', '칠성'] },
  { label: '주스·에이드', keywords: ['주스', '쥬스', '에이드'] },
  { label: '커피·차', keywords: ['커피', '아메리카노', '라떼', '아이스티', '녹차', '유자차'] },
  {
    label: '음료',
    keywords: ['음료', '환타', '웰치', '밀키스', '탄산수', '식혜', '수정과'],
  },
];

const KINDS_BY_CATEGORY: Record<GroupableCategoryType, KindDef[]> = {
  ALCOHOL: ALCOHOL_KINDS,
  NON_ALCOHOL: NON_ALCOHOL_KINDS,
};

export interface GroupSuggestionItemInput {
  clientId: string;
  name: string;
  matchedMenuName: string | null;
  category: ReceiptItemCategoryType;
}

export interface ItemGroupSuggestion {
  label: string;
  category: GroupableCategoryType;
  itemClientIds: string[];
}

const normalize = (s: string): string => s.toLowerCase().replace(/\s+/g, '');

const matchKind = (kinds: KindDef[], names: (string | null)[]): KindDef | null => {
  const haystacks = names
    .filter((n): n is string => Boolean(n && n.trim()))
    .map(normalize);
  if (haystacks.length === 0) return null;
  for (const kind of kinds) {
    for (const keyword of kind.keywords) {
      const needle = normalize(keyword);
      if (haystacks.some((h) => h.includes(needle))) return kind;
    }
  }
  return null;
};

/**
 * 주류/음료 항목을 종류별 그룹으로 묶는 제안을 만든다. 같은 종류로 매칭된
 * 항목들이 한 그룹 — 결과 순서는 (카테고리, 첫 매칭 항목) 등장 순서.
 * 멤버/모드는 포함하지 않는다 — 호출부가 기본값(참석자 전원, 균등)을 채운다.
 */
export const suggestItemGroups = (
  items: GroupSuggestionItemInput[],
): ItemGroupSuggestion[] => {
  const out: ItemGroupSuggestion[] = [];
  const byKey = new Map<string, ItemGroupSuggestion>();
  for (const it of items) {
    if (!isGroupableCategory(it.category)) continue;
    const kind = matchKind(KINDS_BY_CATEGORY[it.category], [it.matchedMenuName, it.name]);
    if (!kind) continue;
    const key = `${it.category}:${kind.label}`;
    let group = byKey.get(key);
    if (!group) {
      group = { label: kind.label, category: it.category, itemClientIds: [] };
      byKey.set(key, group);
      out.push(group);
    }
    group.itemClientIds.push(it.clientId);
  }
  return out;
};
