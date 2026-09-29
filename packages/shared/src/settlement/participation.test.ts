import { describe, expect, it } from 'vitest';
import {
  axesInPlay,
  joinedAxes,
  participationAxis,
  type ParticipationFlags,
} from './participation.js';

// 참여 축 표시 규칙 — 저장은 exclude 플래그, 화면은 긍정(참여) 배지.
// 배지는 "누군가 빠진 축"에서만 띄워야 전원 참여 정산이 배지로 도배되지 않는다.

const flags = (over: Partial<ParticipationFlags> = {}): ParticipationFlags => ({
  excludeAlcohol: false,
  excludeNonAlcohol: false,
  excludeSide: false,
  ...over,
});

describe('participation', () => {
  it('전원 참여면 배지를 띄울 축이 없다', () => {
    expect(axesInPlay([flags(), flags()])).toEqual([]);
  });

  it('한 명만 술을 안 마시면 술 축만 쟁점 — 마시는 사람에게만 술 배지', () => {
    const drinker = flags();
    const sober = flags({ excludeAlcohol: true });
    const axes = axesInPlay([drinker, sober]);
    expect(axes.map((a) => a.label)).toEqual(['술']);
    expect(joinedAxes(axes, drinker).map((a) => a.label)).toEqual(['술']);
    expect(joinedAxes(axes, sober)).toEqual([]);
  });

  it('축 순서는 술·음료·안주로 고정된다', () => {
    const axes = axesInPlay([
      flags({ excludeSide: true }),
      flags({ excludeAlcohol: true, excludeNonAlcohol: true }),
    ]);
    expect(axes.map((a) => a.label)).toEqual(['술', '음료', '안주']);
  });

  it('차수 특이사항 동사 — 마실 것은 마심, 안주는 먹음', () => {
    expect(participationAxis('excludeAlcohol').skipVerb).toBe('안 마심');
    expect(participationAxis('excludeNonAlcohol').doVerb).toBe('마심');
    expect(participationAxis('excludeSide').skipVerb).toBe('안 먹음');
  });
});
