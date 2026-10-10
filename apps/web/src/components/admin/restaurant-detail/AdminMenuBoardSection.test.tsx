import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { MenuBoardMenuType } from '@repo/api-contract';
import { AdminMenuBoardSection } from './AdminMenuBoardSection';

// 어드민 메뉴 탭의 메뉴판 사진 섹션 — 구분값 origin 별 목록, 가격이 다른 등록 메뉴의 최신 쪽 표시.

const menu = (over: Partial<MenuBoardMenuType>): MenuBoardMenuType => ({
  name: '메뉴',
  price: null,
  description: null,
  origin: 'menu-board',
  registeredName: null,
  registeredPrice: null,
  priceCheck: null,
  imageUrl: 'https://ldb-phinf.pstatic.net/20250429_145/a.png',
  uploadedOn: '2025-04-29',
  ...over,
});

describe('AdminMenuBoardSection', () => {
  it('수집 전 스냅샷이면 그리지 않는다', () => {
    const { container } = render(<AdminMenuBoardSection snapshot={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('사진·읽음 수, 사진에만 있는 메뉴, 가격이 다른 등록 메뉴(최신 쪽)를 보여 준다', () => {
    render(
      <AdminMenuBoardSection
        snapshot={{
          menuUpdatedOn: '2025-01-10',
          menuBoardImages: [
            {
              url: 'https://ldb-phinf.pstatic.net/20250429_145/a.png',
              uploadedOn: '2025-04-29',
              read: { items: [], model: 'kimi-k3', readAt: '2026-10-10T00:00:00.000Z' },
            },
            { url: 'https://ldb-phinf.pstatic.net/20260101_1/b.png', uploadedOn: '2026-01-01' },
          ],
          menuBoardMenus: [
            menu({ name: '고량주', price: '9,000' }),
            menu({
              name: '삼선간짜장',
              price: '12,000',
              origin: 'registered',
              registeredName: '삼선간짜장',
              registeredPrice: '10000',
              priceCheck: 'different',
            }),
            menu({ name: '짬뽕', origin: 'registered', registeredName: '짬뽕', priceCheck: 'same' }),
          ],
        }}
      />,
    );
    expect(screen.getByText('2장 · 읽음 1장')).toBeInTheDocument();
    expect(screen.getByText('등록 메뉴 업데이트 2025-01-10')).toBeInTheDocument();
    expect(screen.getByText('안 읽음')).toBeInTheDocument();

    const added = screen.getByText('사진에만 있는 메뉴 1').parentElement!;
    expect(within(added).getByText('고량주')).toBeInTheDocument();
    expect(within(added).getByText('메뉴판 사진')).toBeInTheDocument();

    const priced = screen.getByText('가격이 다른 등록 메뉴 1').parentElement!;
    expect(within(priced).getByText('10,000 → 12,000')).toBeInTheDocument();
    expect(within(priced).getByText('사진이 최신')).toBeInTheDocument();
    expect(within(priced).getByText('2025-04-29')).toBeInTheDocument();
    expect(screen.getByText(/사진에서도 확인된 등록 메뉴 2개/)).toBeInTheDocument();
  });

  it('사진이 하나도 없으면 안내만', () => {
    render(<AdminMenuBoardSection snapshot={{ menuBoardImages: [], menuBoardMenus: [] }} />);
    expect(screen.getByText('네이버에 올라온 메뉴판 사진이 없습니다.')).toBeInTheDocument();
  });
});
