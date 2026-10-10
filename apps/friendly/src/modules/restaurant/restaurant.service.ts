import { createHash, randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { isCandidate, scoreMatch } from '../../lib/matching.js';
import { normalizeTerm } from '../../lib/text.js';
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
  mergeMenuGroups,
  mergeMenus,
  mergeName,
  mergePhone,
  mergePhotos,
  mergeRating,
  mergeReviewCount,
  type TablingSnapshot,
} from './restaurant.merge.js';
import { Routes } from '@repo/api-contract';
import { compareReviewRecencyDesc } from '@repo/utils';
import { deriveRegion } from './region-derive.js';
import { getRestaurantStoreInfo } from './restaurant-store-match.service.js';
import { getRestaurantTourMatchInfo } from '../tour/restaurant-tour-match.service.js';
import { getRestaurantTourSummary, travelerWeight } from '../tour/tour-public.service.js';
import { cachePanoramaThumbnail, isVolatileNaverPhoto } from '../media/panorama-cache.js';
import {
  buildMenuBoardMenus,
  carryMenuBoardReads,
  toPublicMenuBoard,
} from '../menu-board/menu-board.naver-match.js';
import {
  aggregateSummaryBuckets,
  emptySummaryBucket,
  foldAscii,
  getPublicRestaurantBase,
  invalidatePublicRestaurantCache,
} from './restaurant-public-base.js';
import type {
  AdminVisitorReviewType,
  CategoryTreeNodeType,
  DiningcodeShopDataType,
  MenuGroupType,
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
  RestaurantReviewMatchQueryType,
  RestaurantReviewMatchResultType,
  RestaurantRankingQueryType,
  RestaurantRankingResultType,
  RestaurantSmartPickInputType,
  RestaurantSmartPickResultType,
  RegionStatsResultType,
  RestaurantSummaryProgressType,
  ReviewAnalysisMenuType,
  ReviewSentimentType,
  ReviewSummaryStatusType,
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

// 공개 목록·스마트픽·랭킹은 restaurant-public-base 의 공유 캐시(SQL 집계, TTL 30s)를 쓴다.
// 랭킹은 예전엔 (sort, excludeNeutral, minMentions) 조합마다 따로 캐시해 키가 4천 개까지 늘었다 —
// 이제 집계 하나에서 요청마다 메모리로 거르고 정렬한다.
export { invalidatePublicRestaurantCache };
export const invalidateRankingCache = (): void => {
  invalidatePublicRestaurantCache();
};

// 공개 상세·리뷰가 리뷰마다 읽는 열. summary 를 include 하면 embeddingJson(~13KB)·aspectsJson 까지
// 리뷰마다 실려 1천 건 가게 응답(58KB) 하나에 DB→JS 15MB 가 오갔다(docs/PLAN-perf-2.md B-3).
const PUBLIC_REVIEW_SELECT = {
  id: true,
  authorName: true,
  rating: true,
  body: true,
  visitedAt: true,
  imageUrlsJson: true,
  videosJson: true,
  fetchedAt: true,
  summary: {
    select: {
      status: true,
      text: true,
      sentiment: true,
      sentimentScore: true,
      satisfactionScore: true,
      menusJson: true,
      tipsJson: true,
      keywordsJson: true,
      finishedAt: true,
    },
  },
} satisfies Prisma.VisitorReviewSelect;

// 어드민 상세 — 공개 열 + 운영 메타(모델·오류·시작 시각)·externalId. 임베딩은 여기서도 쓰지 않는다.
const ADMIN_REVIEW_SELECT = {
  ...PUBLIC_REVIEW_SELECT,
  externalId: true,
  summary: {
    select: {
      ...PUBLIC_REVIEW_SELECT.summary.select,
      model: true,
      errorCode: true,
      errorMessage: true,
      startedAt: true,
    },
  },
} satisfies Prisma.VisitorReviewSelect;

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
  private async persistVolatilePhotos(placeId: string, urls: string[]): Promise<string[]> {
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

  private async replaceRestaurantMenuGroups(
    restaurantId: string,
    groups: MenuGroupType[],
  ): Promise<void> {
    if (groups.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      // 네이버 행의 메뉴는 크롤 1회분이 전부다. 출처가 naver-baemin ↔ naver-place 로
      // 바뀌어도 이전 출처 행이 남지 않게 source 구분 없이 통째로 교체한다.
      await tx.$executeRaw`
        DELETE FROM restaurant_menus
        WHERE restaurantId = ${restaurantId}
      `;
      await tx.$executeRaw`
        DELETE FROM restaurant_menu_groups
        WHERE restaurantId = ${restaurantId}
      `;

      for (const [groupIndex, group] of groups.entries()) {
        const groupId = `rmg_${randomUUID()}`;
        await tx.$executeRaw`
          INSERT INTO restaurant_menu_groups (
            id,
            restaurantId,
            source,
            sourceGroupId,
            name,
            sortOrder,
            rawJson,
            createdAt,
            updatedAt
          )
          VALUES (
            ${groupId},
            ${restaurantId},
            ${group.source},
            ${group.sourceGroupId ?? null},
            ${group.name},
            ${group.sortOrder ?? groupIndex},
            ${JSON.stringify(group)},
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
        `;

        for (const [menuIndex, menu] of group.menus.entries()) {
          await tx.$executeRaw`
            INSERT INTO restaurant_menus (
              id,
              restaurantId,
              groupId,
              source,
              sourceMenuId,
              name,
              price,
              description,
              imageUrlsJson,
              isRepresentative,
              sortOrder,
              rawJson,
              createdAt,
              updatedAt
            )
            VALUES (
              ${`rm_${randomUUID()}`},
              ${restaurantId},
              ${groupId},
              ${group.source},
              ${menu.sourceMenuId ?? null},
              ${menu.name},
              ${menu.price},
              ${menu.description},
              ${JSON.stringify(menu.imageUrls)},
              ${menu.recommend === true},
              ${menu.sortOrder ?? menuIndex},
              ${JSON.stringify(menu)},
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
          `;
        }
      }
    });
  }

  // 메뉴판 사진과 등록 메뉴 짝(구분값 origin). 사진 목록을 모르면(undefined) 두 필드 모두 빼 직전 값을 덮지 않는다.
  private menuBoardFields(
    menus: NaverPlaceDataType['menus'],
    images: NaverPlaceDataType['menuBoardImages'],
  ): Pick<NaverPlaceDataType, 'menuBoardImages' | 'menuBoardMenus'> {
    if (!Array.isArray(images)) return {};
    return { menuBoardImages: images, menuBoardMenus: buildMenuBoardMenus(menus, images) };
  }

  // 메뉴판 사진 자동 읽기용 — 스냅샷의 등록 메뉴와 사진 목록. 네이버 행이 없거나 파손이면 null.
  async findNaverMenuBoardState(
    placeId: string,
  ): Promise<Pick<NaverPlaceDataType, 'menus' | 'menuBoardImages' | 'menuBoardMenus'> | null> {
    const snap = await this.findPreviousNaverSnapshot(placeId);
    if (!snap) return null;
    return {
      menus: Array.isArray(snap.menus) ? snap.menus : [],
      menuBoardImages: snap.menuBoardImages,
      menuBoardMenus: snap.menuBoardMenus,
    };
  }

  // 읽은 결과를 주소로 붙여 저장하고 짝을 다시 계산한다. 읽는 동안 재크롤이 사진 목록을 바꿨을 수 있어
  // 저장 직전 스냅샷에 붙인다(목록에서 빠진 사진의 결과는 버린다). 붙인 장수와 다시 계산한 짝을 돌려준다.
  async saveNaverMenuBoardReads(
    placeId: string,
    reads: Map<string, NonNullable<NonNullable<NaverPlaceDataType['menuBoardImages']>[number]['read']>>,
  ): Promise<{ attached: number; menuBoardMenus: NonNullable<NaverPlaceDataType['menuBoardMenus']> }> {
    const row = await this.prisma.restaurant.findUnique({
      where: { source_sourceId: { source: 'naver', sourceId: placeId } },
      select: { id: true, snapshotJson: true },
    });
    if (!row) return { attached: 0, menuBoardMenus: [] };
    const snap = JSON.parse(row.snapshotJson) as NaverPlaceDataType;
    if (!Array.isArray(snap.menuBoardImages)) return { attached: 0, menuBoardMenus: snap.menuBoardMenus ?? [] };
    let attached = 0;
    const images = snap.menuBoardImages.map((image) => {
      const read = reads.get(image.url);
      if (!read) return image;
      attached += 1;
      return { ...image, read };
    });
    const boards = this.menuBoardFields(snap.menus ?? [], images);
    await this.prisma.restaurant.update({
      where: { id: row.id },
      data: { snapshotJson: JSON.stringify({ ...snap, ...boards }) },
    });
    return { attached, menuBoardMenus: boards.menuBoardMenus ?? [] };
  }

  // 직전 스냅샷. 없거나 파손이면 null.
  private async findPreviousNaverSnapshot(placeId: string): Promise<Partial<NaverPlaceDataType> | null> {
    const row = await this.prisma.restaurant.findUnique({
      where: { source_sourceId: { source: 'naver', sourceId: placeId } },
      select: { snapshotJson: true },
    });
    if (!row) return null;
    try {
      return JSON.parse(row.snapshotJson) as Partial<NaverPlaceDataType>;
    } catch {
      return null;
    }
  }

  // keptMenuCount > 0 이면 이번 크롤 메뉴가 0건이라 직전 메뉴를 그대로 뒀다는 뜻.
  async upsertRestaurantFromCrawl(
    data: NaverPlaceDataType,
  ): Promise<{ id: string; keptMenuCount: number }> {
    const imageUrls = await this.persistVolatilePhotos(data.placeId, data.imageUrls);
    const { visitorReviews: _ignored, ...rest } = data;
    // 메뉴 0건으로 기존 메뉴를 덮지 않는다 — 2026-09 네이버 메뉴 구조 개편 때 파싱이
    // 조용히 0건이 되면서 재크롤마다 메뉴가 지워졌다. 메뉴를 전부 내린 가게는 드물고,
    // 그 경우 크롤 로그 경고로 드러난다.
    // 메뉴판 사진도 같은 원칙 — 응답에 필드가 없던 크롤(undefined)은 직전 값을 둔다. 빈 배열은 사진을 내린 것이라 그대로.
    // 같은 주소의 사진은 직전 읽기 결과를 이어받고, 등록 메뉴와의 짝(menuBoardMenus)은 매번 다시 계산한다.
    const previous =
      rest.menus.length === 0 || rest.menuBoardImages === undefined || rest.menuBoardImages.length > 0
        ? await this.findPreviousNaverSnapshot(data.placeId)
        : null;
    const keptMenus =
      rest.menus.length === 0 && Array.isArray(previous?.menus) && previous.menus.length > 0
        ? { menus: previous.menus, menuGroups: previous.menuGroups }
        : null;
    const boards = this.menuBoardFields(
      keptMenus?.menus ?? rest.menus,
      rest.menuBoardImages === undefined
        ? previous?.menuBoardImages
        : carryMenuBoardReads(rest.menuBoardImages, previous?.menuBoardImages),
    );
    const snapshotJson = JSON.stringify({ ...rest, imageUrls, ...keptMenus, ...boards });
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
    if (data.menuGroups && data.menuGroups.length > 0) {
      await this.replaceRestaurantMenuGroups(r.id, data.menuGroups).catch((err) => {
        // The snapshot still carries menuGroups. Keep old crawl/write paths
        // working even if a local DB has not applied the additive migration yet.
        // eslint-disable-next-line no-console
        console.warn('[restaurant-menu] normalized menu write skipped', err);
      });
    }
    invalidatePublicRestaurantCache();
    return { id: r.id, keptMenuCount: keptMenus?.menus.length ?? 0 };
  }

  // 메뉴 백필(backfill:naver-menus) — 스냅샷의 menus/menuGroups 만 바꾸고 나머지
  // 필드·리뷰는 건드리지 않는다. 0건은 쓰지 않는다(크롤 upsert 와 같은 보호).
  // extra.menuBoardImages 를 주면(응답에 필드가 있었으면) 메뉴판 사진도 바꾼다 — 같은 주소는 읽기 결과를 이어받고,
  // 등록 메뉴와의 짝은 새 메뉴로 다시 계산한다.
  async updateNaverMenus(
    placeId: string,
    menus: NaverPlaceDataType['menus'],
    menuGroups: NonNullable<NaverPlaceDataType['menuGroups']>,
    extra: {
      menuBoardImages?: NaverPlaceDataType['menuBoardImages'] | null;
      menuUpdatedOn?: string | null;
    } = {},
  ): Promise<{ id: string } | null> {
    if (menus.length === 0) return null;
    const row = await this.prisma.restaurant.findUnique({
      where: { source_sourceId: { source: 'naver', sourceId: placeId } },
      select: { id: true, snapshotJson: true },
    });
    if (!row) return null;
    const snap = JSON.parse(row.snapshotJson) as Partial<NaverPlaceDataType>;
    const boards = this.menuBoardFields(
      menus,
      extra.menuBoardImages
        ? carryMenuBoardReads(extra.menuBoardImages, snap.menuBoardImages)
        : snap.menuBoardImages,
    );
    await this.prisma.restaurant.update({
      where: { id: row.id },
      data: {
        snapshotJson: JSON.stringify({
          ...snap,
          menus,
          menuGroups,
          ...boards,
          ...(extra.menuUpdatedOn !== undefined ? { menuUpdatedOn: extra.menuUpdatedOn } : {}),
        }),
      },
    });
    if (menuGroups.length > 0) {
      await this.replaceRestaurantMenuGroups(row.id, menuGroups).catch((err) => {
        console.warn('[restaurant-menu] normalized menu write skipped', err);
      });
    }
    return { id: row.id };
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
    invalidatePublicRestaurantCache();
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
    invalidatePublicRestaurantCache();
    return r;
  }

  // 미입점 place(/place/:objectId, JSON-LD) → Restaurant upsert. 얕은 좌표·메타
  // 티어. partner 와 구분되게 sourceId='place:<objectId>' prefix 로 둔다(같은
  // source='tabling' 안에서 idx 와 충돌 방지).
  async upsertRestaurantFromTablingPlace(data: TablingPlaceDataType): Promise<{ id: string }> {
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
    invalidatePublicRestaurantCache();
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
    invalidatePublicRestaurantCache();
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
    invalidatePublicRestaurantCache();
    return { deletedReviewCount: r._count.visitorReviews };
  }

  // List view — 모든 source 의 Restaurant 를 canonical 단위로 그룹화. 한 행은
  // "같은 가게" 1개에 해당하고, 그 안에 sources 배열로 출처별 행이 들어간다.
  // 통합 카운트(분석 평균 등)는 sources 의 가중평균.
  //
  // 페이징/정렬: canonical 집계가 sources 합산이므로 정렬 키(만족도/긍정/부정비율)
  // 를 DB SQL 하나로 빼기 어렵다 — 메타데이터로 검색 대상을 먼저 좁힌 뒤 해당
  // canonical 의 집계+후보매칭을 계산하고 메모리에서 정렬·slice 한다. 후보매칭은
  // 검색 결과와 무관하게 전역 canonical 기준으로 유지한다.
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

    // 공백으로 나눈 토큰은 AND, 각 토큰은 통합명/출처별 이름·카테고리·식별자 중
    // 어느 필드에서든 부분 일치하면 된다. canonical 단위 검색 문자열을 먼저
    // 만들기 때문에 한 source 가 검색에 걸리면 그 canonical 의 형제 source 도
    // 집계와 응답에 모두 남는다.
    const searchTokens = (query.q ?? '')
      .normalize('NFKC')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    let selectedRows = rows;
    if (searchTokens.length > 0) {
      const searchablePartsByCanonical = new Map<string, string[]>();
      for (const r of rows) {
        const parts = searchablePartsByCanonical.get(r.canonicalId) ?? [
          r.canonicalId,
          r.canonical.name,
          r.canonical.primaryCategory ?? '',
        ];
        parts.push(r.id, r.sourceId, r.placeId ?? '', r.name, r.category ?? '');
        searchablePartsByCanonical.set(r.canonicalId, parts);
      }

      const matchedCanonicalIds = new Set<string>();
      for (const [canonicalId, parts] of searchablePartsByCanonical) {
        const searchable = parts.join(' ').normalize('NFKC').toLowerCase();
        if (searchTokens.every((token) => searchable.includes(token))) {
          matchedCanonicalIds.add(canonicalId);
        }
      }
      if (matchedCanonicalIds.size === 0) {
        return { items: [], total: 0, limit: query.limit, offset: query.offset };
      }
      selectedRows = rows.filter((r) => matchedCanonicalIds.has(r.canonicalId));
    }

    const ids = selectedRows.map((r) => r.id);

    // ReviewSummary 원본을 애플리케이션으로 가져오지 않고 DB 에서 식당별로 집계한다(500개씩 IN,
    // 커버링 인덱스). queued/pending 은 기존 카드 의미대로 pending 에 합산한다. 요약이 없는 가게는 빈 버킷.
    const byRestaurant = await aggregateSummaryBuckets(this.prisma, ids);

    // canonicalId → 그 canonical 에 매달린 source 행들. rows 는 lastCrawledAt
    // desc 정렬이라 sources 도 자동으로 최근순.
    const byCanonical = new Map<
      string,
      { canonical: (typeof rows)[number]['canonical']; sources: RestaurantSourceSummaryType[] }
    >();
    for (const r of selectedRows) {
      const b = byRestaurant.get(r.id) ?? emptySummaryBucket();
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
    const shapeById = new Map<string, CanonShape>();
    for (const r of rows) {
      const shape = shapeById.get(r.canonicalId);
      if (shape) {
        shape.sourceSet.add(r.source);
      } else {
        shapeById.set(r.canonicalId, {
          id: r.canonical.id,
          name: r.canonical.name,
          primaryCategory: r.canonical.primaryCategory,
          latitude: r.canonical.latitude,
          longitude: r.canonical.longitude,
          sourceSet: new Set([r.source]),
        });
      }
    }
    const canonShapes = [...shapeById.values()];
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

  // 공개 맛집 지도/리스트 페이지가 호출하는 리스트. 어드민 list() 와는 응답 셋이 다르다 — 좌표·도로명·
  // 대표 이미지가 들어가고 운영 메타(요약 진행 상태/실패 카운트 등)는 빠진다.
  //
  // 필터 전 전체(네이버 가게 + 같은 canonical 의 다이닝코드·테이블링 형제까지 합산한 리뷰/요약 수 +
  // 여행로그 요약)는 restaurant-public-base 의 공유 캐시를 쓰고, 여기서는 q·category·bbox·정렬·페이지만
  // 메모리에서 한다. 응답 행은 네이버 placeId 키 — 라우팅/캐시/UI 가 placeId 에 의존한다.
  async getPublicList(
    query: RestaurantPublicListQueryType,
  ): Promise<RestaurantPublicListResultType> {
    const base = await getPublicRestaurantBase(this.prisma);
    let rows = base.rows;
    // 예전 name/category LIKE '%q%' 와 같은 의미(SQLite LIKE 는 ASCII 만 대소문자 무시).
    if (query.q && query.q.length > 0) {
      const q = foldAscii(query.q);
      rows = rows.filter((r) => r.nameFold.includes(q) || r.categoryFold.includes(q));
    }
    if (query.category && query.category.length > 0) {
      const category = foldAscii(query.category);
      rows = rows.filter((r) => r.categoryFold.includes(category));
    }
    // map 이 새 배열이라 아래 정렬이 캐시를 건드리지 않는다.
    let items = rows.map((r) => r.item);
    if (query.bbox) {
      const parts = query.bbox.split(',').map(Number);
      // bbox 가 무효(NaN) 이면 무시하고 전체 통과 — Zod regex 통과한 입력이라
      // 정상 파싱되지만 방어적으로 length·finite 체크.
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        const [minLng, minLat, maxLng, maxLat] = parts as [number, number, number, number];
        items = items.filter(
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
    items.sort(pickPublicSort(query.sort));
    return { items: items.slice(query.offset, query.offset + query.limit), total: items.length };
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
  // 공개 메뉴명만 — 메뉴 칼로리 판정(food/menu-nutrition.service)용. getPublicDetail 과 같은
  // 소스 융합 규칙(mergeMenus/mergeMenuGroups)을 쓰되 리뷰·요약은 싣지 않는다.
  async getPublicMenuNames(placeId: string): Promise<string[] | null> {
    const naverRow = await this.prisma.restaurant.findUnique({
      where: { placeId },
      select: { canonicalId: true, snapshotJson: true },
    });
    if (!naverRow) return null;
    const [dcRow, tbRow] = await Promise.all([
      this.prisma.restaurant.findFirst({
        where: { canonicalId: naverRow.canonicalId, source: 'diningcode' },
        select: { snapshotJson: true },
      }),
      this.prisma.restaurant.findFirst({
        where: {
          canonicalId: naverRow.canonicalId,
          source: 'tabling',
          NOT: { sourceId: { startsWith: 'place:' } },
        },
        select: { snapshotJson: true },
      }),
    ]);
    const naverSnap = JSON.parse(naverRow.snapshotJson) as Omit<
      NaverPlaceDataType,
      'visitorReviews'
    >;
    const dcSnap = dcRow
      ? (JSON.parse(dcRow.snapshotJson) as Omit<DiningcodeShopDataType, 'reviewsFirstPage'>)
      : null;
    const tbSnap = tbRow ? (JSON.parse(tbRow.snapshotJson) as TablingSnapshot) : null;
    const names = new Set<string>();
    for (const m of mergeMenus(naverSnap, dcSnap, tbSnap)) names.add(m.name);
    for (const g of mergeMenuGroups(naverSnap, dcSnap, tbSnap)) {
      for (const m of g.menus) names.add(m.name);
    }
    return [...names];
  }

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
    const store = await getRestaurantStoreInfo(this.prisma, naverRow.canonicalId);
    const tour = await getRestaurantTourSummary(this.prisma, naverRow.canonicalId);
    const menuBoard = toPublicMenuBoard(naverSnap);

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
      menuGroups: mergeMenuGroups(naverSnap, dcSnap, tbSnap),
      ...(menuBoard ? { menuBoard } : {}),
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
      storedReviewCount: computeStoredReviewCount(naverReviewCount, dcReviewCount, tbReviewCount),
      diningcode: dcSnap ? composeDiningcodeAddon(dcSnap) : null,
      tabling: tbSnap ? composeTablingAddon(tbSnap) : null,
      store,
      tour,
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
    filtered = await this.filterReviewsByTipMenu(filtered, assembled.naverRow.id, query);

    if (query.sort === 'rating') {
      // 별점 desc. 별점 null 은 0 으로 떨어져 뒤로 밀린다. 같은 별점에서는
      // assemblePublicReviews 의 방문일 최신순이 stable sort 로 유지된다.
      filtered = [...filtered].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    }
    // recent 는 assemblePublicReviews 에서 방문일 desc(수집일 desc 폴백) 정렬됨.

    return {
      items: filtered.slice(query.offset, query.offset + query.limit),
      total: filtered.length,
    };
  }

  // 어드민 상세 리뷰 탭의 팁·메뉴 필터 — 공개 리뷰 목록과 같은 매칭(filterReviewsByTipMenu)
  // 으로 걸린 리뷰 id 만 돌려준다. 어드민은 출처 통합 리뷰를 전부 들고 있어 id 로 거른다.
  // 식당이 없으면 null.
  async getReviewMatchIds(
    placeId: string,
    query: RestaurantReviewMatchQueryType,
  ): Promise<RestaurantReviewMatchResultType | null> {
    const assembled = await this.assemblePublicReviews(placeId);
    if (!assembled) return null;
    const matched = await this.filterReviewsByTipMenu(
      assembled.reviews,
      assembled.naverRow.id,
      query,
    );
    return { reviewIds: matched.map((r) => r.id) };
  }

  // 팁·메뉴 필터 — 공개 리뷰 목록(getPublicReviews)과 어드민 리뷰 매칭(getReviewMatchIds)이
  // 같은 규칙을 쓰도록 한 곳에 둔다. 분석 없는 리뷰는 둘 다 자동 제외된다.
  private async filterReviewsByTipMenu(
    reviews: PublicVisitorReviewType[],
    naverRestaurantId: string,
    query: { tip?: string; menu?: string },
  ): Promise<PublicVisitorReviewType[]> {
    let filtered = reviews;

    // 방문 팁 필터 — topTips 집계와 동일한 termNorm 정확 일치. 클릭한 팁이
    // 분석에 달린 리뷰만 남긴다.
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
      const menu = query.menu;
      const canonicals = await this.prisma.menuCanonical.findMany({
        where: { restaurantId: naverRestaurantId },
        select: { nameNorm: true, canonicalName: true, canonicalNorm: true },
      });
      const canonByNorm = new Map(canonicals.map((c) => [c.nameNorm, c.canonicalNorm]));
      const canonicalNameToNorm = new Map(
        canonicals.map((c) => [c.canonicalName, c.canonicalNorm]),
      );
      const groupKey = (name: string) =>
        canonByNorm.get(normalizeTerm(name)) ?? normalizeTerm(name);
      const want = canonicalNameToNorm.get(menu) ?? normalizeTerm(menu);
      filtered = filtered.filter(
        (r) => r.analysis?.menus.some((m) => groupKey(m.name) === want) ?? false,
      );
    }

    return filtered;
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

  // 세 source 의 reviews 를 합쳐 실제 방문일 최신순으로 돌려준다. Naver의
  // `M.D.요일`처럼 연도가 빠진 값은 fetchedAt의 KST 연도로 복원하고, 방문일을
  // 해석할 수 없는 출처만 fetchedAt desc로 폴백한다. 이 기준을 쓰지 않으면
  // update 모드로 새로 수집한 리뷰가 최초 크롤 배치 뒤에 숨는다.
  // getPublicDetail 과 getPublicReviews 가 공유. 반환 타입은 inferred —
  // Prisma 의 visitorReviews + summary include 형태가 호출자에 그대로 노출됨.
  private async assemblePublicReviews(placeId: string) {
    const naverRow = await this.prisma.restaurant.findUnique({
      where: { placeId },
      include: {
        visitorReviews: { orderBy: { fetchedAt: 'desc' }, select: PUBLIC_REVIEW_SELECT },
      },
    });
    if (!naverRow) return null;

    const dcRow = await this.prisma.restaurant.findFirst({
      where: { canonicalId: naverRow.canonicalId, source: 'diningcode' },
      include: {
        visitorReviews: { orderBy: { fetchedAt: 'desc' }, select: PUBLIC_REVIEW_SELECT },
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
        visitorReviews: { orderBy: { fetchedAt: 'desc' }, select: PUBLIC_REVIEW_SELECT },
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
    const reviews: PublicVisitorReviewType[] = [...naverReviews, ...dcReviews, ...tbReviews].sort(
      compareReviewRecencyDesc,
    );

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
  // 네이버 가게 자신의 done 감정 분포(형제 합산 없음)는 공유 베이스(SQL 집계, TTL 30s)에 있다.
  // minMentions·excludeNeutral·sort 는 요청마다 메모리에서 거르고 정렬한다(가게 수백~수천 행, 1ms 대).
  // mixed 는 분포에 넣지 않는다(긍정/부정 비율 정의가 모호해짐).
  async getRanking(query: RestaurantRankingQueryType): Promise<RestaurantRankingResultType> {
    const base = await getPublicRestaurantBase(this.prisma);
    const rows: Array<{
      placeId: string;
      name: string;
      category: string | null;
      positiveCount: number;
      negativeCount: number;
      neutralCount: number;
      totalMentions: number;
      score: number;
    }> = [];
    for (const r of base.rows) {
      const b = r.own;
      const total = b.positive + b.negative + b.neutral;
      if (total === 0 || total < query.minMentions) continue;
      const denom = query.excludeNeutral ? b.positive + b.negative : total;
      if (denom === 0) continue;
      rows.push({
        placeId: r.item.placeId,
        name: r.item.name,
        category: r.item.category,
        positiveCount: b.positive,
        negativeCount: b.negative,
        neutralCount: b.neutral,
        totalMentions: total,
        score: (query.sort === 'positive' ? b.positive : b.negative) / denom,
      });
    }
    // 점수 desc, 동률은 표본 큰 식당 우선, 그 다음 이름 asc 로 안정화.
    rows.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.totalMentions !== a.totalMentions) return b.totalMentions - a.totalMentions;
      return a.name.localeCompare(b.name);
    });
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
        name: true,
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
    const points: RegionStatsResultType['points'] = [];

    for (const c of canonicals) {
      const region = deriveRegion(pickAddress(c.restaurants), c.latitude, c.longitude);

      // 지도 포인트 — 좌표 있는 가게만. 파생 지역은 색칠/필터용(없으면 null).
      if (c.latitude !== null && c.longitude !== null) {
        points.push({
          name: c.name,
          lat: c.latitude,
          lng: c.longitude,
          sido: region?.sido ?? null,
          sigungu: region?.sigungu ?? null,
        });
      }

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
    return { total, unclassified, sidos, points };
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

  // 어드민 상세. 식별·스칼라 필드와 스냅샷은 네이버 행, 리뷰·출처는 같은 canonical 에 묶인
  // 모든 행(다이닝코드·테이블링 포함)을 합친다 — 공개 상세는 세 출처를 융합해 보여 주는데
  // 어드민이 네이버 리뷰만 보면 다른 출처 리뷰와 그 요약 실패를 운영자가 볼 방법이 없다.
  async getDetailByPlaceId(placeId: string): Promise<RestaurantDetailType | null> {
    const r = await this.prisma.restaurant.findUnique({ where: { placeId } });
    if (!r) return null;

    // 방문일 파싱 불가 리뷰의 폴백 순서도 최신 수집 우선이 되게 DB에서 먼저 desc로
    // 읽고, 아래 공용 비교 함수로 실제 방문일을 최종 정렬한다. 행은 최근 수집순.
    const rows = await this.prisma.restaurant.findMany({
      where: { canonicalId: r.canonicalId },
      orderBy: { lastCrawledAt: 'desc' },
      include: {
        visitorReviews: { orderBy: { fetchedAt: 'desc' }, select: ADMIN_REVIEW_SELECT },
      },
    });

    const snapshot = JSON.parse(r.snapshotJson) as Omit<NaverPlaceDataType, 'visitorReviews'>;

    const reviews: AdminVisitorReviewType[] = [];
    const sources: RestaurantSourceSummaryType[] = [];
    for (const row of rows) {
      // 출처별 카운트 — 어드민 목록(list)의 집계 SQL 과 같은 의미: queued 는 pending 에
      // 합산, cancelled 는 어느 버킷에도 안 넣고, 감정·평균은 done 행만.
      let pending = 0;
      let running = 0;
      let done = 0;
      let failed = 0;
      const sentiment = { positive: 0, negative: 0, neutral: 0, mixed: 0 };
      let sentSum = 0;
      let sentN = 0;
      let satSum = 0;
      let satN = 0;
      for (const v of row.visitorReviews) {
        const s = v.summary;
        reviews.push({
          authorName: v.authorName,
          rating: v.rating,
          body: v.body,
          visitedAt: v.visitedAt,
          imageUrls: safeParseStringArray(v.imageUrlsJson),
          videos: safeParseVideos(v.videosJson),
          id: v.id,
          externalId: v.externalId,
          fetchedAt: v.fetchedAt.toISOString(),
          source: row.source,
          restaurantId: row.id,
          summary: s
            ? {
                status: s.status as ReviewSummaryStatusType,
                text: s.text,
                model: s.model,
                errorCode: s.errorCode,
                errorMessage: s.errorMessage,
                startedAt: s.startedAt?.toISOString() ?? null,
                finishedAt: s.finishedAt?.toISOString() ?? null,
                sentiment: (s.sentiment as ReviewSentimentType | null) ?? null,
                sentimentScore: s.sentimentScore,
                satisfactionScore: s.satisfactionScore,
                menus: safeParseMenus(s.menusJson),
                tips: safeParseStringArrayNullable(s.tipsJson),
                keywords: safeParseStringArrayNullable(s.keywordsJson),
              }
            : null,
        });
        if (!s) continue;
        if (s.status === 'queued' || s.status === 'pending') pending += 1;
        else if (s.status === 'running') running += 1;
        else if (s.status === 'failed') failed += 1;
        else if (s.status === 'done') {
          done += 1;
          if (
            s.sentiment === 'positive' ||
            s.sentiment === 'negative' ||
            s.sentiment === 'neutral' ||
            s.sentiment === 'mixed'
          ) {
            sentiment[s.sentiment] += 1;
          }
          if (s.sentimentScore !== null) {
            sentSum += s.sentimentScore;
            sentN += 1;
          }
          if (s.satisfactionScore !== null) {
            satSum += s.satisfactionScore;
            satN += 1;
          }
        }
      }
      sources.push({
        restaurantId: row.id,
        source: row.source,
        sourceId: row.sourceId,
        placeId: row.placeId,
        name: row.name,
        category: row.category,
        rating: row.rating,
        reviewCount: row.reviewCount,
        rawSourceUrl: row.rawSourceUrl,
        firstCrawledAt: row.firstCrawledAt.toISOString(),
        lastCrawledAt: row.lastCrawledAt.toISOString(),
        totalReviews: row.visitorReviews.length,
        summaryPending: pending,
        summaryRunning: running,
        summaryDone: done,
        summaryFailed: failed,
        avgSentimentScore: sentN > 0 ? sentSum / sentN : null,
        avgSatisfactionScore: satN > 0 ? satSum / satN : null,
        positiveCount: sentiment.positive,
        negativeCount: sentiment.negative,
        neutralCount: sentiment.neutral,
        mixedCount: sentiment.mixed,
      });
    }
    reviews.sort(compareReviewRecencyDesc);
    // 이 상세의 기준(네이버) 행을 맨 앞에 — 나머지는 최근 수집순 그대로(stable sort).
    sources.sort((a, b) => Number(b.restaurantId === r.id) - Number(a.restaurantId === r.id));

    return {
      id: r.id,
      // placeId 로 findUnique 했으니 non-null.
      placeId: r.placeId!,
      canonicalId: r.canonicalId,
      name: r.name,
      category: r.category,
      address: r.address,
      phone: r.phone,
      rating: r.rating,
      reviewCount: r.reviewCount,
      rawSourceUrl: r.rawSourceUrl,
      firstCrawledAt: r.firstCrawledAt.toISOString(),
      lastCrawledAt: r.lastCrawledAt.toISOString(),
      // 리뷰는 reviews 한 곳에만 — 스냅샷에 같은 목록을 복제하면 응답만 두 배가 된다.
      snapshot: { ...snapshot, visitorReviews: [] },
      reviews,
      sources,
      store: await getRestaurantStoreInfo(this.prisma, r.canonicalId),
      tour: await getRestaurantTourMatchInfo(this.prisma, r.canonicalId),
    };
  }

  // 가중 랜덤 픽. 가중치는 strategy에 따라 계산되며 모두 0~1 범위로
  // 정규화된다. 가중치가 0인(분석 안 된) 후보는 자동으로 배제 — 즉
  // "AI가 평가한 곳" 중에서만 고른다. 후보가 없거나 가중치 합이 0이면
  // picked=null. 단순 랜덤(=PicksService.random)은 picks 도메인이 이미
  // 제공하므로 여기에는 분석 기반 픽만 둔다.
  async smartPick(input: RestaurantSmartPickInputType): Promise<RestaurantSmartPickResultType> {
    const strategy = input.strategy;
    // 공개 픽도 네이버 전용 — 응답 picked.placeId 가 string. 후보·여행로그·네이버 행 자신의 done
    // 점수 합은 공유 베이스(SQL 집계, TTL 30s)에서 읽는다 — 무인증 경로라 요청마다 전 가게 요약을
    // 읽던 비용(운영형 1.1~1.4s, 동시 10건 RSS 1.5GB)을 없앴다.
    const base = await getPublicRestaurantBase(this.prisma);
    let restaurants = base.rows;
    if (input.candidatePlaceIds && input.candidatePlaceIds.length > 0) {
      const wanted = new Set(input.candidatePlaceIds);
      restaurants = restaurants.filter((r) => wanted.has(r.item.placeId));
    }

    if (restaurants.length === 0) {
      return { picked: null, candidates: 0, strategy };
    }

    const weighted = restaurants
      .map((r) => {
        const a = r.own;
        const sentAvg = a.sentN > 0 ? a.sentSum / a.sentN : null;
        const satAvg = a.satN > 0 ? a.satSum / a.satN : null;
        // 정규화: sentiment -1~1 → 0~1, satisfaction 1~5 → 0~1, 여행자 보정 만족도 1~5 → 0~1.
        const sentNorm = sentAvg === null ? null : (sentAvg + 1) / 2;
        const satNorm = satAvg === null ? null : (satAvg - 1) / 4;
        // 여행로그 보정 만족도(매칭된 가게만) — 리뷰 분석이 없는 가게도 이 항으로 후보에 든다.
        const tourScore = r.item.tour?.bayesScore ?? null;
        const tourNorm = travelerWeight(tourScore);
        let weight: number;
        if (strategy === 'satisfaction') {
          weight = satNorm ?? 0;
        } else if (strategy === 'positive') {
          weight = sentNorm ?? 0;
        } else if (strategy === 'traveler') {
          weight = tourNorm ?? 0;
        } else {
          // balanced: 있는 점수들의 평균, 하나도 없으면 0.
          const parts = [sentNorm, satNorm, tourNorm].filter((v): v is number => v !== null);
          weight = parts.length === 0 ? 0 : parts.reduce((a, b) => a + b, 0) / parts.length;
        }
        return {
          placeId: r.item.placeId,
          name: r.item.name,
          weight,
          avgSentimentScore: sentAvg,
          avgSatisfactionScore: satAvg,
          avgTravelerScore: tourScore,
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
  // 여행로그 — 매칭 없는 행(tour=null)은 뒤로. 동률은 방문자 수.
  if (sort === 'tourTravelers') {
    return nullsLast(
      (a, b) => (b.tour?.nTravelers ?? 0) - (a.tour?.nTravelers ?? 0),
      (it) => it.tour?.nTravelers ?? null,
    );
  }
  if (sort === 'tourScore') {
    return nullsLast(
      (a, b) => (b.tour?.bayesScore ?? 0) - (a.tour?.bayesScore ?? 0) || (b.tour?.nTravelers ?? 0) - (a.tour?.nTravelers ?? 0),
      (it) => it.tour?.bayesScore ?? null,
    );
  }
  // rating
  return nullsLast(
    (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
    (it) => it.rating,
  );
};

