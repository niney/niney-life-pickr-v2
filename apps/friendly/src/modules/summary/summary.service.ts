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
// v4: menus[].sentiment 를 필수로 강제 (positive/negative/neutral, null 금지).
//     menus[].traits (맛/특징 태그) 추가 — 메뉴 단위 통계의 입력 품질 확보용.
// v3: few-shot 예시 + 출력 규칙 강화 프롬프트, reasoning 블록/균형괄호 파서.
// v2: Ollama structured output(format=schema) + num_ctx=8192.
// v1: 자유 텍스트 JSON.
export const ANALYSIS_VERSION = 4;

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
  · 각 메뉴는 반드시 { "name": ..., "sentiment": ..., "traits": [...] } 형태.
  · sentiment 는 항상 "positive" | "negative" | "neutral" 중 하나로 필수 채운다. null 금지.
  · 판정 기준 — "맛있다/추천/최고/존맛/굿" 류 = positive,
    "별로/실망/아쉽다/맛없다/짜다/싱겁다" 류 부정 표현 = negative,
    감정 표현 없이 단순 언급되었거나 판단이 모호하면 = neutral.
  · traits: 그 메뉴에 대한 맛·식감·특징 태그 (예: "독특한 맛", "매콤한", "달달한",
    "담백한", "진한", "촉촉한", "바삭한", "푸짐한", "이색적", "느끼한").
    본문에 단서가 있을 때만 짧은 한국어로 1~3개 추출. 단서가 없으면 [].
    sentiment 와는 별개 — "독특한 맛"처럼 호불호 갈리는 표현은 traits 에 그대로 두고
    sentiment 는 본문 어조로 따로 판정한다.
  · 한 메뉴를 두 번 적지 말 것. 같은 메뉴가 두 번 언급되면 감정/태그를 합쳐 한 줄로 남긴다.
- tips: 다음 방문자에게 도움될 실용 정보(예약·주차·웨이팅 등). 없으면 [].
- keywords: 분위기/서비스/가격/대기 등 자유 태그. 없으면 [].

[예시]
입력: "평일 저녁에 갔는데 김치찌개가 진짜 맛있었어요. 직원분들도 친절하셨고 가격도 합리적. 다만 주차가 좀 어려워요."
출력: {"summary":"김치찌개가 맛있고 직원이 친절하며 가격이 합리적이다. 주차가 어려운 점만 아쉽다.","sentiment":"positive","sentimentScore":0.7,"satisfactionScore":4,"menus":[{"name":"김치찌개","sentiment":"positive","traits":["얼큰한"]}],"tips":["주차 협소"],"keywords":["친절","합리적 가격","평일 저녁"]}

입력: "음식은 그럭저럭. 별 감흥 없음."
출력: {"summary":"음식이 그럭저럭이고 특별한 감흥이 없다.","sentiment":"neutral","sentimentScore":0.0,"satisfactionScore":3,"menus":[],"tips":[],"keywords":[]}

입력: "갈비탕은 진짜 깊은 맛이고 추천. 근데 같이 시킨 냉면은 면이 너무 퍼져서 별로였어요. 공깃밥은 그냥 보통."
출력: {"summary":"갈비탕은 깊은 맛으로 추천할 만하지만 냉면은 면이 퍼져 아쉽다.","sentiment":"mixed","sentimentScore":0.1,"satisfactionScore":3,"menus":[{"name":"갈비탕","sentiment":"positive","traits":["진한","깊은 맛"]},{"name":"냉면","sentiment":"negative","traits":["퍼진 면"]},{"name":"공깃밥","sentiment":"neutral","traits":[]}],"tips":[],"keywords":["깊은 맛"]}

입력: "여기 시그니처 트러플 파스타는 호불호가 갈릴 만한 독특한 맛이에요. 향이 진해서 처음엔 적응이 필요했는데 두 번째 한 입부터는 매력적. 같이 나온 마늘빵은 무난하게 바삭함."
출력: {"summary":"트러플 파스타는 향이 진해 호불호가 갈리지만 매력 있는 독특한 맛이고, 마늘빵은 무난하게 바삭하다.","sentiment":"positive","sentimentScore":0.4,"satisfactionScore":4,"menus":[{"name":"트러플 파스타","sentiment":"positive","traits":["독특한 맛","향이 진한","호불호"]},{"name":"마늘빵","sentiment":"neutral","traits":["바삭한"]}],"tips":[],"keywords":["시그니처","호불호"]}`;

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
          // v4 부터 필수 + non-null. 메뉴 단위 통계의 입력 품질을 위해
          // 모델이 모호할 때도 'neutral' 로 빠지도록 강제한다.
          sentiment: {
            type: 'string',
            enum: ['positive', 'negative', 'neutral'],
          },
          // 맛/식감/특징 태그. 본문에 단서가 없으면 빈 배열.
          // sentiment 와 직교 — "독특한 맛" 처럼 호불호 표현도 여기에 보존된다.
          traits: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['name', 'sentiment', 'traits'],
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
// 한 review 당 시도 횟수 (첫 시도 + 재시도 2회). parse_failed 는 모델이
// 운에 따라 형태를 못 맞추는 경우가 많아 재시도가 효과적이고,
// upstream/timeout 도 일시적 네트워크/모델 장애에 자주 회복된다.
// 어댑터의 동시성-한도 백오프와 별개 — 그쪽은 같은 호출 내부에서 회복.
const RETRY_LIMIT = 3;

// nameNorm/termNorm 정규화 — 대소문자/공백/특수문자만 제거하는 최소 정규화.
// 동의어 사전("세트"="SET", "트러플"="truffle")은 별도 작업으로 미룬다.
export const normalizeTerm = (s: string): string =>
  s.toLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '');

const safeParseArray = (raw: string | null): unknown[] => {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

// 한 review 의 한 시도 결과. ok 면 parsed 분석을 들고 나오고, 실패면
// 다음 시도/최종 실패 처리를 위한 errorCode + message 를 들고 나온다.
type ReviewAttemptOutcome =
  | {
      ok: true;
      parsed: ReviewAnalysisType;
      text: string;
      model: string;
    }
  | {
      ok: false;
      errorCode: string;
      message: string;
      // parse_failed 일 땐 모델 id 가 알려져 있어 보존, upstream/timeout 은 null.
      model: string | null;
    };

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
    const prev = this.runChainByPlace.get(placeId);
    // chained=true 이면 이전 batch 의 run() 이 아직 안 끝나 뒤에 줄을 선 것.
    // 크롤 페이지가 빠르게 넘어오면 여러 batch 가 같은 placeId chain 에 쌓이고,
    // run() 은 placeId 단위로 순차 실행된다 (다른 place 는 병렬).
    this.log?.info(
      { placeId, count: reviewIds.length, chained: prev !== undefined },
      '[summary] queued',
    );
    const next = (prev ?? Promise.resolve())
      .then(() => this.run(placeId, reviewIds))
      .catch(() => undefined);
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

  // 기존 done 행의 menusJson/tipsJson/keywordsJson 을 정규화 테이블로 풀어쓰는
  // backfill. LLM 재호출 없이 이미 저장된 분석 결과만으로 채운다 — v3 데이터
  // (traits 없음) 에서도 메뉴 빈도·감정 통계가 즉시 동작하도록.
  // 이미 mention/tag 가 있는 summary 는 건드리지 않음(idempotent).
  // 반환: 새로 채운 summary 수.
  async backfillAnalyticsFromExisting(opts?: { batchSize?: number }): Promise<number> {
    const batchSize = opts?.batchSize ?? 500;
    let processed = 0;
    // 분석 행 + restaurantId 를 같이 들고와서, mentions 가 비어있는 것만.
    // findMany loop — SQLite + 단일 인스턴스라 cursor 기반이 과해서 LIMIT 으로 충분.
    let lastId: string | undefined;
    while (true) {
      const rows = await this.prisma.reviewSummary.findMany({
        where: {
          status: 'done',
          menuMentions: { none: {} },
          tags: { none: {} },
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: batchSize,
        select: {
          id: true,
          menusJson: true,
          tipsJson: true,
          keywordsJson: true,
          review: { select: { restaurantId: true } },
        },
      });
      if (rows.length === 0) break;
      lastId = rows[rows.length - 1]!.id;

      for (const row of rows) {
        const restaurantId = row.review.restaurantId;
        const menus = safeParseArray(row.menusJson);
        const tips = safeParseArray(row.tipsJson);
        const keywords = safeParseArray(row.keywordsJson);

        const menuRows = menus
          .map((m) => {
            if (typeof m !== 'object' || m === null) return null;
            const name = (m as { name?: unknown }).name;
            if (typeof name !== 'string' || name.trim().length === 0) return null;
            const s = (m as { sentiment?: unknown }).sentiment;
            const sentiment =
              s === 'positive' || s === 'negative' || s === 'neutral' ? s : 'neutral';
            const rawTraits = (m as { traits?: unknown }).traits;
            const traits = Array.isArray(rawTraits)
              ? rawTraits.filter((t): t is string => typeof t === 'string')
              : [];
            const nameNorm = normalizeTerm(name);
            if (nameNorm.length === 0) return null;
            return {
              summaryId: row.id,
              restaurantId,
              name,
              nameNorm,
              sentiment,
              traitsJson: JSON.stringify(traits),
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);

        const tagRows = [
          ...tips
            .filter((t): t is string => typeof t === 'string')
            .map((t) => ({ kind: 'tip', term: t })),
          ...keywords
            .filter((t): t is string => typeof t === 'string')
            .map((t) => ({ kind: 'keyword', term: t })),
        ]
          .filter((r) => r.term.trim().length > 0)
          .map((r) => ({
            summaryId: row.id,
            restaurantId,
            kind: r.kind,
            term: r.term,
            termNorm: normalizeTerm(r.term),
          }))
          .filter((r) => r.termNorm.length > 0);

        if (menuRows.length === 0 && tagRows.length === 0) continue;
        await this.prisma.$transaction(async (tx) => {
          if (menuRows.length > 0) await tx.menuMention.createMany({ data: menuRows });
          if (tagRows.length > 0) await tx.reviewTag.createMany({ data: tagRows });
        });
        processed += 1;
      }
      if (rows.length < batchSize) break;
    }
    this.log?.info({ processed }, '[summary] analytics backfill done');
    return processed;
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
      // restaurantId 도 같이 — done 시 정규화 분석 테이블(menu_mentions/
      // review_tags)에 같이 써야 한다.
      select: { id: true, body: true, authorName: true, rating: true, restaurantId: true },
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

      // 한 review에 대해 fetch + parse 까지 한 사이클. 실패 시 최대
      // RETRY_LIMIT 만큼 재시도. parse_failed/upstream/timeout 모두 대상.
      // 어댑터의 동시성-한도 백오프와 이 재시도는 겹치지 않는다(어댑터는
      // 같은 슬롯에서 한 호출 내부 회복, 여기는 호출 자체를 새로 시작).
      const attemptForReview = async (
        r: (typeof chunk)[number],
      ): Promise<ReviewAttemptOutcome> => {
        let last: ReviewAttemptOutcome | null = null;
        for (let attempt = 0; attempt < RETRY_LIMIT; attempt += 1) {
          if (attempt > 0) {
            const delay = 300 * attempt + Math.floor(Math.random() * 200);
            await new Promise((res) => setTimeout(res, delay));
            this.log?.info(
              { placeId, reviewId: r.id, attempt: attempt + 1, prev: last?.errorCode },
              '[summary] retry',
            );
          }
          last = await this.attemptOnce(provider, model, r);
          if (last.ok) return last;
        }
        return last!;
      };

      const attempts = await Promise.all(chunk.map((r) => attemptForReview(r)));

      const finishedAt = new Date();
      // SQLite 는 동시 쓰기 트랜잭션 불가 — Promise.all 로 트랜잭션을
      // 여러 개 띄우면 SQLITE_BUSY → "Transaction not found" 로 떨어진다.
      // DB 쓰기만 순차로 직렬화. (LLM 호출은 위에서 이미 병렬 처리됨)
      for (let idx = 0; idx < attempts.length; idx += 1) {
        const a = attempts[idx]!;
        const reviewId = chunk[idx]!.id;
        {
          if (a.ok) {
            doneCount += 1;
            const restaurantId = chunk[idx]!.restaurantId;
            // 한 트랜잭션 안에서 1) reviewSummary done 마킹 2) 기존 분석
            // 정규화 행 정리 3) 새 menu_mentions / review_tags insert.
            // 재분석/백필도 같은 경로를 타므로 항상 "delete + reinsert".
            await this.prisma.$transaction(async (tx) => {
              const updated = await tx.reviewSummary.update({
                where: { reviewId },
                data: {
                  status: 'done',
                  text: a.text,
                  model: a.model,
                  finishedAt,
                  errorCode: null,
                  errorMessage: null,
                  sentiment: a.parsed.sentiment,
                  sentimentScore: a.parsed.sentimentScore,
                  satisfactionScore: a.parsed.satisfactionScore,
                  menusJson: JSON.stringify(a.parsed.menus),
                  tipsJson: JSON.stringify(a.parsed.tips),
                  keywordsJson: JSON.stringify(a.parsed.keywords),
                  analysisVersion: ANALYSIS_VERSION,
                },
                select: { id: true },
              });
              await tx.menuMention.deleteMany({ where: { summaryId: updated.id } });
              await tx.reviewTag.deleteMany({ where: { summaryId: updated.id } });
              const menuRows = a.parsed.menus
                .filter((m) => m.name.trim().length > 0)
                .map((m) => ({
                  summaryId: updated.id,
                  restaurantId,
                  name: m.name,
                  nameNorm: normalizeTerm(m.name),
                  // v3 잔존 호환으로 menu sentiment 가 null/undefined 가 들어올 수
                  // 있으나 v4 LLM 출력은 항상 셋 중 하나. null 은 'neutral' 로.
                  sentiment:
                    m.sentiment === 'positive' ||
                    m.sentiment === 'negative' ||
                    m.sentiment === 'neutral'
                      ? m.sentiment
                      : 'neutral',
                  traitsJson: JSON.stringify(m.traits ?? []),
                }))
                .filter((m) => m.nameNorm.length > 0);
              if (menuRows.length > 0) {
                await tx.menuMention.createMany({ data: menuRows });
              }
              const tagRows = [
                ...a.parsed.tips.map((t) => ({ kind: 'tip', term: t })),
                ...a.parsed.keywords.map((t) => ({ kind: 'keyword', term: t })),
              ]
                .filter((r) => r.term.trim().length > 0)
                .map((r) => ({
                  summaryId: updated.id,
                  restaurantId,
                  kind: r.kind,
                  term: r.term,
                  termNorm: normalizeTerm(r.term),
                }))
                .filter((r) => r.termNorm.length > 0);
              if (tagRows.length > 0) {
                await tx.reviewTag.createMany({ data: tagRows });
              }
            });
            // Per-row patch: lets the SSE subscriber push the new summary
            // text directly into the client's detail cache. Without this,
            // the only way to learn the text was a follow-up GET.
            this.bus.publish(placeId, {
              type: 'review',
              reviewId,
              status: 'done',
              text: a.text,
              model: a.model,
              errorCode: null,
              errorMessage: null,
              finishedAt: finishedAt.toISOString(),
              sentiment: a.parsed.sentiment,
              sentimentScore: a.parsed.sentimentScore,
              satisfactionScore: a.parsed.satisfactionScore,
              menus: a.parsed.menus,
              tips: a.parsed.tips,
              keywords: a.parsed.keywords,
            });
            continue;
          }
          // 모든 시도 실패. parse_failed 와 upstream 을 분기해 카운트.
          if (a.errorCode === 'parse_failed') parseFailCount += 1;
          else failCount += 1;
          this.log?.warn(
            {
              placeId,
              reviewId,
              errorCode: a.errorCode,
              message: a.message.slice(0, 120),
              attempts: RETRY_LIMIT,
            },
            '[summary] all retries exhausted',
          );
          await this.prisma.reviewSummary.update({
            where: { reviewId },
            data: {
              status: 'failed',
              errorCode: a.errorCode,
              errorMessage: a.message,
              model: a.model,
              finishedAt,
            },
          });
          this.bus.publish(placeId, {
            type: 'review',
            reviewId,
            status: 'failed',
            text: null,
            model: a.model,
            errorCode: a.errorCode,
            errorMessage: a.message,
            finishedAt: finishedAt.toISOString(),
            sentiment: null,
            sentimentScore: null,
            satisfactionScore: null,
            menus: null,
            tips: null,
            keywords: null,
          });
        }
      }
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

  // 한 review 에 대한 단일 시도. provider.complete + parseAnalysis 까지
  // 한 사이클로 묶어 ReviewAttemptOutcome 으로 정규화한다. 던지지 않는다 —
  // 호출자(retry 루프)가 ok/실패를 분기하기 위함.
  private async attemptOnce(
    provider: LLMProvider,
    model: string,
    r: { id: string; body: string; authorName: string | null; rating: number | null },
  ): Promise<ReviewAttemptOutcome> {
    try {
      const res = await provider.complete({
        prompt: this.buildPrompt(r),
        model,
        systemPrompt: SYSTEM_PROMPT,
        temperature: TEMPERATURE,
        maxTokens: MAX_TOKENS,
        numCtx: NUM_CTX,
        format: ANALYSIS_JSON_SCHEMA,
      });
      const parsed = parseAnalysis(res.text);
      if (parsed) {
        return {
          ok: true,
          parsed,
          text: parsed.summary.trim(),
          model: res.model,
        };
      }
      return {
        ok: false,
        errorCode: 'parse_failed',
        message: res.text.slice(0, 500),
        model: res.model,
      };
    } catch (e) {
      const { error, message } = classifyError(e);
      return { ok: false, errorCode: error, message, model: null };
    }
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
// `\"` 를 무시하고, 깊이 0이 되는 시점에 종료한다. 다른 모듈(메뉴 그룹핑)
// 에서도 재사용하므로 export.
export const extractFirstJsonObject = (s: string): string | null => {
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
