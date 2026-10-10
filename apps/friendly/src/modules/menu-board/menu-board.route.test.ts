import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import sensiblePlugin from '../../plugins/sensible.js';
import jwtPlugin from '../../plugins/jwt.js';
import prismaPlugin from '../../plugins/prisma.js';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import multipartPlugin from '../../plugins/multipart.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import type * as MenuBoardServiceModule from './menu-board.service.js';

// 모델 호출·파일 읽기는 서비스 모듈을 갈아 끼워 라우트(인증·업로드·오류 매핑)만 본다.
const read = vi.fn();
const listSamples = vi.fn();
const readImage = vi.fn();
const readReport = vi.fn();
vi.mock('./menu-board.service.js', async (importOriginal) => {
  const original = await importOriginal<typeof MenuBoardServiceModule>();
  return {
    ...original,
    MenuBoardService: class {
      read = read;
    },
    listMenuBoardSamples: () => listSamples(),
    readMenuBoardSampleImage: (key: string) => readImage(key),
    readMenuBoardEvalReport: () => readReport(),
  };
});

const { MenuBoardError } = await import('./menu-board.service.js');
const { default: menuBoardRoutes } = await import('./menu-board.route.js');

const multipart = (boundary: string, file: Buffer): Buffer =>
  Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="m.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
    ),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

describe('menu-board routes', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let userToken: string;
  const BOUNDARY = 'xxMENUxx';

  beforeAll(async () => {
    app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(sensiblePlugin);
    await app.register(errorHandlerPlugin);
    await app.register(jwtPlugin);
    await app.register(prismaPlugin);
    await app.register(multipartPlugin);
    await app.register(menuBoardRoutes);
    await app.ready();
    await seedAuthUsers(app, [
      { id: 'mb-admin', role: 'ADMIN' },
      { id: 'mb-user', role: 'USER' },
    ]);
    adminToken = app.jwt.sign({ userId: 'mb-admin', email: 'mb-admin@seed.local', role: 'ADMIN' });
    userToken = app.jwt.sign({ userId: 'mb-user', email: 'mb-user@seed.local', role: 'USER' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    read.mockReset();
  });

  const upload = (token: string, file = Buffer.from('jpeg')) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/admin/menu-board/read',
      headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      payload: multipart(BOUNDARY, file),
    });

  it('어드민만 쓴다', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/menu-board/samples' })).statusCode).toBe(401);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/menu-board/samples',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect((await upload(userToken)).statusCode).toBe(403);
    expect(read).not.toHaveBeenCalled();
  });

  it('업로드한 사진을 읽어 메뉴 목록을 돌려준다', async () => {
    const result = {
      model: 'kimi-k3',
      items: [{ name: '김치찌개', price: '9,000', description: null }],
      durationMs: 6600,
      promptTokens: 2400,
      completionTokens: 40,
      image: { width: 2000, height: 1500 },
      rawText: '{"items": []}',
    };
    read.mockResolvedValue(result);
    const res = await upload(adminToken, Buffer.from('사진 바이트'));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(result);
    expect((read.mock.calls[0] as [Buffer])[0].toString()).toBe('사진 바이트');
  });

  it('서비스 오류를 HTTP 상태로 바꾼다', async () => {
    read.mockRejectedValueOnce(new MenuBoardError('invalid_image', '사진을 읽을 수 없습니다'));
    expect((await upload(adminToken)).statusCode).toBe(400);
    // 503·502 로 던지지만 공통 에러 핸들러가 5xx 를 500 으로 접는다(개발 모드에서만 메시지를 그대로 싣는다).
    read.mockRejectedValueOnce(new MenuBoardError('no_provider', '모델 없음'));
    expect((await upload(adminToken)).statusCode).toBe(500);
    read.mockRejectedValueOnce(new MenuBoardError('parse_failed', '형식 어긋남'));
    expect((await upload(adminToken)).statusCode).toBe(500);
  });

  it('전역 한도(5MB)보다 큰 메뉴판 사진도 받는다', async () => {
    read.mockResolvedValue({
      model: 'kimi-k3',
      items: [],
      durationMs: 1,
      promptTokens: null,
      completionTokens: null,
      image: { width: 1, height: 1 },
      rawText: '',
    });
    expect((await upload(adminToken, Buffer.alloc(6 * 1024 * 1024))).statusCode).toBe(200);
  });

  it('샘플 목록·사진·평가 리포트', async () => {
    const auth = { authorization: `Bearer ${adminToken}` };
    listSamples.mockResolvedValue([
      { key: 'abc__board-1', shopRef: 'abc', shopName: '가게', file: 'board-1.png', hasTruth: true },
    ]);
    const samples = await app.inject({ method: 'GET', url: '/api/v1/admin/menu-board/samples', headers: auth });
    expect(samples.json()).toEqual({
      samples: [{ key: 'abc__board-1', shopRef: 'abc', shopName: '가게', file: 'board-1.png', hasTruth: true }],
    });

    readImage.mockResolvedValueOnce({ buffer: Buffer.from('png'), contentType: 'image/png' });
    const image = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/menu-board/samples/abc__board-1/image',
      headers: auth,
    });
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(readImage).toHaveBeenLastCalledWith('abc__board-1');
    readImage.mockResolvedValueOnce(null);
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/admin/menu-board/samples/x__board-9/image', headers: auth }))
        .statusCode,
    ).toBe(404);

    readReport.mockResolvedValue(null);
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/menu-board/eval', headers: auth })).json()).toEqual({
      report: null,
    });
  });
});
