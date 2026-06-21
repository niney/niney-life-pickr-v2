import { Cron } from 'croner';
import type {
  PrismaClient,
  RandomCrawlRun as PrismaRandomCrawlRun,
} from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type {
  CrawlStageType,
  RandomCrawlCandidateType,
  RandomCrawlConfigInputType,
  RandomCrawlConfigType,
  RandomCrawlPreviewResultType,
  RandomCrawlRegionType,
  RandomCrawlRunListType,
  RandomCrawlRunStatusType,
  RandomCrawlRunType,
  RandomCrawlTimeoutActionType,
  RandomCrawlTriggerType,
  RegionDongListType,
  RegionTreeType,
} from '@repo/api-contract';
import {
  searchPlacesViaMapNaver,
  type NaverSearchResult,
} from '../crawl/adapters/naver-search.http.adapter.js';
import {
  fetchVisitorReviewStatsMany,
  type VisitorReviewStats,
} from '../crawl/adapters/naver-review-stats.http.adapter.js';
import { jobRegistry as defaultCrawlRegistry } from '../crawl/job-registry.js';
import type { JobRegistry } from '../crawl/job-registry.js';
import type { CrawlService } from '../crawl/crawl.service.js';
import type { RestaurantService } from '../restaurant/restaurant.service.js';
import {
  isStatsCommand,
  buildRegionStatsOverview,
  buildRegionStatsSido,
} from '../restaurant/region-stats-telegram.js';
import type { OperationLogService } from '../logs/operation-log.service.js';
import { scheduleRegistry } from '../schedule/schedule-registry.js';
import type { TelegramService } from '../telegram/telegram.service.js';
import { env } from '../../config/env.js';
import { RegionStore, regionStore } from './region.js';
import { randomCrawlRegistry } from './random-crawl-registry.js';

const JOB_TYPE = 'random-crawl';
// 매일 11:00 (점심 직전). 어드민이 바꾸기 전 초기값 — prisma default 와 일치.
const DEFAULT_CRON = '0 11 * * *';
const DEFAULT_TZ = 'Asia/Seoul';
const DEFAULT_KEYWORD = '맛집';
const DEFAULT_CANDIDATES = 5;
// 무응답 대기 기본 30분(앱 기준값 — prisma DB default 180 은 실사용 안 됨, 스키마 주석 참고).
const DEFAULT_TIMEOUT_MIN = 30;
const DEFAULT_TIMEOUT_ACTION: RandomCrawlTimeoutActionType = 'skip';
const RUN_HISTORY_LIMIT = 50;
const SEARCH_PAGE_SIZE = 50;
// startCrawl 의 actor — 동시성/dedup 키. 사람 actor 와 구분되는 시스템 식별자.
const ACTOR_ID = 'system:random-crawl';
// 신규 후보 0건 스킵 사유 — notifyEmpty 안내와 텔레그램 커맨드 중복 회신 억제에 공용.
const EMPTY_REASON = '신규 후보 0건';
// /search 2단계 입력 — 인자 없이 탭된 /search 에 force_reply 프롬프트를 띄우고,
// 그 프롬프트에 대한 답장을 검색어로 받는다(MARKER 로 답장 식별).
const SEARCH_PROMPT_MARKER = '검색할 가게나 지역';
const SEARCH_PROMPT = `🔎 ${SEARCH_PROMPT_MARKER}을 입력해 주세요.\n예) 강남 파스타`;
const SEARCH_PLACEHOLDER = '예) 강남 파스타';
// 크롤 진행을 텔레그램 메시지에 제자리 갱신할 때의 최소 간격(ms). 텔레그램
// editMessageText 레이트리밋 + "not modified" 오류를 피하려고 한번씩만 보낸다.
const CRAWL_PROGRESS_THROTTLE_MS = 4000;
// 크롤 단계 → 사용자용 한 줄. queued/done 은 생략(done 은 최종 메시지로 덮음).
const CRAWL_STAGE_LABEL: Partial<Record<CrawlStageType, string>> = {
  normalizing: '🔧 주소 정규화 중…',
  launching: '🚀 브라우저 실행 중…',
  loading_main: '📄 가게 정보 로딩 중…',
  parsing_main: '📄 가게 정보 분석 중…',
  loading_visitor: '💬 방문자 리뷰 로딩 중…',
  paginating_visitor: '💬 방문자 리뷰 수집 중…',
  finalizing: '💾 저장 중…',
};
// awaiting 만료 sweep 주기.
const SWEEP_INTERVAL_MS = 60_000;

// 비종료(진행 중) 상태 — overlap 가드/sweep 대상 판별.
const ACTIVE_STATUSES: RandomCrawlRunStatusType[] = [
  'running',
  'awaiting_selection',
  'crawling',
];

const DEFAULT_REGION: RandomCrawlRegionType = {
  sidoRandom: false,
  sido: null,
  sigunguRandom: false,
  sigungu: null,
  dongEnabled: false,
  dongRandom: false,
  dong: null,
};

export interface RandomCrawlServiceDeps {
  restaurants: RestaurantService;
  crawl: CrawlService;
  telegram: TelegramService;
  regionStore?: RegionStore;
  crawlRegistry?: JobRegistry;
  logger?: FastifyBaseLogger;
  operationLog?: OperationLogService | null;
  // 테스트용 — 검색 결과 주입(네이버 호출 우회). coord 는 직접 검색(/search)에선
  // undefined(검색어가 영역 결정).
  searchOverride?: (
    query: string,
    coord: { lng: number; lat: number } | undefined,
  ) => Promise<NaverSearchResult[]>;
  // 테스트용 — 방문자 리뷰 통계 주입(네이버 호출 우회). 미지정이면 실제 HTTP
  // 어댑터를 쓰되, searchOverride 가 설정된 테스트에서는 라이브콜을 건너뛴다.
  reviewStatsOverride?: (
    placeIds: string[],
    opts: { signal?: AbortSignal },
  ) => Promise<Map<string, VisitorReviewStats>>;
}

export class RandomCrawlService {
  private readonly regions: RegionStore;
  private readonly crawlRegistry: JobRegistry;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly deps: RandomCrawlServiceDeps,
  ) {
    this.regions = deps.regionStore ?? regionStore;
    this.crawlRegistry = deps.crawlRegistry ?? defaultCrawlRegistry;
  }

  private get log(): FastifyBaseLogger | null {
    return this.deps.logger ?? null;
  }

  // ── 설정 ───────────────────────────────────────────────────────────

  async getConfig(): Promise<RandomCrawlConfigType> {
    const row = await this.prisma.randomCrawlConfig.findUnique({
      where: { jobType: JOB_TYPE },
    });
    const enabled = row?.enabled ?? false;
    const cronExpr = row?.cronExpr ?? DEFAULT_CRON;
    const timezone = row?.timezone ?? DEFAULT_TZ;
    const nextRunAt = enabled
      ? (scheduleRegistry.nextRun(JOB_TYPE)?.toISOString() ?? null)
      : null;
    return {
      enabled,
      cronExpr,
      timezone,
      region: this.parseRegion(row?.regionJson),
      keyword: row?.keyword ?? DEFAULT_KEYWORD,
      candidateCount: row?.candidateCount ?? DEFAULT_CANDIDATES,
      responseTimeoutMin: row?.responseTimeoutMin ?? DEFAULT_TIMEOUT_MIN,
      timeoutAction:
        (row?.timeoutAction as RandomCrawlTimeoutActionType | undefined) ??
        DEFAULT_TIMEOUT_ACTION,
      telegramConfigured: this.deps.telegram.isConfigured(),
      lastRunAt: row?.lastRunAt?.toISOString() ?? null,
      lastStatus: (row?.lastStatus as RandomCrawlRunStatusType | null) ?? null,
      nextRunAt,
      updatedAt: row?.updatedAt?.toISOString() ?? new Date(0).toISOString(),
    };
  }

  async updateConfig(
    input: RandomCrawlConfigInputType,
  ): Promise<RandomCrawlConfigType> {
    this.assertValidCron(input.cronExpr, input.timezone);
    const regionJson = JSON.stringify(input.region);
    await this.prisma.randomCrawlConfig.upsert({
      where: { jobType: JOB_TYPE },
      create: {
        jobType: JOB_TYPE,
        enabled: input.enabled,
        cronExpr: input.cronExpr,
        timezone: input.timezone,
        regionJson,
        keyword: input.keyword,
        candidateCount: input.candidateCount,
        responseTimeoutMin: input.responseTimeoutMin,
        timeoutAction: input.timeoutAction,
      },
      update: {
        enabled: input.enabled,
        cronExpr: input.cronExpr,
        timezone: input.timezone,
        regionJson,
        keyword: input.keyword,
        candidateCount: input.candidateCount,
        responseTimeoutMin: input.responseTimeoutMin,
        timeoutAction: input.timeoutAction,
      },
    });
    this.applySchedule(input.enabled, input.cronExpr, input.timezone);
    return this.getConfig();
  }

  applySchedule(enabled: boolean, cronExpr: string, timezone: string): void {
    if (enabled) {
      scheduleRegistry.setCron(JOB_TYPE, cronExpr, timezone, () => {
        void this.runScheduled('cron');
      });
      this.log?.info({ cronExpr, timezone }, '[random-crawl] cron registered');
    } else {
      scheduleRegistry.clearCron(JOB_TYPE);
      this.log?.info('[random-crawl] cron cleared (disabled)');
    }
  }

  // 부팅 1회 — 재시작 고아 정리 + cron 등록 + 텔레그램 콜백 연결/폴링 + sweep 타이머.
  // 'awaiting_selection' 은 의도적으로 살려둔다: DB 가 진실의 원천이라 재시작 후에도
  // 텔레그램 콜백이 그 행을 찾아 선택을 반영할 수 있다. 진행 중 작업(running/
  // crawling) 만 재개 불가라 interrupted 로 닫는다.
  async bootstrap(): Promise<void> {
    const stale = await this.prisma.randomCrawlRun.updateMany({
      where: { status: { in: ['running', 'crawling'] } },
      data: { status: 'interrupted', finishedAt: new Date(), error: 'server restart' },
    });
    if (stale.count > 0) {
      this.log?.warn(
        { count: stale.count },
        '[random-crawl] marked stale runs as interrupted',
      );
    }
    const cfg = await this.getConfig();
    this.applySchedule(cfg.enabled, cfg.cronExpr, cfg.timezone);

    this.deps.telegram.onCallback((cb) => this.handleTelegramCallback(cb));
    this.deps.telegram.onMessage((m) => this.handleTelegramMessage(m));
    this.deps.telegram.startPolling();

    this.sweepTimer = setInterval(() => {
      void this.sweepExpired();
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  shutdown(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    this.deps.telegram.stopPolling();
    scheduleRegistry.clearCron(JOB_TYPE);
    randomCrawlRegistry.abortInflight();
  }

  // ── 실행 (검색 → 후보 → 텔레그램 전송, 그리고 awaiting 으로 손 뗌) ──────

  // override.region 이 있으면 설정 지역 대신 그 지역으로만 발굴(텔레그램 지역
  // 선택). override.query 가 있으면 지역선정을 건너뛰고 그 검색어로 직접 발굴
  // (텔레그램 /search — 검색어가 영역을 결정하므로 좌표 불필요).
  async runScheduled(
    trigger: RandomCrawlTriggerType,
    override?: { region?: RandomCrawlRegionType; query?: string },
  ): Promise<RandomCrawlRunType> {
    // 0) 만료된 awaiting 먼저 정리 — 막힌 슬롯을 풀어 새 회차가 시작될 수 있게.
    await this.sweepExpired();

    // 1) overlap 가드 — 같은 프로세스(레지스트리) + 영속(DB) 둘 다 확인(재시작 안전).
    if (randomCrawlRegistry.isActive() || (await this.hasActiveRun())) {
      const skipped = await this.prisma.randomCrawlRun.create({
        data: { trigger, status: 'skipped', finishedAt: new Date(), error: '이전 회차 진행 중' },
      });
      this.log?.warn({ trigger }, '[random-crawl] run skipped — 이전 회차 진행 중');
      return this.toRun(skipped);
    }

    const begun = randomCrawlRegistry.begin(trigger);
    if (!begun) {
      const skipped = await this.prisma.randomCrawlRun.create({
        data: { trigger, status: 'skipped', finishedAt: new Date(), error: '이전 회차 진행 중' },
      });
      return this.toRun(skipped);
    }
    const { runId, signal } = begun;
    const cfg = await this.getConfig();

    await this.prisma.randomCrawlRun.create({
      data: { id: runId, trigger, status: 'running' },
    });

    const oplog = this.deps.operationLog ?? null;
    const opRunId = oplog
      ? await oplog.startRun({ feature: 'random-crawl', jobId: runId, trigger })
      : null;
    const step = (
      level: 'debug' | 'info' | 'warn' | 'error',
      stage: string,
      message: string,
      meta?: Record<string, unknown>,
    ): void => {
      if (oplog && opRunId) oplog.log({ runId: opRunId, stage, level, message, meta });
    };

    try {
      // 2) 검색 대상 결정. query 오버라이드(텔레그램 직접 검색)면 지역선정을
      //    건너뛰고 검색어를 그대로 쓴다(검색어가 영역을 결정 — 좌표 불필요).
      //    아니면 지역을 (랜덤/고정) 골라 검색어를 만든다.
      randomCrawlRegistry.setPhase('selecting_region');
      let query: string;
      let coord: { lng: number; lat: number } | undefined;
      let regionLabel: string;
      let keyword: string;
      if (override?.query) {
        query = override.query;
        coord = undefined; // 검색어가 영역 결정 — 좌표 미지정(어댑터 default center).
        regionLabel = `검색: "${override.query}"`;
        keyword = override.query;
        randomCrawlRegistry.setPhase('searching', { regionLabel });
        step('info', 'select', `직접 검색: "${query}"`, { query });
      } else {
        const region = this.regions.resolve(override?.region ?? cfg.region);
        if (!region) {
          return await this.skip(
            runId,
            opRunId,
            step,
            '지역 데이터를 사용할 수 없습니다.',
          );
        }
        query = region.dong ? `${region.dong} ${cfg.keyword}` : cfg.keyword;
        coord = { lng: region.lng, lat: region.lat };
        regionLabel = region.label;
        keyword = cfg.keyword;
        randomCrawlRegistry.setPhase('selecting_region', {
          regionLabel,
          keyword,
        });
        step('info', 'select', `지역 선정: ${regionLabel} / 검색어 "${query}"`, {
          region: regionLabel,
          query,
        });
        randomCrawlRegistry.setPhase('searching', { regionLabel });
      }

      // 3) 검색 → dedupe → 기등록 제외 → 후보 N개.
      const items = await this.search(query, coord, signal);
      const deduped = new Map<string, NaverSearchResult>();
      for (const it of items) if (!deduped.has(it.placeId)) deduped.set(it.placeId, it);
      const ids = [...deduped.keys()];
      const registered = await this.deps.restaurants.findRegisteredByPlaceIds(ids);
      const fresh = ids
        .filter((id) => !registered.has(id))
        .map((id) => deduped.get(id)!);
      const chosen = fresh.slice(0, cfg.candidateCount);
      step(
        'info',
        'search',
        `검색 ${items.length}건 → 중복제거 ${deduped.size} → 기등록 제외 후 신규 ${fresh.length} → 후보 ${chosen.length}`,
        { found: items.length, deduped: deduped.size, fresh: fresh.length, candidates: chosen.length },
      );

      if (chosen.length === 0) {
        await this.notifyEmpty(regionLabel, query);
        return await this.skip(
          runId,
          opRunId,
          step,
          EMPTY_REASON,
          regionLabel,
          keyword,
        );
      }

      const candidates: RandomCrawlCandidateType[] = chosen.map((c) => ({
        placeId: c.placeId,
        name: c.name,
        category: c.category,
        roadAddress: c.roadAddress,
        rawSourceUrl: c.rawSourceUrl,
        lat: c.lat,
        lng: c.lng,
        reviewCount: c.reviewCount,
        selected: false,
      }));

      // 4) 텔레그램 미설정이면 보낼 곳이 없다 — skip.
      if (!this.deps.telegram.isConfigured()) {
        return await this.skip(
          runId,
          opRunId,
          step,
          '텔레그램 미설정 — 후보를 보낼 수 없음',
          regionLabel,
          keyword,
        );
      }

      // 4.5) 후보의 reviewCount 를 "정확한 방문자 리뷰 수"로 보강(best-effort).
      //      검색 API 의 visitorReviewCount 는 별점-only 까지 포함한 전체라, 네이버
      //      페이지가 표시하는 방문자 리뷰(별점 제외)와 어긋난다. getVisitorReviewStats
      //      를 병렬 호출(~90ms)해 displayReviewCount 로 교체. 실패는 원래 값 유지.
      await this.enrichReviewCounts(candidates, signal);

      // 5) 후보 전송 → awaiting_selection 으로 전환하고 손을 뗀다. 직접 검색은
      //    지역 헤더 대신 검색 헤더로(이름=네이버지도 링크는 양쪽 공통).
      const sent = await this.deps.telegram.sendCandidates(
        override?.query
          ? buildSearchCandidatesMessage(runId, query, candidates)
          : buildCandidatesMessage(runId, regionLabel, query, candidates),
      );
      if (!sent) {
        return await this.skip(
          runId,
          opRunId,
          step,
          '텔레그램 전송 실패',
          regionLabel,
          keyword,
        );
      }

      const expiresAt = new Date(Date.now() + cfg.responseTimeoutMin * 60_000);
      await this.prisma.randomCrawlRun.update({
        where: { id: runId },
        data: {
          status: 'awaiting_selection',
          regionLabel,
          keyword,
          candidatesJson: JSON.stringify(candidates),
          telegramChatId: sent.chatId,
          telegramMessageId: String(sent.messageId),
          expiresAt,
        },
      });
      randomCrawlRegistry.setPhase('awaiting_selection', {
        regionLabel,
        keyword,
        candidates,
      });
      step('info', 'await', `후보 ${candidates.length}건 텔레그램 전송 — 선택 대기 (만료 ${cfg.responseTimeoutMin}분)`, {
        messageId: sent.messageId,
        expiresAt: expiresAt.toISOString(),
      });
      // 발굴(검색→전송)은 성공으로 마감. 이후 크롤은 콜백이 별도로 처리하며
      // crawl.startCrawl 이 자체 oplog run 을 만든다.
      if (oplog && opRunId) {
        await oplog.finishRun(opRunId, {
          status: 'done',
          meta: { regionLabel, candidates: candidates.length, awaiting: true },
        });
      }
      await this.touchConfig('awaiting_selection');
      const row = await this.prisma.randomCrawlRun.findUnique({ where: { id: runId } });
      return this.toRun(row!);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.log?.error({ runId, error }, '[random-crawl] run failed');
      step('error', 'run', `실행 실패: ${error}`);
      randomCrawlRegistry.finish('failed');
      const updated = await this.prisma.randomCrawlRun.update({
        where: { id: runId },
        data: { status: 'failed', error, finishedAt: new Date() },
      });
      if (oplog && opRunId) {
        await oplog.finishRun(opRunId, { status: 'failed', errorMessage: error });
      }
      await this.touchConfig('failed');
      return this.toRun(updated);
    }
  }

  // 정상 스킵(후보 0/미설정/전송실패/지역없음) — run 을 skipped 로 닫고 oplog 는
  // done(스킵은 실패가 아님)으로 마감.
  private async skip(
    runId: string,
    opRunId: string | null,
    step: (l: 'debug' | 'info' | 'warn' | 'error', s: string, m: string, meta?: Record<string, unknown>) => void,
    reason: string,
    regionLabel?: string,
    keyword?: string,
  ): Promise<RandomCrawlRunType> {
    step('info', 'skip', `회차 종료(스킵): ${reason}`);
    randomCrawlRegistry.finish('skipped');
    const updated = await this.prisma.randomCrawlRun.update({
      where: { id: runId },
      data: {
        status: 'skipped',
        error: reason,
        finishedAt: new Date(),
        ...(regionLabel ? { regionLabel } : {}),
        ...(keyword ? { keyword } : {}),
      },
    });
    if (this.deps.operationLog && opRunId) {
      await this.deps.operationLog.finishRun(opRunId, {
        status: 'done',
        meta: { skipped: true, reason },
      });
    }
    await this.touchConfig('skipped');
    return this.toRun(updated);
  }

  // ── 텔레그램 콜백 (사용자 선택) ─────────────────────────────────────

  private async handleTelegramCallback(cb: {
    callbackQueryId: string;
    chatId: string;
    messageId: number;
    data: string;
  }): Promise<void> {
    // 지역 통계 드릴다운(rs:<시도>|rs:*)은 별도 처리.
    if (cb.data.startsWith('rs:')) {
      await this.handleRegionStatsCallback(cb);
      return;
    }
    // 지역 선택 발굴(disc:<시도>|disc:<시도>:<시군구>)도 별도 처리.
    if (cb.data.startsWith('disc:')) {
      await this.handleDiscoverHereCallback(cb);
      return;
    }
    const parts = cb.data.split(':');
    if (parts.length !== 3 || parts[0] !== 'rc') return; // 우리 콜백 아님
    const runId = parts[1]!;
    const sel = parts[2]!;

    const run = await this.prisma.randomCrawlRun.findUnique({ where: { id: runId } });
    if (!run || run.status !== 'awaiting_selection') {
      await this.deps.telegram.answerCallback(
        cb.callbackQueryId,
        '이미 처리되었거나 만료된 요청입니다.',
      );
      return;
    }

    const candidates = this.parseCandidates(run.candidatesJson);

    // 건너뛰기.
    if (sel === 'skip') {
      await this.prisma.randomCrawlRun.update({
        where: { id: runId },
        data: { status: 'skipped', error: '사용자 건너뜀', finishedAt: new Date() },
      });
      if (randomCrawlRegistry.runningRunId() === runId) randomCrawlRegistry.finish('skipped');
      await this.deps.telegram.answerCallback(cb.callbackQueryId, '건너뜀');
      await this.deps.telegram.editMessageText(
        cb.chatId,
        cb.messageId,
        `⏭️ <b>건너뜀</b> — 이번 회차는 크롤하지 않습니다.\n📍 ${escapeHtml(run.regionLabel ?? '')}`,
      );
      await this.touchConfig('skipped');
      return;
    }

    const index = Number(sel);
    const cand = Number.isInteger(index) ? candidates[index] : undefined;
    if (!cand) {
      await this.deps.telegram.answerCallback(cb.callbackQueryId, '잘못된 선택입니다.');
      return;
    }
    await this.deps.telegram.answerCallback(cb.callbackQueryId, `선택: ${cand.name}`);
    await this.crawlChosenCandidate({
      runId,
      regionLabel: run.regionLabel ?? '',
      chatId: cb.chatId,
      messageId: cb.messageId,
      candidates,
      index,
      introText: `✅ <b>${escapeHtml(cand.name)}</b> 선택됨 — 크롤을 시작합니다.\n📍 ${escapeHtml(run.regionLabel ?? '')}`,
    });
  }

  // 고른 후보 1개를 크롤 → 진행 갱신 → 완료/실패 핑까지. 텔레그램 콜백(수동
  // 선택)과 타임아웃 자동선택이 공유한다. awaiting_selection 일 때만 atomic claim
  // 으로 crawling 전환해 콜백/스윕 동시 진입을 막는다(이미 처리됐으면 no-op).
  private async crawlChosenCandidate(p: {
    runId: string;
    regionLabel: string;
    chatId: string;
    messageId: number;
    candidates: RandomCrawlCandidateType[];
    index: number;
    introText: string;
  }): Promise<void> {
    const { runId, regionLabel, chatId, messageId, candidates, index } = p;
    const cand = candidates[index];
    if (!cand) return;

    const marked = candidates.map((c, i) => ({ ...c, selected: i === index }));
    const claim = await this.prisma.randomCrawlRun.updateMany({
      where: { id: runId, status: 'awaiting_selection' },
      data: {
        status: 'crawling',
        selectedPlaceId: cand.placeId,
        candidatesJson: JSON.stringify(marked),
      },
    });
    if (claim.count === 0) return; // 이미 다른 경로(콜백/다른 스윕)가 가져감.
    if (randomCrawlRegistry.runningRunId() === runId) {
      randomCrawlRegistry.setPhase('crawling', { candidates: marked });
    }
    await this.deps.telegram.editMessageText(chatId, messageId, p.introText);

    // 크롤 시작 → 종료 대기 → 결과 반영.
    let status: RandomCrawlRunStatusType = 'done';
    let error: string | null = null;
    let restaurantId: string | null = null;
    try {
      const start = await this.deps.crawl.startCrawl(cand.rawSourceUrl, ACTOR_ID, 'create');
      if (!start.ok) {
        status = 'failed';
        error = start.message ?? '크롤 시작 실패';
      } else {
        // 진행 상황을 같은 텔레그램 메시지에 throttle 하며 제자리 갱신.
        const stopProgress = this.streamCrawlProgress(
          start.jobId,
          chatId,
          messageId,
          cand.name,
          regionLabel,
        );
        try {
          await this.waitForCrawlTerminal(start.jobId);
        } finally {
          // 진행 편집을 멈추고 in-flight 편집까지 await — 최종 메시지가
          // 늦게 도착한 "수집 중" 편집에 덮이는 경쟁을 막는다.
          await stopProgress();
        }
        const rest = await this.deps.restaurants.findByPlaceId(cand.placeId);
        restaurantId = rest?.id ?? null;
        if (!restaurantId) {
          status = 'failed';
          error = '등록 결과를 찾지 못했습니다.';
        }
      }
    } catch (e) {
      status = 'failed';
      error = e instanceof Error ? e.message : String(e);
    }

    await this.prisma.randomCrawlRun.update({
      where: { id: runId },
      data: { status, error, crawledRestaurantId: restaurantId, finishedAt: new Date() },
    });
    if (randomCrawlRegistry.runningRunId() === runId) randomCrawlRegistry.finish(status);
    await this.touchConfig(status);
    // 카드(진행 메시지)는 조용히 최종 상태로 정리하고, 완료/실패는 별도 새
    // 메시지(notify)로 보내 알림(핑)이 울리게 한다 — 편집은 핑을 안 울리므로.
    const region = escapeHtml(regionLabel);
    if (status === 'done') {
      await this.deps.telegram.editMessageText(
        chatId,
        messageId,
        `✅ <b>${escapeHtml(cand.name)}</b> 크롤 완료\n📍 ${region}`,
      );
      const url = `${env.PUBLIC_ORIGIN}/r/${encodeURIComponent(cand.placeId)}`;
      const reviewLine = cand.reviewCount != null ? ` · 리뷰 ${cand.reviewCount}개` : '';
      await this.deps.telegram.notify(
        `🎉 <b>등록 완료</b> — ${escapeHtml(cand.name)}\n📍 ${region}${reviewLine}\n👉 <a href="${url}">가게 보기</a>`,
      );
    } else {
      await this.deps.telegram.editMessageText(
        chatId,
        messageId,
        `⚠️ <b>${escapeHtml(cand.name)}</b> 크롤 실패`,
      );
      await this.deps.telegram.notify(
        `⚠️ <b>크롤 실패</b> — ${escapeHtml(cand.name)}\n${escapeHtml(error ?? '알 수 없는 오류')}`,
      );
    }
  }

  // ── 텔레그램 커맨드 (사용자가 봇에 보낸 텍스트) ─────────────────────

  // /discover(또는 한글 '발굴') → 즉시 1회차 발굴. 권한·staleness 는
  // TelegramService 가 이미 걸러서(설정된 chat + 60초 이내) 넘긴다.
  private async handleTelegramMessage(m: {
    chatId: string;
    text: string;
    replyToText?: string;
  }): Promise<void> {
    // 검색 프롬프트(force_reply)에 대한 답장이면 그 텍스트가 검색어. 메뉴에서
    // 탭하면 인자 없이 전송되는 /search 의 2단계 입력을 여기서 마무리한다.
    if (m.replyToText && m.replyToText.includes(SEARCH_PROMPT_MARKER)) {
      // 답장이 다시 '/search …' 형태일 수도 있어 파서로 정규화(아니면 원문).
      const parsed = parseSearchCommand(m.text);
      const q = (parsed !== null ? parsed : m.text).trim();
      if (q) await this.runSearch(q);
      return;
    }
    // /stats·/통계·/지역 → 지역 통계.
    if (isStatsCommand(m.text)) {
      await this.sendRegionStats();
      return;
    }
    // /search·/검색·'검색 …' → 직접 검색 발굴(지역 대신 검색어로).
    const searchQuery = parseSearchCommand(m.text);
    if (searchQuery !== null) {
      // 인자 없이 탭됨 → force_reply 로 검색어를 받는다(입력창 자동 포커스).
      if (searchQuery === '') {
        await this.deps.telegram.askReply(SEARCH_PROMPT, SEARCH_PLACEHOLDER);
        return;
      }
      await this.runSearch(searchQuery);
      return;
    }
    if (!isDiscoverCommand(m.text)) return; // 잡담은 조용히 무시.
    await this.runDiscoverAndReply('🔍 맛집 발굴을 시작합니다…');
  }

  // 검색어 1건으로 직접 검색 발굴 실행. /search 인자 입력과 force_reply 답장이 공유.
  private async runSearch(query: string): Promise<void> {
    await this.runDiscoverAndReply(`🔎 "${escapeHtml(query)}" 검색 중…`, {
      trigger: 'search',
      query,
    });
  }

  // 발굴 1회차 실행 + 결과 회신. /discover(설정 지역)·지역 선택 발굴(region)·
  // 직접 검색(query)이 공유한다. ack 후 runScheduled — 후보 카드는 그 안에서
  // 전송되고, 스킵/실패만 사유를 회신(후보 0건은 notifyEmpty 가 이미 안내하므로
  // EMPTY_REASON 은 제외).
  private async runDiscoverAndReply(
    ackText: string,
    override?: {
      trigger?: RandomCrawlTriggerType;
      region?: RandomCrawlRegionType;
      query?: string;
    },
  ): Promise<void> {
    await this.deps.telegram.notify(ackText);
    const run = await this.runScheduled(override?.trigger ?? 'telegram', {
      region: override?.region,
      query: override?.query,
    });
    if (run.status === 'skipped' && run.error && run.error !== EMPTY_REASON) {
      await this.deps.telegram.notify(`⏭️ ${escapeHtml(run.error)}`);
    } else if (run.status === 'failed') {
      await this.deps.telegram.notify(
        `⚠️ 발굴 실패: ${escapeHtml(run.error ?? '알 수 없는 오류')}`,
      );
    }
  }

  // 지역 통계 전체 뷰 전송(시도 랭킹 + 드릴다운 버튼). getRegionStats 는 60초 캐시.
  private async sendRegionStats(): Promise<void> {
    const stats = await this.deps.restaurants.getRegionStats();
    const { text, buttons } = buildRegionStatsOverview(stats);
    await this.deps.telegram.sendCandidates({ text, buttons });
  }

  // 지역 통계 드릴다운 콜백 — rs:<시도>(해당 시도 시군구) / rs:*(전체 복귀).
  // 같은 메시지를 본문+버튼째 교체한다.
  private async handleRegionStatsCallback(cb: {
    callbackQueryId: string;
    chatId: string;
    messageId: number;
    data: string;
  }): Promise<void> {
    const sel = cb.data.slice(3); // 'rs:' 이후 — 시도명 또는 '*'.
    const stats = await this.deps.restaurants.getRegionStats();
    const render =
      sel === '*'
        ? buildRegionStatsOverview(stats)
        : buildRegionStatsSido(stats, sel);
    await this.deps.telegram.answerCallback(cb.callbackQueryId);
    await this.deps.telegram.editMessageWithButtons(
      cb.chatId,
      cb.messageId,
      render.text,
      render.buttons,
    );
  }

  // 지역 선택 발굴 콜백 — disc:<시도>(랜덤 구) / disc:<시도>:<시군구>(고정).
  // 그 지역으로 한정해 /discover 와 동일 흐름(후보 카드 → 선택 → 크롤)을 돈다.
  private async handleDiscoverHereCallback(cb: {
    callbackQueryId: string;
    chatId: string;
    messageId: number;
    data: string;
  }): Promise<void> {
    const [sido, sigungu] = cb.data.slice(5).split(':'); // 'disc:' 이후.
    if (!sido) {
      await this.deps.telegram.answerCallback(cb.callbackQueryId);
      return;
    }
    const region: RandomCrawlRegionType = {
      sidoRandom: false,
      sido,
      sigunguRandom: !sigungu, // 시군구 미지정이면 시도 내 랜덤 구.
      sigungu: sigungu ?? null,
      dongEnabled: false,
      dongRandom: false,
      dong: null,
    };
    const label = sigungu ? `${sido} ${sigungu}` : `${sido}(랜덤 구)`;
    await this.deps.telegram.answerCallback(cb.callbackQueryId, `발굴: ${label}`);
    await this.runDiscoverAndReply(
      `🔍 <b>${escapeHtml(label)}</b> 맛집 발굴을 시작합니다…`,
      { region },
    );
  }

  // awaiting 만료 처리. timeoutAction='random' 이면 후보 중 하나를 랜덤으로
  // 골라 자동 크롤, 아니면(기본 skip) 회차를 건너뛴다.
  private async sweepExpired(): Promise<void> {
    const now = new Date();
    const stale = await this.prisma.randomCrawlRun.findMany({
      where: { status: 'awaiting_selection', expiresAt: { lt: now } },
    });
    if (stale.length === 0) return;
    const timeoutAction = (await this.getConfig()).timeoutAction;
    for (const run of stale) {
      const candidates = this.parseCandidates(run.candidatesJson);
      // 랜덤 자동 크롤 — 후보·텔레그램 메시지가 있어야 가능. 단 직접 검색
      // (/search)은 수동 의도라 자동 크롤하지 않고 그냥 만료시킨다.
      if (
        timeoutAction === 'random' &&
        run.trigger !== 'search' &&
        candidates.length > 0 &&
        run.telegramChatId &&
        run.telegramMessageId
      ) {
        const index = Math.floor(Math.random() * candidates.length);
        const cand = candidates[index]!;
        this.log?.info(
          { runId: run.id, pick: cand.name },
          '[random-crawl] awaiting 만료 → 랜덤 자동 크롤',
        );
        // 백그라운드로 — sweepExpired 는 runScheduled 시작부에서 await 되므로
        // 수 분 걸리는 크롤을 여기서 기다리면 새 회차가 멈춘다. atomic claim 으로
        // crawling 전환하니 overlap 가드(DB active)가 동시 진입을 막는다.
        void this.crawlChosenCandidate({
          runId: run.id,
          regionLabel: run.regionLabel ?? '',
          chatId: run.telegramChatId,
          messageId: Number(run.telegramMessageId),
          candidates,
          index,
          introText: `⏰ 응답이 없어 <b>${escapeHtml(cand.name)}</b> 자동 선택 — 크롤을 시작합니다.\n📍 ${escapeHtml(run.regionLabel ?? '')}`,
        }).catch((e) => {
          this.log?.error(
            { runId: run.id, err: e instanceof Error ? e.message : String(e) },
            '[random-crawl] 랜덤 자동 크롤 실패',
          );
        });
        continue;
      }
      // 기본: 건너뛰기.
      await this.prisma.randomCrawlRun.update({
        where: { id: run.id },
        data: { status: 'skipped', error: '응답 시간 초과', finishedAt: now },
      });
      if (randomCrawlRegistry.runningRunId() === run.id) randomCrawlRegistry.finish('skipped');
      if (run.telegramChatId && run.telegramMessageId) {
        await this.deps.telegram.editMessageText(
          run.telegramChatId,
          Number(run.telegramMessageId),
          `⏰ <b>시간 초과</b> — 이번 회차는 건너뜁니다.\n📍 ${escapeHtml(run.regionLabel ?? '')}`,
        );
      }
      this.log?.info({ runId: run.id }, '[random-crawl] awaiting 만료 → skipped');
      await this.touchConfig('skipped');
    }
  }

  // ── 이력/지역/미리보기 ─────────────────────────────────────────────

  async listRuns(): Promise<RandomCrawlRunListType> {
    const rows = await this.prisma.randomCrawlRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: RUN_HISTORY_LIMIT,
    });
    return {
      items: rows.map((r) => this.toRun(r)),
      inflightRunId: randomCrawlRegistry.runningRunId(),
    };
  }

  getRegionTree(): RegionTreeType {
    return this.regions.tree();
  }

  getRegionDongs(sido: string, sigungu: string): RegionDongListType {
    return { sido, sigungu, dongs: this.regions.dongs(sido, sigungu) };
  }

  preview(cronExpr: string, timezone: string): RandomCrawlPreviewResultType {
    try {
      const cron = new Cron(cronExpr, { timezone, paused: true });
      const nextRuns = cron.nextRuns(5).map((d) => d.toISOString());
      cron.stop();
      return { valid: true, error: null, nextRuns };
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : String(e), nextRuns: [] };
    }
  }

  // ── 내부 헬퍼 ───────────────────────────────────────────────────────

  private async hasActiveRun(): Promise<boolean> {
    const active = await this.prisma.randomCrawlRun.findFirst({
      where: { status: { in: ACTIVE_STATUSES } },
      select: { id: true },
    });
    return active !== null;
  }

  private async search(
    query: string,
    coord: { lng: number; lat: number } | undefined,
    signal: AbortSignal,
  ): Promise<NaverSearchResult[]> {
    if (this.deps.searchOverride) return this.deps.searchOverride(query, coord);
    return searchPlacesViaMapNaver(query, { coord, pageSize: SEARCH_PAGE_SIZE, signal });
  }

  // 후보 reviewCount 를 네이버 페이지 표시값(별점-only 제외)으로 보강한다.
  // best-effort: 통계 호출 실패/형식오류는 조용히 원래 값 유지. 테스트에서
  // searchOverride 만 있고 reviewStatsOverride 가 없으면 라이브콜을 건너뛴다.
  private async enrichReviewCounts(
    candidates: RandomCrawlCandidateType[],
    signal: AbortSignal,
  ): Promise<void> {
    const fetcher =
      this.deps.reviewStatsOverride ??
      (this.deps.searchOverride ? null : fetchVisitorReviewStatsMany);
    if (!fetcher) return;
    try {
      const stats = await fetcher(
        candidates.map((c) => c.placeId),
        { signal },
      );
      for (const c of candidates) {
        const s = stats.get(c.placeId);
        if (s) c.reviewCount = s.displayReviewCount;
      }
    } catch (e) {
      this.log?.warn(
        { err: e instanceof Error ? e.message : String(e) },
        '[random-crawl] 리뷰수 보강 실패(무시)',
      );
    }
  }

  private async notifyEmpty(regionLabel: string, query: string): Promise<void> {
    if (!this.deps.telegram.isConfigured()) return;
    await this.deps.telegram.sendCandidates({
      text: `🍽️ <b>오늘의 맛집 발굴</b>\n📍 ${escapeHtml(regionLabel)}\n🔎 "${escapeHtml(query)}"\n\n신규 후보가 없어 이번 회차는 건너뜁니다.`,
      buttons: [],
    });
  }

  // 크롤 진행을 같은 텔레그램 메시지에 제자리 갱신(editMessageText). 단계 전환과
  // 방문자 리뷰 누적 수를 한 줄로 보여주되 CRAWL_PROGRESS_THROTTLE_MS 간격으로만
  // 갱신하고, 직전과 동일한 텍스트는 건너뛴다(텔레그램 "not modified" 회피).
  // 반환: async 정지 함수 — 구독 해제 + 진행 갱신 비활성 + in-flight 편집 await.
  // 호출부가 종료 대기 후 이를 await 한 뒤 최종 🎉/⚠️ 메시지로 덮어야, 늦게
  // 도착한 진행 편집이 최종 메시지를 덮는 경쟁(stuck "수집 중")이 없어진다.
  private streamCrawlProgress(
    crawlJobId: string,
    chatId: string,
    messageId: number,
    name: string,
    regionLabel: string,
  ): () => Promise<void> {
    const header = `🔄 <b>${escapeHtml(name)}</b> 크롤 중…\n📍 ${escapeHtml(regionLabel)}`;
    let lastEditMs = 0;
    let lastText = '';
    let stopped = false;
    let pending: Promise<void> = Promise.resolve();
    const render = (line: string): void => {
      if (stopped) return;
      const text = `${header}\n${line}`;
      const now = Date.now();
      if (text === lastText) return;
      if (now - lastEditMs < CRAWL_PROGRESS_THROTTLE_MS) return;
      lastEditMs = now;
      lastText = text;
      // 직전 편집이 끝난 뒤 다음 편집을 보내 텔레그램이 순서대로 적용하게 한다.
      pending = pending.then(() =>
        this.deps.telegram.editMessageText(chatId, messageId, text),
      );
    };
    const unsubscribe = this.crawlRegistry.subscribe(crawlJobId, (ev) => {
      if (ev.type === 'progress') {
        const label = CRAWL_STAGE_LABEL[ev.stage];
        if (label) render(label);
      } else if (ev.type === 'visitor_progress') {
        render(`💬 방문자 리뷰 ${ev.count}개 수집 중…`);
      }
      // done/error 는 waitForCrawlTerminal 가 처리 — 최종 메시지로 이 줄을 덮는다.
    });
    return async () => {
      stopped = true;
      unsubscribe();
      await pending;
    };
  }

  private async waitForCrawlTerminal(crawlJobId: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const job = this.crawlRegistry.get(crawlJobId);
      if (!job || job.status !== 'running') {
        resolve();
        return;
      }
      const unsubscribe = this.crawlRegistry.subscribe(crawlJobId, (ev) => {
        if (ev.type === 'done' || ev.type === 'error') {
          unsubscribe();
          resolve();
        }
      });
    });
  }

  private async touchConfig(status: RandomCrawlRunStatusType): Promise<void> {
    await this.prisma.randomCrawlConfig.updateMany({
      where: { jobType: JOB_TYPE },
      data: { lastRunAt: new Date(), lastStatus: status },
    });
  }

  private assertValidCron(cronExpr: string, timezone: string): void {
    const r = this.preview(cronExpr, timezone);
    if (!r.valid) throw new Error(r.error ?? 'Invalid cron expression');
  }

  private parseRegion(json: string | null | undefined): RandomCrawlRegionType {
    if (!json) return { ...DEFAULT_REGION };
    try {
      return { ...DEFAULT_REGION, ...(JSON.parse(json) as Partial<RandomCrawlRegionType>) };
    } catch {
      return { ...DEFAULT_REGION };
    }
  }

  private parseCandidates(json: string): RandomCrawlCandidateType[] {
    try {
      return JSON.parse(json) as RandomCrawlCandidateType[];
    } catch {
      return [];
    }
  }

  private toRun(row: PrismaRandomCrawlRun): RandomCrawlRunType {
    return {
      runId: row.id,
      trigger: row.trigger as RandomCrawlTriggerType,
      status: row.status as RandomCrawlRunStatusType,
      phase: null,
      regionLabel: row.regionLabel,
      keyword: row.keyword,
      candidates: this.parseCandidates(row.candidatesJson),
      selectedPlaceId: row.selectedPlaceId,
      crawledRestaurantId: row.crawledRestaurantId,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      error: row.error,
    };
  }
}

// ── 텔레그램 메시지 빌더 ──────────────────────────────────────────────

type TelegramButtons = { text: string; callbackData: string }[][];

// 지역 발굴 카드(cron/manual/지역선택). 이름=네이버지도 링크로 검증 가능.
function buildCandidatesMessage(
  runId: string,
  regionLabel: string,
  query: string,
  candidates: RandomCrawlCandidateType[],
): { text: string; buttons: TelegramButtons } {
  const text =
    `🍽️ <b>오늘의 맛집 발굴</b>\n📍 ${escapeHtml(regionLabel)}\n🔎 "${escapeHtml(query)}"\n\n` +
    `크롤할 가게를 선택하세요 (${candidates.length}곳):\n\n${renderCandidateLines(candidates)}`;
  return { text, buttons: buildCandidateButtons(runId, candidates) };
}

// 직접 검색 카드(/search). 지역 헤더 대신 검색어 헤더 + "이름 누르면 지도 확인" 안내.
function buildSearchCandidatesMessage(
  runId: string,
  query: string,
  candidates: RandomCrawlCandidateType[],
): { text: string; buttons: TelegramButtons } {
  const text =
    `🔎 <b>검색 결과</b> — "${escapeHtml(query)}"\n` +
    `크롤할 가게를 선택하세요 (${candidates.length}곳):\n` +
    `<i>가게명을 누르면 네이버지도에서 확인할 수 있어요.</i>\n\n${renderCandidateLines(candidates)}`;
  return { text, buttons: buildCandidateButtons(runId, candidates) };
}

// 후보 한 줄 — 이름은 네이버지도 링크(검증용), 카테고리/주소/리뷰는 부가.
function renderCandidateLines(candidates: RandomCrawlCandidateType[]): string {
  return candidates
    .map((c, i) => {
      const name = `<a href="${escapeHtml(c.rawSourceUrl)}">${escapeHtml(c.name)}</a>`;
      const head = `${i + 1}. <b>${name}</b>${c.category ? ` · ${escapeHtml(c.category)}` : ''}`;
      const sub: string[] = [];
      if (c.roadAddress) sub.push(escapeHtml(c.roadAddress));
      if (c.reviewCount != null) sub.push(`리뷰 ${c.reviewCount}`);
      return head + (sub.length ? `\n   ${sub.join(' · ')}` : '');
    })
    .join('\n\n');
}

// 후보별 선택 버튼 + 건너뛰기. 콜백은 rc:<runId>:<idx>|skip (선택 핸들러 공용).
function buildCandidateButtons(
  runId: string,
  candidates: RandomCrawlCandidateType[],
): TelegramButtons {
  const buttons = candidates.map((c, i) => [
    { text: `${i + 1}. ${truncate(c.name, 24)}`, callbackData: `rc:${runId}:${i}` },
  ]);
  buttons.push([{ text: '⏭️ 건너뛰기', callbackData: `rc:${runId}:skip` }]);
  return buttons;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// 발굴 트리거 커맨드 판별 — '/discover', '/discover@Bot', '/발굴', '발굴'.
// 첫 토큰만 보고 @봇명 접미는 제거(그룹에선 '/discover@MyBot' 형태로 옴).
export function isDiscoverCommand(text: string): boolean {
  const first = text.trim().split(/\s+/)[0] ?? '';
  const cmd = first.split('@')[0]!.toLowerCase();
  return cmd === '/discover' || cmd === '/발굴' || cmd === '발굴';
}

// 직접 검색 커맨드 파서 — '/search 강남 파스타', '/검색 …', '검색 …'.
// 반환: 검색어(트림). 커맨드지만 검색어가 없으면 '' (사용법 안내용). 검색
// 커맨드가 아니면 null. 첫 토큰만 커맨드로 보고 @봇명 접미는 제거한다.
export function parseSearchCommand(text: string): string | null {
  const trimmed = text.trim();
  const first = trimmed.split(/\s+/)[0] ?? '';
  const cmd = first.split('@')[0]!.toLowerCase();
  if (cmd !== '/search' && cmd !== '/검색' && cmd !== '검색') return null;
  return trimmed.slice(first.length).trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
