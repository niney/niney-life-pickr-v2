import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiConfigService, maskApiKey, type LlmProviderEnv } from './ai.config.service.js';

const ENV: LlmProviderEnv = {
  apiKey: 'env-key-zzzz',
  baseUrl: 'https://env.example',
  timeoutMs: 60_000,
  maxConcurrent: 15,
  // 용도별 .env 기본 모델 — chat 만 채워 기존 검증을 보존(image·log-analysis 는
  // 빈 값이라 row 없으면 모델 ''). env fallback 동작은 아래 별도 describe 에서 검증.
  defaultModels: { chat: 'env-default-model', image: '', 'log-analysis': '' },
};

interface Row {
  id: string;
  provider: string;
  purpose: string;
  apiKey: string;
  baseUrl: string | null;
  defaultModel: string | null;
  enabled: boolean;
  maxConcurrent: number;
  updatedAt: Date;
  updatedById: string | null;
}

const buildPrismaStub = (initial: Row[] = []) => {
  let rows = [...initial];
  return {
    rows: () => rows,
    llmProviderConfig: {
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { provider_purpose: { provider: string; purpose: string } };
        }) => {
          const { provider, purpose } = where.provider_purpose;
          return rows.find((r) => r.provider === provider && r.purpose === purpose) ?? null;
        },
      ),
      findMany: vi.fn(async () => rows),
      deleteMany: vi.fn(
        async ({ where }: { where: { provider: string; purpose: string } }) => {
          const before = rows.length;
          rows = rows.filter(
            (r) => !(r.provider === where.provider && r.purpose === where.purpose),
          );
          return { count: before - rows.length };
        },
      ),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { provider_purpose: { provider: string; purpose: string } };
          create: Partial<Row> & { provider: string; purpose: string; apiKey: string };
          update: Partial<Row>;
        }) => {
          const { provider, purpose } = where.provider_purpose;
          const existing = rows.find((r) => r.provider === provider && r.purpose === purpose);
          if (existing) {
            Object.assign(existing, update, { updatedAt: new Date() });
            return existing;
          }
          const fresh: Row = {
            id: `id-${rows.length + 1}`,
            provider: create.provider,
            purpose: create.purpose,
            apiKey: create.apiKey,
            baseUrl: create.baseUrl ?? null,
            defaultModel: create.defaultModel ?? null,
            enabled: create.enabled ?? true,
            maxConcurrent: create.maxConcurrent ?? 15,
            updatedAt: new Date(),
            updatedById: create.updatedById ?? null,
          };
          rows.push(fresh);
          return fresh;
        },
      ),
    },
  };
};

describe('maskApiKey', () => {
  it('returns null for empty', () => {
    expect(maskApiKey('')).toBeNull();
  });

  it('shows last 4 chars and a sk- prefix marker', () => {
    expect(maskApiKey('sk-ollama-abcdef1234')).toBe('sk-***...1234');
  });

  it('shows full mask for short keys', () => {
    expect(maskApiKey('abc')).toBe('***');
  });
});

describe('AiConfigService', () => {
  let prisma: ReturnType<typeof buildPrismaStub>;
  let service: AiConfigService;

  beforeEach(() => {
    prisma = buildPrismaStub();
    service = new AiConfigService(prisma as never, ENV);
  });

  describe('list', () => {
    it('synthesizes all three purposes when DB empty — chat env-backed, others inherit', async () => {
      const out = await service.list();
      expect(out.map((p) => p.purpose).sort()).toEqual(['chat', 'image', 'log-analysis']);
      const chat = out.find((p) => p.purpose === 'chat')!;
      expect(chat).toMatchObject({
        provider: 'ollama-cloud',
        purpose: 'chat',
        hasApiKey: true,
        keySource: 'env',
        baseUrl: ENV.baseUrl,
        // DB row 가 없어도 .env 기본 모델이 유효 모델로 노출된다(출처 env).
        defaultModel: ENV.defaultModels.chat,
        defaultModelSource: 'env',
        enabled: true,
        maxConcurrent: ENV.maxConcurrent,
      });
      expect(chat.apiKeyMasked).toBe(maskApiKey(ENV.apiKey));
      // image·log-analysis 는 계정(env) 키를 상속해 활성으로 보인다.
      for (const purpose of ['image', 'log-analysis'] as const) {
        const v = out.find((p) => p.purpose === purpose)!;
        expect(v).toMatchObject({ hasApiKey: true, keySource: 'inherited' });
      }
    });

    it('reports all purposes keyless when env apiKey is empty AND no DB row', async () => {
      service = new AiConfigService(prisma as never, { ...ENV, apiKey: '' });
      const out = await service.list();
      expect(out.every((p) => p.hasApiKey === false)).toBe(true);
      expect(out.every((p) => p.keySource === 'none')).toBe(true);
      expect(out.find((p) => p.purpose === 'chat')!.apiKeyMasked).toBeNull();
    });

    it('returns DB row with masked key when present', async () => {
      prisma = buildPrismaStub([
        {
          id: 'r1',
          provider: 'ollama-cloud',
          purpose: 'chat',
          apiKey: 'db-key-7777',
          baseUrl: 'https://db.example',
          defaultModel: 'db-model',
          enabled: true,
          maxConcurrent: 7,
          updatedAt: new Date('2026-01-01'),
          updatedById: null,
        },
      ]);
      service = new AiConfigService(prisma as never, ENV);
      const out = await service.list();
      expect(out[0]).toMatchObject({
        provider: 'ollama-cloud',
        purpose: 'chat',
        hasApiKey: true,
        apiKeyMasked: maskApiKey('db-key-7777'),
        baseUrl: 'https://db.example',
        defaultModel: 'db-model',
        enabled: true,
        maxConcurrent: 7,
      });
    });

    it('lists both chat and image rows when both exist', async () => {
      prisma = buildPrismaStub([
        {
          id: 'r1',
          provider: 'ollama-cloud',
          purpose: 'chat',
          apiKey: 'chat-key',
          baseUrl: null,
          defaultModel: 'chat-model',
          enabled: true,
          maxConcurrent: 10,
          updatedAt: new Date(),
          updatedById: null,
        },
        {
          id: 'r2',
          provider: 'ollama-cloud',
          purpose: 'image',
          apiKey: 'image-key',
          baseUrl: null,
          defaultModel: 'llama3.2-vision',
          enabled: true,
          maxConcurrent: 5,
          updatedAt: new Date(),
          updatedById: null,
        },
      ]);
      service = new AiConfigService(prisma as never, ENV);
      const out = await service.list();
      // log-analysis 가상 row 까지 항상 세 장.
      expect(out).toHaveLength(3);
      expect(out.map((p) => p.purpose).sort()).toEqual(['chat', 'image', 'log-analysis']);
    });

    it('synthesizes virtual chat row alongside an existing image row', async () => {
      prisma = buildPrismaStub([
        {
          id: 'r1',
          provider: 'ollama-cloud',
          purpose: 'image',
          apiKey: 'image-key',
          baseUrl: null,
          defaultModel: 'llama3.2-vision',
          enabled: true,
          maxConcurrent: 5,
          updatedAt: new Date(),
          updatedById: null,
        },
      ]);
      service = new AiConfigService(prisma as never, ENV);
      const out = await service.list();
      expect(out).toHaveLength(3);
      const chat = out.find((p) => p.purpose === 'chat')!;
      const image = out.find((p) => p.purpose === 'image')!;
      expect(chat.updatedAt).toBeNull();
      expect(chat.hasApiKey).toBe(true);
      expect(image.defaultModel).toBe('llama3.2-vision');
    });
  });

  describe('getResolved', () => {
    it('uses DB row when present, with env fallback for missing fields (chat)', async () => {
      prisma = buildPrismaStub([
        {
          id: 'r1',
          provider: 'ollama-cloud',
          purpose: 'chat',
          apiKey: 'db-key',
          baseUrl: null,
          defaultModel: null,
          enabled: true,
          maxConcurrent: 9,
          updatedAt: new Date(),
          updatedById: null,
        },
      ]);
      service = new AiConfigService(prisma as never, ENV);
      const r = await service.getResolved('ollama-cloud', 'chat');
      expect(r).toMatchObject({
        provider: 'ollama-cloud',
        purpose: 'chat',
        apiKey: 'db-key',
        baseUrl: ENV.baseUrl,
        maxConcurrent: 9,
        timeoutMs: ENV.timeoutMs,
        defaultModel: ENV.defaultModels.chat,
        enabled: true,
      });
    });

    it('chat purpose falls back entirely to env when no DB row', async () => {
      const r = await service.getResolved('ollama-cloud', 'chat');
      expect(r).toMatchObject({
        apiKey: ENV.apiKey,
        baseUrl: ENV.baseUrl,
        maxConcurrent: ENV.maxConcurrent,
      });
    });

    it('image purpose inherits account (env) key when no DB row, with empty model', async () => {
      const r = await service.getResolved('ollama-cloud', 'image');
      expect(r).toMatchObject({
        provider: 'ollama-cloud',
        purpose: 'image',
        apiKey: ENV.apiKey, // 계정(env) 키 상속
        baseUrl: ENV.baseUrl,
        defaultModel: '', // 모델은 상속하지 않음 — 소비자가 빈 모델이면 스킵
      });
    });

    it('image purpose returns null when no DB row AND no account key', async () => {
      service = new AiConfigService(prisma as never, { ...ENV, apiKey: '' });
      const r = await service.getResolved('ollama-cloud', 'image');
      expect(r).toBeNull();
    });

    it('image purpose inherits chat row key/baseUrl when image row has no own key', async () => {
      prisma = buildPrismaStub([
        {
          id: 'r-chat',
          provider: 'ollama-cloud',
          purpose: 'chat',
          apiKey: 'chat-acct-key',
          baseUrl: 'https://acct.example',
          defaultModel: 'gpt-oss:20b',
          enabled: true,
          maxConcurrent: 10,
          updatedAt: new Date(),
          updatedById: null,
        },
        {
          id: 'r-img',
          provider: 'ollama-cloud',
          purpose: 'image',
          apiKey: '', // 자기 키 없음 — 계정 키 상속해야 함
          baseUrl: null,
          defaultModel: 'llama3.2-vision',
          enabled: true,
          maxConcurrent: 5,
          updatedAt: new Date(),
          updatedById: null,
        },
      ]);
      service = new AiConfigService(prisma as never, ENV);
      const r = await service.getResolved('ollama-cloud', 'image');
      expect(r).toMatchObject({
        purpose: 'image',
        apiKey: 'chat-acct-key', // chat 계정 키 상속 (env 아님)
        baseUrl: 'https://acct.example', // baseUrl 도 계정에서 상속
        defaultModel: 'llama3.2-vision', // 모델은 자기 row 값
        maxConcurrent: 5,
      });
    });

    it('image purpose resolves when DB row exists', async () => {
      prisma = buildPrismaStub([
        {
          id: 'r1',
          provider: 'ollama-cloud',
          purpose: 'image',
          apiKey: 'image-key',
          baseUrl: 'https://vision.example',
          defaultModel: 'llama3.2-vision',
          enabled: true,
          maxConcurrent: 4,
          updatedAt: new Date(),
          updatedById: null,
        },
      ]);
      service = new AiConfigService(prisma as never, ENV);
      const r = await service.getResolved('ollama-cloud', 'image');
      expect(r).toMatchObject({
        provider: 'ollama-cloud',
        purpose: 'image',
        apiKey: 'image-key',
        baseUrl: 'https://vision.example',
        defaultModel: 'llama3.2-vision',
        maxConcurrent: 4,
      });
    });

    it('log-analysis purpose inherits account (env) key when no DB row, with empty model', async () => {
      const r = await service.getResolved('ollama-cloud', 'log-analysis');
      expect(r).toMatchObject({
        purpose: 'log-analysis',
        apiKey: ENV.apiKey, // 계정(env) 키 상속
        defaultModel: '', // 모델 미상속 — log-analysis.service 가 빈 모델이면 스킵
      });
    });

    it('log-analysis purpose resolves when DB row exists', async () => {
      prisma = buildPrismaStub([
        {
          id: 'r1',
          provider: 'ollama-cloud',
          purpose: 'log-analysis',
          apiKey: 'logs-key',
          baseUrl: null,
          defaultModel: 'gpt-oss:20b',
          enabled: true,
          maxConcurrent: 2,
          updatedAt: new Date(),
          updatedById: null,
        },
      ]);
      service = new AiConfigService(prisma as never, ENV);
      const r = await service.getResolved('ollama-cloud', 'log-analysis');
      expect(r).toMatchObject({
        provider: 'ollama-cloud',
        purpose: 'log-analysis',
        apiKey: 'logs-key',
        // row 값이 .env 기본 모델보다 우선 — 여기선 row 값 그대로.
        defaultModel: 'gpt-oss:20b',
        maxConcurrent: 2,
      });
    });

    it('image·log-analysis 도 .env 용도별 기본 모델로 보충된다 (DB row 없을 때)', async () => {
      service = new AiConfigService(prisma as never, {
        ...ENV,
        defaultModels: { chat: 'c-model', image: 'env-vision', 'log-analysis': 'env-logger' },
      });
      const img = await service.getResolved('ollama-cloud', 'image');
      const log = await service.getResolved('ollama-cloud', 'log-analysis');
      expect(img?.defaultModel).toBe('env-vision');
      expect(log?.defaultModel).toBe('env-logger');
      // list/toView 도 유효 모델·출처(env)를 노출.
      const out = await service.list();
      expect(out.find((p) => p.purpose === 'image')).toMatchObject({
        defaultModel: 'env-vision',
        defaultModelSource: 'env',
      });
      expect(out.find((p) => p.purpose === 'log-analysis')).toMatchObject({
        defaultModel: 'env-logger',
        defaultModelSource: 'env',
      });
    });

    it('DB row 의 defaultModel 이 .env 기본 모델을 덮어쓴다 (image)', async () => {
      prisma = buildPrismaStub([
        {
          id: 'r1',
          provider: 'ollama-cloud',
          purpose: 'image',
          apiKey: 'image-key',
          baseUrl: null,
          defaultModel: 'own-vision',
          enabled: true,
          maxConcurrent: 5,
          updatedAt: new Date(),
          updatedById: null,
        },
      ]);
      service = new AiConfigService(prisma as never, {
        ...ENV,
        defaultModels: { chat: '', image: 'env-vision', 'log-analysis': '' },
      });
      const img = await service.getResolved('ollama-cloud', 'image');
      expect(img?.defaultModel).toBe('own-vision');
      const view = (await service.list()).find((p) => p.purpose === 'image');
      expect(view).toMatchObject({ defaultModel: 'own-vision', defaultModelSource: 'own' });
    });

    it('returns null when no key in DB AND env apiKey is empty (chat)', async () => {
      service = new AiConfigService(prisma as never, { ...ENV, apiKey: '' });
      const r = await service.getResolved('ollama-cloud', 'chat');
      expect(r).toBeNull();
    });

    it('returns null when DB row exists but enabled=false', async () => {
      prisma = buildPrismaStub([
        {
          id: 'r1',
          provider: 'ollama-cloud',
          purpose: 'chat',
          apiKey: 'db-key',
          baseUrl: null,
          defaultModel: null,
          enabled: false,
          maxConcurrent: 5,
          updatedAt: new Date(),
          updatedById: null,
        },
      ]);
      service = new AiConfigService(prisma as never, ENV);
      const r = await service.getResolved('ollama-cloud', 'chat');
      expect(r).toBeNull();
    });
  });

  describe('update', () => {
    it('creates a new chat row with defaults when none exists', async () => {
      const out = await service.update('ollama-cloud', 'chat', { apiKey: 'new-key' }, 'admin-1');
      expect(out.hasApiKey).toBe(true);
      expect(out.purpose).toBe('chat');
      expect(out.apiKeyMasked).toBe(maskApiKey('new-key'));
      expect(prisma.rows()).toHaveLength(1);
      expect(prisma.rows()[0]!.apiKey).toBe('new-key');
      expect(prisma.rows()[0]!.updatedById).toBe('admin-1');
    });

    it('creates a new image row (DB-only, no env fallback for key)', async () => {
      const out = await service.update(
        'ollama-cloud',
        'image',
        { apiKey: 'vision-key' },
        'admin-1',
      );
      expect(out.purpose).toBe('image');
      expect(out.hasApiKey).toBe(true);
      expect(prisma.rows()[0]!.purpose).toBe('image');
    });

    it('creating image row without own key inherits account key (row stays keyless)', async () => {
      const out = await service.update('ollama-cloud', 'image', { enabled: true }, 'admin-1');
      // 자기 row 에는 키가 저장되지 않지만, 계정(env) 키를 상속해 활성으로 보인다.
      expect(prisma.rows()[0]!.apiKey).toBe('');
      expect(out.hasApiKey).toBe(true);
      expect(out.keySource).toBe('inherited');
    });

    it('preserves existing apiKey when input.apiKey is undefined', async () => {
      await service.update('ollama-cloud', 'chat', { apiKey: 'first' }, 'a');
      await service.update(
        'ollama-cloud',
        'chat',
        { baseUrl: 'https://changed.example' },
        'a',
      );
      expect(prisma.rows()[0]!.apiKey).toBe('first');
      expect(prisma.rows()[0]!.baseUrl).toBe('https://changed.example');
    });

    it('updates apiKey when a new value is provided', async () => {
      await service.update('ollama-cloud', 'chat', { apiKey: 'first' }, 'a');
      await service.update('ollama-cloud', 'chat', { apiKey: 'second' }, 'a');
      expect(prisma.rows()[0]!.apiKey).toBe('second');
    });

    it('updates maxConcurrent when provided', async () => {
      await service.update('ollama-cloud', 'chat', { apiKey: 'k' }, 'a');
      await service.update('ollama-cloud', 'chat', { maxConcurrent: 25 }, 'a');
      expect(prisma.rows()[0]!.maxConcurrent).toBe(25);
    });

    it('clears defaultModel when explicitly set to null', async () => {
      await service.update('ollama-cloud', 'chat', { apiKey: 'k', defaultModel: 'm' }, 'a');
      await service.update('ollama-cloud', 'chat', { defaultModel: null }, 'a');
      expect(prisma.rows()[0]!.defaultModel).toBeNull();
    });
  });

  describe('remove', () => {
    it('drops the row when present', async () => {
      await service.update('ollama-cloud', 'chat', { apiKey: 'k' }, 'a');
      expect(prisma.rows()).toHaveLength(1);
      await service.remove('ollama-cloud', 'chat');
      expect(prisma.rows()).toHaveLength(0);
    });

    it('only removes the matching purpose', async () => {
      await service.update('ollama-cloud', 'chat', { apiKey: 'k' }, 'a');
      await service.update('ollama-cloud', 'image', { apiKey: 'v' }, 'a');
      await service.remove('ollama-cloud', 'image');
      expect(prisma.rows()).toHaveLength(1);
      expect(prisma.rows()[0]!.purpose).toBe('chat');
    });

    it('is idempotent when the row is missing', async () => {
      await expect(service.remove('ollama-cloud', 'chat')).resolves.toBeUndefined();
    });
  });
});
