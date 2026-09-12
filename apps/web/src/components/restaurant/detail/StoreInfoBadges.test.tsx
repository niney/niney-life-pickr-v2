import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { RestaurantStoreInfoType } from '@repo/api-contract';
import { StoreInfoBadges } from './StoreInfoBadges';

// 상가업소 매칭 배지 — ① 매칭 없음이면 아무것도 안 그림 ② 업종 배지는 소분류명 + "상가정보", title 에 근거
// ③ closedSuspect 면 폐업 의심 배지에 기준 월.

const store = (over: Partial<RestaurantStoreInfoType> = {}): RestaurantStoreInfoType => ({
  bizesId: 'MA0001',
  name: '명동교자',
  branch: '본점',
  kind: 'food',
  industry: '국수/칼국수',
  ksicName: '한식 면 요리 전문점',
  distM: 12,
  nameScore: 1,
  closedSuspect: false,
  missingSince: null,
  baseDate: '2026-06-30',
  ...over,
});

describe('StoreInfoBadges', () => {
  it('매칭 없음 → 렌더 없음', () => {
    const { container } = render(<StoreInfoBadges store={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('업종 배지 — 소분류명·상가정보, title 에 상호·거리·유사도·기준 분기', () => {
    render(<StoreInfoBadges store={store()} />);
    const badge = screen.getByTestId('store-industry-badge');
    expect(badge).toHaveTextContent('국수/칼국수 · 상가정보');
    expect(badge).toHaveAttribute('title', expect.stringContaining('명동교자 본점'));
    expect(badge).toHaveAttribute('title', expect.stringContaining('거리 12m'));
    expect(badge).toHaveAttribute('title', expect.stringContaining('2026-06 분기'));
    expect(screen.queryByTestId('store-closed-badge')).toBeNull();
  });

  it('폐업 의심 — 경고 배지에 기준 월과 사라진 날짜', () => {
    render(<StoreInfoBadges store={store({ closedSuspect: true, missingSince: '2026-09-12T10:00:00.000Z' })} />);
    const closed = screen.getByTestId('store-closed-badge');
    expect(closed).toHaveTextContent('폐업 의심 · 상가정보 2026-06 기준 미확인');
    expect(closed).toHaveAttribute('title', expect.stringContaining('2026-09-12부터'));
  });
});
