import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@repo/shared';
import { PublicSidebar } from './PublicSidebar';

// 드로어 — NAV 6개 위에, 하단에 계정(로그인 링크 또는 이메일·내 정산·관리자·로그아웃)과 테마
// 토글. 상단바가 md 아래 폭에서 둘을 내려놓는 자리다(md+ 숨김은 CSS 라 여기선 안 본다).

const renderSidebar = (onClose = () => {}) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PublicSidebar open onClose={onClose} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const admin = {
  id: 'u1',
  email: 'admin@example.com',
  role: 'ADMIN' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('PublicSidebar', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null, isGuest: false });
  });

  it('로그아웃: 하단에 로그인 링크 + 테마 토글, NAV 는 그대로', () => {
    renderSidebar();
    const account = screen.getByTestId('sidebar-account');
    expect(within(account).getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login');
    expect(within(account).getByRole('button', { name: /모드로$/ })).toBeInTheDocument();
    expect(within(account).queryByRole('link', { name: '내 정산' })).toBeNull();
    expect(screen.getByRole('link', { name: '일상지도' })).toHaveAttribute('href', '/life-map');
    expect(screen.getByRole('link', { name: '대기질' })).toHaveAttribute('href', '/air');
  });

  it('로그인(ADMIN): 이메일·내 정산·관리자·로그아웃 — 항목을 누르면 드로어를 닫는다', () => {
    const onClose = vi.fn();
    useAuthStore.setState({ token: 't', user: admin, isGuest: false });
    renderSidebar(onClose);
    const account = screen.getByTestId('sidebar-account');
    expect(account).toHaveTextContent('admin@example.com');
    expect(within(account).queryByRole('link', { name: '로그인' })).toBeNull();
    expect(within(account).getByRole('link', { name: '내 정산' })).toHaveAttribute('href', '/me/settlements');
    expect(within(account).getByRole('link', { name: '관리자' })).toHaveAttribute('href', '/admin');
    expect(within(account).getByRole('button', { name: '로그아웃' })).toBeInTheDocument();
    fireEvent.click(within(account).getByRole('link', { name: '내 정산' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('일반 사용자(USER)에겐 관리자 항목이 없다', () => {
    useAuthStore.setState({ token: 't', user: { ...admin, role: 'USER' }, isGuest: false });
    renderSidebar();
    const account = screen.getByTestId('sidebar-account');
    expect(within(account).getByRole('link', { name: '내 정산' })).toBeInTheDocument();
    expect(within(account).queryByRole('link', { name: '관리자' })).toBeNull();
  });
});
