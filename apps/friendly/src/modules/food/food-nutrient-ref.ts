// 영양 기준 음식 — 비타민·무기질이 없는 음식 이름을 영양소가 있는 표준 음식에 잇는 규칙(순수 함수).
//
// 왜: 영양소 점검은 "먹은 열량 × 기준 음식의 열량당 영양소"로 계산한다(docs/PLAN-meal-nutrition.md A). 카탈로그의
// 외식 어휘·레시피·800선 행과 카탈로그 밖 식단 이름은 열량만 있고 비타민·무기질이 없어(운영 활성 4,812종 중 영양소
// 보유 약 1,260종, 2026-11-07) 점검의 '판단 보류'가 됐다. 공기밥↔쌀밥·치킨↔닭튀김처럼 글자가 안 겹치는 짝이 많아
// 이름 끝 맞추기만으로는 식단 기록 사용 53회 중 2회만 이어졌다 — 규칙이 못 잡은 것은 LLM 이 후보 중에서 고른다
// (food-nutrient-ref.service). 숫자는 늘 기준 음식 행에서 오고 규칙·LLM 은 어느 음식인지만 정한다.
//
// 순서(먼저 맞는 것): 같은 이름 → 빌려온 영양의 원래 행 → 고정 동의 표·동의어 변형·후보 별칭 → 핵심어(뒤 낱말) →
// 계열(대상으로 끝나는 후보들의 열량 중앙값 행). 그 밖은 LLM, 그래도 없으면 '없음'으로 저장해 다시 묻지 않는다.

import { guessMainIngredientFromName } from '@repo/utils';
import { normalizeTerm } from '../../lib/text.js';
import { synonymVariants } from './engine/parse.js';
import type { Lexicon } from './engine/index.js';
import { CATEGORY_WORDS, pickNutritionDonor, type NutritionDonor } from './food-nutrition.service.js';
import { NUTRIENT_KEYS, parseNutrientsPer100g, type NutrientKey } from './food-nutrients.js';
import { kcalPer100gOf } from './food-serving.js';
import { MENU_CANDIDATE_LIMIT, pickMenuCandidates } from './menu-nutrition-candidates.js';

// 판정 규칙·프롬프트가 바뀌면 올린다 — 저장된 'none'(물어봤지만 없음)과 LLM 판정만 다시 묻는다(규칙 판정은 매번 다시 계산).
export const FOOD_NUTRIENT_REF_VERSION = 1;

export const FOOD_NUTRIENT_REF_METHODS = ['same', 'borrowed', 'synonym', 'rule', 'llm', 'admin', 'none'] as const;
export type FoodNutrientRefMethod = (typeof FOOD_NUTRIENT_REF_METHODS)[number];

// 단백질·나트륨은 식단 스냅샷이 먼저라 '비타민·무기질이 있다'의 판단에서 뺀다.
const VITAMIN_MINERAL_KEYS: readonly NutrientKey[] = NUTRIENT_KEYS.filter(
  (k) => k !== 'proteinG' && k !== 'sodiumMg' && k !== 'cholesterolMg' && k !== 'saturatedFatG' && k !== 'phosphorusMg',
);

/** 행이 기준 음식이 될 수 있는지 — 비타민·무기질이 하나라도 있고 100g당 열량을 안다(열량당 밀도를 낼 수 있다). */
export const isNutrientProfileRow = (row: {
  nutrientsPer100gJson: string | null;
  kcalPer100g: number | null;
  kcal: number | null;
  servingG: number | null;
}): boolean => {
  const kcal100 = kcalPer100gOf(row);
  if (kcal100 === null || kcal100 <= 0) return false;
  const per100 = parseNutrientsPer100g(row.nutrientsPer100gJson);
  return VITAMIN_MINERAL_KEYS.some((k) => per100[k] !== undefined);
};

// 고정 동의 표 — 글자가 안 겹치는데 흔한 짝(식당·가정 표기 → 식약처 표기). 정규화 키 기준.
export const NUTRIENT_REF_SYNONYMS: Readonly<Record<string, string>> = {
  공기밥: '쌀밥',
  흰밥: '쌀밥',
  흰쌀밥: '쌀밥',
  백미밥: '쌀밥',
  치킨: '닭튀김',
  후라이드치킨: '닭튀김',
  프라이드치킨: '닭튀김',
  통닭: '닭튀김',
};

export interface NutrientRefCandidate {
  id: string;
  name: string;
  nameNorm: string;
  aliasNormsJson: string;
  dishType: string | null;
  mainIngredient: string | null;
  kcal: number | null;
  servingG: number | null;
  kcalPer100g: number | null;
}

export interface NutrientRefTarget {
  name: string;
  nameNorm: string;
  dishType: string | null;
  /** 주재료(카탈로그 분류). 없으면 이름으로 짐작한다(guessMainIngredientFromName). */
  mainIngredient?: string | null;
  /** 카탈로그 행이 영양을 빌려온 원래 음식('소불고기', '머스터드튤립치킨 외 1종 중앙값'). */
  nutritionFrom: string | null;
}

export interface NutrientRefIndex {
  candidates: readonly NutrientRefCandidate[];
  byId: ReadonlyMap<string, NutrientRefCandidate>;
  byNorm: ReadonlyMap<string, NutrientRefCandidate>;
  byAlias: ReadonlyMap<string, NutrientRefCandidate>;
  byName: ReadonlyMap<string, NutrientRefCandidate>;
}

export const buildNutrientRefIndex = (candidates: readonly NutrientRefCandidate[]): NutrientRefIndex => {
  const byId = new Map<string, NutrientRefCandidate>();
  const byNorm = new Map<string, NutrientRefCandidate>();
  const byAlias = new Map<string, NutrientRefCandidate>();
  const byName = new Map<string, NutrientRefCandidate>();
  for (const c of candidates) {
    byId.set(c.id, c);
    byNorm.set(c.nameNorm, c);
    byName.set(c.name, c);
  }
  // 별칭은 이름이 먼저 — 같은 별칭이 여러 후보에 있으면 처음 것.
  for (const c of candidates) {
    let aliases: unknown;
    try {
      aliases = JSON.parse(c.aliasNormsJson);
    } catch {
      aliases = [];
    }
    if (!Array.isArray(aliases)) continue;
    for (const a of aliases) {
      if (typeof a === 'string' && a && !byNorm.has(a) && !byAlias.has(a)) byAlias.set(a, c);
    }
  }
  return { candidates, byId, byNorm, byAlias, byName };
};

const aliasNormsOf = (c: NutrientRefCandidate): string[] => {
  try {
    const v: unknown = JSON.parse(c.aliasNormsJson);
    return Array.isArray(v) ? v.filter((a): a is string => typeof a === 'string' && a.length > 0) : [];
  } catch {
    return [];
  }
};

/**
 * LLM 에 보일 후보 — 메뉴 칼로리와 같은 문자열 근접 점수(pickMenuCandidates)를 이름뿐 아니라 **별칭**에도 매긴다.
 * 식약처 대표식품의 별칭에는 변형 식품명('해장국 우거지'·'국밥 돼지고기')이 들어 있어, 이름만 보면 글자가 안 겹치는
 * 우거지탕 → 해장국, 돼지국밥 → 국밥 같은 짝이 후보에 오른다. 같은 후보는 한 번만(가장 높은 점수 자리).
 */
export const pickNutrientRefCandidates = (
  name: string,
  index: NutrientRefIndex,
  limit = MENU_CANDIDATE_LIMIT,
): NutrientRefCandidate[] => {
  const pseudo: { name: string; nameNorm: string; candidate: NutrientRefCandidate }[] = [];
  for (const c of index.candidates) {
    pseudo.push({ name: c.name, nameNorm: c.nameNorm, candidate: c });
    for (const a of aliasNormsOf(c)) pseudo.push({ name: c.name, nameNorm: a, candidate: c });
  }
  const out: NutrientRefCandidate[] = [];
  const seen = new Set<string>();
  for (const p of pickMenuCandidates(name, pseudo, limit * 4)) {
    if (seen.has(p.candidate.id)) continue;
    seen.add(p.candidate.id);
    out.push(p.candidate);
    if (out.length >= limit) break;
  }
  return out;
};

export interface NutrientRefVerdict {
  candidate: NutrientRefCandidate;
  method: Exclude<FoodNutrientRefMethod, 'llm' | 'admin' | 'none'>;
  reason: string;
}

const compatible = (a: string | null, b: string | null): boolean => !a || !b || a === b;

// 주재료가 서로 다른 고기·생선·채소면 잇지 않는다(닭갈비 → 갈비(소) ✗). 곡류(밥·면·만두 같은 바탕 음식)·기타는
// 어느 쪽이든 막지 않는다 — 참치김밥 → 김밥, 돼지국밥 → 국밥 은 영양 구성으로 가깝다.
const LOOSE_INGREDIENTS = new Set(['grain', 'other']);
const ingredientCompatible = (a: string | null, b: string | null): boolean =>
  !a || !b || a === b || LOOSE_INGREDIENTS.has(a) || LOOSE_INGREDIENTS.has(b);

/** 규칙만으로 기준 음식을 찾는다(LLM 없음). 못 찾으면 null. */
export const resolveNutrientRefByRules = (
  target: NutrientRefTarget,
  index: NutrientRefIndex,
  lex?: Lexicon,
): NutrientRefVerdict | null => {
  const norm = target.nameNorm || normalizeTerm(target.name);
  if (!norm) return null;
  const targetMain = target.mainIngredient ?? guessMainIngredientFromName(target.name);

  // 1) 같은 이름의 후보(카탈로그 밖 식단 이름이 영양소 있는 행과 같은 경우).
  const same = index.byNorm.get(norm);
  if (same) return { candidate: same, method: 'same', reason: '같은 이름' };

  // 2) 영양을 빌려온 원래 행.
  if (target.nutritionFrom) {
    const donorName = target.nutritionFrom.replace(/ 외 \d+종 중앙값$/, '');
    const donor = index.byName.get(donorName) ?? index.byNorm.get(normalizeTerm(donorName));
    if (donor) return { candidate: donor, method: 'borrowed', reason: `영양을 빌려온 ${donor.name}` };
  }

  // 3) 고정 동의 표 → 동의어 변형(계란↔달걀 등) → 후보 별칭.
  const fixed = NUTRIENT_REF_SYNONYMS[norm];
  if (fixed) {
    const hit = index.byNorm.get(normalizeTerm(fixed));
    if (hit) return { candidate: hit, method: 'synonym', reason: `${target.name} = ${hit.name}` };
  }
  for (const v of [norm, ...synonymVariants(norm, lex)]) {
    const hit = (v !== norm ? index.byNorm.get(v) : undefined) ?? index.byAlias.get(v);
    if (hit) return { candidate: hit, method: 'synonym', reason: `${hit.name}의 다른 이름` };
  }

  // 4) 핵심어 — 한국어 음식명은 뒤가 핵심어(소고기해장국 → 해장국). 가장 긴 후보 이름, 범주어·한 글자 제외,
  //    조리형태가 양쪽에 있으면 같아야 한다.
  let headHit: NutrientRefCandidate | null = null;
  for (const c of index.candidates) {
    if (c.nameNorm.length < 2 || CATEGORY_WORDS.has(c.nameNorm) || c.nameNorm === norm) continue;
    if (!norm.endsWith(c.nameNorm) || !compatible(target.dishType, c.dishType)) continue;
    if (!ingredientCompatible(targetMain, c.mainIngredient)) continue;
    if (!headHit || c.nameNorm.length > headHit.nameNorm.length) headHit = c;
  }
  if (headHit) return { candidate: headHit, method: 'rule', reason: `핵심어 ${headHit.name}` };

  // 5) 계열 — 대상으로 끝나는 후보들(소불고기·돼지불고기 → 불고기) 중 열량 중앙값에 가장 가까운 행.
  const donors: NutritionDonor[] = index.candidates
    .filter((c) => c.kcal !== null && ingredientCompatible(targetMain, c.mainIngredient))
    .map((c) => ({
      id: c.id,
      name: c.name,
      nameNorm: c.nameNorm,
      dishType: c.dishType,
      servingG: c.servingG,
      kcal: c.kcal,
      carbG: null,
      proteinG: null,
      fatG: null,
      sodiumMg: null,
      sugarG: null,
      kcalPer100g: c.kcalPer100g,
      nutrientsPer100gJson: null,
    }));
  const pick = pickNutritionDonor({ id: '', name: target.name, nameNorm: norm, dishType: target.dishType }, donors);
  if (pick) {
    const c = index.byNorm.get(pick.donor.nameNorm);
    if (c) {
      return {
        candidate: c,
        method: 'rule',
        reason: pick.donorCount > 1 ? `${c.name} 외 ${pick.donorCount - 1}종 중 열량 중앙값` : `계열 ${c.name}`,
      };
    }
  }
  return null;
};
