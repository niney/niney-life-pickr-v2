import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// env 는 import 시점에 파싱된다 — 로컬 .env 의 CORS_ORIGIN(dev 용 목록)이 아니라 운영 기본값('*')으로 검증.
vi.hoisted(() => {
  process.env.CORS_ORIGIN = '*';
  process.env.PUBLIC_ORIGIN = 'https://ninelife.kr';
});

const { buildApp } = await import('./app.js');
const { buildCorsPolicy, isAdminPath } = await import('./plugins/cors.js');

// CORS — ① 어드민 경로 판정(쿼리·퍼센트 인코딩) ② 정책(dev/'*'/목록) ③ 실제 응답 헤더(비-dev 경로):
// 어드민 외는 모든 origin, 어드민은 PUBLIC_ORIGIN 만, credentials 없음, 레이트리밋 헤더 노출.

describe('isAdminPath', () => {
  it('어드민 prefix 만 — 쿼리·퍼센트 인코딩 무관, 비슷한 이름은 제외', () => {
    expect(isAdminPath('/api/v1/admin')).toBe(true);
    expect(isAdminPath('/api/v1/admin/users?page=1')).toBe(true);
    expect(isAdminPath('/api/v1/%61dmin/users')).toBe(true);
    expect(isAdminPath('/api/v1/administrator')).toBe(false);
    expect(isAdminPath('/api/v1/weather/forecast?admin=1')).toBe(false);
    expect(isAdminPath('/api/v1/%E0%A4%A')).toBe(false);
  });
});

describe('buildCorsPolicy', () => {
  const publicOrigin = 'https://ninelife.kr/';
  it("'*' — 어드민 외 전부 허용, 어드민은 PUBLIC_ORIGIN(끝 슬래시 제거)", () => {
    const p = buildCorsPolicy({ dev: false, corsOrigin: '*', publicOrigin });
    expect(p.open.origin).toBe('*');
    expect(p.admin.origin).toEqual(['https://ninelife.kr']);
    expect(p.open.credentials).toBe(false);
  });
  it('목록 — prod 에선 그 목록으로 좁힌다(빈 값은 전부 허용)', () => {
    expect(buildCorsPolicy({ dev: false, corsOrigin: 'https://a.com, https://b.com', publicOrigin }).open.origin).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
    expect(buildCorsPolicy({ dev: false, corsOrigin: ' ', publicOrigin }).open.origin).toBe('*');
  });
  it('dev — 목록 무시하고 전부 허용, 어드민은 반사', () => {
    const p = buildCorsPolicy({ dev: true, corsOrigin: 'https://a.com', publicOrigin });
    expect(p.open.origin).toBe('*');
    expect(p.admin.origin).toBe(true);
  });
});

describe('CORS 응답 헤더', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  const preflight = (url: string, origin: string) =>
    app.inject({
      method: 'OPTIONS',
      url,
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type,x-guest-key',
      },
    });

  it('공개 API preflight — 외부 origin 에 *, 요청 헤더 반사, credentials 없음', async () => {
    const res = await preflight('/api/v1/tarot/readings', 'https://other.example');
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-headers']).toBe('authorization,content-type,x-guest-key');
    expect(res.headers['access-control-max-age']).toBe('600');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('실제 응답 — * + 레이트리밋 헤더 노출', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health', headers: { origin: 'https://other.example' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(String(res.headers['access-control-expose-headers'])).toContain('x-ratelimit-remaining');
  });

  it('어드민 — 외부 origin 은 허용 헤더 없음(인코딩 우회 포함), PUBLIC_ORIGIN 은 허용', async () => {
    const foreign = await preflight('/api/v1/admin/ai/config', 'https://other.example');
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
    const encoded = await preflight('/api/v1/%61dmin/ai/config', 'https://other.example');
    expect(encoded.headers['access-control-allow-origin']).toBeUndefined();
    const own = await preflight('/api/v1/admin/ai/config', 'https://ninelife.kr');
    expect(own.headers['access-control-allow-origin']).toBe('https://ninelife.kr');
  });
});
