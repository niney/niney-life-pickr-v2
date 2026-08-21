import { useLayoutEffect, useRef } from 'react';
import { Link, NavLink, useLocation, useMatch } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useAuthStore, useLogout } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { AccountMenu } from '~/components/AccountMenu';
import { ThemeToggle } from '~/components/ThemeToggle';
import { MyLocationChip } from '~/components/weather/MyLocationChip';
import { cn } from '~/lib/utils';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  // 한 메뉴가 여러 경로를 대표할 때 활성 판정 경로들('대중교통' = /bus·/subway).
  // 미지정이면 NavLink 기본 isActive(to 기준)를 쓴다.
  match?: string[];
}

const NAV: NavItem[] = [
  { to: '/', label: '홈', end: true },
  { to: '/restaurants-v2', label: '맛집' },
  { to: '/bus', label: '대중교통', match: ['/bus', '/subway'] },
  { to: '/life-map', label: '일상지도' },
  { to: '/weather', label: '날씨' },
  { to: '/air', label: '대기질' },
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

// ── 폭 예산(실측 기준) ────────────────────────────────────────────────────────
// 상단바는 한 줄이라 넘치면 오른쪽 끝(테마·계정)이 화면 밖으로 밀리고 문서가 가로로
// 스크롤된다 — 그러면 fixed inset-x-0 레이어(맛집 지도·시트)까지 문서 폭을 따라 커진다.
// 내 위치 칩(모바일 ~170px, lg+ ~340px)이 들어오면서 폭 구간마다 담는 것을 나눴다:
//   <md   : [≡][로고] ··· [칩] 만. 테마·로그인/계정은 PublicSidebar 하단으로.
//   md~lg : + 테마 · 로그인/계정 메뉴. NAV 는 아직 드로어(햄버거).
//   lg+   : NAV 6개 가로 표시(768 에선 NAV 와 칩이 같이 못 들어간다). 칩도 lg 부터
//           하늘 상태·PM2.5 까지 펼친다.
//   xl+   : 계정 메뉴 트리거에 이메일.
// 그래도 넘치는 경우(아주 좁은 폭·긴 라벨)엔 버튼이 밀려나는 대신 칩이 줄어들게 —
// 왼쪽 묶음은 shrink-0, 오른쪽 묶음·칩은 min-w-0.

export const PublicTopBar = ({ onMenuClick, subBar, onHeightChange }: Props) => {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();

  // 맛집 상세 라우트는 자체 헤더(식당명·← 목록·✕) 가 상단을 담당 → 모바일에선
  // 전역 TopBar 를 hidden 처리해 56px 회수. xl+ 데스크톱은 3-column 표시 중이라
  // 글로벌 네비 접근 위해 그대로 표시. (v2 경로는 시트 패턴이라 매치되지 않음.)
  const detailMatch = useMatch('/restaurants/:placeId');
  const shareDetailMatch = useMatch('/r/:placeId');
  const hideOnMobile = !!detailMatch || !!shareDetailMatch;

  const { pathname } = useLocation();

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
        <div className="flex shrink-0 items-center gap-3 lg:gap-4">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground lg:hidden"
            aria-label="메뉴 열기"
          >
            <Menu className="size-4" />
          </button>
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <span className="whitespace-nowrap text-base font-semibold">🎲 Life Pickr</span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => {
                  const active = item.match
                    ? item.match.some((p) => pathname === p || pathname.startsWith(`${p}/`))
                    : isActive;
                  return cn(
                    'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  );
                }}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          {/* 저장한 내 위치의 현재 날씨·공기질 — 저장 전엔 아무것도 안 그린다. */}
          <MyLocationChip />
          {/* 테마·계정은 md+ 에서만 헤더에(위 폭 예산). 그 아래 폭에선 PublicSidebar 하단. */}
          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <ThemeToggle />
            {user ? (
              <AccountMenu
                email={user.email}
                isAdmin={user.role === 'ADMIN'}
                onLogout={() => logout.mutate()}
              />
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link to="/login">로그인</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
      {subBar && <div className="border-t">{subBar}</div>}
    </header>
  );
};
