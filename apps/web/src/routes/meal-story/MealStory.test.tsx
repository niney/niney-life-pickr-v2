import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { MealStoryFigureType, MealStoryType } from '@repo/api-contract';
import { setMealDraftPrincipal, useAuthStore, useMealDraftStore } from '@repo/shared';
import { server } from '~/test/msw';
import MealStoryApp from './MealStoryApp';
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

// 건강식단 스토리(웹) — 누구나 보는 목록·전체 화면 재생기·레시피 전체 보기. 숫자는 서버가 계산해 주고(그대로 그린다),
// 내 평균은 로그인했을 때만 통계 영양소에서, [이 레시피로 기록]은 레시피 음식을 받아 새 기록 draft 를 채운다.

const LIST_URL = '/api/v1/meal-stories';
const STATS_NUTRIENTS_URL = '/api/v1/meals/stats/nutrients';

const fig = (over: Partial<MealStoryFigureType> = {}): MealStoryFigureType => ({
  value: null,
  unit: 'mg',
  basis: null,
  detail: null,
  sources: [],
  my: null,
  ...over,
});

const story: MealStoryType = {
  slug: 'sodium-test',
  status: 'published',
  title: '시험 나트륨 이야기',
  summary: '시험 요약',
  topic: { nutrient: 'sodium', direction: 'reduce' },
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
          figure: fig({ value: 2300, basis: '성인 하루 기준(이보다 적게)', detail: '65~74세 2,100mg · 75세 이상 1,700mg', sources: ['kdri-2020'] }),
        },
        { label: '내 최근 2주 하루 평균', figure: fig({ unit: '', basis: '내 최근 2주 하루 평균', my: 'sodium' }) },
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
        <Routes>
          <Route path="/meal/stories/*" element={<MealStoryApp />} />
          <Route path="/meal/new" element={<p>새 기록 화면</p>} />
          <Route path="/login" element={<p>로그인 화면</p>} />
        </Routes>
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
    const login = screen.getByRole('link', { name: '로그인' });
    expect(login).toHaveAttribute('href', `/login?next=${encodeURIComponent(`/meal/stories/${story.slug}?s=2`)}`);

    fireEvent.keyDown(screen.getByRole('region', { name: story.title }), { key: 'ArrowRight' });
    expect(screen.getByRole('heading', { name: '같은 스파게티, 다른 나트륨' })).toBeInTheDocument();
    expect(screen.getByText('953mg')).toBeInTheDocument();
    expect(screen.getByText('97mg')).toBeInTheDocument();
    expect(screen.getByText('190kcal')).toBeInTheDocument();
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
    expect(asked).toHaveLength(1);
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

  it('목록 — 게시본 카드(주제·장면 수), 없는 스토리는 안내', async () => {
    server.use(http.get(LIST_URL, () => HttpResponse.json({ items: [listItem(), listItem({ slug: 'draft-x', status: 'draft', title: '초안 이야기' })] })));
    renderAt('/meal/stories');
    const card = await screen.findByRole('link', { name: /시험 나트륨 이야기/ });
    expect(card).toHaveAttribute('href', `/meal/stories/${story.slug}`);
    expect(card).toHaveTextContent('나트륨 줄이기 · 4장면');
    expect(screen.getByRole('link', { name: /초안 이야기/ })).toHaveTextContent('초안');
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
});

describe('건강식단 스토리 — 주소', () => {
  it('?s= 가 범위를 넘으면 마지막 장면', async () => {
    server.use(http.get(`${LIST_URL}/${story.slug}`, () => HttpResponse.json(story)));
    renderAt(`/meal/stories/${story.slug}?s=99`);
    expect(await screen.findByRole('heading', { name: '오늘 한 끼로' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '다음 장면' })).toHaveAttribute('aria-disabled', 'true'));
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
            { key: 'sodium', unit: 'mg', intakePerDay: 3120, percent: 136, status: 'high', recordGap: false },
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
        mine: { sodium: { value: 3120, unit: 'mg', percent: 136, statusLabel: '많음', over: true } },
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
      fiber: { value: 9, unit: 'g', percent: 36, statusLabel: '기록 더 필요', over: false },
    });
  });
});
