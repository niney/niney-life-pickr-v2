import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateUsageQuotaSettingInputType, UsageQuotaFeatureType } from '@repo/api-contract';
import { usageQuotaApi } from '../api/usage-quota.api.js';

// 공용 사용량 한도 훅 — 어드민 전용.

const overviewKey = (date?: string) => ['admin', 'usage-quota', date ?? 'today'] as const;

export const useUsageQuotaOverview = (date?: string) =>
  useQuery({
    queryKey: overviewKey(date),
    queryFn: () => usageQuotaApi.overview(date),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

export const useUpdateUsageQuota = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ feature, input }: { feature: UsageQuotaFeatureType; input: UpdateUsageQuotaSettingInputType }) =>
      usageQuotaApi.update(feature, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'usage-quota'] });
    },
  });
};
