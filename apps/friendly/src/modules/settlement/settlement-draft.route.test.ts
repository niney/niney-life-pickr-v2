import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import settlementDraftRoutes from './settlement-draft.route.js';

const buildTestApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensiblePlugin);
  await app.register(errorHandlerPlugin);
  await app.register(jwtPlugin);
  await app.register(prismaPlugin);
  await app.register(settlementDraftRoutes);
  await app.ready();
  return app;
};

const tokenFor = (app: FastifyInstance, userId: string) =>
  app.jwt.sign({ userId, email: `${userId}@x.com`, role: 'USER' });

describe('settlement draft routes', () => {
  let app: FastifyInstance;
  const ownerId = 'draft-test-owner';
  const otherId = 'draft-test-other';

  beforeAll(async () => {
    app = await buildTestApp();
    await app.prisma.user.upsert({
      where: { email: `${ownerId}@x.com` },
      update: {},
      create: { id: ownerId, email: `${ownerId}@x.com`, passwordHash: 'x' },
    });
    await app.prisma.user.upsert({
      where: { email: `${otherId}@x.com` },
      update: {},
      create: { id: otherId, email: `${otherId}@x.com`, passwordHash: 'x' },
    });
  });

  afterAll(async () => {
    await app.prisma.settlementDraft.deleteMany({
      where: { userId: { in: [ownerId, otherId] } },
    });
    await app.close();
  });

  beforeEach(async () => {
    await app.prisma.settlementDraft.deleteMany({
      where: { userId: { in: [ownerId, otherId] } },
    });
  });

  it('PUT upsert 가 새 row 를 만들고, 같은 placeId 로 다시 부르면 동일 id 로 update', async () => {
    const token = tokenFor(app, ownerId);
    const first = await app.inject({
      method: 'PUT',
      url: '/api/v1/settlement-drafts',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        placeId: 'place-A',
        placeNameHint: '식당 A',
        payload: { participants: [], rounds: [] },
      },
    });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json() as { id: string; placeId: string };
    expect(firstBody.placeId).toBe('place-A');

    const second = await app.inject({
      method: 'PUT',
      url: '/api/v1/settlement-drafts',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        placeId: 'place-A',
        placeNameHint: '식당 A v2',
        payload: { participants: [{ clientId: 'p1' }], rounds: [] },
      },
    });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json() as { id: string; placeNameHint: string };
    expect(secondBody.id).toBe(firstBody.id);
    expect(secondBody.placeNameHint).toBe('식당 A v2');
  });

  it('placeId=null 슬롯과 placeId=X 슬롯은 별개로 관리된다', async () => {
    const token = tokenFor(app, ownerId);
    await app.inject({
      method: 'PUT',
      url: '/api/v1/settlement-drafts',
      headers: { authorization: `Bearer ${token}` },
      payload: { placeId: null, payload: { participants: [], rounds: [] } },
    });
    await app.inject({
      method: 'PUT',
      url: '/api/v1/settlement-drafts',
      headers: { authorization: `Bearer ${token}` },
      payload: { placeId: 'place-X', payload: { participants: [], rounds: [] } },
    });
    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/settlement-drafts',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    const body = list.json() as { items: Array<{ placeId: string | null }> };
    expect(body.items).toHaveLength(2);
    expect(body.items.map((i) => i.placeId).sort()).toEqual([null, 'place-X']);
  });

  it('GET list 는 본인 것만 — 다른 사용자 draft 는 안 보인다', async () => {
    const ownerToken = tokenFor(app, ownerId);
    const otherToken = tokenFor(app, otherId);
    await app.inject({
      method: 'PUT',
      url: '/api/v1/settlement-drafts',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { placeId: 'place-Z', payload: {} },
    });
    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/settlement-drafts',
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { items: unknown[] }).items).toHaveLength(0);
  });

  it('DELETE 본인 것이면 204, 남의 것이면 403', async () => {
    const ownerToken = tokenFor(app, ownerId);
    const otherToken = tokenFor(app, otherId);
    const created = await app.inject({
      method: 'PUT',
      url: '/api/v1/settlement-drafts',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { placeId: 'place-D', payload: {} },
    });
    const { id } = created.json() as { id: string };

    const forbidden = await app.inject({
      method: 'DELETE',
      url: `/api/v1/settlement-drafts/${id}`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(forbidden.statusCode).toBe(403);

    const ok = await app.inject({
      method: 'DELETE',
      url: `/api/v1/settlement-drafts/${id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(ok.statusCode).toBe(204);
  });

  it('인증 없이는 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/settlement-drafts',
    });
    expect(res.statusCode).toBe(401);
  });

  it('payload 가 200KB 를 초과하면 400', async () => {
    const token = tokenFor(app, ownerId);
    const huge = 'x'.repeat(200 * 1024 + 100);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/settlement-drafts',
      headers: { authorization: `Bearer ${token}` },
      payload: { placeId: 'place-big', payload: { x: huge } },
    });
    expect(res.statusCode).toBe(400);
  });
});
