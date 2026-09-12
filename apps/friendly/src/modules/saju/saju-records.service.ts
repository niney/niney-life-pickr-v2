import { randomBytes } from 'node:crypto';
import type { PrismaClient, SajuProfile as SajuProfileRow, SajuReading as SajuReadingRow } from '@prisma/client';
import {
  Routes,
  SAJU_PROFILE_MAX,
  SajuBirthInput,
  SajuSections,
  SajuThemes,
  type CreateSajuShareInputType,
  type ListSajuReadingsQueryType,
  type ListSajuReadingsResultType,
  type SajuBirthInputType,
  type SajuChartType,
  type SajuProfileInputType,
  type SajuProfileType,
  type SajuReadingKindType,
  type SajuReadingResultType,
  type SajuReadingSummaryType,
  type SajuSectionsType,
  type SajuShareResultType,
  type SajuThemesType,
  type SharedSajuReadingType,
} from '@repo/api-contract';
import { chartSignature, type SajuChart } from '@repo/utils';
import { sourceOf } from './saju-jobs.js';
import { SAJU_PROMPT_VERSION } from './saju.prompts.js';
import { SajuError, toChartDto, type SajuActor, type SajuService } from './saju.service.js';

// 공유·회원 기록·프로필 — SajuService(계산·LLM) 와 분리한 저장 계층.
//
// - 공유 페이지의 텍스트는 언제나 서버가 만든 풀이다. 게스트는 입력(생년월일)만 보내고 서버가 캐시된 섹션
//   (게스트가 방금 본 풀이는 캐시에 있다)으로 행을 만든다 — LLM 을 새로 부르지도, 한도를 소비하지도 않는다.
//   회원은 저장된 행에 토큰만 단다(재요청 시 같은 토큰, shareBirth 만 갱신).
// - 생년월일시는 shareBirth 일 때만 공유 응답에 실린다(기본 숨김 — 원국·띠·연도는 보인다).
// - 프로필은 회원당 최대 10, primary 는 하나(서비스가 보장).

export class SajuRecordsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly saju: SajuService,
  ) {}

  // ── 공유 ──────────────────────────────────────────────────────────────

  async createShare(input: CreateSajuShareInputType, actor: SajuActor): Promise<SajuShareResultType> {
    let row: SajuReadingRow | null = null;
    if (input.readingId) {
      if (!actor.userId) throw new SajuError('not_found', '풀이를 찾을 수 없습니다.');
      row = await this.prisma.sajuReading.findFirst({ where: { id: input.readingId, userId: actor.userId, kind: 'full' } });
      if (!row) throw new SajuError('not_found', '풀이를 찾을 수 없습니다.');
      if (!row.shareToken) {
        row = await this.prisma.sajuReading.update({ where: { id: row.id }, data: { shareToken: await this.uniqueToken(), shareBirth: input.includeBirth } });
      } else if (row.shareBirth !== input.includeBirth) {
        row = await this.prisma.sajuReading.update({ where: { id: row.id }, data: { shareBirth: input.includeBirth } });
      }
    } else if (input.birth) {
      const chart = this.saju.chartOf(input.birth);
      const sections = this.saju.sectionsForShare(chart);
      // 테마는 캐시된 것(게스트가 방금 본 것)만 LLM 문장, 아니면 정적 — 공유 페이지의 테마 카드가 비지 않게.
      const themes = this.saju.themesForShare(chart);
      row = await this.prisma.sajuReading.create({
        data: {
          userId: actor.userId,
          guestKey: actor.userId ? null : actor.guestKey,
          shareToken: await this.uniqueToken(),
          shareBirth: input.includeBirth,
          kind: 'full',
          inputJson: JSON.stringify(input.birth),
          chartJson: JSON.stringify(chart),
          resultJson: JSON.stringify({ ...sections, themes }),
          source: sourceOf(sections),
          model: Object.values(sections).find((s) => s.model)?.model ?? null,
          promptVersion: SAJU_PROMPT_VERSION,
          dayKey: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }),
        },
      });
    }
    if (!row?.shareToken) throw new SajuError('not_found', '공유할 풀이가 없습니다.');
    return { token: row.shareToken, path: Routes.Saju.sharePage(row.shareToken), includeBirth: row.shareBirth };
  }

  async getShared(token: string): Promise<SharedSajuReadingType> {
    const row = await this.prisma.sajuReading.findUnique({ where: { shareToken: token } });
    if (!row || row.kind !== 'full') throw new SajuError('not_found', '공유 링크를 찾을 수 없습니다.');
    const chart = parseChart(row);
    return {
      token,
      includeBirth: row.shareBirth,
      chart: row.shareBirth ? chart : maskBirth(chart),
      sections: parseSections(row),
      themes: parseThemes(row),
      source: row.source as SharedSajuReadingType['source'],
      model: row.model,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** OG 미리보기용 요약 — 없는 토큰이면 null. */
  async getSharePreviewMeta(token: string): Promise<{ title: string; description: string; dayMasterStem: number } | null> {
    try {
      const shared = await this.getShared(token);
      const c = shared.chart;
      const sig = [c.pillars.year, c.pillars.month, c.pillars.day, c.pillars.hour].map((p) => (p ? p.hanja : '--')).join(' ');
      return {
        title: `[사주(C)] ${shared.sections.personality.headline} · ${c.dayMaster.ko}${c.dayMaster.hanja} 일간`,
        description: `${sig} — ${shared.sections.personality.body}`.slice(0, 160),
        dayMasterStem: c.dayMaster.index,
      };
    } catch (e) {
      if (e instanceof SajuError) return null;
      throw e;
    }
  }

  // ── 회원 기록 ─────────────────────────────────────────────────────────

  async listMine(userId: string, query: ListSajuReadingsQueryType): Promise<ListSajuReadingsResultType> {
    // 목록은 전체 풀이(full, 기본) 또는 사주에 묻기(question) — 오늘의 운세 잠금 행(daily)은 내부용.
    const rows = await this.prisma.sajuReading.findMany({
      where: { userId, kind: query.kind ?? 'full' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, query.limit);
    return { items: page.map(rowToSummary), nextCursor: rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null };
  }

  async getMine(userId: string, id: string): Promise<SajuReadingResultType> {
    const row = await this.prisma.sajuReading.findFirst({ where: { id, userId, kind: 'full' } });
    if (!row) throw new SajuError('not_found', '풀이를 찾을 수 없습니다.');
    return {
      readingId: row.id,
      jobId: null,
      chart: parseChart(row),
      sections: parseSections(row),
      themes: parseThemes(row),
      source: row.source as SajuReadingResultType['source'],
      model: row.model,
      createdAt: row.createdAt.toISOString(),
      quota: { remainingToday: null },
    };
  }

  async deleteMine(userId: string, id: string): Promise<void> {
    const res = await this.prisma.sajuReading.deleteMany({ where: { id, userId } });
    if (res.count === 0) throw new SajuError('not_found', '풀이를 찾을 수 없습니다.');
  }

  // ── 프로필 ────────────────────────────────────────────────────────────

  async listProfiles(userId: string): Promise<SajuProfileType[]> {
    const rows = await this.prisma.sajuProfile.findMany({ where: { userId }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] });
    return rows.map(rowToProfile);
  }

  async createProfile(userId: string, input: SajuProfileInputType): Promise<SajuProfileType> {
    this.saju.chartOf(input.birth); // 입력 검증(없는 날짜 등)
    // 같은 사주(생년월일시·성별·달력·윤달)가 이미 있으면 새로 만들지 않고 라벨·primary 만 갱신 — 같은 입력을 다시 세울 때 중복 방지.
    const dup = await this.prisma.sajuProfile.findFirst({
      where: {
        userId,
        calendar: input.birth.calendar,
        birthYear: input.birth.year,
        birthMonth: input.birth.month,
        birthDay: input.birth.day,
        leapMonth: input.birth.leapMonth,
        birthHour: input.birth.hour,
        birthMinute: input.birth.minute,
        gender: input.birth.gender,
      },
    });
    if (dup) return this.updateProfile(userId, dup.id, { ...input, isPrimary: input.isPrimary || dup.isPrimary });
    const count = await this.prisma.sajuProfile.count({ where: { userId } });
    if (count >= SAJU_PROFILE_MAX) throw new SajuError('invalid_input', `프로필은 ${SAJU_PROFILE_MAX}명까지 저장할 수 있어요.`);
    const isPrimary = input.isPrimary || count === 0;
    if (isPrimary) await this.prisma.sajuProfile.updateMany({ where: { userId, isPrimary: true }, data: { isPrimary: false } });
    const row = await this.prisma.sajuProfile.create({ data: { userId, ...profileData(input), isPrimary } });
    return rowToProfile(row);
  }

  async updateProfile(userId: string, id: string, input: SajuProfileInputType): Promise<SajuProfileType> {
    this.saju.chartOf(input.birth);
    const existing = await this.prisma.sajuProfile.findFirst({ where: { id, userId } });
    if (!existing) throw new SajuError('not_found', '프로필을 찾을 수 없습니다.');
    if (input.isPrimary) await this.prisma.sajuProfile.updateMany({ where: { userId, isPrimary: true, NOT: { id } }, data: { isPrimary: false } });
    const row = await this.prisma.sajuProfile.update({ where: { id }, data: { ...profileData(input), isPrimary: input.isPrimary || existing.isPrimary } });
    return rowToProfile(row);
  }

  async deleteProfile(userId: string, id: string): Promise<void> {
    const res = await this.prisma.sajuProfile.deleteMany({ where: { id, userId } });
    if (res.count === 0) throw new SajuError('not_found', '프로필을 찾을 수 없습니다.');
    // primary 가 지워졌으면 가장 오래된 것을 primary 로.
    const rest = await this.prisma.sajuProfile.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    if (rest.length > 0 && !rest.some((r) => r.isPrimary)) {
      await this.prisma.sajuProfile.update({ where: { id: rest[0]!.id }, data: { isPrimary: true } });
    }
  }

  private async uniqueToken(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = randomBytes(7).toString('base64url');
      const clash = await this.prisma.sajuReading.findUnique({ where: { shareToken: candidate }, select: { id: true } });
      if (!clash) return candidate;
    }
    throw new SajuError('not_found', '공유 토큰 생성에 실패했습니다. 다시 시도해 주세요.');
  }
}

// ── 헬퍼 ────────────────────────────────────────────────────────────────────

const profileData = (input: SajuProfileInputType) => ({
  label: input.label,
  calendar: input.birth.calendar,
  birthYear: input.birth.year,
  birthMonth: input.birth.month,
  birthDay: input.birth.day,
  leapMonth: input.birth.leapMonth,
  birthHour: input.birth.hour,
  birthMinute: input.birth.minute,
  gender: input.birth.gender,
  optionsJson: JSON.stringify(input.birth.options),
});

const rowToProfile = (row: SajuProfileRow): SajuProfileType => ({
  id: row.id,
  label: row.label,
  isPrimary: row.isPrimary,
  birth: SajuBirthInput.parse({
    calendar: row.calendar,
    year: row.birthYear,
    month: row.birthMonth,
    day: row.birthDay,
    leapMonth: row.leapMonth,
    hour: row.birthHour,
    minute: row.birthMinute,
    gender: row.gender,
    options: safeJson(row.optionsJson) ?? {},
  }),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const safeJson = (s: string): Record<string, unknown> | null => {
  try {
    const v = JSON.parse(s) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const parseChart = (row: SajuReadingRow): SajuChartType => toChartDto(JSON.parse(row.chartJson) as SajuChart);

const parseSections = (row: SajuReadingRow): SajuSectionsType => {
  const parsed = SajuSections.safeParse(JSON.parse(row.resultJson));
  if (parsed.success) return parsed.data;
  // 저장 당시 계약과 어긋난 행(버전 차이) — 원국으로 정적 섹션을 다시 만든다.
  const raw = JSON.parse(row.resultJson) as Partial<SajuSectionsType>;
  const chart = JSON.parse(row.chartJson) as SajuChart;
  const base = { status: 'static' as const, source: 'static' as const, model: null };
  return {
    personality: { ...base, headline: '', body: '', strengths: [], cautions: [], ...(raw.personality ?? {}) },
    year: { ...base, body: '', months: [], ...(raw.year ?? {}) },
    cycle: { ...base, body: '', current: '', next: '', ...(raw.cycle ?? {}) },
    advice: { ...base, body: '', keyword: '', lucky: { element: chart.favorable.primary, colors: [], directions: [], numbers: [], foods: [] }, ...(raw.advice ?? {}) },
  };
};

// 테마(8차)는 resultJson.themes 에 병합 저장 — 없거나(8차 이전 행) 계약과 어긋나면 null(화면은 정적 카드만).
const parseThemes = (row: SajuReadingRow): SajuThemesType | null => {
  try {
    const raw = JSON.parse(row.resultJson) as { themes?: unknown };
    const parsed = SajuThemes.safeParse(raw.themes);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

// 생년월일 숨김 — 공유 응답에서 입력·양력·음력·순간을 지운다(원국·띠·연도는 남는다).
const maskBirth = (chart: SajuChartType): SajuChartType => ({
  ...chart,
  input: { ...chart.input, year: chart.solar.year, month: 0, day: 0, hour: null, minute: null },
  solar: { year: chart.solar.year, month: 0, day: 0 },
  lunar: null,
  instant: { ...chart.instant, utcMinutes: 0, corrected: { year: chart.solar.year, month: 0, day: 0, hour: 0, minute: 0 } },
});

const rowToSummary = (row: SajuReadingRow): SajuReadingSummaryType => {
  const chart = JSON.parse(row.chartJson) as SajuChart;
  let keyword = '';
  let ask: SajuReadingSummaryType['ask'] = null;
  if (row.kind === 'question') {
    // 사주에 묻기 — 답까지 목록에 싣는다(상세 페이지 없음).
    const r = safeJson(row.resultJson) as { topic?: string; topicKo?: string; whenKo?: string; question?: string; verdictKo?: string; answer?: string } | null;
    keyword = r?.topicKo ?? '질문';
    ask = { topic: r?.topic ?? '', topicKo: r?.topicKo ?? '', whenKo: r?.whenKo ?? '', question: r?.question ?? '', verdictKo: r?.verdictKo ?? '', answer: r?.answer ?? '' };
  } else {
    try {
      const sections = parseSections(row);
      keyword = sections.advice.keyword || sections.personality.headline;
    } catch {
      keyword = '';
    }
  }
  const birth = safeJson(row.inputJson) as SajuBirthInputType | null;
  void birth;
  return {
    id: row.id,
    kind: row.kind as SajuReadingKindType,
    signature: chartSignature(chart),
    dayMaster: `${chart.dayMaster.ko}${chart.dayMaster.hanja}`,
    keyword,
    source: row.source as SajuReadingSummaryType['source'],
    createdAt: row.createdAt.toISOString(),
    ask,
  };
};
