import {
  Routes,
  TAROT_GUEST_KEY_HEADER,
  type CreateTarotReadingInputType,
  type ListTarotReadingsQueryType,
  type ListTarotReadingsResultType,
  type TarotReadingResultType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// 타로 — 리딩은 공개(게스트 키 헤더 + 토큰이 있으면 자동 첨부돼 서버가 회원으로 판정), 기록은 회원.
export const tarotApi = {
  createReading: (input: CreateTarotReadingInputType, guestKey: string | null) =>
    apiFetch<TarotReadingResultType>(Routes.Tarot.readings, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: guestKey ? { [TAROT_GUEST_KEY_HEADER]: guestKey } : undefined,
    }),

  listMine: (query: Partial<ListTarotReadingsQueryType> = {}) => {
    const qs = new URLSearchParams();
    if (query.cursor) qs.set('cursor', query.cursor);
    if (query.limit) qs.set('limit', String(query.limit));
    const suffix = qs.size > 0 ? `?${qs.toString()}` : '';
    return apiFetch<ListTarotReadingsResultType>(`${Routes.Tarot.myReadings}${suffix}`);
  },

  getMine: (id: string) => apiFetch<TarotReadingResultType>(Routes.Tarot.myReading(id)),

  deleteMine: (id: string) => apiFetch<void>(Routes.Tarot.myReading(id), { method: 'DELETE' }),
};
