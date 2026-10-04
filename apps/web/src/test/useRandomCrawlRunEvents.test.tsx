import type { ReactNode } from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRandomCrawlRunEvents } from '@repo/shared';

// 자동 발굴(랜덤 크롤) 실행이 끝났을 때의 무효화 범위(@repo/shared useRandomCrawl) — 실행 이력·설정에
// 더해 맛집 목록(어드민 목록·공개 목록)을 다시 받게 한다. 예전엔 ['restaurants'] 라는, 어떤 조회도
// 쓰지 않는 키를 무효화해 새로 등록된 가게가 목록에 나타나지 않았다(화면을 새로 열어야 보였다).
// (shared 는 node 환경이라 훅 렌더가 필요한 이 테스트는 소비처인 web 에 둔다.)

// jsdom 엔 EventSource 가 없다 — 실행 SSE 연결을 잡아 done 이벤트를 흘린다.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onerror: (() => void) | null = null;
  closed = false;
  private listeners = new Map<string, Array<(e: MessageEvent) => void>>();
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: unknown) {
    for (const fn of this.listeners.get(type) ?? []) {
      fn({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}

beforeAll(() => vi.stubGlobal('EventSource', FakeEventSource));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  FakeEventSource.instances = [];
});

// 실제 훅들이 쓰는 키 모양 그대로(useRestaurantList / useRestaurantsPublic / useRestaurantByPlaceId).
const KEYS = {
  runs: ['random-crawl', 'runs'],
  config: ['random-crawl', 'config'],
  adminList: ['restaurant', 'list', '', 25, 0, 'recent'],
  publicList: ['restaurant', 'public', 'list', '', '', '', 'recent', 200, 0],
  detail: ['restaurant', 'P1'],
  regions: ['random-crawl', 'regions'],
} as const;

const setup = () => {
  const client = new QueryClient();
  // 화면들이 받아 둔 조회 — 구독자가 없어 무효화돼도 다시 받지 않고 표시만 남는다.
  for (const key of Object.values(KEYS)) client.setQueryData(key, {});
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const invalidated = () =>
    Object.fromEntries(
      Object.entries(KEYS).map(([name, key]) => [name, client.getQueryState(key)?.isInvalidated ?? false]),
    );
  return { wrapper, invalidated };
};

const runStream = async (): Promise<FakeEventSource> => {
  await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
  return FakeEventSource.instances[0]!;
};

describe('useRandomCrawlRunEvents — 실행 종료 뒤 무효화 범위', () => {
  it('done 이 오면 실행 이력·설정과 맛집 목록(어드민·공개)을 무효화한다', async () => {
    const { wrapper, invalidated } = setup();
    const { result } = renderHook(() => useRandomCrawlRunEvents(true), { wrapper });
    const es = await runStream();

    act(() => {
      es.emit('progress', {
        type: 'progress',
        runId: 'run-1',
        phase: 'crawling',
        regionLabel: '서울 강남구',
        candidates: [],
      });
    });
    expect(result.current.progress).toMatchObject({ runId: 'run-1', phase: 'crawling' });
    // 진행 중에는 아무것도 무효화하지 않는다.
    expect(Object.values(invalidated()).some(Boolean)).toBe(false);

    act(() => {
      es.emit('done', { type: 'done', runId: 'run-1' });
    });

    expect(result.current.progress).toBeNull();
    expect(es.closed).toBe(true);
    // 가게 상세나 지역 트리처럼 실행 결과와 무관한 조회는 건드리지 않는다.
    expect(invalidated()).toEqual({
      runs: true,
      config: true,
      adminList: true,
      publicList: true,
      detail: false,
      regions: false,
    });
  });

  it('enabled 가 아니면 연결하지 않는다', async () => {
    const { wrapper } = setup();
    renderHook(() => useRandomCrawlRunEvents(false), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});
