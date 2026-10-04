import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Routes } from '@repo/api-contract';
import { isTest } from '../../config/env.js';
import { scheduleRegistry } from '../schedule/schedule-registry.js';
import { panoramaFilePath } from './panorama-cache.js';
import {
  ThumbnailBusyError,
  ThumbnailService,
  snapQuality,
  snapWidth,
  thumbnailCacheKey,
} from './thumbnail-cache.js';

// Naver review/place CDN hosts we proxy. Anything outside this list is
// rejected — the proxy is purely a thumbnail accelerator for Naver-hosted
// review images, not a generic open image proxy.
// thumbnail 프록시가 허용하는 호스트. 다른 모듈(공유 OG 이미지 선택 등)이
// "이 URL 을 프록시로 띄울 수 있나" 판단할 때 재사용한다.
export const ALLOWED_HOSTS = new Set([
  'phinf.pstatic.net',
  'pup-review-phinf.pstatic.net',
  'review-phinf.pstatic.net',
  'ldb-phinf.pstatic.net',
  'search.pstatic.net',
  'video-phinf.pstatic.net',
  // 배민 메뉴 사진(크롤로 들어오는 메뉴 imageUrls). 원본이 1280×960 급이라 56px 썸네일에
  // 그대로 쓰면 스크롤이 버벅여 프록시로 리사이즈한다.
  'imagefarm.baemin.com',
  'file.smartbaedal.com',
]);

const CACHE_DIR = resolve(process.cwd(), 'data', 'thumbs');
const CACHE_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30d
const SWEEP_JOB_TYPE = 'media-thumbs-sweep';
// 디스크 상한 정리 — 6시간 주기(+ 부팅 1분 뒤 1회). 쓰기로 상한을 넘으면 그때도 바로 돈다.
const SWEEP_CRON = '17 */6 * * *';
const BOOT_SWEEP_DELAY_MS = 60_000;

const Query = z.object({
  url: z.string().url(),
  w: z.coerce.number().int().min(40).max(1200).default(300),
  q: z.coerce.number().int().min(40).max(95).default(78),
});

// 이미지 응답 헤더는 실제로 이미지를 보낼 때만 단다. 오류 응답에 image/jpeg 를 먼저 달아 두면
// 객체 본문을 직렬화하지 못해(FST_ERR_REP_INVALID_PAYLOAD_TYPE) 502 가 500 으로 바뀌고, 그 500 에
// 30일 immutable 캐시 헤더·ETag 가 붙어 나갔다(운영 로그 108건).
const imageHeaders = (reply: FastifyReply, etag: string | null): FastifyReply => {
  reply
    .header('Cache-Control', `public, max-age=${CACHE_MAX_AGE_SEC}, immutable`)
    .header('Content-Type', 'image/jpeg');
  if (etag) reply.header('ETag', etag);
  return reply;
};

const mediaRoutes: FastifyPluginAsync<{ thumbnails?: ThumbnailService }> = async (app, opts) => {
  const thumbs = opts.thumbnails ?? new ThumbnailService({ cacheDir: CACHE_DIR, logger: app.log });
  await thumbs.ensureDir();
  if (!opts.thumbnails && !isTest) {
    const boot = setTimeout(() => void thumbs.sweep(), BOOT_SWEEP_DELAY_MS);
    boot.unref();
    scheduleRegistry.setCron(SWEEP_JOB_TYPE, SWEEP_CRON, 'Asia/Seoul', () => {
      void thumbs.sweep();
    });
    app.addHook('onClose', async () => {
      clearTimeout(boot);
      scheduleRegistry.clearCron(SWEEP_JOB_TYPE);
    });
  }
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(Routes.Media.thumbnail, {
    schema: {
      tags: ['media'],
      summary: '외부 이미지 썸네일 JPEG 리사이즈 프록시 — 허용 호스트만, 디스크 캐시',
      description:
        'url 은 네이버(pstatic.net 계열)·배민 이미지 호스트만 허용(그 외 400). w 40~1200(기본 300)·q 40~95(기본 78) 를 받되 ' +
        'w 는 {80,96,112,160,200,240,300,400,480,900,1200} 중 가장 가까운 상위 값, q 는 78·80 중 상위 값으로 맞춰 변환한다. ' +
        '결과는 30일 immutable 캐시 헤더와 ETag 를 붙인다. 업스트림 실패 502, 변환 대기열이 가득 차면 503.',
      querystring: Query,
    },
    handler: async (req, reply) => {
      const { url } = req.query;
      const w = snapWidth(req.query.w);
      const q = snapQuality(req.query.q);

      let host: string;
      try {
        host = new URL(url).hostname;
      } catch {
        return reply.code(400).send({ error: 'invalid_url' });
      }
      if (!ALLOWED_HOSTS.has(host)) {
        return reply.code(400).send({ error: 'host_not_allowed', host });
      }

      const key = thumbnailCacheKey(url, w, q);
      const etag = `"${key}"`;

      // Conditional GET — clients (and any caching layer in front) can skip
      // the body when their cached copy matches.
      if (req.headers['if-none-match'] === etag) {
        return imageHeaders(reply, etag).code(304).send();
      }

      const cached = await thumbs.openCached(key);
      if (cached) return imageHeaders(reply, etag).send(cached);

      try {
        const out = await thumbs.render(url, w, q, key);
        return imageHeaders(reply, etag).send(out);
      } catch (e) {
        if (e instanceof ThumbnailBusyError) {
          return reply.code(503).header('Retry-After', '5').send({ error: 'busy' });
        }
        app.log.warn({ err: e, url, host }, 'thumbnail proxy failed');
        return reply.code(502).send({ error: 'upstream_failed' });
      }
    },
  });

  // 크롤 시점에 받아둔 네이버 파노라마 썸네일 사본을 placeId 로 서빙한다.
  // 원본 apis.naver.com URL 은 TTL 만료(403)로 죽지만, 사본은 영구 자산이라
  // 다시 외부로 나가지 않는다. 사본이 없으면 404 — 호출측(<img>)이 placeholder.
  typed.get(Routes.Media.panorama(':placeId'), {
    schema: {
      tags: ['media'],
      summary: '네이버 플레이스 파노라마 썸네일(JPEG) — 크롤 시 저장한 사본, 없으면 404',
      params: z.object({ placeId: z.string().regex(/^\d+$/).max(40) }),
    },
    handler: async (req, reply) => {
      // stat 뒤 스트림을 여는 사이 파일이 바뀌거나 지워지면 스트림 오류가 500 으로 번진다 — 먼저 연다.
      let fh;
      try {
        fh = await open(panoramaFilePath(req.params.placeId), 'r');
      } catch {
        return reply.code(404).send({ error: 'not_found' });
      }
      return imageHeaders(reply, null).send(fh.createReadStream());
    },
  });
};

export default mediaRoutes;
