import { z } from 'zod';
import { StartCrawlResult } from './crawl.js';

// 여행로그(AI 허브 71780) — 2차: 관리자 시드 콘솔 계약. 공개 집계 계약은 4차에서 이 파일에 합류한다.
// 원본 행(개별 여행·방문)은 어디에도 없다 — 시드 목록은 장소(TourPlace) 단위 집계와 매칭·폐업 상태뿐.
// 계획·이용조건: docs/PLAN-tour-log.md

export const TourRegion = z.enum(['jeju', 'all']);
export type TourRegionType = z.infer<typeof TourRegion>;

// 국세청 사업자 상태 — '' 로 오는 미등록 번호는 unknown.
export const TourBizStatusKind = z.enum(['계속사업자', '휴업자', '폐업자', 'unknown']);
export type TourBizStatusKindType = z.infer<typeof TourBizStatusKind>;

export const TourSeedBiz = z.object({
  brno: z.string(),
  bStt: TourBizStatusKind,
  // 폐업일 'YYYY-MM-DD'(폐업자만).
  endDt: z.string().nullable(),
  checkedAt: z.string(),
});
export type TourSeedBizType = z.infer<typeof TourSeedBiz>;

export const TourSeedMatch = z.object({
  canonicalId: z.string(),
  // 매칭된 맛집의 네이버 placeId — 어드민 식당 상세 링크용(네이버 행이 없으면 null).
  naverPlaceId: z.string().nullable(),
  restaurantName: z.string().nullable(),
  distM: z.number().int(),
  nameScore: z.number(),
  status: z.enum(['matched', 'missing']),
});
export type TourSeedMatchType = z.infer<typeof TourSeedMatch>;

export const TourSeedItem = z.object({
  placeId: z.string(),
  name: z.string(),
  typeShort: z.string(),
  roadAddr: z.string().nullable(),
  sigungu: z.string().nullable(),
  emd: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  poiId: z.string().nullable(),
  nTravelers: z.number().int(),
  nVisits: z.number().int(),
  nRated: z.number().int(),
  bayesScore: z.number().nullable(),
  spendPpMedian: z.number().nullable(),
  match: TourSeedMatch.nullable(),
  biz: TourSeedBiz.nullable(),
});
export type TourSeedItemType = z.infer<typeof TourSeedItem>;

export const TourSeedStatusFilter = z.enum(['all', 'unmatched', 'matched', 'closed']);
export type TourSeedStatusFilterType = z.infer<typeof TourSeedStatusFilter>;

export const TourSeedQuery = z.object({
  region: TourRegion.default('jeju'),
  minTravelers: z.coerce.number().int().min(1).max(1000).default(5),
  status: TourSeedStatusFilter.default('all'),
  q: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type TourSeedQueryType = z.infer<typeof TourSeedQuery>;

export const TourSeedList = z.object({
  items: z.array(TourSeedItem),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export type TourSeedListType = z.infer<typeof TourSeedList>;

// 네이버 검색 후보 — 크롤 검색 결과에 여행로그 장소 기준 거리·상호 점수·수락 여부·등록 여부를 얹는다.
export const TourSeedCandidate = z.object({
  placeId: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  address: z.string().nullable(),
  roadAddress: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  thumbnailUrl: z.string().nullable(),
  reviewCount: z.number().int().nullable(),
  rawSourceUrl: z.string(),
  distM: z.number().int().nullable(),
  nameScore: z.number(),
  // 매칭 규칙(100m·0.5 / 완전일치 300m)을 통과하는 후보.
  accepted: z.boolean(),
  registered: z.boolean(),
});
export type TourSeedCandidateType = z.infer<typeof TourSeedCandidate>;

export const TourSeedDiscoverResult = z.object({
  tourPlaceId: z.string(),
  query: z.string(),
  candidates: z.array(TourSeedCandidate),
  source: z.enum(['http', 'playwright']),
});
export type TourSeedDiscoverResultType = z.infer<typeof TourSeedDiscoverResult>;

export const TourSeedRegisterBody = z.object({
  rawSourceUrl: z.string().url(),
});
export type TourSeedRegisterBodyType = z.infer<typeof TourSeedRegisterBody>;

export const TourSeedRegisterResult = z.object({
  tourPlaceId: z.string(),
  start: StartCrawlResult,
});
export type TourSeedRegisterResultType = z.infer<typeof TourSeedRegisterResult>;

export const TourMatchRunResult = z.object({
  scanned: z.number().int(),
  created: z.number().int(),
  rematched: z.number().int(),
  kept: z.number().int(),
  newlyMissing: z.number().int(),
  stillMissing: z.number().int(),
  recovered: z.number().int(),
  unmatched: z.number().int(),
  durationMs: z.number().int(),
});
export type TourMatchRunResultType = z.infer<typeof TourMatchRunResult>;

export const TourBizCheckBody = z.object({
  // 국세청 API 호출 상한(100 사업자번호/콜).
  maxCalls: z.number().int().min(1).max(50).default(10),
  minTravelers: z.number().int().min(1).max(1000).default(3),
  region: TourRegion.default('jeju'),
  // true 면 30일 안에 조회한 장소도 다시.
  force: z.boolean().default(false),
});
export type TourBizCheckBodyType = z.infer<typeof TourBizCheckBody>;

export const TourBizCheckResult = z.object({
  // 사업자번호가 있는 대상 장소 / 이번에 조회가 필요한 장소 / 실제 호출 수 / 갱신한 장소.
  candidates: z.number().int(),
  pending: z.number().int(),
  calls: z.number().int(),
  checked: z.number().int(),
  byStatus: z.object({
    open: z.number().int(),
    suspended: z.number().int(),
    closed: z.number().int(),
    unknown: z.number().int(),
  }),
  stopped: z.enum(['done', 'maxCalls', 'auth', 'quota', 'error']),
  error: z.string().nullable(),
});
export type TourBizCheckResultType = z.infer<typeof TourBizCheckResult>;

export const TourAdminStatus = z.object({
  loaded: z.boolean(),
  places: z.number().int(),
  baseDate: z.string().nullable(),
  sourceFile: z.string().nullable(),
  loadedAt: z.string().nullable(),
  counts: z.record(z.string(), z.number().int()),
  match: z.object({
    matched: z.number().int(),
    missing: z.number().int(),
    // 매칭 대상(좌표 있고 식당 행이 1개 이상인 canonical).
    candidates: z.number().int(),
  }),
  biz: z.object({
    checked: z.number().int(),
    open: z.number().int(),
    suspended: z.number().int(),
    closed: z.number().int(),
    unknown: z.number().int(),
    lastCheckedAt: z.string().nullable(),
    keyConfigured: z.boolean(),
  }),
  seeds: z.object({
    // 제주 식당류(식당·상업·상점) 장소 수와 방문자 5/3명 이상, 그중 미매칭(5명 이상).
    restaurantsJeju: z.number().int(),
    t5: z.number().int(),
    t3: z.number().int(),
    unmatchedT5: z.number().int(),
  }),
  thumbsDir: z.string().nullable(),
  thumbsExists: z.boolean(),
});
export type TourAdminStatusType = z.infer<typeof TourAdminStatus>;
