// 네이버 place 상세의 방문자 리뷰 통계(getVisitorReviewStats)를 직접 HTTP 로
// 가져오는 가벼운 어댑터. 풀 크롤(Playwright)과 달리 페이지를 띄우지 않아 매우
// 빠르다(호출당 ~60ms, 5건 병렬 ~90ms). 검색 카드에 "정확한 방문자 리뷰 수"를
// 보여주는 용도.
//
// endpoint: POST https://api.place.naver.com/graphql
//   operationName: getVisitorReviewStats
//   variables: { businessType: "restaurant", id: <placeId>, itemId: "0" }
//
// 핵심:
//   - x-wtm-graphql 헤더 필수(없으면 차단). base64(JSON{arg,type,source}), 패딩 제거.
//   - 검색 API(restaurantList)의 visitorReviewCount = visitorReviewsTotal 로 별점-only
//     리뷰까지 포함한 전체. 네이버 페이지가 크게 보여주는 "방문자 리뷰" 는 별점만
//     남긴 리뷰(ratingReviewsTotal)를 뺀 값이라, displayReviewCount 로 그 차를 준다.
//   - 실패는 throw 하지 않고 null 반환(미리보기 보강용 — best-effort).

const ENDPOINT = 'https://api.place.naver.com/graphql';

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FETCH_TIMEOUT_MS = Number(
  process.env.CRAWL_REVIEW_STATS_HTTP_TIMEOUT_MS ?? '5000',
);

// Phase 7 introspection 으로 검증된 필드 셋의 최소 부분(필요한 카운트만).
const QUERY = `query getVisitorReviewStats($id: String, $itemId: String, $businessType: String = "place") {
  visitorReviewStats(input: {businessId: $id, itemId: $itemId, businessType: $businessType}) {
    visitorReviewsTotal
    ratingReviewsTotal
    review {
      totalCount
      imageReviewCount
      __typename
    }
    __typename
  }
}`;

export interface VisitorReviewStats {
  // 별점-only 포함 전체 방문자 리뷰(검색 API visitorReviewCount 와 동일).
  visitorReviewsTotal: number;
  // 별점만 남긴(텍스트 없는) 리뷰 수.
  ratingReviewsTotal: number;
  // 네이버 페이지가 표시하는 "방문자 리뷰" = 전체 − 별점only (음수 방지).
  displayReviewCount: number;
  // 사진 리뷰 수.
  imageReviewCount: number | null;
}

export interface ReviewStatsOptions {
  signal?: AbortSignal;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const numOrNull = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.length > 0) {
    const n = Number(v.replace(/,/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return null;
};

// x-wtm-graphql 헤더값 — base64(JSON{arg:placeId, type:"restaurant", source:"place"}),
// 패딩(=) 제거. 네이버가 봇 차단용으로 검사한다.
export const buildWtmHeader = (placeId: string): string => {
  const json = JSON.stringify({
    arg: placeId,
    type: 'restaurant',
    source: 'place',
  });
  return Buffer.from(json, 'utf-8').toString('base64').replace(/=+$/, '');
};

// GraphQL 응답(배치 배열 또는 단일 객체)에서 통계 추출. 순수 함수 — 테스트용.
export const parseVisitorReviewStats = (
  json: unknown,
): VisitorReviewStats | null => {
  const op = Array.isArray(json) ? json[0] : json;
  if (!isObject(op)) return null;
  const data = isObject(op['data']) ? op['data'] : null;
  const stats =
    data && isObject(data['visitorReviewStats'])
      ? data['visitorReviewStats']
      : null;
  if (!stats) return null;

  const visitor = numOrNull(stats['visitorReviewsTotal']);
  const rating = numOrNull(stats['ratingReviewsTotal']) ?? 0;
  if (visitor === null) return null;

  const review = isObject(stats['review']) ? stats['review'] : null;
  return {
    visitorReviewsTotal: visitor,
    ratingReviewsTotal: rating,
    displayReviewCount: Math.max(0, visitor - rating),
    imageReviewCount: review ? numOrNull(review['imageReviewCount']) : null,
  };
};

// placeId 의 방문자 리뷰 통계를 가져온다. 실패(네트워크/차단/형식)는 null.
export const fetchVisitorReviewStats = async (
  placeId: string,
  options: ReviewStatsOptions = {},
): Promise<VisitorReviewStats | null> => {
  const body = JSON.stringify([
    {
      operationName: 'getVisitorReviewStats',
      variables: { businessType: 'restaurant', id: placeId, itemId: '0' },
      query: QUERY,
    },
  ]);

  // 외부 signal 이 없으면 자체 timeout — stuck 방지.
  const ac = options.signal ? null : new AbortController();
  const timeoutId = ac ? setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS) : null;

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': MOBILE_UA,
        Referer: `https://m.place.naver.com/restaurant/${placeId}/home`,
        Origin: 'https://m.place.naver.com',
        'x-wtm-graphql': buildWtmHeader(placeId),
      },
      body,
      signal: options.signal ?? ac?.signal,
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return parseVisitorReviewStats(json);
  } catch {
    return null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

// 여러 placeId 를 병렬로(best-effort). 실패한 항목은 맵에 안 들어간다.
export const fetchVisitorReviewStatsMany = async (
  placeIds: string[],
  options: ReviewStatsOptions = {},
): Promise<Map<string, VisitorReviewStats>> => {
  const out = new Map<string, VisitorReviewStats>();
  await Promise.all(
    placeIds.map(async (id) => {
      const s = await fetchVisitorReviewStats(id, options);
      if (s) out.set(id, s);
    }),
  );
  return out;
};
