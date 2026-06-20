import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { isCandidate, scoreMatch } from '../../lib/matching.js';
import { normalizeTerm } from '../summary/summary.service.js';
import { buildCategoryTree, type CategoryTreeLeaf } from '../analytics/category-tree.js';
import {
  composeDiningcodeAddon,
  composeTablingAddon,
  computeSources,
  computeStoredReviewCount,
  mergeAddress,
  mergeBlogReviews,
  mergeBusinessHours,
  mergeCategory,
  mergeCoordinates,
  mergeMenus,
  mergeName,
  mergePhone,
  mergePhotos,
  mergeRating,
  mergeReviewCount,
  type TablingSnapshot,
} from './restaurant.merge.js';
import { Routes } from '@repo/api-contract';
import { deriveRegion } from './region-derive.js';
import {
  cachePanoramaThumbnail,
  isVolatileNaverPhoto,
} from '../media/panorama-cache.js';
import type {
  CategoryTreeNodeType,
  DiningcodeShopDataType,
  DiningcodeShopReviewType,
  TablingShopDataType,
  TablingShopReviewType,
  TablingPlaceDataType,
  NaverPlaceDataType,
  PublicReviewAnalysisType,
  PublicVisitorReviewType,
  RestaurantDetailType,
  CanonicalListItemType,
  RestaurantListQueryType,
  RestaurantListResultType,
  RestaurantInsightsType,
  RestaurantInsightMenuStatType,
  RestaurantSourceSummaryType,
  RestaurantPublicDetailType,
  RestaurantPublicListItemType,
  RestaurantPublicListQueryType,
  RestaurantPublicListResultType,
  RestaurantPublicReviewsQueryType,
  RestaurantPublicReviewsResultType,
  RestaurantRankingQueryType,
  RestaurantRankingResultType,
  RestaurantSmartPickInputType,
  RestaurantSmartPickResultType,
  RegionStatsResultType,
  RestaurantSummaryProgressType,
  ReviewAnalysisMenuType,
  ReviewSentimentType,
  VisitorReviewType,
  VisitorReviewVideoType,
  VisitorReviewWithSummaryType,
} from '@repo/api-contract';

// detail 응답에 동봉할 reviews 페이지 크기. 클라이언트의 useInfiniteQuery 첫
// 페이지 seed 로 사용 — 같은 값을 클라이언트도 알아야 cache 키 일관됨.
const REVIEWS_FIRST_PAGE_SIZE = 10;

// chip 카운트용 (all / positive / negative). neutral 은 UI 표면에 없음.
const computeReviewCounts = (
  reviews: PublicVisitorReviewType[],
): { all: number; positive: number; negative: number } => {
  let positive = 0;
  let negative = 0;
  for (const r of reviews) {
    if (r.analysis?.sentiment === 'positive') positive += 1;
    else if (r.analysis?.sentiment === 'negative') negative += 1;
  }
  return { all: reviews.length, positive, negative };
};

// SHA-1 of authorName + body. Used as the dedup key when the network response
// doesn't carry a stable review id. Body is already truncated to 500 chars by
// the adapter so this is bounded.
export const contentHashOf = (authorName: string | null, body: string): string =>
  createHash('sha1')
    .update(`${authorName ?? ''}\u0000${body}`)
    .digest('hex');

export interface ExistingReviewKeys {
  externalIds: Set<string>;
  contentHashes: Set<string>;
}

export interface RestaurantPublicSeoMeta {
  placeId: string;
  name: string;
  category: string | null;
  address: string | null;
  roadAddress: string | null;
  phone: string | null;
  businessHours: string | null;
  rating: number | null;
  reviewCount: number | null;
  latitude: number | null;
  longitude: number | null;
  imageUrls: string[];
  menus: RestaurantPublicDetailType['menus'];
  rawSourceUrl: string;
}

// The VisitorReview shape carries an optional externalId (Naver review id)
// the persistence layer uses for dedup. The adapter always populates it
// when the source has one; FE clients ignore it.
export type RawReview = VisitorReviewType & { externalId: string | null };

// 공개 랭킹 read 캐시 — 같은 (sort, excludeNeutral, minMentions) 조합은 풀
// 집계가 동일하므로 한 번 계산해 60s 동안 재사용. limit/offset 변화는 같은
// 정렬된 배열 위 slicing 이므로 캐시 키에 포함하지 않는다(메모리 절약).
// 새 리뷰 분석 결과가 들어와도 60s 안에는 stale 이지만, 공개 랭킹은 분 단위
// freshness 로 충분하다. 강한 무효화가 필요하면 invalidateRankingCache().
interface RankingCacheEntry {
  rows: Array<{
    placeId: string;
    name: string;
    category: string | null;
    positiveCount: number;
    negativeCount: number;
    neutralCount: number;
    totalMentions: number;
    score: number;
  }>;
  expiresAt: number;
}
const RANKING_CACHE_TTL_MS = 60_000;
const rankingCache = new Map<string, RankingCacheEntry>();
const rankingPending = new Map<string, Promise<RankingCacheEntry['rows']>>();

export const invalidateRankingCache = (): void => {
  rankingCache.clear();
};

// 지역 통계 캐시 — 어드민 대시보드 위젯 1곳만 호출하므로 단일 슬롯. 60s TTL +
// in-flight dedup (동시 요청이 같은 전수 집계를 중복 실행하지 않도록). 데이터가
// <1k canonical 이라 집계 자체는 가벼움.
const REGION_STATS_CACHE_TTL_MS = 60_000;
let regionStatsCache: { data: RegionStatsResultType; expiresAt: number } | null = null;
let regionStatsPending: Promise<RegionStatsResultType> | null = null;

export class RestaurantService {
  constructor(private readonly prisma: PrismaClient) {}

  // Upsert by placeId. `snapshotJson` stores the full NaverPlaceData minus
  // visitorReviews — those live in their own table. The intent is: any
  // structural data we don't query on (menus, blogReviews, businessHours,
  // imageUrls, reviewStats, coords) round-trips through this blob unchanged.
  // 휘발성 파노라마 URL(apis.naver.com/place/panorama)은 TTL 이 지나면 만료(403)
  // 되므로 크롤 시점(아직 유효할 때) 받아 영구 사본으로 저장하고, snapshot 에는
  // 우리 사본 URL(/media/panorama/:placeId)을 대신 넣는다. 받기 실패(만료/없음)
  // 하면 그 URL 은 버린다 — 저장해봐야 곧 죽는 URL 이라 의미가 없다. placeId 당
  // 파노라마는 1장이므로 첫 휘발성 URL 만 캐시하고 나머지 휘발성은 드롭한다.
  private async persistVolatilePhotos(
    placeId: string,
    urls: string[],
  ): Promise<string[]> {
    const out: string[] = [];
    let panoramaCached = false;
    for (const u of urls) {
      if (!isVolatileNaverPhoto(u)) {
        out.push(u);
        continue;
      }
      if (panoramaCached) continue;
      const r = await cachePanoramaThumbnail(placeId, u);
      if (r.ok) {
        out.push(Routes.Media.panorama(placeId));
        panoramaCached = true;
      } else {
        // 받기 실패 — 휘발성 원본은 버린다(저장해봐야 곧 만료되는 URL). 사유를
        // 남겨 간헐 실패(만료=not_ok 403, 타임아웃=fetch_error 등)를 추적한다.
        // 다음 재크롤 때 네이버가 다시 파노라마를 주면 자연히 재시도된다.
        // eslint-disable-next-line no-console
        console.warn(
          `[panorama-cache] miss placeId=${placeId} reason=${r.reason}` +
            (r.status ? ` status=${r.status}` : '') +
            (r.contentType ? ` ct=${r.contentType}` : ''),
        );
      }
    }
    return out;
  }

  async upsertRestaurantFromCrawl(data: NaverPlaceDataType): Promise<{ id: string }> {
    const imageUrls = await this.persistVolatilePhotos(data.placeId, data.imageUrls);
    const { visitorReviews: _ignored, ...rest } = data;
    const snapshotJson = JSON.stringify({ ...rest, imageUrls });
    // 신규 행은 자기 전용 Canonical 1행을 같이 만든다 (1:1 시작). 어드민이
    // 나중에 merge API 로 같은 가게의 다른 source 행을 같은 canonicalId 로 통합.
    const r = await this.prisma.restaurant.upsert({
      where: { source_sourceId: { source: 'naver', sourceId: data.placeId } },
      create: {
        source: 'naver',
        sourceId: data.placeId,
        placeId: data.placeId,
        name: data.name,
        category: data.category,
        address: data.address,
        phone: data.phone,
        rating: data.rating,
        reviewCount: data.reviewCount,
        rawSourceUrl: data.rawSourceUrl,
        snapshotJson,
        canonical: {
          create: {
            name: data.name,
            primaryCategory: data.category,
            latitude: data.latitude,
            longitude: data.longitude,
          },
        },
      },
      update: {
        name: data.name,
        category: data.category,
        address: data.address,
        phone: data.phone,
        rating: data.rating,
        reviewCount: data.reviewCount,
        rawSourceUrl: data.rawSourceUrl,
        snapshotJson,
      },
      select: { id: true },
    });
    return r;
  }

  // 다이닝코드 가게 → Restaurant upsert. 키는 (source='diningcode', sourceId=vRid).
  // placeId 는 null — 공개 /restaurants/:placeId 라우트는 네이버 전용이므로 다이닝코드
  // 행이 그쪽에 잡히지 않도록 비워둔다. rating 은 다이닝코드 score(0~100) 를 5점 환산
  // 으로 정규화해 저장하되, 환산 의미를 잃지 않게 정보 손실은 snapshotJson 의 원본
  // score/scoreDetail 로 보존한다.
  async upsertRestaurantFromDiningcode(data: DiningcodeShopDataType): Promise<{ id: string }> {
    const { reviewsFirstPage: _ignored, ...rest } = data;
    const snapshotJson = JSON.stringify(rest);
    const rating = data.score === null ? null : data.score / 20;
    const reviewCount = data.scoreDetail?.reviewTotal ?? data.reviewsFirstPage.totalCount;
    const category = data.categories[0] ?? null;
    const r = await this.prisma.restaurant.upsert({
      where: { source_sourceId: { source: 'diningcode', sourceId: data.vRid } },
      create: {
        source: 'diningcode',
        sourceId: data.vRid,
        placeId: null,
        name: data.fullName,
        category,
        address: data.address,
        phone: data.phone,
        rating,
        reviewCount,
        rawSourceUrl: data.rawSourceUrl,
        snapshotJson,
        canonical: {
          create: {
            name: data.fullName,
            primaryCategory: category,
            latitude: data.lat,
            longitude: data.lng,
          },
        },
      },
      update: {
        name: data.fullName,
        category,
        address: data.address,
        phone: data.phone,
        rating,
        reviewCount,
        rawSourceUrl: data.rawSourceUrl,
        snapshotJson,
      },
      select: { id: true },
    });
    return r;
  }

  // 다이닝코드 리뷰 → RawReview 매핑. content 가 비어있으면 (사진/별점만 단 리뷰)
  // body 자체가 빈 string → contentHash 만 작동하므로 외부 ID(rvId) 가 사실상 유일한
  // dedup 키가 된다. externalId 는 'dc:rv:<rvId>' prefix 로 네이버 review id 와
  // 충돌 안 나게.
  static mapDiningcodeReviewToRaw(rv: DiningcodeShopReviewType): RawReview {
    return {
      externalId: `dc:rv:${rv.rvId}`,
      authorName: rv.userName,
      // 0~5 정수 — naver 와 같은 척도.
      rating: rv.totalScore,
      body: rv.content ?? '',
      // "5월 2일" / "13일 전" 등 — 정규 datetime 변환은 어차피 다이닝코드 응답
      // 형식이 일관되지 않으므로 raw 보존.
      visitedAt: rv.reviewDt,
      imageUrls: rv.images.map((img) => img.origin),
      videos: [],
    };
  }

  async getCanonicalIdForRestaurant(restaurantId: string): Promise<string | null> {
    const r = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { canonicalId: true },
    });
    return r?.canonicalId ?? null;
  }

  // 자동 DC 매칭 (CrawlService.tryAutoMatchDiningcode) 의 사전 정보. canonical
  // 의 이름/좌표/현재 source 셋만 가볍게 — 자동 매칭이 skip 조건 검사에 필요한
  // 최소 필드. 후보 검색 자체는 DC 검색 어댑터가 담당.
  async getCanonicalCoreForAutoMatch(canonicalId: string): Promise<{
    name: string;
    latitude: number | null;
    longitude: number | null;
    sources: string[];
  } | null> {
    const c = await this.prisma.canonicalRestaurant.findUnique({
      where: { id: canonicalId },
      select: {
        name: true,
        latitude: true,
        longitude: true,
        restaurants: { select: { source: true } },
      },
    });
    if (!c) return null;
    return {
      name: c.name,
      latitude: c.latitude,
      longitude: c.longitude,
      sources: c.restaurants.map((r) => r.source),
    };
  }

  async findByPlaceId(placeId: string): Promise<{ id: string } | null> {
    return this.prisma.restaurant.findUnique({
      where: { placeId },
      select: { id: true },
    });
  }

  // 자동 발견 잡의 Phase 2 dedupe — 이미 등록된 placeId 들을 한 번에 분리한다.
  // 결과 Set 에 들어있으면 그 후보는 candidate(state='skipped',
  // skipReason='already_registered') 로 마무리.
  async findRegisteredByPlaceIds(placeIds: string[]): Promise<Set<string>> {
    if (placeIds.length === 0) return new Set();
    const rows = await this.prisma.restaurant.findMany({
      where: { placeId: { in: placeIds } },
      select: { placeId: true },
    });
    const out = new Set<string>();
    for (const r of rows) {
      if (r.placeId) out.add(r.placeId);
    }
    return out;
  }

  // 정식 /admin/diningcode 페이지 — vRid 배열로 (source='diningcode', sourceId IN ids)
  // 행을 한 번에 조회. 결과에 없는 vRid 는 미등록. canonicalId 까지 같이 돌려줘
  // UI 가 등록된 가게 페이지로 link 할 수 있게.
  async findRegisteredDiningcodeByVRids(
    vRids: string[],
  ): Promise<Array<{ vRid: string; restaurantId: string; canonicalId: string }>> {
    if (vRids.length === 0) return [];
    const rows = await this.prisma.restaurant.findMany({
      where: { source: 'diningcode', sourceId: { in: vRids } },
      select: { id: true, sourceId: true, canonicalId: true },
    });
    return rows.map((r) => ({
      vRid: r.sourceId,
      restaurantId: r.id,
      canonicalId: r.canonicalId,
    }));
  }

  // 다이닝코드 상세 페이지가 외부 응답의 리뷰 카드 옆에 AI 요약 한 줄을 붙이려고
  // 호출. (source='diningcode', sourceId=vRid) 인 Restaurant 가 있어야 매칭 — 미저장
  // 가게면 빈 Map. Review.externalId='dc:rv:<rvId>' 규약은 mapDiningcodeReviewToRaw
  // 와 일치해야 한다. status='done' 이고 text 가 있는 행만 포함.
  async getDiningcodeReviewSummaryMap(vRid: string, rvIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (rvIds.length === 0) return map;
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { source_sourceId: { source: 'diningcode', sourceId: vRid } },
      select: { id: true },
    });
    if (!restaurant) return map;
    const externalIds = rvIds.map((id) => `dc:rv:${id}`);
    const rows = await this.prisma.visitorReview.findMany({
      where: {
        restaurantId: restaurant.id,
        externalId: { in: externalIds },
      },
      select: { externalId: true, summary: { select: { status: true, text: true } } },
    });
    for (const r of rows) {
      if (!r.externalId) continue;
      const text = r.summary?.status === 'done' ? r.summary.text : null;
      if (!text) continue;
      const rvId = r.externalId.startsWith('dc:rv:')
        ? r.externalId.slice('dc:rv:'.length)
        : r.externalId;
      map.set(rvId, text);
    }
    return map;
  }

  // ── 테이블링 (source='tabling') ────────────────────────────────────────
  // partner 가게(/restaurant/:idx) → Restaurant upsert. 키는 (source='tabling',
  // sourceId=String(idx)). rating 은 이미 0~5 척도라 환산 없이 저장. placeId 는
  // null — 공개 /restaurants/:placeId 는 네이버 전용. 좌표는 canonical 에 저장돼
  // 좌표 기반 머지에 그대로 쓰인다.
  async upsertRestaurantFromTabling(data: TablingShopDataType): Promise<{ id: string }> {
    const { reviewsFirstPage: _ignored, ...rest } = data;
    const snapshotJson = JSON.stringify(rest);
    const sourceId = String(data.idx);
    const category = data.category;
    const address = data.roadAddress ?? data.address;
    const r = await this.prisma.restaurant.upsert({
      where: { source_sourceId: { source: 'tabling', sourceId } },
      create: {
        source: 'tabling',
        sourceId,
        placeId: null,
        name: data.name,
        category,
        address,
        phone: data.phone,
        rating: data.rating,
        reviewCount: data.reviewTotalCount,
        rawSourceUrl: data.rawSourceUrl,
        snapshotJson,
        canonical: {
          create: {
            name: data.name,
            primaryCategory: category,
            latitude: data.lat,
            longitude: data.lng,
          },
        },
      },
      update: {
        name: data.name,
        category,
        address,
        phone: data.phone,
        rating: data.rating,
        reviewCount: data.reviewTotalCount,
        rawSourceUrl: data.rawSourceUrl,
        snapshotJson,
      },
      select: { id: true },
    });
    return r;
  }

  // 미입점 place(/place/:objectId, JSON-LD) → Restaurant upsert. 얕은 좌표·메타
  // 티어. partner 와 구분되게 sourceId='place:<objectId>' prefix 로 둔다(같은
  // source='tabling' 안에서 idx 와 충돌 방지).
  async upsertRestaurantFromTablingPlace(
    data: TablingPlaceDataType,
  ): Promise<{ id: string }> {
    const snapshotJson = JSON.stringify(data);
    const sourceId = `place:${data.objectId}`;
    const category = data.cuisines[0] ?? null;
    const r = await this.prisma.restaurant.upsert({
      where: { source_sourceId: { source: 'tabling', sourceId } },
      create: {
        source: 'tabling',
        sourceId,
        placeId: null,
        name: data.name,
        category,
        address: data.address,
        phone: null,
        rating: data.rating,
        reviewCount: data.reviewCount,
        rawSourceUrl: data.rawSourceUrl,
        snapshotJson,
        canonical: {
          create: {
            name: data.name,
            primaryCategory: category,
            latitude: data.lat,
            longitude: data.lng,
          },
        },
      },
      update: {
        name: data.name,
        category,
        address: data.address,
        rating: data.rating,
        reviewCount: data.reviewCount,
        rawSourceUrl: data.rawSourceUrl,
        snapshotJson,
      },
      select: { id: true },
    });
    return r;
  }

  // 테이블링 리뷰 → RawReview. externalId 는 'tb:rv:<idx>' prefix 로 네이버/DC
  // review id 와 충돌 안 나게. content 가 비면(사진/별점만) body='' → contentHash
  // 보다 externalId 가 실질 dedup 키.
  static mapTablingReviewToRaw(rv: TablingShopReviewType): RawReview {
    return {
      externalId: `tb:rv:${rv.idx}`,
      authorName: rv.nickname,
      rating: rv.rating,
      body: rv.contents ?? '',
      visitedAt: rv.reviewDate,
      imageUrls: rv.imageUrls,
      videos: [],
    };
  }

  // 정식 /admin/tabling 페이지 등록 배지용 — idx 배열로 (source='tabling',
  // sourceId IN ids) 행 조회. partner(숫자 idx) 만 — place 행은 'place:' prefix 라
  // 숫자 변환에서 자연 제외.
  async findRegisteredTablingByIdxs(
    idxs: number[],
  ): Promise<Array<{ idx: number; restaurantId: string; canonicalId: string }>> {
    if (idxs.length === 0) return [];
    const rows = await this.prisma.restaurant.findMany({
      where: { source: 'tabling', sourceId: { in: idxs.map(String) } },
      select: { id: true, sourceId: true, canonicalId: true },
    });
    return rows.map((r) => ({
      idx: Number(r.sourceId),
      restaurantId: r.id,
      canonicalId: r.canonicalId,
    }));
  }

  // 테이블링 상세 페이지가 리뷰 카드 옆 AI 요약 한 줄을 붙이려고 호출.
  // Review.externalId='tb:rv:<idx>' 규약은 mapTablingReviewToRaw 와 일치.
  async getTablingReviewSummaryMap(
    idx: number,
    reviewIdxs: string[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (reviewIdxs.length === 0) return map;
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { source_sourceId: { source: 'tabling', sourceId: String(idx) } },
      select: { id: true },
    });
    if (!restaurant) return map;
    const externalIds = reviewIdxs.map((id) => `tb:rv:${id}`);
    const rows = await this.prisma.visitorReview.findMany({
      where: { restaurantId: restaurant.id, externalId: { in: externalIds } },
      select: { externalId: true, summary: { select: { status: true, text: true } } },
    });
    for (const r of rows) {
      if (!r.externalId) continue;
      const text = r.summary?.status === 'done' ? r.summary.text : null;
      if (!text) continue;
      const key = r.externalId.startsWith('tb:rv:')
        ? r.externalId.slice('tb:rv:'.length)
        : r.externalId;
      map.set(key, text);
    }
    return map;
  }

  // 테이블링 자동매칭(역방향)용 — 좌표 박스(±0.007°, ProposalService 와 동일 정책)
  // 안의 다른 canonical 후보. 테이블링은 외부 검색 API 가 없어 우리 DB 의 기존
  // 네이버/DC canonical 과 매칭한다. 스코어링·임계 판정은 CrawlService 담당.
  async findCanonicalAutoMatchCandidates(
    excludeCanonicalId: string,
    latitude: number,
    longitude: number,
  ): Promise<
    Array<{
      id: string;
      name: string;
      latitude: number | null;
      longitude: number | null;
      sources: string[];
    }>
  > {
    const DELTA = 0.007;
    const rows = await this.prisma.canonicalRestaurant.findMany({
      where: {
        id: { not: excludeCanonicalId },
        latitude: { gte: latitude - DELTA, lte: latitude + DELTA },
        longitude: { gte: longitude - DELTA, lte: longitude + DELTA },
      },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        restaurants: { select: { source: true } },
      },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      sources: r.restaurants.map((x) => x.source),
    }));
  }

  // 좌표 박스 안에서 tabling 행을 가진 canonical 들을 tabling sourceId 까지 함께
  // 돌려준다 — place(미입점, 'place:' prefix) / partner(입점, 숫자) 분류용.
  // place↔partner 승격 링크가 같은 source('tabling') 끼리 묶을 후보를 고를 때
  // 쓴다(자동매칭은 다른 source 만, 제안 큐는 새 source 만 봐서 둘 다 건너뛰는
  // 사각지대). findCanonicalAutoMatchCandidates 와 달리 source 가 아니라 sourceId
  // 를 노출하는 게 핵심.
  async findTablingCanonicalsNear(
    excludeCanonicalId: string,
    latitude: number,
    longitude: number,
  ): Promise<
    Array<{
      id: string;
      name: string;
      latitude: number | null;
      longitude: number | null;
      tablingSourceIds: string[];
    }>
  > {
    const DELTA = 0.007;
    const rows = await this.prisma.canonicalRestaurant.findMany({
      where: {
        id: { not: excludeCanonicalId },
        latitude: { gte: latitude - DELTA, lte: latitude + DELTA },
        longitude: { gte: longitude - DELTA, lte: longitude + DELTA },
        restaurants: { some: { source: 'tabling' } },
      },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        restaurants: {
          where: { source: 'tabling' },
          select: { sourceId: true },
        },
      },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      tablingSourceIds: r.restaurants.map((x) => x.sourceId),
    }));
  }

  async getExistingReviewKeys(restaurantId: string): Promise<ExistingReviewKeys> {
    const rows = await this.prisma.visitorReview.findMany({
      where: { restaurantId },
      select: { externalId: true, contentHash: true },
    });
    const externalIds = new Set<string>();
    const contentHashes = new Set<string>();
    for (const r of rows) {
      if (r.externalId) externalIds.add(r.externalId);
      contentHashes.add(r.contentHash);
    }
    return { externalIds, contentHashes };
  }

  // Idempotent batch insert. Returns the ids of rows that were actually
  // inserted (i.e., not previously present), which is what the summary queue
  // needs — re-summarizing reviews we already have wastes tokens.
  //
  // SQLite/Prisma quirk: createMany with skipDuplicates is not supported on
  // SQLite. We pre-fetch existing keys, filter the input, then create row by
  // row inside a transaction so dedup races between concurrent batches still
  // resolve correctly (the unique constraints catch any leftover duplicates).
  async persistReviewBatch(
    restaurantId: string,
    batch: RawReview[],
  ): Promise<{ newReviews: VisitorReviewWithSummaryType[] }> {
    if (batch.length === 0) return { newReviews: [] };

    const existing = await this.getExistingReviewKeys(restaurantId);
    const newReviews: VisitorReviewWithSummaryType[] = [];

    for (const r of batch) {
      const contentHash = contentHashOf(r.authorName, r.body);
      if (r.externalId && existing.externalIds.has(r.externalId)) continue;
      if (existing.contentHashes.has(contentHash)) continue;

      try {
        const created = await this.prisma.visitorReview.create({
          data: {
            restaurantId,
            externalId: r.externalId,
            authorName: r.authorName,
            rating: r.rating,
            body: r.body,
            visitedAt: r.visitedAt,
            imageUrlsJson: JSON.stringify(r.imageUrls),
            videosJson: JSON.stringify(r.videos ?? []),
            contentHash,
          },
          select: { id: true, fetchedAt: true },
        });
        newReviews.push({
          id: created.id,
          externalId: r.externalId,
          authorName: r.authorName,
          rating: r.rating,
          body: r.body,
          visitedAt: r.visitedAt,
          imageUrls: r.imageUrls,
          videos: r.videos ?? [],
          fetchedAt: created.fetchedAt.toISOString(),
          // summary is null until SummaryService finishes — the SSE
          // review_summary event fills it in later via setQueryData.
          summary: null,
        });
        if (r.externalId) existing.externalIds.add(r.externalId);
        existing.contentHashes.add(contentHash);
      } catch (e) {
        // Unique-constraint race (concurrent batch landed first) — silently
        // skip; the row already exists, which is the goal.
        const code = (e as { code?: string }).code;
        if (code !== 'P2002') throw e;
      }
    }

    return { newReviews };
  }

  // Recrawl path — wipe reviews and let cascade take their summaries with
  // them. Restaurant row is preserved so existing references (jobs, UI) stay
  // valid; the upsert from the new crawl will refresh the snapshot.
  async clearReviewsAndSummaries(restaurantId: string): Promise<void> {
    await this.prisma.visitorReview.deleteMany({ where: { restaurantId } });
  }

  // Hard-delete a restaurant and all its reviews/summaries (cascade). Returns
  // the count of reviews removed for UI feedback, or null if the placeId
  // doesn't exist (caller maps to 404).
  async deleteByPlaceId(placeId: string): Promise<{ deletedReviewCount: number } | null> {
    const r = await this.prisma.restaurant.findUnique({
      where: { placeId },
      select: { id: true, _count: { select: { visitorReviews: true } } },
    });
    if (!r) return null;
    await this.prisma.restaurant.delete({ where: { id: r.id } });
    return { deletedReviewCount: r._count.visitorReviews };
  }

  // List view — 모든 source 의 Restaurant 를 canonical 단위로 그룹화. 한 행은
  // "같은 가게" 1개에 해당하고, 그 안에 sources 배열로 출처별 행이 들어간다.
  // 통합 카운트(분석 평균 등)는 sources 의 가중평균.
  //
  // 페이징/정렬: canonical 집계가 sources 합산이므로 정렬 키(만족도/긍정/부정비율)
  // 를 DB SQL 하나로 빼기 어렵다 — 따라서 한 번에 모든 canonical 의 메타+집계
  // +후보매칭까지 계산 후, 메모리에서 정렬·slice 한다. 데이터 규모(< 1k canonical)
  // 에서 충분히 빠르고, 페이지 경계가 정렬과 무관하게 일관됨.
  async list(query: RestaurantListQueryType): Promise<RestaurantListResultType> {
    const rows = await this.prisma.restaurant.findMany({
      orderBy: { lastCrawledAt: 'desc' },
      select: {
        id: true,
        source: true,
        sourceId: true,
        placeId: true,
        canonicalId: true,
        name: true,
        category: true,
        rating: true,
        reviewCount: true,
        rawSourceUrl: true,
        firstCrawledAt: true,
        lastCrawledAt: true,
        canonical: {
          select: {
            id: true,
            name: true,
            primaryCategory: true,
            latitude: true,
            longitude: true,
            suggestionDismissedAt: true,
          },
        },
        _count: { select: { visitorReviews: true } },
      },
    });
    if (rows.length === 0) {
      return { items: [], total: 0, limit: query.limit, offset: query.offset };
    }

    const ids = rows.map((r) => r.id);
    // 모든 Restaurant 의 ReviewSummary 를 한 번에 페치 후 JS 에서 그룹핑.
    // Prisma groupBy 가 related field 그룹핑을 지원 안 해서 어차피 N+1 회피용
    // 한 방 쿼리. 데이터 규모(어드민 식당 < 1k)에서 충분히 빠름.
    const summaryRows = await this.prisma.reviewSummary.findMany({
      where: { review: { restaurantId: { in: ids } } },
      select: {
        status: true,
        sentiment: true,
        sentimentScore: true,
        satisfactionScore: true,
        review: { select: { restaurantId: true } },
      },
    });

    interface Bucket {
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
    const emptyBucket = (): Bucket => ({
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
    const byRestaurant = new Map<string, Bucket>();
    for (const id of ids) byRestaurant.set(id, emptyBucket());
    for (const s of summaryRows) {
      const bucket = byRestaurant.get(s.review.restaurantId);
      if (!bucket) continue;
      // queued/pending 둘 다 진행 중 의미로 list 카드의 pending 카운트에 합산.
      // 디테일 페이지(RestaurantSummaryProgress) 만 두 단계를 분리 표시한다.
      if (s.status === 'pending' || s.status === 'queued') bucket.pending += 1;
      else if (s.status === 'running') bucket.running += 1;
      else if (s.status === 'done') bucket.done += 1;
      else if (s.status === 'failed') bucket.failed += 1;
      if (s.status === 'done') {
        if (s.sentiment === 'positive') bucket.positive += 1;
        else if (s.sentiment === 'negative') bucket.negative += 1;
        else if (s.sentiment === 'neutral') bucket.neutral += 1;
        else if (s.sentiment === 'mixed') bucket.mixed += 1;
        if (s.sentimentScore !== null) {
          bucket.sentSum += s.sentimentScore;
          bucket.sentN += 1;
        }
        if (s.satisfactionScore !== null) {
          bucket.satSum += s.satisfactionScore;
          bucket.satN += 1;
        }
      }
    }

    // canonicalId → 그 canonical 에 매달린 source 행들. rows 는 lastCrawledAt
    // desc 정렬이라 sources 도 자동으로 최근순.
    const byCanonical = new Map<
      string,
      { canonical: (typeof rows)[number]['canonical']; sources: RestaurantSourceSummaryType[] }
    >();
    for (const r of rows) {
      const b = byRestaurant.get(r.id)!;
      const source: RestaurantSourceSummaryType = {
        restaurantId: r.id,
        source: r.source,
        sourceId: r.sourceId,
        placeId: r.placeId,
        name: r.name,
        category: r.category,
        rating: r.rating,
        reviewCount: r.reviewCount,
        rawSourceUrl: r.rawSourceUrl,
        firstCrawledAt: r.firstCrawledAt.toISOString(),
        lastCrawledAt: r.lastCrawledAt.toISOString(),
        totalReviews: r._count.visitorReviews,
        summaryPending: b.pending,
        summaryRunning: b.running,
        summaryDone: b.done,
        summaryFailed: b.failed,
        avgSentimentScore: b.sentN > 0 ? b.sentSum / b.sentN : null,
        avgSatisfactionScore: b.satN > 0 ? b.satSum / b.satN : null,
        positiveCount: b.positive,
        negativeCount: b.negative,
        neutralCount: b.neutral,
        mixedCount: b.mixed,
      };
      const entry = byCanonical.get(r.canonicalId);
      if (entry) entry.sources.push(source);
      else byCanonical.set(r.canonicalId, { canonical: r.canonical, sources: [source] });
    }

    // canonical 통합 카운트 + 가중평균 계산. lastCrawledAt 은 sources 중 가장
    // 최근 — rows 가 desc 정렬이라 sources[0].
    // 그리고 행 별 candidateCount(같은 가게일 가능성이 있는 다른 canonical 의 수)
    // 도 같이 계산. 어드민 list 가 < 1k 규모라 in-memory O(N²) 로 충분 — bbox
    // prefilter 로 좌표 있는 행은 약 ±780m 박스로 1차 컷.
    interface CanonShape {
      id: string;
      name: string;
      primaryCategory: string | null;
      latitude: number | null;
      longitude: number | null;
      sourceSet: Set<string>;
    }
    const canonShapes: CanonShape[] = [];
    for (const { canonical, sources } of byCanonical.values()) {
      canonShapes.push({
        id: canonical.id,
        name: canonical.name,
        primaryCategory: canonical.primaryCategory,
        latitude: canonical.latitude,
        longitude: canonical.longitude,
        sourceSet: new Set(sources.map((s) => s.source)),
      });
    }
    const candidateCounts = new Map<string, number>();
    // 매칭 루프 중에 각 canonical 의 top1(점수 가장 높은 후보)도 같이 기록.
    // suggestion 렌더 조건(sources.length === 1 && !dismissedAt) 은 뒤에서 적용.
    interface TopCandidate {
      otherId: string;
      score: number;
      distanceM: number | null;
    }
    const topCandidates = new Map<string, TopCandidate>();
    for (const a of canonShapes) candidateCounts.set(a.id, 0);
    const BOX_DELTA = 0.007;
    for (let i = 0; i < canonShapes.length; i += 1) {
      const a = canonShapes[i]!;
      for (let j = i + 1; j < canonShapes.length; j += 1) {
        const b = canonShapes[j]!;
        // cross-source: 한쪽이 가진 source 가 다른쪽에 없어야 묶을 가치가 있음.
        let cross = false;
        for (const s of b.sourceSet) {
          if (!a.sourceSet.has(s)) {
            cross = true;
            break;
          }
        }
        if (!cross) {
          for (const s of a.sourceSet) {
            if (!b.sourceSet.has(s)) {
              cross = true;
              break;
            }
          }
        }
        if (!cross) continue;
        // bbox prefilter — 둘 다 좌표 있을 때만 적용. 한쪽이라도 좌표 없으면
        // 이름 단독 매칭(더 엄격한 임계) 으로 위임.
        if (
          a.latitude !== null &&
          a.longitude !== null &&
          b.latitude !== null &&
          b.longitude !== null
        ) {
          if (
            Math.abs(a.latitude - b.latitude) > BOX_DELTA ||
            Math.abs(a.longitude - b.longitude) > BOX_DELTA
          ) {
            continue;
          }
        }
        const score = scoreMatch(
          { name: a.name, latitude: a.latitude, longitude: a.longitude },
          { name: b.name, latitude: b.latitude, longitude: b.longitude },
        );
        if (!isCandidate(score)) continue;
        candidateCounts.set(a.id, (candidateCounts.get(a.id) ?? 0) + 1);
        candidateCounts.set(b.id, (candidateCounts.get(b.id) ?? 0) + 1);
        const aTop = topCandidates.get(a.id);
        if (!aTop || score.score > aTop.score) {
          topCandidates.set(a.id, {
            otherId: b.id,
            score: score.score,
            distanceM: score.distanceM,
          });
        }
        const bTop = topCandidates.get(b.id);
        if (!bTop || score.score > bTop.score) {
          topCandidates.set(b.id, {
            otherId: a.id,
            score: score.score,
            distanceM: score.distanceM,
          });
        }
      }
    }
    // 빠른 조회용 — canonShape lookup. 위 byCanonical 도 같은 데이터를 갖고
    // 있지만 이쪽이 가벼움.
    const shapeById = new Map(canonShapes.map((s) => [s.id, s]));

    const items: CanonicalListItemType[] = [];
    for (const { canonical, sources } of byCanonical.values()) {
      let totalReviews = 0;
      let pending = 0;
      let running = 0;
      let done = 0;
      let failed = 0;
      let positive = 0;
      let negative = 0;
      let neutral = 0;
      let mixed = 0;
      let sentSum = 0;
      let sentN = 0;
      let satSum = 0;
      let satN = 0;
      for (const s of sources) {
        totalReviews += s.totalReviews;
        pending += s.summaryPending;
        running += s.summaryRunning;
        done += s.summaryDone;
        failed += s.summaryFailed;
        positive += s.positiveCount;
        negative += s.negativeCount;
        neutral += s.neutralCount;
        mixed += s.mixedCount;
        if (s.avgSentimentScore !== null && s.summaryDone > 0) {
          sentSum += s.avgSentimentScore * s.summaryDone;
          sentN += s.summaryDone;
        }
        if (s.avgSatisfactionScore !== null && s.summaryDone > 0) {
          satSum += s.avgSatisfactionScore * s.summaryDone;
          satN += s.summaryDone;
        }
      }
      // suggestion 노출 조건 — 신규 단일 source + 무시 안 됨 + top1 후보 존재.
      let suggestion: CanonicalListItemType['suggestion'] = null;
      if (sources.length === 1 && canonical.suggestionDismissedAt === null) {
        const top = topCandidates.get(canonical.id);
        if (top) {
          const other = shapeById.get(top.otherId);
          if (other) {
            suggestion = {
              canonicalId: other.id,
              name: other.name,
              primaryCategory: other.primaryCategory,
              score: top.score,
              distanceM: top.distanceM,
            };
          }
        }
      }
      items.push({
        canonicalId: canonical.id,
        name: canonical.name,
        primaryCategory: canonical.primaryCategory,
        latitude: canonical.latitude,
        longitude: canonical.longitude,
        lastCrawledAt: sources[0]!.lastCrawledAt,
        sources,
        totalReviews,
        summaryPending: pending,
        summaryRunning: running,
        summaryDone: done,
        summaryFailed: failed,
        avgSentimentScore: sentN > 0 ? sentSum / sentN : null,
        avgSatisfactionScore: satN > 0 ? satSum / satN : null,
        positiveCount: positive,
        negativeCount: negative,
        neutralCount: neutral,
        mixedCount: mixed,
        candidateCount: candidateCounts.get(canonical.id) ?? 0,
        suggestion,
      });
    }
    // 정렬 — query.sort 에 따라. null 값(분석 안 된 가게) 은 항상 가장 뒤.
    // recent 는 ISO 문자열 비교로 desc(=최근이 위).
    const cmpRecent = (a: CanonicalListItemType, b: CanonicalListItemType): number =>
      a.lastCrawledAt < b.lastCrawledAt ? 1 : a.lastCrawledAt > b.lastCrawledAt ? -1 : 0;
    const byKeyDesc =
      (keyOf: (it: CanonicalListItemType) => number | null) =>
      (a: CanonicalListItemType, b: CanonicalListItemType): number => {
        const av = keyOf(a);
        const bv = keyOf(b);
        if (av === null && bv === null) return cmpRecent(a, b);
        if (av === null) return 1;
        if (bv === null) return -1;
        if (av === bv) return cmpRecent(a, b);
        return bv - av;
      };
    const byKeyAsc =
      (keyOf: (it: CanonicalListItemType) => number | null) =>
      (a: CanonicalListItemType, b: CanonicalListItemType): number => {
        const av = keyOf(a);
        const bv = keyOf(b);
        if (av === null && bv === null) return cmpRecent(a, b);
        if (av === null) return 1;
        if (bv === null) return -1;
        if (av === bv) return cmpRecent(a, b);
        return av - bv;
      };
    switch (query.sort) {
      case 'satisfaction':
        items.sort(byKeyDesc((it) => it.avgSatisfactionScore));
        break;
      case 'positive':
        items.sort(byKeyDesc((it) => it.avgSentimentScore));
        break;
      case 'negativeRatio':
        // summaryDone===0 → 분모 없음 → null → nulls-last. 그 외엔 negative 비율 asc.
        items.sort(
          byKeyAsc((it) => (it.summaryDone === 0 ? null : it.negativeCount / it.summaryDone)),
        );
        break;
      case 'recent':
      default:
        items.sort(cmpRecent);
        break;
    }
    const total = items.length;
    const sliced = items.slice(query.offset, query.offset + query.limit);
    return { items: sliced, total, limit: query.limit, offset: query.offset };
  }

  // 공개 맛집 지도/리스트 페이지가 호출하는 리스트. 어드민 list() 와는
  // 응답 셋이 다르다 — 좌표·도로명·대표 이미지가 들어가고 운영 메타(요약 진행
  // 상태/실패 카운트 등) 는 빠진다. 좌표·imageUrls 는 snapshotJson 안에 살아
  // 있어서 결과적으로 모든 행을 fetch 해 파싱해야 한다 (식당 수는 수십~수백
  // 단위라 메모리 처리로 충분).
  async getPublicList(
    query: RestaurantPublicListQueryType,
  ): Promise<RestaurantPublicListResultType> {
    // 응답 행은 네이버 placeId 키를 그대로 유지 — 라우팅/캐시/UI 가 placeId 에
    // 의존. 다만 같은 canonical 에 묶인 다이닝코드·테이블링 형제가 있으면 그
    // 행의 리뷰/요약 카운트를 함께 합산해 카드 카운트가 어드민 맛집 list 와
    // 정렬되게 한다.
    const ands: Record<string, unknown>[] = [{ source: 'naver' }];
    if (query.q && query.q.length > 0) {
      ands.push({
        OR: [{ name: { contains: query.q } }, { category: { contains: query.q } }],
      });
    }
    if (query.category && query.category.length > 0) {
      ands.push({ category: { contains: query.category } });
    }
    const where: Record<string, unknown> = ands.length > 0 ? { AND: ands } : {};

    const rows = await this.prisma.restaurant.findMany({
      where,
      select: {
        id: true,
        canonicalId: true,
        placeId: true,
        name: true,
        category: true,
        address: true,
        rating: true,
        reviewCount: true,
        firstCrawledAt: true,
        snapshotJson: true,
        _count: { select: { visitorReviews: true } },
      },
    });

    interface Enriched {
      id: string;
      canonicalId: string;
      placeId: string;
      name: string;
      category: string | null;
      address: string | null;
      roadAddress: string | null;
      rating: number | null;
      reviewCount: number | null;
      firstCrawledAt: Date;
      latitude: number | null;
      longitude: number | null;
      thumbnailUrl: string | null;
      totalReviews: number;
    }
    const enriched: Enriched[] = rows.map((r) => {
      let latitude: number | null = null;
      let longitude: number | null = null;
      let roadAddress: string | null = null;
      let thumbnailUrl: string | null = null;
      try {
        const snap = JSON.parse(r.snapshotJson) as Partial<NaverPlaceDataType>;
        if (typeof snap.latitude === 'number') latitude = snap.latitude;
        if (typeof snap.longitude === 'number') longitude = snap.longitude;
        if (typeof snap.roadAddress === 'string') roadAddress = snap.roadAddress;
        if (Array.isArray(snap.imageUrls) && typeof snap.imageUrls[0] === 'string') {
          thumbnailUrl = snap.imageUrls[0];
        }
      } catch {
        // snapshotJson 파손은 드문 케이스 — 좌표/사진만 비고 다른 필드는 살림.
      }
      return {
        id: r.id,
        canonicalId: r.canonicalId,
        // source='naver' 필터로 placeId 는 항상 non-null.
        placeId: r.placeId!,
        name: r.name,
        category: r.category,
        address: r.address,
        roadAddress,
        rating: r.rating,
        reviewCount: r.reviewCount,
        firstCrawledAt: r.firstCrawledAt,
        latitude,
        longitude,
        thumbnailUrl,
        totalReviews: r._count.visitorReviews,
      };
    });

    let filtered = enriched;
    if (query.bbox) {
      const parts = query.bbox.split(',').map(Number);
      // bbox 가 무효(NaN) 이면 무시하고 전체 통과 — Zod regex 통과한 입력이라
      // 정상 파싱되지만 방어적으로 length·finite 체크.
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        const [minLng, minLat, maxLng, maxLat] = parts as [number, number, number, number];
        filtered = enriched.filter(
          (r) =>
            r.latitude !== null &&
            r.longitude !== null &&
            r.longitude >= minLng &&
            r.longitude <= maxLng &&
            r.latitude >= minLat &&
            r.latitude <= maxLat,
        );
      }
    }

    // bbox 후의 ids 만 집계 — 검색 범위 밖 식당의 분석 통계까지 부르지 않게.
    // status 전체를 끌어와 진행도(pending/running/done/failed) 분포도 함께
    // 채운다 — 어드민 발견 페이지가 SSE 로 행 배지를 갱신할 때 응답 필드
    // 셋이 어드민 list 와 정렬되어 캐시 패치가 단순해진다.
    //
    // 추가: 같은 canonical 에 묶인 다이닝코드·테이블링 형제가 있으면 그 행의
    // visitorReview 수 / ReviewSummary 분포도 동일 카운트에 합산. 행은 여전히
    // Naver placeId 키 1개지만 카드에 보이는 숫자는 세 출처의 통합 카운트가 된다.
    const naverIds = filtered.map((r) => r.id);
    const canonicalIds = filtered.map((r) => r.canonicalId);
    const dcSiblings =
      canonicalIds.length > 0
        ? await this.prisma.restaurant.findMany({
            where: { source: 'diningcode', canonicalId: { in: canonicalIds } },
            select: {
              id: true,
              canonicalId: true,
              _count: { select: { visitorReviews: true } },
            },
          })
        : [];
    // 테이블링은 partner 행만 — place 행은 리뷰가 없어 합산 의미가 없다
    // (상세 융합 경로와 동일 기준).
    const tbSiblings =
      canonicalIds.length > 0
        ? await this.prisma.restaurant.findMany({
            where: {
              source: 'tabling',
              canonicalId: { in: canonicalIds },
              NOT: { sourceId: { startsWith: 'place:' } },
            },
            select: {
              id: true,
              canonicalId: true,
              _count: { select: { visitorReviews: true } },
            },
          })
        : [];
    // 같은 canonical 에 형제 행이 둘 이상이면 통상 의미상 첫 매칭만 사용 —
    // 실제로는 (source, sourceId) unique + 자동 매칭이 1:1 이라 한 줄.
    const dcByCanonical = new Map<string, { id: string; visitorReviewCount: number }>();
    for (const dc of dcSiblings) {
      if (!dcByCanonical.has(dc.canonicalId)) {
        dcByCanonical.set(dc.canonicalId, {
          id: dc.id,
          visitorReviewCount: dc._count.visitorReviews,
        });
      }
    }
    const tbByCanonical = new Map<string, { id: string; visitorReviewCount: number }>();
    for (const tb of tbSiblings) {
      if (!tbByCanonical.has(tb.canonicalId)) {
        tbByCanonical.set(tb.canonicalId, {
          id: tb.id,
          visitorReviewCount: tb._count.visitorReviews,
        });
      }
    }

    const ids = [
      ...naverIds,
      ...dcSiblings.map((dc) => dc.id),
      ...tbSiblings.map((tb) => tb.id),
    ];
    const summaryRows =
      ids.length > 0
        ? await this.prisma.reviewSummary.findMany({
            where: { review: { restaurantId: { in: ids } } },
            select: {
              status: true,
              sentiment: true,
              sentimentScore: true,
              satisfactionScore: true,
              review: { select: { restaurantId: true } },
            },
          })
        : [];

    interface Bucket {
      pending: number;
      running: number;
      done: number;
      failed: number;
      analyzed: number;
      sentSum: number;
      sentN: number;
      satSum: number;
      satN: number;
      pos: number;
      neg: number;
      neu: number;
    }
    const byId = new Map<string, Bucket>();
    for (const id of ids) {
      byId.set(id, {
        pending: 0,
        running: 0,
        done: 0,
        failed: 0,
        analyzed: 0,
        sentSum: 0,
        sentN: 0,
        satSum: 0,
        satN: 0,
        pos: 0,
        neg: 0,
        neu: 0,
      });
    }
    for (const s of summaryRows) {
      const b = byId.get(s.review.restaurantId);
      if (!b) continue;
      // queued 도 진행 중 의미로 pending 에 합산 (위 비공개 list 와 동일 정책).
      if (s.status === 'pending' || s.status === 'queued') b.pending += 1;
      else if (s.status === 'running') b.running += 1;
      else if (s.status === 'failed') b.failed += 1;
      else if (s.status === 'done') {
        b.done += 1;
        b.analyzed += 1;
        if (s.sentiment === 'positive') b.pos += 1;
        else if (s.sentiment === 'negative') b.neg += 1;
        else if (s.sentiment === 'neutral') b.neu += 1;
        // mixed 는 공개 카운트에서 빼고 별도 집계도 안 함 — 라이트한 UI 표면에서
        // 4범주가 시각적으로 무거워 신호/잡음 비가 나쁘다.
        if (s.sentimentScore !== null) {
          b.sentSum += s.sentimentScore;
          b.sentN += 1;
        }
        if (s.satisfactionScore !== null) {
          b.satSum += s.satisfactionScore;
          b.satN += 1;
        }
      }
    }

    const items: RestaurantPublicListItemType[] = filtered.map((r) => {
      const naverBucket = byId.get(r.id)!;
      const dc = dcByCanonical.get(r.canonicalId) ?? null;
      const dcBucket = dc ? (byId.get(dc.id) ?? null) : null;
      const tb = tbByCanonical.get(r.canonicalId) ?? null;
      const tbBucket = tb ? (byId.get(tb.id) ?? null) : null;
      const sentSum =
        naverBucket.sentSum + (dcBucket?.sentSum ?? 0) + (tbBucket?.sentSum ?? 0);
      const sentN = naverBucket.sentN + (dcBucket?.sentN ?? 0) + (tbBucket?.sentN ?? 0);
      const satSum =
        naverBucket.satSum + (dcBucket?.satSum ?? 0) + (tbBucket?.satSum ?? 0);
      const satN = naverBucket.satN + (dcBucket?.satN ?? 0) + (tbBucket?.satN ?? 0);
      return {
        placeId: r.placeId,
        name: r.name,
        category: r.category,
        address: r.address,
        roadAddress: r.roadAddress,
        rating: r.rating,
        reviewCount: r.reviewCount,
        latitude: r.latitude,
        longitude: r.longitude,
        thumbnailUrl: r.thumbnailUrl,
        firstCrawledAt: r.firstCrawledAt.toISOString(),
        totalReviews:
          r.totalReviews + (dc?.visitorReviewCount ?? 0) + (tb?.visitorReviewCount ?? 0),
        summaryPending:
          naverBucket.pending + (dcBucket?.pending ?? 0) + (tbBucket?.pending ?? 0),
        summaryRunning:
          naverBucket.running + (dcBucket?.running ?? 0) + (tbBucket?.running ?? 0),
        summaryDone: naverBucket.done + (dcBucket?.done ?? 0) + (tbBucket?.done ?? 0),
        summaryFailed:
          naverBucket.failed + (dcBucket?.failed ?? 0) + (tbBucket?.failed ?? 0),
        analyzedCount:
          naverBucket.analyzed + (dcBucket?.analyzed ?? 0) + (tbBucket?.analyzed ?? 0),
        avgSentimentScore: sentN > 0 ? sentSum / sentN : null,
        avgSatisfactionScore: satN > 0 ? satSum / satN : null,
        positiveCount: naverBucket.pos + (dcBucket?.pos ?? 0) + (tbBucket?.pos ?? 0),
        negativeCount: naverBucket.neg + (dcBucket?.neg ?? 0) + (tbBucket?.neg ?? 0),
        neutralCount: naverBucket.neu + (dcBucket?.neu ?? 0) + (tbBucket?.neu ?? 0),
      };
    });

    const sortFn = pickPublicSort(query.sort);
    items.sort(sortFn);

    const total = items.length;
    const slice = items.slice(query.offset, query.offset + query.limit);
    return { items: slice, total };
  }

  // 공개 상세 — Naver placeId 로 찾은 행 + 같은 canonical 의 다이닝코드·
  // 테이블링 형제 행을 함께 읽어 융합한 단일 응답을 반환. 머지 규칙은 어드민
  // 합의를 따라 restaurant.merge.ts 의 순수 함수로 분리해 두었다.
  //
  // 분석(ReviewSummary) 진행 상태/에러/모델 같은 운영 메타데이터는 그대로
  // 떼어내고, 분석 완료된 행만 평탄화한 analysis 로 노출. 분석 안 된 리뷰는
  // analysis=null 로 본문만 노출 (출처 무관 동일 규칙).
  //
  // reviews 페이로드는 reviewsFirstPage (10개) 만 동봉. 나머지는
  // getPublicReviews 로 페이지네이션.
  async getPublicDetail(placeId: string): Promise<RestaurantPublicDetailType | null> {
    const assembled = await this.assemblePublicReviews(placeId);
    if (!assembled) return null;

    const {
      naverRow,
      dcRow,
      tbRow,
      naverSnap,
      dcSnap,
      tbSnap,
      reviews,
      naverReviewCount,
      dcReviewCount,
      tbReviewCount,
    } = assembled;

    const merged = mergeAddress(naverRow, naverSnap, dcSnap, tbSnap);
    const coords = mergeCoordinates(naverSnap, dcSnap, tbSnap);

    return {
      // placeId 로 findUnique 했으니 일치 행은 반드시 placeId 가 채워져 있다.
      placeId: naverRow.placeId!,
      name: mergeName(naverRow, dcSnap, tbSnap),
      category: mergeCategory(naverRow, dcSnap, tbSnap),
      address: merged.address,
      roadAddress: merged.roadAddress,
      phone: mergePhone(naverRow, dcSnap, tbSnap),
      businessHours: mergeBusinessHours(naverSnap, dcSnap, tbSnap),
      rating: mergeRating(naverRow, dcSnap, tbSnap),
      reviewCount: mergeReviewCount(naverRow, dcSnap, tbSnap),
      latitude: coords.latitude,
      longitude: coords.longitude,
      imageUrls: mergePhotos(naverSnap, dcSnap, tbSnap),
      menus: mergeMenus(naverSnap, dcSnap, tbSnap),
      blogReviews: mergeBlogReviews(naverSnap, dcSnap),
      rawSourceUrl: naverRow.rawSourceUrl,
      firstCrawledAt: naverRow.firstCrawledAt.toISOString(),
      reviewsFirstPage: reviews.slice(0, REVIEWS_FIRST_PAGE_SIZE),
      reviewCounts: computeReviewCounts(reviews),
      sources: computeSources(
        naverRow,
        naverSnap,
        dcRow && dcSnap
          ? {
              vRid: dcRow.sourceId,
              rating: dcSnap.scoreDetail?.average ?? dcRow.rating,
              siteReviewCount: dcSnap.scoreDetail?.reviewTotal ?? dcRow.reviewCount,
              rawSourceUrl: dcRow.rawSourceUrl,
            }
          : null,
        tbRow && tbSnap
          ? {
              // partner 행만 조회하므로 sourceId 는 항상 숫자 idx 문자열.
              idx: Number(tbRow.sourceId),
              rating: tbSnap.rating ?? tbRow.rating,
              siteReviewCount: tbSnap.reviewTotalCount ?? tbRow.reviewCount,
              rawSourceUrl: tbRow.rawSourceUrl,
            }
          : null,
      ),
      storedReviewCount: computeStoredReviewCount(
        naverReviewCount,
        dcReviewCount,
        tbReviewCount,
      ),
      diningcode: dcSnap ? composeDiningcodeAddon(dcSnap) : null,
      tabling: tbSnap ? composeTablingAddon(tbSnap) : null,
    };
  }

  async getPublicSeoMeta(placeId: string): Promise<RestaurantPublicSeoMeta | null> {
    const naverRow = await this.prisma.restaurant.findUnique({
      where: { placeId },
      select: {
        placeId: true,
        name: true,
        category: true,
        address: true,
        phone: true,
        rating: true,
        reviewCount: true,
        rawSourceUrl: true,
        snapshotJson: true,
        canonicalId: true,
      },
    });
    if (!naverRow?.placeId) return null;

    const dcRow = await this.prisma.restaurant.findFirst({
      where: { canonicalId: naverRow.canonicalId, source: 'diningcode' },
      select: { snapshotJson: true },
    });
    const tbRow = await this.prisma.restaurant.findFirst({
      where: {
        canonicalId: naverRow.canonicalId,
        source: 'tabling',
        NOT: { sourceId: { startsWith: 'place:' } },
      },
      select: { snapshotJson: true },
    });

    const naverSnap = JSON.parse(naverRow.snapshotJson) as Omit<
      NaverPlaceDataType,
      'visitorReviews'
    >;
    const dcSnap = dcRow
      ? (JSON.parse(dcRow.snapshotJson) as Omit<DiningcodeShopDataType, 'reviewsFirstPage'>)
      : null;
    const tbSnap = tbRow ? (JSON.parse(tbRow.snapshotJson) as TablingSnapshot) : null;
    const merged = mergeAddress(naverRow, naverSnap, dcSnap, tbSnap);
    const coords = mergeCoordinates(naverSnap, dcSnap, tbSnap);

    return {
      placeId: naverRow.placeId,
      name: mergeName(naverRow, dcSnap, tbSnap),
      category: mergeCategory(naverRow, dcSnap, tbSnap),
      address: merged.address,
      roadAddress: merged.roadAddress,
      phone: mergePhone(naverRow, dcSnap, tbSnap),
      businessHours: mergeBusinessHours(naverSnap, dcSnap, tbSnap),
      rating: mergeRating(naverRow, dcSnap, tbSnap),
      reviewCount: mergeReviewCount(naverRow, dcSnap, tbSnap),
      latitude: coords.latitude,
      longitude: coords.longitude,
      imageUrls: mergePhotos(naverSnap, dcSnap, tbSnap),
      menus: mergeMenus(naverSnap, dcSnap, tbSnap),
      rawSourceUrl: naverRow.rawSourceUrl,
    };
  }

  async getPublicSitemapEntries(): Promise<Array<{ placeId: string; lastmod: string }>> {
    const rows = await this.prisma.restaurant.findMany({
      where: { placeId: { not: null } },
      select: { placeId: true, lastCrawledAt: true },
      orderBy: { lastCrawledAt: 'desc' },
      take: 50_000,
    });
    return rows.flatMap((row) =>
      row.placeId ? [{ placeId: row.placeId, lastmod: row.lastCrawledAt.toISOString() }] : [],
    );
  }

  // 페이지네이션 방문자 리뷰. detail 과 같은 fetch + merge 경로를 공유.
  // 필터/정렬을 거친 후 offset/limit 슬라이스. 데이터셋이 식당당 수십~수백
  // 수준이라 raw SQL UNION + LIMIT 대신 메모리 정렬로 충분.
  async getPublicReviews(
    placeId: string,
    query: RestaurantPublicReviewsQueryType,
  ): Promise<RestaurantPublicReviewsResultType | null> {
    const assembled = await this.assemblePublicReviews(placeId);
    if (!assembled) return null;
    const { reviews } = assembled;

    let filtered = reviews;
    if (query.sentiment !== 'all') {
      filtered = filtered.filter((r) => r.analysis?.sentiment === query.sentiment);
    }

    // 방문 팁 필터 — topTips 집계와 동일한 termNorm 정확 일치. 클릭한 팁이
    // 분석에 달린 리뷰만 남긴다(분석 없는 리뷰는 자동 제외).
    if (query.tip) {
      const want = normalizeTerm(query.tip);
      filtered = filtered.filter(
        (r) => r.analysis?.tips.some((t) => normalizeTerm(t) === want) ?? false,
      );
    }

    // 메뉴 필터 — topMenus(getInsights) 와 동일한 MenuCanonical 그룹핑으로 매칭.
    // 클릭한 표시명(canonical 표시명) 을 그룹키(canonicalNorm)로 환산하고, 각
    // 리뷰의 menu 멘션도 같은 방식으로 환산해 비교 → 카드의 'N회 언급' 카운트와
    // 결과 수가 일치한다(약어/표기 변형까지 같은 그룹으로 묶임). canonical 매핑이
    // 없는 메뉴는 nameNorm 정확 일치로 fallback — 이 또한 집계와 동일한 키.
    if (query.menu) {
      const canonicals = await this.prisma.menuCanonical.findMany({
        where: { restaurantId: assembled.naverRow.id },
        select: { nameNorm: true, canonicalName: true, canonicalNorm: true },
      });
      const canonByNorm = new Map(canonicals.map((c) => [c.nameNorm, c.canonicalNorm]));
      const canonicalNameToNorm = new Map(
        canonicals.map((c) => [c.canonicalName, c.canonicalNorm]),
      );
      const groupKey = (name: string) =>
        canonByNorm.get(normalizeTerm(name)) ?? normalizeTerm(name);
      const want = canonicalNameToNorm.get(query.menu) ?? normalizeTerm(query.menu);
      filtered = filtered.filter(
        (r) => r.analysis?.menus.some((m) => groupKey(m.name) === want) ?? false,
      );
    }

    if (query.sort === 'rating') {
      // 별점 desc. 별점 null 은 0 으로 떨어져 뒤로 밀린다. 같은 별점에서는
      // 기본 정렬(fetchedAt asc = 최신순)이 안정성(stable sort) 으로 유지 —
      // JS Array.sort 는 ES2019 부터 stable 보장.
      filtered = [...filtered].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    }
    // recent 는 assemblePublicReviews 에서 이미 fetchedAt asc(=최신순) 로 정렬됨.

    return {
      items: filtered.slice(query.offset, query.offset + query.limit),
      total: filtered.length,
    };
  }

  // 공유 OG/갤러리용 식당 사진 URL 만 모은다. getPublicDetail 과 달리
  // visitorReviews/summary(식당당 수십~수백 행)를 로드하지 않고 snapshotJson 만
  // 읽어 mergePhotos 로 imageUrls 를 산출한다 — 같은 snapshot + 같은 merge 함수라
  // 결과 배열은 getPublicDetail().imageUrls 와 동일. 식당이 없으면 빈 배열.
  async getPhotoUrls(placeId: string): Promise<string[]> {
    const naverRow = await this.prisma.restaurant.findUnique({
      where: { placeId },
      select: { snapshotJson: true, canonicalId: true },
    });
    if (!naverRow) return [];

    const dcRow = await this.prisma.restaurant.findFirst({
      where: { canonicalId: naverRow.canonicalId, source: 'diningcode' },
      select: { snapshotJson: true },
    });
    const tbRow = await this.prisma.restaurant.findFirst({
      where: {
        canonicalId: naverRow.canonicalId,
        source: 'tabling',
        NOT: { sourceId: { startsWith: 'place:' } },
      },
      select: { snapshotJson: true },
    });

    const naverSnap = JSON.parse(naverRow.snapshotJson) as Omit<
      NaverPlaceDataType,
      'visitorReviews'
    >;
    const dcSnap = dcRow
      ? (JSON.parse(dcRow.snapshotJson) as Omit<DiningcodeShopDataType, 'reviewsFirstPage'>)
      : null;
    const tbSnap = tbRow ? (JSON.parse(tbRow.snapshotJson) as TablingSnapshot) : null;

    return mergePhotos(naverSnap, dcSnap, tbSnap);
  }

  // 세 source 의 reviews 를 합쳐 fetchedAt asc 로 정렬해 돌려준다.
  // 크롤러가 네이버 최신순(sort=recent)으로 받아 최신글부터 순서대로 저장하므로
  // fetchedAt asc = 작성일 최신순. (한계: 이후 update 모드로 새로 수집된 리뷰는
  // fetchedAt 이 더 커서 끝에 붙는다 — 작성일 정렬이 필요하면 visitedAt 파싱 도입.)
  // getPublicDetail 과 getPublicReviews 가 공유. 반환 타입은 inferred —
  // Prisma 의 visitorReviews + summary include 형태가 호출자에 그대로 노출됨.
  private async assemblePublicReviews(placeId: string) {
    const naverRow = await this.prisma.restaurant.findUnique({
      where: { placeId },
      include: {
        visitorReviews: {
          orderBy: { fetchedAt: 'asc' },
          include: { summary: true },
        },
      },
    });
    if (!naverRow) return null;

    const dcRow = await this.prisma.restaurant.findFirst({
      where: { canonicalId: naverRow.canonicalId, source: 'diningcode' },
      include: {
        visitorReviews: {
          orderBy: { fetchedAt: 'asc' },
          include: { summary: true },
        },
      },
    });

    // 테이블링은 partner 행(숫자 idx)만 — place 행('place:' prefix)은 얕은
    // 스냅샷(다른 shape, 리뷰 없음)이라 공개 융합에서 제외.
    const tbRow = await this.prisma.restaurant.findFirst({
      where: {
        canonicalId: naverRow.canonicalId,
        source: 'tabling',
        NOT: { sourceId: { startsWith: 'place:' } },
      },
      include: {
        visitorReviews: {
          orderBy: { fetchedAt: 'asc' },
          include: { summary: true },
        },
      },
    });

    const naverSnap = JSON.parse(naverRow.snapshotJson) as Omit<
      NaverPlaceDataType,
      'visitorReviews'
    >;
    const dcSnap = dcRow
      ? (JSON.parse(dcRow.snapshotJson) as Omit<DiningcodeShopDataType, 'reviewsFirstPage'>)
      : null;
    const tbSnap = tbRow ? (JSON.parse(tbRow.snapshotJson) as TablingSnapshot) : null;

    const naverReviews = naverRow.visitorReviews.map((v) => this.toPublicReview(v, 'naver'));
    const dcReviews = dcRow
      ? dcRow.visitorReviews.map((v) => this.toPublicReview(v, 'diningcode'))
      : [];
    const tbReviews = tbRow
      ? tbRow.visitorReviews.map((v) => this.toPublicReview(v, 'tabling'))
      : [];
    const reviews: PublicVisitorReviewType[] = [
      ...naverReviews,
      ...dcReviews,
      ...tbReviews,
    ].sort((a, b) => +new Date(a.fetchedAt) - +new Date(b.fetchedAt));

    return {
      naverRow,
      dcRow,
      tbRow,
      naverSnap,
      dcSnap,
      tbSnap,
      reviews,
      naverReviewCount: naverReviews.length,
      dcReviewCount: dcReviews.length,
      tbReviewCount: tbReviews.length,
    };
  }

  // VisitorReview 한 줄을 PublicVisitorReview 로 변환. source 는 호출자가 행의
  // restaurant 출처 컨텍스트를 알고 있으므로 그대로 전달.
  private toPublicReview(
    v: {
      id: string;
      authorName: string | null;
      rating: number | null;
      body: string;
      visitedAt: string | null;
      imageUrlsJson: string;
      videosJson: string;
      fetchedAt: Date;
      summary: {
        status: string;
        text: string | null;
        sentiment: string | null;
        sentimentScore: number | null;
        satisfactionScore: number | null;
        menusJson: string | null;
        tipsJson: string | null;
        keywordsJson: string | null;
        finishedAt: Date | null;
      } | null;
    },
    source: 'naver' | 'diningcode' | 'tabling',
  ): PublicVisitorReviewType {
    const s = v.summary;
    let analysis: PublicReviewAnalysisType | null = null;
    if (
      s &&
      s.status === 'done' &&
      s.text &&
      (s.sentiment === 'positive' ||
        s.sentiment === 'negative' ||
        s.sentiment === 'neutral' ||
        s.sentiment === 'mixed') &&
      s.sentimentScore !== null &&
      s.satisfactionScore !== null &&
      s.finishedAt
    ) {
      analysis = {
        text: s.text,
        sentiment: s.sentiment,
        sentimentScore: s.sentimentScore,
        satisfactionScore: s.satisfactionScore,
        menus: safeParseMenus(s.menusJson) ?? [],
        tips: safeParseStringArrayNullable(s.tipsJson) ?? [],
        keywords: safeParseStringArrayNullable(s.keywordsJson) ?? [],
        finishedAt: s.finishedAt.toISOString(),
      };
    }
    return {
      id: v.id,
      source,
      authorName: v.authorName,
      rating: v.rating,
      body: v.body,
      visitedAt: v.visitedAt,
      imageUrls: safeParseStringArray(v.imageUrlsJson),
      videos: safeParseVideos(v.videosJson),
      fetchedAt: v.fetchedAt.toISOString(),
      analysis,
    };
  }

  // 공개 식당 랭킹 — 비로그인/게스트도 호출. 분석된(done) 리뷰의 sentiment
  // 분포를 식당 단위로 집계해 긍정/부정 비율로 정렬.
  //
  // 집계 전략:
  //   1) 단일 raw SQL 로 (restaurantId, sentiment) 그룹 카운트 — N+1 회피.
  //   2) 결과를 JS 에서 식당별 버킷으로 묶고 score 계산.
  //   3) (sort, excludeNeutral, minMentions) 단위로 60s TTL 캐시 — 같은 풀에서
  //      limit/offset 만 다른 호출은 캐시된 정렬 배열을 slice 만 하면 된다.
  //   4) 동일 키 동시 요청은 in-flight Promise 공유로 dogpile 방어.
  async getRanking(query: RestaurantRankingQueryType): Promise<RestaurantRankingResultType> {
    const cacheKey = `${query.sort}:${query.excludeNeutral}:${query.minMentions}`;
    const rows = await this.getRankingRows(cacheKey, query);
    const total = rows.length;
    const slice = rows.slice(query.offset, query.offset + query.limit);
    return {
      items: slice.map((r, i) => ({ ...r, rank: query.offset + i + 1 })),
      total,
      sort: query.sort,
      excludeNeutral: query.excludeNeutral,
      minMentions: query.minMentions,
    };
  }

  // 등록된 가게(canonical)를 시/도·시군구로 묶은 분포. 주소를 regions.json
  // 사전과 매칭(deriveRegion)하고, 주소가 없거나 시군구를 못 뽑으면 canonical
  // 좌표 최근접 시군구로 폴백한다. 둘 다 실패하면 unclassified. 60s 캐시.
  async getRegionStats(): Promise<RegionStatsResultType> {
    const now = Date.now();
    if (regionStatsCache && regionStatsCache.expiresAt >= now) return regionStatsCache.data;
    regionStatsCache = null;
    if (regionStatsPending) return regionStatsPending;

    regionStatsPending = this.computeRegionStats()
      .then((data) => {
        regionStatsCache = { data, expiresAt: Date.now() + REGION_STATS_CACHE_TTL_MS };
        return data;
      })
      .finally(() => {
        regionStatsPending = null;
      });
    return regionStatsPending;
  }

  private async computeRegionStats(): Promise<RegionStatsResultType> {
    // 가게 단위(canonical) 1행 = 1집계. 주소는 source 행에 있으니 Naver 우선,
    // 없으면 다른 출처 주소. 좌표는 canonical 에 있다(폴백용).
    //
    // restaurants:{some:{}} 로 실제 크롤된 source 행이 1개 이상인 canonical 만
    // 센다 — 자동발굴 등으로 좌표만 박힌 빈 canonical(껍데기)이 다수 존재하며,
    // 어드민 맛집 목록에도 안 뜨므로 통계에서도 제외해야 한다.
    const canonicals = await this.prisma.canonicalRestaurant.findMany({
      where: { restaurants: { some: {} } },
      select: {
        latitude: true,
        longitude: true,
        restaurants: { select: { source: true, address: true } },
      },
    });

    const pickAddress = (
      rows: Array<{ source: string; address: string | null }>,
    ): string | null => {
      const naver = rows.find((r) => r.source === 'naver' && r.address);
      if (naver?.address) return naver.address;
      return rows.find((r) => r.address)?.address ?? null;
    };

    interface SidoAgg {
      count: number;
      sigungus: Map<string, { count: number; lat: number | null; lng: number | null }>;
    }
    const bySido = new Map<string, SidoAgg>();
    let unclassified = 0;

    for (const c of canonicals) {
      const region = deriveRegion(pickAddress(c.restaurants), c.latitude, c.longitude);
      if (!region) {
        unclassified += 1;
        continue;
      }
      const sido = bySido.get(region.sido) ?? { count: 0, sigungus: new Map() };
      sido.count += 1;
      const sg = sido.sigungus.get(region.sigungu) ?? {
        count: 0,
        lat: region.lat,
        lng: region.lng,
      };
      sg.count += 1;
      sido.sigungus.set(region.sigungu, sg);
      bySido.set(region.sido, sido);
    }

    const sidos = [...bySido.entries()]
      .map(([sido, v]) => ({
        sido,
        count: v.count,
        sigungus: [...v.sigungus.entries()]
          .map(([sigungu, s]) => ({ sigungu, count: s.count, lat: s.lat, lng: s.lng }))
          .sort((a, b) => b.count - a.count || a.sigungu.localeCompare(b.sigungu, 'ko')),
      }))
      .sort((a, b) => b.count - a.count || a.sido.localeCompare(b.sido, 'ko'));

    const total = sidos.reduce((n, s) => n + s.count, 0);
    return { total, unclassified, sidos };
  }

  private async getRankingRows(
    cacheKey: string,
    query: RestaurantRankingQueryType,
  ): Promise<RankingCacheEntry['rows']> {
    const now = Date.now();
    const cached = rankingCache.get(cacheKey);
    if (cached && cached.expiresAt >= now) return cached.rows;
    if (cached) rankingCache.delete(cacheKey);

    const pending = rankingPending.get(cacheKey);
    if (pending) return pending;

    const promise = this.computeRankingRows(query)
      .then((rows) => {
        rankingCache.set(cacheKey, { rows, expiresAt: Date.now() + RANKING_CACHE_TTL_MS });
        return rows;
      })
      .finally(() => {
        rankingPending.delete(cacheKey);
      });
    rankingPending.set(cacheKey, promise);
    return promise;
  }

  private async computeRankingRows(
    query: RestaurantRankingQueryType,
  ): Promise<RankingCacheEntry['rows']> {
    // (restaurantId, sentiment) 그룹 카운트 — done 행만. mixed 는 여기서 분포에
    // 포함하지 않는다(긍정/부정 비율 정의가 모호해짐). 필요해지면 추후 보정.
    const grouped = await this.prisma.$queryRaw<
      Array<{ restaurantId: string; sentiment: string; cnt: number | bigint }>
    >`SELECT v.restaurantId AS restaurantId,
             rs.sentiment   AS sentiment,
             COUNT(*)       AS cnt
        FROM review_summaries rs
        JOIN visitor_reviews v ON v.id = rs.reviewId
       WHERE rs.status = 'done'
         AND rs.sentiment IN ('positive','negative','neutral')
       GROUP BY v.restaurantId, rs.sentiment`;

    interface Bucket {
      positive: number;
      negative: number;
      neutral: number;
    }
    const byId = new Map<string, Bucket>();
    for (const g of grouped) {
      const cnt = typeof g.cnt === 'bigint' ? Number(g.cnt) : g.cnt;
      const b = byId.get(g.restaurantId) ?? { positive: 0, negative: 0, neutral: 0 };
      if (g.sentiment === 'positive') b.positive = cnt;
      else if (g.sentiment === 'negative') b.negative = cnt;
      else if (g.sentiment === 'neutral') b.neutral = cnt;
      byId.set(g.restaurantId, b);
    }

    if (byId.size === 0) return [];

    const restaurants = await this.prisma.restaurant.findMany({
      // 공개 랭킹은 네이버 전용 — placeId 가 응답 키이자 라우팅 키.
      where: { id: { in: [...byId.keys()] }, source: 'naver' },
      select: { id: true, placeId: true, name: true, category: true },
    });

    const rows: RankingCacheEntry['rows'] = [];
    for (const r of restaurants) {
      const b = byId.get(r.id)!;
      const total = b.positive + b.negative + b.neutral;
      if (total < query.minMentions) continue;
      const denom = query.excludeNeutral ? b.positive + b.negative : total;
      if (denom === 0) continue;
      const positiveRatio = b.positive / denom;
      const negativeRatio = b.negative / denom;
      const score = query.sort === 'positive' ? positiveRatio : negativeRatio;
      rows.push({
        // source='naver' 필터로 placeId 항상 non-null.
        placeId: r.placeId!,
        name: r.name,
        category: r.category,
        positiveCount: b.positive,
        negativeCount: b.negative,
        neutralCount: b.neutral,
        totalMentions: total,
        score,
      });
    }

    // 점수 desc, 동률은 표본 큰 식당 우선, 그 다음 이름 asc 로 안정화.
    rows.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.totalMentions !== a.totalMentions) return b.totalMentions - a.totalMentions;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }

  // 식당 단위 집계. 분석된(done) 행에서 메뉴/팁/키워드 빈도를 추출. 메뉴는
  // 이름 정규화(trim+lower) 후 그룹핑한다. 정렬은 빈도 desc, 동률이면 이름
  // asc — 결과가 안정적이어야 FE 캐시가 깜빡이지 않는다.
  async getInsights(placeId: string): Promise<RestaurantInsightsType | null> {
    const r = await this.prisma.restaurant.findUnique({
      where: { placeId },
      select: { id: true },
    });
    if (!r) return null;

    // sentiment 분포·평균 점수·tips/keywords 는 ReviewSummary 행에서 그대로.
    // 메뉴는 MenuMention + MenuCanonical 로 갈아탔다 — 정규화 그룹핑이 적용된
    // 정확한 카운트가 들어가도록.
    const [rows, mentions, canonicals] = await Promise.all([
      this.prisma.reviewSummary.findMany({
        where: { review: { restaurantId: r.id }, status: 'done' },
        select: {
          sentiment: true,
          sentimentScore: true,
          satisfactionScore: true,
          tipsJson: true,
          keywordsJson: true,
        },
      }),
      this.prisma.menuMention.findMany({
        where: { restaurantId: r.id },
        select: { name: true, nameNorm: true, sentiment: true },
      }),
      this.prisma.menuCanonical.findMany({
        where: { restaurantId: r.id },
        select: { nameNorm: true, canonicalName: true, canonicalNorm: true },
      }),
    ]);
    const canonByNorm = new Map(canonicals.map((c) => [c.nameNorm, c]));

    const dist = { positive: 0, negative: 0, neutral: 0, mixed: 0 };
    let sentSum = 0;
    let sentN = 0;
    let satSum = 0;
    let satN = 0;
    const menus = new Map<
      string,
      { name: string; count: number; positive: number; negative: number; neutral: number }
    >();
    const tips = new Map<string, number>();
    const keywords = new Map<string, number>();

    for (const row of rows) {
      if (row.sentiment === 'positive') dist.positive += 1;
      else if (row.sentiment === 'negative') dist.negative += 1;
      else if (row.sentiment === 'neutral') dist.neutral += 1;
      else if (row.sentiment === 'mixed') dist.mixed += 1;
      if (row.sentimentScore !== null) {
        sentSum += row.sentimentScore;
        sentN += 1;
      }
      if (row.satisfactionScore !== null) {
        satSum += row.satisfactionScore;
        satN += 1;
      }

      for (const t of safeParseStringArrayNullable(row.tipsJson) ?? []) {
        const key = t.trim();
        if (!key) continue;
        tips.set(key, (tips.get(key) ?? 0) + 1);
      }
      for (const k of safeParseStringArrayNullable(row.keywordsJson) ?? []) {
        const key = k.trim();
        if (!key) continue;
        keywords.set(key, (keywords.get(key) ?? 0) + 1);
      }
    }

    // MenuMention 을 canonicalKey 단위로 묶음. canonical 매핑이 있으면 그 키 +
    // displayName, 없으면 nameNorm + 가장 빈번한 원문 표기로 fallback.
    const fallbackBest = new Map<string, { name: string; count: number }>();
    for (const m of mentions) {
      if (canonByNorm.has(m.nameNorm)) continue;
      const cur = fallbackBest.get(m.nameNorm);
      if (!cur) fallbackBest.set(m.nameNorm, { name: m.name, count: 1 });
      else {
        cur.count += 1;
        // tie-break 없이 단순 빈도 — 동률은 처음 본 표기 유지.
      }
    }
    for (const m of mentions) {
      const canon = canonByNorm.get(m.nameNorm);
      const key = canon ? canon.canonicalNorm : m.nameNorm;
      const displayName = canon?.canonicalName ?? fallbackBest.get(m.nameNorm)?.name ?? m.name;
      const cur = menus.get(key) ?? {
        name: displayName,
        count: 0,
        positive: 0,
        negative: 0,
        neutral: 0,
      };
      cur.count += 1;
      if (m.sentiment === 'positive') cur.positive += 1;
      else if (m.sentiment === 'negative') cur.negative += 1;
      else cur.neutral += 1;
      menus.set(key, cur);
    }

    const sortedMenus: RestaurantInsightMenuStatType[] = [...menus.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 20);
    const sortedTips = [...tips.entries()]
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
      .slice(0, 20);
    const sortedKeywords = [...keywords.entries()]
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
      .slice(0, 30);

    return {
      analyzedCount: rows.length,
      avgSentimentScore: sentN > 0 ? sentSum / sentN : null,
      avgSatisfactionScore: satN > 0 ? satSum / satN : null,
      sentimentDistribution: dist,
      topMenus: sortedMenus,
      topTips: sortedTips,
      topKeywords: sortedKeywords,
    };
  }

  // 이 식당의 언급 메뉴를 카테고리 트리로. categoryPath 는 전역 머지(LLM)가
  // GlobalMenuCanonical 에 붙인 값 — 이 식당의 MenuCanonical 이 링크된 전역
  // 그룹의 path 를 쓰고, 멘션 통계는 이 식당 것만 누적한다. 아직 전역 머지가
  // 안 닿은 식당이면 roots 는 빈 배열(분석 탭에서 섹션 자체를 숨김).
  async getCategoryTree(placeId: string): Promise<CategoryTreeNodeType[] | null> {
    const r = await this.prisma.restaurant.findUnique({
      where: { placeId },
      select: { id: true },
    });
    if (!r) return null;

    // 이 식당이 링크된, categoryPath 가 있는 전역 그룹 + 이 식당 쪽 링크만.
    const linked = await this.prisma.globalMenuCanonical.findMany({
      where: {
        categoryPath: { not: null },
        links: { some: { restaurantId: r.id } },
      },
      select: {
        categoryPath: true,
        links: {
          where: { restaurantId: r.id },
          select: { localCanonicalNorm: true },
        },
      },
    });
    if (linked.length === 0) return [];

    // 이 식당의 정규화 메뉴별 멘션 통계 (감정별 COUNT). getInsights 와 동일한
    // menu_mentions ↔ menu_canonicals 조인을 식당으로 좁힌 것.
    const mentionStats = await this.prisma.$queryRaw<
      Array<{ canonicalNorm: string; sentiment: string; cnt: number | bigint }>
    >`SELECT mc.canonicalNorm AS canonicalNorm,
             mm.sentiment AS sentiment,
             COUNT(*) AS cnt
        FROM menu_mentions mm
        JOIN menu_canonicals mc
          ON mc.restaurantId = mm.restaurantId
         AND mc.nameNorm = mm.nameNorm
       WHERE mm.restaurantId = ${r.id}
       GROUP BY mc.canonicalNorm, mm.sentiment`;
    const statByNorm = new Map<string, { positive: number; negative: number; total: number }>();
    for (const s of mentionStats) {
      const cur = statByNorm.get(s.canonicalNorm) ?? {
        positive: 0,
        negative: 0,
        total: 0,
      };
      const cnt = Number(s.cnt);
      cur.total += cnt;
      if (s.sentiment === 'positive') cur.positive += cnt;
      else if (s.sentiment === 'negative') cur.negative += cnt;
      statByNorm.set(s.canonicalNorm, cur);
    }

    const leaves: CategoryTreeLeaf[] = [];
    for (const g of linked) {
      let total = 0;
      let positive = 0;
      let negative = 0;
      for (const link of g.links) {
        const stat = statByNorm.get(link.localCanonicalNorm);
        if (!stat) continue;
        total += stat.total;
        positive += stat.positive;
        negative += stat.negative;
      }
      if (total === 0) continue;
      leaves.push({ categoryPath: g.categoryPath!, total, positive, negative });
    }

    return buildCategoryTree(leaves);
  }

  async getDetailByPlaceId(placeId: string): Promise<RestaurantDetailType | null> {
    const r = await this.prisma.restaurant.findUnique({
      where: { placeId },
      include: {
        visitorReviews: {
          // 어댑터가 SSR 초기(최신 방문) → 페이지 더보기(옛날) 순으로 즉시
          // persist하므로 fetchedAt asc 가 곧 방문일 desc.
          orderBy: { fetchedAt: 'asc' },
          include: { summary: true },
        },
      },
    });
    if (!r) return null;

    const snapshot = JSON.parse(r.snapshotJson) as Omit<NaverPlaceDataType, 'visitorReviews'>;

    const reviews: VisitorReviewWithSummaryType[] = r.visitorReviews.map((v) => ({
      authorName: v.authorName,
      rating: v.rating,
      body: v.body,
      visitedAt: v.visitedAt,
      imageUrls: safeParseStringArray(v.imageUrlsJson),
      videos: safeParseVideos(v.videosJson),
      id: v.id,
      externalId: v.externalId,
      fetchedAt: v.fetchedAt.toISOString(),
      summary: v.summary
        ? {
            status: v.summary.status as 'pending' | 'running' | 'done' | 'failed',
            text: v.summary.text,
            model: v.summary.model,
            errorCode: v.summary.errorCode,
            errorMessage: v.summary.errorMessage,
            startedAt: v.summary.startedAt?.toISOString() ?? null,
            finishedAt: v.summary.finishedAt?.toISOString() ?? null,
            sentiment: (v.summary.sentiment as ReviewSentimentType | null) ?? null,
            sentimentScore: v.summary.sentimentScore,
            satisfactionScore: v.summary.satisfactionScore,
            menus: safeParseMenus(v.summary.menusJson),
            tips: safeParseStringArrayNullable(v.summary.tipsJson),
            keywords: safeParseStringArrayNullable(v.summary.keywordsJson),
          }
        : null,
    }));

    return {
      id: r.id,
      // placeId 로 findUnique 했으니 non-null.
      placeId: r.placeId!,
      name: r.name,
      category: r.category,
      address: r.address,
      phone: r.phone,
      rating: r.rating,
      reviewCount: r.reviewCount,
      rawSourceUrl: r.rawSourceUrl,
      firstCrawledAt: r.firstCrawledAt.toISOString(),
      lastCrawledAt: r.lastCrawledAt.toISOString(),
      snapshot: { ...snapshot, visitorReviews: reviews.map(stripIdsFromReview) },
      reviews,
    };
  }

  // 가중 랜덤 픽. 가중치는 strategy에 따라 계산되며 모두 0~1 범위로
  // 정규화된다. 가중치가 0인(분석 안 된) 후보는 자동으로 배제 — 즉
  // "AI가 평가한 곳" 중에서만 고른다. 후보가 없거나 가중치 합이 0이면
  // picked=null. 단순 랜덤(=PicksService.random)은 picks 도메인이 이미
  // 제공하므로 여기에는 분석 기반 픽만 둔다.
  async smartPick(input: RestaurantSmartPickInputType): Promise<RestaurantSmartPickResultType> {
    const strategy = input.strategy;
    // 공개 픽도 네이버 전용 — 응답 picked.placeId 가 string. 후보가 명시되면 placeId
    // IN 필터로 자연 제한되지만, 후보 없을 때도 source 명시.
    const where: Record<string, unknown> = { source: 'naver' };
    if (input.candidatePlaceIds && input.candidatePlaceIds.length > 0) {
      where.placeId = { in: input.candidatePlaceIds };
    }
    const restaurants = await this.prisma.restaurant.findMany({
      where,
      select: {
        id: true,
        placeId: true,
        name: true,
      },
    });

    if (restaurants.length === 0) {
      return { picked: null, candidates: 0, strategy };
    }

    // list()와 같은 집계를 그대로 재사용하기엔 인터페이스가 안 맞으므로
    // 후보 식당들의 done 행만 따로 집계한다.
    const ids = restaurants.map((r) => r.id);
    const summaryRows = await this.prisma.reviewSummary.findMany({
      where: { review: { restaurantId: { in: ids } }, status: 'done' },
      select: {
        sentimentScore: true,
        satisfactionScore: true,
        review: { select: { restaurantId: true } },
      },
    });
    interface Agg {
      sentSum: number;
      sentN: number;
      satSum: number;
      satN: number;
    }
    const byId = new Map<string, Agg>();
    for (const id of ids) byId.set(id, { sentSum: 0, sentN: 0, satSum: 0, satN: 0 });
    for (const s of summaryRows) {
      const a = byId.get(s.review.restaurantId);
      if (!a) continue;
      if (s.sentimentScore !== null) {
        a.sentSum += s.sentimentScore;
        a.sentN += 1;
      }
      if (s.satisfactionScore !== null) {
        a.satSum += s.satisfactionScore;
        a.satN += 1;
      }
    }

    const weighted = restaurants
      .map((r) => {
        const a = byId.get(r.id)!;
        const sentAvg = a.sentN > 0 ? a.sentSum / a.sentN : null;
        const satAvg = a.satN > 0 ? a.satSum / a.satN : null;
        // 정규화: sentiment -1~1 → 0~1, satisfaction 1~5 → 0~1.
        const sentNorm = sentAvg === null ? null : (sentAvg + 1) / 2;
        const satNorm = satAvg === null ? null : (satAvg - 1) / 4;
        let weight: number;
        if (strategy === 'satisfaction') {
          weight = satNorm ?? 0;
        } else if (strategy === 'positive') {
          weight = sentNorm ?? 0;
        } else {
          // balanced: 둘 다 있으면 평균, 하나만 있으면 그것만, 둘 다 없으면 0.
          if (sentNorm === null && satNorm === null) weight = 0;
          else if (sentNorm === null) weight = satNorm!;
          else if (satNorm === null) weight = sentNorm;
          else weight = (sentNorm + satNorm) / 2;
        }
        return {
          // source='naver' 필터로 placeId non-null.
          placeId: r.placeId!,
          name: r.name,
          weight,
          avgSentimentScore: sentAvg,
          avgSatisfactionScore: satAvg,
        };
      })
      .filter((w) => w.weight > 0);

    if (weighted.length === 0) {
      return { picked: null, candidates: restaurants.length, strategy };
    }

    const total = weighted.reduce((acc, w) => acc + w.weight, 0);
    let r = Math.random() * total;
    for (const w of weighted) {
      r -= w.weight;
      if (r <= 0) {
        return { picked: w, candidates: restaurants.length, strategy };
      }
    }
    // 부동소수 보정 — 마지막 항목.
    const last = weighted[weighted.length - 1]!;
    return { picked: last, candidates: restaurants.length, strategy };
  }

  async getSummaryProgress(placeId: string): Promise<RestaurantSummaryProgressType | null> {
    const r = await this.prisma.restaurant.findUnique({
      where: { placeId },
      select: { id: true },
    });
    if (!r) return null;
    return this.getSummaryProgressByRestaurantId(r.id);
  }

  // Restaurant.id 단위 진행도. SSE 의 canonicalId 멀티플렉싱에서 source 별로
  // 호출. placeId 가 null 인 DC 행도 동일하게 동작.
  async getSummaryProgressByRestaurantId(
    restaurantId: string,
  ): Promise<RestaurantSummaryProgressType | null> {
    const exists = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true },
    });
    if (!exists) return null;

    const counts = await this.prisma.reviewSummary.groupBy({
      by: ['status'],
      where: { review: { restaurantId } },
      _count: { _all: true },
    });

    const out = { queued: 0, pending: 0, running: 0, done: 0, failed: 0, cancelled: 0 };
    for (const c of counts) {
      const key = c.status as keyof typeof out;
      if (key in out) out[key] = c._count._all;
    }

    const totalReviews = await this.prisma.visitorReview.count({
      where: { restaurantId },
    });

    const recent = await this.prisma.reviewSummary.findMany({
      where: { review: { restaurantId }, status: 'done' },
      orderBy: { finishedAt: 'desc' },
      take: 5,
      select: { reviewId: true, text: true, finishedAt: true },
    });

    return {
      totalReviews,
      ...out,
      recentDone: recent.map((s) => ({
        reviewId: s.reviewId,
        text: s.text ?? '',
        finishedAt: s.finishedAt?.toISOString() ?? null,
      })),
    };
  }

  // SSE 라우트가 canonicalId 들 → Restaurant 행들로 풀어내는 데 사용.
  // bus key 결정에 source/sourceId/placeId 가 모두 필요.
  async getRestaurantsByCanonicalIds(canonicalIds: string[]): Promise<
    Array<{
      canonicalId: string;
      restaurantId: string;
      source: string;
      sourceId: string;
      placeId: string | null;
    }>
  > {
    if (canonicalIds.length === 0) return [];
    const rows = await this.prisma.restaurant.findMany({
      where: { canonicalId: { in: canonicalIds } },
      select: {
        id: true,
        canonicalId: true,
        source: true,
        sourceId: true,
        placeId: true,
      },
    });
    return rows.map((r) => ({
      canonicalId: r.canonicalId,
      restaurantId: r.id,
      source: r.source,
      sourceId: r.sourceId,
      placeId: r.placeId,
    }));
  }
}

const safeParseStringArray = (raw: string): string[] => {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    // ignore
  }
  return [];
};

const safeParseVideos = (raw: string): VisitorReviewVideoType[] => {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is VisitorReviewVideoType =>
        x !== null &&
        typeof x === 'object' &&
        typeof (x as { posterUrl?: unknown }).posterUrl === 'string' &&
        typeof (x as { videoUrl?: unknown }).videoUrl === 'string',
    );
  } catch {
    return [];
  }
};

// 컬럼이 비어있으면 (구버전 행 / 분석 안 된 행) null. 파싱 실패도 null로
// 통일해서 클라이언트가 "데이터 없음"과 "빈 배열"을 구분할 수 있게 한다.
const safeParseStringArrayNullable = (raw: string | null): string[] | null => {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    // ignore
  }
  return null;
};

const safeParseMenus = (raw: string | null): ReviewAnalysisMenuType[] | null => {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map((m): ReviewAnalysisMenuType | null => {
        if (typeof m !== 'object' || m === null) return null;
        const name = (m as { name?: unknown }).name;
        if (typeof name !== 'string') return null;
        const s = (m as { sentiment?: unknown }).sentiment;
        const sentiment = s === 'positive' || s === 'negative' || s === 'neutral' ? s : null;
        const rawTraits = (m as { traits?: unknown }).traits;
        const traits = Array.isArray(rawTraits)
          ? rawTraits.filter((t): t is string => typeof t === 'string')
          : [];
        return { name, sentiment, traits };
      })
      .filter((x): x is ReviewAnalysisMenuType => x !== null);
  } catch {
    return null;
  }
};

// 공개 리스트 정렬자. 점수가 null 인 식당은 항상 뒤로 — 미분석 가게가 정렬
// 기준 위로 올라와 빈 자리처럼 보이는 걸 막는다. recent 는 분석 여부 무관.
const pickPublicSort = (
  sort: RestaurantPublicListQueryType['sort'],
): ((a: RestaurantPublicListItemType, b: RestaurantPublicListItemType) => number) => {
  if (sort === 'recent') {
    return (a, b) => +new Date(b.firstCrawledAt) - +new Date(a.firstCrawledAt);
  }
  const nullsLast =
    (
      cmp: (a: RestaurantPublicListItemType, b: RestaurantPublicListItemType) => number,
      keyOf: (it: RestaurantPublicListItemType) => number | null,
    ) =>
    (a: RestaurantPublicListItemType, b: RestaurantPublicListItemType) => {
      const av = keyOf(a);
      const bv = keyOf(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return cmp(a, b);
    };
  if (sort === 'satisfaction') {
    return nullsLast(
      (a, b) => (b.avgSatisfactionScore ?? 0) - (a.avgSatisfactionScore ?? 0),
      (it) => it.avgSatisfactionScore,
    );
  }
  if (sort === 'positive') {
    return nullsLast(
      (a, b) => (b.avgSentimentScore ?? 0) - (a.avgSentimentScore ?? 0),
      (it) => it.avgSentimentScore,
    );
  }
  // rating
  return nullsLast(
    (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
    (it) => it.rating,
  );
};

const stripIdsFromReview = (r: VisitorReviewWithSummaryType): VisitorReviewType => ({
  authorName: r.authorName,
  rating: r.rating,
  body: r.body,
  visitedAt: r.visitedAt,
  imageUrls: r.imageUrls,
  videos: r.videos,
});
