import {
  Routes,
  TAROT_GUEST_KEY_HEADER,
  type CreateTarotReadingInputType,
  type CreateTarotShareInputType,
  type ListTarotReadingsQueryType,
  type ListTarotReadingsResultType,
  type SharedTarotReadingType,
  type TarotReadingResultType,
  type TarotShareResultType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// 타로 — 리딩·공유는 공개(게스트 키 헤더 + 토큰이 있으면 자동 첨부돼 서버가 회원으로 판정), 기록은 회원.
export const tarotApi = {
  createReading: (input: CreateTarotReadingInputType, guestKey: string | null) =>
    apiFetch<TarotReadingResultType>(Routes.Tarot.readings, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: guestKey ? { [TAROT_GUEST_KEY_HEADER]: guestKey } : undefined,
    }),

  // 공유 토큰 발급 — 회원은 readingId, 게스트는 리딩 입력(서버가 본문을 다시 확보).
  createShare: (input: CreateTarotShareInputType, guestKey: string | null) =>
    apiFetch<TarotShareResultType>(Routes.Tarot.shares, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: guestKey ? { [TAROT_GUEST_KEY_HEADER]: guestKey } : undefined,
    }),

  getShared: (token: string) => apiFetch<SharedTarotReadingType>(Routes.Tarot.shared(token)),

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
