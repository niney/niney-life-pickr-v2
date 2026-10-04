import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { RandomCrawlConfigType } from '@repo/api-contract';
import { server } from '~/test/msw';
import { RandomCrawlSection } from './RandomCrawlSection';

// 맛집 자동 발굴 설정 — cron 미리보기 요청이 나가는 시점을 고정한다:
//  ① 저장된 설정이 오기 전에는 요청하지 않고, 온 뒤에 저장된 cron 으로 한 번만 요청한다 —
//     예전엔 기본 cron('0 12 * * *')으로 먼저 한 번 헛요청했다
//  ② 설정 조회가 실패하면 예전처럼 기본값으로 미리보기를 보여 준다
//  ③ 직접 입력은 타이핑이 멈춘 뒤 마지막 값으로 한 번만 요청하고, 프리셋 선택은 바로 요청한다

const config = (over: Partial<RandomCrawlConfigType> = {}): RandomCrawlConfigType => ({
  enabled: false,
  cronExpr: '30 9 * * *',
  timezone: 'Asia/Seoul',
  region: {
    sidoRandom: true,
    sido: null,
    sigunguRandom: true,
    sigungu: null,
    dongEnabled: false,
    dongRandom: false,
    dong: null,
  },
  keyword: '맛집',
  candidateCount: 5,
  responseTimeoutMin: 30,
  timeoutAction: 'skip',
  telegramConfigured: true,
  lastRunAt: null,
  lastStatus: null,
  nextRunAt: null,
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

// 미리보기 요청 본문을 순서대로 기록.
const seen = { previews: [] as Array<{ cronExpr: string; timezone: string }> };

const useHandlers = (
  opts: { config?: RandomCrawlConfigType; configStatus?: number; hold?: Promise<void> } = {},
) => {
  seen.previews = [];
  server.use(
    http.get('/api/v1/admin/random-crawl', async () => {
      if (opts.hold) await opts.hold;
      return opts.configStatus
        ? HttpResponse.json({ message: 'boom' }, { status: opts.configStatus })
        : HttpResponse.json(opts.config ?? config());
    }),
    http.get('/api/v1/admin/random-crawl/runs', () =>
      HttpResponse.json({ items: [], inflightRunId: null }),
    ),
    http.get('/api/v1/admin/random-crawl/regions', () => HttpResponse.json([])),
    http.post('/api/v1/admin/random-crawl/preview', async ({ request }) => {
      seen.previews.push((await request.json()) as { cronExpr: string; timezone: string });
      return HttpResponse.json({ valid: true, error: null, nextRuns: ['2026-10-06T00:30:00.000Z'] });
    }),
  );
};

const renderSection = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <RandomCrawlSection />
    </QueryClientProvider>,
  );

const gate = (): { promise: Promise<void>; release: () => void } => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
const cronInput = () => screen.getByPlaceholderText(/예: 0 12/);

describe('RandomCrawlSection — cron 미리보기 요청', () => {
  it('설정 응답 전에는 요청하지 않고, 온 뒤에 저장된 cron 으로 한 번만 요청한다', async () => {
    const hold = gate();
    useHandlers({ hold: hold.promise, config: config({ cronExpr: '30 9 * * *' }) });
    renderSection();

    // 설정을 기다리는 동안 — 기본 cron 으로 미리 묻지 않는다.
    await settle();
    expect(seen.previews).toEqual([]);
    expect(screen.getByText('미리보기를 불러오는 중…')).toBeInTheDocument();

    hold.release();
    expect(await screen.findByText('다음 실행 예정 (적용 후)')).toBeInTheDocument();
    // 프리셋에 없는 식이라 입력칸이 열리고 저장값이 들어 있다.
    expect(cronInput()).toHaveValue('30 9 * * *');
    await settle();
    expect(seen.previews).toEqual([{ cronExpr: '30 9 * * *', timezone: 'Asia/Seoul' }]);
  });

  it('저장된 cron 이 기본값과 같아도 요청은 한 번이다', async () => {
    useHandlers({ config: config({ cronExpr: '0 12 * * *' }) });
    renderSection();

    expect(await screen.findByText('다음 실행 예정 (적용 후)')).toBeInTheDocument();
    await settle();
    expect(seen.previews).toEqual([{ cronExpr: '0 12 * * *', timezone: 'Asia/Seoul' }]);
  });

  it('설정 조회가 실패하면 기본값으로 미리보기를 보여 준다', async () => {
    useHandlers({ configStatus: 500 });
    renderSection();

    expect(await screen.findByText('다음 실행 예정 (적용 후)')).toBeInTheDocument();
    expect(seen.previews).toEqual([{ cronExpr: '0 12 * * *', timezone: 'Asia/Seoul' }]);
  });

  it('직접 입력은 멈춘 뒤 마지막 값으로 한 번만, 프리셋 선택은 바로 요청한다', async () => {
    useHandlers({ config: config({ cronExpr: '30 9 * * *' }) });
    renderSection();
    expect(await screen.findByText('다음 실행 예정 (적용 후)')).toBeInTheDocument();
    expect(seen.previews).toHaveLength(1);

    for (const value of ['30 1', '30 10', '30 10 * * *']) {
      fireEvent.change(cronInput(), { target: { value } });
    }
    // 입력 중에는 직전 식의 미리보기를 지금 식의 것처럼 두지 않고, 요청도 아직 없다.
    expect(cronInput()).toHaveValue('30 10 * * *');
    expect(screen.getByText('미리보기를 불러오는 중…')).toBeInTheDocument();
    expect(seen.previews).toHaveLength(1);

    await waitFor(() => expect(seen.previews).toHaveLength(2), { timeout: 3000 });
    expect(seen.previews[1]).toEqual({ cronExpr: '30 10 * * *', timezone: 'Asia/Seoul' });
    expect(await screen.findByText('다음 실행 예정 (적용 후)')).toBeInTheDocument();

    // 프리셋은 한 번에 끝나는 선택 — 기다리지 않고 그 식으로 묻는다(입력칸은 닫힌다).
    fireEvent.click(screen.getByRole('button', { name: '매일 오후 7시' }));
    expect(screen.queryByPlaceholderText(/예: 0 12/)).toBeNull();
    await waitFor(() => expect(seen.previews).toHaveLength(3));
    expect(seen.previews[2]).toEqual({ cronExpr: '0 19 * * *', timezone: 'Asia/Seoul' });
    // 중간값('30 1'·'30 10')으로는 한 번도 묻지 않았다.
    expect(seen.previews.map((p) => p.cronExpr)).toEqual(['30 9 * * *', '30 10 * * *', '0 19 * * *']);
  });
});
