import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { delay, http, HttpResponse } from 'msw';
import { useSettlementDraftStore } from '@repo/shared';
import { server } from '~/test/msw';
import { Step3Edit } from './Step3Edit';
import { TEST_PLACE_ID, draftRound } from './testFixtures';

// 항목 편집 단계. 식당 상세 API 는 서버가 그 식당 리뷰 전체를 읽어 만드는 무거운
// 응답인데 이 단계는 메뉴 목록만 쓴다 — '메뉴에서 추가' 모달을 연 동안에만 부르고,
// 받아오는 동안은 "등록된 메뉴가 없습니다" 가 아니라 로딩으로 보여야 한다.

const DETAIL_URL = `/api/v1/restaurants/public/${TEST_PLACE_ID}`;
const PREVIEW_URL = '/api/v1/settlement-extraction/preview/tok-1';

const renderStep = () => {
  // gcTime 을 0 으로 두지 않는다 — 모달을 닫았다 다시 열 때 캐시가 살아 있는지를 본다.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Step3Edit onBack={() => {}} onNext={() => {}} />
    </QueryClientProvider>,
  );
};

const manualRound = () =>
  draftRound({
    clientId: 'r1',
    source: 'MANUAL',
    items: [
      {
        clientId: 'i1',
        name: '모둠초밥',
        unitPrice: 30_000,
        quantity: 1,
        amount: 30_000,
        category: 'UNCATEGORIZED',
        matchedMenuName: null,
      },
    ],
  });

describe('Step3Edit', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    useSettlementDraftStore.getState().reset();
  });

  it('식당 상세는 메뉴 모달을 열 때만 조회하고, 받아오는 동안은 로딩으로 보인다', async () => {
    useSettlementDraftStore.setState({ participants: [], rounds: [manualRound()] });
    let detailCalls = 0;
    server.use(
      http.get(DETAIL_URL, async () => {
        detailCalls += 1;
        await delay(60);
        return HttpResponse.json({
          placeId: TEST_PLACE_ID,
          name: '초밥천국',
          menus: [{ name: '카스', price: '5,000원' }],
          reviewsFirstPage: [],
          reviewCounts: { all: 0, positive: 0, negative: 0 },
        });
      }),
    );
    renderStep();

    // 항목만 고치고 끝내는 흐름에서는 한 번도 부르지 않는다.
    expect(screen.getByDisplayValue('모둠초밥')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(detailCalls).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: '메뉴에서 추가' }));

    expect(await screen.findByText(/메뉴 불러오는 중/)).toBeInTheDocument();
    expect(screen.queryByText('등록된 메뉴가 없습니다.')).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: /카스/ }));

    // 고른 메뉴가 항목으로 들어가고 모달은 닫힌다.
    await waitFor(() =>
      expect(useSettlementDraftStore.getState().rounds[0]!.items.map((it) => it.name)).toEqual([
        '모둠초밥',
        '카스',
      ]),
    );
    expect(screen.queryByRole('dialog', { name: '메뉴에서 추가' })).not.toBeInTheDocument();
    expect(detailCalls).toBe(1);

    // 다시 열면 캐시에서 바로 — 로딩도, 추가 요청도 없다.
    fireEvent.click(screen.getByRole('button', { name: '메뉴에서 추가' }));
    expect(screen.getByRole('button', { name: /카스.*5,000원/ })).toBeInTheDocument();
    expect(detailCalls).toBe(1);
  });

  it('영수증 미리보기는 받아오는 동안에도 이미지 높이만큼 자리를 잡아 둔다', async () => {
    useSettlementDraftStore.setState({
      participants: [],
      rounds: [
        {
          ...manualRound(),
          source: 'RECEIPT',
          receiptImageToken: 'tok-1',
          receiptPreviewUrl: PREVIEW_URL,
        },
      ],
    });
    // 응답을 붙잡아 둬 로딩 상태를 관찰한다.
    server.use(http.get(PREVIEW_URL, () => delay('infinite')));
    renderStep();

    // 한 줄짜리 문구가 이미지(max-h-64)로 바뀌며 아래 목록을 밀어내지 않게.
    expect(screen.getByText('미리보기 불러오는 중…')).toHaveClass('h-64');
  });
});
