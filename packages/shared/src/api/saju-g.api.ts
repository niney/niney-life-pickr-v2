import {
  Routes,
  type SajuGProfileType,
  type SajuGProfileInputType,
  type CreateSajuGPairInputType,
  type SajuGPairChartType,
  type SajuGPairResultType,
  SAJU_G_GUEST_KEY_HEADER,
  type CreateSajuGReadingInputType,
  type CreateSajuGShareInputType,
  type ListSajuGReadingsResultType,
  type PublicSajuGShareType,
  type SajuGChartType,
  type SajuGReadingResultType,
  type SajuGShareResultType,
} from '@repo/api-contract';
import { apiFetch, getApiConfig } from './client.js';
const headers = (guestKey: string | null) =>
  guestKey ? { [SAJU_G_GUEST_KEY_HEADER]: guestKey } : undefined;
export const sajuGApi = {
  profiles: () => apiFetch<{ items: SajuGProfileType[] }>(Routes.SajuG.profiles),
  saveProfile: (input: SajuGProfileInputType, previous?: SajuGProfileType) =>
    apiFetch<SajuGProfileType>(
      previous ? Routes.SajuG.profile(previous.id) : Routes.SajuG.profiles,
      {
        method: previous ? 'PUT' : 'POST',
        body: JSON.stringify({ ...input, ...(previous ? { revision: previous.revision } : {}) }),
      },
    ),
  deleteProfile: (id: string) => apiFetch<void>(Routes.SajuG.profile(id), { method: 'DELETE' }),
  pairChart: (input: CreateSajuGPairInputType, signal?: AbortSignal) =>
    apiFetch<SajuGPairChartType>(Routes.SajuG.pairChart, {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    }),
  pairReading: (input: CreateSajuGPairInputType, guestKey: string | null, signal?: AbortSignal) =>
    apiFetch<SajuGPairResultType>(Routes.SajuG.pairReading, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: headers(guestKey),
      signal,
    }),
  chart: (input: CreateSajuGReadingInputType, signal?: AbortSignal) =>
    apiFetch<SajuGChartType>(Routes.SajuG.chart, {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    }),
  reading: (input: CreateSajuGReadingInputType, guestKey: string | null, signal?: AbortSignal) =>
    apiFetch<SajuGReadingResultType>(Routes.SajuG.readings, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: headers(guestKey),
      signal,
    }),
  save: (receipt: string) =>
    apiFetch<SajuGReadingResultType>(Routes.SajuG.myReadings, {
      method: 'POST',
      body: JSON.stringify({ receipt }),
    }),
  listMine: (cursor?: string) =>
    apiFetch<ListSajuGReadingsResultType>(
      `${Routes.SajuG.myReadings}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  getMine: (id: string) => apiFetch<SajuGReadingResultType>(Routes.SajuG.myReading(id)),
  deleteMine: (id: string) => apiFetch<void>(Routes.SajuG.myReading(id), { method: 'DELETE' }),
  share: (input: CreateSajuGShareInputType, guestKey: string | null) =>
    apiFetch<SajuGShareResultType>(Routes.SajuG.shares, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: headers(guestKey),
    }),
  getShared: (token: string) => apiFetch<PublicSajuGShareType>(Routes.SajuG.shared(token)),
  revokeShare: (token: string, revokeToken: string) =>
    apiFetch<void>(Routes.SajuG.shared(token), {
      method: 'DELETE',
      body: JSON.stringify({ revokeToken }),
    }),
  imageUrl: (token: string) => `${getApiConfig().baseUrl}${Routes.SajuG.shareImage(token)}`,
};
