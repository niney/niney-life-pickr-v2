import { useLayoutEffect, useRef } from 'react';
import { Link, NavLink, useMatch } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useAuthStore, useLogout } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { ThemeToggle } from '~/components/ThemeToggle';
import { cn } from '~/lib/utils';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: '홈', end: true },
  { to: '/restaurants-v2', label: '맛집' },
];

interface Props {
  onMenuClick: () => void;
  // 두 번째 row 슬롯. 같은 sticky header element 안에 그려져 TopBar 와 한
  // 몸으로 paint — 모바일 dynamic viewport(주소창 minify) 변동 시 두 sticky
  // 요소가 따로 reflow 되며 발생하던 겹침/잘림 회피.
  subBar?: React.ReactNode;
  // header 의 실제 높이(= TopBar h-14 + subBar 높이) 를 부모에 전달. 시트의
  // topOffset 계산에 사용. ResizeObserver 로 subBar 컨텐츠 변동 자동 반영.
  onHeightChange?: (height: number) => void;
}

export const PublicTopBar = ({ onMenuClick, subBar, onHeightChange }: Props) => {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();

  // 맛집 상세 라우트는 자체 헤더(식당명·← 목록·✕) 가 상단을 담당 → 모바일에선
  // 전역 TopBar 를 hidden 처리해 56px 회수. xl+ 데스크톱은 3-column 표시 중이라
  // 글로벌 네비 접근 위해 그대로 표시. (v2 경로는 시트 패턴이라 매치되지 않음.)
  const detailMatch = useMatch('/restaurants/:placeId');
  const hideOnMobile = !!detailMatch;

  const headerRef = useRef<HTMLElement>(null);

  // header 실제 높이를 측정해 부모에 전달. subBar 컨텐츠가 줄바꿈하거나 dvh
  // 변동으로 layout 이 바뀌면 자동 재계산.
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el || !onHeightChange) return;
    onHeightChange(el.offsetHeight);
    const ro = new ResizeObserver(() => {
      if (headerRef.current) onHeightChange(headerRef.current.offsetHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeightChange]);

  return (
    <header
      ref={headerRef}
      className={cn(
        'sticky top-0 z-30 border-b bg-background/80 backdrop-blur',
        hideOnMobile && 'hidden xl:block',
      )}
    >
      <div className="flex h-14 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground md:hidden"
            aria-label="메뉴 열기"
          >
            <Menu className="size-4" />
          </button>
          <Link to="/" className="flex items-center gap-2">
            <span className="text-base font-semibold">🎲 Life Pickr</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <>
              <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
              {user.role === 'ADMIN' && (
                <Button asChild variant="outline" size="sm">
                  <Link to="/admin">관리자</Link>
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => logout.mutate()}>
                로그아웃
              </Button>
            </>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link to="/login">로그인</Link>
            </Button>
          )}
        </div>
      </div>
      {subBar && <div className="border-t">{subBar}</div>}
    </header>
  );
};
