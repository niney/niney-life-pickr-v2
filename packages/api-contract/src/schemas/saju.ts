import { z } from 'zod';
import { TAROT_GUEST_KEY_HEADER } from './tarot.js';

// 사주 — 로그인 없이 쓰는 공개 풀이 + 회원 프로필·기록. 계산 규칙·데이터의 단일 출처는 @repo/utils
// (saju.ts / sajuCalendar.ts …)이고, 여기 enum 은 그와 **같은 값**이어야 한다(api-contract 는 utils 에
// 의존하지 않는다 — friendly saju.test 가 동일성을 검증).
//
// 원국(chart)은 클라이언트와 서버가 같은 utils 코드로 계산한다. 서버는 입력만 받아 다시 계산하고
// 그 결과를 프롬프트·저장에 쓴다(클라이언트가 보낸 원국은 믿지 않는다). 생년월일시는 개인정보 —
// 로그·텔레메트리에 남기지 않고, 게스트 결과는 공유 전엔 저장하지 않는다.
//
// 긴 풀이(full)는 섹션 4개(personality·year·cycle·advice)를 서버가 병렬로 LLM 에 보내고, 응답은
// 즉시(정적 본문 + jobId) 돌려준 뒤 클라이언트가 job 을 long-poll 해 도착한 섹션을 받는다.

export const SAJU_GUEST_KEY_HEADER = TAROT_GUEST_KEY_HEADER;
export const SAJU_SUPPORTED_YEAR_RANGE = { from: 1900, to: 2050 } as const;
export const SAJU_PROFILE_LABEL_MAX_LENGTH = 20;
export const SAJU_PROFILE_MAX = 10;
export const SAJU_DATE_PICK_MAX_DAYS = 60;

// ── 입력 ────────────────────────────────────────────────────────────────────

export const SajuCalendarKind = z.enum(['solar', 'lunar']);
export type SajuCalendarKindType = z.infer<typeof SajuCalendarKind>;
export const SajuGender = z.enum(['M', 'F']);
export type SajuGenderType = z.infer<typeof SajuGender>;

// 학파 차이 옵션 — 기본값은 docs/PLAN-saju.md 기본값 표.
export const SajuOptionsInput = z.object({
  solarTimeCorrection: z.boolean().default(true),
  lateRatHour: z.boolean().default(false),
});
export type SajuOptionsInputType = z.infer<typeof SajuOptionsInput>;

export const SajuBirthInput = z.object({
  calendar: SajuCalendarKind.default('solar'),
  year: z.number().int().min(SAJU_SUPPORTED_YEAR_RANGE.from).max(SAJU_SUPPORTED_YEAR_RANGE.to),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  leapMonth: z.boolean().default(false),
  // null = 시간 모름(시주 없이 3기둥).
  hour: z.number().int().min(0).max(23).nullable().default(null),
  minute: z.number().int().min(0).max(59).nullable().default(null),
  gender: SajuGender,
  options: SajuOptionsInput.default({ solarTimeCorrection: true, lateRatHour: false }),
});
export type SajuBirthInputType = z.infer<typeof SajuBirthInput>;

// ── 원국 스냅샷 (utils SajuChart 와 같은 모양) ──────────────────────────────

export const SajuWuxing = z.enum(['wood', 'fire', 'earth', 'metal', 'water']);
export type SajuWuxingType = z.infer<typeof SajuWuxing>;
export const SajuTenGod = z.enum([
  'bigyeon', 'geopjae', 'siksin', 'sanggwan', 'pyeonjae', 'jeongjae', 'pyeongwan', 'jeonggwan', 'pyeonin', 'jeongin',
]);
export type SajuTenGodType = z.infer<typeof SajuTenGod>;
export const SajuTwelveStage = z.enum(['장생', '목욕', '관대', '건록', '제왕', '쇠', '병', '사', '묘', '절', '태', '양']);
export const SajuPillarKey = z.enum(['year', 'month', 'day', 'hour']);
export type SajuPillarKeyType = z.infer<typeof SajuPillarKey>;
export const SajuRelationType = z.enum([
  'stem-combine', 'stem-clash', 'six-combine', 'three-combine', 'half-combine', 'directional',
  'clash', 'punish', 'self-punish', 'break', 'harm', 'wonjin',
]);
export const SajuStarId = z.enum([
  'cheoneul', 'munchang', 'yangin', 'dohwa', 'yeokma', 'hwagae', 'goegang', 'baekho',
  'hongyeom', 'gwimun', 'cheonra', 'geumyeo', 'cheondeok', 'woldeok',
]);
export const SajuSeason = z.enum(['spring', 'summer', 'autumn', 'winter']);
export const SajuStrengthLevel = z.enum(['strong', 'balanced', 'weak']);

const Int = z.number().int();

export const SajuCivilDate = z.object({ year: Int, month: Int, day: Int });
export const SajuLunarDate = z.object({ year: Int, month: Int, day: Int, leap: z.boolean() });

export const SajuStemMeta = z.object({
  index: Int, ko: z.string(), hanja: z.string(), element: SajuWuxing, yang: z.boolean(), symbol: z.string(),
});
export const SajuBranchMeta = z.object({
  index: Int, ko: z.string(), hanja: z.string(), element: SajuWuxing, yang: z.boolean(), animal: z.string(),
  hidden: z.array(Int), hourStart: Int, season: SajuSeason,
});

export const SajuPillar = z.object({
  key: SajuPillarKey,
  stem: Int,
  branch: Int,
  ganzhi: Int,
  ko: z.string(),
  hanja: z.string(),
  stemElement: SajuWuxing,
  branchElement: SajuWuxing,
  stemTenGod: SajuTenGod.nullable(),
  branchTenGod: SajuTenGod,
  hidden: z.array(Int),
  twelveStage: SajuTwelveStage,
  isVoid: z.boolean(),
});
export type SajuPillarType = z.infer<typeof SajuPillar>;

export const SajuRelation = z.object({
  type: SajuRelationType,
  pillars: z.array(z.enum(['year', 'month', 'day', 'hour', 'luck'])),
  chars: z.array(z.string()),
  element: SajuWuxing.optional(),
  label: z.string(),
});
export type SajuRelationType_ = z.infer<typeof SajuRelation>;

export const SajuStar = z.object({
  id: SajuStarId, ko: z.string(), hanja: z.string(), positive: z.boolean(), pillars: z.array(SajuPillarKey),
});

export const SajuElementScore = z.object({ element: SajuWuxing, score: z.number(), percent: z.number() });

export const SajuLuckPillar = z.object({
  index: Int, ganzhi: Int, stem: Int, branch: Int, ko: z.string(), hanja: z.string(),
  fromAge: z.number(), toAge: z.number(), fromYear: Int,
  stemTenGod: SajuTenGod, branchTenGod: SajuTenGod, twelveStage: SajuTwelveStage,
});

export const SajuYearLuck = z.object({
  year: Int, ganzhi: Int, ko: z.string(), hanja: z.string(),
  stemTenGod: SajuTenGod, branchTenGod: SajuTenGod, twelveStage: SajuTwelveStage,
  relations: z.array(SajuRelation),
});

export const SajuChart = z.object({
  input: z.object({
    calendar: SajuCalendarKind, year: Int, month: Int, day: Int, leapMonth: z.boolean(),
    hour: Int.nullable(), minute: Int.nullable(), gender: SajuGender,
    options: z.object({ solarTimeCorrection: z.boolean(), lateRatHour: z.boolean() }),
  }),
  solar: SajuCivilDate,
  lunar: SajuLunarDate.nullable(),
  instant: z.object({
    utcMinutes: Int, hourKnown: z.boolean(), offsetMinutes: Int, dst: z.boolean(),
    corrected: z.object({ year: Int, month: Int, day: Int, hour: Int, minute: Int }),
    correctionMinutes: Int,
  }),
  pillars: z.object({ year: SajuPillar, month: SajuPillar, day: SajuPillar, hour: SajuPillar.nullable() }),
  dayMaster: SajuStemMeta,
  zodiac: SajuBranchMeta,
  season: SajuSeason,
  tenGodCounts: z.record(z.string(), Int),
  elements: z.array(SajuElementScore),
  excess: z.array(SajuWuxing),
  lacking: z.array(SajuWuxing),
  strength: z.object({
    level: SajuStrengthLevel, score: z.number(), gotSeason: z.boolean(), gotPlace: z.boolean(), supportCount: Int,
  }),
  favorable: z.object({
    primary: SajuWuxing, secondary: SajuWuxing.nullable(), reason: z.enum(['weak', 'strong', 'balanced', 'season']),
  }),
  relations: z.array(SajuRelation),
  stars: z.array(SajuStar),
  voidBranches: z.tuple([Int, Int]),
  luck: z.object({
    forward: z.boolean(), startAgeYears: Int, startAgeMonths: Int, pillars: z.array(SajuLuckPillar), currentIndex: Int,
  }),
  yearLuck: SajuYearLuck,
  asOf: z.object({ utcMinutes: Int, age: Int, year: Int }),
  warnings: z.array(z.string()),
});
export type SajuChartType = z.infer<typeof SajuChart>;

// ── 풀이 섹션 ───────────────────────────────────────────────────────────────

// llm: Ollama Cloud / static: LLM 부재·실패·한도 초과 시 정적 조립.
export const SajuSource = z.enum(['llm', 'static']);
export type SajuSourceType = z.infer<typeof SajuSource>;
// mixed: 섹션 일부만 LLM.
export const SajuReadingSource = z.enum(['llm', 'static', 'mixed']);
export type SajuReadingSourceType = z.infer<typeof SajuReadingSource>;

export const SajuSectionId = z.enum(['personality', 'year', 'cycle', 'advice']);
export type SajuSectionIdType = z.infer<typeof SajuSectionId>;
export const SAJU_SECTION_IDS = SajuSectionId.options;
// pending: LLM 응답 대기 중(본문은 정적) / ready: LLM / static: 최종 정적.
export const SajuSectionStatus = z.enum(['pending', 'ready', 'static']);
export type SajuSectionStatusType = z.infer<typeof SajuSectionStatus>;

const SectionBase = z.object({
  status: SajuSectionStatus,
  source: SajuSource,
  model: z.string().nullable(),
});

export const SajuPersonalitySection = SectionBase.extend({
  headline: z.string(),
  body: z.string(),
  strengths: z.array(z.string()),
  cautions: z.array(z.string()),
});
export type SajuPersonalitySectionType = z.infer<typeof SajuPersonalitySection>;

export const SajuYearSection = SectionBase.extend({
  body: z.string(),
  // 눈여겨볼 달(1~12) 몇 개.
  months: z.array(z.object({ month: Int.min(1).max(12), note: z.string() })),
});
export type SajuYearSectionType = z.infer<typeof SajuYearSection>;

export const SajuCycleSection = SectionBase.extend({
  body: z.string(),
  current: z.string(),
  next: z.string(),
});
export type SajuCycleSectionType = z.infer<typeof SajuCycleSection>;

export const SajuLucky = z.object({
  element: SajuWuxing,
  colors: z.array(z.string()),
  directions: z.array(z.string()),
  numbers: z.array(Int),
  foods: z.array(z.string()),
});
export type SajuLuckyType = z.infer<typeof SajuLucky>;

export const SajuAdviceSection = SectionBase.extend({
  body: z.string(),
  keyword: z.string(),
  lucky: SajuLucky,
});
export type SajuAdviceSectionType = z.infer<typeof SajuAdviceSection>;

export const SajuSections = z.object({
  personality: SajuPersonalitySection,
  year: SajuYearSection,
  cycle: SajuCycleSection,
  advice: SajuAdviceSection,
});
export type SajuSectionsType = z.infer<typeof SajuSections>;

// 게스트만 숫자(기기 일일 한도 잔여). 회원은 null.
export const SajuQuota = z.object({ remainingToday: Int.nullable() });

// SajuThemes 는 아래(테마 블록)에서 정의 — 선언 순서 때문에 lazy 참조.
const SajuThemesRef = z.lazy(() => SajuThemes);

export const CreateSajuReadingInput = z.object({ birth: SajuBirthInput });
export type CreateSajuReadingInputType = z.infer<typeof CreateSajuReadingInput>;

export const SajuReadingResult = z.object({
  // 회원 자동 저장 id(섹션이 전부 끝난 뒤 저장되므로 job 진행 중엔 null, poll 결과에 실린다).
  readingId: z.string().nullable(),
  // 섹션 병렬 작업 id. 캐시 히트·정적 경로면 null.
  jobId: z.string().nullable(),
  chart: SajuChart,
  sections: SajuSections,
  // 테마(인연·재물·직업) — 별도 job(POST /saju-c/themes)으로 받는다. 기록·캐시에 있으면 함께 실린다(8차).
  themes: SajuThemesRef.nullable().optional(),
  source: SajuReadingSource,
  model: z.string().nullable(),
  createdAt: z.string(),
  quota: SajuQuota,
});
export type SajuReadingResultType = z.infer<typeof SajuReadingResult>;

export const SajuJobPollQuery = z.object({
  // 이미 받은 버전. 이보다 큰 버전이 생기거나 wait 이 지나면 응답.
  after: z.coerce.number().int().min(0).default(0),
  wait: z.coerce.number().int().min(0).max(25_000).default(20_000),
});
export type SajuJobPollQueryType = z.infer<typeof SajuJobPollQuery>;

export const SajuJobPollResult = z.object({
  jobId: z.string(),
  version: Int,
  sections: SajuSections,
  done: z.boolean(),
  readingId: z.string().nullable(),
  source: SajuReadingSource,
});
export type SajuJobPollResultType = z.infer<typeof SajuJobPollResult>;

// ── 테마(8차) — 인연·재물·직업 ─────────────────────────────────────────────
// 테마 탭을 처음 열 때 job 하나로 3개를 병렬 호출한다(한도 1건). 계산값(배우자성·재물 스타일·격국·시기)은
// 웹이 utils 로 직접 만들고, 서버는 그 위에 얹는 문장만 준다. 회원이면 readingId 행의 resultJson 에 병합 저장.

export const SajuThemeId = z.enum(['love', 'wealth', 'career']);
export type SajuThemeIdType = z.infer<typeof SajuThemeId>;
export const SAJU_THEME_IDS = SajuThemeId.options;

export const SajuLoveSection = SectionBase.extend({
  headline: z.string(),
  body: z.string(),
  // 연애 스타일 2~3문장.
  style: z.string(),
  // 인연이 가까워지는 시기 2~3문장(결혼 단정 금지).
  timing: z.string(),
  tips: z.array(z.string()),
});
export type SajuLoveSectionType = z.infer<typeof SajuLoveSection>;

export const SajuWealthSection = SectionBase.extend({
  headline: z.string(),
  body: z.string(),
  // 돈을 다루는 방식 2~3문장.
  style: z.string(),
  // 재물 흐름이 활발한 시기 2~3문장(액수 단정 금지).
  timing: z.string(),
  tips: z.array(z.string()),
});
export type SajuWealthSectionType = z.infer<typeof SajuWealthSection>;

export const SajuCareerSection = SectionBase.extend({
  headline: z.string(),
  body: z.string(),
  // 어울리는 직업군 키워드 3~5개.
  jobs: z.array(z.string()),
  // 승진·이직·시험에 힘이 실리는 시기 2~3문장.
  timing: z.string(),
  tips: z.array(z.string()),
});
export type SajuCareerSectionType = z.infer<typeof SajuCareerSection>;

export const SajuThemes = z.object({
  love: SajuLoveSection,
  wealth: SajuWealthSection,
  career: SajuCareerSection,
});
export type SajuThemesType = z.infer<typeof SajuThemes>;

export const CreateSajuThemesInput = z.object({
  birth: SajuBirthInput,
  // 회원 저장 행(전체 풀이) — 있으면 테마를 그 행에 병합한다.
  readingId: z.string().min(1).max(64).optional(),
});
export type CreateSajuThemesInputType = z.infer<typeof CreateSajuThemesInput>;

export const SajuThemesResult = z.object({
  readingId: z.string().nullable(),
  jobId: z.string().nullable(),
  themes: SajuThemes,
  source: SajuReadingSource,
  model: z.string().nullable(),
  createdAt: z.string(),
  quota: SajuQuota,
});
export type SajuThemesResultType = z.infer<typeof SajuThemesResult>;

export const SajuThemesJobPollResult = z.object({
  jobId: z.string(),
  version: Int,
  themes: SajuThemes,
  done: z.boolean(),
  readingId: z.string().nullable(),
  source: SajuReadingSource,
});
export type SajuThemesJobPollResultType = z.infer<typeof SajuThemesJobPollResult>;

// ── 오늘의 운세 ─────────────────────────────────────────────────────────────

export const SajuDayTag = z.enum([
  'cheoneul', 'munchang', 'dohwa', 'yeokma', 'void', 'favorable', 'excess', 'son-eomneun',
  'six-combine', 'three-combine', 'directional', 'clash', 'punish', 'harm', 'break', 'wonjin',
  'stage-good', 'stage-bad', 'god-good', 'god-bad',
]);
export type SajuDayTagType = z.infer<typeof SajuDayTag>;

export const SajuDay = z.object({
  date: z.string(), // yyyy-mm-dd
  lunar: SajuLunarDate.nullable(),
  weekday: Int,
  ko: z.string(),
  hanja: z.string(),
  element: SajuWuxing,
  stemTenGod: SajuTenGod,
  twelveStage: SajuTwelveStage,
  score: Int,
  stars: Int.min(1).max(5),
  tags: z.array(SajuDayTag),
});
export type SajuDayType = z.infer<typeof SajuDay>;

export const SajuDailyInput = z.object({
  birth: SajuBirthInput,
  // yyyy-mm-dd(KST). 없으면 오늘. 오늘 ±7일까지.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type SajuDailyInputType = z.infer<typeof SajuDailyInput>;

export const SajuDailyResult = z.object({
  dayKey: z.string(),
  day: SajuDay,
  dayMaster: SajuStemMeta,
  headline: z.string(),
  body: z.string(),
  advice: z.string(),
  lucky: SajuLucky,
  source: SajuSource,
  model: z.string().nullable(),
  quota: SajuQuota,
});
export type SajuDailyResultType = z.infer<typeof SajuDailyResult>;

// ── 궁합 ────────────────────────────────────────────────────────────────────

export const SajuMatchInput = z.object({
  a: SajuBirthInput,
  b: SajuBirthInput,
  // 표시용 호칭('나'·'그 사람'). 프롬프트에 데이터로만.
  labels: z.object({ a: z.string().trim().max(20).default('나'), b: z.string().trim().max(20).default('상대') }).default({ a: '나', b: '상대' }),
});
export type SajuMatchInputType = z.infer<typeof SajuMatchInput>;

export const SajuMatchGrade = z.enum(['excellent', 'good', 'fair', 'effort', 'caution']);
export const SajuMatchBreakdown = z.object({
  key: z.enum(['dayMaster', 'dayBranch', 'zodiac', 'elements', 'tenGod']),
  label: z.string(),
  score: z.number(),
  max: z.number(),
  note: z.string(),
});

export const SajuMatchResult = z.object({
  score: Int,
  grade: SajuMatchGrade,
  gradeKo: z.string(),
  breakdown: z.array(SajuMatchBreakdown),
  relations: z.array(SajuRelation),
  mutual: z.object({ aToB: SajuTenGod, bToA: SajuTenGod }),
  a: z.object({ label: z.string(), dayMaster: SajuStemMeta, zodiac: SajuBranchMeta, signature: z.string() }),
  b: z.object({ label: z.string(), dayMaster: SajuStemMeta, zodiac: SajuBranchMeta, signature: z.string() }),
  summary: z.string(),
  strengths: z.array(z.string()),
  cautions: z.array(z.string()),
  advice: z.string(),
  source: SajuSource,
  model: z.string().nullable(),
  quota: SajuQuota,
});
export type SajuMatchResultType = z.infer<typeof SajuMatchResult>;

// ── 택일 ────────────────────────────────────────────────────────────────────

export const SajuDatePurpose = z.enum(['general', 'move', 'contract', 'interview', 'trip', 'date']);
export type SajuDatePurposeType = z.infer<typeof SajuDatePurpose>;

export const SajuDatePickInput = z.object({
  birth: SajuBirthInput,
  purpose: SajuDatePurpose.default('general'),
  // 시작일 yyyy-mm-dd(KST). 없으면 오늘. 오늘 이전은 오늘로.
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.number().int().min(1).max(SAJU_DATE_PICK_MAX_DAYS).default(30),
});
export type SajuDatePickInputType = z.infer<typeof SajuDatePickInput>;

export const SajuDatePickDay = SajuDay.extend({ purposeScore: Int, purposeStars: Int.min(1).max(5) });
export const SajuDatePickTop = SajuDatePickDay.extend({ reason: z.string() });

export const SajuDatePickResult = z.object({
  purpose: SajuDatePurpose,
  from: z.string(),
  days: z.array(SajuDatePickDay),
  top: z.array(SajuDatePickTop),
  source: SajuSource,
  model: z.string().nullable(),
  quota: SajuQuota,
});
export type SajuDatePickResultType = z.infer<typeof SajuDatePickResult>;

// ── 오행 음식 ───────────────────────────────────────────────────────────────

export const SajuFoodInput = z.object({
  birth: SajuBirthInput,
  // 오늘 일진 오행을 가점(기본). 끄면 내 사주만.
  today: z.boolean().default(true),
});
export type SajuFoodInputType = z.infer<typeof SajuFoodInput>;

export const SajuFoodPick = z.object({
  menuId: z.string(),
  name: z.string(),
  cuisine: z.string(),
  dishType: z.string(),
  kcal: z.number().nullable(),
  elements: z.array(SajuWuxing),
  reason: z.string(),
});
export type SajuFoodPickType = z.infer<typeof SajuFoodPick>;

export const SajuFoodResult = z.object({
  picks: z.array(SajuFoodPick).min(1),
  primary: SajuWuxing,
  secondary: SajuWuxing.nullable(),
  avoid: z.array(SajuWuxing),
  dayElement: SajuWuxing.nullable(),
  profile: z.string(),
  avoidText: z.string(),
  source: SajuSource,
  model: z.string().nullable(),
  quota: SajuQuota,
});
export type SajuFoodResultType = z.infer<typeof SajuFoodResult>;

// ── 사주에 묻기(9차) — "만약에 이랬다면" ────────────────────────────────────
// 주제 칩(9) + 시점 + 자유 텍스트(≤200자, 계산엔 안 쓰고 프롬프트 데이터 블록으로만). 계산(시점 점수·판정·대안·근거)은
// utils sajuAsk 가 하고 웹도 같은 함수로 근거 카드를 즉시 그린다. 결혼·고백은 상대(궁합)를 선택적으로 붙인다.
// 답하지 않는 주제(건강·법률·사행성)는 서버가 blocked 로 돌려주고 LLM·한도를 쓰지 않는다.

export const SajuAskTopic = z.enum(['job-change', 'startup', 'move', 'marriage', 'exam', 'invest', 'trip', 'contract', 'confess']);
export type SajuAskTopicType = z.infer<typeof SajuAskTopic>;
export const SAJU_ASK_QUESTION_MAX_LENGTH = 200;

export const SajuAskWhen = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('this-month') }),
  z.object({ kind: z.literal('this-year') }),
  z.object({ kind: z.literal('year'), year: Int.min(SAJU_SUPPORTED_YEAR_RANGE.from).max(SAJU_SUPPORTED_YEAR_RANGE.to) }),
  z.object({ kind: z.literal('date'), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
]);
export type SajuAskWhenType = z.infer<typeof SajuAskWhen>;

export const SajuAskInput = z.object({
  birth: SajuBirthInput,
  topic: SajuAskTopic,
  when: SajuAskWhen.default({ kind: 'this-year' }),
  question: z.string().trim().max(SAJU_ASK_QUESTION_MAX_LENGTH).default(''),
  // 결혼·고백처럼 상대가 있는 질문 — 있으면 궁합 점수를 근거에 더한다. 서버에 저장하지 않는다.
  partner: SajuBirthInput.optional(),
  partnerLabel: z.string().trim().max(20).optional(),
});
export type SajuAskInputType = z.infer<typeof SajuAskInput>;

export const SajuAskVerdict = z.enum(['good', 'ok', 'careful']);
export const SajuAskWindow = z.object({ label: z.string(), ganzhiKo: z.string(), score: Int, stars: Int.min(1).max(5), reasons: z.array(z.string()) });
export const SajuAskTarotTopic = z.enum(['general', 'love', 'work', 'money', 'relationship', 'choice']);

export const SajuAskResult = z.object({
  topic: SajuAskTopic,
  topicKo: z.string(),
  when: SajuAskWhen,
  whenKo: z.string(),
  question: z.string(),
  // 답하지 않는 주제면 그 이름(건강·생명 등) — answer 는 정적 안내.
  blocked: z.string().nullable(),
  verdict: SajuAskVerdict,
  verdictKo: z.string(),
  window: SajuAskWindow,
  alternatives: z.array(SajuAskWindow),
  basis: z.array(z.string()),
  themeSummary: z.array(z.string()),
  luckNote: z.string(),
  // 상대가 있으면 궁합 요약.
  match: z.object({ score: Int, gradeKo: z.string(), label: z.string() }).nullable(),
  answer: z.string(),
  conditions: z.array(z.string()),
  timingNote: z.string(),
  // "타로로도 보기" 링크용 타로 주제.
  tarotTopic: SajuAskTarotTopic,
  source: SajuSource,
  model: z.string().nullable(),
  readingId: z.string().nullable(),
  quota: SajuQuota,
});
export type SajuAskResultType = z.infer<typeof SajuAskResult>;

// ── 회원 프로필·기록·공유 (4차에서 라우트 구현) ────────────────────────────

export const SajuProfileInput = z.object({
  label: z.string().trim().min(1).max(SAJU_PROFILE_LABEL_MAX_LENGTH),
  birth: SajuBirthInput,
  isPrimary: z.boolean().default(false),
});
export type SajuProfileInputType = z.infer<typeof SajuProfileInput>;

export const SajuProfile = SajuProfileInput.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SajuProfileType = z.infer<typeof SajuProfile>;

export const SajuProfileList = z.object({ items: z.array(SajuProfile) });
export type SajuProfileListType = z.infer<typeof SajuProfileList>;

export const SajuReadingKind = z.enum(['full', 'daily', 'match', 'date-pick', 'food', 'question']);
export type SajuReadingKindType = z.infer<typeof SajuReadingKind>;

export const SajuReadingSummary = z.object({
  id: z.string(),
  kind: SajuReadingKind,
  signature: z.string(),
  dayMaster: z.string(),
  keyword: z.string(),
  source: SajuReadingSource,
  createdAt: z.string(),
  // kind 'question'(사주에 묻기, 9차) 행의 요약 — 목록에서 답까지 바로 보인다(상세 페이지 없음).
  ask: z
    .object({ topic: z.string(), topicKo: z.string(), whenKo: z.string(), question: z.string(), verdictKo: z.string(), answer: z.string() })
    .nullable()
    .optional(),
});
export type SajuReadingSummaryType = z.infer<typeof SajuReadingSummary>;

export const ListSajuReadingsQuery = z.object({
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  // full(전체 풀이, 기본) / question(사주에 묻기).
  kind: z.enum(['full', 'question']).default('full'),
});
export type ListSajuReadingsQueryType = z.infer<typeof ListSajuReadingsQuery>;

export const ListSajuReadingsResult = z.object({
  items: z.array(SajuReadingSummary),
  nextCursor: z.string().nullable(),
});
export type ListSajuReadingsResultType = z.infer<typeof ListSajuReadingsResult>;

export const CreateSajuShareInput = z
  .object({
    readingId: z.string().min(1).max(64).optional(),
    birth: SajuBirthInput.optional(),
    includeBirth: z.boolean().default(false),
  })
  .refine((v) => !!v.readingId || !!v.birth, 'readingId 또는 birth 가 필요합니다.');
export type CreateSajuShareInputType = z.infer<typeof CreateSajuShareInput>;

export const SajuShareResult = z.object({ token: z.string(), path: z.string(), includeBirth: z.boolean() });
export type SajuShareResultType = z.infer<typeof SajuShareResult>;

export const SharedSajuReading = z.object({
  token: z.string(),
  includeBirth: z.boolean(),
  chart: SajuChart,
  sections: SajuSections,
  themes: SajuThemes.nullable().optional(),
  source: SajuReadingSource,
  model: z.string().nullable(),
  createdAt: z.string(),
});
export type SharedSajuReadingType = z.infer<typeof SharedSajuReading>;

export const SajuShareImageFormat = z.enum(['og', 'story']);
