import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiConfigService, maskApiKey, type LlmProviderEnv } from './ai.config.service.js';

const ENV: LlmProviderEnv = {
  apiKey: 'env-key-zzzz',
  baseUrl: 'https://env.example',
  timeoutMs: 60_000,
  maxConcurrent: 15,
  defaultModel: 'env-default-model',
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
    it('returns env-backed virtual chat row when DB has no entry', async () => {
      const out = await service.list();
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        provider: 'ollama-cloud',
        purpose: 'chat',
        hasApiKey: true,
        baseUrl: ENV.baseUrl,
        defaultModel: null,
        enabled: true,
        maxConcurrent: ENV.maxConcurrent,
      });
      expect(out[0]!.apiKeyMasked).toBe(maskApiKey(ENV.apiKey));
    });

    it('reports hasApiKey=false when env apiKey is empty AND no DB row', async () => {
      service = new AiConfigService(prisma as never, { ...ENV, apiKey: '' });
      const out = await service.list();
      expect(out[0]!.hasApiKey).toBe(false);
      expect(out[0]!.apiKeyMasked).toBeNull();
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
      expect(out).toHaveLength(2);
      expect(out.map((p) => p.purpose).sort()).toEqual(['chat', 'image']);
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
      expect(out).toHaveLength(2);
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
        defaultModel: ENV.defaultModel,
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

    it('image purpose returns null when no DB row (no env fallback)', async () => {
      const r = await service.getResolved('ollama-cloud', 'image');
      expect(r).toBeNull();
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

    it('creating image row without apiKey leaves it inactive (no env fallback)', async () => {
      const out = await service.update('ollama-cloud', 'image', { enabled: true }, 'admin-1');
      expect(out.hasApiKey).toBe(false);
      expect(prisma.rows()[0]!.apiKey).toBe('');
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
