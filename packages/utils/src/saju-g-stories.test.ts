import { describe, expect, it } from 'vitest';
import { SAJU_G_BRANCHES, SAJU_G_STEMS } from './saju-g.js';
import { basicSajuGLifeScenes, sajuGDayStory, sajuGGodCards } from './saju-g-stories.js';

const chart = {
  dayMaster: SAJU_G_STEMS[0],
  pillars: [
    {
      key: 'day' as const,
      ganZhi: '甲子',
      tenGod: '비견',
      hiddenStems: [{ ko: '계', tenGod: '정인' }],
    },
    {
      key: 'month' as const,
      ganZhi: '丙寅',
      tenGod: '식신',
      hiddenStems: [
        { ko: '갑', tenGod: '비견' },
        { ko: '병', tenGod: '식신' },
      ],
    },
  ],
};

describe('확정 명식으로 만드는 사주(G) 이야기', () => {
  it('60개 일주 모두 실제 글자와 오행으로 카드를 만든다', () => {
    for (let i = 0; i < 60; i++) {
      const stem = SAJU_G_STEMS[i % 10]!;
      const branch = SAJU_G_BRANCHES[i % 12]!;
      const ganZhi = stem.hanja + branch.hanja;
      const story = sajuGDayStory({ dayMaster: stem, pillars: [{ ...chart.pillars[0]!, ganZhi }] });
      expect(story).toMatchObject({
        ganZhi,
        name: `${stem.ko}${branch.ko}일주`,
        stemElement: stem.element,
        branchElement: branch.element,
      });
      expect(story?.text).not.toContain('undefined');
    }
  });
  it('미확정 일주를 연주나 월주로 대체하지 않는다', () => {
    const uncertain = {
      dayMaster: null,
      pillars: chart.pillars.map((p) => (p.key === 'day' ? { ...p, ganZhi: null } : p)),
    };
    expect(sajuGDayStory(uncertain)).toBeNull();
    expect(sajuGGodCards(uncertain)).toEqual([]);
    expect(basicSajuGLifeScenes(uncertain).every((s) => s.evidenceIds.join() === 'scope')).toBe(
      true,
    );
  });
  it('일간 자신은 제외하고 천간과 지장간의 위치를 구분한다', () => {
    const cards = sajuGGodCards(chart);
    expect(cards.find((c) => c.name === '비견')?.positions).toEqual(['월주 지장간 갑']);
    expect(cards.find((c) => c.name === '식신')?.positions).toEqual([
      '월주 천간',
      '월주 지장간 병',
    ]);
    expect(cards.find((c) => c.name === '정인')?.positions).toEqual(['일주 지장간 계']);
    expect(cards.some((c) => c.name === '정관')).toBe(false);
  });
  it('미확정 기둥의 잔여 필드는 십성 카드에 넣지 않는다', () => {
    const cards = sajuGGodCards({
      ...chart,
      pillars: chart.pillars.map((p) => (p.key === 'month' ? { ...p, ganZhi: null } : p)),
    });
    expect(cards.map((c) => c.name)).toEqual(['정인']);
  });
});
