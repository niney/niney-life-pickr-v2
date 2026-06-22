import { env } from '../../src/config/env.js';

// ── 모델 티어 게이트 — 작은 모델이 "실제로" 더 빠른가? ─────────────────────────
// 레버 A(리랭크·검증 같은 기계적 단계를 작은 모델로) 검증의 1단계 게이트.
// probe-latency 에서 ollama-cloud 지연이 큐/쓰로틀일 수 있다고 관측됨 → 모델 크기가
// 정말 지연을 가르는지 먼저 직접 잰다. 리랭크급(후보 30개) 실제 프롬프트로,
// 120b/20b 를 "인터리브"(번갈아) 호출해 쓰로틀 편향을 양쪽에 똑같이 준다.
// 실행: cd apps/friendly && pnpm exec tsx --env-file=.env research/review-search/probe-model-tier.ts

const BASE = env.OLLAMA_CLOUD_BASE_URL;
const KEY = env.OLLAMA_CLOUD_API_KEY;
const ROUNDS = Math.max(1, Number(process.env.TIER_ROUNDS || 4));
const CANDIDATES = (process.env.TIER_MODELS || 'gpt-oss:120b,gpt-oss:20b').split(',').map((s) => s.trim());

const now = () => Date.now();
const avg = (xs: number[]): number => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
const min = (xs: number[]): number => (xs.length ? Math.min(...xs) : 0);

// 리랭크 단계가 보내는 것과 같은 모양의 프롬프트(후보 30개 × 짧은 본문).
const buildRerankPrompt = (): string => {
  const fake = Array.from({ length: 30 }, (_, i) => `${i + 1}. 리뷰 본문 예시 ${i + 1} — 맛과 분위기, 주차, 가격에 대한 짧은 평.`).join('\n');
  return `질의: "주차 돼요?"\n\n아래 리뷰 중 질의 "의도"에 실제로 부합하는 것을 관련도 높은 순으로 최대 6개 번호만 골라라. 없으면 빈 배열.\n\n리뷰:\n${fake}`;
};

const chat = async (model: string, prompt: string): Promise<{ ok: boolean; ms: number; len: number }> => {
  const t = now();
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [{ role: 'user', content: prompt }],
        format: { type: 'object', properties: { ranking: { type: 'array', items: { type: 'number' } } }, required: ['ranking'] },
      }),
    });
    const json = (await res.json().catch(() => null)) as { message?: { content?: string } } | null;
    return { ok: res.ok, ms: now() - t, len: (json?.message?.content ?? '').length };
  } catch {
    return { ok: false, ms: now() - t, len: 0 };
  }
};

const main = async (): Promise<void> => {
  // 1) 사용 가능 모델.
  const tags = await fetch(`${BASE}/api/tags`, { headers: { Authorization: `Bearer ${KEY}` } })
    .then((r) => r.json())
    .catch(() => null) as { models?: Array<{ name?: string; model?: string }> } | null;
  const names = (tags?.models ?? []).map((m) => m.name || m.model).filter(Boolean) as string[];
  console.log('[사용 가능 모델]', names.length ? names.join(', ') : '(목록 조회 실패 — 그래도 지연 A/B 진행)');
  for (const c of CANDIDATES) {
    const has = names.some((n) => n === c || n.startsWith(`${c}`));
    console.log(`  ${c}: ${names.length ? (has ? '있음' : '없음(호출은 시도)') : '확인불가'}`);
  }

  // 2) 인터리브 지연 A/B.
  const prompt = buildRerankPrompt();
  const lat: Record<string, number[]> = Object.fromEntries(CANDIDATES.map((c) => [c, []]));
  const okc: Record<string, number> = Object.fromEntries(CANDIDATES.map((c) => [c, 0]));
  console.log(`\n[리랭크급 프롬프트 지연 — 인터리브 ${ROUNDS}라운드]`);
  for (let i = 0; i < ROUNDS; i += 1) {
    for (const c of CANDIDATES) {
      const r = await chat(c, prompt);
      lat[c]!.push(r.ms);
      if (r.ok) okc[c]! += 1;
      console.log(`  r${i + 1} ${c.padEnd(14)} ${String(r.ms).padStart(6)} ms ${r.ok ? '' : '(실패)'}`);
    }
  }

  console.log('\n[요약]  모델            평균ms   최소ms   성공');
  for (const c of CANDIDATES) {
    console.log(`  ${c.padEnd(16)} ${String(avg(lat[c]!)).padStart(6)} ${String(min(lat[c]!)).padStart(8)}   ${okc[c]}/${ROUNDS}`);
  }
  const [big, small] = CANDIDATES;
  if (big && small && lat[big]!.length && lat[small]!.length) {
    const sp = avg(lat[big]!) / Math.max(1, avg(lat[small]!));
    console.log(
      `\n결론(게이트): ${small} 가 ${big} 대비 평균 ${sp.toFixed(2)}× ${sp >= 1.5 ? '빠름 → 레버 A 품질 검증 가치 있음.' : sp >= 1.15 ? '약간 빠름 → 한계 효용, 품질 검증해볼 만.' : '비슷/안 빠름 → 큐/쓰로틀 지배 → 레버 A 기각.'}`,
    );
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
