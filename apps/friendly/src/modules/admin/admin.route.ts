import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AdminUsersResponse,
  Routes,
  SetRoleBody,
  SetRoleParams,
  UserSchema,
} from '@repo/api-contract';
import { AdminService } from './admin.service.js';

const adminRoutes: FastifyPluginAsync = async (app) => {
  const service = new AdminService(app.prisma);
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(Routes.Admin.listUsers, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: AdminUsersResponse },
    },
    handler: async () => ({ users: await service.listUsers() }),
  });

  typed.patch(Routes.Admin.setUserRole(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: SetRoleParams,
      body: SetRoleBody,
      response: { 200: UserSchema },
    },
    handler: async (req) => service.setRole(req.params.id, req.body.role),
  });
};

export default adminRoutes;
