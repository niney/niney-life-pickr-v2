import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateVoteInput,
  MyVotesResult,
  Routes,
  SharedVoteSession,
  SubmitBallotInput,
  VoteSession,
} from '@repo/api-contract';
import { VoteError, VoteService } from './vote.service.js';
import { RATE } from '../../plugins/rate-limit.js';

const V = Routes.Vote;

const IdParams = z.object({ id: z.string().min(1) });
// 정산 공유와 동일 — 7바이트 base64url = 10자, 길이 밖 입력은 zod 단계에서 컷.
const TokenParams = z.object({ token: z.string().min(8).max(64) });

const throwAsHttp = (app: FastifyInstance, e: VoteError): never => {
  switch (e.code) {
    case 'not_found':
      throw app.httpErrors.notFound(e.message);
    case 'forbidden':
      throw app.httpErrors.forbidden(e.message);
    case 'expired':
      // 410 Gone — 링크 자체는 유효했으나 만료됨. FE 가 404(잘못된 주소)와 구분.
      throw app.httpErrors.gone(e.message);
    case 'closed':
      // 409 — 마감 클레임 이후 도착한 투표. FE 가 최신 상태 재조회로 전환.
      throw app.httpErrors.conflict(e.message);
    case 'invalid_option':
    default:
      throw app.httpErrors.badRequest(e.message);
  }
};

// 공개 라우트의 옵셔널 인증 — Authorization 이 있고 유효하면 userId, 아니면 null.
// isOwner 표시 플래그 용도(접근 제어 아님 — 마감 라우트는 별도 authenticate).
const optionalUserId = async (req: FastifyRequest): Promise<string | null> => {
  try {
    await req.jwtVerify();
    return req.user.userId;
  } catch {
    return null;
  }
};

// 그룹 투표 픽 — 생성/목록/마감은 방장(인증), 조회/투표는 토큰 공개(무인증).
// picks 모듈식 전역 authenticate 훅은 쓰지 않는다(공개 라우트 공존).
const voteRoutes: FastifyPluginAsync = async (app) => {
  const service = new VoteService(app.prisma);
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(V.create, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['vote'],
      security: [{ bearerAuth: [] }],
      body: CreateVoteInput,
      response: { 200: VoteSession },
    },
    handler: async (req) => {
      try {
        return await service.create(req.user.userId, req.body);
      } catch (e) {
        if (e instanceof VoteError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });

  typed.get(V.list, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['vote'],
      security: [{ bearerAuth: [] }],
      response: { 200: MyVotesResult },
    },
    handler: async (req) => service.listMine(req.user.userId),
  });

  // 마감 — 원자 클레임 + 티브레이크(동점 → smart-pick → 균등 랜덤). 멱등.
  typed.post(V.close(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['vote'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
      response: { 200: VoteSession },
    },
    handler: async (req) => {
      try {
        return await service.close(req.user.userId, req.params.id);
      } catch (e) {
        if (e instanceof VoteError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });

  // 공개 조회 — 토큰을 안다 = 접근 허용. 만료 410 / 없음 404. isOwner 는
  // 옵셔널 인증으로 판정(마감 버튼 노출용).
  typed.get(V.shared(':token'), {
    config: { rateLimit: RATE.publicShare },
    schema: {
      tags: ['vote'],
      params: TokenParams,
      response: { 200: SharedVoteSession },
    },
    handler: async (req) => {
      const viewer = await optionalUserId(req);
      try {
        return await service.getSharedByToken(req.params.token, viewer);
      } catch (e) {
        if (e instanceof VoteError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });

  // 투표 제출 — 무인증 쓰기(publicAsk 관례: rate-limit + 바운드 zod 가 방어).
  // voterKey 의 찬성 집합 풀 리플레이스, 응답은 갱신된 세션 전체(캐시 통째 교체).
  typed.put(V.sharedBallot(':token'), {
    config: { rateLimit: RATE.publicVote },
    schema: {
      tags: ['vote'],
      params: TokenParams,
      body: SubmitBallotInput,
      response: { 200: SharedVoteSession },
    },
    handler: async (req) => {
      const viewer = await optionalUserId(req);
      try {
        return await service.submitBallot(req.params.token, req.body, viewer);
      } catch (e) {
        if (e instanceof VoteError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });
};

export default voteRoutes;
