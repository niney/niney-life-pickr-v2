import { afterEach, describe, expect, it, vi } from 'vitest';
import { utf8ByteLength, type ListSettlementDraftsResultType } from '@repo/api-contract';
import { configureApi } from '../api/client.js';
import { settlementDraftApi } from '../api/settlement-draft.api.js';
import { applySavedDraft } from './useSettlementDraft.js';

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  configureApi({ baseUrl: '' });
});

describe('settlementDraftApi', () => {
  it('이어쓰기 단건은 by-place 로 — 식당 미지정 슬롯이면 placeId 쿼리를 붙이지 않는다', async () => {
    const fetchMock = vi.fn((_input: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(jsonResponse({ draft: null })),
    );
    vi.stubGlobal('fetch', fetchMock);
    configureApi({ baseUrl: 'https://api.test', getToken: () => 't' });

    await settlementDraftApi.getByPlace('1234 5');
    await settlementDraftApi.getByPlace(null);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.test/api/v1/settlement-drafts/by-place?placeId=1234%205',
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.test/api/v1/settlement-drafts/by-place');
  });
});

describe('utf8ByteLength (임시저장 크기 기준)', () => {
  it('TextEncoder 와 같은 UTF-8 바이트 수 — ASCII 1·한글 3·이모지(서로게이트 쌍) 4', () => {
    for (const s of ['', 'abc', '가나다', '😀', 'a가😀\n"x"', 'éࠀ￿']) {
      expect(utf8ByteLength(s)).toBe(new TextEncoder().encode(s).length);
    }
  });
});

describe('applySavedDraft', () => {
  const list: ListSettlementDraftsResultType = {
    items: [
      {
        id: 'a',
        placeId: 'p-a',
        placeNameHint: 'A',
        byteSize: 10,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
      {
        id: 'b',
        placeId: 'p-b',
        placeNameHint: 'B',
        byteSize: 20,
        createdAt: '2026-10-02T00:00:00.000Z',
        updatedAt: '2026-10-02T00:00:00.000Z',
      },
    ],
  };

  it('PUT 응답(id·updatedAt)과 보낸 payload 로 이어쓰기 캐시를 채우고, 목록의 그 항목을 맨 앞으로', () => {
    const payload = { participants: [{ clientId: 'p1', name: '홍길동' }], rounds: [] };
    const next = applySavedDraft(
      { id: 'a', updatedAt: '2026-10-05T00:00:00.000Z' },
      { placeId: 'p-a', placeNameHint: ' A2 ', payload },
      {
        list,
        byPlace: {
          draft: {
            id: 'a',
            placeId: 'p-a',
            placeNameHint: 'A',
            payload: {},
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-01T00:00:00.000Z',
          },
        },
      },
    );
    expect(next.byPlace.draft).toEqual({
      id: 'a',
      placeId: 'p-a',
      placeNameHint: 'A2',
      payload,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
    });
    expect(next.listHasItem).toBe(true);
    expect(next.list?.items.map((d) => d.id)).toEqual(['a', 'b']);
    expect(next.list?.items[0]).toMatchObject({
      placeNameHint: 'A2',
      updatedAt: '2026-10-05T00:00:00.000Z',
      // 한글 3바이트 — 서버 octet_length 와 같은 기준.
      byteSize: new TextEncoder().encode(JSON.stringify(payload)).length,
    });
  });

  it('목록에 없던 새 슬롯이면 목록은 그대로 두고(호출자가 무효화) 이어쓰기 캐시만 만든다', () => {
    const next = applySavedDraft(
      { id: 'c', updatedAt: '2026-10-05T00:00:00.000Z' },
      { placeId: null, payload: { participants: [], rounds: [] } },
      { list },
    );
    expect(next.listHasItem).toBe(false);
    expect(next.list).toBe(list);
    expect(next.byPlace.draft).toMatchObject({
      id: 'c',
      placeId: null,
      placeNameHint: null,
      createdAt: '2026-10-05T00:00:00.000Z',
    });
  });
});
