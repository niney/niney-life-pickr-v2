import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type {
  AnalyticsOverviewType,
  GlobalMenuQueryType,
  GlobalMenuResultType,
  GlobalMenuStatType,
} from '@repo/api-contract';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import { classifyError } from '../ai/ai.service.js';
import { extractFirstJsonObject, normalizeTerm } from '../summary/summary.service.js';
import {
  GLOBAL_MERGE_CHUNK_SIZE,
  GLOBAL_MERGE_JSON_SCHEMA,
  GLOBAL_MERGE_SYSTEM_PROMPT,
  GLOBAL_MERGE_VERSION,
  buildGlobalMergePrompt,
} from './global-merge.prompts.js';

const TEMPERATURE = 0.1;
const MAX_TOKENS = 4000;
const NUM_CTX = 8192;

export class AnalyticsError extends Error {
  constructor(
    public readonly code: 'no_provider' | 'no_inputs',
    message: string,
  ) {
    super(message);
    this.name = 'AnalyticsError';
  }
}

export interface AnalyticsServiceOptions {
  cache?: AdapterCache;
  resolveOverride?: () => Promise<{ provider: LLMProvider; model: string } | null>;
  logger?: FastifyBaseLogger;
}

// 머지 잡 진행 콜백. service 가 LLM 호출하면서 호출자(잡 러너)에게 chunk 단위
// 진행을 알린다 — SSE event 변환은 라우트 측 책임.
export interface GlobalMergeProgress {
  onChunk?: (info: {
    pass: number;
    chunkIndex: number;
    chunkTotal: number;
    mappedInChunk: number;
  }) => void;
}

export interface GlobalMergeResult {
  inputCount: number;
  finalGroupCount: number;
  totalChunks: number;
  doneChunks: number;
  model: string;
  version: number;
}

export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiConfig: AiConfigService,
    private readonly opts: AnalyticsServiceOptions = {},
  ) {}

  private get log(): FastifyBaseLogger | null {
    return this.opts.logger ?? null;
  }

  // 모든 MenuCanonical 그룹을 distinct canonicalName 으로 모아 두-패스 LLM
  // 머지 후 GlobalMenuCanonical + Link 에 저장. full=false 면 이미 링크된
  // 식당 그룹은 건드리지 않고 새로 추가된 것만 머지 대상에 추가.
  async runGlobalMerge(
    opts: { full: boolean },
    progress: GlobalMergeProgress = {},
  ): Promise<GlobalMergeResult> {
    const resolved = await this.resolveProvider();
    if (!resolved) {
      throw new AnalyticsError('no_provider', 'LLM provider/model not configured');
    }
    const { provider, model } = resolved;

    // distinct (canonicalNorm, canonicalName) 중 가장 빈도 높은 표기를 input.
    const targets = await this.prisma.menuCanonical.findMany({
      select: {
        id: true,
        canonicalName: true,
        canonicalNorm: true,
        globalLink: { select: { id: true } },
      },
    });

    if (targets.length === 0) {
      throw new AnalyticsError('no_inputs', 'No menu canonicals to merge yet');
    }

    // canonicalNorm 별 가장 빈번한 canonicalName 선정 — 동률은 사전순 첫 표기.
    const nameByNorm = new Map<string, string>();
    const countByNorm = new Map<string, number>();
    for (const t of targets) {
      countByNorm.set(t.canonicalNorm, (countByNorm.get(t.canonicalNorm) ?? 0) + 1);
      const cur = nameByNorm.get(t.canonicalNorm);
      if (!cur || t.canonicalName < cur) nameByNorm.set(t.canonicalNorm, t.canonicalName);
    }

    const distinctNorms = [...nameByNorm.keys()];
    const inputVariants = distinctNorms.map((n) => nameByNorm.get(n)!);

    // full=false: 이미 모든 식당 그룹이 링크돼 있고 새로 추가된 것이 없으면 noop.
    if (!opts.full) {
      const unlinked = targets.filter((t) => !t.globalLink);
      if (unlinked.length === 0) {
        return {
          inputCount: 0,
          finalGroupCount: 0,
          totalChunks: 0,
          doneChunks: 0,
          model,
          version: GLOBAL_MERGE_VERSION,
        };
      }
      // 효율: 미링크 그룹의 norm 만 입력에 포함. 단, 정확도 위해 이미 매핑된
      // 그룹의 displayName 도 chunk 의 컨텍스트로 같이 보낸다 — 모델이 새
      // 항목을 기존 글로벌 그룹에 묶을 수 있도록.
      // 단순화: 이번 단계는 "전체 재매핑 또는 신규만"의 두 모드 중 신규만은
      // 컨텍스트 join 없이 단순 chunking. 기존 매핑 유지가 목적이라면 full=true 권장.
    }

    // pass 1: chunk 별 매핑.
    const chunks1 = chunk(inputVariants, GLOBAL_MERGE_CHUNK_SIZE);
    const variantToCanonical = new Map<string, string>(); // variant → pass1 canonical
    let totalChunks = chunks1.length;
    let doneChunks = 0;
    this.log?.info({ total: inputVariants.length, chunks: chunks1.length }, '[global-merge] pass1 start');

    for (let i = 0; i < chunks1.length; i += 1) {
      const ch = chunks1[i]!;
      const map = await this.callOneChunk(provider, model, ch);
      let mapped = 0;
      for (const v of ch) {
        const c = map[v];
        const canonical = typeof c === 'string' && c.trim().length > 0 ? c.trim() : v;
        variantToCanonical.set(v, canonical);
        if (map[v]) mapped += 1;
      }
      doneChunks += 1;
      progress.onChunk?.({
        pass: 1,
        chunkIndex: i,
        chunkTotal: chunks1.length,
        mappedInChunk: mapped,
      });
    }

    // pass 2: pass1 결과의 distinct canonical 들 사이의 충돌 해소 — 청크 사이
    // 같은 의미가 다른 표기로 떨어진 케이스를 다시 한 번 묶음. 입력이 작으면
    // 한 번에 들어가서 pass2 자체가 빠르게 끝남.
    const pass1Canonicals = [...new Set(variantToCanonical.values())];
    const variantToFinal = new Map<string, string>();
    if (pass1Canonicals.length > GLOBAL_MERGE_CHUNK_SIZE) {
      // pass2 도 청크 분할.
      const chunks2 = chunk(pass1Canonicals, GLOBAL_MERGE_CHUNK_SIZE);
      totalChunks += chunks2.length;
      this.log?.info({ pass1: pass1Canonicals.length, chunks: chunks2.length }, '[global-merge] pass2 start');
      const pass2Map = new Map<string, string>();
      for (let i = 0; i < chunks2.length; i += 1) {
        const ch = chunks2[i]!;
        const map = await this.callOneChunk(provider, model, ch);
        let mapped = 0;
        for (const v of ch) {
          const c = map[v];
          const finalName = typeof c === 'string' && c.trim().length > 0 ? c.trim() : v;
          pass2Map.set(v, finalName);
          if (map[v]) mapped += 1;
        }
        doneChunks += 1;
        progress.onChunk?.({
          pass: 2,
          chunkIndex: i,
          chunkTotal: chunks2.length,
          mappedInChunk: mapped,
        });
      }
      for (const [variant, c1] of variantToCanonical) {
        variantToFinal.set(variant, pass2Map.get(c1) ?? c1);
      }
    } else if (pass1Canonicals.length > 0) {
      // 단일 청크면 그대로 한 번 더.
      totalChunks += 1;
      const map = await this.callOneChunk(provider, model, pass1Canonicals);
      const pass2Map = new Map<string, string>();
      let mapped = 0;
      for (const v of pass1Canonicals) {
        const c = map[v];
        const finalName = typeof c === 'string' && c.trim().length > 0 ? c.trim() : v;
        pass2Map.set(v, finalName);
        if (map[v]) mapped += 1;
      }
      doneChunks += 1;
      progress.onChunk?.({
        pass: 2,
        chunkIndex: 0,
        chunkTotal: 1,
        mappedInChunk: mapped,
      });
      for (const [variant, c1] of variantToCanonical) {
        variantToFinal.set(variant, pass2Map.get(c1) ?? c1);
      }
    } else {
      // pass1 결과가 없으면 그대로.
      for (const [variant, c1] of variantToCanonical) {
        variantToFinal.set(variant, c1);
      }
    }

    // norm 별 → final displayName + globalKey 결정.
    const finalByNorm = new Map<string, { displayName: string; globalKey: string }>();
    for (const [norm, name] of nameByNorm) {
      const finalName = variantToFinal.get(name) ?? name;
      const globalKey = normalizeTerm(finalName) || norm;
      finalByNorm.set(norm, { displayName: finalName, globalKey });
    }

    // DB 적용. full=true 면 기존 GlobalMenuCanonical / Link 모두 비우고 새로
    // 작성. full=false 도 같은 방식 — 모델 호출이 끝났으니 멱등성 유지가 단순.
    const now = new Date();
    const distinctGlobalKeys = new Set([...finalByNorm.values()].map((v) => v.globalKey));

    await this.prisma.$transaction(async (tx) => {
      // GlobalMenuCanonical upsert by globalKey.
      const keyToId = new Map<string, string>();
      // 기존 row 들의 id 매핑 미리 가져오기.
      const existing = await tx.globalMenuCanonical.findMany({
        select: { id: true, globalKey: true },
      });
      for (const e of existing) keyToId.set(e.globalKey, e.id);

      // 변경 요약 — full 이면 모든 row 갱신, 아니면 부족한 것만 추가.
      for (const [, info] of finalByNorm) {
        if (keyToId.has(info.globalKey)) {
          // updatedAt 갱신 + version/displayName 보정.
          await tx.globalMenuCanonical.update({
            where: { id: keyToId.get(info.globalKey)! },
            data: {
              displayName: info.displayName,
              version: GLOBAL_MERGE_VERSION,
              model,
              updatedAt: now,
            },
          });
        } else {
          const created = await tx.globalMenuCanonical.create({
            data: {
              globalKey: info.globalKey,
              displayName: info.displayName,
              version: GLOBAL_MERGE_VERSION,
              model,
            },
            select: { id: true },
          });
          keyToId.set(info.globalKey, created.id);
        }
      }

      // 사용 안 되는 globalKey row 삭제 (full 이면 distinct 이외 모두, 아니면
      // 같은 처리 — 멱등 유지).
      const usedKeys = new Set([...finalByNorm.values()].map((v) => v.globalKey));
      const toDelete = existing.filter((e) => !usedKeys.has(e.globalKey));
      if (toDelete.length > 0) {
        await tx.globalMenuCanonical.deleteMany({
          where: { id: { in: toDelete.map((e) => e.id) } },
        });
      }

      // Link 모두 비우고 다시 작성. menu_canonicals 가 onDelete: Cascade 라
      // 식당 삭제 시 자동 정리되므로 단순 reset 가능.
      await tx.globalMenuCanonicalLink.deleteMany({});
      const links: {
        menuCanonicalId: string;
        restaurantId: string;
        localCanonicalNorm: string;
        globalCanonicalId: string;
      }[] = [];
      // targets 에서 (id, restaurantId, canonicalNorm) 다시 가져와야 — Link
      // 행은 menuCanonicalId 가 있어야 한다. 위에서 select 안 된 컬럼이 있어
      // 다시 조회.
      const targetRows = await tx.menuCanonical.findMany({
        select: { id: true, restaurantId: true, canonicalNorm: true },
      });
      for (const r of targetRows) {
        const info = finalByNorm.get(r.canonicalNorm);
        if (!info) continue;
        const gid = keyToId.get(info.globalKey);
        if (!gid) continue;
        links.push({
          menuCanonicalId: r.id,
          restaurantId: r.restaurantId,
          localCanonicalNorm: r.canonicalNorm,
          globalCanonicalId: gid,
        });
      }
      if (links.length > 0) {
        await tx.globalMenuCanonicalLink.createMany({ data: links });
      }
    });

    return {
      inputCount: inputVariants.length,
      finalGroupCount: distinctGlobalKeys.size,
      totalChunks,
      doneChunks,
      model,
      version: GLOBAL_MERGE_VERSION,
    };
  }

  private async callOneChunk(
    provider: LLMProvider,
    model: string,
    variants: string[],
  ): Promise<Record<string, string>> {
    try {
      const res = await provider.complete({
        prompt: buildGlobalMergePrompt(variants),
        model,
        systemPrompt: GLOBAL_MERGE_SYSTEM_PROMPT,
        temperature: TEMPERATURE,
        maxTokens: MAX_TOKENS,
        numCtx: NUM_CTX,
        format: GLOBAL_MERGE_JSON_SCHEMA,
      });
      const candidate = extractFirstJsonObject(res.text);
      if (!candidate) return {};
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string') out[k] = v;
        }
        return out;
      }
      return {};
    } catch (e) {
      const { error, message } = classifyError(e);
      this.log?.warn(
        { error, message: message.slice(0, 200) },
        '[global-merge] chunk failed — falling back to identity',
      );
      return {};
    }
  }

  // ── 통계 조회 ──────────────────────────────────────────────────────

  async getOverview(): Promise<AnalyticsOverviewType> {
    const [
      restaurantCount,
      analyzedReviewCount,
      totalMentionCount,
      perRestaurantGroupCount,
      globalLinkedCount,
      globalGroupCount,
      lastGlobal,
    ] = await Promise.all([
      this.prisma.restaurant.count(),
      this.prisma.reviewSummary.count({ where: { status: 'done' } }),
      this.prisma.menuMention.count(),
      this.prisma.menuCanonical.count(),
      this.prisma.globalMenuCanonicalLink.count(),
      this.prisma.globalMenuCanonical.count(),
      this.prisma.globalMenuCanonical.aggregate({ _max: { updatedAt: true } }),
    ]);

    const globalLinkedRatio =
      perRestaurantGroupCount === 0 ? null : globalLinkedCount / perRestaurantGroupCount;

    return {
      restaurantCount,
      analyzedReviewCount,
      totalMentionCount,
      perRestaurantGroupCount,
      globalLinkedCount,
      globalGroupCount,
      globalLinkedRatio,
      lastGlobalMergeAt: lastGlobal._max.updatedAt
        ? lastGlobal._max.updatedAt.toISOString()
        : null,
      globalVersion: GLOBAL_MERGE_VERSION,
    };
  }

  async getGlobalMenus(query: GlobalMenuQueryType): Promise<GlobalMenuResultType> {
    // 매핑된 항목과 (옵션) 매핑 안 된 항목 두 갈래 처리.
    const linked = await this.prisma.globalMenuCanonical.findMany({
      include: {
        links: {
          include: {
            menuCanonical: {
              select: {
                restaurantId: true,
                canonicalNorm: true,
                restaurant: { select: { placeId: true, name: true } },
              },
            },
          },
        },
      },
    });

    // 식당별 (restaurantId, canonicalNorm) → 멘션 통계 미리 계산.
    // MenuMention.nameNorm 이 MenuCanonical 의 nameNorm 과 매칭되므로 join.
    // GROUP BY (restaurantId, canonicalNorm) — but canonicalNorm 은 mention 에
    // 직접 없으므로 menuCanonical 을 join 해서 계산.
    const mentionStats = await this.prisma.$queryRaw<
      Array<{
        restaurantId: string;
        canonicalNorm: string;
        sentiment: string;
        cnt: number | bigint;
      }>
    >`SELECT mc.restaurantId AS restaurantId,
             mc.canonicalNorm AS canonicalNorm,
             mm.sentiment AS sentiment,
             COUNT(*) AS cnt
        FROM menu_mentions mm
        JOIN menu_canonicals mc
          ON mc.restaurantId = mm.restaurantId
         AND mc.nameNorm = mm.nameNorm
        GROUP BY mc.restaurantId, mc.canonicalNorm, mm.sentiment`;

    // (restaurantId, canonicalNorm) → { positive, negative, neutral, total }
    const statByLocal = new Map<
      string,
      { positive: number; negative: number; neutral: number; total: number }
    >();
    for (const r of mentionStats) {
      const key = `${r.restaurantId}::${r.canonicalNorm}`;
      const cur = statByLocal.get(key) ?? { positive: 0, negative: 0, neutral: 0, total: 0 };
      const cnt = Number(r.cnt);
      cur.total += cnt;
      if (r.sentiment === 'positive') cur.positive += cnt;
      else if (r.sentiment === 'negative') cur.negative += cnt;
      else cur.neutral += cnt;
      statByLocal.set(key, cur);
    }

    interface RestaurantContrib {
      placeId: string;
      name: string;
      mentionCount: number;
      positive: number;
      negative: number;
    }
    const items: GlobalMenuStatType[] = [];

    for (const g of linked) {
      let total = 0;
      let positive = 0;
      let negative = 0;
      let neutral = 0;
      const restaurants: RestaurantContrib[] = [];
      for (const link of g.links) {
        const mc = link.menuCanonical;
        const stat =
          statByLocal.get(`${link.restaurantId}::${mc.canonicalNorm}`) ?? {
            positive: 0,
            negative: 0,
            neutral: 0,
            total: 0,
          };
        total += stat.total;
        positive += stat.positive;
        negative += stat.negative;
        neutral += stat.neutral;
        if (stat.total > 0) {
          restaurants.push({
            placeId: mc.restaurant.placeId,
            name: mc.restaurant.name,
            mentionCount: stat.total,
            positive: stat.positive,
            negative: stat.negative,
          });
        }
      }
      const topRestaurants = restaurants
        .sort((a, b) => b.mentionCount - a.mentionCount)
        .slice(0, 3)
        .map((r) => {
          const denom = r.positive + r.negative;
          return {
            placeId: r.placeId,
            name: r.name,
            mentionCount: r.mentionCount,
            positive: r.positive,
            negative: r.negative,
            positiveRatio: denom === 0 ? null : r.positive / denom,
          };
        });
      const denom = positive + negative;
      items.push({
        globalKey: g.globalKey,
        displayName: g.displayName,
        totalMentions: total,
        restaurantCount: restaurants.length,
        positive,
        negative,
        neutral,
        positiveRatio: denom === 0 ? null : positive / denom,
        topRestaurants,
      });
    }

    if (query.includeUnlinked) {
      // 링크 없는 식당 그룹들 — 자기 자신을 globalKey 로 fallback.
      const unlinkedTargets = await this.prisma.menuCanonical.findMany({
        where: { globalLink: null },
        select: {
          canonicalNorm: true,
          canonicalName: true,
          restaurantId: true,
          restaurant: { select: { placeId: true, name: true } },
        },
      });
      const byKey = new Map<
        string,
        {
          displayName: string;
          total: number;
          positive: number;
          negative: number;
          neutral: number;
          restaurants: RestaurantContrib[];
        }
      >();
      for (const t of unlinkedTargets) {
        const key = `unlinked:${t.canonicalNorm}`;
        const stat = statByLocal.get(`${t.restaurantId}::${t.canonicalNorm}`) ?? {
          positive: 0,
          negative: 0,
          neutral: 0,
          total: 0,
        };
        const cur = byKey.get(key) ?? {
          displayName: t.canonicalName,
          total: 0,
          positive: 0,
          negative: 0,
          neutral: 0,
          restaurants: [] as RestaurantContrib[],
        };
        cur.total += stat.total;
        cur.positive += stat.positive;
        cur.negative += stat.negative;
        cur.neutral += stat.neutral;
        if (stat.total > 0) {
          cur.restaurants.push({
            placeId: t.restaurant.placeId,
            name: t.restaurant.name,
            mentionCount: stat.total,
            positive: stat.positive,
            negative: stat.negative,
          });
        }
        byKey.set(key, cur);
      }
      for (const [key, b] of byKey) {
        const denom = b.positive + b.negative;
        const topRestaurants = b.restaurants
          .sort((a, b2) => b2.mentionCount - a.mentionCount)
          .slice(0, 3)
          .map((r) => {
            const d = r.positive + r.negative;
            return {
              placeId: r.placeId,
              name: r.name,
              mentionCount: r.mentionCount,
              positive: r.positive,
              negative: r.negative,
              positiveRatio: d === 0 ? null : r.positive / d,
            };
          });
        items.push({
          globalKey: key,
          displayName: b.displayName,
          totalMentions: b.total,
          restaurantCount: b.restaurants.length,
          positive: b.positive,
          negative: b.negative,
          neutral: b.neutral,
          positiveRatio: denom === 0 ? null : b.positive / denom,
          topRestaurants,
        });
      }
    }

    // 검색 + 필터.
    let filtered = items.filter((i) => i.totalMentions >= query.minMentions);
    if (query.q) {
      const q = query.q.trim().toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.displayName.toLowerCase().includes(q) ||
          i.globalKey.toLowerCase().includes(q),
      );
    }

    filtered.sort((a, b) => sortGlobal(a, b, query.sort));
    filtered = filtered.slice(0, query.limit);

    const linkedTotal = await this.prisma.menuCanonical.count();
    const linkedRatio = linkedTotal === 0 ? null : linked.reduce((sum, g) => sum + g.links.length, 0) / linkedTotal;

    return {
      totalGroups: linked.length,
      linkedRestaurantCount: new Set(
        linked.flatMap((g) => g.links.map((l) => l.restaurantId)),
      ).size,
      linkedRatio,
      currentVersion: GLOBAL_MERGE_VERSION,
      items: filtered,
    };
  }

  private async resolveProvider(): Promise<{ provider: LLMProvider; model: string } | null> {
    if (this.opts.resolveOverride) return this.opts.resolveOverride();
    const resolved = await this.aiConfig.getResolved('ollama-cloud');
    if (!resolved) return null;
    const model = resolved.defaultModel?.trim();
    if (!model) return null;
    const provider = (this.opts.cache ?? adapterCache).get(resolved);
    return { provider, model };
  }
}

const sortGlobal = (
  a: GlobalMenuStatType,
  b: GlobalMenuStatType,
  sort: GlobalMenuQueryType['sort'],
): number => {
  switch (sort) {
    case 'positive':
      return b.positive - a.positive || b.totalMentions - a.totalMentions;
    case 'positiveRatio': {
      const ar = a.positiveRatio;
      const br = b.positiveRatio;
      if (ar === null && br === null) return b.totalMentions - a.totalMentions;
      if (ar === null) return 1;
      if (br === null) return -1;
      return br - ar || b.totalMentions - a.totalMentions;
    }
    case 'restaurants':
      return b.restaurantCount - a.restaurantCount || b.totalMentions - a.totalMentions;
    case 'mentions':
    default:
      return b.totalMentions - a.totalMentions;
  }
};

const chunk = <T>(arr: T[], n: number): T[][] => {
  if (n <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};
