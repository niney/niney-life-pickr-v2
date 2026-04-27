import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';

export default fp(
  async (app) => {
    const prisma = new PrismaClient({
      log: app.log.level === 'debug' ? ['warn', 'error'] : ['error'],
    });

    await prisma.$connect();
    app.decorate('prisma', prisma);

    app.addHook('onClose', async (instance) => {
      await instance.prisma.$disconnect();
    });
  },
  { name: 'prisma' },
);
