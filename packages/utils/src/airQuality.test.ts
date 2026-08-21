import { describe, expect, it } from 'vitest';
import {
  airAnnouncedToIso,
  airDataTimeToIso,
  airGradeFromText,
  airGradeFromValue,
  airSidoFromAddr,
  airSidoMatches,
  airWeeklyLevel,
  formatAirHourLabel,
  formatAirValue,
  parseAirDustImage,
  parseAirRegionGrades,
  sortAirRegions,
  splitAirReliability,
} from './airQuality.js';

// 기준표는 통합대기환경지수(CAI) 고시 구간 — 경계값(상한 포함/다음 단계 시작)을
// 항목별로 못 박는다. 업스트림이 등급을 비워 보낸 행(결측 복원·일평균)에 쓰이므로
// 여기서 틀리면 화면 색이 통째로 어긋난다.
describe('airGradeFromValue — CAI 구간 경계', () => {
  it('PM10: 30 좋음 / 31 보통 / 80 보통 / 81 나쁨 / 150 나쁨 / 151 매우나쁨', () => {
    expect(airGradeFromValue('pm10', 30)).toBe(1);
    expect(airGradeFromValue('pm10', 31)).toBe(2);
    expect(airGradeFromValue('pm10', 80)).toBe(2);
    expect(airGradeFromValue('pm10', 81)).toBe(3);
    expect(airGradeFromValue('pm10', 150)).toBe(3);
    expect(airGradeFromValue('pm10', 151)).toBe(4);
  });

  it('PM2.5: 15/16/35/36/75/76', () => {
    expect(airGradeFromValue('pm25', 15)).toBe(1);
    expect(airGradeFromValue('pm25', 16)).toBe(2);
    expect(airGradeFromValue('pm25', 35)).toBe(2);
    expect(airGradeFromValue('pm25', 36)).toBe(3);
    expect(airGradeFromValue('pm25', 75)).toBe(3);
    expect(airGradeFromValue('pm25', 76)).toBe(4);
  });

  it('ppm 항목(오존·이산화질소·일산화탄소·아황산가스) 소수 경계', () => {
    expect(airGradeFromValue('o3', 0.03)).toBe(1);
    expect(airGradeFromValue('o3', 0.031)).toBe(2);
    expect(airGradeFromValue('o3', 0.0905)).toBe(3);
    expect(airGradeFromValue('o3', 0.151)).toBe(4);
    expect(airGradeFromValue('no2', 0.06)).toBe(2);
    expect(airGradeFromValue('no2', 0.2)).toBe(3);
    expect(airGradeFromValue('co', 9)).toBe(2);
    expect(airGradeFromValue('co', 15.01)).toBe(4);
    expect(airGradeFromValue('so2', 0.02)).toBe(1);
    expect(airGradeFromValue('so2', 0.05)).toBe(2);
  });

  it('통합지수(CAI): 50/51/100/101/250/251', () => {
    expect(airGradeFromValue('khai', 50)).toBe(1);
    expect(airGradeFromValue('khai', 51)).toBe(2);
    expect(airGradeFromValue('khai', 100)).toBe(2);
    expect(airGradeFromValue('khai', 101)).toBe(3);
    expect(airGradeFromValue('khai', 250)).toBe(3);
    expect(airGradeFromValue('khai', 251)).toBe(4);
  });

  it('결측(null/undefined/NaN/음수)은 null', () => {
    expect(airGradeFromValue('pm10', null)).toBeNull();
    expect(airGradeFromValue('pm10', undefined)).toBeNull();
    expect(airGradeFromValue('pm10', Number.NaN)).toBeNull();
    expect(airGradeFromValue('pm10', -1)).toBeNull();
  });
});

describe('등급 텍스트 파서', () => {
  it('좋음/보통/나쁨/매우나쁨 → 1~4, 공백 변형 흡수, 그 외 null', () => {
    expect(airGradeFromText('좋음')).toBe(1);
    expect(airGradeFromText('보통')).toBe(2);
    expect(airGradeFromText('나쁨')).toBe(3);
    expect(airGradeFromText('매우 나쁨')).toBe(4);
    expect(airGradeFromText('낮음')).toBeNull();
    expect(airGradeFromText(null)).toBeNull();
  });

  it('주간예보 2단계: 낮음 low / 높음 high / 그 외 null', () => {
    expect(airWeeklyLevel('낮음')).toBe('low');
    expect(airWeeklyLevel('높음')).toBe('high');
    expect(airWeeklyLevel('보통')).toBeNull();
  });
});

describe('parseAirRegionGrades — informGrade / frcst*Cn', () => {
  it('실측 문자열(19권역)을 권역·등급 쌍으로 나눈다', () => {
    const text =
      '서울 : 좋음,제주 : 좋음,전남 : 좋음,전북 : 좋음,광주 : 좋음,경남 : 좋음,경북 : 좋음,울산 : 좋음,대구 : 좋음,부산 : 좋음,충남 : 좋음,충북 : 좋음,세종 : 좋음,대전 : 좋음,영동 : 좋음,영서 : 좋음,경기남부 : 좋음,경기북부 : 좋음,인천 : 보통';
    const parsed = parseAirRegionGrades(text);
    expect(parsed).toHaveLength(19);
    expect(parsed[0]).toEqual({ region: '서울', grade: '좋음' });
    expect(parsed.at(-1)).toEqual({ region: '인천', grade: '보통' });
  });

  it('주간예보 형식(", " 구분 + 신뢰도 항목)은 splitAirReliability 로 분리된다', () => {
    const text = '서울 : 낮음, 인천 : 낮음, 경기북부 : 낮음, 신뢰도 : 높음';
    const { regions, reliability } = splitAirReliability(parseAirRegionGrades(text));
    expect(regions.map((r) => r.region)).toEqual(['서울', '인천', '경기북부']);
    expect(reliability).toBe('높음');
  });

  it('빈 값·콜론 없는 조각은 버린다', () => {
    expect(parseAirRegionGrades(null)).toEqual([]);
    expect(parseAirRegionGrades('쓰레기,서울 : 좋음, : 보통')).toEqual([
      { region: '서울', grade: '좋음' },
    ]);
  });

  it('sortAirRegions 는 표준 순서(서울→인천→경기북부…)로 정렬하고 미등록 권역은 뒤로', () => {
    const sorted = sortAirRegions([
      { region: '제주', grade: '좋음' },
      { region: '미지권역', grade: '좋음' },
      { region: '서울', grade: '좋음' },
      { region: '경기북부', grade: '좋음' },
    ]);
    expect(sorted.map((r) => r.region)).toEqual(['서울', '경기북부', '제주', '미지권역']);
  });
});

describe('시각 파서', () => {
  it('dataTime "24:00" 은 다음날 00:00 (+09:00) 으로 정규화된다', () => {
    expect(airDataTimeToIso('2026-08-20 24:00')).toBe('2026-08-21T00:00:00+09:00');
    expect(airDataTimeToIso('2026-08-31 24:00')).toBe('2026-09-01T00:00:00+09:00');
    expect(airDataTimeToIso('2026-12-31 24:00')).toBe('2027-01-01T00:00:00+09:00');
  });

  it('일반 시각은 그대로 ISO, 형식 불일치·결측은 null', () => {
    expect(airDataTimeToIso('2026-08-21 12:00')).toBe('2026-08-21T12:00:00+09:00');
    expect(airDataTimeToIso('2026-08-21 9:00')).toBe('2026-08-21T09:00:00+09:00');
    expect(airDataTimeToIso('2026-08-21')).toBeNull();
    expect(airDataTimeToIso('2026-08-21 25:00')).toBeNull();
    expect(airDataTimeToIso(null)).toBeNull();
  });

  it('예보 통보시간 "YYYY-MM-DD HH시 발표" → ISO', () => {
    expect(airAnnouncedToIso('2026-08-21 11시 발표')).toBe('2026-08-21T11:00:00+09:00');
    expect(airAnnouncedToIso('2026-08-21 5시 발표')).toBe('2026-08-21T05:00:00+09:00');
    expect(airAnnouncedToIso('이상한 값')).toBeNull();
  });

  it('formatAirHourLabel — 당일은 "HH시", 다른 날은 "M/D HH시", 24:00 유지', () => {
    expect(formatAirHourLabel('2026-08-21 09:00', '2026-08-21')).toBe('9시');
    expect(formatAirHourLabel('2026-08-20 24:00', '2026-08-21')).toBe('8/20 24시');
    expect(formatAirHourLabel('2026-08-20 15:00')).toBe('8/20 15시');
  });
});

describe('parseAirDustImage — 예측모델 이미지 URL 라벨', () => {
  it('정지 이미지: 항목(PM10/PM2P5→PM2.5)과 예측 시각을 파일명에서 읽는다', () => {
    const pm10 = parseAirDustImage(
      'https://www.airkorea.or.kr/dustImage/2026/08/21/11/09km/AQF.20260820.NIER_09_01.PM10.1hsp.2026082103.png',
    );
    expect(pm10).toEqual({
      url: 'https://www.airkorea.or.kr/dustImage/2026/08/21/11/09km/AQF.20260820.NIER_09_01.PM10.1hsp.2026082103.png',
      pollutant: 'PM10',
      at: '8/21 03시',
      animated: false,
    });
    const pm25 = parseAirDustImage(
      'https://www.airkorea.or.kr/dustImage/2026/08/21/11/09km/AQF.20260820.NIER_09_01.PM2P5.1hsp.2026082115.png',
    );
    expect(pm25?.pollutant).toBe('PM2.5');
    expect(pm25?.at).toBe('8/21 15시');
  });

  it('애니메이션 gif 는 animated=true, 시각 없음', () => {
    const ani = parseAirDustImage(
      'https://www.airkorea.or.kr/dustImage/2026/08/20/23/09km/AQF.20260820.NIER_09_01.PM10.2days.ani.gif',
    );
    expect(ani).toMatchObject({ pollutant: 'PM10', at: null, animated: true });
  });

  it('디렉터리로 끝나는 빈 슬롯(imageUrl8/9 실측)·결측·비 http 는 null', () => {
    expect(parseAirDustImage('https://www.airkorea.or.kr/dustImage/')).toBeNull();
    expect(parseAirDustImage('')).toBeNull();
    expect(parseAirDustImage(null)).toBeNull();
    expect(parseAirDustImage('javascript:alert(1)')).toBeNull();
  });
});

describe('시도 매칭/추정', () => {
  it('airSidoMatches — 통합 라벨(전남광주)은 광주·전남·전남광주 모두에 매칭, 전국은 전부', () => {
    expect(airSidoMatches('전남광주', '광주')).toBe(true);
    expect(airSidoMatches('전남광주', '전남')).toBe(true);
    expect(airSidoMatches('전남광주', '전남광주')).toBe(true);
    expect(airSidoMatches('전남광주', '전북')).toBe(false);
    expect(airSidoMatches('경기', '경기')).toBe(true);
    expect(airSidoMatches('서울', '전국')).toBe(true);
    expect(airSidoMatches(null, '전국')).toBe(true);
    expect(airSidoMatches(null, '서울')).toBe(false);
  });

  it('airSidoFromAddr — 주소 앞머리로 시도 약칭 추정', () => {
    expect(airSidoFromAddr('인천 연수구 갯벌로 12 테크노파크 3층 옥상')).toBe('인천');
    expect(airSidoFromAddr('경기도 수원시 장안구')).toBe('경기');
    expect(airSidoFromAddr('충청남도 천안시')).toBe('충남');
    expect(airSidoFromAddr('전라남도 여수시')).toBe('전남');
    expect(airSidoFromAddr('')).toBeNull();
    expect(airSidoFromAddr('알 수 없는 주소')).toBeNull();
  });
});

describe('formatAirValue — 항목별 자릿수', () => {
  it('ppm 은 소수, ㎍/㎥·지수는 정수, 결측은 "-"', () => {
    expect(formatAirValue('o3', 0.0109)).toBe('0.011');
    expect(formatAirValue('co', 0.46)).toBe('0.46');
    expect(formatAirValue('pm10', 35)).toBe('35');
    expect(formatAirValue('khai', 82.4)).toBe('82');
    expect(formatAirValue('pm25', null)).toBe('-');
  });
});
