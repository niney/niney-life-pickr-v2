import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import { env } from '../config/env.js';

export default fp(async (app) => {
  const origins = env.CORS_ORIGIN === '*'
    ? true
    : env.CORS_ORIGIN.split(',').map((o) => o.trim());

  await app.register(cors, { origin: origins, credentials: true });
});
