import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { MEAL_PATH } from './mealPaths';

// 식단 구역 화면의 머리 — 큰 제목 하나와(필요하면) 한 줄 설명·오른쪽 동작. 휴대폰에서는 하단 탭 하나가 두 화면을
// 묶으므로(기록 = 목록·달력, 분석 = 통계·영양) 제목 위에 둘 사이를 오가는 전환을 둔다. 데스크톱은 사이드 메뉴에 둘 다 있다.

export type MealSubNavGroup = 'records' | 'analysis';

const SUB_NAV: Record<MealSubNavGroup, ReadonlyArray<{ to: string; label: string }>> = {
  records: [
    { to: MEAL_PATH.records, label: '목록' },
    { to: MEAL_PATH.calendar, label: '달력' },
  ],
  analysis: [
    { to: MEAL_PATH.stats, label: '통계' },
    { to: MEAL_PATH.nutrition, label: '영양' },
  ],
};

export const MealPageHeader = ({
  title,
  description,
  actions,
  group,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  group?: MealSubNavGroup;
}) => (
  <header className="mb-6 md:mb-8">
    {group ? (
      <nav
        className="meal-subnav mb-4 md:hidden"
        aria-label={group === 'records' ? '기록 보기' : '분석 보기'}
      >
        {SUB_NAV[group].map((item) => (
          <NavLink key={item.to} to={item.to} end>
            {item.label}
          </NavLink>
        ))}
      </nav>
    ) : null}
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="meal-title">{title}</h1>
        {description ? <p className="mt-1.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions}
    </div>
  </header>
);
