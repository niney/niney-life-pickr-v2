import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { useAuthStore, useRestaurantFavoriteStore } from '@repo/shared';
import { server } from '~/test/msw';
import { voteSession } from '~/test/fixtures/vote';
import { VoteNewPage } from './VoteNewPage';

// 투표방 생성 페이지 — 방장(로그인) 전용이라 로그인 상태로 렌더한다(실제 앱에선
// RequireUser 가드 뒤). 로그인 상태의 마운트만으로 세 요청이 나간다:
//   ① GET /restaurants/public   — 검색 쿼리(q 없이도 mount 1회)
//   ② GET /restaurants/favorites — 서버 즐겨찾기(하이브리드 훅의 로그인 분기)
//   ③ GET /votes                — 내가 만든 투표(링크 복구 목록)
// onUnhandledRequest: 'error' 정책이라 세 개 모두 기본 핸들러로 깔아야 하고,
// 이 사실 자체가 "이 페이지가 마운트에 무엇을 부르는가" 의 회귀 감지가 된다.

const PUBLIC_LIST_URL = '/api/v1/restaurants/public';
const FAVORITES_URL = '/api/v1/restaurants/favorites';
const VOTES_URL = '/api/v1/votes';

const searchItem = (n: number) => ({
  placeId: `990000000${n}`,
  name: `검색식당${n}`,
  category: '한식',
  thumbnailUrl: null,
});

interface BaseHandlerOptions {
  // q 검색어 → 결과 목록. q 없는 mount 조회는 항상 빈 목록.
  searchResults?: Record<string, ReturnType<typeof searchItem>[]>;
  favorites?: Array<{ placeId: string; name: string; category: string | null }>;
  myVotes?: Array<{
    id: string;
    title: string;
    token: string;
    optionCount: number;
    closedAt: string | null;
    expiresAt: string;
    createdAt: string;
  }>;
}

const useBaseHandlers = ({ searchResults = {}, favorites = [], myVotes = [] }: BaseHandlerOptions) =>
  server.use(
    http.get(PUBLIC_LIST_URL, ({ request }) => {
      const q = new URL(request.url).searchParams.get('q');
      return HttpResponse.json({ items: (q && searchResults[q]) || [] });
    }),
    http.get(FAVORITES_URL, () => HttpResponse.json({ items: favorites })),
    http.get(VOTES_URL, () => HttpResponse.json({ items: myVotes })),
  );

// 생성 성공 시 navigate(`/vote/${token}`) 를 실제 라우팅으로 확인하기 위한 목적지.
const TokenProbe = () => {
  const { token } = useParams<{ token: string }>();
  return <div>vote-page:{token}</div>;
};

const renderNewPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/vote/new']}>
        <Routes>
          <Route path="/vote/new" element={<VoteNewPage />} />
          <Route path="/vote/:token" element={<TokenProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const createButton = () => screen.getByRole('button', { name: '투표방 만들기' });

// 검색으로 후보 n 을 추가한다 — 디바운스(300ms)는 실제 타이머로 흘려보내고
// findBy(기본 1s)로 흡수한다.
const searchAndAdd = async (q: string, name: string) => {
  fireEvent.change(screen.getByLabelText(/맛집 검색/), { target: { value: q } });
  const row = (await screen.findByText(name)).closest('li')!;
  fireEvent.click(within(row).getByRole('button', { name: /추가/ }));
};

describe('VoteNewPage', () => {
  beforeEach(() => {
    // 방장 전용 페이지 — 로그인 상태로 고정. 게스트 즐겨찾기 store 는 비워
    // 하이브리드 훅의 "로그인 직후 게스트 저장분 sync" 경로가 발화하지 않게 한다.
    useAuthStore.setState({ token: 'test-token', user: null, isGuest: false });
    useRestaurantFavoriteStore.setState({ items: [] });
  });

  it('초기 상태 — 후보 2곳 미만이면 만들기 버튼이 잠긴다', async () => {
    useBaseHandlers({});
    renderNewPage();

    expect(await screen.findByRole('heading', { name: '투표 만들기' })).toBeInTheDocument();
    expect(screen.getByText('2곳 이상 골라주세요')).toBeInTheDocument();
    expect(screen.getByText(/후보를 추가하세요/)).toBeInTheDocument();
    expect(createButton()).toBeDisabled();
    // PublicLayout 밖 단독 라우트 — 명시적 홈 복귀 경로가 있어야 한다.
    expect(screen.getByRole('link', { name: /홈으로/ })).toHaveAttribute('href', '/');
  });

  it('검색에서 후보를 추가하면 목록·카운트가 갱신되고 같은 식당은 다시 못 넣는다', async () => {
    useBaseHandlers({ searchResults: { 초밥: [searchItem(1), searchItem(2)] } });
    renderNewPage();

    await searchAndAdd('초밥', '검색식당1');

    expect(screen.getByText('후보 (1/8)')).toBeInTheDocument();
    // 같은 행의 추가 버튼은 "추가됨" 으로 잠긴다 — placeId 중복 방지.
    const addedRow = screen
      .getAllByText('검색식당1')
      .map((el) => el.closest('li')!)
      .find((li) => within(li).queryByRole('button', { name: '추가됨' }))!;
    expect(within(addedRow).getByRole('button', { name: '추가됨' })).toBeDisabled();

    // 제목이 있어도 후보 1곳뿐이면 여전히 잠김(min 2).
    fireEvent.change(screen.getByLabelText('투표 제목'), { target: { value: '회식' } });
    expect(createButton()).toBeDisabled();
  });

  it('후보 제거 — X 를 누르면 목록에서 빠지고 카운트가 되돌아간다', async () => {
    useBaseHandlers({ searchResults: { 초밥: [searchItem(1)] } });
    renderNewPage();

    await searchAndAdd('초밥', '검색식당1');
    expect(screen.getByText('후보 (1/8)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '검색식당1 후보에서 제거' }));

    expect(screen.getByText('후보 (0/8)')).toBeInTheDocument();
    expect(screen.getByText(/후보를 추가하세요/)).toBeInTheDocument();
  });

  it('제목 + 후보 2곳이면 생성 — POST body 의 순서가 보존되고 성공 시 투표방으로 이동한다', async () => {
    let submitted: unknown = null;
    useBaseHandlers({ searchResults: { 초밥: [searchItem(1), searchItem(2)] } });
    server.use(
      http.post(VOTES_URL, async ({ request }) => {
        submitted = await request.json();
        return HttpResponse.json({ ...voteSession({ isOwner: true }), token: 'newtok9' });
      }),
    );
    renderNewPage();

    await searchAndAdd('초밥', '검색식당1');
    await searchAndAdd('초밥', '검색식당2');
    fireEvent.change(screen.getByLabelText('투표 제목'), { target: { value: '  오늘 회식  ' } });
    fireEvent.click(createButton());

    await waitFor(() =>
      expect(submitted).toEqual({
        // 제목은 trim 해서 보낸다.
        title: '오늘 회식',
        options: [
          { placeId: '9900000001', name: '검색식당1', category: '한식', thumbnailUrl: null },
          { placeId: '9900000002', name: '검색식당2', category: '한식', thumbnailUrl: null },
        ],
      }),
    );
    // 응답 token 으로 /vote/:token 라우팅 — 링크 공유 화면으로 즉시 이동.
    expect(await screen.findByText('vote-page:newtok9')).toBeInTheDocument();
  });

  it('생성 실패 — 에러 안내가 뜨고 페이지에 머문다', async () => {
    useBaseHandlers({ searchResults: { 초밥: [searchItem(1), searchItem(2)] } });
    server.use(
      http.post(VOTES_URL, () =>
        HttpResponse.json(
          { statusCode: 500, error: 'Internal Server Error', message: '실패' },
          { status: 500 },
        ),
      ),
    );
    renderNewPage();

    await searchAndAdd('초밥', '검색식당1');
    await searchAndAdd('초밥', '검색식당2');
    fireEvent.change(screen.getByLabelText('투표 제목'), { target: { value: '회식' } });
    fireEvent.click(createButton());

    expect(await screen.findByText('생성에 실패했어요. 다시 시도해 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '투표 만들기' })).toBeInTheDocument();
  });

  it('서버 즐겨찾기가 있으면 검색 없이 바로 후보로 추가할 수 있다', async () => {
    useBaseHandlers({
      favorites: [{ placeId: '9900000009', name: '단골집', category: '중식' }],
    });
    renderNewPage();

    expect(await screen.findByText('⭐ 내 즐겨찾기에서 추가')).toBeInTheDocument();
    const row = screen.getByText('단골집').closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: /추가/ }));

    expect(screen.getByText('후보 (1/8)')).toBeInTheDocument();
  });

  it('내가 만든 투표 — 진행 중/마감됨/만료됨 상태와 링크가 함께 나온다', async () => {
    const base = { optionCount: 3, createdAt: '2026-08-16T02:00:00.000Z' };
    useBaseHandlers({
      myVotes: [
        // 미래 만료 + 미마감 = 진행 중.
        { id: 'v1', title: '진행중 투표', token: 'tok-live', closedAt: null, expiresAt: '2999-01-01T00:00:00.000Z', ...base },
        // closedAt 이 있으면 만료 여부보다 우선해 "마감됨".
        { id: 'v2', title: '마감된 투표', token: 'tok-done', closedAt: '2026-08-16T03:00:00.000Z', expiresAt: '2999-01-01T00:00:00.000Z', ...base },
        { id: 'v3', title: '만료된 투표', token: 'tok-old', closedAt: null, expiresAt: '2020-01-01T00:00:00.000Z', ...base },
      ],
    });
    renderNewPage();

    expect(await screen.findByRole('heading', { name: '내가 만든 투표' })).toBeInTheDocument();

    const rowOf = (title: string) => screen.getByText(title).closest('a')!;
    expect(rowOf('진행중 투표')).toHaveTextContent('진행 중');
    expect(rowOf('진행중 투표')).toHaveAttribute('href', '/vote/tok-live');
    expect(rowOf('마감된 투표')).toHaveTextContent('마감됨');
    expect(rowOf('만료된 투표')).toHaveTextContent('만료됨');
  });
});
