import { useState } from 'react';
import type { MealPlaceMenuType } from '@repo/api-contract';
import { mealMenuFoods, type MealMenuPicks } from '@repo/shared';

// 고르는 묶음이 있는 메뉴 — 코스의 "식사: 짜장면 / 짬뽕"처럼 그중 하나만 먹는 것을 넣기 전에 고르게 한다.
// 미리 골라 두지 않는다(틀린 기본값이 그대로 기록된다) — 묶음마다 하나를 고르거나 '안 먹었어요'를 눌러야 [넣기]가 켜진다.
// 정해진 구성은 위에 한 줄로 보여 주고, 고르는 대로 합계 열량이 정해진다.

const fmt = (n: number): string => Math.round(n).toLocaleString('ko-KR');

// 붙을 때 한 번 — 화면(스크롤 칸)에 맞추는 일이라 ref 로 한다. 모듈 수준 함수라 다시 그려도 다시 불리지 않는다.
const reveal = (el: HTMLDivElement | null): void => {
  el?.scrollIntoView?.({ block: 'nearest' });
};

export const MealPlaceMenuChooser = ({
  menu,
  onAdd,
  onCancel,
}: {
  menu: MealPlaceMenuType;
  onAdd: (picks: MealMenuPicks) => void;
  onCancel: () => void;
}) => {
  const groups = menu.choices ?? [];
  // undefined = 아직 안 고름, null = 안 먹었어요.
  const [picks, setPicks] = useState<(number | null | undefined)[]>(() => groups.map(() => undefined));
  const decided = picks.every((pick) => pick !== undefined);
  const chosen = picks.map((pick) => pick ?? null);
  const foods = mealMenuFoods(menu, chosen);
  const kcal = foods.reduce((sum, food) => sum + (food.kcal ?? 0), 0);
  const unknown = foods.filter((food) => food.kcal === null).length;
  const small = menu.foods.some((food) => food.portion === 'small');
  const pick = (group: number, value: number | null) =>
    setPicks((before) => before.map((p, i) => (i === group ? value : p)));

  return (
    // 메뉴 목록은 높이가 정해진 스크롤 칸이라 아래쪽 줄에서 열면 [넣기]가 가린다 — 열릴 때 보이는 자리로 옮긴다.
    <div className="meal-menu-chooser" ref={reveal}>
      {menu.foods.length > 0 ? (
        <p className="meal-menu-chooser-fixed">
          <span className="font-bold">함께 나오는 음식</span> {menu.foods.map((food) => food.name).join(' · ')}
          {small ? ' — 조금씩 먹은 것으로 넣어요' : ''}
        </p>
      ) : null}
      {groups.map((group, gi) => {
        const title = group.label ? `${group.label} 고르기` : '하나 고르기';
        return (
          <div key={gi} role="group" aria-label={title} className="space-y-1.5">
            <p className="meal-field-label">{title}</p>
            <div className="flex flex-wrap gap-1.5">
              {group.options.map((option, oi) => (
                <button
                  key={option.name}
                  type="button"
                  className="meal-opt"
                  aria-pressed={picks[gi] === oi}
                  onClick={() => pick(gi, oi)}
                >
                  {option.name}
                  {option.kcal !== null ? <span className="meal-opt-kcal">{fmt(option.kcal)}kcal</span> : null}
                </button>
              ))}
              <button
                type="button"
                className="meal-opt meal-opt-dashed"
                aria-pressed={picks[gi] === null}
                onClick={() => pick(gi, null)}
              >
                안 먹었어요
              </button>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="meal-btn-line"
          disabled={!decided || foods.length === 0}
          onClick={() => onAdd(chosen)}
        >
          넣기
        </button>
        <button type="button" className="meal-btn-quiet" onClick={onCancel}>
          취소
        </button>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {!decided
            ? '고르면 넣을 수 있어요.'
            : foods.length === 0
              ? '넣을 음식이 없어요.'
              : `${foods.length}가지 · ${unknown === foods.length ? '열량 모름' : `약 ${fmt(kcal)}kcal`}${
                  unknown > 0 && unknown < foods.length ? ` (${unknown}가지는 열량 모름)` : ''
                }`}
        </span>
      </div>
    </div>
  );
};
