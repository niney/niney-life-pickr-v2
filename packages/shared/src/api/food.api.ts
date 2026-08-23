import {
  Routes,
  type FoodAdminCreateInputType,
  type FoodAdminListQueryType,
  type FoodAdminListResultType,
  type FoodAdminStatsType,
  type FoodAdminUpdateInputType,
  type FoodImportConfigInputType,
  type FoodImportConfigType,
  type FoodImportPreviewInputType,
  type FoodImportPreviewResultType,
  type FoodImportRunInputType,
  type FoodImportRunListType,
  type FoodImportRunType,
  type FoodItemType,
  type FoodMergeConflictItemType,
  type FoodMergeConflictListQueryType,
  type FoodMergeConflictListResultType,
  type FoodMergeConflictResolveInputType,
  type FoodRestaurantsQueryType,
  type FoodRestaurantsResultType,
  type FoodRecognitionQualityQueryType,
  type FoodRecognitionQualityResultType,
  type FoodSearchResultType,
} from '@repo/api-contract';
import { apiFetch, getApiConfig } from './client.js';

// 어드민 목록 조회 입력 — 서버 스키마(FoodAdminListQuery)의 출력 타입을 전부 선택으로.
// active/unclassified 는 boolean 으로 받고 쿼리스트링에서 '1'/'0' 으로 직렬화한다
// (서버 boolParam 이 '1'/'0'/'true'/'false' 를 받는다).
export type FoodAdminListInput = Partial<FoodAdminListQueryType>;
export type FoodMergeConflictListInput = Partial<FoodMergeConflictListQueryType>;
export type FoodRestaurantsInput = Partial<FoodRestaurantsQueryType>;
export type FoodRecognitionQualityInput = Partial<FoodRecognitionQualityQueryType>;

export const buildFoodRestaurantsQuery = (input: FoodRestaurantsInput = {}): string => {
  const params = new URLSearchParams();
  if (input.lat !== undefined) params.set('lat', String(input.lat));
  if (input.lng !== undefined) params.set('lng', String(input.lng));
  if (input.radiusM !== undefined) params.set('radiusM', String(input.radiusM));
  if (input.limit !== undefined) params.set('limit', String(input.limit));
  return params.toString();
};

export const buildFoodRecognitionQualityQuery = (
  input: FoodRecognitionQualityInput = {},
): string => {
  const params = new URLSearchParams();
  if (input.days !== undefined) params.set('days', String(input.days));
  const model = input.model?.trim();
  if (model) params.set('model', model);
  if (input.version !== undefined) params.set('version', String(input.version));
  if (input.confidenceBucket !== undefined) {
    params.set('confidenceBucket', input.confidenceBucket);
  }
  return params.toString();
};

// 목록 쿼리스트링 — undefined 는 생략, 빈 q 도 생략(서버가 trim 후 빈 문자열을 그대로
// 받기보다 "필터 없음" 으로 해석되게). 키 순서는 입력 순서가 아니라 고정 순서라
// 같은 조건이면 항상 같은 문자열이 나온다(react-query 캐시 키·테스트 안정).
export const buildFoodAdminListQuery = (input: FoodAdminListInput = {}): string => {
  const params = new URLSearchParams();
  const q = input.q?.trim();
  if (q) params.set('q', q);
  if (input.dishType !== undefined) params.set('dishType', input.dishType);
  if (input.mainIngredient !== undefined) params.set('mainIngredient', input.mainIngredient);
  if (input.cuisine !== undefined) params.set('cuisine', input.cuisine);
  if (input.source !== undefined) params.set('source', input.source);
  if (input.active !== undefined) params.set('active', input.active ? '1' : '0');
  if (input.unclassified !== undefined) params.set('unclassified', input.unclassified ? '1' : '0');
  if (input.sort !== undefined) params.set('sort', input.sort);
  if (input.offset !== undefined) params.set('offset', String(input.offset));
  if (input.limit !== undefined) params.set('limit', String(input.limit));
  return params.toString();
};

export const buildFoodMergeConflictListQuery = (input: FoodMergeConflictListInput = {}): string => {
  const params = new URLSearchParams();
  if (input.status !== undefined) params.set('status', input.status);
  if (input.offset !== undefined) params.set('offset', String(input.offset));
  if (input.limit !== undefined) params.set('limit', String(input.limit));
  return params.toString();
};

export const foodApi = {
  // 자동완성 — 인증 사용자. q 는 호출 전에 비어 있지 않아야 한다(훅이 enabled 로 막는다).
  search: (q: string, limit?: number) => {
    const params = new URLSearchParams({ q: q.trim() });
    if (limit !== undefined) params.set('limit', String(limit));
    return apiFetch<FoodSearchResultType>(`${Routes.Food.search}?${params.toString()}`);
  },

  // 수집된 메뉴·리뷰에서 확인된 식당. 응답 notice/evidence를 UI에서 함께 노출해야 한다.
  restaurants: (foodId: string, input: FoodRestaurantsInput = {}) => {
    const qs = buildFoodRestaurantsQuery(input);
    return apiFetch<FoodRestaurantsResultType>(
      `${Routes.Food.restaurants(foodId)}${qs ? `?${qs}` : ''}`,
    );
  },

  // ── 어드민 카탈로그 ──
  adminList: (input: FoodAdminListInput = {}) => {
    const qs = buildFoodAdminListQuery(input);
    return apiFetch<FoodAdminListResultType>(`${Routes.Food.adminItems}${qs ? `?${qs}` : ''}`);
  },

  // 수기 등록 — 같은 이름(nameNorm)이 이미 있으면 409.
  adminCreate: (input: FoodAdminCreateInputType) =>
    apiFetch<FoodItemType>(Routes.Food.adminItems, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // 부분 갱신 — 분류를 null 로 보내면 비움. 없는 id 는 404.
  adminUpdate: (id: string, input: FoodAdminUpdateInputType) =>
    apiFetch<FoodItemType>(Routes.Food.adminItem(id), {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  adminStats: () => apiFetch<FoodAdminStatsType>(Routes.Food.adminStats),

  adminMergeConflicts: (input: FoodMergeConflictListInput = {}) => {
    const qs = buildFoodMergeConflictListQuery(input);
    return apiFetch<FoodMergeConflictListResultType>(
      `${Routes.Food.adminMergeConflicts}${qs ? `?${qs}` : ''}`,
    );
  },

  resolveMergeConflict: (id: string, input: FoodMergeConflictResolveInputType) =>
    apiFetch<FoodMergeConflictItemType>(Routes.Food.adminMergeConflict(id), {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  adminRecognitionQuality: (input: FoodRecognitionQualityInput = {}) => {
    const qs = buildFoodRecognitionQualityQuery(input);
    return apiFetch<FoodRecognitionQualityResultType>(
      `${Routes.Food.adminRecognitionQuality}${qs ? `?${qs}` : ''}`,
    );
  },

  // ── 적재 잡 ──
  getImportConfig: () => apiFetch<FoodImportConfigType>(Routes.Food.importConfig),

  updateImportConfig: (input: FoodImportConfigInputType) =>
    apiFetch<FoodImportConfigType>(Routes.Food.importConfig, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  // 지금 실행 — body 없이 보내면 저장된 설정(소스·분류)으로, 주면 이번 회차만 덮어쓴다.
  // 이미 진행 중이면 서버가 status 'skipped' run 을 돌려준다.
  runImportNow: (input?: FoodImportRunInputType) =>
    apiFetch<FoodImportRunType>(Routes.Food.importRun, {
      method: 'POST',
      body: input ? JSON.stringify(input) : undefined,
    }),

  listImportRuns: () => apiFetch<FoodImportRunListType>(Routes.Food.importRuns),

  previewImport: (input: FoodImportPreviewInputType) =>
    apiFetch<FoodImportPreviewResultType>(Routes.Food.importPreview, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

// SSE URL — EventSource 가 헤더를 못 보내므로 token 을 query 로 싣는다(random-crawl 과 동일).
export const buildFoodImportRunEventsUrl = async (): Promise<string> => {
  const cfg = getApiConfig();
  const token = (await cfg.getToken?.()) ?? '';
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  const qs = params.toString();
  return `${cfg.baseUrl}${Routes.Food.importRunEvents}${qs ? `?${qs}` : ''}`;
};
