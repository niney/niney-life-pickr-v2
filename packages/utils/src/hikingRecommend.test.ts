import { describe, expect, it } from 'vitest';
import {
  estimateDriveMinutes,
  hikingAccessCautions,
  hikingAccessFit,
  hikingConditionFit,
  hikingDistanceFit,
  hikingLevelFit,
  hikingRecommendReason,
  hikingRecommendScore,
  hikingSeasonKeywords,
  hikingTimeFit,
  type HikingRecommendFacts,
} from './hikingRecommend.js';

const facts = (p: Partial<HikingRecommendFacts> = {}): HikingRecommendFacts => ({
  outingMin: 270,
  difficulty: 'moderate',
  shape: 'loop',
  driveMin: 60,
  parking: true,
  transitStart: false,
  transitEnd: false,
  daylight: 'ok',
  cautions: [],
  season: [],
  ...p,
});
const wants = { duration: 'half', level: 'any', mode: 'car' } as const;

describe('estimateDriveMinutes', () => {
  it('가까우면 느리게, 멀면 빠르게 — 직선 10km ≈ 30분, 100km ≈ 1시간 55분, 200km ≈ 3시간 20분', () => {
    expect(estimateDriveMinutes(10_000)).toBe(28);
    expect(estimateDriveMinutes(100_000)).toBe(114);
    expect(estimateDriveMinutes(200_000)).toBe(205);
  });
});

describe('점수 항목', () => {
  it('산행 시간 — 범위 안은 가운데일수록, 밖은 1시간 넘게 벗어나면 0', () => {
    expect(hikingTimeFit(270, 'half')).toBe(25);
    expect(hikingTimeFit(180, 'half')).toBeCloseTo(25 - (10 * 90) / 150, 5);
    expect(hikingTimeFit(150, 'half')).toBeCloseTo(7.5, 5);
    expect(hikingTimeFit(100, 'half')).toBe(0);
    expect(hikingTimeFit(null, 'half')).toBe(5);
  });

  it('난이도 — 상관없음 만점, 한 단계 차이 6, 두 단계 0', () => {
    expect(hikingLevelFit('hard', 'any')).toBe(15);
    expect(hikingLevelFit('easy', 'easy')).toBe(15);
    expect(hikingLevelFit('moderate', 'easy')).toBe(6);
    expect(hikingLevelFit('hard', 'easy')).toBe(0);
  });

  it('거리 — 30분 안 만점, 4시간 0, 위치 없으면 절반', () => {
    expect(hikingDistanceFit(20)).toBe(25);
    expect(hikingDistanceFit(240)).toBe(0);
    expect(hikingDistanceFit(null)).toBe(12.5);
  });

  it('접근 — 차는 주차·돌아오는 코스, 대중교통은 들머리 정류장·(편도면) 날머리 정류장', () => {
    expect(hikingAccessFit(facts(), 'car')).toBe(10);
    expect(hikingAccessFit(facts({ shape: 'traverse' }), 'car')).toBe(6);
    expect(hikingAccessFit(facts({ shape: 'traverse', transitStart: true, transitEnd: true }), 'transit')).toBe(10);
    expect(hikingAccessFit(facts({ shape: 'traverse', transitStart: true }), 'transit')).toBe(6);
  });

  it('오늘의 조건 — 경고 −6·안내 −2, 바닥 −20, 못 받았으면 절반', () => {
    expect(hikingConditionFit([])).toBe(10);
    expect(hikingConditionFit([{ level: 'warn', text: 'a' }, { level: 'info', text: 'b' }])).toBe(2);
    expect(hikingConditionFit(Array.from({ length: 6 }, () => ({ level: 'warn' as const, text: 'x' })))).toBe(-20);
    expect(hikingConditionFit(null)).toBe(5);
  });

  it('합계 — 해 진 뒤 하산·멀고 시간 안 맞는 코스는 뒤로, 계절 +5', () => {
    const good = hikingRecommendScore(facts(), wants);
    // 25 + 15 + 25×(1 − 30/210) + 15 + 10 + 10 = 96.43 → 소수 한 자리.
    expect(good).toBe(96.4);
    expect(hikingRecommendScore(facts({ daylight: 'dark' }), wants)).toBeLessThan(good - 30);
    expect(hikingRecommendScore(facts({ season: ['단풍'] }), wants)).toBeCloseTo(good + 5, 5);
    expect(hikingRecommendScore(facts({ outingMin: 480, driveMin: 200 }), wants)).toBeLessThan(good - 25);
  });
});

describe('hikingSeasonKeywords', () => {
  it('그 달 볼거리만', () => {
    const text = '가을 단풍과 봄 철쭉, 정상 억새밭';
    expect(hikingSeasonKeywords(text, 10)).toEqual(['단풍', '억새']);
    expect(hikingSeasonKeywords(text, 5)).toEqual(['철쭉']);
    expect(hikingSeasonKeywords(text, 7)).toEqual([]);
  });
});

describe('hikingAccessCautions', () => {
  it('차로 편도·주차 없음, 대중교통 정류장 없음', () => {
    expect(hikingAccessCautions('car', facts({ shape: 'traverse', parking: false })).map((c) => c.text)).toEqual([
      '편도 코스 — 내려온 곳에서 차를 둔 들머리로 돌아가야 합니다',
      '들머리 1km 안에 주차장 정보가 없습니다',
    ]);
    expect(hikingAccessCautions('car', facts())).toEqual([]);
    expect(hikingAccessCautions('transit', facts({ shape: 'traverse', transitStart: true })).map((c) => c.text)).toEqual(['날머리 근처 정류장 정보가 없습니다']);
  });
});

describe('hikingRecommendReason', () => {
  const base = {
    mode: 'car' as const,
    straightM: 98_000,
    driveMin: 112,
    shape: 'loop' as const,
    outingMin: 250,
    difficulty: 'moderate' as const,
    startHm: '09:00',
    endHm: '13:10',
    sunsetHm: '17:34',
    daylight: 'ok' as const,
    weather: '구름많음·가장 높은 곳 9°C(추정)',
    parkingName: '오색주차장',
    transitName: null,
    season: ['단풍'],
  };

  it('거리·코스·하산 한 문장 + 날씨·주차·계절', () => {
    expect(hikingRecommendReason(base)).toBe(
      '차로 약 1시간 50분(직선 98km) 거리의 원점회귀 4시간 10분·보통 코스로, 09:00에 출발하면 13:10쯤 내려옵니다(일몰 17:34). 구름많음·가장 높은 곳 9°C(추정), 들머리 근처 오색주차장, 산 소개에 단풍이 나옵니다.',
    );
  });

  it('대중교통은 직선거리만, 정류장 이름이 스스로 정류장이면 그대로 · 해 진 뒤 · 억새(받침 없음)', () => {
    expect(
      hikingRecommendReason({
        ...base,
        mode: 'transit',
        transitName: '사당역',
        daylight: 'dark',
        endHm: '18:10',
        weather: null,
        season: ['억새'],
      }),
    ).toBe(
      '직선 98km 거리의 원점회귀 4시간 10분·보통 코스로, 09:00에 출발하면 18:10쯤 내려와 해가 진 뒤입니다(일몰 17:34). 들머리 근처 사당역, 산 소개에 억새가 나옵니다.',
    );
    expect(hikingRecommendReason({ ...base, mode: 'transit', transitName: '원서', weather: null, season: [] })).toContain('들머리 근처 정류장 원서.');
  });

  it('위치·하산 시각을 모르면 그 토막을 뺀다', () => {
    expect(hikingRecommendReason({ ...base, straightM: null, driveMin: null, endHm: null, weather: null, parkingName: null, season: [] })).toBe(
      '원점회귀 4시간 10분·보통 코스입니다.',
    );
  });
});
