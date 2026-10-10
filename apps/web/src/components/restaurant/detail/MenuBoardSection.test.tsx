import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { RestaurantPublicMenuBoardType } from '@repo/api-contract';
import { MenuBoardSection } from './MenuBoardSection';
import { MenuGrid } from './shared';

// 공개 메뉴 탭 — 메뉴판 사진(사진에만 있는 메뉴·사진 크게 보기)과 등록 메뉴 카드의 최신 사진 가격.

const board = (count: number): RestaurantPublicMenuBoardType => ({
  images: [
    { url: 'https://ldb-phinf.pstatic.net/20250429_1/a.png', uploadedOn: '2025-04-29' },
    { url: 'https://ldb-phinf.pstatic.net/20260513_1/b.png', uploadedOn: '2026-05-13' },
  ],
  addedMenus: Array.from({ length: count }, (_, i) => ({
    name: `사진메뉴${i + 1}`,
    price: i === 0 ? '17900' : null,
    description: i === 0 ? '면 추가 가능' : null,
    uploadedOn: '2026-05-13',
  })),
  newerPrices: [],
});

describe('MenuBoardSection', () => {
  it('사진 수·날짜 범위, 사진에만 있는 메뉴(처음 8개 + 더 보기)와 AI 안내', () => {
    render(<MenuBoardSection menuBoard={board(10)} />);
    expect(screen.getByText('2장 · 2025-04-29 ~ 2026-05-13')).toBeInTheDocument();
    expect(screen.getByText('10개')).toBeInTheDocument();
    expect(screen.getByText(/AI 가 읽은 결과라 실제와 다를 수 있으니/)).toBeInTheDocument();
    expect(screen.getByText('17,900원')).toBeInTheDocument();
    expect(screen.getByText('면 추가 가능')).toBeInTheDocument();
    expect(screen.queryByText('사진메뉴9')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2개 더 보기' }));
    expect(screen.getByText('사진메뉴10')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '접기' }));
    expect(screen.queryByText('사진메뉴9')).not.toBeInTheDocument();
  });

  it('사진을 누르면 크게 본다', () => {
    render(<MenuBoardSection menuBoard={board(0)} />);
    expect(screen.queryByText('메뉴판 사진에서 찾은 메뉴')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '메뉴판 사진 2 크게 보기' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('등록 메뉴 카드에 사진이 더 최신인 가격을 한 줄로', () => {
    render(
      <MenuGrid
        menus={[{ name: '북경짜장면', price: '5000', description: null, recommend: null, imageUrls: [] }]}
        insights={undefined}
        boardPriceByName={new Map([['북경짜장면', { price: '7000', uploadedOn: '2026-08-01' }]])}
      />,
    );
    const item = screen.getByText('북경짜장면').closest('li')!;
    expect(within(item).getByText('5,000원')).toBeInTheDocument();
    expect(within(item).getByText('메뉴판 사진 7,000원 · 2026-08-01')).toBeInTheDocument();
  });
});
