import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type {
  MenuGroupingJobItemType,
  MenuGroupingJobSnapshotType,
  MenuGroupingRestaurantStatusQueryType,
  MenuRankingQueryType,
  MenuRankingResultType,
} from '@repo/api-contract';
import { ApiError } from '../api/client.js';
import {
  buildGroupingJobEventsUrl,
  menuGroupingApi,
} from '../api/menu-grouping.api.js';
import { useActiveGroupingJobStore } from '../stores/activeGroupingJobStore.js';
import { useBulkJob } from './useBulkJob.js';

const isNotFound = (e: unknown): boolean =>
  e instanceof ApiError && e.statusCode === 404;

// 식당 메뉴 순위. placeId null 이면 비활성. 정렬·minMentions 가 바뀌면
// React Query 가 자동 refetch — fetch 하나가 가벼워서 부담 없음.
export const useMenuRanking = (
  placeId: string | null,
  query: Partial<MenuRankingQueryType> = {},
) =>
  useQuery({
    queryKey: ['menu-grouping', 'ranking', placeId, query.sort ?? 'mentions', query.minMentions ?? 1],
    queryFn: async () => {
      if (!placeId) return null;
      try {
        return await menuGroupingApi.getRanking(placeId, query);
      } catch (e) {
        if (isNotFound(e)) return null;
        throw e;
      }
    },
    enabled: !!placeId,
  });

// 단일 식당 그룹핑 실행 (분류 버튼). 성공 시 ranking 캐시 무효화 → UI 자동 갱신.
export const useGroupForRestaurant = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (placeId: string) => menuGroupingApi.groupForRestaurant(placeId),
    onSuccess: (_data, placeId) => {
      qc.invalidateQueries({ queryKey: ['menu-grouping', 'ranking', placeId] });
      qc.invalidateQueries({ queryKey: ['menu-grouping', 'restaurants-status'] });
    },
  });
};

// 관리자 페이지 — 식당 정규화 상태 테이블. 잡 끝날 때마다 invalidate.
// keepPreviousData: 페이지·필터 전환 시 표가 깜빡이지 않음 (이전 페이지 그대로
// 둔 채 새 데이터 가져옴 → 도착 시 교체).
export const useGroupingRestaurantsStatus = (
  query: Partial<MenuGroupingRestaurantStatusQueryType> = {},
) =>
  useQuery({
    queryKey: [
      'menu-grouping',
      'restaurants-status',
      query.q ?? '',
      query.sort ?? 'unmapped',
      query.attention ?? false,
      query.page ?? 1,
      query.pageSize ?? 50,
    ],
    queryFn: () => menuGroupingApi.getRestaurantsStatus(query),
    placeholderData: keepPreviousData,
  });

// batch 잡 시작.
export const useCreateGroupingJob = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (placeIds: string[]) =>
      menuGroupingApi.createGroupingJob({ placeIds }),
    onSuccess: (snap) => {
      // 잡 스냅샷 캐시에 미리 저장 — SSE 가 붙기 전에도 UI 가 즉시 표시.
      qc.setQueryData(['menu-grouping', 'job', snap.jobId], snap);
    },
  });
};

// 잡 상태 + 라이브 SSE 구독 — 공통 생명주기는 useBulkJob (스냅샷 GET → SSE
// item/done 머지, 백오프 재연결, 종료 시 닫기).
// done 시 식당 status 무효화(관리자 테이블 갱신) + 끝난 식당의 ranking 도
// 일괄 무효화 — 어떤 placeId 들이 영향 받았는지 정확히 모르므로 prefix 매치.
// 404(레지스트리 만료 잡)는 stale jobId 로 SSE 재연결이 무한 시도되지 않게
// activeGroupingJob store 정리.
export const useGroupingJob = (
  jobId: string | null,
): { data: MenuGroupingJobSnapshotType | null; isLoading: boolean; error: unknown } => {
  const clearActive = useActiveGroupingJobStore((s) => s.clear);
  return useBulkJob<MenuGroupingJobItemType, MenuGroupingJobSnapshotType>(jobId, {
    queryKey: ['menu-grouping', 'job', jobId],
    fetchSnapshot: (id) => menuGroupingApi.getGroupingJob(id),
    buildEventsUrl: buildGroupingJobEventsUrl,
    itemKey: (it) => it.placeId,
    onNotFound: clearActive,
    invalidateOnDone: [
      ['menu-grouping', 'restaurants-status'],
      ['menu-grouping', 'ranking'],
    ],
  });
};

// 사용처에서 `MenuRankingResultType` 노출 편의용.
export type { MenuRankingResultType };
