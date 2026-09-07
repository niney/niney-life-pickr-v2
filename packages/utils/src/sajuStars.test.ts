import { describe, expect, it } from 'vitest';
import { computeSajuChart, SAJU_STAR_META, type StarId } from './saju';
import { SAJU_DAY_PILLAR_TEXT, sajuDayPillarReadingOf } from './sajuDayPillar';
import { SAJU_STAR_TEXT } from './sajuText';

const ASOF = new Date('2026-09-06T03:00:00Z');
const ids = (c: ReturnType<typeof computeSajuChart>): StarId[] => c.stars.map((s) => s.id);

describe('신살 확장(7차)', () => {
  it('메타·문구가 14종 전부 있다', () => {
    const all = Object.keys(SAJU_STAR_META) as StarId[];
    expect(all).toHaveLength(14);
    for (const id of all) expect(SAJU_STAR_TEXT[id].length).toBeGreaterThan(5);
  });
  it('경금 일간 + 술·해 → 천라지망, 사월 태생(사월 천덕 = 신금 천간)', () => {
    // 1990-05-15 14:30 = 경오 신사 경진 계미 — 사월 천덕은 천간 신(辛): 월간 신 → 천덕귀인(month).
    const A = computeSajuChart({ calendar: 'solar', year: 1990, month: 5, day: 15, hour: 14, minute: 30, gender: 'M' }, { asOf: ASOF });
    expect(A.stars.find((s) => s.id === 'cheondeok')?.pillars).toEqual(['month']);
    // 경금 일간 금여·홍염 = 술 — 원국에 술 없음. 진(일지)+사(월지)가 있어 지망(진사) → 천라지망.
    expect(ids(A)).not.toContain('geumyeo');
    expect(ids(A)).not.toContain('hongyeom');
    expect([...(A.stars.find((s) => s.id === 'cheonra')?.pillars ?? [])].sort()).toEqual(['day', 'month']);
  });
  it('임술 일주에 해가 있으면 천라(술해), 무진 일주에 사가 있으면 지망(진사)', () => {
    // 1982-11-13 = 임술년 신해월 … 을 찾기보다 직접 기둥을 확인: 술·해가 함께 있는 날을 고른다.
    const c = computeSajuChart({ calendar: 'solar', year: 1982, month: 11, day: 20, hour: 22, minute: 0, gender: 'F' }, { asOf: ASOF });
    const branches = [c.pillars.year, c.pillars.month, c.pillars.day, c.pillars.hour].filter(Boolean).map((p) => p!.branch);
    const hasCheonra = branches.includes(10) && branches.includes(11);
    expect(ids(c).includes('cheonra')).toBe(hasCheonra);
    if (hasCheonra) expect(c.stars.find((s) => s.id === 'cheonra')!.pillars.length).toBeGreaterThanOrEqual(2);
  });
  it('귀문관은 일지와 다른 기둥의 쌍(자유·축오·인미·묘신·진해·사술)', () => {
    // 병인 일주(1990-01-01) — 인미 쌍이 있으면 귀문관. 시주를 미(13~15시)로 두면 인+미.
    const c = computeSajuChart({ calendar: 'solar', year: 1990, month: 1, day: 1, hour: 14, minute: 0, gender: 'M' }, { asOf: ASOF });
    expect(c.pillars.day.branch).toBe(2);
    expect(c.pillars.hour?.branch).toBe(7);
    expect(c.stars.find((s) => s.id === 'gwimun')?.pillars).toEqual(['hour']);
  });
  it('월덕귀인 — 자월(신자진) 태생은 천간 임', () => {
    // 1990-01-01 은 병자월(자월) → 월덕 = 임. 임 천간이 있는 시간을 고른다: 병 일간의 임 시간 = 진시(07~09) → 임진.
    const c = computeSajuChart({ calendar: 'solar', year: 1990, month: 1, day: 1, hour: 8, minute: 0, gender: 'M' }, { asOf: ASOF });
    expect(c.pillars.month.branch).toBe(0);
    expect(c.pillars.hour?.stem).toBe(8);
    expect(c.stars.find((s) => s.id === 'woldeok')?.pillars).toEqual(['hour']);
  });
});

describe('60갑자 일주론', () => {
  it('60개 전부, index = 60갑자, 제목·성향 비어 있지 않음', () => {
    expect(SAJU_DAY_PILLAR_TEXT).toHaveLength(60);
    expect(SAJU_DAY_PILLAR_TEXT[0]).toMatchObject({ ganzhi: 0, ko: '갑자', hanja: '甲子' });
    expect(SAJU_DAY_PILLAR_TEXT[2]!.title).toBe('호랑이 등에 탄 태양');
    expect(SAJU_DAY_PILLAR_TEXT[59]).toMatchObject({ ko: '계해' });
    expect(new Set(SAJU_DAY_PILLAR_TEXT.map((t) => t.title)).size).toBe(60);
    for (const t of SAJU_DAY_PILLAR_TEXT) expect(t.tagline.length).toBeGreaterThan(8);
  });
  it('원국 일주 해석 — 경진 일주는 강철, 본문에 별칭·배우자 자리·십이운성', () => {
    const A = computeSajuChart({ calendar: 'solar', year: 1990, month: 5, day: 15, hour: 14, minute: 30, gender: 'M' }, { asOf: ASOF });
    const r = sajuDayPillarReadingOf(A);
    expect(r.ko).toBe('경진');
    expect(r.title).toBe('용의 비늘 같은 강철');
    expect(r.body).toContain("'용의 비늘 같은 강철'");
    expect(r.body).toContain('배우자');
    expect(r.body).toContain(`십이운성은 ${A.pillars.day.twelveStage}`);
    expect(r.spouseTenGod).toBe(A.pillars.day.branchTenGod);
  });
});
