import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import type {
  FoodAdminStatsType,
  FoodImportConfigType,
  FoodImportRunListType,
  FoodImportRunType,
  FoodItemType,
  FoodMergeConflictItemType,
  FoodRecognitionQualityResultType,
} from '@repo/api-contract';
import { server } from '~/test/msw';
import { AdminFoodPage } from './AdminFoodPage';

// 음식 카탈로그 어드민 페이지 — 마운트만으로 일곱 요청이 나간다(적재 설정/이력, 통계,
// 인식 교정 품질,
// 목록, cron 미리보기). onUnhandledRequest: 'error' 라 모두 기본 핸들러로 깔고, 각
// 테스트는 자기 시나리오의 핸들러만 덧댄다. 토스트는 sonner 를 모킹해 호출만 본다
// (<Toaster> 렌더·애니메이션 타이밍에 테스트가 묶이지 않게). SSE 는 EventSource 를
// 가짜로 세워 snapshot/progress/done 을 직접 흘린다.

vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  });
  return { toast };
});

const CONFIG_URL = '/api/v1/admin/food/import';
const RUN_URL = '/api/v1/admin/food/import/run';
const RUNS_URL = '/api/v1/admin/food/import/runs';
const PREVIEW_URL = '/api/v1/admin/food/import/preview';
const STATS_URL = '/api/v1/admin/food/stats';
const CONFLICTS_URL = '/api/v1/admin/food/merge-conflicts';
const QUALITY_URL = '/api/v1/admin/food/recognition-quality';
const ITEMS_URL = '/api/v1/admin/food/items';

const importConfig = (over: Partial<FoodImportConfigType> = {}): FoodImportConfigType => ({
  enabled: false,
  cronExpr: '0 4 1 * *',
  timezone: 'Asia/Seoul',
  sources: ['mfds-nutrition', 'mfds-recipe', 'mafra-recipe', 'menu-canonical'],
  classify: true,
  // 식약처 레시피만 키 미설정 → 경고 배지 1개.
  apiConfigured: { 'mfds-nutrition': true, 'mfds-recipe': false, 'mafra-recipe': true },
  lastRunAt: null,
  lastStatus: null,
  nextRunAt: null,
  updatedAt: '2026-08-20T00:00:00.000Z',
  ...over,
});

const run = (over: Partial<FoodImportRunType> = {}): FoodImportRunType => ({
  runId: 'r1',
  trigger: 'manual',
  status: 'done',
  phase: null,
  sources: ['mfds-nutrition'],
  stats: [
    { source: 'mfds-nutrition', fetched: 1000, inserted: 12, updated: 30, skipped: 5, error: null },
  ],
  classifiedCount: 7,
  progress: null,
  startedAt: '2026-08-20T04:00:00.000Z',
  finishedAt: '2026-08-20T04:05:00.000Z',
  error: null,
  ...over,
});

const stats: FoodAdminStatsType = {
  total: 120,
  active: 110,
  classified: 60,
  sourceObservationCount: 450,
  openMergeConflictCount: 0,
  nutritionDirectCount: 50,
  nutritionEstimatedCount: 20,
  nutritionMissingCount: 50,
  bySource: [
    { source: 'mfds-nutrition', count: 100 },
    { source: 'manual', count: 20 },
  ],
  byDishType: [
    { dishType: 'rice', count: 40 },
    { dishType: null, count: 60 },
  ],
};

const recognitionQuality: FoodRecognitionQualityResultType = {
  days: 30,
  from: '2026-07-21T00:00:00.000Z',
  to: '2026-08-20T00:00:00.000Z',
  recognitionEntryCount: 8,
  invalidRecognitionCount: 1,
  originalDishCount: 11,
  confirmedCount: 6,
  correctedCount: 3,
  deletedCount: 2,
  manuallyAddedCount: 2,
  correctionRate: 5 / 11,
  unmatchedFinalItemCount: 2,
  topCorrections: [{ originalName: '계란말이', finalName: '달걀말이', count: 2 }],
  topUnmatched: [{ name: '오이무침', count: 2 }],
  byModelVersion: [
    {
      model: 'vision-model',
      version: 2,
      recognitionEntryCount: 7,
      originalDishCount: 11,
      confirmedCount: 6,
      correctedCount: 3,
      deletedCount: 2,
      correctionRate: 5 / 11,
    },
  ],
  byConfidence: [
    {
      bucket: 'low',
      originalDishCount: 2,
      confirmedCount: 0,
      correctedCount: 1,
      deletedCount: 1,
      correctionRate: 1,
    },
    {
      bucket: 'medium',
      originalDishCount: 3,
      confirmedCount: 2,
      correctedCount: 1,
      deletedCount: 0,
      correctionRate: 1 / 3,
    },
    {
      bucket: 'high',
      originalDishCount: 6,
      confirmedCount: 4,
      correctedCount: 1,
      deletedCount: 1,
      correctionRate: 2 / 6,
    },
  ],
};

const item = (over: Partial<FoodItemType> = {}): FoodItemType => ({
  id: 'f1',
  name: '김치찌개',
  repName: '찌개',
  aliases: ['김치찌게'],
  dishType: 'stew',
  mainIngredient: 'pork',
  cuisine: 'korean',
  ingredients: null,
  servingG: null,
  nutrition: null,
  source: 'mfds-nutrition',
  sourceId: null,
  sourceCategory: null,
  popularity: 12,
  active: true,
  classifyVersion: null,
  classifyModel: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-19T10:00:00.000Z',
  ...over,
});

interface BaseHandlerOptions {
  config?: FoodImportConfigType;
  runs?: FoodImportRunListType;
  items?: FoodItemType[];
}

// 목록 요청 URL 을 순서대로 모아 돌려준다 — 검색/필터가 쿼리에 반영되는지 확인용.
const useBaseHandlers = ({
  config = importConfig(),
  runs = { items: [run()], inflightRunId: null },
  items = [item()],
}: BaseHandlerOptions = {}) => {
  const itemRequests: string[] = [];
  server.use(
    http.get(CONFIG_URL, () => HttpResponse.json(config)),
    http.get(RUNS_URL, () => HttpResponse.json(runs)),
    http.get(STATS_URL, () => HttpResponse.json(stats)),
    http.get(CONFLICTS_URL, () => HttpResponse.json({ items: [], total: 0 })),
    http.get(QUALITY_URL, () => HttpResponse.json(recognitionQuality)),
    http.get(ITEMS_URL, ({ request }) => {
      itemRequests.push(request.url);
      return HttpResponse.json({ items, total: items.length });
    }),
    http.post(PREVIEW_URL, () =>
      HttpResponse.json({ valid: true, error: null, nextRuns: ['2026-09-01T04:00:00.000Z'] }),
    ),
  );
  return { itemRequests };
};

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminFoodPage />
    </QueryClientProvider>,
  );
};

// 진행 SSE 용 가짜 EventSource — 훅이 거는 리스너를 보관했다가 테스트가 이벤트를 흘린다.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly url: string;
  onerror: ((ev: Event) => void) | null = null;
  closed = false;
  private listeners = new Map<string, Array<(ev: MessageEvent) => void>>();
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: (ev: MessageEvent) => void): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(cb);
    this.listeners.set(type, arr);
  }
  close(): void {
    this.closed = true;
  }
  emit(type: string, data: unknown): void {
    for (const cb of this.listeners.get(type) ?? []) {
      cb({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}

const runNowButton = () => screen.getByRole('button', { name: '지금 실행' });

describe('AdminFoodPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeEventSource.instances = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('적재 설정·통계·이력·카탈로그를 한 화면에 그린다', async () => {
    useBaseHandlers();
    renderPage();

    // 카탈로그 행 — 이름 + 별칭 + 분류 배지 + 출처. 분류 라벨은 필터 <option> 에도
    // 있으므로 행 안에서만 찾는다.
    const row = (await screen.findByText('김치찌개')).closest('tr')!;
    expect(within(row).getByText('김치찌게')).toBeInTheDocument();
    expect(within(row).getByText('찌개·전골')).toBeInTheDocument();
    expect(within(row).getByText('돼지고기')).toBeInTheDocument();
    expect(within(row).getByText('한식')).toBeInTheDocument();
    expect(within(row).getByText('식약처 영양성분')).toBeInTheDocument();
    expect(within(row).getByText('12')).toBeInTheDocument();

    // 적재 잡 — 소스 4개 체크 + 키 미설정 경고는 식약처 레시피 하나.
    expect(await screen.findAllByText('키 미설정')).toHaveLength(1);
    expect(screen.getByLabelText('식약처 레시피 소스')).toBeChecked();
    expect(screen.getByLabelText('외식 메뉴 소스')).toBeChecked();
    expect(screen.getByLabelText('적재 후 LLM 2축 분류')).toBeChecked();
    // cron 프리셋(매월 1일)이 저장값 → 커스텀 입력은 숨김.
    expect(screen.queryByLabelText('cron 식')).not.toBeInTheDocument();
    expect(screen.getByLabelText('타임존')).toHaveValue('Asia/Seoul');

    // 통계 타일 + 막대(미분류 포함).
    expect(await screen.findByText('120')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('미분류')).toBeInTheDocument();

    // 사진 인식 품질 — 작은 표본/k=2 안내와 집계된 교정만 노출.
    expect(screen.getByText('사진 인식 교정 품질')).toBeInTheDocument();
    expect(screen.getByText(/작은 표본의 방향성 지표/)).toBeInTheDocument();
    expect(screen.getByText('계란말이 → 달걀말이')).toBeInTheDocument();
    expect(screen.getByText('오이무침')).toBeInTheDocument();
    expect(screen.getByText('vision-model · v2')).toBeInTheDocument();
    expect(screen.getByLabelText('인식 모델 필터')).toBeInTheDocument();
    expect(screen.getByLabelText('인식 프롬프트 버전 필터')).toBeInTheDocument();
    expect(screen.getByLabelText('인식 신뢰도 필터')).toBeInTheDocument();

    // 이력 — 상태 칩 + 소스별 집계 + 분류 수.
    expect(await screen.findByText('완료')).toBeInTheDocument();
    expect(screen.getByText('1000 → 12 / 30 / 5')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('열린 병합 충돌의 출처를 보여주고 새 값 반영 액션을 PATCH한다', async () => {
    useBaseHandlers();
    const conflict: FoodMergeConflictItemType = {
      id: 'conflict-1',
      foodItem: { id: 'food-1', name: '감자전' },
      field: 'dishType',
      existingValue: 'pancake',
      incomingValue: 'fried',
      source: 'mfds-recipe',
      sourceId: 'R-7',
      status: 'open',
      createdAt: '2026-08-20T00:00:00.000Z',
      resolvedAt: null,
      observations: [
        {
          id: 'observation-1',
          field: 'dishType',
          value: 'pancake',
          source: 'mfds-nutrition',
          sourceId: 'N-1',
          observedAt: '2026-08-19T00:00:00.000Z',
        },
        {
          id: 'observation-2',
          field: 'dishType',
          value: 'fried',
          source: 'mfds-recipe',
          sourceId: 'R-7',
          observedAt: '2026-08-20T00:00:00.000Z',
        },
      ],
    };
    const posted: unknown[] = [];
    server.use(
      http.get(CONFLICTS_URL, () => HttpResponse.json({ items: [conflict], total: 1 })),
      http.patch(`${CONFLICTS_URL}/:id`, async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json({
          ...conflict,
          status: 'accepted_incoming',
          resolvedAt: '2026-08-20T01:00:00.000Z',
        });
      }),
    );

    renderPage();
    const conflictRow = (await screen.findByText('감자전')).closest('li')!;
    expect(within(conflictRow).getByText('전·부침')).toBeInTheDocument();
    expect(within(conflictRow).getByText('튀김')).toBeInTheDocument();
    expect(within(conflictRow).getByText(/관측 출처/)).toHaveTextContent('식약처 영양성분');
    expect(within(conflictRow).getByText(/관측 출처/)).toHaveTextContent('식약처 레시피');

    fireEvent.click(within(conflictRow).getByRole('button', { name: '새 값 반영' }));
    await waitFor(() => expect(posted).toEqual([{ action: 'accept_incoming' }]));
    expect(toast.success).toHaveBeenCalledWith('새 소스 값을 반영했어요');
  });

  it('검색어(디바운스)·필터·정렬이 목록 요청 쿼리에 반영되고 페이지는 1로 돌아간다', async () => {
    const { itemRequests } = useBaseHandlers();
    renderPage();
    await screen.findByText('김치찌개');

    const last = () => new URL(itemRequests.at(-1)!).searchParams;
    expect(Object.fromEntries(last())).toEqual({ sort: 'popularity', offset: '0', limit: '50' });

    fireEvent.change(screen.getByLabelText('음식 검색'), { target: { value: '김치' } });
    await waitFor(() => expect(last().get('q')).toBe('김치'));

    fireEvent.change(screen.getByLabelText('조리형태 필터'), { target: { value: 'stew' } });
    await waitFor(() => expect(last().get('dishType')).toBe('stew'));

    fireEvent.click(screen.getByLabelText('미분류만'));
    await waitFor(() => expect(last().get('unclassified')).toBe('1'));

    fireEvent.change(screen.getByLabelText('활성 필터'), { target: { value: '0' } });
    await waitFor(() => expect(last().get('active')).toBe('0'));

    fireEvent.change(screen.getByLabelText('정렬'), { target: { value: 'name' } });
    await waitFor(() => expect(last().get('sort')).toBe('name'));

    // 앞서 건 조건은 유지되고, 미지정 키(주재료 등)는 쿼리에 없다.
    expect(Object.fromEntries(last())).toEqual({
      q: '김치',
      dishType: 'stew',
      active: '0',
      unclassified: '1',
      sort: 'name',
      offset: '0',
      limit: '50',
    });
  });

  it('지금 실행 — 기본은 body 없이, 오버라이드를 켜면 현재 선택(소스·분류)을 보내고 결과를 토스트로 알린다', async () => {
    const posted: unknown[] = [];
    let nextStatus: FoodImportRunType['status'] = 'running';
    useBaseHandlers();
    server.use(
      http.post(RUN_URL, async ({ request }) => {
        const text = await request.text();
        posted.push(text ? JSON.parse(text) : null);
        return HttpResponse.json(
          run({
            runId: 'r9',
            status: nextStatus,
            phase: nextStatus === 'running' ? 'fetching' : null,
          }),
        );
      }),
    );
    renderPage();
    await waitFor(() => expect(runNowButton()).toBeEnabled());

    // ① 저장된 설정으로 — body 없음.
    fireEvent.click(runNowButton());
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(posted).toEqual([null]);
    expect(vi.mocked(toast.success).mock.calls[0]?.[0]).toMatch(/시작/);

    // ② 오버라이드 + 소스 하나 해제 — 이번 회차만 { sources, classify }.
    fireEvent.click(screen.getByLabelText('이번 회차만 현재 선택으로 실행'));
    fireEvent.click(screen.getByLabelText('외식 메뉴 소스'));
    nextStatus = 'skipped';
    await waitFor(() => expect(runNowButton()).toBeEnabled());
    fireEvent.click(runNowButton());
    await waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(1));
    expect(posted[1]).toEqual({
      sources: ['mfds-nutrition', 'mfds-recipe', 'mafra-recipe'],
      classify: true,
    });
  });

  it('진행 중 run 이 있으면 SSE 를 구독해 단계·소스·진행률을 그리고 done 에서 걷는다', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const running = run({
      runId: 'r2',
      status: 'running',
      phase: 'fetching',
      stats: [],
      progress: { processed: 0, total: null },
      finishedAt: null,
    });
    useBaseHandlers({ runs: { items: [running], inflightRunId: 'r2' } });
    renderPage();

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const es = FakeEventSource.instances[0]!;
    expect(es.url).toBe('/api/v1/admin/food/import/run-events');

    // snapshot(running) → 단계 + 처리/전체.
    act(() => es.emit('snapshot', { ...running, progress: { processed: 120, total: 1000 } }));
    expect(await screen.findByText('수집')).toBeInTheDocument();
    expect(screen.getByText('120 / 1000')).toBeInTheDocument();
    expect(runNowButton()).toBeDisabled();

    // progress → 단계·소스·메시지 갱신.
    act(() =>
      es.emit('progress', {
        type: 'progress',
        runId: 'r2',
        phase: 'upserting',
        source: 'mfds-nutrition',
        processed: 500,
        total: 1000,
        message: '카탈로그 반영 중',
      }),
    );
    expect(await screen.findByText('반영 · 식약처 영양성분')).toBeInTheDocument();
    expect(screen.getByText('500 / 1000')).toBeInTheDocument();
    expect(screen.getByText('카탈로그 반영 중')).toBeInTheDocument();

    // done → 진행 패널 제거 + 스트림 닫힘.
    act(() =>
      es.emit('done', {
        type: 'done',
        runId: 'r2',
        status: 'done',
        finishedAt: '2026-08-22T04:10:00.000Z',
      }),
    );
    await waitFor(() => expect(screen.queryByText('500 / 1000')).not.toBeInTheDocument());
    expect(es.closed).toBe(true);
  });

  it('인라인 편집 — 바뀐 필드만 PATCH 하고 분류 비우기는 null 로 보낸다', async () => {
    let patched: unknown = null;
    useBaseHandlers();
    server.use(
      http.patch(`${ITEMS_URL}/f1`, async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json(item({ name: '김치찌개 얼큰', cuisine: null }));
      }),
    );
    renderPage();
    await screen.findByText('김치찌개');

    fireEvent.click(screen.getByRole('button', { name: '김치찌개 편집' }));
    // 편집기는 기존 값으로 채워진다.
    expect(screen.getByLabelText('음식명')).toHaveValue('김치찌개');
    expect(screen.getByLabelText('별칭')).toHaveValue('김치찌게');
    expect(screen.getByLabelText('요리 계통')).toHaveValue('korean');

    fireEvent.change(screen.getByLabelText('음식명'), { target: { value: ' 김치찌개 얼큰 ' } });
    fireEvent.change(screen.getByLabelText('요리 계통'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(patched).toEqual({ name: '김치찌개 얼큰', cuisine: null }));
    expect(toast.success).toHaveBeenCalled();
    // 저장 후 편집기가 닫힌다.
    await waitFor(() => expect(screen.queryByLabelText('음식명')).not.toBeInTheDocument());
  });

  it('수기 등록 — 다이얼로그에서 POST, 409 면 "이미 있는 음식명" 토스트 후 다시 시도할 수 있다', async () => {
    const posted: unknown[] = [];
    useBaseHandlers();
    server.use(
      http.post(ITEMS_URL, async ({ request }) => {
        posted.push(await request.json());
        if (posted.length === 1) {
          return HttpResponse.json(
            { statusCode: 409, error: 'Conflict', message: '이미 있는 음식' },
            { status: 409 },
          );
        }
        return HttpResponse.json(item({ id: 'f2', name: '새음식', source: 'manual' }), {
          status: 201,
        });
      }),
    );
    renderPage();
    await screen.findByText('김치찌개');

    fireEvent.click(screen.getByRole('button', { name: '수기 등록' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('음식명'), { target: { value: '새음식' } });
    fireEvent.change(within(dialog).getByLabelText('조리형태'), { target: { value: 'rice' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '등록' }));

    // 409 → 고정 문구 토스트, 다이얼로그는 열린 채(이름만 고쳐 재시도 가능).
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('이미 있는 음식명'));
    expect(posted[0]).toEqual({ name: '새음식', dishType: 'rice', active: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: '등록' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(posted).toHaveLength(2);
  });
});
