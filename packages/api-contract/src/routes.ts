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
  // 잡 단위 영속 로그 — SSE 의 실시간 'log' 이벤트와 동일한 데이터를 DB 에
  // 누적해 잡 종료 후에도 조회 가능. cursor pagination.
  jobLogs: (id: string) => `${API_PREFIX}/admin/crawl/jobs/${id}/logs`,
  // 네이버 PC 지도에서 키워드(+선택 영역)로 가게를 검색. /admin/discover 에서
  // 등록할 후보를 고르는 데 사용.
  search: `${API_PREFIX}/admin/crawl/search`,
  // 캐치테이블 자체 API 를 통한 키워드 검색. /admin/catchtable-test 페이지가
  // 어떻게 수집되는지 검증할 때 사용.
  catchtableSearch: `${API_PREFIX}/admin/crawl/catchtable/search`,
  // 캐치테이블 가게 상세 (가벼운 미리보기) — 검색 결과 카드에서 "상세 보기"
  // 클릭 시 같은 페이지의 모달에서 펼침.
  catchtableShop: (shopRef: string) =>
    `${API_PREFIX}/admin/crawl/catchtable/shop/${shopRef}`,
  // 캐치테이블 가게 메뉴 — lazy 페치 (상세 페이지에서 "메뉴 불러오기" 클릭 시).
  catchtableShopMenus: (shopRef: string) =>
    `${API_PREFIX}/admin/crawl/catchtable/shop/${shopRef}/menus`,
  // 캐치테이블 AI 가 만든 가게 리뷰 종합 (한 줄 + 3-4 문장).
  catchtableShopReviewOverview: (shopRef: string) =>
    `${API_PREFIX}/admin/crawl/catchtable/shop/${shopRef}/review-overview`,
  // 다이닝코드 자체 검색 API. /admin/diningcode-test 페이지가 어떤 데이터가
  // 돌아오는지 검증할 때 사용. HTTP 직접 호출이라 Playwright 비용 없음.
  diningcodeSearch: `${API_PREFIX}/admin/crawl/diningcode/search`,
  // 다이닝코드 가게 상세 — POST /API/profile/ 한 방에 메뉴·사진·리뷰 첫 페이지·
  // 블로그·평점 분포 모두 옴. 검색 카드의 "상세 보기" 가 이 경로 호출.
  diningcodeShop: (vRid: string) =>
    `${API_PREFIX}/admin/crawl/diningcode/shop/${vRid}`,
  // 다이닝코드 리뷰 페이지네이션 — 같은 /API/profile/ 에 tab=review&page=N
  // 으로 호출. 응답이 16섹션 모두 오지만 어댑터가 review 만 추려서 가볍게 반환.
  diningcodeShopReviews: (vRid: string) =>
    `${API_PREFIX}/admin/crawl/diningcode/shop/${vRid}/reviews`,
  // 다이닝코드 가게를 DB 에 저장(+모든 리뷰 페이지 끌어와 persist + AI 분석 큐잉).
  // POST. 어드민 상세 페이지의 "DB 에 저장" 버튼이 호출.
  diningcodeShopSave: (vRid: string) =>
    `${API_PREFIX}/admin/crawl/diningcode/shop/${vRid}/save`,
  // 정식 /admin/diningcode 페이지 — 검색 결과 카드의 '등록됨' 배지용. vRid 다수를
  // 한 번에 조회. ids=콤마 분리.
  diningcodeRegistered: `${API_PREFIX}/admin/crawl/diningcode/registered`,
  // 일괄 저장 잡 — 검색 페이지에서 다중 선택 후 한 번에 저장. 진행률은 SSE.
  diningcodeBulkSaveJobs: `${API_PREFIX}/admin/crawl/diningcode/bulk-save/jobs`,
  diningcodeBulkSaveJob: (id: string) =>
    `${API_PREFIX}/admin/crawl/diningcode/bulk-save/jobs/${id}`,
  diningcodeBulkSaveJobEvents: (id: string) =>
    `${API_PREFIX}/admin/crawl/diningcode/bulk-save/jobs/${id}/events`,
} as const;

export const Restaurant = {
  // 공개 식당 랭킹 — 비로그인/게스트도 접근. 긍정/부정 비율 정렬, 중립 토글.
  ranking: `${API_PREFIX}/restaurants/ranking`,
  // 공개 식당 리스트(지도 페이지). 좌표·대표 이미지·AI 통계 포함.
  publicList: `${API_PREFIX}/restaurants/public`,
  publicByPlaceId: (placeId: string) =>
    `${API_PREFIX}/restaurants/public/${placeId}`,
  publicInsights: (placeId: string) =>
    `${API_PREFIX}/restaurants/public/${placeId}/insights`,
  // 페이지네이션 방문자 리뷰. detail 응답엔 reviewsFirstPage (10개) 만 동봉되고
  // 나머지는 여기서 offset/limit + sentiment/sort 로 가져온다.
  publicReviews: (placeId: string) =>
    `${API_PREFIX}/restaurants/public/${placeId}/reviews`,
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
  // 이 가게의 진행 중인 요약 작업을 중지. queued/pending 행을 'cancelled' 로
  // 마킹 + chain 클리어. 진행 중 청크는 끝까지 흘러간 뒤 자연 종료. 부팅
  // 자동 재큐잉에서도 cancelled 는 제외.
  cancelSummary: (placeId: string) =>
    `${API_PREFIX}/admin/restaurants/place/${placeId}/cancel-summary`,
  // 중지된(cancelled) 행만 골라 다시 큐잉. failed/parse_failed 등 LLM 에러
  // 카테고리는 손대지 않는다 — 그쪽은 reanalyze 가 담당. cancelledPlaces 표식
  // 도 함께 해제하므로 새 batch 가 들어와도 정상 흐름으로 들어간다.
  resumeSummary: (placeId: string) =>
    `${API_PREFIX}/admin/restaurants/place/${placeId}/resume-summary`,
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
  // placeId 단위 누적 크롤 로그. 같은 가게의 여러 잡(과거 재크롤 포함)이 한
  // 흐름으로 보임. 상세 페이지 "크롤 로그" 아코디언이 호출.
  crawlLogs: (placeId: string) =>
    `${API_PREFIX}/admin/restaurants/place/${placeId}/crawl-logs`,
} as const;

// 가게 정체(canonical) 통합 — 출처 가로지르는 같은 가게 묶기. 어드민이
// 후보 보고 수동 확정. 자동 매칭은 의도적으로 안 함.
export const Canonical = {
  // 후보 조회 — 좌표/이름 매칭 점수 임계 통과한 다른 canonical 들.
  candidates: (id: string) =>
    `${API_PREFIX}/admin/canonical/${id}/candidates`,
  // 두 canonical 통합. body: { sourceCanonicalId, targetCanonicalId }
  merge: `${API_PREFIX}/admin/canonical/merge`,
  // canonical 분리 — 한 Restaurant 만 새 canonical 로 떼어냄.
  // body: { restaurantId }
  split: (id: string) => `${API_PREFIX}/admin/canonical/${id}/split`,
  // list 응답에 1차 매칭 제안이 끼는 걸 영구 닫기. body 없음.
  dismissSuggestion: (id: string) =>
    `${API_PREFIX}/admin/canonical/${id}/suggestion/dismiss`,
  // 자동 매칭 큐 — 두 canonical 이 같은 가게일 수 있다는 검토 대기 쌍.
  proposals: `${API_PREFIX}/admin/canonical/proposals`,
  // 전수 재계산. 어드민 "전체 다시 돌리기" 버튼.
  proposalsRun: `${API_PREFIX}/admin/canonical/proposals/run`,
  proposalAccept: (id: string) =>
    `${API_PREFIX}/admin/canonical/proposals/${id}/accept`,
  proposalReject: (id: string) =>
    `${API_PREFIX}/admin/canonical/proposals/${id}/reject`,
  // canonical 행 통째로 삭제 — DC만 등록된 행도 지울 수 있게 placeId 기반 라우트와
  // 별개로 신설. FK Cascade 로 Restaurant/review/summary/proposal 모두 따라간다.
  delete: (id: string) => `${API_PREFIX}/admin/canonical/${id}`,
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

// 맛집 자동 발견 — 키워드 한 줄 + 카테고리 칩 + targetCount 받아 AI 키워드 8 개
// 생성 → 다중 검색 → dedupe → 그룹 5 개씩 직렬 크롤(=Naver Place 등록) 까지.
// 잡 상태는 SSE 로 push.
export const AutoDiscover = {
  jobs: `${API_PREFIX}/admin/auto-discover/jobs`,
  job: (id: string) => `${API_PREFIX}/admin/auto-discover/jobs/${id}`,
  jobEvents: (id: string) =>
    `${API_PREFIX}/admin/auto-discover/jobs/${id}/events`,
} as const;

// provider × purpose 조합으로 row 를 식별한다. purpose='chat' 이 기본이며
// 같은 provider 에 'image' 등 다른 용도를 따로 등록할 수 있다.
export const Ai = {
  complete: `${API_PREFIX}/admin/ai/complete`,
  completeBatch: `${API_PREFIX}/admin/ai/complete-batch`,
  providers: `${API_PREFIX}/admin/ai/providers`,
  provider: (id: string, purpose: string) =>
    `${API_PREFIX}/admin/ai/providers/${id}/${purpose}`,
  testProvider: (id: string, purpose: string) =>
    `${API_PREFIX}/admin/ai/providers/${id}/${purpose}/test`,
  providerModels: (id: string, purpose: string) =>
    `${API_PREFIX}/admin/ai/providers/${id}/${purpose}/models`,
} as const;

// 외부 지도 SDK 키 관리. AI 키와 별개 라우트로 둔다 — provider 식별자 외엔
// 모델·동시성 등 LLM 고유 옵션이 필요 없어서 같은 모듈로 묶기 어색함.
// secret 은 평문 키 반환 (admin only) — vworld JS SDK init 에 필요.
export const SettingsMap = {
  list: `${API_PREFIX}/admin/settings/map`,
  provider: (id: string) => `${API_PREFIX}/admin/settings/map/${id}`,
  secret: (id: string) => `${API_PREFIX}/admin/settings/map/${id}/secret`,
  // 공개 — 맛집 지도 페이지가 vworld WMTS 호출에 쓸 키. 키 미등록 시 404.
  publicConfig: `${API_PREFIX}/settings/map/public`,
} as const;

// 정산하기의 영수증 업로드/추출 엔드포인트. 인증된 사용자(USER+) 만 사용
// 가능 — 정산 자체가 로그인 사용자 기능. 추출은 vision LLM 호출이라 비용이
// 들지만 MVP 에서는 제한 없음.
export const SettlementExtraction = {
  upload: `${API_PREFIX}/settlement-extraction/upload`,
  extract: `${API_PREFIX}/settlement-extraction/extract`,
  preview: (token: string) =>
    `${API_PREFIX}/settlement-extraction/preview/${token}`,
} as const;

// 정산 세션 — 로그인 사용자 본인만 사용한다. list/get/delete 모두 소유자
// 검증을 라우트 핸들러에서 한다.
//
// share/shared 는 한 쌍: share 는 owner 가 토큰을 만들고/회수하는 인증 경로,
// shared 는 누구나 토큰만 알면 read-only 로 결과를 보는 공개 경로. 공개
// 응답에서는 receiptPreviewUrl/userId 가 빠진다.
// 사용자별 단골 참여자 — 본인 데이터만 조회/수정/삭제. 검색은 querystring q.
// 정산 입력 화면 자동완성과 /me/contacts 관리 페이지가 호출.
export const SettlementContact = {
  list: `${API_PREFIX}/me/contacts`,
  one: (id: string) => `${API_PREFIX}/me/contacts/${id}`,
} as const;

export const Settlement = {
  list: `${API_PREFIX}/settlements`,
  create: `${API_PREFIX}/settlements`,
  one: (id: string) => `${API_PREFIX}/settlements/${id}`,
  updateParticipants: (id: string) => `${API_PREFIX}/settlements/${id}/participants`,
  share: (id: string) => `${API_PREFIX}/settlements/${id}/share`,
  shared: (token: string) => `${API_PREFIX}/share/settlements/${token}`,
} as const;

export const Health = `${API_PREFIX}/health` as const;
