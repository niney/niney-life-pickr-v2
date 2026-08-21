import { useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Bus,
  CloudSun,
  Home,
  LogIn,
  LogOut,
  MapPinned,
  Receipt,
  ShieldCheck,
  UtensilsCrossed,
  Wind,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore, useLogout } from '@repo/shared';
import { ThemeToggle } from '~/components/ThemeToggle';
import { cn } from '~/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  // 한 메뉴가 여러 경로를 대표할 때 활성 판정 경로들('대중교통' = /bus·/subway).
  // 미지정이면 NavLink 기본 isActive(to 기준)를 쓴다.
  match?: string[];
}

const NAV: NavItem[] = [
  { to: '/', label: '홈', icon: Home, end: true },
  { to: '/restaurants-v2', label: '맛집', icon: UtensilsCrossed },
  { to: '/bus', label: '대중교통', icon: Bus, match: ['/bus', '/subway'] },
  { to: '/life-map', label: '일상지도', icon: MapPinned },
  { to: '/weather', label: '날씨', icon: CloudSun },
  { to: '/air', label: '대기질', icon: Wind },
];

const ROW = 'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors';
const ROW_ACTIVE = 'bg-primary text-primary-foreground';
const ROW_IDLE = 'text-muted-foreground hover:bg-accent hover:text-accent-foreground';

interface Props {
  open: boolean;
  onClose: () => void;
}

// 모바일·태블릿(lg 미만) 드로어 — 상단바의 NAV 가 lg 부터 가로로 펼쳐지므로 그 아래 폭에서
// 메뉴를 맡는다. 하단엔 계정·테마: 상단바가 md 아래 폭에선 둘을 내려놓기 때문
// (PublicTopBar 폭 예산 메모). md+ 에선 상단바에 있으니 여기선 숨겨 중복 노출을 피한다.
export const PublicSidebar = ({ open, onClose }: Props) => {
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className={cn('lg:hidden', !open && 'pointer-events-none')}>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/40 transition-opacity',
          open ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card transition-transform',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <span className="text-base font-semibold">🎲 Life Pickr</span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label="닫기"
          >
            <X className="size-4" />
          </button>
        </div>
        {/* 가로 모드 등 낮은 화면에서도 하단 계정 영역이 밀려나지 않게 NAV 만 스크롤. */}
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
          {NAV.map(({ to, label, icon: Icon, end, match }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) => {
                const active = match
                  ? match.some((p) => pathname === p || pathname.startsWith(`${p}/`))
                  : isActive;
                return cn(ROW, active ? ROW_ACTIVE : ROW_IDLE);
              }}
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="shrink-0 border-t px-3 py-3 md:hidden" data-testid="sidebar-account">
          {user ? (
            <>
              <p className="truncate px-3 pb-1 text-xs text-muted-foreground" title={user.email}>
                {user.email}
              </p>
              <NavLink
                to="/me/settlements"
                onClick={onClose}
                className={({ isActive }) => cn(ROW, isActive ? ROW_ACTIVE : ROW_IDLE)}
              >
                <Receipt className="size-4" />내 정산
              </NavLink>
              {user.role === 'ADMIN' && (
                <Link to="/admin" onClick={onClose} className={cn(ROW, ROW_IDLE)}>
                  <ShieldCheck className="size-4" />
                  관리자
                </Link>
              )}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  logout.mutate();
                }}
                className={cn(ROW, ROW_IDLE, 'w-full')}
              >
                <LogOut className="size-4" />
                로그아웃
              </button>
            </>
          ) : (
            <Link to="/login" onClick={onClose} className={cn(ROW, ROW_IDLE)}>
              <LogIn className="size-4" />
              로그인
            </Link>
          )}
          <div className="mt-1 flex items-center justify-between px-3 py-1 text-sm text-muted-foreground">
            <span>테마</span>
            <ThemeToggle />
          </div>
        </div>
      </aside>
    </div>
  );
};
