import { describe, expect, it } from 'vitest';
import {
  estimateParkingFee,
  evStationLevel,
  formatParkingFeeRule,
  formatParkingHours,
  isEvChargerFast,
  isParkingOpenAt,
  normalizeParkingHhmm,
  normalizeParkingName,
  parkingAirportByApiName,
  parkingDayKindKst,
  parkingHoursKind,
  parkingKstSlot,
  parkingLevelOf,
  parseParkingFeeType,
  parseParkingLotType,
  parseParkingOwnership,
  type ParkingFeeRule,
} from './parking.js';

// KST 시각 → Date(UTC 저장).
const kst = (iso: string): Date => new Date(`${iso}+09:00`);

describe('원문 코드 파싱', () => {
  it('공영/민영·노상/노외/부설·요금 구분(변종 포함)', () => {
    expect(parseParkingOwnership('공영')).toBe('public');
    expect(parseParkingOwnership(' 민영 ')).toBe('private');
    expect(parseParkingOwnership('기타')).toBeNull();
    expect(parseParkingLotType('노외 주차장')).toBe('offstreet');
    expect(parseParkingLotType('부설')).toBe('attached');
    expect(parseParkingFeeType('무료')).toBe('free');
    expect(parseParkingFeeType('유료')).toBe('paid');
    expect(parseParkingFeeType('혼합')).toBe('mixed');
    expect(parseParkingFeeType('유료+무')).toBe('mixed');
    expect(parseParkingFeeType('')).toBeNull();
  });
});

describe('운영시간', () => {
  it('HHMM·HH:MM 정규화, 24:00 허용, 깨진 값 null', () => {
    expect(normalizeParkingHhmm('0900')).toBe('09:00');
    expect(normalizeParkingHhmm('2400')).toBe('24:00');
    expect(normalizeParkingHhmm('9:30')).toBe('09:30');
    expect(normalizeParkingHhmm('2430')).toBeNull();
    expect(normalizeParkingHhmm('')).toBeNull();
  });

  it('00:00~00:00 은 정보 없음, 00:00~24:00·23:59 는 24시간', () => {
    expect(parkingHoursKind({ open: '00:00', close: '00:00' })).toBe('unknown');
    expect(parkingHoursKind({ open: '00:00', close: '23:59' })).toBe('allday');
    expect(formatParkingHours({ open: '00:00', close: '24:00' })).toBe('24시간');
    expect(formatParkingHours({ open: '09:00', close: '18:00' })).toBe('09:00~18:00');
    expect(formatParkingHours({ open: null, close: null })).toBe('정보 없음');
  });

  it('지금 운영 중 — 자정을 넘는 운영 포함, KST 기준', () => {
    expect(isParkingOpenAt({ open: '09:00', close: '18:00' }, kst('2026-09-25T10:00:00'))).toBe(true);
    expect(isParkingOpenAt({ open: '09:00', close: '18:00' }, kst('2026-09-25T18:00:00'))).toBe(false);
    expect(isParkingOpenAt({ open: '05:00', close: '01:00' }, kst('2026-09-25T00:30:00'))).toBe(true);
    expect(isParkingOpenAt({ open: '05:00', close: '01:00' }, kst('2026-09-25T03:00:00'))).toBe(false);
    expect(isParkingOpenAt({ open: '00:00', close: '00:00' }, kst('2026-09-25T03:00:00'))).toBeNull();
  });

  it('요일 구분과 이력 칸은 KST', () => {
    // 2026-09-27 은 일요일, 09-26 은 토요일.
    expect(parkingDayKindKst(kst('2026-09-27T01:00:00'))).toBe('hol');
    expect(parkingDayKindKst(kst('2026-09-26T23:59:00'))).toBe('sat');
    expect(parkingDayKindKst(kst('2026-09-25T08:00:00'))).toBe('wd');
    expect(parkingKstSlot(kst('2026-09-27T00:10:00'))).toEqual({ dow: 0, hour: 0 });
  });
});

describe('요금 추정', () => {
  const rule = (p: Partial<ParkingFeeRule>): ParkingFeeRule => ({
    feeType: 'paid',
    baseMin: 30,
    baseFee: 1000,
    addMin: 10,
    addFee: 500,
    dayMaxFee: null,
    dayPassFee: null,
    ...p,
  });

  it('기본 시간 안은 기본 요금, 넘으면 추가 단위 올림', () => {
    expect(estimateParkingFee(rule({}), 20)).toBe(1000);
    expect(estimateParkingFee(rule({}), 31)).toBe(1500);
    expect(estimateParkingFee(rule({}), 60)).toBe(2500);
  });

  it('무료는 0, 기본 요금 없으면 null, 일 최대·1일권으로 자른다', () => {
    expect(estimateParkingFee(rule({ feeType: 'free' }), 600)).toBe(0);
    expect(estimateParkingFee(rule({ baseFee: null }), 60)).toBeNull();
    expect(estimateParkingFee(rule({ dayMaxFee: 2000 }), 180)).toBe(2000);
    expect(estimateParkingFee(rule({ dayPassFee: 1800 }), 180)).toBe(1800);
  });

  it('서울 5분 단위 요금(추가 단위 없음)도 기본 단위 반복으로', () => {
    expect(estimateParkingFee(rule({ baseMin: 5, baseFee: 430, addMin: null, addFee: null }), 60)).toBe(5160);
  });

  it('요금 한 줄 문구', () => {
    expect(formatParkingFeeRule(rule({}))).toBe('기본 30분 1,000원 · 추가 10분 500원');
    expect(formatParkingFeeRule(rule({ feeType: 'free' }))).toBe('무료');
    expect(formatParkingFeeRule(rule({ baseMin: null }))).toBe('요금 정보 없음');
  });
});

describe('혼잡 단계·충전기', () => {
  it('점유율 → 여유/보통/혼잡/만차, 면수 모르면 null, 초과 주차도 만차', () => {
    expect(parkingLevelOf(100, 50)).toBe('free');
    expect(parkingLevelOf(100, 75)).toBe('normal');
    expect(parkingLevelOf(100, 92)).toBe('busy');
    expect(parkingLevelOf(100, 97)).toBe('full');
    expect(parkingLevelOf(520, 534)).toBe('full');
    expect(parkingLevelOf(0, 0)).toBeNull();
    expect(parkingLevelOf(null, 3)).toBeNull();
  });

  it('급속 판정 — 용량 우선, 없으면 완속 타입만 완속', () => {
    expect(isEvChargerFast('04', 100)).toBe(true);
    expect(isEvChargerFast('02', 7)).toBe(false);
    expect(isEvChargerFast('02', null)).toBe(false);
    expect(isEvChargerFast('06', null)).toBe(true);
  });

  it('충전소 단계', () => {
    expect(evStationLevel(1, 3)).toBe('available');
    expect(evStationLevel(0, 2)).toBe('busy');
    expect(evStationLevel(0, 0)).toBe('offline');
  });
});

describe('이름 정규화·공항', () => {
  it('괄호 보조어·공영주차장 꼬리·공백 제거', () => {
    expect(normalizeParkingName('세종로 공영주차장(시)')).toBe(normalizeParkingName('세종로공영주차장'));
    expect(normalizeParkingName('종묘주차장 공영주차장(시)')).toBe('종묘');
  });

  it('한국공항공사 airportKor 로 공항 찾기', () => {
    expect(parkingAirportByApiName('김포국제공항')?.code).toBe('GMP');
    expect(parkingAirportByApiName('없는공항')).toBeNull();
  });
});
