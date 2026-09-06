import { z } from 'zod';

export const SAJU_GUEST_KEY_HEADER = 'x-guest-key';
export const SajuElement = z.enum(['wood', 'fire', 'earth', 'metal', 'water']);
export const SajuKind = z.enum(['natal', 'annual', 'daily']);
export type SajuKindType = z.infer<typeof SajuKind>;
export const SajuBirth = z
  .object({
    date: z
      .string()
      .regex(
        /^(1899|19\d{2}|20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
        '생년월일을 확인해 주세요.',
      ),
    calendar: z.enum(['solar', 'lunar']).default('solar'),
    leapMonth: z.boolean().default(false),
    timeAccuracy: z.enum(['exact', 'range', 'unknown']).default('unknown'),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .default(null),
    timeRange: z.enum(['night', 'morning', 'afternoon', 'evening']).nullable().default(null),
    timeZone: z.literal('Asia/Seoul').default('Asia/Seoul'),
    dayBoundary: z.enum(['midnight', 'zi']).default('midnight'),
    disambiguation: z.enum(['reject', 'earlier', 'later']).default('reject'),
  })
  .superRefine((v, ctx) => {
    if (v.calendar === 'solar' && v.leapMonth)
      ctx.addIssue({
        code: 'custom',
        path: ['leapMonth'],
        message: '윤달은 음력에서만 선택해 주세요.',
      });
    if (v.timeAccuracy === 'exact' && !v.time)
      ctx.addIssue({ code: 'custom', path: ['time'], message: '태어난 시간을 입력해 주세요.' });
    if (v.timeAccuracy === 'range' && !v.timeRange)
      ctx.addIssue({
        code: 'custom',
        path: ['timeRange'],
        message: '대략의 시간대를 골라 주세요.',
      });
  });
export type SajuBirthType = z.infer<typeof SajuBirth>;
export const CreateSajuReadingInput = z.object({
  birth: SajuBirth,
  kind: SajuKind.default('natal'),
  note: z.string().trim().max(200).default(''),
});
export type CreateSajuReadingInputType = z.infer<typeof CreateSajuReadingInput>;
const Pillar = z.object({
  key: z.enum(['year', 'month', 'day', 'hour']),
  label: z.string(),
  ganZhi: z.string().nullable(),
  pronunciation: z.string().nullable(),
  stemElement: SajuElement.nullable(),
  branchElement: SajuElement.nullable(),
  tenGod: z.string().nullable(),
  candidates: z.array(z.string()),
  hiddenStems: z.array(
    z.object({
      hanja: z.string(),
      ko: z.string(),
      element: SajuElement,
      tenGod: z.string().nullable(),
    }),
  ),
});
export const SajuElementCount = z.object({
  element: SajuElement,
  count: z.number().int().min(0).max(8),
});
const Fact = z.object({ id: z.string(), label: z.string(), description: z.string() });
export const SajuChart = z.object({
  calculationVersion: z.number().int(),
  solarDate: z.string(),
  lunarDate: z.string(),
  timeLabel: z.string(),
  standardTime: z.string().nullable(),
  dayBoundary: z.enum(['midnight', 'zi']),
  pillars: z.array(Pillar).length(4),
  elements: z.array(SajuElementCount).length(5),
  unknownCharacters: z.number().int().min(0).max(8),
  dayMaster: z
    .object({
      hanja: z.string(),
      ko: z.string(),
      element: SajuElement,
      symbol: z.string(),
      title: z.string(),
      description: z.string(),
    })
    .nullable(),
  notices: z.array(z.string()),
  facts: z.array(Fact),
  period: z.object({
    kind: SajuKind,
    label: z.string(),
    key: z.string(),
    ganZhi: z.string().nullable(),
    relation: z.string().nullable(),
    months: z.array(
      z.object({
        month: z.number().int(),
        term: z.string(),
        start: z.string(),
        end: z.string(),
        ganZhi: z.string(),
        relation: z.string().nullable(),
        description: z.string(),
      }),
    ),
  }),
});
export type SajuChartType = z.infer<typeof SajuChart>;
export const SajuReport = z.object({
  headline: z.string().min(1).max(100),
  summary: z.string().min(1).max(1500),
  sections: z
    .array(
      z.object({
        id: z.string().max(32),
        title: z.string().min(1).max(60),
        text: z.string().min(1).max(1800),
        evidenceIds: z.array(z.string().max(64)).min(1).max(6),
      }),
    )
    .min(3)
    .max(5),
  practice: z.string().min(1).max(400),
  reflection: z.string().min(1).max(300),
});
export type SajuReportType = z.infer<typeof SajuReport>;
export const SajuReadingResult = z.object({
  readingId: z.string().nullable(),
  receipt: z.string().nullable(),
  birth: SajuBirth,
  kind: SajuKind,
  chart: SajuChart,
  report: SajuReport,
  source: z.enum(['ai', 'basic']),
  model: z.string().nullable(),
  promptVersion: z.number().int(),
  fallbackReason: z.enum(['not_configured', 'quota', 'unavailable']).nullable(),
  remainingToday: z.number().int().nullable(),
  createdAt: z.string(),
});
export type SajuReadingResultType = z.infer<typeof SajuReadingResult>;
export const SajuReceiptInput = z.object({ receipt: z.string().min(20).max(64) });
export const SajuReadingSummary = z.object({
  id: z.string(),
  kind: SajuKind,
  title: z.string(),
  period: z.string(),
  source: z.enum(['ai', 'basic']),
  createdAt: z.string(),
});
export const ListSajuReadingsResult = z.object({
  items: z.array(SajuReadingSummary),
  nextCursor: z.string().nullable(),
});
export type ListSajuReadingsResultType = z.infer<typeof ListSajuReadingsResult>;
export const SAJU_PROFILES_MAX = 20;
export const SajuProfileInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, '별명을 입력해 주세요.')
    .max(24)
    .regex(/^[^\p{Cc}]+$/u, '별명에는 줄바꿈이나 제어 문자를 사용할 수 없어요.'),
  birth: SajuBirth,
});
export const SajuProfile = SajuProfileInput.extend({
  id: z.string().min(1).max(64),
  revision: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const UpdateSajuProfileInput = SajuProfileInput.extend({
  revision: z.number().int().positive(),
});
export const SajuProfileList = z.object({ items: z.array(SajuProfile).max(SAJU_PROFILES_MAX) });
export type SajuProfileInputType = z.infer<typeof SajuProfileInput>;
export type SajuProfileType = z.infer<typeof SajuProfile>;
export const SajuRelationship = z.enum(['partner', 'friend', 'family', 'colleague']);
export type SajuRelationshipType = z.infer<typeof SajuRelationship>;
export const SajuPairBirths = z.object({ first: SajuBirth, second: SajuBirth });
export const CreateSajuPairInput = SajuPairBirths.extend({
  relationship: SajuRelationship.default('partner'),
  note: z.string().trim().max(200).default(''),
});
export type CreateSajuPairInputType = z.infer<typeof CreateSajuPairInput>;
export const SajuConnection = z.enum([
  'same',
  'first-nurtures',
  'second-nurtures',
  'first-regulates',
  'second-regulates',
  'unknown',
]);
export const SajuPairChart = z.object({
  calculationVersion: z.number().int(),
  first: SajuChart,
  second: SajuChart,
  connection: SajuConnection,
  title: z.string(),
  description: z.string(),
  firstToSecond: z.string().nullable(),
  secondToFirst: z.string().nullable(),
  facts: z.array(Fact),
  notices: z.array(z.string()),
});
export type SajuPairChartType = z.infer<typeof SajuPairChart>;
export const SajuPairResult = SajuReadingResult.pick({
  source: true,
  model: true,
  promptVersion: true,
  fallbackReason: true,
  remainingToday: true,
  createdAt: true,
}).extend({ chart: SajuPairChart, report: SajuReport });
export type SajuPairResultType = z.infer<typeof SajuPairResult>;
export const ListSajuReadingsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(64).optional(),
});
export const CreateSajuShareInput = z
  .object({
    receipt: z.string().min(20).max(64).optional(),
    readingId: z.string().max(64).optional(),
    birth: SajuBirth.optional(),
    pair: SajuPairBirths.optional(),
  })
  .refine(
    (v) => [v.receipt, v.readingId, v.birth, v.pair].filter(Boolean).length === 1,
    '결과를 하나 선택해 주세요.',
  );
export type CreateSajuShareInputType = z.infer<typeof CreateSajuShareInput>;
// 공유에는 원본 날짜·명식·질문·AI 자유문장을 포함하지 않는다.
export const PublicSajuShare = z.object({
  title: z.string(),
  description: z.string(),
  symbol: z.string(),
  element: SajuElement.nullable(),
  elements: z.array(SajuElementCount),
  unknownCharacters: z.number().int(),
  pair: z
    .object({
      element: SajuElement.nullable(),
      symbol: z.string(),
      elements: z.array(SajuElementCount).length(5),
      unknownCharacters: z.number().int().min(0).max(8),
      connection: SajuConnection,
    })
    .optional(),
});
export type PublicSajuShareType = z.infer<typeof PublicSajuShare>;
export const SajuShareResult = z.object({
  token: z.string(),
  path: z.string(),
  revokeToken: z.string(),
});
export type SajuShareResultType = z.infer<typeof SajuShareResult>;
export const RevokeSajuShareInput = z.object({ revokeToken: z.string().min(20).max(64) });
