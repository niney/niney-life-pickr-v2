// 메뉴명 → 카탈로그 음식 연결을 LLM 에게 맡길 때 모델별 정확도·속도 프로브.
//
// 규칙 매칭(menu-nutrition.ts)이 못 잡은 메뉴명에 대해, 카탈로그에서 뽑은 후보 목록을 주고
// "같은 음식이거나 100g당 칼로리를 대신 써도 되는 것 하나 또는 none" 을 고르게 한다(제약 선택 —
// 후보 밖 이름을 만들면 환각으로 센다). 골든셋(사람이 붙인 정답)과 비교해 모델을 고른다.
//
// 실행:
//   1) 후보 덤프(라벨링용):
//      pnpm --filter friendly probe:menu-decompose --from=<measure.json> --dump-candidates=<out.json>
//   2) 모델 비교:
//      pnpm --filter friendly probe:menu-decompose --golden=<golden.json> --models=gpt-oss:20b,gemma4:31b [--concurrency=6]
//   golden.json: { "<메뉴명>": "<카탈로그 음식명>" | ["<정답1>", "<정답2>"] | null, … }
//   — 같은 음식으로 볼 수 있는 카탈로그 이름이 여럿이면 배열(짜장면/간자장/자장면).

import { readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { thinkOptionForModel } from '@repo/utils';
import { AiConfigService } from '../src/modules/ai/ai.config.service.js';
import { adapterCache } from '../src/modules/ai/adapter-cache.js';
import type { LLMProvider } from '../src/modules/ai/adapters/llm-provider.js';
import { buildLlmProviderEnv } from '../src/modules/ai/llm-provider-env.js';
import { extractFirstJsonObject } from '../src/lib/json.js';
import { normalizeTerm } from '../src/lib/text.js';
import { synonymVariants } from '../src/modules/food/menu-nutrition.js';
import { pickMenuCandidates } from '../src/modules/food/menu-nutrition-candidates.js';

const args = process.argv.slice(2);
const opt = (name: string): string | null => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const FROM = opt('from');
const DUMP = opt('dump-candidates');
const GOLDEN = opt('golden');
const MODELS = (opt('models') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const CONCURRENCY = Number(opt('concurrency') ?? '6') || 6;
const CANDIDATES = 15;
const TIMEOUT_MS = 60_000;

const prisma = new PrismaClient();

interface CatalogRow {
  name: string;
  nameNorm: string;
  kcal: number | null;
  kcalPer100g: number | null;
  aliasNormsJson: string;
}

const SYSTEM_PROMPT = `너는 한국 식당 메뉴명을 식약처 영양성분 카탈로그의 음식에 연결하는 매칭기다.
메뉴명과 후보 목록을 주면, 후보 중 **같은 음식**이거나 **주재료와 조리법이 같아 100g당 칼로리를 대신 써도 되는** 음식 하나를 고른다.
- 주재료나 조리법이 다르면 고르지 말고 null (예: 볶음밥↔볶음, 튀김↔구이, 치킨↔치킨가스, 파스타↔볶음면).
- 브랜드·수식어·매운맛·토핑 차이는 무시해도 된다 (예: "명란 계란말이" → 달걀말이).
- 후보 밖의 이름을 만들지 마라. 후보 문자열을 글자 그대로 쓴다.
- 술·음료·소스·추가 옵션은 후보에 같은 것이 있을 때만 고른다.
- 별도로 "canonical" 에는 후보와 무관하게 이 메뉴의 **가장 일반적인 한국어 표준 음식명**을 적는다
  (예: 부타동→돼지고기덮밥, 스부타→탕수육, 보쌈→수육, 후라이드치킨→닭튀김, 까르보나라→스파게티).
  브랜드·수식어·중량을 뺀 짧은 이름 하나. 음식이 아니거나 모르면 null.
JSON 만 출력: {"choice": "<후보 문자열>" 또는 null, "canonical": "<표준 음식명>" 또는 null, "confidence": "high"|"medium"|"low", "reason": "<20자 이내>"}`;

const JSON_SCHEMA = {
  type: 'object',
  properties: {
    choice: { type: ['string', 'null'] },
    canonical: { type: ['string', 'null'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reason: { type: 'string' },
  },
  required: ['choice', 'confidence'],
} as const;

const buildPrompt = (menu: string, candidates: string[]): string =>
  `메뉴명: ${menu}\n후보:\n${candidates.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nJSON 으로만 답하라.`;

const pickCandidates = (menu: string, catalog: CatalogRow[]): string[] =>
  pickMenuCandidates(menu, catalog, CANDIDATES).map((r) => r.name);

const loadCatalog = async (): Promise<CatalogRow[]> =>
  prisma.foodItem.findMany({
    where: { active: true },
    select: { name: true, nameNorm: true, kcal: true, kcalPer100g: true, aliasNormsJson: true },
  });

const percentile = (xs: number[], p: number): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))]!;
};

interface Verdict {
  menu: string;
  label: string[] | null;
  choice: string | null;
  canonical: string | null;
  // canonical 이 카탈로그 이름/별칭과 정확히 맞으면 그 카탈로그 이름.
  canonicalHit: string | null;
  confidence: string | null;
  reason: string | null;
  ms: number;
  outcome: 'correct' | 'correct_canonical' | 'missed' | 'wrong_pick' | 'mismatch' | 'hallucinated' | 'parse_failed' | 'error';
  error?: string;
}

const judge = (
  label: string[] | null,
  choice: string | null,
  canonicalHit: string | null,
  candidates: string[],
): Verdict['outcome'] => {
  if (choice !== null && !candidates.includes(choice)) return 'hallucinated';
  if (label === null && choice === null) return 'correct';
  if (label === null) return 'wrong_pick';
  const norms = label.map(normalizeTerm);
  if (choice !== null && norms.includes(normalizeTerm(choice))) return 'correct';
  // 후보 선택이 틀렸거나 없어도 자유형 표준명이 카탈로그의 정답을 맞히면 인정(2차 경로).
  if (canonicalHit !== null && norms.includes(normalizeTerm(canonicalHit))) return 'correct_canonical';
  return choice === null ? 'missed' : 'mismatch';
};

const runModel = async (
  provider: LLMProvider,
  model: string,
  cases: { menu: string; label: string[] | null; candidates: string[] }[],
  lookupCanonical: (name: string) => string | null,
): Promise<Verdict[]> => {
  const out: Verdict[] = [];
  let next = 0;
  const worker = async () => {
    while (next < cases.length) {
      const c = cases[next++]!;
      const started = Date.now();
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
      try {
        const res = await provider.complete({
          prompt: buildPrompt(c.menu, c.candidates),
          systemPrompt: SYSTEM_PROMPT,
          model,
          temperature: 0,
          maxTokens: 300,
          numCtx: 4096,
          format: JSON_SCHEMA as unknown as Record<string, unknown>,
          think: thinkOptionForModel(model),
          signal: ac.signal,
        });
        const ms = Date.now() - started;
        const raw = extractFirstJsonObject(res.text) ?? res.text.trim();
        let parsed: { choice?: unknown; canonical?: unknown; confidence?: unknown; reason?: unknown } | null = null;
        try {
          parsed = JSON.parse(raw) as typeof parsed;
        } catch {
          parsed = null;
        }
        if (!parsed || typeof parsed !== 'object') {
          out.push({ menu: c.menu, label: c.label, choice: null, canonical: null, canonicalHit: null, confidence: null, reason: null, ms, outcome: 'parse_failed', error: res.text.slice(0, 120) });
          continue;
        }
        const choice = typeof parsed.choice === 'string' && parsed.choice.trim() && parsed.choice !== 'null' ? parsed.choice.trim() : null;
        const canonical = typeof parsed.canonical === 'string' && parsed.canonical.trim() && parsed.canonical !== 'null' ? parsed.canonical.trim() : null;
        const canonicalHit = canonical ? lookupCanonical(canonical) : null;
        out.push({
          menu: c.menu,
          label: c.label,
          choice,
          canonical,
          canonicalHit,
          confidence: typeof parsed.confidence === 'string' ? parsed.confidence : null,
          reason: typeof parsed.reason === 'string' ? parsed.reason : null,
          ms,
          outcome: judge(c.label, choice, canonicalHit, c.candidates),
        });
      } catch (e) {
        out.push({ menu: c.menu, label: c.label, choice: null, canonical: null, canonicalHit: null, confidence: null, reason: null, ms: Date.now() - started, outcome: 'error', error: e instanceof Error ? e.message : String(e) });
      } finally {
        clearTimeout(timer);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out;
};

const pad = (s: string, w: number): string => (s.length >= w ? s : s + ' '.repeat(w - s.length));

const main = async () => {
  const catalog = await loadCatalog();
  console.log(`catalog active=${catalog.length}`);

  if (DUMP) {
    if (!FROM) throw new Error('--from=<measure.json> 필요');
    const measured = JSON.parse(readFileSync(FROM, 'utf-8')) as { name: string; reason: string }[];
    const names = measured.filter((r) => r.reason === 'no_match' || r.reason === 'fuzzy_rejected').map((r) => r.name);
    const dump = names.map((menu) => ({ menu, candidates: pickCandidates(menu, catalog) }));
    writeFileSync(DUMP, JSON.stringify(dump, null, 2), 'utf-8');
    console.log(`wrote ${DUMP} (${dump.length} menus)`);
    return;
  }

  if (!GOLDEN) throw new Error('--golden=<golden.json> 또는 --dump-candidates 필요');
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf-8')) as Record<string, string | string[] | null>;
  const catalogNames = new Set(catalog.map((c) => c.name));
  const cases = Object.entries(golden).map(([menu, raw]) => {
    const label = raw === null ? null : Array.isArray(raw) ? raw : [raw];
    for (const l of label ?? []) {
      if (!catalogNames.has(l)) throw new Error(`골든 라벨이 카탈로그에 없다: ${menu} → ${l}`);
    }
    const candidates = pickCandidates(menu, catalog);
    // 정답이 후보에 없으면 후보 선택으로는 맞힐 수 없다 — 후보 생성기 한계로 따로 센다.
    return { menu, label, candidates, labelInCandidates: label === null || label.some((l) => candidates.includes(l)) };
  });
  const reachable = cases.filter((c) => c.labelInCandidates);
  console.log(`golden ${cases.length}건 (정답 후보 포함 ${reachable.length}, 후보 누락 ${cases.length - reachable.length} — 자유형 표준명으로만 도달 가능)`);
  // 자유형 표준명 → 카탈로그(이름·별칭 정규화 정확 일치).
  const byNorm = new Map<string, string>();
  for (const row of catalog) {
    byNorm.set(row.nameNorm, row.name);
    try {
      for (const a of JSON.parse(row.aliasNormsJson) as string[]) if (!byNorm.has(a)) byNorm.set(a, row.name);
    } catch {
      // 별칭 JSON 손상은 무시
    }
  }
  const lookupCanonical = (name: string): string | null => {
    const n = normalizeTerm(name);
    if (byNorm.has(n)) return byNorm.get(n)!;
    for (const v of synonymVariants(n)) if (byNorm.has(v)) return byNorm.get(v)!;
    return null;
  };
  for (const c of cases.filter((x) => !x.labelInCandidates)) console.log(`  후보 누락: ${c.menu} → ${c.label?.join('/')}`);

  const aiConfig = new AiConfigService(prisma, buildLlmProviderEnv());
  const resolved = await aiConfig.getResolved('ollama-cloud', 'chat');
  if (!resolved) throw new Error('ollama-cloud chat provider 미설정');
  const provider = adapterCache.get(resolved);
  const models = MODELS.length > 0 ? MODELS : [resolved.defaultModel].filter(Boolean);
  console.log(`모델: ${models.join(', ')} · 동시성 ${CONCURRENCY}\n`);

  const rows: { model: string; verdicts: Verdict[] }[] = [];
  for (const model of models) {
    const started = Date.now();
    const verdicts = await runModel(provider, model, cases, lookupCanonical);
    rows.push({ model, verdicts });
    const count = (o: Verdict['outcome']) => verdicts.filter((v) => v.outcome === o).length;
    const ms = verdicts.map((v) => v.ms);
    const ok = count('correct') + count('correct_canonical');
    const byConf = ['high', 'medium', 'low'].map((c) => { const vs = verdicts.filter((v) => v.confidence === c && v.choice !== null); const good = vs.filter((v) => v.outcome === 'correct').length; return `${c}:${good}/${vs.length}`; }).join(' ');
    console.log(
      `${pad(model, 24)} 정답 ${ok}/${verdicts.length} (${((ok / verdicts.length) * 100).toFixed(0)}%) [후보선택 ${count('correct')} + 표준명 ${count('correct_canonical')}]` +
        ` · 놓침 ${count('missed')} · 오선택 ${count('wrong_pick')} · 다른선택 ${count('mismatch')} · 환각 ${count('hallucinated')}` +
        ` · 파싱실패 ${count('parse_failed')} · 오류 ${count('error')} · 선택 정확도(신뢰도별) ${byConf} · p50 ${percentile(ms, 0.5)}ms p95 ${percentile(ms, 0.95)}ms · 총 ${((Date.now() - started) / 1000).toFixed(0)}s`,
    );
  }

  console.log('\n── 모델별 틀린 항목 ──');
  for (const { model, verdicts } of rows) {
    const bad = verdicts.filter((v) => v.outcome !== 'correct' && v.outcome !== 'correct_canonical');
    if (bad.length === 0) continue;
    console.log(`[${model}]`);
    for (const v of bad) {
      console.log(`  ${v.outcome.padEnd(12)} [${v.confidence ?? "-"}] ${v.menu} → ${v.choice ?? 'null'} / 표준명 ${v.canonical ?? 'null'}${v.canonicalHit ? `(=${v.canonicalHit})` : ''} (정답 ${v.label?.join('/') ?? 'null'})${v.reason ? ` · ${v.reason}` : ''}${v.error ? ` · ${v.error.slice(0, 80)}` : ''}`);
    }
  }
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
