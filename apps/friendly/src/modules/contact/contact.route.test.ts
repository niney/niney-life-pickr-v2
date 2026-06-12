import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { CreateSettlementInputType } from '@repo/api-contract';
import sensiblePlugin from '../../plugins/sensible.js';
import jwtPlugin from '../../plugins/jwt.js';
import prismaPlugin from '../../plugins/prisma.js';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import contactRoutes from './contact.route.js';
import { SettlementService } from '../settlement/settlement.service.js';

const buildTestApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensiblePlugin);
  await app.register(errorHandlerPlugin);
  await app.register(jwtPlugin);
  await app.register(prismaPlugin);
  await app.register(contactRoutes);
  await app.ready();
  return app;
};

const tokenFor = (app: FastifyInstance, userId: string) =>
  app.jwt.sign({ userId, email: `${userId}@x.com`, role: 'USER' });

// SettlementService.create 가 resolveRestaurantName 으로 실존 식당(placeId)을
// 요구하므로 이 테스트 전용 placeId 로 식당을 시드한다.
const CONTACT_PLACE_ID = 'contact-place-test';

// 현행 CreateSettlementInput(차수 구조) 한 차수짜리 입력. 라우트를 거치지 않는
// 서비스 직접 호출이라 zod default 가 적용되지 않으므로 모든 키를 명시한다.
const makeRound = (
  items: Array<{
    name: string;
    unitPrice: number | null;
    quantity: number | null;
    amount: number;
    category: 'ALCOHOL' | 'NON_ALCOHOL' | 'SIDE' | 'UNCATEGORIZED';
  }>,
  attendeeClientIds: string[],
): CreateSettlementInputType['rounds'][number] => ({
  restaurantPlaceId: CONTACT_PLACE_ID,
  source: 'MANUAL',
  totalAmount: items.reduce((sum, it) => sum + it.amount, 0),
  warning: null,
  receiptImageToken: null,
  discountAmount: null,
  discountCategory: null,
  categoryAdjustments: null,
  groupSplits: null,
  items: items.map((it) => ({ ...it, matchedMenuName: null })),
  attendees: attendeeClientIds.map((clientId) => ({
    participantClientId: clientId,
    attended: true,
    excludeAlcoholOverride: null,
    excludeNonAlcoholOverride: null,
    excludeSideOverride: null,
  })),
});

// 단골 row 한 줄을 직접 prisma 로 만든다 — 정산 라우트를 끼고 들어가지
// 않으므로 식당·계산기 의존 없이 list/patch/delete 만 검증 가능.
const seedContact = async (
  app: FastifyInstance,
  userId: string,
  name: string | null,
  nickname: string | null,
  exclude: { a?: boolean; n?: boolean; s?: boolean } = {},
) => {
  const key = `${(name ?? '').trim().toLowerCase()}|${(nickname ?? '').trim().toLowerCase()}`;
  return app.prisma.settlementContact.create({
    data: {
      userId,
      name,
      nickname,
      normalizedKey: key,
      lastExcludeAlcohol: exclude.a ?? false,
      lastExcludeNonAlcohol: exclude.n ?? false,
      lastExcludeSide: exclude.s ?? false,
    },
  });
};

describe('contact routes', () => {
  let app: FastifyInstance;
  const ownerId = 'contact-test-owner';
  const otherId = 'contact-test-other';

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
    // 정산 생성 테스트가 참조하는 식당 — resolveRestaurantName 의 placeId 조회.
    await app.prisma.restaurant.upsert({
      where: { placeId: CONTACT_PLACE_ID },
      update: {},
      create: {
        source: 'naver',
        sourceId: CONTACT_PLACE_ID,
        placeId: CONTACT_PLACE_ID,
        name: '테스트식당',
        rawSourceUrl: 'https://m.place.naver.com/restaurant/contact-test',
        snapshotJson: '{}',
        canonical: {
          create: {
            name: '테스트식당',
            primaryCategory: null,
            latitude: null,
            longitude: null,
          },
        },
      },
    });
  });

  beforeEach(async () => {
    await app.prisma.settlementSession.deleteMany({
      where: { userId: { in: [ownerId, otherId] } },
    });
    await app.prisma.settlementContact.deleteMany({
      where: { userId: { in: [ownerId, otherId] } },
    });
  });

  afterAll(async () => {
    await app.prisma.settlementSession.deleteMany({
      where: { userId: { in: [ownerId, otherId] } },
    });
    await app.prisma.settlementContact.deleteMany({
      where: { userId: { in: [ownerId, otherId] } },
    });
    await app.prisma.user.deleteMany({
      where: { id: { in: [ownerId, otherId] } },
    });
    const seeded = await app.prisma.restaurant.findUnique({
      where: { placeId: CONTACT_PLACE_ID },
      select: { id: true, canonicalId: true },
    });
    if (seeded) {
      await app.prisma.restaurant.delete({ where: { id: seeded.id } });
      await app.prisma.canonicalRestaurant.deleteMany({
        where: { id: seeded.canonicalId },
      });
    }
    await app.close();
  });

  it('GET /me/contacts: 인증 없으면 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/contacts' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /me/contacts: 본인 단골만 노출, 최근 사용 desc 정렬', async () => {
    // owner: 2개, other: 1개. other 것은 owner 응답에 보이면 안 된다.
    const oldOwner = await seedContact(app, ownerId, '철수', null);
    await app.prisma.settlementContact.update({
      where: { id: oldOwner.id },
      data: { lastUsedAt: new Date(2024, 0, 1) },
    });
    await seedContact(app, ownerId, '영희', '용용');
    await seedContact(app, otherId, '몰래', null);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/contacts',
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(2);
    expect(body.items).toHaveLength(2);
    // 최근(영희) 가 먼저, 오래된(철수) 가 나중.
    expect(body.items[0].name).toBe('영희');
    expect(body.items[1].name).toBe('철수');
    expect(body.items.some((c: { name: string }) => c.name === '몰래')).toBe(false);
  });

  it('GET /me/contacts?q=철: 이름/닉네임 부분일치', async () => {
    await seedContact(app, ownerId, '철수', null);
    await seedContact(app, ownerId, '영희', '철민');
    await seedContact(app, ownerId, '민수', '도경');

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/contacts?q=' + encodeURIComponent('철'),
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(2);
    const names = body.items.map((c: { name: string }) => c.name).sort();
    expect(names).toEqual(['영희', '철수']);
  });

  it('PATCH /me/contacts/:id: 이름·닉네임 수정 + normalizedKey 갱신', async () => {
    const c = await seedContact(app, ownerId, '철수', null);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/me/contacts/${c.id}`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
      payload: { name: '철수', nickname: '철이' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('철수');
    expect(res.json().nickname).toBe('철이');

    const fresh = await app.prisma.settlementContact.findUnique({
      where: { id: c.id },
    });
    expect(fresh?.normalizedKey).toBe('철수|철이');
  });

  it('PATCH: 같은 키 가진 다른 row 존재 시 409', async () => {
    const a = await seedContact(app, ownerId, '철수', null);
    await seedContact(app, ownerId, '영희', null);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/me/contacts/${a.id}`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
      payload: { name: '영희', nickname: null },
    });
    expect(res.statusCode).toBe(409);
  });

  it('PATCH: 둘 다 빈 값은 400', async () => {
    const c = await seedContact(app, ownerId, '철수', null);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/me/contacts/${c.id}`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
      payload: { name: '   ', nickname: null },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH: 비소유자는 403', async () => {
    const c = await seedContact(app, ownerId, '철수', null);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/me/contacts/${c.id}`,
      headers: { Authorization: `Bearer ${tokenFor(app, otherId)}` },
      payload: { name: '바꾼이름', nickname: null },
    });
    expect(res.statusCode).toBe(403);
  });

  it('DELETE: 본인 단골 삭제 + 과거 정산 participant.contactId = null', async () => {
    const service = new SettlementService(app.prisma);
    const created = await service.create(ownerId, {
      participants: [
        {
          clientId: 'c-cs',
          name: '철수',
          nickname: null,
          excludeAlcohol: false,
          excludeNonAlcohol: false,
          excludeSide: false,
        },
      ],
      rounds: [
        makeRound(
          [
            {
              name: '김치찌개',
              unitPrice: 10000,
              quantity: 1,
              amount: 10000,
              category: 'NON_ALCOHOL',
            },
          ],
          ['c-cs'],
        ),
      ],
    });
    const linkedContactId = created.participants[0]!.contactId!;
    expect(linkedContactId).toBeTruthy();

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/me/contacts/${linkedContactId}`,
      headers: { Authorization: `Bearer ${tokenFor(app, ownerId)}` },
    });
    expect(del.statusCode).toBe(204);

    const fresh = await app.prisma.settlementParticipant.findMany({
      where: { sessionId: created.id },
    });
    expect(fresh).toHaveLength(1);
    expect(fresh[0]!.contactId).toBeNull();
    // 정산 본체는 그대로 남아 있다 — 이력 보존.
    const stillThere = await app.prisma.settlementSession.findUnique({
      where: { id: created.id },
    });
    expect(stillThere).not.toBeNull();
  });

  it('DELETE: 비소유자는 403', async () => {
    const c = await seedContact(app, ownerId, '철수', null);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/me/contacts/${c.id}`,
      headers: { Authorization: `Bearer ${tokenFor(app, otherId)}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('정산 저장: 신규 참여자는 새 contact, 같은 키는 기존 매칭(merge)', async () => {
    const service = new SettlementService(app.prisma);

    // 1차 정산 — "철수" 가 ALCOHOL 제외로 들어옴.
    const first = await service.create(ownerId, {
      participants: [
        {
          clientId: 'c-cs',
          name: '철수',
          nickname: null,
          excludeAlcohol: true,
          excludeNonAlcohol: false,
          excludeSide: false,
        },
        {
          clientId: 'c-yh',
          name: '영희',
          nickname: null,
          excludeAlcohol: false,
          excludeNonAlcohol: false,
          excludeSide: false,
        },
      ],
      rounds: [
        makeRound(
          [
            {
              name: '맥주',
              unitPrice: 5000,
              quantity: 2,
              amount: 10000,
              category: 'ALCOHOL',
            },
          ],
          ['c-cs', 'c-yh'],
        ),
      ],
    });
    const cid1 = first.participants[0]!.contactId!;

    // 2차 정산 — 같은 "철수" 가 이번엔 alcohol 제외 안 함. contact 는 매칭되고
    // lastExclude* 가 새 값으로 덮어써져야 한다.
    const second = await service.create(ownerId, {
      participants: [
        {
          clientId: 'c-cs',
          name: '철수',
          nickname: null,
          excludeAlcohol: false,
          excludeNonAlcohol: false,
          excludeSide: false,
        },
      ],
      rounds: [
        makeRound(
          [
            {
              name: '콜라',
              unitPrice: 5000,
              quantity: 1,
              amount: 5000,
              category: 'NON_ALCOHOL',
            },
          ],
          ['c-cs'],
        ),
      ],
    });
    const cid2 = second.participants[0]!.contactId!;

    expect(cid2).toBe(cid1); // 같은 contact 로 머지
    const contact = await app.prisma.settlementContact.findUnique({
      where: { id: cid1 },
    });
    expect(contact?.lastExcludeAlcohol).toBe(false); // 최신값으로 덮임
    expect(contact?.useCount).toBe(2);

    // 다른 사람("영희") 은 별개 contact.
    const contacts = await app.prisma.settlementContact.findMany({
      where: { userId: ownerId },
    });
    expect(contacts).toHaveLength(2);
  });
});
