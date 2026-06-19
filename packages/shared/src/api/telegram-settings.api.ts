import {
  Routes,
  type TelegramChatIdResultType,
  type TelegramConfigType,
  type TelegramTestResultType,
  type UpdateTelegramConfigInputType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

export const telegramSettingsApi = {
  getConfig: () => apiFetch<TelegramConfigType>(Routes.SettingsTelegram.config),

  update: (input: UpdateTelegramConfigInputType) =>
    apiFetch<TelegramConfigType>(Routes.SettingsTelegram.config, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  // DB 설정 삭제 → .env fallback 으로 복귀.
  clear: () =>
    apiFetch<void>(Routes.SettingsTelegram.config, { method: 'DELETE' }),

  // 현재 저장된 설정으로 getMe → getChat → 테스트 메시지 전송.
  test: () =>
    apiFetch<TelegramTestResultType>(Routes.SettingsTelegram.test, {
      method: 'POST',
    }),

  // chat_id 자동 탐색 — 서버가 ~25초 롱폴하므로 응답이 늦을 수 있다.
  resolveChatId: () =>
    apiFetch<TelegramChatIdResultType>(Routes.SettingsTelegram.resolveChatId, {
      method: 'POST',
    }),
};
