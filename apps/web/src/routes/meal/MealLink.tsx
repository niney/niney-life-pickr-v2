import { Link, useNavigate, type LinkProps } from 'react-router-dom';
import {
  runMealViewTransition,
  useMealLink,
  useMealPanelEnv,
  type MealLinkOptions,
} from './mealPanel';

// 상세·수정·새 기록으로 가는 링크 — 데스크톱은 패널로(배경 위치를 함께 싣는다), 좁은 화면은 밀려 들어오는 전환과 함께
// 화면을 바꾼다. 진짜 <a href> 라 새 탭으로 열기·주소 복사는 그대로 된다(그때는 한 화면으로 열린다).

type MealLinkProps = Omit<LinkProps, 'to' | 'state' | 'replace'> &
  MealLinkOptions & {
    to: string;
    /** 기록 줄이면 그 id — 패널이 닫힐 때 포커스를 돌려받고, 패널에 열려 있는 동안 표시된다. */
    entryId?: string;
  };

export const MealLink = ({ to, siblings, swap, entryId, onClick, ...rest }: MealLinkProps) => {
  const link = useMealLink();
  const env = useMealPanelEnv();
  const navigate = useNavigate();
  const target = link(to, { siblings, swap });
  return (
    <Link
      {...rest}
      data-meal-entry={entryId}
      aria-current={entryId !== undefined && env.openEntryId === entryId ? 'true' : undefined}
      to={target.to}
      state={target.state}
      replace={target.replace}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || env.panelsOn) return;
        // 새 탭·창으로 여는 누름은 브라우저에 맡긴다.
        if (event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)
          return;
        event.preventDefault();
        runMealViewTransition('forward', () =>
          navigate(target.to, { state: target.state, replace: target.replace }),
        );
      }}
    />
  );
};
