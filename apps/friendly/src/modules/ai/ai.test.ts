import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import sensiblePlugin from '../../plugins/sensible.js';
import jwtPlugin from '../../plugins/jwt.js';
import prismaPlugin from '../../plugins/prisma.js';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import aiRoutes from './ai.route.js';

// Minimal test app — bypasses @fastify/autoload's dynamic import (which
// escapes vite's `.js`→`.ts` resolution) by registering plugins/routes
// explicitly. The full buildApp is exercised in dev/start, while these
// tests focus on the route's HTTP contract.
const buildAiTestApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensiblePlugin);
  await app.register(errorHandlerPlugin);
  await app.register(jwtPlugin);
  await app.register(prismaPlugin);
  await app.register(aiRoutes);
  await app.ready();
  return app;
};

const adminToken = (app: FastifyInstance) =>
  app.jwt.sign({ userId: 'admin-test', email: 'a@x.com', role: 'ADMIN' });

const userToken = (app: FastifyInstance) =>
  app.jwt.sign({ userId: 'user-test', email: 'u@x.com', role: 'USER' });

describe('AI routes — auth guards', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildAiTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /complete: 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/ai/complete',
      payload: { prompt: 'hi', model: 'fast' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /complete: 403 with USER role', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/ai/complete',
      headers: { Authorization: `Bearer ${userToken(app)}` },
      payload: { prompt: 'hi', model: 'fast' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /complete-batch: 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/ai/complete-batch',
      payload: { items: [{ prompt: 'a', model: 'fast' }] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /providers: 403 with USER role', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/ai/providers',
      headers: { Authorization: `Bearer ${userToken(app)}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /complete: rejects empty prompt with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/ai/complete',
      headers: { Authorization: `Bearer ${adminToken(app)}` },
      payload: { prompt: '', model: 'fast' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /complete-batch: rejects empty items array with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/ai/complete-batch',
      headers: { Authorization: `Bearer ${adminToken(app)}` },
      payload: { items: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /complete-batch: rejects more than 10 items with 400', async () => {
    const items = Array.from({ length: 11 }, (_, i) => ({
      prompt: `p${i}`,
      model: 'fast' as const,
    }));
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/ai/complete-batch',
      headers: { Authorization: `Bearer ${adminToken(app)}` },
      payload: { items },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('AI routes — providers CRUD', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildAiTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Each test sees a fresh DB row state.
    await app.prisma.llmProviderConfig.deleteMany();
  });

  afterEach(async () => {
    await app.prisma.llmProviderConfig.deleteMany();
  });

  it('GET /providers returns at least the ollama-cloud row', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/ai/providers',
      headers: { Authorization: `Bearer ${adminToken(app)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { providers: Array<{ provider: string }> };
    expect(body.providers.some((p) => p.provider === 'ollama-cloud')).toBe(true);
  });

  it('PUT /providers/ollama-cloud creates a row and returns masked key', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/ai/providers/ollama-cloud/chat',
      headers: { Authorization: `Bearer ${adminToken(app)}` },
      payload: { apiKey: 'sk-test-1234567890abcd', maxConcurrent: 8 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      provider: string;
      hasApiKey: boolean;
      apiKeyMasked: string | null;
      maxConcurrent: number;
    };
    expect(body.provider).toBe('ollama-cloud');
    expect(body.hasApiKey).toBe(true);
    expect(body.apiKeyMasked).toBe('sk-***...abcd');
    expect(body.maxConcurrent).toBe(8);
  });

  it('PUT preserves apiKey when omitted, updates other fields', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/ai/providers/ollama-cloud/chat',
      headers: { Authorization: `Bearer ${adminToken(app)}` },
      payload: { apiKey: 'sk-original-9999' },
    });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/ai/providers/ollama-cloud/chat',
      headers: { Authorization: `Bearer ${adminToken(app)}` },
      payload: { maxConcurrent: 20 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { apiKeyMasked: string | null; maxConcurrent: number };
    expect(body.apiKeyMasked).toBe('sk-***...9999');
    expect(body.maxConcurrent).toBe(20);
  });

  it('DELETE removes the row and falls list back to env-backed default', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/ai/providers/ollama-cloud/chat',
      headers: { Authorization: `Bearer ${adminToken(app)}` },
      payload: { apiKey: 'sk-soon-to-be-deleted' },
    });
    const del = await app.inject({
      method: 'DELETE',
      url: '/api/v1/admin/ai/providers/ollama-cloud/chat',
      headers: { Authorization: `Bearer ${adminToken(app)}` },
    });
    expect(del.statusCode).toBe(204);
    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/ai/providers',
      headers: { Authorization: `Bearer ${adminToken(app)}` },
    });
    const body = list.json() as {
      providers: Array<{ provider: string; updatedAt: string | null }>;
    };
    const row = body.providers.find((p) => p.provider === 'ollama-cloud')!;
    // Deleted DB row → updatedAt becomes null (env-backed virtual row).
    expect(row.updatedAt).toBeNull();
  });

  it('DELETE is idempotent (204 even when no row exists)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/admin/ai/providers/ollama-cloud/chat',
      headers: { Authorization: `Bearer ${adminToken(app)}` },
    });
    expect(res.statusCode).toBe(204);
  });

  it('PUT rejects unknown provider id with 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/ai/providers/unknown-vendor/chat',
      headers: { Authorization: `Bearer ${adminToken(app)}` },
      payload: { apiKey: 'whatever' },
    });
    expect(res.statusCode).toBe(400);
  });
});
