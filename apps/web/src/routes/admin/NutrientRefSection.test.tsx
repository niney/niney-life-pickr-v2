import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { FoodAdminNutrientRefsResultType } from '@repo/api-contract';
import { server } from '~/test/msw';
import { NutrientRefSection } from './NutrientRefSection';

// 어드민 "영양 기준 음식" — 목록 표시, '없음으로'(PUT refFoodId null), '바꾸기'(후보 검색 → PUT id), '다시 묻기'(POST names).

const LIST_URL = '/api/v1/admin/food/nutrient-refs';
const LINK_URL = '/api/v1/admin/food/nutrient-refs/link';
const CANDIDATES_URL = '/api/v1/admin/food/nutrient-refs/candidates';

const list: FoodAdminNutrientRefsResultType = {
  items: [
    { name: '양념', nameNorm: '양념', method: 'none', refFoodId: null, refFoodName: null, confidence: 'high', reason: '조미료/양념은 제외', itemCount: 1, updatedAt: '2026-11-07T00:00:00.000Z' },
    { name: '우거지탕', nameNorm: '우거지탕', method: 'llm', refFoodId: 'f-haejang', refFoodName: '해장국', confidence: 'high', reason: '주재료 및 조리법 유사', itemCount: 3, updatedAt: '2026-11-07T00:00:00.000Z' },
  ],
  linked: 1,
  unlinked: 1,
};

const renderSection = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NutrientRefSection />
    </QueryClientProvider>,
  );

describe('NutrientRefSection', () => {
  it('목록·없음 고정·바꾸기·다시 묻기가 보내는 값', async () => {
    const puts: unknown[] = [];
    const links: unknown[] = [];
    server.use(
      http.get(LIST_URL, () => HttpResponse.json(list)),
      http.put(LIST_URL, async ({ request }) => {
        puts.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
      http.post(LINK_URL, async ({ request }) => {
        links.push(await request.json());
        return HttpResponse.json({ scheduled: 1 });
      }),
      http.get(CANDIDATES_URL, ({ request }) => {
        const q = new URL(request.url).searchParams.get('q');
        return HttpResponse.json({ items: q && q.includes('해장') ? [{ id: 'f-sunji', name: '선지해장국', dishType: 'soup' }] : [] });
      }),
    );
    renderSection();

    const row = (await screen.findByText('우거지탕')).closest('tr')!;
    expect(within(row).getByText('해장국')).toBeInTheDocument();
    expect(within(row).getByText('AI')).toBeInTheDocument();
    expect(screen.getByText(/연결 1개 · 없음 1개/)).toBeInTheDocument();
    expect(within(screen.getByText('양념').closest('tr')!).getByText('없음')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '양념 없음으로' }));
    await waitFor(() => expect(puts).toEqual([{ name: '양념', refFoodId: null }]));

    fireEvent.click(screen.getByRole('button', { name: '우거지탕 기준 바꾸기' }));
    fireEvent.change(screen.getByLabelText('우거지탕 기준 음식 검색'), { target: { value: '해장국' } });
    fireEvent.click(await screen.findByRole('button', { name: '선지해장국' }));
    await waitFor(() => expect(puts).toEqual([{ name: '양념', refFoodId: null }, { name: '우거지탕', refFoodId: 'f-sunji' }]));

    fireEvent.click(screen.getByRole('button', { name: '우거지탕 다시 묻기' }));
    await waitFor(() => expect(links).toEqual([{ names: ['우거지탕'] }]));
    expect(await screen.findByText(/1개 이름을 규칙·AI 로 다시 잇는 중/)).toBeInTheDocument();
  });
});
