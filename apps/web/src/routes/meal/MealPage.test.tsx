import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { MEAL_RECOMMENDATIONS_DELETE_CONFIRMATION } from '@repo/api-contract';
import { setMealDraftPrincipal, useAuthStore, useMealDraftStore } from '@repo/shared';
import { mealDateTitle, toLocalDateKey } from '@repo/utils';
import { server } from '~/test/msw';
import MealApp from './MealApp';

// 내 식단(웹, 식단 셸 /meal/*) — 목록·달력·통계·추천·영양·설정 화면. 입력은 별도 화면(MealEntryFormPage)이고 여기서는
// 그리로 가는 링크와 추천→draft 연결만 본다. 탭 전환 시 어떤 요청이 나가는지까지 계약으로 고정한다
// (onUnhandledRequest: 'error' 라 핸들러를 안 깔면 즉시 실패한다).

const ENTRIES_URL = '/api/v1/meals';
const CALENDAR_URL = '/api/v1/meals/calendar';
const STATS_URL = '/api/v1/meals/stats';
const STATS_NUTRITION_URL = '/api/v1/meals/stats/nutrition';
const STATS_NUTRIENTS_URL = '/api/v1/meals/stats/nutrients';
const SKIPS_URL = '/api/v1/meals/skips';

// 통계 — 묶음별 영양 몫(나트륨: 찌개 60% · 김치(반찬) 30% · 밥 10%).
const groupNutrient = (key: string, label: string, unit: string, amount: number, share: number) => ({
  key,
  label,
  unit,
  amount,
  share,
});
const statsNutrition = {
  from: '2026-07-24',
  to: '2026-08-22',
  itemCount: 5,
  totals: [{ key: 'kcal', label: '열량', unit: 'kcal', amount: 1500 }],
  // 내 평균 열량 구성.
  composition: { carb: 0.5, protein: 0.2, fat: 0.3, count: 5 },
  byDishType: [
    {
      key: 'stew',
      label: '찌개·전골',
      mainCount: 2,
      sideCount: 0,
      knownCount: 2,
      macroKnownCount: 2,
      kcalPerItem: 300,
      nutrients: [
        groupNutrient('kcal', '열량', 'kcal', 600, 0.4),
        groupNutrient('carb', '탄수화물', 'g', 40, 0.2),
        groupNutrient('protein', '단백질', 'g', 30, 0.3),
        groupNutrient('fat', '지방', 'g', 25, 0.5),
        groupNutrient('sodium', '나트륨', 'mg', 3600, 0.6),
      ],
      highlights: [groupNutrient('calcium', '칼슘', 'mg', 400, 0.55)],
      foods: [{ name: '김치찌개', count: 2 }],
      composition: { carb: 0.3, protein: 0.2, fat: 0.5, count: 2 },
    },
    {
      key: 'rice',
      label: '밥·죽',
      mainCount: 1,
      sideCount: 0,
      knownCount: 1,
      macroKnownCount: 0,
      kcalPerItem: 750,
      nutrients: [groupNutrient('kcal', '열량', 'kcal', 750, 0.5), groupNutrient('sodium', '나트륨', 'mg', 600, 0.1)],
      highlights: [],
      foods: [{ name: '공기밥', count: 1 }],
    },
    {
      key: 'kimchi',
      label: '김치·절임·젓갈',
      mainCount: 0,
      sideCount: 2,
      knownCount: 2,
      macroKnownCount: 2,
      kcalPerItem: 75,
      nutrients: [groupNutrient('kcal', '열량', 'kcal', 150, 0.1), groupNutrient('sodium', '나트륨', 'mg', 1800, 0.3)],
      highlights: [],
      foods: [{ name: '배추김치', count: 2 }],
    },
  ],
  byMainIngredient: [],
  byCuisine: [],
};

// 통계 — 영양소별 하루 평균(영양 탭과 같은 셈을 이 기간에). 6일 중 두 끼 이상 4일(8/20 은 한 끼, 8/21 은 기록 없음).
const nutrientRow = (over: Record<string, unknown>) => ({
  group: 'core',
  parent: null,
  coverage: 1,
  reference: null,
  percent: null,
  energyShare: null,
  energyRange: null,
  status: null,
  recordGap: false,
  note: null,
  daily: [],
  topFoods: [],
  ...over,
});
const statsNutrients = {
  from: '2026-08-17',
  to: '2026-08-22',
  days: 6,
  analyzedDays: 4,
  status: 'ok',
  insufficientReason: null,
  profile: { sex: null, ageGroup: '30-49', basis: 'default' },
  dates: ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22'],
  meals: [2, 2, 3, 1, 0, 2],
  skipped: [0, 0, 0, 0, 0, 0],
  // 평균에 든 날 — 서버 판정(두 끼 이상, 또는 한 끼에 남은 끼니가 모두 '안 먹음').
  counted: [true, true, true, false, false, true],
  rows: [
    nutrientRow({
      key: 'kcal',
      label: '열량',
      unit: 'kcal',
      intakePerDay: 1600,
      reference: { kind: 'eer', amount: 1900 },
      percent: 84,
      daily: [1500, 1700, 1600, 600, null, 1600],
    }),
    nutrientRow({
      key: 'carb',
      label: '탄수화물',
      unit: 'g',
      intakePerDay: 210,
      coverage: 0.9,
      energyShare: 0.52,
      energyRange: { min: 0.55, max: 0.65 },
    }),
    nutrientRow({ key: 'sugar', label: '당류', unit: 'g', parent: 'carb', intakePerDay: 30, coverage: 0.4, energyShare: 0.07 }),
    nutrientRow({
      key: 'protein',
      label: '단백질',
      unit: 'g',
      intakePerDay: 55,
      reference: { kind: 'rni', amount: 65 },
      percent: 85,
      status: 'borderline',
      energyShare: 0.14,
      energyRange: { min: 0.07, max: 0.2 },
    }),
    nutrientRow({
      key: 'fat',
      label: '지방',
      unit: 'g',
      intakePerDay: 60,
      coverage: 0.9,
      energyShare: 0.33,
      energyRange: { min: 0.15, max: 0.3 },
    }),
    nutrientRow({
      key: 'saturatedFat',
      label: '포화지방',
      unit: 'g',
      parent: 'fat',
      intakePerDay: 18,
      coverage: 0.8,
      energyShare: 0.1,
      energyRange: { min: null, max: 0.07 },
    }),
    nutrientRow({
      key: 'sodium',
      label: '나트륨',
      unit: 'mg',
      intakePerDay: 3400,
      reference: { kind: 'cdrr', amount: 2300 },
      percent: 148,
      status: 'high',
      daily: [3600, 3900, 2100, 1200, null, 4000],
      topFoods: [
        { name: '김치찌개', share: 0.6, count: 2 },
        { name: '배추김치', share: 0.3, count: 2 },
      ],
    }),
    nutrientRow({ key: 'cholesterol', label: '콜레스테롤', unit: 'mg', intakePerDay: 250, coverage: 0.8 }),
    // 비타민·무기질은 판정 순이 아니게 넣는다 — 화면이 영양 탭처럼 부족 → 기록 더 필요 → 충분으로 다시 늘어놓는다.
    nutrientRow({
      key: 'vitaminC',
      label: '비타민 C',
      unit: 'mg',
      group: 'micro',
      intakePerDay: 120,
      reference: { kind: 'rni', amount: 100 },
      percent: 120,
      status: 'ok',
    }),
    nutrientRow({
      key: 'iron',
      label: '철',
      unit: 'mg',
      group: 'micro',
      intakePerDay: 8.5,
      reference: { kind: 'rni', amount: 10 },
      percent: 85,
      status: 'borderline',
      recordGap: true,
      note: '기록이 빠진 끼니를 채우면 기준에 닿을 수 있는 수준이에요.',
    }),
    nutrientRow({
      key: 'calcium',
      label: '칼슘',
      unit: 'mg',
      group: 'micro',
      intakePerDay: 420,
      reference: { kind: 'rni', amount: 700 },
      percent: 60,
      status: 'low',
      daily: [400, 450, 410, 100, null, 420],
    }),
  ],
  notes: ['성별·출생연도를 설정하면 내 기준으로 더 정확히 봐요(지금은 30-49세 성인 기준).'],
};
// 사진은 JWT 가 필요해 blob 으로 받는다 — 토큰 경로도 핸들러가 필요하다.
const PHOTO_THUMB_URL = '/api/v1/meals/photos/:token/thumb';

const entry = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'e1',
  eatenAt: '2026-08-20T03:10:00.000Z',
  eatenDate: '2026-08-20',
  slot: 'lunch',
  mealType: 'dining_out',
  placeId: null,
  placeName: '숯토리',
  memo: null,
  source: 'photo',
  items: [
    {
      id: 'i1',
      name: '김치찌개',
      foodId: 'f1',
      dishType: 'stew',
      mainIngredient: 'pork',
      cuisine: 'korean',
      portion: 'normal',
      isMain: true,
      confidence: 0.8,
      source: 'recognized',
      sortOrder: 0,
    },
    {
      id: 'i2',
      name: '김치',
      foodId: null,
      dishType: null,
      mainIngredient: null,
      cuisine: null,
      portion: null,
      isMain: false,
      confidence: null,
      source: 'recognized',
      sortOrder: 1,
    },
  ],
  photos: [],
  recognition: null,
  createdAt: '2026-08-20T03:20:00.000Z',
  updatedAt: '2026-08-20T03:20:00.000Z',
  ...over,
});

const stats = {
  from: '2026-07-24',
  to: '2026-08-22',
  entryCount: 3,
  itemCount: 5,
  recordedDays: 2,
  totalDays: 30,
  bySlot: [{ key: 'lunch', label: '점심', count: 3 }],
  byDishType: [
    { key: 'stew', label: '찌개·전골', count: 2 },
    { key: 'rice', label: '밥·죽', count: 1 },
  ],
  byMainIngredient: [{ key: 'pork', label: '돼지고기', count: 2 }],
  byCuisine: [{ key: 'korean', label: '한식', count: 3 }],
  byMealType: [{ key: 'dining_out', label: '외식', count: 3 }],
  topFoods: [{ name: '김치찌개', count: 2, lastEatenDate: '2026-08-21' }],
  repeatRate: 0.25,
  streakDays: 2,
  insights: [
    {
      key: 'weekly-activity',
      tone: 'positive',
      title: '최근 기록 빈도가 늘었어요',
      detail: '최근 7일은 4일·6끼, 직전 7일은 2일·3끼를 기록했어요.',
    },
  ],
  nutrition: {
    avgKcalPerDay: 780,
    avgProteinGPerDay: 24.5,
    avgSodiumMgPerDay: 2100,
    coverage: 0.5,
    itemsWithNutrition: 2,
  },
  recommendation: { chosenCount: 2, loggedCount: 1, ratedCount: 1, acceptanceRate: 0.5 },
  byDate: [
    { date: '2026-08-21', count: 1 },
    { date: '2026-08-22', count: 2 },
  ],
};

// path — 식단 셸 안의 화면 주소(기본: 기록 목록).
const renderPage = (
  client: QueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  path = '/meal/records',
) =>
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/meal/*" element={<MealApp />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

// 응답을 테스트가 풀어 줄 때까지 붙잡아 두는 문 — "응답이 오기 전" 화면을 본다.
const deferred = () => {
  let open: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open: () => open() };
};

describe('MealPage', () => {
  beforeEach(() => {
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
  });

  it('기록 탭 — 목록을 날짜 머리글과 함께 보여준다', async () => {
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [entry()], nextCursor: null })),
    );
    renderPage();
    expect(await screen.findByText('김치찌개')).toBeInTheDocument();
    expect(screen.getByText(/곁들임 김치/)).toBeInTheDocument();
    expect(screen.getByText('점심', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/숯토리/)).toBeInTheDocument();
    expect(screen.getByText(/2026-08-20/)).toBeInTheDocument();
  });

  it('기록이 없으면 웹에서 바로 첫 끼니를 적는 링크를 준다', async () => {
    server.use(http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })));
    renderPage();
    expect(await screen.findByRole('link', { name: '첫 끼니 기록하기' })).toHaveAttribute(
      'href',
      '/meal/new',
    );
    // 셸의 사이드 메뉴·하단 탭 '기록하기'도 새 기록으로 간다.
    for (const link of screen.getAllByRole('link', { name: /^기록하기$/ })) {
      expect(link).toHaveAttribute('href', '/meal/new');
    }
  });

  it('기록 카드는 상세로 가는 링크다', async () => {
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [entry()], nextCursor: null })),
    );
    renderPage();
    const food = await screen.findByText('김치찌개');
    expect(food.closest('a')).toHaveAttribute('href', '/meal/e1');
  });

  it('더 보기 — opaque nextCursor 를 그대로 넘기고 앞 페이지를 유지한다', async () => {
    const cursors: (string | null)[] = [];
    const opaqueCursor = 'v2:2026-08-20T03:10:00.000Z|e1';
    server.use(
      http.get(ENTRIES_URL, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        cursors.push(cursor);
        return HttpResponse.json(
          cursor
            ? {
                items: [
                  entry({
                    id: 'e2',
                    eatenDate: '2026-08-19',
                    items: [{ ...entry().items[0], id: 'i2', name: '비빔밥' }],
                  }),
                ],
                nextCursor: null,
              }
            : { items: [entry()], nextCursor: opaqueCursor },
        );
      }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '더 보기' }));
    await waitFor(() => expect(cursors).toContain(opaqueCursor));
    expect(screen.getByText('김치찌개')).toBeInTheDocument();
    expect(await screen.findByText('비빔밥')).toBeInTheDocument();
  });

  it('달력 탭 — 월 요약을 받고 날짜를 고르면 그날 기록을 조회한다', async () => {
    const dayQueries: string[] = [];
    const limits: (string | null)[] = [];
    server.use(
      http.get(ENTRIES_URL, ({ request }) => {
        const params = new URL(request.url).searchParams;
        const from = params.get('from');
        limits.push(params.get('limit'));
        if (from) dayQueries.push(from);
        return HttpResponse.json({ items: from ? [entry()] : [], nextCursor: null });
      }),
      http.get(CALENDAR_URL, ({ request }) => {
        const month = new URL(request.url).searchParams.get('month') ?? '';
        return HttpResponse.json({
          month,
          days: [{ date: `${month}-05`, count: 2, slots: ['lunch', 'dinner'], hasPhoto: true }],
        });
      }),
    );
    renderPage(undefined, '/meal/calendar');
    const day = await screen.findByRole('button', { name: /월 5일,/ });
    expect(limits).not.toContain('0');
    expect(dayQueries).toHaveLength(0);
    fireEvent.click(day);
    await waitFor(() => expect(dayQueries.length).toBeGreaterThan(0));
    expect(dayQueries[0]).toMatch(/-05$/);
  });

  it('통계 탭 — 기간 전환이 from/to 를 바꾼다', async () => {
    const ranges: string[] = [];
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(STATS_URL, ({ request }) => {
        const url = new URL(request.url);
        ranges.push(`${url.searchParams.get('from')}~${url.searchParams.get('to')}`);
        return HttpResponse.json(stats);
      }),
      http.get(STATS_NUTRITION_URL, () => HttpResponse.json(statsNutrition)),
      http.get(STATS_NUTRIENTS_URL, () => HttpResponse.json(statsNutrients)),
    );
    renderPage(undefined, '/meal/stats');
    expect(await screen.findByText('찌개·전골')).toBeInTheDocument();
    expect(screen.getByText('2일')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('주간 인사이트')).toBeInTheDocument();
    expect(screen.getByText('최근 기록 빈도가 늘었어요')).toBeInTheDocument();
    expect(screen.getByText(/기록 기반 관찰/)).toBeInTheDocument();
    // 정리(2026-11-08): 추천 반응은 추천 탭으로, 날짜별 끼니 수는 영양소의 열량 흐름에 맡겼다. 주간 인사이트는 영양소 다음.
    expect(screen.queryByText('추천 수락률')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '날짜별 끼니 수' })).not.toBeInTheDocument();
    const nutrientsCard = await screen.findByRole('region', { name: '영양소 · 1달' });
    const insightsHead = screen.getByRole('heading', { name: '주간 인사이트' });
    expect(nutrientsCard.compareDocumentPosition(insightsHead) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const before = ranges.length;
    fireEvent.click(screen.getByRole('button', { name: '1주' }));
    await waitFor(() => expect(ranges.length).toBeGreaterThan(before));
    expect(ranges[ranges.length - 1]).not.toBe(ranges[0]);
  });

  it('사진이 있으면 인증 fetch 로 썸네일을 받아 그린다', async () => {
    server.use(
      http.get(ENTRIES_URL, () =>
        HttpResponse.json({
          items: [
            entry({
              photos: [
                { token: 'a'.repeat(8), width: 40, height: 30, byteSize: 100, sortOrder: 0 },
              ],
            }),
          ],
          nextCursor: null,
        }),
      ),
      http.get(PHOTO_THUMB_URL, () =>
        HttpResponse.arrayBuffer(new ArrayBuffer(8), { headers: { 'Content-Type': 'image/jpeg' } }),
      ),
    );
    renderPage();
    expect(await screen.findByAltText('식단 사진')).toBeInTheDocument();
  });

  // 회귀: 조건이 바뀔 때마다 화면 전체가 로딩으로 바뀌어 검색 입력칸이 언마운트됐고(한 글자마다 포커스 유실),
  // 키 입력마다 요청이 나갔다.
  it('검색 — 타이핑하는 동안 입력칸이 그대로 있고(포커스 유지) 요청은 타이핑이 멈춘 뒤 한 번만 나간다', async () => {
    const queries: (string | null)[] = [];
    server.use(
      http.get(ENTRIES_URL, ({ request }) => {
        const q = new URL(request.url).searchParams.get('q');
        queries.push(q);
        return HttpResponse.json({
          items: q
            ? [entry({ id: 'e2', items: [{ ...entry().items[0], id: 'i9', name: '김치볶음밥' }] })]
            : [entry()],
          nextCursor: null,
        });
      }),
    );
    renderPage();
    const input = await screen.findByPlaceholderText('음식·장소·메모 검색');
    input.focus();
    fireEvent.change(input, { target: { value: '김' } });
    fireEvent.change(input, { target: { value: '김치' } });
    fireEvent.change(input, { target: { value: '김치볶' } });
    // 같은 DOM 노드가 그대로 — 언마운트됐다면 새 노드로 바뀌고 포커스는 body 로 떨어진다.
    expect(screen.getByPlaceholderText('음식·장소·메모 검색')).toBe(input);
    expect(input).toHaveFocus();
    // 새 응답이 올 때까지 이전 목록이 남아 있다.
    expect(screen.getByText('김치찌개')).toBeInTheDocument();

    expect(await screen.findByText('김치볶음밥')).toBeInTheDocument();
    expect(screen.queryByText('김치찌개')).not.toBeInTheDocument();
    // 중간 글자('김', '김치')로는 요청하지 않았다.
    expect(queries).toEqual([null, '김치볶']);
    expect(screen.getByPlaceholderText('음식·장소·메모 검색')).toBe(input);
    expect(input).toHaveFocus();

    // 비우는 건 기다리지 않는다 — 곧바로 전체 목록으로 돌아온다.
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByText('김치찌개')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('음식·장소·메모 검색')).toBe(input);
  });

  it('필터 칩을 눌러도 검색·필터 카드는 그대로 있고, 새 응답이 올 때까지 이전 목록을 흐리게 둔다', async () => {
    const gate = deferred();
    server.use(
      http.get(ENTRIES_URL, async ({ request }) => {
        const slot = new URL(request.url).searchParams.get('slot');
        if (slot) await gate.promise;
        return HttpResponse.json({ items: slot ? [] : [entry()], nextCursor: null });
      }),
    );
    renderPage();
    const food = await screen.findByText('김치찌개');
    const input = screen.getByPlaceholderText('음식·장소·메모 검색');
    fireEvent.click(screen.getByRole('button', { name: '저녁' }));
    // 응답 전 — 입력칸은 같은 노드, 이전 목록은 흐리게 남는다.
    await waitFor(() => expect(food.closest('.opacity-60')).not.toBeNull());
    expect(screen.getByPlaceholderText('음식·장소·메모 검색')).toBe(input);
    gate.open();
    expect(await screen.findByText(/조건에 맞는 기록이 없어요/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('음식·장소·메모 검색')).toBe(input);
  });

  it('통계 막대 — 기준을 나트륨으로 바꾸면 몫 순(반찬만인 묶음 포함), 막대를 누르면 그 묶음이 채운 영양 카드', async () => {
    const asked: string[] = [];
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(STATS_URL, () => HttpResponse.json(stats)),
      http.get(STATS_NUTRITION_URL, ({ request }) => {
        asked.push(new URL(request.url).search);
        return HttpResponse.json(statsNutrition);
      }),
      // 막대 위 한 줄과 카드의 많음·부족 표시 — 이 기간 영양소별 하루 평균(영양 탭과 같은 셈). 최근 14일 점검은 부르지
      // 않는다(핸들러가 없어 부르면 실패한다).
      http.get(STATS_NUTRIENTS_URL, () => HttpResponse.json(statsNutrients)),
    );
    renderPage(undefined, '/meal/stats');
    const dish = await screen.findByRole('region', { name: '조리 형태' });
    // 끼니 수(기본) — 통계 API 그대로.
    expect(within(dish).getAllByRole('button').map((b) => b.textContent)).toEqual(['찌개·전골2', '밥·죽1']);
    expect(asked).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: '나트륨' }));
    // 막대는 몫(합 100%)이라 많은지 모른다 — 위에 이 기간 하루 평균과 판정을 붙인다.
    const summary = await screen.findByText(/나트륨 하루 평균/);
    expect(summary).toHaveTextContent('나트륨 하루 평균 3,400mg — 만성질환위험감소섭취량 2,300mg의 148%많음');
    expect(
      screen.getByText(/두 끼 이상 기록한 4일 평균이고, 막대는 고른 기간\(1달\) 먹은 나트륨이 어디서 왔는지예요/),
    ).toBeInTheDocument();
    expect(within(dish).getAllByRole('button').map((b) => b.textContent)).toEqual([
      '찌개·전골60%',
      '김치·절임·젓갈30%',
      '밥·죽10%',
    ]);

    fireEvent.click(within(dish).getByRole('button', { name: /찌개·전골/ }));
    const card = within(dish).getByRole('region', { name: '찌개·전골 영양' });
    expect(within(dish).getByRole('button', { name: /찌개·전골/ })).toHaveAttribute('aria-expanded', 'true');
    expect(within(card).getByText('주식 2번')).toBeInTheDocument();
    // 지방 50%·나트륨 60% 는 열량 몫(40%)의 1.2 배를 넘어 치우친 영양소로 표시된다.
    const rows = within(card).getAllByRole('listitem').filter((li) => li.classList.contains('meal-group-row'));
    expect(rows.map((li) => li.getAttribute('data-over'))).toEqual([null, null, null, 'true', 'true']);
    expect(rows[1]).toHaveTextContent('탄수화물20%');
    expect(within(card).getByText(/칼슘 55%/)).toBeInTheDocument();
    // 열량 구성 — 이 묶음과 내 평균을 탄·단·지 숫자로도(색만으로 읽지 않게).
    expect(within(card).getByText('열량 구성 · 기록 2개')).toBeInTheDocument();
    expect(within(card).getByText('탄 30% · 단 20% · 지 50%')).toBeInTheDocument();
    expect(within(card).getByText('탄 50% · 단 20% · 지 30%')).toBeInTheDocument();
    expect(within(card).getByText('김치찌개 2')).toBeInTheDocument();
    // 이 기간 판정에서 나트륨이 많음이고 이 묶음이 열량 몫보다 크게 채웠으면 문장으로 잇는다(줄 옆 표시는 없다).
    expect(await within(card).findByText(/이 묶음이 60%를 채웠어요/)).toHaveTextContent('나트륨 많음(이 기간) — 이 묶음이 60%를 채웠어요.');
    expect(within(rows[4]!).queryByText('많음')).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(within(dish).queryByRole('region', { name: '찌개·전골 영양' })).not.toBeInTheDocument();
  });

  it('통계 영양소 — 영양 탭과 같은 줄(판정 칩·"양 / 기준 (N%)"·막대), 줄을 누르면 그 줄 아래로 흐름, 비타민·무기질은 판정 순·부족만 펼침', async () => {
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(STATS_URL, () => HttpResponse.json(stats)),
      http.get(STATS_NUTRITION_URL, () => HttpResponse.json(statsNutrition)),
      http.get(STATS_NUTRIENTS_URL, () => HttpResponse.json(statsNutrients)),
    );
    renderPage(undefined, '/meal/stats');
    // 제목에 기간 — 모양이 영양 탭과 같아도 숫자가 다른 까닭(영양 탭은 최근 14일)이 보이게.
    const card = await screen.findByRole('region', { name: '영양소 · 1달' });
    expect(within(card).getByText(/1달 중/)).toHaveTextContent('1달 중 4일 · 끼니 10개');
    expect(within(card).getByRole('link', { name: '설정에서 성별·출생연도 넣기' })).toHaveAttribute(
      'href',
      '/meal/settings',
    );
    const row = (name: RegExp) => within(card).getByRole('button', { name });
    // 위 묶음은 서버 차례 그대로 — 열량, 탄수화물(당류), 단백질, 지방(포화지방), 나트륨, 콜레스테롤.
    const texts = within(card)
      .getAllByRole('button')
      .map((b) => b.textContent ?? '');
    const at = (label: string) => texts.findIndex((t) => t.startsWith(label));
    expect(['열량', '탄수화물', '당류', '단백질', '지방', '포화지방', '나트륨', '콜레스테롤'].map(at)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
    // 섭취기준이 있는 줄은 영양 탭과 같은 판정 칩·문구, 탄수화물·지방은 판정 없이 열량 중 비율과 적정 범위.
    expect(row(/^열량/)).toHaveTextContent('열량1,600kcal / 필요량 1,900kcal (84%)');
    expect(row(/^나트륨/)).toHaveTextContent(
      '나트륨많음3,400mg / 만성질환위험감소섭취량 2,300mg (148%)주로 김치찌개·배추김치에서',
    );
    expect(row(/^단백질/)).toHaveTextContent('단백질조금 부족55g / 권장섭취량 65g (85%)열량의 14% (적정 7~20%)');
    expect(row(/^탄수화물/)).toHaveTextContent('탄수화물210g · 열량의 52% (적정 55~65%)');
    // 값을 아는 기록이 90% 아래면 정보 비율을, 60% 아래면 비율·막대 없이 양과 정보 비율만.
    expect(row(/^포화지방/)).toHaveTextContent('포화지방18g · 열량의 10% (성인 7% 미만)정보 80%');
    expect(row(/^콜레스테롤/)).toHaveTextContent('콜레스테롤250mg정보 80%');
    expect(row(/^당류/)).toHaveTextContent('당류30g정보 40%');
    // 막대 — 기준 대비(0~150%, 판정 색 — 열량은 판정이 없어 먹색), 열량 비율 줄은 범위 막대(띠 = 적정 범위).
    const meter = (name: RegExp) => row(name).querySelector<HTMLElement>('.meal-meter');
    expect(meter(/^열량/)).not.toHaveAttribute('data-tone');
    expect(parseFloat(meter(/^열량/)!.querySelector<HTMLElement>('span')!.style.width)).toBeCloseTo(56); // 84 ÷ 150
    expect(meter(/^나트륨/)).toHaveAttribute('data-tone', 'high');
    expect(meter(/^단백질/)).toHaveAttribute('data-tone', 'borderline');
    const carb = row(/^탄수화물/).querySelector('.meal-range');
    expect(carb?.querySelector('.meal-range-band')).toHaveStyle({ left: '55%', width: '10%' });
    expect(carb?.querySelector('.meal-range-fill')).toHaveStyle({ width: '52%' });
    expect(row(/^포화지방/).querySelector('.meal-range-band')).toHaveStyle({ left: '0%', width: '7%' });
    expect(row(/^당류/).querySelector('.meal-meter, .meal-range')).toBeNull();
    expect(row(/^콜레스테롤/).querySelector('.meal-meter, .meal-range')).toBeNull();
    // 좁은 화면(jsdom) — 처음엔 펼친 줄이 없다.
    expect(within(card).queryByRole('region', { name: '나트륨 흐름' })).not.toBeInTheDocument();

    fireEvent.click(row(/^나트륨/));
    expect(row(/^나트륨/)).toHaveAttribute('aria-expanded', 'true');
    const flow = within(card).getByRole('region', { name: '나트륨 흐름' });
    // 두 끼 이상 기록한 4일 중 기준(2,300mg)을 넘은 날 3일 — 한 끼만 적은 8/20 은 세지 않는다.
    expect(within(flow).getByText('만성질환위험감소섭취량을 넘은 날 — 4일 중 3일')).toBeInTheDocument();
    // 기준선 이름은 막대를 가리지 않게 범례로(흐린 막대 설명과 함께).
    expect(flow.querySelector('.meal-flow-legend')).toHaveTextContent(
      '만성질환위험감소섭취량 2,300mg한 끼만 기록한 날(평균에서 뺌)',
    );
    const bars = flow.querySelectorAll('.meal-flow-bar');
    expect([...bars].map((b) => b.getAttribute('data-state'))).toEqual([
      'full',
      'full',
      'full',
      'partial',
      'empty',
      'full',
    ]);
    fireEvent.click(bars[3]!);
    expect(within(flow).getByText('8/20 · 1,200mg · 1끼 — 한 끼만 기록해 평균에서 뺐어요')).toBeInTheDocument();
    expect(within(flow).getByText('나트륨을 많이 준 음식')).toBeInTheDocument();
    expect(within(flow).getByText('60% · 2번')).toBeInTheDocument();
    fireEvent.click(row(/^나트륨/));
    expect(within(card).queryByRole('region', { name: '나트륨 흐름' })).not.toBeInTheDocument();

    // 비타민·무기질 — 영양 탭처럼 판정 순, 부족·많음만 펼쳐 두고 나머지는 판정 수와 함께 접는다.
    expect(row(/^칼슘/).querySelector('.meal-meter')).toHaveAttribute('data-tone', 'low');
    expect(within(card).queryByRole('button', { name: /^철/ })).not.toBeInTheDocument();
    const more = within(card).getByRole('button', { name: /나머지 2가지 더 보기/ });
    expect(more).toHaveTextContent('나머지 2가지 더 보기기록 더 필요 1 · 충분 1');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(more).toHaveTextContent(/^접기$/);
    const after = within(card)
      .getAllByRole('button')
      .map((b) => b.textContent ?? '');
    expect(after.findIndex((t) => t.startsWith('철'))).toBeLessThan(after.findIndex((t) => t.startsWith('비타민 C')));
    // '기록 더 필요'는 점선 칩, '충분'은 초록 칩·막대 — 칩 글자가 늘 붙어 색만으로 말하지 않는다.
    expect(within(row(/^철/)).getByText('기록 더 필요')).toHaveAttribute('data-dashed', 'true');
    expect(row(/^철/)).toHaveTextContent('기록이 빠진 끼니를 채우면 기준에 닿을 수 있는 수준이에요.');
    expect(within(row(/^비타민 C/)).getByText('충분')).toBeInTheDocument();
    expect(row(/^비타민 C/).querySelector('.meal-meter')).toHaveAttribute('data-tone', 'ok');
    fireEvent.click(row(/^칼슘/));
    const calcium = within(card).getByRole('region', { name: '칼슘 흐름' });
    // 비타민·무기질은 주마다 — 6일은 주가 하나라 흐름 대신 안내.
    expect(within(calcium).getByText(/1주는 평균이 하나라 흐름은 1달·3달에서 보여요/)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: '영양' })).toHaveAttribute('href', '/meal/nutrition');
  });
  it('통계 영양소 — 직전 같은 길이 기간보다 10% 넘게 달라진 줄에만 변화 한 줄(판정이 바뀌면 직전 판정도), 직전 기록이 모자라면 알리기만', async () => {
    const shift = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return toLocalDateKey(d);
    };
    const today = shift(0);
    const asked: string[] = [];
    let previousOk = true;
    // 직전 기간 — 나트륨 2,200mg(충분) → 이번 3,400mg(많음), 열량 1,400 → 1,600, 탄수화물 180 → 210, 지방 56 → 60(7%, 10% 안쪽),
    // 단백질 54 → 55. 당류는 정보 40%라 견주지 않는다.
    const changed: Record<string, Record<string, unknown>> = {
      sodium: { intakePerDay: 2200, percent: 96, status: 'ok' },
      kcal: { intakePerDay: 1400 },
      carb: { intakePerDay: 180 },
      fat: { intakePerDay: 56 },
      protein: { intakePerDay: 54 },
      sugar: { intakePerDay: 10 },
    };
    const before = {
      ...statsNutrients,
      analyzedDays: 5,
      rows: statsNutrients.rows.map((r) => ({ ...r, ...changed[(r as unknown as { key: string }).key] })),
    };
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(STATS_URL, () => HttpResponse.json(stats)),
      http.get(STATS_NUTRITION_URL, () => HttpResponse.json(statsNutrition)),
      http.get(STATS_NUTRIENTS_URL, ({ request }) => {
        const url = new URL(request.url);
        const to = url.searchParams.get('to');
        asked.push(`${url.searchParams.get('from')}~${to}`);
        if (to === today) return HttpResponse.json(statsNutrients);
        return HttpResponse.json(
          previousOk
            ? before
            : { ...before, status: 'insufficient', analyzedDays: 2, insufficientReason: '기록이 모자라요.' },
        );
      }),
    );
    renderPage(undefined, '/meal/stats');
    const card = await screen.findByRole('region', { name: '영양소 · 1달' });
    expect(await within(card).findByText(/직전 1달\(/)).toHaveTextContent(
      '직전 1달(평균에 든 날 5일)보다 하루 평균이 10% 넘게 달라진 영양소는 줄 아래에 적었어요.',
    );
    // 직전 1달 = 이번 30일 바로 앞 30일.
    expect(asked).toContain(`${shift(-59)}~${shift(-30)}`);
    const row = (name: RegExp) => within(card).getByRole('button', { name });
    expect(row(/^나트륨/)).toHaveTextContent('직전 1달보다 하루 1,200mg(55%) 늘었어요 · 직전엔 충분');
    expect(row(/^열량/)).toHaveTextContent('직전 1달보다 하루 200kcal(14%) 늘었어요');
    expect(row(/^탄수화물/)).toHaveTextContent('직전 1달보다 하루 30g(17%) 늘었어요');
    // 10% 안쪽(지방·단백질)·정보가 모자란 줄(당류)·그대로인 줄(칼슘)은 붙이지 않는다.
    expect(row(/^지방/)).not.toHaveTextContent('직전');
    expect(row(/^단백질/)).not.toHaveTextContent('직전');
    expect(row(/^당류/)).not.toHaveTextContent('직전');
    expect(row(/^칼슘/)).not.toHaveTextContent('직전');

    // 직전 기간이 판정을 못 내면(평균에 든 날 4일 미만) 줄마다 견주지 않고 그 사실만 알린다.
    previousOk = false;
    fireEvent.click(screen.getByRole('button', { name: '1주' }));
    const week = await screen.findByRole('region', { name: '영양소 · 1주' });
    expect(await within(week).findByText(/견주지 않았어요/)).toHaveTextContent(
      '직전 1주는 평균에 든 날이 2일뿐이라 견주지 않았어요.',
    );
    expect(asked).toContain(`${shift(-13)}~${shift(-7)}`);
    expect(within(week).getByRole('button', { name: /^나트륨/ })).not.toHaveTextContent('직전');
  });

  it("기록 목록 — 한 끼만 적힌 지난날은 남은 끼니마다 '안 먹음'을 묻고, 다 표시해야 묻기 대신 취소할 수 있는 표시만 남는다", async () => {
    let skips: { date: string; slot: string }[] = [];
    const asked: string[] = [];
    const put: unknown[] = [];
    const deleted: string[] = [];
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [entry()], nextCursor: null })),
      http.get(SKIPS_URL, ({ request }) => {
        asked.push(new URL(request.url).search);
        return HttpResponse.json({ skips });
      }),
      http.put(SKIPS_URL, async ({ request }) => {
        const body = (await request.json()) as { date: string; slot: string };
        put.push(body);
        skips = [...skips, body];
        return HttpResponse.json(body);
      }),
      http.delete(SKIPS_URL, ({ request }) => {
        const q = new URL(request.url).searchParams;
        deleted.push(`${q.get('date')}|${q.get('slot')}`);
        skips = skips.filter((s) => !(s.date === q.get('date') && s.slot === q.get('slot')));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPage();
    const day = await screen.findByRole('region', { name: /8월 20일.* 기록|2026-08-20 기록|기록$/ });
    // 보이는 날짜 묶음의 표시만 받는다.
    await waitFor(() => expect(asked).toContain('?from=2026-08-20&to=2026-08-20'));
    // 점심만 적힌 지난날 — 아침·저녁을 묻는다.
    expect(await within(day).findByText(/한 끼만 적혀 영양 평균에서 빠져요/)).toBeInTheDocument();
    fireEvent.click(within(day).getByRole('button', { name: '저녁 안 먹음' }));
    await waitFor(() => expect(put).toEqual([{ date: '2026-08-20', slot: 'dinner' }]));
    // 저녁만 표시하면 아침을 몰라 아직 빠진다 — 표시(취소 단추)와 함께 남은 아침을 계속 묻는다.
    expect(await within(day).findByRole('button', { name: '저녁 안 먹음 취소' })).toBeInTheDocument();
    expect(within(day).getByText(/한 끼만 적혀 영양 평균에서 빠져요/)).toBeInTheDocument();
    expect(within(day).queryByRole('button', { name: '저녁 안 먹음' })).not.toBeInTheDocument();
    fireEvent.click(within(day).getByRole('button', { name: '아침 안 먹음' }));
    await waitFor(() => expect(put).toHaveLength(2));
    // 남은 끼니를 다 표시하면 평균에 드는 날 — 묻기는 사라지고 취소할 수 있는 표시만 남는다.
    await waitFor(() => expect(within(day).queryByText(/한 끼만 적혀 영양 평균에서 빠져요/)).not.toBeInTheDocument());
    expect(within(day).getByRole('button', { name: '아침 안 먹음 취소' })).toBeInTheDocument();
    fireEvent.click(within(day).getByRole('button', { name: '저녁 안 먹음 취소' }));
    await waitFor(() => expect(deleted).toEqual(['2026-08-20|dinner']));
    expect(await within(day).findByText(/한 끼만 적혀 영양 평균에서 빠져요/)).toBeInTheDocument();
    expect(within(day).getByRole('button', { name: '저녁 안 먹음' })).toBeInTheDocument();
  });

  it('좁은 화면의 조건 단추 — 접고 펼침을 알리고, 건 조건 수를 단추에 보인다', async () => {
    server.use(http.get(ENTRIES_URL, () => HttpResponse.json({ items: [entry()], nextCursor: null })));
    renderPage();
    await screen.findByText('김치찌개');
    const toggle = screen.getByRole('button', { name: '조건' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: '저녁' }));
    fireEvent.click(screen.getByRole('button', { name: '외식' }));
    expect(screen.getByRole('button', { name: '조건 2' })).toBe(toggle);
  });

  it('달력 — 다른 날짜를 고르면 새 응답이 올 때까지 이전 날짜 기록을 흐리게 둔다', async () => {
    const gate = deferred();
    server.use(
      http.get(ENTRIES_URL, async ({ request }) => {
        const from = new URL(request.url).searchParams.get('from');
        if (from?.endsWith('-06')) await gate.promise;
        return HttpResponse.json({
          items: from
            ? [entry({ id: from, placeName: from.endsWith('-05') ? '오일식당' : '육일식당' })]
            : [],
          nextCursor: null,
        });
      }),
      http.get(CALENDAR_URL, ({ request }) => {
        const month = new URL(request.url).searchParams.get('month') ?? '';
        return HttpResponse.json({
          month,
          days: ['05', '06'].map((day) => ({
            date: `${month}-${day}`,
            count: 1,
            slots: ['lunch'],
            hasPhoto: false,
          })),
        });
      }),
    );
    renderPage(undefined, '/meal/calendar');
    fireEvent.click(await screen.findByRole('button', { name: /월 5일,/ }));
    const first = await screen.findByText(/오일식당/);
    expect(first.closest('.opacity-60')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /월 6일,/ }));
    // 6일 응답 전 — 5일 기록이 남아 있되 흐리게.
    await waitFor(() => expect(screen.getByText(/오일식당/).closest('.opacity-60')).not.toBeNull());
    gate.open();
    const second = await screen.findByText(/육일식당/);
    expect(second.closest('.opacity-60')).toBeNull();
  });

  const photoEntry = () =>
    entry({ photos: [{ token: 'a'.repeat(8), width: 40, height: 30, byteSize: 100, sortOrder: 0 }] });

  // 회귀: 사진 URL 을 화면마다 따로 받아, 목록이 다시 마운트될 때마다 같은 썸네일을 또 받고 깜빡였다.
  it('같은 사진은 탭을 오가도 한 번만 받는다 — 받아 둔 URL 을 다시 쓴다', async () => {
    let photoRequests = 0;
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [photoEntry()], nextCursor: null })),
      http.get(CALENDAR_URL, ({ request }) =>
        HttpResponse.json({ month: new URL(request.url).searchParams.get('month') ?? '', days: [] }),
      ),
      http.get(PHOTO_THUMB_URL, () => {
        photoRequests += 1;
        return HttpResponse.arrayBuffer(new ArrayBuffer(8), { headers: { 'Content-Type': 'image/jpeg' } });
      }),
    );
    renderPage();
    const firstSrc = (await screen.findByAltText('식단 사진')).getAttribute('src');
    fireEvent.click(screen.getAllByRole('link', { name: '달력' })[0]!);
    await screen.findByRole('button', { name: /월 5일,/ });
    expect(screen.queryByAltText('식단 사진')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('link', { name: '기록' })[0]!);
    expect((await screen.findByAltText('식단 사진')).getAttribute('src')).toBe(firstSrc);
    expect(photoRequests).toBe(1);
  });

  it('IntersectionObserver 가 있으면 사진은 화면 가까이 왔을 때 받는다', async () => {
    const observers: Array<{ callback: IntersectionObserverCallback }> = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(public callback: IntersectionObserverCallback) {
          observers.push(this);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    try {
      let photoRequests = 0;
      server.use(
        http.get(ENTRIES_URL, () => HttpResponse.json({ items: [photoEntry()], nextCursor: null })),
        http.get(PHOTO_THUMB_URL, () => {
          photoRequests += 1;
          return HttpResponse.arrayBuffer(new ArrayBuffer(8), { headers: { 'Content-Type': 'image/jpeg' } });
        }),
      );
      renderPage();
      await screen.findByText('김치찌개');
      // 아직 화면 가까이 오지 않았다 — 자리표시자만 있고 요청은 나가지 않는다.
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(observers).toHaveLength(1);
      expect(photoRequests).toBe(0);
      expect(screen.queryByAltText('식단 사진')).not.toBeInTheDocument();

      act(() =>
        observers[0]!.callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          observers[0] as unknown as IntersectionObserver,
        ),
      );
      expect(await screen.findByAltText('식단 사진')).toBeInTheDocument();
      expect(photoRequests).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// 추천·설정 탭 — LLM 호출은 서버가 하고 화면은 결과만 다룬다. 캐시/강제 재요청 계약(force)과
// 가중치 저장 payload 를 고정한다.
describe('MealPage — 추천·설정 탭', () => {
  const CONTEXT_URL = '/api/v1/meals/recommendations/context';
  const RECOMMENDATIONS_URL = '/api/v1/meals/recommendations';
  const PREFERENCE_URL = '/api/v1/meals/preference';

  const preference = {
    weights: {
      variety: 4,
      taste: 4,
      balance: 3,
      health: 2,
      novelty: 2,
      weather: 1,
      convenience: 2,
    },
    excludedFoods: ['오이'],
    allergens: [],
    dislikedFoods: ['고수'],
    likedFoods: [],
    mealTypes: [],
    slots: ['breakfast', 'lunch', 'dinner'],
    onboarded: true,
    updatedAt: '2026-08-22T00:00:00.000Z',
  };

  const recommendation = {
    id: 'r1',
    targetDate: '2026-08-22',
    targetSlot: 'dinner',
    items: [
      {
        name: '연어초밥',
        foodId: 'f2',
        dishType: 'raw_fish',
        mainIngredient: 'fish',
        cuisine: 'japanese',
        reason: '2주 동안 생선을 안 드셨어요.',
        tags: ['14일 만에'],
        score: 0.82,
        lastEatenDate: null,
        ingredients: ['연어', '밥', '와사비'],
        allergenWarnings: [],
        allergenAssessment: 'known_safe',
        nutritionBasis: 'missing',
        nutritionFrom: null,
      },
    ],
    summary: '오늘은 담백하게',
    status: 'done',
    model: 'gpt-oss:120b',
    promptVersion: 1,
    notice: null,
    feedback: null,
    candidateRatings: [],
    createdAt: '2026-08-22T09:00:00.000Z',
  };

  beforeEach(() => {
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
    server.use(
      http.get('/api/v1/air/location', () => HttpResponse.json({ location: null })),
      http.post(`${RECOMMENDATIONS_URL}/:id/events`, () => HttpResponse.json({ ok: true })),
    );
  });

  it('추천 탭 — 추천받기는 force=false, 다시 추천은 force=true 로 보낸다', async () => {
    const forces: boolean[] = [];
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(CONTEXT_URL, () =>
        HttpResponse.json({ entryCount: 12, recentFoods: ['김치찌개'], preference, latest: null }),
      ),
      http.get(RECOMMENDATIONS_URL, () => HttpResponse.json({ items: [] })),
      http.post(RECOMMENDATIONS_URL, async ({ request }) => {
        const body = (await request.json()) as { force: boolean };
        forces.push(body.force);
        return HttpResponse.json(recommendation);
      }),
    );
    renderPage(undefined, '/meal/recommend');
    fireEvent.click(await screen.findByRole('button', { name: /추천받기/ }));

    expect(await screen.findByText('연어초밥')).toBeInTheDocument();
    expect(screen.getByText('2주 동안 생선을 안 드셨어요.')).toBeInTheDocument();
    expect(screen.getByText('오늘은 담백하게')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /다시 추천/ }));
    await waitFor(() => expect(forces).toEqual([false, true]));
  });

  it('추천 탭 — 끼니로 못 채운 부족 영양소의 곁들임을 한 줄로 보이고 영양 탭으로 잇는다', async () => {
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(CONTEXT_URL, () =>
        HttpResponse.json({
          entryCount: 12,
          recentFoods: [],
          preference,
          latest: {
            ...recommendation,
            sides: [
              { name: '파프리카', nutrients: ['비타민 C'] },
              { name: '우유', nutrients: ['칼슘', '비타민 D'] },
            ],
          },
        }),
      ),
      http.get(RECOMMENDATIONS_URL, () => HttpResponse.json({ items: [] })),
    );
    renderPage(undefined, '/meal/recommend');
    expect(
      await screen.findByText(/곁들이면 좋아요 · 파프리카\(비타민 C\) · 우유\(칼슘·비타민 D\)/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '영양 보기' })).toHaveAttribute('href', '/meal/nutrition');
  });

  it('추천 피드백 — 👍 를 누르면 rating 1 을 보낸다', async () => {
    const ratings: (number | null | undefined)[] = [];
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(CONTEXT_URL, () =>
        HttpResponse.json({ entryCount: 12, recentFoods: [], preference, latest: recommendation }),
      ),
      http.get(RECOMMENDATIONS_URL, () => HttpResponse.json({ items: [recommendation] })),
      http.post(`${RECOMMENDATIONS_URL}/r1/feedback`, async ({ request }) => {
        const body = (await request.json()) as { rating?: number | null };
        ratings.push(body.rating);
        return HttpResponse.json({
          ...recommendation,
          feedback: { pickedName: null, rating: 1, eatenEntryId: null },
        });
      }),
    );
    renderPage(undefined, '/meal/recommend');
    fireEvent.click(await screen.findByRole('button', { name: '추천이 좋아요' }));
    await waitFor(() => expect(ratings).toEqual([1]));
  });

  it('추천 피드백 — mutation 응답의 선택을 현재 카드에 즉시 반영한다', async () => {
    const pickedNames: (string | null | undefined)[] = [];
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      // feedback 성공 후 cache invalidation으로 재조회되어도 서버 컨텍스트는 아직 이전 snapshot이다.
      // mutation 반환값을 local current에 적용하지 않으면 이 테스트의 선택 상태가 바뀌지 않는다.
      http.get(CONTEXT_URL, () =>
        HttpResponse.json({ entryCount: 12, recentFoods: [], preference, latest: recommendation }),
      ),
      http.get(RECOMMENDATIONS_URL, () => HttpResponse.json({ items: [recommendation] })),
      http.post(`${RECOMMENDATIONS_URL}/r1/feedback`, async ({ request }) => {
        const body = (await request.json()) as { pickedName?: string | null };
        pickedNames.push(body.pickedName);
        return HttpResponse.json({
          ...recommendation,
          feedback: { pickedName: '연어초밥', rating: null, eatenEntryId: null },
        });
      }),
    );
    renderPage(undefined, '/meal/recommend');

    const choice = await screen.findByRole('button', { name: '이걸로 할래요' });
    expect(choice).not.toHaveClass('text-primary');
    fireEvent.click(choice);

    await waitFor(() => expect(pickedNames).toEqual(['연어초밥']));
    await waitFor(() => expect(choice).toHaveClass('text-primary'));
  });

  it('먹은 메뉴 기록 — 추천을 원본 id 가 달린 draft 로 옮긴다', async () => {
    await setMealDraftPrincipal('u1');
    useMealDraftStore.getState().clear();
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(CONTEXT_URL, () =>
        HttpResponse.json({ entryCount: 12, recentFoods: [], preference, latest: recommendation }),
      ),
      http.get(RECOMMENDATIONS_URL, () => HttpResponse.json({ items: [recommendation] })),
    );
    renderPage(undefined, '/meal/recommend');
    fireEvent.click(await screen.findByRole('button', { name: '연어초밥 먹은 메뉴로 기록' }));

    const s = useMealDraftStore.getState();
    expect(s.originRecommendationId).toBe('r1');
    expect(s.slot).toBe('dinner');
    expect(s.items).toEqual([
      expect.objectContaining({ name: '연어초밥', foodId: 'f2', source: 'recommendation' }),
    ]);
  });

  it('이미 기록으로 이어진 추천은 기록 버튼 대신 그 기록으로 보낸다', async () => {
    await setMealDraftPrincipal('u1');
    const linked = {
      ...recommendation,
      feedback: { pickedName: '연어초밥', rating: null, eatenEntryId: 'e9' },
    };
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(CONTEXT_URL, () =>
        HttpResponse.json({ entryCount: 12, recentFoods: [], preference, latest: linked }),
      ),
      http.get(RECOMMENDATIONS_URL, () => HttpResponse.json({ items: [linked] })),
    );
    renderPage(undefined, '/meal/recommend');
    expect(await screen.findByRole('link', { name: '기록 보기' })).toHaveAttribute('href', '/meal/e9');
    expect(screen.queryByRole('button', { name: /먹은 메뉴로 기록/ })).not.toBeInTheDocument();
  });

  it('최근 추천 — 눌러도 목록 순서는 그대로, 보는 중만 옮기고 지난 추천을 밝힌다', async () => {
    const withItem = (id: string, name: string, createdAt: string) => ({
      ...recommendation,
      id,
      items: [{ ...recommendation.items[0]!, name }],
      createdAt,
    });
    const newest = withItem('r3', '연어초밥', '2026-08-22T10:00:00.000Z');
    const older = withItem('r2', '김치찌개', '2026-08-22T09:00:00.000Z');
    const oldest = withItem('r1', '비빔밥', '2026-08-22T08:00:00.000Z');
    const shownIds: string[] = [];
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(CONTEXT_URL, () =>
        HttpResponse.json({ entryCount: 12, recentFoods: [], preference, latest: newest }),
      ),
      http.get(RECOMMENDATIONS_URL, () => HttpResponse.json({ items: [newest, older, oldest] })),
      http.post(`${RECOMMENDATIONS_URL}/:id/events`, async ({ params, request }) => {
        const body = (await request.json()) as { kind: string };
        if (body.kind === 'shown') shownIds.push(String(params['id']));
        return HttpResponse.json({ ok: true });
      }),
    );
    renderPage(undefined, '/meal/recommend');

    // 목록 줄은 받은 시각(HH:MM)이 붙은 버튼 — 카드 버튼에는 시각이 없다. 줄마다 붙은 삭제 버튼은 뺀다.
    const rows = async () =>
      (await screen.findAllByRole('button', { name: /\d{2}:\d{2}/ })).filter(
        (button) => !button.getAttribute('aria-label')?.endsWith('추천 삭제'),
      );
    const order = async () => (await rows()).map((row) => row.textContent ?? '');
    expect(await order()).toEqual([
      expect.stringContaining('연어초밥'),
      expect.stringContaining('김치찌개'),
      expect.stringContaining('비빔밥'),
    ]);
    expect((await rows())[0]).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /다시 추천/ })).toBeInTheDocument();

    fireEvent.click((await rows())[1]!);

    // 위 카드가 고른 추천으로 바뀌고 지난 추천임을 밝힌다. 다시 추천은 숨긴다.
    expect(await screen.findByText('지난 추천')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '김치찌개 먹은 메뉴로 기록' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /다시 추천/ })).not.toBeInTheDocument();
    // 목록은 순서 그대로, 보는 중만 옮겼다.
    expect(await order()).toEqual([
      expect.stringContaining('연어초밥'),
      expect.stringContaining('김치찌개'),
      expect.stringContaining('비빔밥'),
    ]);
    expect((await rows())[1]).toHaveAttribute('aria-current', 'true');
    expect((await rows())[0]).not.toHaveAttribute('aria-current');

    fireEvent.click(screen.getByRole('button', { name: '최신 추천으로' }));
    expect(await screen.findByRole('button', { name: '연어초밥 먹은 메뉴로 기록' })).toBeInTheDocument();
    expect(screen.queryByText('지난 추천')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /다시 추천/ })).toBeInTheDocument();
    // 노출은 처음 보인 최신 추천만 — 목록에서 다시 연 예전 추천은 새 노출이 아니다.
    await waitFor(() => expect(shownIds).toEqual(['r3']));
  });

  it('최근 추천 아래 최근 30일 반응 한 줄 — 고른 추천·기록까지·평가(통계 화면에서 옮겨 왔다)', async () => {
    const asked: string[] = [];
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(CONTEXT_URL, () =>
        HttpResponse.json({ entryCount: 12, recentFoods: [], preference, latest: recommendation }),
      ),
      http.get(RECOMMENDATIONS_URL, () => HttpResponse.json({ items: [recommendation] })),
      http.post(`${RECOMMENDATIONS_URL}/:id/events`, () => HttpResponse.json({ ok: true })),
      http.get(STATS_URL, ({ request }) => {
        const url = new URL(request.url);
        asked.push(`${url.searchParams.get('from')}~${url.searchParams.get('to')}`);
        return HttpResponse.json(stats);
      }),
    );
    renderPage(undefined, '/meal/recommend');
    expect(await screen.findByText(/최근 30일 — 고른 추천/)).toHaveTextContent(
      '최근 30일 — 고른 추천 2건 · 기록까지 1건(50%) · 평가 1건',
    );
    // 통계 '1달'과 같은 기간(오늘 포함 30일) — 같은 조회를 함께 쓴다.
    const [from, to] = asked[0]!.split('~');
    const days = (Date.parse(to!) - Date.parse(from!)) / 86_400_000 + 1;
    expect(days).toBe(30);
  });

  // 회귀: 노출 이벤트가 성공할 때마다 추천 조회(context·목록)를 통째로 다시 받았고, 탭을 다시 열 때마다(재마운트)
  // 같은 추천의 노출을 또 보냈다.
  it('노출 이벤트는 추천당 한 번 — 보낸 뒤 추천 조회를 다시 받지 않고, 탭을 다시 열어도 또 보내지 않는다', async () => {
    let contextCalls = 0;
    let listCalls = 0;
    const shownIds: string[] = [];
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(CONTEXT_URL, () => {
        contextCalls += 1;
        return HttpResponse.json({ entryCount: 12, recentFoods: [], preference, latest: recommendation });
      }),
      http.get(RECOMMENDATIONS_URL, () => {
        listCalls += 1;
        return HttpResponse.json({ items: [recommendation] });
      }),
      http.post(`${RECOMMENDATIONS_URL}/:id/events`, async ({ params, request }) => {
        const body = (await request.json()) as { kind: string };
        if (body.kind === 'shown') shownIds.push(String(params['id']));
        return HttpResponse.json({ ok: true });
      }),
    );
    renderPage(undefined, '/meal/recommend');
    await screen.findByRole('button', { name: '연어초밥 먹은 메뉴로 기록' });
    await waitFor(() => expect(shownIds).toEqual(['r1']));
    // 노출은 화면에 보이는 추천 데이터를 바꾸지 않는다 — 응답 뒤에도 context·목록은 한 번씩만.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(contextCalls).toBe(1);
    expect(listCalls).toBe(1);

    // 기록 화면에 갔다 와도 같은 추천의 노출을 또 보내지 않는다(사이드 메뉴 링크로 오간다).
    fireEvent.click(screen.getAllByRole('link', { name: '기록' })[0]!);
    await screen.findByPlaceholderText('음식·장소·메모 검색');
    fireEvent.click(screen.getAllByRole('link', { name: '추천' })[0]!);
    await screen.findByRole('button', { name: '연어초밥 먹은 메뉴로 기록' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(shownIds).toEqual(['r1']);
  });

  it('최근 추천 삭제 — 확인창을 거쳐 지우고, 보던 추천이면 남은 최신으로, 모두 삭제도', async () => {
    await setMealDraftPrincipal('u1');
    // 지울 추천에서 시작한 기록 초안 — 지우면 출처만 떼어 낸다.
    useMealDraftStore.getState().start({ originRecommendationId: 'r3' });
    const withItem = (id: string, name: string, createdAt: string) => ({
      ...recommendation,
      id,
      items: [{ ...recommendation.items[0]!, name }],
      createdAt,
    });
    let items = [
      withItem('r3', '연어초밥', '2026-08-22T10:00:00.000Z'),
      withItem('r2', '김치찌개', '2026-08-22T09:00:00.000Z'),
    ];
    const deleted: string[] = [];
    let deletedAll: unknown = null;
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(CONTEXT_URL, () =>
        HttpResponse.json({ entryCount: 12, recentFoods: [], preference, latest: items[0] ?? null }),
      ),
      http.get(RECOMMENDATIONS_URL, () => HttpResponse.json({ items })),
      http.delete(`${RECOMMENDATIONS_URL}/:id`, ({ params }) => {
        deleted.push(String(params['id']));
        items = items.filter((r) => r.id !== params['id']);
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(RECOMMENDATIONS_URL, async ({ request }) => {
        deletedAll = await request.json();
        const count = items.length;
        items = [];
        return HttpResponse.json({ deleted: { recommendations: count, recommendationEvents: 0 } });
      }),
    );
    renderPage(undefined, '/meal/recommend');

    const deleteButtons = async () => screen.findAllByRole('button', { name: /추천 삭제$/ });
    // 확인창에서 취소하면 지우지 않는다.
    fireEvent.click((await deleteButtons())[0]!);
    expect(screen.getByRole('alertdialog', { name: '추천 삭제' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(deleted).toEqual([]);

    // 보고 있던 최신(연어초밥)을 지우면 카드는 남은 최신(김치찌개)으로.
    fireEvent.click((await deleteButtons())[0]!);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(deleted).toEqual(['r3']));
    expect(
      await screen.findByRole('button', { name: '김치찌개 먹은 메뉴로 기록' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '연어초밥 먹은 메뉴로 기록' }),
    ).not.toBeInTheDocument();
    expect(useMealDraftStore.getState().originRecommendationId).toBeNull();

    // 모두 삭제 — 확인 문자열을 실어 보내고, 카드·목록이 비어야 한다.
    fireEvent.click(screen.getByRole('button', { name: '모두 삭제' }));
    expect(screen.getByRole('alertdialog', { name: '최근 추천 모두 삭제' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    await waitFor(() =>
      expect(deletedAll).toEqual({ confirmation: MEAL_RECOMMENDATIONS_DELETE_CONFIRMATION }),
    );
    await waitFor(() => expect(screen.queryByText('최근 추천')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /먹은 메뉴로 기록/ })).not.toBeInTheDocument();
  });

  it('설정 탭 — 슬라이더·절대 제외·덜 선호 음식을 나눠 PUT 한다', async () => {
    let saved: Record<string, unknown> | null = null;
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(PREFERENCE_URL, () => HttpResponse.json(preference)),
      http.put(PREFERENCE_URL, async ({ request }) => {
        saved = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...preference, ...saved });
      }),
    );
    renderPage(undefined, '/meal/settings');

    const slider = await screen.findByLabelText('건강');
    fireEvent.change(slider, { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('취향상 제외할 음식'), {
      target: { value: '오이, 땅콩' },
    });
    fireEvent.change(screen.getByLabelText('덜 선호하는 음식'), {
      target: { value: '고수, 내장' },
    });
    expect(screen.getByText(/재료 정보가 없는 음식은 남을 수 있어요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(saved).not.toBeNull());
    expect((saved as unknown as { weights: { health: number } }).weights.health).toBe(5);
    expect((saved as unknown as { excludedFoods: string[] }).excludedFoods).toEqual([
      '오이',
      '땅콩',
    ]);
    expect((saved as unknown as { dislikedFoods: string[] }).dislikedFoods).toEqual([
      '고수',
      '내장',
    ]);
  });

  it('설정 탭 — 프리셋은 가중치를 한 번에 바꾼다', async () => {
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(PREFERENCE_URL, () => HttpResponse.json(preference)),
    );
    renderPage(undefined, '/meal/settings');
    fireEvent.click(await screen.findByRole('button', { name: '새로운 도전' }));
    expect((screen.getByLabelText('새로운 시도') as HTMLInputElement).value).toBe('5');
  });

  it('설정 탭 — 성별·출생연도를 함께 저장하고, 연도 형식이 틀리면 막는다', async () => {
    let saved: Record<string, unknown> | null = null;
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(PREFERENCE_URL, () => HttpResponse.json(preference)),
      http.put(PREFERENCE_URL, async ({ request }) => {
        saved = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...preference, ...saved });
      }),
    );
    renderPage(undefined, '/meal/settings');
    fireEvent.click(await screen.findByRole('button', { name: '여성' }));
    const year = screen.getByLabelText('출생연도');
    fireEvent.change(year, { target: { value: '19' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText(/출생연도는 1900년부터/)).toBeInTheDocument();
    expect(saved).toBeNull();

    fireEvent.change(year, { target: { value: '1990' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(saved).not.toBeNull());
    expect(saved).toMatchObject({ sex: 'female', birthYear: 1990 });
  });

  it('설정 탭 — 손대기 전에는 서버 값을 따라가고, 손댄 뒤에는 서버 값이 다시 와도 입력을 덮어쓰지 않으며, 저장하면 서버 응답으로 돌아간다', async () => {
    let served: Record<string, unknown> = preference;
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(PREFERENCE_URL, () => HttpResponse.json(served)),
      // 서버가 보낸 값과 다르게 정리해 돌려주는 경우 — 저장 뒤 화면은 손댄 값이 아니라 이 응답을 보여야 한다.
      http.put(PREFERENCE_URL, () => HttpResponse.json({ ...preference, excludedFoods: ['정리된값'] })),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderPage(client, '/meal/settings');
    const excluded = () => screen.getByLabelText('취향상 제외할 음식');
    await waitFor(() => expect(excluded()).toHaveValue('오이'));
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();

    served = { ...preference, excludedFoods: ['가지'] };
    await act(() => client.invalidateQueries({ queryKey: ['meal', 'preference'] }));
    await waitFor(() => expect(excluded()).toHaveValue('가지'));

    fireEvent.change(excluded(), { target: { value: '가지, 땅콩' } });
    expect(screen.getByText('바꾼 설정이 있어요.')).toBeInTheDocument();
    served = { ...preference, excludedFoods: ['버섯'] };
    await act(() => client.invalidateQueries({ queryKey: ['meal', 'preference'] }));
    expect(excluded()).toHaveValue('가지, 땅콩');

    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('저장했어요.')).toBeInTheDocument();
    expect(excluded()).toHaveValue('정리된값');
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });
});

describe('MealPage — 영양 탭', () => {
  const NUTRITION_URL = '/api/v1/meals/nutrition';
  const ADVICE_URL = '/api/v1/meals/nutrition/advice';

  const nutrient = (over: Record<string, unknown>) => ({
    key: 'calcium',
    label: '칼슘',
    unit: 'mg',
    intakePerDay: 260,
    reference: { kind: 'rni', amount: 700, ear: 550 },
    upperLimit: 2500,
    percent: 37,
    coverage: 1,
    status: 'low',
    supplementCandidate: true,
    recordGap: false,
    topSources: ['된장찌개'],
    foodSuggestions: ['순두부찌개'],
    sideSuggestions: [],
    typicalFoods: ['우유·요거트·치즈', '두부'],
    note: null,
    ...over,
  });
  const analysis = (days: number) => ({
    from: '2026-09-21',
    to: '2026-10-04',
    days,
    analyzedDays: 9,
    mealCount: 24,
    profile: { sex: null, ageGroup: '30-49', basis: 'default' },
    energy: { intakePerDay: 1650, requirement: 1900, percent: 87 },
    coverage: 0.97,
    status: 'ok',
    insufficientReason: null,
    nutrients: [
      nutrient({ key: 'protein', label: '단백질', unit: 'g', intakePerDay: 72, percent: 144, status: 'ok', supplementCandidate: false }),
      nutrient({}),
    ],
    notMeasured: ['마그네슘', '아연'],
    notes: ['성별·출생연도를 설정하면 내 기준으로 더 정확히 봐요(지금은 30-49세 성인 기준).'],
  });
  const advice = {
    id: 'adv1',
    targetDate: '2026-10-04',
    status: 'done',
    model: 'kimi-k3',
    summary: '칼슘부터 음식으로 챙겨 보세요.',
    items: [
      {
        nutrient: 'calcium',
        label: '칼슘',
        reason: '하루 평균 260mg으로 권장의 37%예요.',
        foodTip: '두부·우유를 곁들여 보세요.',
        supplementTip: '구연산칼슘을 나눠 드세요.',
        unit: 'mg',
        shortfallPerDay: 440,
        upperLimit: 2500,
        caution: '철분제와는 시간을 띄우세요.',
      },
    ],
    disclaimer: '식단 기록으로 본 추정이며 진단이 아니에요.',
    analysis: analysis(14),
    createdAt: '2026-10-04T03:00:00.000Z',
  };

  beforeEach(() => {
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
    // 빠진 날 정리는 점검 기간의 달력·'안 먹음'을 함께 받는다 — 기본은 빈 기록(정리할 날 없음). 테스트가 덮어쓴다.
    server.use(
      http.get(CALENDAR_URL, ({ request }) =>
        HttpResponse.json({ month: new URL(request.url).searchParams.get('month'), days: [] }),
      ),
      http.get(SKIPS_URL, () => HttpResponse.json({ skips: [] })),
    );
  });

  it("한 끼만 적혀 평균에서 빠진 지난날을 모아 그 자리에서 정리한다 — 남은 끼니를 다 표시해야 평균에 들고, 오늘은 묻지 않는다", async () => {
    await setMealDraftPrincipal('u1');
    useMealDraftStore.getState().clear();
    const day = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return toLocalDateKey(d);
    };
    const today = day(0);
    const calendarDays = [
      { date: day(-6), count: 1, slots: ['dinner'], hasPhoto: false, kcal: 500 },
      { date: day(-3), count: 2, slots: ['lunch', 'dinner'], hasPhoto: false, kcal: 1200 },
      { date: day(-1), count: 1, slots: ['lunch'], hasPhoto: false, kcal: 600 },
      { date: today, count: 1, slots: ['breakfast'], hasPhoto: false, kcal: 300 },
    ];
    let skips: { date: string; slot: string }[] = [];
    const put: string[] = [];
    let analyses = 0;
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(NUTRITION_URL, () => {
        analyses += 1;
        return HttpResponse.json({
          ...analysis(14),
          from: day(-13),
          to: today,
          status: 'insufficient',
          analyzedDays: 1,
          insufficientReason: '최근 14일 중 두 끼 이상 기록한 날이 1일이에요.',
        });
      }),
      http.get(ADVICE_URL, () => HttpResponse.json({ advice: null })),
      http.get(CALENDAR_URL, ({ request }) => {
        const month = new URL(request.url).searchParams.get('month')!;
        return HttpResponse.json({ month, days: calendarDays.filter((d) => d.date.startsWith(month)) });
      }),
      http.get(SKIPS_URL, () => HttpResponse.json({ skips })),
      http.put(SKIPS_URL, async ({ request }) => {
        const body = (await request.json()) as { date: string; slot: string };
        put.push(`${body.date} ${body.slot}`);
        skips = [...skips, body];
        return HttpResponse.json(body);
      }),
    );
    renderPage(undefined, '/meal/nutrition');

    const review = await screen.findByRole('region', { name: '평균에서 빠진 날' });
    // 두 끼 날은 빼고, 오늘(아침만)은 아직 지나지 않은 끼니가 있어 뺀다. 접어 둔 채 날 수만.
    expect(review).toHaveTextContent('한 끼만 적혀 평균에서 빠진 날 2일');
    expect(within(review).queryByText(/만 적힘/)).not.toBeInTheDocument();
    fireEvent.click(within(review).getByRole('button', { name: '정리하기' }));
    // 최근 날부터.
    expect(within(review).getAllByText(/만 적힘/).map((el) => el.textContent)).toEqual(['· 점심만 적힘', '· 저녁만 적힘']);

    const dayItem = (date: string) => within(review).getByText(mealDateTitle(date, today)).closest('li')!;
    const rowsOf = (date: string) =>
      within(dayItem(date))
        .getAllByRole('listitem')
        .map((li) => li.textContent);
    expect(rowsOf(day(-1))).toEqual(['아침기록하기안 먹음', '저녁기록하기안 먹음']);

    // 어제 저녁만 표시 — 아침을 몰라 아직 빠진다.
    fireEvent.click(within(within(dayItem(day(-1))).getAllByRole('listitem')[1]!).getByRole('button', { name: '안 먹음' }));
    expect(await within(dayItem(day(-1))).findByRole('button', { name: '저녁 안 먹음 취소' })).toBeInTheDocument();
    expect(review).toHaveTextContent('한 끼만 적혀 평균에서 빠진 날 2일');

    // 아침까지 표시하면 평균에 든다 — 그 자리에 남겨 고칠 수 있게 하고, 점검을 다시 받는다.
    fireEvent.click(within(within(dayItem(day(-1))).getAllByRole('listitem')[0]!).getByRole('button', { name: '안 먹음' }));
    expect(await within(dayItem(day(-1))).findByText('· 평균에 들어가요')).toBeInTheDocument();
    expect(rowsOf(day(-1))).toEqual(['아침안 먹음취소', '저녁안 먹음취소']);
    expect(review).toHaveTextContent('한 끼만 적혀 평균에서 빠진 날 1일');
    expect(put).toEqual([`${day(-1)} dinner`, `${day(-1)} breakfast`]);
    await waitFor(() => expect(analyses).toBeGreaterThan(1));

    // [기록하기] — 그날 그 끼니로 새 기록을 시작한다.
    expect(rowsOf(day(-6))).toEqual(['아침기록하기안 먹음', '점심기록하기안 먹음']);
    fireEvent.click(within(within(dayItem(day(-6))).getAllByRole('listitem')[1]!).getByRole('button', { name: '기록하기' }));
    const draft = useMealDraftStore.getState();
    expect([draft.slot, draft.eatenDate]).toEqual(['lunch', day(-6)]);
  });

  it('점검을 모자란 순으로 보여 주고, 조언 받기는 force=false·다시 쓰기는 force=true, 기간을 바꾸면 days 로 다시 조회한다', async () => {
    const asked: number[] = [];
    const posted: unknown[] = [];
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(NUTRITION_URL, ({ request }) => {
        const days = Number(new URL(request.url).searchParams.get('days'));
        asked.push(days);
        return HttpResponse.json(analysis(days));
      }),
      http.get(ADVICE_URL, () => HttpResponse.json({ advice: null })),
      http.post(ADVICE_URL, async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json(advice);
      }),
    );
    renderPage(undefined, '/meal/nutrition');

    expect(await screen.findByText('260mg / 권장섭취량 700mg (37%)', { exact: false })).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(rows.findIndex((t) => t.startsWith('칼슘'))).toBeLessThan(rows.findIndex((t) => t.startsWith('단백질')));
    expect(screen.getByText(/한 끼로는 순두부찌개/)).toBeInTheDocument();
    expect(screen.getByText(/판단하지 않는 영양소: 마그네슘, 아연/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '최근 14일로 조언 받기' }));
    expect(await screen.findByText('칼슘부터 음식으로 챙겨 보세요.')).toBeInTheDocument();
    expect(posted[0]).toEqual({ days: 14, force: false });
    expect(screen.getByText('구연산칼슘을 나눠 드세요.')).toBeInTheDocument();
    expect(screen.getByText('하루 약 440mg 모자람')).toBeInTheDocument();
    expect(screen.getByText(/진단이 아니에요/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '다시 쓰기' }));
    await waitFor(() => expect(posted).toHaveLength(2));
    expect(posted[1]).toEqual({ days: 14, force: true });

    fireEvent.click(screen.getByRole('button', { name: '28일' }));
    await waitFor(() => expect(asked).toContain(28));
  });

  it("채우면 닿는 영양소는 '기록 더 필요', 곁들임 후보·설정 링크를 보이고, 판정이 바뀐 지난 조언은 흐리게 두고 다시 받기를 권한다", async () => {
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(NUTRITION_URL, () =>
        HttpResponse.json({
          ...analysis(14),
          notMeasured: ['비타민 B6'],
          nutrients: [
            nutrient({
              key: 'zinc',
              label: '아연',
              intakePerDay: 6.75,
              reference: { kind: 'rni', amount: 8, ear: 7 },
              upperLimit: 35,
              percent: 84,
              supplementCandidate: false,
              recordGap: true,
              note: '기록이 빠진 끼니를 채우면 기준에 닿을 수 있는 수준이에요.',
              foodSuggestions: [],
              typicalFoods: ['굴'],
            }),
            nutrient({
              key: 'vitaminC',
              label: '비타민 C',
              intakePerDay: 19,
              reference: { kind: 'rni', amount: 100, ear: 75 },
              upperLimit: 2000,
              percent: 19,
              foodSuggestions: [],
              sideSuggestions: ['파프리카', '키위'],
              typicalFoods: ['귤·키위·딸기 같은 과일'],
            }),
          ],
        }),
      ),
      http.get(ADVICE_URL, () => HttpResponse.json({ advice, stale: true })),
    );
    renderPage(undefined, '/meal/nutrition');

    const zinc = (await screen.findByText('아연')).closest('li')!;
    expect(within(zinc).getByText('기록 더 필요')).toBeInTheDocument();
    expect(within(zinc).queryByText('부족')).not.toBeInTheDocument();
    // 진짜 부족(비타민 C)이 '기록 더 필요'(아연)보다 위.
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(rows.findIndex((t) => t.startsWith('비타민 C'))).toBeLessThan(rows.findIndex((t) => t.startsWith('아연')));
    expect(screen.getByText(/곁들임으로는 파프리카·키위/)).toBeInTheDocument();
    expect(screen.queryByText(/한 끼로는/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '설정에서 성별·출생연도 넣기' })).toHaveAttribute(
      'href',
      '/meal/settings',
    );

    expect(await screen.findByText(/지금 점검과 다를 수 있어요/)).toBeInTheDocument();
    expect(screen.getByText('칼슘부터 음식으로 챙겨 보세요.').closest('.opacity-60')).not.toBeNull();
  });

  it('기록이 모자라면 이유를 보여 주고 조언 버튼을 막는다', async () => {
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(NUTRITION_URL, () =>
        HttpResponse.json({
          ...analysis(14),
          status: 'insufficient',
          analyzedDays: 2,
          insufficientReason: '최근 14일 중 두 끼 이상 기록한 날이 2일이에요.',
        }),
      ),
      http.get(ADVICE_URL, () => HttpResponse.json({ advice: null })),
    );
    renderPage(undefined, '/meal/nutrition');
    expect(await screen.findByText(/두 끼 이상 기록한 날이 2일/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '최근 14일로 조언 받기' })).toBeDisabled();
  });

  // 회귀: 기간을 바꿀 때마다 점검 목록이 로딩 문구로 접혔다 펴지며 화면이 튀었다.
  it('기간을 바꾸는 동안 이전 기간 결과를 흐리게 두고 로딩으로 접지 않는다', async () => {
    const gate = deferred();
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(NUTRITION_URL, async ({ request }) => {
        const days = Number(new URL(request.url).searchParams.get('days'));
        if (days === 28) await gate.promise;
        return HttpResponse.json(analysis(days));
      }),
      http.get(ADVICE_URL, () => HttpResponse.json({ advice: null })),
    );
    renderPage(undefined, '/meal/nutrition');
    const before = await screen.findByText(/최근 14일 중/);
    expect(before.closest('.opacity-60')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '28일' }));
    await waitFor(() => expect(screen.getByText(/최근 14일 중/).closest('.opacity-60')).not.toBeNull());
    expect(screen.queryByText(/기록을 살펴보는 중/)).not.toBeInTheDocument();
    gate.open();
    const after = await screen.findByText(/최근 28일 중/);
    expect(after.closest('.opacity-60')).toBeNull();
  });
});
