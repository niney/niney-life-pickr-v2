import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { LRUCache } from 'lru-cache';
import type { PrismaClient } from '@prisma/client';
import {
  PublicSajuShare,
  SajuReadingResult,
  type CreateSajuReadingInputType,
  type CreateSajuShareInputType,
  type ListSajuReadingsResultType,
  type PublicSajuShareType,
  type SajuReadingResultType,
} from '@repo/api-contract';
import type { AiConfigService } from '../ai/ai.config.service.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import type { UsageQuotaActor, UsageQuotaService } from '../usage-quota/usage-quota.service.js';
import { calculateSaju } from './saju.engine.js';
import { basicSajuReport, requestSajuLlm, SAJU_PROMPT_VERSION } from './saju.prompts.js';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const ownerOf = (actor: UsageQuotaActor) =>
  hash(actor.userId ? `user:${actor.userId}` : `guest:${actor.guestKey ?? actor.ip}`);
const randomToken = () => randomBytes(24).toString('base64url');
export class SajuNotFound extends Error {
  constructor() {
    super('결과를 찾을 수 없거나 보관 시간이 지났어요. 사주를 다시 열어 주세요.');
  }
}
interface Receipt {
  owner: string;
  requestKey: string;
  result: SajuReadingResultType;
}
interface Deps {
  quota: UsageQuotaService;
  cache?: AdapterCache;
  now?: () => Date;
  timeoutMs?: number;
}

export class SajuService {
  private readonly results = new LRUCache<string, SajuReadingResultType>({
    max: 500,
    ttl: 24 * 60 * 60_000,
  });
  private readonly receipts = new LRUCache<string, Receipt>({ max: 1000, ttl: 24 * 60 * 60_000 });
  private readonly pending = new Map<string, Promise<SajuReadingResultType>>();
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ai: AiConfigService,
    private readonly deps: Deps,
  ) {}

  async createReading(
    input: CreateSajuReadingInputType,
    actor: UsageQuotaActor,
  ): Promise<SajuReadingResultType> {
    const now = this.deps.now?.() ?? new Date();
    const chart = calculateSaju(input, now);
    const resolved = await this.ai.getResolved('ollama-cloud', 'saju');
    const model = resolved?.defaultModel.trim() ?? '';
    const requestKey = hash(
      JSON.stringify({
        input,
        calculationVersion: chart.calculationVersion,
        period: chart.period.key,
        prompt: SAJU_PROMPT_VERSION,
        model,
      }),
    );
    const owner = ownerOf(actor);
    const key = `${owner}:${requestKey}`;
    const cached = this.results.get(key);
    if (cached) {
      const refreshed = {
        ...cached,
        remainingToday: actor.userId
          ? null
          : await this.deps.quota.remainingForGuest('saju-reading', actor),
      };
      return this.withReceipt(refreshed, owner, requestKey);
    }
    const running = this.pending.get(key);
    if (running) return running;
    // 같은 사용자의 동일 생성만 합류한다. 서로 다른 사용자의 입력과 결과는 격리한다.
    const task = (async () => {
      if (actor.userId) {
        const stored = await this.prisma.sajuReading.findUnique({
          where: { userId_requestKey: { userId: actor.userId, requestKey } },
        });
        if (stored) {
          const previous = this.rowResult(stored);
          if (previous.source === 'ai') return this.withReceipt(previous, owner, requestKey);
        }
      }
      let report = basicSajuReport(chart);
      let source: SajuReadingResultType['source'] = 'basic';
      let fallbackReason: SajuReadingResultType['fallbackReason'] = 'not_configured';
      let usedModel: string | null = null;
      let remainingToday: number | null = null;
      if (resolved && model) {
        const quota = await this.deps.quota.consume('saju-reading', actor);
        remainingToday = quota.remainingToday;
        fallbackReason = quota.allowed ? 'unavailable' : 'quota';
        if (quota.allowed) {
          try {
            const llm = await requestSajuLlm(
              (this.deps.cache ?? adapterCache).get(resolved),
              model,
              chart,
              input.note,
              AbortSignal.timeout(this.deps.timeoutMs ?? 60_000),
            );
            if (llm) {
              report = llm.report;
              usedModel = llm.model;
              source = 'ai';
              fallbackReason = null;
            }
          } catch {
            /* 출생 정보나 공급자의 원문 오류를 로그에 남기지 않는다. */
          }
        }
      }
      const result: SajuReadingResultType = {
        readingId: null,
        receipt: null,
        birth: input.birth,
        kind: input.kind,
        chart,
        report,
        source,
        model: usedModel,
        fallbackReason,
        promptVersion: SAJU_PROMPT_VERSION,
        remainingToday,
        createdAt: now.toISOString(),
      };
      // 실패 응답은 캐시하지 않는다. 복구 직후의 명시적 재시도는 새 AI 요청이어야 한다.
      // 동시 요청 합류와 라우트/일일 한도는 그대로 적용한다.
      if (source === 'ai') this.results.set(key, result);
      return this.withReceipt(result, owner, requestKey);
    })();
    this.pending.set(key, task);
    try {
      return await task;
    } finally {
      this.pending.delete(key);
    }
  }

  private withReceipt(
    result: SajuReadingResultType,
    owner: string,
    requestKey: string,
  ): SajuReadingResultType {
    const receipt = randomToken();
    const value = { ...result, receipt };
    this.receipts.set(receipt, { owner, requestKey, result: value });
    return value;
  }
  private receiptFor(token: string, actor: UsageQuotaActor): Receipt {
    const item = this.receipts.get(token);
    if (!item || item.owner !== ownerOf(actor)) throw new SajuNotFound();
    return item;
  }
  async save(receipt: string, actor: UsageQuotaActor) {
    if (!actor.userId) throw new SajuNotFound();
    const item = this.receiptFor(receipt, actor);
    const row = await this.prisma.sajuReading.upsert({
      where: { userId_requestKey: { userId: actor.userId, requestKey: item.requestKey } },
      create: {
        userId: actor.userId,
        requestKey: item.requestKey,
        kind: item.result.kind,
        snapshotJson: JSON.stringify({ ...item.result, receipt: null }),
      },
      update: { snapshotJson: JSON.stringify({ ...item.result, receipt: null }) },
    });
    const saved = this.rowResult(row);
    if (saved.source === 'ai') this.results.set(`${item.owner}:${item.requestKey}`, saved);
    // 같은 결과를 띄운 다른 탭의 영수증에도 보관 상태를 반영한다.
    for (const entry of this.receipts.values()) {
      if (entry.owner === item.owner && entry.requestKey === item.requestKey)
        entry.result = { ...saved, receipt: entry.result.receipt };
    }
    return { ...saved, receipt };
  }
  async listMine(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<ListSajuReadingsResultType> {
    if (
      cursor &&
      !(await this.prisma.sajuReading.findFirst({
        where: { id: cursor, userId },
        select: { id: true },
      }))
    )
      throw new SajuNotFound();
    const rows = await this.prisma.sajuReading.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return {
      items: rows.slice(0, limit).map((row) => {
        const r = this.rowResult(row);
        return {
          id: row.id,
          kind: r.kind,
          title: r.report.headline,
          period: r.chart.period.label,
          source: r.source,
          createdAt: row.createdAt.toISOString(),
        };
      }),
      nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
    };
  }
  async getMine(userId: string, id: string) {
    const row = await this.prisma.sajuReading.findFirst({ where: { id, userId } });
    if (!row) throw new SajuNotFound();
    return this.rowResult(row);
  }
  async deleteMine(userId: string, id: string) {
    const deleted = await this.prisma.sajuReading.deleteMany({ where: { id, userId } });
    if (!deleted.count) throw new SajuNotFound();
    // 삭제 전 영수증으로 결과가 되살아나거나 없는 FK로 공유하지 않도록 함께 만료한다.
    for (const [key, result] of this.results) {
      if (result.readingId === id) this.results.delete(key);
    }
    for (const [token, receipt] of this.receipts) {
      if (receipt.result.readingId === id) this.receipts.delete(token);
    }
  }
  private rowResult(row: { id: string; snapshotJson: string }): SajuReadingResultType {
    return SajuReadingResult.parse({
      ...JSON.parse(row.snapshotJson),
      readingId: row.id,
      receipt: null,
    });
  }
  async createShare(input: CreateSajuShareInputType, actor: UsageQuotaActor) {
    // 기기에 보관한 결과는 서버 재시작 후에도 원본 출생정보로 공유 명식을 다시 계산한다.
    // 클라이언트가 만든 명식·문구·오행 개수는 받지 않는다.
    const result = input.birth
      ? null
      : input.readingId && actor.userId
        ? await this.getMine(actor.userId, input.readingId)
        : this.receiptFor(input.receipt ?? '', actor).result;
    const chart = input.birth
      ? calculateSaju({ birth: input.birth, kind: 'natal', note: '' }, this.deps.now?.())
      : result!.chart;
    const master = chart.dayMaster;
    const publicResult: PublicSajuShareType = {
      title: master?.title ?? '아직 열려 있는 나의 지도',
      description: master?.description ?? '확인된 오행의 구성으로 나를 돌아보는 시간이에요.',
      symbol: master?.symbol ?? '가능성',
      element: master?.element ?? null,
      elements: chart.elements,
      unknownCharacters: chart.unknownCharacters,
    };
    const token = randomToken();
    const revokeToken = randomToken();
    await this.prisma.sajuShare.create({
      data: {
        token,
        ownerHash: ownerOf(actor),
        revokeHash: hash(revokeToken),
        readingId: result?.readingId ?? null,
        publicJson: JSON.stringify(publicResult),
      },
    });
    return { token, path: `/saju/s/${token}`, revokeToken };
  }
  async getShared(token: string): Promise<PublicSajuShareType> {
    const row = await this.prisma.sajuShare.findUnique({ where: { token } });
    if (!row) throw new SajuNotFound();
    return PublicSajuShare.parse(JSON.parse(row.publicJson));
  }
  async revokeShare(token: string, revokeToken: string) {
    const row = await this.prisma.sajuShare.findUnique({ where: { token } });
    if (!row || !timingSafeEqual(Buffer.from(row.revokeHash), Buffer.from(hash(revokeToken))))
      throw new SajuNotFound();
    await this.prisma.sajuShare.delete({ where: { token } });
  }
}
