import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { TourPlanBodyType, TourPlanDayType, TourPlanPlaceType, TourPlanResultType, TourPlanStopType, WeatherForecastDayType } from '@repo/api-contract';
import { WEATHER_PLACES, formatYmdWithWeekday, latLngToKmaGrid, todayKst } from '@repo/utils';
import { server } from '~/test/msw';
import { TravelPlanPage } from './TravelPlanPage';

// 코스 추천 페이지 — ① 제출 → 일정표(일차·시각·이동·여유·대안·지도 링크)와 추천 장소 카드 ② 식당만 토글·투표 버튼
// ③ 일정표가 없는 응답(미지원 지역)은 안내만 ④ 요청 본문은 폼 값 그대로.
// 11차 — ⑤ 일정 옵션(속도·취향·이동수단)은 기본값이 아닐 때만 요청에 실린다 ⑥ 핀(꼭 갈 곳)·×(빼기)·숙소 동네는 고르는
// 즉시 다시 짜고, 지역을 바꿔 찾으면 비운다.
// 12차 — ⑦ 출발일을 넣으면 예보(단기·중기)를 불러 비 오는 일차 번호를 보내고, 일차 카드에 날짜·예보·비 표시를 붙인다.
// 14차 — ⑨ 목적·장소(유명도) 옵션은 기본값이 아닐 때만 요청에 실리고 목적은 셋까지 ⑩ "다른 코스 보기" 는 변형 번호를 올려 다시
// 짜고(폼으로 다시 찾으면 처음 코스로, 일정 편집은 보던 번호 유지) ⑪ 목적에 맞는 곳 표시.
// 15차 — ⑫ 출발일을 넣으면 첫날의 요일(startDow)도 간다 ⑬ 운영 정보(이용 시간·쉬는 날)가 있는 곳은 접힌 한 줄로 보이고,
// 꼭 갈 곳이 쉬는 요일에 놓였으면 표시하며, 출처·주의 한 줄(infoNote)을 붙인다.
// 13차 — ⑧ 제주 밖 지역도 일정표·일정 옵션이 나오고('전체' 만 장소만), 거점 동네를 알리고, 예보는 응답이 알려 준 지점으로 불러
// 다음에 찾을 때부터 비 오는 일차를 보낸다. 식당이 없는 날은 그렇게 알린다.

const PLAN_URL = '/api/v1/tour/public/plan';

const place = (over: Partial<TourPlanPlaceType> & Pick<TourPlanPlaceType, 'name' | 'kind'>): TourPlanPlaceType => ({
  sigungu: '제주시',
  emd: '한림읍',
  n: 24,
  mean: 4.5,
  score: 5,
  similarN: null,
  lift: null,
  peak: null,
  stayMin: null,
  spendPp: null,
  placeId: null,
  purposeFit: false,
  info: null,
  ...over,
});
const stop = (over: Partial<TourPlanStopType> & Pick<TourPlanStopType, 'name' | 'kind' | 'arriveMin'>): TourPlanStopType => ({
  sigungu: '제주시',
  emd: '한림읍',
  n: 24,
  mean: 4.5,
  placeId: null,
  stayMin: 60,
  moveMin: null,
  moveKm: null,
  spendPp: null,
  pinned: false,
  purposeFit: false,
  info: null,
  closedThatDay: false,
  alternatives: [],
  ...over,
});
const dayOf = (over: Partial<TourPlanDayType> & Pick<TourPlanDayType, 'day' | 'area' | 'stops'>): TourPlanDayType => ({
  pattern: over.stops.map((s) => s.kind).join('>'),
  patternBasis: 'similar',
  moveMin: 10,
  moveKm: 0.9,
  stayMin: 90,
  spendPp: null,
  fromStayMin: null,
  toStayMin: null,
  wet: false,
  ...over,
});

const RESULT: TourPlanResultType = {
  regionTrips: 30,
  matchedTrips: 24,
  relaxed: ['month'],
  insufficient: false,
  places: [
    place({ name: '우진해장국', kind: '식당', emd: '삼도이동', score: 7.7, mean: 4.6, similarN: 24, lift: 1.2, peak: '점심', stayMin: 50, spendPp: 11000, placeId: 'n-ujin' }),
    place({ name: '협재해수욕장', kind: '자연', score: 7.1, stayMin: 90 }),
    place({ name: '올래국수', kind: '식당', emd: '연동', n: 6, mean: 4.4, score: 2.7 }),
  ],
  templates: [{ label: '교통>식당>자연>숙소', n: 24 }],
  itinerary: {
    legBasis: 'observed',
    transport: 'car',
    stayArea: null,
    unplaced: [],
    // 제주 — 거점 반경을 쓰지 않고(null), 예보 지점은 제주시.
    base: null,
    weatherPlaceId: '11G00201',
    days: [
      dayOf({
        day: 1,
        area: '제주시 삼도이동·용담이동',
        stops: [
          stop({ name: '우진해장국', kind: '식당', emd: '삼도이동', arriveMin: 720, stayMin: 50, spendPp: 11000, placeId: 'n-ujin', alternatives: [{ name: '올래국수', kind: '식당', n: 6, mean: 4.4, placeId: null }] }),
          // 12:50 출발 + 이동 10분 = 13:00, 도착 15:00 → 여유 2시간.
          stop({ name: '용두암', kind: '자연', emd: '용담이동', arriveMin: 900, stayMin: 40, moveMin: 10, moveKm: 0.9 }),
        ],
        spendPp: 11000,
      }),
      dayOf({
        day: 2,
        area: '제주시 한림읍',
        patternBasis: 'region',
        stops: [stop({ name: '협재해수욕장', kind: '자연', arriveMin: 600, stayMin: 90 }), stop({ name: '협재 흑돼지', kind: '식당', arriveMin: 720, moveMin: 5, moveKm: 0.3 })],
        moveMin: 5,
        moveKm: 0.3,
        stayMin: 150,
      }),
    ],
  },
  areas: [
    { label: '제주시 한림읍', n: 4 },
    { label: '서귀포시 성산읍', n: 3 },
  ],
  excludedClosed: 2,
  infoNote: null,
  sampleLabel: '2023년 4~9월 여행자 표본',
  sourceNote: '출처 문구(aihub.or.kr)',
};
const BASE_BODY = { region: 'jeju', ageGrp: '30', accompany: '2인 여행(가족 외)', nights: 2 };

// 요청 본문을 차례로 모으고, respond 로 요청마다 다른 응답을 준다.
const usePlan = (respond: (body: Partial<TourPlanBodyType>, nth: number) => TourPlanResultType = () => RESULT) => {
  const bodies: Array<Partial<TourPlanBodyType>> = [];
  server.use(
    http.post(PLAN_URL, async ({ request }) => {
      const body = (await request.json()) as Partial<TourPlanBodyType>;
      bodies.push(body);
      return HttpResponse.json(respond(body, bodies.length));
    }),
  );
  return bodies;
};
const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/travel/plan']}>
        <TravelPlanPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};
const submit = () => fireEvent.click(screen.getByRole('button', { name: '비슷한 여행 찾기' }));
const listSection = () => screen.getByRole('heading', { name: '비슷한 여행자가 만족한 곳' }).closest('section')!;

describe('TravelPlanPage', () => {
  it('제출하면 일정표(일차·시각·이동·여유·대안)와 추천 장소가 나온다', async () => {
    const bodies = usePlan();
    renderPage();
    submit();

    expect(await screen.findByRole('heading', { name: '추천 일정' })).toBeInTheDocument();
    // 기본 폼 값이 그대로 나간다(제주·30대·2인·2박) — 옵션은 기본값이라 싣지 않는다.
    expect(bodies).toEqual([BASE_BODY]);
    expect(screen.getByText(/같은 조건의 여행/).textContent).toContain('24건');
    expect(screen.getByText(/월 조건은 풀었습니다/)).toBeInTheDocument();
    // 2박(3일)을 물었는데 이틀만 채워졌다.
    expect(screen.getByText('후보가 모자라 3일 중 2일만 채웠습니다.')).toBeInTheDocument();

    const day1 = screen.getByRole('article', { name: '1일차' });
    expect(within(day1).getByRole('heading', { name: '제주시 삼도이동·용담이동' })).toBeInTheDocument();
    expect(within(day1).getByText('12:00')).toBeInTheDocument();
    expect(within(day1).getByText('15:00')).toBeInTheDocument();
    expect(within(day1).getByText(/이동 약 10분 · 직선 0.9km · 여유 약 2시간/)).toBeInTheDocument();
    expect(within(day1).getByText(/식당 · 여행 24건 · 만족 4.5 · 50분 머묾 · 1인 1.1만원/)).toBeInTheDocument();
    expect(within(day1).getByText(/이동 10분 · 직선 0.9km · 머묾 1시간 30분 · 1인 약 1.1만원/)).toBeInTheDocument();
    expect(within(day1).getByText('비슷한 여행에서 흔한 하루 순서')).toBeInTheDocument();
    // 등록된 맛집은 상세로, 대안은 이름만, 지도는 이름 검색.
    expect(within(day1).getByRole('link', { name: '우진해장국' })).toHaveAttribute('href', '/restaurants-v2/n-ujin');
    expect(within(day1).getByText(/대신 갈 만한 곳/).textContent).toContain('올래국수');
    expect(within(day1).getByRole('link', { name: '용두암 지도에서 찾기' })).toHaveAttribute('href', `https://map.naver.com/p/search/${encodeURIComponent('용두암 제주시')}`);
    // 숙소 동네를 정하지 않았으니 숙소 이동 줄이 없다.
    expect(within(day1).queryByText(/숙소/)).not.toBeInTheDocument();

    const day2 = screen.getByRole('article', { name: '2일차' });
    expect(within(day2).getByText('이 지역 여행에서 흔한 하루 순서')).toBeInTheDocument();
    // 여유가 1시간 미만이면 말하지 않는다(11:30 출발 + 5분, 12:00 도착).
    expect(within(day2).getByText('이동 약 5분 · 직선 0.3km')).toBeInTheDocument();
    expect(screen.getByText(/누군가의 실제 일정이 아닙니다/).textContent).toContain('차 기준으로 여행자들의 구간 기록을 거리별로 집계한');
    // 제주 — 부속섬은 일정에서 빼고, 거점 안내는 없다(섬 전체에서 짠다). 날마다 식당이 있어 식사 자리 안내도 없다.
    expect(screen.getByText(/누군가의 실제 일정이 아닙니다/).textContent).toContain('숙소와 배를 타야 하는 섬은 넣지 않았습니다');
    expect(screen.queryByText(/주변에서 짰습니다/)).not.toBeInTheDocument();
    expect(screen.queryByText(/식사 자리 없이 짰습니다/)).not.toBeInTheDocument();

    // 추천 장소 카드 — 근거 줄·비슷한 여행 배지·폐업 제외 안내.
    const cards = within(listSection()).getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    expect(cards[0]!.textContent).toContain('식당 · 제주시 삼도이동 · 24팀 · 만족 4.6');
    expect(cards[0]!.textContent).toContain('주로 점심 · 50분 머묾 · 1인 1.1만원');
    expect(cards[0]!.textContent).toContain('비슷한 여행 24건 · 평균의 1.2배');
    expect(cards[1]!.textContent).not.toContain('비슷한 여행');
    expect(within(listSection()).getByText('폐업·휴업이 확인된 2곳은 뺐습니다')).toBeInTheDocument();
    expect(screen.getByText('출처 문구(aihub.or.kr)')).toBeInTheDocument();
  });

  it('식당만 토글은 식당 카드만 남기고, 투표는 등록 맛집 2곳부터', async () => {
    usePlan();
    renderPage();
    submit();
    const list = (await screen.findByRole('heading', { name: '비슷한 여행자가 만족한 곳' })).closest('section')!;
    fireEvent.click(within(list).getByRole('button', { name: '식당만' }));
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent!.includes('식당 ·'))).toEqual([true, true]);

    const vote = within(list).getByRole('button', { name: /그룹투표 만들기/ });
    expect(vote).toBeDisabled();
    // 미등록 장소에는 체크박스가 없다.
    expect(within(list).getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.click(within(list).getByRole('checkbox'));
    expect(within(list).getByRole('button', { name: '그룹투표 만들기 (1)' })).toBeDisabled();
  });

  it("'전체' 는 일정표 없이 안내만 하고 장소 추천은 그대로 — 속도·이동 옵션과 핀도 없다", async () => {
    const bodies = usePlan(() => ({ ...RESULT, itinerary: null, areas: [], excludedClosed: 0 }));
    renderPage();
    expect(screen.getByRole('button', { name: '여유롭게' })).toBeInTheDocument();
    // 권역(동부권)은 일정표를 만드는 지역이라 옵션이 그대로 있다.
    fireEvent.click(screen.getByRole('button', { name: '동부권' }));
    expect(screen.getByRole('button', { name: '여유롭게' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '전체' }));
    // 취향은 목록 순위에도 쓰이므로 남고, 속도·이동·출발일은 사라진다.
    expect(screen.queryByRole('button', { name: '여유롭게' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '대중교통' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('여행 시작일')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '자연·바다' })).toBeInTheDocument();
    expect(screen.getByText(/지역을 고르면 일정표도 짜 드립니다/)).toBeInTheDocument();
    submit();
    expect(await screen.findByText(/일정표는 지역을 골라야 만들어 드립니다/)).toBeInTheDocument();
    expect(bodies).toEqual([{ ...BASE_BODY, region: 'all' }]);
    expect(screen.queryByRole('heading', { name: '추천 일정' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '비슷한 여행자가 만족한 곳' })).toBeInTheDocument();
    expect(screen.queryByText(/폐업·휴업이 확인된/)).not.toBeInTheDocument();
    expect(screen.getByText(/식당 자리는 홈의 골라주기/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /꼭 갈 곳$/ })).not.toBeInTheDocument();
  });

  it('여행로그가 없는 서버(미적재) — "표본이 적다" 가 아니라 데이터가 없다고만 말하고, 빈 일정표·빈 목록은 내지 않는다', async () => {
    usePlan(() => ({ ...RESULT, regionTrips: 0, matchedTrips: 0, relaxed: ['nights', 'ageGrp'], insufficient: true, places: [], templates: [], itinerary: null, areas: [], excludedClosed: 0 }));
    renderPage();
    submit();
    expect(await screen.findByRole('status')).toHaveTextContent('지금 이 서버에는 제주 여행로그 데이터가 없어 추천을 만들 수 없습니다. 조건을 바꿔도 결과는 같습니다.');
    // 조건을 풀었다는 안내는 조건을 바꿔 보게 만든다 — 데이터가 없을 땐 내지 않는다.
    expect(screen.queryByText(/같은 조건의 여행/)).not.toBeInTheDocument();
    expect(screen.queryByText(/조건은 풀었습니다/)).not.toBeInTheDocument();
    expect(screen.queryByText(/참고만 하세요/)).not.toBeInTheDocument();
    expect(screen.queryByText(/후보가 모이지 않았습니다/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '비슷한 여행자가 만족한 곳' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /그룹투표 만들기/ })).not.toBeInTheDocument();
  });

  it('일정 옵션 — 속도·취향·이동수단은 기본값이 아닐 때만 요청에 실린다', async () => {
    const bodies = usePlan((body) => ({ ...RESULT, itinerary: { ...RESULT.itinerary!, transport: body.transport ?? 'car' } }));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '여유롭게' }));
    fireEvent.click(screen.getByRole('button', { name: '자연·바다' }));
    fireEvent.click(screen.getByRole('button', { name: '문화·역사' }));
    fireEvent.click(screen.getByRole('button', { name: '대중교통' }));
    submit();
    expect(await screen.findByText(/대중교통 기준으로/)).toBeInTheDocument();
    expect(bodies).toEqual([{ ...BASE_BODY, pace: 'relaxed', focus: ['nature', 'culture'], transport: 'transit' }]);
    // 취향은 다시 누르면 꺼지고, 속도를 보통으로 되돌리면 실리지 않는다.
    fireEvent.click(screen.getByRole('button', { name: '자연·바다' }));
    fireEvent.click(screen.getByRole('button', { name: '보통' }));
    submit();
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ ...BASE_BODY, focus: ['culture'], transport: 'transit' });
  });

  it('꼭 갈 곳·빼기·숙소 동네 — 고르는 즉시 다시 짜고, 칩으로 되돌린다', async () => {
    const withStay: TourPlanResultType = {
      ...RESULT,
      itinerary: {
        ...RESULT.itinerary!,
        stayArea: '제주시 한림읍',
        unplaced: ['우도'],
        days: [
          { ...RESULT.itinerary!.days[0]!, toStayMin: 55, stops: RESULT.itinerary!.days[0]!.stops.map((s, i) => (i === 1 ? { ...s, pinned: true } : s)) },
          { ...RESULT.itinerary!.days[1]!, fromStayMin: 5 },
        ],
      },
    };
    const bodies = usePlan((_, nth) => (nth >= 4 ? withStay : RESULT));
    renderPage();
    submit();
    await screen.findByRole('heading', { name: '추천 일정' });
    expect(screen.getByText(/아래 목록의 핀으로 꼭 갈 곳을 넣고/)).toBeInTheDocument();

    // ① 목록의 핀 → must.
    const pin = within(listSection()).getByRole('button', { name: '협재해수욕장 꼭 갈 곳' });
    expect(pin).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(pin);
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ ...BASE_BODY, must: [{ name: '협재해수욕장', emd: '한림읍' }] });
    await waitFor(() => expect(within(listSection()).getByRole('button', { name: '협재해수욕장 꼭 갈 곳' })).toHaveAttribute('aria-pressed', 'true'));

    // ② 일정의 × → avoid(꼭 갈 곳이던 장소를 빼면 must 에서도 빠진다).
    await waitFor(() => expect(screen.getByRole('button', { name: '용두암 일정에서 빼기' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '용두암 일정에서 빼기' }));
    await waitFor(() => expect(bodies).toHaveLength(3));
    expect(bodies[2]).toEqual({ ...BASE_BODY, must: [{ name: '협재해수욕장', emd: '한림읍' }], avoid: [{ name: '용두암', emd: '용담이동' }] });

    // ③ 숙소 동네 → stayArea. 응답의 숙소 이동 줄·핀 표시·못 넣은 곳 안내가 보인다.
    await waitFor(() => expect(screen.getByRole('combobox', { name: '숙소 동네' })).toBeEnabled());
    fireEvent.change(screen.getByRole('combobox', { name: '숙소 동네' }), { target: { value: '제주시 한림읍' } });
    await waitFor(() => expect(bodies).toHaveLength(4));
    expect(bodies[3]).toMatchObject({ stayArea: '제주시 한림읍', must: [{ name: '협재해수욕장', emd: '한림읍' }], avoid: [{ name: '용두암', emd: '용담이동' }] });
    expect(await within(screen.getByRole('article', { name: '1일차' })).findByText('숙소까지 약 55분')).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: '2일차' })).getByText('숙소에서 약 5분')).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: '1일차' })).getByText('꼭')).toBeInTheDocument();
    expect(screen.getByText(/일정에 넣지 못한 곳: 우도/)).toBeInTheDocument();

    // ④ 칩의 × 로 되돌린다.
    await waitFor(() => expect(screen.getByRole('button', { name: '용두암 뺀 곳에서 되돌리기' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '용두암 뺀 곳에서 되돌리기' }));
    await waitFor(() => expect(bodies).toHaveLength(5));
    expect(bodies[4]).toEqual({ ...BASE_BODY, stayArea: '제주시 한림읍', must: [{ name: '협재해수욕장', emd: '한림읍' }] });

    // ⑤ 지역을 바꿔 찾으면 편집을 비운다(그 지역의 숙소·장소였다).
    await waitFor(() => expect(screen.getByRole('button', { name: '비슷한 여행 찾기' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '동부권' }));
    submit();
    await waitFor(() => expect(bodies).toHaveLength(6));
    expect(bodies[5]).toEqual({ ...BASE_BODY, region: 'east' });
  });

  it('출발일 — 예보에서 비 오는 일차를 골라 보내고, 일차 카드에 날짜·예보·비 표시를 붙인다', async () => {
    const TODAY = todayKst();
    const plus = (n: number): string => {
      const d = new Date(`${TODAY}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    // 단기예보 — 오늘 맑음, 내일 비(오전 80%·오후 70%), 모레 맑음. 중기는 비어 있다.
    const fday = (date: string, wet: boolean): WeatherForecastDayType => ({
      date,
      tmn: 20,
      tmx: 25,
      tmnFromHours: false,
      tmxFromHours: false,
      popMax: wet ? 80 : 10,
      am: { sky: wet ? 4 : 1, pty: wet ? 1 : 0, pop: wet ? 80 : 10, hours: 6 },
      pm: { sky: wet ? 4 : 1, pty: wet ? 1 : 0, pop: wet ? 70 : 10, hours: 6 },
      partial: false,
      hours: 24,
    });
    const asked: string[] = [];
    server.use(
      http.get('/api/v1/weather/forecast', ({ request }) => {
        asked.push(new URL(request.url).search);
        return HttpResponse.json({ grid: { nx: 52, ny: 38 }, base: null, fallback: false, hours: [], days: [fday(TODAY, false), fday(plus(1), true), fday(plus(2), false)], total: 0, fetchedAt: new Date().toISOString(), stale: false });
      }),
      http.get('/api/v1/weather/mid', () => HttpResponse.json({ tmFc: '202610040600', announcedAt: null, fallback: false, land: null, ta: null, outlook: null, fetchedAt: new Date().toISOString(), stale: false })),
    );
    const bodies = usePlan((body) => ({
      ...RESULT,
      itinerary: { ...RESULT.itinerary!, days: RESULT.itinerary!.days.map((d) => ({ ...d, wet: (body.wetDays ?? []).includes(d.day) })) },
    }));
    renderPage();
    expect(screen.getByText(/넣으면 일정에 날짜를 붙이고/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '1박' }));
    fireEvent.change(screen.getByLabelText('여행 시작일'), { target: { value: TODAY } });
    // 제주시 격자의 단기예보를 부르고, 1박 2일 가운데 비 오는 날은 하루.
    expect(await screen.findByText('제주 기준 예보 반영 · 비 예보 1일')).toBeInTheDocument();
    expect(asked[0]).toMatch(/nx=\d+&ny=\d+/);
    submit();
    await screen.findByRole('heading', { name: '추천 일정' });
    // 날짜가 아니라 비 오는 일차 번호와 첫날의 요일만 간다.
    const dow = (ymd: string): number => new Date(`${ymd}T00:00:00Z`).getUTCDay();
    expect(bodies).toEqual([{ ...BASE_BODY, nights: 1, wetDays: [2], startDow: dow(TODAY) }]);
    // 이 서버에 운영 정보가 없으면(infoNote null) 쉬는 요일 이야기는 하지 않는다.
    expect(screen.queryByText(/매주 그 요일에 쉬는 것으로 나와 있는 곳/)).not.toBeInTheDocument();

    const day1 = screen.getByRole('article', { name: '1일차' });
    expect(within(day1).getByText(formatYmdWithWeekday(TODAY))).toBeInTheDocument();
    expect(within(day1).getByText('· 맑음 10%')).toBeInTheDocument();
    expect(within(day1).queryByText(/실내 위주/)).not.toBeInTheDocument();
    const day2 = screen.getByRole('article', { name: '2일차' });
    expect(within(day2).getByText(formatYmdWithWeekday(plus(1)))).toBeInTheDocument();
    expect(within(day2).getByText('· 비 80%')).toBeInTheDocument();
    expect(within(day2).getByText('비 예보 · 실내 위주')).toBeInTheDocument();

    // 예보가 닿지 않는 먼 날짜 — 날짜만 붙이고 비 오는 일차는 보내지 않는다.
    fireEvent.change(screen.getByLabelText('여행 시작일'), { target: { value: plus(40) } });
    expect(await screen.findByText('예보는 열흘 뒤까지만 나옵니다 — 날짜만 붙입니다')).toBeInTheDocument();
    submit();
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ ...BASE_BODY, nights: 1, startDow: dow(plus(40)) });
    expect(await within(screen.getByRole('article', { name: '1일차' })).findByText(formatYmdWithWeekday(plus(40)))).toBeInTheDocument();
  });

  it('제주 밖 지역 — 일정표와 거점 안내가 나오고, 예보는 응답이 알려 준 지점으로 불러 다음에 찾을 때부터 반영한다', async () => {
    const TODAY = todayKst();
    const plus = (n: number): string => {
      const d = new Date(`${TODAY}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const gangneung = WEATHER_PLACES.find((x) => x.name === '강릉')!;
    const grid = latLngToKmaGrid(gangneung.lat, gangneung.lng);
    const fday = (date: string, wet: boolean): WeatherForecastDayType => ({
      date,
      tmn: 20,
      tmx: 25,
      tmnFromHours: false,
      tmxFromHours: false,
      popMax: wet ? 80 : 10,
      am: { sky: wet ? 4 : 1, pty: wet ? 1 : 0, pop: wet ? 80 : 10, hours: 6 },
      pm: { sky: wet ? 4 : 1, pty: wet ? 1 : 0, pop: wet ? 70 : 10, hours: 6 },
      partial: false,
      hours: 24,
    });
    const asked: string[] = [];
    server.use(
      http.get('/api/v1/weather/forecast', ({ request }) => {
        asked.push(new URL(request.url).search);
        return HttpResponse.json({ grid, base: null, fallback: false, hours: [], days: [fday(TODAY, false), fday(plus(1), true)], total: 0, fetchedAt: new Date().toISOString(), stale: false });
      }),
      http.get('/api/v1/weather/mid', () => HttpResponse.json({ tmFc: '202610040600', announcedAt: null, fallback: false, land: null, ta: null, outlook: null, fetchedAt: new Date().toISOString(), stale: false })),
    );
    const gangwon: TourPlanResultType = {
      ...RESULT,
      itinerary: {
        ...RESULT.itinerary!,
        legBasis: 'default',
        base: '강릉시 강문동',
        weatherPlaceId: gangneung.id,
        days: [
          dayOf({ day: 1, area: '강릉시 강문동', stops: [stop({ name: '초당순두부', kind: '식당', sigungu: '강릉시', emd: '초당동', arriveMin: 720 }), stop({ name: '강문해변', kind: '자연', sigungu: '강릉시', emd: '강문동', arriveMin: 840, moveMin: 10, moveKm: 0.6 })] }),
          // 식당 후보가 없어 볼거리로만 채운 날.
          dayOf({ day: 2, area: '강릉시 견소동·성남동', patternBasis: 'region', stops: [stop({ name: '안목해변', kind: '자연', sigungu: '강릉시', emd: '견소동', arriveMin: 600 }), stop({ name: '강릉중앙시장', kind: '상업', sigungu: '강릉시', emd: '성남동', arriveMin: 720, moveMin: 20, moveKm: 4.8 })] }),
        ],
      },
      areas: [
        { label: '강릉시 강문동·성남동', n: 8 },
        { label: '속초시 조양동·중앙동', n: 4 },
      ],
    };
    const bodies = usePlan((body) => ({ ...gangwon, itinerary: { ...gangwon.itinerary!, days: gangwon.itinerary!.days.map((d) => ({ ...d, wet: (body.wetDays ?? []).includes(d.day) })) } }));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '동부권' }));
    fireEvent.click(screen.getByRole('button', { name: '강원' }));
    // 일정 옵션이 그대로 있다(속도·이동·출발일).
    expect(screen.getByRole('button', { name: '여유롭게' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '대중교통' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '1박' }));
    fireEvent.change(screen.getByLabelText('여행 시작일'), { target: { value: TODAY } });
    // 예보 지점은 거점에 따라 달라 일정을 만들기 전에는 모른다 — 예보를 부르지 않는다.
    expect(screen.getByText(/일정을 만들면 그 동네 예보를 붙입니다/)).toBeInTheDocument();
    submit();
    await screen.findByRole('heading', { name: '추천 일정' });
    const startDow = new Date(`${TODAY}T00:00:00Z`).getUTCDay();
    expect(bodies).toEqual([{ ...BASE_BODY, region: 'gangwon', nights: 1, startDow }]);
    expect(asked.every((q) => q.includes(`nx=${grid.nx}&ny=${grid.ny}`))).toBe(true);

    // 거점 안내 · 일정 고지(제주 밖은 섬을 따로 빼지 않는다) · 식당 없는 날.
    expect(screen.getByText(/주변에서 짰습니다/).textContent).toContain('강릉시 강문동 주변에서 짰습니다 — 강원에서 이 조건으로 가장 알차게 채워지는 동네입니다');
    const note = screen.getByText(/누군가의 실제 일정이 아닙니다/).textContent!;
    expect(note).toContain('직선거리에 기본 속도를 적용한 추정이고, 숙소는 넣지 않았습니다');
    expect(note).not.toContain('섬');
    const day1 = screen.getByRole('article', { name: '1일차' });
    const day2 = screen.getByRole('article', { name: '2일차' });
    expect(within(day1).queryByText(/식사 자리 없이 짰습니다/)).not.toBeInTheDocument();
    expect(within(day2).getByText(/추천할 만큼 표본이 쌓인 식당이 없어 식사 자리 없이 짰습니다/)).toBeInTheDocument();

    // 응답의 예보 지점(강릉)으로 예보를 불러 일차 카드에 붙인다. 이번 일정은 비를 모르고 짰다 — 다시 찾으라고 알린다.
    expect(await screen.findByText('강릉 기준 예보 반영 · 비 예보 1일')).toBeInTheDocument();
    expect(asked.length).toBeGreaterThan(0);
    expect(within(day1).getByText('· 맑음 10%')).toBeInTheDocument();
    expect(within(day2).getByText('· 비 80%')).toBeInTheDocument();
    expect(within(day2).getByText(/다시 찾으면 실내 위주로 짭니다/)).toBeInTheDocument();

    // 다시 찾으면 비 오는 일차가 실린다.
    submit();
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ ...BASE_BODY, region: 'gangwon', nights: 1, wetDays: [2], startDow });
    expect(await within(screen.getByRole('article', { name: '2일차' })).findByText('비 예보 · 실내 위주')).toBeInTheDocument();

    // 숙소 동네를 고르면 거점 안내는 사라진다(그곳이 거점이다).
    usePlan(() => ({ ...gangwon, itinerary: { ...gangwon.itinerary!, stayArea: '속초시 조양동·중앙동', base: '속초시 조양동·중앙동' } }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '숙소 동네' })).toBeEnabled());
    fireEvent.change(screen.getByRole('combobox', { name: '숙소 동네' }), { target: { value: '속초시 조양동·중앙동' } });
    await waitFor(() => expect(screen.queryByText(/주변에서 짰습니다/)).not.toBeInTheDocument());
  });

  it('목적·장소 — 기본값이 아닐 때만 요청에 실리고, 목적은 셋까지 고른다. 목적에 맞는 곳은 표시한다', async () => {
    const fit: TourPlanResultType = {
      ...RESULT,
      places: RESULT.places.map((p, i) => (i === 1 ? { ...p, purposeFit: true } : p)),
      itinerary: { ...RESULT.itinerary!, days: RESULT.itinerary!.days.map((d) => ({ ...d, stops: d.stops.map((s) => (s.name === '협재해수욕장' ? { ...s, purposeFit: true } : s)) })) },
    };
    const bodies = usePlan(() => fit);
    renderPage();
    expect(screen.getByText(/추천 점수 = \(보정 만족도 − 3.3\) × √여행 수 × 비슷한 여행자 선호 × 취향$/)).toBeInTheDocument();
    for (const name of ['역사 유적', '등산', '쇼핑']) fireEvent.click(screen.getByRole('button', { name }));
    // 넷째는 들어가지 않는다.
    fireEvent.click(screen.getByRole('button', { name: '촬영지' }));
    fireEvent.click(screen.getByRole('button', { name: '덜 알려진 곳도' }));
    expect(screen.getByText(/추천 점수 = \(보정 만족도 − 3.3\) × 비슷한 여행자 선호 × 취향 × 목적 — 여행 수는 보지 않습니다/)).toBeInTheDocument();
    submit();
    await screen.findByRole('heading', { name: '추천 일정' });
    expect(bodies).toEqual([{ ...BASE_BODY, purposes: ['history', 'hiking', 'shopping'], fame: 'hidden' }]);
    // 목적에 맞는 곳 — 일정의 장소와 목록 카드에.
    expect(within(screen.getByRole('article', { name: '2일차' })).getByText('목적')).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: '1일차' })).queryByText('목적')).not.toBeInTheDocument();
    expect(within(listSection()).getAllByText('고른 목적의 여행이 많이 간 곳')).toHaveLength(1);

    // 다시 누르면 빠지고, 장소를 기본(유명한 곳 위주)으로 되돌리면 실리지 않는다.
    fireEvent.click(screen.getByRole('button', { name: '등산' }));
    fireEvent.click(screen.getByRole('button', { name: '골고루' }));
    expect(screen.getByText(/× ∜여행 수 ×/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '유명한 곳 위주' }));
    submit();
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ ...BASE_BODY, purposes: ['history', 'shopping'] });
  });

  it('다른 코스 보기 — 변형 번호를 올려 다시 짜고, 일정 편집은 보던 번호를 유지하며, 폼으로 다시 찾으면 처음 코스로 돌아간다', async () => {
    const bodies = usePlan();
    renderPage();
    submit();
    await screen.findByRole('heading', { name: '추천 일정' });
    expect(bodies).toEqual([BASE_BODY]);
    expect(screen.queryByText(/^코스 \d/)).not.toBeInTheDocument();
    const next = () => screen.getByRole('button', { name: '다른 코스 보기' });

    fireEvent.click(next());
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ ...BASE_BODY, variant: 1 });
    expect(await screen.findByText(/^코스 2 — /)).toBeInTheDocument();

    await waitFor(() => expect(next()).toBeEnabled());
    fireEvent.click(next());
    await waitFor(() => expect(bodies).toHaveLength(3));
    expect(bodies[2]).toEqual({ ...BASE_BODY, variant: 2 });
    expect(await screen.findByText(/^코스 3 — /)).toBeInTheDocument();

    // 일정 편집(빼기) — 보던 코스 번호 그대로 다시 짠다.
    await waitFor(() => expect(screen.getByRole('button', { name: '용두암 일정에서 빼기' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '용두암 일정에서 빼기' }));
    await waitFor(() => expect(bodies).toHaveLength(4));
    expect(bodies[3]).toEqual({ ...BASE_BODY, variant: 2, avoid: [{ name: '용두암', emd: '용담이동' }] });

    // 처음 코스로.
    await waitFor(() => expect(screen.getByRole('button', { name: '처음 코스로' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '처음 코스로' }));
    await waitFor(() => expect(bodies).toHaveLength(5));
    expect(bodies[4]).toEqual({ ...BASE_BODY, avoid: [{ name: '용두암', emd: '용담이동' }] });
    await waitFor(() => expect(screen.queryByText(/^코스 \d/)).not.toBeInTheDocument());

    // 다른 코스를 보다가 폼으로 다시 찾으면 번호가 0 으로 돌아간다.
    await waitFor(() => expect(next()).toBeEnabled());
    fireEvent.click(next());
    await waitFor(() => expect(bodies).toHaveLength(6));
    expect(bodies[5]).toMatchObject({ variant: 1 });
    await waitFor(() => expect(screen.getByRole('button', { name: '비슷한 여행 찾기' })).toBeEnabled());
    submit();
    await waitFor(() => expect(bodies).toHaveLength(7));
    expect(bodies[6]).toEqual({ ...BASE_BODY, avoid: [{ name: '용두암', emd: '용담이동' }] });
  });

  it('운영 정보 — 이용 시간·쉬는 날을 접힌 한 줄로 보여 주고, 출발일의 요일을 보내며, 쉬는 날에 놓인 꼭 갈 곳을 표시한다', async () => {
    const INFO_NOTE = '이용 시간·쉬는 날은 한국관광공사 관광정보에서 가져온 것입니다(테스트 문구).';
    const museum = { hours: '09:00~18:00 / 입장 마감 17:30', closed: '매주 월요일', parking: null, fee: '성인 2,000원' };
    const withInfo: TourPlanResultType = {
      ...RESULT,
      infoNote: INFO_NOTE,
      places: [place({ name: '제주민속자연사박물관', kind: '문화', emd: '일도이동', info: museum }), ...RESULT.places],
      itinerary: {
        ...RESULT.itinerary!,
        days: [
          dayOf({
            day: 1,
            area: '제주시 일도이동',
            stops: [
              // 꼭 갈 곳인데 그날이 쉬는 요일이다.
              stop({ name: '제주민속자연사박물관', kind: '문화', emd: '일도이동', arriveMin: 600, pinned: true, closedThatDay: true, info: museum }),
              stop({ name: '우진해장국', kind: '식당', emd: '삼도이동', arriveMin: 720, moveMin: 5, moveKm: 0.5, info: { hours: null, closed: null, parking: '가능', fee: null } }),
            ],
          }),
          RESULT.itinerary!.days[1]!,
        ],
      },
    };
    server.use(
      http.get('/api/v1/weather/forecast', () => HttpResponse.json({ grid: { nx: 52, ny: 38 }, base: null, fallback: false, hours: [], days: [], total: 0, fetchedAt: new Date().toISOString(), stale: false })),
      http.get('/api/v1/weather/mid', () => HttpResponse.json({ tmFc: '202610040600', announcedAt: null, fallback: false, land: null, ta: null, outlook: null, fetchedAt: new Date().toISOString(), stale: false })),
    );
    const bodies = usePlan(() => withInfo);
    renderPage();
    // 오늘 이후의 첫 월요일에 떠난다.
    const monday = (() => {
      const d = new Date(`${todayKst()}T00:00:00Z`);
      while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    })();
    fireEvent.click(screen.getByRole('button', { name: '1박' }));
    fireEvent.change(screen.getByLabelText('여행 시작일'), { target: { value: monday } });
    submit();
    await screen.findByRole('heading', { name: '추천 일정' });
    expect(bodies[0]).toMatchObject({ nights: 1, startDow: 1 });

    const day1 = screen.getByRole('article', { name: '1일차' });
    const summary = '이용 09:00~18:00 / 입장 마감 17:30 · 쉬는 날 매주 월요일';
    expect(within(day1).getByText(summary)).toBeInTheDocument();
    expect(within(day1).getByText('이날은 쉬는 요일로 나와 있습니다 — 꼭 갈 곳이라 넣었습니다.')).toBeInTheDocument();
    // 펼친 항목 — 요금까지. 이용 시간·쉬는 날이 없는 곳은 있는 항목 하나를 한 줄로.
    expect(within(day1).getByText('성인 2,000원')).toBeInTheDocument();
    expect(within(day1).getByText('주차 가능')).toBeInTheDocument();
    expect(within(day1).getAllByTitle('운영 정보 펼치기')).toHaveLength(2);
    // 운영 정보가 없는 곳에는 줄이 없다.
    expect(within(screen.getByRole('article', { name: '2일차' })).queryByTitle('운영 정보 펼치기')).not.toBeInTheDocument();

    // 추천 목록에도 같은 줄이, 결과 아래에 출처·주의가 붙는다.
    expect(within(listSection()).getByText(summary)).toBeInTheDocument();
    expect(within(listSection()).getAllByTitle('운영 정보 펼치기')).toHaveLength(1);
    expect(screen.getByText(INFO_NOTE)).toBeInTheDocument();
    expect(screen.getByText(/매주 그 요일에 쉬는 것으로 나와 있는 곳은 그날 일정에서 뺐습니다/)).toBeInTheDocument();

    // 출발일을 지우고 다시 찾으면 요일도 가지 않고, 쉬는 요일 안내도 없다.
    fireEvent.change(screen.getByLabelText('여행 시작일'), { target: { value: '' } });
    submit();
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ ...BASE_BODY, nights: 1 });
    await waitFor(() => expect(screen.queryByText(/매주 그 요일에 쉬는 것으로 나와 있는 곳/)).not.toBeInTheDocument());
    expect(screen.getByText(INFO_NOTE)).toBeInTheDocument();
  });
});
