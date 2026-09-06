import {
  Routes,
  SAJU_GUEST_KEY_HEADER,
  type CreateSajuReadingInputType,
  type CreateSajuShareInputType,
  type ListSajuReadingsQueryType,
  type ListSajuReadingsResultType,
  type SajuProfileInputType,
  type SajuProfileListType,
  type SajuProfileType,
  type SajuShareResultType,
  type SharedSajuReadingType,
  type SajuDailyInputType,
  type SajuDailyResultType,
  type SajuDatePickInputType,
  type SajuDatePickResultType,
  type SajuFoodInputType,
  type SajuFoodResultType,
  type SajuJobPollResultType,
  type SajuMatchInputType,
  type SajuMatchResultType,
  type SajuReadingResultType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// 사주 — 풀이·오늘·궁합·택일·음식은 공개(게스트 키 헤더 + 토큰이 있으면 자동 첨부돼 서버가 회원으로 판정).
// 전체 풀이는 즉시 응답(정적 본문 + jobId) 뒤 pollJob 으로 섹션을 받는다.

const guestHeaders = (guestKey: string | null): Record<string, string> | undefined =>
  guestKey ? { [SAJU_GUEST_KEY_HEADER]: guestKey } : undefined;

export const sajuApi = {
  createReading: (input: CreateSajuReadingInputType, guestKey: string | null) =>
    apiFetch<SajuReadingResultType>(Routes.Saju.readings, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: guestHeaders(guestKey),
    }),

  // long-poll — 서버가 after 보다 큰 버전이 생길 때까지(최대 wait ms) 기다린다.
  pollJob: (jobId: string, after: number, wait = 20_000) =>
    apiFetch<SajuJobPollResultType>(`${Routes.Saju.job(jobId)}?after=${after}&wait=${wait}`),

  daily: (input: SajuDailyInputType, guestKey: string | null) =>
    apiFetch<SajuDailyResultType>(Routes.Saju.daily, { method: 'POST', body: JSON.stringify(input), headers: guestHeaders(guestKey) }),

  match: (input: SajuMatchInputType, guestKey: string | null) =>
    apiFetch<SajuMatchResultType>(Routes.Saju.match, { method: 'POST', body: JSON.stringify(input), headers: guestHeaders(guestKey) }),

  datePick: (input: SajuDatePickInputType, guestKey: string | null) =>
    apiFetch<SajuDatePickResultType>(Routes.Saju.datePick, { method: 'POST', body: JSON.stringify(input), headers: guestHeaders(guestKey) }),

  food: (input: SajuFoodInputType, guestKey: string | null) =>
    apiFetch<SajuFoodResultType>(Routes.Saju.food, { method: 'POST', body: JSON.stringify(input), headers: guestHeaders(guestKey) }),

  // 공유 — 회원은 readingId, 게스트는 생년월일 입력(서버가 캐시된 풀이로 행을 만든다).
  createShare: (input: CreateSajuShareInputType, guestKey: string | null) =>
    apiFetch<SajuShareResultType>(Routes.Saju.shares, { method: 'POST', body: JSON.stringify(input), headers: guestHeaders(guestKey) }),
  getShared: (token: string) => apiFetch<SharedSajuReadingType>(Routes.Saju.shared(token)),

  // 회원 프로필·기록.
  listProfiles: () => apiFetch<SajuProfileListType>(Routes.Saju.profiles),
  createProfile: (input: SajuProfileInputType) => apiFetch<SajuProfileType>(Routes.Saju.profiles, { method: 'POST', body: JSON.stringify(input) }),
  updateProfile: (id: string, input: SajuProfileInputType) => apiFetch<SajuProfileType>(Routes.Saju.profile(id), { method: 'PUT', body: JSON.stringify(input) }),
  deleteProfile: (id: string) => apiFetch<void>(Routes.Saju.profile(id), { method: 'DELETE' }),
  listMine: (query: Partial<ListSajuReadingsQueryType> = {}) => {
    const qs = new URLSearchParams();
    if (query.cursor) qs.set('cursor', query.cursor);
    if (query.limit) qs.set('limit', String(query.limit));
    const suffix = qs.size > 0 ? `?${qs.toString()}` : '';
    return apiFetch<ListSajuReadingsResultType>(`${Routes.Saju.myReadings}${suffix}`);
  },
  getMine: (id: string) => apiFetch<SajuReadingResultType>(Routes.Saju.myReading(id)),
  deleteMine: (id: string) => apiFetch<void>(Routes.Saju.myReading(id), { method: 'DELETE' }),
};
