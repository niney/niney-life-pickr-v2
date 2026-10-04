import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { TourPlanPlaceType, TourPlanResultType, TourPlanStopType } from '@repo/api-contract';
import { server } from '~/test/msw';
import { TravelPlanPage } from './TravelPlanPage';

// 코스 추천 페이지(10차) — ① 제출 → 일정표(일차·시각·이동·여유·대안·지도 링크)와 추천 장소 카드 ② 식당만 토글·투표 버튼
// ③ 일정표가 없는 응답(미지원 지역)은 안내만 ④ 요청 본문은 폼 값 그대로.

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
  alternatives: [],
  ...over,
});

const RESULT: TourPlanResultType = {
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
    days: [
      {
        day: 1,
        area: '제주시 삼도이동·용담이동',
        pattern: '식당>자연',
        patternBasis: 'similar',
        stops: [
          stop({ name: '우진해장국', kind: '식당', arriveMin: 720, stayMin: 50, spendPp: 11000, placeId: 'n-ujin', alternatives: [{ name: '올래국수', kind: '식당', n: 6, mean: 4.4, placeId: null }] }),
          // 12:50 출발 + 이동 10분 = 13:00, 도착 15:00 → 여유 2시간.
          stop({ name: '용두암', kind: '자연', arriveMin: 900, stayMin: 40, moveMin: 10, moveKm: 0.9 }),
        ],
        moveMin: 10,
        moveKm: 0.9,
        stayMin: 90,
        spendPp: 11000,
      },
      {
        day: 2,
        area: '제주시 한림읍',
        pattern: '자연>식당',
        patternBasis: 'region',
        stops: [stop({ name: '협재해수욕장', kind: '자연', arriveMin: 600, stayMin: 90 }), stop({ name: '협재 흑돼지', kind: '식당', arriveMin: 720, moveMin: 5, moveKm: 0.3 })],
        moveMin: 5,
        moveKm: 0.3,
        stayMin: 150,
        spendPp: null,
      },
    ],
  },
  excludedClosed: 2,
  sampleLabel: '2023년 4~9월 여행자 표본',
  sourceNote: '출처 문구(aihub.or.kr)',
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

describe('TravelPlanPage', () => {
  it('제출하면 일정표(일차·시각·이동·여유·대안)와 추천 장소가 나온다', async () => {
    let body: unknown;
    server.use(
      http.post(PLAN_URL, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(RESULT);
      }),
    );
    renderPage();
    submit();

    expect(await screen.findByRole('heading', { name: '추천 일정' })).toBeInTheDocument();
    // 기본 폼 값이 그대로 나간다(제주·30대·2인·2박).
    expect(body).toEqual({ region: 'jeju', ageGrp: '30', accompany: '2인 여행(가족 외)', nights: 2 });
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

    const day2 = screen.getByRole('article', { name: '2일차' });
    expect(within(day2).getByText('이 지역 여행에서 흔한 하루 순서')).toBeInTheDocument();
    // 여유가 1시간 미만이면 말하지 않는다(11:30 출발 + 5분, 12:00 도착).
    expect(within(day2).getByText('이동 약 5분 · 직선 0.3km')).toBeInTheDocument();
    expect(screen.getByText(/누군가의 실제 일정이 아닙니다/).textContent).toContain('구간 기록을 거리별로 집계한');

    // 추천 장소 카드 — 근거 줄·비슷한 여행 배지·폐업 제외 안내.
    const list = screen.getByRole('heading', { name: '비슷한 여행자가 만족한 곳' }).closest('section')!;
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    expect(cards[0]!.textContent).toContain('식당 · 제주시 삼도이동 · 24팀 · 만족 4.6');
    expect(cards[0]!.textContent).toContain('주로 점심 · 50분 머묾 · 1인 1.1만원');
    expect(cards[0]!.textContent).toContain('비슷한 여행 24건 · 평균의 1.2배');
    expect(cards[1]!.textContent).not.toContain('비슷한 여행');
    expect(within(list).getByText('폐업·휴업이 확인된 2곳은 뺐습니다')).toBeInTheDocument();
    expect(screen.getByText('출처 문구(aihub.or.kr)')).toBeInTheDocument();
  });

  it('식당만 토글은 식당 카드만 남기고, 투표는 등록 맛집 2곳부터', async () => {
    server.use(http.post(PLAN_URL, () => HttpResponse.json(RESULT)));
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

  it('일정표가 없는 지역은 안내만 하고 장소 추천은 그대로', async () => {
    server.use(http.post(PLAN_URL, () => HttpResponse.json({ ...RESULT, itinerary: null, excludedClosed: 0 } satisfies TourPlanResultType)));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '동부권' }));
    submit();
    expect(await screen.findByText(/일정표는 지금 제주만 만들어 드립니다/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '추천 일정' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '비슷한 여행자가 만족한 곳' })).toBeInTheDocument();
    expect(screen.queryByText(/폐업·휴업이 확인된/)).not.toBeInTheDocument();
    expect(screen.getByText(/식당 자리는 홈의 골라주기/)).toBeInTheDocument();
  });
});
