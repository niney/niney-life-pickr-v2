import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { delay, http, HttpResponse } from 'msw';
import { useAuthStore } from '@repo/shared';
import { server } from '~/test/msw';
import { ContactsPage } from './ContactsPage';
import { settlementContact } from './testFixtures';

// /me/contacts — 단골 관리. 검색은 서버 부분일치(q)인데, 입력값을 그대로 쿼리 키에
// 넣으면 한글 조합 단계마다 요청이 나가고 그때마다 목록이 스피너로 바뀌었다 돌아온다.
// 디바운스로 요청을 한 번으로 줄이고, 기다리는 동안엔 직전 목록을 그대로 둔다.

const CONTACTS_URL = '/api/v1/me/contacts';

const ALL = [
  settlementContact({ id: 'c1', name: '홍길동' }),
  settlementContact({ id: 'c2', name: '김철수' }),
];

// q 부분일치로 걸러 돌려주고, 받은 q 를 순서대로 기록한다.
const useContactsHandler = () => {
  const queries: Array<string | null> = [];
  server.use(
    http.get(CONTACTS_URL, async ({ request }) => {
      const q = new URL(request.url).searchParams.get('q');
      queries.push(q);
      await delay(20);
      const items = q ? ALL.filter((c) => (c.name ?? '').includes(q)) : ALL;
      return HttpResponse.json({ items, total: items.length });
    }),
  );
  return queries;
};

const renderPage = () => {
  // gcTime 을 0 으로 두지 않는다 — 검색어를 비웠을 때 전체 목록이 캐시에서 바로
  // 나오는지를 본다(앱 기본은 5분).
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ContactsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const searchBox = () => screen.getByPlaceholderText('이름·닉네임으로 검색');
const type = (value: string) => fireEvent.change(searchBox(), { target: { value } });

describe('ContactsPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'test-token', user: null, isGuest: false });
  });

  it('검색어는 입력이 멈춘 뒤 한 번만 조회하고, 그동안 직전 목록을 그대로 둔다', async () => {
    const queries = useContactsHandler();
    renderPage();

    expect(await screen.findByText('홍길동')).toBeInTheDocument();
    expect(screen.getByText('김철수')).toBeInTheDocument();

    // 한글 조합처럼 연달아 들어오는 입력.
    type('홍');
    type('홍길');
    type('홍길동');

    // 기다리는 동안 목록이 스피너로 바뀌지 않는다.
    expect(screen.queryByText(/불러오는 중/)).not.toBeInTheDocument();
    expect(screen.getByText('김철수')).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByText('김철수')).not.toBeInTheDocument());
    expect(screen.getByText('홍길동')).toBeInTheDocument();
    // 중간 단계('홍', '홍길')는 서버에 가지 않는다.
    expect(queries).toEqual([null, '홍길동']);
  });

  it('검색어를 지우면 기다리지 않고 전체 목록으로 돌아간다', async () => {
    useContactsHandler();
    renderPage();
    await screen.findByText('김철수');

    type('홍길동');
    await waitFor(() => expect(screen.queryByText('김철수')).not.toBeInTheDocument());

    type('');
    // 디바운스를 거치지 않고 캐시에 있던 전체 목록이 바로 보인다.
    expect(screen.getByText('김철수')).toBeInTheDocument();
  });

  it('지웠다가 곧바로 다른 글자를 쳐도 지우기 전 검색어가 되살아나지 않는다', async () => {
    const queries = useContactsHandler();
    renderPage();
    await screen.findByText('김철수');

    type('홍길동');
    await waitFor(() => expect(screen.queryByText('김철수')).not.toBeInTheDocument());

    type('');
    // 비운 것이 디바운스 값에도 반영될 틈(지연 0)만 준 뒤 바로 다음 글자.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    type('김');

    // 새 검색어의 답이 올 때까지 전체 목록이 그대로 보인다('홍길동' 결과로 돌아가지 않음).
    expect(screen.getByText('홍길동')).toBeInTheDocument();
    expect(screen.getByText('김철수')).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByText('홍길동')).not.toBeInTheDocument());
    expect(screen.getByText('김철수')).toBeInTheDocument();
    expect(queries.filter((q) => q === '홍길동')).toHaveLength(1);
    expect(queries.at(-1)).toBe('김');
  });

  it('일치하는 단골이 없으면 답이 온 뒤에 그 검색어로 안내한다', async () => {
    const queries = useContactsHandler();
    renderPage();
    await screen.findByText('홍길동');

    type('없는이름');

    expect(await screen.findByText("'없는이름' 에 일치하는 단골이 없습니다.")).toBeInTheDocument();
    expect(queries).toEqual([null, '없는이름']);
  });
});
