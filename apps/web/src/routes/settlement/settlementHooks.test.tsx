import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { CreateSettlementInputType } from '@repo/api-contract';
import {
  useAuthStore,
  useCreateSettlement,
  useDeleteSettlements,
  useListSettlements,
  useSettlement,
  useSettlementDraftAutoSync,
  useSettlementDraftHydrate,
  useSettlementDraftStore,
} from '@repo/shared';
import { server } from '~/test/msw';
import {
  TEST_PLACE_ID,
  draftParticipant,
  settlementDraft,
  settlementSession,
} from './testFixtures';

// 정산 화면이 쓰는 공유 훅(@repo/shared)의 요청·캐시 계약. shared 쪽 테스트는 node
// 환경이라 훅을 렌더하지 못하므로, 화면과 같은 조건(jsdom + QueryClient + MSW)에서
// 여기서 본다. 모두 "요청이 몇 번 나가는가 / 캐시에 무엇이 남는가" 를 고정하는 테스트다.

const SETTLEMENTS_URL = '/api/v1/settlements';
const DRAFTS_URL = '/api/v1/settlement-drafts';
const DRAFT_BY_PLACE_URL = '/api/v1/settlement-drafts/by-place';

const makeWrapper = () => {
  // 앱(main.tsx)처럼 staleTime 을 둔다 — 0 이면 캐시에 심은 데이터도 마운트 즉시 다시
  // 조회돼 "다시 요청하지 않는다" 를 검증할 수 없다.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
};

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

const draftNames = () => useSettlementDraftStore.getState().participants.map((p) => p.name);

beforeEach(() => {
  // 초안 스토어는 모듈 수명 동안 살아 있고 sessionStorage 에 persist 된다.
  window.sessionStorage.clear();
  useSettlementDraftStore.getState().reset();
  useAuthStore.setState({ token: 'test-token', user: null, isGuest: false });
});

describe('useCreateSettlement', () => {
  const input: CreateSettlementInputType = {
    rounds: [
      {
        restaurantPlaceId: TEST_PLACE_ID,
        source: 'MANUAL',
        totalAmount: null,
        warning: null,
        receiptImageToken: null,
        discountAmount: null,
        discountCategory: null,
        categoryAdjustments: null,
        groupSplits: null,
        items: [
          {
            name: '모둠초밥',
            unitPrice: 30_000,
            quantity: 1,
            amount: 30_000,
            category: 'UNCATEGORIZED',
            matchedMenuName: null,
          },
        ],
        attendees: [
          {
            participantClientId: 'c1',
            attended: true,
            excludeAlcoholOverride: null,
            excludeNonAlcoholOverride: null,
            excludeSideOverride: null,
          },
        ],
      },
    ],
    participants: [
      {
        clientId: 'c1',
        name: '철수',
        nickname: null,
        excludeAlcohol: false,
        excludeNonAlcohol: false,
        excludeSide: false,
      },
    ],
  };

  it('저장 응답을 상세 캐시에 심어 결과 페이지가 같은 세션을 다시 요청하지 않는다', async () => {
    const saved = settlementSession({ id: 'new-1' });
    let detailCalls = 0;
    server.use(
      http.post(SETTLEMENTS_URL, () => HttpResponse.json(saved)),
      http.get(`${SETTLEMENTS_URL}/new-1`, () => {
        detailCalls += 1;
        return HttpResponse.json(saved);
      }),
    );
    const { queryClient, wrapper } = makeWrapper();
    const create = renderHook(() => useCreateSettlement(), { wrapper });

    await act(async () => {
      await create.result.current.mutateAsync(input);
    });

    expect(queryClient.getQueryData(['settlement', 'one', 'new-1'])).toEqual(saved);

    // 저장 직후 이동하는 결과 페이지가 여는 것과 같은 훅.
    const detail = renderHook(() => useSettlement('new-1'), { wrapper });
    expect(detail.result.current.data).toEqual(saved);
    await settle();
    expect(detailCalls).toBe(0);
  });
});

describe('useDeleteSettlements', () => {
  it('여러 건을 지워도 목록은 끝난 뒤 한 번만 다시 조회한다', async () => {
    let listCalls = 0;
    const deleted: string[] = [];
    server.use(
      http.get(SETTLEMENTS_URL, () => {
        listCalls += 1;
        return HttpResponse.json({ items: [], total: 0 });
      }),
      http.delete(`${SETTLEMENTS_URL}/:id`, ({ params }) => {
        deleted.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { wrapper } = makeWrapper();
    const list = renderHook(() => useListSettlements({ offset: 0, limit: 20 }), { wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    expect(listCalls).toBe(1);

    const bulk = renderHook(() => useDeleteSettlements(), { wrapper });
    await act(async () => {
      await bulk.result.current.mutateAsync(['a', 'b', 'c']);
    });

    expect([...deleted].sort()).toEqual(['a', 'b', 'c']);
    // 건마다 무효화했다면 1 + 3 이 된다.
    await settle();
    expect(listCalls).toBe(2);
  });

  it('일부가 실패해도 reject 하지 않고 건별 결과를 돌려주며, 무효화는 그대로 한 번', async () => {
    let listCalls = 0;
    server.use(
      http.get(SETTLEMENTS_URL, () => {
        listCalls += 1;
        return HttpResponse.json({ items: [], total: 0 });
      }),
      http.delete(`${SETTLEMENTS_URL}/:id`, ({ params }) =>
        params.id === 'bad'
          ? HttpResponse.json(
              { statusCode: 500, error: 'Internal Server Error', message: '실패' },
              { status: 500 },
            )
          : new HttpResponse(null, { status: 204 }),
      ),
    );
    const { wrapper } = makeWrapper();
    const list = renderHook(() => useListSettlements({ offset: 0, limit: 20 }), { wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));

    const bulk = renderHook(() => useDeleteSettlements(), { wrapper });
    let results: PromiseSettledResult<void>[] = [];
    await act(async () => {
      results = await bulk.result.current.mutateAsync(['a', 'bad', 'c']);
    });

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    await settle();
    expect(listCalls).toBe(2);
  });
});

describe('useSettlementDraftAutoSync', () => {
  const renderAutoSync = () => {
    const { wrapper } = makeWrapper();
    return renderHook(
      () =>
        useSettlementDraftAutoSync({
          placeId: null,
          placeNameHint: null,
          hydrated: true,
          debounceMs: 30,
        }),
      { wrapper },
    );
  };

  const rename = (name: string) =>
    act(() => useSettlementDraftStore.getState().updateParticipant('c1', { name }));

  beforeEach(() => {
    useSettlementDraftStore.setState({
      participants: [draftParticipant({ clientId: 'c1', name: '철수' })],
      rounds: [],
    });
  });

  it('연속 입력은 디바운스 뒤 마지막 상태로 한 번만 저장한다', async () => {
    const bodies: Array<{ payload: { participants: Array<{ name: string }> } }> = [];
    server.use(
      http.put(DRAFTS_URL, async ({ request }) => {
        bodies.push((await request.json()) as (typeof bodies)[number]);
        return HttpResponse.json(settlementDraft({ id: 'draft-1' }));
      }),
    );
    const { result } = renderAutoSync();

    rename('철');
    rename('철수');
    rename('철수야');

    await waitFor(() => expect(result.current.status).toBe('saved'));
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.payload.participants[0]!.name).toBe('철수야');
    expect(result.current.draftId).toBe('draft-1');
  });

  it('고쳤다가 되돌리면 저장할 것이 없어 요청이 나가지 않는다', async () => {
    let puts = 0;
    server.use(
      http.put(DRAFTS_URL, () => {
        puts += 1;
        return HttpResponse.json(settlementDraft({ id: 'draft-1' }));
      }),
    );
    const { result } = renderAutoSync();

    rename('철수야');
    rename('철수');

    await settle(150);
    expect(puts).toBe(0);
    expect(result.current.status).toBe('idle');
  });
});

describe('useSettlementDraftHydrate', () => {
  // 식당 미지정 슬롯(placeId: null)에 남아 있는 서버 임시저장.
  const nullSlotDraft = settlementDraft({
    id: 'draft-null',
    placeId: null,
    payload: {
      participants: [draftParticipant({ clientId: 'x1', name: '엉뚱이' })],
      rounds: [],
    },
  });

  it('기본(켜짐)은 같은 슬롯의 서버 임시저장으로 store 를 채운다', async () => {
    // 이어쓰기는 슬롯 단건 조회(by-place)로 받는다 — 목록은 메타만 온다.
    server.use(http.get(DRAFT_BY_PLACE_URL, () => HttpResponse.json({ draft: nullSlotDraft })));
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useSettlementDraftHydrate(null), { wrapper });

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.matched?.id).toBe('draft-null');
    expect(draftNames()).toEqual(['엉뚱이']);
  });

  it('enabled:false(수정 모드)면 슬롯을 부르지도, store 를 덮어쓰지도 않는다', async () => {
    let listCalls = 0;
    server.use(
      http.get(DRAFT_BY_PLACE_URL, () => {
        listCalls += 1;
        return HttpResponse.json({ draft: nullSlotDraft });
      }),
    );
    // 수정 모드가 저장된 세션으로 채워 둔 상태.
    useSettlementDraftStore.setState({
      participants: [draftParticipant({ clientId: 'p-part-1', name: '철수' })],
      rounds: [],
    });
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useSettlementDraftHydrate(null, { enabled: false }), {
      wrapper,
    });

    await settle();
    expect(listCalls).toBe(0);
    expect(result.current).toEqual({ hydrated: false, matched: null });
    expect(draftNames()).toEqual(['철수']);
  });
});
