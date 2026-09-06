import { z } from 'zod';

export const SAJU_G_GUEST_KEY_HEADER = 'x-guest-key';
export const SajuGElement = z.enum(['wood', 'fire', 'earth', 'metal', 'water']);
export const SajuGKind = z.enum(['natal', 'annual', 'daily']);
export type SajuGKindType = z.infer<typeof SajuGKind>;
export const SajuGBirth = z
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
export type SajuGBirthType = z.infer<typeof SajuGBirth>;
export const CreateSajuGReadingInput = z.object({
  birth: SajuGBirth,
  kind: SajuGKind.default('natal'),
  note: z.string().trim().max(200).default(''),
});
export type CreateSajuGReadingInputType = z.infer<typeof CreateSajuGReadingInput>;
const Pillar = z.object({
  key: z.enum(['year', 'month', 'day', 'hour']),
  label: z.string(),
  ganZhi: z.string().nullable(),
  pronunciation: z.string().nullable(),
  stemElement: SajuGElement.nullable(),
  branchElement: SajuGElement.nullable(),
  tenGod: z.string().nullable(),
  candidates: z.array(z.string()),
  hiddenStems: z.array(
    z.object({
      hanja: z.string(),
      ko: z.string(),
      element: SajuGElement,
      tenGod: z.string().nullable(),
    }),
  ),
});
export const SajuGElementCount = z.object({
  element: SajuGElement,
  count: z.number().int().min(0).max(8),
});
const Fact = z.object({ id: z.string(), label: z.string(), description: z.string() });
export const SajuGChart = z.object({
  calculationVersion: z.number().int(),
  solarDate: z.string(),
  lunarDate: z.string(),
  timeLabel: z.string(),
  standardTime: z.string().nullable(),
  dayBoundary: z.enum(['midnight', 'zi']),
  pillars: z.array(Pillar).length(4),
  elements: z.array(SajuGElementCount).length(5),
  unknownCharacters: z.number().int().min(0).max(8),
  dayMaster: z
    .object({
      hanja: z.string(),
      ko: z.string(),
      element: SajuGElement,
      symbol: z.string(),
      title: z.string(),
      description: z.string(),
    })
    .nullable(),
  notices: z.array(z.string()),
  facts: z.array(Fact),
  period: z.object({
    kind: SajuGKind,
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
export type SajuGChartType = z.infer<typeof SajuGChart>;
export const SajuGReport = z.object({
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
export type SajuGReportType = z.infer<typeof SajuGReport>;
export const SajuGReadingResult = z.object({
  readingId: z.string().nullable(),
  receipt: z.string().nullable(),
  birth: SajuGBirth,
  kind: SajuGKind,
  chart: SajuGChart,
  report: SajuGReport,
  source: z.enum(['ai', 'basic']),
  model: z.string().nullable(),
  promptVersion: z.number().int(),
  fallbackReason: z.enum(['not_configured', 'quota', 'unavailable']).nullable(),
  remainingToday: z.number().int().nullable(),
  createdAt: z.string(),
});
export type SajuGReadingResultType = z.infer<typeof SajuGReadingResult>;
export const SajuGReceiptInput = z.object({ receipt: z.string().min(20).max(64) });
export const SajuGReadingSummary = z.object({
  id: z.string(),
  kind: SajuGKind,
  title: z.string(),
  period: z.string(),
  source: z.enum(['ai', 'basic']),
  createdAt: z.string(),
});
export const ListSajuGReadingsResult = z.object({
  items: z.array(SajuGReadingSummary),
  nextCursor: z.string().nullable(),
});
export type ListSajuGReadingsResultType = z.infer<typeof ListSajuGReadingsResult>;
export const SAJU_G_PROFILES_MAX = 20;
export const SajuGProfileInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, '별명을 입력해 주세요.')
    .max(24)
    .regex(/^[^\p{Cc}]+$/u, '별명에는 줄바꿈이나 제어 문자를 사용할 수 없어요.'),
  birth: SajuGBirth,
});
export const SajuGProfile = SajuGProfileInput.extend({
  id: z.string().min(1).max(64),
  revision: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const UpdateSajuGProfileInput = SajuGProfileInput.extend({
  revision: z.number().int().positive(),
});
export const SajuGProfileList = z.object({ items: z.array(SajuGProfile).max(SAJU_G_PROFILES_MAX) });
export type SajuGProfileInputType = z.infer<typeof SajuGProfileInput>;
export type SajuGProfileType = z.infer<typeof SajuGProfile>;
export const SajuGRelationship = z.enum(['partner', 'friend', 'family', 'colleague']);
export type SajuGRelationshipType = z.infer<typeof SajuGRelationship>;
export const SajuGPairBirths = z.object({ first: SajuGBirth, second: SajuGBirth });
export const CreateSajuGPairInput = SajuGPairBirths.extend({
  relationship: SajuGRelationship.default('partner'),
  note: z.string().trim().max(200).default(''),
});
export type CreateSajuGPairInputType = z.infer<typeof CreateSajuGPairInput>;
export const SajuGConnection = z.enum([
  'same',
  'first-nurtures',
  'second-nurtures',
  'first-regulates',
  'second-regulates',
  'unknown',
]);
export const SajuGPairChart = z.object({
  calculationVersion: z.number().int(),
  first: SajuGChart,
  second: SajuGChart,
  connection: SajuGConnection,
  title: z.string(),
  description: z.string(),
  firstToSecond: z.string().nullable(),
  secondToFirst: z.string().nullable(),
  facts: z.array(Fact),
  notices: z.array(z.string()),
});
export type SajuGPairChartType = z.infer<typeof SajuGPairChart>;
export const SajuGPairResult = SajuGReadingResult.pick({
  source: true,
  model: true,
  promptVersion: true,
  fallbackReason: true,
  remainingToday: true,
  createdAt: true,
}).extend({ chart: SajuGPairChart, report: SajuGReport });
export type SajuGPairResultType = z.infer<typeof SajuGPairResult>;
export const ListSajuGReadingsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(64).optional(),
});
export const CreateSajuGShareInput = z
  .object({
    receipt: z.string().min(20).max(64).optional(),
    readingId: z.string().max(64).optional(),
    birth: SajuGBirth.optional(),
    pair: SajuGPairBirths.optional(),
  })
  .refine(
    (v) => [v.receipt, v.readingId, v.birth, v.pair].filter(Boolean).length === 1,
    '결과를 하나 선택해 주세요.',
  );
export type CreateSajuGShareInputType = z.infer<typeof CreateSajuGShareInput>;
// 공유에는 원본 날짜·명식·질문·AI 자유문장을 포함하지 않는다.
export const PublicSajuGShare = z.object({
  title: z.string(),
  description: z.string(),
  symbol: z.string(),
  element: SajuGElement.nullable(),
  elements: z.array(SajuGElementCount),
  unknownCharacters: z.number().int(),
  pair: z
    .object({
      element: SajuGElement.nullable(),
      symbol: z.string(),
      elements: z.array(SajuGElementCount).length(5),
      unknownCharacters: z.number().int().min(0).max(8),
      connection: SajuGConnection,
    })
    .optional(),
});
export type PublicSajuGShareType = z.infer<typeof PublicSajuGShare>;
// 새 공유 주소는 10자, 이전에 발급한 32자 주소도 계속 조회·취소할 수 있다.
export const SajuGShareToken = z.string().regex(/^(?:[A-Za-z0-9_-]{10}|[A-Za-z0-9_-]{32})$/);
export const SajuGShareResult = z.object({
  token: SajuGShareToken,
  path: z.string(),
  revokeToken: z.string(),
});
export type SajuGShareResultType = z.infer<typeof SajuGShareResult>;
export const SajuGShareError = z.object({
  statusCode: z.literal(503),
  error: z.literal('Service Unavailable'),
  message: z.string(),
});
export const RevokeSajuGShareInput = z.object({ revokeToken: z.string().min(20).max(64) });
