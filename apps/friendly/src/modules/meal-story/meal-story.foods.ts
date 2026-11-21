import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../../lib/csv.js';
import { numOrNull } from '../../lib/narrow.js';
import { looseNutrientHeader } from '../food/food-nutrients.js';
import { decodeLifeCsv } from '../life-map/life-map-master.service.js';
import { MEAL_STORY_NUTRIENTS } from './meal-story.defs.js';
import type {
  MealStoryFoodsFileType,
  MealStoryPer100CountsType,
  MealStoryPer100Type,
  MealStoryScriptType,
} from './meal-story.script.js';

// 원고 foods 의 가리킴(식품코드·제품 묶음) → 100g당 값(foods.json). build:meal-stories 가 쓰고, check:meal-stories 가 다시
// 계산해 foods.json 과 같은지 본다. 원본은 식약처 전국통합식품영양성분정보 표준데이터 CSV(data/open/food/, git 밖 — 받는
// 곳은 docs/data-sources.md). 숫자를 사람이 옮겨 적지 않게 하는 것이 목적이다.

export const MEAL_STORY_FOOD_FILES = {
  raw: 'mfds-nutrition-15100065.csv',
  processed: 'mfds-nutrition-15100066.csv',
  // 음식(조리된 한 그릇, 15100070) — 식당 음식 한 그릇의 값과 무게. 분석한 행(외식·가정식)만 한 그릇으로 쓴다(아래 dishProblem).
  dish: 'mfds-nutrition.csv',
  // 가공식품 전체판(33만 행) — processed(5만 행에서 잘린 조각, 이름 가나다순의 뒤쪽)로는 제품 묶음이 한쪽으로 치우쳐, 제품을
  // 견주는 편의 묶음(group)이 읽는다. 식약처 식품영양성분 DB 내려받기(XLSX)를 build:processed-food-csv 로 줄인 것.
  'processed-full': 'mfds-processed-full.csv',
} as const;
type Db = keyof typeof MEAL_STORY_FOOD_FILES;

export type MealStoryFoodDb = Db;

const DB_SOURCE: Readonly<Record<Db, string>> = {
  raw: 'mfds-raw',
  processed: 'mfds-processed',
  dish: 'mfds-dish',
  'processed-full': 'mfds-processed-full',
};
const DB_LABEL: Readonly<Record<Db, string>> = {
  raw: '식약처 원재료성식품 표준데이터',
  processed: '식약처 가공식품 표준데이터',
  dish: '식약처 음식 표준데이터',
  'processed-full': '식약처 가공식품 DB 전체판',
};

// 표준데이터 머리글 → 값 이름(배포본마다 열이 붙고 빠져 이름으로 찾는다 — food-import 의 CSV_FIELD_MAP 과 같은 머리글).
const HEADER: Readonly<Record<string, string>> = {
  식품코드: 'code',
  식품명: 'name',
  식품대분류명: 'category',
  // 가공식품의 분류 — 대표식품명('라면'·'배추김치')과 식품소분류명('유탕면'·'프레스햄'). 묶음을 이름 대신 분류로 고를 때.
  대표식품명: 'rep',
  식품소분류명: 'sub',
  영양성분함량기준량: 'basis',
  '에너지(kcal)': 'kcal',
  '탄수화물(g)': 'carbG',
  '단백질(g)': 'proteinG',
  '지방(g)': 'fatG',
  '당류(g)': 'sugarG',
  '식이섬유(g)': 'fiberG',
  '나트륨(mg)': 'sodiumMg',
  '칼륨(mg)': 'potassiumMg',
  '칼슘(mg)': 'calciumMg',
  '비타민 C(mg)': 'vitaminCMg',
  // 음식 표준데이터 — 분석한 한 그릇의 무게와, 어디서 온 값인지(외식 분석·가정식 분석·급식 산출·업체 제공).
  // 가공식품에서는 식품중량 = 포장 무게, 1회 섭취참고량 = 식품 표시의 한 번 먹는 양('30g').
  식품중량: 'weight',
  식품기원명: 'origin',
  '1회 섭취참고량': 'serving',
};
/**
 * 표준데이터에서 읽어 foods.json 에 적는 값 이름 — 표준데이터로 푼 식품(ref·group)은 이 이름을 모두 적는다(모르면 null).
 * 여기에 이름을 더하면 모든 편의 foods.json 을 다시 만든다(pnpm --filter friendly build:meal-stories) — 내용 테스트가 값 이름이
 * 맞는지 본다.
 */
export const MEAL_STORY_PER100_KEYS = ['kcal', 'carbG', 'proteinG', 'fatG', 'sugarG', 'fiberG', 'sodiumMg', 'potassiumMg', 'calciumMg', 'vitaminCMg'] as const;
const PER100_KEYS = MEAL_STORY_PER100_KEYS;

export interface FoodRow {
  code: string;
  name: string;
  category: string;
  basis: '100g' | '100ml';
  per100: MealStoryPer100Type;
  /** 식품중량(g·ml) — 음식 표준데이터에서는 분석한 한 그릇의 무게. 없거나 못 읽으면 null. */
  servingG?: number | null;
  /** 식품기원명 — 외식(분석함량)·가정식(분석 함량)·급식(산출)·외식(업체 제공) … */
  origin?: string;
  /** 대표식품명 · 식품소분류명(가공식품). */
  rep?: string;
  sub?: string;
  /** 1회 섭취참고량 — 식품 표시의 한 번 먹는 양('30g'). 분류에 따라 긴 글일 수 있다(면류). */
  serving?: string;
}

export type FoodTables = Partial<Record<Db, FoodRow[]>>;

/** 식품중량 — '120g' · '1,000g' · '1.2kg' · '500ml' · '1L' → g·ml. 단위가 없으면 g 로 본다. 못 읽으면 null. */
const weightOf = (raw: string): number | null => {
  const m = /([\d.,]+)\s*(kg|㎏|g|ml|㎖|l|ℓ)?/i.exec(raw);
  if (!m) return null;
  const v = numOrNull(m[1]!.replace(/,/g, ''));
  if (v === null || !(v > 0)) return null;
  const unit = (m[2] ?? '').toLowerCase();
  return unit === 'kg' || unit === '㎏' || unit === 'l' || unit === 'ℓ' ? v * 1000 : v;
};

export const foodRowsFromCsv = (text: string): FoodRow[] => {
  const table = parseCsv(text);
  const index = new Map<string, number>();
  table.header.forEach((h, i) => {
    const k = looseNutrientHeader(h);
    if (k && !index.has(k)) index.set(k, i);
  });
  const col = new Map<string, number>();
  for (const [ko, key] of Object.entries(HEADER)) {
    const i = index.get(looseNutrientHeader(ko));
    if (i !== undefined) col.set(key, i);
  }
  const cell = (r: string[], key: string): string => (col.has(key) ? (r[col.get(key)!] ?? '').trim() : '');
  const out: FoodRow[] = [];
  for (const r of table.rows) {
    const code = cell(r, 'code');
    const name = cell(r, 'name');
    const basis = cell(r, 'basis').replace(/\s/g, '').toLowerCase();
    if (!code || !name || (basis !== '100g' && basis !== '100ml')) continue;
    const per100: MealStoryPer100Type = {};
    for (const k of PER100_KEYS) {
      const raw = cell(r, k);
      per100[k] = raw === '' ? null : numOrNull(raw.replace(/,/g, ''));
    }
    const row: FoodRow = { code, name, category: cell(r, 'category'), basis, per100, servingG: weightOf(cell(r, 'weight')), origin: cell(r, 'origin') };
    const [rep, sub, serving] = [cell(r, 'rep'), cell(r, 'sub'), cell(r, 'serving')];
    if (rep) row.rep = rep;
    if (sub) row.sub = sub;
    if (serving) row.serving = serving;
    out.push(row);
  }
  return out;
};

/** 원고의 foods 가 읽는 표준데이터 — 그 파일만 읽으려고(전체판은 60MB 라 안 쓰는 편에서는 읽지 않는다). */
export const foodDbsOf = (script: MealStoryScriptType): Db[] => [
  ...new Set(script.foods.flatMap((f) => (f.ref ? [f.ref.db] : f.group ? [f.group.db] : []))),
];

/** 원고가 읽는 표준데이터 가운데 읽지 못한 파일 — 있으면 foods.json 을 다시 만들 수도 원본과 맞춰 볼 수도 없다. */
export const missingFoodFiles = (script: MealStoryScriptType, tables: FoodTables): string[] =>
  foodDbsOf(script)
    .filter((db) => !tables[db])
    .map((db) => MEAL_STORY_FOOD_FILES[db]);

/**
 * data/open/food/ 의 표준데이터 — 찾는 곳은 지금 폴더와 저장소 뿌리. 없는 파일은 비운다. only 를 주면 그 파일만 읽는다.
 */
export const loadFoodTables = (
  roots: readonly string[],
  only?: readonly Db[],
): { tables: FoodTables; paths: Partial<Record<Db, string>> } => {
  const tables: FoodTables = {};
  const paths: Partial<Record<Db, string>> = {};
  for (const db of Object.keys(MEAL_STORY_FOOD_FILES) as Db[]) {
    if (only && !only.includes(db)) continue;
    for (const root of roots) {
      const p = join(root, 'data', 'open', 'food', MEAL_STORY_FOOD_FILES[db]);
      if (!existsSync(p)) continue;
      tables[db] = foodRowsFromCsv(decodeLifeCsv(readFileSync(p)));
      paths[db] = p;
      break;
    }
  }
  return { tables, paths };
};

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const v = s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  return Math.round(v * 100) / 100;
};

const DEFAULT_GROUP_MIN = 3;
// 낮은·높은 쪽 값(pick)은 제품이 넉넉할 때만 — 열 개에서 '아래 10%째'는 가장 낮은 제품 하나일 뿐이다.
const GROUP_PICK_MIN = 30;
const PICK_AT = { low: 0.1, high: 0.9 } as const;

/** 줄 세운 값의 q 째(0~1) — 가장 가까운 자리. */
const quantile = (xs: number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
};

/** 가장 흔한 값과 그 수. */
const mode = (xs: string[]): { value: string; count: number } | null => {
  const counts = new Map<string, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best: { value: string; count: number } | null = null;
  for (const [value, count] of counts) if (!best || count > best.count) best = { value, count };
  return best;
};

/**
 * 묶음의 포장 무게·한 번 먹는 양 — 원고가 '한 봉 110g'·'한 번 30g' 으로 적은 양을 사람이 자료와 맞춰 보라고 출처 글에 붙인다
 * (계산에는 쓰지 않는다). 무게는 절반 넘는 제품이 적었을 때, 한 번 먹는 양은 절반 넘는 제품이 같은 값일 때만.
 */
const amountsNote = (hits: FoodRow[]): string => {
  const out: string[] = [];
  const weights = hits.map((h) => h.servingG).filter((v): v is number => typeof v === 'number' && v > 0);
  if (weights.length * 2 > hits.length) out.push(`포장 무게 중앙값 ${median(weights)!.toLocaleString('ko-KR')}g`);
  const serving = mode(hits.map((h) => (h.serving ?? '').replace(/\s/g, '')).filter((s) => /^[\d.]+(g|ml)$/i.test(s)));
  if (serving && serving.count * 2 > hits.length) out.push(`1회 섭취참고량 ${serving.value}`);
  return out.length > 0 ? ` · ${out.join(' · ')}` : '';
};

/**
 * 음식 표준데이터의 행을 '식당 한 그릇'으로 쓸 수 있는가 — 쓸 수 없으면 까닭. 같은 이름(짬뽕)이 조사 종류마다 여러 행이고 무게와
 * 값이 크게 다르다: 분석한 한 그릇(외식·가정식)만 쓴다. 급식·재료량으로 산출한 행은 급식 1회 제공량이고, 간편조리세트(밀키트)는
 * 여러 사람 분량 한 팩이고, 식품중량이 100 이하인 행은 한 그릇 무게를 적지 않은 것이다.
 */
export const dishProblem = (row: FoodRow): string | null => {
  const origin = row.origin ?? '';
  if (!origin.includes('분석')) return `분석한 한 그릇이 아니다(식품기원 '${origin || '없음'}') — 외식(분석함량)·가정식(분석 함량) 행을 고른다`;
  if (row.name.includes('간편조리세트')) return '간편조리세트(여러 사람 분량 한 팩)는 한 그릇이 아니다';
  if (!(row.servingG && row.servingG > 100)) return `한 그릇 무게가 없다(식품중량 ${row.servingG ?? '—'})`;
  return null;
};

/** 원고의 foods(manual 제외)를 표준데이터로 푼다. 풀지 못한 것은 problems 에. */
export const buildMealStoryFoods = (
  script: MealStoryScriptType,
  tables: FoodTables,
): { file: MealStoryFoodsFileType; problems: string[] } => {
  const problems: string[] = [];
  const foods: MealStoryFoodsFileType['foods'] = {};
  for (const spec of script.foods) {
    if (spec.ref) {
      const rows = tables[spec.ref.db];
      if (!rows) {
        problems.push(`${spec.id}: ${MEAL_STORY_FOOD_FILES[spec.ref.db]} 이 없다(data/open/food/)`);
        continue;
      }
      const row = rows.find((r) => r.code === spec.ref!.code);
      if (!row) {
        problems.push(`${spec.id}: ${DB_LABEL[spec.ref.db]}에 식품코드 ${spec.ref.code} 가 없다`);
        continue;
      }
      if (spec.ref.db === 'dish') {
        const why = dishProblem(row);
        if (why) {
          problems.push(`${spec.id}: '${row.name}' — ${why}`);
          continue;
        }
        const servingG = row.servingG!;
        foods[spec.id] = {
          per100: row.per100,
          basis: row.basis,
          provenance: `${DB_LABEL.dish} ${row.code} '${row.name}' · ${row.origin} · 한 그릇 ${servingG.toLocaleString('ko-KR')}g`,
          source: DB_SOURCE.dish,
          servingG,
        };
        continue;
      }
      foods[spec.id] = {
        per100: row.per100,
        basis: row.basis,
        provenance: `${DB_LABEL[spec.ref.db]} ${row.code} '${row.name}'`,
        source: DB_SOURCE[spec.ref.db],
      };
      continue;
    }
    if (spec.group) {
      const g = spec.group;
      const rows = tables[g.db];
      if (!rows) {
        problems.push(`${spec.id}: ${MEAL_STORY_FOOD_FILES[g.db]} 이 없다(data/open/food/)`);
        continue;
      }
      const seen = new Set<string>();
      const hits = rows.filter((r) => {
        if (g.rep && r.rep !== g.rep) return false;
        if (g.sub && r.sub !== g.sub) return false;
        if (g.category && r.category !== g.category) return false;
        if (g.weight) {
          const w = r.servingG;
          if (typeof w !== 'number' || (g.weight.min !== undefined && w < g.weight.min) || (g.weight.max !== undefined && w > g.weight.max)) return false;
        }
        if (!(g.all ?? []).every((w) => r.name.includes(w))) return false;
        if (g.any && g.any.length > 0 && !g.any.some((w) => r.name.includes(w))) return false;
        if (g.none?.some((w) => r.name.includes(w))) return false;
        // 같은 제품이 두 번 실린 행(이름·값이 같음)은 한 번만 센다.
        const key = `${r.name}|${JSON.stringify(r.per100)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (hits.length < (g.min ?? DEFAULT_GROUP_MIN)) {
        problems.push(`${spec.id}: 묶음에 든 제품이 ${hits.length}개뿐이다(최소 ${g.min ?? DEFAULT_GROUP_MIN})`);
        continue;
      }
      const per100: MealStoryPer100Type = {};
      const counts: MealStoryPer100CountsType = {};
      const valuesOf = (k: (typeof PER100_KEYS)[number]): number[] =>
        hits.map((h) => h.per100[k]).filter((v): v is number => v !== null && v !== undefined);
      if (g.pick) {
        // 낮은·높은 쪽 값 — 그 영양소 순으로 줄 세운 10%째·90%째. 다른 영양소는 비운다(따로 뽑으면 어느 제품의 값도 아니다).
        const values = valuesOf(g.pick.by);
        if (values.length < GROUP_PICK_MIN) {
          problems.push(
            `${spec.id}: 낮은·높은 쪽 값(pick)은 ${MEAL_STORY_NUTRIENTS[g.pick.by].label} 값을 적은 제품이 ${GROUP_PICK_MIN}개 이상일 때만 낸다(${values.length}개)`,
          );
          continue;
        }
        for (const k of PER100_KEYS) per100[k] = null;
        per100[g.pick.by] = quantile(values, PICK_AT[g.pick.at]);
        if (values.length < hits.length) counts[g.pick.by] = values.length;
      } else {
        for (const k of PER100_KEYS) {
          const values = valuesOf(k);
          // 그 영양소를 적은 제품이 최소 수보다 적으면 비운다(제품 하나의 값을 '중앙값'이라 부르지 않는다).
          if (values.length < (g.min ?? DEFAULT_GROUP_MIN)) {
            per100[k] = null;
            continue;
          }
          per100[k] = median(values);
          if (values.length < hits.length) counts[k] = values.length;
        }
      }
      const ml = hits.filter((h) => h.basis === '100ml').length;
      const byClass = [g.rep, g.sub].filter(Boolean).join(' > ');
      const byName = `${(g.all ?? []).join('·')}${g.any?.length ? ` + ${g.any.join('|')}` : ''}`;
      const byWeight = g.weight ? `포장 ${g.weight.min ?? ''}~${g.weight.max ?? ''}g` : '';
      const words = `${[byClass, byName, byWeight].filter(Boolean).join(' · ')}${g.category ? ` (${g.category})` : ''}`;
      const count = hits.length.toLocaleString('ko-KR');
      const what = g.pick
        ? `제품 ${count}개를 ${MEAL_STORY_NUTRIENTS[g.pick.by].label} 순으로 세운 ${g.pick.at === 'low' ? '아래' : '위'}에서 10%째 값`
        : `제품 ${count}개의 중앙값`;
      foods[spec.id] = {
        per100,
        basis: ml > hits.length / 2 ? '100ml' : '100g',
        provenance: `${DB_LABEL[g.db]} '${words}' ${what}${amountsNote(hits)}`,
        source: DB_SOURCE[g.db],
        matched: {
          count: hits.length,
          names: [...new Set(hits.map((h) => h.name))].sort((a, b) => a.localeCompare(b, 'ko')).slice(0, 10),
          ...(Object.keys(counts).length > 0 ? { counts } : {}),
          ...(g.pick ? { pick: g.pick.at } : {}),
        },
      };
    }
  }
  return { file: { generatedBy: 'build:meal-stories', foods }, problems };
};
