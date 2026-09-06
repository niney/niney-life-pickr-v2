import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SajuChart as SajuChartSchema,
  SajuDayTag,
  SajuRelationType,
  SajuSections as SajuSectionsSchema,
  SajuStarId,
  SajuTenGod,
  SajuTwelveStage,
  type SajuBirthInputType,
} from '@repo/api-contract';
import {
  SAJU_RELATION_META,
  SAJU_STAR_META,
  SAJU_TEN_GODS,
  SAJU_TWELVE_STAGES,
  SAJU_DAY_TAG_LABEL,
  computeSajuChart,
  dailyFortune,
  matchCharts,
} from '@repo/utils';
import { buildApp } from '../../app.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { AiConfigService, type LlmProviderEnv } from '../ai/ai.config.service.js';
import type { AdapterCache } from '../ai/adapter-cache.js';
import type { LLMCompleteOptions, LLMCompleteResult, LLMProvider } from '../ai/adapters/llm-provider.js';
import { USAGE_QUOTA_DEFAULTS, UsageQuotaService } from '../usage-quota/usage-quota.service.js';
import { SajuJobRegistry } from './saju-jobs.js';
import { SajuRecordsService } from './saju-records.service.js';
import { buildStaticDaily, buildStaticMatch, buildStaticSections } from './saju-static.js';
import { buildSajuSectionPrompt } from './saju.prompts.js';
import { SajuError, SajuService, parseSajuJson, sectionCacheKey, type SajuServiceDeps } from './saju.service.js';
import { z } from 'zod';

// 사주 — 계약↔utils 동기화, 정적 풀이, JSON 파싱은 순수 함수로, 서비스(섹션 병렬 job·캐시·한도·저장)는
// FakeProvider + 격리 DB 로, 라우트는 provider 비활성 행으로 정적 경로만 친다.

const GUEST_PER_DAY = USAGE_QUOTA_DEFAULTS['saju-reading'].guestPerDay;
const ASOF = new Date('2026-09-06T03:00:00Z');
const BIRTH: SajuBirthInputType = {
  calendar: 'solar', year: 1990, month: 5, day: 15, leapMonth: false, hour: 14, minute: 30, gender: 'M',
  options: { solarTimeCorrection: true, lateRatHour: false },
};
const BIRTH_B: SajuBirthInputType = { ...BIRTH, year: 1992, month: 11, day: 3, hour: 9, minute: 0, gender: 'F' };

const sectionJson = (section: string): string => {
  switch (section) {
    case 'personality':
      return JSON.stringify({ headline: '곧은 무쇠', body: '성격 본문.', strengths: ['결단', '의리', '실행'], cautions: ['직설', '고집'] });
    case 'year':
      return JSON.stringify({ body: '올해 본문.', months: [{ month: 3, note: '시작하기 좋아요' }] });
    case 'cycle':
      return JSON.stringify({ body: '흐름 본문.', current: '현재 대운.', next: '다음 대운.' });
    default:
      return JSON.stringify({ body: '조언 본문.', keyword: '결단', lucky: { element: 'fire', colors: ['x'], directions: ['y'], numbers: [1], foods: ['z'] } });
  }
};
const sectionOfPrompt = (prompt: string): string =>
  prompt.includes('성격과 기질을 써라') ? 'personality' : prompt.includes('올해') && prompt.includes('months') ? 'year' : prompt.includes('대운" 줄을') ? 'cycle' : 'advice';

class FakeProvider implements LLMProvider {
  calls: LLMCompleteOptions[] = [];
  handler: (opts: LLMCompleteOptions) => string | Promise<string> = (o) => sectionJson(sectionOfPrompt(o.prompt));
  async complete(opts: LLMCompleteOptions): Promise<LLMCompleteResult> {
    this.calls.push(opts);
    return { text: await this.handler(opts), model: opts.model, promptTokens: 10, completionTokens: 20 };
  }
}

const fakeCache = (provider: LLMProvider): AdapterCache => ({ get: () => provider }) as unknown as AdapterCache;
const ENV: LlmProviderEnv = {
  apiKey: 'test-key', baseUrl: 'https://ollama.test', timeoutMs: 1000, maxConcurrent: 2,
  defaultModels: { chat: 'm', image: '', 'log-analysis': '', 'meal-photo': '', 'meal-recommend': '', tarot: '', saju: 'saju-model' },
};

describe('계약 ↔ utils 동기화', () => {
  it('십신·십이운성·관계·신살·태그 enum 이 같은 값', () => {
    expect(SajuTenGod.options).toEqual(SAJU_TEN_GODS);
    expect(SajuTwelveStage.options).toEqual([...SAJU_TWELVE_STAGES]);
    expect(SajuRelationType.options.sort()).toEqual(Object.keys(SAJU_RELATION_META).sort());
    expect(SajuStarId.options.sort()).toEqual(Object.keys(SAJU_STAR_META).sort());
    expect(SajuDayTag.options.sort()).toEqual(Object.keys(SAJU_DAY_TAG_LABEL).sort());
  });
  it('utils 원국이 계약 SajuChart 스키마를 통과한다(시주 있음·없음)', () => {
    expect(SajuChartSchema.safeParse(computeSajuChart(BIRTH, { asOf: ASOF })).success).toBe(true);
    expect(SajuChartSchema.safeParse(computeSajuChart({ ...BIRTH, hour: null }, { asOf: ASOF })).success).toBe(true);
  });
});

describe('정적 풀이·프롬프트', () => {
  const chart = computeSajuChart(BIRTH, { asOf: ASOF });
  it('섹션 4개가 비지 않고 계약을 통과한다', () => {
    const s = buildStaticSections(chart);
    expect(SajuSectionsSchema.safeParse(s).success).toBe(true);
    expect(s.personality.body).toContain('경금');
    expect(s.year.body).toContain('2026년');
    expect(s.cycle.current).toContain('대운');
    expect(s.advice.lucky.element).toBe(chart.favorable.primary);
    expect(s.advice.keyword.length).toBeGreaterThan(0);
  });
  it('오늘·궁합 정적 문장', () => {
    const d = buildStaticDaily(chart, dailyFortune(chart, ASOF));
    expect(d.body).toContain('계미');
    const m = buildStaticMatch(matchCharts(chart, computeSajuChart(BIRTH_B, { asOf: ASOF })), { a: '나', b: '그 사람' });
    expect(m.summary).toContain('나와 그 사람');
    expect(m.strengths).toHaveLength(3);
    expect(m.cautions).toHaveLength(2);
  });
  it('섹션 프롬프트에 사실 블록·요청·형식이 들어간다', () => {
    const p = buildSajuSectionPrompt(chart, 'personality');
    expect(p).toContain('[사주 사실');
    expect(p).toContain('경오(庚午)');
    expect(p).toContain('[일간 캐릭터');
    expect(p).toContain('"headline"');
    expect(buildSajuSectionPrompt(chart, 'advice')).toContain('[보완 오행의 행운 요소');
  });
});

describe('parseSajuJson', () => {
  const schema = z.object({ body: z.string().min(1), advice: z.string().min(1) });
  it('잡음 속 JSON 을 건지고 스키마 위반은 null', () => {
    expect(parseSajuJson('네, 여기요:\n{"body":"a","advice":"b"}\n끝', schema)).toEqual({ body: 'a', advice: 'b' });
    expect(parseSajuJson('{"body":"a"}', schema)).toBeNull();
    expect(parseSajuJson('not json', schema)).toBeNull();
  });
});

describe('SajuJobRegistry', () => {
  it('섹션 확정마다 버전이 오르고 wait 가 깨어난다', async () => {
    const reg = new SajuJobRegistry();
    const chart = computeSajuChart(BIRTH, { asOf: ASOF });
    const statics = buildStaticSections(chart);
    reg.create('job1', statics, ['personality', 'year']);
    const p = reg.wait('job1', 0, 5000);
    reg.settle('job1', 'personality', { ...statics.personality, status: 'ready', source: 'llm', model: 'm' });
    const snap = await p;
    expect(snap?.version).toBe(1);
    expect(snap?.done).toBe(false);
    expect(snap?.sections.personality.status).toBe('ready');
    reg.settle('job1', 'year', { ...statics.year, status: 'static' });
    const done = await reg.wait('job1', 1, 10);
    expect(done?.done).toBe(true);
    expect(done?.source).toBe('mixed');
    expect(await reg.wait('nope', 0, 10)).toBeNull();
    // 타임아웃이면 현재 스냅샷.
    const t = await reg.wait('job1', 99, 20);
    expect(t?.version).toBe(2);
    reg.clear();
  });
});

describe('SajuService (격리 DB)', () => {
  let isolated: IsolatedDatabase;
  let app: FastifyInstance;
  let provider: FakeProvider;
  let service: SajuService;
  let quota: UsageQuotaService;
  const guest = { userId: null, guestKey: 'guest-key-abcdef', ip: '127.0.0.1' };

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [{ id: 's-user', role: 'USER' }]);
  }, 120_000); // dev.db(2.7GB) 복사가 느릴 수 있다
  afterAll(async () => {
    await app.close();
    isolated.restore();
  });
  beforeEach(async () => {
    await app.prisma.sajuReading.deleteMany();
    await app.prisma.usageQuotaCounter.deleteMany();
    await app.prisma.usageQuotaSetting.deleteMany();
    provider = new FakeProvider();
    quota = new UsageQuotaService(app.prisma, { now: () => ASOF, settingsTtlMs: 0 });
    const deps: SajuServiceDeps = { quota, cache: fakeCache(provider), now: () => ASOF, llmTimeoutMs: 2000, jobs: new SajuJobRegistry() };
    service = new SajuService(app.prisma, new AiConfigService(app.prisma, ENV), deps);
  });

  it('전체 풀이: 즉시 정적(pending) + job, 섹션 4개 병렬 도착, 캐시 히트는 한도 소비 없음', async () => {
    const r = await service.createReading({ birth: BIRTH }, guest);
    expect(r.jobId).not.toBeNull();
    expect(r.chart.dayMaster.ko).toBe('경');
    expect(r.sections.personality.status).toBe('pending');
    expect(r.sections.personality.body.length).toBeGreaterThan(0);
    expect(r.quota.remainingToday).toBe(GUEST_PER_DAY - 1);
    const done = await service.pollJob(r.jobId as string, 0, 3000);
    // 4개 다 끝날 때까지 몇 번 더.
    let snap = done;
    for (let i = 0; i < 6 && !snap.done; i++) snap = await service.pollJob(r.jobId as string, snap.version, 3000);
    expect(snap.done).toBe(true);
    expect(snap.source).toBe('llm');
    expect(snap.sections.personality).toMatchObject({ status: 'ready', headline: '곧은 무쇠', model: 'saju-model' });
    expect(snap.sections.advice.lucky.element).toBe(r.chart.favorable.primary); // lucky 는 정적이 진실
    expect(provider.calls).toHaveLength(4);
    expect(service.cacheSize).toBe(4);
    // 캐시 히트 — job 없이 즉시, 한도 그대로.
    const again = await service.createReading({ birth: BIRTH }, guest);
    expect(again.jobId).toBeNull();
    expect(again.source).toBe('llm');
    expect(again.quota.remainingToday).toBe(GUEST_PER_DAY - 1);
    expect(provider.calls).toHaveLength(4);
  });

  it('섹션 일부 실패 → 그 섹션만 정적, source mixed', async () => {
    provider.handler = (o) => (sectionOfPrompt(o.prompt) === 'year' ? 'garbage' : sectionJson(sectionOfPrompt(o.prompt)));
    const r = await service.createReading({ birth: BIRTH }, guest);
    let snap = await service.pollJob(r.jobId as string, 0, 3000);
    for (let i = 0; i < 6 && !snap.done; i++) snap = await service.pollJob(r.jobId as string, snap.version, 3000);
    expect(snap.done).toBe(true);
    expect(snap.source).toBe('mixed');
    expect(snap.sections.year.status).toBe('static');
    expect(snap.sections.personality.status).toBe('ready');
    expect(service.cacheSize).toBe(3);
    expect(provider.calls.filter((c) => sectionOfPrompt(c.prompt) === 'year')).toHaveLength(2); // 수리 재시도 1회
  });

  it('회원은 섹션 완료 뒤 저장되고 readingId 가 job 에 붙는다', async () => {
    const member = { userId: 's-user', guestKey: null, ip: '127.0.0.1' };
    const r = await service.createReading({ birth: BIRTH }, member);
    expect(r.quota.remainingToday).toBeNull();
    let snap = await service.pollJob(r.jobId as string, 0, 3000);
    for (let i = 0; i < 8 && !(snap.done && snap.readingId); i++) snap = await service.pollJob(r.jobId as string, snap.version, 3000);
    expect(snap.readingId).not.toBeNull();
    const row = await app.prisma.sajuReading.findUnique({ where: { id: snap.readingId as string } });
    expect(row?.kind).toBe('full');
    expect(row?.source).toBe('llm');
    expect(JSON.parse(row?.chartJson ?? '{}').dayMaster.ko).toBe('경');
  });

  it('한도 초과(기능 비활성)이면 정적 풀이(job 없음)', async () => {
    // guestPerDay 0 은 "제한 없음" 이라 enabled=false 로 막는다.
    await app.prisma.usageQuotaSetting.upsert({
      where: { feature: 'saju-reading' },
      create: { feature: 'saju-reading', enabled: false, guestPerDay: 30, ipPerDay: 300, ipPerMinute: 20, globalPerDay: 3000, guestCutoffPct: 90 },
      update: { enabled: false },
    });
    quota = new UsageQuotaService(app.prisma, { now: () => ASOF, settingsTtlMs: 0 });
    service = new SajuService(app.prisma, new AiConfigService(app.prisma, ENV), { quota, cache: fakeCache(provider), now: () => ASOF });
    const r = await service.createReading({ birth: BIRTH }, guest);
    expect(r.jobId).toBeNull();
    expect(r.source).toBe('static');
    expect(r.sections.personality.status).toBe('static');
    expect(provider.calls).toHaveLength(0);
    await app.prisma.usageQuotaSetting.deleteMany();
  });

  it('오늘·궁합·택일·음식 — LLM 문장 + 계산값, 캐시', async () => {
    provider.handler = (o) => {
      if (o.prompt.includes('오늘 하루의 운세')) return JSON.stringify({ body: '오늘 본문', advice: '오늘 조언' });
      if (o.prompt.includes('궁합을 써라')) return JSON.stringify({ summary: '궁합 요약', strengths: ['a', 'b', 'c'], cautions: ['d', 'e'], advice: '조언' });
      if (o.prompt.includes('[용도]')) {
        const dates = [...o.prompt.matchAll(/date="(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]);
        return JSON.stringify({ reasons: dates.map((d) => ({ date: d, reason: `${d} 이유` })) });
      }
      const ids = [...o.prompt.matchAll(/menuId="([^"]+)"/g)].map((m) => m[1]);
      return JSON.stringify({ picks: ids.map((id) => ({ menuId: id, reason: `${id} 이유` })), extra: 1 });
    };
    const d = await service.daily({ birth: BIRTH }, guest);
    expect(d.day.ko).toBe('계미');
    expect(d.body).toBe('오늘 본문');
    expect(d.source).toBe('llm');
    expect(d.lucky.element).toBe('wood');
    const d2 = await service.daily({ birth: BIRTH }, guest);
    expect(d2.quota.remainingToday).toBe(d.quota.remainingToday);

    const m = await service.match({ a: BIRTH, b: BIRTH_B, labels: { a: '나', b: '그 사람' } }, guest);
    expect(m.score).toBeGreaterThan(0);
    expect(m.summary).toBe('궁합 요약');
    expect(m.a.label).toBe('나');
    expect(m.breakdown).toHaveLength(5);

    const p = await service.datePick({ birth: BIRTH, purpose: 'move', days: 20, from: undefined }, guest);
    expect(p.days).toHaveLength(20);
    expect(p.top).toHaveLength(3);
    expect(p.top[0]?.reason).toContain('이유');
    expect(p.from).toBe('2026-09-06');

    const f = await service.food({ birth: BIRTH, today: true }, guest);
    expect(f.picks).toHaveLength(3);
    expect(f.picks[0]?.reason).toContain('이유');
    expect(f.dayElement).toBe('water'); // 계미일 천간 계 = 수
    expect(f.source).toBe('llm');
  });

  it('입력 오류는 SajuError(invalid_input)', async () => {
    await expect(service.createReading({ birth: { ...BIRTH, month: 2, day: 30 } }, guest)).rejects.toThrowError(SajuError);
    await expect(service.daily({ birth: BIRTH, date: '2027-01-01' }, guest)).rejects.toThrow(/7일/);
    await expect(service.pollJob('nope-nope', 0, 10)).rejects.toMatchObject({ code: 'job_gone' });
  });

  it('섹션 캐시 키는 연도·성별·프롬프트 버전에 묶인다', () => {
    const a = computeSajuChart(BIRTH, { asOf: ASOF });
    const b = computeSajuChart({ ...BIRTH, gender: 'F' }, { asOf: ASOF });
    expect(sectionCacheKey(a, 'year')).not.toBe(sectionCacheKey(b, 'year'));
    expect(sectionCacheKey(a, 'year')).not.toBe(sectionCacheKey(a, 'advice'));
    expect(sectionCacheKey(a, 'year')).toBe(sectionCacheKey(computeSajuChart(BIRTH, { asOf: ASOF }), 'year'));
  });
});

describe('라우트 (provider 비활성 → 정적 경로)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;
  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    // .env 의 실제 키로 클라우드를 부르지 않게 saju 용도 row 를 비활성 — 정적 경로만 친다.
    await app.prisma.llmProviderConfig.create({ data: { provider: 'ollama-cloud', purpose: 'saju', apiKey: 'x', enabled: false } });
  }, 120_000);
  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('POST /saju/readings → 200 정적 풀이 + 원국', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/saju/readings', headers: { 'x-guest-key': 'guest-key-abcdef' }, payload: { birth: { year: 1990, month: 5, day: 15, hour: 14, minute: 30, gender: 'M' } } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.chart.pillars.day.ko).toBe('경진');
    expect(body.source).toBe('static');
    expect(body.jobId).toBeNull();
    expect(body.quota.remainingToday).toBe(GUEST_PER_DAY - 1);
  });
  it('잘못된 날짜 400, 없는 job 410', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/v1/saju/readings', payload: { birth: { year: 1990, month: 2, day: 30, hour: null, gender: 'M' } } });
    expect(bad.statusCode).toBe(400);
    const gone = await app.inject({ method: 'GET', url: '/api/v1/saju/readings/jobs/abcdefghijk?after=0&wait=0' });
    expect(gone.statusCode).toBe(410);
  });
  it('오늘·궁합·택일·음식 200', async () => {
    const birth = { year: 1990, month: 5, day: 15, hour: 14, minute: 30, gender: 'M' };
    for (const [url, payload] of [
      ['/api/v1/saju/daily', { birth }],
      ['/api/v1/saju/match', { a: birth, b: { ...birth, year: 1992, gender: 'F' } }],
      ['/api/v1/saju/date-pick', { birth, purpose: 'trip', days: 10 }],
      ['/api/v1/saju/food', { birth }],
    ] as const) {
      const res = await app.inject({ method: 'POST', url, payload });
      expect(res.statusCode, url).toBe(200);
      expect(res.json().source).toBe('static');
    }
  });
});

describe('SajuRecordsService (격리 DB) — 공유·프로필·기록', () => {
  let isolated: IsolatedDatabase;
  let app: FastifyInstance;
  let service: SajuService;
  let records: SajuRecordsService;
  const guest = { userId: null, guestKey: 'guest-key-abcdef', ip: '127.0.0.1' };
  const member = { userId: 'r-user', guestKey: null, ip: '127.0.0.1' };

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [{ id: 'r-user', role: 'USER' }]);
    const provider = new FakeProvider();
    const quota = new UsageQuotaService(app.prisma, { now: () => ASOF, settingsTtlMs: 0 });
    service = new SajuService(app.prisma, new AiConfigService(app.prisma, ENV), { quota, cache: fakeCache(provider), now: () => ASOF, jobs: new SajuJobRegistry() });
    records = new SajuRecordsService(app.prisma, service);
  }, 120_000);
  afterAll(async () => {
    await app.close();
    isolated.restore();
  });
  beforeEach(async () => {
    await app.prisma.sajuReading.deleteMany();
    await app.prisma.sajuProfile.deleteMany();
  });

  it('게스트 공유: 입력만으로 행을 만들고(LLM 호출 없음) 생년월일은 기본 숨김', async () => {
    const share = await records.createShare({ birth: BIRTH, includeBirth: false }, guest);
    expect(share.path).toBe(`/saju/s/${share.token}`);
    const shared = await records.getShared(share.token);
    expect(shared.includeBirth).toBe(false);
    expect(shared.chart.pillars.day.ko).toBe('경진');
    expect(shared.chart.solar).toEqual({ year: 1990, month: 0, day: 0 }); // 숨김
    expect(shared.chart.lunar).toBeNull();
    expect(shared.sections.personality.status).toBe('static');
    const withBirth = await records.createShare({ birth: BIRTH, includeBirth: true }, guest);
    expect((await records.getShared(withBirth.token)).chart.solar).toEqual({ year: 1990, month: 5, day: 15 });
    const meta = await records.getSharePreviewMeta(share.token);
    expect(meta?.title).toContain('경庚 일간');
    expect(await records.getSharePreviewMeta('nope-nope-nope')).toBeNull();
  });

  it('회원 공유는 저장된 행에 토큰만, 기록 목록·상세·삭제', async () => {
    const r = await service.createReading({ birth: BIRTH }, member);
    let snap = await service.pollJob(r.jobId as string, 0, 3000);
    for (let i = 0; i < 8 && !(snap.done && snap.readingId); i++) snap = await service.pollJob(r.jobId as string, snap.version, 3000);
    const readingId = snap.readingId as string;
    const s1 = await records.createShare({ readingId, includeBirth: false }, member);
    const s2 = await records.createShare({ readingId, includeBirth: true }, member);
    expect(s2.token).toBe(s1.token);
    expect(s2.includeBirth).toBe(true);
    const list = await records.listMine('r-user', { limit: 10 });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ id: readingId, kind: 'full', signature: '경오 신사 경진 계미', dayMaster: '경庚' });
    const detail = await records.getMine('r-user', readingId);
    expect(detail.sections.personality.headline).toBe('곧은 무쇠');
    await expect(records.getMine('other', readingId)).rejects.toMatchObject({ code: 'not_found' });
    await records.deleteMine('r-user', readingId);
    expect((await records.listMine('r-user', { limit: 10 })).items).toHaveLength(0);
    await expect(records.createShare({ readingId, includeBirth: false }, member)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('프로필: 첫 프로필이 primary, 지정 이동, 최대 10, 삭제 시 primary 승계', async () => {
    const a = await records.createProfile('r-user', { label: '나', birth: BIRTH, isPrimary: false });
    expect(a.isPrimary).toBe(true);
    const b = await records.createProfile('r-user', { label: '엄마', birth: BIRTH_B, isPrimary: true });
    expect(b.isPrimary).toBe(true);
    const list = await records.listProfiles('r-user');
    expect(list.map((p) => [p.label, p.isPrimary])).toEqual([['엄마', true], ['나', false]]);
    expect(list[1]?.birth).toMatchObject({ year: 1990, month: 5, day: 15, hour: 14, minute: 30, gender: 'M' });
    await records.deleteProfile('r-user', b.id);
    expect((await records.listProfiles('r-user'))[0]).toMatchObject({ id: a.id, isPrimary: true });
    for (let i = 0; i < 9; i++) await records.createProfile('r-user', { label: `p${i}`, birth: BIRTH, isPrimary: false });
    await expect(records.createProfile('r-user', { label: 'over', birth: BIRTH, isPrimary: false })).rejects.toThrow(/10명/);
    await expect(records.createProfile('r-user', { label: 'bad', birth: { ...BIRTH, month: 2, day: 30 }, isPrimary: false })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('오늘의 운세 회원 하루 1회 잠금', () => {
  let isolated: IsolatedDatabase;
  let app: FastifyInstance;
  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [{ id: 'd-user', role: 'USER' }]);
  }, 120_000);
  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('회원은 같은 사주의 오늘 운세를 저장된 행으로 돌려주고(LLM 1회), 게스트는 잠그지 않는다', async () => {
    const provider = new FakeProvider();
    provider.handler = () => JSON.stringify({ body: '오늘 본문', advice: '오늘 조언' });
    const quota = new UsageQuotaService(app.prisma, { now: () => ASOF, settingsTtlMs: 0 });
    const make = () => new SajuService(app.prisma, new AiConfigService(app.prisma, ENV), { quota, cache: fakeCache(provider), now: () => ASOF, jobs: new SajuJobRegistry() });
    const member = { userId: 'd-user', guestKey: null, ip: '127.0.0.1' };
    const first = await make().daily({ birth: BIRTH }, member);
    expect(first.source).toBe('llm');
    expect(provider.calls).toHaveLength(1);
    // 새 서비스 인스턴스(캐시 없음)여도 저장된 행이 돌아온다.
    const second = await make().daily({ birth: BIRTH }, member);
    expect(second.body).toBe('오늘 본문');
    expect(second.quota.remainingToday).toBeNull();
    expect(provider.calls).toHaveLength(1);
    const rows = await app.prisma.sajuReading.findMany({ where: { userId: 'd-user', kind: 'daily' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dailyLockKey).toMatch(/^d-user:[0-9a-f]{16}:2026-09-06$/);
    // 다른 날짜 조회는 잠그지 않는다.
    await make().daily({ birth: BIRTH, date: '2026-09-07' }, member);
    expect(await app.prisma.sajuReading.count({ where: { userId: 'd-user', kind: 'daily' } })).toBe(1);
    // 기록 목록엔 daily 행이 나오지 않는다.
    const records = new SajuRecordsService(app.prisma, make());
    expect((await records.listMine('d-user', { limit: 10 })).items).toHaveLength(0);
  });
});
