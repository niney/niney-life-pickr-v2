import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ListContactsQuery,
  ListContactsResult,
  Routes,
  SettlementContact,
  UpdateContactInput,
} from '@repo/api-contract';
import { ContactError, ContactService } from './contact.service.js';

const C = Routes.SettlementContact;
const IdParams = z.object({ id: z.string().min(1) });

const throwAsHttp = (app: FastifyInstance, e: ContactError): never => {
  switch (e.code) {
    case 'not_found':
      throw app.httpErrors.notFound(e.message);
    case 'forbidden':
      throw app.httpErrors.forbidden(e.message);
    case 'conflict':
      throw app.httpErrors.conflict(e.message);
    case 'invalid_input':
    default:
      throw app.httpErrors.badRequest(e.message);
  }
};

// /me/contacts — 본인 단골만 조회/수정/삭제. 인증 필수.
const contactRoutes: FastifyPluginAsync = async (app) => {
  const service = new ContactService(app.prisma);
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(C.list, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['settlement-contact'],
      security: [{ bearerAuth: [] }],
      querystring: ListContactsQuery,
      response: { 200: ListContactsResult },
    },
    handler: async (req) => service.list(req.user.userId, req.query),
  });

  typed.patch(C.one(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['settlement-contact'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
      body: UpdateContactInput,
      response: { 200: SettlementContact },
    },
    handler: async (req) => {
      try {
        return await service.update(req.user.userId, req.params.id, req.body);
      } catch (e) {
        if (e instanceof ContactError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });

  typed.delete(C.one(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['settlement-contact'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
    },
    handler: async (req, reply) => {
      try {
        await service.delete(req.user.userId, req.params.id);
        return reply.code(204).send();
      } catch (e) {
        if (e instanceof ContactError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });
};

export default contactRoutes;
