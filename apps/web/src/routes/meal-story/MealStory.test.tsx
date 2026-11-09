import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { MealStoryFigureType, MealStoryType } from '@repo/api-contract';
import { setMealDraftPrincipal, useAuthStore, useMealDraftStore } from '@repo/shared';
import { server } from '~/test/msw';
import MealStoryApp from './MealStoryApp';

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
    ingredients: [{ label: '스파게티 건면', grams: 80, note: '소금 없이 삶기', food: '스파게티(건면)' }],
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
});
