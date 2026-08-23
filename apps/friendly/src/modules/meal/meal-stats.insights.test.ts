import { describe, expect, it } from 'vitest';
import { computeWeeklyMealInsights, type InsightEntryRow } from './meal-stats.insights.js';

const row = (
  eatenDate: string,
  name = '비빔밥',
  dishType: string | null = 'rice',
  mainIngredient: string | null = 'grain',
): InsightEntryRow => ({
  eatenDate,
  items: [{ name, nameNorm: name.replace(/\s+/g, ''), dishType, mainIngredient, isMain: true }],
});

describe('computeWeeklyMealInsights', () => {
  it('0건과 표본 부족은 시작 안내 1개만 반환한다', () => {
    const empty = computeWeeklyMealInsights([], '2026-08-09', '2026-08-22');
    expect(empty).toEqual([
      expect.objectContaining({
        key: 'getting-started',
        tone: 'info',
        title: '첫 식단 기록부터 시작해요',
      }),
    ]);

    const sparse = computeWeeklyMealInsights([row('2026-08-20')], '2026-08-09', '2026-08-22');
    expect(sparse).toHaveLength(1);
    expect(sparse[0]).toMatchObject({
      key: 'getting-started',
      title: '주간 흐름을 조금 더 모아볼까요',
    });
  });

  it('직전 7일보다 기록 빈도가 늘거나 줄어든 변화를 구분한다', () => {
    const improved = computeWeeklyMealInsights(
      [
        row('2026-08-10'),
        row('2026-08-17', '김치찌개', 'stew', 'pork'),
        row('2026-08-18', '비빔밥'),
        row('2026-08-20', '파스타', 'noodle', 'grain'),
        row('2026-08-22', '연어구이', 'grilled', 'fish'),
      ],
      '2026-08-09',
      '2026-08-22',
    );
    expect(improved.find((insight) => insight.key === 'weekly-activity')).toMatchObject({
      tone: 'positive',
      title: '최근 기록 빈도가 늘었어요',
    });

    const decreased = computeWeeklyMealInsights(
      [
        row('2026-08-09'),
        row('2026-08-10', '김치찌개'),
        row('2026-08-12', '불고기'),
        row('2026-08-14', '파스타'),
        row('2026-08-20', '비빔밥'),
      ],
      '2026-08-09',
      '2026-08-22',
    );
    expect(decreased.find((insight) => insight.key === 'weekly-activity')).toMatchObject({
      tone: 'attention',
      title: '최근 기록 빈도가 줄었어요',
    });
  });

  it('7일 내 반복률이 높으면 다른 메뉴를 제안한다', () => {
    const insights = computeWeeklyMealInsights(
      [
        row('2026-08-16', '김치찌개', 'stew', 'pork'),
        row('2026-08-17', '김치찌개', 'stew', 'pork'),
        row('2026-08-19', '김치찌개', 'stew', 'pork'),
        row('2026-08-21', '비빔밥', 'rice', 'vegetable'),
      ],
      '2026-08-09',
      '2026-08-22',
    );
    const repeat = insights.find((insight) => insight.key === 'weekly-repeat');
    expect(repeat).toMatchObject({ tone: 'attention', title: '최근 메뉴가 자주 겹쳤어요' });
    expect(repeat?.detail).toContain('다음 끼니에는 다른 메뉴');
  });

  it('조리 형태 또는 주재료가 65% 이상 치우치면 한 축만 알린다', () => {
    const insights = computeWeeklyMealInsights(
      [
        row('2026-08-16', '김치찌개', 'stew', 'pork'),
        row('2026-08-17', '된장찌개', 'stew', 'tofu_bean'),
        row('2026-08-19', '부대찌개', 'stew', 'processed_meat'),
        row('2026-08-21', '순두부찌개', 'stew', 'tofu_bean'),
      ],
      '2026-08-09',
      '2026-08-22',
    );
    const balance = insights.find((insight) => insight.key === 'weekly-balance');
    expect(balance).toMatchObject({ tone: 'attention', title: '조리 형태 선택이 한쪽에 모였어요' });
    expect(balance?.detail).toContain('찌개·전골');
  });

  it('추천 선택이 실제 기록으로 이어진 결과를 최근 7일 기준으로 보여 준다', () => {
    const insights = computeWeeklyMealInsights(
      [row('2026-08-16'), row('2026-08-18', '파스타'), row('2026-08-20', '연어구이')],
      '2026-08-09',
      '2026-08-22',
      [
        {
          targetDate: '2026-08-18',
          feedbackJson: JSON.stringify({ pickedName: '파스타', eatenEntryId: 'e1', rating: 1 }),
        },
        {
          targetDate: '2026-08-20',
          feedbackJson: JSON.stringify({
            pickedName: '연어구이',
            eatenEntryId: null,
            rating: null,
          }),
        },
        {
          targetDate: '2026-08-10',
          feedbackJson: JSON.stringify({ pickedName: '비빔밥', eatenEntryId: null, rating: null }),
        },
      ],
    );
    expect(
      insights.find((insight) => insight.key === 'recommendation-follow-through'),
    ).toMatchObject({
      tone: 'positive',
      title: '고른 추천이 기록으로 이어졌어요',
    });
    expect(insights).toHaveLength(2);
  });
});
