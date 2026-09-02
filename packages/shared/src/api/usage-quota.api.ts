import {
  Routes,
  type UpdateUsageQuotaSettingInputType,
  type UsageQuotaFeatureType,
  type UsageQuotaOverviewType,
  type UsageQuotaSettingType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// 공용 사용량 한도 — 어드민 "설정 > 사용량 한도".
export const usageQuotaApi = {
  overview: (date?: string) =>
    apiFetch<UsageQuotaOverviewType>(`${Routes.UsageQuota.overview}${date ? `?date=${date}` : ''}`),

  update: (feature: UsageQuotaFeatureType, input: UpdateUsageQuotaSettingInputType) =>
    apiFetch<UsageQuotaSettingType>(Routes.UsageQuota.setting(feature), {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
};
