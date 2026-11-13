import { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { MealStoryFigureType, MealStoryType } from '@repo/api-contract';
import { setMealDraftPrincipal, useAuthStore, useMealDraftStore } from '@repo/shared';
import { server } from '~/test/msw';
import { MealEntry } from '../meal/MealEntry';
import { startStoryFonts } from './mealStoryFont';
import { toMotionMine } from './mealStoryMine';
import type { StoryVideoProps } from './motion/StoryVideo';
import { TRANSITION_FRAMES, buildTimeline, chapterSeekFrame } from './motion/timeline';

// 영상 재생기(@remotion/player)는 jsdom 에서 그릴 수 없어 가짜로 — 재생기 메서드·이벤트만 흉내 내고 받은 props 를 남긴다.
const fake = vi.hoisted(() => {
  type Listener = (e: { detail: unknown }) => void;
  const listeners = new Map<string, Set<Listener>>();
  const state = { frame: 0, playing: false };
  const emit = (name: string, detail?: unknown) => {
    for (const l of listeners.get(name) ?? []) l({ detail });
  };
  const api = {
    play: vi.fn(() => {
      state.playing = true;
      emit('play');
    }),
    pause: vi.fn(() => {
      state.playing = false;
      emit('pause');
    }),
    toggle: vi.fn(() => (state.playing ? api.pause() : api.play())),
    seekTo: vi.fn((frame: number) => {
      state.frame = frame;
      emit('seeked', { frame });
      emit('frameupdate', { frame });
    }),
    getCurrentFrame: () => state.frame,
    isPlaying: () => state.playing,
    addEventListener: (name: string, l: Listener) => {
      listeners.set(name, (listeners.get(name) ?? new Set<Listener>()).add(l));
    },
    removeEventListener: (name: string, l: Listener) => {
      listeners.get(name)?.delete(l);
    },
  };
  const seen = { props: null as Record<string, unknown> | null };
  return {
    api,
    state,
    seen,
    /** 재생기가 받은 props 를 남긴다(그릴 때마다). */
    record: (props: Record<string, unknown>) => {
      seen.props = props;
    },
    /** 재생기가 붙을 때 — 시작 프레임·자동 재생대로. */
    mount: (initialFrame: number, autoPlay: boolean) => {
      state.frame = initialFrame;
      state.playing = autoPlay;
      return api;
    },
    /** 재생이 그 프레임에 닿았다. */
    reach: (frame: number) => {
      state.frame = frame;
      emit('frameupdate', { frame });
    },
    /** 끝까지 재생했다. */
    end: () => {
      state.playing = false;
      emit('pause');
      emit('ended');
    },
    reset: () => {
      listeners.clear();
      state.frame = 0;
      state.playing = false;
      for (const fn of [api.play, api.pause, api.toggle, api.seekTo]) fn.mockClear();
    },
  };
});

vi.mock('@remotion/player', async () => {
  const React = await import('react');
  const Player = ({ ref, ...props }: { ref?: React.Ref<unknown>; initialFrame?: number; autoPlay?: boolean } & Record<string, unknown>) => {
    fake.record(props);
    const initialFrame = props.initialFrame ?? 0;
    const autoPlay = !!props.autoPlay;
    React.useImperativeHandle(ref, () => fake.mount(initialFrame, autoPlay), [initialFrame, autoPlay]);
    return React.createElement('div', { 'data-testid': 'remotion-player' });
  };
  return { Player };
});

// 건강식단 스토리(웹) — 목록·이야기 한 편(영상·글 재생기)·레시피 전체 보기. 로그인 전에는 식단 셸 없이(공개 목록·전체 화면
// 재생기), 로그인하면 식단 셸 안에 뜬다(주소는 App 과 같은 짜임 — /meal/* 는 모두 식단 들머리 MealEntry 가 가른다).
// 숫자는 서버가 계산해 주고(그대로 그린다),
// 내 평균은 로그인했을 때만 통계 영양소에서, [이 레시피로 기록]은 레시피 음식을 받아 새 기록 draft 를 채운다.

// 이 파일의 화면은 조각(lazy)을 여러 겹 거쳐 뜬다(식단 들머리 → 건강식단 앱·식단 셸 → 재생기). 파일의 첫 테스트는 그 조각들을
// 처음 불러와, 컴퓨터가 바쁠 때(다른 검사·렌더가 함께 돌 때) 기본 1초 안에 첫 화면을 못 찾고 실패했다(2026-11-11 두 번).
// 기다리는 한도만 넉넉히 — 통과하는 테스트의 속도는 그대로다.
configure({ asyncUtilTimeout: 5000 });

const LIST_URL = '/api/v1/meal-stories';
const STATS_NUTRIENTS_URL = '/api/v1/meals/stats/nutrients';

const fig = (over: Partial<MealStoryFigureType> = {}): MealStoryFigureType => ({
  value: null,
  unit: 'mg',
  basis: null,
  detail: null,
  sources: [],
  my: null,
  equivalent: null,
  ...over,
});

const story: MealStoryType = {
  slug: 'sodium-test',
  status: 'published',
  title: '시험 나트륨 이야기',
  summary: '시험 요약',
  topic: { nutrient: 'sodium', direction: 'reduce' },
  look: 'paper',
  publishedAt: '2026-11-09',
  reviewedAt: '2026-11-09',
  coverUrl: null,
  scenes: [
    { type: 'cover', kicker: '나트륨 줄이기', title: '시험 표지 제목', subtitle: null, image: null },
    {
      type: 'stat',
      title: '하루 나트륨',
      figures: [
        {
          label: '성인 하루 기준',
          figure: fig({
            value: 2300,
            basis: '성인 하루 기준(이보다 적게)',
            detail: '65~74세 2,100mg · 75세 이상 1,700mg',
            sources: ['kdri-2020', 'who-sodium-2012'],
            equivalent: { label: '소금', value: 5.8, unit: 'g', per: 400 },
          }),
        },
        {
          label: '내 최근 2주 하루 평균',
          figure: fig({ unit: '', basis: '내 최근 2주 하루 평균', my: 'sodium', equivalent: { label: '소금', value: null, unit: 'g', per: 400 } }),
        },
      ],
      note: null,
    },
    {
      type: 'bars',
      title: '같은 스파게티, 다른 나트륨',
      bars: [
        { label: '시판 소스 150g', figure: fig({ value: 953 }), aside: null, highlight: false },
        { label: '직접 만든 소스', figure: fig({ value: 97 }), aside: { label: '열량', figure: fig({ value: 190, unit: 'kcal' }) }, highlight: true },
      ],
      fraction: { bar: 1, denominator: 10, multiple: false },
      note: null,
    },
    { type: 'outro', title: '오늘 한 끼로', text: null, actions: ['record', 'recipe', 'share'] },
  ],
  recipe: {
    name: '저염 토마토 스파게티',
    servings: 1,
    dishType: 'noodle',
    ingredients: [{ label: '스파게티 건면', grams: 80, note: '소금 없이 삶기', food: '스파게티(건면)', icon: null }],
    steps: [{ text: '물에 소금 없이 삶아요.', tip: '면수를 남겨요.', image: null }],
    nutrition: [
      { key: 'kcal', label: '열량', figure: fig({ value: 481, unit: 'kcal', basis: '1인분' }) },
      { key: 'sodiumMg', label: '나트륨', figure: fig({ value: 99, basis: '1인분' }) },
    ],
  },
  sources: [{ id: 'kdri-2020', label: '2020 한국인 영양소 섭취기준', url: null }],
};

const listItem = (over: Record<string, unknown> = {}) => ({
  slug: story.slug,
  status: 'published',
  title: story.title,
  summary: story.summary,
  topic: story.topic,
  publishedAt: story.publishedAt,
  coverUrl: null,
  sceneCount: story.scenes.length,
  recipeFoodId: null,
  ...over,
});

const Where = () => {
  const loc = useLocation();
  return <p data-testid="where">{`${loc.pathname}${loc.search}`}</p>;
};

const renderAt = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/meal/new" element={<p>새 기록 화면</p>} />
            <Route path="/meal/*" element={<MealEntry />} />
            <Route path="/login" element={<p>로그인 화면</p>} />
          </Routes>
        </Suspense>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const user = {
  id: 'u1',
  email: 'u@x.com',
  role: 'USER' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('건강식단 스토리', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null, isGuest: false });
    server.use(http.get(`${LIST_URL}/${story.slug}`, () => HttpResponse.json(story)));
  });

  it('재생기 — 다음 단추·→ 키로 넘기고 주소 ?s= 가 따라가며, 서버 숫자를 그대로 그린다(비로그인은 내 평균 대신 로그인 안내)', async () => {
    renderAt(`/meal/stories/${story.slug}`);
    expect(await screen.findByRole('heading', { name: '시험 표지 제목' })).toBeInTheDocument();
    expect(screen.getByText('1 / 4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이전 장면' })).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(screen.getByRole('button', { name: '다음 장면' }));
    expect(screen.getByRole('heading', { name: '하루 나트륨' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent(`/meal/stories/${story.slug}?s=2`);
    // 굴러 올라가는 숫자도 읽기 프로그램에는 완성된 값 한 번.
    expect(screen.getByText('2,300mg')).toBeInTheDocument();
    expect(screen.getByText('65~74세 2,100mg · 75세 이상 1,700mg')).toBeInTheDocument();
    // 다른 단위로 본 값(소금)도 서버가 환산한 그대로.
    expect(screen.getByText('소금 약 5.8g')).toBeInTheDocument();
    const login = screen.getByRole('link', { name: '로그인' });
    expect(login).toHaveAttribute('href', `/login?next=${encodeURIComponent(`/meal/stories/${story.slug}?s=2`)}`);

    fireEvent.keyDown(screen.getByRole('region', { name: story.title }), { key: 'ArrowRight' });
    expect(screen.getByRole('heading', { name: '같은 스파게티, 다른 나트륨' })).toBeInTheDocument();
    expect(screen.getByText('953mg')).toBeInTheDocument();
    expect(screen.getByText('97mg')).toBeInTheDocument();
    expect(screen.getByText('190kcal')).toBeInTheDocument();
    // 작은 쪽이 큰 쪽의 몇 분의 1 인지도 서버가 계산해 준다.
    expect(screen.getByText('약 10분의 1')).toBeInTheDocument();
    expect(screen.queryByText(/약 \d+배/)).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('region', { name: story.title }), { key: 'ArrowLeft' });
    expect(screen.getByRole('heading', { name: '하루 나트륨' })).toBeInTheDocument();
  });

  it('내 평균 — 로그인하면 최근 2주 통계 영양소(나트륨 하루 평균·판정·기준 대비)', async () => {
    useAuthStore.setState({ token: 't', user, isGuest: false });
    const asked: string[] = [];
    server.use(
      http.get(STATS_NUTRIENTS_URL, ({ request }) => {
        asked.push(new URL(request.url).search);
        return HttpResponse.json({
          status: 'ok',
          rows: [{ key: 'sodium', unit: 'mg', intakePerDay: 3120, percent: 136, status: 'high', recordGap: false }],
        });
      }),
    );
    renderAt(`/meal/stories/${story.slug}?s=2`);
    expect(await screen.findByText('3,120mg')).toBeInTheDocument();
    expect(screen.getByText('기준의 136%')).toBeInTheDocument();
    expect(screen.getByText('많음')).toBeInTheDocument();
    // 내 값의 소금 환산은 서버가 준 식(÷ 400)으로.
    expect(screen.getByText('소금 약 7.8g')).toBeInTheDocument();
    // 최근 2주와 그 직전 2주(변화 한 줄) — 두 번. 값이 같으면 변화 줄은 없다.
    await waitFor(() => expect(asked).toHaveLength(2));
    expect(screen.queryByText(/직전 2주보다/)).not.toBeInTheDocument();
  });

  it('직전 2주보다 달라졌으면 내 값 아래에 한 줄 — 10% 넘게 달라졌고 두 기간 모두 판정이 나왔을 때만', async () => {
    useAuthStore.setState({ token: 't', user, isGuest: false });
    const d = new Date();
    const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const row = (intakePerDay: number, percent: number) => ({
      key: 'sodium',
      unit: 'mg',
      intakePerDay,
      coverage: 1,
      percent,
      status: percent > 100 ? 'high' : 'ok',
      recordGap: false,
      reference: { kind: 'cdrr', amount: 2300, ear: null },
    });
    const kcal = (intakePerDay: number) => ({ key: 'kcal', unit: 'kcal', intakePerDay, coverage: 1, percent: null, status: null, recordGap: false });
    // 오늘로 끝나는 조회가 최근 2주(하루 1,900kcal), 그 앞에서 끝나는 조회가 직전 2주.
    const answer = (previous: { status: string; rows: object[] }) =>
      server.use(
        http.get(STATS_NUTRIENTS_URL, ({ request }) =>
          HttpResponse.json(new URL(request.url).searchParams.get('to') === todayKey ? { status: 'ok', rows: [kcal(1900), row(2200, 96)] } : previous),
        ),
      );
    answer({ status: 'ok', rows: [kcal(2000), row(3000, 130)] });
    const first = renderAt(`/meal/stories/${story.slug}?s=2`);
    // 판정이 바뀌었으면 직전 판정도 — 이야기의 글자로(지킨 나트륨 기준은 '기준 안').
    expect(await screen.findByText('직전 2주보다 하루 800mg(27%) 줄었어요 · 직전엔 많음')).toBeInTheDocument();
    expect(screen.getByText('기준 안')).toBeInTheDocument();
    first.unmount();
    // 직전 2주에 기록이 모자라 판정이 안 나왔으면 견주지 않는다.
    answer({ status: 'insufficient', rows: [kcal(2000), row(3000, 130)] });
    const second = renderAt(`/meal/stories/${story.slug}?s=2`);
    expect(await screen.findByText('2,200mg')).toBeInTheDocument();
    expect(screen.queryByText(/직전 2주보다/)).not.toBeInTheDocument();
    second.unmount();
    // 10% 안쪽이면 말하지 않는다.
    answer({ status: 'ok', rows: [kcal(2000), row(2350, 102)] });
    const third = renderAt(`/meal/stories/${story.slug}?s=2`);
    expect(await screen.findByText('2,200mg')).toBeInTheDocument();
    expect(screen.queryByText(/직전 2주보다/)).not.toBeInTheDocument();
    third.unmount();
    // 기록량이 다르면(직전 2주의 하루 열량이 훨씬 많다) 말하지 않는다 — 덜 적은 것을 '줄었어요'로 읽지 않게.
    answer({ status: 'ok', rows: [kcal(2800), row(3000, 130)] });
    renderAt(`/meal/stories/${story.slug}?s=2`);
    expect(await screen.findByText('2,200mg')).toBeInTheDocument();
    expect(screen.queryByText(/직전 2주보다/)).not.toBeInTheDocument();
  });

  it('내 기준이 장면의 기준 숫자와 다르면(나이·성별) 어느 기준인지 밝힌다 — 같으면 그냥 기준의 N%', async () => {
    useAuthStore.setState({ token: 't', user, isGuest: false });
    const row = (amount: number, percent: number) => ({
      key: 'sodium',
      unit: 'mg',
      intakePerDay: 2200,
      percent,
      status: percent > 100 ? 'high' : 'ok',
      recordGap: false,
      reference: { kind: 'cdrr', amount, ear: null },
    });
    // 65~74세의 기준은 2,100mg — 장면의 성인 기준(2,300)과 다르다.
    server.use(http.get(STATS_NUTRIENTS_URL, () => HttpResponse.json({ status: 'ok', rows: [row(2100, 105)] })));
    const first = renderAt(`/meal/stories/${story.slug}?s=2`);
    expect(await screen.findByText('내 기준 2,100mg의 105%')).toBeInTheDocument();
    first.unmount();
    // 내 기준이 장면의 숫자와 같으면 되풀이하지 않는다. 지킨 나트륨 기준은 '충분'이 아니라 '기준 안'.
    server.use(http.get(STATS_NUTRIENTS_URL, () => HttpResponse.json({ status: 'ok', rows: [row(2300, 96)] })));
    renderAt(`/meal/stories/${story.slug}?s=2`);
    expect(await screen.findByText('기준의 96%')).toBeInTheDocument();
    expect(screen.queryByText(/내 기준/)).not.toBeInTheDocument();
    expect(screen.getByText('기준 안')).toBeInTheDocument();
  });

  it('내 평균이 기준 안 — 글로 보기 칩도 충분이 아니라 기준 안', async () => {
    useAuthStore.setState({ token: 't', user, isGuest: false });
    server.use(
      http.get(STATS_NUTRIENTS_URL, () =>
        HttpResponse.json({
          status: 'ok',
          rows: [{ key: 'sodium', unit: 'mg', intakePerDay: 1850, percent: 80, status: 'ok', recordGap: false, reference: { kind: 'cdrr', amount: 2300 } }],
        }),
      ),
    );
    renderAt(`/meal/stories/${story.slug}?s=2`);
    expect(await screen.findByText('1,850mg')).toBeInTheDocument();
    expect(screen.getByText('기준 안')).toBeInTheDocument();
    expect(screen.queryByText('충분')).not.toBeInTheDocument();
    expect(screen.getByText('소금 약 4.6g')).toBeInTheDocument();
  });

  it('이 레시피로 기록 — 비로그인은 로그인으로(돌아올 주소), 로그인하면 레시피 음식으로 새 기록 draft 를 채워 입력 화면으로', async () => {
    renderAt(`/meal/stories/${story.slug}?s=4`);
    fireEvent.click(await screen.findByRole('button', { name: '로그인하고 이 레시피로 기록' }));
    expect(screen.getByTestId('where')).toHaveTextContent(`/login?next=${encodeURIComponent(`/meal/stories/${story.slug}?s=4`)}`);
  });

  it('이 레시피로 기록(로그인) — 음식을 받아 draft 에 담고 /meal/new 로 간다', async () => {
    useAuthStore.setState({ token: 't', user, isGuest: false });
    await setMealDraftPrincipal('u1');
    useMealDraftStore.getState().clear();
    server.use(
      http.post(`${LIST_URL}/${story.slug}/food`, () =>
        HttpResponse.json({ foodId: 'food-1', name: '저염 토마토 스파게티', dishType: 'noodle' }),
      ),
    );
    renderAt(`/meal/stories/${story.slug}?s=4`);
    fireEvent.click(await screen.findByRole('button', { name: '이 레시피로 기록' }));
    expect(await screen.findByText('새 기록 화면')).toBeInTheDocument();
    const items = useMealDraftStore.getState().items;
    expect(items.map((i) => [i.name, i.foodId, i.source])).toEqual([['저염 토마토 스파게티', 'food-1', 'catalog']]);
  });

  it('목록(로그인 전) — 식단의 공개 얼굴: 게시본 카드(주제·장면 수)와 로그인하고 기록하기, 식단 메뉴(셸)는 없다', async () => {
    server.use(http.get(LIST_URL, () => HttpResponse.json({ items: [listItem(), listItem({ slug: 'draft-x', status: 'draft', title: '초안 이야기' })] })));
    renderAt('/meal/stories');
    const card = await screen.findByRole('link', { name: /시험 나트륨 이야기/ });
    expect(card).toHaveAttribute('href', `/meal/stories/${story.slug}`);
    // 머리말이 없는 응답(표지 없는 원고)은 주제 이름으로.
    expect(card).toHaveTextContent('나트륨 줄이기 · 4장면');
    expect(screen.getByRole('link', { name: /초안 이야기/ })).toHaveTextContent('초안');
    expect(screen.getByRole('link', { name: '로그인하고 식단 기록하기' })).toHaveAttribute('href', `/login?next=${encodeURIComponent('/meal')}`);
    expect(screen.queryByRole('navigation', { name: '식단' })).not.toBeInTheDocument();
  });

  it('목록 카드의 이름은 그 편의 머리말 — 주제(열량 줄이기)가 같은 두 편도 카드가 구분된다', async () => {
    const kcal = { nutrient: 'kcal', direction: 'reduce' };
    server.use(
      http.get(LIST_URL, () =>
        HttpResponse.json({
          items: [
            listItem({ slug: 'noodles', title: '곤약면·두부면으로 국수 열량 줄이기', topic: kcal, kicker: '국수 열량 줄이기' }),
            listItem({ slug: 'rice', title: '곤약밥으로 밥 열량 줄이기', topic: kcal, kicker: '밥 열량 줄이기' }),
          ],
        }),
      ),
    );
    renderAt('/meal/stories');
    const noodles = await screen.findByRole('link', { name: /곤약면·두부면으로/ });
    expect(noodles).toHaveTextContent('국수 열량 줄이기 · 4장면');
    const rice = screen.getByRole('link', { name: /곤약밥으로/ });
    expect(rice).toHaveTextContent('밥 열량 줄이기 · 4장면');
    // 사진 없는 편의 큰 글 상자도 머리말 — 두 카드 어디에도 주제 이름만 덩그러니 있지 않다.
    expect(screen.getAllByText('국수 열량 줄이기')).toHaveLength(1);
    expect(screen.getAllByText('밥 열량 줄이기')).toHaveLength(1);
    expect(screen.queryByText('열량 줄이기')).not.toBeInTheDocument();
  });

  it('로그인 전 — 건강식단 말고 다른 식단 주소는 로그인으로', async () => {
    renderAt('/meal/records');
    expect(await screen.findByText('로그인 화면')).toBeInTheDocument();
  });

  it("나가는 단추는 왼쪽 위 하나 — 주소로 바로 들어왔으면 '건강식단'(목록으로), 닫기(✕)와 따로 있던 목록 링크는 없다", async () => {
    server.use(http.get(LIST_URL, () => HttpResponse.json({ items: [listItem()] })));
    renderAt(`/meal/stories/${story.slug}`);
    expect(await screen.findByRole('heading', { name: '시험 표지 제목' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '건강식단' })).not.toBeInTheDocument();
    // 로그인 전에는 식단 셸(사이드 메뉴)이 없다 — 전체 화면.
    expect(screen.queryByRole('navigation', { name: '식단' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '건강식단' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/meal/stories');
    expect(await screen.findByRole('link', { name: /시험 나트륨 이야기/ })).toBeInTheDocument();
  });

  it("목록에서 들어왔으면 나가는 단추는 '뒤로' — 누르면 보던 목록으로, Esc 도 같다", async () => {
    server.use(http.get(LIST_URL, () => HttpResponse.json({ items: [listItem()] })));
    renderAt('/meal/stories');
    fireEvent.click(await screen.findByRole('link', { name: /시험 나트륨 이야기/ }));
    expect(await screen.findByRole('heading', { name: '시험 표지 제목' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    expect(await screen.findByRole('link', { name: /시험 나트륨 이야기/ })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/meal/stories');

    fireEvent.click(screen.getByRole('link', { name: /시험 나트륨 이야기/ }));
    await screen.findByRole('heading', { name: '시험 표지 제목' });
    fireEvent.keyDown(screen.getByRole('region', { name: story.title }), { key: 'Escape' });
    expect(await screen.findByRole('link', { name: /시험 나트륨 이야기/ })).toBeInTheDocument();
  });

  it('없는 스토리 — 찾지 못했다고 하고 목록으로', async () => {
    server.use(http.get(`${LIST_URL}/nope`, () => HttpResponse.json({ message: 'not found' }, { status: 404 })));
    renderAt('/meal/stories/nope');
    expect(await screen.findByText('이야기를 찾지 못했어요.')).toBeInTheDocument();
  });

  it('레시피 전체 보기 — 재료·만드는 법·1인분 영양정보·출처·검수일', async () => {
    renderAt(`/meal/stories/${story.slug}/recipe`);
    expect(await screen.findByRole('heading', { name: '저염 토마토 스파게티' })).toBeInTheDocument();
    const ingredients = screen.getByRole('region', { name: '재료 (1인분)' });
    expect(within(ingredients).getByText('스파게티 건면')).toBeInTheDocument();
    expect(within(ingredients).getByText('80g')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '만드는 법' })).toHaveTextContent('물에 소금 없이 삶아요.');
    const label = screen.getByRole('region', { name: '영양정보' });
    expect(label).toHaveTextContent('481kcal');
    expect(label).toHaveTextContent('99mg');
    expect(screen.getByRole('region', { name: '출처' })).toHaveTextContent('검수 2026-11-09');
  });

  it('레시피의 나가는 단추는 하나 — 주소로 바로 들어왔으면 이 레시피의 이야기로, 이야기로 가는 링크는 제목 아래에', async () => {
    renderAt(`/meal/stories/${story.slug}/recipe`);
    expect(await screen.findByRole('heading', { name: '저염 토마토 스파게티' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /이야기 보기/ })).toHaveAttribute('href', `/meal/stories/${story.slug}`);
    // 예전의 '스토리로'·'건강식단' 두 링크 대신 단추 하나.
    expect(screen.queryByRole('link', { name: '건강식단' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /스토리로/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '이야기' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe(`/meal/stories/${story.slug}`));
  });
});

describe('건강식단 스토리 — 주소', () => {
  it('?s= 가 범위를 넘으면 마지막 장면', async () => {
    server.use(http.get(`${LIST_URL}/${story.slug}`, () => HttpResponse.json(story)));
    renderAt(`/meal/stories/${story.slug}?s=99`);
    expect(await screen.findByRole('heading', { name: '오늘 한 끼로' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '다음 장면' })).toHaveAttribute('aria-disabled', 'true'));
  });

  it('줄 세우기 장면 — 잣대, 줄마다 이름·옆 글·값(못 구한 값은 값 없음), 덧말. 주제가 열량이면 열량 줄이기', async () => {
    const withLineup: MealStoryType = {
      ...story,
      topic: { nutrient: 'kcal', direction: 'reduce' },
      scenes: [
        story.scenes[0]!,
        {
          type: 'lineup',
          title: '면끼리는 비슷해요',
          basis: '삶은 면 100g',
          rows: [
            { label: '쌀국수', sub: null, figure: fig({ value: 132, unit: 'kcal' }), icon: 'ricenoodle', highlight: false },
            { label: '소면', sub: '마른 면 100g', figure: fig({ value: 126, unit: 'kcal', detail: '소면 값은 표시한 제품 4개의 중앙값이에요' }), icon: 'somen', highlight: true },
            { label: '값을 모르는 면', sub: null, figure: fig({ unit: 'kcal' }), icon: null, highlight: false },
            { label: '메밀국수', sub: null, figure: fig({ value: 114, unit: 'kcal', detail: '소면 값은 표시한 제품 4개의 중앙값이에요' }), icon: 'soba', highlight: false },
          ],
          note: '면을 바꿔도 크게 달라지지 않아요.',
        },
        story.scenes[3]!,
      ],
    };
    server.use(http.get(`${LIST_URL}/${story.slug}`, () => HttpResponse.json(withLineup)));
    renderAt(`/meal/stories/${story.slug}?s=2`);
    expect(await screen.findByRole('heading', { name: '면끼리는 비슷해요' })).toBeInTheDocument();
    expect(screen.getByText('삶은 면 100g 기준')).toBeInTheDocument();
    expect(screen.getByText('132kcal')).toBeInTheDocument();
    expect(screen.getByText('126kcal')).toBeInTheDocument();
    expect(screen.getByText('114kcal')).toBeInTheDocument();
    expect(screen.getByText('마른 면 100g')).toBeInTheDocument();
    expect(screen.getAllByText('값 없음')).toHaveLength(1);
    expect(screen.getByText('면을 바꿔도 크게 달라지지 않아요.')).toBeInTheDocument();
    // 같은 덧말은 줄 목록 아래에 한 번만.
    expect(screen.getAllByText('※ 소면 값은 표시한 제품 4개의 중앙값이에요')).toHaveLength(1);
    // 강조한 줄만 표시가 붙는다.
    expect(screen.getByText('소면').closest('li')).toHaveClass('is-highlight');
    expect(screen.getByText('쌀국수').closest('li')).not.toHaveClass('is-highlight');
  });

  it('막대 장면 — 값마다 서버가 단 덧말(표시한 제품 수)은 막대 아래에 한 번만', async () => {
    const detail = '통밀 스파게티의 식이섬유 값은 표시한 제품 4개의 중앙값이에요';
    const withDetail: MealStoryType = {
      ...story,
      scenes: story.scenes.map((s) =>
        s.type === 'bars' ? { ...s, bars: s.bars.map((b) => ({ ...b, figure: { ...b.figure, detail } })) } : s,
      ),
    };
    server.use(http.get(`${LIST_URL}/${story.slug}`, () => HttpResponse.json(withDetail)));
    renderAt(`/meal/stories/${story.slug}?s=3`);
    expect(await screen.findByRole('heading', { name: '같은 스파게티, 다른 나트륨' })).toBeInTheDocument();
    expect(screen.getAllByText(`※ ${detail}`)).toHaveLength(1);
  });
});

describe('건강식단 스토리 — 영상으로 보기', () => {
  const timeline = buildTimeline(story);
  const restore: (() => void)[] = [];
  // jsdom 에 없는 브라우저 기능을 이 묶음에서만 — 영상 재생기는 ResizeObserver 가 있어야 켠다.
  const setWindow = (name: 'ResizeObserver' | 'matchMedia', value: unknown) => {
    Object.defineProperty(window, name, { configurable: true, writable: true, value });
    restore.push(() => Reflect.deleteProperty(window, name));
  };
  const findPlayer = () => screen.findByTestId('remotion-player', {}, { timeout: 5000 });
  const input = () => fake.seen.props?.inputProps as StoryVideoProps;

  beforeEach(() => {
    setWindow(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    fake.reset();
    useAuthStore.setState({ token: null, user: null, isGuest: false });
    server.use(http.get(`${LIST_URL}/${story.slug}`, () => HttpResponse.json(story)));
  });
  afterEach(() => {
    for (const fn of restore.splice(0)) fn();
  });

  it('기본은 영상 — 장면마다 진행 칸, 다음 단추·→ 키·누르기는 그 장면 시작으로 건너뛰어 재생하고, 길게 누르면 멈춘다', async () => {
    renderAt(`/meal/stories/${story.slug}`);
    await findPlayer();
    expect(fake.seen.props).toMatchObject({ durationInFrames: timeline.total, initialFrame: 0, autoPlay: true, initiallyMuted: true, controls: false, fps: 30 });
    expect(input()).toMatchObject({ mine: null, loggedIn: false });
    expect(screen.getByText('1 / 4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이전 장면' })).toHaveAttribute('aria-disabled', 'true');

    // 재생 중 건너뛰기는 seekTo 만 — 다시 트는 건 재생기 몫이다(여기서 또 play() 하면 영상 끝에서 처음부터 돈다).
    fireEvent.click(screen.getByRole('button', { name: '다음 장면' }));
    expect(fake.api.seekTo).toHaveBeenLastCalledWith(chapterSeekFrame(timeline, 1));
    expect(fake.api.play).not.toHaveBeenCalled();
    expect(screen.getByText('2 / 4')).toBeInTheDocument();

    const region = screen.getByRole('region', { name: story.title });
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(fake.api.seekTo).toHaveBeenLastCalledWith(chapterSeekFrame(timeline, 2));
    fireEvent.keyDown(region, { key: 'ArrowLeft' });
    expect(fake.api.seekTo).toHaveBeenLastCalledWith(chapterSeekFrame(timeline, 1));

    // 멈춰 있을 때 건너뛰면 그 장면부터 튼다.
    fireEvent.click(screen.getByRole('button', { name: '멈춤' }));
    expect(fake.api.pause).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(fake.api.seekTo).toHaveBeenLastCalledWith(chapterSeekFrame(timeline, 2));
    expect(fake.api.play).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(region, { key: 'ArrowLeft' });
    expect(fake.api.seekTo).toHaveBeenLastCalledWith(chapterSeekFrame(timeline, 1));

    // 재생이 흘러가면 장면 수·진행 칸이 따라간다(지난 칸은 꽉, 지금 칸은 막 시작).
    act(() => fake.reach(timeline.chapters[2]!.from + TRANSITION_FRAMES));
    expect(screen.getByText('3 / 4')).toBeInTheDocument();
    const fills = [...document.querySelectorAll<HTMLElement>('.msp-seg > i')].map((i) => i.style.transform);
    expect(fills).toEqual(['scaleX(1)', 'scaleX(1)', 'scaleX(0)', 'scaleX(0)']);

    // 누르기 — 왼쪽 30% 는 이전, 나머지는 다음.
    const tap = document.querySelector<HTMLElement>('.msm-tap')!;
    tap.getBoundingClientRect = () => ({ left: 0, top: 0, right: 300, bottom: 600, width: 300, height: 600, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(tap, { clientX: 40, clientY: 200, button: 0 });
    fireEvent.pointerUp(tap, { clientX: 40, clientY: 200, button: 0 });
    expect(fake.api.seekTo).toHaveBeenLastCalledWith(chapterSeekFrame(timeline, 1));
    fireEvent.pointerDown(tap, { clientX: 250, clientY: 200, button: 0 });
    fireEvent.pointerUp(tap, { clientX: 250, clientY: 200, button: 0 });
    expect(fake.api.seekTo).toHaveBeenLastCalledWith(chapterSeekFrame(timeline, 2));

    // 길게 누르면 멈추고, 떼면 다시 — 장면은 그대로.
    const seeks = fake.api.seekTo.mock.calls.length;
    fireEvent.pointerDown(tap, { clientX: 250, clientY: 200, button: 0 });
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(fake.api.pause).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: '재생' })).toBeInTheDocument();
    fireEvent.pointerUp(tap, { clientX: 250, clientY: 200, button: 0 });
    expect(screen.getByRole('button', { name: '멈춤' })).toBeInTheDocument();
    expect(fake.api.seekTo).toHaveBeenCalledTimes(seeks);
  });

  it('?s= 장면에서 시작 — 글로 보기는 지금 장면을 글로(주소에 남긴다), 영상으로 보기로 돌아온다', async () => {
    renderAt(`/meal/stories/${story.slug}?s=3`);
    await findPlayer();
    expect(fake.seen.props).toMatchObject({ initialFrame: chapterSeekFrame(timeline, 2) });
    expect(screen.getByText('3 / 4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '글로 보기' }));
    expect(await screen.findByRole('heading', { name: '같은 스파게티, 다른 나트륨' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent(`/meal/stories/${story.slug}?s=3&view=text`);

    fireEvent.click(screen.getByRole('button', { name: '영상으로 보기' }));
    await findPlayer();
    expect(screen.getByTestId('where')).toHaveTextContent(`/meal/stories/${story.slug}?s=3&view=motion`);
  });

  it('마무리 장면 — 영상 위에 진짜 단추(원고 actions), 다 보면 다시 보기, 로그인 전 기록은 마무리 장면으로 돌아올 주소', async () => {
    renderAt(`/meal/stories/${story.slug}`);
    await findPlayer();
    expect(screen.queryByRole('link', { name: '레시피 전체 보기' })).not.toBeInTheDocument();

    act(() => fake.reach(timeline.total - 1));
    expect(screen.getByText('4 / 4')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '레시피 전체 보기' })).toHaveAttribute('href', `/meal/stories/${story.slug}/recipe`);
    expect(screen.getByRole('button', { name: '공유하기' })).toBeInTheDocument();

    act(() => fake.end());
    fireEvent.click(screen.getByRole('button', { name: '처음부터 다시 보기' }));
    expect(fake.api.seekTo).toHaveBeenLastCalledWith(0);
    act(() => fake.reach(timeline.total - 1));

    fireEvent.click(screen.getByRole('button', { name: '로그인하고 이 레시피로 기록' }));
    expect(screen.getByTestId('where')).toHaveTextContent(`/login?next=${encodeURIComponent(`/meal/stories/${story.slug}?s=4`)}`);
  });

  it('내 값 — 로그인하면 최근 2주 통계 영양소가 영상 입력으로(판정 글자는 영양 탭 라벨, 값 없는 줄은 뺀다)', async () => {
    useAuthStore.setState({ token: 't', user, isGuest: false });
    server.use(
      http.get(STATS_NUTRIENTS_URL, () =>
        HttpResponse.json({
          status: 'ok',
          rows: [
            { key: 'sodium', unit: 'mg', intakePerDay: 3120, percent: 136, status: 'high', recordGap: false, reference: { kind: 'cdrr', amount: 2300 } },
            { key: 'potassium', unit: 'mg', intakePerDay: null, percent: null, status: null, recordGap: false },
          ],
        }),
      ),
    );
    renderAt(`/meal/stories/${story.slug}`);
    await findPlayer();
    await waitFor(() =>
      expect(input()).toMatchObject({
        loggedIn: true,
        mine: { sodium: { value: 3120, unit: 'mg', percent: 136, standard: 2300, statusLabel: '많음', over: true } },
      }),
    );
    expect(Object.keys(input().mine ?? {})).toEqual(['sodium']);
  });

  it('다른 탭·앱으로 가면 멈추고 돌아오면 이어 튼다 — 멈춰 둔 영상은 돌아와도 그대로 멈춰 있다', async () => {
    const setVisibility = (state: 'hidden' | 'visible') => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    restore.push(() => Reflect.deleteProperty(document, 'visibilityState'));
    renderAt(`/meal/stories/${story.slug}`);
    await findPlayer();

    act(() => setVisibility('hidden'));
    expect(fake.api.pause).toHaveBeenCalledTimes(1);
    act(() => setVisibility('visible'));
    expect(fake.api.play).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '멈춤' }));
    expect(fake.api.pause).toHaveBeenCalledTimes(2);
    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    expect(fake.api.pause).toHaveBeenCalledTimes(2);
    expect(fake.api.play).toHaveBeenCalledTimes(1);
  });

  it('휴대폰(좁은 화면) — 아래 단추 줄 없이 영상을 키우고, 재생 단추는 위 막대에, 넘기기는 누르기로', async () => {
    setWindow('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    renderAt(`/meal/stories/${story.slug}`);
    await findPlayer();
    expect(screen.queryByRole('button', { name: '다음 장면' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '이전 장면' })).not.toBeInTheDocument();
    expect(screen.getByText('누르면 다음 · 길게 누르면 멈춤')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '멈춤' }));
    expect(fake.api.pause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '재생' })).toBeInTheDocument();

    const tap = document.querySelector<HTMLElement>('.msm-tap')!;
    tap.getBoundingClientRect = () => ({ left: 0, top: 0, right: 300, bottom: 600, width: 300, height: 600, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(tap, { clientX: 250, clientY: 200, button: 0 });
    fireEvent.pointerUp(tap, { clientX: 250, clientY: 200, button: 0 });
    expect(fake.api.seekTo).toHaveBeenLastCalledWith(chapterSeekFrame(timeline, 1));
    // 첫 장면을 벗어나면 손짓 안내는 사라진다.
    expect(screen.queryByText('누르면 다음 · 길게 누르면 멈춤')).not.toBeInTheDocument();
  });

  it('영상 안의 글은 읽기 프로그램에 숨기고(굴러가는 숫자 띠가 통째로 읽힌다), 장면 번호를 소리 내어 알리지 않는다', async () => {
    renderAt(`/meal/stories/${story.slug}`);
    const player = await findPlayer();
    expect(player.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText('1 / 4')).not.toHaveAttribute('aria-live');
    expect(screen.getByText(/장면 글을 읽으려면 ‘글로 보기’/)).toBeInTheDocument();
  });

  it('식단 셸 안의 넓은 화면 — 옆 칸의 지금 장면이 재생을 따라가고, 장면을 누르면 그 장면 시작으로 건너뛴다(로그인 전에는 옆 칸이 없다)', async () => {
    setWindow('matchMedia', (query: string) => ({
      matches: query.includes('min-width: 64rem'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    // 로그인 전 — 전체 화면이라 옆 칸이 없다.
    const guest = renderAt(`/meal/stories/${story.slug}`);
    await findPlayer();
    expect(screen.queryByRole('complementary', { name: '이야기 차례' })).not.toBeInTheDocument();
    guest.unmount();
    fake.reset();

    useAuthStore.setState({ token: 't', user, isGuest: false });
    server.use(http.get(STATS_NUTRIENTS_URL, () => HttpResponse.json({ status: 'insufficient', rows: [] })));
    renderAt(`/meal/stories/${story.slug}`);
    await findPlayer();
    const aside = screen.getByRole('complementary', { name: '이야기 차례' });
    const scenes = () => within(aside).getAllByRole('button').slice(0, story.scenes.length);
    expect(scenes().map((b) => b.getAttribute('aria-current'))).toEqual(['step', null, null, null]);
    act(() => fake.reach(timeline.chapters[2]!.from + TRANSITION_FRAMES));
    expect(scenes().map((b) => b.getAttribute('aria-current'))).toEqual([null, null, 'step', null]);
    fireEvent.click(scenes()[1]!);
    expect(fake.api.seekTo).toHaveBeenLastCalledWith(chapterSeekFrame(timeline, 1));
    // 레시피로 떠날 때는 돌아올 장면을 주소에 적는다(영상은 주소가 재생을 따라가지 않는다).
    fireEvent.click(within(aside).getByRole('link', { name: '레시피 전체 보기' }));
    expect(await screen.findByRole('heading', { name: '저염 토마토 스파게티' }, { timeout: 5000 })).toBeInTheDocument();
    // 이야기에서 왔으니 '뒤로' — 보던 이야기로 돌아간다.
    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toMatch(new RegExp(`^/meal/stories/${story.slug}\\?`)));
  });

  it('동작 줄이기면 글로 보기가 기본 — 영상으로 보기를 고를 수 있다', async () => {
    setWindow('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    renderAt(`/meal/stories/${story.slug}`);
    expect(await screen.findByRole('heading', { name: '시험 표지 제목' })).toBeInTheDocument();
    expect(screen.queryByTestId('remotion-player')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '영상으로 보기' }));
    await findPlayer();
  });
});

describe('건강식단 — 식단 안에서(로그인)', () => {
  // 로그인하면 /meal/stories 는 식단 셸 안의 한 구역 — 메뉴 항목은 없고(홈이 켜진다), 내 14일 판정에 맞는 이야기를 표시해 앞에 둔다.
  const NUTRITION_URL = '/api/v1/meals/nutrition';
  const analysis = (nutrients: unknown[]) => ({
    days: 14,
    analyzedDays: 9,
    status: 'ok',
    insufficientReason: null,
    energy: { intakePerDay: 1900, requirement: 2200, percent: 86 },
    nutrients,
  });
  const sodium = (over: Record<string, unknown> = {}) => ({
    key: 'sodium',
    label: '나트륨',
    unit: 'mg',
    intakePerDay: 3400,
    reference: { kind: 'cdrr', amount: 2300, ear: null },
    upperLimit: null,
    percent: 148,
    coverage: 1,
    status: 'high',
    supplementCandidate: false,
    recordGap: false,
    topSources: [],
    foodSuggestions: [],
    sideSuggestions: [],
    typicalFoods: [],
    note: null,
    ...over,
  });
  const fiberStory = listItem({ slug: 'fiber-up', title: '식이섬유 채우는 이야기', topic: { nutrient: 'fiber', direction: 'increase' }, publishedAt: '2026-11-10' });

  beforeEach(() => {
    useAuthStore.setState({ token: 't', user, isGuest: false });
    // 나트륨 이야기는 초안 — 관리자에게만 오고, 식단 안에서는 받은 대로 보인다('초안' 표시).
    server.use(http.get(LIST_URL, () => HttpResponse.json({ items: [fiberStory, listItem({ status: 'draft' })] })));
  });

  it('식단 셸 안의 목록 — 내 기록에 맞는 이야기(나트륨 많음 → 나트륨 줄이기)를 표시해 앞에, 메뉴에는 건강식단 항목 없이 홈이 켜진다', async () => {
    server.use(http.get(NUTRITION_URL, () => HttpResponse.json(analysis([sodium()]))));
    renderAt('/meal/stories');
    expect(await screen.findByRole('heading', { level: 1, name: '건강식단' }, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText('내 기록 · 나트륨 많음')).toBeInTheDocument();
    const cards = screen.getAllByRole('link', { name: /이야기/ });
    expect(cards.map((c) => c.getAttribute('href'))).toEqual([`/meal/stories/${story.slug}`, '/meal/stories/fiber-up']);
    expect(cards[0]).toHaveTextContent('내 기록 · 나트륨 많음');
    expect(cards[0]).toHaveTextContent('초안');
    expect(cards[1]).not.toHaveTextContent('내 기록');
    // 식단 셸 — 사이드 메뉴와 하단 탭. 건강식단은 메뉴 항목이 아니고, 이 구역에서는 홈이 켜진다.
    const navs = screen.getAllByRole('navigation', { name: '식단' });
    expect(navs).toHaveLength(2);
    for (const nav of navs) {
      expect(within(nav).queryByRole('link', { name: '건강식단' })).not.toBeInTheDocument();
      expect(within(nav).getByRole('link', { name: '홈' })).toHaveAttribute('aria-current', 'page');
    }
    expect(screen.queryByRole('link', { name: '로그인하고 식단 기록하기' })).not.toBeInTheDocument();
  });

  it('이야기 한 편도 식단 셸 안에서 — 사이드 메뉴가 남고(홈이 켜진다) 하단 탭은 없다, 뒤로는 보던 목록으로', async () => {
    server.use(
      http.get(NUTRITION_URL, () => HttpResponse.json(analysis([sodium()]))),
      http.get(`${LIST_URL}/${story.slug}`, () => HttpResponse.json(story)),
      http.get(STATS_NUTRIENTS_URL, () => HttpResponse.json({ status: 'insufficient', rows: [] })),
    );
    renderAt('/meal/stories');
    fireEvent.click(await screen.findByRole('link', { name: /시험 나트륨 이야기/ }, { timeout: 5000 }));
    expect(await screen.findByRole('heading', { name: '시험 표지 제목' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent(`/meal/stories/${story.slug}`);
    // 사이드 메뉴만 — 입력·상세 화면처럼 하단 탭은 숨긴다(휴대폰에서는 재생기가 화면을 가득 쓴다).
    const navs = screen.getAllByRole('navigation', { name: '식단' });
    expect(navs).toHaveLength(1);
    expect(within(navs[0]!).getByRole('link', { name: '홈' })).toHaveAttribute('aria-current', 'page');
    expect(within(navs[0]!).getByRole('link', { name: '기록' })).toHaveAttribute('href', '/meal/records');
    // 이야기 안의 나가는 단추는 '뒤로' 하나(사이트 서랍의 닫기 단추는 셸의 것).
    const region = screen.getByRole('region', { name: story.title });
    expect(within(region).queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    expect(await screen.findByRole('heading', { level: 1, name: '건강식단' })).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: '식단' })).toHaveLength(2);
  });

  it('넓은 화면이면 재생기 옆에 이야기 옆 칸 — 주제·제목, 장면 차례(지금 장면 표시·누르면 그 장면으로), 기록·레시피·공유', async () => {
    // 식단 셸 안 + 64rem 이상에서만 — 좁은 화면·로그인 전에는 그리지 않는다(위 테스트들에는 옆 칸이 없다).
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({ matches: query.includes('min-width: 64rem'), media: query, addEventListener: () => {}, removeEventListener: () => {} }),
    });
    try {
      server.use(
        http.get(`${LIST_URL}/${story.slug}`, () => HttpResponse.json(story)),
        http.get(STATS_NUTRIENTS_URL, () => HttpResponse.json({ status: 'insufficient', rows: [] })),
      );
      renderAt(`/meal/stories/${story.slug}?s=2`);
      const aside = await screen.findByRole('complementary', { name: '이야기 차례' }, { timeout: 5000 });
      expect(within(aside).getByRole('heading', { level: 1, name: story.title })).toBeInTheDocument();
      expect(aside).toHaveTextContent('건강식단 · 나트륨 줄이기');
      const scenes = within(aside).getAllByRole('button', { name: /처음|하루 나트륨|같은 스파게티, 다른 나트륨|오늘 한 끼로/ });
      expect(scenes.map((b) => b.textContent)).toEqual(['1처음', '2하루 나트륨', '3같은 스파게티, 다른 나트륨', '4오늘 한 끼로']);
      expect(scenes.map((b) => b.getAttribute('aria-current'))).toEqual([null, 'step', null, null]);
      // 장면을 누르면 그 장면으로 — 주소와 본문이 따라간다.
      fireEvent.click(scenes[2]!);
      expect(screen.getByTestId('where')).toHaveTextContent(`/meal/stories/${story.slug}?s=3`);
      expect(screen.getByRole('heading', { name: '같은 스파게티, 다른 나트륨' })).toBeInTheDocument();
      expect(within(aside).getAllByRole('button')[2]).toHaveAttribute('aria-current', 'step');
      // 끝까지 보지 않아도 쓸 수 있는 단추.
      expect(within(aside).getByRole('button', { name: '이 레시피로 기록' })).toBeInTheDocument();
      expect(within(aside).getByRole('link', { name: '레시피 전체 보기' })).toHaveAttribute('href', `/meal/stories/${story.slug}/recipe`);
      expect(within(aside).getByRole('button', { name: '공유하기' })).toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(window, 'matchMedia');
    }
  });

  it('레시피 전체 보기도 식단 셸 안에서', async () => {
    server.use(http.get(`${LIST_URL}/${story.slug}`, () => HttpResponse.json(story)));
    renderAt(`/meal/stories/${story.slug}/recipe`);
    expect(await screen.findByRole('heading', { name: '저염 토마토 스파게티' }, { timeout: 5000 })).toBeInTheDocument();
    const navs = screen.getAllByRole('navigation', { name: '식단' });
    expect(navs).toHaveLength(1);
    expect(within(navs[0]!).getByRole('link', { name: '홈' })).toHaveAttribute('aria-current', 'page');
  });

  it('판정이 맞지 않거나 기록 더 필요면 표시하지 않고 서버가 준 차례(새 것 먼저) 그대로', async () => {
    server.use(
      http.get(NUTRITION_URL, () =>
        HttpResponse.json(
          analysis([
            sodium({ status: 'ok', percent: 80, intakePerDay: 1850 }),
            sodium({ key: 'fiber', label: '식이섬유', unit: 'g', status: 'low', recordGap: true, reference: { kind: 'ai', amount: 25, ear: null } }),
          ]),
        ),
      ),
    );
    renderAt('/meal/stories');
    expect(await screen.findByRole('heading', { level: 1, name: '건강식단' }, { timeout: 5000 })).toBeInTheDocument();
    const cards = await screen.findAllByRole('link', { name: /이야기/ });
    expect(cards.map((c) => c.getAttribute('href'))).toEqual(['/meal/stories/fiber-up', `/meal/stories/${story.slug}`]);
    expect(screen.queryByText(/^내 기록 ·/)).not.toBeInTheDocument();
  });
});

describe('영상 글꼴 미리 받기(startStoryFonts)', () => {
  // 글꼴 조각은 글자가 처음 그려질 때 받는다 — 미리 받아 두지 않으면 영상이 도는 중에 제목 글꼴이 바뀐다.
  const withFonts = () => {
    const pending: (() => void)[] = [];
    const load = vi.fn((_font: string, _text?: string) => new Promise<unknown[]>((resolve) => pending.push(() => resolve([]))));
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
    return { load, finish: () => pending.splice(0).forEach((fn) => fn()) };
  };
  // jsdom 은 바깥 CSS 를 받지 않는다 — 글꼴 CSS 가 다 왔다고 알린다.
  const stylesheetsArrive = () => {
    for (const link of document.head.querySelectorAll('link[rel="stylesheet"]')) link.dispatchEvent(new Event('load'));
  };
  afterEach(() => {
    Reflect.deleteProperty(document, 'fonts');
    vi.useRealTimers();
  });

  it('글꼴 API 가 없으면 기다리지 않는다', () => {
    expect(startStoryFonts({ ...story, slug: 'font-none' }).ready).toBe(true);
  });

  it('글꼴 CSS 가 온 뒤 스토리 글자로 두 글꼴을 받고, 다 받으면 준비됐다고 알린다 — 같은 스토리는 한 번만', async () => {
    const fonts = withFonts();
    const entry = startStoryFonts({ ...story, slug: 'font-ok' });
    const told = vi.fn();
    entry.subscribe(told);
    expect(entry.ready).toBe(false);
    expect(fonts.load).not.toHaveBeenCalled();

    stylesheetsArrive();
    await waitFor(() => expect(fonts.load).toHaveBeenCalledTimes(2));
    expect(fonts.load.mock.calls.map((c) => c[0])).toEqual(['700 100px "Wanted Sans Variable"', '700 100px Gaegu']);
    // 원고 글자와 장면 틀의 고정 문구가 함께 간다.
    expect(fonts.load.mock.calls[1]![1]).toContain('시험 표지 제목');
    expect(fonts.load.mock.calls[1]![1]).toContain('값 없음');
    expect(entry.ready).toBe(false);

    fonts.finish();
    await waitFor(() => expect(entry.ready).toBe(true));
    expect(told).toHaveBeenCalledTimes(1);
    expect(startStoryFonts({ ...story, slug: 'font-ok' })).toBe(entry);
    expect(fonts.load).toHaveBeenCalledTimes(2);
  });

  it('글꼴이 늦으면 1.5초만 기다리고 영상을 시작한다', () => {
    vi.useFakeTimers();
    withFonts();
    const entry = startStoryFonts({ ...story, slug: 'font-slow' });
    vi.advanceTimersByTime(1400);
    expect(entry.ready).toBe(false);
    vi.advanceTimersByTime(200);
    expect(entry.ready).toBe(true);
  });
});

describe('영상의 내 값(toMotionMine)', () => {
  const result = (rows: unknown[], status: 'ok' | 'insufficient' = 'ok') =>
    ({ status, rows }) as unknown as Parameters<typeof toMotionMine>[0];

  it('기록이 모자라면 빈 값, 부족이어도 기록 공백이면 기록 더 필요', () => {
    expect(
      toMotionMine(result([{ key: 'sodium', unit: 'mg', intakePerDay: 900, percent: 39, status: 'ok', recordGap: false }], 'insufficient')),
    ).toEqual({});
    expect(toMotionMine(result([{ key: 'fiber', unit: 'g', intakePerDay: 9, percent: 36, status: 'low', recordGap: true }]))).toEqual({
      fiber: { value: 9, unit: 'g', percent: 36, standard: null, statusLabel: '기록 더 필요', over: false, change: null },
    });
  });

  it('직전 2주를 받았으면 변화 한 줄(짧게)을 싣는다 — 10% 넘게 달라졌고 직전도 판정이 나왔을 때만', () => {
    const row = (intakePerDay: number, recordGap = false) => ({ key: 'fiber', unit: 'g', intakePerDay, coverage: 1, percent: 60, status: 'low', recordGap });
    const kcal = (intakePerDay: number) => ({ key: 'kcal', unit: 'kcal', intakePerDay, coverage: 1, percent: null, status: null, recordGap: false });
    expect(toMotionMine(result([kcal(1900), row(12.7)]), result([kcal(2000), row(10.6)])).fiber?.change).toBe('직전 2주보다 20% 늘었어요');
    expect(toMotionMine(result([kcal(1900), row(10.9)]), result([kcal(2000), row(10.6)])).fiber?.change).toBeNull();
    expect(toMotionMine(result([kcal(1900), row(12.7)]), result([kcal(2000), row(10.6)], 'insufficient')).fiber?.change).toBeNull();
    // 기록량이 다르거나(하루 열량 15% 넘게), 열량을 모르거나, 어느 쪽이 '기록 더 필요'면 말하지 않는다.
    expect(toMotionMine(result([kcal(1900), row(12.7)]), result([kcal(1500), row(10.6)])).fiber?.change).toBeNull();
    expect(toMotionMine(result([row(12.7)]), result([row(10.6)])).fiber?.change).toBeNull();
    expect(toMotionMine(result([kcal(1900), row(12.7)]), result([kcal(2000), row(10.6, true)])).fiber?.change).toBeNull();
    // 직전 기간에 그 영양소 줄이 없거나 아직 못 받았으면(늦게 온다) 변화 없이 값만.
    expect(toMotionMine(result([kcal(1900), row(12.7)]), result([kcal(2000)])).fiber?.change).toBeNull();
    expect(toMotionMine(result([kcal(1900), row(12.7)]), undefined).fiber).toMatchObject({ value: 12.7, change: null });
  });

  it('나트륨이 기준 안이면 충분이 아니라 기준 안 — 이보다 적게인 기준(cdrr)만, 다른 영양소의 충분은 그대로', () => {
    const mine = toMotionMine(
      result([
        { key: 'sodium', unit: 'mg', intakePerDay: 1850, percent: 80, status: 'ok', recordGap: false, reference: { kind: 'cdrr', amount: 2300 } },
        { key: 'protein', unit: 'g', intakePerDay: 70, percent: 108, status: 'ok', recordGap: false, reference: { kind: 'rni', amount: 65 } },
      ]),
    );
    expect(mine.sodium).toMatchObject({ statusLabel: '기준 안', over: false, standard: 2300 });
    expect(mine.protein).toMatchObject({ statusLabel: '충분', standard: 65 });
  });
});
