import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type VectorSource from 'ol/source/Vector';
import { getCenter } from 'ol/extent';
import { toLonLat } from 'ol/proj';
import type { RegionStatsResultType } from '@repo/api-contract';
import { server } from '~/test/msw';
// 타입만 — 실제 모듈은 아래 loadFreshModule 이 테스트마다 새로 불러온다.
import type * as RegionStatsMapModule from './RegionStatsMap';

// 지역 통계 지도 — OL 의 Map/View/레이어(캔버스가 필요한 쪽)만 목으로 바꾸고, 벡터 소스·GeoJSON
// 파싱·좌표 판정은 실제 OL 로 돌려 "무엇을 지도에 올리는가" 를 본다:
//  ① 지도 키가 늦게 와도(첫 진입) 색칠이 그려진다 — 예전엔 맵이 만들어진 뒤 feature effect 가
//     다시 돌 계기가 없어, 모드를 바꾸기 전까지 빈 지도였다
//  ② 가게 좌표가 든 시군구만 골라 그 범위로 화면을 맞춘다(경계 상자 사전 검사 뒤에도 판정이 같다)
//  ③ 경계 GeoJSON 은 한 번만 받아 파싱하고, 모드를 오가도 다시 받지 않는다. 실패하면 캐시를
//     비워 다음 시도에서 다시 받는다

const olProbe = vi.hoisted(() => ({
  // 맵이 만들어질 때마다 그 벡터 소스(실제 OL VectorSource)를 기록.
  sources: [] as unknown[],
  fit: vi.fn(),
}));

vi.mock('ol/Map', () => ({
  default: class FakeMap {
    private view: unknown;
    constructor(opts: { view: unknown }) {
      this.view = opts.view;
    }
    getView() {
      return this.view;
    }
    setTarget() {}
  },
}));
vi.mock('ol/View', () => ({
  default: class FakeView {
    fit = olProbe.fit;
  },
}));
vi.mock('ol/layer/Tile', () => ({ default: class FakeTileLayer {} }));
vi.mock('ol/layer/Vector', () => ({
  default: class FakeVectorLayer {
    constructor(opts: { source: unknown }) {
      olProbe.sources.push(opts.source);
    }
  },
}));
vi.mock('ol/source/XYZ', () => ({
  default: class FakeXyz {
    setUrl() {}
  },
}));

// 경계 캐시는 컴포넌트 모듈의 전역 상태다 — 테스트마다 모듈을 새로 불러(쿼리만 다른 같은 파일)
// 캐시가 비어 있는 상태에서 시작한다. React 등 의존 모듈은 그대로 공유된다.
let moduleSeq = 0;
const loadFreshModule = async (): Promise<typeof RegionStatsMapModule> => {
  moduleSeq += 1;
  return (await import(
    /* @vite-ignore */ `./RegionStatsMap?fresh=${moduleSeq}`
  )) as typeof RegionStatsMapModule;
};

const square = (name: string, lng: number, lat: number) => ({
  type: 'Feature',
  properties: { name },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [lng - 0.1, lat - 0.1],
        [lng + 0.1, lat - 0.1],
        [lng + 0.1, lat + 0.1],
        [lng - 0.1, lat + 0.1],
        [lng - 0.1, lat - 0.1],
      ],
    ],
  },
});

// 서울쪽(A)·부산쪽(B) 정사각형 두 개. 가게는 A 안에 둘, 어느 쪽에도 안 드는 곳에 하나.
const GEOJSON = {
  type: 'FeatureCollection',
  features: [square('A', 127.0, 37.5), square('B', 129.0, 35.1)],
};

const DATA: RegionStatsResultType = {
  total: 2,
  unclassified: 1,
  sidos: [
    {
      sido: '서울특별시',
      count: 2,
      sigungus: [{ sigungu: '강남구', count: 2, lat: 37.5, lng: 127.0 }],
    },
  ],
  points: [
    { name: '가', lat: 37.5, lng: 127.0, sido: '서울특별시', sigungu: '강남구' },
    { name: '나', lat: 37.55, lng: 127.05, sido: '서울특별시', sigungu: '강남구' },
    // 경계 상자에는 들지 않는 좌표.
    { name: '다', lat: 36.0, lng: 128.0, sido: null, sigungu: null },
  ],
};

const seen = { geo: 0 };
let geoStatus = 200;
let releaseKey: (() => void) | null = null;

const useHandlers = (opts: { holdKey?: boolean } = {}) => {
  seen.geo = 0;
  geoStatus = 200;
  releaseKey = null;
  const keyGate = opts.holdKey
    ? new Promise<void>((resolve) => {
        releaseKey = resolve;
      })
    : null;
  server.use(
    http.get('/api/v1/settings/map/public', async () => {
      if (keyGate) await keyGate;
      return HttpResponse.json({ provider: 'vworld', apiKey: 'test-key' });
    }),
    http.get('/sigungu-geo.json', () => {
      seen.geo += 1;
      return geoStatus === 200
        ? HttpResponse.json(GEOJSON)
        : new HttpResponse(null, { status: geoStatus });
    }),
  );
};

const renderMap = async () => {
  const { RegionStatsMap } = await loadFreshModule();
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <RegionStatsMap data={DATA} />
    </QueryClientProvider>,
  );
};

// 지금 맵의 벡터 소스에 올라간 feature 수.
const featureCount = (): number => {
  const src = olProbe.sources.at(-1) as VectorSource | undefined;
  return src ? src.getFeatures().length : -1;
};

// 마지막 fit 이 맞춘 범위의 중심(경위도).
const lastFitCenter = (): [number, number] => {
  const extent = olProbe.fit.mock.calls.at(-1)![0] as number[];
  const [lng, lat] = toLonLat(getCenter(extent));
  return [Number(lng!.toFixed(3)), Number(lat!.toFixed(3))];
};

// OL 모듈 그래프(파일 수백 개)를 처음 불러오는 데 몇 초가 걸린다 — 첫 테스트의 시간 제한을
// 잡아먹지 않게 미리 한 번 불러 둔다.
beforeAll(async () => {
  await loadFreshModule();
}, 60_000);

beforeEach(() => {
  olProbe.sources = [];
  olProbe.fit.mockClear();
});

describe('RegionStatsMap', () => {
  it('지도 키가 늦게 와도 첫 진입에서 색칠이 그려지고, 가게가 든 시군구 범위로 맞춘다', async () => {
    useHandlers({ holdKey: true });
    await renderMap();

    // 키 확인 중 — 아직 맵이 없다(예전엔 여기서 feature effect 가 한 번 돌고 끝났다).
    expect(screen.getByText('지도 키 확인 중…')).toBeInTheDocument();
    expect(olProbe.sources).toHaveLength(0);

    releaseKey!();
    await waitFor(() => expect(featureCount()).toBe(2));
    // 범례가 뜨고(로딩 끝), 경계는 한 번 받았다.
    expect(await screen.findByText('많음')).toBeInTheDocument();
    expect(seen.geo).toBe(1);

    // 가게 둘은 A 안, 하나는 어느 경계에도 없다 — 화면은 A(127.0, 37.5)에만 맞춘다.
    expect(olProbe.fit).toHaveBeenCalledTimes(1);
    expect(lastFitCenter()).toEqual([127, 37.5]);
  });

  it('모드를 오가도 경계 GeoJSON 은 다시 받지 않고, 색칠은 매번 온전히 다시 그려진다', async () => {
    useHandlers();
    await renderMap();
    await waitFor(() => expect(featureCount()).toBe(2));
    expect(seen.geo).toBe(1);

    // 버블 — 좌표 있는 시군구 한 곳.
    fireEvent.click(screen.getByRole('button', { name: '버블' }));
    expect(featureCount()).toBe(1);
    // 마커 — 가게 세 곳.
    fireEvent.click(screen.getByRole('button', { name: '마커' }));
    expect(featureCount()).toBe(3);

    // 색칠로 돌아오면 캐시한 경계로 다시 그린다(요청 없음, 폴리곤 2개 그대로).
    fireEvent.click(screen.getByRole('button', { name: '색칠' }));
    await waitFor(() => expect(featureCount()).toBe(2));
    expect(await screen.findByText('많음')).toBeInTheDocument();
    expect(seen.geo).toBe(1);
    expect(lastFitCenter()).toEqual([127, 37.5]);
  });

  it('경계를 못 받으면 오류를 보이고, 다음 시도에서는 다시 받는다', async () => {
    useHandlers();
    geoStatus = 500;
    await renderMap();

    expect(await screen.findByText('경계 데이터를 불러오지 못했습니다.')).toBeInTheDocument();
    expect(featureCount()).toBe(0);
    expect(seen.geo).toBe(1);

    // 실패한 요청을 캐시에 남기지 않는다 — 모드를 다녀오면 새로 받아 그린다.
    geoStatus = 200;
    fireEvent.click(screen.getByRole('button', { name: '마커' }));
    fireEvent.click(screen.getByRole('button', { name: '색칠' }));
    await waitFor(() => expect(featureCount()).toBe(2));
    expect(seen.geo).toBe(2);
    expect(screen.queryByText('경계 데이터를 불러오지 못했습니다.')).toBeNull();
  });
});
