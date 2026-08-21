import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { useAirLocationStore, useAuthStore } from '@repo/shared';
import { server } from '~/test/msw';
import { PublicTopBar } from './PublicTopBar';

// 상단바 오른쪽 — 로그아웃이면 로그인 링크, 로그인이면 이메일·버튼을 늘어놓는 대신 계정 메뉴
// 하나(내 정산 · 관리자(ADMIN) · 로그아웃). 폭별 숨김(md 아래선 사이드바로, NAV 는 lg 부터)은
// CSS 라 jsdom 에선 보지 않고 구조·링크·역할만 본다.

const renderBar = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PublicTopBar onMenuClick={() => {}} />
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

describe('PublicTopBar', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAuthStore.setState({ token: null, user: null, isGuest: false });
    useAirLocationStore.setState({ location: null });
  });

  it('로그아웃: 로그인 링크 + 테마 토글, 계정 메뉴 없음 · 저장 위치 없으면 칩도 없음', () => {
    renderBar();
    expect(screen.getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('button', { name: /모드로$/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /계정 메뉴/ })).toBeNull();
    expect(screen.queryByTestId('my-location-chip')).toBeNull();
    // NAV 6개(홈 · 맛집 · 대중교통 · 일상지도 · 날씨 · 대기질).
    expect(screen.getByRole('link', { name: '일상지도' })).toHaveAttribute('href', '/life-map');
  });

  it('로그인(ADMIN): 계정 메뉴 하나 — 열면 이메일·내 정산·관리자·로그아웃, ESC·바깥 클릭으로 닫힘', () => {
    server.use(http.get('/api/v1/air/location', () => HttpResponse.json({ location: null })));
    useAuthStore.setState({ token: 't', user: admin, isGuest: false });
    renderBar();
    expect(screen.queryByRole('link', { name: '로그인' })).toBeNull();
    const trigger = screen.getByRole('button', { name: '계정 메뉴 (admin@example.com)' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('account-menu')).toBeNull();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('account-menu')).toHaveTextContent('admin@example.com');
    expect(screen.getByRole('link', { name: '내 정산' })).toHaveAttribute('href', '/me/settlements');
    expect(screen.getByRole('link', { name: '관리자' })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('account-menu')).toBeNull();

    fireEvent.click(trigger);
    expect(screen.getByTestId('account-menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('account-menu')).toBeNull();
  });

  it('일반 사용자(USER)에겐 관리자 항목이 없다', () => {
    server.use(http.get('/api/v1/air/location', () => HttpResponse.json({ location: null })));
    useAuthStore.setState({ token: 't', user: { ...admin, role: 'USER' }, isGuest: false });
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: /계정 메뉴/ }));
    expect(screen.getByRole('link', { name: '내 정산' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '관리자' })).toBeNull();
  });
});
