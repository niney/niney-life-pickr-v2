import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
// 검사가 같이 묶여 있어, 공유 토큰/PUT 만 검증하려는 이 테스트에서는 우회가 깔끔.
// 차수(round) 1개, 김치찌개 30,000원, A·B 두 명 균등.
const seedSession = async (app: FastifyInstance, userId: string) => {
  const session = await app.prisma.settlementSession.create({
    data: {
      userId,
      restaurantPlaceId: 'place-test',
      restaurantName: '테스트식당',
      grandTotal: 30000,
      participants: {
        create: [
          { name: 'A', nickname: null, shareAmount: 15000, orderIndex: 0 },
          { name: 'B', nickname: null, shareAmount: 15000, orderIndex: 1 },
        ],
      },
    },
    include: { participants: { orderBy: { orderIndex: 'asc' } } },
  });
  const round = await app.prisma.settlementRound.create({
    data: {
      sessionId: session.id,
      orderIndex: 0,
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
      attendees: {
        create: session.participants.map((p) => ({
          participantId: p.id,
          attended: true,
          shareAmount: 15000,
        })),
      },
    },
  });
  return { sessionId: session.id, roundId: round.id, participants: session.participants };
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
    const { sessionId } = await seedSession(app, ownerId);

    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${sessionId}/share`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
    });
    expect(first.statusCode).toBe(200);
    const body1 = first.json();
    expect(body1.token).toBeTruthy();
    // 7바이트 base64url = 10자 짧은 토큰.
    expect(body1.token).toHaveLength(10);
    expect(body1.shareUrl).toBe(`/api/v1/share/settlements/${body1.token}`);
    // ttl 미지정 → 기본 7일 만료가 응답에 실린다.
    expect(body1.expiresAt).toBeTruthy();
    expect(new Date(body1.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${sessionId}/share`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
    });
    expect(second.statusCode).toBe(200);
    // 토큰은 멱등(동일), 만료는 갱신.
    expect(second.json().token).toBe(body1.token);
  });

  it('POST share: ttl 프리셋이 만료에 반영(1d < 30d)', async () => {
    const { sessionId } = await seedSession(app, ownerId);
    const auth = { Authorization: `Bearer ${tokenFor(app, ownerId)}` };

    const day = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${sessionId}/share`,
      headers: auth,
      payload: { ttl: '1d' },
    });
    const month = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${sessionId}/share`,
      headers: auth,
      payload: { ttl: '30d' },
    });
    expect(day.statusCode).toBe(200);
    expect(month.statusCode).toBe(200);
    const dayExp = new Date(day.json().expiresAt).getTime();
    const monthExp = new Date(month.json().expiresAt).getTime();
    // 30일 만료가 1일 만료보다 한참 뒤. (재호출이 같은 토큰의 만료를 갱신)
    expect(monthExp - dayExp).toBeGreaterThan(20 * 24 * 60 * 60 * 1000);
  });

  it('POST share: 비소유자는 403', async () => {
    const { sessionId } = await seedSession(app, ownerId);

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
    const { sessionId } = await seedSession(app, ownerId);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${sessionId}/share`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('DELETE share: 토큰 회수 후 같은 토큰으로 GET 시 404', async () => {
    const { sessionId } = await seedSession(app, ownerId);
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
    const { sessionId } = await seedSession(app, ownerId);
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/settlements/${sessionId}/share`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
    });
    expect(del.statusCode).toBe(204);
  });

  it('GET shared: 인증 없이 200, 응답에 userId/round.receiptPreviewUrl 없음', async () => {
    const { sessionId } = await seedSession(app, ownerId);
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
    expect(body.restaurantName).toBe('테스트식당');
    expect(body.rounds).toHaveLength(1);
    expect(body.rounds[0]).not.toHaveProperty('receiptPreviewUrl');
    expect(body.rounds[0]).not.toHaveProperty('receiptImageToken');
    expect(body.rounds[0].items).toHaveLength(1);
    expect(body.participants).toHaveLength(2);
  });

  it('GET shared: 잘못된 토큰은 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/share/settlements/' + 'x'.repeat(43),
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET shared: 만료된 링크는 410', async () => {
    const { sessionId } = await seedSession(app, ownerId);
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${sessionId}/share`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
    });
    const token = created.json().token as string;

    // 만료를 과거로 강제.
    await app.prisma.settlementSession.update({
      where: { id: sessionId },
      data: { shareExpiresAt: new Date(Date.now() - 1000) },
    });

    const get = await app.inject({
      method: 'GET',
      url: `/api/v1/share/settlements/${token}`,
    });
    expect(get.statusCode).toBe(410);
  });

  it('PUT update: 마스터 옵션 변경으로 shareAmount 재계산 + editedAt 세팅', async () => {
    const { sessionId, participants } = await seedSession(app, ownerId);
    const [a, b] = participants;

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/settlements/${sessionId}`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
      payload: {
        participants: [
          // A 는 비주류(김치찌개) 제외 → 분담 0 원
          {
            clientId: 'c-a',
            name: 'A',
            nickname: null,
            excludeAlcohol: false,
            excludeNonAlcohol: true,
            excludeSide: false,
          },
          {
            clientId: 'c-b',
            name: 'B',
            nickname: null,
            excludeAlcohol: false,
            excludeNonAlcohol: false,
            excludeSide: false,
          },
        ],
        rounds: [
          {
            restaurantPlaceId: 'place-test',
            source: 'MANUAL',
            totalAmount: 30000,
            warning: null,
            receiptImageToken: null,
            items: [
              {
                name: '김치찌개',
                unitPrice: 10000,
                quantity: 3,
                amount: 30000,
                category: 'NON_ALCOHOL',
                matchedMenuName: null,
              },
            ],
            attendees: [
              {
                participantClientId: 'c-a',
                attended: true,
                excludeAlcoholOverride: null,
                excludeNonAlcoholOverride: null,
                excludeSideOverride: null,
              },
              {
                participantClientId: 'c-b',
                attended: true,
                excludeAlcoholOverride: null,
                excludeNonAlcoholOverride: null,
                excludeSideOverride: null,
              },
            ],
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
    const byName = new Map(
      body.participants.map((p: { name: string; shareAmount: number }) => [
        p.name,
        p.shareAmount,
      ]),
    );
    expect(byName.get('A')).toBe(0);
    expect(byName.get('B')).toBe(30000);
    // round 의 attendees 도 같은 결과를 반영해야 함
    const rAttendees = body.rounds[0].attendees;
    const attendeeById = new Map(
      rAttendees.map((a: { participantId: string; shareAmount: number }) => [
        a.participantId,
        a.shareAmount,
      ]),
    );
    expect(attendeeById.size).toBe(2);
    // 마스터 participant 행도 다시 만들어졌으므로 id 가 바뀌었다 — body.participants 와 합 비교만.
    const sumAttendees = rAttendees.reduce(
      (s: number, a: { shareAmount: number }) => s + a.shareAmount,
      0,
    );
    expect(sumAttendees).toBe(30000);
    // unused params 경고 회피.
    void a;
    void b;
  });

  it('PUT update: 차수 추가 — 2차 다른 식당, 차수별 참석 분리', async () => {
    const { sessionId } = await seedSession(app, ownerId);
    // 2차 식당이 DB 에 등록돼 있어야 하므로 1차와 같은 placeId 로 검증.
    // (resolveRestaurantName 이 RestaurantService 를 통해 가져오는데 테스트
    // 환경에선 place-test 만 존재한다고 가정)
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/settlements/${sessionId}`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
      payload: {
        participants: [
          {
            clientId: 'c-a',
            name: 'A',
            nickname: null,
            excludeAlcohol: false,
            excludeNonAlcohol: false,
            excludeSide: false,
          },
          {
            clientId: 'c-b',
            name: 'B',
            nickname: null,
            excludeAlcohol: false,
            excludeNonAlcohol: false,
            excludeSide: false,
          },
        ],
        rounds: [
          {
            restaurantPlaceId: 'place-test',
            source: 'MANUAL',
            totalAmount: 30000,
            warning: null,
            receiptImageToken: null,
            items: [
              {
                name: '김치찌개',
                unitPrice: 10000,
                quantity: 3,
                amount: 30000,
                category: 'NON_ALCOHOL',
                matchedMenuName: null,
              },
            ],
            attendees: [
              {
                participantClientId: 'c-a',
                attended: true,
                excludeAlcoholOverride: null,
                excludeNonAlcoholOverride: null,
                excludeSideOverride: null,
              },
              {
                participantClientId: 'c-b',
                attended: true,
                excludeAlcoholOverride: null,
                excludeNonAlcoholOverride: null,
                excludeSideOverride: null,
              },
            ],
          },
          {
            restaurantPlaceId: 'place-test',
            source: 'MANUAL',
            totalAmount: 10000,
            warning: null,
            receiptImageToken: null,
            items: [
              {
                name: '맥주',
                unitPrice: 5000,
                quantity: 2,
                amount: 10000,
                category: 'ALCOHOL',
                matchedMenuName: null,
              },
            ],
            // 2차는 A 만 참석
            attendees: [
              {
                participantClientId: 'c-a',
                attended: true,
                excludeAlcoholOverride: null,
                excludeNonAlcoholOverride: null,
                excludeSideOverride: null,
              },
              {
                participantClientId: 'c-b',
                attended: false,
                excludeAlcoholOverride: null,
                excludeNonAlcoholOverride: null,
                excludeSideOverride: null,
              },
            ],
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rounds).toHaveLength(2);
    expect(body.grandTotal).toBe(40000);
    const byName = new Map(
      body.participants.map((p: { name: string; shareAmount: number }) => [
        p.name,
        p.shareAmount,
      ]),
    );
    // 1차 30,000 ÷ 2 = 15,000 each. 2차 10,000 (A 단독).
    expect(byName.get('A')).toBe(25000);
    expect(byName.get('B')).toBe(15000);
  });

  it('재발급 후 이전 토큰은 무효', async () => {
    const { sessionId } = await seedSession(app, ownerId);
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

// 영수증 토큰 왕복(round-trip) — 소유자 응답엔 receiptImageToken 이 그대로
// 돌아와야 편집 재저장에도 영수증이 보존된다. 라우트는 update 시 토큰의
// 디스크 파일 존재를 검증하므로 실제 receipts 디렉터리에 더미 파일을 둔다.
describe('settlement receipt token round-trip', () => {
  let app: FastifyInstance;
  const ownerId = 'receipt-rt-owner';
  // IMAGE_TOKEN_PATTERN(UUID hex) 에 맞는 고정 토큰.
  const token = '11111111-1111-1111-1111-111111111111';
  // SettlementService 기본 storageDir = process.cwd()/data/receipts.
  const receiptPath = join(process.cwd(), 'data', 'receipts', `${token}.jpg`);

  const seedReceiptSession = async (): Promise<string> => {
    const session = await app.prisma.settlementSession.create({
      data: {
        userId: ownerId,
        restaurantPlaceId: 'place-test',
        restaurantName: '테스트식당',
        grandTotal: 30000,
        participants: {
          create: [
            { name: 'A', nickname: null, shareAmount: 15000, orderIndex: 0 },
            { name: 'B', nickname: null, shareAmount: 15000, orderIndex: 1 },
          ],
        },
      },
      include: { participants: { orderBy: { orderIndex: 'asc' } } },
    });
    await app.prisma.settlementRound.create({
      data: {
        sessionId: session.id,
        orderIndex: 0,
        restaurantPlaceId: 'place-test',
        restaurantName: '테스트식당',
        source: 'RECEIPT',
        totalAmount: 30000,
        warning: null,
        receiptImageToken: token,
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
        attendees: {
          create: session.participants.map((p) => ({
            participantId: p.id,
            attended: true,
            shareAmount: 15000,
          })),
        },
      },
    });
    return session.id;
  };

  beforeAll(async () => {
    app = await buildTestApp();
    await app.prisma.user.upsert({
      where: { email: `${ownerId}@x.com` },
      update: {},
      create: { id: ownerId, email: `${ownerId}@x.com`, passwordHash: 'x' },
    });
    await mkdir(join(process.cwd(), 'data', 'receipts'), { recursive: true });
    await writeFile(receiptPath, Buffer.from('fake-jpeg'));
  });

  beforeEach(async () => {
    await app.prisma.settlementSession.deleteMany({ where: { userId: ownerId } });
  });

  afterAll(async () => {
    await app.prisma.settlementSession.deleteMany({ where: { userId: ownerId } });
    await app.prisma.user.deleteMany({ where: { id: ownerId } });
    await rm(receiptPath, { force: true });
    await app.close();
  });

  it('GET 소유자: receiptImageToken + receiptPreviewUrl 둘 다 응답', async () => {
    const sessionId = await seedReceiptSession();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/settlements/${sessionId}`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
    });
    expect(res.statusCode).toBe(200);
    const round = res.json().rounds[0];
    expect(round.receiptImageToken).toBe(token);
    expect(round.receiptPreviewUrl).toContain(token);
  });

  it('PUT 편집: 응답의 토큰을 그대로 보내면 재저장에도 영수증 보존', async () => {
    const sessionId = await seedReceiptSession();
    // 편집 진입 = GET 응답을 받아 그대로 다시 보내는 왕복.
    const get = await app.inject({
      method: 'GET',
      url: `/api/v1/settlements/${sessionId}`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
    });
    const r0 = get.json().rounds[0];

    const put = await app.inject({
      method: 'PUT',
      url: `/api/v1/settlements/${sessionId}`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
      payload: {
        participants: [
          {
            clientId: 'c-a',
            name: 'A',
            nickname: null,
            excludeAlcohol: false,
            excludeNonAlcohol: false,
            excludeSide: false,
          },
          {
            clientId: 'c-b',
            name: 'B',
            nickname: null,
            excludeAlcohol: false,
            excludeNonAlcohol: false,
            excludeSide: false,
          },
        ],
        rounds: [
          {
            restaurantPlaceId: r0.restaurantPlaceId,
            source: r0.source,
            totalAmount: r0.totalAmount,
            warning: r0.warning,
            // 핵심: 응답에서 받은 토큰을 그대로 전달 (옛 버그는 여기서 null 유실).
            receiptImageToken: r0.receiptImageToken,
            items: r0.items.map(
              (it: {
                name: string;
                unitPrice: number | null;
                quantity: number | null;
                amount: number;
                category: string;
                matchedMenuName: string | null;
              }) => ({
                name: it.name,
                unitPrice: it.unitPrice,
                quantity: it.quantity,
                amount: it.amount,
                category: it.category,
                matchedMenuName: it.matchedMenuName,
              }),
            ),
            attendees: [
              {
                participantClientId: 'c-a',
                attended: true,
                excludeAlcoholOverride: null,
                excludeNonAlcoholOverride: null,
                excludeSideOverride: null,
              },
              {
                participantClientId: 'c-b',
                attended: true,
                excludeAlcoholOverride: null,
                excludeNonAlcoholOverride: null,
                excludeSideOverride: null,
              },
            ],
          },
        ],
      },
    });
    expect(put.statusCode).toBe(200);
    const round = put.json().rounds[0];
    expect(round.receiptImageToken).toBe(token);
    expect(round.receiptPreviewUrl).toContain(token);
  });
});
