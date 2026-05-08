import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  MapProviderIdType,
  UpdateMapProviderInputType,
} from '@repo/api-contract';
import { settingsMapApi } from '../api/settings-map.api.js';

export const useMapProviders = () =>
  useQuery({
    queryKey: ['settings', 'map', 'providers'],
    queryFn: settingsMapApi.list,
  });

export const useUpdateMapProvider = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: MapProviderIdType;
      input: UpdateMapProviderInputType;
    }) => settingsMapApi.update(id, input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['settings', 'map', 'providers'] });
      // 키가 바뀌었을 수 있으니 secret 캐시도 무효화 — VWorldMap 이 이걸로
      // SDK init URL 을 만들기 때문에 stale 키로 init 되면 도메인 화이트리스트
      // 검증이 실패한다.
      qc.invalidateQueries({ queryKey: ['settings', 'map', 'secret', vars.id] });
    },
  });
};

export const useDeleteMapProvider = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: MapProviderIdType) => settingsMapApi.remove(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['settings', 'map', 'providers'] });
      qc.invalidateQueries({ queryKey: ['settings', 'map', 'secret', id] });
    },
  });
};

// 평문 키 fetch. enabled 로 호출 시점 제어 — 키가 등록되지 않은 환경에서
// 매 페이지 로드마다 secret 엔드포인트를 때리지 않게 호출자가 hasApiKey
// 를 먼저 본 뒤 enabled=true 로 호출하는 패턴.
export const useMapProviderSecret = (id: MapProviderIdType, enabled = true) =>
  useQuery({
    queryKey: ['settings', 'map', 'secret', id],
    queryFn: () => settingsMapApi.getSecret(id),
    enabled,
    // 키는 자주 바뀌지 않으니 한 번 받아서 세션 동안 유지.
    staleTime: Infinity,
    gcTime: Infinity,
  });

// 공개 맛집 지도 페이지가 vworld WMTS 호출에 쓸 키. 키 미등록이면 404 — 호출
// 자가 query.error 의 ApiError.statusCode 로 분기해 placeholder 노출.
export const useMapPublicConfig = (enabled = true) =>
  useQuery({
    queryKey: ['settings', 'map', 'public'],
    queryFn: settingsMapApi.publicConfig,
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    // 404 는 정상 상태(키 미등록) — 자동 retry 안 함.
    retry: false,
  });
