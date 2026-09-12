import { describe, expect, it } from 'vitest';
import { buildLifeCrimeStats, parsePopulationCsv } from './life-crime-build.js';

// 범죄 통계 빌드(순수) — 세 소스의 표기 차이를 잇는 매칭이 핵심이라 그 경계 사례를 고정한다:
// ① 시도 축약(서울↔서울특별시, 경기도, 세종시) ② 시 단위 통계 → 구 경계 여러 개(수원시)
// ③ 수동 보정(인천 미추홀구 ↔ 경계 남구 23030) ④ 외국·합계 0 열 제외 ⑤ 3종 대분류만 집계
// ⑥ 인구 10만 명당·순위·분위 경계.

const CRIME_CSV = [
  '범죄대분류,범죄중분류,서울 종로구,서울 중구,경기도 수원시,인천 미추홀구,세종시,경북 군위군,외국 미국',
  '강력범죄,살인기수,1,2,3,4,1,0,7',
  '강력범죄,강간,9,8,7,6,1,0,3',
  '절도범죄,절도범죄,100,200,300,400,50,0,10',
  '폭력범죄,폭행,50,60,70,80,20,0,5',
  '지능범죄,사기,999,999,999,999,999,0,999',
  '교통범죄,교통범죄,500,500,500,500,500,0,1',
].join('\n');

const POP_CSV = [
  '"행정구역","2024년12월_총인구수","2024년12월_세대수"',
  '"서울특별시  (1100000000)","9,331,828","4,482,063"',
  '"서울특별시 종로구 (1111000000)","100,000","72,166"',
  '"서울특별시 중구 (1114000000)","50,000","64,995"',
  '"경기도  (4100000000)","13,000,000","1"',
  '"경기도 수원시 (4111000000)","1,000,000","1"',
  '"경기도 수원시 장안구 (4111100000)","250,000","1"',
  '"인천광역시 미추홀구 (2817700000)","400,000","1"',
  '"세종특별자치시  (3600000000)","390,000","1"',
  '"세종특별자치시  (3611000000)","390,000","1"',
  '"경상북도 군위군 (4772000000)","20,000","1"',
].join('\n');

const BOUNDARIES = [
  { code: '11010', name: '종로구' },
  { code: '11020', name: '중구' },
  { code: '31011', name: '수원시장안구' },
  { code: '31012', name: '수원시권선구' },
  { code: '23030', name: '남구' },
  { code: '29010', name: '세종시' },
  { code: '37310', name: '군위군' },
  { code: '21010', name: '중구' },
];

describe('parsePopulationCsv', () => {
  it('시군구 행만(시도 행·구 단위 행 제외), 경찰청 라벨로 키를 만들고 세종은 "세종시"', () => {
    const m = parsePopulationCsv(POP_CSV);
    expect(m.get('서울 종로구')).toBe(100_000);
    expect(m.get('경기도 수원시')).toBe(1_000_000);
    expect(m.has('경기도 수원시 장안구')).toBe(false);
    expect(m.get('세종시')).toBe(390_000);
    expect(m.get('경북 군위군')).toBe(20_000);
    expect(m.has('서울')).toBe(false);
  });
});

describe('buildLifeCrimeStats', () => {
  const { stats, report } = buildLifeCrimeStats({
    crimeCsv: CRIME_CSV,
    populationCsv: POP_CSV,
    boundaries: BOUNDARIES,
    year: 2024,
    populationBase: '2024-12',
  });
  const by = new Map(stats.regions.map((r) => [r.label, r]));

  it('3종 대분류만 합산(사기·교통 제외), 인구 10만 명당 소수 1자리', () => {
    const jongno = by.get('서울 종로구')!;
    expect(jongno.counts).toEqual({ violent: 10, theft: 100, assault: 50, total: 160 });
    expect(jongno.per100k).toEqual({ violent: 10, theft: 100, assault: 50, total: 160 });
    expect(jongno.codes).toEqual(['11010']);
    expect(jongno.sido).toBe('서울');
    expect(jongno.name).toBe('종로구');
  });

  it('시 단위 통계는 하위 구 경계 전부에, 미추홀구는 보정표로 옛 남구 코드에, 세종은 시도=시군구', () => {
    expect(by.get('경기도 수원시')!.codes).toEqual(['31011', '31012']);
    expect(report.multiCode).toEqual([{ label: '경기도 수원시', codes: ['31011', '31012'] }]);
    expect(by.get('인천 미추홀구')!.codes).toEqual(['23030']);
    expect(by.get('세종시')!.codes).toEqual(['29010']);
    expect(by.get('세종시')!.sido).toBe('세종시');
  });

  it('외국 열과 합계 0 열(편입 전 경북 군위군)은 제외, 안 쓰인 경계는 리포트', () => {
    expect(report.skippedColumns).toEqual(['경북 군위군', '외국 미국']);
    expect(report.noBoundary).toEqual([]);
    expect(report.noPopulation).toEqual([]);
    expect(report.unusedBoundaries).toEqual([
      { code: '37310', name: '군위군' },
      { code: '21010', name: '중구' },
    ]);
    expect(stats.regionCount).toBe(5);
    expect(report.majorRows).toEqual({ violent: 2, theft: 1, assault: 1 });
  });

  it('순위는 발생률 내림차순(1 = 최고), 분위 경계는 메트릭별 4개', () => {
    // 전체 발생률: 종로 160 · 중구 540 · 수원 38 · 미추홀 122.5 · 세종 18.5
    expect(by.get('서울 중구')!.rank.total).toBe(1);
    expect(by.get('서울 종로구')!.rank.total).toBe(2);
    expect(by.get('인천 미추홀구')!.rank.total).toBe(3);
    expect(by.get('경기도 수원시')!.rank.total).toBe(4);
    expect(by.get('세종시')!.rank.total).toBe(5);
    expect(stats.breaks.total).toHaveLength(4);
    expect(stats.breaks.total).toEqual([34.1, 88.7, 137.5, 236]);
    expect(stats.breaks.violent).toHaveLength(4);
  });

  it('헤더가 경찰청 지역별 형식이 아니면 던진다', () => {
    expect(() =>
      buildLifeCrimeStats({ crimeCsv: 'a,b,c\n1,2,3', populationCsv: POP_CSV, boundaries: BOUNDARIES, year: 2024, populationBase: '2024-12' }),
    ).toThrow(/헤더/);
  });
});
