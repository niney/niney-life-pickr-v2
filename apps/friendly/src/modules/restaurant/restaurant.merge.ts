// 공개 식당 상세를 만들 때 Naver + 다이닝코드 두 출처를 융합하는 순수 함수
// 모음. 모든 함수는 DB 의존 없는 pure — service 가 row 두 개를 읽은 뒤
// 파싱된 데이터만 넘겨 호출한다. 단위 테스트가 쉬워지는 이점.
//
// 머지 규칙은 어드민과 합의된 "필드별 하드코딩":
//   rating / reviewCount    → Naver, else DC (단 UI 는 sources 분리값 우선)
//   phone / address         → Naver, else DC
//   businessHours           → DC summary 있으면 그것, else Naver text
//   menus                   → Naver 가 비었을 때만 DC
//   photos                  → Naver + DC 합쳐서 URL dedup
//   reviews                 → 두 출처 모두 합쳐서 fetchedAt desc
//   descTags/facilities/scoreDetail/wordcloud  → DC 전용 → 항상 노출
import type {
  BlogReviewType,
  DiningcodeShopDataType,
  MenuItemType,
  NaverPlaceDataType,
  PublicDiningcodeAddonType,
  PublicSourcesType,
  PublicStoredReviewCountType,
} from '@repo/api-contract';

// snapshotJson 은 *Reviews 를 제거한 상태로 저장돼 있으므로 머지 함수가
// 보는 타입도 그 형태 그대로.
export type NaverSnapshot = Omit<NaverPlaceDataType, 'visitorReviews'>;
export type DiningcodeSnapshot = Omit<DiningcodeShopDataType, 'reviewsFirstPage'>;

// 두 행을 함께 보고 머지를 수행해야 하는 함수가 많아 service 의 Restaurant
// 모델에서 필요한 컬럼만 좁힌 형태. canonicalId 까지 받지는 않지만 placeId/
// rawSourceUrl 같이 row 컬럼이 우선 의미를 가질 때 사용.
export interface MergeRestaurantRow {
  name: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  rating: number | null;
  reviewCount: number | null;
  rawSourceUrl: string;
}

// ── 스칼라 필드 머지 ────────────────────────────────────────────────────────

export const mergeName = (
  naver: MergeRestaurantRow | null,
  dc: DiningcodeSnapshot | null,
): string => {
  if (naver) return naver.name;
  if (dc) return dc.fullName;
  return '';
};

export const mergeCategory = (
  naver: MergeRestaurantRow | null,
  dc: DiningcodeSnapshot | null,
): string | null => {
  if (naver?.category) return naver.category;
  if (dc && dc.categories.length > 0) return dc.categories.join(' · ');
  return null;
};

export const mergeAddress = (
  naverRow: MergeRestaurantRow | null,
  naverSnap: NaverSnapshot | null,
  dcSnap: DiningcodeSnapshot | null,
): { address: string | null; roadAddress: string | null } => {
  const address = naverRow?.address ?? dcSnap?.address ?? null;
  const roadAddress = naverSnap?.roadAddress ?? dcSnap?.roadAddress ?? null;
  return { address, roadAddress };
};

export const mergePhone = (
  naverRow: MergeRestaurantRow | null,
  dcSnap: DiningcodeSnapshot | null,
): string | null => naverRow?.phone ?? dcSnap?.phone ?? null;

export const mergeCoordinates = (
  naverSnap: NaverSnapshot | null,
  dcSnap: DiningcodeSnapshot | null,
): { latitude: number | null; longitude: number | null } => {
  const latitude = naverSnap?.latitude ?? dcSnap?.lat ?? null;
  const longitude = naverSnap?.longitude ?? dcSnap?.lng ?? null;
  return { latitude, longitude };
};

// 단일 string 으로 표현되는 영업시간. DC summary 가 있으면 그것이 사용자 친화
// (예: "매일 08:00-22:00") 라 우선. 여러 줄이면 줄바꿈으로 join.
// Weekly 상세는 InfoTab 에서 별도 `businessHoursWeekly` 로 펼침 표시 — 여기는
// 단일 텍스트 fallback 만 담당.
export const mergeBusinessHours = (
  naverSnap: NaverSnapshot | null,
  dcSnap: DiningcodeSnapshot | null,
): string | null => {
  if (dcSnap && dcSnap.businessHoursSummary.length > 0) {
    return dcSnap.businessHoursSummary.map((d) => `${d.duration} ${d.time}`).join('\n');
  }
  if (naverSnap?.businessHours) return naverSnap.businessHours;
  return null;
};

export const mergeRating = (
  naverRow: MergeRestaurantRow | null,
  dcSnap: DiningcodeSnapshot | null,
): number | null => {
  if (naverRow?.rating !== null && naverRow?.rating !== undefined) return naverRow.rating;
  return dcSnap?.scoreDetail?.average ?? null;
};

export const mergeReviewCount = (
  naverRow: MergeRestaurantRow | null,
  dcSnap: DiningcodeSnapshot | null,
): number | null => {
  if (naverRow?.reviewCount !== null && naverRow?.reviewCount !== undefined) {
    return naverRow.reviewCount;
  }
  return dcSnap?.scoreDetail?.reviewTotal ?? null;
};

// ── 배열 필드 머지 ──────────────────────────────────────────────────────────

// Naver imageUrls + DC photos.origin + DC images.origin 의 합집합. 동일 URL
// 은 1회만. 순서는 Naver → DC photos → DC images (사용자가 본 페이지에서
// 익숙한 순).
export const mergePhotos = (
  naverSnap: NaverSnapshot | null,
  dcSnap: DiningcodeSnapshot | null,
): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (urls: readonly string[]): void => {
    for (const u of urls) {
      if (typeof u !== 'string' || u.length === 0) continue;
      if (seen.has(u)) continue;
      seen.add(u);
      out.push(u);
    }
  };
  if (naverSnap) push(naverSnap.imageUrls);
  if (dcSnap) {
    push(dcSnap.photos.map((p) => p.origin));
    push(dcSnap.images.map((p) => p.origin));
  }
  return out;
};

// Naver 메뉴가 하나라도 있으면 그대로, 비었을 때만 DC 메뉴를 MenuItem 으로
// 매핑. DC 의 selectionRate / reviewCount 등 부가 통계는 공개 schema 가
// 없어 버린다 (홈/메뉴 탭은 가게 단위 표시).
export const mergeMenus = (
  naverSnap: NaverSnapshot | null,
  dcSnap: DiningcodeSnapshot | null,
): MenuItemType[] => {
  if (naverSnap && naverSnap.menus.length > 0) return naverSnap.menus;
  if (!dcSnap) return [];
  return dcSnap.menus.map(
    (m): MenuItemType => ({
      name: m.name,
      price: m.price,
      description: m.description,
      recommend: m.best ? true : null,
      // DC 메뉴는 이미지 컬렉션이 별도 endpoint 라 snapshot 에 없음.
      imageUrls: [],
    }),
  );
};

// Naver blogReviews + DC blogsFirstPage.list. URL 동일 dedup. DC URL 이 http
// 접두 없을 수 있어 정규화 후 비교 — 직렬화 결과는 정규화된 URL.
export const mergeBlogReviews = (
  naverSnap: NaverSnapshot | null,
  dcSnap: DiningcodeSnapshot | null,
): BlogReviewType[] => {
  const seen = new Set<string>();
  const out: BlogReviewType[] = [];
  const normalizeUrl = (u: string): string => {
    if (/^https?:\/\//i.test(u)) return u;
    return `https://${u}`;
  };
  if (naverSnap) {
    for (const b of naverSnap.blogReviews) {
      if (seen.has(b.url)) continue;
      seen.add(b.url);
      out.push(b);
    }
  }
  if (dcSnap) {
    for (const b of dcSnap.blogsFirstPage.list) {
      const url = normalizeUrl(b.url);
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({
        type: b.site ?? 'blog',
        title: b.title,
        excerpt: b.contents,
        url,
        thumbnailUrls: b.image ? [b.image] : [],
        date: b.date,
        authorName: b.nickname,
      });
    }
  }
  return out;
};

// ── 출처별 메타 ─────────────────────────────────────────────────────────────

export interface DiningcodeRowMeta {
  vRid: string;
  rawSourceUrl: string;
  rating: number | null;
  siteReviewCount: number | null;
}

export const computeSources = (
  naverRow: MergeRestaurantRow | null,
  naverSnap: NaverSnapshot | null,
  dc: DiningcodeRowMeta | null,
): PublicSourcesType => {
  const naver = naverRow && naverSnap
    ? {
        placeId: naverSnap.placeId,
        rating: naverRow.rating,
        siteReviewCount: naverRow.reviewCount,
        rawSourceUrl: naverRow.rawSourceUrl,
      }
    : null;
  return { naver, diningcode: dc };
};

export const computeStoredReviewCount = (
  naver: number,
  diningcode: number,
): PublicStoredReviewCountType => ({
  naver,
  diningcode,
  total: naver + diningcode,
});

// DC 보조 정보 평탄화. canonical 에 DC 행이 없으면 호출자가 null 반환.
export const composeDiningcodeAddon = (
  dcSnap: DiningcodeSnapshot,
): PublicDiningcodeAddonType => ({
  scoreDetail: dcSnap.scoreDetail
    ? {
        average: dcSnap.scoreDetail.average,
        total: dcSnap.scoreDetail.total,
        reviewTotal: dcSnap.scoreDetail.reviewTotal,
        taste: dcSnap.scoreDetail.taste,
        service: dcSnap.scoreDetail.service,
        price: dcSnap.scoreDetail.price,
        clean: dcSnap.scoreDetail.clean,
        distribution: dcSnap.scoreDetail.distribution,
        text: dcSnap.scoreDetail.text,
      }
    : null,
  descTags: dcSnap.descTags,
  facilities: dcSnap.facilities,
  tags: dcSnap.tags,
  wordcloudUrl: dcSnap.wordcloudUrl,
  businessHoursSummary: dcSnap.businessHoursSummary,
  businessHoursWeekly: dcSnap.businessHours,
});
