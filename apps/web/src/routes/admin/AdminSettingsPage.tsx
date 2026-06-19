import { NavLink, Outlet } from 'react-router-dom';
import {
  KeyRound,
  Map as MapIcon,
  ScrollText,
  Send,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '~/lib/utils';

interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const TABS: Tab[] = [
  { to: '/admin/settings/ai-keys', label: 'AI 키', icon: KeyRound },
  { to: '/admin/settings/map', label: '지도', icon: MapIcon },
  { to: '/admin/settings/telegram', label: '텔레그램', icon: Send },
  { to: '/admin/settings/logs', label: '로그', icon: ScrollText },
];

export const AdminSettingsPage = () => (
  <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
    <header className="mb-6 flex items-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <SettingsIcon className="size-5" />
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">설정</h1>
        <p className="text-sm text-muted-foreground">
          외부 서비스 연동 키와 운영 옵션을 관리합니다.
        </p>
      </div>
    </header>

    <nav className="mb-6 flex gap-1 border-b">
      {TABS.map((t) => {
        const Icon = t.icon;
        return (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn(
                'inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            }
          >
            <Icon className="size-4" />
            {t.label}
          </NavLink>
        );
      })}
    </nav>

    <Outlet />
  </div>
);
