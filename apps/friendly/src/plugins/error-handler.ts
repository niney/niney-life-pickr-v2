import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { isDev } from '../config/env.js';

export default fp(async (app) => {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        details: error.flatten().fieldErrors,
      });
    }

    if (error.validation) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: error.message,
      });
    }

    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.name,
        message: error.message,
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: isDev ? error.message : 'Something went wrong',
    });
  });
});
