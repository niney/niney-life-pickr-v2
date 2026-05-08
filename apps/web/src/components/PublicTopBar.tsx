import { Link, NavLink } from 'react-router-dom';
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
  { to: '/restaurants', label: '맛집' },
];

interface Props {
  onMenuClick: () => void;
}

export const PublicTopBar = ({ onMenuClick }: Props) => {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur sm:px-6">
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
