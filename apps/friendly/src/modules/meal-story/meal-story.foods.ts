import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../../lib/csv.js';
import { numOrNull } from '../../lib/narrow.js';
import { looseNutrientHeader } from '../food/food-nutrients.js';
import { decodeLifeCsv } from '../life-map/life-map-master.service.js';
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
} as const;
type Db = keyof typeof MEAL_STORY_FOOD_FILES;

const DB_SOURCE: Readonly<Record<Db, string>> = { raw: 'mfds-raw', processed: 'mfds-processed' };
const DB_LABEL: Readonly<Record<Db, string>> = {
  raw: '식약처 원재료성식품 표준데이터',
  processed: '식약처 가공식품 표준데이터',
};

// 표준데이터 머리글 → 값 이름(배포본마다 열이 붙고 빠져 이름으로 찾는다 — food-import 의 CSV_FIELD_MAP 과 같은 머리글).
const HEADER: Readonly<Record<string, string>> = {
  식품코드: 'code',
  식품명: 'name',
  식품대분류명: 'category',
  영양성분함량기준량: 'basis',
  '에너지(kcal)': 'kcal',
  '탄수화물(g)': 'carbG',
  '단백질(g)': 'proteinG',
  '지방(g)': 'fatG',
  '당류(g)': 'sugarG',
  '식이섬유(g)': 'fiberG',
  '나트륨(mg)': 'sodiumMg',
  '칼륨(mg)': 'potassiumMg',
};
const PER100_KEYS = ['kcal', 'carbG', 'proteinG', 'fatG', 'sugarG', 'fiberG', 'sodiumMg', 'potassiumMg'] as const;

export interface FoodRow {
  code: string;
  name: string;
  category: string;
  basis: '100g' | '100ml';
  per100: MealStoryPer100Type;
}

export type FoodTables = Partial<Record<Db, FoodRow[]>>;

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
    out.push({ code, name, category: cell(r, 'category'), basis, per100 });
  }
  return out;
};

/** data/open/food/ 의 표준데이터 — 찾는 곳은 지금 폴더와 저장소 뿌리. 없는 파일은 비운다. */
export const loadFoodTables = (roots: readonly string[]): { tables: FoodTables; paths: Partial<Record<Db, string>> } => {
  const tables: FoodTables = {};
  const paths: Partial<Record<Db, string>> = {};
  for (const db of Object.keys(MEAL_STORY_FOOD_FILES) as Db[]) {
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
        if (!g.all.every((w) => r.name.includes(w))) return false;
        if (g.any && g.any.length > 0 && !g.any.some((w) => r.name.includes(w))) return false;
        if (g.none?.some((w) => r.name.includes(w))) return false;
        if (g.category && r.category !== g.category) return false;
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
      for (const k of PER100_KEYS) {
        const values = hits.map((h) => h.per100[k]).filter((v): v is number => v !== null && v !== undefined);
        // 그 영양소를 적은 제품이 최소 수보다 적으면 비운다(제품 하나의 값을 '중앙값'이라 부르지 않는다).
        if (values.length < (g.min ?? DEFAULT_GROUP_MIN)) {
          per100[k] = null;
          continue;
        }
        per100[k] = median(values);
        if (values.length < hits.length) counts[k] = values.length;
      }
      const ml = hits.filter((h) => h.basis === '100ml').length;
      const words = `${g.all.join('·')}${g.any?.length ? ` + ${g.any.join('|')}` : ''}${g.category ? ` (${g.category})` : ''}`;
      foods[spec.id] = {
        per100,
        basis: ml > hits.length / 2 ? '100ml' : '100g',
        provenance: `${DB_LABEL[g.db]} '${words}' 제품 ${hits.length}개의 중앙값`,
        source: DB_SOURCE[g.db],
        matched: {
          count: hits.length,
          names: [...new Set(hits.map((h) => h.name))].sort((a, b) => a.localeCompare(b, 'ko')).slice(0, 10),
          ...(Object.keys(counts).length > 0 ? { counts } : {}),
        },
      };
    }
  }
  return { file: { generatedBy: 'build:meal-stories', foods }, problems };
};
