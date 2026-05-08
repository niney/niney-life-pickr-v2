import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { ReviewAnalysis, type ReviewAnalysisType } from '@repo/api-contract';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import { classifyError } from '../ai/ai.service.js';
import { summaryEventsBus, type SummaryEventsBus } from './summary-events-bus.js';

// 프롬프트/스키마가 바뀌면 이 숫자를 올린다. ReviewSummary.analysisVersion에
// 저장되어 추후 백필/재분석 대상 식별에 쓰인다.
// v3: few-shot 예시 + 출력 규칙 강화 프롬프트, reasoning 블록/균형괄호 파서.
// v2: Ollama structured output(format=schema) + num_ctx=8192.
// v1: 자유 텍스트 JSON.
export const ANALYSIS_VERSION = 3;

const SYSTEM_PROMPT = `너는 한국 음식점 리뷰 분석기다. 본문에 없는 내용은 추측하지 않고, 본문 그대로의 표현을 우선 사용한다.

[출력 규칙 - 절대 위반하지 말 것]
- 응답 전체는 단 하나의 JSON 객체만 포함한다.
- JSON 앞뒤에 어떠한 설명, 인사말, 코드펜스(\`\`\`), 주석, 사고 과정도 절대 출력하지 않는다.
- 첫 글자는 반드시 '{', 마지막 글자는 반드시 '}'.
- 모든 문자열 값은 한국어로 짧게.
- 모든 필드는 항상 포함한다(빈 값은 [] 또는 "" 가 아니라 스키마에 따라 알맞은 형태).

[필드 의미]
- summary: 1~2문장. 분위기/맛/서비스/장단점의 핵심.
- sentiment: 전체 감정 — positive | negative | neutral | mixed.
- sentimentScore: -1.0(매우 부정) ~ 1.0(매우 긍정).
- satisfactionScore: 1~5 정수.
- menus: 본문에서 언급된 메뉴. 없으면 [].
- tips: 다음 방문자에게 도움될 실용 정보(예약·주차·웨이팅 등). 없으면 [].
- keywords: 분위기/서비스/가격/대기 등 자유 태그. 없으면 [].

[예시]
입력: "평일 저녁에 갔는데 김치찌개가 진짜 맛있었어요. 직원분들도 친절하셨고 가격도 합리적. 다만 주차가 좀 어려워요."
출력: {"summary":"김치찌개가 맛있고 직원이 친절하며 가격이 합리적이다. 주차가 어려운 점만 아쉽다.","sentiment":"positive","sentimentScore":0.7,"satisfactionScore":4,"menus":[{"name":"김치찌개","sentiment":"positive"}],"tips":["주차 협소"],"keywords":["친절","합리적 가격","평일 저녁"]}

입력: "음식은 그럭저럭. 별 감흥 없음."
출력: {"summary":"음식이 그럭저럭이고 특별한 감흥이 없다.","sentiment":"neutral","sentimentScore":0.0,"satisfactionScore":3,"menus":[],"tips":[],"keywords":[]}`;

// Ollama의 structured output 으로 출력 모양을 토큰 샘플링 단계에서
// 강제한다. zod 스키마를 직접 변환하지 않고 손으로 미러링 — 오버헤드도
// 없고 LLM이 보는 표현이 명시적이라 디버깅도 쉽다. zod 쪽이 바뀌면 이
// 객체도 함께 갱신해야 한다 (변경 시 ANALYSIS_VERSION 도 올린다).
const ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral', 'mixed'] },
    sentimentScore: { type: 'number', minimum: -1, maximum: 1 },
    satisfactionScore: { type: 'integer', minimum: 1, maximum: 5 },
    menus: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          sentiment: {
            type: ['string', 'null'],
            enum: ['positive', 'negative', 'neutral', null],
          },
        },
        required: ['name'],
      },
    },
    tips: { type: 'array', items: { type: 'string' } },
    keywords: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'summary',
    'sentiment',
    'sentimentScore',
    'satisfactionScore',
    'menus',
    'tips',
    'keywords',
  ],
} as const;

const TEMPERATURE = 0.2;
// Ollama 에선 num_ctx = 입력+출력 합이므로, num_ctx(4096) 안에서 시스템
// 프롬프트(~600) + 리뷰 입력 자리를 충분히 남기려면 출력은 1500 정도가
// 적정. 실측 분석 출력은 보통 300~700 토큰이라 1500도 보수적으로 큰 편.
const MAX_TOKENS = 1500;
// Ollama num_ctx 기본 2048 — 시스템 프롬프트 + 긴 리뷰가 들어가면
// 입력 단계에서 잘려 분석 자체가 무의미해진다. 4096이면 시스템 프롬프트
// (~600토큰) + 긴 리뷰(~1500토큰) + 출력 여유까지 담긴다.
const NUM_CTX = 4096;
// Mirrors the public batch endpoint's cap. Real concurrency is governed by
// the adapter's FIFO gate; chunking here is just a defensive boundary so a
// single fan-out doesn't allocate thousands of pending Promises at once.
const DEFAULT_CHUNK_SIZE = 10;

export interface SummaryServiceOptions {
  cache?: AdapterCache;
  chunkSize?: number;
  // Test seam — bypass AiConfigService and return a fixed (provider, model).
  // Keeps the unit test independent of DB rows / env setup.
  resolveOverride?: () => Promise<{ provider: LLMProvider; model: string } | null>;
  // Test seam — inject a custom bus instance (default: module singleton).
  bus?: SummaryEventsBus;
  // Fastify pino logger. 미주입 시 silent — 테스트는 로그 없이 돌고,
  // 라우트에서 만들 땐 app.log를 넘겨 콘솔에 진행 상황이 찍히게 한다.
  logger?: FastifyBaseLogger;
}

// Background AI summarization. The crawl pipeline calls
// queueSummariesForReviews(...) right after persisting a "더보기" batch — we
// want the LLM round-trip to overlap with the next page's fetch, so this is
// fire-and-forget by design. Failures are recorded on the ReviewSummary row
// (status='failed' + errorMessage) so the UI can surface them; we never throw.
export class SummaryService {
  // 같은 placeId 의 batch 들을 직렬로 잇는다. 크롤러가 페이지마다
  // queueSummariesForReviews 를 호출하면 여러 run() 이 동시에 떠서
  // 각자 자기 chunk 를 'running' 으로 마킹 → DB 상태 표시가 의미를
  // 잃는 문제가 있었다 (어댑터 게이트가 실제 fetch 는 막지만 마킹은
  // 합집합으로 보인다). placeId 단위로 then-chaining 하면 처리량 손실
  // 없이 마킹/진행이 일관된다 — 다른 place 는 여전히 병렬.
  private readonly runChainByPlace = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiConfig: AiConfigService,
    private readonly opts: SummaryServiceOptions = {},
  ) {}

  queueSummariesForReviews(placeId: string, reviewIds: string[]): void {
    if (reviewIds.length === 0) return;
    const prev = this.runChainByPlace.get(placeId) ?? Promise.resolve();
    const next = prev.then(() => this.run(placeId, reviewIds)).catch(() => undefined);
    this.runChainByPlace.set(placeId, next);
    void next.finally(() => {
      // 이 next 가 여전히 chain 의 tail 이면 정리. 그 사이 더 들어왔으면
      // 그 새 tail 이 끝날 때 정리되도록 둔다.
      if (this.runChainByPlace.get(placeId) === next) {
        this.runChainByPlace.delete(placeId);
      }
    });
  }

  // 백필 — 한 식당의 분석되지 않았거나 구버전(analysisVersion < 현재) 행을
  // 모두 다시 큐잉. 재크롤은 리뷰를 통째로 날리므로 부담이 크다. 이 경로는
  // 리뷰 텍스트는 그대로 두고 분석만 다시 채운다.
  // 반환: 큐잉된 reviewId 수.
  async backfillForRestaurant(placeId: string): Promise<number> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { placeId },
      select: { id: true },
    });
    if (!restaurant) return 0;

    // failed/parse_failed 도 포함 — 새 프롬프트/모델로 다시 시도할 가치가 있음.
    // 이미 진행 중(pending/running)인 행은 건드리지 않는다.
    const targets = await this.prisma.reviewSummary.findMany({
      where: {
        review: { restaurantId: restaurant.id },
        OR: [
          { status: 'failed' },
          {
            status: 'done',
            OR: [
              { analysisVersion: null },
              { analysisVersion: { lt: ANALYSIS_VERSION } },
            ],
          },
        ],
      },
      select: { reviewId: true },
    });
    const reviewIds = targets.map((t) => t.reviewId);
    this.queueSummariesForReviews(placeId, reviewIds);
    return reviewIds.length;
  }

  // Exposed for tests so they can await completion deterministically. The
  // crawl path never awaits — it relies on queueSummariesForReviews.
  async runForTests(placeId: string, reviewIds: string[]): Promise<void> {
    await this.run(placeId, reviewIds);
  }

  private get bus(): SummaryEventsBus {
    return this.opts.bus ?? summaryEventsBus;
  }

  private get log(): FastifyBaseLogger | null {
    return this.opts.logger ?? null;
  }

  private async run(placeId: string, reviewIds: string[]): Promise<void> {
    if (reviewIds.length === 0) return;
    const startedAt = new Date();
    const total = reviewIds.length;
    this.log?.info({ placeId, total, version: ANALYSIS_VERSION }, '[summary] queue start');

    // Mark every accepted review as pending up-front. Re-summarizing an
    // existing row is allowed (recrawl path wipes reviews+summaries first
    // via cascade, so this is mainly defensive).
    for (const id of reviewIds) {
      await this.prisma.reviewSummary.upsert({
        where: { reviewId: id },
        create: { reviewId: id, status: 'pending', startedAt },
        update: {
          status: 'pending',
          startedAt,
          finishedAt: null,
          text: null,
          errorCode: null,
          errorMessage: null,
        },
      });
    }
    this.bus.publish(placeId);

    const resolved = await this.resolveProvider();
    if (!resolved) {
      // No key / no model / disabled — leave rows pending. Admin can fix
      // config and re-trigger via recrawl. We don't fail loud because the
      // primary path (crawling reviews) succeeded; summaries are auxiliary.
      this.log?.warn(
        { placeId, total },
        '[summary] no provider/model resolved — rows left pending',
      );
      return;
    }
    const { provider, model } = resolved;
    this.log?.info({ placeId, total, model }, '[summary] provider resolved');

    const reviews = await this.prisma.visitorReview.findMany({
      where: { id: { in: reviewIds } },
      select: { id: true, body: true, authorName: true, rating: true },
    });

    const chunkSize = this.opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
    let doneCount = 0;
    let failCount = 0;
    let parseFailCount = 0;
    for (let i = 0; i < reviews.length; i += chunkSize) {
      const chunk = reviews.slice(i, i + chunkSize);
      const chunkIdx = Math.floor(i / chunkSize) + 1;
      const chunkTotal = Math.ceil(reviews.length / chunkSize);
      const chunkStartedAt = Date.now();
      this.log?.info(
        { placeId, chunk: `${chunkIdx}/${chunkTotal}`, size: chunk.length },
        '[summary] chunk start',
      );
      await this.prisma.reviewSummary.updateMany({
        where: { reviewId: { in: chunk.map((r) => r.id) } },
        data: { status: 'running' },
      });
      this.bus.publish(placeId);

      const settled = await Promise.allSettled(
        chunk.map((r) =>
          provider.complete({
            prompt: this.buildPrompt(r),
            model,
            systemPrompt: SYSTEM_PROMPT,
            temperature: TEMPERATURE,
            maxTokens: MAX_TOKENS,
            numCtx: NUM_CTX,
            format: ANALYSIS_JSON_SCHEMA,
          }),
        ),
      );

      const finishedAt = new Date();
      await Promise.all(
        settled.map(async (s, idx) => {
          const reviewId = chunk[idx]!.id;
          if (s.status === 'fulfilled') {
            const parsed = parseAnalysis(s.value.text);
            if (!parsed) {
              // LLM이 JSON 스키마를 못 맞춤. raw text는 errorMessage에
              // 잘라 넣어 진단 가능하게 하고 status=failed.
              const message = s.value.text.slice(0, 500);
              parseFailCount += 1;
              this.log?.warn(
                {
                  placeId,
                  reviewId,
                  model: s.value.model,
                  rawHead: message.slice(0, 120),
                },
                '[summary] parse_failed',
              );
              await this.prisma.reviewSummary.update({
                where: { reviewId },
                data: {
                  status: 'failed',
                  errorCode: 'parse_failed',
                  errorMessage: message,
                  model: s.value.model,
                  finishedAt,
                },
              });
              this.bus.publish(placeId, {
                type: 'review',
                reviewId,
                status: 'failed',
                text: null,
                model: s.value.model,
                errorCode: 'parse_failed',
                errorMessage: message,
                finishedAt: finishedAt.toISOString(),
                sentiment: null,
                sentimentScore: null,
                satisfactionScore: null,
                menus: null,
                tips: null,
                keywords: null,
              });
              return;
            }
            const text = parsed.summary.trim();
            doneCount += 1;
            await this.prisma.reviewSummary.update({
              where: { reviewId },
              data: {
                status: 'done',
                text,
                model: s.value.model,
                finishedAt,
                errorCode: null,
                errorMessage: null,
                sentiment: parsed.sentiment,
                sentimentScore: parsed.sentimentScore,
                satisfactionScore: parsed.satisfactionScore,
                menusJson: JSON.stringify(parsed.menus),
                tipsJson: JSON.stringify(parsed.tips),
                keywordsJson: JSON.stringify(parsed.keywords),
                analysisVersion: ANALYSIS_VERSION,
              },
            });
            // Per-row patch: lets the SSE subscriber push the new summary
            // text directly into the client's detail cache. Without this,
            // the only way to learn the text was a follow-up GET.
            this.bus.publish(placeId, {
              type: 'review',
              reviewId,
              status: 'done',
              text,
              model: s.value.model,
              errorCode: null,
              errorMessage: null,
              finishedAt: finishedAt.toISOString(),
              sentiment: parsed.sentiment,
              sentimentScore: parsed.sentimentScore,
              satisfactionScore: parsed.satisfactionScore,
              menus: parsed.menus,
              tips: parsed.tips,
              keywords: parsed.keywords,
            });
          } else {
            const { error, message } = classifyError(s.reason);
            failCount += 1;
            this.log?.warn(
              { placeId, reviewId, errorCode: error, message },
              '[summary] upstream/timeout failure',
            );
            await this.prisma.reviewSummary.update({
              where: { reviewId },
              data: {
                status: 'failed',
                errorCode: error,
                errorMessage: message,
                finishedAt,
              },
            });
            this.bus.publish(placeId, {
              type: 'review',
              reviewId,
              status: 'failed',
              text: null,
              model: null,
              errorCode: error,
              errorMessage: message,
              finishedAt: finishedAt.toISOString(),
              sentiment: null,
              sentimentScore: null,
              satisfactionScore: null,
              menus: null,
              tips: null,
              keywords: null,
            });
          }
        }),
      );
      // Counts bump after the chunk — the SSE handler debounces this so
      // multiple chunk-completions inside one tick collapse into one
      // snapshot push.
      this.bus.publish(placeId);
      this.log?.info(
        {
          placeId,
          chunk: `${chunkIdx}/${chunkTotal}`,
          tookMs: Date.now() - chunkStartedAt,
          progress: `${doneCount + failCount + parseFailCount}/${total}`,
          done: doneCount,
          failed: failCount,
          parseFailed: parseFailCount,
        },
        '[summary] chunk done',
      );
    }
    this.log?.info(
      {
        placeId,
        total,
        done: doneCount,
        failed: failCount,
        parseFailed: parseFailCount,
        tookMs: Date.now() - startedAt.getTime(),
      },
      '[summary] queue finished',
    );
  }

  private async resolveProvider(): Promise<
    { provider: LLMProvider; model: string } | null
  > {
    if (this.opts.resolveOverride) return this.opts.resolveOverride();

    const resolved = await this.aiConfig.getResolved('ollama-cloud');
    if (!resolved) return null;
    const model = resolved.defaultModel?.trim();
    if (!model) return null;
    const provider = (this.opts.cache ?? adapterCache).get(resolved);
    return { provider, model };
  }

  private buildPrompt(r: {
    body: string;
    authorName: string | null;
    rating: number | null;
  }): string {
    const meta = [
      r.authorName ? `작성자: ${r.authorName}` : null,
      r.rating !== null ? `평점: ${r.rating}` : null,
    ]
      .filter(Boolean)
      .join(' / ');
    return meta ? `${meta}\n\n${r.body}` : r.body;
  }
}

// LLM 출력에서 분석 JSON을 추출. 이 함수가 처리해야 하는 이상 케이스:
//   1. 코드펜스: ```json { ... } ```
//   2. reasoning 모델의 <think>...</think> 블록 (gpt-oss, deepseek-r1 등)
//   3. JSON 앞뒤에 잡설: "다음은 분석 결과입니다: { ... } 이상입니다."
//   4. JSON 안의 문자열에 중첩된 `{` `}` (균형 괄호 추적 필요)
//
// 단순 indexOf('{') ~ lastIndexOf('}') 슬라이스는 (2)(3)에서 잡설 안의 { 까지
// 끌어와 깨지는 사례가 있었다. 그래서 reasoning 블록 제거 후 균형 괄호로
// 첫 번째 완전한 JSON 객체를 추출한다.
const parseAnalysis = (raw: string): ReviewAnalysisType | null => {
  // <think>…</think>, <reasoning>…</reasoning> 등 reasoning 블록 제거.
  // s 플래그로 줄바꿈도 매칭.
  const cleaned = raw.replace(/<(think|reasoning|analysis)[\s\S]*?<\/\1>/gi, '');
  const candidate = extractFirstJsonObject(cleaned) ?? extractFirstJsonObject(raw);
  if (!candidate) return null;
  let json: unknown;
  try {
    json = JSON.parse(candidate);
  } catch {
    return null;
  }
  const result = ReviewAnalysis.safeParse(json);
  return result.success ? result.data : null;
};

// 균형잡힌 첫 JSON 객체 추출. 문자열 리터럴 안의 `{` `}` 와 이스케이프된
// `\"` 를 무시하고, 깊이 0이 되는 시점에 종료한다.
const extractFirstJsonObject = (s: string): string | null => {
  const start = s.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i += 1) {
    const c = s[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
};
