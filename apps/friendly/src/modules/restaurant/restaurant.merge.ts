// 공개 식당 상세를 만들 때 Naver + 다이닝코드 + 테이블링 세 출처를 융합하는
// 순수 함수 모음. 모든 함수는 DB 의존 없는 pure — service 가 row 를 읽은 뒤
// 파싱된 데이터만 넘겨 호출한다. 단위 테스트가 쉬워지는 이점.
//
// 머지 규칙은 어드민과 합의된 "전 필드 Naver 1순위" + 필드별 폴백:
//   rating / reviewCount    → Naver > DC > 테이블링 (단 UI 는 sources 분리값 우선)
//   phone / address         → Naver > DC > 테이블링
//   businessHours           → Naver text > 테이블링 요일별 직렬화 > DC summary
//                             (테이블링이 가게 직접 관리 데이터라 DC 요약보다 정확)
//   menus                   → Naver 가 비었을 때만 테이블링 > DC
//                             (테이블링 메뉴는 가격+이미지 1차 데이터)
//   photos                  → Naver + DC + 테이블링 합쳐서 URL dedup
//   reviews                 → 세 출처 모두 합쳐서 fetchedAt desc
//   descTags/facilities/scoreDetail/wordcloud  → DC 전용 → 항상 노출
//   flags/4축평점/favoriteCount/businessDays   → 테이블링 전용 → 항상 노출
//
// 테이블링은 partner 행(숫자 idx) 만 융합 대상 — 미입점 place 행은 얕은
// 스냅샷(다른 shape) 이라 공개 경로에서 제외한다.
import type {
  BlogReviewType,
  DiningcodeShopDataType,
  MenuItemType,
  NaverPlaceDataType,
  PublicDiningcodeAddonType,
  PublicSourcesType,
  PublicStoredReviewCountType,
  PublicTablingAddonType,
  TablingBusinessDayType,
  TablingShopDataType,
} from '@repo/api-contract';

// snapshotJson 은 *Reviews 를 제거한 상태로 저장돼 있으므로 머지 함수가
// 보는 타입도 그 형태 그대로.
export type NaverSnapshot = Omit<NaverPlaceDataType, 'visitorReviews'>;
export type DiningcodeSnapshot = Omit<DiningcodeShopDataType, 'reviewsFirstPage'>;
export type TablingSnapshot = Omit<TablingShopDataType, 'reviewsFirstPage'>;

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
  tb: TablingSnapshot | null = null,
): string => {
  if (naver) return naver.name;
  if (dc) return dc.fullName;
  if (tb) return tb.name;
  return '';
};

export const mergeCategory = (
  naver: MergeRestaurantRow | null,
  dc: DiningcodeSnapshot | null,
  tb: TablingSnapshot | null = null,
): string | null => {
  if (naver?.category) return naver.category;
  if (dc && dc.categories.length > 0) return dc.categories.join(' · ');
  if (tb?.category) return tb.category;
  return null;
};

export const mergeAddress = (
  naverRow: MergeRestaurantRow | null,
  naverSnap: NaverSnapshot | null,
  dcSnap: DiningcodeSnapshot | null,
  tbSnap: TablingSnapshot | null = null,
): { address: string | null; roadAddress: string | null } => {
  const address = naverRow?.address ?? dcSnap?.address ?? tbSnap?.address ?? null;
  const roadAddress =
    naverSnap?.roadAddress ?? dcSnap?.roadAddress ?? tbSnap?.roadAddress ?? null;
  return { address, roadAddress };
};

export const mergePhone = (
  naverRow: MergeRestaurantRow | null,
  dcSnap: DiningcodeSnapshot | null,
  tbSnap: TablingSnapshot | null = null,
): string | null => naverRow?.phone ?? dcSnap?.phone ?? tbSnap?.phone ?? null;

export const mergeCoordinates = (
  naverSnap: NaverSnapshot | null,
  dcSnap: DiningcodeSnapshot | null,
  tbSnap: TablingSnapshot | null = null,
): { latitude: number | null; longitude: number | null } => {
  const latitude = naverSnap?.latitude ?? dcSnap?.lat ?? tbSnap?.lat ?? null;
  const longitude = naverSnap?.longitude ?? dcSnap?.lng ?? tbSnap?.lng ?? null;
  return { latitude, longitude };
};

// 테이블링 businessDays(요일별 구조화) → 단일 텍스트 직렬화. dayOfWeek 1=월
// … 7=일 (테이블링 규약). "HH:MM:SS" 꼬리 초는 잘라 "HH:MM" 로.
const TABLING_DAY_LABELS = ['', '월', '화', '수', '목', '금', '토', '일'];
const fmtTablingTime = (t: string | null): string | null => {
  if (!t) return null;
  return /^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : t;
};
export const serializeTablingBusinessDays = (
  days: TablingBusinessDayType[],
): string | null => {
  if (days.length === 0) return null;
  const lines: string[] = [];
  for (const d of days) {
    const label = TABLING_DAY_LABELS[d.dayOfWeek] ?? String(d.dayOfWeek);
    if (d.dayStatus === 'DAY_OFF') {
      lines.push(`${label} 휴무`);
      continue;
    }
    const open = d.openTimeList
      .map((t) => {
        const s = fmtTablingTime(t.startTime);
        const e = fmtTablingTime(t.endTime);
        return s && e ? `${s}-${e}` : null;
      })
      .filter((v): v is string => v !== null)
      .join(', ');
    if (!open) continue;
    const brk = d.breakTimeList
      .map((t) => {
        const s = fmtTablingTime(t.startTime);
        const e = fmtTablingTime(t.endTime);
        return s && e ? `${s}-${e}` : null;
      })
      .filter((v): v is string => v !== null)
      .join(', ');
    lines.push(brk ? `${label} ${open} (브레이크 ${brk})` : `${label} ${open}`);
  }
  return lines.length > 0 ? lines.join('\n') : null;
};

// 단일 string 으로 표현되는 영업시간. 전 필드 Naver 1순위 정책에 따라 Naver
// text 가 있으면 그대로. 폴백은 테이블링(가게 직접 관리 — 정확) → DC summary.
// Weekly 상세는 InfoTab 에서 별도 펼침 표시 — 여기는 단일 텍스트만 담당.
export const mergeBusinessHours = (
  naverSnap: NaverSnapshot | null,
  dcSnap: DiningcodeSnapshot | null,
  tbSnap: TablingSnapshot | null = null,
): string | null => {
  if (naverSnap?.businessHours) return naverSnap.businessHours;
  if (tbSnap) {
    const serialized = serializeTablingBusinessDays(tbSnap.businessDays);
    if (serialized) return serialized;
  }
  if (dcSnap && dcSnap.businessHoursSummary.length > 0) {
    return dcSnap.businessHoursSummary.map((d) => `${d.duration} ${d.time}`).join('\n');
  }
  return null;
};

export const mergeRating = (
  naverRow: MergeRestaurantRow | null,
  dcSnap: DiningcodeSnapshot | null,
  tbSnap: TablingSnapshot | null = null,
): number | null => {
  if (naverRow?.rating !== null && naverRow?.rating !== undefined) return naverRow.rating;
  return dcSnap?.scoreDetail?.average ?? tbSnap?.rating ?? null;
};

export const mergeReviewCount = (
  naverRow: MergeRestaurantRow | null,
  dcSnap: DiningcodeSnapshot | null,
  tbSnap: TablingSnapshot | null = null,
): number | null => {
  if (naverRow?.reviewCount !== null && naverRow?.reviewCount !== undefined) {
    return naverRow.reviewCount;
  }
  return dcSnap?.scoreDetail?.reviewTotal ?? tbSnap?.reviewTotalCount ?? null;
};

// ── 배열 필드 머지 ──────────────────────────────────────────────────────────

// Naver imageUrls + DC photos.origin + DC images.origin + 테이블링 images 의
// 합집합. 동일 URL 은 1회만. 순서는 Naver → DC photos → DC images → 테이블링
// (사용자가 본 페이지에서 익숙한 순).
export const mergePhotos = (
  naverSnap: NaverSnapshot | null,
  dcSnap: DiningcodeSnapshot | null,
  tbSnap: TablingSnapshot | null = null,
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
  if (tbSnap) push(tbSnap.images);
  return out;
};

// Naver 메뉴가 하나라도 있으면 그대로. 비었으면 테이블링(가격+이미지 1차
// 데이터) → DC 순으로 MenuItem 매핑. 테이블링은 카테고리 구조를 평탄화하고
// 대표(isMain)/추천(isFeatured) 메뉴를 recommend 로 합산. DC 의 selectionRate
// 등 부가 통계는 공개 schema 가 없어 버린다.
export const mergeMenus = (
  naverSnap: NaverSnapshot | null,
  dcSnap: DiningcodeSnapshot | null,
  tbSnap: TablingSnapshot | null = null,
): MenuItemType[] => {
  if (naverSnap && naverSnap.menus.length > 0) return naverSnap.menus;
  if (tbSnap) {
    const flat = tbSnap.menuCategories.flatMap((c) => c.menus);
    if (flat.length > 0) {
      return flat.map(
        (m): MenuItemType => ({
          name: m.name,
          price: m.price !== null && m.price > 0 ? String(m.price) : null,
          description: m.description,
          recommend: m.isFeatured || m.isMain ? true : null,
          imageUrls: m.imageUrl ? [m.imageUrl] : [],
        }),
      );
    }
  }
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
// (테이블링은 블로그 데이터가 없어 이 함수는 두 출처만 다룬다.)
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

export interface TablingRowMeta {
  idx: number;
  rawSourceUrl: string;
  rating: number | null;
  siteReviewCount: number | null;
}

export const computeSources = (
  naverRow: MergeRestaurantRow | null,
  naverSnap: NaverSnapshot | null,
  dc: DiningcodeRowMeta | null,
  tabling: TablingRowMeta | null = null,
): PublicSourcesType => {
  const naver = naverRow && naverSnap
    ? {
        placeId: naverSnap.placeId,
        rating: naverRow.rating,
        siteReviewCount: naverRow.reviewCount,
        rawSourceUrl: naverRow.rawSourceUrl,
      }
    : null;
  return { naver, diningcode: dc, tabling };
};

export const computeStoredReviewCount = (
  naver: number,
  diningcode: number,
  tabling = 0,
): PublicStoredReviewCountType => ({
  naver,
  diningcode,
  tabling,
  total: naver + diningcode + tabling,
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

// 테이블링 보조 정보 평탄화. canonical 에 partner 행이 없으면 호출자가 null
// 반환. waitingCount 는 크롤 시점 스냅샷(스테일) 이라 의도적으로 누락.
export const composeTablingAddon = (
  tbSnap: TablingSnapshot,
): PublicTablingAddonType => ({
  flags: tbSnap.flags,
  ratings: tbSnap.ratings,
  favoriteCount: tbSnap.favoriteCount,
  businessDays: tbSnap.businessDays,
});
