import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { LRUCache } from 'lru-cache';
import {
  CreateSajuGPairInput,
  SajuGPairChart,
  SajuGPairResult,
  SajuGProfileInput,
  UpdateSajuGProfileInput,
  SajuGProfile,
  SajuGProfileList,
  CreateSajuGReadingInput,
  CreateSajuGShareInput,
  ListSajuGReadingsQuery,
  ListSajuGReadingsResult,
  PublicSajuGShare,
  RevokeSajuGShareInput,
  Routes,
  SAJU_G_GUEST_KEY_HEADER,
  SajuGChart,
  SajuGReadingResult,
  SajuGReceiptInput,
  SajuGShareResult,
  SajuGShareToken,
  SajuGShareError,
} from '@repo/api-contract';
import { RATE, clientKey } from '../../plugins/rate-limit.js';
import { AiConfigService } from '../ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../ai/llm-provider-env.js';
import { calculateSajuG, SajuGInputError } from './saju-g.engine.js';
import { SajuGNotFound, SajuGService, SajuGShareUnavailable } from './saju-g.service.js';
import { renderSajuGSharePng } from './saju-g-share-card.js';
import { calculateSajuGPair } from './saju-g-pair.engine.js';
import { SajuGPairService } from './saju-g-pair.service.js';
import { SajuGProfileService, SajuGProfileConflict } from './saju-g-profile.service.js';

const sajuGRoutes: FastifyPluginAsync = async (app) => {
  const api = app.withTypeProvider<ZodTypeProvider>();
  const service = new SajuGService(
    app.prisma,
    new AiConfigService(app.prisma, buildLlmProviderEnv()),
    { quota: app.usageQuota },
  );
  const images = new LRUCache<string, Buffer>({ max: 50 });
  const profiles = new SajuGProfileService(app.prisma);
  const pairs = new SajuGPairService(new AiConfigService(app.prisma, buildLlmProviderEnv()), {
    quota: app.usageQuota,
  });
  const actorOf = async (req: FastifyRequest) => {
    const user = await app.resolveOptionalUser(req);
    const key = req.headers[SAJU_G_GUEST_KEY_HEADER];
    return {
      userId: user?.userId ?? null,
      guestKey: typeof key === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(key) ? key : null,
      ip: clientKey(req),
    };
  };
  const run = async <T>(action: () => Promise<T> | T): Promise<T> => {
    try {
      return await action();
    } catch (error) {
      if (error instanceof SajuGInputError) throw app.httpErrors.badRequest(error.message);
      if (error instanceof SajuGNotFound) throw app.httpErrors.notFound(error.message);
      if (error instanceof SajuGProfileConflict) throw app.httpErrors.conflict(error.message);
      throw error;
    }
  };
  const T = Routes.SajuG;
  const ids = z.object({ id: z.string().min(1).max(64) });
  const tokens = z.object({ token: SajuGShareToken });
  api.get(T.profiles, {
    onRequest: [app.authenticate],
    schema: { tags: ['saju-g'], response: { 200: SajuGProfileList } },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return profiles.list(req.user.userId);
    },
  });
  api.post(T.profiles, {
    onRequest: [app.authenticate],
    schema: { tags: ['saju-g'], body: SajuGProfileInput, response: { 200: SajuGProfile } },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return run(() => profiles.save(req.user.userId, req.body));
    },
  });
  api.put(T.profile(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['saju-g'],
      params: ids,
      body: UpdateSajuGProfileInput,
      response: { 200: SajuGProfile },
    },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return run(() => profiles.save(req.user.userId, req.body, req.params.id, req.body.revision));
    },
  });
  api.delete(T.profile(':id'), {
    onRequest: [app.authenticate],
    schema: { tags: ['saju-g'], params: ids },
    handler: async (req, reply) => {
      await run(() => profiles.remove(req.user.userId, req.params.id));
      return reply.code(204).send();
    },
  });
  api.post(T.pairChart, {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: { tags: ['saju-g'], body: CreateSajuGPairInput, response: { 200: SajuGPairChart } },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return run(() => calculateSajuGPair(req.body));
    },
  });
  api.post(T.pairReading, {
    config: {
      rateLimit: {
        max: async () => (await app.usageQuota.getSetting('saju-g-reading')).ipPerMinute,
        timeWindow: '1 minute',
      },
    },
    schema: { tags: ['saju-g'], body: CreateSajuGPairInput, response: { 200: SajuGPairResult } },
    handler: async (req, reply) => {
      reply.header('cache-control', 'no-store');
      const actor = await actorOf(req);
      return run(() => pairs.create(req.body, actor));
    },
  });
  api.post(T.chart, {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: { tags: ['saju-g'], body: CreateSajuGReadingInput, response: { 200: SajuGChart } },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return run(() => calculateSajuG(req.body));
    },
  });
  api.post(T.readings, {
    config: {
      rateLimit: {
        max: async () => (await app.usageQuota.getSetting('saju-g-reading')).ipPerMinute,
        timeWindow: '1 minute',
      },
    },
    schema: {
      tags: ['saju-g'],
      body: CreateSajuGReadingInput,
      response: { 200: SajuGReadingResult },
    },
    handler: async (req, reply) => {
      reply.header('cache-control', 'no-store');
      const actor = await actorOf(req);
      return run(() => service.createReading(req.body, actor));
    },
  });
  api.post(T.myReadings, {
    onRequest: [app.authenticate],
    schema: { tags: ['saju-g'], body: SajuGReceiptInput, response: { 200: SajuGReadingResult } },
    handler: async (req) => {
      const actor = await actorOf(req);
      return run(() => service.save(req.body.receipt, actor));
    },
  });
  api.get(T.myReadings, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['saju-g'],
      querystring: ListSajuGReadingsQuery,
      response: { 200: ListSajuGReadingsResult },
    },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return run(() => service.listMine(req.user.userId, req.query.limit, req.query.cursor));
    },
  });
  api.get(T.myReading(':id'), {
    onRequest: [app.authenticate],
    schema: { tags: ['saju-g'], params: ids, response: { 200: SajuGReadingResult } },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return run(() => service.getMine(req.user.userId, req.params.id));
    },
  });
  api.delete(T.myReading(':id'), {
    onRequest: [app.authenticate],
    schema: { tags: ['saju-g'], params: ids },
    handler: async (req, reply) => {
      await run(() => service.deleteMine(req.user.userId, req.params.id));
      return reply.code(204).send();
    },
  });
  api.post(T.shares, {
    config: { rateLimit: RATE.tarotShare },
    schema: {
      tags: ['saju-g'],
      body: CreateSajuGShareInput,
      response: { 200: SajuGShareResult, 503: SajuGShareError },
    },
    handler: async (req, reply) => {
      reply.header('cache-control', 'no-store');
      const actor = await actorOf(req);
      try {
        return await run(() => service.createShare(req.body, actor));
      } catch (error) {
        if (error instanceof SajuGShareUnavailable) {
          return reply
            .code(503)
            .send({ statusCode: 503, error: 'Service Unavailable', message: error.message });
        }
        throw error;
      }
    },
  });
  api.get(T.shared(':token'), {
    config: { rateLimit: RATE.publicShare },
    schema: { tags: ['saju-g'], params: tokens, response: { 200: PublicSajuGShare } },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return run(() => service.getShared(req.params.token));
    },
  });
  api.delete(T.shared(':token'), {
    config: { rateLimit: RATE.tarotShare },
    schema: { tags: ['saju-g'], params: tokens, body: RevokeSajuGShareInput },
    handler: async (req, reply) => {
      await run(() => service.revokeShare(req.params.token, req.body.revokeToken));
      images.delete(req.params.token);
      return reply.code(204).send();
    },
  });
  api.get(T.shareImage(':token'), {
    config: { rateLimit: RATE.publicShare },
    schema: { tags: ['saju-g'], params: tokens },
    handler: async (req, reply) => {
      const shared = await run(() => service.getShared(req.params.token)); // 캐시보다 먼저 삭제 여부 확인
      let png = images.get(req.params.token);
      if (!png) {
        png = await renderSajuGSharePng(shared);
        images.set(req.params.token, png);
      }
      return reply
        .type('image/png')
        .header('cache-control', 'no-store')
        .header('cross-origin-resource-policy', 'cross-origin')
        .send(png);
    },
  });
};
export default sajuGRoutes;
