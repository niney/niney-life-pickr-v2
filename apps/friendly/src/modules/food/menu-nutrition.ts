// 식당 메뉴명 → 카탈로그 열량 표시 판정.
//
// 왜 따로 두나: 크롤한 메뉴명은 `[대표] 통갈비살 900g-기본/양념`·`반반 2가지선택(대)`·`항정살 150g`
// 처럼 태그·중량·수량·세트 표식이 섞여 있어 FoodService.matchFood(인식 교정용, 퍼지 0.5)를 그대로
// 쓰면 엉뚱한 칼로리가 붙는다(실측: `새우 볶음밥→새우볶음`, `돼지갈비→돼지갈비찜`). 여기서는
// (1) 메뉴명을 전처리해 매칭 키와 표식을 분리하고, (2) 매칭 방식·표식에 따라 **1인분 / 100g당 /
// 미표시** 셋 중 하나로 보수적으로 판정한다. 틀린 칼로리는 없는 것보다 나쁘다 — 애매하면 안 보여 준다.
//
// 매칭 순서(앞이 정밀):
//   exact/alias → synonym(계란↔달걀 등 표기 동의어) → modifier(앞 수식어 제거) →
//   variant(고기 부위 + '구이') → hint(괄호 안 음식명) → suffix(핵심어 접미: 북경짜장면 → 짜장면).
//   퍼지는 표시에 쓰지 않고 측정 리포트에 후보만 남긴다.
//
// 판정 규칙:
//   - 세트·반반·모듬·콤보·"A+B" 처럼 여러 음식이 섞인 이름 → 미표시.
//   - exact/alias/synonym/modifier 이고 중량·인분·크기·수량 표식이 없으며, 카탈로그 1인분 중량이
//     기준량(100g)보다 커서 진짜 1인분 값일 때 → `per_serving`.
//     (표준데이터는 1인분 중량이 없으면 100g 을 그대로 두어 kcal == kcalPer100g 이 된다 — 돈가스 280kcal
//     같은 값은 1인분이 아니다.)
//   - 그 외에 카탈로그에 100g당 kcal 이 있으면 → `per_100g`(ml/cc 중량이면 `per_100ml`).
//     100g당은 양과 무관한 비율이라 중량·인분 표식이 있어도, variant/hint/suffix 매칭이어도 유효하다.

import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { normalizeTerm } from '../../lib/text.js';
import { CATEGORY_WORDS } from './food-nutrition.service.js';
import type { FoodMatch, FoodService } from './food.service.js';

export type MenuKcalBasis = 'per_serving' | 'per_100g' | 'per_100ml';
export type MenuKcalMatchedBy =
  | 'exact'
  | 'alias'
  | 'synonym'
  | 'modifier'
  | 'variant'
  | 'hint'
  | 'suffix';
export type MenuKcalReason =
  | 'per_serving'
  | 'per_100g'
  | 'set'
  | 'empty'
  | 'no_match'
  | 'fuzzy_rejected'
  | 'no_kcal';

// 1인분 표시를 허용하는 매칭 방식 — 이름이 같은 음식이라고 볼 수 있는 경우만.
const PER_SERVING_MATCHES: ReadonlySet<MenuKcalMatchedBy> = new Set([
  'exact',
  'alias',
  'synonym',
  'modifier',
]);
// 표준데이터의 기준량. 1인분 중량이 이 값이면 "1인분"이 아니라 기준량을 그대로 둔 행이다.
const BASE_SERVING_G = 100;

export interface ParsedMenuName {
  raw: string;
  /** 태그·괄호·중량·수량·크기 표식을 뗀 매칭용 이름. */
  cleaned: string;
  /** 메뉴명에 적힌 중량. kg→g, l→ml 환산. */
  weight: { value: number; unit: 'g' | 'ml' } | null;
  /** 여러 음식이 섞인 이름(세트·반반·모듬·A+B). 어떤 등급도 표시하지 않는다. */
  isSet: boolean;
  /** 1인분 표시를 막는 표식 — 2인 이상, 대/중/소, 2개 이상. */
  portionAmbiguous: boolean;
  /** 괄호 안에 있던 음식명 후보("부자찌개(된장찌개)" → 된장찌개). 크기·중량·등급은 제외. */
  hints: string[];
}

// 이름 앞에 붙는 수식어 — 떼어도 같은 음식이라 1인분 표시를 유지한다. 재료가 바뀌는 말(삼선·해물·
// 치즈 등)은 넣지 않는다 — 그건 다른 음식이다. 정규화(normalizeTerm) 형태로 비교한다.
const LEADING_MODIFIERS = [
  '얼큰한', '얼큰', '매콤한', '매콤', '매운', '순한', '담백한', '고소한', '진한', '시원한', '뜨끈한',
  '수제', '명품', '프리미엄', '스페셜', '시그니처', '오리지널', '옛날', '전통', '정통', '원조', '특제',
  '특', '왕', '통', '화덕', '숯불', '직화', '생', '즉석', '국내산', '한우', '한돈', '와규', '1++', '1+',
  '100%', '착한', '든든한', '푸짐한', '정성', '엄마', '할매', '할머니', '집',
].map(normalizeTerm).filter((m) => m.length > 0);

// 표기 동의어 — 같은 음식의 다른 철자. 양방향으로 치환해 본다.
const SYNONYM_PAIRS: [string, string][] = [
  ['계란', '달걀'],
  ['오뎅', '어묵'],
  ['돈까스', '돈가스'],
  ['돈카츠', '돈가스'],
  ['소고기', '쇠고기'],
  ['후라이', '프라이'],
  ['자장', '짜장'],
  ['커리', '카레'],
  ['모밀', '메밀'],
  ['쭈꾸미', '주꾸미'],
];

// 고기집 메뉴는 부위명만 적는다("삼겹살 150g"). 카탈로그(조리음식)는 `삼겹살구이`라 접미를 붙여 본다.
const CUT_SUFFIXES = ['구이'];

// 핵심어 접미 매칭에서 제외하는 범주어 — `동치미국수 → 국수`처럼 뭐든 붙는 말은 대표값이 없다.
const SUFFIX_BLOCK = new Set<string>([
  ...CATEGORY_WORDS,
  '밥', '면', '국수', '덮밥', '죽', '빵', '술', '차', '주', '탕', '국',
  '소스', '토핑', '추가', '사리', '공기', '음료', '주스', '커피', '케이크', '스프', '수프', '고기',
]);

const SET_WORDS = [
  '세트', 'set', '반반', '모듬', '모둠', '콤보', 'combo', '플래터', 'platter', '코스', '한판', '플러스',
  '선택', '패키지', '박스', '도시락', '뷔페', '무한리필', '정식',
];

// 태그 — `[대표]`·`[추천]`·`BEST`·`NEW` 같은 표식은 이름이 아니다.
const TAG_RE = /\[[^\]]{0,6}\]|【[^】]{0,6}】|\b(best|new|hot|hit|추천|대표|인기|신메뉴|시그니처메뉴)\b/gi;
// 중량 — 숫자 + 단위. 단위 뒤에 영문이 이어지면(예: "5gb") 중량이 아니다.
const WEIGHT_RE = /(\d+(?:[.,]\d+)?)\s*(kg|g|그램|ml|mL|ML|cc|CC|l|L|리터)(?![a-zA-Z])/;
// 인분·인용 — "2인분", "3~4인", "2-3인분", "4인용".
const PORTION_RE = /(\d+)\s*(?:[~\-–]\s*(\d+))?\s*인(?:분|용|\b|(?=[^\p{L}]|$))/u;
// 수량 — "2개", "3pcs", "10조각", "6알", "2마리", "2병", "2잔".
const COUNT_RE = /(\d+)\s*(개|pcs|pc|조각|p|알|장|마리|병|잔|캔|쪽|줄|판)(?![\p{L}])/iu;
// 크기 — "(대)", "(중)", "(소)", " 대 ", "L/M/S", "라지", "미디움", "스몰".
const SIZE_PAREN_RE = /[（(]\s*(대|중|소|특대|L|M|S|XL)\s*[)）]/i;
const SIZE_WORD_RE = /(?:^|\s)(대|중|소|특대|라지|미디움|미디엄|스몰|점보)(?=\s|$)/;
// 등급·비율 표식 — "1++", "1+", "100%".
const GRADE_RE = /\d\+{1,2}|\d+\s*%/g;
// "2가지 선택" 류 — 숫자 + 가지만 세트 표식(가지볶음의 '가지'는 채소).
const N_GAJI_RE = /\d\s*가지/;

const round0 = (v: number): number => Math.round(v);

export const parseMenuName = (raw: string): ParsedMenuName => {
  let s = raw.normalize('NFC').replace(TAG_RE, ' ');

  let weight: ParsedMenuName['weight'] = null;
  const w = WEIGHT_RE.exec(s);
  if (w) {
    const value = Number(w[1]!.replace(',', '.'));
    const unit = w[2]!.toLowerCase();
    if (Number.isFinite(value) && value > 0) {
      if (unit === 'kg') weight = { value: value * 1000, unit: 'g' };
      else if (unit === 'g' || unit === '그램') weight = { value, unit: 'g' };
      else if (unit === 'l' || unit === '리터') weight = { value: value * 1000, unit: 'ml' };
      else weight = { value, unit: 'ml' };
    }
    s = s.replace(WEIGHT_RE, ' ');
  }

  let portionAmbiguous = false;
  const p = PORTION_RE.exec(s);
  if (p) {
    const hi = Number(p[2] ?? p[1]);
    if (hi >= 2) portionAmbiguous = true;
    s = s.replace(PORTION_RE, ' ');
  }
  const c = COUNT_RE.exec(s);
  if (c) {
    if (Number(c[1]) >= 2) portionAmbiguous = true;
    s = s.replace(COUNT_RE, ' ');
  }
  if (SIZE_PAREN_RE.test(s)) {
    portionAmbiguous = true;
    s = s.replace(SIZE_PAREN_RE, ' ');
  }
  if (SIZE_WORD_RE.test(s)) {
    portionAmbiguous = true;
    s = s.replace(SIZE_WORD_RE, ' ');
  }

  const isSet =
    N_GAJI_RE.test(s) ||
    SET_WORDS.some((word) => s.toLowerCase().includes(word)) ||
    // "치킨+콜라", "짜장&짬뽕", "기본/양념" — 양쪽에 글자가 있는 결합 기호.
    /\p{L}\s*[+&/]\s*\p{L}/u.test(s);

  // 남은 괄호는 부연("완숙"·"한우++")이라 통째로 떼되, 한글 2자 이상이면 음식명 힌트로 남긴다.
  const hints: string[] = [];
  s = s.replace(/[（(]([^)）]*)[)）]/g, (_m, inner: string) => {
    const h = inner.replace(GRADE_RE, ' ').trim();
    if (/^[\p{Script=Hangul}\s]{2,}$/u.test(h)) hints.push(h.replace(/\s+/g, ' '));
    return ' ';
  });
  s = s.replace(GRADE_RE, ' ');

  const cleaned = s
    .replace(/[-–—·,.:;!?~*'"`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { raw, cleaned, weight, isSet, portionAmbiguous, hints };
};

/** 앞 수식어를 최대 2개까지 떼어낸 정규화 이름. 뗄 것이 없으면 null. */
export const stripLeadingModifiers = (cleanedOrNorm: string): string | null => {
  let norm = normalizeTerm(cleanedOrNorm);
  let stripped = false;
  for (let i = 0; i < 2; i += 1) {
    const hit = LEADING_MODIFIERS.find((m) => norm.startsWith(m) && norm.length - m.length >= 2);
    if (!hit) break;
    norm = norm.slice(hit.length);
    stripped = true;
  }
  return stripped ? norm : null;
};

/** 동의어를 치환한 정규화 변형들(원형 제외). */
export const synonymVariants = (norm: string): string[] => {
  const out = new Set<string>();
  for (const [a, b] of SYNONYM_PAIRS) {
    if (norm.includes(a)) out.add(norm.split(a).join(b));
    if (norm.includes(b)) out.add(norm.split(b).join(a));
  }
  out.delete(norm);
  return [...out];
};

export interface MenuKcalResult {
  name: string;
  basis: MenuKcalBasis | null;
  /** 반올림한 정수 kcal. basis 가 null 이면 null. */
  kcal: number | null;
  foodId: string | null;
  foodName: string | null;
  matchedBy: MenuKcalMatchedBy | null;
  /** 카탈로그가 같은 계열 행에서 빌려온 값이면 그 출처 문구("소불고기 외 2종 중앙값"). */
  nutritionFrom: string | null;
  reason: MenuKcalReason;
  /** 표시하지 않은 퍼지 후보(측정 리포트용). */
  candidate: string | null;
}

export type MatchInput = Pick<
  FoodMatch,
  'foodId' | 'name' | 'kcal' | 'kcalPer100g' | 'servingG' | 'nutritionFrom'
> & { matchedBy: MenuKcalMatchedBy };

const none = (name: string, reason: MenuKcalReason, candidate: string | null = null): MenuKcalResult => ({
  name,
  basis: null,
  kcal: null,
  foodId: null,
  foodName: null,
  matchedBy: null,
  nutritionFrom: null,
  reason,
  candidate,
});

/** 전처리 결과 + 매칭 결과로 표시 등급을 정한다. 순수 함수 — 테스트·측정 스크립트가 같이 쓴다. */
export const decideMenuKcal = (
  parsed: ParsedMenuName,
  match: MatchInput | null,
  candidate: string | null = null,
): MenuKcalResult => {
  if (!parsed.cleaned) return none(parsed.raw, 'empty');
  if (parsed.isSet) return none(parsed.raw, 'set');
  if (!match) return none(parsed.raw, candidate ? 'fuzzy_rejected' : 'no_match', candidate);
  const base = {
    name: parsed.raw,
    foodId: match.foodId,
    foodName: match.name,
    matchedBy: match.matchedBy,
    nutritionFrom: match.nutritionFrom,
    candidate: null,
  };
  const perServingOk =
    PER_SERVING_MATCHES.has(match.matchedBy) &&
    parsed.weight === null &&
    !parsed.portionAmbiguous &&
    match.kcal !== null &&
    match.servingG !== null &&
    match.servingG > BASE_SERVING_G;
  if (perServingOk) {
    return { ...base, basis: 'per_serving', kcal: round0(match.kcal!), reason: 'per_serving' };
  }
  if (match.kcalPer100g !== null) {
    return {
      ...base,
      basis: parsed.weight?.unit === 'ml' ? 'per_100ml' : 'per_100g',
      kcal: round0(match.kcalPer100g),
      reason: 'per_100g',
    };
  }
  return none(parsed.raw, 'no_kcal');
};

export interface MenuFoodLookup {
  /** FoodService.matchFood — exact/alias/fuzzy. */
  matchFood(name: string): Promise<FoodMatch | null>;
  /** 정규화 메뉴명이 카탈로그 이름으로 **끝나는** 가장 긴 행(범주어 제외). 없으면 null. */
  matchBySuffix(norm: string): Promise<FoodMatch | null>;
}

interface SuffixRow {
  id: string;
  name: string;
  nameNorm: string;
  kcal: number | null;
  kcalPer100g: number | null;
  servingG: number | null;
  nutritionFrom: string | null;
}

/** 실제 카탈로그 조회 구현. `LIKE '%' || nameNorm` 으로 접미 후보를 좁힌 뒤 범주어를 거른다. */
export const createMenuFoodLookup = (
  prisma: PrismaClient,
  foodService: Pick<FoodService, 'matchFood'>,
): MenuFoodLookup => ({
  matchFood: (name) => foodService.matchFood(name),
  matchBySuffix: async (norm) => {
    if (norm.length < 3) return null;
    const rows = await prisma.$queryRaw<SuffixRow[]>(Prisma.sql`
      SELECT id, name, nameNorm, kcal, kcalPer100g, servingG, nutritionFrom
      FROM food_items
      WHERE active = 1
        AND length(nameNorm) >= 2
        AND nameNorm <> ${norm}
        AND ${norm} LIKE '%' || nameNorm
      ORDER BY length(nameNorm) DESC
      LIMIT 5
    `);
    const row = rows.find((r) => !SUFFIX_BLOCK.has(r.nameNorm));
    if (!row) return null;
    return {
      foodId: row.id,
      name: row.name,
      nameNorm: row.nameNorm,
      dishType: null,
      mainIngredient: null,
      cuisine: null,
      score: row.nameNorm.length / norm.length,
      matchedBy: 'exact',
      kcal: row.kcal,
      proteinG: null,
      sodiumMg: null,
      servingG: row.servingG,
      kcalPer100g: row.kcalPer100g,
      nutritionFrom: row.nutritionFrom,
    };
  },
});

/**
 * 메뉴명 여러 개를 카탈로그에 대어 본다. 같은 호출 안에서는 같은 이름을 한 번만 조회한다.
 */
export class MenuNutritionResolver {
  constructor(private readonly lookup: MenuFoodLookup) {}

  /** exact/alias 만 받는다(퍼지는 후보로만 돌려준다). */
  private async strict(
    name: string,
  ): Promise<{ hit: FoodMatch | null; fuzzy: FoodMatch | null }> {
    const m = await this.lookup.matchFood(name);
    if (!m) return { hit: null, fuzzy: null };
    return m.matchedBy === 'fuzzy' ? { hit: null, fuzzy: m } : { hit: m, fuzzy: null };
  }

  async resolve(name: string): Promise<MenuKcalResult> {
    const parsed = parseMenuName(name);
    if (!parsed.cleaned || parsed.isSet) return decideMenuKcal(parsed, null);
    const norm = normalizeTerm(parsed.cleaned);

    // 1) exact/alias
    const direct = await this.strict(parsed.cleaned);
    if (direct.hit) {
      return decideMenuKcal(parsed, {
        ...direct.hit,
        matchedBy: direct.hit.matchedBy === 'alias' ? 'alias' : 'exact',
      });
    }
    const fuzzyCandidate = direct.fuzzy?.name ?? null;

    // 2) 동의어
    for (const v of synonymVariants(norm)) {
      const r = await this.strict(v);
      if (r.hit) return decideMenuKcal(parsed, { ...r.hit, matchedBy: 'synonym' });
    }

    // 3) 앞 수식어 제거(+동의어)
    const stripped = stripLeadingModifiers(norm);
    if (stripped) {
      for (const v of [stripped, ...synonymVariants(stripped)]) {
        const r = await this.strict(v);
        if (r.hit) return decideMenuKcal(parsed, { ...r.hit, matchedBy: 'modifier' });
      }
    }

    // 4) 부위 + 구이
    for (const base of [norm, ...(stripped ? [stripped] : [])]) {
      for (const suffix of CUT_SUFFIXES) {
        if (base.endsWith(suffix)) continue;
        const r = await this.strict(base + suffix);
        if (r.hit) return decideMenuKcal(parsed, { ...r.hit, matchedBy: 'variant' });
      }
    }

    // 5) 괄호 힌트
    for (const hint of parsed.hints) {
      const r = await this.strict(hint);
      if (r.hit) return decideMenuKcal(parsed, { ...r.hit, matchedBy: 'hint' });
    }

    // 6) 핵심어 접미
    for (const base of [norm, ...(stripped ? [stripped] : [])]) {
      const s = await this.lookup.matchBySuffix(base);
      if (s) return decideMenuKcal(parsed, { ...s, matchedBy: 'suffix' });
    }

    return decideMenuKcal(parsed, null, fuzzyCandidate);
  }

  async resolveMany(names: string[]): Promise<Map<string, MenuKcalResult>> {
    const out = new Map<string, MenuKcalResult>();
    for (const name of names) {
      if (out.has(name)) continue;
      out.set(name, await this.resolve(name));
    }
    return out;
  }
}
