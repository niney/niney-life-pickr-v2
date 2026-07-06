import { NavLink } from 'react-router-dom';
import { cn } from '~/lib/utils';

// 대중교통 서브탭 — 버스/지하철 페이지 공용. 양 페이지 루트 최상단에 슬림 행으로
// 배치되는 순수 프레젠테이션. 활성 탭은 호출 페이지가 active 로 지정한다(라우팅
// 자체는 NavLink 가, 강조는 active prop 이 담당 — 각 페이지가 자기 탭을 안다).
interface Props {
  active: 'bus' | 'subway';
}

const TABS = [
  { key: 'bus', to: '/bus', label: '버스' },
  { key: 'subway', to: '/subway', label: '지하철' },
] as const;

export const TransitTabs = ({ active }: Props) => (
  <div className="flex h-10 shrink-0 items-stretch border-b">
    {TABS.map((t) => {
      const isActive = active === t.key;
      return (
        <NavLink
          key={t.key}
          to={t.to}
          className={cn(
            'relative inline-flex flex-1 items-center justify-center text-sm font-medium transition-colors sm:flex-none sm:px-8',
            isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
          {isActive && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}
        </NavLink>
      );
    })}
  </div>
);
