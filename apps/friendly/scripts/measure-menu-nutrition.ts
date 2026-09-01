// 식당 메뉴 칼로리 표시 — 매칭률 측정.
//
// 실행: pnpm --filter friendly measure:menu-nutrition [--limit=N] [--samples=N] [--json=<경로>]
//   - restaurants.snapshotJson 의 menus + restaurant_menus 의 이름을 모아(식당 수 가중) 카탈로그에 대어 보고,
//     1인분 / 100g당 / 미표시(사유별) 비율과 눈으로 검토할 샘플을 찍는다.
//   - 카탈로그(food_items)가 비어 있으면 의미가 없다 — 먼저 `load:food-catalog` (docs/data-sources.md).
//   - --json 을 주면 전체 판정을 파일로 남긴다(운영 골든셋 만들 때).

import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { FoodService } from '../src/modules/food/food.service.js';
import {
  MenuNutritionResolver,
  createMenuFoodLookup,
  type MenuKcalReason,
  type MenuKcalResult,
} from '../src/modules/food/menu-nutrition.js';

const args = process.argv.slice(2);
const opt = (name: string): string | null => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const LIMIT = Number(opt('limit') ?? '0') || 0;
const SAMPLES = Number(opt('samples') ?? '25') || 25;
const JSON_OUT = opt('json');

const prisma = new PrismaClient();

const collectMenuNames = async (): Promise<Map<string, number>> => {
  // 이름 → 등장 식당 수.
  const byName = new Map<string, Set<string>>();
  const add = (restaurantId: string, name: unknown) => {
    if (typeof name !== 'string') return;
    const n = name.trim();
    if (!n) return;
    let set = byName.get(n);
    if (!set) {
      set = new Set();
      byName.set(n, set);
    }
    set.add(restaurantId);
  };

  const restaurants = await prisma.restaurant.findMany({
    select: { id: true, snapshotJson: true },
    ...(LIMIT > 0 ? { take: LIMIT } : {}),
  });
  for (const r of restaurants) {
    try {
      const snap = JSON.parse(r.snapshotJson) as { menus?: { name?: unknown }[] };
      for (const m of snap.menus ?? []) add(r.id, m?.name);
    } catch {
      // 손상 스냅샷은 건너뜀
    }
  }
  const rows = await prisma.restaurantMenu.findMany({
    select: { restaurantId: true, name: true },
    ...(LIMIT > 0 ? { where: { restaurantId: { in: restaurants.map((r) => r.id) } } } : {}),
  });
  for (const row of rows) add(row.restaurantId, row.name);

  return new Map([...byName.entries()].map(([name, set]) => [name, set.size]));
};

const pct = (n: number, d: number): string => (d === 0 ? '0.0%' : `${((n / d) * 100).toFixed(1)}%`);
const pad = (s: string, w: number): string => (s.length >= w ? s : s + ' '.repeat(w - s.length));

const main = async () => {
  const catalogCount = await prisma.foodItem.count({ where: { active: true } });
  const withKcal = await prisma.foodItem.count({ where: { active: true, kcal: { not: null } } });
  const withPer100 = await prisma.foodItem.count({
    where: { active: true, kcalPer100g: { not: null } },
  });
  console.log(`catalog active=${catalogCount} kcal=${withKcal} kcalPer100g=${withPer100}`);
  if (catalogCount === 0) {
    console.log('카탈로그가 비어 있다 — load:food-catalog 먼저.');
    return;
  }

  const names = await collectMenuNames();
  const totalOcc = [...names.values()].reduce((a, b) => a + b, 0);
  console.log(`menu names distinct=${names.size} occurrences(식당 가중)=${totalOcc}`);

  const resolver = new MenuNutritionResolver(createMenuFoodLookup(prisma, new FoodService(prisma)));
  const started = Date.now();
  const results = await resolver.resolveMany([...names.keys()]);
  console.log(`resolved in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  const reasons: MenuKcalReason[] = [
    'per_serving',
    'per_100g',
    'set',
    'no_match',
    'fuzzy_rejected',
    'no_kcal',
    'empty',
  ];
  const byReason = new Map<MenuKcalReason, { distinct: number; occ: number; items: MenuKcalResult[] }>();
  for (const r of reasons) byReason.set(r, { distinct: 0, occ: 0, items: [] });
  for (const [name, res] of results) {
    const bucket = byReason.get(res.reason)!;
    bucket.distinct += 1;
    bucket.occ += names.get(name) ?? 0;
    bucket.items.push(res);
  }

  const shown = (byReason.get('per_serving')!.distinct + byReason.get('per_100g')!.distinct);
  const shownOcc = byReason.get('per_serving')!.occ + byReason.get('per_100g')!.occ;
  console.log('');
  console.log(`표시 가능: distinct ${shown}/${names.size} (${pct(shown, names.size)}) · 가중 ${shownOcc}/${totalOcc} (${pct(shownOcc, totalOcc)})`);
  console.log('');
  console.log(pad('reason', 14) + pad('distinct', 12) + pad('%', 8) + pad('weighted', 12) + '%');
  for (const r of reasons) {
    const b = byReason.get(r)!;
    console.log(
      pad(r, 14) + pad(String(b.distinct), 12) + pad(pct(b.distinct, names.size), 8) +
        pad(String(b.occ), 12) + pct(b.occ, totalOcc),
    );
  }

  const byMatched = new Map<string, number>();
  for (const res of results.values()) {
    if (!res.basis) continue;
    byMatched.set(res.matchedBy!, (byMatched.get(res.matchedBy!) ?? 0) + 1);
  }
  console.log('');
  console.log('표시 항목 매칭 방식: ' + [...byMatched.entries()].map(([k, v]) => `${k}=${v}`).join(' '));

  const sample = (reason: MenuKcalReason, title: string) => {
    const items = byReason.get(reason)!.items;
    if (items.length === 0) return;
    // 자주 나오는 이름부터 — 운영에서 눈에 띄는 순.
    const sorted = [...items].sort((a, b) => (names.get(b.name) ?? 0) - (names.get(a.name) ?? 0));
    console.log('');
    console.log(`── ${title} (${items.length}) ──`);
    for (const it of sorted.slice(0, SAMPLES)) {
      const freq = names.get(it.name) ?? 0;
      const tail = it.basis
        ? `→ ${it.foodName} [${it.matchedBy}] ${it.kcal}kcal ${it.basis}${it.nutritionFrom ? ` (${it.nutritionFrom} 기준)` : ''}`
        : it.candidate
          ? `(퍼지 후보: ${it.candidate})`
          : '';
      console.log(`  ×${freq} ${it.name} ${tail}`);
    }
  };
  sample('per_serving', '1인분 표시');
  sample('per_100g', '100g당 표시');
  sample('fuzzy_rejected', '퍼지 후보만 있음(표시 안 함)');
  sample('no_kcal', '매칭됐으나 kcal 없음');
  sample('set', '세트 판정');
  sample('no_match', '미매칭');

  // 낮은 정밀 등급(variant/hint/suffix)으로 표시되는 항목 — 오매칭을 눈으로 검토한다.
  const loose = [...results.values()].filter(
    (r) => r.basis && r.matchedBy && !['exact', 'alias', 'synonym', 'modifier'].includes(r.matchedBy),
  );
  if (loose.length > 0) {
    console.log('');
    console.log(`── variant/hint/suffix 로 표시되는 항목 — 오매칭 검토 (${loose.length}) ──`);
    for (const it of loose.slice(0, SAMPLES * 2)) {
      console.log(`  ${it.name} → ${it.foodName} [${it.matchedBy}] ${it.kcal}kcal ${it.basis}`);
    }
  }

  if (JSON_OUT) {
    const dump = [...results.values()].map((r) => ({ ...r, restaurants: names.get(r.name) ?? 0 }));
    writeFileSync(JSON_OUT, JSON.stringify(dump, null, 2), 'utf-8');
    console.log('');
    console.log(`wrote ${JSON_OUT}`);
  }
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
