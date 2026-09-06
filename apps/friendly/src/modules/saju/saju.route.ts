import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { LRUCache } from 'lru-cache';
import {
  CreateSajuPairInput,
  SajuPairChart,
  SajuPairResult,
  SajuProfileInput,
  UpdateSajuProfileInput,
  SajuProfile,
  SajuProfileList,
  CreateSajuReadingInput,
  CreateSajuShareInput,
  ListSajuReadingsQuery,
  ListSajuReadingsResult,
  PublicSajuShare,
  RevokeSajuShareInput,
  Routes,
  SAJU_GUEST_KEY_HEADER,
  SajuChart,
  SajuReadingResult,
  SajuReceiptInput,
  SajuShareResult,
} from '@repo/api-contract';
import { RATE, clientKey } from '../../plugins/rate-limit.js';
import { AiConfigService } from '../ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../ai/llm-provider-env.js';
import { calculateSaju, SajuInputError } from './saju.engine.js';
import { SajuNotFound, SajuService } from './saju.service.js';
import { renderSajuSharePng } from './saju-share-card.js';
import { calculateSajuPair } from './saju-pair.engine.js';
import { SajuPairService } from './saju-pair.service.js';
import { SajuProfileService, SajuProfileConflict } from './saju-profile.service.js';

const sajuRoutes: FastifyPluginAsync = async (app) => {
  const api = app.withTypeProvider<ZodTypeProvider>();
  const service = new SajuService(
    app.prisma,
    new AiConfigService(app.prisma, buildLlmProviderEnv()),
    { quota: app.usageQuota },
  );
  const images = new LRUCache<string, Buffer>({ max: 50 });
  const profiles = new SajuProfileService(app.prisma);
  const pairs = new SajuPairService(new AiConfigService(app.prisma, buildLlmProviderEnv()), {
    quota: app.usageQuota,
  });
  const actorOf = async (req: FastifyRequest) => {
    const user = await app.resolveOptionalUser(req);
    const key = req.headers[SAJU_GUEST_KEY_HEADER];
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
      if (error instanceof SajuInputError) throw app.httpErrors.badRequest(error.message);
      if (error instanceof SajuNotFound) throw app.httpErrors.notFound(error.message);
      if (error instanceof SajuProfileConflict) throw app.httpErrors.conflict(error.message);
      throw error;
    }
  };
  const T = Routes.Saju;
  const ids = z.object({ id: z.string().min(1).max(64) });
  const tokens = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{32}$/) });
  api.get(T.profiles, {
    onRequest: [app.authenticate],
    schema: { tags: ['saju'], response: { 200: SajuProfileList } },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return profiles.list(req.user.userId);
    },
  });
  api.post(T.profiles, {
    onRequest: [app.authenticate],
    schema: { tags: ['saju'], body: SajuProfileInput, response: { 200: SajuProfile } },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return run(() => profiles.save(req.user.userId, req.body));
    },
  });
  api.put(T.profile(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['saju'],
      params: ids,
      body: UpdateSajuProfileInput,
      response: { 200: SajuProfile },
    },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return run(() => profiles.save(req.user.userId, req.body, req.params.id, req.body.revision));
    },
  });
  api.delete(T.profile(':id'), {
    onRequest: [app.authenticate],
    schema: { tags: ['saju'], params: ids },
    handler: async (req, reply) => {
      await run(() => profiles.remove(req.user.userId, req.params.id));
      return reply.code(204).send();
    },
  });
  api.post(T.pairChart, {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: { tags: ['saju'], body: CreateSajuPairInput, response: { 200: SajuPairChart } },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return run(() => calculateSajuPair(req.body));
    },
  });
  api.post(T.pairReading, {
    config: {
      rateLimit: {
        max: async () => (await app.usageQuota.getSetting('saju-reading')).ipPerMinute,
        timeWindow: '1 minute',
      },
    },
    schema: { tags: ['saju'], body: CreateSajuPairInput, response: { 200: SajuPairResult } },
    handler: async (req, reply) => {
      reply.header('cache-control', 'no-store');
      const actor = await actorOf(req);
      return run(() => pairs.create(req.body, actor));
    },
  });
  api.post(T.chart, {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: { tags: ['saju'], body: CreateSajuReadingInput, response: { 200: SajuChart } },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return run(() => calculateSaju(req.body));
    },
  });
  api.post(T.readings, {
    config: {
      rateLimit: {
        max: async () => (await app.usageQuota.getSetting('saju-reading')).ipPerMinute,
        timeWindow: '1 minute',
      },
    },
    schema: { tags: ['saju'], body: CreateSajuReadingInput, response: { 200: SajuReadingResult } },
    handler: async (req, reply) => {
      reply.header('cache-control', 'no-store');
      const actor = await actorOf(req);
      return run(() => service.createReading(req.body, actor));
    },
  });
  api.post(T.myReadings, {
    onRequest: [app.authenticate],
    schema: { tags: ['saju'], body: SajuReceiptInput, response: { 200: SajuReadingResult } },
    handler: async (req) => {
      const actor = await actorOf(req);
      return run(() => service.save(req.body.receipt, actor));
    },
  });
  api.get(T.myReadings, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['saju'],
      querystring: ListSajuReadingsQuery,
      response: { 200: ListSajuReadingsResult },
    },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return run(() => service.listMine(req.user.userId, req.query.limit, req.query.cursor));
    },
  });
  api.get(T.myReading(':id'), {
    onRequest: [app.authenticate],
    schema: { tags: ['saju'], params: ids, response: { 200: SajuReadingResult } },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return run(() => service.getMine(req.user.userId, req.params.id));
    },
  });
  api.delete(T.myReading(':id'), {
    onRequest: [app.authenticate],
    schema: { tags: ['saju'], params: ids },
    handler: async (req, reply) => {
      await run(() => service.deleteMine(req.user.userId, req.params.id));
      return reply.code(204).send();
    },
  });
  api.post(T.shares, {
    config: { rateLimit: RATE.tarotShare },
    schema: { tags: ['saju'], body: CreateSajuShareInput, response: { 200: SajuShareResult } },
    handler: async (req, reply) => {
      reply.header('cache-control', 'no-store');
      const actor = await actorOf(req);
      return run(() => service.createShare(req.body, actor));
    },
  });
  api.get(T.shared(':token'), {
    config: { rateLimit: RATE.publicShare },
    schema: { tags: ['saju'], params: tokens, response: { 200: PublicSajuShare } },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return run(() => service.getShared(req.params.token));
    },
  });
  api.delete(T.shared(':token'), {
    config: { rateLimit: RATE.tarotShare },
    schema: { tags: ['saju'], params: tokens, body: RevokeSajuShareInput },
    handler: async (req, reply) => {
      await run(() => service.revokeShare(req.params.token, req.body.revokeToken));
      images.delete(req.params.token);
      return reply.code(204).send();
    },
  });
  api.get(T.shareImage(':token'), {
    config: { rateLimit: RATE.publicShare },
    schema: { tags: ['saju'], params: tokens },
    handler: async (req, reply) => {
      const shared = await run(() => service.getShared(req.params.token)); // 캐시보다 먼저 삭제 여부 확인
      let png = images.get(req.params.token);
      if (!png) {
        png = await renderSajuSharePng(shared);
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
export default sajuRoutes;
