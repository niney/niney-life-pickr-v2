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
}

export const PublicTopBar = ({ onMenuClick }: Props) => {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();

  // 맛집 상세 라우트는 자체 헤더(식당명·← 목록·✕) 가 상단을 담당 → 모바일에선
  // 전역 TopBar 를 hidden 처리해 56px 회수. xl+ 데스크톱은 3-column 표시 중이라
  // 글로벌 네비 접근 위해 그대로 표시. PublicLayout 에서 wrapping div 로 감싸면
  // sticky containing block 이 깨져 본문 스크롤 시 함께 사라지므로, 분기는
  // 반드시 PublicTopBar 의 root header 자체 className 에서 처리한다.
  const detailMatch = useMatch('/restaurants/:placeId');
  const hideOnMobile = !!detailMatch;

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur sm:px-6',
        hideOnMobile && 'hidden xl:flex',
      )}
    >
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
    </header>
  );
};
