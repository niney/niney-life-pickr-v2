import type {
  MapProviderConfigType,
  MapProviderIdType,
  MapProviderListResultType,
  MapProviderSecretType,
  UpdateMapProviderInputType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

const PREFIX = '/api/v1/admin/settings/map';

export const settingsMapApi = {
  list: () => apiFetch<MapProviderListResultType>(PREFIX),

  update: (id: MapProviderIdType, input: UpdateMapProviderInputType) =>
    apiFetch<MapProviderConfigType>(`${PREFIX}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  remove: (id: MapProviderIdType) =>
    apiFetch<void>(`${PREFIX}/${id}`, { method: 'DELETE' }),

  // 평문 키 — vworld JS SDK init URL 에 그대로 박아 호출. admin 가드 통과한
  // 경우만 호출 가능. 일반 사용자에는 노출되지 않는다.
  getSecret: (id: MapProviderIdType) =>
    apiFetch<MapProviderSecretType>(`${PREFIX}/${id}/secret`),
};
