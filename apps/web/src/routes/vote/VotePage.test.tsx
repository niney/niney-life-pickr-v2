import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { SharedVoteSessionType } from '@repo/api-contract';
import { useVoteGuestStore } from '@repo/shared';
import { server } from '~/test/msw';
import { voteOption, voteSession } from '~/test/fixtures/vote';
import { VotePage } from './VotePage';

// 링크를 받은 참가자가 보는 공개 투표 페이지. VoteResultView 와 달리 서버를
// 실제로 호출하므로 MSW 로 API 를 세운다 — 페이지가 계약대로 요청을 만들고
// 응답을 화면에 반영하는지가 여기서 검증하려는 것이다.
//
// 특히 투표 제출은 "voterKey 의 찬성 집합 풀 리플레이스" 계약이라, 무엇을
// 보내는지(voterKey/voterLabel/optionIds)와 응답으로 온 세션 전체를 캐시에
// 통째로 갈아끼우는지를 함께 본다.

const TOKEN = 'tok123';
const SHARED_URL = `/api/v1/share/votes/${TOKEN}`;
const BALLOT_URL = `${SHARED_URL}/ballot`;

const openSession = (over: Partial<SharedVoteSessionType> = {}): SharedVoteSessionType =>
  voteSession({
    options: [
      voteOption({ id: 'o1', orderIndex: 0, placeId: '9900000001', name: '초밥천국' }),
      voteOption({ id: 'o2', orderIndex: 1, placeId: '9900000002', name: '김밥나라' }),
    ],
    ...over,
  });

const renderVotePage = () => {
  // retry:false 가 없으면 에러 분기 테스트가 기본 재시도(3회) 백오프를 기다린다.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/vote/${TOKEN}`]}>
        <Routes>
          <Route path="/vote/:token" element={<VotePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const errorBody = (statusCode: number, error: string, message: string) =>
  HttpResponse.json({ statusCode, error, message }, { status: statusCode });

describe('VotePage', () => {
  beforeEach(() => {
    // 게스트 스토어는 모듈 수명 동안 살아있고 localStorage 에 persist 된다 —
    // 테스트마다 이름/찬성 기록을 비워 앞 테스트가 다음 테스트의 초기 화면을
    // 바꾸지 않게 한다(guestId 는 유지해 제출 body 검증에 쓴다).
    window.localStorage.clear();
    useVoteGuestStore.setState({ name: '', ballots: {} });
  });

  it('이름과 후보를 고르고 투표하면 voterKey 와 함께 제출되고 응답 집계가 즉시 반영된다', async () => {
    let submitted: unknown = null;
    server.use(
      http.get(SHARED_URL, () => HttpResponse.json(openSession())),
      http.put(BALLOT_URL, async ({ request }) => {
        submitted = await request.json();
        // 서버는 갱신된 세션 전체를 돌려준다 — 클라는 이걸로 캐시를 교체한다.
        return HttpResponse.json(
          openSession({
            totalVoters: 1,
            options: [
              voteOption({
                id: 'o1',
                orderIndex: 0,
                placeId: '9900000001',
                name: '초밥천국',
                count: 1,
                voters: ['민수'],
              }),
              voteOption({ id: 'o2', orderIndex: 1, placeId: '9900000002', name: '김밥나라' }),
            ],
          }),
        );
      }),
    );

    renderVotePage();

    expect(await screen.findByRole('heading', { name: /오늘 점심 어디/ })).toBeInTheDocument();
    // 방장이 아니면 마감 버튼은 없다.
    expect(screen.queryByRole('button', { name: '마감하기' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('내 이름'), { target: { value: '민수' } });
    fireEvent.click(screen.getByRole('button', { name: /초밥천국/ }));
    fireEvent.click(screen.getByRole('button', { name: '투표하기' }));

    await waitFor(() =>
      expect(submitted).toEqual({
        voterKey: useVoteGuestStore.getState().guestId,
        voterLabel: '민수',
        optionIds: ['o1'],
      }),
    );

    expect(await screen.findByText(/투표했어요/)).toBeInTheDocument();
    // 한 번 투표한 뒤에는 같은 버튼이 "수정" 으로 바뀐다(재투표=풀 리플레이스).
    expect(screen.getByRole('button', { name: '투표 수정하기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /초밥천국/ })).toHaveTextContent('1표 · 민수');
  });

  it('재방문 — 로컬에 남은 내 찬성이 체크 상태로 복원된다', async () => {
    useVoteGuestStore.setState({
      ballots: { [TOKEN]: { optionIds: ['o2'], votedAt: 1_755_300_000_000 } },
    });
    server.use(http.get(SHARED_URL, () => HttpResponse.json(openSession())));

    renderVotePage();

    const second = await screen.findByRole('button', { name: /김밥나라/ });
    expect(second).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /초밥천국/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    // 서버엔 "내 찬성" 조회 API 가 없어 이 복원은 전적으로 로컬 기록의 몫이다.
    expect(screen.getByRole('button', { name: '투표 수정하기' })).toBeInTheDocument();
  });

  it('만료된 링크(410)는 "잘못된 주소" 가 아니라 만료로 안내한다', async () => {
    server.use(
      http.get(SHARED_URL, () => errorBody(410, 'Gone', '투표 링크가 만료되었습니다.')),
    );

    renderVotePage();

    expect(await screen.findByText('투표 링크가 만료되었어요')).toBeInTheDocument();
    expect(screen.getByText(/생성 후 7일/)).toBeInTheDocument();
  });

  it('없는 링크(404)는 잘못된 주소로 안내한다', async () => {
    server.use(
      http.get(SHARED_URL, () => errorBody(404, 'Not Found', '투표를 찾을 수 없습니다.')),
    );

    renderVotePage();

    expect(await screen.findByText('잘못된 주소예요')).toBeInTheDocument();
  });

  it('마감된 투표는 투표 UI 대신 결과 화면으로 전환된다', async () => {
    server.use(
      http.get(SHARED_URL, () =>
        HttpResponse.json(
          openSession({
            closedAt: '2026-08-16T03:00:00.000Z',
            totalVoters: 1,
            winnerOptionId: 'o1',
            decidedBy: 'votes',
            options: [
              voteOption({
                id: 'o1',
                orderIndex: 0,
                placeId: '9900000001',
                name: '초밥천국',
                count: 1,
              }),
              voteOption({ id: 'o2', orderIndex: 1, placeId: '9900000002', name: '김밥나라' }),
            ],
          }),
        ),
      ),
    );

    renderVotePage();

    expect(await screen.findByRole('region', { name: '최종 집계' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '투표하기' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('내 이름')).not.toBeInTheDocument();
  });

  it('마감 직후 도착한 투표(409)는 전용 안내로 알린다', async () => {
    server.use(
      http.get(SHARED_URL, () => HttpResponse.json(openSession())),
      http.put(BALLOT_URL, () => errorBody(409, 'Conflict', '이미 마감된 투표입니다.')),
    );

    renderVotePage();

    fireEvent.change(await screen.findByLabelText('내 이름'), { target: { value: '민수' } });
    fireEvent.click(screen.getByRole('button', { name: /초밥천국/ }));
    fireEvent.click(screen.getByRole('button', { name: '투표하기' }));

    expect(await screen.findByText(/방금 마감된 투표예요/)).toBeInTheDocument();
  });

  it('방장(isOwner)에게만 마감 버튼이 보인다', async () => {
    server.use(http.get(SHARED_URL, () => HttpResponse.json(openSession({ isOwner: true }))));

    renderVotePage();

    expect(await screen.findByRole('button', { name: '마감하기' })).toBeInTheDocument();
  });

  it('마감됐지만 승자 미확정(마감 중 크래시) — 방장이 확정 버튼으로 복구한다', async () => {
    // closedAt 클레임 뒤 winner 확정 전에 서버가 죽은 상태의 스냅샷.
    const crashed = openSession({
      closedAt: '2026-08-16T03:00:00.000Z',
      totalVoters: 2,
      winnerOptionId: null,
      decidedBy: null,
      options: [
        voteOption({ id: 'o1', orderIndex: 0, placeId: '9900000001', name: '초밥천국', count: 2 }),
        voteOption({ id: 'o2', orderIndex: 1, placeId: '9900000002', name: '김밥나라', count: 1 }),
      ],
      isOwner: true,
    });
    server.use(
      http.get(SHARED_URL, () => HttpResponse.json(crashed)),
      // close 는 멱등 — 재호출이 곧 복구. 확정된 세션 전체를 돌려준다.
      http.post(`/api/v1/votes/${crashed.id}/close`, () =>
        HttpResponse.json({
          ...crashed,
          winnerOptionId: 'o1',
          decidedBy: 'votes',
          token: TOKEN,
        }),
      ),
    );

    renderVotePage();

    fireEvent.click(await screen.findByRole('button', { name: '결과 확정하기' }));

    // 응답으로 캐시가 통째로 교체돼 배너는 사라지고 우승 카드(유일한 링크)가 뜬다.
    const winnerCard = await screen.findByRole('link');
    expect(winnerCard).toHaveAttribute('href', '/r/9900000001');
    expect(screen.queryByRole('button', { name: '결과 확정하기' })).not.toBeInTheDocument();
  });

  it('승자 미확정 마감이라도 참가자에게는 확정 버튼이 없다', async () => {
    server.use(
      http.get(SHARED_URL, () =>
        HttpResponse.json(
          openSession({
            closedAt: '2026-08-16T03:00:00.000Z',
            winnerOptionId: null,
            options: [
              voteOption({ id: 'o1', orderIndex: 0, placeId: '9900000001', name: '초밥천국' }),
              voteOption({ id: 'o2', orderIndex: 1, placeId: '9900000002', name: '김밥나라' }),
            ],
          }),
        ),
      ),
    );

    renderVotePage();

    // 집계는 보이되 복구 UI 는 방장 전용.
    expect(await screen.findByRole('region', { name: '최종 집계' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '결과 확정하기' })).not.toBeInTheDocument();
  });
});
