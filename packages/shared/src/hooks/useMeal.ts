import { useEffect, useState } from 'react';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  CreateMealEntryInputType,
  CreateMealRecommendationInputType,
  DeleteMealDataInputType,
  MealRecommendationFeedbackInputType,
  RecognizeMealInputType,
  UpdateMealEntryInputType,
  UpdateMealPreferenceInputType,
} from '@repo/api-contract';
import { mealApi, type ListMealEntriesInput, type MealPhotoUploadFile } from '../api/meal.api.js';

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
};

// 전체 내보내기는 사용자 동작 때만 큰 JSON 을 받도록 mutation 으로 제공한다.
export const useExportMealData = () =>
  useMutation({ mutationFn: () => mealApi.exportData() });

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
export const useInfiniteMealEntries = (
  query: Omit<ListMealEntriesInput, 'cursor'> = {},
  enabled = true,
) =>
  useInfiniteQuery({
    queryKey: [...KEY, 'list', 'infinite', query],
    queryFn: ({ pageParam }) => mealApi.list({ ...query, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
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

export const useCreateMealEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMealEntryInputType) => mealApi.create(input),
    onSuccess: (entry) => {
      qc.setQueryData([...KEY, 'one', entry.id], entry);
      invalidateEntries(qc);
    },
  });
};

export const useUpdateMealEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMealEntryInputType }) =>
      mealApi.update(id, input),
    onSuccess: (entry) => {
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
      // 가중치가 바뀌면 캐시된 추천의 근거가 달라진다.
      void qc.invalidateQueries({ queryKey: [...KEY, 'recommendation'] });
    },
  });
};

// 사진 URL — 서버가 JWT 를 요구해 <img src>/<Image source> 로 직접 못 쓴다. blob 을 받아
// 플랫폼별로 URL 을 만든다: 웹은 objectURL(메모리 해제 필요), RN 은 data URL(Image 가
// objectURL 을 못 읽는다). 외부 리소스 수명 관리라 useEffect 가 맞는 자리.
export const useMealPhotoUrl = (
  token: string | null | undefined,
  opts: { variant?: 'full' | 'thumb'; enabled?: boolean } = {},
): { url: string | null; error: string | null } => {
  const variant = opts.variant ?? 'thumb';
  const enabled = opts.enabled ?? true;
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !enabled) {
      setUrl(null);
      return undefined;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setError(null);
    void (async () => {
      try {
        const blob = await mealApi.photoBlob(token, variant);
        if (cancelled) return;
        // RN 에는 URL.createObjectURL 이 없다(또는 Image 가 못 읽는다) → FileReader data URL.
        const canObjectUrl =
          typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof document !== 'undefined';
        if (canObjectUrl) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          if (cancelled) return;
          if (typeof reader.result === 'string') setUrl(reader.result);
          else setError('사진 변환 실패');
        };
        reader.onerror = () => {
          if (!cancelled) setError('사진 변환 실패');
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '사진을 불러오지 못했습니다');
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token, variant, enabled]);

  return { url, error };
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
