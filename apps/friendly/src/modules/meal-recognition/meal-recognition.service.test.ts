import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { buildApp } from '../../app.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { AiConfigService, type LlmProviderEnv } from '../ai/ai.config.service.js';
import type { AdapterCache } from '../ai/adapter-cache.js';
import type { LLMCompleteOptions, LLMCompleteResult, LLMProvider } from '../ai/adapters/llm-provider.js';
import { upsertFoodSeeds } from '../food/food-import.service.js';
import { MealPhotoService } from '../meal/meal-photo.service.js';
import { MEAL_RECOGNITION_VERSION } from './meal-recognition.prompts.js';
import {
  MealRecognitionError,
  MealRecognitionService,
  buildWarning,
  parseRecognitionOutput,
} from './meal-recognition.service.js';

// 비전 호출은 FakeProvider 로 대체 — 프롬프트 조립·파싱·수리 재시도·카탈로그 매칭·경고를 검증한다.

class FakeProvider implements LLMProvider {
  calls: LLMCompleteOptions[] = [];
  responses: string[] = [];
  throwOnce = false;

  async complete(opts: LLMCompleteOptions): Promise<LLMCompleteResult> {
    this.calls.push(opts);
    if (this.throwOnce) {
      this.throwOnce = false;
      throw new Error('upstream boom');
    }
    const text = this.responses.shift() ?? '{"dishes":[]}';
    return { text, model: opts.model, promptTokens: 10, completionTokens: 20 };
  }
}

const envBlock = (visionModel: string): LlmProviderEnv => ({
  apiKey: 'test-key',
  baseUrl: 'https://ollama.test',
  timeoutMs: 5000,
  maxConcurrent: 2,
  defaultModels: {
    chat: 'text-model',
    image: 'vision-model',
    'log-analysis': 'text-model',
    'meal-photo': visionModel,
    'meal-recommend': 'text-model',
  },
});

describe('parseRecognitionOutput / buildWarning', () => {
  it('코드펜스·앞뒤 설명이 섞여도 첫 JSON 객체를 뽑는다', () => {
    const parsed = parseRecognitionOutput('여기 결과입니다:\n```json\n{"dishes":[{"name":"김치찌개","confidence":0.8,"isMain":true,"photoIndex":0}]}\n```');
    expect(parsed?.dishes[0]?.name).toBe('김치찌개');
  });
  it('필수 필드가 없으면 null', () => {
    expect(parseRecognitionOutput('{"dishes":[{"name":"x"}]}')).toBeNull();
    expect(parseRecognitionOutput('완전히 다른 텍스트')).toBeNull();
  });
  it('경고 — 빈 결과와 저신뢰', () => {
    expect(buildWarning([], null)).toContain('찾지 못했');
    expect(buildWarning([], '접시만 보입니다')).toBe('접시만 보입니다');
    const dish = {
      name: 'x',
      candidates: [],
      confidence: 0.2,
      isMain: true,
      portion: null,
      isDrink: false,
      photoIndex: 0,
      foodId: null,
      matchedName: null,
      dishType: null,
      mainIngredient: null,
      cuisine: null,
    };
    expect(buildWarning([dish], null)).toContain('확신이 낮');
    expect(buildWarning([{ ...dish, confidence: 0.9 }], null)).toBeNull();
  });
});

describe('MealRecognitionService (격리 DB + FakeProvider)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;
  let photos: MealPhotoService;
  let provider: FakeProvider;
  let cache: AdapterCache;
  let token = '';

  const buildService = (visionModel = 'gemma4:31b'): MealRecognitionService =>
    new MealRecognitionService(app.prisma, new AiConfigService(app.prisma, envBlock(visionModel)), {
      photos,
      cache,
      placeHint: async () => ({ name: '숯토리 신촌점', menuNames: ['삼겹살', '김치찌개'] }),
    });

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    // 리포의 data/ 를 더럽히지 않게 임시 디렉터리에 저장한다.
    photos = new MealPhotoService(app.prisma, { storageDir: join(tmpdir(), 'lifepickr-test-meal-photos') });
    provider = new FakeProvider();
    cache = { get: () => provider } as unknown as AdapterCache;
    await upsertFoodSeeds(app.prisma, [
      { name: '김치찌개', dishType: 'stew', mainIngredient: 'pork', cuisine: 'korean', source: 'manual' },
    ]);
    const jpeg = await sharp({ create: { width: 30, height: 30, channels: 3, background: { r: 10, g: 200, b: 30 } } })
      .jpeg()
      .toBuffer();
    const stored = await photos.store('rec-user', jpeg);
    token = stored.token;
  });
  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('모델 미설정이면 no_provider', async () => {
    const svc = buildService('');
    await expect(svc.recognize({ userId: 'rec-user', photoTokens: [token] })).rejects.toMatchObject({ code: 'no_provider' });
  });

  it('정상 인식 — 이미지·프롬프트 힌트 전달, 카탈로그 매칭 부착', async () => {
    provider.calls = [];
    provider.responses = [
      JSON.stringify({
        dishes: [
          { name: '김치 찌개', candidates: [{ name: '김치 찌개', confidence: 0.7 }, { name: '부대찌개', confidence: 0.2 }], confidence: 0.7, isMain: true, portion: 'large', isDrink: false, photoIndex: 0 },
          { name: '콜라', candidates: [], confidence: 0.9, isMain: false, portion: 'normal', isDrink: true, photoIndex: 5 },
        ],
        notes: null,
      }),
    ];
    const res = await buildService().recognize({ userId: 'rec-user', photoTokens: [token], placeId: '123', slot: 'dinner' });

    expect(provider.calls).toHaveLength(1);
    const call = provider.calls[0]!;
    expect(call.images).toHaveLength(1);
    expect(call.model).toBe('gemma4:31b');
    expect(call.prompt).toContain('숯토리 신촌점');
    expect(call.prompt).toContain('김치찌개');
    expect(call.prompt).toContain('저녁');
    expect(call.systemPrompt).toContain('한국어 정식 명칭');

    expect(res.model).toBe('gemma4:31b');
    expect(res.promptVersion).toBe(MEAL_RECOGNITION_VERSION);
    expect(res.dishes[0]).toMatchObject({
      name: '김치 찌개',
      matchedName: '김치찌개',
      dishType: 'stew',
      mainIngredient: 'pork',
      portion: 'large',
      isMain: true,
    });
    expect(res.dishes[0]?.foodId).not.toBeNull();
    // photoIndex 는 사진 수 안으로 클램프.
    expect(res.dishes[1]).toMatchObject({ name: '콜라', isDrink: true, photoIndex: 0, foodId: null });
  });

  it('저신뢰면 경고, 빈 결과면 안내', async () => {
    provider.responses = [JSON.stringify({ dishes: [{ name: '무언가', confidence: 0.2, isMain: true, photoIndex: 0 }] })];
    expect((await buildService().recognize({ userId: 'rec-user', photoTokens: [token] })).warning).toContain('확신이 낮');

    provider.responses = [JSON.stringify({ dishes: [], notes: '음식이 보이지 않습니다.' })];
    const empty = await buildService().recognize({ userId: 'rec-user', photoTokens: [token] });
    expect(empty.dishes).toHaveLength(0);
    expect(empty.warning).toBe('음식이 보이지 않습니다.');
  });

  it('JSON 이 깨지면 1회 수리 재시도 — 성공하면 결과, 실패하면 parse_failed', async () => {
    provider.calls = [];
    provider.responses = [
      '음식은 김치찌개로 보입니다.',
      JSON.stringify({ dishes: [{ name: '김치찌개', confidence: 0.8, isMain: true, photoIndex: 0 }] }),
    ];
    const res = await buildService().recognize({ userId: 'rec-user', photoTokens: [token] });
    expect(provider.calls).toHaveLength(2);
    // 수리 호출은 이미지 없이 텍스트만 보낸다.
    expect(provider.calls[1]?.images).toBeUndefined();
    expect(provider.calls[1]?.format).toBe('json');
    expect(res.dishes[0]?.name).toBe('김치찌개');

    provider.responses = ['그냥 텍스트', '여전히 텍스트'];
    await expect(buildService().recognize({ userId: 'rec-user', photoTokens: [token] })).rejects.toMatchObject({
      code: 'parse_failed',
    });
  });

  it('업스트림 실패는 llm_failed, 남의 사진은 forbidden', async () => {
    provider.throwOnce = true;
    await expect(buildService().recognize({ userId: 'rec-user', photoTokens: [token] })).rejects.toBeInstanceOf(
      MealRecognitionError,
    );

    await expect(buildService().recognize({ userId: 'someone-else', photoTokens: [token] })).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('작업 로그를 남긴다(성공 1건 = OperationRun 1건)', async () => {
    const logged = { startRun: vi.fn().mockResolvedValue('run-1'), log: vi.fn(), finishRun: vi.fn().mockResolvedValue(undefined) };
    const svc = new MealRecognitionService(app.prisma, new AiConfigService(app.prisma, envBlock('gemma4:31b')), {
      photos,
      cache,
      operationLog: logged as never,
    });
    provider.responses = [JSON.stringify({ dishes: [{ name: '김치찌개', confidence: 0.9, isMain: true, photoIndex: 0 }] })];
    await svc.recognize({ userId: 'rec-user', photoTokens: [token] });
    expect(logged.startRun).toHaveBeenCalledWith(expect.objectContaining({ feature: 'meal-recognition', trigger: 'user' }));
    expect(logged.finishRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ status: 'done' }));
    // 로그 meta 에 사용자 식별자·음식명이 실리지 않는다.
    const metas = JSON.stringify(logged.startRun.mock.calls) + JSON.stringify(logged.finishRun.mock.calls);
    expect(metas).not.toContain('rec-user');
    expect(metas).not.toContain('김치찌개');
  });
});
