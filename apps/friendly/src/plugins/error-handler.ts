import fp from 'fastify-plugin';
import type { FastifyError } from 'fastify';
import { ZodError } from 'zod';
import { isDev } from '../config/env.js';

export default fp(async (app) => {
  app.setErrorHandler((error: FastifyError, _request, reply) => {
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
      // 레이트리밋(errorResponseBuilder)은 Error 가 아닌 { statusCode, error, message } 평객체를 던져
      // name 이 없다 — 그 경우 객체의 error 문자열을 쓴다(없으면 429 본문에서 error 가 빠졌다).
      const label = (error as { error?: unknown }).error;
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.name ?? (typeof label === 'string' ? label : 'Error'),
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
