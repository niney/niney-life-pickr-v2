import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setMealDraftPrincipal, useAuthStore, useMealDraftStore } from '@repo/shared';
import { toLocalDateKey } from '@repo/utils';
import { server } from '~/test/msw';
import { prepareMealEntry } from './mealDraftStart';
import { legacyMealPath } from './mealPaths';
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
    expect(await screen.findByRole('button', { name: '제육볶음' })).toBeInTheDocument();
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
