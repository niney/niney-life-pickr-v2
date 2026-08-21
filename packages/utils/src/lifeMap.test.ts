import { describe, expect, it } from 'vitest';
import {
  LIFE_CCTV_PURPOSES,
  formatLifeCount,
  formatLifeYm,
  lifeCctvPurposeGroup,
  lifeCctvPurposesOfGroup,
  lifeCellSizeDeg,
  lifeCountBucket,
  lifeToiletOpen24,
  normalizeLifeCctvPurpose,
  normalizeLifeToiletKind,
  normalizeLifeToiletOpenType,
  parseLifeCctvPurposes,
  summarizeLifeToiletFixtures,
} from './lifeMap.js';

describe('lifeMap — CCTV 설치목적', () => {
  it('원본 10종은 그대로, 공백·미지 값은 기타', () => {
    for (const p of LIFE_CCTV_PURPOSES) expect(normalizeLifeCctvPurpose(p)).toBe(p);
    expect(normalizeLifeCctvPurpose(' 생활 방범 ')).toBe('생활방범');
    expect(normalizeLifeCctvPurpose('')).toBe('기타');
    expect(normalizeLifeCctvPurpose(null)).toBe('기타');
    expect(normalizeLifeCctvPurpose('불법주정차')).toBe('기타');
  });

  it('범례 그룹 4종 — 교통 2종 묶음, 나머지는 다목적·기타', () => {
    expect(lifeCctvPurposeGroup('생활방범')).toBe('safety');
    expect(lifeCctvPurposeGroup('어린이보호')).toBe('child');
    expect(lifeCctvPurposeGroup('교통단속')).toBe('traffic');
    expect(lifeCctvPurposeGroup('교통정보수집')).toBe('traffic');
    expect(lifeCctvPurposeGroup('다목적')).toBe('etc');
    expect(lifeCctvPurposeGroup('알수없음')).toBe('etc');
    expect(lifeCctvPurposesOfGroup('traffic')).toEqual(['교통단속', '교통정보수집']);
    // 모든 목적이 어느 한 그룹에 속한다.
    const all = new Set(LIFE_CCTV_PURPOSES);
    for (const g of ['safety', 'child', 'traffic', 'etc'] as const) {
      for (const p of lifeCctvPurposesOfGroup(g)) all.delete(p);
    }
    expect(all.size).toBe(0);
  });

  it('쉼표 파라미터 — 유효값만·중복 제거·빈값은 전체(빈 배열)', () => {
    expect(parseLifeCctvPurposes('생활방범, 어린이보호,생활방범,없는값')).toEqual(['생활방범', '어린이보호']);
    expect(parseLifeCctvPurposes('')).toEqual([]);
    expect(parseLifeCctvPurposes(undefined)).toEqual([]);
  });
});

describe('lifeMap — 공중화장실', () => {
  it('구분·개방시간 정규화', () => {
    expect(normalizeLifeToiletKind('개방화장실')).toBe('개방화장실');
    expect(normalizeLifeToiletKind('')).toBe('기타');
    expect(normalizeLifeToiletOpenType('상시')).toBe('상시');
    expect(normalizeLifeToiletOpenType(null)).toBe('미상');
  });

  it('24시간 판정 — 상시·상세 24시간·00:00~24:00 은 true, 미개방·운영시간은 false', () => {
    expect(lifeToiletOpen24('상시', null)).toBe(true);
    expect(lifeToiletOpen24('정시', '24시간')).toBe(true);
    expect(lifeToiletOpen24('정시', '00:00 ~ 24:00')).toBe(true);
    expect(lifeToiletOpen24('정시', '연중무휴 24시간')).toBe(true);
    expect(lifeToiletOpen24('정시', '09:00~18:00')).toBe(false);
    expect(lifeToiletOpen24('정시', '9시간')).toBe(false);
    expect(lifeToiletOpen24('미개방', '24시간')).toBe(false);
    expect(lifeToiletOpen24('', '')).toBe(false);
  });

  it('변기수 요약', () => {
    const base = {
      maleToilet: 0,
      maleUrinal: 0,
      maleDisabledToilet: 0,
      maleDisabledUrinal: 0,
      maleKidsToilet: 0,
      maleKidsUrinal: 0,
      femaleToilet: 0,
      femaleDisabledToilet: 0,
      femaleKidsToilet: 0,
    };
    expect(summarizeLifeToiletFixtures(base)).toBeNull();
    expect(summarizeLifeToiletFixtures({ ...base, maleToilet: 1, maleUrinal: 2, femaleToilet: 3 })).toBe(
      '남 대변기 1·소변기 2 / 여 대변기 3',
    );
    expect(summarizeLifeToiletFixtures({ ...base, femaleToilet: 2 })).toBe('여 대변기 2');
  });
});

describe('lifeMap — 표시·셀', () => {
  it('설치연월 포맷', () => {
    expect(formatLifeYm('201312')).toBe('2013.12');
    expect(formatLifeYm('2013-12')).toBe('2013.12');
    expect(formatLifeYm('20131205')).toBe('2013.12');
    expect(formatLifeYm('2013')).toBeNull();
    expect(formatLifeYm('201399')).toBeNull();
    expect(formatLifeYm(null)).toBeNull();
  });

  it('버블 숫자·버킷', () => {
    expect(formatLifeCount(7)).toBe('7');
    expect(formatLifeCount(999)).toBe('999');
    expect(formatLifeCount(1000)).toBe('1천');
    expect(formatLifeCount(1234)).toBe('1.2천');
    expect(formatLifeCount(12_345)).toBe('1.2만');
    expect(formatLifeCount(123_456)).toBe('12만');
    expect(lifeCountBucket(1)).toBe(0);
    expect(lifeCountBucket(10)).toBe(1);
    expect(lifeCountBucket(100)).toBe(2);
    expect(lifeCountBucket(1000)).toBe(3);
  });

  it('셀 크기 — 줌이 1 오르면 반으로, 위도는 0.8배, 줌 범위 클램프', () => {
    const z7 = lifeCellSizeDeg(7);
    const z8 = lifeCellSizeDeg(8.9);
    expect(z7.dLng).toBeCloseTo(360 / 128 / 4, 10);
    expect(z8.dLng).toBeCloseTo(z7.dLng / 2, 10);
    expect(z7.dLat).toBeCloseTo(z7.dLng * 0.8, 10);
    expect(lifeCellSizeDeg(-3)).toEqual(lifeCellSizeDeg(0));
    expect(lifeCellSizeDeg(40)).toEqual(lifeCellSizeDeg(22));
    expect(lifeCellSizeDeg(Number.NaN)).toEqual(lifeCellSizeDeg(0));
  });
});
