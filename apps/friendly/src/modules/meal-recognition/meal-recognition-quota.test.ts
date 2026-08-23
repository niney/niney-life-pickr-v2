import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { AdapterCache } from '../ai/adapter-cache.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import type { LLMCompleteOptions, LLMProvider } from '../ai/adapters/llm-provider.js';
import { MealPhotoError, type MealPhotoService } from '../meal/meal-photo.service.js';
import { MealRecognitionService } from './meal-recognition.service.js';

const resolvedConfig = {
  id: 'vision-config',
  provider: 'ollama-cloud',
  purpose: 'meal-photo',
  baseUrl: 'https://ollama.test',
  apiKey: 'test-key',
  timeoutMs: 5_000,
  maxConcurrent: 1,
  defaultModel: 'vision-test',
  enabled: true,
};

describe('MealRecognitionService quota 호출 경계 (순수 stub)', () => {
  const build = (opts: {
    providerConfigured?: boolean;
    readPhotos?: () => Promise<Buffer[]>;
    consumeQuota?: (userId: string) => boolean;
    onProviderCall?: () => void;
  }) => {
    const complete = vi.fn(async (_input: LLMCompleteOptions) => {
      opts.onProviderCall?.();
      return { text: '{"dishes":[]}', model: 'vision-test' };
    });
    const provider = { complete } as unknown as LLMProvider;
    const cache = { get: () => provider } as unknown as AdapterCache;
    const readManyForOwner = vi.fn(opts.readPhotos ?? (async () => [Buffer.from('image')]));
    const photos = { readManyForOwner } as unknown as MealPhotoService;
    const aiConfig = {
      getResolved: vi.fn(async () => (opts.providerConfigured === false ? null : resolvedConfig)),
    } as unknown as AiConfigService;
    const service = new MealRecognitionService({} as PrismaClient, aiConfig, {
      photos,
      cache,
      consumeQuota: opts.consumeQuota,
    });
    return { service, complete, readManyForOwner };
  };

  it('모델 미설정·사진 소유권 실패는 쿼터를 소비하지 않는다', async () => {
    const noProviderQuota = vi.fn(() => true);
    const noProvider = build({ providerConfigured: false, consumeQuota: noProviderQuota });
    await expect(
      noProvider.service.recognize({ userId: 'quota-user', photoTokens: ['photo-a'] }),
    ).rejects.toMatchObject({ code: 'no_provider' });
    expect(noProviderQuota).not.toHaveBeenCalled();
    expect(noProvider.readManyForOwner).not.toHaveBeenCalled();

    const forbiddenQuota = vi.fn(() => true);
    const forbidden = build({
      consumeQuota: forbiddenQuota,
      readPhotos: async () => {
        throw new MealPhotoError('forbidden', '권한이 없습니다.');
      },
    });
    await expect(
      forbidden.service.recognize({ userId: 'quota-user', photoTokens: ['photo-b'] }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(forbiddenQuota).not.toHaveBeenCalled();
    expect(forbidden.complete).not.toHaveBeenCalled();
  });

  it('검증 후 쿼터를 소비하고 성공한 요청만 바로 모델을 호출한다', async () => {
    const order: string[] = [];
    const consumeQuota = vi.fn(() => {
      order.push('quota');
      return true;
    });
    const valid = build({
      readPhotos: async () => {
        order.push('photo');
        return [Buffer.from('image')];
      },
      consumeQuota,
      onProviderCall: () => order.push('provider'),
    });
    await valid.service.recognize({ userId: 'quota-user', photoTokens: ['photo-c'] });
    expect(order).toEqual(['photo', 'quota', 'provider']);
    expect(consumeQuota).toHaveBeenCalledWith('quota-user');
    expect(valid.complete).toHaveBeenCalledTimes(1);

    const exhaustedQuota = vi.fn(() => false);
    const exhausted = build({ consumeQuota: exhaustedQuota });
    await expect(
      exhausted.service.recognize({ userId: 'quota-user', photoTokens: ['photo-d'] }),
    ).rejects.toMatchObject({ code: 'quota' });
    expect(exhaustedQuota).toHaveBeenCalledTimes(1);
    expect(exhausted.complete).not.toHaveBeenCalled();
  });
});
