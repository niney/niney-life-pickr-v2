import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { useCreateFoodItem, useUpdateFoodItem } from '@repo/shared';
import { server } from '~/test/msw';

// 음식 카탈로그 편집 뒤 무효화 범위(@repo/shared useFood) — 항목을 만들거나 고치면 목록·통계만 다시 받는다.
// 예전엔 ['food','admin'] 을 통째로 무효화해, 항목과 무관한 메뉴 어휘와 인식 품질 집계(식단 기록만 읽는 무거운
// 조회)까지 편집할 때마다 다시 불렀다. 병합 검토 목록은 음식 이름을 조인해 보여 주므로 수정 때만 함께 무효화한다.
// (shared 는 node 환경이라 훅 렌더가 필요한 이 테스트는 소비처인 web 에 둔다.)

const ITEMS_URL = '/api/v1/admin/food/items';

const KEYS = {
  list: ['food', 'admin', 'list', {}],
  stats: ['food', 'stats'],
  conflicts: ['food', 'admin', 'merge-conflicts', {}],
  lexicon: ['food', 'admin', 'menu-lexicon', null],
  quality: ['food', 'admin', 'recognition-quality', {}],
} as const;

const setup = () => {
  const client = new QueryClient();
  // 어드민 화면이 받아 둔 조회들 — 구독자가 없어 무효화돼도 다시 받지 않고 표시만 남는다.
  for (const key of Object.values(KEYS)) client.setQueryData(key, {});
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const invalidated = () =>
    Object.fromEntries(
      Object.entries(KEYS).map(([name, key]) => [name, client.getQueryState(key)?.isInvalidated ?? false]),
    );
  return { wrapper, invalidated };
};

describe('useFood — 카탈로그 편집 뒤 무효화 범위', () => {
  it('등록하면 목록·통계만 무효화한다', async () => {
    server.use(http.post(ITEMS_URL, () => HttpResponse.json({ id: 'f1', name: '새 음식' }, { status: 201 })));
    const { wrapper, invalidated } = setup();
    const { result } = renderHook(() => useCreateFoodItem(), { wrapper });
    await act(() => result.current.mutateAsync({ name: '새 음식' }));
    expect(invalidated()).toEqual({ list: true, stats: true, conflicts: false, lexicon: false, quality: false });
  });

  it('수정하면 목록·통계에 더해 병합 검토 목록(이름 조인)까지 무효화한다', async () => {
    server.use(http.patch(`${ITEMS_URL}/f1`, () => HttpResponse.json({ id: 'f1', name: '고친 이름' })));
    const { wrapper, invalidated } = setup();
    const { result } = renderHook(() => useUpdateFoodItem(), { wrapper });
    await act(() => result.current.mutateAsync({ id: 'f1', input: { name: '고친 이름' } }));
    expect(invalidated()).toEqual({ list: true, stats: true, conflicts: true, lexicon: false, quality: false });
  });
});
