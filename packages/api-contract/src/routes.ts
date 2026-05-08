export const API_PREFIX = '/api/v1';

export const Auth = {
  register: `${API_PREFIX}/auth/register`,
  login: `${API_PREFIX}/auth/login`,
  me: `${API_PREFIX}/auth/me`,
  logout: `${API_PREFIX}/auth/logout`,
} as const;

export const Users = {
  list: `${API_PREFIX}/users`,
  byId: (id: string) => `${API_PREFIX}/users/${id}`,
} as const;

export const Picks = {
  list: `${API_PREFIX}/picks`,
  create: `${API_PREFIX}/picks`,
  byId: (id: string) => `${API_PREFIX}/picks/${id}`,
} as const;

export const Admin = {
  listUsers: `${API_PREFIX}/admin/users`,
  setUserRole: (id: string) => `${API_PREFIX}/admin/users/${id}/role`,
} as const;

export const Media = {
  // Proxies a Naver-hosted image through friendly, returning a JPEG thumbnail.
  // Public (no auth) — review images themselves are public on Naver and we
  // need plain <img> tags to load them without browser-side auth handling.
  thumbnail: `${API_PREFIX}/media/thumbnail`,
} as const;

export const Crawl = {
  naverPlace: `${API_PREFIX}/admin/crawl/naver-place`,
  jobs: `${API_PREFIX}/admin/crawl/jobs`,
  job: (id: string) => `${API_PREFIX}/admin/crawl/jobs/${id}`,
  jobEvents: (id: string) => `${API_PREFIX}/admin/crawl/jobs/${id}/events`,
} as const;

export const Restaurant = {
  list: `${API_PREFIX}/admin/restaurants`,
  byPlaceId: (placeId: string) => `${API_PREFIX}/admin/restaurants/place/${placeId}`,
  delete: (placeId: string) => `${API_PREFIX}/admin/restaurants/place/${placeId}`,
  summaryStatus: (placeId: string) =>
    `${API_PREFIX}/admin/restaurants/place/${placeId}/summary-status`,
  // SSE endpoint that multiplexes summary progress for many placeIds over a
  // single connection (?placeId=A&placeId=B&…). One connection per browser
  // tab keeps us under the HTTP/1.1 6-per-origin SSE cap, even with several
  // crawls in flight.
  summaryEvents: `${API_PREFIX}/admin/restaurants/summary-events`,
  // analysisVersion 이 비었거나 구버전인 done/failed 행을 다시 큐잉.
  // 재크롤 없이 새 분석 스키마를 기존 리뷰에 채울 때 쓴다.
  reanalyze: (placeId: string) =>
    `${API_PREFIX}/admin/restaurants/place/${placeId}/reanalyze`,
  // 식당 단위 인사이트 — 자주 언급되는 메뉴/팁/키워드 + 평균 점수.
  insights: (placeId: string) =>
    `${API_PREFIX}/admin/restaurants/place/${placeId}/insights`,
  // 가중 랜덤 픽 — 분석 점수를 가중치로 써서 등록된 식당 중 하나를 고른다.
  // niney의 본 목적("선택 대신 골라주기")에 분석 결과를 직접 활용하는
  // 가장 작은 통합 지점.
  smartPick: `${API_PREFIX}/admin/restaurants/smart-pick`,
} as const;

export const Ai = {
  complete: `${API_PREFIX}/admin/ai/complete`,
  completeBatch: `${API_PREFIX}/admin/ai/complete-batch`,
  providers: `${API_PREFIX}/admin/ai/providers`,
  provider: (id: string) => `${API_PREFIX}/admin/ai/providers/${id}`,
  testProvider: (id: string) => `${API_PREFIX}/admin/ai/providers/${id}/test`,
  providerModels: (id: string) => `${API_PREFIX}/admin/ai/providers/${id}/models`,
} as const;

export const Health = `${API_PREFIX}/health` as const;
