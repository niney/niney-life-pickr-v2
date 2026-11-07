import type { MealNutritionAnalysisType } from '@repo/api-contract';
import type { NutrientKey, NutrientsPer100g } from '../food/food-nutrients.js';
import { NUTRIENT_DEFS, isAdditiveNutrientSource } from '../meal-nutrition/meal-nutrition.defs.js';

// 식단 추천의 영양 보정(2026-11-07) — 영양소 점검(최근 14일)이 이미 내린 판정에서 '나트륨 많음'과 '부족한 비타민·무기질'만
// 뽑아, 추천 점수의 건강 항목을 그 사람에 맞게 조금 고치고 프롬프트에 한 줄로 알린다. 화면 검토에서 추천 이유가 전부 조리형태·
// 주재료 다양성뿐이고(나트륨 152% 인 사람에게 된장찌개), 영양 탭의 "국물을 줄이세요"와 어긋났다.
//
// 원칙(추천 설계 결정 E): 추천의 기본 목표는 겹치지 않게·취향·골고루이고 건강은 사용자가 중요도를 높였을 때 강조한다 — 그래서
// 보정은 '건강' 요소에만 더해 사용자의 건강 가중치(기본 2/18)만큼만 순위를 움직이고, 프롬프트도 '한 마디'로만 쓰게 한다.

export const NUTRITION_SIGNAL_DAYS = 14;
// 한 끼(1인분)가 하루 기준의 이 비율을 채우면 그 영양소를 '보충'하는 음식으로 본다(영양 탭 '한 끼로는'과 같은 문턱).
const SERVING_TARGET_SHARE = 0.25;
const MAX_GAPS = 5;
// 건강 점수에 더하는 폭 — 부족분을 다 채우면 +0.3, 아주 짜면 -0.25(+ 일반 건강 감점 -0.2).
const GAP_BONUS = 0.3;
const SALTY_SERVING_MG = 1500;
const SALTY_PENALTY = 0.25;
const SOUP_PENALTY = 0.15;
const LOW_SODIUM_SERVING_MG = 700;
const LOW_SODIUM_BONUS = 0.05;
const SOUP_DISH_TYPES = new Set(['soup', 'stew']);
// 조리형태가 밥(국밥)·찜으로 분류된 국물 요리도 이름으로(영양 탭 한 끼 제안과 같은 규칙).
const SOUP_NAME_RE = /(국밥|탕|찌개|전골|국)$/;

export interface NutritionGap {
  key: string;
  label: string;
  per100: NutrientKey;
  reference: number;
  percent: number | null;
  // 부족 1 · 조금 부족 0.5.
  weight: number;
}

export interface NutritionSignals {
  days: number;
  sodiumHigh: boolean;
  sodiumPercent: number | null;
  // 비율 낮은 순, 최대 5개.
  gaps: NutritionGap[];
}

/**
 * 영양소 점검 → 추천 신호. 기록이 모자라면(insufficient) null. 부족 판정이어도 '기록 더 필요'(빠진 끼니를 채우면 닿는 수준)
 * 와 판단 보류는 빼고, 단백질·나트륨(스냅샷 기반)은 부족 목록에 넣지 않는다.
 */
export const nutritionSignalsFrom = (
  analysis: MealNutritionAnalysisType | null | undefined,
): NutritionSignals | null => {
  if (!analysis || analysis.status !== 'ok') return null;
  const sodium = analysis.nutrients.find((n) => n.key === 'sodium');
  const gaps: NutritionGap[] = [];
  for (const n of analysis.nutrients) {
    if (n.status !== 'low' && n.status !== 'borderline') continue;
    if (n.recordGap) continue;
    const def = NUTRIENT_DEFS.find((d) => d.key === n.key);
    if (!def || !('per100' in def.from)) continue;
    gaps.push({
      key: n.key,
      label: n.label,
      per100: def.from.per100,
      reference: n.reference.amount,
      percent: n.percent,
      weight: n.status === 'low' ? 1 : 0.5,
    });
  }
  gaps.sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0));
  const signals: NutritionSignals = {
    days: analysis.days,
    sodiumHigh: sodium?.status === 'high',
    sodiumPercent: sodium?.percent ?? null,
    gaps: gaps.slice(0, MAX_GAPS),
  };
  return signals.sodiumHigh || signals.gaps.length > 0 ? signals : null;
};

/** 캐시 키에 넣을 짧은 지문 — 판정이 바뀌면 같은 날·끼니여도 다시 고른다. */
export const nutritionSignalsKey = (s: NutritionSignals | null): string | null =>
  s ? `${s.sodiumHigh ? 'Na+' : ''}${s.gaps.map((g) => `${g.key}:${g.weight}`).join(',')}` : null;

export const isSoupLike = (c: { dishType: string | null; nameNorm: string }): boolean =>
  SOUP_DISH_TYPES.has(c.dishType ?? '') || SOUP_NAME_RE.test(c.nameNorm);

export interface NutritionFit {
  // 건강 점수에 더할 값(-0.25~+0.35).
  delta: number;
  // 부족한 영양소를 채우는 정도(0~1, 부족·조금 부족 가중 평균) — 프로브·화면 근거.
  coverage: number;
  // 한 끼로 기준의 25% 이상 채우는 부족 영양소 중 가장 많이 채우는 것 — "비타민 D 보충".
  gapTag: string | null;
}

/**
 * 후보 하나의 영양 보정. 1회 분량 비타민·무기질(servingNutrients)이 없는 후보는 부족분 가점이 없고(모르면 중립), 나트륨이 많은
 * 사람에게 1인분 나트륨 1,500mg 이상·국물 요리는 감점, 700mg 이하는 조금 가점.
 */
export const nutritionFit = (
  c: {
    dishType: string | null;
    nameNorm: string;
    sodiumMg: number | null;
    servingNutrients?: NutrientsPer100g | null;
  },
  s: NutritionSignals,
): NutritionFit => {
  let delta = 0;
  if (s.sodiumHigh) {
    if (c.sodiumMg !== null && c.sodiumMg >= SALTY_SERVING_MG) delta -= SALTY_PENALTY;
    else if (isSoupLike(c)) delta -= SOUP_PENALTY;
    else if (c.sodiumMg !== null && c.sodiumMg <= LOW_SODIUM_SERVING_MG) delta += LOW_SODIUM_BONUS;
  }
  let coverage = 0;
  let gapTag: string | null = null;
  if (s.gaps.length > 0 && c.servingNutrients) {
    let sum = 0;
    let weights = 0;
    let best = 0;
    for (const g of s.gaps) {
      // 가공육의 비타민 C(첨가물일 수 있는 값)는 보충 근거로 세지 않는다 — 훈제오리 '비타민 C 보충'.
      const amount = isAdditiveNutrientSource(g.key, c.nameNorm) ? undefined : c.servingNutrients[g.per100];
      const share = amount !== undefined && g.reference > 0 ? amount / g.reference : 0;
      sum += g.weight * Math.min(1, share / SERVING_TARGET_SHARE);
      weights += g.weight;
      if (share >= SERVING_TARGET_SHARE && share > best) {
        best = share;
        gapTag = `${g.label} 보충`;
      }
    }
    coverage = weights > 0 ? sum / weights : 0;
    delta += GAP_BONUS * coverage;
  }
  return { delta, coverage: Math.round(coverage * 100) / 100, gapTag };
};

// ── 이유 문장의 영양 주장 검사 ────────────────────────────────────────────────────
// LLM 이 후보 태그에 없는 영양소를 지어냈다(2026-11-07 프로빙: "콩국수 — 칼륨 보충으로 비타민 C·칼슘·엽산 부족을 보완",
// "비빔밥 — 비타민 D 보충"). 영양소 이름은 그 후보가 실제로 한 끼에 기준의 25% 이상 채우는 부족 영양소(태그 '○○ 보충')만
// 말할 수 있게, 근거 없는 영양소를 말한 문장은 뺀다. 단백질(일반 건강 태그)·나트륨(후보 줄에 숫자를 준다)은 보지 않는다.
const NUTRIENT_MENTIONS: ReadonlyArray<[key: string, re: RegExp]> = [
  ['vitaminD', /비타민\s?D/i],
  ['vitaminC', /비타민\s?C/i],
  ['vitaminA', /비타민\s?A/i],
  ['thiamin', /비타민\s?B1|티아민/i],
  ['riboflavin', /비타민\s?B2|리보플라빈/i],
  ['niacin', /니아신|비타민\s?B3/i],
  ['folate', /엽산/],
  ['calcium', /칼슘/],
  ['iron', /철분|(?<![가-힣])철(?=[을를이가은는도과와의만\s,.·]|$)/],
  ['potassium', /칼륨/],
  ['magnesium', /마그네슘/],
  ['zinc', /아연/],
  ['fiber', /식이섬유|섬유질/],
];

/** 이 후보가 한 끼로 기준의 25% 이상 채우는 부족 영양소 key — 이유에서 말해도 되는 영양소(가공육의 비타민 C 는 뺀다). */
export const supportedGapKeys = (
  c: { servingNutrients?: NutrientsPer100g | null; nameNorm?: string },
  s: NutritionSignals | null,
): Set<string> => {
  const out = new Set<string>();
  if (!s || !c.servingNutrients) return out;
  for (const g of s.gaps) {
    if (c.nameNorm !== undefined && isAdditiveNutrientSource(g.key, c.nameNorm)) continue;
    const v = c.servingNutrients[g.per100];
    if (v !== undefined && g.reference > 0 && v / g.reference >= SERVING_TARGET_SHARE) out.add(g.key);
  }
  return out;
};

/** 문장에서 말한 영양소 중 근거(supported)에 없는 것. */
export const unsupportedNutrients = (text: string, supported: ReadonlySet<string>): string[] =>
  NUTRIENT_MENTIONS.filter(([key, re]) => re.test(text) && !supported.has(key)).map(([key]) => key);

/**
 * 근거 없는 영양소를 말한 문장을 뺀다. 남는 문장이 없으면 null(호출부가 서버 문장으로 바꾼다). 문장은 마침표·물음표·느낌표
 * 뒤 공백으로 나눈다(이유는 1~2문장).
 */
export const stripUnsupportedNutrientClaims = (text: string, supported: ReadonlySet<string>): string | null => {
  const sentences = text.split(/(?<=[.!?。])\s+/).map((s) => s.trim()).filter(Boolean);
  const kept = sentences.filter((s) => unsupportedNutrients(s, supported).length === 0);
  return kept.length > 0 ? kept.join(' ') : null;
};
