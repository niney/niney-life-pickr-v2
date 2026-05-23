import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateSettlementInputType,
  ListSettlementsQueryType,
} from '@repo/api-contract';
import { settlementApi } from '../api/settlement.api.js';

const KEY = ['settlement'] as const;

export const useCreateSettlement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSettlementInputType) => settlementApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

export const useListSettlements = (query: ListSettlementsQueryType = { offset: 0, limit: 20 }) =>
  useQuery({
    queryKey: [...KEY, 'list', query.placeId ?? null, query.offset, query.limit],
    queryFn: () => settlementApi.list(query),
  });

export const useSettlement = (id: string | null) =>
  useQuery({
    queryKey: [...KEY, 'one', id],
    queryFn: () => settlementApi.get(id ?? ''),
    enabled: !!id,
  });

export const useDeleteSettlement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settlementApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

// 공유 토큰 생성. mutation 성공 시 onShared(token) 결과를 그대로 UI 가 표시.
// 서버가 멱등이라 같은 세션 여러 번 호출해도 같은 토큰이 돌아온다.
export const useCreateSettlementShare = () =>
  useMutation({
    mutationFn: (id: string) => settlementApi.createShare(id),
  });

export const useRevokeSettlementShare = () =>
  useMutation({
    mutationFn: (id: string) => settlementApi.revokeShare(id),
  });

// 공개 read-only 조회. 비로그인 사용자도 token 만 알면 호출 가능. 별도 KEY 로
// 격리해 소유자가 같은 세션을 보고 있어도 캐시 충돌 없음.
export const useSharedSettlement = (token: string | null) =>
  useQuery({
    queryKey: ['settlement', 'shared', token],
    queryFn: () => settlementApi.getShared(token ?? ''),
    enabled: !!token,
  });
