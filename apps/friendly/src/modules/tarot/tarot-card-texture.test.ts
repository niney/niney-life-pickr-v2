import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Routes } from '@repo/api-contract';
import { buildApp } from '../../app.js';
import type { IsolatedDatabase } from '../../test-utils/temp-db.js';
import { useSchemaDatabase } from '../../test-utils/schema-db.js';
import { TAROT_TEXTURE_WIDTH } from './tarot-card-texture.js';

// 카드 앞면 텍스처 — 앱 3D 무대(expo-gl, WebP 불가)용 JPEG. 웹 정적 자산(apps/web/public/tarot/cards)을 읽는다.

describe('tarot card texture (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;

  beforeAll(async () => {
    isolated = useSchemaDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('카드 그림을 384px JPEG 로 준다(오래 캐시)', async () => {
    const res = await app.inject({ method: 'GET', url: Routes.Tarot.cardTexture('major-17') });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toContain('max-age=');
    expect(res.rawPayload.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    const meta = await sharp(res.rawPayload).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(TAROT_TEXTURE_WIDTH);
    // 다시 부르면 같은 바이트(프로세스 캐시).
    const again = await app.inject({ method: 'GET', url: Routes.Tarot.cardTexture('major-17') });
    expect(again.rawPayload.equals(res.rawPayload)).toBe(true);
  });

  it('카드 id 형식이 아니면 400', async () => {
    const res = await app.inject({ method: 'GET', url: Routes.Tarot.cardTexture('back') });
    expect(res.statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: Routes.Tarot.cardTexture('..%2F..%2Fsecret') })).statusCode).toBe(400);
  });
});
