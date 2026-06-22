import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { env } from '../../src/config/env.js';
import { AiConfigService, type LlmProviderEnv } from '../../src/modules/ai/ai.config.service.js';
import { ReviewSearchService } from '../../src/modules/review-search/review-search.service.js';

// ── recall 진단 프로브 ────────────────────────────────────────────────────────
// "회수(recall)가 실제로 답 품질을 깎는가?" 를 검증한다. RAG 는 상위 6건만 읽으므로,
// 데이터에 존재하는 부정 테마를 답이 놓치면 recall 이 병목이라는 증거가 된다.
//
// 방법(순환 아님):
//  1) 완전성 질문("단점 뭐야?")에 현 RAG 로 답을 만든다.
//  2) 레퍼런스 = 해당 식당의 *전수* 부정 리뷰(aspectsJson neg, 회수와 무관).
//  3) Claude(헤드리스, 독립)가 레퍼런스에서 주요 단점 테마를 뽑고 답이 몇 개를 담았는지 판정.
//
// completeness 가 낮으면 → recall 이 진짜 병목 → aspect-fusion 등 회수 개선이
// "완전성 향상"으로 검증 가능해짐. 높으면 → recall 은 지금 병목 아님(top-6 로 충분).
//
// 실행: pnpm --filter friendly probe:completeness   (라운드: EVAL_ROUNDS, 기본 1)
// 판정자: 기본 Claude Code 헤드리스 `claude -p`(키 불필요).

const execFileAsync = promisify(execFile);
const ROUNDS = Math.max(1, Number(process.env.EVAL_ROUNDS || 1));
const REF_CAP = 30; // 레퍼런스로 Claude 에 넘길 부정 리뷰 최대 수(프롬프트 크기 제한)

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

// 부정 의견의 "완전성"이 걸리는 질문들.
const COMPLETENESS_QUERIES = ['이 식당 단점은 뭐야?', '안 좋다는 평가는 어떤 게 있어?'];

interface Verdict {
  themes: string[];
  covered: string[];
  missed: string[];
  completeness: number;
}

const judgeCompleteness = async (
  question: string,
  answer: string,
  refNegReviews: string[],
): Promise<Verdict> => {
  const refs = refNegReviews.slice(0, REF_CAP).map((b, i) => `[${i + 1}] ${b.slice(0, 160)}`).join('\n');
  const prompt =
    `한 식당의 부정적 평가 관련 질문에 대한 RAG 답변과, 그 식당의 *부정 리뷰 전수 목록*(레퍼런스)이 주어진다.\n` +
    `1) 레퍼런스 리뷰들에 실제로 나타난 주요 단점 테마를 뽑아 중복 병합하라(themes).\n` +
    `2) 답변이 그 테마 중 어떤 것을 담았는지(covered)/놓쳤는지(missed) 판정하라.\n` +
    `3) completeness = covered/themes 비율(0~100 정수).\n` +
    `근거 없는 테마를 지어내지 말 것 — 오직 레퍼런스에 있는 것만.\n\n` +
    `질문: ${question}\n답변: ${answer}\n\n레퍼런스 부정 리뷰(${refNegReviews.length}건 중 상위 ${Math.min(REF_CAP, refNegReviews.length)}):\n${refs}\n\n` +
    `JSON {"themes":[...],"covered":[...],"missed":[...],"completeness":0~100} 만 출력.`;
  try {
    const { stdout } = await execFileAsync('claude', ['-p', prompt, '--output-format', 'json'], {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 240_000,
    });
    const envelope = JSON.parse(stdout) as { result?: string };
    const c = (envelope.result ?? '').replace(/```(?:json)?/gi, '').trim();
    const m = c.match(/\{[\s\S]*\}/);
    const p = JSON.parse(m ? m[0] : c) as Partial<Verdict>;
    return {
      themes: p.themes ?? [],
      covered: p.covered ?? [],
      missed: p.missed ?? [],
      completeness: typeof p.completeness === 'number' ? p.completeness : 0,
    };
  } catch (e) {
    console.error('  judge 실패:', e instanceof Error ? e.message : e);
    return { themes: [], covered: [], missed: [], completeness: -1 };
  }
};

const main = async (): Promise<void> => {
  const prisma = new PrismaClient();
  const service = new ReviewSearchService(prisma, new AiConfigService(prisma, buildEnvBlock()));

  const target = await prisma.restaurant.findFirst({
    where: { name: { contains: '조연탄' }, visitorReviews: { some: {} } },
    select: { id: true, name: true },
  });
  if (!target) {
    console.log('조연탄 식당 없음');
    await prisma.$disconnect();
    return;
  }
  await service.ensureEnriched(target.id);

  // 전수 부정 리뷰 레퍼런스 — aspectsJson 에 neg 가 하나라도 있는 리뷰(회수와 무관).
  const rows = await prisma.reviewSummary.findMany({
    where: { review: { restaurantId: target.id }, aspectsJson: { not: null } },
    select: { aspectsJson: true, review: { select: { body: true } } },
  });
  const seen = new Set<string>();
  const refNeg: string[] = [];
  for (const r of rows) {
    let aspects: Record<string, string> = {};
    try {
      aspects = JSON.parse(r.aspectsJson ?? '{}');
    } catch {
      aspects = {};
    }
    if (!Object.values(aspects).includes('neg')) continue;
    const body = r.review.body.trim();
    if (!body || seen.has(body)) continue;
    seen.add(body);
    refNeg.push(body);
  }

  console.log(`대상: ${target.name} · 전수 부정 리뷰 ${refNeg.length}건 · 라운드 ${ROUNDS}`);
  console.log('(RAG 는 상위 6건만 읽음 — 답이 전수 단점 테마를 얼마나 담는지 = recall 병목 진단)\n');

  let sum = 0;
  let n = 0;
  for (let round = 1; round <= ROUNDS; round += 1) {
    if (ROUNDS > 1) console.log(`── round ${round}/${ROUNDS} ──`);
    for (const q of COMPLETENESS_QUERIES) {
      const a = await service.ask(target.id, q);
      const v = await judgeCompleteness(q, a.answer, refNeg);
      if (v.completeness >= 0) {
        sum += v.completeness;
        n += 1;
      }
      console.log(`Q: ${q}  [${a.confidence}]`);
      console.log(`   completeness=${v.completeness}%  (테마 ${v.themes.length} / 담음 ${v.covered.length})`);
      if (v.missed.length) console.log(`   놓친 테마: ${v.missed.join(', ')}`);
    }
  }
  console.log(`\n→ 평균 completeness ${n ? (sum / n).toFixed(0) : '–'}%`);
  console.log('  해석: 낮음(<~70%) → recall 이 병목 → aspect-fusion 등 회수 개선이 완전성 향상으로 검증 가능.');
  console.log('        높음 → recall 은 지금 병목 아님(top-6 충분). 회수 최적화 불필요.');

  await prisma.$disconnect();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
