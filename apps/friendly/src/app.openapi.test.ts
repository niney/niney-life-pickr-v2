import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

// 스펙 생성기 — 모든 환경에서 app.swagger() 가 되고(/docs UI 는 dev 만), transform 이 인증 수준(x-auth)·
// 레이트리밋(x-rate-limit)·bearer security 를 싣는다. scripts/export-openapi.ts 가 이 필드로 어드민을 뺀다.

type Op = { security?: unknown[]; 'x-auth'?: string; 'x-rate-limit'?: { max: unknown; timeWindow: string } };

describe('OpenAPI 스펙 주석', () => {
  let app: FastifyInstance;
  let paths: Record<string, Record<string, Op>>;
  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
    paths = (app.swagger() as unknown as { paths: typeof paths }).paths;
  });
  afterAll(async () => {
    await app.close();
  });

  it('/docs 는 비-dev 에서 미등록', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs' });
    expect(res.statusCode).toBe(404);
  });

  it('공개 라우트 — x-auth public, 라우트 프리셋 한도', () => {
    const op = paths['/api/v1/weather/forecast']?.get;
    expect(op?.['x-auth']).toBe('public');
    expect(op?.['x-rate-limit']).toEqual({ max: 60, timeWindow: '1 minute' });
    expect(op?.security).toBeUndefined();
  });

  it('선택 인증(OPTIONAL_BEARER) — x-auth optional, security 에 빈 요구 포함 · 런타임 설정 한도는 dynamic', () => {
    const op = paths['/api/v1/tarot/readings']?.post;
    expect(op?.['x-auth']).toBe('optional');
    expect(op?.security).toEqual([{}, { bearerAuth: [] }]);
    expect(op?.['x-rate-limit']?.max).toBe('dynamic');
    expect(paths['/api/v1/share/votes/{token}']?.get?.['x-auth']).toBe('optional');
  });

  it('로그인 라우트 — route 훅이든 플러그인 단위 훅(picks)이든 user + bearer', () => {
    const airLocation = paths['/api/v1/air/location']?.get;
    expect(airLocation?.['x-auth']).toBe('user');
    expect(airLocation?.security).toEqual([{ bearerAuth: [] }]);
    expect(paths['/api/v1/picks']?.get?.['x-auth']).toBe('user');
  });

  it('어드민 — requireAdmin 훅과 핸들러 내 검증(SSE) 모두 admin', () => {
    const all = Object.entries(paths).filter(([url]) => url.startsWith('/api/v1/admin'));
    expect(all.length).toBeGreaterThan(0);
    for (const [, ops] of all) for (const op of Object.values(ops)) expect(op['x-auth']).toBe('admin');
  });
});
