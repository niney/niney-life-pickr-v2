import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { SharedVoteSessionType, VoteSessionType } from '@repo/api-contract';
import sensiblePlugin from '../../plugins/sensible.js';
import jwtPlugin from '../../plugins/jwt.js';
import prismaPlugin from '../../plugins/prisma.js';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import voteRoutes from './vote.route.js';
import { RestaurantService } from '../restaurant/restaurant.service.js';

const buildTestApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensiblePlugin);
  await app.register(errorHandlerPlugin);
  await app.register(jwtPlugin);
  await app.register(prismaPlugin);
  await app.register(voteRoutes);
  await app.ready();
  return app;
};

const tokenFor = (app: FastifyInstance, userId: string): string =>
  app.jwt.sign({ userId, email: `${userId}@x.com`, role: 'USER' });
const auth = (app: FastifyInstance, userId: string): { Authorization: string } => ({
  Authorization: `Bearer ${tokenFor(app, userId)}`,
});

// 파일 전용 placeId prefix — 병렬 테스트 파일과의 dev.db 격리 규칙. 계약이
// 숫자 문자열만 허용하므로 숫자 대역(9900…)을 파일 전용으로 쓴다.
const PLACE_BASE = 9900000000;

const optionInput = (i: number) => ({
  placeId: String(PLACE_BASE + i),
  name: `후보${i}`,
  category: i % 2 === 0 ? '한식' : null,
  thumbnailUrl: null,
});

const CREATE_URL = '/api/v1/votes';
const sharedUrl = (token: string) => `/api/v1/share/votes/${token}`;
const ballotUrl = (token: string) => `/api/v1/share/votes/${token}/ballot`;
const closeUrl = (id: string) => `/api/v1/votes/${id}/close`;

describe('vote routes', () => {
  let app: FastifyInstance;
  const ownerId = 'vote-test-owner';
  const otherId = 'vote-test-other';

  const clearVotes = async (): Promise<void> => {
    await app.prisma.voteSession.deleteMany({
      where: { userId: { in: [ownerId, otherId] } },
    });
  };

  beforeAll(async () => {
    app = await buildTestApp();
    for (const id of [ownerId, otherId]) {
      await app.prisma.user.upsert({
        where: { email: `${id}@x.com` },
        update: {},
        create: { id, email: `${id}@x.com`, passwordHash: 'x' },
      });
    }
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await clearVotes();
  });

  afterAll(async () => {
    await clearVotes();
    await app.prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
    await app.close();
  });

  const createVote = async (userId: string, optionCount = 3): Promise<VoteSessionType> => {
    const res = await app.inject({
      method: 'POST',
      url: CREATE_URL,
      headers: auth(app, userId),
      payload: {
        title: '오늘 회식 어디?',
        options: Array.from({ length: optionCount }, (_, i) => optionInput(i)),
      },
    });
    expect(res.statusCode).toBe(200);
    return res.json() as VoteSessionType;
  };

  const putBallot = async (
    token: string,
    voterKey: string,
    voterLabel: string,
    optionIds: string[],
  ) => {
    const res = await app.inject({
      method: 'PUT',
      url: ballotUrl(token),
      payload: { voterKey, voterLabel, optionIds },
    });
    return res;
  };

  describe('생성', () => {
    it('200 — 토큰 10자 + 옵션 orderIndex 입력 순서 보존 + isOwner true', async () => {
      const session = await createVote(ownerId, 3);
      expect(session.token).toHaveLength(10);
      expect(session.isOwner).toBe(true);
      expect(session.options.map((o) => o.name)).toEqual(['후보0', '후보1', '후보2']);
      expect(session.options.map((o) => o.orderIndex)).toEqual([0, 1, 2]);
      expect(session.closedAt).toBeNull();
    });

    it('옵션 1개 / 9개 / 중복 placeId → 400', async () => {
      const post = (options: unknown) =>
        app.inject({
          method: 'POST',
          url: CREATE_URL,
          headers: auth(app, ownerId),
          payload: { title: 't', options },
        });
      expect((await post([optionInput(0)])).statusCode).toBe(400);
      expect((await post(Array.from({ length: 9 }, (_, i) => optionInput(i)))).statusCode).toBe(
        400,
      );
      expect((await post([optionInput(0), optionInput(0)])).statusCode).toBe(400);
    });

    it('무인증 → 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: CREATE_URL,
        payload: { title: 't', options: [optionInput(0), optionInput(1)] },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('공개 조회', () => {
    it('무인증 200 — count 0, totalVoters 0, userId 미노출, isOwner false', async () => {
      const session = await createVote(ownerId);
      const res = await app.inject({ method: 'GET', url: sharedUrl(session.token) });
      expect(res.statusCode).toBe(200);
      const body = res.json() as SharedVoteSessionType & Record<string, unknown>;
      expect(body.options.every((o) => o.count === 0)).toBe(true);
      expect(body.totalVoters).toBe(0);
      expect(body.isOwner).toBe(false);
      expect(body.userId).toBeUndefined();
      // 세션 id 는 공개 응답에 포함(마감 호출용, 무해) — token 만 방장 전용.
      expect(body.id).toBe(session.id);
      expect((body as Record<string, unknown>).token).toBeUndefined();
    });

    it('방장 Bearer 로 조회 → isOwner true, 타인 Bearer → false', async () => {
      const session = await createVote(ownerId);
      const mine = await app.inject({
        method: 'GET',
        url: sharedUrl(session.token),
        headers: auth(app, ownerId),
      });
      expect((mine.json() as SharedVoteSessionType).isOwner).toBe(true);
      const others = await app.inject({
        method: 'GET',
        url: sharedUrl(session.token),
        headers: auth(app, otherId),
      });
      expect((others.json() as SharedVoteSessionType).isOwner).toBe(false);
    });

    it('없는 토큰 404 / 만료 410', async () => {
      expect((await app.inject({ method: 'GET', url: sharedUrl('ghost-token') })).statusCode).toBe(
        404,
      );

      const session = await createVote(ownerId);
      await app.prisma.voteSession.update({
        where: { id: session.id },
        data: { shareExpiresAt: new Date(Date.now() - 1000) },
      });
      expect((await app.inject({ method: 'GET', url: sharedUrl(session.token) })).statusCode).toBe(
        410,
      );
    });
  });

  describe('투표', () => {
    it('첫 투표 — 집계 반영 + 응답이 갱신된 세션 전체', async () => {
      const session = await createVote(ownerId);
      const [o1, o2] = session.options;
      const res = await putBallot(session.token, 'voter-aaaa-0001', '니니', [o1!.id, o2!.id]);
      expect(res.statusCode).toBe(200);
      const body = res.json() as SharedVoteSessionType;
      expect(body.totalVoters).toBe(1);
      expect(body.options.find((o) => o.id === o1!.id)?.count).toBe(1);
      expect(body.options.find((o) => o.id === o1!.id)?.voters).toEqual(['니니']);
      expect(body.options.find((o) => o.id === o2!.id)?.count).toBe(1);
    });

    it('재투표 — 풀 리플레이스(3→1), voterLabel 갱신', async () => {
      const session = await createVote(ownerId);
      const ids = session.options.map((o) => o.id);
      await putBallot(session.token, 'voter-aaaa-0001', '니니', ids);
      const res = await putBallot(session.token, 'voter-aaaa-0001', '니니2', [ids[0]!]);
      const body = res.json() as SharedVoteSessionType;
      expect(body.totalVoters).toBe(1);
      expect(body.options.find((o) => o.id === ids[0])?.count).toBe(1);
      expect(body.options.find((o) => o.id === ids[0])?.voters).toEqual(['니니2']);
      expect(body.options.find((o) => o.id === ids[1])?.count).toBe(0);
    });

    it('빈 배열 — 투표 철회, totalVoters 감소', async () => {
      const session = await createVote(ownerId);
      const ids = session.options.map((o) => o.id);
      await putBallot(session.token, 'voter-aaaa-0001', '니니', [ids[0]!]);
      const res = await putBallot(session.token, 'voter-aaaa-0001', '니니', []);
      expect((res.json() as SharedVoteSessionType).totalVoters).toBe(0);
    });

    it('타 세션 optionId → 400', async () => {
      const a = await createVote(ownerId);
      const b = await createVote(ownerId);
      const res = await putBallot(a.token, 'voter-aaaa-0001', '니니', [b.options[0]!.id]);
      expect(res.statusCode).toBe(400);
    });
  });

  describe('마감', () => {
    it('단독 최다 → decidedBy=votes + winner 일치', async () => {
      const session = await createVote(ownerId);
      const ids = session.options.map((o) => o.id);
      await putBallot(session.token, 'voter-aaaa-0001', 'A', [ids[0]!, ids[1]!]);
      await putBallot(session.token, 'voter-bbbb-0002', 'B', [ids[0]!]);

      const res = await app.inject({
        method: 'POST',
        url: closeUrl(session.id),
        headers: auth(app, ownerId),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as VoteSessionType;
      expect(body.decidedBy).toBe('votes');
      expect(body.winnerOptionId).toBe(ids[0]);
      expect(body.closedAt).not.toBeNull();
    });

    it('동점 + 분석 데이터 없음 → decidedBy=random, winner ∈ 동점 후보', async () => {
      const session = await createVote(ownerId);
      const ids = session.options.map((o) => o.id);
      await putBallot(session.token, 'voter-aaaa-0001', 'A', [ids[0]!]);
      await putBallot(session.token, 'voter-bbbb-0002', 'B', [ids[1]!]);

      const res = await app.inject({
        method: 'POST',
        url: closeUrl(session.id),
        headers: auth(app, ownerId),
      });
      const body = res.json() as VoteSessionType;
      expect(body.decidedBy).toBe('random');
      expect([ids[0], ids[1]]).toContain(body.winnerOptionId);
    });

    it('동점 + smartPick 성공 → decidedBy=smart-pick, 동점 placeIds 만 전달', async () => {
      const session = await createVote(ownerId);
      const ids = session.options.map((o) => o.id);
      await putBallot(session.token, 'voter-aaaa-0001', 'A', [ids[0]!]);
      await putBallot(session.token, 'voter-bbbb-0002', 'B', [ids[1]!]);

      const tiedPlaceIds = [session.options[0]!.placeId, session.options[1]!.placeId];
      const spy = vi.spyOn(RestaurantService.prototype, 'smartPick').mockResolvedValue({
        picked: {
          placeId: tiedPlaceIds[1]!,
          name: '후보1',
          weight: 0.9,
          avgSentimentScore: 0.8,
          avgSatisfactionScore: 4.5,
        },
        candidates: 2,
        strategy: 'balanced',
      });

      const res = await app.inject({
        method: 'POST',
        url: closeUrl(session.id),
        headers: auth(app, ownerId),
      });
      const body = res.json() as VoteSessionType;
      expect(body.decidedBy).toBe('smart-pick');
      expect(body.winnerOptionId).toBe(ids[1]);
      expect(spy).toHaveBeenCalledWith({
        candidatePlaceIds: tiedPlaceIds,
        strategy: 'balanced',
      });
    });

    it('재호출 멱등 — 같은 winner 유지', async () => {
      const session = await createVote(ownerId);
      const first = await app.inject({
        method: 'POST',
        url: closeUrl(session.id),
        headers: auth(app, ownerId),
      });
      const winner = (first.json() as VoteSessionType).winnerOptionId;
      const second = await app.inject({
        method: 'POST',
        url: closeUrl(session.id),
        headers: auth(app, ownerId),
      });
      expect((second.json() as VoteSessionType).winnerOptionId).toBe(winner);
    });

    it('타인 403 / 마감 후 투표 409 / 0표 마감도 winner 존재', async () => {
      const session = await createVote(ownerId);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: closeUrl(session.id),
            headers: auth(app, otherId),
          })
        ).statusCode,
      ).toBe(403);

      const closed = await app.inject({
        method: 'POST',
        url: closeUrl(session.id),
        headers: auth(app, ownerId),
      });
      // 0표 마감 — 전원 동점(0표) → 티브레이크로 winner 확정.
      expect((closed.json() as VoteSessionType).winnerOptionId).not.toBeNull();

      const late = await putBallot(session.token, 'voter-late-0001', '늦음', [
        session.options[0]!.id,
      ]);
      expect(late.statusCode).toBe(409);
    });
  });

  describe('내 목록', () => {
    it('내 것만, 최신순', async () => {
      const a = await createVote(ownerId);
      const b = await createVote(ownerId);
      await createVote(otherId);

      const res = await app.inject({
        method: 'GET',
        url: CREATE_URL,
        headers: auth(app, ownerId),
      });
      expect(res.statusCode).toBe(200);
      const items = (res.json() as { items: Array<{ id: string }> }).items;
      expect(items).toHaveLength(2);
      expect(items.map((i) => i.id)).toEqual([b.id, a.id]);
    });
  });
});
