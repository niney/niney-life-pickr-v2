import { describe, expect, it } from 'vitest';
import type { RegionStatsResultType } from '@repo/api-contract';
import {
  isStatsCommand,
  buildRegionStatsOverview,
  buildRegionStatsSido,
} from './region-stats-telegram.js';

const STATS: RegionStatsResultType = {
  total: 21,
  unclassified: 2,
  sidos: [
    {
      sido: '서울특별시',
      count: 12,
      sigungus: [
        { sigungu: '강남구', count: 5, lat: 1, lng: 2 },
        { sigungu: '마포구', count: 4, lat: 1, lng: 2 },
        { sigungu: '종로구', count: 3, lat: 1, lng: 2 },
      ],
    },
    { sido: '경기도', count: 6, sigungus: [{ sigungu: '수원시', count: 6, lat: 1, lng: 2 }] },
    { sido: '부산광역시', count: 3, sigungus: [] },
  ],
  points: [],
};

describe('isStatsCommand', () => {
  it('통계 커맨드를 인식한다', () => {
    expect(isStatsCommand('/stats')).toBe(true);
    expect(isStatsCommand('/STATS')).toBe(true);
    expect(isStatsCommand('/stats@MyBot')).toBe(true);
    expect(isStatsCommand('/통계')).toBe(true);
    expect(isStatsCommand('/지역')).toBe(true);
    expect(isStatsCommand('통계')).toBe(true);
  });
  it('그 외는 false', () => {
    expect(isStatsCommand('/discover')).toBe(false);
    expect(isStatsCommand('안녕')).toBe(false);
    expect(isStatsCommand('')).toBe(false);
  });
});

describe('buildRegionStatsOverview', () => {
  it('시도 랭킹 + 시도 버튼을 만든다', () => {
    const { text, buttons } = buildRegionStatsOverview(STATS);
    expect(text).toContain('총 21곳');
    expect(text).toContain('미분류 2');
    expect(text).toContain('서울특별시');
    expect(text).toContain('경기도');
    expect(text).toContain('█'); // 막대

    const flat = buttons.flat();
    expect(flat).toHaveLength(3);
    expect(flat.map((b) => b.callbackData)).toEqual([
      'rs:서울특별시',
      'rs:경기도',
      'rs:부산광역시',
    ]);
    expect(flat[0]!.text).toBe('서울 12'); // 약칭 + count
    expect(flat[1]!.text).toBe('경기 6');
    // 3개 → 한 행(행당 3개).
    expect(buttons).toHaveLength(1);
  });

  it('빈 통계는 안내 + 버튼 없음', () => {
    const { text, buttons } = buildRegionStatsOverview({
      total: 0,
      unclassified: 0,
      sidos: [],
      points: [],
    });
    expect(text).toContain('등록된 가게가 없습니다');
    expect(buttons).toHaveLength(0);
  });
});

describe('buildRegionStatsSido', () => {
  it('해당 시도의 시군구 분해 + 발굴/전체 버튼', () => {
    const { text, buttons } = buildRegionStatsSido(STATS, '서울특별시');
    expect(text).toContain('서울특별시');
    expect(text).toContain('강남구');
    expect(text).toContain('마포구');
    expect(text).toContain('종로구');

    const flat = buttons.flat();
    const cbs = flat.map((b) => b.callbackData);
    // 시군구 발굴 버튼(고정).
    expect(cbs).toContain('disc:서울특별시:강남구');
    expect(cbs).toContain('disc:서울특별시:마포구');
    // 시도 전체(랜덤 구) + 전체 복귀.
    expect(cbs).toContain('disc:서울특별시');
    expect(buttons[buttons.length - 1]).toEqual([{ text: '⬅️ 전체', callbackData: 'rs:*' }]);
  });

  it('없는 시도는 전체 뷰로 폴백', () => {
    const { text } = buildRegionStatsSido(STATS, '제주특별자치도');
    expect(text).toContain('맛집 지역 통계'); // overview 로 폴백
  });

  it('시군구 없는 시도는 안내 + 시도 발굴/전체 버튼', () => {
    const { text, buttons } = buildRegionStatsSido(STATS, '부산광역시');
    expect(text).toContain('세부 시/군/구 정보가 없습니다');
    expect(buttons).toEqual([
      [{ text: '🔍 부산 전체(랜덤 구)', callbackData: 'disc:부산광역시' }],
      [{ text: '⬅️ 전체', callbackData: 'rs:*' }],
    ]);
  });
});
