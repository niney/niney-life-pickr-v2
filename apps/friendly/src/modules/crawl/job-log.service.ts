import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type { CrawlEventType, CrawlLogLevelType } from '@repo/api-contract';
import { jobRegistry, type JobRegistry } from './job-registry.js';
import {
  summaryEventsBus,
  type SummaryEventsBus,
} from '../summary/summary-events-bus.js';

// 크롤+요약 파이프라인의 단계별 로그를 세 곳에 동시에 흘려보내는 단일
// 진입점.
//
//   1) pino 로거(app.log) — 운영 콘솔/파일.
//   2) prisma.crawlJobLog — 영속화. 잡 종료 후 패널 재진입 시에도 조회 가능.
//   3) SSE 채널 — 'crawl' 은 jobRegistry(=/jobs/:id/events) 로, 'summary' 는
//      summaryEventsBus(=/summary-events) 로 흘려보낸다. 두 스트림은 인증
//      경로가 달라 한 쪽으로 통합하지 않는다.
//
// channel 인자가 어느 SSE 로 보낼지 결정. summary 단계 로그는 placeId 기준
// 으로 라우팅돼서 크롤 잡이 done 으로 SSE 를 닫은 뒤에도 어드민 UI 가 계속
// 받을 수 있다.
//
// DB 쓰기는 fire-and-forget — 실패해도 크롤/요약을 막지 않는다. SSE 와 콘솔
// 로그는 정상 동작하므로 운영자가 흔적 자체를 잃지는 않음.
export type JobLogChannel = 'crawl' | 'summary' | 'none';

export interface JobLogInput {
  jobId: string;
  placeId?: string | null;
  stage: string;
  level: CrawlLogLevelType;
  message: string;
  meta?: Record<string, unknown>;
  // 'crawl' — jobRegistry 의 SSE 채널.
  // 'summary' — summaryEventsBus 의 placeId 별 SSE.
  // 'none' — DB + pino 만 (테스트/백필 같이 외부 구독자가 없을 때).
  channel: JobLogChannel;
}

export class JobLogService {
  private nextSeq: () => number;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly registry: JobRegistry = jobRegistry,
    private readonly bus: SummaryEventsBus = summaryEventsBus,
    private readonly logger: FastifyBaseLogger | null = null,
    nextSeqProvider?: () => number,
  ) {
    // SSE 의 seq 는 잡 전역으로 모노톤. 외부에서 같은 카운터를 공유하면
    // 클라이언트가 progress/log/visitor_batch 를 같은 시퀀스 축으로 정렬할 수
    // 있어 좋지만, 우선은 자체 카운터로 시작. CrawlService 가 자체 nextSeq 를
    // 쓰므로 그쪽과 충돌하지 않게 큰 음수 영역에서 시작 — registry 가 seq 를
    // 모노톤성만 검증하지 않는 한 안전. (현재 코드는 검증하지 않는다.)
    let n = 1;
    this.nextSeq = nextSeqProvider ?? (() => n++);
  }

  async log(input: JobLogInput): Promise<void> {
    const at = new Date();
    const atIso = at.toISOString();
    const placeId = input.placeId ?? null;

    // 1) pino 로거. info/warn/error 분기로 출력 레벨도 그대로 옮겨준다.
    if (this.logger) {
      const payload = {
        jobId: input.jobId,
        placeId,
        stage: input.stage,
        ...(input.meta ?? {}),
      };
      if (input.level === 'error') this.logger.error(payload, input.message);
      else if (input.level === 'warn') this.logger.warn(payload, input.message);
      else this.logger.info(payload, input.message);
    }

    // 2) SSE — 잡 종료 후에는 jobRegistry 에 addEvent 가 효과 없을 수 있어
    //    실패해도 무시. 채널 'none' 은 SSE 안 함.
    if (input.channel === 'crawl') {
      try {
        const event: CrawlEventType = {
          type: 'log',
          level: input.level,
          stage: input.stage,
          message: input.message,
          ...(input.meta ? { meta: input.meta } : {}),
          seq: this.nextSeq(),
          at: atIso,
        };
        this.registry.addEvent(input.jobId, event);
      } catch {
        // job 이 이미 사라졌거나 등록 안 됨 — 영속 채널은 계속 진행.
      }
    } else if (input.channel === 'summary' && placeId) {
      try {
        this.bus.publish(placeId, {
          type: 'log',
          jobId: input.jobId,
          stage: input.stage,
          level: input.level,
          message: input.message,
          meta: input.meta ?? null,
          at: atIso,
        });
      } catch {
        // bus 가 던지지 않게 막혀있지만 방어적으로.
      }
    }

    // 3) DB 영속화. fire-and-forget — 실패해도 흐름 차단 X.
    void this.prisma.crawlJobLog
      .create({
        data: {
          jobId: input.jobId,
          placeId,
          stage: input.stage,
          level: input.level,
          message: input.message,
          meta: input.meta ? JSON.stringify(input.meta) : null,
          createdAt: at,
        },
      })
      .catch((err) => {
        // DB 실패는 콘솔에만 — 무한 루프 방지를 위해 logger 도 거치지 않음.
        // eslint-disable-next-line no-console
        console.error('[job-log] persist failed', err);
      });
  }
}
