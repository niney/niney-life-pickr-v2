import { z } from 'zod';

// 타로 — 로그인 없이 쓰는 공개 리딩 + 회원 기록. 카드 78장·스프레드·뽑기 규칙의 단일 출처는
// @repo/utils(tarotCards.ts / tarot.ts)이고, 여기 enum 은 그와 **같은 값·순서**여야 한다
// (api-contract 는 utils 에 의존하지 않는다 — friendly tarot.test 가 동일성을 검증).
//
// 뽑기는 클라이언트가 한다(부채꼴에서 직접 고르는 경험, 결과에 이해관계 없음). 서버는 카드
// id·중복·자리 순서만 검증하고 해석을 만든다. 질문은 개인적일 수 있어 게스트 리딩은 저장하지
// 않고(공유 시에만 — 3차), 회원 리딩만 자동 저장한다. 게스트 식별은 X-Guest-Key 헤더
// (기기 영속 UUID, 클라 선언값 — 기기 단위 한도용, 완벽한 식별이 아님을 수용).

export const TAROT_QUESTION_MAX_LENGTH = 200;
export const TAROT_CHOICE_MAX_LENGTH = 40;
export const TAROT_GUEST_KEY_HEADER = 'x-guest-key';

export const TarotSpreadId = z.enum(['daily', 'three-ppf', 'three-sar', 'choice', 'celtic']);
export type TarotSpreadIdType = z.infer<typeof TarotSpreadId>;

export const TarotTopic = z.enum(['general', 'love', 'work', 'money', 'relationship', 'choice']);
export type TarotTopicType = z.infer<typeof TarotTopic>;

// major-00~21 / <suit>-01~10 / <suit>-page|knight|queen|king — utils 의 id 규칙과 동일.
export const TarotCardId = z
  .string()
  .regex(
    /^(major-(0\d|1\d|2[01])|(wands|cups|swords|pentacles)-(0[1-9]|10|page|knight|queen|king))$/,
    '알 수 없는 카드입니다.',
  );

export const TarotDrawnCard = z.object({
  cardId: TarotCardId,
  position: z.string().min(1).max(32),
  reversed: z.boolean(),
});
export type TarotDrawnCardType = z.infer<typeof TarotDrawnCard>;

// 선택 타로(choice 스프레드)의 두 선택지.
export const TarotChoices = z.object({
  a: z.string().trim().min(1).max(TAROT_CHOICE_MAX_LENGTH),
  b: z.string().trim().min(1).max(TAROT_CHOICE_MAX_LENGTH),
});
export type TarotChoicesType = z.infer<typeof TarotChoices>;

export const CreateTarotReadingInput = z.object({
  spreadId: TarotSpreadId,
  topic: TarotTopic.default('general'),
  question: z.string().trim().max(TAROT_QUESTION_MAX_LENGTH).default(''),
  choices: TarotChoices.nullable().default(null),
  // 고른 순서 = 스프레드 자리 순서. 서버가 utils 의 validateDrawnCards 로 검증.
  cards: z.array(TarotDrawnCard).min(1).max(10),
});
export type CreateTarotReadingInputType = z.infer<typeof CreateTarotReadingInput>;

// llm: Ollama Cloud 해석 / static: LLM 부재·실패·한도 초과 시 카드 정적 의미 조립.
export const TarotReadingSource = z.enum(['llm', 'static']);
export type TarotReadingSourceType = z.infer<typeof TarotReadingSource>;

export const TarotCardReading = z.object({
  cardId: TarotCardId,
  position: z.string(),
  positionLabel: z.string(),
  reversed: z.boolean(),
  nameKo: z.string(),
  nameEn: z.string(),
  keywords: z.array(z.string()),
  text: z.string(),
});
export type TarotCardReadingType = z.infer<typeof TarotCardReading>;

// 선택 타로 판정 — either 는 카드만으로 우열이 없을 때.
export const TarotChoiceVerdict = z.object({
  recommended: z.enum(['A', 'B', 'either']),
  confidence: z.enum(['low', 'mid', 'high']),
  reason: z.string(),
});
export type TarotChoiceVerdictType = z.infer<typeof TarotChoiceVerdict>;

// 게스트만 숫자(기기 일일 한도 잔여). 회원은 null(한도 없음).
export const TarotQuota = z.object({ remainingToday: z.number().int().nullable() });
export type TarotQuotaType = z.infer<typeof TarotQuota>;

export const TarotReadingResult = z.object({
  // 회원 자동 저장 id. 게스트는 null.
  readingId: z.string().nullable(),
  spreadId: TarotSpreadId,
  topic: TarotTopic,
  question: z.string(),
  choices: TarotChoices.nullable(),
  source: TarotReadingSource,
  model: z.string().nullable(),
  cards: z.array(TarotCardReading),
  summary: z.string(),
  advice: z.string(),
  keyword: z.string(),
  choice: TarotChoiceVerdict.nullable(),
  createdAt: z.string(),
  quota: TarotQuota,
});
export type TarotReadingResultType = z.infer<typeof TarotReadingResult>;

// 회원 기록 목록 항목.
export const TarotReadingSummary = z.object({
  id: z.string(),
  spreadId: TarotSpreadId,
  topic: TarotTopic,
  question: z.string(),
  keyword: z.string(),
  source: TarotReadingSource,
  cards: z.array(z.object({ cardId: TarotCardId, reversed: z.boolean() })),
  createdAt: z.string(),
});
export type TarotReadingSummaryType = z.infer<typeof TarotReadingSummary>;

export const ListTarotReadingsQuery = z.object({
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListTarotReadingsQueryType = z.infer<typeof ListTarotReadingsQuery>;

export const ListTarotReadingsResult = z.object({
  items: z.array(TarotReadingSummary),
  nextCursor: z.string().nullable(),
});
export type ListTarotReadingsResultType = z.infer<typeof ListTarotReadingsResult>;

// ── 공유 ────────────────────────────────────────────────────────────────────
//
// 공유 페이지의 텍스트는 언제나 서버가 만든 해석이다 — 게스트가 임의 문장을 보내 우리 도메인
// 아래 게시하는 통로가 되지 않게, 게스트 공유는 리딩 **입력**(스프레드·카드·질문)만 받아 서버가
// 캐시/LLM/정적으로 본문을 다시 확보해 저장한다. 회원은 저장된 readingId 로 토큰만 발급.
// 질문은 사적일 수 있어 기본 숨김(includeQuestion).

export const CreateTarotShareInput = z
  .object({
    readingId: z.string().min(1).max(64).optional(),
    reading: CreateTarotReadingInput.optional(),
    includeQuestion: z.boolean().default(false),
  })
  .refine((v) => !!v.readingId || !!v.reading, 'readingId 또는 reading 이 필요합니다.');
export type CreateTarotShareInputType = z.infer<typeof CreateTarotShareInput>;

export const TarotShareResult = z.object({
  token: z.string(),
  // 웹 공유 페이지 경로(origin 없음) — 클라이언트가 자기 origin 을 붙인다.
  path: z.string(),
  includeQuestion: z.boolean(),
});
export type TarotShareResultType = z.infer<typeof TarotShareResult>;

// 공개 조회 — readingId·quota 없음. 질문은 includeQuestion 일 때만 채워진다(아니면 '').
export const SharedTarotReading = TarotReadingResult.omit({ readingId: true, quota: true }).extend({
  token: z.string(),
  includeQuestion: z.boolean(),
});
export type SharedTarotReadingType = z.infer<typeof SharedTarotReading>;

// 공유 이미지 형식 — og(1200×630, 링크 미리보기) / story(1080×1920, 카톡·인스타 세로).
export const TarotShareImageFormat = z.enum(['og', 'story']);
export type TarotShareImageFormatType = z.infer<typeof TarotShareImageFormat>;
