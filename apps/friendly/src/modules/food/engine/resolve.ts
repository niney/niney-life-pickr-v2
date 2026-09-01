// 판정 캐스케이드 — 전처리된 메뉴명을 카탈로그 인덱스에 대어 등급을 정한다.
//
// 매칭 순서(앞이 정밀):
//   exact/alias → synonym → modifier(앞 수식어 제거) → variant(부위+구이 / 조리접미 제거→원재료) →
//   suffix(핵심어 접미) → hint(괄호 안 음식명, 생재료 제외).
//   힌트가 접미보다 뒤인 이유: "화덕통구이족발(앞다리)"·"차돌해물짬뽕(우삼겹)" 처럼 괄호가 재료를 적는 경우가
//   많아, 본체가 먼저 맞으면 그것을 쓴다.
//
// 판정 규칙:
//   - 세트(setSignal) → 미표시. 단, 수량 표식(한판)만 있던 이름은 부위를 찾으면 100g당.
//   - exact/alias/synonym/modifier 이고 중량·인분·크기·수량 표식이 없으며 카탈로그 1인분 중량이 기준량(100g)보다
//     크면 `per_serving`. 그 외 100g당 값이 있으면 `per_100g`(ml 중량이면 `per_100ml`).
//   - 트레이스(trace)에 시도한 단계를 남긴다 — 골든셋에서 어느 단계가 틀렸는지 바로 본다.

import { normalizeTerm } from '../../../lib/text.js';
import type { CatalogIndex, CatalogRow, IndexHit } from './catalog-index.js';
import { DEFAULT_LEXICON, type Lexicon } from './lexicon.js';
import { parseMenuName, stripLeadingModifiers, synonymVariants, type ParsedMenuName } from './parse.js';

export type MenuKcalBasis = 'per_serving' | 'per_100g' | 'per_100ml';
export type MenuKcalMatchedBy = 'exact' | 'alias' | 'synonym' | 'modifier' | 'variant' | 'hint' | 'suffix';
export type MenuKcalReason = 'per_serving' | 'per_100g' | 'set' | 'empty' | 'no_match' | 'fuzzy_rejected' | 'no_kcal';

// 1인분 표시를 허용하는 매칭 방식 — 이름이 같은 음식이라고 볼 수 있는 경우만.
const PER_SERVING_MATCHES: ReadonlySet<MenuKcalMatchedBy> = new Set(['exact', 'alias', 'synonym', 'modifier']);
// 표준데이터의 기준량. 1인분 중량이 이 값이면 "1인분"이 아니라 기준량을 그대로 둔 행이다.
const BASE_SERVING_G = 100;
const RAW_SOURCE = 'mfds-raw';
const RAW_MEAT_CATEGORY = '육류';

export interface MenuKcalResult {
  name: string;
  basis: MenuKcalBasis | null;
  /** 반올림한 정수 kcal. basis 가 null 이면 null. */
  kcal: number | null;
  foodId: string | null;
  foodName: string | null;
  matchedBy: MenuKcalMatchedBy | null;
  /** 카탈로그가 같은 계열 행에서 빌려온 값이면 그 출처 문구. */
  nutritionFrom: string | null;
  /** 매칭된 행의 100g당 값(등급과 무관) — LLM 표준명 재투입처럼 100g당만 쓰는 호출자용. */
  kcalPer100g: number | null;
  reason: MenuKcalReason;
  /** 표시하지 않은 퍼지 후보(측정 리포트용). 엔진은 퍼지를 쓰지 않으므로 항상 null. */
  candidate: string | null;
  /** 시도한 단계 기록("exact:김치찌개 ✗", "suffix:짜장면 ✓"). */
  trace: string[];
  /** 결합 기호 세트("문어+소라")의 구성요소별 판정. 세트가 아니면 비어 있다. */
  components: MenuKcalResult[];
}

export interface MatchInput {
  foodId: string;
  name: string;
  kcal: number | null;
  kcalPer100g: number | null;
  servingG: number | null;
  nutritionFrom: string | null;
  matchedBy: MenuKcalMatchedBy;
}

const round0 = (v: number): number => Math.round(v);

const none = (name: string, reason: MenuKcalReason, trace: string[] = [], candidate: string | null = null): MenuKcalResult => ({
  name,
  basis: null,
  kcal: null,
  foodId: null,
  foodName: null,
  matchedBy: null,
  nutritionFrom: null,
  kcalPer100g: null,
  reason,
  candidate,
  trace,
  components: [],
});

/** 전처리 결과 + 매칭 결과로 표시 등급을 정한다. 순수 함수. */
export const decideMenuKcal = (
  parsed: ParsedMenuName,
  match: MatchInput | null,
  candidate: string | null = null,
  trace: string[] = [],
): MenuKcalResult => {
  if (!parsed.cleaned) return none(parsed.raw, 'empty', trace);
  if (parsed.isSet) return none(parsed.raw, 'set', trace);
  if (!match) return none(parsed.raw, candidate ? 'fuzzy_rejected' : 'no_match', trace, candidate);
  const base = {
    name: parsed.raw,
    foodId: match.foodId,
    foodName: match.name,
    matchedBy: match.matchedBy,
    nutritionFrom: match.nutritionFrom,
    kcalPer100g: match.kcalPer100g,
    candidate: null,
    trace,
    components: [],
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
  return none(parsed.raw, 'no_kcal', trace);
};

const toInput = (hit: IndexHit, matchedBy: MenuKcalMatchedBy): MatchInput => ({
  foodId: hit.row.id,
  name: hit.row.name,
  kcal: hit.row.kcal,
  kcalPer100g: hit.row.kcalPer100g,
  servingG: hit.row.servingG,
  nutritionFrom: hit.row.nutritionFrom,
  matchedBy,
});

const isRaw = (row: CatalogRow): boolean => row.source === RAW_SOURCE;
// 접미로 붙어도 되는 생재료는 고기 부위뿐 — "망고목살"은 목살이지만 "칠리새우"는 새우(생것)가 아니라 요리다.
const rawSuffixOk = (row: CatalogRow): boolean => !isRaw(row) || row.sourceCategory === RAW_MEAT_CATEGORY;

/** 정규화된 한 이름을 캐스케이드로 찾는다. 세트·표식은 보지 않는다(호출자가 parsed 로 판정). */
export const matchNorm = (
  norm: string,
  hints: string[],
  index: CatalogIndex,
  lex: Lexicon,
  trace: string[],
): MatchInput | null => {
  const tryExact = (key: string, as: MenuKcalMatchedBy | 'direct'): MatchInput | null => {
    const hit = index.exact(key);
    trace.push(`${as}:${key}${hit ? ` ✓${hit.row.name}` : ' ✗'}`);
    if (!hit) return null;
    return toInput(hit, as === 'direct' ? (hit.alias ? 'alias' : 'exact') : as);
  };

  // 1) exact/alias
  const direct = tryExact(norm, 'direct');
  if (direct) return direct;

  // 2) 동의어
  for (const v of synonymVariants(norm, lex)) {
    const r = tryExact(v, 'synonym');
    if (r) return r;
  }

  // 3) 앞 수식어 제거(+동의어)
  const stripped = stripLeadingModifiers(norm, lex);
  if (stripped) {
    for (const v of [stripped, ...synonymVariants(stripped, lex)]) {
      const r = tryExact(v, 'modifier');
      if (r) return r;
    }
  }
  const bases = [norm, ...(stripped ? [stripped] : [])];

  // 4) 부위 + 구이
  for (const base of bases) {
    for (const suffix of lex.cutSuffixes) {
      if (base.endsWith(suffix)) continue;
      const r = tryExact(base + suffix, 'variant');
      if (r) return r;
    }
  }
  // 4b) 조리법 접미 제거 → 원재료(항정살구이 → 항정살, 연어회 → 연어)
  for (const base of bases) {
    for (const suffix of lex.rawSuffixes) {
      if (!base.endsWith(suffix) || base.length - suffix.length < 2) continue;
      const r = tryExact(base.slice(0, -suffix.length), 'variant');
      if (r) return r;
    }
  }

  // 5) 핵심어 접미
  for (const base of bases) {
    const hit = index.suffix(base, lex.suffixBlock);
    const ok = hit ? rawSuffixOk(hit.row) : false;
    trace.push(`suffix:${base}${hit ? (ok ? ` ✓${hit.row.name}` : ` ✗raw(${hit.row.name})`) : ' ✗'}`);
    if (hit && ok) return toInput(hit, 'suffix');
  }

  // 6) 괄호 힌트 — 생재료(앞다리·우삼겹)는 요리명이 아니라 재료 표기라 제외.
  for (const hint of hints) {
    const key = normalizeTerm(hint);
    const hit = index.exact(key);
    trace.push(`hint:${key}${hit ? (isRaw(hit.row) ? ` ✗raw(${hit.row.name})` : ` ✓${hit.row.name}`) : ' ✗'}`);
    if (hit && !isRaw(hit.row)) return toInput(hit, 'hint');
  }
  return null;
};

/** 메뉴명 하나를 판정한다. 동기·순수(인덱스·어휘만 읽는다). */
export const resolveMenuName = (name: string, index: CatalogIndex, lex: Lexicon = DEFAULT_LEXICON): MenuKcalResult => {
  const parsed = parseMenuName(name, lex);
  const trace: string[] = [];
  if (!parsed.cleaned) return decideMenuKcal(parsed, null, null, trace);

  if (parsed.isSet) {
    trace.push(`set:${parsed.setSignal}`);
    // 결합 기호 세트는 구성요소를 따로 판정해 둔다(표시 계약은 호출자 몫).
    const components =
      parsed.setSignal === '결합기호' && parsed.parts.length >= 2
        ? parsed.parts.map((p) => resolveMenuName(p, index, lex))
        : [];
    return { ...decideMenuKcal(parsed, null, null, trace), components };
  }

  const norm = normalizeTerm(parsed.cleaned);
  const match = matchNorm(norm, parsed.hints, index, lex, trace);
  if (parsed.quantifier) trace.push(`quantifier:${parsed.quantifier}${match ? '' : ' → set'}`);
  // 한판·반판은 부위를 못 찾으면 모듬(세트)이다.
  if (!match && parsed.quantifier) return { ...none(parsed.raw, 'set', trace), components: [] };
  return decideMenuKcal(parsed, match, null, trace);
};
