// 집값 거래 자동 갱신 — croner 로 HOUSING_REFRESH_CRON(Asia/Seoul) 마다 최근 HOUSING_REFRESH_MONTHS 개월
// 파티션을 다시 받고(신고 지연 30일·해제 반영) 파생 표를 재계산한다. 단일 인스턴스 인프로세스(CLAUDE.md
// no-Redis) — 동시 실행 가드는 인스턴스 플래그 하나. 서버에서는 VWorld 지오코더를 부르지 않는다(새 rtms
// 단지는 캐시에 있을 때만 좌표를 얻고, 나머지는 스크립트가 온라인으로 채운다).
//
// 실행 로직은 스크립트(load:housing-trades)와 같은 runHousingTradeIngest·rebuildHousingDerived 를 그대로
// 쓴다. cron 이 비면 등록하지 않는다(스크립트로만 갱신).

import { Cron } from 'croner';
import type { PrismaClient } from '@prisma/client';
import { housingCurrentYm, housingYmAdd, housingYmRange } from '@repo/utils';
import { rebuildHousingDerived, type HousingDerivedReport } from './housing-derived.service.js';
import { listHousingSggCds, runHousingTradeIngest, type HousingIngestReport } from './housing-ingest.service.js';

interface LoggerLike {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export interface HousingRefreshDeps {
  prisma: PrismaClient;
  log: LoggerLike;
  // 빈 문자열이면 스케줄 등록 안 함.
  cron: string;
  months: number;
  serviceKey: string;
  timezone?: string;
  now?: () => Date;
  // 테스트 주입.
  ingest?: typeof runHousingTradeIngest;
  derive?: typeof rebuildHousingDerived;
}

export interface HousingRefreshResult {
  yms: string[];
  ingest: HousingIngestReport;
  derived: HousingDerivedReport | null;
  startedAt: string;
  finishedAt: string;
}

export class HousingRefreshScheduler {
  private cron: Cron | null = null;
  private running = false;
  lastResult: HousingRefreshResult | null = null;

  constructor(private readonly deps: HousingRefreshDeps) {}

  start(): void {
    if (!this.deps.cron) return;
    this.stop();
    this.cron = new Cron(
      this.deps.cron,
      { timezone: this.deps.timezone ?? 'Asia/Seoul', name: 'housing-refresh', unref: true, catch: true },
      () => {
        void this.refreshRecent('cron');
      },
    );
    this.deps.log.info({ cron: this.deps.cron, months: this.deps.months, nextRun: this.cron.nextRun()?.toISOString() ?? null }, '[housing] 거래 자동 갱신 등록');
  }

  stop(): void {
    this.cron?.stop();
    this.cron = null;
  }

  nextRun(): Date | null {
    return this.cron?.nextRun() ?? null;
  }

  isRunning(): boolean {
    return this.running;
  }

  // 최근 N개월 재수집 + 파생 재구축. 겹치면 null(skip). 키·단지 마스터 없으면 warn 후 null.
  async refreshRecent(trigger: 'cron' | 'manual'): Promise<HousingRefreshResult | null> {
    if (this.running) {
      this.deps.log.warn({ trigger }, '[housing] 이전 갱신이 진행 중이라 건너뜀');
      return null;
    }
    if (!this.deps.serviceKey) {
      this.deps.log.warn({ trigger }, '[housing] DATA_GO_KR_API_KEY가 없어 갱신 건너뜀');
      return null;
    }
    this.running = true;
    const startedAt = (this.deps.now?.() ?? new Date()).toISOString();
    try {
      const sggCds = await listHousingSggCds(this.deps.prisma);
      if (sggCds.length === 0) {
        this.deps.log.warn({ trigger }, '[housing] 단지 마스터가 없어 갱신 건너뜀 — load:housing-complexes 먼저');
        return null;
      }
      const to = housingCurrentYm(this.deps.now?.() ?? new Date());
      const yms = housingYmRange(housingYmAdd(to, -(Math.max(1, this.deps.months) - 1)), to);
      this.deps.log.info({ trigger, yms, sggCds: sggCds.length }, '[housing] 거래 갱신 시작');
      const ingest = await (this.deps.ingest ?? runHousingTradeIngest)(this.deps.prisma, {
        serviceKey: this.deps.serviceKey,
        yms,
        sggCds,
        force: true,
      });
      let derived: HousingDerivedReport | null = null;
      if (ingest.authError) {
        this.deps.log.error({ trigger, code: ingest.authError.code, requestUrl: ingest.authError.requestUrl }, `[housing] RTMS 인증 오류로 중단: ${ingest.authError.message}`);
      } else {
        derived = await (this.deps.derive ?? rebuildHousingDerived)(this.deps.prisma, { geocode: { key: '', offline: true } });
        await this.deps.prisma.housingSync.createMany({
          data: [
            { kind: 'trade', count: ingest.byType.trade, sourceFile: `rtms:${yms[0]}-${yms[yms.length - 1]}` },
            { kind: 'rent', count: ingest.byType.jeonse + ingest.byType.monthly, sourceFile: `rtms:${yms[0]}-${yms[yms.length - 1]}` },
          ],
        });
      }
      const finishedAt = (this.deps.now?.() ?? new Date()).toISOString();
      const result: HousingRefreshResult = { yms, ingest, derived, startedAt, finishedAt };
      this.lastResult = result;
      this.deps.log.info(
        {
          trigger,
          partitions: `${ingest.done}/${ingest.planned}`,
          calls: ingest.calls,
          rows: ingest.rows,
          transientErrors: ingest.transientErrors,
          stoppedBy: ingest.stoppedBy,
          stats: derived?.stats ?? null,
          createdRtms: derived?.createdRtms ?? null,
        },
        '[housing] 거래 갱신 완료',
      );
      return result;
    } catch (e) {
      this.deps.log.error({ trigger, err: e }, '[housing] 거래 갱신 실패');
      return null;
    } finally {
      this.running = false;
    }
  }
}
