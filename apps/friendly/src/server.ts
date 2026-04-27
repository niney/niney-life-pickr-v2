import { buildApp } from './app.js';
import { env } from './config/env.js';

const start = async (): Promise<void> => {
  try {
    const app = await buildApp();
    await app.listen({ port: env.PORT, host: env.HOST });

    const shutdown = async (signal: string): Promise<void> => {
      app.log.info(`Received ${signal}, shutting down...`);
      await app.close();
      process.exit(0);
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

void start();
