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
