import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import sharp from 'sharp';
import { buildApp } from '../../app.js';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import mediaRoutes from './media.route.js';
import { ThumbnailService, thumbnailCacheKey } from './thumbnail-cache.js';

const makeJpeg = () =>
  sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    .jpeg()
    .toBuffer();

const thumbUrl = (url: string, extra = '') =>
  `/api/v1/media/thumbnail?url=${encodeURIComponent(url)}${extra}`;

describe('media thumbnail proxy (app)', () => {
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
    const res = await app.inject({ method: 'GET', url: thumbUrl('https://example.com/foo.jpg') });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'host_not_allowed' });
  });
});

// 업스트림은 모의 fetch — 외부 호출 없음. 캐시 디렉터리는 임시 폴더를 주입한다.
describe('media thumbnail proxy (route)', () => {
  let app: FastifyInstance;
  let dir: string;
  const fetchSource = vi.fn<(url: string) => Promise<Buffer>>();

  const build = async (service: ThumbnailService) => {
    const a = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
    a.setValidatorCompiler(validatorCompiler);
    a.setSerializerCompiler(serializerCompiler);
    await a.register(errorHandlerPlugin);
    await a.register(mediaRoutes, { thumbnails: service });
    await a.ready();
    return a;
  };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'media-route-test-'));
    app = await build(new ThumbnailService({ cacheDir: dir, fetchSource }));
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  afterEach(() => {
    fetchSource.mockReset();
  });

  it('배민 메뉴 사진·video-phinf 호스트는 허용 목록에 있고 JPEG 로 리사이즈한다', async () => {
    const src = await makeJpeg();
    fetchSource.mockResolvedValue(src);
    for (const u of [
      'https://imagefarm.baemin.com/x/y.jpg',
      'https://file.smartbaedal.com/x/y.jpg',
      // 회귀: 네이버 리뷰 동영상 썸네일 호스트.
      'https://video-phinf.pstatic.net/20231230_38/a_JPEG/b.jpg',
    ]) {
      const res = await app.inject({ method: 'GET', url: thumbUrl(u, '&w=200') });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.rawPayload[0]).toBe(0xff);
      expect(res.rawPayload[1]).toBe(0xd8);
      expect((await sharp(res.rawPayload).metadata()).width).toBe(200);
    }
  });

  it('업스트림 실패는 502 JSON — 이미지 헤더·30일 immutable 캐시·ETag 를 달지 않는다', async () => {
    // 이전: Content-Type image/jpeg 를 먼저 달아 객체 본문 직렬화가 실패 → 500 + immutable 캐시 헤더.
    fetchSource.mockRejectedValue(new Error('upstream 404'));
    const res = await app.inject({
      method: 'GET',
      url: thumbUrl('https://phinf.pstatic.net/missing.jpg'),
    });
    expect(res.statusCode).toBe(502);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.json()).toEqual({ error: 'upstream_failed' });
    expect(res.headers['cache-control']).toBeUndefined();
    expect(res.headers.etag).toBeUndefined();
  });

  it('w·q 는 버킷으로 스냅 — 같은 버킷의 다른 값은 같은 캐시 키·ETag, 업스트림 1회', async () => {
    fetchSource.mockResolvedValue(await makeJpeg());
    const u = 'https://phinf.pstatic.net/bucket.jpg';
    const a = await app.inject({ method: 'GET', url: thumbUrl(u, '&w=150&q=70') });
    const b = await app.inject({ method: 'GET', url: thumbUrl(u, '&w=160&q=78') });
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(a.headers.etag).toBe(`"${thumbnailCacheKey(u, 160, 78)}"`);
    expect(b.headers.etag).toBe(a.headers.etag);
    expect(fetchSource).toHaveBeenCalledTimes(1);
    expect((await sharp(b.rawPayload).metadata()).width).toBe(160);
    // 조건부 GET 은 스냅된 키 기준.
    const c = await app.inject({
      method: 'GET',
      url: thumbUrl(u, '&w=155&q=60'),
      headers: { 'if-none-match': a.headers.etag as string },
    });
    expect(c.statusCode).toBe(304);
  });

  it('같은 키 동시 요청 8건은 업스트림 1회로 합류한다', async () => {
    const src = await makeJpeg();
    fetchSource.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return src;
    });
    const u = 'https://phinf.pstatic.net/same.jpg';
    const res = await Promise.all(
      Array.from({ length: 8 }, () => app.inject({ method: 'GET', url: thumbUrl(u, '&w=480') })),
    );
    expect(res.every((r) => r.statusCode === 200)).toBe(true);
    expect(fetchSource).toHaveBeenCalledTimes(1);
  });

  it('변환 대기열이 가득 차면 503 + Retry-After', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const busyDir = mkdtempSync(join(tmpdir(), 'media-busy-test-'));
    const busy = await build(
      new ThumbnailService({
        cacheDir: busyDir,
        maxConcurrent: 1,
        maxQueue: 0,
        fetchSource: async () => {
          await gate;
          return makeJpeg();
        },
      }),
    );
    try {
      const first = busy.inject({ method: 'GET', url: thumbUrl('https://phinf.pstatic.net/1.jpg') });
      await new Promise((r) => setTimeout(r, 20));
      const second = await busy.inject({ method: 'GET', url: thumbUrl('https://phinf.pstatic.net/2.jpg') });
      expect(second.statusCode).toBe(503);
      expect(second.headers['retry-after']).toBe('5');
      expect(second.headers['cache-control']).toBeUndefined();
      release();
      expect((await first).statusCode).toBe(200);
    } finally {
      await busy.close();
      rmSync(busyDir, { recursive: true, force: true });
    }
  });
});
