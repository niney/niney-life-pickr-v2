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
import settlementRoutes from './settlement.route.js';

const buildTestApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensiblePlugin);
  await app.register(errorHandlerPlugin);
  await app.register(jwtPlugin);
  await app.register(prismaPlugin);
  await app.register(settlementRoutes);
  await app.ready();
  return app;
};

const tokenFor = (app: FastifyInstance, userId: string) =>
  app.jwt.sign({ userId, email: `${userId}@x.com`, role: 'USER' });

// 정산 세션을 prisma 로 직접 한 줄 만든다 — 라우트 POST 는 restaurant 존재
// 검사가 같이 묶여 있어, 공유 토큰만 검증하려는 이 테스트에서는 우회가 깔끔.
const seedSession = async (app: FastifyInstance, userId: string) => {
  const session = await app.prisma.settlementSession.create({
    data: {
      userId,
      restaurantPlaceId: 'place-test',
      restaurantName: '테스트식당',
      source: 'MANUAL',
      totalAmount: 30000,
      warning: null,
      receiptImageToken: null,
      itemsSubtotal: 30000,
      items: {
        create: [
          {
            name: '김치찌개',
            unitPrice: 10000,
            quantity: 3,
            amount: 30000,
            category: 'NON_ALCOHOL',
            orderIndex: 0,
          },
        ],
      },
      participants: {
        create: [
          { name: 'A', nickname: null, shareAmount: 15000, orderIndex: 0 },
          { name: 'B', nickname: null, shareAmount: 15000, orderIndex: 1 },
        ],
      },
    },
  });
  return session.id;
};

describe('settlement share routes', () => {
  let app: FastifyInstance;
  const ownerId = 'share-test-owner';
  const otherId = 'share-test-other';

  beforeAll(async () => {
    app = await buildTestApp();
    // 같은 userId 로 남아있는 시드 정리.
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

  beforeEach(async () => {
    await app.prisma.settlementSession.deleteMany({
      where: { userId: { in: [ownerId, otherId] } },
    });
  });

  afterAll(async () => {
    await app.prisma.settlementSession.deleteMany({
      where: { userId: { in: [ownerId, otherId] } },
    });
    await app.prisma.user.deleteMany({
      where: { id: { in: [ownerId, otherId] } },
    });
    await app.close();
  });

  it('POST share: 토큰 생성, 동일 호출은 동일 토큰(멱등)', async () => {
    const sessionId = await seedSession(app, ownerId);

    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${sessionId}/share`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
    });
    expect(first.statusCode).toBe(200);
    const body1 = first.json();
    expect(body1.token).toBeTruthy();
    expect(body1.shareUrl).toBe(`/api/v1/share/settlements/${body1.token}`);

    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${sessionId}/share`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().token).toBe(body1.token);
  });

  it('POST share: 비소유자는 403', async () => {
    const sessionId = await seedSession(app, ownerId);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${sessionId}/share`,
      headers: { Authorization: `Bearer ${tokenFor(app, otherId)}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST share: 존재하지 않는 세션은 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/settlements/nonexistent-id/share',
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST share: 인증 없으면 401', async () => {
    const sessionId = await seedSession(app, ownerId);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${sessionId}/share`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('DELETE share: 토큰 회수 후 같은 토큰으로 GET 시 404', async () => {
    const sessionId = await seedSession(app, ownerId);
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${sessionId}/share`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
    });
    const token = created.json().token as string;

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/settlements/${sessionId}/share`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
    });
    expect(del.statusCode).toBe(204);

    const get = await app.inject({
      method: 'GET',
      url: `/api/v1/share/settlements/${token}`,
    });
    expect(get.statusCode).toBe(404);
  });

  it('DELETE share: 이미 비공개 세션도 204(멱등)', async () => {
    const sessionId = await seedSession(app, ownerId);
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/settlements/${sessionId}/share`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
    });
    expect(del.statusCode).toBe(204);
  });

  it('GET shared: 인증 없이 200, 응답에 userId/receiptPreviewUrl 없음', async () => {
    const sessionId = await seedSession(app, ownerId);
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${sessionId}/share`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
    });
    const token = created.json().token as string;

    const get = await app.inject({
      method: 'GET',
      url: `/api/v1/share/settlements/${token}`,
    });
    expect(get.statusCode).toBe(200);
    const body = get.json();
    expect(body).not.toHaveProperty('userId');
    expect(body).not.toHaveProperty('receiptPreviewUrl');
    expect(body.restaurantName).toBe('테스트식당');
    expect(body.items).toHaveLength(1);
    expect(body.participants).toHaveLength(2);
  });

  it('GET shared: 잘못된 토큰은 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/share/settlements/' + 'x'.repeat(43),
    });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH participants: 옵션 변경으로 shareAmount 재계산 + editedAt 세팅', async () => {
    const sessionId = await seedSession(app, ownerId);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/settlements/${sessionId}/participants`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
      payload: {
        participants: [
          // A 는 비주류(김치찌개) 제외 → 분담 0 원
          {
            name: 'A',
            nickname: null,
            excludeAlcohol: false,
            excludeNonAlcohol: true,
            excludeSide: false,
          },
          {
            name: 'B',
            nickname: null,
            excludeAlcohol: false,
            excludeNonAlcohol: false,
            excludeSide: false,
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.editedAt).toBeTruthy();
    expect(body.participants).toHaveLength(2);
    // A 는 비주류 제외 → 김치찌개(30000원) 풀에서 빠짐 → 0원
    // B 혼자 비주류 풀 부담 → 30000원
    const byName = new Map(body.participants.map((p: { name: string; shareAmount: number }) => [p.name, p.shareAmount]));
    expect(byName.get('A')).toBe(0);
    expect(byName.get('B')).toBe(30000);
  });

  it('PATCH participants: 비소유자는 403', async () => {
    const sessionId = await seedSession(app, ownerId);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/settlements/${sessionId}/participants`,
      headers: { Authorization: `Bearer ${tokenFor(app, otherId)}` },
      payload: {
        participants: [
          {
            name: 'X',
            nickname: null,
            excludeAlcohol: false,
            excludeNonAlcohol: false,
            excludeSide: false,
          },
        ],
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('재발급 후 이전 토큰은 무효', async () => {
    const sessionId = await seedSession(app, ownerId);
    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${sessionId}/share`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
    });
    const oldToken = first.json().token as string;

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/settlements/${sessionId}/share`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
    });

    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${sessionId}/share`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
    });
    const newToken = second.json().token as string;
    expect(newToken).not.toBe(oldToken);

    const getOld = await app.inject({
      method: 'GET',
      url: `/api/v1/share/settlements/${oldToken}`,
    });
    expect(getOld.statusCode).toBe(404);

    const getNew = await app.inject({
      method: 'GET',
      url: `/api/v1/share/settlements/${newToken}`,
    });
    expect(getNew.statusCode).toBe(200);
  });
});
