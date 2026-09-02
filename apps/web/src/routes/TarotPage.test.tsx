import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { CreateTarotReadingInputType, TarotReadingResultType } from '@repo/api-contract';
import { useAuthStore, useTarotHistoryStore } from '@repo/shared';
import { getTarotCard, getTarotSpread, TAROT_CARDS, tarotCardKeywords, tarotCardMeaning } from '@repo/utils';
import { detectTarotRender } from '~/components/tarot/tarotQuality';
import { server } from '~/test/msw';
import { TarotPage } from './TarotPage';

// 타로 페이지 — jsdom 에는 WebGL2 가 없어 Lite 모드로 뜬다. 3D 무대는 여기서 검증하지 않고(결정 14)
// 흐름(설정 → 섞기 → 뽑기 → 요청 → 뒤집기 → 해석·로컬 기록)과 실패 폴백만 본다.

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/tarot']}>
        <Routes>
          <Route element={<Outlet context={{ setSubBar: () => {}, headerHeight: 56 }} />}>
            <Route path="/tarot" element={<TarotPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const fakeResult = (input: CreateTarotReadingInputType): TarotReadingResultType => {
  const spread = getTarotSpread(input.spreadId)!;
  return {
    readingId: null,
    spreadId: input.spreadId,
    topic: input.topic,
    question: input.question,
    choices: input.choices,
    source: 'llm',
    model: 'fake',
    cards: input.cards.map((c, i) => {
      const card = getTarotCard(c.cardId)!;
      return {
        cardId: c.cardId,
        position: c.position,
        positionLabel: spread.positions[i]!.label,
        reversed: c.reversed,
        nameKo: card.nameKo,
        nameEn: card.nameEn,
        keywords: [...tarotCardKeywords(card, c.reversed)],
        text: `${card.nameKo} 해석 문장입니다.`,
      };
    }),
    summary: '종합 해석 문장입니다.',
    advice: '조언 문장입니다.',
    keyword: '희망',
    choice: null,
    createdAt: new Date().toISOString(),
    quota: { remainingToday: 4 },
  };
};

beforeEach(() => {
  window.localStorage.clear();
  useAuthStore.setState({ token: null, user: null, isGuest: false });
  useTarotHistoryStore.setState({ entries: [] });
});

describe('TarotPage (Lite)', () => {
  it('jsdom 은 WebGL2 가 없어 lite 로 판정한다', () => {
    expect(detectTarotRender('')).toMatchObject({ mode: 'lite', reason: 'no-webgl2' });
    expect(detectTarotRender('?lite=1').reason).toBe('forced-lite');
  });

  it('설정 → 섞기 → 3장 고르기 → 해석 요청(게스트 키) → 모두 뒤집기 → AI 해석·로컬 기록', async () => {
    let received: CreateTarotReadingInputType | null = null;
    let guestKey: string | null = null;
    server.use(
      http.post('/api/v1/tarot/readings', async ({ request }) => {
        received = (await request.json()) as CreateTarotReadingInputType;
        guestKey = request.headers.get('x-guest-key');
        return HttpResponse.json(fakeResult(received));
      }),
    );
    renderPage();

    expect(screen.getByRole('radio', { name: /상황·조언·결과/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: '일·공부' }));
    fireEvent.change(screen.getByLabelText('질문'), { target: { value: '이직할까요?' } });
    fireEvent.click(screen.getByRole('button', { name: /카드 섞기/ }));

    expect(await screen.findByText(/카드 3장을 골라 주세요/)).toBeInTheDocument();
    const deck = screen.getByTestId('tarot-lite-deck');
    const cards = within(deck).getAllByRole('button');
    expect(cards).toHaveLength(78);
    fireEvent.click(cards[0]!);
    expect(screen.getByText(/남은 2장/)).toBeInTheDocument();
    expect(within(deck).getAllByRole('button')).toHaveLength(77);
    fireEvent.click(within(deck).getAllByRole('button')[4]!);
    fireEvent.click(within(deck).getAllByRole('button')[60]!);

    await waitFor(() => expect(received).not.toBeNull());
    expect(received!).toMatchObject({ spreadId: 'three-sar', topic: 'work', question: '이직할까요?', choices: null });
    expect(received!.cards).toHaveLength(3);
    expect(new Set(received!.cards.map((c) => c.cardId)).size).toBe(3);
    expect(guestKey).toMatch(/^[A-Za-z0-9_-]{8,}$/);

    // Lite 는 자리 잡기 없이 바로 리빌 단계.
    expect(await screen.findByText(/카드를 탭해서 뒤집어 보세요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '모두 뒤집기' }));

    expect(await screen.findByText('종합 해석 문장입니다.')).toBeInTheDocument();
    expect(screen.getByText('AI 해석')).toBeInTheDocument();
    expect(screen.getAllByTestId('tarot-reading-card')).toHaveLength(3);
    expect(screen.getByText(/오늘 AI 해석 4회 남음/)).toBeInTheDocument();
    expect(useTarotHistoryStore.getState().entries).toHaveLength(1);
    expect(useTarotHistoryStore.getState().entries[0]!.result.keyword).toBe('희망');
  });

  it('선택 타로는 A·B 를 채워야 섞을 수 있다', () => {
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: /선택 타로/ }));
    const start = screen.getByRole('button', { name: /카드 섞기/ });
    expect(start).toBeDisabled();
    fireEvent.change(screen.getByLabelText('A'), { target: { value: '치킨' } });
    expect(start).toBeDisabled();
    fireEvent.change(screen.getByLabelText('B'), { target: { value: '피자' } });
    expect(start).toBeEnabled();
  });

  it('해석 요청이 실패하면 카드 기본 의미와 다시 시도 버튼을 보인다', async () => {
    server.use(
      http.post('/api/v1/tarot/readings', () =>
        HttpResponse.json({ statusCode: 500, error: 'Internal Server Error', message: 'boom' }, { status: 500 }),
      ),
    );
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: /오늘의 카드/ }));
    fireEvent.click(screen.getByRole('button', { name: /카드 섞기/ }));
    fireEvent.click(await screen.findByRole('button', { name: '자동으로 뽑기' }));
    fireEvent.click(await screen.findByRole('button', { name: '모두 뒤집기' }));

    expect(await screen.findByText(/AI 해석을 불러오지 못했어요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeInTheDocument();
    const block = screen.getAllByTestId('tarot-reading-card');
    expect(block).toHaveLength(1);
    // 실패해도 카드 기본 의미(utils 정적 데이터)는 보인다. 카드는 무작위라 alt 의 영문명으로 역조회.
    const alt = within(block[0]!).getByRole('img').getAttribute('alt') ?? '';
    const nameEn = alt.slice(alt.indexOf('(') + 1, alt.lastIndexOf(')'));
    const card = TAROT_CARDS.find((c) => c.nameEn === nameEn);
    expect(card).toBeDefined();
    const shownMeaning = within(block[0]!).getByText(
      (_, el) =>
        el?.tagName === 'P' &&
        (el.textContent === tarotCardMeaning(card!, false) || el.textContent === tarotCardMeaning(card!, true)),
    );
    expect(shownMeaning).toBeInTheDocument();
    expect(useTarotHistoryStore.getState().entries).toHaveLength(0);
  });
});
