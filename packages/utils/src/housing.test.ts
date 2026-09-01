import { describe, expect, it } from 'vitest';
import {
  formatHousingArea,
  formatHousingDealPrice,
  formatHousingPrice,
  formatHousingRent,
  formatHousingUnitPrice,
  formatHousingUnitPriceShort,
  housingAreaBandOf,
  housingComplexKindOfCode,
  housingCurrentYm,
  housingDateMonthsAgo,
  housingDealDate,
  housingYmAdd,
  housingYmRange,
  normalizeHousingName,
  parseHousingManwon,
} from './housing.js';
import {
  HOUSING_FALLBACK_COLOR,
  buildHousingBadgeSvg,
  buildHousingCellSvg,
  buildHousingMutedBadgeSvg,
  buildHousingMutedSelectedBadgeSvg,
  buildHousingSelectedBadgeSvg,
} from './housingMarker.js';

describe('housing 가격 포맷', () => {
  it('만원 → 억/만 표기', () => {
    expect(formatHousingPrice(125000)).toBe('12.5억');
    expect(formatHousingPrice(100000)).toBe('10억');
    expect(formatHousingPrice(9800)).toBe('9,800만');
    expect(formatHousingPrice(1234567)).toBe('123억');
    expect(formatHousingPrice(58960)).toBe('5.9억');
    expect(formatHousingPrice(null)).toBe('-');
  });
  it('월세는 보증금/월세, 유형별 한 줄', () => {
    expect(formatHousingRent(10000, 120)).toBe('1억/120');
    expect(formatHousingDealPrice('monthly', 5000, 60)).toBe('5,000만/60');
    expect(formatHousingDealPrice('jeonse', 35000, 0)).toBe('3.5억');
    expect(formatHousingDealPrice('trade', 140000, 0)).toBe('14억');
  });
  it('평당가·면적', () => {
    expect(formatHousingUnitPrice(1573)).toBe('5,200만/평');
    expect(formatHousingUnitPrice(3100)).toBe('1억/평');
    expect(formatHousingUnitPriceShort(1573)).toBe('5,200만');
    expect(formatHousingUnitPriceShort(3700)).toBe('1.2억');
    expect(formatHousingUnitPriceShort(null)).toBe('-');
    expect(formatHousingArea(84.97)).toBe('84.97㎡ (25.7평)');
    expect(formatHousingArea(59.9, false)).toBe('59.9㎡');
  });
  it('API 금액 문자열 파싱', () => {
    expect(parseHousingManwon('58,960')).toBe(58960);
    expect(parseHousingManwon(' 140,000 ')).toBe(140000);
    expect(parseHousingManwon('')).toBeNull();
    expect(parseHousingManwon('abc')).toBeNull();
  });
});

describe('housing 코드표', () => {
  it('면적 구간 (min, max]', () => {
    expect(housingAreaBandOf(59.9)).toBe('b1');
    expect(housingAreaBandOf(60)).toBe('b1');
    expect(housingAreaBandOf(60.01)).toBe('b2');
    expect(housingAreaBandOf(84.97)).toBe('b2');
    expect(housingAreaBandOf(135)).toBe('b3');
    expect(housingAreaBandOf(135.5)).toBe('b4');
  });
  it('단지 종류 코드', () => {
    expect(housingComplexKindOfCode('1')).toBe('apt');
    expect(housingComplexKindOfCode('3')).toBe('multi');
    expect(housingComplexKindOfCode('9')).toBeNull();
  });
  it('단지명 정규화 — 괄호·공백·아파트 접미 제거', () => {
    expect(normalizeHousingName('경희궁자이(1단지)')).toBe('경희궁자이1단지');
    expect(normalizeHousingName('신현 아파트')).toBe('신현');
    expect(normalizeHousingName('래미안 퍼스티지 APT')).toBe('래미안퍼스티지');
  });
});

describe('housing 연월', () => {
  it('연월 가감·범위', () => {
    expect(housingYmAdd('202501', -1)).toBe('202412');
    expect(housingYmAdd('202512', 1)).toBe('202601');
    expect(housingYmRange('202411', '202502')).toEqual(['202411', '202412', '202501', '202502']);
    expect(housingYmRange('202502', '202411')).toEqual([]);
  });
  it('현재 연월은 Asia/Seoul 기준', () => {
    // UTC 2026-08-31 15:30 = KST 2026-09-01 00:30
    expect(housingCurrentYm(new Date('2026-08-31T15:30:00Z'))).toBe('202609');
    expect(housingCurrentYm(new Date('2026-08-31T14:30:00Z'))).toBe('202608');
  });
  it('n개월 전 날짜(월말 넘침은 말일)·계약일 조합', () => {
    expect(housingDateMonthsAgo('2026-03-31', 1)).toBe('2026-02-28');
    expect(housingDateMonthsAgo('2026-01-15', 12)).toBe('2025-01-15');
    expect(housingDealDate('2025', '7', '21')).toBe('2025-07-21');
    expect(housingDealDate(2025, 13, 1)).toBeNull();
  });
});

describe('housing 마커 SVG', () => {
  it('배지는 글자에 맞춰 폭이 늘고 XML 이스케이프', () => {
    const a = buildHousingBadgeSvg('9억', '#c2410c');
    const b = buildHousingBadgeSvg('12.5억', '#c2410c');
    const wa = Number(/width="(\d+)"/.exec(a)![1]);
    const wb = Number(/width="(\d+)"/.exec(b)![1]);
    expect(wb).toBeGreaterThan(wa);
    expect(buildHousingBadgeSvg('a<b', '#000')).toContain('a&lt;b');
    expect(buildHousingSelectedBadgeSvg('1억/120', '#1d4ed8')).toContain('height="33"');
    expect(buildHousingCellSvg('5,200만/평', 60, 'trade')).toContain('height="30"');
  });
  it('회색 배지 — 폴백은 회색 채움, 공시가격은 점선 외곽선·연한 채움, 선택은 꼬리 프레임', () => {
    const fb = buildHousingMutedBadgeSvg('전세 3.1억');
    expect(fb).toContain(`fill="${HOUSING_FALLBACK_COLOR}"`);
    expect(fb).not.toContain('stroke-dasharray');
    const of = buildHousingMutedBadgeSvg('공시 5.2억', { dashed: true });
    expect(of).toContain('stroke-dasharray');
    expect(of).toContain('fill="#e5e7eb"');
    expect(buildHousingMutedSelectedBadgeSvg('임대', { dashed: false })).toContain('height="33"');
  });
});
