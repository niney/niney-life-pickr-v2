import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { delay, http, HttpResponse } from 'msw';
import type {
  TourAdminStatusType,
  TourRawVisitType,
  TourRawVisitsResultType,
  TourSeedItemType,
  TourSeedListType,
} from '@repo/api-contract';
import { server } from '~/test/msw';
import { AdminTourPage } from './AdminTourPage';

// 여행로그 시드 콘솔 — 필터 입력이 표 조회로 이어지는 흐름을 본다:
//  - 여행자 수는 입력이 멈춘 뒤의 값으로 한 번만 조회한다("12" 를 칠 때 1 로 한 번 더 X)
//  - 가게 이름은 치는 동안 조회하지 않고 제출할 때 한 번
//  - 원본 근거 패널에서 페이지를 넘기는 동안 이전 페이지와 페이저가 남는다

const STATUS_URL = '/api/v1/admin/tour/status';
const SEEDS_URL = '/api/v1/admin/tour/seeds';
const VISITS_URL = '/api/v1/admin/tour/places/:placeId/visits';

const status: TourAdminStatusType = {
  loaded: true,
  places: 100,
  baseDate: '2023-09-30',
  sourceFile: 'lp-2023.json',
  loadedAt: '2026-09-13T00:00:00.000Z',
  counts: {},
  datasets: [],
  match: { matched: 1, missing: 0, candidates: 35 },
  biz: {
    checked: 0,
    open: 0,
    suspended: 0,
    closed: 0,
    unknown: 0,
    lastCheckedAt: null,
    keyConfigured: false,
  },
  seeds: { restaurants: 80, t5: 20, t3: 40, unmatchedT5: 19 },
  thumbsDir: null,
  thumbsExists: false,
};

const seed = (over: Partial<TourSeedItemType> = {}): TourSeedItemType => ({
  placeId: 'tp-1',
  name: '해녀의집',
  typeShort: '식당',
  roadAddr: '제주특별자치도 제주시 어딘가 1',
  sigungu: '제주시',
  emd: null,
  lat: 33.5,
  lng: 126.5,
  poiId: null,
  nTravelers: 9,
  nVisits: 80,
  nRated: 5,
  bayesScore: 4.2,
  spendPpMedian: 15000,
  match: null,
  biz: null,
  ...over,
});

const visit = (over: Partial<TourRawVisitType> = {}): TourRawVisitType => ({
  id: 'v1',
  travelId: 't1',
  travelerLabel: '여행자 A',
  visitDate: '2023-05-01',
  dayIndex: 1,
  arrivalTs: null,
  stayMin: 60,
  dgstfn: 4,
  revisitInt: null,
  rcmdInt: null,
  revisitYn: 'N',
  reasonNm: null,
  mvmnNm: null,
  spendSum: null,
  spendPp: null,
  nPhotos: 0,
  nActivities: 0,
  gender: null,
  ageGrp: null,
  accompany: null,
  residenceSido: null,
  nights: null,
  month: null,
  prevPlaceName: null,
  nextPlaceName: null,
  ...over,
});

const useBaseHandlers = () => {
  const seedRequests: string[] = [];
  server.use(
    http.get(STATUS_URL, () => HttpResponse.json(status)),
    http.get(SEEDS_URL, ({ request }) => {
      seedRequests.push(request.url);
      const body: TourSeedListType = { items: [seed()], total: 1, limit: 50, offset: 0 };
      return HttpResponse.json(body);
    }),
  );
  return { seedRequests };
};

const renderPage = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
        })
      }
    >
      <MemoryRouter initialEntries={['/admin/tour']}>
        <AdminTourPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const paramsOf = (url: string): URLSearchParams => new URL(url).searchParams;

describe('AdminTourPage', () => {
  it('여행자 수는 입력이 멈춘 뒤의 값으로 한 번만 조회한다', async () => {
    const { seedRequests } = useBaseHandlers();
    renderPage();
    await screen.findByText('해녀의집');
    expect(paramsOf(seedRequests.at(-1)!).get('minTravelers')).toBe('5');
    const before = seedRequests.length;

    // "12" — 지우고 한 글자씩 친다. 입력칸은 곧바로 따라온다.
    const input = screen.getByLabelText(/여행자/);
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.change(input, { target: { value: '12' } });
    expect(input).toHaveValue(12);
    expect(seedRequests).toHaveLength(before);

    await waitFor(() => expect(paramsOf(seedRequests.at(-1)!).get('minTravelers')).toBe('12'));
    expect(seedRequests.slice(before).map((u) => paramsOf(u).get('minTravelers'))).toEqual(['12']);
  });

  it('가게 이름은 치는 동안 조회하지 않고, 제출하면 다듬은 값으로 조회한다', async () => {
    const { seedRequests } = useBaseHandlers();
    renderPage();
    await screen.findByText('해녀의집');
    const before = seedRequests.length;

    const input = screen.getByPlaceholderText('가게 이름');
    fireEvent.change(input, { target: { value: ' 해녀 ' } });
    await delay(350);
    expect(seedRequests).toHaveLength(before);

    // 표의 행에도 '검색'(네이버 후보 찾기) 버튼이 있다 — 검색 폼 안의 제출 버튼을 누른다.
    fireEvent.click(within(input.closest('form')!).getByRole('button', { name: '검색' }));
    await waitFor(() => expect(paramsOf(seedRequests.at(-1)!).get('q')).toBe('해녀'));
    expect(paramsOf(seedRequests.at(-1)!).get('offset')).toBe('0');
  });

  it('원본 근거에서 페이지를 넘기는 동안 이전 페이지와 페이저가 남는다', async () => {
    useBaseHandlers();
    let releasePage2: () => void = () => {};
    const page2Held = new Promise<void>((resolve) => {
      releasePage2 = resolve;
    });
    server.use(
      http.get(VISITS_URL, async ({ request }) => {
        const offset = Number(paramsOf(request.url).get('offset') ?? '0');
        if (offset > 0) await page2Held;
        const body: TourRawVisitsResultType = {
          tourPlaceId: 'tp-1',
          items: [
            offset > 0
              ? visit({ id: 'v51', travelerLabel: '여행자 B' })
              : visit({ id: 'v1', travelerLabel: '여행자 A' }),
          ],
          total: 80,
        };
        return HttpResponse.json(body);
      }),
    );
    renderPage();
    await screen.findByText('해녀의집');

    fireEvent.click(screen.getByRole('button', { name: /근거/ }));
    expect(await screen.findByText('여행자 A')).toBeInTheDocument();

    // 시드 표는 1페이지뿐이라 '2' 버튼은 근거 패널의 페이저 것.
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    await delay(50);
    // 받는 중 — "불러오는 중…" 한 줄로 접히지 않고, 이전 페이지(흐리게)와 페이저가 남는다.
    expect(screen.queryByText('불러오는 중…')).not.toBeInTheDocument();
    expect(screen.getByText('여행자 A').closest('div.overflow-x-auto')).toHaveClass('opacity-70');
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();

    releasePage2();
    expect(await screen.findByText('여행자 B')).toBeInTheDocument();
    expect(screen.queryByText('여행자 A')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('여행자 B').closest('div.overflow-x-auto')).not.toHaveClass('opacity-70'),
    );
  });
});
