import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  CreateMealEntryInputType,
  CreateMealNutritionAdviceInputType,
  CreateMealRecommendationInputType,
  DeleteMealPhotosInputType,
  DeleteMealDataInputType,
  MealDataBackupType,
  MealRecommendationFeedbackInputType,
  MealRecommendationEventInputType,
  MealSlotType,
  RecognizeMealInputType,
  UpdateMealEntryInputType,
  UpdateMealPreferenceInputType,
} from '@repo/api-contract';
import { MEAL_RECOMMENDATIONS_DELETE_CONFIRMATION } from '@repo/api-contract';
import { mealApi, type ListMealEntriesInput, type MealPhotoUploadFile } from '../api/meal.api.js';
import { isMealDraftPrincipalCurrent, useMealDraftStore } from '../stores/mealDraftStore.js';

// 쿼리 키 루트 ['meal', ...] — 목록 ['meal','list',query], 단건 ['meal','one',id],
// 달력 ['meal','calendar',month], 통계 ['meal','stats',from,to], 선호 ['meal','preference'].
// 기록이 바뀌면 목록·달력·통계가 모두 흔들리므로 루트 하나로 무효화한다.

const KEY = ['meal'] as const;

const invalidateEntries = (qc: ReturnType<typeof useQueryClient>): void => {
  void qc.invalidateQueries({ queryKey: [...KEY, 'list'] });
  void qc.invalidateQueries({ queryKey: [...KEY, 'calendar'] });
  void qc.invalidateQueries({ queryKey: [...KEY, 'stats'] });
  void qc.invalidateQueries({ queryKey: [...KEY, 'recommendation'] });
  void qc.invalidateQueries({ queryKey: [...KEY, 'time-presets'] });
  void qc.invalidateQueries({ queryKey: [...KEY, 'frequent'] });
  void qc.invalidateQueries({ queryKey: [...KEY, 'nutrition'] });
};

// 전체 내보내기는 사용자 동작 때만 큰 JSON 을 받도록 mutation 으로 제공한다.
export const useExportMealData = () =>
  useMutation({ mutationFn: () => mealApi.exportData() });

export const useBackupMealData = () =>
  useMutation({ mutationFn: () => mealApi.backupData() });

export const useRestoreMealData = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (archive: MealDataBackupType) => mealApi.restoreData(archive),
    onSuccess: () => {
      // append 복원으로 목록·통계·추천·선호가 모두 달라질 수 있다.
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
};

export const usePreviewMealPhotoRetention = () =>
  useMutation({ mutationFn: (before?: string) => mealApi.previewPhotoRetention(before) });

export const useDeleteRetainedMealPhotos = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DeleteMealPhotosInputType) => mealApi.deleteRetainedPhotos(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
};

export const useDeleteAllMealData = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DeleteMealDataInputType) => mealApi.deleteAllData(input),
    onSuccess: () => {
      // 단건·목록·통계·추천·선호 캐시에 삭제 전 개인정보가 남지 않게 전부 제거한다.
      qc.removeQueries({ queryKey: KEY });
    },
  });
};

export const useMealEntries = (query: ListMealEntriesInput = {}, enabled = true) =>
  useQuery({
    queryKey: [...KEY, 'list', query],
    queryFn: () => mealApi.list(query),
    enabled,
    placeholderData: keepPreviousData,
  });

// 목록 화면용 cursor 누적 조회. 서버 cursor 는 구조를 해석하지 않는 opaque string 으로
// 취급하고, 응답의 nextCursor 를 다음 요청에 그대로 전달한다.
// keepPrevious: 검색어·필터가 바뀌는 동안 이전 목록을 들고 있는다 — 웹 목록은 조건이 바뀔 때마다 화면이 로딩으로
// 비면 검색 입력창까지 사라졌다. 기본은 끔(앱 목록은 조건이 바뀌면 빈 목록 + 로딩을 보여 주는 지금 동작 그대로).
export const useInfiniteMealEntries = (
  query: Omit<ListMealEntriesInput, 'cursor'> = {},
  enabled = true,
  opts: { keepPrevious?: boolean } = {},
) =>
  useInfiniteQuery({
    queryKey: [...KEY, 'list', 'infinite', query],
    queryFn: ({ pageParam }) => mealApi.list({ ...query, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    placeholderData: opts.keepPrevious ? keepPreviousData : undefined,
  });

export const useMealEntry = (id: string | null | undefined) =>
  useQuery({
    queryKey: [...KEY, 'one', id],
    queryFn: () => mealApi.get(id!),
    enabled: !!id,
  });

export const useMealCalendar = (month: string, enabled = true) =>
  useQuery({
    queryKey: [...KEY, 'calendar', month],
    queryFn: () => mealApi.calendar(month),
    enabled: enabled && /^\d{4}-\d{2}$/.test(month),
    placeholderData: keepPreviousData,
  });

export const useMealStats = (from: string, to: string, enabled = true) =>
  useQuery({
    queryKey: [...KEY, 'stats', from, to],
    queryFn: () => mealApi.stats(from, to),
    enabled: enabled && !!from && !!to,
    placeholderData: keepPreviousData,
  });

export interface CreateMealEntryMutationVariables {
  input: CreateMealEntryInputType;
  /** 요청을 시작한 로그인 주체. 생략한 기존 호출자는 종전처럼 캐시를 반영한다. */
  expectedPrincipalId?: string | null;
}

export interface UpdateMealEntryMutationVariables {
  id: string;
  input: UpdateMealEntryInputType;
  expectedPrincipalId?: string | null;
}

export const shouldApplyMealMutationCache = (expectedPrincipalId?: string | null): boolean =>
  expectedPrincipalId === undefined || isMealDraftPrincipalCurrent(expectedPrincipalId);

export const useCreateMealEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input }: CreateMealEntryMutationVariables) => mealApi.create(input),
    onSuccess: (entry, variables) => {
      // 계정 전환 경계의 query clear 뒤 늦은 A mutation이 끝나도 B의 비네임스페이스
      // meal 캐시에 A 응답을 다시 쓰지 않는다.
      if (!shouldApplyMealMutationCache(variables.expectedPrincipalId)) return;
      qc.setQueryData([...KEY, 'one', entry.id], entry);
      invalidateEntries(qc);
    },
  });
};

export const useUpdateMealEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: UpdateMealEntryMutationVariables) =>
      mealApi.update(id, input),
    onSuccess: (entry, variables) => {
      if (!shouldApplyMealMutationCache(variables.expectedPrincipalId)) return;
      qc.setQueryData([...KEY, 'one', entry.id], entry);
      invalidateEntries(qc);
    },
  });
};

export const useDeleteMealEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mealApi.remove(id),
    onSuccess: (_r, id) => {
      qc.removeQueries({ queryKey: [...KEY, 'one', id] });
      invalidateEntries(qc);
    },
  });
};

// 사진 업로드 — 여러 장은 화면에서 순차 호출(진행률 표시). 서버 한도는 요청당 1장·5MB.
export const useUploadMealPhoto = () =>
  useMutation({
    mutationFn: (file: MealPhotoUploadFile) => mealApi.uploadPhoto(file),
  });

/**
 * 끼니별 "내가 보통 먹는 시각". 기록이 쌓여야 바뀌는 값이라 캐시를 길게 둔다.
 * 기록을 저장하면 다른 목록들과 함께 무효화된다.
 */
export const useMealTimePresets = () =>
  useQuery({
    queryKey: [...KEY, 'time-presets'],
    queryFn: () => mealApi.timePresets(),
    staleTime: 30 * 60_000,
  });

/**
 * 수동 입력 보조 — 이름이 정해지면 "지난번엔 어떻게 먹었나"를 가져온다.
 * 이름은 사용자가 타이핑하는 중에 계속 바뀌므로 호출부에서 확정된 값만 넘긴다(빈 값이면 안 부른다).
 * 기록은 자주 안 바뀌니 캐시를 넉넉히 둔다.
 */
export const useRecentMealItem = (name: string | null | undefined) =>
  useQuery({
    queryKey: [...KEY, 'recent-item', name ?? ''],
    queryFn: () => mealApi.recentItem(name!),
    enabled: !!name && name.trim().length > 0,
    staleTime: 5 * 60_000,
  });

/**
 * 입력 화면 빠른 추가 칩 — 자주 먹은 음식(고른 끼니 우선) + 기본 목록. 끼니를 바꿔도 칩 줄이
 * 비었다가 다시 차지 않게 이전 결과를 보여 두고, 기록을 저장하면 다른 목록과 함께 무효화된다.
 */
export const useFrequentMealItems = (slot: MealSlotType | null | undefined, enabled = true) =>
  useQuery({
    queryKey: [...KEY, 'frequent', slot ?? null],
    queryFn: () => mealApi.frequentItems(slot ?? undefined),
    enabled,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

export const useCopyMealPhoto = () =>
  useMutation({ mutationFn: (token: string) => mealApi.copyPhoto(token) });

export const useDeleteMealPhoto = () =>
  useMutation({
    mutationFn: (token: string) => mealApi.removePhoto(token),
  });

// 사진 인식 — 실패해도 화면은 수동 입력으로 이어진다(에러를 던지되 흐름을 막지 않는다).
export const useRecognizeMeal = () =>
  useMutation({
    mutationFn: (input: RecognizeMealInputType) => mealApi.recognize(input),
  });

export const useMealPreference = () =>
  useQuery({
    queryKey: [...KEY, 'preference'],
    queryFn: mealApi.getPreference,
    staleTime: 60_000,
  });

export const useUpdateMealPreference = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMealPreferenceInputType) => mealApi.updatePreference(input),
    onSuccess: (pref) => {
      qc.setQueryData([...KEY, 'preference'], pref);
      // 가중치가 바뀌면 캐시된 추천의 근거가 달라진다. 성별·출생연도·알레르기는 영양소 점검 기준·음식 제안을 바꾼다.
      void qc.invalidateQueries({ queryKey: [...KEY, 'recommendation'] });
      void qc.invalidateQueries({ queryKey: [...KEY, 'nutrition'] });
    },
  });
};

// 사진 URL — 서버가 JWT 를 요구해 <img src>/<Image source> 로 직접 못 쓴다. blob 을 받아
// 플랫폼별로 URL 을 만든다: 웹은 objectURL(메모리 해제 필요), RN 은 data URL(Image 가
// objectURL 을 못 읽는다).
//
// 만든 URL 은 쿼리 캐시(['meal','photo-url',token,variant])에 둔다 — 같은 사진을 그리는 화면이 다시 마운트돼도
// (탭 전환, 상세에서 뒤로, 목록 필터 변경) 다시 받지 않고 바로 그린다. 예전엔 화면마다 effect 로 받아 매번
// 회색 자리표시자부터 다시 깜빡였다. 토큰이 가리키는 사진은 바뀌지 않아 stale 이 없고, 마지막 화면이 떠난 뒤
// PHOTO_URL_GC_MS 가 지나거나 캐시가 비워지면(로그인·로그아웃·식단 전체 삭제) objectURL 을 해제한다.
const PHOTO_URL_GC_MS = 10 * 60_000;

const photoUrlKey = (token: string | null | undefined, variant: 'full' | 'thumb') =>
  [...KEY, 'photo-url', token ?? null, variant] as const;

const revokePhotoUrl = (url: unknown): void => {
  if (typeof url !== 'string' || !url.startsWith('blob:')) return;
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
};

// 캐시에서 빠지는 사진 URL 을 해제한다 — QueryClient 마다 한 번만 구독(첫 사진을 받을 때).
const photoUrlCleanupBound = new WeakSet<QueryClient>();
const bindPhotoUrlCleanup = (qc: QueryClient): void => {
  if (photoUrlCleanupBound.has(qc)) return;
  photoUrlCleanupBound.add(qc);
  qc.getQueryCache().subscribe((event) => {
    if (event.type !== 'removed') return;
    const key = event.query.queryKey;
    if (key[0] === KEY[0] && key[1] === 'photo-url') revokePhotoUrl(event.query.state.data);
  });
};

const loadMealPhotoUrl = async (token: string, variant: 'full' | 'thumb'): Promise<string> => {
  const blob = await mealApi.photoBlob(token, variant);
  // RN 에는 URL.createObjectURL 이 없다(또는 Image 가 못 읽는다) → FileReader data URL.
  const canObjectUrl =
    typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof document !== 'undefined';
  if (canObjectUrl) return URL.createObjectURL(blob);
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('사진 변환 실패'));
    };
    reader.onerror = () => reject(new Error('사진 변환 실패'));
    reader.readAsDataURL(blob);
  });
};

// enabled=false 면 새로 받지 않는다(보일 때만 받는 화면용). 이미 받아 둔 URL 이 있으면 그대로 돌려준다.
export const useMealPhotoUrl = (
  token: string | null | undefined,
  opts: { variant?: 'full' | 'thumb'; enabled?: boolean } = {},
): { url: string | null; error: string | null } => {
  const variant = opts.variant ?? 'thumb';
  const enabled = opts.enabled ?? true;
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: photoUrlKey(token, variant),
    queryFn: async () => {
      bindPhotoUrlCleanup(qc);
      const key = photoUrlKey(token, variant);
      const cache = qc.getQueryCache();
      const running = cache.find({ queryKey: key });
      const previous = qc.getQueryData<string>(key);
      const url = await loadMealPhotoUrl(token!, variant);
      // 받는 사이 이 조회가 캐시에서 빠졌으면(사진을 받는 중 로그아웃·식단 전체 삭제) 결과는 버려진다 — 캐시에
      // 들어가지 못한 URL 은 위 구독이 해제해 줄 수 없으니 만든 자리에서 해제한다.
      if (cache.find({ queryKey: key }) !== running) revokePhotoUrl(url);
      // 다시 받은 경우(['meal'] 통째 무효화) 앞서 만든 objectURL 은 더 쓰이지 않는다.
      else if (previous !== url) revokePhotoUrl(previous);
      return url;
    },
    enabled: enabled && !!token,
    staleTime: Infinity,
    gcTime: PHOTO_URL_GC_MS,
    // 실패는 바로 화면에 알린다(예전 동작 그대로) — 다시 마운트되면 그때 다시 시도한다.
    retry: false,
  });

  return {
    url: token ? (query.data ?? null) : null,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : '사진을 불러오지 못했습니다'
      : null,
  };
};

// ── 추천 ────────────────────────────────────────────────────────────────────
// 화면 진입용 컨텍스트(기록 수·최근 음식·선호·최신 추천) — 추천 탭이 처음부터 뭔가 보여준다.
export const useMealRecommendationContext = () =>
  useQuery({
    queryKey: [...KEY, 'recommendation', 'context'],
    queryFn: mealApi.recommendationContext,
  });

export const useMealRecommendations = (limit = 10) =>
  useQuery({
    queryKey: [...KEY, 'recommendation', 'list', limit],
    queryFn: () => mealApi.listRecommendations(limit),
  });

export const useCreateMealRecommendation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMealRecommendationInputType) => mealApi.recommend(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...KEY, 'recommendation'] });
    },
  });
};

// 추천을 지우면 목록·직전 추천(context)·통계(추천 수락률)가 바뀐다. 지운 추천에서 시작한 기록 초안이 남아 있으면
// 출처만 떼어 낸다 — 서버도 지워진 추천 출처는 일반 기록으로 저장하지만, 초안의 '추천에서 고른 메뉴' 안내가 남지 않게.
const afterRecommendationsDeleted = (
  qc: ReturnType<typeof useQueryClient>,
  deleted: 'all' | readonly string[],
): void => {
  void qc.invalidateQueries({ queryKey: [...KEY, 'recommendation'] });
  void qc.invalidateQueries({ queryKey: [...KEY, 'stats'] });
  const draft = useMealDraftStore.getState();
  const origin = draft.originRecommendationId;
  if (origin && (deleted === 'all' || deleted.includes(origin))) {
    draft.setField('originRecommendationId', null);
  }
};

export const useDeleteMealRecommendation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mealApi.removeRecommendation(id),
    onSuccess: (_r, id) => afterRecommendationsDeleted(qc, [id]),
  });
};

export const useDeleteAllMealRecommendations = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      mealApi.deleteAllRecommendations({ confirmation: MEAL_RECOMMENDATIONS_DELETE_CONFIRMATION }),
    onSuccess: () => afterRecommendationsDeleted(qc, 'all'),
  });
};

export const useMealRecommendationFeedback = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MealRecommendationFeedbackInputType }) =>
      mealApi.recommendationFeedback(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...KEY, 'recommendation'] });
    },
  });
};

export const useMealRecommendationEvent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MealRecommendationEventInputType }) =>
      mealApi.recommendationEvent(id, input),
    onSuccess: (_event, { input }) => {
      // 노출·식당 열기는 추천 응답(선택·평가·후보별 평가)을 바꾸지 않는다 — 무효화하면 추천 화면에 들어오거나
      // '파는 곳'을 펼칠 때마다 context·목록을 한 번씩 더 받는다.
      if (input.kind === 'shown' || input.kind === 'restaurant_opened') return;
      void qc.invalidateQueries({ queryKey: [...KEY, 'recommendation'] });
    },
  });
};

// ── 영양소 점검·영양제 조언 ─────────────────────────────────────────────────────
// 점검은 기록·선호가 바뀌면 무효화된다(['meal','nutrition']). 조언은 LLM 이라 사용자가 눌렀을 때만 만든다 —
// 같은 날·같은 기록이면 서버가 저장본을 주므로 다시 눌러도 한도를 쓰지 않는다(force 만 새로).
// keepPrevious: 기간을 바꾸는 동안 이전 기간 결과를 들고 있는다(화면이 isPlaceholderData 로 흐리게 표시). 기본은
// 끔 — 켜지 않은 화면(앱)은 기간이 바뀌면 로딩을 보여 주는 지금 동작 그대로.
export const useMealNutrition = (days = 14, enabled = true, opts: { keepPrevious?: boolean } = {}) =>
  useQuery({
    queryKey: [...KEY, 'nutrition', 'analysis', days],
    queryFn: () => mealApi.nutrition(days),
    enabled,
    staleTime: 60_000,
    placeholderData: opts.keepPrevious ? keepPreviousData : undefined,
  });

export const useLatestMealNutritionAdvice = (enabled = true) =>
  useQuery({
    queryKey: [...KEY, 'nutrition', 'advice'],
    queryFn: mealApi.latestNutritionAdvice,
    enabled,
  });

export const useCreateMealNutritionAdvice = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateMealNutritionAdviceInputType> = {}) =>
      mealApi.createNutritionAdvice(input),
    onSuccess: (advice) => {
      qc.setQueryData([...KEY, 'nutrition', 'advice'], { advice });
    },
  });
};
