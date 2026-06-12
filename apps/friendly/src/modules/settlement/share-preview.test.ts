import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildApp } from '../../app.js';
import { env } from '../../config/env.js';

// 빌드된 dist/index.html 대신 소스 템플릿을 가리켜(구조 동일: <title>, </head>,
// #root) OG 주입 로직만 검증한다. 없는 토큰 경로라 DB 시드/인증이 불필요 —
// getBySharedToken 이 not_found 로 던지면 일반 OG 로 폴백하는지까지 확인한다.
const WEB_INDEX = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../web/index.html',
);

describe('share-preview (OG)', () => {
  let app: FastifyInstance;

  beforeAll(() => {
    env.WEB_INDEX_PATH = WEB_INDEX;
  });

  beforeEach(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('정식 경로(/share/settlements/:token) — 없는 토큰은 200 + 일반 OG 폴백', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/share/settlements/nonexistent-token',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<title>Life Pickr 정산</title>');
    expect(res.body).toContain('property="og:title" content="Life Pickr 정산"');
    expect(res.body).toContain('property="og:image"');
    // SPA 구조는 유지되어야 한다.
    expect(res.body).toContain('id="root"');
    expect(res.body).toContain('/src/main.tsx');
  });

  it('별칭 경로(/s/:token) 도 동일하게 OG 를 주입한다', async () => {
    const res = await app.inject({ method: 'GET', url: '/s/nonexistent-token' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('property="og:title" content="Life Pickr 정산"');
    expect(res.body).toContain('id="root"');
  });

  it('og:url 은 PUBLIC_ORIGIN 기준으로 고정 — 요청 Host 변형에 흔들리지 않음', async () => {
    // 2212fac 부터 SEO 표면은 PUBLIC_ORIGIN(기본 운영 도메인)으로 고정 —
    // Cloudflare/nginx 의 Host 변형이 og:url 에 새지 않아야 한다.
    const res = await app.inject({
      method: 'GET',
      url: '/s/nonexistent-token',
      headers: { host: 'attacker.example', 'x-forwarded-proto': 'http' },
    });
    expect(res.body).toContain(
      `property="og:url" content="${env.PUBLIC_ORIGIN}/s/nonexistent-token"`,
    );
  });

  it('PUBLIC_ORIGIN 이 비어 있으면 요청 host + X-Forwarded-Proto 로 폴백', async () => {
    const saved = env.PUBLIC_ORIGIN;
    env.PUBLIC_ORIGIN = '';
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/s/nonexistent-token',
        headers: { host: 'example.test', 'x-forwarded-proto': 'https' },
      });
      expect(res.body).toContain(
        'property="og:url" content="https://example.test/s/nonexistent-token"',
      );
    } finally {
      env.PUBLIC_ORIGIN = saved;
    }
  });

  it('정산 카드 이미지 라우트 — 없는 토큰은 404 (PNG 렌더 안 함)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/share/settlements/nonexistent-token/image.png',
    });
    expect(res.statusCode).toBe(404);
  });

  it('별칭 카드 이미지 라우트(/s/:token/image.png) 도 없는 토큰은 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/s/nonexistent-token/image.png',
    });
    expect(res.statusCode).toBe(404);
  });
});
