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
