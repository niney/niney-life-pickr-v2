import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import settingsMapRoutes from './map.route.js';

const buildTestApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensiblePlugin);
  await app.register(errorHandlerPlugin);
  await app.register(jwtPlugin);
  await app.register(prismaPlugin);
  await app.register(settingsMapRoutes);
  await app.ready();
  return app;
};

const adminToken = (app: FastifyInstance) =>
  app.jwt.sign({ userId: 'admin-test', email: 'a@x.com', role: 'ADMIN' });

const userToken = (app: FastifyInstance) =>
  app.jwt.sign({ userId: 'user-test', email: 'u@x.com', role: 'USER' });

describe('Settings/Map routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
    // 테스트 격리 — 다른 테스트가 남긴 row 가 있을 수 있으므로 시작 시 비움.
    await app.prisma.mapProviderConfig.deleteMany({ where: { provider: 'vworld' } });
  });

  afterAll(async () => {
    await app.prisma.mapProviderConfig.deleteMany({ where: { provider: 'vworld' } });
    await app.close();
  });

  it('GET /admin/settings/map: 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/settings/map' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /admin/settings/map: 403 with USER role', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/settings/map',
      headers: { Authorization: `Bearer ${userToken(app)}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /admin/settings/map: returns synthesized empty row when no config', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/settings/map',
      headers: { Authorization: `Bearer ${adminToken(app)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.providers).toHaveLength(1);
    expect(body.providers[0]).toMatchObject({
      provider: 'vworld',
      hasApiKey: false,
      apiKeyMasked: null,
      domains: null,
      updatedAt: null,
    });
  });

  it('PUT then GET secret: round-trips plaintext to admin', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings/map/vworld',
      headers: { Authorization: `Bearer ${adminToken(app)}` },
      payload: { apiKey: 'vw-secret-1234567890', domains: 'localhost:5173' },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({
      provider: 'vworld',
      hasApiKey: true,
      domains: 'localhost:5173',
    });

    const secret = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/settings/map/vworld/secret',
      headers: { Authorization: `Bearer ${adminToken(app)}` },
    });
    expect(secret.statusCode).toBe(200);
    expect(secret.json()).toEqual({
      provider: 'vworld',
      apiKey: 'vw-secret-1234567890',
      domains: 'localhost:5173',
    });
  });

  it('GET secret: 403 with USER role', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/settings/map/vworld/secret',
      headers: { Authorization: `Bearer ${userToken(app)}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('PUT preserves apiKey when only domains change', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings/map/vworld',
      headers: { Authorization: `Bearer ${adminToken(app)}` },
      payload: { domains: 'example.com' },
    });
    expect(res.statusCode).toBe(200);
    const secret = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/settings/map/vworld/secret',
      headers: { Authorization: `Bearer ${adminToken(app)}` },
    });
    expect(secret.json()).toEqual({
      provider: 'vworld',
      apiKey: 'vw-secret-1234567890',
      domains: 'example.com',
    });
  });

  it('DELETE clears DB row', async () => {
    const del = await app.inject({
      method: 'DELETE',
      url: '/api/v1/admin/settings/map/vworld',
      headers: { Authorization: `Bearer ${adminToken(app)}` },
    });
    expect(del.statusCode).toBe(204);

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/settings/map',
      headers: { Authorization: `Bearer ${adminToken(app)}` },
    });
    expect(list.json().providers[0].hasApiKey).toBe(false);
  });
});

describe('GET /settings/map/public — public', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
    await app.prisma.mapProviderConfig.deleteMany({ where: { provider: 'vworld' } });
  });

  afterAll(async () => {
    await app.prisma.mapProviderConfig.deleteMany({ where: { provider: 'vworld' } });
    await app.close();
  });

  it('returns 404 when no key is registered', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/settings/map/public',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns plaintext key when registered, no auth required', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings/map/vworld',
      headers: { Authorization: `Bearer ${adminToken(app)}` },
      payload: { apiKey: 'public-key-9999' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/settings/map/public',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ provider: 'vworld', apiKey: 'public-key-9999' });
  });
});
