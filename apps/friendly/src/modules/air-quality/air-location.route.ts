import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AirLocationResult, AirLocationUpsertBody, Routes } from '@repo/api-contract';
import { AirLocationService } from './air-location.service.js';

// /air/location — 로그인 사용자의 '내 대기 위치' 서버 저장분. 인증 필수(다른 대기
// 라우트는 공개지만 이것만 소유자 스코프). 게스트는 클라이언트 persist 를 쓰고 로그인
// 직후 서버가 비어 있으면 클라이언트가 PUT 으로 올린다(별도 sync 라우트 없음 — 값이
// 1개라 union 병합이 필요 없다). autoload 가 `*.route.ts` 를 자동 등록한다.

const airLocationRoutes: FastifyPluginAsync = async (app) => {
  const service = new AirLocationService(app.prisma);
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(Routes.AirQuality.location, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['air-location'],
      security: [{ bearerAuth: [] }],
      response: { 200: AirLocationResult },
    },
    handler: async (req) => service.get(req.user.userId),
  });

  typed.put(Routes.AirQuality.location, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['air-location'],
      security: [{ bearerAuth: [] }],
      body: AirLocationUpsertBody,
      response: { 200: AirLocationResult },
    },
    handler: async (req) => service.upsert(req.user.userId, req.body),
  });

  typed.delete(Routes.AirQuality.location, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['air-location'],
      security: [{ bearerAuth: [] }],
      response: { 200: AirLocationResult },
    },
    handler: async (req) => service.remove(req.user.userId),
  });
};

export default airLocationRoutes;
