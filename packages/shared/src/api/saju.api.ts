import {
  Routes,
  type SajuProfileType,
  type SajuProfileInputType,
  type CreateSajuPairInputType,
  type SajuPairChartType,
  type SajuPairResultType,
  SAJU_GUEST_KEY_HEADER,
  type CreateSajuReadingInputType,
  type CreateSajuShareInputType,
  type ListSajuReadingsResultType,
  type PublicSajuShareType,
  type SajuChartType,
  type SajuReadingResultType,
  type SajuShareResultType,
} from '@repo/api-contract';
import { apiFetch, getApiConfig } from './client.js';
const headers = (guestKey: string | null) =>
  guestKey ? { [SAJU_GUEST_KEY_HEADER]: guestKey } : undefined;
export const sajuApi = {
  profiles: () => apiFetch<{ items: SajuProfileType[] }>(Routes.Saju.profiles),
  saveProfile: (input: SajuProfileInputType, previous?: SajuProfileType) =>
    apiFetch<SajuProfileType>(previous ? Routes.Saju.profile(previous.id) : Routes.Saju.profiles, {
      method: previous ? 'PUT' : 'POST',
      body: JSON.stringify({ ...input, ...(previous ? { revision: previous.revision } : {}) }),
    }),
  deleteProfile: (id: string) => apiFetch<void>(Routes.Saju.profile(id), { method: 'DELETE' }),
  pairChart: (input: CreateSajuPairInputType, signal?: AbortSignal) =>
    apiFetch<SajuPairChartType>(Routes.Saju.pairChart, {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    }),
  pairReading: (input: CreateSajuPairInputType, guestKey: string | null, signal?: AbortSignal) =>
    apiFetch<SajuPairResultType>(Routes.Saju.pairReading, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: headers(guestKey),
      signal,
    }),
  chart: (input: CreateSajuReadingInputType, signal?: AbortSignal) =>
    apiFetch<SajuChartType>(Routes.Saju.chart, {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    }),
  reading: (input: CreateSajuReadingInputType, guestKey: string | null, signal?: AbortSignal) =>
    apiFetch<SajuReadingResultType>(Routes.Saju.readings, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: headers(guestKey),
      signal,
    }),
  save: (receipt: string) =>
    apiFetch<SajuReadingResultType>(Routes.Saju.myReadings, {
      method: 'POST',
      body: JSON.stringify({ receipt }),
    }),
  listMine: (cursor?: string) =>
    apiFetch<ListSajuReadingsResultType>(
      `${Routes.Saju.myReadings}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  getMine: (id: string) => apiFetch<SajuReadingResultType>(Routes.Saju.myReading(id)),
  deleteMine: (id: string) => apiFetch<void>(Routes.Saju.myReading(id), { method: 'DELETE' }),
  share: (input: CreateSajuShareInputType, guestKey: string | null) =>
    apiFetch<SajuShareResultType>(Routes.Saju.shares, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: headers(guestKey),
    }),
  getShared: (token: string) => apiFetch<PublicSajuShareType>(Routes.Saju.shared(token)),
  revokeShare: (token: string, revokeToken: string) =>
    apiFetch<void>(Routes.Saju.shared(token), {
      method: 'DELETE',
      body: JSON.stringify({ revokeToken }),
    }),
  imageUrl: (token: string) => `${getApiConfig().baseUrl}${Routes.Saju.shareImage(token)}`,
};
