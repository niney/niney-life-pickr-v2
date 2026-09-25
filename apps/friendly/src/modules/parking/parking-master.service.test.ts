import { describe, expect, it } from 'vitest';
import {
  canonKeys,
  dropParkingDuplicates,
  normalizeSeoulParkingRows,
  normalizeStdParkingRows,
  seoulExcludedOper,
  type ParkingLotRow,
} from './parking-master.service.js';

// 주차장 정규화 — 표준데이터(API camelCase·포털 UPPER_SNAKE 두 키 형식)·서울 공영주차장(노상 구획 접기·운영 구분 제외·
// 실시간 목록 보충·요금 해석)·겹침 접기. 실측 표본(2026-09-25) 모양을 줄여 쓴다.

const stdSnake = (p: Record<string, unknown>): Record<string, unknown> => ({
  PRKPLCE_NO: '111-1-000001',
  PRKPLCE_NM: '시청앞 공영주차장',
  PRKPLCE_SE: '공영',
  PRKPLCE_TYPE: '노외',
  RDNMADR: '서울특별시 중구 세종대로 110',
  LNMADR: '',
  PRKCMPRT: '120',
  OPER_DAY: '평일+토요일+공휴일',
  WEEKDAY_OPER_OPEN_HHMM: '09:00',
  WEEKDAY_OPER_COLSE_HHMM: '21:00',
  SAT_OPER_OPER_OPEN_HHMM: '00:00',
  SAT_OPER_CLOSE_HHMM: '00:00',
  HOLIDAY_OPER_OPEN_HHMM: '00:00',
  HOLIDAY_CLOSE_OPEN_HHMM: '23:59',
  PARKINGCHRGE_INFO: '유료',
  BASIC_TIME: '30',
  BASIC_CHARGE: '1000',
  ADD_UNIT_TIME: '10',
  ADD_UNIT_CHARGE: '500',
  DAY_CMMTKT: '10000',
  MONTH_CMMTKT: '',
  METPAY: '카드',
  SPCMNT: '',
  INSTITUTION_NM: '서울특별시 중구청',
  PHONE_NUMBER: '02-000-0000',
  LATITUDE: '37.5663',
  LONGITUDE: '126.9779',
  PWDBS_PPK_ZONE_YN: 'Y',
  REFERENCE_DATE: '2026-08-04',
  ...p,
});

describe('canonKeys', () => {
  it('UPPER_SNAKE 와 camelCase 가 같은 키로 맞는다', () => {
    expect(Object.keys(canonKeys({ PRKPLCE_NO: 1, weekdayOperColseHhmm: 2 }))).toEqual(['prkplceno', 'weekdayopercolsehhmm']);
  });
});

describe('normalizeStdParkingRows', () => {
  it('포털 덤프 키 — 요금·운영시간·장애인 구역·좌표', () => {
    const rep = normalizeStdParkingRows([stdSnake({})]);
    expect(rep.rows).toHaveLength(1);
    const r = rep.rows[0]!;
    expect(r).toMatchObject({
      id: 'std:111-1-000001',
      source: 'std',
      ownership: 'public',
      lotType: 'offstreet',
      feeType: 'paid',
      totalSpaces: 120,
      wdOpen: '09:00',
      wdClose: '21:00',
      holClose: '23:59',
      baseMin: 30,
      baseFee: 1000,
      addMin: 10,
      addFee: 500,
      dayPassFee: 10000,
      monthlyFee: null,
      disabledZone: true,
      geoSource: 'source',
      baseDate: '2026-08-04',
      lotAddr: null,
    });
  });

  it('API camelCase 키도 같은 결과', () => {
    const rep = normalizeStdParkingRows([
      { prkplceNo: '2', prkplceNm: '무료 노상', prkplceSe: '공영', prkplceType: '노상', parkingchrgeInfo: '무료', basicTime: '0', basicCharge: '0', latitude: '35.1', longitude: '129.0' },
    ]);
    expect(rep.rows[0]).toMatchObject({ id: 'std:2', lotType: 'street', feeType: 'free', baseMin: null, baseFee: null });
  });

  it('같은 관리번호 중복은 좌표 있는 쪽, 좌표 결측·한국 밖은 null', () => {
    const rep = normalizeStdParkingRows([
      stdSnake({ LATITUDE: '', LONGITUDE: '', INSTITUTION_NM: '전라남도 신안군' }),
      stdSnake({ INSTITUTION_NM: '전남광주통합특별시 신안군' }),
      stdSnake({ PRKPLCE_NO: '9', LATITUDE: '0', LONGITUDE: '0' }),
      stdSnake({ PRKPLCE_NO: '' }),
    ]);
    expect(rep.duplicates).toBe(1);
    expect(rep.droppedBadId).toBe(1);
    expect(rep.rows.find((r) => r.id === 'std:111-1-000001')?.orgName).toBe('전남광주통합특별시 신안군');
    expect(rep.rows.find((r) => r.id === 'std:9')?.lat).toBeNull();
    expect(rep.coordMissing).toBe(1);
  });

  it('유료인데 기본 요금이 0 이면 요금 정보 없음', () => {
    const rep = normalizeStdParkingRows([stdSnake({ BASIC_TIME: '0', BASIC_CHARGE: '0' })]);
    expect(rep.rows[0]).toMatchObject({ baseMin: null, baseFee: null });
  });
});

describe('normalizeSeoulParkingRows', () => {
  const info = (p: Record<string, unknown>): Record<string, unknown> => ({
    PKLT_CD: '171721',
    PKLT_NM: '세종로 공영주차장(시)',
    ADDR: '종로구 세종로 80-1',
    PKLT_KND_NM: '노외 주차장',
    OPER_SE_NM: '시간제 주차장',
    TELNO: '02-2290-6566',
    TPKCT: 1260,
    CHGD_FREE_NM: '유료',
    WD_OPER_BGNG_TM: '0000',
    WD_OPER_END_TM: '2400',
    WE_OPER_BGNG_TM: '0000',
    WE_OPER_END_TM: '2400',
    LHLDY_BGNG: '0000',
    LHLDY: '2400',
    SAT_CHGD_FREE_NM: '무료',
    LHLDY_NM: '유료',
    MNTL_CMUT_CRG: '176000',
    PRK_CRG: 430,
    PRK_HM: 5,
    ADD_CRG: 430,
    ADD_UNIT_TM_MNT: 5,
    DLY_MAX_CRG: 0,
    LAT: 37.5734,
    LOT: 126.9759,
    ...p,
  });

  it('노상 구획 행은 코드로 접고 좌표는 평균·면수는 행 수(한 행뿐인 노상의 1면은 모름), 서울 주소 접두', () => {
    const rep = normalizeSeoulParkingRows(
      [
        info({ PKLT_CD: '1', PKLT_KND_NM: '노상 주차장', TPKCT: 1, LAT: 37.5, LOT: 127.0 }),
        info({ PKLT_CD: '1', PKLT_KND_NM: '노상 주차장', TPKCT: 1, LAT: 37.502, LOT: 127.002 }),
        info({ PKLT_CD: '2', LAT: 0, LOT: 0 }),
        info({ PKLT_CD: '3', PKLT_KND_NM: '노상 주차장', TPKCT: 1 }),
      ],
      [],
      '2026-09-25',
    );
    expect(rep.folded).toBe(1);
    const a = rep.rows.find((r) => r.id === 'seoul:1')!;
    expect(a.lat).toBeCloseTo(37.501, 6);
    expect(a).toMatchObject({ lotType: 'street', totalSpaces: 2, liveKey: 'seoul:1', lotAddr: '서울특별시 종로구 세종로 80-1', geoSource: 'source' });
    expect(rep.rows.find((r) => r.id === 'seoul:2')).toMatchObject({ lat: null, totalSpaces: 1260 });
    expect(rep.rows.find((r) => r.id === 'seoul:3')?.totalSpaces).toBeNull();
    expect(rep.coordMissing).toBe(1);
  });

  it('요금·토요일 무료·월정기, 일 최대 0 은 없음', () => {
    const r = normalizeSeoulParkingRows([info({})], [], '2026-09-25').rows[0]!;
    expect(r).toMatchObject({
      feeType: 'paid',
      baseMin: 5,
      baseFee: 430,
      addMin: 5,
      addFee: 430,
      dayMaxFee: null,
      monthlyFee: 176000,
      satFree: true,
      holFree: false,
      wdOpen: '00:00',
      wdClose: '24:00',
    });
  });

  it('버스전용·거주자 전용은 빼고, 실시간 목록에만 있는 코드는 보충(버스전용은 보충도 안 함)', () => {
    const rep = normalizeSeoulParkingRows(
      [info({ PKLT_CD: 'B', OPER_SE_NM: '버스전용 주차장' }), info({ PKLT_CD: 'R', OPER_SE_NM: '거주자 우선 주차장' }), info({ PKLT_CD: 'M', OPER_SE_NM: '시간제 + 거주자 주차장' })],
      [
        { PKLT_CD: 'L', PKLT_NM: '한강진역 공영주차장(시)', ADDR: '용산구 한남동 72-1', PRK_TYPE_NM: '노외 주차장', OPER_SE_NM: '시간제 주차장', TPKCT: 174, PAY_YN_NM: '유료', BSC_PRK_CRG: 300, BSC_PRK_HR: 5 },
        { PKLT_CD: 'B', PKLT_NM: '관광버스전용', OPER_SE_NM: '버스전용 주차장' },
      ],
      '2026-09-25',
    );
    expect(rep.droppedBusOnly).toBe(1);
    expect(rep.droppedResidentOnly).toBe(1);
    expect(rep.liveOnlyAdded).toBe(1);
    expect(rep.rows.map((r) => r.id).sort()).toEqual(['seoul:L', 'seoul:M']);
    expect(rep.rows.find((r) => r.id === 'seoul:L')).toMatchObject({ baseFee: 300, baseMin: 5, feeType: 'paid', totalSpaces: 174 });
    expect(seoulExcludedOper('시간제 + 버스전용 주차장')).toBeNull();
  });
});

describe('dropParkingDuplicates', () => {
  const lot = (p: Partial<ParkingLotRow>): ParkingLotRow =>
    ({ id: 'x', source: 'std', name: '이름', lat: 37.5, lng: 127.0, ...p }) as ParkingLotRow;

  it('100m 안 + 이름 유사면 표준데이터 행을 뺀다, 25m 안은 이름 무관, 멀거나 좌표 없으면 남긴다', () => {
    const seoul = [lot({ id: 'seoul:1', source: 'seoul', name: '세종로 공영주차장(시)', lat: 37.5734, lng: 126.9759 })];
    const std = [
      lot({ id: 'std:a', name: '세종로공영주차장', lat: 37.5738, lng: 126.9762 }),
      lot({ id: 'std:b', name: '전혀 다른 곳', lat: 37.57341, lng: 126.97591 }),
      lot({ id: 'std:c', name: '세종로공영주차장', lat: 37.58, lng: 126.99 }),
      lot({ id: 'std:d', name: '세종로공영주차장', lat: null, lng: null }),
      lot({ id: 'std:e', name: '먼 곳 다른 이름', lat: 37.5742, lng: 126.9768 }),
    ];
    const { kept, dropped } = dropParkingDuplicates(seoul, std);
    expect(dropped).toBe(2);
    expect(kept.map((k) => k.id)).toEqual(['std:c', 'std:d', 'std:e']);
  });
});
