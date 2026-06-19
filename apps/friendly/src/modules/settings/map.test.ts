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
import { MapSettingsService } from './map.service.js';

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

// 라우트가 아니라 서비스를 직접 구성해 env fallback 을 검증한다 (라우트는
// 전역 env 싱글톤을 읽어 VWORLD_* 를 주입할 수 없으므로). 텔레그램 설정과
// 동일한 "DB 우선 + .env fallback" 규약.
describe('MapSettingsService — env fallback (DB 우선 + .env)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
    await app.prisma.mapProviderConfig.deleteMany({ where: { provider: 'vworld' } });
  });

  afterAll(async () => {
    await app.prisma.mapProviderConfig.deleteMany({ where: { provider: 'vworld' } });
    await app.close();
  });

  it('source=none — DB·env 어디에도 키가 없으면', async () => {
    const svc = new MapSettingsService(app.prisma, { apiKey: '', domains: '' });
    const [v] = await svc.list();
    expect(v).toMatchObject({
      provider: 'vworld',
      hasApiKey: false,
      apiKeyMasked: null,
      source: 'none',
    });
    expect((await svc.getSecret('vworld')).apiKey).toBeNull();
  });

  it('source=env — DB 행이 없으면 .env 키로 동작', async () => {
    const svc = new MapSettingsService(app.prisma, {
      apiKey: 'env-key-abcd1234',
      domains: 'env.example.com',
    });
    const [v] = await svc.list();
    expect(v).toMatchObject({
      hasApiKey: true,
      source: 'env',
      domains: 'env.example.com',
    });
    expect(await svc.getSecret('vworld')).toEqual({
      provider: 'vworld',
      apiKey: 'env-key-abcd1234',
      domains: 'env.example.com',
    });
  });

  it('env 키가 있으면 도메인 메모만 저장 가능 — 키는 env 상속', async () => {
    const svc = new MapSettingsService(app.prisma, {
      apiKey: 'env-key-abcd1234',
      domains: 'env.example.com',
    });
    await svc.update('vworld', { domains: 'memo.only.com' }, 'admin-test');
    const secret = await svc.getSecret('vworld');
    expect(secret.apiKey).toBe('env-key-abcd1234'); // 키는 여전히 env 상속
    expect(secret.domains).toBe('memo.only.com'); // domains 는 DB 메모 우선
    const [v] = await svc.list();
    expect(v.source).toBe('env'); // DB 행은 있지만 키가 비어 출처는 env
  });

  it('DB 키를 저장하면 env 를 덮어쓴다 (source=db)', async () => {
    const svc = new MapSettingsService(app.prisma, {
      apiKey: 'env-key-abcd1234',
      domains: '',
    });
    await svc.update('vworld', { apiKey: 'db-key-zzzz9999' }, 'admin-test');
    const [v] = await svc.list();
    expect(v).toMatchObject({ source: 'db', hasApiKey: true });
    expect((await svc.getSecret('vworld')).apiKey).toBe('db-key-zzzz9999');
  });

  it('remove() 후 env 키로 복귀', async () => {
    const svc = new MapSettingsService(app.prisma, {
      apiKey: 'env-key-abcd1234',
      domains: '',
    });
    await svc.update('vworld', { apiKey: 'db-key-temp1234' }, 'admin-test');
    await svc.remove('vworld');
    expect((await svc.getSecret('vworld')).apiKey).toBe('env-key-abcd1234');
    expect((await svc.list())[0].source).toBe('env');
  });
});
