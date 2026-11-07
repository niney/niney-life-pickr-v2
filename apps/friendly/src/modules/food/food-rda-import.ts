// 국가표준식품성분 DB(농촌진흥청 국립식량과학원, 엑셀) → 원재료 행에 보탤 영양소.
//
// 원재료 표준데이터(15100065)는 24성분이라 마그네슘·아연·엽산이 없다. 같은 원재료의 원본인 국가표준식품성분 DB
// (10개정판 엑셀, 시트 '국가표준식품성분 Database 10.x', 3,366종 × 약 130성분)에는 있어서, 식품명으로 짝지어
// 원재료 적재(food-raw-import)에 보탠다. 출처 표시 조건(공공누리 1유형) — docs/data-sources.md.
//
// 시트 모양(2026-11-07 실측, DB 10.4): 첫 줄은 열 번호 같은 조판 행, 그다음 줄이 성분명('식품명'·'마그네슘'·
// '엽산_\r\n엽산당량'…), 그다음 줄이 단위(g·mg·μg), 그 아래가 식품. 값 표기: '-' 미분석(값 없음), 'Tr' 미량(0),
// '(0)' 추정 0(0). 식품명은 '멥쌀, 현미, 생것' 처럼 쉼표 구분 — 표준데이터는 '멥쌀_현미_생것' 이라 구분자를 지우고
// 낱말 순서로 대조한다(정규화 전 단순 대조로 농진청 출처 1,878행 중 1,165행 일치, 못 맞춘 것은 대개 품종 변형).

import type { XlsxTable } from '../../lib/xlsx.js';
import type { NutrientKey, NutrientsPer100g } from './food-nutrients.js';

// 보탤 영양소 → 성분표 열 이름(공백·줄바꿈을 지운 모양).
export const RDA_NUTRIENT_COLUMNS: Readonly<Partial<Record<NutrientKey, string>>> = {
  magnesiumMg: '마그네슘',
  zincMg: '아연',
  folateUg: '엽산_엽산당량',
};

const compact = (s: string): string => s.replace(/\s+/g, '');

/** '멥쌀, 현미, 생것' 과 '멥쌀_현미_생것' 을 같은 키로. */
export const rdaNameKey = (name: string): string =>
  name
    .split(/[,_]/)
    .map((t) => t.replace(/\s+/g, ''))
    .filter(Boolean)
    .join('|');

export const parseRdaValue = (raw: string | undefined): number | null => {
  const s = (raw ?? '').trim();
  if (!s || s === '-') return null;
  if (/^tr$/i.test(s)) return 0;
  const m = /^\(?\s*([\d.]+)\s*\)?$/.exec(s);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) && v >= 0 ? v : null;
};

const compareVersion = (a: readonly number[], b: readonly number[]): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
};

/** 시트 목록에서 가장 높은 판의 DB 시트('국가표준식품성분 Database 10.4' 등). */
export const pickRdaSheet = (sheets: readonly string[]): string | null => {
  let best: { name: string; version: number[] } | null = null;
  for (const name of sheets) {
    const m = /^국가표준식품성분\s*Database\s*([\d.]+)$/.exec(name.trim());
    if (!m) continue;
    const version = m[1]!.split('.').map((x) => Number(x) || 0);
    if (!best || compareVersion(version, best.version) > 0) best = { name, version };
  }
  return best?.name ?? null;
};

/** 식품명 키 → 보탤 영양소. 같은 키가 여럿이면 먼저 나온 행. */
export const rdaCompositionFromTable = (table: XlsxTable): Map<string, NutrientsPer100g> => {
  const all = [table.header, ...table.rows];
  const headIdx = all.findIndex((r) => r.some((c) => compact(c) === '식품명'));
  const out = new Map<string, NutrientsPer100g>();
  if (headIdx < 0) return out;
  const head = all[headIdx]!.map(compact);
  const nameCol = head.indexOf('식품명');
  const cols = Object.entries(RDA_NUTRIENT_COLUMNS).flatMap(([key, col]) => {
    const i = head.indexOf(col!);
    return i < 0 ? [] : [[key as NutrientKey, i] as const];
  });
  // 성분명 줄 다음은 단위 줄 — 식품명 칸이 비어 있다.
  for (const r of all.slice(headIdx + 1)) {
    const name = (r[nameCol] ?? '').trim();
    if (!name) continue;
    const key = rdaNameKey(name);
    if (out.has(key)) continue;
    const values: NutrientsPer100g = {};
    for (const [nk, i] of cols) {
      const v = parseRdaValue(r[i]);
      if (v !== null) values[nk] = v;
    }
    out.set(key, values);
  }
  return out;
};

/** 원재료 적재(rawFileRowsToRecords)의 `extra` — 표준데이터 식품명으로 성분표 값을 찾는다. */
export const rdaLookup =
  (composition: ReadonlyMap<string, NutrientsPer100g>) =>
  (foodNm: string): NutrientsPer100g | undefined => {
    const hit = composition.get(rdaNameKey(foodNm));
    return hit && Object.keys(hit).length > 0 ? hit : undefined;
  };
