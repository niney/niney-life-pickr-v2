import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type {
  SaveTablingShopResultType,
  TablingSearchResponseType,
  TablingSearchResultType,
} from '@repo/api-contract';
import { useActiveTablingBulkSaveJobStore } from '@repo/shared';
import { server } from '~/test/msw';
import { AdminTablingPage } from './AdminTablingPage';

// 테이블링 정식 페이지 — 결과 카드를 memo 로 바꾸고 저장 콜백을 안정 참조로 넘긴 뒤에도 동작이
// 그대로인지 본다:
//  ① 한 가게를 저장하는 동안 다른 카드의 저장은 잠기고, 끝나면 결과가 그 카드에 남는다
//  ② "더 보기"로 결과가 쌓여 등록 조회 키가 바뀌어도, 이미 받은 '등록됨' 배지는 새 응답을
//     기다리는 동안 사라지지 않는다(직전 결과를 placeholder 로 유지)

const shop = (idx: number, name: string): TablingSearchResultType => ({
  idx,
  name,
  category: '일식',
  summaryAddress: '도곡동',
  rating: 4.5,
  reviewCount: 10,
  lat: 37.5,
  lng: 127.0,
  thumbnailUrl: null,
  excerpt: null,
  isNew: false,
  waitingCount: null,
  flags: {
    useWaiting: false,
    useRemoteWaiting: false,
    useReservation: false,
    useTakeOut: false,
    useOnSiteOrder: false,
  },
  recommendedMenus: [],
  distance: null,
  rawSourceUrl: `https://www.tabling.co.kr/restaurant/${idx}`,
});

const page = (cursor: string | null): TablingSearchResponseType =>
  cursor === null
    ? {
        items: [shop(1, '첫째 스시'), shop(2, '둘째 스시')],
        total: 3,
        nextCursor: 'c1',
        source: 'http',
        elapsedMs: 5,
      }
    : { items: [shop(3, '셋째 스시')], total: 3, nextCursor: null, source: 'http', elapsedMs: 5 };

const saveResult = (idx: number): SaveTablingShopResultType => ({
  idx,
  restaurantId: `R${idx}`,
  fetchedPages: 1,
  totalReviewsReported: 7,
  newReviewCount: 7,
  queuedForAnalysis: 7,
  autoMatched: true,
  matchedCanonicalId: 'C1',
  elapsedMs: 10,
});

// 서버에 등록돼 있다고 답할 idx, 요청 기록, 응답을 붙잡는 문(gate).
const state = {
  registered: new Set<number>(),
  saved: [] as number[],
  registeredQueries: [] as string[],
  saveGate: null as Promise<void> | null,
  registeredGate: null as Promise<void> | null,
};

const useHandlers = () => {
  state.registered = new Set();
  state.saved = [];
  state.registeredQueries = [];
  state.saveGate = null;
  state.registeredGate = null;
  server.use(
    http.get('/api/v1/admin/crawl/tabling/search', ({ request }) =>
      HttpResponse.json(page(new URL(request.url).searchParams.get('cursor'))),
    ),
    http.get('/api/v1/admin/crawl/tabling/registered', async ({ request }) => {
      const ids = new URL(request.url).searchParams.get('ids') ?? '';
      state.registeredQueries.push(ids);
      if (state.registeredGate) await state.registeredGate;
      const items = ids
        .split(',')
        .map(Number)
        .filter((idx) => state.registered.has(idx))
        .map((idx) => ({ idx, restaurantId: `R${idx}`, canonicalId: `C${idx}` }));
      return HttpResponse.json({ items });
    }),
    http.post('/api/v1/admin/crawl/tabling/shop/:idx/save', async ({ params }) => {
      const idx = Number(params['idx']);
      state.saved.push(idx);
      if (state.saveGate) await state.saveGate;
      state.registered.add(idx);
      return HttpResponse.json(saveResult(idx));
    }),
    // 저장 성공 뒤 무효화되는 조회(맛집 목록·병합 제안)는 이 화면에 구독자가 없어 요청이 나가지 않는다.
  );
};

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <MemoryRouter>
        <AdminTablingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const searchKeyword = async (keyword: string) => {
  fireEvent.change(screen.getByPlaceholderText('예: 강남 스시, 성수 베이커리, 런던베이글'), {
    target: { value: keyword },
  });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  expect(await screen.findByText('첫째 스시')).toBeInTheDocument();
};

// 가게 이름으로 그 카드 안을 조회한다.
const card = (name: string) => {
  const el = screen.getByText(name).closest('.overflow-hidden');
  if (!(el instanceof HTMLElement)) throw new Error(`card not found: ${name}`);
  return within(el);
};

const gate = (): { promise: Promise<void>; release: () => void } => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

beforeEach(() => {
  useActiveTablingBulkSaveJobStore.setState({ jobId: null });
});

describe('AdminTablingPage', () => {
  it('한 가게를 저장하는 동안 다른 카드의 저장은 잠기고, 끝나면 결과가 그 카드에 남는다', async () => {
    useHandlers();
    renderPage();
    await searchKeyword('스시');
    await waitFor(() => expect(state.registeredQueries).toEqual(['1,2']));

    const saving = gate();
    state.saveGate = saving.promise;
    fireEvent.click(card('첫째 스시').getByRole('button', { name: '저장' }));

    // 저장 중인 카드는 진행 표시, 다른 카드의 저장 버튼은 잠긴다.
    expect(card('첫째 스시').getByRole('button', { name: '저장 중 (리뷰 수집)' })).toBeDisabled();
    expect(card('둘째 스시').getByRole('button', { name: '저장' })).toBeDisabled();
    await waitFor(() => expect(state.saved).toEqual([1]));

    saving.release();
    state.saveGate = null;
    expect(await card('첫째 스시').findByText('기존 가게에 자동 병합됨')).toBeInTheDocument();
    expect(card('첫째 스시').getByText('리뷰 7건 수집')).toBeInTheDocument();
    expect(card('첫째 스시').getByText('등록됨')).toBeInTheDocument();
    // 저장된 카드에는 저장 버튼이 없고, 다른 카드는 다시 저장할 수 있다.
    expect(card('첫째 스시').queryByRole('button', { name: '저장' })).toBeNull();
    expect(card('둘째 스시').queryByText('등록됨')).toBeNull();

    const second = card('둘째 스시').getByRole('button', { name: '저장' });
    await waitFor(() => expect(second).not.toBeDisabled());
    fireEvent.click(second);
    expect(await card('둘째 스시').findByText('리뷰 7건 수집')).toBeInTheDocument();
    expect(state.saved).toEqual([1, 2]);
  });

  it('더 보기로 결과가 쌓이는 동안 이미 받은 등록 배지가 사라지지 않는다', async () => {
    useHandlers();
    state.registered.add(1);
    renderPage();
    await searchKeyword('스시');
    expect(await card('첫째 스시').findByText('등록됨')).toBeInTheDocument();
    expect(card('둘째 스시').queryByText('등록됨')).toBeNull();

    // 다음 페이지 — 결과가 쌓여 등록 조회 키(idx 목록)가 바뀐다. 그 응답을 붙잡아 둔다.
    const pending = gate();
    state.registeredGate = pending.promise;
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    expect(await screen.findByText('셋째 스시')).toBeInTheDocument();
    await waitFor(() => expect(state.registeredQueries).toEqual(['1,2', '1,2,3']));

    // 새 키의 응답 전 — 첫 카드의 배지가 그대로 있고(저장 버튼으로 되돌아가지 않는다) 앞서 받은
    // 카드들도 그대로 남아 있다.
    expect(card('첫째 스시').getByText('등록됨')).toBeInTheDocument();
    expect(card('첫째 스시').queryByRole('button', { name: '저장' })).toBeNull();
    expect(screen.getByText('둘째 스시')).toBeInTheDocument();
    expect(screen.getByText('불러옴 3건')).toBeInTheDocument();

    pending.release();
    await waitFor(() => expect(card('셋째 스시').getByRole('button', { name: '저장' })).toBeEnabled());
    expect(card('첫째 스시').getByText('등록됨')).toBeInTheDocument();
  });
});
