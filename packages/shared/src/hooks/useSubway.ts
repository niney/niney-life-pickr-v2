import { useQuery } from '@tanstack/react-query';
import { subwayApi } from '../api/subway.api.js';

// 역 라이브 검색 — 역사마스터를 로컬 DB 에 적재해 조회하므로 쿼터 부담이 0 이고,
// 마스터가 사실상 불변이라 staleTime 24h(같은 역명 재검색 시 재호출 없음).
// placeholderData 로 타이핑 중 이전 결과를 유지해 잔상 없이 갱신한다. 타이핑
// 지연(디바운스)은 호출부(웹)가 useDeferredValue 로 처리 — 여기엔 타이머/effect 없음.
export const useSubwayStationSearch = (q: string) => {
  const trimmed = q.trim();
  // 서버 q 제약(1~50자) FE 미러 — 범위 밖이면 호출 자체를 막는다(빈 검색어 포함).
  const enabled = trimmed.length >= 1 && trimmed.length <= 50;
  return useQuery({
    queryKey: ['subway', 'stations', 'search', trimmed],
    queryFn: () => subwayApi.searchStations(trimmed),
    enabled,
    staleTime: 86_400_000,
    // v5 는 disabled 쿼리에도 placeholderData 를 채운다 — 빈 검색어로 돌아왔을 때
    // 이전 결과가 잔상으로 남지 않게 enabled 일 때만 유지.
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};
