// 메뉴 칼로리 표시 — 전체 파이프라인(규칙 → LLM 매칭 → 웹 실측) 커버리지 프로브.
//
// 실행: pnpm --filter friendly probe:menu-coverage [--limit=식당수] [--ask=N] [--web=N] [--samples=N]
//   - measure:menu-nutrition 은 규칙만 잰다. 이 스크립트는 규칙 밖 이름을 LLM 캐시/호출(--ask 상한),
//     LLM 표준명을 웹 캐시/조회(--web 상한)까지 돌려 "최종 표시율"과 잔여 미표시 사유를 찍는다.
//   - 실제 서비스와 같은 캐시 테이블(menu_llm_matches, food_web_estimates)에 저장된다.

import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/env.js';
import { AiConfigService } from '../src/modules/ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../src/modules/ai/llm-provider-env.js';
import { FoodWebEstimateService } from '../src/modules/food/food-web-estimate.service.js';
import { MenuLlmMatchService } from '../src/modules/food/menu-llm-match.service.js';
import { MenuNutritionResolver } from '../src/modules/food/menu-nutrition.js';
import { webQueryFor } from '../src/modules/food/menu-nutrition.service.js';

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const LIMIT = Number(opt('limit', '0'));
const ASK = Number(opt('ask', '0'));
const WEB = Number(opt('web', '0'));
const SAMPLES = Number(opt('samples', '30'));
// --json=<경로>: 이름별 최종 판정을 파일로(골든셋 만들 때).
const JSON_OUT = opt('json', '');

const prisma = new PrismaClient();
const pct = (n: number, d: number): string => (d === 0 ? '0%' : `${((n / d) * 100).toFixed(1)}%`);

const collect = async (): Promise<Map<string, number>> => {
  const byName = new Map<string, Set<string>>();
  const add = (rid: string, name: unknown): void => {
    if (typeof name !== 'string' || !name.trim()) return;
    const n = name.trim();
    if (!byName.has(n)) byName.set(n, new Set());
    byName.get(n)!.add(rid);
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
      /* skip */
    }
  }
  const rows = await prisma.restaurantMenu.findMany({
    select: { restaurantId: true, name: true },
    ...(LIMIT > 0 ? { where: { restaurantId: { in: restaurants.map((r) => r.id) } } } : {}),
  });
  for (const row of rows) add(row.restaurantId, row.name);
  return new Map([...byName.entries()].map(([n, s]) => [n, s.size]));
};

const main = async (): Promise<void> => {
  const names = await collect();
  const totalOcc = [...names.values()].reduce((a, b) => a + b, 0);
  console.log(`menu names distinct=${names.size} weighted=${totalOcc}`);

  const resolver = new MenuNutritionResolver(prisma);
  const rules = await resolver.resolveMany([...names.keys()]);
  const shownRules = [...rules.values()].filter((r) => r.basis);
  const setNames = [...rules.values()].filter((r) => r.reason === 'set').map((r) => r.name);
  const unresolved = [...rules.values()]
    .filter((r) => !r.basis && r.reason !== 'set' && r.reason !== 'empty')
    .map((r) => r.name);
  console.log(`rules shown=${shownRules.length} set=${setNames.length} unresolved=${unresolved.length}`);

  const aiConfig = new AiConfigService(prisma, buildLlmProviderEnv());
  const llm = new MenuLlmMatchService(prisma, aiConfig, { model: env.OLLAMA_MENU_MATCH_MODEL });
  const web = new FoodWebEstimateService(prisma, {});

  const llmMap = await llm.lookupCached(unresolved);
  const llmMissing = unresolved
    .filter((n) => !llmMap.has(n))
    .sort((a, b) => (names.get(b) ?? 0) - (names.get(a) ?? 0));
  console.log(`llm cached=${llmMap.size} uncached=${llmMissing.length} → asking ${Math.min(ASK, llmMissing.length)}`);
  const askList = llmMissing.slice(0, ASK);
  for (let i = 0; i < askList.length; i += 50) {
    const t = Date.now();
    const got = await llm.matchMany(askList.slice(i, i + 50));
    for (const [k, v] of got) llmMap.set(k, v);
    console.log(`  asked ${Math.min(i + 50, askList.length)}/${askList.length} (+${got.size}, ${((Date.now() - t) / 1000).toFixed(0)}s)`);
  }

  let llmHit = 0;
  const llmNoKcal: string[] = [];
  const webQueries = new Map<string, string>();
  const llmNone: string[] = [];
  for (const n of unresolved) {
    const m = llmMap.get(n);
    if (!m) continue;
    if (m.hit) {
      if (m.hit.kcalPer100g !== null) llmHit += 1;
      else llmNoKcal.push(n);
      continue;
    }
    const q = webQueryFor(n, m.canonical);
    if (q) webQueries.set(n, q);
    else llmNone.push(n);
  }
  const queries = [...new Set(webQueries.values())];
  const webMap = await web.lookupCached(queries);
  const webMissing = queries.filter((q) => !webMap.has(q));
  console.log(
    `llm hit=${llmHit} hitNoKcal=${llmNoKcal.length} canonical→web=${webQueries.size}(distinct ${queries.length}) none=${llmNone.length}`,
  );
  console.log(`web cached=${webMap.size} uncached=${webMissing.length} → fetching ${Math.min(WEB, webMissing.length)}`);
  const fetchList = webMissing.slice(0, WEB);
  for (let i = 0; i < fetchList.length; i += 15) {
    const got = await web.estimateMany(fetchList.slice(i, i + 15));
    for (const [k, v] of got) webMap.set(k, v);
    console.log(`  fetched ${Math.min(i + 15, fetchList.length)}/${fetchList.length}`);
  }

  let webHit = 0;
  const webRejected: string[] = [];
  const webUnknown: string[] = [];
  for (const [n, q] of webQueries) {
    if (!webMap.has(q)) webUnknown.push(n);
    else if (webMap.get(q)) webHit += 1;
    else webRejected.push(n);
  }

  const w = (list: string[]): number => list.reduce((a, n) => a + (names.get(n) ?? 0), 0);
  const shown = shownRules.length + llmHit + webHit;
  const shownOcc =
    w(shownRules.map((r) => r.name)) +
    w(unresolved.filter((n) => llmMap.get(n)?.hit?.kcalPer100g != null)) +
    w([...webQueries.entries()].filter(([, q]) => webMap.get(q)).map(([n]) => n));
  const llmUnasked = llmMissing.slice(ASK);
  console.log('');
  console.log(`최종 표시: distinct ${shown}/${names.size} (${pct(shown, names.size)}) · 가중 ${shownOcc}/${totalOcc} (${pct(shownOcc, totalOcc)})`);
  console.log(`  rules=${shownRules.length} llm=${llmHit} web=${webHit}`);
  console.log(
    `잔여 미표시: set=${setNames.length} llm미조회=${llmUnasked.length} llm없음=${llmNone.length} llmHit-kcal없음=${llmNoKcal.length} web미조회=${webUnknown.length} web미채택=${webRejected.length}`,
  );

  const show = (title: string, list: string[], extra?: (n: string) => string): void => {
    if (list.length === 0) return;
    const sorted = [...list].sort((a, b) => (names.get(b) ?? 0) - (names.get(a) ?? 0));
    console.log('');
    console.log(`── ${title} (${list.length}) ──`);
    for (const n of sorted.slice(0, SAMPLES)) console.log(`  ×${names.get(n)} ${n}${extra ? ` ${extra(n)}` : ''}`);
  };
  if (JSON_OUT) {
    const dump = [...names.keys()].map((n) => {
      const r = rules.get(n)!;
      const m = llmMap.get(n);
      const q = webQueries.get(n);
      const w = q ? webMap.get(q) : undefined;
      const tier = r.basis ? r.matchedBy : m?.hit?.kcalPer100g != null ? 'llm' : w ? 'web' : null;
      const foodName = r.basis ? r.foodName : m?.hit?.kcalPer100g != null ? m.hit.foodName : w ? q : null;
      const kcal = r.basis ? r.kcal : m?.hit?.kcalPer100g != null ? Math.round(m.hit.kcalPer100g) : w ? w.kcalPer100g : null;
      const basis = r.basis ?? (tier ? 'per_100g' : null);
      return { name: n, restaurants: names.get(n), tier, foodName, basis, kcal, reason: r.reason, canonical: m?.canonical ?? null, webQuery: q ?? null };
    });
    writeFileSync(JSON_OUT, JSON.stringify(dump, null, 1), 'utf-8');
    console.log(`wrote ${JSON_OUT} (${dump.length})`);
  }
  show('LLM: hit·canonical 모두 없음', llmNone);
  show('웹 미채택', webRejected, (n) => `(q=${webQueries.get(n)})`);
  show('웹 미조회', webUnknown, (n) => `(q=${webQueries.get(n)})`);
  show('LLM 미조회', llmUnasked);
  show('LLM hit 이지만 kcalPer100g 없음', llmNoKcal, (n) => `→ ${llmMap.get(n)!.hit!.foodName}`);
  show('세트 판정', setNames);
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
