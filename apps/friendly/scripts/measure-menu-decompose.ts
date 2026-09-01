// 세트 LLM 분해 골든셋 정밀도 — 구성이 이름에 없는 세트를 LLM 이 어떻게 나누는지 잰다.
//
// 실행: pnpm --filter friendly measure:menu-decompose [--golden=golden/menu-decompose.golden.json] [--ask]
//   - 골든셋: { name, allow: 허용 구성명[] | null(분해하지 않는 게 정답), min: 최소 구성 수 }.
//     예측이 allow 의 부분집합이고 min 개 이상이면 정답. allow 가 null 인데 예측이 있으면 오답(지어냄).
//   - 캐시(menu_llm_decompositions)만 읽는다. --ask 를 주면 캐시에 없는 이름을 LLM 에 묻는다.
//   - 척도는 정밀도다: 분해한 것 중 맞은 비율. 지어낸 구성(false_positive)은 없어야 한다.

import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { normalizeTerm } from '../src/lib/text.js';
import { env } from '../src/config/env.js';
import { AiConfigService } from '../src/modules/ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../src/modules/ai/llm-provider-env.js';
import { MenuLlmDecomposeService } from '../src/modules/food/menu-llm-decompose.service.js';

interface GoldenRow {
  name: string;
  allow: string[] | null;
  min?: number;
  note?: string;
}

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const GOLDEN = opt('golden', 'golden/menu-decompose.golden.json');
const ASK = args.includes('--ask');
const prisma = new PrismaClient();
const pct = (n: number, d: number): string => (d === 0 ? '-' : `${((n / d) * 100).toFixed(1)}%`);

const main = async (): Promise<void> => {
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf-8')) as GoldenRow[];
  const names = golden.map((g) => g.name);
  const svc = new MenuLlmDecomposeService(prisma, new AiConfigService(prisma, buildLlmProviderEnv()), { model: env.OLLAMA_MENU_MATCH_MODEL });
  const cached = await svc.lookupCached(names);
  const missing = names.filter((n) => !cached.has(n));
  if (ASK && missing.length > 0) {
    const fresh = await svc.decomposeMany(missing);
    for (const [k, v] of fresh) cached.set(k, v);
  }

  type Outcome = 'correct' | 'wrong' | 'invented' | 'missed' | 'unasked';
  const rows: { g: GoldenRow; got: string[] | null | undefined; outcome: Outcome; why?: string }[] = [];
  for (const g of golden) {
    if (!cached.has(g.name)) {
      rows.push({ g, got: undefined, outcome: 'unasked' });
      continue;
    }
    const got = cached.get(g.name)!;
    if (!g.allow) {
      rows.push({ g, got, outcome: got ? 'invented' : 'correct' });
      continue;
    }
    if (!got) {
      rows.push({ g, got, outcome: 'missed' });
      continue;
    }
    const allow = new Set(g.allow.map(normalizeTerm));
    const bad = got.filter((p) => !allow.has(normalizeTerm(p)));
    if (bad.length > 0) rows.push({ g, got, outcome: 'wrong', why: `허용 밖: ${bad.join(', ')}` });
    else if (got.length < (g.min ?? 1)) rows.push({ g, got, outcome: 'wrong', why: `구성 ${got.length}개 < ${g.min}` });
    else rows.push({ g, got, outcome: 'correct' });
  }

  const count = (o: Outcome): number => rows.filter((r) => r.outcome === o).length;
  const decomposed = rows.filter((r) => r.got && r.outcome !== 'unasked');
  const precision = decomposed.filter((r) => r.outcome === 'correct').length;
  const expectSome = rows.filter((r) => r.g.allow && r.outcome !== 'unasked');
  console.log(`golden ${golden.length}건 (분해 정답 ${golden.filter((g) => g.allow).length} · 미분해 정답 ${golden.filter((g) => !g.allow).length}) · 미조회 ${count('unasked')}${missing.length && !ASK ? ' (--ask 로 조회)' : ''}`);
  console.log(`분해 정밀도: ${precision}/${decomposed.length} (${pct(precision, decomposed.length)}) · 지어냄 ${count('invented')} · 잘못 나눔 ${count('wrong')}`);
  console.log(`분해 재현율: ${expectSome.filter((r) => r.outcome === 'correct').length}/${expectSome.length} (${pct(expectSome.filter((r) => r.outcome === 'correct').length, expectSome.length)}) · 놓침 ${count('missed')}`);
  for (const o of ['invented', 'wrong', 'missed'] as const) {
    const rs = rows.filter((r) => r.outcome === o);
    if (rs.length === 0) continue;
    console.log('');
    console.log(`── ${o === 'invented' ? '지어냄(미분해가 정답)' : o === 'wrong' ? '잘못 나눔' : '놓침'} (${rs.length}) ──`);
    for (const r of rs) console.log(`  ${r.g.name} → ${r.got ? r.got.join(', ') : '(미분해)'}${r.why ? `  # ${r.why}` : ''}${r.g.note ? `  (${r.g.note})` : ''}`);
  }
  console.log('');
  console.log('── 전체 ──');
  for (const r of rows) console.log(`  [${r.outcome}] ${r.g.name} → ${r.got === undefined ? '(미조회)' : r.got ? r.got.join(', ') : '(미분해)'}`);
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
