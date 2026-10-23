import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { FoodAdminMealNutritionGapsResultType } from '@repo/api-contract';
import { server } from '~/test/msw';
import { MealNutritionGapSection } from './MealNutritionGapSection';

// 어드민 "열량 빈 식단 이름" — 빈 이름·추정 이름 표시와 "다시 찾기"(전체 빈 이름 / 한 이름)가 보내는 이름.

const GAPS_URL = '/api/v1/admin/food/meal-nutrition-gaps';
const ESTIMATE_URL = '/api/v1/admin/food/meal-nutrition-gaps/estimate';

const gaps: FoodAdminMealNutritionGapsResultType = {
  items: [
    { name: '정체불명찌개', itemCount: 3, userCount: 2, lastEatenDate: '2026-10-22', state: 'missing', nutritionFrom: null },
    { name: '모르는볶음', itemCount: 1, userCount: 1, lastEatenDate: '2026-10-20', state: 'missing', nutritionFrom: null },
    {
      name: '우거지탕',
      itemCount: 2,
      userCount: 1,
      lastEatenDate: '2026-10-21',
      state: 'estimated',
      nutritionFrom: '우거지탕(fatsecret.kr 1건) · 국·탕 통상 1인분 500g',
    },
  ],
  missingNames: 2,
  estimatedNames: 1,
};

const renderSection = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MealNutritionGapSection />
    </QueryClientProvider>,
  );

describe('MealNutritionGapSection', () => {
  it('빈 이름과 추정 이름을 보여 주고, 다시 찾기는 빈 이름 전체 또는 한 이름을 보낸 뒤 목록을 다시 읽는다', async () => {
    let listCalls = 0;
    const sent: string[][] = [];
    server.use(
      http.get(GAPS_URL, () => {
        listCalls += 1;
        return HttpResponse.json(gaps);
      }),
      http.post(ESTIMATE_URL, async ({ request }) => {
        sent.push(((await request.json()) as { names: string[] }).names);
        return HttpResponse.json({ filled: 1, scheduled: 2 });
      }),
    );
    renderSection();

    const row = (await screen.findByText('정체불명찌개')).closest('tr')!;
    expect(within(row).getByText('비어 있음')).toBeInTheDocument();
    expect(within(row).getByText('3')).toBeInTheDocument();
    expect(screen.getByText('우거지탕(fatsecret.kr 1건) · 국·탕 통상 1인분 500g 기준 추정')).toBeInTheDocument();
    expect(screen.getByText(/빈 이름 2개 · 추정 1개/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '빈 이름 다시 찾기' }));
    expect(await screen.findByText(/바로 채운 항목 1건 · 2개 이름은 AI·웹에 묻는 중/)).toBeInTheDocument();
    expect(sent[0]).toEqual(['정체불명찌개', '모르는볶음']);
    await waitFor(() => expect(listCalls).toBe(2));

    fireEvent.click(screen.getByRole('button', { name: '우거지탕 다시 찾기' }));
    await waitFor(() => expect(sent[1]).toEqual(['우거지탕']));
  });

  it('빈 이름이 없으면 전체 다시 찾기를 막고 비었다고 알린다', async () => {
    server.use(http.get(GAPS_URL, () => HttpResponse.json({ items: [], missingNames: 0, estimatedNames: 0 })));
    renderSection();
    expect(await screen.findByText('열량이 빈 식단 이름이 없습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '빈 이름 다시 찾기' })).toBeDisabled();
  });
});
