import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import errorHandler from './plugins/error-handler.js';

// 공통 에러 본문 { statusCode, error, message } — 외부 사용 가이드(docs/api/README.md)의 계약.
// 레이트리밋 429 는 Error 가 아닌 평객체로 던져져 error 가 빠지던 회귀를 막는다.

describe('error-handler 본문', () => {
  const build = async (thrown: unknown) => {
    const app = Fastify({ logger: false });
    await app.register(errorHandler);
    app.get('/x', async () => {
      throw thrown;
    });
    return app;
  };

  it('레이트리밋 평객체 — error 문자열 유지', async () => {
    const app = await build({ statusCode: 429, error: 'Too Many Requests', message: '요청이 너무 많습니다. 60초 후 다시 시도해 주세요.' });
    const res = await app.inject({ method: 'GET', url: '/x' });
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      message: '요청이 너무 많습니다. 60초 후 다시 시도해 주세요.',
    });
  });

  it('Error 계열 4xx — error 는 예외 이름', async () => {
    const app = await build(Object.assign(new Error('없음'), { statusCode: 404, name: 'NotFoundError' }));
    const res = await app.inject({ method: 'GET', url: '/x' });
    expect(res.json()).toEqual({ statusCode: 404, error: 'NotFoundError', message: '없음' });
  });
});
