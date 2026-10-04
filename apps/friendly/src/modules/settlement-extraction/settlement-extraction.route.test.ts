import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import sensiblePlugin from '../../plugins/sensible.js';
import jwtPlugin from '../../plugins/jwt.js';
import prismaPlugin from '../../plugins/prisma.js';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import multipartPlugin from '../../plugins/multipart.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import settlementExtractionRoutes from './settlement-extraction.route.js';

// 선언된 해상도만 큰 가짜 HEIF — 업로드 경로의 디코드 전 해상도 검사.
const fakeLargeHeif = (w: number, h: number): Buffer => {
  const box = (type: string, payload: Buffer): Buffer => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(8 + payload.length, 0);
    head.write(type, 4, 'latin1');
    return Buffer.concat([head, payload]);
  };
  const ispe = Buffer.alloc(12);
  ispe.writeUInt32BE(w, 4);
  ispe.writeUInt32BE(h, 8);
  return Buffer.concat([
    box('ftyp', Buffer.from('heic\0\0\0\0mif1heic', 'latin1')),
    // 실제 HEIF 처럼 meta → iprp → ipco → ispe(해상도 파서가 이 구조를 따라간다).
    box('meta', Buffer.concat([Buffer.alloc(4), box('iprp', box('ipco', box('ispe', ispe)))])),
    box('mdat', Buffer.alloc(32)),
  ]);
};

const multipartBody = (boundary: string, file: Buffer): Buffer =>
  Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="r.heic"\r\nContent-Type: image/heic\r\n\r\n`,
    ),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

describe('settlement-extraction routes', () => {
  let app: FastifyInstance;
  const routes: RouteOptions[] = [];
  const userId = 'se-route-user';

  beforeAll(async () => {
    app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.addHook('onRoute', (r) => {
      routes.push(r);
    });
    await app.register(sensiblePlugin);
    await app.register(errorHandlerPlugin);
    await app.register(jwtPlugin);
    await app.register(prismaPlugin);
    await app.register(multipartPlugin);
    await app.register(settlementExtractionRoutes);
    await app.ready();
    await seedAuthUsers(app, [{ id: userId, role: 'USER' }]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('업로드·추출에 라우트 레이트리밋 프리셋이 걸려 있다(분당 20)', () => {
    const rateOf = (method: string, url: string) =>
      (
        routes.find((r) => r.method === method && r.url === url)?.config as
          | { rateLimit?: unknown }
          | undefined
      )?.rateLimit;
    expect(rateOf('POST', '/api/v1/settlement-extraction/upload')).toEqual({
      max: 20,
      timeWindow: '1 minute',
    });
    expect(rateOf('POST', '/api/v1/settlement-extraction/extract')).toEqual({
      max: 20,
      timeWindow: '1 minute',
    });
  });

  it('초대형 HEIC 업로드는 디코드 없이 400 + 해상도 안내', async () => {
    const token = app.jwt.sign({ userId, email: `${userId}@seed.local`, role: 'USER' });
    const boundary = 'xxBOUNDARYxx';
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/settlement-extraction/upload',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipartBody(boundary, fakeLargeHeif(8064, 6048)),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('2,500만');
  });
});
