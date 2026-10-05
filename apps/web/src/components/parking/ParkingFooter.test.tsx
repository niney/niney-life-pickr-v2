import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ParkingStatusResultType } from '@repo/api-contract';
import { ParkingFooter } from './ParkingFooter';

// 주차 패널 하단 — 원천별 주차장 수(교통안전공단은 더한 곳이 있을 때만)와 출처.

const FETCHED = '2026-10-05T07:00:00.000Z';
const status = (kotsa: number): ParkingStatusResultType => ({
  lots: { loaded: true, count: 18168 + kotsa, bySource: { std: 17333, seoul: 835, kotsa }, geocoded: 17412 + kotsa, baseDate: '2026-10-05', loadedAt: FETCHED },
  ev: { loaded: true, stations: 99850, chargers: 515263, loadedAt: FETCHED, statusAt: FETCHED },
  live: { lotCount: 99, lotAt: null, airportLotCount: 44, airportAt: null },
  fetchedAt: FETCHED,
});

describe('ParkingFooter', () => {
  it('교통안전공단으로 더한 주차장이 있으면 원천별 수에 붙이고, 출처에도 적는다', () => {
    render(<ParkingFooter tab="lot" status={status(2258)} />);
    const footer = screen.getByTestId('parking-footer');
    expect(footer).toHaveTextContent('주차장 20,426곳(서울 835 · 전국 표준 17,333 · 교통안전공단 2,258) · 실시간 여석 99곳');
    expect(footer).toHaveTextContent('출처: 전국주차장정보표준데이터·한국교통안전공단 주차정보(공공데이터포털)');
  });

  it('더한 곳이 없으면(적재 전·원천 실패) 교통안전공단 칸을 생략한다', () => {
    render(<ParkingFooter tab="lot" status={status(0)} />);
    expect(screen.getByTestId('parking-footer')).toHaveTextContent('주차장 18,168곳(서울 835 · 전국 표준 17,333) · 실시간 여석 99곳');
  });
});
