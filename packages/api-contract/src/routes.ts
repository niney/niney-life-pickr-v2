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
  // 공개 식당 랭킹 — 비로그인/게스트도 접근. 긍정/부정 비율 정렬, 중립 토글.
  ranking: `${API_PREFIX}/restaurants/ranking`,
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
  // 기존 done 행의 menusJson/tipsJson/keywordsJson 을 정규화 분석 테이블
  // (menu_mentions / review_tags) 로 풀어쓰는 일회성 백필. LLM 재호출 없이
  // 이미 저장된 분석을 그대로 사용 — 분석 스키마 변경 없이 통계 인덱스만
  // 새로 깔 때 호출.
  analyticsBackfill: `${API_PREFIX}/admin/restaurants/analytics/backfill`,
  // 단일 식당 메뉴 그룹핑 — distinct nameNorm 들을 LLM 으로 canonical 그룹에
  // 매핑. 동기 응답 (보통 2~5초). 미분류 메뉴가 있는 식당 상세에서 호출.
  menusGroup: (placeId: string) =>
    `${API_PREFIX}/admin/restaurants/place/${placeId}/menus/group`,
  // 메뉴 그룹핑 결과 + 긍/부 카운트 순위. canonical 매핑 없는 nameNorm 은
  // 자기 자신을 그룹키로 fallback 처리하고 unmappedMenus 에도 같이 노출.
  menusRanking: (placeId: string) =>
    `${API_PREFIX}/admin/restaurants/place/${placeId}/menus/ranking`,
  // 가중 랜덤 픽 — 분석 점수를 가중치로 써서 등록된 식당 중 하나를 고른다.
  // niney의 본 목적("선택 대신 골라주기")에 분석 결과를 직접 활용하는
  // 가장 작은 통합 지점.
  smartPick: `${API_PREFIX}/admin/restaurants/smart-pick`,
} as const;

// AI 분석 운영(메뉴 분류 batch) 화면용. 식당별 라우트는 Restaurant.menusGroup/
// menusRanking 으로 단일 처리하고, 여기는 다건 잡 + 상태 조회 전담.
export const Analytics = {
  // 식당별 정규화 상태 (메뉴 분류 페이지 메인 테이블).
  restaurantsStatus: `${API_PREFIX}/admin/analytics/restaurants`,
  // 다건 그룹핑 잡 시작. body: { placeIds: string[] }.
  groupingJobs: `${API_PREFIX}/admin/analytics/grouping-jobs`,
  // 잡 스냅샷 조회 (재접속/새로고침 직후 SSE 보다 먼저 호출).
  groupingJob: (id: string) => `${API_PREFIX}/admin/analytics/grouping-jobs/${id}`,
  // 잡 진행 SSE — 식당별 done/failed event push.
  groupingJobEvents: (id: string) =>
    `${API_PREFIX}/admin/analytics/grouping-jobs/${id}/events`,
  // ── 글로벌 (식당 가로지르기) ────────────────────────────────────
  // 대시보드 카드용 핵심 카운터.
  overview: `${API_PREFIX}/admin/analytics/overview`,
  // 글로벌 메뉴 통계 — q/sort/minMentions/limit/includeUnlinked querystring.
  globalMenus: `${API_PREFIX}/admin/analytics/global-menus`,
  // 글로벌 머지 잡 시작 (body: {full:boolean}) + 스냅샷 + SSE.
  globalMergeJobs: `${API_PREFIX}/admin/analytics/global-merge-jobs`,
  globalMergeJob: (id: string) =>
    `${API_PREFIX}/admin/analytics/global-merge-jobs/${id}`,
  globalMergeJobEvents: (id: string) =>
    `${API_PREFIX}/admin/analytics/global-merge-jobs/${id}/events`,
  // 카테고리 트리 — 글로벌 머지 이후 채워진 categoryPath 기반 누적 통계.
  categoryTree: `${API_PREFIX}/admin/analytics/category-tree`,
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
