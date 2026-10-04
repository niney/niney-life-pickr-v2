import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { SettlementContactType } from '@repo/api-contract';
import { useAuthStore } from '@repo/shared';
import { server } from '~/test/msw';
import { ContactPickerDialog } from './ContactPickerDialog';
import { settlementContact } from './testFixtures';

// "단골에서 추가" 모달 — 여러 명을 골라 한 번에 넣는다. 검색어를 바꾸면 앞서 고른 사람이
// 목록에서 빠지는데, 그 사람도 "N명 선택됨" 에 세어진 그대로 추가돼야 한다.

const CONTACTS_URL = '/api/v1/me/contacts';

const ALL = [
  settlementContact({ id: 'c1', name: '홍길동' }),
  settlementContact({ id: 'c2', name: '김철수' }),
  settlementContact({ id: 'c3', name: '김영희' }),
];

const useContactsHandler = () => {
  server.use(
    http.get(CONTACTS_URL, ({ request }) => {
      const q = new URL(request.url).searchParams.get('q');
      const items = q ? ALL.filter((c) => (c.name ?? '').includes(q)) : ALL;
      return HttpResponse.json({ items, total: items.length });
    }),
  );
};

const renderDialog = (onConfirm: (picked: SettlementContactType[]) => void) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ContactPickerDialog
        open
        existingContactIds={new Set()}
        existingKeys={new Set()}
        onClose={() => {}}
        onConfirm={onConfirm}
      />
    </QueryClientProvider>,
  );
};

const type = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText('이름·닉네임 검색'), { target: { value } });
const row = (name: string) => screen.getByRole('checkbox', { name: new RegExp(name) });

describe('ContactPickerDialog', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'test-token', user: null, isGuest: false });
  });

  it('검색어를 바꿔 목록에서 빠진 선택도 함께 추가한다', async () => {
    useContactsHandler();
    const onConfirm = vi.fn();
    renderDialog(onConfirm);

    fireEvent.click(await screen.findByRole('checkbox', { name: /홍길동/ }));
    expect(screen.getByText('1명 선택됨')).toBeInTheDocument();

    // 검색으로 홍길동이 목록에서 빠진 뒤 한 명을 더 고른다.
    type('김');
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: /홍길동/ })).not.toBeInTheDocument());
    fireEvent.click(row('김영희'));
    expect(screen.getByText('2명 선택됨')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '추가' }));

    // 보이는 목록의 선택(김영희)이 먼저, 목록에서 빠진 선택(홍길동)이 뒤에.
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]![0].map((c: SettlementContactType) => c.id)).toEqual(['c3', 'c1']);
  });

  it('검색어를 안 바꿨으면 고른 순서가 아니라 목록 순서로 추가한다', async () => {
    useContactsHandler();
    const onConfirm = vi.fn();
    renderDialog(onConfirm);

    fireEvent.click(await screen.findByRole('checkbox', { name: /김영희/ }));
    fireEvent.click(row('홍길동'));
    // 다시 누르면 선택이 풀린다.
    fireEvent.click(row('김철수'));
    fireEvent.click(row('김철수'));
    expect(screen.getByText('2명 선택됨')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '추가' }));

    expect(onConfirm.mock.calls[0]![0].map((c: SettlementContactType) => c.id)).toEqual(['c1', 'c3']);
  });
});
