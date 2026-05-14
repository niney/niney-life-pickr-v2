import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Beaker,
  ChevronLeft,
  Compass,
  Home,
  Settings,
  Shield,
  Sparkles,
  UtensilsCrossed,
  X,
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
  { to: '/admin/crawl-test', label: '네이버 크롤링 테스트', icon: Beaker },
  { to: '/admin/catchtable-test', label: '캐치테이블 크롤링 테스트', icon: Beaker },
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
  // 모바일(<md) 전용 드로어 open state. md+ 에서는 aside 가 sticky 로
  // 항상 표시되므로 이 값은 사실상 무시된다. localStorage 와 무관 —
  // 페이지 이동 시마다 자연스럽게 닫히는 게 표준 UX.
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  // 라우트 이동 시 자동 닫기. 햄버거로 열고 메뉴 클릭 → 페이지 이동 후
  // 드로어가 그대로 열려 있으면 본문을 가린다.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleCollapsed = () => {
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

  // 모바일에서는 collapsed 무시 — 드로어로 열리면 항상 전체 폭(w-60).
  // md+ 에서만 collapsed 가 의미를 가진다.
  const mdCollapsed = collapsed;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* 모바일 backdrop — md+ 에서는 절대 표시 안 됨 (sticky aside 라 dim 불필요). */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="사이드바 닫기"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
        />
      )}
      <aside
        className={cn(
          // 모바일: fixed 드로어. closed 시 -translate-x-full 로 화면 밖.
          'fixed inset-y-0 left-0 z-40 flex h-screen w-60 shrink-0 flex-col overflow-hidden border-r bg-card',
          // md+: sticky 사이드바. translate 무효화 + 폭 collapsed 적용.
          'md:sticky md:top-0 md:z-auto md:translate-x-0',
          mdCollapsed ? 'md:w-16' : 'md:w-60',
          TRANSITION,
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        {/* 헤더 — 고정 높이로 접힘 전후 동일하게 유지 */}
        <div
          className={cn(
            'flex h-16 shrink-0 items-center border-b px-3',
            mdCollapsed && 'md:justify-center',
          )}
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Shield className="size-4" />
          </div>
          <div
            className={cn(
              'flex flex-col overflow-hidden whitespace-nowrap',
              TRANSITION,
              // 모바일은 항상 펼친 상태이므로 라벨 노출.
              'ml-2 max-w-[160px] opacity-100',
              mdCollapsed && 'md:ml-0 md:max-w-0 md:opacity-0',
            )}
          >
            <span className="text-sm font-semibold leading-tight">관리자</span>
            <span className="text-xs text-muted-foreground leading-tight">Life Pickr</span>
          </div>
          {/* 모바일 전용 닫기 버튼 — 햄버거 토글과 별도로 사이드바 안에서도 닫을 수 있게. */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="사이드바 닫기"
            className="ml-auto flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground md:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2 py-4">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={mdCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex h-10 items-center rounded-md px-3 text-sm font-medium transition-colors',
                    mdCollapsed && 'md:justify-center',
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
                    'ml-3 max-w-[160px] opacity-100',
                    mdCollapsed && 'md:ml-0 md:max-w-0 md:opacity-0',
                  )}
                >
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </nav>

        {/* 푸터 — 헤더와 동일한 패딩/높이 패턴으로 정렬. collapse 토글은 md+
            전용 (모바일은 드로어 개념이라 의미 없음). "일반 화면으로" 진입은
            AdminTopBar 로 이전 — 어드민 어디서든 보이고, collapse/드로어 폭에
            영향 안 받는다. */}
        <div className="hidden h-14 shrink-0 items-center justify-center border-t px-3 md:flex">
          <button
            type="button"
            onClick={toggleCollapsed}
            title={mdCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
            aria-label={mdCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <ChevronLeft
              className={cn('size-4 transition-transform duration-300', mdCollapsed && 'rotate-180')}
            />
          </button>
        </div>
      </aside>

      {/* overflow-x-hidden 을 두면 main 자체가 scroll container 가 되어 내부
          position:sticky 가 viewport(=body 스크롤) 가 아니라 main 을 기준으로
          잡힌다. 모바일은 main 이 실제로 스크롤되지 않고 body 가 스크롤되므로
          상세 페이지의 sticky 헤더(식당명+탭)가 body 스크롤과 함께 통째로
          밀려나는 문제 → PublicLayout 과 동일하게 overflow 무지정으로 둔다.
          가로 오버플로 차단이 필요한 컴포넌트가 나오면 그 자리에서 국소적으로
          처리(overflow-x-clip 등) — 전역 차단은 sticky 동작을 깨므로 금지. */}
      <main className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar onMenuClick={() => setMobileOpen(true)} />
        <div className="flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
