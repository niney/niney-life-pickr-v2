import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setMealDraftPrincipal, useAuthStore, useMealDraftStore } from '@repo/shared';
import { toLocalDateKey } from '@repo/utils';
import { server } from '~/test/msw';
import { prepareMealEntry } from './mealDraftStart';
import { MEAL_SECTION_PATHS, legacyMealPath, mealPanelKindOf } from './mealPaths';
import { MealHomePage } from './MealHomePage';
import { MealPageHeader } from './MealPageHeader';
import { MealShell } from './MealShell';

// 식단 하위 사이트(2026-11-08 리뉴얼) — 예전 주소 넘기기, 홈에서 새 기록 시작, 홈 대시보드, 셸의 하단 탭 규칙.

const ENTRIES_URL = '/api/v1/meals';
const CALENDAR_URL = '/api/v1/meals/calendar';
const STATS_URL = '/api/v1/meals/stats';
const NUTRITION_URL = '/api/v1/meals/nutrition';
const CONTEXT_URL = '/api/v1/meals/recommendations/context';
const FREQUENT_URL = '/api/v1/meals/items/frequent';
const SKIPS_URL = '/api/v1/meals/skips';
const SKIPS_BATCH_URL = '/api/v1/meals/skips/batch';
const STORIES_URL = '/api/v1/meal-stories';

const signIn = () =>
  useAuthStore.setState({
    token: 't',
    user: {
      id: 'u1',
      email: 'u@x.com',
      role: 'USER',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    isGuest: false,
  });

describe('legacyMealPath — 예전 /me/meals 주소', () => {
  it('탭은 구역 주소로, 나머지 쿼리는 그대로, 입력·상세·수정은 같은 뒷부분으로 넘긴다', () => {
    expect(legacyMealPath('/me/meals', '')).toBe('/meal');
    expect(legacyMealPath('/me/meals/', '?tab=list')).toBe('/meal/records');
    expect(legacyMealPath('/me/meals', '?tab=calendar')).toBe('/meal/calendar');
    expect(legacyMealPath('/me/meals', '?tab=recommend')).toBe('/meal/recommend');
    expect(legacyMealPath('/me/meals', '?tab=preference&from=push')).toBe(
      '/meal/settings?from=push',
    );
    expect(legacyMealPath('/me/meals', '?tab=모름')).toBe('/meal');
    expect(legacyMealPath('/me/meals/new', '?slot=dinner')).toBe('/meal/new?slot=dinner');
    expect(legacyMealPath('/me/meals/e1', '')).toBe('/meal/e1');
    expect(legacyMealPath('/me/meals/e1/edit', '')).toBe('/meal/e1/edit');
  });
});

describe('건강식단 목록 주소(/meal/stories)', () => {
  it('식단의 한 구역이다 — 기록 상세 패널로 열지 않고(stories 는 기록 id 가 아니다) 하단 탭이 보인다', () => {
    expect(mealPanelKindOf('/meal/stories')).toBeNull();
    expect(MEAL_SECTION_PATHS.has('/meal/stories')).toBe(true);
    // 기록 상세는 그대로.
    expect(mealPanelKindOf('/meal/e1')).toBe('detail');
  });
});

describe('prepareMealEntry — 홈에서 새 기록 시작', () => {
  beforeEach(async () => {
    signIn();
    await setMealDraftPrincipal('u1');
    useMealDraftStore.getState().clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    useMealDraftStore.getState().clear();
  });

  it('새로 열면 그 끼니·그 끼니의 보통 시각으로 시작하고 빈 음식 줄을 하나 둔다', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 8, 15, 10)); // 오후 3시 — 지금 끼니는 간식
    prepareMealEntry({ slot: 'dinner' });
    const draft = useMealDraftStore.getState();
    expect(draft.entryId).toBeNull();
    expect(draft.slot).toBe('dinner');
    const at = new Date(draft.eatenAt);
    expect([at.getHours(), at.getMinutes()]).toEqual([19, 0]);
    expect(draft.eatenDate).toBe('2026-11-08');
    expect(draft.items.map((i) => i.name)).toEqual(['']);
  });

  it('자주 먹은 음식으로 시작하면 그 음식을 넣고, 쓰던 새 기록에는 같은 음식을 두 번 넣지 않는다', () => {
    const quick = {
      name: '김치찌개',
      foodId: 'f1',
      dishType: 'stew' as const,
      mainIngredient: 'pork' as const,
      cuisine: 'korean' as const,
      isMain: true,
      portion: null,
      servings: null,
      portionSource: null,
      count: 5,
      lastEatenDate: '2026-11-01',
      from: 'history' as const,
    };
    prepareMealEntry({ quick, slot: 'lunch' });
    expect(useMealDraftStore.getState().items.map((i) => i.name)).toEqual(['김치찌개']);
    prepareMealEntry({ quick, slot: 'dinner' });
    const draft = useMealDraftStore.getState();
    expect(draft.items.map((i) => i.name)).toEqual(['김치찌개']);
    // 쓰던 새 기록이면 그 기록에 이어 쓰고 끼니만 고른 쪽으로 바꾼다.
    expect(draft.slot).toBe('dinner');
  });
});

describe('MealHomePage — 식단 홈', () => {
  const today = toLocalDateKey(new Date());
  const nutrient = (over: Record<string, unknown>) => ({
    key: 'calcium',
    label: '칼슘',
    unit: 'mg',
    intakePerDay: 268,
    reference: { kind: 'rni', amount: 700, ear: 550 },
    upperLimit: 2500,
    percent: 38,
    coverage: 1,
    status: 'low',
    supplementCandidate: true,
    recordGap: false,
    topSources: [],
    foodSuggestions: [],
    sideSuggestions: [],
    typicalFoods: [],
    note: null,
    ...over,
  });

  beforeEach(async () => {
    signIn();
    await setMealDraftPrincipal('u1');
    useMealDraftStore.getState().clear();
    server.use(
      http.get(STORIES_URL, () => HttpResponse.json({ items: [] })),
      http.get(ENTRIES_URL, () =>
        HttpResponse.json({
          items: [
            {
              id: 'e1',
              eatenAt: `${today}T03:10:00.000Z`,
              eatenDate: today,
              slot: 'lunch',
              mealType: null,
              placeId: null,
              placeName: null,
              memo: null,
              source: 'manual',
              originRecommendationId: null,
              items: [
                {
                  id: 'i1',
                  name: '김치찌개',
                  foodId: 'f1',
                  dishType: 'stew',
                  mainIngredient: 'pork',
                  cuisine: 'korean',
                  portion: null,
                  servings: null,
                  portionSource: null,
                  isMain: true,
                  confidence: null,
                  recognitionDishId: null,
                  selectedCandidateRank: null,
                  catalogMatchedBy: 'food_id',
                  catalogMatchScore: 1,
                  source: 'manual',
                  sortOrder: 0,
                  kcal: 450,
                  proteinG: 20,
                  sodiumMg: 1800,
                  nutritionFrom: null,
                  nutritionBasis: 'direct',
                },
              ],
              photos: [],
              recognition: null,
              photoPurgedAt: null,
              createdAt: `${today}T03:10:00.000Z`,
              updatedAt: `${today}T03:10:00.000Z`,
            },
          ],
          nextCursor: null,
        }),
      ),
      http.get(NUTRITION_URL, () =>
        HttpResponse.json({
          from: today,
          to: today,
          days: 14,
          analyzedDays: 9,
          mealCount: 20,
          profile: { sex: null, ageGroup: '30-49', basis: 'default' },
          energy: { intakePerDay: 1446, requirement: 1900, percent: 76 },
          coverage: 1,
          status: 'ok',
          insufficientReason: null,
          nutrients: [
            nutrient({
              key: 'sodium',
              label: '나트륨',
              unit: 'mg',
              intakePerDay: 3343,
              percent: 145,
              status: 'high',
            }),
            nutrient({}),
            nutrient({
              key: 'protein',
              label: '단백질',
              unit: 'g',
              intakePerDay: 70,
              percent: 127,
              status: 'ok',
            }),
          ],
          notMeasured: [],
          notes: [],
        }),
      ),
      http.get(CONTEXT_URL, () =>
        HttpResponse.json({
          entryCount: 20,
          recentFoods: [],
          preference: null,
          latest: {
            id: 'r1',
            targetDate: today,
            targetSlot: 'dinner',
            items: [{ name: '삼치구이', reason: '구이를 2주간 안 드셨어요.', tags: [] }],
            summary: '',
            status: 'done',
            model: null,
            promptVersion: 6,
            notice: null,
            sides: [{ name: '파프리카', nutrients: ['비타민 C'] }],
            feedback: null,
            candidateRatings: [],
            createdAt: `${today}T09:00:00.000Z`,
          },
        }),
      ),
      http.get(CALENDAR_URL, ({ request }) =>
        HttpResponse.json({
          month: new URL(request.url).searchParams.get('month'),
          days: [{ date: today, count: 1, slots: ['lunch'], hasPhoto: false, kcal: 450 }],
        }),
      ),
      http.get(STATS_URL, () =>
        HttpResponse.json({
          streakDays: 3,
          insights: [
            {
              key: 'record_frequency',
              tone: 'info',
              title: '최근 기록 빈도가 늘었어요',
              detail: '최근 7일은 12끼를 기록했어요.',
            },
          ],
        }),
      ),
      http.get(FREQUENT_URL, () =>
        HttpResponse.json({
          items: [
            {
              name: '제육볶음',
              foodId: 'f2',
              dishType: 'stir_fry',
              mainIngredient: 'pork',
              cuisine: 'korean',
              isMain: true,
              portion: null,
              servings: null,
              portionSource: null,
              count: 4,
              lastEatenDate: '2026-11-01',
              from: 'history',
            },
          ],
        }),
      ),
    );
  });
  afterEach(() => useMealDraftStore.getState().clear());

  const renderHome = () =>
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/meal']}>
          <Routes>
            <Route path="/meal" element={<MealHomePage />} />
            <Route path="/meal/new" element={<p>새 기록 화면</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

  it('오늘 끼니·열량, 다음 끼니 추천과 곁들임, 영양정보 라벨(많음 먼저), 최근 7일, 습관, 자주 먹은 음식을 보인다', async () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^\d+월 \d+일 .요일$/);
    expect(await screen.findByText('김치찌개')).toBeInTheDocument();
    expect(screen.getByText('450kcal')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '하루 필요 열량 대비' })).toHaveAttribute(
      'aria-valuenow',
      '24',
    );

    expect(await screen.findByText('삼치구이')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '저녁 추천' })).toBeInTheDocument();
    expect(screen.getByText(/파프리카\(비타민 C\)/)).toBeInTheDocument();

    const label = (await screen.findByRole('heading', { name: '영양정보' })).closest('section')!;
    const rows = within(label)
      .getAllByText(/^(나트륨|칼슘)$/)
      .map((el) => el.textContent);
    expect(rows).toEqual(['나트륨', '칼슘']);
    expect(within(label).getByText('많음')).toBeInTheDocument();
    expect(within(label).getByText('부족')).toBeInTheDocument();
    expect(within(label).getByText('충분 1개')).toBeInTheDocument();

    expect(await screen.findByText('최근 기록 빈도가 늘었어요')).toBeInTheDocument();
    expect(screen.getByText('3일')).toBeInTheDocument();
    // 기록이 있으면 시작 안내는 없다.
    expect(screen.queryByRole('heading', { name: '식단 시작하기' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '제육볶음' })).toBeInTheDocument();
  });

  describe('건강식단 한 줄', () => {
    const storyItem = (over: Record<string, unknown>) => ({
      slug: 'sodium-tomato-pasta',
      status: 'published',
      title: '토마토 스파게티로 나트륨 줄이기',
      summary: '요약',
      topic: { nutrient: 'sodium', direction: 'reduce' },
      publishedAt: '2026-01-05',
      coverUrl: null,
      sceneCount: 13,
      recipeFoodId: null,
      ...over,
    });
    const proteinStory = storyItem({ slug: 'protein-up', title: '단백질 채우는 한 끼', topic: { nutrient: 'protein', direction: 'increase' }, publishedAt: today });

    it('이야기가 없으면 자리도 없다', async () => {
      renderHome();
      expect(await screen.findByRole('heading', { name: '영양정보' })).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: '건강식단' })).not.toBeInTheDocument();
    });

    it('내 14일 판정에 맞는 이야기를 먼저 — 나트륨이 많음이면 더 새 이야기가 있어도 나트륨 줄이기, 모두 보기는 식단 안 목록으로', async () => {
      // 서버 차례는 새 것 먼저(단백질 이야기가 더 새 것) — 단백질은 충분이라 맞지 않는다.
      server.use(http.get(STORIES_URL, () => HttpResponse.json({ items: [proteinStory, storyItem({})] })));
      renderHome();
      const line = await screen.findByRole('region', { name: '건강식단' });
      const main = await within(line).findByRole('link', { name: /토마토 스파게티로 나트륨 줄이기/ });
      expect(main).toHaveAttribute('href', '/meal/stories/sodium-tomato-pasta');
      expect(main).toHaveTextContent('건강식단 · 나트륨 많음');
      expect(within(line).getByRole('link', { name: '모두 보기' })).toHaveAttribute('href', '/meal/stories');
    });

    it('맞는 이야기가 없으면 가장 새 이야기 — 게시 30일 안이면 새 이야기', async () => {
      server.use(http.get(STORIES_URL, () => HttpResponse.json({ items: [proteinStory] })));
      renderHome();
      const line = await screen.findByRole('region', { name: '건강식단' });
      const main = within(line).getByRole('link', { name: /단백질 채우는 한 끼/ });
      expect(main).toHaveAttribute('href', '/meal/stories/protein-up');
      expect(main).toHaveTextContent('건강식단 새 이야기');
      expect(within(line).queryByText(/초안/)).not.toBeInTheDocument();
    });

    it('초안뿐이어도(관리자에게만 온다) 들어가는 길이 있다 — 받은 대로 보이고 초안이라고 표시한다', async () => {
      // 메뉴 항목이 없어 홈의 이 줄이 유일한 입구다 — 게시 전 첫 편(초안)에서 이 줄이 안 떠 들어갈 길이 없었다.
      server.use(http.get(STORIES_URL, () => HttpResponse.json({ items: [storyItem({ status: 'draft', publishedAt: today })] })));
      renderHome();
      const line = await screen.findByRole('region', { name: '건강식단' });
      const main = await within(line).findByRole('link', { name: /토마토 스파게티로 나트륨 줄이기/ });
      expect(main).toHaveAttribute('href', '/meal/stories/sodium-tomato-pasta');
      expect(main).toHaveTextContent('건강식단 · 나트륨 많음 · 초안');
      expect(within(line).getByRole('link', { name: '모두 보기' })).toHaveAttribute('href', '/meal/stories');
    });

    it('오래된 이야기뿐이어도 자리는 남는다(예전엔 게시 30일이 지나면 사라졌다)', async () => {
      server.use(http.get(STORIES_URL, () => HttpResponse.json({ items: [storyItem({ slug: 'old', title: '오래된 칼륨 이야기', topic: { nutrient: 'potassium', direction: 'increase' } })] })));
      renderHome();
      const line = await screen.findByRole('region', { name: '건강식단' });
      const main = within(line).getByRole('link', { name: /오래된 칼륨 이야기/ });
      expect(main).toHaveTextContent(/^건강식단오래된 칼륨 이야기/);
      expect(main).not.toHaveTextContent('새 이야기');
    });
  });

  it('최근 기록이 없으면 시작 안내 — 첫 기록·성별·출생연도(넣었으면 표시만)·추천', async () => {
    server.use(
      http.get(CONTEXT_URL, () =>
        HttpResponse.json({
          entryCount: 0,
          recentFoods: [],
          preference: { sex: 'female', birthYear: 1990 },
          latest: null,
        }),
      ),
    );
    renderHome();
    const guide = (await screen.findByRole('heading', { name: '식단 시작하기' })).closest('section')!;
    expect(within(guide).getAllByRole('listitem')).toHaveLength(3);
    expect(within(guide).getByText('넣었어요')).toBeInTheDocument();
    expect(within(guide).queryByRole('link', { name: '설정' })).not.toBeInTheDocument();
    expect(within(guide).getByRole('link', { name: '추천' })).toHaveAttribute('href', '/meal/recommend');
    fireEvent.click(within(guide).getByRole('button', { name: '기록하기' }));
    expect(await screen.findByText('새 기록 화면')).toBeInTheDocument();
  });

  it('빈 끼니 칸을 누르면 그 끼니로 새 기록을 시작한다', async () => {
    renderHome();
    await screen.findByText('김치찌개');
    const dinner = screen.getByText('저녁', { selector: '.meal-slot-label' }).closest('button')!;
    fireEvent.click(dinner);
    expect(await screen.findByText('새 기록 화면')).toBeInTheDocument();
    expect(useMealDraftStore.getState().slot).toBe('dinner');
  });

  it('자주 먹은 음식을 누르면 그 음식을 넣은 새 기록을 시작한다', async () => {
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: '제육볶음' }));
    expect(await screen.findByText('새 기록 화면')).toBeInTheDocument();
    expect(useMealDraftStore.getState().items.map((i) => i.name)).toEqual(['제육볶음']);
  });

  // 어제가 한 끼만 적혀 영양 평균에서 빠지면 빈 끼니를 묻는다(달력의 끼니 칸으로 알아낸다).
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalDateKey(d);
  })();
  const withYesterdayLunch = (handlers: Parameters<typeof server.use> = []) =>
    server.use(
      http.get(CALENDAR_URL, ({ request }) =>
        HttpResponse.json({
          month: new URL(request.url).searchParams.get('month'),
          days: [
            { date: yesterday, count: 1, slots: ['lunch'], hasPhoto: false, kcal: 600 },
            { date: today, count: 1, slots: ['lunch'], hasPhoto: false, kcal: 450 },
          ],
        }),
      ),
      ...handlers,
    );

  it("어제가 한 끼만 적혀 있으면 빈 끼니마다 기록하기·안 먹음 — 기록하기는 어제 그 끼니로 시작한다", async () => {
    withYesterdayLunch([http.get(SKIPS_URL, () => HttpResponse.json({ skips: [] }))]);
    renderHome();
    const nudge = await screen.findByRole('region', { name: '어제 빈 끼니' });
    expect(nudge).toHaveTextContent('어제는 점심만 적혀 있어 영양 평균에서 빠져요.');
    const rows = within(nudge).getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual(['아침기록하기안 먹음', '저녁기록하기안 먹음']);
    // 한 끼만 적힌 날이 어제 하루뿐이면 '한 번에 정리' 줄은 띄우지 않는다(위 묻기로 충분).
    expect(screen.queryByRole('link', { name: '한 번에 정리' })).not.toBeInTheDocument();
    fireEvent.click(within(within(nudge).getAllByRole('listitem')[1]!).getByRole('button', { name: '기록하기' }));
    expect(await screen.findByText('새 기록 화면')).toBeInTheDocument();
    const draft = useMealDraftStore.getState();
    expect([draft.slot, draft.eatenDate]).toEqual(['dinner', yesterday]);
    expect(new Date(draft.eatenAt).getHours()).toBe(19);
  });

  it('지난 2주에 한 끼만 적혀 평균에서 빠진 날이 둘 이상이면 영양 탭 정리(펼친 채)로 가는 한 줄을 띄운다', async () => {
    const daysAgo = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return toLocalDateKey(d);
    };
    server.use(
      http.get(CALENDAR_URL, ({ request }) =>
        HttpResponse.json({
          month: new URL(request.url).searchParams.get('month'),
          days: [
            { date: daysAgo(2), count: 1, slots: ['lunch'], hasPhoto: false, kcal: 600 },
            { date: daysAgo(4), count: 1, slots: ['dinner'], hasPhoto: false, kcal: 700 },
            { date: daysAgo(9), count: 1, slots: ['lunch'], hasPhoto: false, kcal: 500 },
            { date: today, count: 1, slots: ['lunch'], hasPhoto: false, kcal: 450 },
          ],
        }),
      ),
      // 9일 전은 남은 끼니가 모두 '안 먹음'이라 이미 평균에 든다.
      http.get(SKIPS_URL, () =>
        HttpResponse.json({
          skips: [
            { date: daysAgo(9), slot: 'breakfast' },
            { date: daysAgo(9), slot: 'dinner' },
          ],
        }),
      ),
    );
    renderHome();
    const link = await screen.findByRole('link', { name: '한 번에 정리' });
    expect(link).toHaveAttribute('href', '/meal/nutrition?skips=open');
    expect(link.closest('p')).toHaveTextContent('지난 2주에 한 끼만 적혀 영양 평균에서 빠진 날이 2일 있어요.');
  });

  it('안 먹음은 하나만 눌러선 평균에 들지 않아 남은 끼니를 계속 묻고, 다 채우면 알린 뒤 취소할 수 있게 남긴다', async () => {
    let skips: { date: string; slot: string }[] = [];
    const calls: string[] = [];
    withYesterdayLunch([
      http.get(SKIPS_URL, () => HttpResponse.json({ skips })),
      http.put(SKIPS_URL, async ({ request }) => {
        const body = (await request.json()) as { date: string; slot: string };
        calls.push(`PUT ${body.date} ${body.slot}`);
        skips = [...skips, body];
        return HttpResponse.json(body);
      }),
      http.delete(SKIPS_URL, ({ request }) => {
        const q = new URL(request.url).searchParams;
        calls.push(`DELETE ${q.get('date')} ${q.get('slot')}`);
        skips = skips.filter((s) => !(s.date === q.get('date') && s.slot === q.get('slot')));
        return new HttpResponse(null, { status: 204 });
      }),
    ]);
    renderHome();
    const nudge = await screen.findByRole('region', { name: '어제 빈 끼니' });
    const rowsOf = () => within(nudge).getAllByRole('listitem').map((li) => li.textContent);
    // 저녁만 표시 — 아침을 몰라 아직 빠진다.
    fireEvent.click(within(within(nudge).getAllByRole('listitem')[1]!).getByRole('button', { name: '안 먹음' }));
    expect(await within(nudge).findByRole('button', { name: '저녁 안 먹음 취소' })).toBeInTheDocument();
    expect(nudge).toHaveTextContent('어제는 점심만 적혀 있어 영양 평균에서 빠져요.');
    expect(rowsOf()).toEqual(['아침기록하기안 먹음', '저녁안 먹음취소']);
    // 아침까지 표시하면 평균에 든다 — 알리고, 고칠 수 있게 표시를 남긴다.
    fireEvent.click(within(within(nudge).getAllByRole('listitem')[0]!).getByRole('button', { name: '안 먹음' }));
    expect(await within(nudge).findByText('어제도 영양 평균에 들어가요.')).toBeInTheDocument();
    expect(rowsOf()).toEqual(['아침안 먹음취소', '저녁안 먹음취소']);
    expect(calls).toEqual([`PUT ${yesterday} dinner`, `PUT ${yesterday} breakfast`]);
    // 하나를 취소하면 다시 묻는다.
    fireEvent.click(within(nudge).getByRole('button', { name: '저녁 안 먹음 취소' }));
    expect(await within(nudge).findByText('어제는 점심만 적혀 있어 영양 평균에서 빠져요.')).toBeInTheDocument();
    expect(rowsOf()).toEqual(['아침안 먹음취소', '저녁기록하기안 먹음']);
    expect(calls).toEqual([`PUT ${yesterday} dinner`, `PUT ${yesterday} breakfast`, `DELETE ${yesterday} dinner`]);
  });

  it('남은 끼니가 둘 이상이면 [남은 끼니 모두 안 먹음] 한 번으로 다 채워 평균에 넣는다', async () => {
    let skips: { date: string; slot: string }[] = [];
    const posted: unknown[] = [];
    withYesterdayLunch([
      http.get(SKIPS_URL, () => HttpResponse.json({ skips })),
      http.post(SKIPS_BATCH_URL, async ({ request }) => {
        const body = (await request.json()) as { set?: { date: string; slot: string }[] };
        posted.push(body);
        skips = [...skips, ...(body.set ?? [])];
        return HttpResponse.json({ added: body.set ?? [], cleared: 0 });
      }),
    ]);
    renderHome();
    const nudge = await screen.findByRole('region', { name: '어제 빈 끼니' });
    fireEvent.click(within(nudge).getByRole('button', { name: '남은 끼니 모두 안 먹음' }));
    expect(await within(nudge).findByText('어제도 영양 평균에 들어가요.')).toBeInTheDocument();
    expect(posted).toEqual([
      {
        set: [
          { date: yesterday, slot: 'breakfast' },
          { date: yesterday, slot: 'dinner' },
        ],
      },
    ]);
    expect(within(nudge).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '아침안 먹음취소',
      '저녁안 먹음취소',
    ]);
    // 다 채운 뒤엔 '모두' 단추가 없다.
    expect(within(nudge).queryByRole('button', { name: '남은 끼니 모두 안 먹음' })).not.toBeInTheDocument();
  });

  it('어제 표시해 둔 끼니가 하나뿐이면 다시 열어도 남은 끼니를 묻는다', async () => {
    withYesterdayLunch([http.get(SKIPS_URL, () => HttpResponse.json({ skips: [{ date: yesterday, slot: 'breakfast' }] }))]);
    renderHome();
    const nudge = await screen.findByRole('region', { name: '어제 빈 끼니' });
    expect(within(nudge).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '아침안 먹음취소',
      '저녁기록하기안 먹음',
    ]);
  });
});

describe('MealShell — 셸', () => {
  beforeEach(signIn);

  const renderShell = (path: string) =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<MealShell />}>
              <Route
                path="/meal/records"
                element={<MealPageHeader title="기록" group="records" />}
              />
              <Route path="/meal/new" element={<p>입력</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

  it('구역 화면엔 하단 탭(기록 탭은 목록·달력에서 켜짐)과 휴대폰 묶음 전환을, 입력 화면엔 하단 탭을 두지 않는다', () => {
    renderShell('/meal/records');
    const navs = screen.getAllByRole('navigation', { name: '식단' });
    expect(navs).toHaveLength(2); // 사이드 메뉴 + 하단 탭
    const tabbar = navs[1]!;
    expect(within(tabbar).getByRole('link', { name: '기록' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(tabbar).getByRole('link', { name: '기록하기' })).toHaveAttribute(
      'href',
      '/meal/new',
    );
    const sub = screen.getByRole('navigation', { name: '기록 보기' });
    expect(within(sub).getByRole('link', { name: '달력' })).toHaveAttribute(
      'href',
      '/meal/calendar',
    );
  });

  it('입력 화면에서는 하단 탭을 숨긴다', () => {
    renderShell('/meal/new');
    expect(screen.getByText('입력')).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: '식단' })).toHaveLength(1);
  });
});
