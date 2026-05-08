import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';

describe('media thumbnail proxy', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects invalid url', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/media/thumbnail?url=not-a-url',
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects host not in allow-list', async () => {
    const url = encodeURIComponent('https://example.com/foo.jpg');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/media/thumbnail?url=${url}`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'host_not_allowed' });
  });

  // 회귀 테스트: 네이버 리뷰의 동영상 썸네일이 video-phinf.pstatic.net 으로
  // 서빙되는 케이스. 허용 목록에 포함돼 있어야 하고, 실제 업스트림에서 받아
  // 리사이즈해 200 JPEG 으로 돌려줘야 한다.
  it('proxies video-phinf.pstatic.net (live upstream)', async () => {
    const url = encodeURIComponent(
      'https://video-phinf.pstatic.net/20231230_38/1703908869094h328U_JPEG/0f870214-a6c8-11ee-a613-80615f0bce16_03.jpg',
    );
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/media/thumbnail?url=${url}&w=200`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.rawPayload.byteLength).toBeGreaterThan(0);
    // sharp jpeg magic bytes
    expect(res.rawPayload[0]).toBe(0xff);
    expect(res.rawPayload[1]).toBe(0xd8);
  }, 15_000);
});
