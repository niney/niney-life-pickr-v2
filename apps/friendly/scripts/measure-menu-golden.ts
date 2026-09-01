// 메뉴 칼로리 골든셋 정밀도 — 계층별(exact·alias·synonym·modifier·variant·hint·suffix·llm·web) 정답률.
//
// 실행: pnpm --filter friendly measure:menu-golden [--golden=golden/menu-nutrition.golden.json] [--show=N]
//   - 골든셋: { name, expect: 정답 음식명[] | null(미표시가 정답), basis: 'per_serving'|'per_100g'|'per_100ml'|'any'|null }.
//     expect 가 여러 개면 그중 하나로 판정되면 정답. basis 'any' 는 등급을 따지지 않는다.
//   - 규칙 계층은 라이브로 돌리고, LLM·웹은 캐시 테이블(menu_llm_matches·food_web_estimates)만 읽는다 —
//     먼저 `probe:menu-coverage --ask=N --web=N` 으로 캐시를 채워 둔다.
//   - 표시율이 아니라 **정밀도**가 척도다: 표시한 것 중 맞은 비율. 표시율을 올리는 규칙이 정밀도를 깎으면 거부.

import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { normalizeTerm } from '../src/lib/text.js';
import { env } from '../src/config/env.js';
import { AiConfigService } from '../src/modules/ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../src/modules/ai/llm-provider-env.js';
import { FoodWebEstimateService } from '../src/modules/food/food-web-estimate.service.js';
import { MenuLlmMatchService } from '../src/modules/food/menu-llm-match.service.js';
import { MenuNutritionResolver } from '../src/modules/food/menu-nutrition.js';
import { webQueryFor } from '../src/modules/food/menu-nutrition.service.js';

interface GoldenRow {
  name: string;
  expect: string[] | null;
  basis: 'per_serving' | 'per_100g' | 'per_100ml' | 'any' | null;
  restaurants?: number;
  note?: string;
  reviewed?: string;
}

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const GOLDEN = opt('golden', 'golden/menu-nutrition.golden.json');
const SHOW = Number(opt('show', '40'));

const prisma = new PrismaClient();
const pct = (n: number, d: number): string => (d === 0 ? '-' : `${((n / d) * 100).toFixed(1)}%`);
const pad = (s: string, w: number): string => (s.length >= w ? s : s + ' '.repeat(w - s.length));

interface Verdict {
  tier: string | null;
  foodName: string | null;
  basis: string | null;
  kcal: number | null;
}

const main = async (): Promise<void> => {
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf-8')) as GoldenRow[];
  const names = golden.map((g) => g.name);

  const resolver = new MenuNutritionResolver(prisma);
  const rules = await resolver.resolveMany(names);
  const unresolved = names.filter((n) => {
    const r = rules.get(n)!;
    return !r.basis && r.reason !== 'set' && r.reason !== 'empty';
  });
  const llm = new MenuLlmMatchService(prisma, new AiConfigService(prisma, buildLlmProviderEnv()), { model: env.OLLAMA_MENU_MATCH_MODEL });
  const web = new FoodWebEstimateService(prisma, {});
  const llmMap = await llm.lookupCached(unresolved);
  const queries = new Map<string, string>();
  for (const n of unresolved) {
    const m = llmMap.get(n);
    if (m && !m.hit) {
      const q = webQueryFor(n, m.canonical);
      if (q) queries.set(n, q);
    }
  }
  const webMap = await web.lookupCached([...new Set(queries.values())]);

  const verdictOf = (n: string): Verdict => {
    const r = rules.get(n)!;
    if (r.basis) return { tier: r.matchedBy, foodName: r.foodName, basis: r.basis, kcal: r.kcal };
    const m = llmMap.get(n);
    if (m?.hit && m.hit.kcalPer100g !== null) return { tier: 'llm', foodName: m.hit.foodName, basis: 'per_100g', kcal: Math.round(m.hit.kcalPer100g) };
    const q = queries.get(n);
    const w = q ? webMap.get(q) : undefined;
    if (w) return { tier: 'web', foodName: q!, basis: 'per_100g', kcal: w.kcalPer100g };
    return { tier: null, foodName: null, basis: null, kcal: null };
  };

  type Outcome = 'correct' | 'wrong_food' | 'wrong_basis' | 'false_positive' | 'missed';
  const rows: { g: GoldenRow; v: Verdict; outcome: Outcome }[] = [];
  for (const g of golden) {
    const v = verdictOf(g.name);
    let outcome: Outcome;
    if (!g.expect) outcome = v.tier ? 'false_positive' : 'correct';
    else if (!v.tier) outcome = 'missed';
    else if (!g.expect.some((e) => normalizeTerm(e) === normalizeTerm(v.foodName ?? ''))) outcome = 'wrong_food';
    else if (g.basis && g.basis !== 'any' && g.basis !== v.basis) outcome = 'wrong_basis';
    else outcome = 'correct';
    rows.push({ g, v, outcome });
  }

  // 계층별 정밀도 — 표시한 것(tier 있음) 중 정답 비율. 미표시(null) 정답은 'none' 계층으로.
  const tiers = ['exact', 'alias', 'synonym', 'modifier', 'variant', 'hint', 'suffix', 'llm', 'web'];
  console.log(`golden ${golden.length}건 (정답 미표시 ${golden.filter((g) => !g.expect).length})`);
  console.log('');
  console.log(pad('tier', 10) + pad('shown', 7) + pad('correct', 9) + pad('wrong_food', 12) + pad('wrong_basis', 13) + pad('false_pos', 11) + 'precision');
  let totalShown = 0;
  let totalCorrect = 0;
  for (const t of tiers) {
    const rs = rows.filter((r) => r.v.tier === t);
    if (rs.length === 0) continue;
    const c = rs.filter((r) => r.outcome === 'correct').length;
    const wf = rs.filter((r) => r.outcome === 'wrong_food').length;
    const wb = rs.filter((r) => r.outcome === 'wrong_basis').length;
    const fp = rs.filter((r) => r.outcome === 'false_positive').length;
    totalShown += rs.length;
    totalCorrect += c;
    console.log(pad(t, 10) + pad(String(rs.length), 7) + pad(String(c), 9) + pad(String(wf), 12) + pad(String(wb), 13) + pad(String(fp), 11) + pct(c, rs.length));
  }
  const missed = rows.filter((r) => r.outcome === 'missed');
  const expectShown = rows.filter((r) => r.g.expect).length;
  console.log(pad('전체', 10) + pad(String(totalShown), 7) + pad(String(totalCorrect), 9) + ' '.repeat(36) + pct(totalCorrect, totalShown));
  console.log('');
  console.log(`재현율(정답 있는 ${expectShown}건 중 맞게 표시): ${pct(rows.filter((r) => r.g.expect && r.outcome === 'correct').length, expectShown)} · 놓침 ${missed.length}`);

  const list = (title: string, rs: typeof rows): void => {
    if (rs.length === 0) return;
    console.log('');
    console.log(`── ${title} (${rs.length}) ──`);
    for (const r of rs.slice(0, SHOW)) {
      const got = r.v.tier ? `${r.v.foodName} [${r.v.tier}] ${r.v.kcal} ${r.v.basis}` : '(미표시)';
      const want = r.g.expect ? `${r.g.expect.join('|')}${r.g.basis && r.g.basis !== 'any' ? ` ${r.g.basis}` : ''}` : '(미표시)';
      console.log(`  ${r.g.name} → ${got}  ⟂ 기대 ${want}${r.g.note ? `  # ${r.g.note}` : ''}`);
    }
  };
  list('오답: 다른 음식', rows.filter((r) => r.outcome === 'wrong_food'));
  list('오답: 등급', rows.filter((r) => r.outcome === 'wrong_basis'));
  list('오답: 미표시가 정답인데 표시', rows.filter((r) => r.outcome === 'false_positive'));
  list('놓침', missed);
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
