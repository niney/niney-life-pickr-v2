import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { ReviewAnalysis, type ReviewAnalysisType } from '@repo/api-contract';
import { LLMUpstreamError, type LLMProvider } from '../ai/adapters/llm-provider.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import { classifyError } from '../ai/ai.service.js';
import { summaryEventsBus, type SummaryEventsBus } from './summary-events-bus.js';
import type { JobLogService } from '../crawl/job-log.service.js';

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
// Ollama 에선 num_ctx = 입력+출력 합. 실측에서 menus 가 많은 한식 리뷰
// (단호박죽/이동갈비정식/냉면/꿀떡/수정과 등 5+ 종)는 traits 까지 포함하면
// 출력이 1500 을 넘어 JSON 이 닫는 괄호 없이 잘리는 parse_failed 가 났다.
// 2500 이면 메뉴 10 개 + traits/tips/keywords 까지 안전.
const MAX_TOKENS = 2500;
// 시스템 프롬프트(~600) + 긴 한식 리뷰(~2000) + 출력 2500 = ~5100. 8192 면
// 충분한 여유. KV cache 메모리는 늘지만 Ollama Cloud 측 부담이라 클라이언트
// 영향 없음. 토큰 청구는 실제 사용량 기준이라 num_ctx 만 키워서 늘진 않는다.
const NUM_CTX = 8192;
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
      // LLMUpstreamError 일 때만 채움 — 429/500/503 구분용. 그 외 null.
      httpStatus: number | null;
    };

// 한 시도의 디버깅용 스냅샷. 최종 실패 시 시도별 이력 전체를 로그에 실어
// 보내기 위해 각 시도 outcome 을 이 모양으로 누적한다.
type AttemptTrace = {
  attempt: number;             // 1-indexed
  ok: boolean;
  errorCode: string | null;
  message: string | null;      // ok=false 일 때만, cap 없이 원본
  httpStatus: number | null;
  model: string | null;
  tookMs: number;              // 이 시도 소요
  delayMs: number;             // 이 시도 직전 백오프 대기
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
  // 잡 단계별 로그 — DB + SSE 영속화. 미주입 시 pino 로그만 남는다.
  // 크롤 잡 컨텍스트에서 호출됐을 때 channel: 'summary' 로 placeId 별 SSE 에
  // 흘려보낸다 — 크롤 SSE 가 done 으로 닫혀도 어드민 UI 가 계속 받을 수 있게.
  jobLog?: JobLogService;
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
  // 어드민이 cancelSummaryForPlace 호출 시 placeId 가 등록된다. run() 의
  // 청크 루프가 매 청크 진입 직전에 이 set 을 확인해 자기 자신을 종료한다.
  // 새 queueSummariesForReviews 호출(=다시 시작) 시 자연 해제된다.
  private readonly cancelledPlaces = new Set<string>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiConfig: AiConfigService,
    private readonly opts: SummaryServiceOptions = {},
  ) {}

  // jobId 는 크롤 잡 컨텍스트에서 호출됐을 때 함께 흘려보낸 식별자. 같은
  // placeId 라도 잡이 바뀌면 새 jobId 로 묶여 로그 패널이 잡 단위 흐름을
  // 표시할 수 있다. backfillForRestaurant 같이 잡 컨텍스트 없는 경로는 null.
  //
  // 호출 즉시 (chain 밖에서) reviewIds 전부를 status='queued' 로 upsert 하여
  // DB 흔적을 남긴다 — chain 메모리 큐가 서버 재시작에 휘발되더라도 어디
  // 까지 적재됐는지 영구 보존된다. createMany 는 fire-and-forget — 호출자
  // (크롤러) 가 await 하지 않아도 직후 SQLite writer 가 처리하므로 짧은
  // 윈도우 안에 박힌다. 이 윈도우 동안 발생하는 재시작은 막을 수 없지만,
  // 기존엔 49 batches × 60s = 49 분이었던 휘발 윈도우가 ms 단위로 줄어든다.
  // modelOverride: 주어지면 이 batch 의 run() 이 DB defaultModel 대신 이 모델로
  // 요약한다. 단건 재요약(어드민이 모델을 골라 1회성으로 다시 요약)에서만 쓰며,
  // 전역 설정은 건드리지 않는다. null 이면 기존대로 defaultModel 사용.
  queueSummariesForReviews(
    placeId: string,
    reviewIds: string[],
    jobId: string | null = null,
    modelOverride: string | null = null,
  ): void {
    if (reviewIds.length === 0) return;

    // 어드민이 이 placeId 의 요약 중지를 누른 상태면 새로 들어오는 batch 도
    // 즉시 'cancelled' 로 박고 chain 에는 등록하지 않는다. 크롤이 진행 중이라
    // persistBatch 가 페이지마다 호출하더라도 cancel 효과가 유지됨. 해제는
    // backfillForRestaurant (reanalyze 라우트) 가 명시적으로 한다.
    if (this.cancelledPlaces.has(placeId)) {
      this.log?.warn(
        { placeId, count: reviewIds.length, jobId },
        '[summary] queue arrived while cancelled — marking as cancelled',
      );
      void this.prisma.reviewSummary
        .createMany({
          data: reviewIds.map((id) => ({
            reviewId: id,
            status: 'cancelled',
            errorCode: 'cancelled_by_user',
            errorMessage: 'Admin cancelled the summary job',
            finishedAt: new Date(),
          })),
        })
        .catch(async () => {
          for (const id of reviewIds) {
            try {
              await this.prisma.reviewSummary.upsert({
                where: { reviewId: id },
                create: {
                  reviewId: id,
                  status: 'cancelled',
                  errorCode: 'cancelled_by_user',
                  errorMessage: 'Admin cancelled the summary job',
                  finishedAt: new Date(),
                },
                update: {
                  // 이미 done/failed 면 그대로 두기. queued/pending 만 cancelled 로.
                  status: 'cancelled',
                  errorCode: 'cancelled_by_user',
                  errorMessage: 'Admin cancelled the summary job',
                  finishedAt: new Date(),
                },
              });
            } catch {
              // 한 행 실패는 무시.
            }
          }
        })
        .then(() => this.bus.publish(placeId));
      return;
    }

    const prev = this.runChainByPlace.get(placeId);
    // chained=true 이면 이전 batch 의 run() 이 아직 안 끝나 뒤에 줄을 선 것.
    // 크롤 페이지가 빠르게 넘어오면 여러 batch 가 같은 placeId chain 에 쌓이고,
    // run() 은 placeId 단위로 순차 실행된다 (다른 place 는 병렬).
    this.log?.info(
      { placeId, count: reviewIds.length, chained: prev !== undefined, jobId },
      '[summary] queued',
    );
    if (jobId) {
      void this.opts.jobLog?.log({
        jobId,
        placeId,
        stage: 'summary_queue',
        level: 'info',
        message: '요약 큐 적재',
        meta: {
          reviewCount: reviewIds.length,
          chained: prev !== undefined,
        },
        channel: 'summary',
      });
    }
    // 적재 흔적 영속화 (chain 밖, 즉시). SQLite 는 writer 가 직렬화되므로
    // createMany 일괄. UNIQUE(reviewId) 충돌 시 createMany 전체가 거부되니
    // 충돌 발생하면 행 단위 upsert 로 fallback — 재크롤 등으로 같은 reviewId
    // 가 다시 들어오는 경우만 해당.
    void this.prisma.reviewSummary
      .createMany({
        data: reviewIds.map((id) => ({ reviewId: id, status: 'queued' })),
      })
      .catch(async () => {
        for (const id of reviewIds) {
          try {
            await this.prisma.reviewSummary.upsert({
              where: { reviewId: id },
              create: { reviewId: id, status: 'queued' },
              update: {}, // 이미 행 있으면 손대지 않음
            });
          } catch {
            // 한 행 실패는 무시 — 다른 행이라도 박히게.
          }
        }
      })
      .then(() => this.bus.publish(placeId));

    const next = (prev ?? Promise.resolve())
      .then(() => this.run(placeId, reviewIds, jobId, modelOverride))
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

  // 어드민이 "이 가게 요약 중지" 누르면 호출. 동작:
  //   1) cancelledPlaces 에 placeId 등록 — 다음 청크 진입 직전에 run() 가 자기
  //      자신을 종료한다. 진행 중 청크는 끝까지 흘러간 뒤 자연 종료.
  //   2) chain map 에서 placeId 키 제거 — 새 enqueue 가 fresh chain 으로.
  //   3) DB 의 'queued'/'pending' 행을 'cancelled' 로 마킹. 'running' 은 손대지
  //      않음 — 청크가 끝나면서 done/failed 로 자연 마감된다.
  // 반환: 'cancelled' 로 마킹된 행 수.
  async cancelSummaryForPlace(placeId: string): Promise<number> {
    this.cancelledPlaces.add(placeId);
    this.runChainByPlace.delete(placeId);

    // restaurant 찾아 그 식당의 queued/pending 행만 한정해 cancelled 마킹.
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { placeId },
      select: { id: true },
    });
    if (!restaurant) {
      this.log?.warn({ placeId }, '[summary] cancel: restaurant not found');
      return 0;
    }
    const res = await this.prisma.reviewSummary.updateMany({
      where: {
        review: { restaurantId: restaurant.id },
        status: { in: ['queued', 'pending'] },
      },
      data: {
        status: 'cancelled',
        errorCode: 'cancelled_by_user',
        errorMessage: 'Admin cancelled the summary job',
        finishedAt: new Date(),
      },
    });
    this.log?.warn(
      { placeId, cancelled: res.count },
      '[summary] cancelled by admin',
    );
    this.bus.publish(placeId);
    return res.count;
  }

  // 어드민이 "요약 재개" 누름. cancelSummaryForPlace 로 'cancelled' 가 된
  // 행들만 골라 다시 큐잉한다. 동작:
  //   1) cancelledPlaces 에서 placeId 풀어줘 새 batch 가 정상 흐름으로.
  //   2) 'cancelled' 행을 'queued' 로 즉시 flip — UI 가 재개를 바로 반영.
  //      (queueSummariesForReviews 의 createMany 는 UNIQUE 충돌로 fallback
  //       upsert 의 update:{} 를 타서 상태를 안 바꾼다. 미리 우리가 풀어둠.)
  //   3) queueSummariesForReviews 로 chain 등록 — run() 진입 시 'pending' 으
  //      로 자연 전환.
  // backfillForRestaurant 와 분리한 이유: reanalyze 는 failed/done(구버전)
  // 까지 한꺼번에 다시 돌리는 광범위 액션이고, resume 은 사용자의 명시 중지
  // 만 되돌리는 좁은 의도라 UI 도 별도 버튼이 더 명확하다.
  // 반환: 재큐잉된 reviewId 수.
  async resumeSummaryForPlace(placeId: string): Promise<number> {
    this.cancelledPlaces.delete(placeId);

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { placeId },
      select: { id: true },
    });
    if (!restaurant) {
      this.log?.warn({ placeId }, '[summary] resume: restaurant not found');
      return 0;
    }

    const targets = await this.prisma.reviewSummary.findMany({
      where: {
        review: { restaurantId: restaurant.id },
        status: 'cancelled',
      },
      select: { reviewId: true },
    });
    if (targets.length === 0) {
      this.log?.info({ placeId }, '[summary] resume: no cancelled rows');
      return 0;
    }
    const reviewIds = targets.map((t) => t.reviewId);

    await this.prisma.reviewSummary.updateMany({
      where: {
        reviewId: { in: reviewIds },
        status: 'cancelled',
      },
      data: {
        status: 'queued',
        errorCode: null,
        errorMessage: null,
        finishedAt: null,
      },
    });
    this.bus.publish(placeId);

    this.queueSummariesForReviews(placeId, reviewIds);
    this.log?.warn(
      { placeId, resumed: reviewIds.length },
      '[summary] resumed by admin',
    );
    return reviewIds.length;
  }

  // 백필 — 한 식당의 분석되지 않았거나 구버전(analysisVersion < 현재) 행을
  // 모두 다시 큐잉. 재크롤은 리뷰를 통째로 날리므로 부담이 크다. 이 경로는
  // 리뷰 텍스트는 그대로 두고 분석만 다시 채운다.
  // 어드민의 명시적 "다시 시도" 액션이므로 직전 cancel 표식도 함께 해제한다.
  // 반환: 큐잉된 reviewId 수.
  async backfillForRestaurant(placeId: string): Promise<number> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { placeId },
      select: { id: true },
    });
    if (!restaurant) return 0;

    // 어드민이 reanalyze 를 누른 시점 = "이제 다시 진행해" — cancel 표식 해제.
    // 해제 전에 cancelled 행을 queueSummariesForReviews 로 다시 태우려면 순서
    // 가 중요: 먼저 풀어줘야 그 다음 호출이 정상 흐름으로 들어간다.
    this.cancelledPlaces.delete(placeId);

    // failed/cancelled/구버전 done 모두 대상 — 새 프롬프트/모델 또는 사용자
    // 의도 변경으로 다시 시도할 가치가 있음. 이미 진행 중(queued/pending/
    // running)인 행은 건드리지 않는다.
    const targets = await this.prisma.reviewSummary.findMany({
      where: {
        review: { restaurantId: restaurant.id },
        OR: [
          { status: 'failed' },
          { status: 'cancelled' },
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

  // 단건 리뷰 재요약 — 어드민이 모델을 골라 그 리뷰 하나만 다시 요약한다.
  // reanalyze(식당 전체) 와 달리 범위가 1건이고, 고른 모델을 1회성으로 적용
  // (전역 defaultModel 은 안 바뀐다). 진행/결과는 기존 summary-events SSE 로
  // 흘러간다 — bus 채널 키를 reanalyze 와 동일 규칙으로 맞춰 같은 connection
  // 이 그대로 받는다.
  // 반환: SSE 구독 키로 쓸 placeId (Naver). placeId 없는 행(DC 등)은 null.
  async resummarizeReview(
    reviewId: string,
    model: string,
  ): Promise<{ placeId: string | null }> {
    const review = await this.prisma.visitorReview.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        restaurant: { select: { placeId: true, source: true, sourceId: true } },
      },
    });
    if (!review) return { placeId: null };
    const rest = review.restaurant;
    // bus/SSE 채널 키 — summary-events 핸들러와 동일 규칙 (Naver=placeId,
    // DC=dc:<sourceId>). 그래야 디테일 페이지의 기존 SSE 구독이 그대로 받는다.
    const channelKey =
      rest.source === 'naver' && rest.placeId
        ? rest.placeId
        : `dc:${rest.sourceId}`;
    // 어드민의 명시적 액션이므로 직전 중지 표식이 있으면 해제 후 큐잉
    // (backfillForRestaurant 와 동일 — 안 풀면 queue 가 cancelled 로 박힌다).
    this.cancelledPlaces.delete(channelKey);
    this.queueSummariesForReviews(channelKey, [review.id], null, model);
    return { placeId: rest.source === 'naver' ? rest.placeId : null };
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
    await this.run(placeId, reviewIds, null);
  }

  private get bus(): SummaryEventsBus {
    return this.opts.bus ?? summaryEventsBus;
  }

  private get log(): FastifyBaseLogger | null {
    return this.opts.logger ?? null;
  }

  // jobId 가 있으면 모든 단계 로그를 'summary' 채널 (placeId 별 SSE) 로
  // 흘려보낸다. null 이면 pino 로그만 남기고 SSE/DB 영속화 skip — 백필 같이
  // 어드민이 직접 트리거하지 않은 경로용.
  private logToJob = (
    jobId: string | null,
    placeId: string,
    stage: string,
    level: 'info' | 'warn' | 'error',
    message: string,
    meta?: Record<string, unknown>,
  ): void => {
    if (!jobId) return;
    void this.opts.jobLog?.log({
      jobId,
      placeId,
      stage,
      level,
      message,
      ...(meta ? { meta } : {}),
      channel: 'summary',
    });
  };

  private async run(
    placeId: string,
    reviewIds: string[],
    jobId: string | null,
    modelOverride: string | null = null,
  ): Promise<void> {
    if (reviewIds.length === 0) return;
    const startedAt = new Date();
    const total = reviewIds.length;
    this.log?.info({ placeId, total, version: ANALYSIS_VERSION }, '[summary] queue start');
    this.logToJob(jobId, placeId, 'summary_run', 'info', '요약 실행 시작', {
      total,
      version: ANALYSIS_VERSION,
    });

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

    const resolved = await this.resolveProvider(modelOverride);
    if (!resolved) {
      // No key / no model / disabled — leave rows pending. Admin can fix
      // config and re-trigger via recrawl. We don't fail loud because the
      // primary path (crawling reviews) succeeded; summaries are auxiliary.
      this.log?.warn(
        { placeId, total },
        '[summary] no provider/model resolved — rows left pending',
      );
      this.logToJob(
        jobId,
        placeId,
        'summary_run',
        'warn',
        'AI provider/model 미설정 — 요약 보류',
        { total },
      );
      return;
    }
    const { provider, model } = resolved;
    this.log?.info({ placeId, total, model }, '[summary] provider resolved');
    this.logToJob(jobId, placeId, 'summary_run', 'info', 'provider 해석 완료', {
      model,
    });

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
      // 어드민이 cancelSummaryForPlace 를 호출했으면 매 청크 진입 직전에 끝낸다.
      // 진행 중이던 직전 청크의 LLM 호출은 이미 완료된 상태 — 그 비용은 살린다.
      if (this.cancelledPlaces.has(placeId)) {
        this.log?.info(
          { placeId, processed: doneCount + failCount + parseFailCount, total },
          '[summary] cancelled by admin, exiting chunk loop',
        );
        this.logToJob(jobId, placeId, 'summary_run', 'warn', '요약 중지 — 어드민 요청', {
          processed: doneCount + failCount + parseFailCount,
          total,
        });
        return;
      }
      const chunk = reviews.slice(i, i + chunkSize);
      const chunkIdx = Math.floor(i / chunkSize) + 1;
      const chunkTotal = Math.ceil(reviews.length / chunkSize);
      const chunkStartedAt = Date.now();
      this.log?.info(
        { placeId, chunk: `${chunkIdx}/${chunkTotal}`, size: chunk.length },
        '[summary] chunk start',
      );
      this.logToJob(jobId, placeId, 'summary_chunk', 'info', '청크 시작', {
        chunkIndex: chunkIdx,
        chunkTotal,
        size: chunk.length,
      });
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
      ): Promise<{ outcome: ReviewAttemptOutcome; traces: AttemptTrace[] }> => {
        const traces: AttemptTrace[] = [];
        let last: ReviewAttemptOutcome | null = null;
        for (let attempt = 0; attempt < RETRY_LIMIT; attempt += 1) {
          let delayMs = 0;
          if (attempt > 0) {
            delayMs = 300 * attempt + Math.floor(Math.random() * 200);
            await new Promise((res) => setTimeout(res, delayMs));
            const prevErr = last && !last.ok ? last : null;
            this.log?.info(
              {
                placeId,
                reviewId: r.id,
                attempt: attempt + 1,
                prev: prevErr?.errorCode,
                prevHttpStatus: prevErr?.httpStatus ?? null,
                prevMessage: prevErr?.message.slice(0, 80) ?? null,
                delayMs,
              },
              '[summary] retry',
            );
            this.logToJob(
              jobId,
              placeId,
              'summary_retry',
              'warn',
              `재시도 ${attempt + 1}/${RETRY_LIMIT}`,
              {
                reviewId: r.id,
                attempt: attempt + 1,
                prevErrorCode: prevErr?.errorCode ?? null,
                prevHttpStatus: prevErr?.httpStatus ?? null,
                prevMessage: prevErr?.message.slice(0, 200) ?? null,
                delayMs,
              },
            );
          }
          const startedAt = Date.now();
          last = await this.attemptOnce(provider, model, r);
          const tookMs = Date.now() - startedAt;
          traces.push({
            attempt: attempt + 1,
            ok: last.ok,
            errorCode: last.ok ? null : last.errorCode,
            message: last.ok ? null : last.message,
            httpStatus: last.ok ? null : last.httpStatus,
            model: last.ok ? last.model : last.model,
            tookMs,
            delayMs,
          });
          if (last.ok) return { outcome: last, traces };
        }
        return { outcome: last!, traces };
      };

      const attemptResults = await Promise.all(
        chunk.map((r) => attemptForReview(r)),
      );
      const attempts = attemptResults.map((x) => x.outcome);
      const tracesByIdx = attemptResults.map((x) => x.traces);

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
          const reviewRow = chunk[idx]!;
          const traces = tracesByIdx[idx]!;
          this.log?.warn(
            {
              placeId,
              reviewId,
              bodyLen: reviewRow.body.length,
              rating: reviewRow.rating,
              authorName: reviewRow.authorName,
              provider: 'ollama-cloud',
              model,
              attempts: traces,           // 시도별 전체 이력 (errorCode, httpStatus, tookMs, delayMs, model, message 전체)
              attemptCount: traces.length,
              finalErrorCode: a.errorCode,
              finalHttpStatus: a.httpStatus,
              // cap 없이 원본 — parse_failed 일 때 raw text 500자, upstream 일 때 응답 body 그대로.
              finalMessage: a.message,
            },
            '[summary] all retries exhausted',
          );
          this.logToJob(
            jobId,
            placeId,
            'summary_failed',
            'error',
            `요약 실패 (${a.errorCode})`,
            {
              reviewId,
              attemptCount: traces.length,
              errorCode: a.errorCode,
              httpStatus: a.httpStatus,
              model: a.model,
              // parse_failed 디버깅용 응답 앞 200자. upstream/timeout 도 동일.
              rawSnippet: a.message.slice(0, 200),
              attempts: traces.map((t) => ({
                attempt: t.attempt,
                ok: t.ok,
                errorCode: t.errorCode,
                httpStatus: t.httpStatus,
                tookMs: t.tookMs,
                delayMs: t.delayMs,
              })),
            },
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
      this.logToJob(jobId, placeId, 'summary_chunk', 'info', '청크 완료', {
        chunkIndex: chunkIdx,
        chunkTotal,
        tookMs: Date.now() - chunkStartedAt,
        progress: `${doneCount + failCount + parseFailCount}/${total}`,
        done: doneCount,
        failed: failCount,
        parseFailed: parseFailCount,
      });
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
    this.logToJob(
      jobId,
      placeId,
      'summary_run',
      failCount + parseFailCount > 0 ? 'warn' : 'info',
      '요약 실행 완료',
      {
        total,
        done: doneCount,
        failed: failCount,
        parseFailed: parseFailCount,
        tookMs: Date.now() - startedAt.getTime(),
      },
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
        httpStatus: null,
      };
    } catch (e) {
      const { error, message } = classifyError(e);
      const httpStatus = e instanceof LLMUpstreamError ? e.status : null;
      return { ok: false, errorCode: error, message, model: null, httpStatus };
    }
  }

  // modelOverride 가 주어지면 (단건 재요약) 그 모델을 쓴다. 키/baseUrl 은 여전히
  // DB/env 의 ollama-cloud chat 설정에서 가져오고 모델 id 만 갈아끼운다 — 전역
  // defaultModel 은 건드리지 않는다.
  private async resolveProvider(
    modelOverride?: string | null,
  ): Promise<{ provider: LLMProvider; model: string } | null> {
    if (this.opts.resolveOverride) return this.opts.resolveOverride();

    const resolved = await this.aiConfig.getResolved('ollama-cloud', 'chat');
    if (!resolved) return null;
    const model = modelOverride?.trim() || resolved.defaultModel?.trim();
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

// 부팅 직후 호출. ReviewSummary 의 status='queued'|'pending'|'running' 행은
// 직전 인스턴스가 적재/실행 중 비정상 종료되며 남긴 stale — 단일 Fastify
// 인스턴스 가정(CLAUDE.md) 하에서 부팅 시점엔 실행 중인 요약 작업이 없다.
// 그대로 두면 어드민 목록의 진행도 합산이 영원히 "진행중" 으로 남는다.
// failed + errorCode='server_restart' 로 마킹하면 기존 재요약 경로
// (backfillForRestaurant → failed 행을 다시 'queued' 로 upsert) 와 자연스럽
// 게 호환되고, rescheduleStaleSummaries 가 같은 placeId 의 행들을 묶어
// 자동 재큐잉할 수 있다.
export const cleanupStaleReviewSummaries = async (
  prisma: PrismaClient,
  log?: FastifyBaseLogger | null,
): Promise<number> => {
  const res = await prisma.reviewSummary.updateMany({
    where: { status: { in: ['queued', 'pending', 'running'] } },
    data: {
      status: 'failed',
      errorCode: 'server_restart',
      errorMessage: 'Server restarted while summary was in progress',
      finishedAt: new Date(),
    },
  });
  if (res.count > 0) {
    log?.warn(
      { count: res.count },
      '[summary] cleaned up stale queued/pending/running rows on boot',
    );
  }
  return res.count;
};

// 부팅 시 cleanupStaleReviewSummaries 직후 호출. 방금 server_restart 로
// 마킹된 행들 + 이전 인스턴스에서 server_restart 로 남아있던 행들을 placeId
// 단위로 묶어 자동 재큐잉한다. 어드민이 수동으로 reanalyze 안 눌러도 직전
// 재시작 이전에 진행 중이던 요약을 알아서 재개.
//
// `failed AND errorCode='server_restart'` 행만 대상으로 한정 — parse_failed/
// upstream 같은 LLM 에러는 어드민이 의도적으로 분류·재시도해야 할 수 있어
// 자동 재큐잉에서 빼둔다.
//
// placeId 가 null 인 Restaurant (예: source='diningcode') 행은 'dc:<vRid>'
// 채널키로 큐잉 — saveDiningcodeShop 의 패턴과 동일. summary 큐 chain key 는
// 자유 문자열이라 placeId 와 충돌 안 함.
//
// jobId 는 null — 부팅 시점엔 잡 컨텍스트가 없으므로 crawl_job_logs 로 흐르
// 지 않고 pino 로그에만 남는다.
export const rescheduleStaleSummaries = async (
  prisma: PrismaClient,
  summaries: { queueSummariesForReviews: (key: string, ids: string[], jobId?: string | null) => Promise<void> | void },
  log?: FastifyBaseLogger | null,
): Promise<{ keys: number; reviews: number }> => {
  const rows = await prisma.reviewSummary.findMany({
    where: {
      status: 'failed',
      errorCode: 'server_restart',
    },
    select: {
      reviewId: true,
      review: {
        select: {
          restaurant: {
            select: { placeId: true, source: true, sourceId: true },
          },
        },
      },
    },
  });
  if (rows.length === 0) return { keys: 0, reviews: 0 };

  // 큐 채널 키별로 reviewId 묶기. Naver 는 placeId, DC 는 'dc:<vRid>'.
  const groups = new Map<string, string[]>();
  for (const r of rows) {
    const rest = r.review.restaurant;
    const key =
      rest.source === 'naver' && rest.placeId
        ? rest.placeId
        : `${rest.source.slice(0, 2)}:${rest.sourceId}`;
    let list = groups.get(key);
    if (!list) {
      list = [];
      groups.set(key, list);
    }
    list.push(r.reviewId);
  }

  for (const [key, ids] of groups) {
    await summaries.queueSummariesForReviews(key, ids, null);
  }
  log?.warn(
    { keys: groups.size, reviews: rows.length },
    '[summary] rescheduled stale (server_restart) rows on boot',
  );
  return { keys: groups.size, reviews: rows.length };
};

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
