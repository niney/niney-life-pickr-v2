import { Suspense, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  ChartNoAxesColumn,
  Home,
  List,
  Loader2,
  Menu,
  Pill,
  Plus,
  Settings2,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { PublicSidebar } from '~/components/PublicSidebar';
import { ThemeToggle } from '~/components/ThemeToggle';
import { cn } from '~/lib/utils';
import { MealLink } from './MealLink';
import { useMealFont } from './mealFont';
import { MEAL_PATH, MEAL_SECTION_PATHS, MEAL_STORY_PATH } from './mealPaths';
import './mealTheme.css';

// 식단 셸(2026-11-08 리뉴얼) — 식단을 사이트 안의 하위 사이트처럼 띄운다. 공통 상단바 대신
//   데스크톱(1280px~) 왼쪽 사이드 메뉴 · 태블릿(768~1279px) 아이콘 줄 · 휴대폰 상단바 + 하단 탭 5칸(앱과 같은 묶음:
//   기록 = 목록·달력, 분석 = 통계·영양). 사이트 전체 메뉴는 상단바 '메뉴'가 공통 서랍(PublicSidebar)을 연다.
// 건강식단은 메뉴 항목이 아니다(2026-11-10) — 홈의 건강식단 줄·영양 탭·통계에서 맥락으로 들어오고, 목록·이야기·레시피
// (/meal/stories…)에서는 홈이 켜진다. 이야기도 이 셸 안에 떠서 넓은 화면에서는 사이드 메뉴가 그대로 남는다.
// 본문은 사이드 메뉴 옆에 왼쪽 정렬로 붙인다 — 넓은 화면에서 오른쪽에 뜨는 패널이 빈 자리에 놓이게.
// 바깥 틀(.meal-app)은 MealApp 이 둔다 — 배경 위에 뜨는 패널도 같은 틀 안에 그려 글꼴·색을 받는다.

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** 이 주소와 그 아래에서도 켠다 — 메뉴 항목이 없는 구역(건강식단 목록·이야기는 홈의 건강식단 줄에서 들어온다). */
  also?: string[];
}

const SIDE_NAV: NavItem[] = [
  { to: MEAL_PATH.home, label: '홈', icon: Home, end: true, also: [MEAL_STORY_PATH.list] },
  { to: MEAL_PATH.records, label: '기록', icon: List },
  { to: MEAL_PATH.calendar, label: '달력', icon: CalendarDays },
  { to: MEAL_PATH.stats, label: '통계', icon: ChartNoAxesColumn },
  { to: MEAL_PATH.nutrition, label: '영양', icon: Pill },
  { to: MEAL_PATH.recommend, label: '추천', icon: Sparkles },
];

// 휴대폰 하단 탭 — 한 탭이 두 화면을 묶으면 둘 다에서 켜진다.
const TABS: Array<NavItem & { match: string[] }> = [
  { to: MEAL_PATH.home, label: '홈', icon: Home, match: [MEAL_PATH.home, MEAL_STORY_PATH.list] },
  {
    to: MEAL_PATH.records,
    label: '기록',
    icon: List,
    match: [MEAL_PATH.records, MEAL_PATH.calendar],
  },
  { to: MEAL_PATH.recommend, label: '추천', icon: Sparkles, match: [MEAL_PATH.recommend] },
  {
    to: MEAL_PATH.stats,
    label: '분석',
    icon: ChartNoAxesColumn,
    match: [MEAL_PATH.stats, MEAL_PATH.nutrition],
  },
];

const normalizePath = (pathname: string): string => pathname.replace(/\/+$/, '') || '/';

export const MealShell = () => {
  useMealFont();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const path = normalizePath(useLocation().pathname);
  // 입력·상세·수정은 화면에 집중하게 상단바·하단 탭을 숨긴다 — 화면이 자체 상단바(←)와 아래 동작 줄을 쓴다.
  const showTabs = MEAL_SECTION_PATHS.has(path);
  const tab = (item: (typeof TABS)[number]) => (
    <Link
      key={item.to}
      to={item.to}
      className="meal-tab"
      aria-current={item.match.includes(path) ? 'page' : undefined}
    >
      <item.icon className="size-5" aria-hidden />
      {item.label}
    </Link>
  );

  return (
    <>
      <aside className="meal-side hidden md:flex" aria-label="식단 메뉴">
        <Link to={MEAL_PATH.home} className="meal-brand" aria-label="식단 홈">
          식단
        </Link>
        <div className="px-2.5 py-4 xl:px-5">
          <MealLink
            to={MEAL_PATH.new}
            className="meal-btn w-full"
            aria-label="기록하기"
            title="기록하기"
          >
            <Plus className="size-5" aria-hidden />
            <span className="hidden xl:inline">기록하기</span>
          </MealLink>
        </div>
        <nav aria-label="식단" className="flex flex-col">
          {SIDE_NAV.map((item) => {
            const inner = (
              <>
                <item.icon className="size-5 shrink-0" aria-hidden />
                <span className="hidden xl:inline">{item.label}</span>
              </>
            );
            // 메뉴 항목이 없는 구역(건강식단 목록·이야기·레시피)에서는 그 구역이 딸린 항목(홈)을 켠다.
            return item.also?.some((p) => path === p || path.startsWith(`${p}/`)) ? (
              <Link key={item.to} to={item.to} className="meal-nav-item" title={item.label} aria-current="page">
                {inner}
              </Link>
            ) : (
              <NavLink key={item.to} to={item.to} end={item.end} className="meal-nav-item" title={item.label}>
                {inner}
              </NavLink>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col pb-3">
          <NavLink to={MEAL_PATH.settings} className="meal-nav-item" title="설정">
            <Settings2 className="size-5 shrink-0" aria-hidden />
            <span className="hidden xl:inline">설정</span>
          </NavLink>
          <Link to="/" className="meal-nav-item" title="Life Pickr로">
            <ArrowLeft className="size-5 shrink-0" aria-hidden />
            <span className="hidden xl:inline">Life Pickr로</span>
          </Link>
          <div className="flex justify-center px-3 pt-3 xl:justify-start xl:px-4">
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {showTabs ? (
        <header className="meal-topbar md:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="전체 메뉴 열기"
            className="grid size-11 place-items-center"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <Link to={MEAL_PATH.home} className="meal-topbar-brand">
            식단
          </Link>
          <div className="ml-auto flex items-center [&_button]:text-inherit">
            <ThemeToggle />
            <Link
              to={MEAL_PATH.settings}
              aria-label="식단 설정"
              className="grid size-11 place-items-center"
            >
              <Settings2 className="size-5" aria-hidden />
            </Link>
          </div>
        </header>
      ) : null}
      <PublicSidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <main className={cn('md:ml-[4.5rem] xl:ml-60', showTabs ? 'pb-28 md:pb-12' : 'pb-12')}>
        <div className="max-w-[1240px] px-4 pt-5 sm:px-6 md:px-8 md:pt-8 xl:px-10 xl:pt-10">
          <Suspense fallback={<MealLoading />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      {showTabs ? (
        <nav className="meal-tabbar md:hidden" aria-label="식단">
          {TABS.slice(0, 2).map(tab)}
          <MealLink to={MEAL_PATH.new} className="meal-tab-add" aria-label="기록하기">
            <Plus className="size-6" aria-hidden />
          </MealLink>
          {TABS.slice(2).map(tab)}
        </nav>
      ) : null}
    </>
  );
};

export const MealLoading = () => (
  <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
    <Loader2 className="size-4 animate-spin" aria-hidden /> 불러오는 중…
  </div>
);
