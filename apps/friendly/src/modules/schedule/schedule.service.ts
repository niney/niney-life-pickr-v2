import { Cron } from 'croner';
import type { PrismaClient, ScheduleRun as PrismaScheduleRun } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type {
  ScheduleConfigInputType,
  ScheduleConfigType,
  ScheduleJobTypeType,
  SchedulePreviewResultType,
  ScheduleRunListType,
  ScheduleRunStatusType,
  ScheduleRunType,
  ScheduleTriggerType,
} from '@repo/api-contract';
import { jobRegistry } from '../crawl/job-registry.js';
import { AnalyticsError, type AnalyticsService } from '../analytics/analytics.service.js';
import type { MenuGroupingService } from '../menu-grouping/menu-grouping.service.js';
import { scheduleRegistry } from './schedule-registry.js';

// 현재 단일 작업 — "정규화 → 글로벌 머지" 파이프라인. 추후 다른 주기 작업이
// 생기면 jobType 으로 분기.
const JOB_TYPE: ScheduleJobTypeType = 'normalize-merge';
// 기본 권장 주기 — 매일 03:00 (야간 배치). 어드민이 바꾸기 전 초기값.
const DEFAULT_CRON = '0 3 * * *';
const DEFAULT_TZ = 'Asia/Seoul';
const RUN_HISTORY_LIMIT = 50;
// 한 번의 주기에서 처리할 최대 식당 수. 초과분은 멱등하므로 다음 주기에 처리.
const MAX_TARGETS_PER_RUN = 200;

export interface ScheduleServiceDeps {
  menuGrouping: MenuGroupingService;
  analytics: AnalyticsService;
  logger?: FastifyBaseLogger;
}

export class ScheduleService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly deps: ScheduleServiceDeps,
  ) {}

  private get log(): FastifyBaseLogger | null {
    return this.deps.logger ?? null;
  }

  // ── 설정 ───────────────────────────────────────────────────────────

  // 현재 설정 — 행이 없으면 기본값으로 채워 반환(아직 한 번도 설정 안 한 상태).
  async getConfig(): Promise<ScheduleConfigType> {
    const row = await this.prisma.scheduleConfig.findUnique({
      where: { jobType: JOB_TYPE },
    });
    const enabled = row?.enabled ?? false;
    const cronExpr = row?.cronExpr ?? DEFAULT_CRON;
    const timezone = row?.timezone ?? DEFAULT_TZ;
    // 다음 실행 시각은 등록된 cron 에서 — disabled 면 cron 미등록이라 null.
    const nextRunAt = enabled
      ? (scheduleRegistry.nextRun(JOB_TYPE)?.toISOString() ?? null)
      : null;
    return {
      jobType: JOB_TYPE,
      enabled,
      cronExpr,
      timezone,
      lastRunAt: row?.lastRunAt?.toISOString() ?? null,
      lastStatus: (row?.lastStatus as ScheduleRunStatusType | null) ?? null,
      nextRunAt,
      updatedAt: row?.updatedAt?.toISOString() ?? new Date(0).toISOString(),
    };
  }

  // 설정 변경 → DB upsert → 스케줄러 즉시 재등록(런타임 reschedule).
  async updateConfig(input: ScheduleConfigInputType): Promise<ScheduleConfigType> {
    // 잘못된 cron 이면 throw — 라우트가 400 으로 변환.
    this.assertValidCron(input.cronExpr, input.timezone);
    await this.prisma.scheduleConfig.upsert({
      where: { jobType: JOB_TYPE },
      create: {
        jobType: JOB_TYPE,
        enabled: input.enabled,
        cronExpr: input.cronExpr,
        timezone: input.timezone,
      },
      update: {
        enabled: input.enabled,
        cronExpr: input.cronExpr,
        timezone: input.timezone,
      },
    });
    this.applySchedule(input.enabled, input.cronExpr, input.timezone);
    return this.getConfig();
  }

  // 스케줄러에 cron 등록/해제 — 부팅과 설정변경에서 공용. enabled 면 등록,
  // 아니면 해제. cron tick 은 manual 과 같은 경로(runScheduled)로 들어간다.
  applySchedule(enabled: boolean, cronExpr: string, timezone: string): void {
    if (enabled) {
      scheduleRegistry.setCron(JOB_TYPE, cronExpr, timezone, () => {
        void this.runScheduled('cron');
      });
      this.log?.info({ cronExpr, timezone }, '[schedule] cron registered');
    } else {
      scheduleRegistry.clearCron(JOB_TYPE);
      this.log?.info('[schedule] cron cleared (disabled)');
    }
  }

  // 부팅 시 1회 — 직전 인스턴스에서 running 으로 남은 run 을 interrupted 로
  // 정리하고, DB 설정을 읽어 cron 을 등록한다. server.ts 가 호출.
  async bootstrap(): Promise<void> {
    const stale = await this.prisma.scheduleRun.updateMany({
      where: { status: 'running' },
      data: { status: 'interrupted', finishedAt: new Date(), error: 'server restart' },
    });
    if (stale.count > 0) {
      this.log?.warn({ count: stale.count }, '[schedule] marked stale running runs as interrupted');
    }
    const cfg = await this.getConfig();
    this.applySchedule(cfg.enabled, cfg.cronExpr, cfg.timezone);
  }

  // ── 실행 ───────────────────────────────────────────────────────────

  // cron tick 또는 어드민 "지금 실행". 이전 실행이 안 끝났으면 skipped 한 행만
  // 남기고 반환(overlap 방지). 식당별 정규화는 멱등이라 재실행이 안전하다.
  async runScheduled(trigger: ScheduleTriggerType): Promise<ScheduleRunType> {
    const begun = scheduleRegistry.beginRun(JOB_TYPE, trigger);
    if (!begun) {
      const skipped = await this.prisma.scheduleRun.create({
        data: {
          jobType: JOB_TYPE,
          trigger,
          status: 'skipped',
          finishedAt: new Date(),
        },
      });
      this.log?.warn({ trigger }, '[schedule] run skipped — previous still in progress');
      return this.toRun(skipped);
    }

    const { runId, signal } = begun;
    await this.prisma.scheduleRun.create({
      data: { id: runId, jobType: JOB_TYPE, trigger, status: 'running' },
    });

    let status: ScheduleRunStatusType = 'done';
    let error: string | null = null;
    try {
      // 1) 대상 식당 수집 — "처리 필요" 식당 중 크롤 진행 중이 아닌 것.
      scheduleRegistry.setPhase('collecting');
      const targets = await this.collectTargets();
      scheduleRegistry.setTotal(targets.length);
      this.log?.info({ runId, targets: targets.length, trigger }, '[schedule] run started');

      // 2) 식당별 메뉴 정규화(증분) 순차 — 식당 경계에서 abort 체크.
      scheduleRegistry.setPhase('grouping');
      for (const t of targets) {
        if (signal.aborted) {
          status = 'interrupted';
          break;
        }
        // 수집 이후 크롤이 시작됐을 수 있으니 직전에 한 번 더 확인.
        if (jobRegistry.isPlaceCrawling(t.placeId)) {
          scheduleRegistry.incSkipped();
          continue;
        }
        scheduleRegistry.markProcessing(t.name);
        try {
          await this.deps.menuGrouping.groupForRestaurant(t.placeId);
          scheduleRegistry.incProcessed();
        } catch (e) {
          // 개별 식당 실패가 전체 주기를 죽이지 않게 — 로그만 남기고 계속.
          const msg = e instanceof Error ? e.message : String(e);
          this.log?.warn({ placeId: t.placeId, msg }, '[schedule] grouping failed for restaurant');
        }
      }

      // 3) 글로벌 머지(증분) — 중단 신호 없을 때만. 머지는 새로 추가된 그룹만
      //    포함하므로 보통 짧다. 식당 정규화 후에 한 번 돌려 전역 통계를 갱신.
      if (status !== 'interrupted' && !signal.aborted) {
        scheduleRegistry.markProcessing(null);
        scheduleRegistry.setPhase('merging');
        try {
          await this.deps.analytics.runGlobalMerge({ full: false });
        } catch (e) {
          // 머지할 입력이 없는 건 정상 — 그 외 에러만 실패로 전파.
          if (e instanceof AnalyticsError && e.code === 'no_inputs') {
            this.log?.info('[schedule] global merge skipped — no inputs');
          } else {
            throw e;
          }
        }
      } else {
        status = 'interrupted';
      }
    } catch (e) {
      status = 'failed';
      error = e instanceof Error ? e.message : String(e);
      this.log?.error({ runId, error }, '[schedule] run failed');
    }

    // finishRun 전에 카운트 스냅샷 확보(finishRun 이 status 를 바꾸기 전).
    const snap = scheduleRegistry.inflightSnapshot();
    scheduleRegistry.finishRun(status);

    const finishedAt = new Date();
    const updated = await this.prisma.scheduleRun.update({
      where: { id: runId },
      data: {
        status,
        error,
        finishedAt,
        totalTargets: snap?.totalTargets ?? null,
        processedCount: snap?.processedCount ?? 0,
        skippedCount: snap?.skippedCount ?? 0,
      },
    });
    await this.prisma.scheduleConfig.updateMany({
      where: { jobType: JOB_TYPE },
      data: { lastRunAt: finishedAt, lastStatus: status },
    });
    this.log?.info(
      { runId, status, processed: updated.processedCount, skipped: updated.skippedCount },
      '[schedule] run finished',
    );
    return this.toRun(updated);
  }

  // 처리 대상 = "처리 필요"(미분류 메뉴 있거나 구버전) 식당 − 현재 크롤 중인 것.
  // 기존 attention 정의(getRestaurantsStatus)를 그대로 재사용한다.
  private async collectTargets(): Promise<{ placeId: string; name: string }[]> {
    const status = await this.deps.menuGrouping.getRestaurantsStatus({
      attention: true,
      sort: 'unmapped',
      page: 1,
      pageSize: MAX_TARGETS_PER_RUN,
    });
    if (status.total > status.items.length) {
      this.log?.warn(
        { total: status.total, taken: status.items.length },
        '[schedule] attention restaurants exceed per-run cap; remainder will run next cycle',
      );
    }
    const targets: { placeId: string; name: string }[] = [];
    for (const r of status.items) {
      if (jobRegistry.isPlaceCrawling(r.placeId)) {
        scheduleRegistry.incSkipped();
        continue;
      }
      targets.push({ placeId: r.placeId, name: r.name });
    }
    return targets;
  }

  // ── 이력 ───────────────────────────────────────────────────────────

  async listRuns(): Promise<ScheduleRunListType> {
    const rows = await this.prisma.scheduleRun.findMany({
      where: { jobType: JOB_TYPE },
      orderBy: { startedAt: 'desc' },
      take: RUN_HISTORY_LIMIT,
    });
    return {
      items: rows.map((r) => this.toRun(r)),
      inflightRunId: scheduleRegistry.runningRunId(),
    };
  }

  // ── cron 미리보기/검증 ─────────────────────────────────────────────

  // 저장 전 cron 식 검증 + 다음 실행 시각 미리보기. 잘못된 식이면 valid=false.
  preview(cronExpr: string, timezone: string): SchedulePreviewResultType {
    try {
      const cron = new Cron(cronExpr, { timezone, paused: true });
      const nextRuns = cron.nextRuns(5).map((d) => d.toISOString());
      cron.stop();
      return { valid: true, error: null, nextRuns };
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : String(e),
        nextRuns: [],
      };
    }
  }

  private assertValidCron(cronExpr: string, timezone: string): void {
    const r = this.preview(cronExpr, timezone);
    if (!r.valid) throw new Error(r.error ?? 'Invalid cron expression');
  }

  private toRun(row: PrismaScheduleRun): ScheduleRunType {
    return {
      runId: row.id,
      jobType: JOB_TYPE,
      trigger: row.trigger as ScheduleTriggerType,
      status: row.status as ScheduleRunStatusType,
      // DB 이력 행은 phase 를 보관하지 않는다 — live 진행은 SSE 로만.
      phase: null,
      totalTargets: row.totalTargets,
      processedCount: row.processedCount,
      skippedCount: row.skippedCount,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      error: row.error,
    };
  }
}
