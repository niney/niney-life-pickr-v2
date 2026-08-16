import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SharedVoteSessionType } from '@repo/api-contract';
import { voteOption, voteSession } from '~/test/fixtures/vote';
import { VoteResultView } from './VoteResultView';

// 마감된 투표의 결과 화면. props 만 받는 표시 컴포넌트라 서버/DB/API mock 없이
// 세션 객체 하나로 전부 검증된다 — 웹의 첫 테스트를 여기서 시작한 이유.
//
// 결정 자체는 서버가 하고(동점 티브레이크 포함) 이 화면은 확정된 결과를 그릴
// 뿐이므로, 여기서 지키는 계약은 세 가지다.
//   ① 동점이었는지에 따라 슬롯 연출을 태울지 말지 고르는 분기
//   ② 최종 집계 정렬(표 desc → 등록순 asc)과 우승 표시
//   ③ 0표 마감처럼 분모가 0 인 입력에서도 퍼센트 계산이 깨지지 않는 것

// 이 화면에는 마감된 세션만 들어온다(진행 중이면 VotePage 가 투표 UI 로 보낸다).
const closedSession = (over: Partial<SharedVoteSessionType>): SharedVoteSessionType =>
  voteSession({ closedAt: '2026-08-16T03:00:00.000Z', ...over });

// 우승 카드가 식당 상세로 거는 Link 때문에 라우터 컨텍스트가 필요하다.
const renderResult = (data: SharedVoteSessionType) =>
  render(
    <MemoryRouter>
      <VoteResultView data={data} />
    </MemoryRouter>,
  );

// 최종 집계는 section[aria-label] 이라 접근성 트리에서 region 으로 잡힌다 —
// 우승 카드에도 같은 이름이 나오므로 쿼리를 이 안으로 좁힌다.
const standingRows = (): HTMLElement[] =>
  within(screen.getByRole('region', { name: '최종 집계' })).getAllByRole('listitem');

describe('VoteResultView', () => {
  it('단독 최다 — 연출 없이 우승 카드가 바로 보이고 사유는 "투표로 결정"', () => {
    const { container } = renderResult(
      closedSession({
        totalVoters: 4,
        winnerOptionId: 'o1',
        decidedBy: 'votes',
        options: [
          voteOption({
            id: 'o1',
            orderIndex: 0,
            placeId: '9900000001',
            name: '초밥천국',
            category: '일식',
            count: 3,
            voters: ['민수', '지현', '태호'],
          }),
          voteOption({
            id: 'o2',
            orderIndex: 1,
            placeId: '9900000002',
            name: '김밥나라',
            count: 1,
            voters: ['영희'],
          }),
        ],
      }),
    );

    expect(screen.getByRole('heading', { name: /오늘 점심 어디/ })).toBeInTheDocument();
    expect(container).toHaveTextContent('4명 참여');
    expect(container).toHaveTextContent('투표로 결정');
    // 동점이 아니면 슬롯 연출 자체가 뜨지 않는다.
    expect(screen.queryByText(/동점! 어디로 갈지 뽑는 중/)).not.toBeInTheDocument();

    // 우승 카드는 이 화면의 유일한 링크 — 식당 상세로 간다.
    const winnerCard = screen.getByRole('link');
    expect(winnerCard).toHaveAttribute('href', '/r/9900000001');
    expect(winnerCard).toHaveTextContent('초밥천국');
    expect(winnerCard).toHaveTextContent('3표 · 민수, 지현, 태호');
  });

  it('동점 — 슬롯 연출이 뜨고 "결과 바로 보기" 로 건너뛰면 서버가 정한 우승이 공개된다', () => {
    const { container } = renderResult(
      closedSession({
        totalVoters: 4,
        winnerOptionId: 'o2',
        decidedBy: 'smart-pick',
        options: [
          voteOption({ id: 'o1', orderIndex: 0, placeId: '9900000001', name: '초밥천국', count: 2 }),
          voteOption({ id: 'o2', orderIndex: 1, placeId: '9900000002', name: '김밥나라', count: 2 }),
        ],
      }),
    );

    // jsdom 에는 CSS transition 이 없어 릴의 onTransitionEnd 가 영영 오지 않는다.
    // 연출이 걸린 채로 멈추므로, 탈출구 버튼이 실제로 그 상태를 풀어주는지가
    // 백그라운드 탭 등 실제 환경의 안전장치를 그대로 검증하는 셈이 된다.
    expect(screen.getByText(/동점! 어디로 갈지 뽑는 중/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '결과 바로 보기' }));

    expect(screen.queryByText(/동점! 어디로 갈지 뽑는 중/)).not.toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/r/9900000002');
    expect(container).toHaveTextContent('동점 → AI 픽으로 결정');
  });

  it('최종 집계 — 표 많은 순, 같으면 후보 등록 순이고 우승 행에만 트로피', () => {
    renderResult(
      closedSession({
        totalVoters: 3,
        winnerOptionId: 'o2',
        decidedBy: 'votes',
        options: [
          voteOption({ id: 'o1', orderIndex: 0, placeId: '9900000001', name: '초밥천국', count: 1 }),
          voteOption({ id: 'o2', orderIndex: 1, placeId: '9900000002', name: '김밥나라', count: 3 }),
          voteOption({ id: 'o3', orderIndex: 2, placeId: '9900000003', name: '파스타집', count: 1 }),
        ],
      }),
    );

    const rows = standingRows();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('김밥나라');
    // 1표 동수 — 등록 순서(orderIndex)가 타이브레이커다.
    expect(rows[1]).toHaveTextContent('초밥천국');
    expect(rows[2]).toHaveTextContent('파스타집');

    expect(rows[0]).toHaveTextContent('🏆');
    expect(rows[1]).not.toHaveTextContent('🏆');
  });

  it('아무도 투표하지 않은 채 마감 — 퍼센트가 0 이고 NaN 이 새지 않는다', () => {
    const { container } = renderResult(
      closedSession({
        totalVoters: 0,
        winnerOptionId: 'o1',
        decidedBy: 'random',
        options: [
          voteOption({ id: 'o1', orderIndex: 0, placeId: '9900000001', name: '초밥천국' }),
          voteOption({ id: 'o2', orderIndex: 1, placeId: '9900000002', name: '김밥나라' }),
        ],
      }),
    );

    // 0표는 전원 동점이라 연출이 걸린다 — 건너뛰고 집계를 본다.
    fireEvent.click(screen.getByRole('button', { name: '결과 바로 보기' }));

    expect(container).toHaveTextContent('0명 참여');
    expect(container).toHaveTextContent('동점 → 랜덤 결정');
    // count/totalVoters 가 0/0 이면 퍼센트가 NaN 이 되어 style 로 새어나간다.
    expect(container.innerHTML).not.toContain('NaN');

    const bars = container.querySelectorAll<HTMLElement>('[style*="width"]');
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) expect(bar.style.width).toBe('0%');
  });
});
