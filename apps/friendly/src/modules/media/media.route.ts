import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Routes } from '@repo/api-contract';

// Naver review/place CDN hosts we proxy. Anything outside this list is
// rejected — the proxy is purely a thumbnail accelerator for Naver-hosted
// review images, not a generic open image proxy.
const ALLOWED_HOSTS = new Set([
  'phinf.pstatic.net',
  'pup-review-phinf.pstatic.net',
  'review-phinf.pstatic.net',
  'ldb-phinf.pstatic.net',
  'search.pstatic.net',
]);

const FETCH_TIMEOUT_MS = 5_000;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024; // 10MB
const CACHE_DIR = resolve(process.cwd(), 'data', 'thumbs');
const CACHE_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30d

const Query = z.object({
  url: z.string().url(),
  w: z.coerce.number().int().min(40).max(1200).default(300),
  q: z.coerce.number().int().min(40).max(95).default(78),
});

const cacheKey = (url: string, w: number, q: number): string =>
  createHash('sha1').update(`${url}|w=${w}|q=${q}`).digest('hex');

const cachePath = (key: string): string => join(CACHE_DIR, `${key}.jpg`);

const fetchSource = async (url: string): Promise<Buffer> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) throw new Error(`non-image content-type: ${ct}`);
    const len = Number(res.headers.get('content-length') ?? '0');
    if (len > MAX_SOURCE_BYTES) throw new Error(`source too large: ${len}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_SOURCE_BYTES) throw new Error('source too large');
    return buf;
  } finally {
    clearTimeout(timer);
  }
};

const mediaRoutes: FastifyPluginAsync = async (app) => {
  await mkdir(CACHE_DIR, { recursive: true });
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(Routes.Media.thumbnail, {
    schema: {
      tags: ['media'],
      querystring: Query,
    },
    handler: async (req, reply) => {
      const { url, w, q } = req.query;

      let host: string;
      try {
        host = new URL(url).hostname;
      } catch {
        return reply.code(400).send({ error: 'invalid_url' });
      }
      if (!ALLOWED_HOSTS.has(host)) {
        return reply.code(400).send({ error: 'host_not_allowed', host });
      }

      const key = cacheKey(url, w, q);
      const file = cachePath(key);

      reply
        .header('Cache-Control', `public, max-age=${CACHE_MAX_AGE_SEC}, immutable`)
        .header('Content-Type', 'image/jpeg')
        .header('ETag', `"${key}"`);

      // Conditional GET — clients (and any caching layer in front) can skip
      // the body when their cached copy matches.
      if (req.headers['if-none-match'] === `"${key}"`) {
        return reply.code(304).send();
      }

      try {
        await stat(file);
        return reply.send(createReadStream(file));
      } catch {
        // miss — fetch, transform, cache, respond
      }

      try {
        const src = await fetchSource(url);
        const out = await sharp(src)
          .rotate() // honor EXIF orientation
          .resize({ width: w, withoutEnlargement: true })
          .jpeg({ quality: q, mozjpeg: true })
          .toBuffer();
        // Best-effort cache write — don't block the response if disk fails.
        writeFile(file, out).catch((e) => {
          app.log.warn({ err: e, file }, 'thumbnail cache write failed');
        });
        return reply.send(out);
      } catch (e) {
        app.log.warn({ err: e, url, host }, 'thumbnail proxy failed');
        return reply.code(502).send({ error: 'upstream_failed' });
      }
    },
  });
};

export default mediaRoutes;
