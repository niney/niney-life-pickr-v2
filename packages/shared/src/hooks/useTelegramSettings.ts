import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateTelegramConfigInputType } from '@repo/api-contract';
import { telegramSettingsApi } from '../api/telegram-settings.api.js';

export const useTelegramConfig = () =>
  useQuery({
    queryKey: ['settings', 'telegram'],
    queryFn: telegramSettingsApi.getConfig,
  });

export const useUpdateTelegramConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTelegramConfigInputType) =>
      telegramSettingsApi.update(input),
    onSuccess: (cfg) => {
      qc.setQueryData(['settings', 'telegram'], cfg);
      // 봇 설정이 바뀌면 자동 발굴의 telegramConfigured 표시도 갱신.
      qc.invalidateQueries({ queryKey: ['random-crawl', 'config'] });
    },
  });
};

export const useDeleteTelegramConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => telegramSettingsApi.clear(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'telegram'] });
      qc.invalidateQueries({ queryKey: ['random-crawl', 'config'] });
    },
  });
};

export const useTestTelegram = () =>
  useMutation({ mutationFn: () => telegramSettingsApi.test() });

export const useResolveTelegramChatId = () =>
  useMutation({ mutationFn: () => telegramSettingsApi.resolveChatId() });
