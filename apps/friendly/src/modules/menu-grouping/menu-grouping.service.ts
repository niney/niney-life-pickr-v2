import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type {
  MenuGroupRunResultType,
  MenuGroupingRestaurantStatusListType,
  MenuGroupingRestaurantStatusQueryType,
  MenuGroupingRestaurantStatusType,
  MenuRankingItemType,
  MenuRankingQueryType,
  MenuRankingResultType,
} from '@repo/api-contract';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import { classifyError } from '../ai/ai.service.js';
import { normalizeTerm, extractFirstJsonObject } from '../summary/summary.service.js';
import {
  MENU_GROUPING_CHUNK_SIZE,
  MENU_GROUPING_JSON_SCHEMA,
  MENU_GROUPING_SYSTEM_PROMPT,
  MENU_GROUPING_VERSION,
  buildGroupingUserPrompt,
} from './menu-grouping.prompts.js';

const TEMPERATURE = 0.1;
// 그룹핑 출력은 입력 메뉴 수에 비례 — 80개일 때 평균 ~3000 토큰 예상.
const MAX_TOKENS = 4000;
const NUM_CTX = 8192;

export class MenuGroupingError extends Error {
  constructor(
    public readonly code: 'no_provider' | 'no_menus' | 'restaurant_not_found',
    message: string,
  ) {
    super(message);
    this.name = 'MenuGroupingError';
  }
}

export interface MenuGroupingServiceOptions {
  cache?: AdapterCache;
  resolveOverride?: () => Promise<{ provider: LLMProvider; model: string } | null>;
  logger?: FastifyBaseLogger;
}

export class MenuGroupingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiConfig: AiConfigService,
    private readonly opts: MenuGroupingServiceOptions = {},
  ) {}

  private get log(): FastifyBaseLogger | null {
    return this.opts.logger ?? null;
  }

  // 단일 식당의 distinct nameNorm 들을 LLM 으로 canonical 그룹에 매핑.
  // 기존 매핑은 모두 삭제 후 새로 작성 (idempotent). LLM 미설정/오류 시
  // MenuGroupingError 던짐 — 호출자(라우트)가 4xx/5xx 로 변환.
  async groupForRestaurant(placeId: string): Promise<MenuGroupRunResultType> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { placeId },
      select: { id: true, name: true, category: true },
    });
    if (!restaurant) {
      throw new MenuGroupingError('restaurant_not_found', `Restaurant not found: ${placeId}`);
    }

    // distinct nameNorm + 그 nameNorm 의 대표 원문 (가장 빈도 높은 표기).
    // SQLite 에서 raw groupBy 두 번 — distinct nameNorm 들 + 각 nameNorm 의
    // 가장 빈도 높은 원문 name. 대안은 menuMention 전체 read 후 JS 에서 집계인데,
    // 메뉴 멘션 수가 많을 수 있어 DB 에서 처리.
    const grouped = await this.prisma.menuMention.groupBy({
      by: ['nameNorm', 'name'],
      where: { restaurantId: restaurant.id },
      _count: { _all: true },
    });
    if (grouped.length === 0) {
      throw new MenuGroupingError('no_menus', 'No menu mentions to group yet');
    }

    // nameNorm 별로 가장 빈도 높은 원문 표기를 input variant 로 사용.
    const bestNameByNorm = new Map<string, { name: string; count: number }>();
    for (const row of grouped) {
      const cur = bestNameByNorm.get(row.nameNorm);
      const count = row._count._all;
      if (!cur || count > cur.count) {
        bestNameByNorm.set(row.nameNorm, { name: row.name, count });
      }
    }

    // 변형 = 대표 원문들 (LLM 입력). nameNorm → variant 매핑은 응답을
    // 다시 nameNorm 으로 풀어쓸 때 사용.
    const variantToNorm = new Map<string, string>();
    const variants: string[] = [];
    for (const [norm, { name }] of bestNameByNorm) {
      variantToNorm.set(name, norm);
      variants.push(name);
    }

    const resolved = await this.resolveProvider();
    if (!resolved) {
      throw new MenuGroupingError(
        'no_provider',
        'LLM provider/model not configured (check AI providers admin page)',
      );
    }
    const { provider, model } = resolved;

    // 청크 분할 — 같은 청크 안에서만 묶이는 한계는 수용.
    // 현실 식당은 메뉴 100 개 미만이라 거의 분할 안 일어남.
    const chunks = chunk(variants, MENU_GROUPING_CHUNK_SIZE);
    this.log?.info(
      { placeId, total: variants.length, chunks: chunks.length, model },
      '[menu-grouping] start',
    );

    // canonical 결정 — 같은 청크가 출력하는 canonicalName 을 그대로 신뢰.
    // 다른 청크 사이의 동일 canonical 충돌은 최소화하기 위해 청크 분할 자체가
    // 드문 경우만 일어나도록 한도를 크게 잡음(80).
    const variantToCanonical = new Map<string, string>();
    for (const ch of chunks) {
      const map = await this.callOneChunk(provider, model, {
        restaurantName: restaurant.name,
        category: restaurant.category,
        variants: ch,
      });
      // LLM 이 어떤 키를 빠뜨릴 수 있음 — 빠진 항목은 자기 자신을 canonical 로.
      for (const v of ch) {
        const c = map[v];
        const canonical = typeof c === 'string' && c.trim().length > 0 ? c.trim() : v;
        variantToCanonical.set(v, canonical);
      }
    }

    // DB 적용 — delete + createMany in transaction.
    const now = new Date();
    const rows = [...variantToCanonical.entries()].map(([variant, canonical]) => {
      const norm = variantToNorm.get(variant)!;
      return {
        restaurantId: restaurant.id,
        nameNorm: norm,
        canonicalName: canonical,
        canonicalNorm: normalizeTerm(canonical) || norm,
        version: MENU_GROUPING_VERSION,
        model,
        createdAt: now,
      };
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.menuCanonical.deleteMany({ where: { restaurantId: restaurant.id } });
      if (rows.length > 0) await tx.menuCanonical.createMany({ data: rows });
    });

    const groupCount = new Set(rows.map((r) => r.canonicalNorm)).size;
    this.log?.info(
      { placeId, mapped: rows.length, groups: groupCount, model },
      '[menu-grouping] done',
    );
    return {
      ok: true,
      placeId,
      inputCount: variants.length,
      groupCount,
      mappedCount: rows.length,
      model,
      version: MENU_GROUPING_VERSION,
    };
  }

  private async callOneChunk(
    provider: LLMProvider,
    model: string,
    input: { restaurantName: string; category: string | null; variants: string[] },
  ): Promise<Record<string, string>> {
    try {
      const res = await provider.complete({
        prompt: buildGroupingUserPrompt(input),
        model,
        systemPrompt: MENU_GROUPING_SYSTEM_PROMPT,
        temperature: TEMPERATURE,
        maxTokens: MAX_TOKENS,
        numCtx: NUM_CTX,
        format: MENU_GROUPING_JSON_SCHEMA,
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
      this.log?.warn({ error, message: message.slice(0, 200) }, '[menu-grouping] chunk failed');
      // 청크 실패는 빈 맵 반환 — 호출자가 fallback (자기 자신을 canonical 로).
      return {};
    }
  }

  // 식당 단위 메뉴 순위. canonical 매핑이 없는 nameNorm 은 자기 자신을 그룹키로
  // fallback. unmappedMenus 에 그 변형들을 같이 노출.
  async getRanking(placeId: string, query: MenuRankingQueryType): Promise<MenuRankingResultType> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { placeId },
      select: { id: true },
    });
    if (!restaurant) {
      throw new MenuGroupingError('restaurant_not_found', `Restaurant not found: ${placeId}`);
    }

    const [mentions, canonicals] = await Promise.all([
      this.prisma.menuMention.findMany({
        where: { restaurantId: restaurant.id },
        select: {
          name: true,
          nameNorm: true,
          sentiment: true,
          traitsJson: true,
          summaryId: true,
          summary: { select: { reviewId: true } },
        },
      }),
      this.prisma.menuCanonical.findMany({
        where: { restaurantId: restaurant.id },
        select: {
          nameNorm: true,
          canonicalName: true,
          canonicalNorm: true,
          version: true,
          createdAt: true,
          // 글로벌 비교 위젯 — 이 메뉴가 GlobalMenuCanonical 에 링크돼 있는지.
          globalLink: {
            select: {
              global: { select: { id: true, globalKey: true, displayName: true } },
            },
          },
        },
      }),
    ]);

    const canonByNorm = new Map(canonicals.map((c) => [c.nameNorm, c]));

    // 글로벌 비교 통계 — 우리 식당의 메뉴들이 링크된 globalCanonical id 수집 후
    // 그 globalId 들에 매핑된 모든 식당의 멘션을 합산. 식당당 1쿼리로 바운드 — 보통
    // 한 globalKey 에 식당 1~10개 사이라 OK. 더 빨라야 하면 raw SQL 로 단일 쿼리화.
    const targetGlobalIds = canonicals
      .map((c) => c.globalLink?.global.id)
      .filter((id): id is string => !!id);

    interface GlobalAgg {
      id: string;
      globalKey: string;
      displayName: string;
      totalMentions: number;
      positive: number;
      negative: number;
      restaurants: Set<string>;
    }
    const globalAggById = new Map<string, GlobalAgg>();

    if (targetGlobalIds.length > 0) {
      // 같은 글로벌에 링크된 모든 식당 그룹을 끌어온다 — (restaurantId, nameNorm)
      // 으로 menu_mentions 와 join 하기 위함.
      const siblings = await this.prisma.menuCanonical.findMany({
        where: { globalLink: { globalCanonicalId: { in: targetGlobalIds } } },
        select: {
          restaurantId: true,
          nameNorm: true,
          globalLink: {
            select: {
              global: { select: { id: true, globalKey: true, displayName: true } },
            },
          },
        },
      });

      // restaurantId → [{ nameNorm, globalId }] — 식당별로 한 번에 멘션 끌어옴.
      const siblingsByRestaurant = new Map<
        string,
        { nameNorm: string; global: { id: string; globalKey: string; displayName: string } }[]
      >();
      for (const s of siblings) {
        if (!s.globalLink) continue;
        const arr = siblingsByRestaurant.get(s.restaurantId) ?? [];
        arr.push({ nameNorm: s.nameNorm, global: s.globalLink.global });
        siblingsByRestaurant.set(s.restaurantId, arr);
      }

      for (const [restId, sibs] of siblingsByRestaurant) {
        const norms = sibs.map((s) => s.nameNorm);
        const siblingMentions = await this.prisma.menuMention.findMany({
          where: { restaurantId: restId, nameNorm: { in: norms } },
          select: { sentiment: true, nameNorm: true },
        });
        // 이 식당의 nameNorm → globalId 매핑.
        const globalByNorm = new Map(sibs.map((s) => [s.nameNorm, s.global]));
        for (const mm of siblingMentions) {
          const g = globalByNorm.get(mm.nameNorm);
          if (!g) continue;
          let agg = globalAggById.get(g.id);
          if (!agg) {
            agg = {
              id: g.id,
              globalKey: g.globalKey,
              displayName: g.displayName,
              totalMentions: 0,
              positive: 0,
              negative: 0,
              restaurants: new Set<string>(),
            };
            globalAggById.set(g.id, agg);
          }
          agg.totalMentions += 1;
          if (mm.sentiment === 'positive') agg.positive += 1;
          else if (mm.sentiment === 'negative') agg.negative += 1;
          // neutral 은 카운트만 totalMentions 에 들어가고 별도 트랙 안 함 — UI 가 안 씀.
          agg.restaurants.add(restId);
        }
      }
    }
    interface Bucket {
      canonicalName: string;
      canonicalKey: string;
      mapped: boolean;
      mentionCount: number;
      positive: number;
      negative: number;
      neutral: number;
      variantCounts: Map<string, number>;
      traitCounts: Map<string, number>;
      sampleReviewByPolarity: { positive?: string; negative?: string; neutral?: string };
    }
    const buckets = new Map<string, Bucket>();

    for (const m of mentions) {
      const canon = canonByNorm.get(m.nameNorm);
      const key = canon ? canon.canonicalNorm : m.nameNorm;
      const displayName = canon ? canon.canonicalName : m.name;
      const mapped = !!canon;

      let b = buckets.get(key);
      if (!b) {
        b = {
          canonicalName: displayName,
          canonicalKey: key,
          mapped,
          mentionCount: 0,
          positive: 0,
          negative: 0,
          neutral: 0,
          variantCounts: new Map(),
          traitCounts: new Map(),
          sampleReviewByPolarity: {},
        };
        buckets.set(key, b);
      }
      b.mentionCount += 1;
      if (m.sentiment === 'positive') b.positive += 1;
      else if (m.sentiment === 'negative') b.negative += 1;
      else b.neutral += 1;

      b.variantCounts.set(m.name, (b.variantCounts.get(m.name) ?? 0) + 1);

      try {
        const traits = JSON.parse(m.traitsJson) as unknown;
        if (Array.isArray(traits)) {
          for (const t of traits) {
            if (typeof t === 'string' && t.trim().length > 0) {
              b.traitCounts.set(t, (b.traitCounts.get(t) ?? 0) + 1);
            }
          }
        }
      } catch {
        // ignore malformed traitsJson
      }

      const polarity =
        m.sentiment === 'positive' || m.sentiment === 'negative' ? m.sentiment : 'neutral';
      if (!b.sampleReviewByPolarity[polarity] && m.summary?.reviewId) {
        b.sampleReviewByPolarity[polarity] = m.summary.reviewId;
      }
    }

    // canonicalNorm → globalCanonical 정보 매핑 (이 식당 한정).
    const globalByLocalNorm = new Map<
      string,
      { id: string; globalKey: string; displayName: string }
    >();
    for (const c of canonicals) {
      if (c.globalLink) {
        globalByLocalNorm.set(c.canonicalNorm, c.globalLink.global);
      }
    }

    const items: MenuRankingItemType[] = [];
    for (const b of buckets.values()) {
      if (b.mentionCount < query.minMentions) continue;
      const denom = b.positive + b.negative;
      const positiveRatio = denom === 0 ? null : b.positive / denom;
      // 변형은 빈도 내림차순.
      const variants = [...b.variantCounts.entries()]
        .sort((a, c) => c[1] - a[1])
        .map(([n]) => n);
      const topTraits = [...b.traitCounts.entries()]
        .sort((a, c) => c[1] - a[1])
        .slice(0, 3)
        .map(([n]) => n);
      const sampleReviewIds = [
        b.sampleReviewByPolarity.positive,
        b.sampleReviewByPolarity.negative,
        b.sampleReviewByPolarity.neutral,
      ].filter((x): x is string => !!x);

      const globalRef = b.mapped ? globalByLocalNorm.get(b.canonicalKey) : undefined;
      let globalField: MenuRankingItemType['global'] = null;
      if (globalRef) {
        const agg = globalAggById.get(globalRef.id);
        if (agg) {
          const gDenom = agg.positive + agg.negative;
          globalField = {
            globalKey: agg.globalKey,
            displayName: agg.displayName,
            totalMentions: agg.totalMentions,
            positive: agg.positive,
            negative: agg.negative,
            positiveRatio: gDenom === 0 ? null : agg.positive / gDenom,
            restaurantCount: agg.restaurants.size,
          };
        } else {
          // 글로벌 링크가 있긴 한데 멘션 집계가 아직 없는 케이스
          // (멘션 0이지만 매핑만 있는 코너 케이스). 표시용으로 빈 값 채움.
          globalField = {
            globalKey: globalRef.globalKey,
            displayName: globalRef.displayName,
            totalMentions: 0,
            positive: 0,
            negative: 0,
            positiveRatio: null,
            restaurantCount: 0,
          };
        }
      }
      items.push({
        canonicalName: b.canonicalName,
        canonicalKey: b.canonicalKey,
        mapped: b.mapped,
        mentionCount: b.mentionCount,
        positive: b.positive,
        negative: b.negative,
        neutral: b.neutral,
        positiveRatio,
        global: globalField,
        variants,
        topTraits,
        sampleReviewIds,
      });
    }

    // 정렬.
    items.sort((a, b) => sortRanking(a, b, query.sort));

    // 마지막 그룹핑 메타데이터.
    let groupedAt: string | null = null;
    let storedVersion: number | null = null;
    for (const c of canonicals) {
      if (!groupedAt || c.createdAt.toISOString() > groupedAt) {
        groupedAt = c.createdAt.toISOString();
      }
      if (storedVersion === null || c.version < storedVersion) {
        storedVersion = c.version;
      }
    }

    const unmappedMenus = items
      .filter((i) => !i.mapped)
      .flatMap((i) => i.variants);

    const totalMentions = mentions.length;
    const groupedCount = items.filter((i) => i.mapped).length;

    return {
      placeId,
      totalMentions,
      groupedCount,
      unmappedMenus,
      groupedAt,
      modelVersion: storedVersion,
      currentVersion: MENU_GROUPING_VERSION,
      items,
    };
  }

  // 관리자 페이지 메인 테이블용 — 식당별 정규화 상태. 쿼리(검색·필터·정렬·
  // 페이지) 적용 후 현재 페이지만 반환. groupBy 집계 자체는 전체에 대해
  // 한 번 돌리고 메모리에서 필터/정렬/슬라이스 — 식당 수천 단위까지는 부담
  // 미미하고, "처리 필요" 카운트(attentionCount)도 같은 패스로 한 번에 계산.
  // 진짜 수만 단위 진입 시 SQL raw 로 옮기는 게 다음 단계.
  async getRestaurantsStatus(
    query: MenuGroupingRestaurantStatusQueryType,
  ): Promise<Omit<MenuGroupingRestaurantStatusListType, 'currentVersion'>> {
    // 식당 + 그 통계 한 방에. SQLite + 단일 인스턴스라 N+1 가 부담이라
    // groupBy 로 묶는다. 단일 식당 수가 수백~수천 단위 범위라 OK.
    const restaurants = await this.prisma.restaurant.findMany({
      // 메뉴 그루핑 어드민 화면은 네이버 전용 (placeId 가 응답 키).
      where: { source: 'naver' },
      select: {
        id: true,
        placeId: true,
        name: true,
        category: true,
        _count: { select: { visitorReviews: true } },
      },
    });

    if (restaurants.length === 0) {
      return {
        items: [],
        total: 0,
        totalRestaurants: 0,
        attentionCount: 0,
        page: query.page,
        pageSize: query.pageSize,
      };
    }

    const ids = restaurants.map((r) => r.id);

    // distinct nameNorm 수, mapped 수, 마지막 그룹핑 시각/버전, 분석 done 수
    // 모두 한 번씩의 groupBy 로. 식당 수가 많아도 한 번에 처리.
    const [mentionGroups, canonicalGroups, latestCanonical, analyzedSummaries] =
      await Promise.all([
        this.prisma.menuMention.groupBy({
          by: ['restaurantId', 'nameNorm'],
          where: { restaurantId: { in: ids } },
        }),
        this.prisma.menuCanonical.groupBy({
          by: ['restaurantId', 'nameNorm'],
          where: { restaurantId: { in: ids } },
        }),
        this.prisma.menuCanonical.groupBy({
          by: ['restaurantId'],
          where: { restaurantId: { in: ids } },
          _max: { createdAt: true },
          _min: { version: true },
        }),
        // 분석 done 수 — review 의 restaurantId 로 풀어내야 해서 select 후 메모리 집계.
        // done 행은 보통 식당당 수십~수백이라 부하 미미.
        this.prisma.reviewSummary.findMany({
          where: { status: 'done', review: { restaurantId: { in: ids } } },
          select: { review: { select: { restaurantId: true } } },
        }),
      ]);

    const analyzedMap = new Map<string, number>();
    for (const s of analyzedSummaries) {
      const rid = s.review.restaurantId;
      analyzedMap.set(rid, (analyzedMap.get(rid) ?? 0) + 1);
    }

    const distinctMenuByRest = new Map<string, number>();
    for (const g of mentionGroups) {
      distinctMenuByRest.set(g.restaurantId, (distinctMenuByRest.get(g.restaurantId) ?? 0) + 1);
    }
    const mappedByRest = new Map<string, number>();
    for (const g of canonicalGroups) {
      mappedByRest.set(g.restaurantId, (mappedByRest.get(g.restaurantId) ?? 0) + 1);
    }
    const lastByRest = new Map<string, { at: Date | null; version: number | null }>();
    for (const g of latestCanonical) {
      lastByRest.set(g.restaurantId, {
        at: g._max.createdAt,
        version: g._min.version ?? null,
      });
    }

    const rows: MenuGroupingRestaurantStatusType[] = restaurants.map((r) => {
      const distinct = distinctMenuByRest.get(r.id) ?? 0;
      const mapped = mappedByRest.get(r.id) ?? 0;
      const last = lastByRest.get(r.id);
      return {
        // source='naver' 필터로 placeId non-null.
        placeId: r.placeId!,
        name: r.name,
        category: r.category,
        totalReviews: r._count.visitorReviews,
        analyzedReviews: analyzedMap.get(r.id) ?? 0,
        distinctMenus: distinct,
        mappedMenus: mapped,
        unmappedMenus: Math.max(0, distinct - mapped),
        lastGroupedAt: last?.at ? last.at.toISOString() : null,
        storedVersion: last?.version ?? null,
      };
    });

    // attentionCount 는 항상 전체 기준 — 필터/페이지와 무관하게 sticky bar
    // 표시가 안정적이어야 한다. UI 의 needsAttention 정의와 동일.
    const needsAttention = (r: MenuGroupingRestaurantStatusType): boolean =>
      r.unmappedMenus > 0 ||
      (r.storedVersion !== null && r.storedVersion < MENU_GROUPING_VERSION);
    const attentionCount = rows.filter(needsAttention).length;

    // 필터.
    let filtered = rows;
    const q = query.q?.trim().toLowerCase();
    if (q) filtered = filtered.filter((r) => r.name.toLowerCase().includes(q));
    if (query.attention) filtered = filtered.filter(needsAttention);

    // 정렬 — 동률은 항상 name asc 로 안정 정렬.
    const cmpName = (a: MenuGroupingRestaurantStatusType, b: MenuGroupingRestaurantStatusType) =>
      a.name.localeCompare(b.name);
    filtered.sort((a, b) => {
      switch (query.sort) {
        case 'analyzed':
          return b.analyzedReviews - a.analyzedReviews || cmpName(a, b);
        case 'name':
          return cmpName(a, b);
        case 'unmapped':
        default:
          return b.unmappedMenus - a.unmappedMenus || cmpName(a, b);
      }
    });

    const total = filtered.length;
    const offset = (query.page - 1) * query.pageSize;
    const items = filtered.slice(offset, offset + query.pageSize);

    return {
      items,
      total,
      totalRestaurants: rows.length,
      attentionCount,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  private async resolveProvider(): Promise<{ provider: LLMProvider; model: string } | null> {
    if (this.opts.resolveOverride) return this.opts.resolveOverride();
    const resolved = await this.aiConfig.getResolved('ollama-cloud', 'chat');
    if (!resolved) return null;
    const model = resolved.defaultModel?.trim();
    if (!model) return null;
    const provider = (this.opts.cache ?? adapterCache).get(resolved);
    return { provider, model };
  }
}

const sortRanking = (
  a: MenuRankingItemType,
  b: MenuRankingItemType,
  sort: MenuRankingQueryType['sort'],
): number => {
  switch (sort) {
    case 'positive':
      return b.positive - a.positive || b.mentionCount - a.mentionCount;
    case 'negative':
      return b.negative - a.negative || b.mentionCount - a.mentionCount;
    case 'positiveRatio': {
      // null (긍/부 모두 0) 은 마지막.
      const ar = a.positiveRatio;
      const br = b.positiveRatio;
      if (ar === null && br === null) return b.mentionCount - a.mentionCount;
      if (ar === null) return 1;
      if (br === null) return -1;
      return br - ar || b.mentionCount - a.mentionCount;
    }
    case 'mentions':
    default:
      return b.mentionCount - a.mentionCount;
  }
};

const chunk = <T>(arr: T[], n: number): T[][] => {
  if (n <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

