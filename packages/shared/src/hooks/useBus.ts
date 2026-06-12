import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BusStationSearchResultType } from '@repo/api-contract';
import { busApi } from '../api/bus.api.js';

// 제출형 검색 — q 는 호출자가 Enter/버튼으로 확정한 검색어. 서버가 30일
// DB 캐시를 들고 있고 정류장 정보는 장기 불변이라 staleTime 24h — 같은
// 키워드 재방문 시 일 1,000건(개발계정) 한도를 안 깎는다.
export const useBusStationSearch = (q: string) => {
  const trimmed = q.trim();
  // 서버 q 제약(2~50자) FE 미러 — 범위 밖이면 호출 자체를 막는다.
  const enabled = trimmed.length >= 2 && trimmed.length <= 50;
  return useQuery({
    queryKey: ['bus', 'stations', 'search', trimmed],
    queryFn: () => busApi.searchStations(trimmed),
    enabled,
    staleTime: 86_400_000,
    // v5 는 disabled 쿼리에도 placeholderData 를 채운다 — 빈/짧은 검색어로
    // 돌아왔을 때 이전 결과가 잔상으로 남지 않게 enabled 일 때만 유지.
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

// 강제 새로고침(force=true). 성공 시 같은 검색 키 캐시를 응답으로 직접 교체 —
// invalidate 로 일반(force 없는) 요청을 한 번 더 보내지 않는다.
export const useBusStationsRefresh = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (q: string) => busApi.searchStations(q.trim(), { force: true }),
    onSuccess: async (data, q) => {
      const queryKey = ['bus', 'stations', 'search', q.trim()];
      // 같은 키로 진행 중인 일반 쿼리가 뒤늦게 응답해 force 결과를 롤백하는
      // 레이스 차단 — 취소를 기다린 뒤 캐시 교체.
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<BusStationSearchResultType>(queryKey, data);
    },
  });
};
