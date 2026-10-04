import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { useAuthStore, useSettlementDraftStore, type DraftRound } from '@repo/shared';
import { server } from '~/test/msw';
import { SettlementResultPage } from './SettlementResultPage';
import { Step4Review } from './Step4Review';
import { draftParticipant, draftRound, settlementSession } from './testFixtures';

// 마지막 단계(분배 결과). 여기서 고정하는 것:
//  - 차수별 편집기는 memo 로 감쌌다 — 자기 차수가 바뀌면 다시 그려지고, 다른 차수의
//    조작에는 끌려오지 않아도 화면이 어긋나지 않는다.
//  - 저장 응답이 상세 캐시에 심겨, 곧바로 이동하는 결과 페이지가 같은 세션을 다시
//    요청하지 않는다(스피너 없이 바로 그려진다).

const SETTLEMENTS_URL = '/api/v1/settlements';

const attendance = (participantClientId: string) => ({
  participantClientId,
  attended: true,
  excludeAlcoholOverride: null,
  excludeNonAlcoholOverride: null,
  excludeSideOverride: null,
});

const roundOf = (clientId: string, placeName: string, amount: number): DraftRound =>
  draftRound({
    clientId,
    placeName,
    source: 'MANUAL',
    items: [
      {
        clientId: `${clientId}-i1`,
        name: '안주',
        unitPrice: amount,
        quantity: 1,
        amount,
        category: 'SIDE',
        matchedMenuName: null,
      },
    ],
    attendances: [attendance('c1'), attendance('c2')],
  });

const seedDraft = (rounds: DraftRound[]) =>
  useSettlementDraftStore.setState({
    participants: [
      draftParticipant({ clientId: 'c1', name: '철수' }),
      draftParticipant({ clientId: 'c2', name: '영희' }),
    ],
    rounds,
  });

const renderStep = () => {
  // 앱(main.tsx)처럼 staleTime 을 둔다 — 0 이면 캐시에 심긴 세션도 결과 페이지가
  // 마운트하며 다시 조회해 "다시 요청하지 않는다" 를 볼 수 없다.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/wizard']}>
        <Routes>
          <Route path="/wizard" element={<Step4Review onBack={() => {}} />} />
          <Route path="/restaurants/:placeId/settle/:id" element={<SettlementResultPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

// 차수 카드 — 제목(예: "2차 · 김밥나라")이 들어 있는 카드 전체.
const roundCard = (title: RegExp) =>
  screen.getByText(title).closest('.rounded-xl') as HTMLElement;

describe('Step4Review', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    useSettlementDraftStore.getState().reset();
    useAuthStore.setState({ token: 'test-token', user: null, isGuest: false });
  });

  it('한 차수의 조작은 그 차수 편집기에만 반영되고, 분담 미리보기는 즉시 갱신된다', () => {
    seedDraft([roundOf('r1', '초밥천국', 30_000), roundOf('r2', '김밥나라', 10_000)]);
    renderStep();

    // 두 사람이 두 차수를 반씩 — 15,000 + 5,000.
    expect(screen.getAllByText('20,000원')).toHaveLength(2);

    // 2차에만 할인을 건다 — 1차 편집기는 그대로 '+ 할인 추가' 다.
    const second = roundCard(/2차 · 김밥나라/);
    fireEvent.click(within(second).getByRole('button', { name: '+ 할인 추가' }));
    expect(within(second).getByRole('button', { name: '할인 삭제' })).toBeInTheDocument();
    const first = roundCard(/1차 · 초밥천국/);
    expect(within(first).getByRole('button', { name: '+ 할인 추가' })).toBeInTheDocument();
    expect(within(first).queryByRole('button', { name: '할인 삭제' })).not.toBeInTheDocument();

    // 2차 할인 2,000원 → 2차 풀 8,000원, 인당 4,000원 → 합계 19,000원.
    fireEvent.change(within(second).getByPlaceholderText('0'), { target: { value: '2000' } });
    expect(screen.getAllByText('19,000원')).toHaveLength(2);

    // 2차에서 영희를 불참으로 — 2차 8,000원을 철수가 전부 낸다.
    const grid = screen.getByText('차수별 참석').closest('.rounded-xl') as HTMLElement;
    const youngheeRow = within(grid).getByText('영희').closest('tr')!;
    fireEvent.click(within(youngheeRow).getAllByRole('checkbox')[1]!);
    expect(screen.getByText('23,000원')).toBeInTheDocument();
    expect(screen.getByText(/2차 불참/)).toBeInTheDocument();
  });

  it('저장하면 결과 페이지로 이동하고, 방금 받은 세션을 다시 요청하지 않는다', async () => {
    seedDraft([roundOf('r1', '초밥천국', 30_000)]);
    const saved = settlementSession({ id: 'new-1' });
    let detailCalls = 0;
    server.use(
      http.post(SETTLEMENTS_URL, () => HttpResponse.json(saved)),
      http.get(`${SETTLEMENTS_URL}/new-1`, () => {
        detailCalls += 1;
        return HttpResponse.json(saved);
      }),
    );
    renderStep();

    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    // 결과 페이지가 캐시의 세션으로 바로 그려진다.
    expect(await screen.findByText('정산 결과 · 초밥천국')).toBeInTheDocument();
    expect(screen.getByText('참여자별 분담')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(detailCalls).toBe(0);
    // 저장이 끝나면 초안은 비운다.
    expect(useSettlementDraftStore.getState().rounds).toEqual([]);
  });
});
