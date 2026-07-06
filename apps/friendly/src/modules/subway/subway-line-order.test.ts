import { describe, expect, it } from 'vitest';
import {
  assignSections,
  isLoopSection,
  parseFrCode,
  type FrRow,
} from './subway-line-order.service.js';

const row = (frCode: string, ref: string): FrRow<string> => ({ frCode, ref });

describe('parseFrCode', () => {
  it('본선 숫자 / 접미(-N) / 접두(P·K·D)', () => {
    expect(parseFrCode('201')).toEqual({ prefix: '', num: 201, sub: null });
    expect(parseFrCode('211-1')).toEqual({ prefix: '', num: 211, sub: 1 });
    expect(parseFrCode('P549')).toEqual({ prefix: 'P', num: 549, sub: null });
    expect(parseFrCode('D4')).toEqual({ prefix: 'D', num: 4, sub: null });
    expect(parseFrCode('K312')).toEqual({ prefix: 'K', num: 312, sub: null });
  });
});

describe('assignSections', () => {
  it('2호선 — 본선 + 성수지선(211-N) + 신정지선(234-N), seq 는 num 순 1부터', () => {
    const sections = assignSections(
      [
        row('202', '을지로입구'),
        row('201', '시청'),
        row('211', '성수'),
        row('211-2', '신답'),
        row('211-1', '용답'),
        row('234', '신도림'),
        row('234-1', '도림천'),
        row('234-2', '양천구청'),
      ],
      '1002',
    );
    // main 먼저.
    expect(sections[0]!.branchKey).toBe('main');
    const main = sections.find((s) => s.branchKey === 'main')!;
    expect(main.branchName).toBeNull();
    // num 오름차순: 시청(201) 을지로입구(202) 성수(211) 신도림(234).
    expect(main.stations.map((x) => x.ref)).toEqual(['시청', '을지로입구', '성수', '신도림']);
    expect(main.stations.map((x) => x.seq)).toEqual([1, 2, 3, 4]);

    const seongsu = sections.find((s) => s.branchKey === 'seongsu')!;
    expect(seongsu.branchName).toBe('성수지선');
    expect(seongsu.stations.map((x) => x.ref)).toEqual(['용답', '신답']); // 211-1, 211-2

    const sinjeong = sections.find((s) => s.branchKey === 'sinjeong')!;
    expect(sinjeong.stations.map((x) => x.ref)).toEqual(['도림천', '양천구청']);
  });

  it('5호선 — 본선 + 마천지선(P접두)', () => {
    const sections = assignSections(
      [row('510', '방화'), row('511', '개화산'), row('P549', '둔촌동'), row('P550', '올림픽공원')],
      '1005',
    );
    expect(sections.find((s) => s.branchKey === 'main')!.stations.map((x) => x.ref)).toEqual([
      '방화',
      '개화산',
    ]);
    const macheon = sections.find((s) => s.branchKey === 'macheon')!;
    expect(macheon.branchName).toBe('마천지선');
    expect(macheon.stations.map((x) => x.ref)).toEqual(['둔촌동', '올림픽공원']);
  });

  it('지선 정의 없는 노선 — 단일 본선, num 정렬', () => {
    const sections = assignSections(
      [row('K111', '이촌'), row('K110', '용산'), row('K112', '서빙고')],
      '1075',
    );
    expect(sections).toHaveLength(1);
    expect(sections[0]!.branchKey).toBe('main');
    expect(sections[0]!.stations.map((x) => x.ref)).toEqual(['용산', '이촌', '서빙고']);
  });
});

describe('isLoopSection', () => {
  it('2호선 본선만 순환', () => {
    expect(isLoopSection('1002', 'main')).toBe(true);
    expect(isLoopSection('1002', 'seongsu')).toBe(false);
    expect(isLoopSection('1003', 'main')).toBe(false);
  });
});
