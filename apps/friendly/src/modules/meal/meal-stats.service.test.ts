import { describe, expect, it } from 'vitest';
import { MealItemSource, MealPortion, MealSlot, MealType } from '@repo/api-contract';
import { MEAL_ITEM_SOURCES, MEAL_PORTIONS, MEAL_SLOTS, MEAL_TYPES, guessMealSlotFromHour } from '@repo/utils';
import { computeMealStats, type StatEntryRow } from './meal-stats.service.js';

// 통계는 순수 함수 — DB 없이 검증한다.

const item = (
  name: string,
  opts: Partial<{ dishType: string; mainIngredient: string; cuisine: string; isMain: boolean }> = {},
): StatEntryRow['items'][number] => ({
  name,
  nameNorm: name.replace(/\s+/g, ''),
  dishType: opts.dishType ?? null,
  mainIngredient: opts.mainIngredient ?? null,
  cuisine: opts.cuisine ?? null,
  isMain: opts.isMain ?? true,
});

describe('meal 계약 ↔ @repo/utils 키 목록 동기화', () => {
  it('slot/type/portion/itemSource 키와 순서가 같다', () => {
    expect(MealSlot.options).toEqual([...MEAL_SLOTS]);
    expect(MealType.options).toEqual([...MEAL_TYPES]);
    expect(MealPortion.options).toEqual([...MEAL_PORTIONS]);
    expect(MealItemSource.options).toEqual([...MEAL_ITEM_SOURCES]);
  });
  it('끼니 추정 경계', () => {
    expect(guessMealSlotFromHour(7)).toBe('breakfast');
    expect(guessMealSlotFromHour(12)).toBe('lunch');
    expect(guessMealSlotFromHour(15)).toBe('snack');
    expect(guessMealSlotFromHour(19)).toBe('dinner');
    expect(guessMealSlotFromHour(23)).toBe('late_night');
    expect(guessMealSlotFromHour(2)).toBe('late_night');
  });
});

describe('computeMealStats', () => {
  const rows: StatEntryRow[] = [
    {
      eatenDate: '2026-08-18',
      slot: 'lunch',
      mealType: 'dining_out',
      items: [
        item('김치찌개', { dishType: 'stew', mainIngredient: 'pork', cuisine: 'korean' }),
        item('공깃밥', { dishType: 'rice', mainIngredient: 'grain', cuisine: 'korean' }),
        item('김치', { dishType: 'kimchi', mainIngredient: 'vegetable', isMain: false }),
      ],
    },
    {
      eatenDate: '2026-08-19',
      slot: 'dinner',
      mealType: 'home',
      items: [item('된장찌개', { dishType: 'stew', mainIngredient: 'tofu_bean', cuisine: 'korean' })],
    },
    {
      // 김치찌개 재등장 — 3일 간격이라 겹침으로 잡힌다.
      eatenDate: '2026-08-21',
      slot: 'lunch',
      mealType: 'dining_out',
      items: [item('김치찌개', { dishType: 'stew', mainIngredient: 'pork', cuisine: 'korean' })],
    },
    {
      eatenDate: '2026-08-22',
      slot: 'breakfast',
      mealType: null,
      items: [item('토스트', { dishType: 'bakery', mainIngredient: 'grain', cuisine: 'western' })],
    },
  ];

  const stats = computeMealStats(rows, '2026-08-16', '2026-08-22', '2026-08-22');

  it('기간·건수·기록일', () => {
    expect(stats.entryCount).toBe(4);
    expect(stats.itemCount).toBe(6);
    expect(stats.recordedDays).toBe(4);
    expect(stats.totalDays).toBe(7);
    expect(stats.byDate).toHaveLength(7);
    expect(stats.byDate.find((d) => d.date === '2026-08-20')?.count).toBe(0);
  });

  it('분포는 주식만 — 반찬(김치)은 dishType 분포에서 빠진다', () => {
    expect(stats.byDishType.find((b) => b.key === 'kimchi')).toBeUndefined();
    expect(stats.byDishType[0]).toMatchObject({ key: 'stew', label: '찌개·전골', count: 3 });
    expect(stats.byMainIngredient.find((b) => b.key === 'pork')?.count).toBe(2);
    expect(stats.byCuisine.find((b) => b.key === 'korean')?.count).toBe(4);
    expect(stats.byMealType.find((b) => b.key === 'dining_out')?.count).toBe(2);
  });

  it('끼니 분포는 하루 순서대로 정렬', () => {
    expect(stats.bySlot.map((b) => b.key)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(stats.bySlot[1]).toMatchObject({ label: '점심', count: 2 });
  });

  it('많이 먹은 음식·겹침 비율·연속 일수', () => {
    expect(stats.topFoods[0]).toMatchObject({ name: '김치찌개', count: 2, lastEatenDate: '2026-08-21' });
    // 주식 등장 5회(김치찌개 2 + 공깃밥·된장찌개·토스트) 중 7일 내 재등장 1회.
    expect(stats.repeatRate).toBeCloseTo(0.2, 3);
    // 8/22·8/21 연속, 8/20 은 비어 있다.
    expect(stats.streakDays).toBe(2);
  });

  it('오늘 기록이 없으면 어제까지의 연속을 센다', () => {
    const s = computeMealStats(rows, '2026-08-16', '2026-08-23', '2026-08-23');
    expect(s.streakDays).toBe(2);
  });

  it('빈 기간', () => {
    const s = computeMealStats([], '2026-08-01', '2026-08-03', '2026-08-03');
    expect(s).toMatchObject({ entryCount: 0, itemCount: 0, recordedDays: 0, totalDays: 3, repeatRate: 0, streakDays: 0 });
    expect(s.byDate.every((d) => d.count === 0)).toBe(true);
  });

  it('분류가 비어 있으면 미분류 버킷', () => {
    const s = computeMealStats(
      [{ eatenDate: '2026-08-22', slot: 'lunch', mealType: null, items: [item('알 수 없음')] }],
      '2026-08-22',
      '2026-08-22',
      '2026-08-22',
    );
    expect(s.byDishType[0]).toMatchObject({ key: 'unknown', label: '미분류', count: 1 });
  });

  it('주식 영양 커버리지가 낮으면 불완전한 하루 평균을 숨기고 근거 비율만 낸다', () => {
    const r = computeMealStats(
      [
        {
          eatenDate: '2026-08-20',
          slot: 'lunch',
          mealType: null,
          items: [
            { name: '라면', nameNorm: '라면', dishType: null, mainIngredient: null, cuisine: null, isMain: true, kcal: 528, proteinG: 12, sodiumMg: 1800 },
            { name: '양념치킨', nameNorm: '양념치킨', dishType: null, mainIngredient: null, cuisine: null, isMain: true, kcal: null, proteinG: null, sodiumMg: null },
          ],
        },
      ],
      '2026-08-20',
      '2026-08-21',
      '2026-08-21',
    );
    expect(r.nutrition.avgKcalPerDay).toBeNull();
    expect(r.nutrition.avgProteinGPerDay).toBeNull();
    expect(r.nutrition.itemsWithNutrition).toBe(1);
    expect(r.nutrition.coverage).toBe(0.5);
    expect(r.nutrition.mainItemCoverage).toBe(0.5);
    expect(r.nutrition.directCoverage).toBe(0.5);
    expect(r.nutrition.estimatedCoverage).toBe(0);
    expect(r.nutrition.averageReliable).toBe(false);
  });

  it('영양 값이 하나도 없으면 평균은 null 이다 — 0 으로 보이면 안 굶은 걸 굶었다고 말하게 된다', () => {
    const r = computeMealStats(
      [
        {
          eatenDate: '2026-08-20',
          slot: 'lunch',
          mealType: null,
          items: [{ name: '양념치킨', nameNorm: '양념치킨', dishType: null, mainIngredient: null, cuisine: null, isMain: true, kcal: null }],
        },
      ],
      '2026-08-20',
      '2026-08-21',
      '2026-08-21',
    );
    expect(r.nutrition.avgKcalPerDay).toBeNull();
    expect(r.nutrition.coverage).toBe(0);
  });

  it('추천 선택·실제 기록·평가와 수락률을 집계한다', () => {
    const r = computeMealStats([], '2026-08-20', '2026-08-21', '2026-08-21', [
      { feedbackJson: JSON.stringify({ pickedName: '김치찌개', eatenEntryId: 'e1', rating: 1 }), events: [{ kind: 'shown' }, { kind: 'candidate_rated' }] },
      { feedbackJson: JSON.stringify({ pickedName: '비빔밥', eatenEntryId: null, rating: null }), events: [{ kind: 'shown' }, { kind: 'dismissed' }] },
      { feedbackJson: JSON.stringify({ pickedName: null, eatenEntryId: null, rating: -1 }), events: [{ kind: 'shown' }] },
      { feedbackJson: '{bad json' },
    ]);
    expect(r.recommendation).toEqual({
      chosenCount: 2,
      loggedCount: 1,
      ratedCount: 2,
      acceptanceRate: 0.5,
      shownCount: 3,
      dismissedCount: 1,
      candidateRatedCount: 1,
      pickRate: 0.667,
      loggedFromShownRate: 0.333,
    });
  });
});
