import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { MenuGroupingRestaurantStatusType } from '@repo/api-contract';
import { AnalyticsError, type AnalyticsService } from '../analytics/analytics.service.js';
import type { MenuGroupingService } from '../menu-grouping/menu-grouping.service.js';
import { jobRegistry } from '../crawl/job-registry.js';
import { ScheduleService } from './schedule.service.js';
import { scheduleRegistry } from './schedule-registry.js';

// schedule.service 의 핵심 분기를 마이그레이션 없이(실제 DB 없이) 검증하는
// 단위 테스트. prisma/menuGrouping/analytics 는 mock, jobRegistry/scheduleRegistry
// 는 실제 module singleton 을 쓴다 — 크롤 제외/overlap 가드가 실제 구현으로
// 도는지 확인하기 위함.

// 처리 대상 식당 한 행 — getRestaurantsStatus mock 반환용.
const statusItem = (placeId: string, name: string): MenuGroupingRestaurantStatusType => ({
  placeId,
  name,
  category: null,
  totalReviews: 0,
  analyzedReviews: 0,
  distinctMenus: 1,
  mappedMenus: 0,
  unmappedMenus: 1,
  lastGroupedAt: null,
  storedVersion: null,
});

const makePrismaMock = (): PrismaClient => {
  const runs: Record<string, Record<string, unknown>> = {};
  let seq = 0;
  return {
    scheduleRun: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = (data.id as string) ?? `run-${seq++}`;
        const row = {
          id,
          jobType: data.jobType,
          trigger: data.trigger,
          status: data.status,
          totalTargets: data.totalTargets ?? null,
          processedCount: data.processedCount ?? 0,
          skippedCount: data.skippedCount ?? 0,
          error: data.error ?? null,
          startedAt: data.startedAt ?? new Date(),
          finishedAt: data.finishedAt ?? null,
        };
        runs[id] = row;
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = runs[where.id];
        Object.assign(row, data);
        return row;
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
      findMany: vi.fn(async () => Object.values(runs)),
    },
    scheduleConfig: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  } as unknown as PrismaClient;
};

describe('ScheduleService', () => {
  let prisma: PrismaClient;
  let menuGrouping: { getRestaurantsStatus: ReturnType<typeof vi.fn>; groupForRestaurant: ReturnType<typeof vi.fn> };
  let analytics: { runGlobalMerge: ReturnType<typeof vi.fn> };
  let service: ScheduleService;

  beforeEach(() => {
    prisma = makePrismaMock();
    menuGrouping = {
      getRestaurantsStatus: vi.fn(),
      groupForRestaurant: vi.fn(async () => ({
        ok: true,
        placeId: '',
        inputCount: 0,
        groupCount: 0,
        mappedCount: 0,
        model: null,
        version: 1,
      })),
    };
    analytics = { runGlobalMerge: vi.fn(async () => ({ finalGroupCount: 0 })) };
    service = new ScheduleService(prisma, {
      menuGrouping: menuGrouping as unknown as MenuGroupingService,
      analytics: analytics as unknown as AnalyticsService,
    });
  });

  afterEach(() => {
    // 다음 테스트 격리 — 진행 중 run/타이머 정리.
    if (scheduleRegistry.isRunning()) scheduleRegistry.finishRun('done');
    scheduleRegistry.stopAllCrons();
    jobRegistry.abortAll();
    vi.clearAllMocks();
  });

  it('validates a good cron and previews 5 upcoming runs', () => {
    const ok = service.preview('0 3 * * *', 'Asia/Seoul');
    expect(ok.valid).toBe(true);
    expect(ok.error).toBeNull();
    expect(ok.nextRuns).toHaveLength(5);
  });

  it('rejects an invalid cron expression', () => {
    const bad = service.preview('not-a-cron', 'Asia/Seoul');
    expect(bad.valid).toBe(false);
    expect(bad.error).not.toBeNull();
    expect(bad.nextRuns).toHaveLength(0);
  });

  it('runs grouping for each target then global merge', async () => {
    menuGrouping.getRestaurantsStatus.mockResolvedValue({
      items: [statusItem('p-a', 'A'), statusItem('p-b', 'B')],
      total: 2,
      totalRestaurants: 2,
      attentionCount: 2,
      page: 1,
      pageSize: 200,
    });

    const result = await service.runScheduled('manual');

    expect(menuGrouping.groupForRestaurant).toHaveBeenCalledWith('p-a');
    expect(menuGrouping.groupForRestaurant).toHaveBeenCalledWith('p-b');
    expect(analytics.runGlobalMerge).toHaveBeenCalledWith({ full: false });
    expect(result.status).toBe('done');
    expect(result.processedCount).toBe(2);
  });

  it('skips restaurants that are currently being crawled', async () => {
    const crawling = `sched-test-crawling-${Date.now()}`;
    const ok = `sched-test-ok-${Date.now()}`;
    // 실제 jobRegistry 에 in-flight(미완료) 크롤 잡을 등록.
    jobRegistry.create({ url: 'http://example.com', placeId: crawling, actorId: 'tester' });

    menuGrouping.getRestaurantsStatus.mockResolvedValue({
      items: [statusItem(crawling, 'Crawling'), statusItem(ok, 'Ok')],
      total: 2,
      totalRestaurants: 2,
      attentionCount: 2,
      page: 1,
      pageSize: 200,
    });

    const result = await service.runScheduled('manual');

    expect(menuGrouping.groupForRestaurant).toHaveBeenCalledWith(ok);
    expect(menuGrouping.groupForRestaurant).not.toHaveBeenCalledWith(crawling);
    expect(result.skippedCount).toBe(1);
    expect(result.processedCount).toBe(1);
  });

  it('skips the whole run when one is already in progress (overlap guard)', async () => {
    // 인위적으로 진행 중 run 을 만든다.
    scheduleRegistry.beginRun('normalize-merge', 'cron');

    const result = await service.runScheduled('manual');

    expect(result.status).toBe('skipped');
    expect(menuGrouping.getRestaurantsStatus).not.toHaveBeenCalled();
    expect(menuGrouping.groupForRestaurant).not.toHaveBeenCalled();
  });

  it('treats a no_inputs merge error as a successful (empty) run', async () => {
    menuGrouping.getRestaurantsStatus.mockResolvedValue({
      items: [],
      total: 0,
      totalRestaurants: 0,
      attentionCount: 0,
      page: 1,
      pageSize: 200,
    });
    analytics.runGlobalMerge.mockRejectedValue(new AnalyticsError('no_inputs', 'nothing to merge'));

    const result = await service.runScheduled('manual');

    expect(result.status).toBe('done');
  });
});
