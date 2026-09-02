import { z } from 'zod';

// 공용 사용량 한도 — 로그인 없이 쓰는 비용성 기능(LLM 호출 등)의 기기·IP·전역 일일 한도.
// 타로가 첫 사용처이고 리뷰 질문·스마트 픽도 붙일 수 있다. 값은 어드민 "설정 > 사용량 한도"
// 에서 조정하며 행이 없으면 코드 기본값(friendly usage-quota.service.ts).
//
// 회원은 게스트·IP 일일 한도를 건너뛴다(사용자 결정 2026-09-02). 전역 일일 예산만 비용
// 안전망으로 전원에게 적용하되, 게스트는 예산의 guestCutoffPct % 에서 먼저 끊긴다.
// 분당 IP 버스트(ipPerMinute)는 폭주 클라이언트 방어라 회원에게도 적용.

export const UsageQuotaFeature = z.enum(['tarot-reading']);
export type UsageQuotaFeatureType = z.infer<typeof UsageQuotaFeature>;

// 0 은 "제한 없음"(ipPerMinute 제외).
export const UsageQuotaSetting = z.object({
  feature: UsageQuotaFeature,
  enabled: z.boolean(),
  guestPerDay: z.number().int().min(0).max(100_000),
  ipPerDay: z.number().int().min(0).max(100_000),
  ipPerMinute: z.number().int().min(1).max(10_000),
  globalPerDay: z.number().int().min(0).max(1_000_000),
  guestCutoffPct: z.number().int().min(0).max(100),
  // 행이 없어 기본값으로 동작 중이면 null.
  updatedAt: z.string().nullable(),
});
export type UsageQuotaSettingType = z.infer<typeof UsageQuotaSetting>;

export const UpdateUsageQuotaSettingInput = UsageQuotaSetting.omit({
  feature: true,
  updatedAt: true,
}).partial();
export type UpdateUsageQuotaSettingInputType = z.infer<typeof UpdateUsageQuotaSettingInput>;

export const UsageQuotaTopKey = z.object({ key: z.string(), count: z.number().int() });
export type UsageQuotaTopKeyType = z.infer<typeof UsageQuotaTopKey>;

// 그날의 카운터 집계 — 전역 소비량(LLM 예산 진행률) + scope 별 합계 + 상위 키.
export const UsageQuotaUsage = z.object({
  date: z.string(),
  global: z.number().int(),
  guestTotal: z.number().int(),
  ipTotal: z.number().int(),
  userTotal: z.number().int(),
  topGuests: z.array(UsageQuotaTopKey),
  topIps: z.array(UsageQuotaTopKey),
});
export type UsageQuotaUsageType = z.infer<typeof UsageQuotaUsage>;

export const UsageQuotaOverviewItem = z.object({
  setting: UsageQuotaSetting,
  usage: UsageQuotaUsage,
});
export type UsageQuotaOverviewItemType = z.infer<typeof UsageQuotaOverviewItem>;

export const UsageQuotaOverview = z.object({
  date: z.string(),
  items: z.array(UsageQuotaOverviewItem),
});
export type UsageQuotaOverviewType = z.infer<typeof UsageQuotaOverview>;

export const UsageQuotaOverviewQuery = z.object({
  // KST yyyy-mm-dd. 생략하면 오늘.
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type UsageQuotaOverviewQueryType = z.infer<typeof UsageQuotaOverviewQuery>;
