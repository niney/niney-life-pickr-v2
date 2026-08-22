import { Cron } from 'croner';
import type { FoodImportRun as PrismaFoodImportRun, PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import {
  FoodImportSource,
  type FoodCuisineType,
  type FoodDishTypeType,
  type FoodImportConfigInputType,
  type FoodImportConfigType,
  type FoodImportPreviewResultType,
  type FoodImportRunInputType,
  type FoodImportRunListType,
  type FoodImportRunStatusType,
  type FoodImportRunType,
  type FoodImportSourceStatType,
  type FoodImportSourceType,
  type FoodImportTriggerType,
  type FoodMainIngredientType,
  type FoodSourceType,
} from '@repo/api-contract';
import {
  guessCuisineFromName,
  guessDishTypeFromName,
  guessMainIngredientFromName,
  hansikCategoryToDishType,
  menuCanonicalRootHint,
  mfdsCategoryToDishType,
  rcpWayToDishType,
} from '@repo/utils';
import { coerceStrOrNull, numOrNull } from '../../lib/narrow.js';
import { normalizeTerm } from '../../lib/text.js';
import type { OperationLogService } from '../logs/operation-log.service.js';
import { scheduleRegistry } from '../schedule/schedule-registry.js';
import {
  MAFRA_INGREDIENT_GRID,
  MAFRA_RECIPE_GRID,
  fetchAllMafra,
  fetchAllMfdsNutrition,
  fetchAllMfdsRecipes,
} from './food-api.adapter.js';
import type { FoodClassifyService } from './food-classify.service.js';
import { foodImportRegistry } from './food-import-registry.js';
import { buildAliasNorms, parseJsonStringArray } from './food.service.js';

// 음식 카탈로그 적재 — 외부 소스(식약처 영양성분 표준데이터 / 식약처 레시피 / MAFRA 레시피) + 로컬
// (global_menu_canonicals 필터분 / 한식 800선 CSV) 를 FoodSeed 로 정규화해 FoodItem 에 병합(upsert)
// 한다. 설정·지금 실행·이력·SSE 는 random-crawl 과 같은 골격(자체 레지스트리 + scheduleRegistry cron).
//
// 병합 규칙(nameNorm 이 행 식별 키):
//   - 없으면 create(source=이번 소스).
//   - 있으면 비어 있는 필드만 채우고(repName/분류/재료/중량/영양), 별칭 합집합, sourceRefs 에 {source,sourceId}
//     추가(다른 소스일 때), popularity 는 max. 기존 행의 source(대표 출처)는 유지.
// 정규화는 순수 함수(normalize*Rows)로 두어 픽스처 테스트가 네트워크·DB 없이 돈다.

const JOB_TYPE = 'food-import';
// 매월 1일 04:00 — 표준데이터가 매월 초 병합 갱신(prisma default 와 일치).
const DEFAULT_CRON = '0 4 1 * *';
const DEFAULT_TZ = 'Asia/Seoul';
const DEFAULT_SOURCES: FoodImportSourceType[] = [
  'mfds-nutrition',
  'mfds-recipe',
  'mafra-recipe',
  'menu-canonical',
];
const RUN_HISTORY_LIMIT = 50;
// upsert 진행 이벤트 간격(행).
const PROGRESS_EVERY = 100;
// 카탈로그에 합류시키는 외식 메뉴 어휘의 최소 식당 수(리뷰 어휘 노이즈 차단).
export const MENU_CANONICAL_MIN_RESTAURANTS = 2;
// 식약처 표준데이터에서 1인분 영양 산출 시 식품기원 우선순위(작을수록 우선).
const MFDS_ORIGIN_PRIORITY: ReadonlyArray<[RegExp, number]> = [
  [/가정식/u, 0],
  [/외식\(분석\)/u, 1],
  [/재료량/u, 2],
  [/급식/u, 3],
  [/프랜차이즈/u, 4],
];
// 표준데이터 "요리류" 대분류 — 이 밖(빵·과자/음료·차/유제품 등 프랜차이즈 상품 위주)은 대표식품 단위로만 합류.
const MFDS_DISH_CATEGORIES = new Set([
  '밥류',
  '죽및스프류',
  '면및만두류',
  '국및탕류',
  '찌개및전골류',
  '구이류',
  '볶음류',
  '조림류',
  '찜류',
  '전적및부침류',
  '튀김류',
  '나물숙채류',
  '생채무침류',
  '김치류',
  '장아찌절임류',
  '젓갈류',
  '수조어육류',
  '장류양념류',
]);
const MAX_ALIASES = 30;
const MAX_INGREDIENTS = 25;

export interface FoodSeed {
  name: string;
  repName?: string | null;
  aliases?: string[];
  dishType?: FoodDishTypeType | null;
  mainIngredient?: FoodMainIngredientType | null;
  cuisine?: FoodCuisineType | null;
  ingredients?: string[] | null;
  servingG?: number | null;
  nutrition?: {
    kcal: number | null;
    carbG: number | null;
    proteinG: number | null;
    fatG: number | null;
    sodiumMg: number | null;
    sugarG: number | null;
  } | null;
  source: FoodSourceType;
  sourceId?: string | null;
  sourceCategory?: string | null;
  popularity?: number;
  // 같은 배치에서 다른 출처가 같은 이름으로 접힌 경우의 추가 출처 참조.
  sourceRefs?: { source: FoodSourceType; sourceId: string | null }[];
}

export interface NormalizeReport {
  fetched: number;
  produced: number;
  // 사유별 drop 수.
  dropped: Record<string, number>;
}

// ── 공통 헬퍼 ───────────────────────────────────────────────────────────────

const cleanName = (raw: string): string =>
  raw
    .replace(/\s+/g, ' ')
    .replace(/[\u200b\ufeff]/g, '')
    .trim();

const categoryKey = (raw: string): string => raw.replace(/[\s·ㆍ•,，()]/g, '').trim();

const addDrop = (report: NormalizeReport, reason: string): void => {
  report.dropped[reason] = (report.dropped[reason] ?? 0) + 1;
};

// 이름 규칙으로 비어 있는 분류를 채운다(적재 단계 공통).
export const applyNameRules = (seed: FoodSeed): FoodSeed => ({
  ...seed,
  dishType: seed.dishType ?? guessDishTypeFromName(seed.name),
  mainIngredient: seed.mainIngredient ?? guessMainIngredientFromName(seed.name),
  cuisine: seed.cuisine ?? guessCuisineFromName(seed.name),
});

// ── (1) 식약처 영양성분 표준데이터 ───────────────────────────────────────────
// 입력 필드(camelCase): foodCd, foodNm, foodLv3Nm(대분류), foodLv4Nm(대표식품), foodOriginNm(식품기원),
// nutConSrtrQua(영양성분함량기준량 '100g'|'100ml'), enerc, prot, fatce, chocdf, sugar, nat, foodSize('780ml','270g').
//
// 행 단위 → 대표식품(foodLv4Nm) 단위로 축약한다: 카탈로그 행 1개 = 대표식품 1개, 식품명 변형은 별칭.
// 영양은 식품기원 우선순위가 가장 높은 변형의 100g 값 × 1인분 중량(foodSize)/100 으로 환산.

interface MfdsGroup {
  repName: string;
  category: string | null;
  variants: Set<string>;
  best: {
    priority: number;
    servingG: number | null;
    per100: {
      kcal: number | null;
      carbG: number | null;
      proteinG: number | null;
      fatG: number | null;
      sodiumMg: number | null;
      sugarG: number | null;
    };
    unit: 'g' | 'ml' | null;
  } | null;
  firstCode: string | null;
}

const parseSize = (raw: string | null): { value: number; unit: 'g' | 'ml' } | null => {
  if (!raw) return null;
  const m = /([\d.]+)\s*(g|ml|㎖|㎎|mg|kg|l)?/i.exec(raw.replace(/,/g, ''));
  if (!m) return null;
  const value = Number.parseFloat(m[1]!);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unitRaw = (m[2] ?? 'g').toLowerCase();
  if (unitRaw === 'kg') return { value: value * 1000, unit: 'g' };
  if (unitRaw === 'l') return { value: value * 1000, unit: 'ml' };
  if (unitRaw === 'ml' || unitRaw === '㎖') return { value, unit: 'ml' };
  return { value, unit: 'g' };
};

const originPriority = (origin: string | null): number => {
  if (!origin) return 9;
  for (const [re, p] of MFDS_ORIGIN_PRIORITY) if (re.test(origin)) return p;
  return 8;
};

// 식품명 "대표식품_변형_변형" → 사람이 읽는 변형 표기 "변형 변형 대표식품"은 무리 — 언더스코어를 공백으로만.
const variantLabel = (foodNm: string): string => cleanName(foodNm.replace(/_/g, ' '));

// 표준데이터를 **파일(CSV)** 로 받은 경우 — 배포본은 한글 컬럼명이라 API(camelCase) 필드명으로
// 옮겨 같은 정규화 함수를 태운다. 실측 헤더(2026-04-29 배포본, 50컬럼):
//   식품코드 / 식품명 / … / 식품기원명 / 식품대분류명 / 대표식품명 / … / 영양성분함량기준량 /
//   에너지(kcal) / 수분(g) / 단백질(g) / 지방(g) / … / 나트륨(mg) / … / 1인(회)분량 참고량 / 식품중량
// 컬럼 순서가 아니라 **이름**으로 찾는다(배포본마다 열이 붙고 빠진다).
const CSV_FIELD_MAP: Record<string, string> = {
  식품코드: 'foodCd',
  식품명: 'foodNm',
  식품기원명: 'foodOriginNm',
  식품대분류명: 'foodLv3Nm',
  대표식품명: 'foodLv4Nm',
  식품중분류명: 'foodLv5Nm',
  영양성분함량기준량: 'nutConSrtrQua',
  '에너지(kcal)': 'enerc',
  '단백질(g)': 'prot',
  '지방(g)': 'fatce',
  '탄수화물(g)': 'chocdf',
  '당류(g)': 'sugar',
  '나트륨(mg)': 'nat',
  식품중량: 'foodSize',
};

export const nutritionFileRowsToRecords = (
  header: string[],
  rows: string[][],
): Record<string, unknown>[] => {
  // 헤더 이름 → 열 인덱스(공백·BOM 제거).
  const index = new Map<string, number>();
  header.forEach((h, i) => {
    const key = h.replace(/^\uFEFF/, '').trim();
    if (key && !index.has(key)) index.set(key, i);
  });
  const picks: [string, number][] = [];
  for (const [ko, api] of Object.entries(CSV_FIELD_MAP)) {
    const i = index.get(ko);
    if (i !== undefined) picks.push([api, i]);
  }
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [api, i] of picks) {
      const v = (r[i] ?? '').trim();
      if (v) out[api] = v;
    }
    return out;
  });
};

export const normalizeMfdsNutritionRows = (
  rows: Record<string, unknown>[],
): { seeds: FoodSeed[]; report: NormalizeReport } => {
  const report: NormalizeReport = { fetched: rows.length, produced: 0, dropped: {} };
  const groups = new Map<string, MfdsGroup>();

  for (const row of rows) {
    const foodNm = cleanName(coerceStrOrNull(row['foodNm']) ?? '');
    const category = coerceStrOrNull(row['foodLv3Nm']);
    const repRaw = cleanName(coerceStrOrNull(row['foodLv4Nm']) ?? '');
    const repName = repRaw || (foodNm.split('_')[0] ?? '').trim();
    if (!repName) {
      addDrop(report, 'no_name');
      continue;
    }
    const catKey = category ? categoryKey(category) : '';
    const isDish = MFDS_DISH_CATEGORIES.has(catKey);
    const key = normalizeTerm(repName);
    if (!key) {
      addDrop(report, 'empty_norm');
      continue;
    }
    let g = groups.get(key);
    if (!g) {
      g = { repName, category, variants: new Set(), best: null, firstCode: coerceStrOrNull(row['foodCd']) };
      groups.set(key, g);
    }
    // 요리류만 변형을 별칭으로 남긴다(프랜차이즈 상품명 수천 개는 노이즈).
    if (isDish && foodNm && normalizeTerm(foodNm) !== key) g.variants.add(variantLabel(foodNm));

    const priority = originPriority(coerceStrOrNull(row['foodOriginNm']));
    const size = parseSize(coerceStrOrNull(row['foodSize']));
    const per100 = {
      kcal: numOrNull(row['enerc']),
      carbG: numOrNull(row['chocdf']),
      proteinG: numOrNull(row['prot']),
      fatG: numOrNull(row['fatce']),
      sodiumMg: numOrNull(row['nat']),
      sugarG: numOrNull(row['sugar']),
    };
    const hasAny = Object.values(per100).some((v) => v !== null);
    if (!g.best || priority < g.best.priority || (priority === g.best.priority && !g.best.servingG && size)) {
      if (hasAny || size) {
        g.best = { priority, servingG: size?.value ?? null, per100, unit: size?.unit ?? null };
      }
    }
  }

  const seeds: FoodSeed[] = [];
  for (const g of groups.values()) {
    const scale = g.best?.servingG ? g.best.servingG / 100 : null;
    const n = g.best?.per100;
    const nutrition =
      n && scale
        ? {
            kcal: n.kcal === null ? null : round1(n.kcal * scale),
            carbG: n.carbG === null ? null : round1(n.carbG * scale),
            proteinG: n.proteinG === null ? null : round1(n.proteinG * scale),
            fatG: n.fatG === null ? null : round1(n.fatG * scale),
            sodiumMg: n.sodiumMg === null ? null : round1(n.sodiumMg * scale),
            sugarG: n.sugarG === null ? null : round1(n.sugarG * scale),
          }
        : null;
    seeds.push({
      name: g.repName,
      repName: g.repName,
      aliases: [...g.variants].slice(0, MAX_ALIASES),
      dishType: mfdsCategoryToDishType(g.category),
      mainIngredient: null,
      cuisine: null,
      ingredients: null,
      servingG: g.best?.servingG ?? null,
      nutrition,
      source: 'mfds-nutrition',
      sourceId: g.firstCode,
      sourceCategory: g.category,
      popularity: 0,
    });
  }
  report.produced = seeds.length;
  return { seeds, report };
};

const round1 = (v: number): number => Math.round(v * 10) / 10;

// ── (2) 식약처 레시피 DB COOKRCP01 ────────────────────────────────────────────
// RCP_PARTS_DTLS 실측 형태(2026-08-22):
//   "새우두부계란찜\n연두부 75g(3/4모), 칵테일새우 20g(5마리), 달걀 30g(1/2개)…\n고명\n시금치 10g(3줄기)"
// 즉 **첫 줄이 요리명**이고 중간에 '고명'·'양념장' 같은 섹션 제목 줄이 낀다. 수량이 없고 콤마도 없는
// 단독 줄은 제목으로 보고 버린다(재료 줄은 항상 "이름 수량" 이거나 콤마로 이어진다).
// dishName 을 주면 요리명과 같은 항목도 제외한다(안전망).
const looksLikeSectionLine = (line: string): boolean =>
  !line.includes(',') && !/[\d½¼¾]/.test(line) && !/(약간|적당량|조금|취향껏)/u.test(line);

export const parseRecipeIngredients = (raw: string | null, dishName?: string): string[] => {
  if (!raw) return [];
  const out: string[] = [];
  const dishNorm = dishName ? normalizeTerm(dishName) : '';
  const lines = raw
    .replace(/\r/g, '\n')
    .replace(/[●■▶•]/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !looksLikeSectionLine(l));
  const text = lines
    .join('\n')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ');
  for (const part of text.split(/[\n,、，]/)) {
    let s = part.trim();
    if (!s) continue;
    // "소스 :", "양념장:" 같은 섹션 라벨 제거.
    s = s.replace(/^[^:：]{1,10}[:：]\s*/u, '');
    // 수량/단위 제거 — "연두부 75g", "설탕 1큰술", "물 200ml", "소금 약간".
    s = s.replace(/\s*[\d./½¼¾~]+\s*(g|kg|ml|l|컵|큰술|작은술|T|t|개|마리|모|장|줄기|쪽|줌|알|통|봉|스푼|숟가락|조각|포기|대|단|토막|캔|팩|공기|인분|cc|㎖|㎎)?\b.*$/iu, '');
    s = s.replace(/\s*(약간|적당량|조금|적당히|약간씩|취향껏)$/u, '').trim();
    s = s.replace(/^[-·\s]+|[-·\s]+$/g, '');
    if (s.length < 1 || s.length > 20) continue;
    if (dishNorm && normalizeTerm(s) === dishNorm) continue;
    if (!out.includes(s)) out.push(s);
    if (out.length >= MAX_INGREDIENTS) break;
  }
  return out;
};

export const normalizeMfdsRecipeRows = (
  rows: Record<string, unknown>[],
): { seeds: FoodSeed[]; report: NormalizeReport } => {
  const report: NormalizeReport = { fetched: rows.length, produced: 0, dropped: {} };
  const seeds: FoodSeed[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const name = cleanName(coerceStrOrNull(row['RCP_NM']) ?? '');
    if (!name) {
      addDrop(report, 'no_name');
      continue;
    }
    const norm = normalizeTerm(name);
    if (!norm || seen.has(norm)) {
      addDrop(report, norm ? 'duplicate' : 'empty_norm');
      continue;
    }
    seen.add(norm);
    const way = coerceStrOrNull(row['RCP_WAY2']);
    const pat = coerceStrOrNull(row['RCP_PAT2']);
    const ingredients = parseRecipeIngredients(coerceStrOrNull(row['RCP_PARTS_DTLS']), name);
    const servingG = numOrNull(row['INFO_WGT']);
    const kcal = numOrNull(row['INFO_ENG']);
    const carbG = numOrNull(row['INFO_CAR']);
    const proteinG = numOrNull(row['INFO_PRO']);
    const fatG = numOrNull(row['INFO_FAT']);
    const sodiumMg = numOrNull(row['INFO_NA']);
    const hasNut = [kcal, carbG, proteinG, fatG, sodiumMg].some((v) => v !== null);
    seeds.push({
      name,
      repName: null,
      aliases: [],
      dishType: guessDishTypeFromName(name) ?? rcpWayToDishType(way),
      // 이름으로 못 잡으면 재료 목록의 첫 매칭으로 채운다(MAFRA 와 같은 규칙) — LLM 분류 부담을 줄인다.
      mainIngredient:
        guessMainIngredientFromName(name) ??
        (ingredients.map((i) => guessMainIngredientFromName(i)).find((v) => v !== null) ?? null),
      // 식약처 '조리식품의 레시피 DB' 는 한국 조리 DB 라 이름에 다른 단서가 없으면 한식으로 본다.
      // (LLM 은 '연근부각'·'참외깍두기' 같은 창작 반찬에서 cuisine 을 자주 비워 뒀다 — 실측 37건.)
      cuisine: guessCuisineFromName(name) ?? 'korean',
      ingredients: ingredients.length > 0 ? ingredients : null,
      servingG,
      nutrition: hasNut ? { kcal, carbG, proteinG, fatG, sodiumMg, sugarG: null } : null,
      source: 'mfds-recipe',
      sourceId: coerceStrOrNull(row['RCP_SEQ']),
      sourceCategory: [pat, way].filter((v): v is string => !!v).join('/') || null,
      popularity: 0,
    });
  }
  report.produced = seeds.length;
  return { seeds, report };
};

// ── (3) MAFRA 레시피 기본 + 재료 ─────────────────────────────────────────────
// 기본: RECIPE_ID, RECIPE_NM_KO, NATION_NM(한식/중식/일식/양식/동남아/…), TY_NM(밥/국/찌개/반찬/후식/일품/…)
// 재료: RECIPE_ID, IRDNT_NM, IRDNT_TY_NM(주재료|부재료|양념), IRDNT_SN(순번)
const MAFRA_NATION_TO_CUISINE: Record<string, FoodCuisineType> = {
  한식: 'korean',
  중식: 'chinese',
  일식: 'japanese',
  양식: 'western',
  동남아: 'asian',
  동남아시아: 'asian',
  인도: 'asian',
  기타: 'other',
  퓨전: 'other',
};
const MAFRA_TYPE_TO_DISH: Record<string, FoodDishTypeType> = {
  밥: 'rice',
  죽: 'rice',
  국: 'soup',
  탕: 'soup',
  찌개: 'stew',
  전골: 'stew',
  구이: 'grill',
  볶음: 'stir_fry',
  조림: 'braise',
  찜: 'steam',
  전: 'pancake',
  튀김: 'fried',
  나물: 'namul',
  무침: 'salad',
  김치: 'kimchi',
  장아찌: 'kimchi',
  면: 'noodle',
  만두: 'noodle',
  떡: 'bakery',
  빵: 'bakery',
  후식: 'bakery',
  음료: 'beverage',
  음청류: 'beverage',
};

export const normalizeMafraRows = (
  recipes: Record<string, unknown>[],
  ingredients: Record<string, unknown>[],
): { seeds: FoodSeed[]; report: NormalizeReport } => {
  const report: NormalizeReport = { fetched: recipes.length, produced: 0, dropped: {} };
  const byRecipe = new Map<string, { main: string[]; sub: string[] }>();
  for (const r of ingredients) {
    const id = coerceStrOrNull(r['RECIPE_ID']);
    const nm = cleanName(coerceStrOrNull(r['IRDNT_NM']) ?? '');
    if (!id || !nm) continue;
    const ty = coerceStrOrNull(r['IRDNT_TY_NM']) ?? '';
    let b = byRecipe.get(id);
    if (!b) {
      b = { main: [], sub: [] };
      byRecipe.set(id, b);
    }
    if (/주재료/u.test(ty)) {
      if (!b.main.includes(nm)) b.main.push(nm);
    } else if (/부재료/u.test(ty)) {
      if (!b.sub.includes(nm)) b.sub.push(nm);
    }
  }

  const seeds: FoodSeed[] = [];
  const seen = new Set<string>();
  for (const row of recipes) {
    const name = cleanName(coerceStrOrNull(row['RECIPE_NM_KO']) ?? '');
    const id = coerceStrOrNull(row['RECIPE_ID']);
    if (!name) {
      addDrop(report, 'no_name');
      continue;
    }
    const norm = normalizeTerm(name);
    if (!norm || seen.has(norm)) {
      addDrop(report, norm ? 'duplicate' : 'empty_norm');
      continue;
    }
    seen.add(norm);
    const ing = id ? byRecipe.get(id) : undefined;
    const ingredientList = [...(ing?.main ?? []), ...(ing?.sub ?? [])].slice(0, MAX_INGREDIENTS);
    const nation = coerceStrOrNull(row['NATION_NM']);
    const type = coerceStrOrNull(row['TY_NM']);
    const mainFromIngredients = ing?.main.length
      ? (ing.main.map((m) => guessMainIngredientFromName(m)).find((v) => v !== null) ?? null)
      : null;
    seeds.push({
      name,
      repName: null,
      aliases: [],
      dishType: guessDishTypeFromName(name) ?? (type ? (MAFRA_TYPE_TO_DISH[categoryKey(type)] ?? null) : null),
      mainIngredient: mainFromIngredients,
      cuisine: nation ? (MAFRA_NATION_TO_CUISINE[categoryKey(nation)] ?? null) : null,
      ingredients: ingredientList.length > 0 ? ingredientList : null,
      servingG: null,
      nutrition: null,
      source: 'mafra-recipe',
      sourceId: id,
      sourceCategory: [nation, type].filter((v): v is string => !!v).join('/') || null,
      popularity: 0,
    });
  }
  report.produced = seeds.length;
  return { seeds, report };
};

// ── (4) 외식 메뉴 어휘(global_menu_canonicals) ───────────────────────────────
export interface MenuCanonicalRow {
  id: string;
  displayName: string;
  globalKey: string;
  categoryPath: string | null;
  restaurantCount: number;
}

export const normalizeMenuCanonicalRows = (
  rows: MenuCanonicalRow[],
  minRestaurants: number = MENU_CANONICAL_MIN_RESTAURANTS,
): { seeds: FoodSeed[]; report: NormalizeReport } => {
  const report: NormalizeReport = { fetched: rows.length, produced: 0, dropped: {} };
  const seeds: FoodSeed[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const name = cleanName(r.displayName);
    if (!name) {
      addDrop(report, 'no_name');
      continue;
    }
    if (r.restaurantCount < minRestaurants) {
      addDrop(report, 'few_restaurants');
      continue;
    }
    // 두 글자 미만·숫자만·"기타 > X" 같은 미분류는 노이즈 가능성이 높아 제외.
    const norm = normalizeTerm(name);
    if (!norm || norm.length < 2 || /^\d+$/.test(norm)) {
      addDrop(report, 'too_short');
      continue;
    }
    if (seen.has(norm)) {
      addDrop(report, 'duplicate');
      continue;
    }
    seen.add(norm);
    const hint = menuCanonicalRootHint(r.categoryPath);
    seeds.push({
      name,
      repName: null,
      aliases: [],
      dishType: hint.dishType ?? null,
      mainIngredient: hint.mainIngredient ?? null,
      cuisine: hint.cuisine ?? null,
      ingredients: null,
      servingG: null,
      nutrition: null,
      source: 'menu-canonical',
      sourceId: r.globalKey,
      sourceCategory: r.categoryPath,
      popularity: r.restaurantCount,
    });
  }
  report.produced = seeds.length;
  return { seeds, report };
};

// ── (5) 한식 800선 CSV(수동) — 요리번호, 800선 카테고리, 요리명, 라틴어 발음, 설명, 영어, 일본어, 중문1, 중문2 ──
export const normalizeHansik800Rows = (
  headerIn: string[],
  rowsIn: string[][],
): { seeds: FoodSeed[]; report: NormalizeReport } => {
  // 배포본(XLSX)은 첫 행이 조판용 번호 행이고 진짜 헤더가 2행에 있다 — '요리명' 이 보이는 행을
  // 헤더로 삼고 그 아래를 데이터로 쓴다(CSV 로 저장한 경우엔 첫 행이 그대로 헤더).
  const looksLikeHeader = (r: string[]): boolean => r.some((c) => c.replace(/\s+/g, '') === '요리명');
  let header = headerIn;
  let rows = rowsIn;
  if (!looksLikeHeader(headerIn)) {
    const at = rowsIn.findIndex(looksLikeHeader);
    if (at >= 0) {
      header = rowsIn[at]!;
      rows = rowsIn.slice(at + 1);
    }
  }
  const report: NormalizeReport = { fetched: rows.length, produced: 0, dropped: {} };
  const idx = (names: string[]): number => {
    for (const n of names) {
      const i = header.findIndex((h) => h.replace(/\s+/g, '') === n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iNo = idx(['요리번호', '번호']);
  const iCat = idx(['800선카테고리', '카테고리', '분류']);
  const iName = idx(['요리명', '메뉴명', '한글']);
  const iRoman = idx(['라틴어발음', '로마자', '로마자표기']);
  const iEn = idx(['영어', '영문', '영어명']);
  const iJa = idx(['일본어', '일어']);
  const iZh = idx(['중문1', '중국어', '중국어(간체)']);
  if (iName < 0) {
    addDrop(report, 'no_name_column');
    return { seeds: [], report };
  }
  const seeds: FoodSeed[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const name = cleanName(r[iName] ?? '');
    if (!name) {
      addDrop(report, 'no_name');
      continue;
    }
    const norm = normalizeTerm(name);
    if (!norm || seen.has(norm)) {
      addDrop(report, norm ? 'duplicate' : 'empty_norm');
      continue;
    }
    seen.add(norm);
    const aliases = [iRoman, iEn, iJa, iZh]
      .filter((i) => i >= 0)
      .map((i) => cleanName(r[i] ?? ''))
      .filter((a) => a.length > 0 && a.length <= 60);
    // 카테고리에 로마자가 병기돼 있다: '상차림 [Sangcharim]' → '상차림'.
    const catRaw = iCat >= 0 ? coerceStrOrNull(r[iCat] ?? null) : null;
    const cat = catRaw ? cleanName(catRaw.replace(/\[[^\]]*\]/g, '')) || null : null;
    seeds.push({
      name,
      repName: null,
      aliases,
      dishType: hansikCategoryToDishType(cat),
      mainIngredient: null,
      cuisine: 'korean',
      ingredients: null,
      servingG: null,
      nutrition: null,
      source: 'hansik-800',
      sourceId: iNo >= 0 ? coerceStrOrNull(r[iNo] ?? null) : null,
      sourceCategory: cat,
      popularity: 0,
    });
  }
  report.produced = seeds.length;
  return { seeds, report };
};

// ── upsert(병합) ────────────────────────────────────────────────────────────

export interface UpsertResult {
  inserted: number;
  updated: number;
  skipped: number;
}

export interface UpsertOptions {
  signal?: AbortSignal;
  onProgress?: (processed: number, total: number) => void;
}

export const upsertFoodSeeds = async (
  prisma: PrismaClient,
  seedsIn: FoodSeed[],
  opts: UpsertOptions = {},
): Promise<UpsertResult> => {
  const result: UpsertResult = { inserted: 0, updated: 0, skipped: 0 };
  // 배치 내 중복(nameNorm) 접기 — 별칭·popularity 만 합친다.
  const byNorm = new Map<string, FoodSeed>();
  for (const s of seedsIn) {
    const norm = normalizeTerm(s.name);
    if (!norm) {
      result.skipped += 1;
      continue;
    }
    const prev = byNorm.get(norm);
    if (!prev) byNorm.set(norm, { ...s, aliases: [...(s.aliases ?? [])], sourceRefs: [...(s.sourceRefs ?? [])] });
    else {
      prev.aliases = [...new Set([...(prev.aliases ?? []), ...(s.aliases ?? [])])];
      prev.popularity = Math.max(prev.popularity ?? 0, s.popularity ?? 0);
      // 접힌 시드가 채울 수 있는 빈 필드는 가져온다(첫 시드가 분류/재료가 없을 때).
      prev.repName = prev.repName ?? s.repName ?? null;
      prev.dishType = prev.dishType ?? s.dishType ?? null;
      prev.mainIngredient = prev.mainIngredient ?? s.mainIngredient ?? null;
      prev.cuisine = prev.cuisine ?? s.cuisine ?? null;
      prev.ingredients = prev.ingredients ?? s.ingredients ?? null;
      prev.servingG = prev.servingG ?? s.servingG ?? null;
      prev.nutrition = prev.nutrition ?? s.nutrition ?? null;
      prev.sourceCategory = prev.sourceCategory ?? s.sourceCategory ?? null;
      if (s.source !== prev.source && !(prev.sourceRefs ?? []).some((r) => r.source === s.source)) {
        prev.sourceRefs = [...(prev.sourceRefs ?? []), { source: s.source, sourceId: s.sourceId ?? null }];
      }
      result.skipped += 1;
    }
  }
  const entries = [...byNorm.entries()];
  const total = entries.length;
  let processed = 0;
  for (const [norm, seed] of entries) {
    if (opts.signal?.aborted) break;
    const seedWithRules = applyNameRules(seed);
    const existing = await prisma.foodItem.findUnique({ where: { nameNorm: norm } });
    if (!existing) {
      const aliases = (seedWithRules.aliases ?? []).slice(0, MAX_ALIASES);
      await prisma.foodItem.create({
        data: {
          name: seedWithRules.name,
          nameNorm: norm,
          repName: seedWithRules.repName ?? null,
          aliasesJson: JSON.stringify(aliases),
          aliasNormsJson: JSON.stringify(buildAliasNorms(aliases, norm)),
          dishType: seedWithRules.dishType ?? null,
          mainIngredient: seedWithRules.mainIngredient ?? null,
          cuisine: seedWithRules.cuisine ?? null,
          ingredientsJson: seedWithRules.ingredients ? JSON.stringify(seedWithRules.ingredients) : null,
          servingG: seedWithRules.servingG ?? null,
          kcal: seedWithRules.nutrition?.kcal ?? null,
          carbG: seedWithRules.nutrition?.carbG ?? null,
          proteinG: seedWithRules.nutrition?.proteinG ?? null,
          fatG: seedWithRules.nutrition?.fatG ?? null,
          sodiumMg: seedWithRules.nutrition?.sodiumMg ?? null,
          sugarG: seedWithRules.nutrition?.sugarG ?? null,
          source: seedWithRules.source,
          sourceId: seedWithRules.sourceId ?? null,
          sourceCategory: seedWithRules.sourceCategory ?? null,
          sourceRefsJson: JSON.stringify(seedWithRules.sourceRefs ?? []),
          popularity: seedWithRules.popularity ?? 0,
        },
      });
      result.inserted += 1;
    } else {
      const data: Record<string, unknown> = {};
      if (!existing.repName && seedWithRules.repName) data.repName = seedWithRules.repName;
      if (!existing.dishType && seedWithRules.dishType) data.dishType = seedWithRules.dishType;
      if (!existing.mainIngredient && seedWithRules.mainIngredient) data.mainIngredient = seedWithRules.mainIngredient;
      if (!existing.cuisine && seedWithRules.cuisine) data.cuisine = seedWithRules.cuisine;
      if (!existing.ingredientsJson && seedWithRules.ingredients?.length) {
        data.ingredientsJson = JSON.stringify(seedWithRules.ingredients);
      }
      if (existing.servingG === null && seedWithRules.servingG != null) data.servingG = seedWithRules.servingG;
      const n = seedWithRules.nutrition;
      if (n && existing.kcal === null && existing.proteinG === null && existing.carbG === null) {
        data.kcal = n.kcal;
        data.carbG = n.carbG;
        data.proteinG = n.proteinG;
        data.fatG = n.fatG;
        data.sodiumMg = n.sodiumMg;
        data.sugarG = n.sugarG;
        if (existing.servingG === null && seedWithRules.servingG != null) data.servingG = seedWithRules.servingG;
      }
      if (!existing.sourceCategory && seedWithRules.sourceCategory) data.sourceCategory = seedWithRules.sourceCategory;
      const newAliases = seedWithRules.aliases ?? [];
      if (newAliases.length > 0) {
        const merged = [...new Set([...parseJsonStringArray(existing.aliasesJson), ...newAliases])].slice(0, MAX_ALIASES);
        if (merged.length !== parseJsonStringArray(existing.aliasesJson).length) {
          data.aliasesJson = JSON.stringify(merged);
          data.aliasNormsJson = JSON.stringify(buildAliasNorms(merged, norm));
        }
      }
      {
        const refs = parseRefs(existing.sourceRefsJson);
        const incoming = [
          { source: seedWithRules.source, sourceId: seedWithRules.sourceId ?? null },
          ...(seedWithRules.sourceRefs ?? []),
        ];
        let changed = false;
        for (const ref of incoming) {
          if (ref.source === existing.source) continue;
          if (refs.some((r) => r.source === ref.source)) continue;
          refs.push(ref);
          changed = true;
        }
        if (changed) data.sourceRefsJson = JSON.stringify(refs);
      }
      if ((seedWithRules.popularity ?? 0) > existing.popularity) data.popularity = seedWithRules.popularity;
      if (Object.keys(data).length > 0) {
        await prisma.foodItem.update({ where: { id: existing.id }, data });
        result.updated += 1;
      } else {
        result.skipped += 1;
      }
    }
    processed += 1;
    if (processed % PROGRESS_EVERY === 0 || processed === total) opts.onProgress?.(processed, total);
  }
  return result;
};

const parseRefs = (s: string | null): { source: string; sourceId: string | null }[] => {
  if (!s) return [];
  try {
    const v: unknown = JSON.parse(s);
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is { source: string; sourceId?: string | null } => typeof x === 'object' && x !== null && typeof (x as { source?: unknown }).source === 'string')
      .map((x) => ({ source: x.source, sourceId: x.sourceId ?? null }));
  } catch {
    return [];
  }
};

// 외식 메뉴 어휘(menu-canonical)는 리뷰에서 뽑은 말이라 음식이 아닌 것이 섞인다 — 실측으로
// "기본 메뉴", "다데기", "순한맛", "매운 소스", "쿨피스" 같은 옵션·소스·브랜드가 남았다.
// 이름 규칙도 LLM 도 조리형태를 못 붙인 행은 음식으로 보기 어려우니 비활성으로 내린다
// (삭제하지 않는다 — 어드민에서 되살릴 수 있어야 하고, 사용자 기록이 이름으로 참조할 수 있다).
export const deactivateUnclassifiedNoise = async (prisma: PrismaClient): Promise<number> => {
  const res = await prisma.foodItem.updateMany({
    where: {
      source: 'menu-canonical',
      active: true,
      dishType: null,
      // LLM 이 최소 한 번은 본 행만 — 아직 분류 전인 행을 성급히 내리지 않는다.
      classifyVersion: { not: null },
    },
    data: { active: false },
  });
  return res.count;
};

// ── 서비스(설정·실행·이력) ───────────────────────────────────────────────────

export interface FoodImportKeys {
  // data.go.kr 서비스키(표준데이터) — FOOD_API_KEY || BUS_API_KEY.
  nutrition: string;
  // 식품안전나라 키.
  recipe: string;
  // MAFRA 키.
  mafra: string;
}

export interface FoodImportServiceDeps {
  keys: FoodImportKeys;
  classify?: FoodClassifyService | null;
  logger?: FastifyBaseLogger;
  operationLog?: OperationLogService | null;
  // 테스트·프로브용 — 외부 호출 우회.
  fetchOverride?: {
    nutrition?: () => Promise<Record<string, unknown>[]>;
    recipe?: () => Promise<Record<string, unknown>[]>;
    mafraRecipes?: () => Promise<Record<string, unknown>[]>;
    mafraIngredients?: () => Promise<Record<string, unknown>[]>;
  };
}

const isTerminal = (s: FoodImportRunStatusType): boolean => s !== 'running';

export class FoodImportService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly deps: FoodImportServiceDeps,
  ) {}

  private get log(): FastifyBaseLogger | null {
    return this.deps.logger ?? null;
  }

  apiConfigured(): FoodImportConfigType['apiConfigured'] {
    return {
      'mfds-nutrition': this.deps.keys.nutrition.length > 0,
      'mfds-recipe': this.deps.keys.recipe.length > 0,
      'mafra-recipe': this.deps.keys.mafra.length > 0,
    };
  }

  // ── 설정 ──────────────────────────────────────────────────────────────
  async getConfig(): Promise<FoodImportConfigType> {
    const row = await this.prisma.foodImportConfig.findUnique({ where: { jobType: JOB_TYPE } });
    const enabled = row?.enabled ?? false;
    const cronExpr = row?.cronExpr ?? DEFAULT_CRON;
    const timezone = row?.timezone ?? DEFAULT_TZ;
    return {
      enabled,
      cronExpr,
      timezone,
      sources: parseSources(row?.sourcesJson),
      classify: row?.classify ?? true,
      apiConfigured: this.apiConfigured(),
      lastRunAt: row?.lastRunAt?.toISOString() ?? null,
      lastStatus: (row?.lastStatus as FoodImportRunStatusType | null) ?? null,
      nextRunAt: enabled ? (scheduleRegistry.nextRun(JOB_TYPE)?.toISOString() ?? null) : null,
      updatedAt: row?.updatedAt?.toISOString() ?? new Date(0).toISOString(),
    };
  }

  async updateConfig(input: FoodImportConfigInputType): Promise<FoodImportConfigType> {
    this.assertValidCron(input.cronExpr, input.timezone);
    const sourcesJson = JSON.stringify(input.sources);
    await this.prisma.foodImportConfig.upsert({
      where: { jobType: JOB_TYPE },
      create: {
        jobType: JOB_TYPE,
        enabled: input.enabled,
        cronExpr: input.cronExpr,
        timezone: input.timezone,
        sourcesJson,
        classify: input.classify,
      },
      update: {
        enabled: input.enabled,
        cronExpr: input.cronExpr,
        timezone: input.timezone,
        sourcesJson,
        classify: input.classify,
      },
    });
    this.applySchedule(input.enabled, input.cronExpr, input.timezone);
    return this.getConfig();
  }

  applySchedule(enabled: boolean, cronExpr: string, timezone: string): void {
    if (enabled) {
      scheduleRegistry.setCron(JOB_TYPE, cronExpr, timezone, () => {
        void this.runScheduled('cron');
      });
      this.log?.info({ cronExpr, timezone }, '[food-import] cron registered');
    } else {
      scheduleRegistry.clearCron(JOB_TYPE);
    }
  }

  async bootstrap(): Promise<void> {
    const stale = await this.prisma.foodImportRun.updateMany({
      where: { status: 'running' },
      data: { status: 'interrupted', finishedAt: new Date(), error: 'server restart' },
    });
    if (stale.count > 0) {
      this.log?.warn({ count: stale.count }, '[food-import] marked stale runs as interrupted');
    }
    const cfg = await this.getConfig();
    this.applySchedule(cfg.enabled, cfg.cronExpr, cfg.timezone);
  }

  shutdown(): void {
    scheduleRegistry.clearCron(JOB_TYPE);
    foodImportRegistry.abortInflight();
  }

  preview(cronExpr: string, timezone: string): FoodImportPreviewResultType {
    try {
      const cron = new Cron(cronExpr, { timezone, paused: true });
      const nextRuns = cron.nextRuns(5).map((d) => d.toISOString());
      cron.stop();
      return { valid: true, error: null, nextRuns };
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : String(e), nextRuns: [] };
    }
  }

  async listRuns(): Promise<FoodImportRunListType> {
    const rows = await this.prisma.foodImportRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: RUN_HISTORY_LIMIT,
    });
    return { items: rows.map((r) => this.toRun(r)), inflightRunId: foodImportRegistry.runningRunId() };
  }

  // ── 실행 ──────────────────────────────────────────────────────────────
  async runScheduled(
    trigger: FoodImportTriggerType,
    override: FoodImportRunInputType = {},
  ): Promise<FoodImportRunType> {
    if (foodImportRegistry.isActive() || (await this.hasActiveRun())) {
      const skipped = await this.prisma.foodImportRun.create({
        data: { trigger, status: 'skipped', finishedAt: new Date(), error: '이전 회차 진행 중' },
      });
      this.log?.warn({ trigger }, '[food-import] run skipped — 이전 회차 진행 중');
      return this.toRun(skipped);
    }
    const cfg = await this.getConfig();
    const sources = override.sources ?? cfg.sources;
    const classify = override.classify ?? cfg.classify;

    const begun = foodImportRegistry.begin(trigger, sources);
    if (!begun) {
      const skipped = await this.prisma.foodImportRun.create({
        data: { trigger, status: 'skipped', finishedAt: new Date(), error: '이전 회차 진행 중' },
      });
      return this.toRun(skipped);
    }
    const { runId, signal } = begun;
    await this.prisma.foodImportRun.create({
      data: { id: runId, trigger, status: 'running', sourcesJson: JSON.stringify(sources) },
    });

    const oplog = this.deps.operationLog ?? null;
    const opRunId = oplog ? await oplog.startRun({ feature: 'food-import', jobId: runId, trigger }) : null;
    const step = (
      level: 'debug' | 'info' | 'warn' | 'error',
      stage: string,
      message: string,
      meta?: Record<string, unknown>,
    ): void => {
      if (oplog && opRunId) oplog.log({ runId: opRunId, stage, level, message, meta });
    };

    const stats: FoodImportSourceStatType[] = [];
    let classifiedCount = 0;
    let status: FoodImportRunStatusType = 'done';
    let error: string | null = null;

    try {
      for (const source of sources) {
        if (signal.aborted) break;
        const stat = await this.runSource(source, signal, step);
        stats.push(stat);
        foodImportRegistry.upsertStat(stat);
      }
      if (signal.aborted) {
        status = 'interrupted';
        error = 'aborted';
      } else if (stats.length > 0 && stats.every((s) => s.error !== null)) {
        status = 'failed';
        error = stats.map((s) => `${s.source}: ${s.error}`).join('; ');
      }

      if (status === 'done' && classify && this.deps.classify) {
        foodImportRegistry.setPhase('classifying', { source: null, total: null, message: 'LLM 2축 분류' });
        step('info', 'classify', 'LLM 2축 분류 시작');
        const r = await this.deps.classify.classifyPending({
          signal,
          onProgress: (processed, total) => foodImportRegistry.setProgress(processed, total),
        });
        classifiedCount = r.updated;
        foodImportRegistry.setClassifiedCount(classifiedCount);
        step(r.noProvider ? 'warn' : 'info', 'classify', r.noProvider ? 'chat 모델 미설정 — 분류 생략' : `분류 ${r.updated}/${r.total}행 (실패 청크 ${r.failedChunks})`, {
          updated: r.updated,
          total: r.total,
          failedChunks: r.failedChunks,
          model: r.model,
        });
        if (signal.aborted) {
          status = 'interrupted';
          error = 'aborted';
        }
      }
    } catch (e) {
      status = signal.aborted ? 'interrupted' : 'failed';
      error = e instanceof Error ? e.message : String(e);
      this.log?.error({ err: e }, '[food-import] run failed');
    }

    foodImportRegistry.finish(status, error);
    await this.prisma.foodImportRun.update({
      where: { id: runId },
      data: {
        status,
        statsJson: JSON.stringify(stats),
        classifiedCount,
        error,
        finishedAt: new Date(),
      },
    });
    await this.touchConfig(status);

    if (oplog && opRunId) {
      const meta = {
        sources,
        stats: stats.map((s) => ({ source: s.source, fetched: s.fetched, inserted: s.inserted, updated: s.updated, skipped: s.skipped, error: s.error })),
        classifiedCount,
      };
      if (status === 'done') await oplog.finishRun(opRunId, { status: 'done', meta });
      else if (status === 'interrupted') {
        await oplog.finishRun(opRunId, { status: 'cancelled', errorCode: 'interrupted', errorMessage: error ?? undefined, meta });
      } else {
        await oplog.finishRun(opRunId, { status: 'failed', errorCode: 'import_failed', errorMessage: error ?? undefined, meta });
      }
    }

    const row = await this.prisma.foodImportRun.findUnique({ where: { id: runId } });
    return row ? this.toRun(row) : (foodImportRegistry.snapshot() as FoodImportRunType);
  }

  // 소스 1개 — fetch → normalize → upsert. 소스 단위 실패는 stat.error 로 남기고 다음 소스로.
  private async runSource(
    source: FoodImportSourceType,
    signal: AbortSignal,
    step: (level: 'debug' | 'info' | 'warn' | 'error', stage: string, message: string, meta?: Record<string, unknown>) => void,
  ): Promise<FoodImportSourceStatType> {
    const stat: FoodImportSourceStatType = { source, fetched: 0, inserted: 0, updated: 0, skipped: 0, error: null };
    try {
      foodImportRegistry.setPhase('fetching', { source, total: null, message: null });
      const onPage = (info: { page: number; fetched: number; totalCount: number | null }): void => {
        foodImportRegistry.setProgress(info.fetched, info.totalCount, `${info.page}페이지`);
      };
      let seeds: FoodSeed[];
      let report: NormalizeReport;
      if (source === 'mfds-nutrition') {
        const rows = await this.fetchNutrition(signal, onPage);
        foodImportRegistry.setPhase('normalizing', { source, total: rows.length });
        ({ seeds, report } = normalizeMfdsNutritionRows(rows));
      } else if (source === 'mfds-recipe') {
        const rows = await this.fetchRecipes(signal, onPage);
        foodImportRegistry.setPhase('normalizing', { source, total: rows.length });
        ({ seeds, report } = normalizeMfdsRecipeRows(rows));
      } else if (source === 'mafra-recipe') {
        const { recipes, ingredients } = await this.fetchMafra(signal, onPage);
        foodImportRegistry.setPhase('normalizing', { source, total: recipes.length });
        ({ seeds, report } = normalizeMafraRows(recipes, ingredients));
      } else {
        const rows = await this.loadMenuCanonicalRows();
        foodImportRegistry.setPhase('normalizing', { source, total: rows.length });
        ({ seeds, report } = normalizeMenuCanonicalRows(rows));
      }
      stat.fetched = report.fetched;
      step('info', 'normalize', `${source}: 원본 ${report.fetched}행 → 시드 ${report.produced}건`, {
        source,
        fetched: report.fetched,
        produced: report.produced,
        dropped: report.dropped,
      });

      foodImportRegistry.setPhase('upserting', { source, total: seeds.length });
      const r = await upsertFoodSeeds(this.prisma, seeds, {
        signal,
        onProgress: (processed, total) => foodImportRegistry.setProgress(processed, total),
      });
      stat.inserted = r.inserted;
      stat.updated = r.updated;
      stat.skipped = r.skipped + (report.fetched - report.produced);
      step('info', 'upsert', `${source}: 신규 ${r.inserted} / 갱신 ${r.updated} / 건너뜀 ${stat.skipped}`, {
        source,
        inserted: r.inserted,
        updated: r.updated,
        skipped: stat.skipped,
      });
    } catch (e) {
      stat.error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      step('error', 'source', `${source} 실패: ${stat.error}`, { source });
      this.log?.warn({ err: e, source }, '[food-import] source failed');
    }
    return stat;
  }

  private async fetchNutrition(
    signal: AbortSignal,
    onPage: (i: { page: number; fetched: number; totalCount: number | null }) => void,
  ): Promise<Record<string, unknown>[]> {
    if (this.deps.fetchOverride?.nutrition) return this.deps.fetchOverride.nutrition();
    if (!this.deps.keys.nutrition) throw new Error('FOOD_API_KEY/BUS_API_KEY 미설정');
    const res = await fetchAllMfdsNutrition({ serviceKey: this.deps.keys.nutrition, signal }, {}, { onPage });
    return res.items;
  }

  private async fetchRecipes(
    signal: AbortSignal,
    onPage: (i: { page: number; fetched: number; totalCount: number | null }) => void,
  ): Promise<Record<string, unknown>[]> {
    if (this.deps.fetchOverride?.recipe) return this.deps.fetchOverride.recipe();
    if (!this.deps.keys.recipe) throw new Error('FOOD_RECIPE_API_KEY 미설정');
    const res = await fetchAllMfdsRecipes({ serviceKey: this.deps.keys.recipe, signal }, { onPage });
    return res.items;
  }

  private async fetchMafra(
    signal: AbortSignal,
    onPage: (i: { page: number; fetched: number; totalCount: number | null }) => void,
  ): Promise<{ recipes: Record<string, unknown>[]; ingredients: Record<string, unknown>[] }> {
    if (this.deps.fetchOverride?.mafraRecipes) {
      return {
        recipes: await this.deps.fetchOverride.mafraRecipes(),
        ingredients: this.deps.fetchOverride.mafraIngredients ? await this.deps.fetchOverride.mafraIngredients() : [],
      };
    }
    if (!this.deps.keys.mafra) throw new Error('MAFRA_API_KEY 미설정');
    const opts = { serviceKey: this.deps.keys.mafra, signal };
    const recipes = await fetchAllMafra(MAFRA_RECIPE_GRID, opts, { onPage });
    const ingredients = await fetchAllMafra(MAFRA_INGREDIENT_GRID, opts, { onPage });
    return { recipes: recipes.items, ingredients: ingredients.items };
  }

  // global_menu_canonicals + 링크의 distinct 식당 수.
  async loadMenuCanonicalRows(): Promise<MenuCanonicalRow[]> {
    const rows = await this.prisma.$queryRaw<
      { id: string; displayName: string; globalKey: string; categoryPath: string | null; restaurantCount: number | bigint }[]
    >`
      SELECT g.id AS id, g."displayName" AS "displayName", g."globalKey" AS "globalKey", g."categoryPath" AS "categoryPath",
             COUNT(DISTINCT l."restaurantId") AS "restaurantCount"
      FROM global_menu_canonicals g
      LEFT JOIN global_menu_canonical_links l ON l."globalCanonicalId" = g.id
      GROUP BY g.id
    `;
    return rows.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      globalKey: r.globalKey,
      categoryPath: r.categoryPath,
      restaurantCount: Number(r.restaurantCount),
    }));
  }

  // ── 내부 ──────────────────────────────────────────────────────────────
  private async hasActiveRun(): Promise<boolean> {
    const active = await this.prisma.foodImportRun.findFirst({ where: { status: 'running' }, select: { id: true } });
    return active !== null;
  }

  private async touchConfig(status: FoodImportRunStatusType): Promise<void> {
    await this.prisma.foodImportConfig.upsert({
      where: { jobType: JOB_TYPE },
      create: { jobType: JOB_TYPE, lastRunAt: new Date(), lastStatus: status },
      update: { lastRunAt: new Date(), lastStatus: status },
    });
  }

  private assertValidCron(cronExpr: string, timezone: string): void {
    const r = this.preview(cronExpr, timezone);
    if (!r.valid) throw new Error(r.error ?? 'Invalid cron expression');
  }

  toRun(row: PrismaFoodImportRun): FoodImportRunType {
    const status = row.status as FoodImportRunStatusType;
    const live = foodImportRegistry.snapshot();
    const isLive = live !== null && live.runId === row.id && !isTerminal(status);
    return {
      runId: row.id,
      trigger: row.trigger as FoodImportTriggerType,
      status,
      phase: isLive ? live.phase : null,
      sources: parseSources(row.sourcesJson),
      stats: isLive ? live.stats : parseStats(row.statsJson),
      classifiedCount: isLive ? live.classifiedCount : row.classifiedCount,
      progress: isLive ? live.progress : null,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      error: row.error,
    };
  }
}

const parseSources = (json: string | null | undefined): FoodImportSourceType[] => {
  if (!json) return [...DEFAULT_SOURCES];
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v)) return [...DEFAULT_SOURCES];
    const out = v.filter((x): x is FoodImportSourceType => FoodImportSource.safeParse(x).success);
    return out.length > 0 ? out : [...DEFAULT_SOURCES];
  } catch {
    return [...DEFAULT_SOURCES];
  }
};

const parseStats = (json: string | null | undefined): FoodImportSourceStatType[] => {
  if (!json) return [];
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (x): x is FoodImportSourceStatType =>
        typeof x === 'object' && x !== null && FoodImportSource.safeParse((x as { source?: unknown }).source).success,
    );
  } catch {
    return [];
  }
};

export const __foodImportInternals = { JOB_TYPE, DEFAULT_CRON, DEFAULT_SOURCES, parseSources, parseStats, parseSize, originPriority };
