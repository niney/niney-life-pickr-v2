import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { SettlementDraftType } from '@repo/api-contract';
import { useAuthStore, useSettlementDraftStore } from '@repo/shared';
import { server } from '~/test/msw';
import { SettlementNewPage } from './SettlementNewPage';
import {
  TEST_PLACE_ID,
  draftParticipant,
  settlementDraft,
  settlementSession,
} from './testFixtures';

// 정산 마법사 컨테이너 — 진입 모드(create/edit)별로 "무엇을 부르고, 초안 스토어를
// 무엇으로 채우는가" 를 고정한다. 로그인 전용 화면이라(RequireUser 뒤) 로그인 상태로
// 렌더한다.
//
// 핵심 회귀: 수정(edit) 모드는 저장된 세션이 source of truth 다. 예전엔 임시저장
// hydrate 훅이 수정 모드에서도 돌았고(placeId 자리에 null = "식당 미지정 슬롯" 으로
// 읽힘), 그 슬롯에 남은 임시저장이 세션보다 늦게 도착하면 편집 중인 정산을 덮어썼다.

const SESSION = settlementSession();
const SESSION_URL = `/api/v1/settlements/${SESSION.id}`;
// 이어쓰기는 슬롯 단건 조회로 받는다(?placeId=, 생략 = 식당 미지정 슬롯) — 목록은 메타만 온다.
const DRAFT_BY_PLACE_URL = '/api/v1/settlement-drafts/by-place';
const DETAIL_URL = `/api/v1/restaurants/public/${TEST_PLACE_ID}`;
const CONTACTS_URL = '/api/v1/me/contacts';

// 식당 미지정 슬롯에 남아 있는, 지금 수정하려는 정산과 무관한 임시저장.
const UNRELATED_DRAFT = settlementDraft({
  id: 'draft-null',
  placeId: null,
  payload: {
    participants: [draftParticipant({ clientId: 'x1', name: '엉뚱이' })],
    rounds: [],
  },
});

// 화면이 부를 수 있는 요청을 전부 깔고 호출을 센다 — 안 불러야 하는 요청은 0 으로 단언.
const useHandlers = (drafts: SettlementDraftType[]) => {
  const calls = { drafts: 0, detail: 0, contacts: [] as Array<string | null> };
  server.use(
    http.get(SESSION_URL, () => HttpResponse.json(SESSION)),
    http.get(DRAFT_BY_PLACE_URL, ({ request }) => {
      calls.drafts += 1;
      const placeId = new URL(request.url).searchParams.get('placeId');
      return HttpResponse.json({ draft: drafts.find((d) => (d.placeId ?? null) === placeId) ?? null });
    }),
    http.get(DETAIL_URL, () => {
      calls.detail += 1;
      return HttpResponse.json({ placeId: TEST_PLACE_ID, name: '초밥천국', menus: [] });
    }),
    http.get(CONTACTS_URL, ({ request }) => {
      calls.contacts.push(new URL(request.url).searchParams.get('q'));
      return HttpResponse.json({ items: [], total: 0 });
    }),
  );
  return calls;
};

const renderAt = (path: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/me/settlements/new" element={<SettlementNewPage />} />
          <Route path="/restaurants/:placeId/settle/:id/edit" element={<SettlementNewPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

// 늦게 도착하는 응답이 있었다면 반영되고도 남을 시간.
const settle = () => new Promise((resolve) => setTimeout(resolve, 120));

describe('SettlementNewPage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    useSettlementDraftStore.getState().reset();
    useAuthStore.setState({ token: 'test-token', user: null, isGuest: false });
  });

  it('수정 모드 — 식당 미지정 슬롯의 임시저장이 편집 중인 정산을 덮어쓰지 않는다', async () => {
    const calls = useHandlers([UNRELATED_DRAFT]);

    renderAt(`/restaurants/${TEST_PLACE_ID}/settle/${SESSION.id}/edit`);

    // 저장된 세션의 참여자로 채워진다.
    expect(await screen.findByDisplayValue('철수')).toBeInTheDocument();
    expect(screen.getByDisplayValue('영희')).toBeInTheDocument();
    expect(screen.getByText(/정산 수정 · 초밥천국/)).toBeInTheDocument();

    await settle();

    // 임시저장 목록은 부르지도 않고, 화면·스토어 모두 세션 그대로다.
    expect(calls.drafts).toBe(0);
    expect(screen.getByDisplayValue('철수')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('엉뚱이')).not.toBeInTheDocument();
    expect(useSettlementDraftStore.getState().participants.map((p) => p.name)).toEqual([
      '철수',
      '영희',
    ]);
  });

  it('수정 모드 — 식당 상세도, 닫혀 있는 단골 검색도 부르지 않는다', async () => {
    const calls = useHandlers([]);

    renderAt(`/restaurants/${TEST_PLACE_ID}/settle/${SESSION.id}/edit`);
    await screen.findByDisplayValue('철수');
    await settle();

    // 헤더·식당명은 세션에서 온다 — 리뷰 전체를 읽는 상세 API 를 이름 때문에 부르지 않는다.
    expect(calls.detail).toBe(0);
    // 이름이 채워진 행이 둘이어도 자동완성은 focus 전까지, 단골 모달은 열기 전까지 조용하다.
    expect(calls.contacts).toEqual([]);
  });

  it('이름 칸에 focus 하면 그 행의 자동완성만 조회한다', async () => {
    const calls = useHandlers([]);

    renderAt(`/restaurants/${TEST_PLACE_ID}/settle/${SESSION.id}/edit`);
    fireEvent.focus(await screen.findByDisplayValue('철수'));

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    await waitFor(() => expect(calls.contacts).toEqual(['철수']));
    await settle();
    expect(calls.contacts).toEqual(['철수']);
  });

  it("'단골에서 추가' 모달은 열 때 비로소 단골 목록을 조회한다", async () => {
    const calls = useHandlers([]);

    renderAt(`/restaurants/${TEST_PLACE_ID}/settle/${SESSION.id}/edit`);
    await screen.findByDisplayValue('철수');
    expect(calls.contacts).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: /단골에서 추가/ }));

    expect(await screen.findByRole('dialog', { name: '단골에서 참여자 추가' })).toBeInTheDocument();
    // 검색어 없는 전체 조회 한 번.
    await waitFor(() => expect(calls.contacts).toEqual([null]));
  });

  it('새 정산(create) — 같은 슬롯의 서버 임시저장으로 이어 입력한다', async () => {
    const calls = useHandlers([UNRELATED_DRAFT]);

    renderAt('/me/settlements/new');

    // create 모드에선 식당 미지정 슬롯이 바로 이 화면의 슬롯이다.
    expect(await screen.findByDisplayValue('엉뚱이')).toBeInTheDocument();
    expect(calls.drafts).toBe(1);
  });
});
