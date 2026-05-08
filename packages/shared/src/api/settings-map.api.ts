import {
  Routes,
  type MapProviderConfigType,
  type MapProviderIdType,
  type MapProviderListResultType,
  type MapProviderPublicConfigType,
  type MapProviderSecretType,
  type UpdateMapProviderInputType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

export const settingsMapApi = {
  list: () => apiFetch<MapProviderListResultType>(Routes.SettingsMap.list),

  update: (id: MapProviderIdType, input: UpdateMapProviderInputType) =>
    apiFetch<MapProviderConfigType>(Routes.SettingsMap.provider(id), {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  remove: (id: MapProviderIdType) =>
    apiFetch<void>(Routes.SettingsMap.provider(id), { method: 'DELETE' }),

  // 평문 키 — vworld JS SDK init URL 에 그대로 박아 호출. admin 가드 통과한
  // 경우만 호출 가능. 일반 사용자에는 노출되지 않는다.
  getSecret: (id: MapProviderIdType) =>
    apiFetch<MapProviderSecretType>(Routes.SettingsMap.secret(id)),

  // 공개 맛집 지도 페이지가 호출. 키 미등록 시 404 — 호출자가 ApiError.statusCode
  // 로 분기해서 placeholder 표출.
  publicConfig: () =>
    apiFetch<MapProviderPublicConfigType>(Routes.SettingsMap.publicConfig),
};
