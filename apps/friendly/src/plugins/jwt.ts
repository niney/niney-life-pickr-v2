import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import { env } from '../config/env.js';

export default fp(async (app) => {
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  app.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.unauthorized('Invalid or missing token');
    }
  });
});
