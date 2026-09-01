// 카탈로그 메모리 인덱스 — 엔진이 DB 없이 동기로 조회한다.
//
// 카탈로그는 2천 행 안팎이고 월 1회 갱신이라 부팅 때 만들고 적재 뒤 다시 만들면 된다. 이름·별칭 정규화
// 맵(exact/alias) 과 접미 조회(핵심어: "북경짜장면" → "짜장면")를 제공한다. 접미 조회는 별칭도 보되
// 2자 별칭까지('망고목살' → 목살) — 위험한 2자 별칭은 lexicon.suffixBlock 이 막는다.

import type { PrismaClient } from '@prisma/client';
import { normalizeTerm } from '../../../lib/text.js';

export interface CatalogRow {
  id: string;
  name: string;
  nameNorm: string;
  aliasNorms: string[];
  kcal: number | null;
  kcalPer100g: number | null;
  servingG: number | null;
  nutritionFrom: string | null;
  /** 시드 출처. 'mfds-raw' 는 생재료(괄호 힌트로는 쓰지 않는다). */
  source: string;
  /** 출처 분류(원재료는 '육류'·'어패류 및 기타 수산물' 등). 접미 규칙: 생재료 중 육류 부위만 접미로 붙는다. */
  sourceCategory: string | null;
}

export interface IndexHit {
  row: CatalogRow;
  /** 별칭으로 걸렸는지. */
  alias: boolean;
  /** 걸린 정규화 키. */
  key: string;
}

export interface CatalogIndex {
  readonly size: number;
  /** 정규화 이름/별칭 완전 일치. */
  exact(norm: string): IndexHit | null;
  /** norm 이 카탈로그 키로 **끝나는** 가장 긴 행(범주어 제외). 키 자체와 같으면 제외. */
  suffix(norm: string, block: ReadonlySet<string>): IndexHit | null;
  /** 전체 행(후보 추천·LLM 후보용). */
  rows(): CatalogRow[];
}

const MIN_SUFFIX_KEY = 2;
// 2자 별칭도 접미로 본다('망고목살' → 목살). 위험한 것은 lexicon.suffixBlock 이 막는다.
const MIN_ALIAS_SUFFIX_KEY = 2;

export const buildCatalogIndex = (rowsIn: CatalogRow[], extraAliases: Record<string, string[]> = {}): CatalogIndex => {
  // 어휘의 추가 별칭을 행에 합친다(이름 기준).
  const extra = new Map(Object.entries(extraAliases).map(([k, v]) => [normalizeTerm(k), v.map(normalizeTerm)]));
  const rows = rowsIn.map((r) => {
    const add = extra.get(r.nameNorm);
    return add ? { ...r, aliasNorms: [...new Set([...r.aliasNorms, ...add])] } : r;
  });
  const byNorm = new Map<string, IndexHit>();
  // 이름이 별칭을 이긴다 — 같은 키가 어느 행의 별칭이면서 다른 행의 이름이면 이름 행.
  for (const row of rows) {
    if (row.nameNorm && !byNorm.has(row.nameNorm)) byNorm.set(row.nameNorm, { row, alias: false, key: row.nameNorm });
  }
  for (const row of rows) {
    for (const a of row.aliasNorms) {
      if (a && !byNorm.has(a)) byNorm.set(a, { row, alias: true, key: a });
    }
  }
  return {
    size: rows.length,
    exact: (norm) => byNorm.get(norm) ?? null,
    suffix: (norm, block) => {
      for (let k = norm.length - 1; k >= MIN_SUFFIX_KEY; k -= 1) {
        const key = norm.slice(-k);
        const hit = byNorm.get(key);
        if (!hit || block.has(key)) continue;
        if (hit.alias && key.length < MIN_ALIAS_SUFFIX_KEY) continue;
        return hit;
      }
      return null;
    },
    rows: () => rows,
  };
};

const parseAliases = (json: string | null): string[] => {
  if (!json) return [];
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

/** DB 의 active 행으로 인덱스를 만든다. */
export const loadCatalogIndex = async (prisma: PrismaClient, extraAliases: Record<string, string[]> = {}): Promise<CatalogIndex> => {
  const rows = await prisma.foodItem.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      nameNorm: true,
      aliasNormsJson: true,
      kcal: true,
      kcalPer100g: true,
      servingG: true,
      nutritionFrom: true,
      source: true,
      sourceCategory: true,
    },
  });
  return buildCatalogIndex(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      nameNorm: r.nameNorm || normalizeTerm(r.name),
      aliasNorms: parseAliases(r.aliasNormsJson),
      kcal: r.kcal,
      kcalPer100g: r.kcalPer100g,
      servingG: r.servingG,
      nutritionFrom: r.nutritionFrom,
      source: r.source,
      sourceCategory: r.sourceCategory,
    })),
    extraAliases,
  );
};

/** 테스트·스크립트용 — 이름과 값만으로 행을 만든다. */
export const catalogRow = (
  name: string,
  over: Partial<Omit<CatalogRow, 'name' | 'nameNorm'>> & { aliases?: string[] } = {},
): CatalogRow => ({
  id: over.id ?? `id-${name}`,
  name,
  nameNorm: normalizeTerm(name),
  aliasNorms: (over.aliases ?? over.aliasNorms ?? []).map(normalizeTerm),
  kcal: over.kcal ?? null,
  kcalPer100g: over.kcalPer100g ?? null,
  servingG: over.servingG ?? null,
  nutritionFrom: over.nutritionFrom ?? null,
  source: over.source ?? 'mfds-nutrition',
  sourceCategory: over.sourceCategory ?? (over.source === 'mfds-raw' ? '육류' : null),
});
