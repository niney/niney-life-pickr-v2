import { Link } from 'react-router-dom';
import { useAuthStore, useLogout } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { ThemeToggle } from '~/components/ThemeToggle';

export const PublicTopBar = () => {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur sm:px-6">
      <Link to="/" className="flex items-center gap-2">
        <span className="text-base font-semibold">🎲 Life Pickr</span>
      </Link>
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
