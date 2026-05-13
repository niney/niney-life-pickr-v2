import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  BarChart3,
  Beaker,
  ChevronLeft,
  ChevronRight,
  Compass,
  Home,
  Settings,
  Shield,
  Sparkles,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import { AdminTopBar } from './AdminTopBar';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/admin', label: '홈', icon: Home, end: true },
  { to: '/admin/discover', label: '맛집 발견', icon: Compass },
  { to: '/admin/restaurants', label: '맛집', icon: UtensilsCrossed },
  { to: '/admin/analytics', label: 'AI 분석 관리', icon: BarChart3 },
  { to: '/admin/crawl-test', label: '크롤링 테스트', icon: Beaker },
  { to: '/admin/ai-test', label: 'AI 테스트', icon: Sparkles },
  { to: '/admin/settings', label: '설정', icon: Settings },
];

const STORAGE_KEY = 'lp:adminSidebarCollapsed';
// 사이드바 폭은 두 곳(aside, main 의 좌측 패딩 등)에서 참조될 수 있으므로
// 상수로 추출. 같은 transition timing 을 모든 요소에 공유시켜 동기화한다.
const TRANSITION = 'transition-all duration-300 ease-in-out';

const readInitialCollapsed = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

export const AdminLayout = () => {
  const [collapsed, setCollapsed] = useState<boolean>(readInitialCollapsed);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside
        className={cn(
          'sticky top-0 flex h-screen shrink-0 flex-col overflow-hidden border-r bg-card',
          TRANSITION,
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        {/* 헤더 — 고정 높이로 접힘 전후 동일하게 유지 */}
        <div
          className={cn(
            'flex h-16 shrink-0 items-center border-b px-3',
            collapsed && 'justify-center',
          )}
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Shield className="size-4" />
          </div>
          <div
            className={cn(
              'flex flex-col overflow-hidden whitespace-nowrap',
              TRANSITION,
              collapsed ? 'ml-0 max-w-0 opacity-0' : 'ml-2 max-w-[160px] opacity-100',
            )}
          >
            <span className="text-sm font-semibold leading-tight">관리자</span>
            <span className="text-xs text-muted-foreground leading-tight">Life Pickr</span>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2 py-4">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex h-10 items-center rounded-md px-3 text-sm font-medium transition-colors',
                    collapsed && 'justify-center',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )
                }
              >
                <Icon className="size-4 shrink-0" />
                <span
                  className={cn(
                    'overflow-hidden whitespace-nowrap',
                    TRANSITION,
                    collapsed ? 'ml-0 max-w-0 opacity-0' : 'ml-3 max-w-[160px] opacity-100',
                  )}
                >
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </nav>

        {/* 푸터 — 헤더와 동일한 패딩/높이 패턴으로 정렬 */}
        <div
          className={cn(
            'flex h-14 shrink-0 items-center border-t px-3',
            collapsed ? 'justify-center' : 'justify-between',
          )}
        >
          <NavLink
            to="/"
            className={cn(
              'overflow-hidden whitespace-nowrap text-xs text-muted-foreground hover:text-foreground',
              TRANSITION,
              collapsed ? 'max-w-0 opacity-0' : 'max-w-[140px] opacity-100',
            )}
          >
            ← 일반 화면으로
          </NavLink>
          <button
            type="button"
            onClick={toggle}
            title={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
            aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <ChevronLeft
              className={cn('size-4 transition-transform duration-300', collapsed && 'rotate-180')}
            />
          </button>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-x-hidden">
        <AdminTopBar />
        <div className="flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
