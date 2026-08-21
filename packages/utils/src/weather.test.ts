import { describe, expect, it } from 'vitest';
import {
  formatKmaHourLabel,
  kmaCondition,
  kmaConditionFromText,
  kmaFcstTimeToIso,
  kmaGridToLatLng,
  kmaMidTmFc,
  kmaNextBaseAvailableAt,
  kmaNextMidTmFcAt,
  kmaPrevBase,
  kmaPrevMidTmFc,
  kmaUltraFcstBase,
  kmaUltraNcstBase,
  kmaVilageBase,
  kmaWindDirection16,
  kmaWindStrength,
  kmaYmdAddDays,
  latLngToKmaGrid,
  parseKmaPrecipText,
} from './weather.js';
import {
  WEATHER_MID_LAND_REGIONS,
  WEATHER_MID_SEA_REGIONS,
  WEATHER_PLACES,
  nearestWeatherPlace,
  searchWeatherPlaces,
  weatherMidRegionForPlace,
  weatherPlaceById,
} from './weatherRegions.js';

// KST 벽시계 → Date. 테스트가 "KST 16:05" 처럼 읽히게.
const kst = (ymd: string, hm: string): Date =>
  new Date(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${hm.slice(0, 2)}:${hm.slice(2, 4)}:00+09:00`);

describe('격자 변환(LCC DFS)', () => {
  // 기상청 공식 격자표(시도 대표 지점 좌표)와 실측(2026-08-21) 일치값. 셀 경계에 가까운
  // 청사 좌표(대구·수원시청)는 공식표의 대표 좌표로 맞춘다.
  it.each([
    ['서울', 37.5666, 126.9784, 60, 127],
    ['부산', 35.1801, 129.0754, 98, 76],
    ['대구', 35.87, 128.6, 89, 90],
    ['인천', 37.456, 126.7062, 55, 124],
    ['광주', 35.1598, 126.852, 58, 74],
    ['대전', 36.3502, 127.3848, 67, 100],
    ['울산', 35.5388, 129.3116, 102, 84],
    ['수원', 37.27, 127.01, 60, 120],
    ['춘천', 37.8814, 127.7302, 73, 134],
    ['청주', 36.6422, 127.4891, 69, 107],
    ['전주', 35.8243, 127.1478, 63, 89],
    ['창원', 35.2281, 128.682, 91, 77],
  ])('%s → (%i,%i)', (_name, lat, lng, nx, ny) => {
    expect(latLngToKmaGrid(lat, lng)).toEqual({ nx, ny });
  });

  it('역변환은 격자점 위·경도를 돌려주고 다시 변환하면 같은 격자', () => {
    const p = kmaGridToLatLng(60, 127);
    expect(p.lat).toBeGreaterThan(37.4);
    expect(p.lat).toBeLessThan(37.7);
    expect(p.lng).toBeGreaterThan(126.8);
    expect(p.lng).toBeLessThan(127.1);
    expect(latLngToKmaGrid(p.lat, p.lng)).toEqual({ nx: 60, ny: 127 });
  });
});

describe('발표 기준 시각(base)', () => {
  it('초단기실황: 매시 10분 전에는 직전 정시, 10분부터 이번 정시', () => {
    expect(kmaUltraNcstBase(kst('20260821', '1605'))).toEqual({ date: '20260821', time: '1500' });
    expect(kmaUltraNcstBase(kst('20260821', '1610'))).toEqual({ date: '20260821', time: '1600' });
    // 자정 직후는 전날 23시.
    expect(kmaUltraNcstBase(kst('20260822', '0003'))).toEqual({ date: '20260821', time: '2300' });
  });

  it('초단기예보: 매시 45분 전에는 직전 30분, 45분부터 이번 30분', () => {
    expect(kmaUltraFcstBase(kst('20260821', '1644'))).toEqual({ date: '20260821', time: '1530' });
    expect(kmaUltraFcstBase(kst('20260821', '1645'))).toEqual({ date: '20260821', time: '1630' });
    expect(kmaUltraFcstBase(kst('20260822', '0010'))).toEqual({ date: '20260821', time: '2330' });
  });

  it('단기예보: 02·05·…·23시 + 10분 경계, 02:10 전은 전날 23시', () => {
    expect(kmaVilageBase(kst('20260821', '0209'))).toEqual({ date: '20260820', time: '2300' });
    expect(kmaVilageBase(kst('20260821', '0210'))).toEqual({ date: '20260821', time: '0200' });
    expect(kmaVilageBase(kst('20260821', '0459'))).toEqual({ date: '20260821', time: '0200' });
    expect(kmaVilageBase(kst('20260821', '1605'))).toEqual({ date: '20260821', time: '1400' });
    expect(kmaVilageBase(kst('20260821', '2359'))).toEqual({ date: '20260821', time: '2300' });
  });

  it('이전 슬롯(폴백) — 실황/초단기는 1시간, 단기는 3시간 앞', () => {
    expect(kmaPrevBase('ncst', { date: '20260821', time: '0000' })).toEqual({ date: '20260820', time: '2300' });
    expect(kmaPrevBase('ultra', { date: '20260821', time: '0030' })).toEqual({ date: '20260820', time: '2330' });
    expect(kmaPrevBase('vilage', { date: '20260821', time: '0200' })).toEqual({ date: '20260820', time: '2300' });
  });

  it('다음 슬롯 제공 시각 — TTL 계산', () => {
    expect(kmaNextBaseAvailableAt('ncst', kst('20260821', '1605')).toISOString()).toBe(kst('20260821', '1610').toISOString());
    expect(kmaNextBaseAvailableAt('ncst', kst('20260821', '1612')).toISOString()).toBe(kst('20260821', '1710').toISOString());
    expect(kmaNextBaseAvailableAt('ultra', kst('20260821', '1650')).toISOString()).toBe(kst('20260821', '1745').toISOString());
    expect(kmaNextBaseAvailableAt('vilage', kst('20260821', '1605')).toISOString()).toBe(kst('20260821', '1710').toISOString());
    expect(kmaNextBaseAvailableAt('vilage', kst('20260821', '2330')).toISOString()).toBe(kst('20260822', '0210').toISOString());
  });

  it('중기 tmFc — 06/18시 발표, 06시 전은 전날 18시; 이전 발표분·다음 발표 시각', () => {
    expect(kmaMidTmFc(kst('20260821', '0559'))).toBe('202608201800');
    expect(kmaMidTmFc(kst('20260821', '0600'))).toBe('202608210600');
    expect(kmaMidTmFc(kst('20260821', '1759'))).toBe('202608210600');
    expect(kmaMidTmFc(kst('20260821', '1800'))).toBe('202608211800');
    expect(kmaPrevMidTmFc('202608211800')).toBe('202608210600');
    expect(kmaPrevMidTmFc('202608210600')).toBe('202608201800');
    expect(kmaNextMidTmFcAt(kst('20260821', '1605')).toISOString()).toBe(kst('20260821', '1800').toISOString());
    expect(kmaNextMidTmFcAt(kst('20260821', '1900')).toISOString()).toBe(kst('20260822', '0600').toISOString());
  });

  it('예보 시각 ISO·날짜 덧셈', () => {
    expect(kmaFcstTimeToIso('20260825', '0000')).toBe('2026-08-25T00:00:00+09:00');
    expect(kmaFcstTimeToIso('20260821', '2400')).toBe('2026-08-22T00:00:00+09:00');
    expect(kmaFcstTimeToIso('2026082', '0000')).toBeNull();
    expect(kmaYmdAddDays('20260821', 4)).toBe('2026-08-25');
    expect(kmaYmdAddDays('20260830', 10)).toBe('2026-09-09');
    expect(formatKmaHourLabel('2026-08-21T15:00:00+09:00', '2026-08-21')).toBe('15시');
    expect(formatKmaHourLabel('2026-08-22T00:00:00+09:00', '2026-08-21')).toBe('8/22 0시');
  });
});

describe('강수량 문자열', () => {
  it.each([
    ['강수없음', 0, true],
    ['적설없음', 0, true],
    ['0', 0, true],
    ['1mm 미만', 0.5, false],
    ['1.0mm', 1, false],
    ['30.0~50.0mm', 30, false],
    ['50.0mm 이상', 50, false],
    ['2.5cm', 2.5, false],
  ])('%s → %s', (text, value, none) => {
    expect(parseKmaPrecipText(text)).toEqual({ text, value, none });
  });
  it('결측은 null', () => {
    expect(parseKmaPrecipText(null)).toEqual({ text: '-', value: null, none: false });
    expect(parseKmaPrecipText('-')).toEqual({ text: '-', value: null, none: false });
  });
});

describe('바람·상태', () => {
  it('16방위 — 0 북, 90 동, 187 남, 350 북', () => {
    expect(kmaWindDirection16(0)).toBe('북');
    expect(kmaWindDirection16(90)).toBe('동');
    expect(kmaWindDirection16(187)).toBe('남');
    expect(kmaWindDirection16(350)).toBe('북');
    expect(kmaWindDirection16(225)).toBe('남서');
    expect(kmaWindDirection16(null)).toBe('-');
  });
  it('풍속 강도 구간', () => {
    expect(kmaWindStrength(0.8)).toBe('약함');
    expect(kmaWindStrength(4)).toBe('약간 강함');
    expect(kmaWindStrength(9)).toBe('강함');
    expect(kmaWindStrength(14)).toBe('매우 강함');
  });
  it('하늘+강수형태 → 상태 키, 강수형태가 우선', () => {
    expect(kmaCondition(1, 0)).toBe('clear');
    expect(kmaCondition(3, 0)).toBe('partly');
    expect(kmaCondition(4, 0)).toBe('cloudy');
    expect(kmaCondition(1, 1)).toBe('rain');
    expect(kmaCondition(4, 4)).toBe('shower');
    expect(kmaCondition(4, 6)).toBe('sleet');
    expect(kmaCondition(null, null)).toBe('unknown');
  });
  it('중기 문구 → 상태 키', () => {
    expect(kmaConditionFromText('맑음')).toBe('clear');
    expect(kmaConditionFromText('구름많음')).toBe('partly');
    expect(kmaConditionFromText('흐림')).toBe('cloudy');
    expect(kmaConditionFromText('구름많고 비')).toBe('rain');
    expect(kmaConditionFromText('흐리고 비/눈')).toBe('sleet');
    expect(kmaConditionFromText('흐리고 눈')).toBe('snow');
    expect(kmaConditionFromText('구름많고 소나기')).toBe('shower');
  });
});

describe('중기예보 지점', () => {
  it('172개 지점, id 유일, 모두 10개 육상 구역 중 하나', () => {
    expect(WEATHER_PLACES).toHaveLength(172);
    expect(new Set(WEATHER_PLACES.map((p) => p.id)).size).toBe(172);
    const land = new Set(WEATHER_MID_LAND_REGIONS.map((r) => r.regId));
    expect(land.size).toBe(10);
    for (const p of WEATHER_PLACES) expect(land.has(p.landRegId)).toBe(true);
    expect(WEATHER_MID_SEA_REGIONS).toHaveLength(12);
  });
  it('지점 → 중기육상 구역·전망 stnId', () => {
    const seoul = weatherPlaceById('11B10101');
    expect(seoul?.name).toBe('서울');
    expect(weatherMidRegionForPlace(seoul)).toEqual({
      land: { regId: '11B00000', label: '서울·인천·경기', stnId: '109' },
      stnId: '109',
    });
    expect(weatherPlaceById('nope')).toBeNull();
  });
  it('가장 가까운 지점 — 여의도는 서울, 해운대는 부산, 광역시 반경 안(양천구)은 광명시청이 더 가까워도 서울', () => {
    expect(nearestWeatherPlace(37.5219, 126.9245)?.place.name).toBe('서울');
    expect(nearestWeatherPlace(35.1587, 129.1604)?.place.name).toBe('부산');
    expect(nearestWeatherPlace(37.535, 126.876)?.place.name).toBe('서울');
    // 반경 밖의 위성도시 청사는 그 도시.
    expect(nearestWeatherPlace(37.4777, 126.8646)?.place.name).toBe('광명');
    expect(nearestWeatherPlace(37.4292, 126.9878)?.place.name).toBe('과천');
    // 강화는 인천 반경 밖 — 강화.
    expect(nearestWeatherPlace(37.7474, 126.4878)?.place.name).toBe('강화');
  });
  it('이름/구역 검색', () => {
    expect(searchWeatherPlaces('고성').map((p) => p.name).sort()).toEqual(['고성(강원)', '고성(경남)']);
    expect(searchWeatherPlaces('제주').length).toBeGreaterThan(1);
    expect(searchWeatherPlaces('')).toEqual([]);
  });
});
