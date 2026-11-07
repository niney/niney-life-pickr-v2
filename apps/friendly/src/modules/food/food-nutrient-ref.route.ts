import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  FoodAdminNutrientRefCandidatesQuery,
  FoodAdminNutrientRefCandidatesResult,
  FoodAdminNutrientRefClearQuery,
  FoodAdminNutrientRefLinkInput,
  FoodAdminNutrientRefLinkResult,
  FoodAdminNutrientRefSetInput,
  FoodAdminNutrientRefsResult,
  Routes,
} from '@repo/api-contract';
import { FoodNutrientRefError } from './food-nutrient-ref.service.js';

// 어드민 > 음식 카탈로그 "영양 기준 음식" — 비타민·무기질이 없는 음식 이름을 어느 표준 음식의 영양 구성으로 계산하는지
// 보고 바로잡는다(docs/PLAN-meal-nutrition.md A). 서비스는 영양소 점검·식단 저장과 같은 인스턴스(plugins/meal).

const LIST_LIMIT = 200;
const ErrorBody = z.object({ message: z.string() });

const foodNutrientRefRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const admin = { onRequest: [app.authenticate, app.requireAdmin] };
  const base = { tags: ['admin'], security: [{ bearerAuth: [] }] };

  typed.get(Routes.Food.adminNutrientRefs, {
    ...admin,
    schema: { ...base, response: { 200: FoodAdminNutrientRefsResult } },
    handler: async () => app.foodNutrientRefs.list(LIST_LIMIT),
  });

  typed.put(Routes.Food.adminNutrientRefs, {
    ...admin,
    schema: { ...base, body: FoodAdminNutrientRefSetInput, response: { 204: z.null(), 400: ErrorBody, 404: ErrorBody } },
    handler: async (req, reply) => {
      try {
        await app.foodNutrientRefs.setAdmin(req.body.name, req.body.refFoodId);
      } catch (e) {
        if (e instanceof FoodNutrientRefError) {
          return reply.code(e.code === 'not_found' ? 404 : 400).send({ message: e.message });
        }
        throw e;
      }
      return reply.code(204).send(null);
    },
  });

  typed.delete(Routes.Food.adminNutrientRefs, {
    ...admin,
    schema: { ...base, querystring: FoodAdminNutrientRefClearQuery, response: { 204: z.null() } },
    handler: async (req, reply) => {
      await app.foodNutrientRefs.clear(req.query.name);
      return reply.code(204).send(null);
    },
  });

  typed.post(Routes.Food.adminNutrientRefsLink, {
    ...admin,
    schema: { ...base, body: FoodAdminNutrientRefLinkInput, response: { 200: FoodAdminNutrientRefLinkResult } },
    handler: async (req) => ({ scheduled: await app.foodNutrientRefs.relink(req.body.names) }),
  });

  typed.get(Routes.Food.adminNutrientRefCandidates, {
    ...admin,
    schema: { ...base, querystring: FoodAdminNutrientRefCandidatesQuery, response: { 200: FoodAdminNutrientRefCandidatesResult } },
    handler: async (req) => ({ items: await app.foodNutrientRefs.candidates(req.query.q) }),
  });
};

export default foodNutrientRefRoutes;
