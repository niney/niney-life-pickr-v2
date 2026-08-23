import {
  Routes,
  type CreateMealEntryInputType,
  type CreateMealRecommendationInputType,
  type ListMealRecommendationsResultType,
  type MealRecommendationContextType,
  type MealRecommendationFeedbackInputType,
  type MealRecommendationType,
  type ListMealEntriesQueryType,
  type ListMealEntriesResultType,
  type MealCalendarResultType,
  type MealEntryType,
  type MealPreferenceType,
  type MealStatsResultType,
  type MealTimePresetsResultType,
  type RecentMealItemResultType,
  type RecognizeMealInputType,
  type RecognizeMealResultType,
  type UpdateMealEntryInputType,
  type UpdateMealPreferenceInputType,
  type UploadMealPhotoResultType,
} from '@repo/api-contract';
import { apiFetch, getApiConfig } from './client.js';

// 식단 관리 API — 전부 로그인 필수. 사진 입력 자체는 앱에서만 하지만 계약은 플랫폼 구분이 없다.

// 업로드 파일 입력 — 정산 영수증과 같은 이유로 유니온이다.
// 웹은 File/Blob 을 그대로, RN 은 { uri, name, type } 을 넣어야 한다(Blob 을 넣으면 서버에
// 빈 파일이 도착한다 — "Input Buffer is empty").
export type MealPhotoUploadFile = Blob | { uri: string; name: string; type: string };

export type ListMealEntriesInput = Partial<ListMealEntriesQueryType>;

// 목록 쿼리스트링 — undefined 는 생략. 키 순서를 고정해 같은 조건이면 같은 문자열이 나온다
// (react-query 캐시 키·테스트 안정).
export const buildMealEntriesQuery = (input: ListMealEntriesInput = {}): string => {
  const params = new URLSearchParams();
  if (input.from) params.set('from', input.from);
  if (input.to) params.set('to', input.to);
  if (input.slot) params.set('slot', input.slot);
  if (input.cursor) params.set('cursor', input.cursor);
  if (input.limit !== undefined) params.set('limit', String(input.limit));
  if (input.withPhotos !== undefined) params.set('withPhotos', input.withPhotos ? '1' : '0');
  return params.toString();
};

export const mealApi = {
  // ── 기록 ──
  list: (input: ListMealEntriesInput = {}) => {
    const qs = buildMealEntriesQuery(input);
    return apiFetch<ListMealEntriesResultType>(`${Routes.Meal.entries}${qs ? `?${qs}` : ''}`);
  },

  get: (id: string) => apiFetch<MealEntryType>(Routes.Meal.entry(id)),

  create: (input: CreateMealEntryInputType) =>
    apiFetch<MealEntryType>(Routes.Meal.entries, { method: 'POST', body: JSON.stringify(input) }),

  update: (id: string, input: UpdateMealEntryInputType) =>
    apiFetch<MealEntryType>(Routes.Meal.entry(id), { method: 'PATCH', body: JSON.stringify(input) }),

  remove: (id: string) => apiFetch<void>(Routes.Meal.entry(id), { method: 'DELETE' }),

  calendar: (month: string) =>
    apiFetch<MealCalendarResultType>(`${Routes.Meal.calendar}?month=${encodeURIComponent(month)}`),

  stats: (from: string, to: string) =>
    apiFetch<MealStatsResultType>(
      `${Routes.Meal.stats}?${new URLSearchParams({ from, to }).toString()}`,
    ),

  // ── 사진 ──
  // 필드 이름 'file' 은 서버 req.file() 과의 약속.
  uploadPhoto: (file: MealPhotoUploadFile) => {
    const form = new FormData();
    form.append('file', file as Blob);
    return apiFetch<UploadMealPhotoResultType>(Routes.Meal.photos, { method: 'POST', body: form });
  },

  removePhoto: (token: string) => apiFetch<void>(Routes.Meal.photo(token), { method: 'DELETE' }),

  // 지난 기록의 사진을 이번 기록용으로 복제(참조 공유가 아니다 — 원본을 지워도 안 사라진다).
  copyPhoto: (token: string) =>
    apiFetch<UploadMealPhotoResultType>(Routes.Meal.photoCopy(token), { method: 'POST' }),

  // 끼니별 "내가 보통 먹는 시각" — 시간 입력 프리셋.
  timePresets: () => apiFetch<MealTimePresetsResultType>(Routes.Meal.timePresets),

  // 이 음식을 지난번에 어떻게 먹었나 — 양·분류·그때 사진. 먹은 적 없으면 found=false.
  recentItem: (name: string) =>
    apiFetch<RecentMealItemResultType>(
      `${Routes.Meal.recentItem}?${new URLSearchParams({ name }).toString()}`,
    ),

  // 사진은 JWT 가 필요해 <img src> 로 직접 못 쓴다 — blob 으로 받아 화면에서 URL 로 바꾼다
  // (웹은 objectURL, RN 은 data URL — useMealPhotoUrl 훅이 처리).
  photoBlob: async (token: string, variant: 'full' | 'thumb' = 'thumb'): Promise<Blob> => {
    const cfg = getApiConfig();
    const path = variant === 'thumb' ? Routes.Meal.photoThumb(token) : Routes.Meal.photo(token);
    const token$ = (await cfg.getToken?.()) ?? '';
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      headers: token$ ? { Authorization: `Bearer ${token$}` } : {},
    });
    if (!res.ok) throw new Error(`사진을 불러오지 못했습니다 (${res.status})`);
    return res.blob();
  },

  // ── 인식 ──
  recognize: (input: RecognizeMealInputType) =>
    apiFetch<RecognizeMealResultType>(Routes.Meal.recognize, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // ── 추천 ──
  // 캐시(같은 날·끼니·프로필)면 서버가 LLM 을 부르지 않고 저장된 결과를 돌려준다.
  recommend: (input: CreateMealRecommendationInputType) =>
    apiFetch<MealRecommendationType>(Routes.Meal.recommendations, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  listRecommendations: (limit?: number) =>
    apiFetch<ListMealRecommendationsResultType>(
      `${Routes.Meal.recommendations}${limit !== undefined ? `?limit=${limit}` : ''}`,
    ),

  recommendationContext: () => apiFetch<MealRecommendationContextType>(Routes.Meal.recommendationContext),

  recommendationFeedback: (id: string, input: MealRecommendationFeedbackInputType) =>
    apiFetch<MealRecommendationType>(Routes.Meal.recommendationFeedback(id), {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // ── 선호 설정 ──
  getPreference: () => apiFetch<MealPreferenceType>(Routes.Meal.preference),

  updatePreference: (input: UpdateMealPreferenceInputType) =>
    apiFetch<MealPreferenceType>(Routes.Meal.preference, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
};
