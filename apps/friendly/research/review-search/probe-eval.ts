import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { env } from '../../src/config/env.js';
import { AiConfigService, type LlmProviderEnv } from '../../src/modules/ai/ai.config.service.js';
import { ReviewSearchService, type SearchMode } from '../../src/modules/review-search/review-search.service.js';

// review-search 정확도 평가 하니스 — 무라벨.
//  A) 검색 지표: enrich 로 뽑은 aspects 를 약식 정답으로 recall@k·precision@k·극성순도 (dense/hybrid/rerank 비교)
//  B) RAG: 가드레일 on/off A/B 를 여러 라운드 평균 → 검증 패스가 faithfulness 를 올리는지 측정
//  C) known-answer 회귀(데이터에 없는 질문 → confidence none)
// 실행: pnpm --filter friendly probe:eval   (라운드 수: EVAL_ROUNDS, 기본 2)
// 판정자(EVAL_JUDGE): 'claude'(기본) = Claude Code 헤드리스 `claude -p`(독립·강함, API 키 불필요)
//                     'ollama' = Ollama chat(OLLAMA_JUDGE_MODEL|chat default — 생성기와 동일계열 self-bias)

const execFileAsync = promisify(execFile);

const K = 10;
const ROUNDS = Math.max(1, Number(process.env.EVAL_ROUNDS || 2));

const buildEnvBlock = (): LlmProviderEnv => ({
  apiKey: env.OLLAMA_CLOUD_API_KEY,
  baseUrl: env.OLLAMA_CLOUD_BASE_URL,
  timeoutMs: env.OLLAMA_CLOUD_TIMEOUT_MS,
  maxConcurrent: env.OLLAMA_CLOUD_MAX_CONCURRENT,
  defaultModels: {
    chat: env.OLLAMA_DEFAULT_MODEL,
    image: env.OLLAMA_IMAGE_MODEL,
    'log-analysis': env.OLLAMA_LOG_ANALYSIS_MODEL,
  },
});

// (질의, 관점, 극성) — 관점/극성으로 "관련 리뷰"를 aspects 라벨에서 자동 유도.
const RETRIEVAL_QUERIES: Array<{ q: string; aspect: string; polarity: 'pos' | 'neg' | null }> = [
  { q: '주차', aspect: '주차', polarity: null },
  { q: '맛없다', aspect: '맛', polarity: 'neg' },
  { q: '맛있다', aspect: '맛', polarity: 'pos' },
  { q: '양이 적다', aspect: '양', polarity: 'neg' },
  { q: '웨이팅 길다', aspect: '웨이팅', polarity: 'neg' },
  { q: '서비스 친절', aspect: '서비스', polarity: 'pos' },
  { q: '가격 비싸다', aspect: '가격', polarity: 'neg' },
  { q: '분위기 좋다', aspect: '분위기', polarity: 'pos' },
  { q: '재방문 의사', aspect: '재방문', polarity: 'pos' },
];

const RAG_QUESTIONS = [
  '맛없다는 사람도 있어?',
  '양은 충분해?',
  '주차 되나요?',
  '웨이팅 긴가요?',
  '가격대는 어때?',
  '서비스는 친절해?',
];
// 데이터에 거의 확실히 없는 질문 → confidence 'none' 기대(환각 안 하는지).
const KNOWN_NONE = ['발렛파킹 있어?', '비건 메뉴 있나요?'];

const judgeModel = process.env.OLLAMA_JUDGE_MODEL?.trim();
const judgeKind = (process.env.EVAL_JUDGE?.trim() || 'claude').toLowerCase();
// EVAL_SECTION: 'A'=검색 지표만(claude 비용 0), 'B'=RAG만, 그 외=전체.
const section = (process.env.EVAL_SECTION?.trim() || 'all').toUpperCase();

interface Verdict {
  faithful: boolean;
  relevant: boolean;
  reason: string;
}
type JudgeFn = (question: string, answer: string, citations: string[]) => Promise<Verdict>;

const pct = (hit: number, n: number): string => (n ? `${((hit / n) * 100).toFixed(0)}%` : '–') + ` (${hit}/${n})`;

const main = async (): Promise<void> => {
  const prisma = new PrismaClient();
  const aiConfig = new AiConfigService(prisma, buildEnvBlock());
  const service = new ReviewSearchService(prisma, aiConfig);
  const resolved = await aiConfig.getResolved('ollama-cloud', 'chat');

  const target = await prisma.restaurant.findFirst({
    where: { name: { contains: '조연탄' }, visitorReviews: { some: {} } },
    select: { id: true, name: true },
  });
  if (!target || !resolved) {
    console.log('조연탄 없음 또는 chat provider 미설정');
    await prisma.$disconnect();
    return;
  }
  await service.ensureEnriched(target.id);

  // 판정자 선택 — 기본 Claude Code 헤드리스(독립), EVAL_JUDGE=ollama 면 Ollama.
  let judge: JudgeFn;
  let judgeLabel: string;
  if (judgeKind === 'ollama') {
    const ollamaJudgeModel = judgeModel || resolved.defaultModel || '';
    judge = makeOllamaJudge(resolved.baseUrl, resolved.apiKey, ollamaJudgeModel);
    judgeLabel = `ollama ${ollamaJudgeModel}${judgeModel ? '' : ' (생성기와 동일 — self-bias)'}`;
  } else {
    judge = makeClaudeCliJudge();
    judgeLabel = 'claude -p 헤드리스 (독립 판정자, 키 불필요)';
  }
  console.log(`대상: ${target.name} · 라운드: ${ROUNDS} · 판정자: ${judgeLabel}\n`);

  // reviewId → aspects 라벨 맵.
  const rows = await prisma.reviewSummary.findMany({
    where: { review: { restaurantId: target.id }, aspectsJson: { not: null } },
    select: { reviewId: true, aspectsJson: true },
  });
  const aspectsOf = new Map<string, Record<string, string>>();
  for (const r of rows) {
    try {
      aspectsOf.set(r.reviewId, JSON.parse(r.aspectsJson ?? '{}'));
    } catch {
      aspectsOf.set(r.reviewId, {});
    }
  }

  // ── A. 검색 지표 ── (EVAL_SECTION=B 면 skip — claude 비용 없는 retrieval 전용 실행 가능)
  if (section !== 'B') {
    console.log('══ A. 검색 지표 (정답=aspects 라벨, k=' + K + ') ══');
    console.log('질의               모드     recall  prec  극성순도');
    const modes: SearchMode[] = ['dense', 'hybrid', 'rerank'];
    for (const { q, aspect, polarity } of RETRIEVAL_QUERIES) {
      const relevant = new Set(
        [...aspectsOf.entries()]
          .filter(([, a]) => (polarity ? a[aspect] === polarity : a[aspect] !== undefined))
          .map(([id]) => id),
      );
      for (const mode of modes) {
        const hits = await service.search(target.id, q, K, mode);
        const ids = hits.map((h) => h.reviewId);
        const hitRel = ids.filter((id) => relevant.has(id)).length;
        const recall = relevant.size ? hitRel / Math.min(relevant.size, K) : 0;
        const prec = hitRel / Math.max(ids.length, 1);
        const purity = polarity
          ? ids.filter((id) => aspectsOf.get(id)?.[aspect] === polarity).length / Math.max(ids.length, 1)
          : 1;
        console.log(
          `${q.padEnd(16)} ${mode.padEnd(8)} ${(recall * 100).toFixed(0).padStart(5)}% ${(prec * 100).toFixed(0).padStart(4)}% ${(purity * 100).toFixed(0).padStart(7)}%  (관련 ${relevant.size})`,
        );
      }
    }
  }

  if (section === 'A') {
    await prisma.$disconnect();
    return;
  }

  // ── B. RAG 가드레일 A/B (같은 생성에 verify on/off — 효과 격리, 여러 라운드 평균) ──
  // 같은 raw 생성을 한 번 만들고 verify 만 켜고/끄고 비교 → 생성 분산 제거.
  console.log(`\n══ B. RAG 가드레일 A/B · ${ROUNDS}라운드 (같은 생성 격리; faithful=환각없음 / relevant=질문에답함) ══`);
  const base = { faith: 0, rel: 0, n: 0 };
  const guard = { faith: 0, rel: 0, n: 0 };
  let droppedTotal = 0;
  for (let round = 1; round <= ROUNDS; round += 1) {
    console.log(`── round ${round}/${ROUNDS} ──`);
    for (const q of RAG_QUESTIONS) {
      const raw = await service.ask(target.id, q, { verify: false }); // 단일 생성
      const cites = raw.citations.map((c) => c.body);
      // 가드ON = 같은 생성에 검증 패스만 적용.
      const v = await service.verifyAnswer(q, raw.answer, raw.citations);
      const onAnswer =
        v && v.dropped.length > 0 ? v.answer || '근거 리뷰에서 확인된 내용이 없습니다.' : raw.answer;
      const dropped = v?.dropped.length ?? 0;

      const vOff = await judge(q, raw.answer, cites);
      const vOn = await judge(q, onAnswer, cites);
      base.faith += vOff.faithful ? 1 : 0;
      base.rel += vOff.relevant ? 1 : 0;
      base.n += 1;
      guard.faith += vOn.faithful ? 1 : 0;
      guard.rel += vOn.relevant ? 1 : 0;
      guard.n += 1;
      droppedTotal += dropped;
      console.log(`Q: ${q}`);
      console.log(`   off  faithful=${vOff.faithful} relevant=${vOff.relevant}`);
      console.log(`   on   faithful=${vOn.faithful} relevant=${vOn.relevant}  제거=${dropped}`);
      if (!vOff.faithful) console.log(`     off⚠ ${vOff.reason}`);
      if (!vOn.faithful) console.log(`     on ⚠ ${vOn.reason}`);
    }
  }
  console.log(`\n→ faithfulness  가드OFF ${pct(base.faith, base.n)}  →  가드ON ${pct(guard.faith, guard.n)}`);
  console.log(`→ relevance     가드OFF ${pct(base.rel, base.n)}  →  가드ON ${pct(guard.rel, guard.n)}`);
  console.log(`→ 가드레일이 제거한 미지원 주장 총 ${droppedTotal}건`);

  // ── C. known-answer 회귀 ──
  console.log('\n══ C. known-answer (데이터에 없음 → none 기대) ══');
  for (const q of KNOWN_NONE) {
    const noneAcc: string[] = [];
    for (let round = 1; round <= ROUNDS; round += 1) {
      const r = await service.ask(target.id, q);
      noneAcc.push(r.confidence);
    }
    const ok = noneAcc.every((c) => c === 'none');
    console.log(`"${q}" → [${noneAcc.join(', ')}] ${ok ? '✅' : '⚠ none 아님(환각 위험)'}`);
  }

  await prisma.$disconnect();
};

// ── 판정자 구현 ──

const parseVerdict = (raw: string): Verdict => {
  const c = raw.replace(/```(?:json)?/gi, '').trim();
  const m = c.match(/\{[\s\S]*\}/);
  const p = JSON.parse(m ? m[0] : c) as Partial<Verdict>;
  return { faithful: !!p.faithful, relevant: !!p.relevant, reason: p.reason ?? '' };
};

const judgePrompt = (question: string, answer: string, citations: string[]): string => {
  const ctx = citations.map((c, i) => `[${i + 1}] ${c.slice(0, 200)}`).join('\n');
  return (
    `질문, 답변, 근거리뷰가 주어진다. 엄격히 판정하라.\n` +
    `- faithful: 답변의 모든 내용이 근거리뷰로 뒷받침되는가(근거 밖 내용을 지어내지 않았는가). "정보 없음" 류도 지어내지 않았으면 true.\n` +
    `- relevant: 답변이 질문에 실제로 답하는가.\n\n` +
    `질문: ${question}\n답변: ${answer}\n근거리뷰:\n${ctx}\n\nJSON {"faithful": true|false, "relevant": true|false, "reason": "짧은 이유"}`
  );
};

// 독립 판정자 — Claude Code 헤드리스(`claude -p`). eval 한정, 운영 Ollama 와 별개.
// API 키 불필요(Claude Code 자체 인증). execFile 이라 셸 이스케이프 걱정 없음.
const makeClaudeCliJudge = (): JudgeFn => {
  const system =
    '너는 RAG 답변의 사실성을 엄격히 검증하는 평가자다. 근거리뷰에 없는 내용이 답변에 조금이라도 있으면 faithful=false. JSON 한 줄만 출력하라.';
  return async (question, answer, citations) => {
    try {
      const { stdout } = await execFileAsync(
        'claude',
        ['-p', `${system}\n\n${judgePrompt(question, answer, citations)}`, '--output-format', 'json'],
        { maxBuffer: 10 * 1024 * 1024, timeout: 120_000 },
      );
      const envelope = JSON.parse(stdout) as { result?: string };
      return parseVerdict(envelope.result ?? '');
    } catch (e) {
      return { faithful: false, relevant: false, reason: `claude-cli judge 실패: ${e instanceof Error ? e.message : e}` };
    }
  };
};

// 폴백 판정자 — Ollama chat (생성기와 동일 모델일 수 있어 self-bias 주의).
const makeOllamaJudge = (baseUrl: string, apiKey: string, model: string): JudgeFn => {
  return async (question, answer, citations) => {
    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [{ role: 'user', content: judgePrompt(question, answer, citations) }],
          format: {
            type: 'object',
            properties: { faithful: { type: 'boolean' }, relevant: { type: 'boolean' }, reason: { type: 'string' } },
            required: ['faithful', 'relevant', 'reason'],
          },
        }),
      });
      const json = (await res.json()) as { message?: { content?: string } };
      return parseVerdict(json.message?.content ?? '');
    } catch (e) {
      return { faithful: false, relevant: false, reason: `ollama judge 실패: ${e instanceof Error ? e.message : e}` };
    }
  };
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
