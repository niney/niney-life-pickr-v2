import { NavLink, Outlet } from 'react-router-dom';
import { Beaker, Home, Shield, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { cn } from '~/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/admin', label: '홈', icon: Home, end: true },
  { to: '/admin/restaurants', label: '맛집', icon: UtensilsCrossed },
  { to: '/admin/crawl-test', label: '크롤링 테스트', icon: Beaker },
];

export const AdminLayout = () => (
  <div className="flex min-h-screen bg-background text-foreground">
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center gap-2 border-b px-5 py-4">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Shield className="size-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-tight">관리자</span>
          <span className="text-xs text-muted-foreground leading-tight">Life Pickr</span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <Icon className="size-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t px-5 py-3">
        <NavLink
          to="/"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← 일반 화면으로
        </NavLink>
      </div>
    </aside>

    <main className="flex-1 overflow-x-hidden">
      <Outlet />
    </main>
  </div>
);
