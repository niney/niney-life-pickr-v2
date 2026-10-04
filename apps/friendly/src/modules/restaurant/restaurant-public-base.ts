import { Prisma, type PrismaClient } from '@prisma/client';
import type { RestaurantPublicListItemType } from '@repo/api-contract';
import { getPublicListTourMap } from '../tour/tour-public.service.js';

// 가게별 리뷰 요약 집계(상태·감정 분포)와 공개 맛집 베이스 캐시.
//
// 공개 목록·스마트픽·랭킹은 요청마다 전 가게 snapshotJson 을 JSON.parse 하고 전 리뷰 요약을
// Prisma 관계 select 로 읽어 JS 에서 셌다. 운영은 done 요약마다 임베딩(~13KB)이 붙어 행이 무거워
// 요청 1건에 수백 MB·수 초가 들었고, 동시 요청이 겹치면 pm2 메모리 상한(1.5GB)을 넘어 재시작됐다
// (docs/PLAN-perf-2.md 1차). 집계는 SQL GROUP BY 한 번, snapshot 은 필요한 4개 값만 SQL 에서 뽑고,
// 필터 전 전체를 TTL 동안 공유한다. q·category·bbox·정렬·페이지는 호출자가 메모리에서 한다.

export interface SummaryBucket {
  pending: number;
  running: number;
  done: number;
  failed: number;
  positive: number;
  negative: number;
  neutral: number;
  mixed: number;
  sentSum: number;
  sentN: number;
  satSum: number;
  satN: number;
}

export const emptySummaryBucket = (): SummaryBucket => ({
  pending: 0,
  running: 0,
  done: 0,
  failed: 0,
  positive: 0,
  negative: 0,
  neutral: 0,
  mixed: 0,
  sentSum: 0,
  sentN: 0,
  satSum: 0,
  satN: 0,
});

type AggregateNumber = number | bigint | null;
interface SummaryAggregateRow {
  restaurantId: string;
  pending: AggregateNumber;
  running: AggregateNumber;
  done: AggregateNumber;
  failed: AggregateNumber;
  positive: AggregateNumber;
  negative: AggregateNumber;
  neutral: AggregateNumber;
  mixed: AggregateNumber;
  sentSum: AggregateNumber;
  sentN: AggregateNumber;
  satSum: AggregateNumber;
  satN: AggregateNumber;
}
const toNumber = (value: AggregateNumber): number => (value === null ? 0 : Number(value));

// queued 는 pending 에 합산(카드 의미), cancelled 는 어느 버킷에도 안 넣고, 감정·평균은 done 만.
const SUMMARY_AGG_COLUMNS = Prisma.sql`
  SUM(CASE WHEN rs."status" IN ('queued', 'pending') THEN 1 ELSE 0 END) AS "pending",
  SUM(CASE WHEN rs."status" = 'running' THEN 1 ELSE 0 END) AS "running",
  SUM(CASE WHEN rs."status" = 'done' THEN 1 ELSE 0 END) AS "done",
  SUM(CASE WHEN rs."status" = 'failed' THEN 1 ELSE 0 END) AS "failed",
  SUM(CASE WHEN rs."status" = 'done' AND rs."sentiment" = 'positive' THEN 1 ELSE 0 END) AS "positive",
  SUM(CASE WHEN rs."status" = 'done' AND rs."sentiment" = 'negative' THEN 1 ELSE 0 END) AS "negative",
  SUM(CASE WHEN rs."status" = 'done' AND rs."sentiment" = 'neutral' THEN 1 ELSE 0 END) AS "neutral",
  SUM(CASE WHEN rs."status" = 'done' AND rs."sentiment" = 'mixed' THEN 1 ELSE 0 END) AS "mixed",
  CAST(SUM(CASE WHEN rs."status" = 'done' AND rs."sentimentScore" IS NOT NULL THEN rs."sentimentScore" ELSE 0 END) AS REAL) AS "sentSum",
  SUM(CASE WHEN rs."status" = 'done' AND rs."sentimentScore" IS NOT NULL THEN 1 ELSE 0 END) AS "sentN",
  SUM(CASE WHEN rs."status" = 'done' AND rs."satisfactionScore" IS NOT NULL THEN rs."satisfactionScore" ELSE 0 END) AS "satSum",
  SUM(CASE WHEN rs."status" = 'done' AND rs."satisfactionScore" IS NOT NULL THEN 1 ELSE 0 END) AS "satN"`;

// 커버링 인덱스 힌트. 통계(ANALYZE)가 없으면 플래너가 unique(reviewId) 인덱스를 골라 임베딩이 든 큰
// 행을 읽는다 — 힌트로 인덱스만 읽게 한다. 마이그레이션 전 DB 처럼 인덱스가 없으면 힌트 없이 폴백.
const VR_AGG_INDEX = 'visitor_reviews_restaurantId_id_idx';
const RS_AGG_INDEX = 'review_summaries_agg_idx';
let aggIndexHint = true;

const SUMMARY_AGG_BATCH_SIZE = 500;

// restaurantId → 집계 버킷. ids=null 이면 전 가게를 한 번에(GROUP BY 한 번), 배열이면 500개씩 IN.
// 요약이 하나도 없는 가게는 맵에 없다 — 호출자가 emptySummaryBucket() 으로 채운다.
export async function aggregateSummaryBuckets(
  prisma: PrismaClient,
  ids: readonly string[] | null,
): Promise<Map<string, SummaryBucket>> {
  const out = new Map<string, SummaryBucket>();
  const query = (batch: readonly string[] | null, hint: boolean) =>
    prisma.$queryRaw<SummaryAggregateRow[]>`
      SELECT v."restaurantId" AS "restaurantId", ${SUMMARY_AGG_COLUMNS}
        FROM "visitor_reviews" v ${hint ? Prisma.raw(`INDEXED BY "${VR_AGG_INDEX}"`) : Prisma.empty}
        JOIN "review_summaries" rs ${hint ? Prisma.raw(`INDEXED BY "${RS_AGG_INDEX}"`) : Prisma.empty}
          ON rs."reviewId" = v."id"
       ${batch ? Prisma.sql`WHERE v."restaurantId" IN (${Prisma.join(batch)})` : Prisma.empty}
       GROUP BY v."restaurantId"`;
  const run = async (batch: readonly string[] | null): Promise<SummaryAggregateRow[]> => {
    if (aggIndexHint) {
      try {
        return await query(batch, true);
      } catch (e) {
        if (!(e instanceof Error) || !/no such index/i.test(e.message)) throw e;
        aggIndexHint = false;
      }
    }
    return query(batch, false);
  };
  const batches: Array<readonly string[] | null> = [];
  if (ids === null) batches.push(null);
  else for (let i = 0; i < ids.length; i += SUMMARY_AGG_BATCH_SIZE) batches.push(ids.slice(i, i + SUMMARY_AGG_BATCH_SIZE));
  for (const batch of batches) {
    for (const row of await run(batch)) {
      out.set(row.restaurantId, {
        pending: toNumber(row.pending),
        running: toNumber(row.running),
        done: toNumber(row.done),
        failed: toNumber(row.failed),
        positive: toNumber(row.positive),
        negative: toNumber(row.negative),
        neutral: toNumber(row.neutral),
        mixed: toNumber(row.mixed),
        sentSum: toNumber(row.sentSum),
        sentN: toNumber(row.sentN),
        satSum: toNumber(row.satSum),
        satN: toNumber(row.satN),
      });
    }
  }
  return out;
}

// ---- 공개 맛집 베이스 ----

export interface PublicRestaurantBaseRow {
  // 네이버 Restaurant.id
  id: string;
  canonicalId: string;
  // 공개 목록 카드 — 다이닝코드·테이블링 형제의 리뷰·요약 수까지 합산한 값. 호출자는 읽기만 한다.
  item: RestaurantPublicListItemType;
  // 네이버 행 자신의 집계(형제 합산 없음) — 스마트픽·랭킹이 기존 의미 그대로 쓴다.
  own: SummaryBucket;
  // SQLite LIKE 와 같은 ASCII 대소문자 무시 비교용.
  nameFold: string;
  categoryFold: string;
}

export interface PublicRestaurantBase {
  rows: PublicRestaurantBaseRow[];
}

// SQLite LIKE 는 ASCII 만 대소문자를 무시한다 — 같은 의미로 접는다.
export const foldAscii = (s: string): string => s.replace(/[A-Z]+/g, (m) => m.toLowerCase());

type RawInt = number | bigint | null;
const toDate = (v: Date | number | bigint | string): Date =>
  v instanceof Date ? v : new Date(typeof v === 'string' && !/^\d+$/.test(v) ? v : Number(v));
const toNullableNumber = (v: number | bigint | null): number | null => (v === null ? null : Number(v));

// snapshotJson 원문을 JS 로 옮기지 않고 SQLite JSON 함수로 카드에 필요한 4개 값만 뽑는다. 기존 JS 판정
// (typeof number/string, imageUrls 배열의 첫 문자열)과 같은 규칙이고, 파손된 JSON 은 NULL 로 둔다.
// 좌표는 REAL 로 고정한다 — JSON 의 127 같은 정수가 첫 행에 오면 Prisma 가 열을 INT 로 잡아 뒤 행의
// 37.5 에서 변환 오류(500)가 난다.
const snapField = (path: string, types: string[], real = false) => {
  const value = Prisma.sql`json_extract(r."snapshotJson", ${path})`;
  return Prisma.sql`CASE WHEN json_valid(r."snapshotJson") THEN
    CASE WHEN json_type(r."snapshotJson", ${path}) IN (${Prisma.join(types)})
         THEN ${real ? Prisma.sql`CAST(${value} AS REAL)` : value} END END`;
};

async function computePublicRestaurantBase(prisma: PrismaClient): Promise<PublicRestaurantBase> {
  const naver = await prisma.$queryRaw<
    Array<{
      id: string;
      canonicalId: string;
      placeId: string;
      name: string;
      category: string | null;
      address: string | null;
      rating: number | null;
      reviewCount: RawInt;
      firstCrawledAt: Date | number | bigint | string;
      latitude: number | null;
      longitude: number | null;
      roadAddress: string | null;
      thumbnailUrl: string | null;
      totalReviews: RawInt;
    }>
  >`SELECT r."id", r."canonicalId", r."placeId", r."name", r."category", r."address", r."rating",
           r."reviewCount", r."firstCrawledAt",
           ${snapField('$.latitude', ['integer', 'real'], true)} AS "latitude",
           ${snapField('$.longitude', ['integer', 'real'], true)} AS "longitude",
           ${snapField('$.roadAddress', ['text'])} AS "roadAddress",
           ${snapField('$.imageUrls[0]', ['text'])} AS "thumbnailUrl",
           (SELECT COUNT(*) FROM "visitor_reviews" v WHERE v."restaurantId" = r."id") AS "totalReviews"
      FROM "restaurants" r
     WHERE r."source" = 'naver' AND r."placeId" IS NOT NULL
     -- 정렬 기준이 같은(동점) 가게의 순서를 고정한다 — 호출자 정렬은 안정 정렬이라 이 순서가 그대로 남는다.
     ORDER BY r."firstCrawledAt" DESC, r."id" ASC`;

  // 같은 canonical 의 다이닝코드 행 + 테이블링 partner 행(place 행은 리뷰가 없어 합산 의미가 없다 —
  // 상세 융합 경로와 같은 기준). 형제가 둘 이상이면 가장 먼저 수집된 행 하나만(실제로는 1:1).
  const siblings = await prisma.$queryRaw<
    Array<{ id: string; canonicalId: string; source: string; totalReviews: RawInt }>
  >`SELECT r."id", r."canonicalId", r."source",
           (SELECT COUNT(*) FROM "visitor_reviews" v WHERE v."restaurantId" = r."id") AS "totalReviews"
      FROM "restaurants" r
     WHERE r."source" = 'diningcode'
        OR (r."source" = 'tabling' AND r."sourceId" NOT LIKE 'place:%')
     ORDER BY r."firstCrawledAt" ASC, r."id" ASC`;
  const dcByCanonical = new Map<string, { id: string; totalReviews: number }>();
  const tbByCanonical = new Map<string, { id: string; totalReviews: number }>();
  for (const s of siblings) {
    const target = s.source === 'diningcode' ? dcByCanonical : tbByCanonical;
    if (!target.has(s.canonicalId)) {
      target.set(s.canonicalId, { id: s.id, totalReviews: Number(s.totalReviews ?? 0) });
    }
  }

  const buckets = await aggregateSummaryBuckets(prisma, null);
  const tourMap = await getPublicListTourMap(
    prisma,
    naver.map((r) => r.canonicalId),
  );

  const empty = emptySummaryBucket();
  const rows: PublicRestaurantBaseRow[] = naver.map((r) => {
    const own = buckets.get(r.id) ?? empty;
    const dc = dcByCanonical.get(r.canonicalId) ?? null;
    const tb = tbByCanonical.get(r.canonicalId) ?? null;
    const dcB = dc ? (buckets.get(dc.id) ?? empty) : empty;
    const tbB = tb ? (buckets.get(tb.id) ?? empty) : empty;
    const sum = (k: keyof SummaryBucket) => own[k] + dcB[k] + tbB[k];
    const sentN = sum('sentN');
    const satN = sum('satN');
    const item: RestaurantPublicListItemType = {
      placeId: r.placeId,
      name: r.name,
      category: r.category,
      address: r.address,
      roadAddress: r.roadAddress,
      rating: r.rating,
      reviewCount: toNullableNumber(r.reviewCount),
      latitude: r.latitude === null ? null : Number(r.latitude),
      longitude: r.longitude === null ? null : Number(r.longitude),
      thumbnailUrl: r.thumbnailUrl,
      firstCrawledAt: toDate(r.firstCrawledAt).toISOString(),
      totalReviews: Number(r.totalReviews ?? 0) + (dc?.totalReviews ?? 0) + (tb?.totalReviews ?? 0),
      summaryPending: sum('pending'),
      summaryRunning: sum('running'),
      summaryDone: sum('done'),
      summaryFailed: sum('failed'),
      // done 행 수와 같다(분석 완료 = done) — 기존 응답 필드 의미 유지.
      analyzedCount: sum('done'),
      avgSentimentScore: sentN > 0 ? sum('sentSum') / sentN : null,
      avgSatisfactionScore: satN > 0 ? sum('satSum') / satN : null,
      positiveCount: sum('positive'),
      negativeCount: sum('negative'),
      neutralCount: sum('neutral'),
      tour: tourMap.get(r.canonicalId) ?? null,
    };
    return {
      id: r.id,
      canonicalId: r.canonicalId,
      item,
      own,
      nameFold: foldAscii(r.name),
      categoryFold: r.category ? foldAscii(r.category) : '',
    };
  });
  return { rows };
}

// TTL 동안 공유하고, 만료 뒤 첫 요청은 지난 값을 바로 돌려주면서 뒤에서 다시 만든다(stale-while-revalidate).
// 크롤 저장·삭제·canonical 병합처럼 목록 구성이 바뀌는 쓰기는 invalidatePublicRestaurantCache() 로 비우고,
// 그 뒤 요청은 새로 만든 값을 기다린다. 리뷰 요약 진행처럼 잦은 변화는 TTL 지연을 허용한다(어드민 화면은
// SSE 로 따로 갱신).
const PUBLIC_BASE_TTL_MS = 30_000;
let baseCache: { base: PublicRestaurantBase; expiresAt: number; generation: number } | null = null;
let basePending: { promise: Promise<PublicRestaurantBase>; generation: number } | null = null;
let baseGeneration = 0;

export const invalidatePublicRestaurantCache = (): void => {
  baseGeneration += 1;
  baseCache = null;
  basePending = null;
};

const refreshPublicRestaurantBase = (prisma: PrismaClient): Promise<PublicRestaurantBase> => {
  if (basePending && basePending.generation === baseGeneration) return basePending.promise;
  const generation = baseGeneration;
  const promise = computePublicRestaurantBase(prisma)
    .then((base) => {
      if (generation === baseGeneration) {
        baseCache = { base, expiresAt: Date.now() + PUBLIC_BASE_TTL_MS, generation };
      }
      return base;
    })
    .finally(() => {
      if (basePending?.promise === promise) basePending = null;
    });
  basePending = { promise, generation };
  return promise;
};

export async function getPublicRestaurantBase(prisma: PrismaClient): Promise<PublicRestaurantBase> {
  const cached = baseCache;
  if (cached && cached.generation === baseGeneration) {
    if (cached.expiresAt <= Date.now()) {
      // 지난 값을 돌려주고 뒤에서 갱신 — 실패해도 다음 요청이 다시 시도한다.
      refreshPublicRestaurantBase(prisma).catch(() => undefined);
    }
    return cached.base;
  }
  return refreshPublicRestaurantBase(prisma);
}
