import type { FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { env } from '../../config/env.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';

// 타로 공유 — 토큰 발급(게스트 입력 / 회원 readingId), 공개 조회(질문 숨김·포함), OG 프리렌더,
// satori 공유 이미지. LLM 은 provider 비활성 행으로 막아 정적 경로만 친다.

const __dirname = dirname(fileURLToPath(import.meta.url));
// 빌드된 dist 대신 소스 index.html(구조 동일: <title>, </head>)을 가리킨다.
const WEB_INDEX = resolve(__dirname, '../../../../web/index.html');

const THREE = [
  { cardId: 'major-17', position: 'situation', reversed: false },
  { cardId: 'wands-08', position: 'advice', reversed: true },
  { cardId: 'cups-10', position: 'outcome', reversed: false },
];
const reading = { spreadId: 'three-sar', topic: 'work', question: '이직할까요?', choices: null, cards: THREE };

describe('tarot share (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;
  let token: string;
  let prevIndex: string | undefined;

  beforeAll(async () => {
    prevIndex = env.WEB_INDEX_PATH;
    env.WEB_INDEX_PATH = WEB_INDEX;
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [{ id: 's-user', role: 'USER' }]);
    await app.prisma.llmProviderConfig.create({
      data: { provider: 'ollama-cloud', purpose: 'tarot', apiKey: 'x', enabled: false },
    });
    token = app.jwt.sign({ userId: 's-user', email: 's@x.com', role: 'USER' });
  });

  beforeEach(async () => {
    await app.prisma.tarotReading.deleteMany();
    await app.prisma.usageQuotaCounter.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
    env.WEB_INDEX_PATH = prevIndex;
  });

  const guestShare = (includeQuestion = false) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/tarot/shares',
      headers: { 'x-guest-key': 'guest-key-00000009' },
      payload: { reading, includeQuestion },
    });

  it('게스트: 리딩 입력으로 토큰 발급 → 행 생성, 공개 조회는 질문 숨김', async () => {
    const res = await guestShare(false);
    expect(res.statusCode).toBe(200);
    const share = res.json();
    expect(share.token).toMatch(/^[A-Za-z0-9_-]{10}$/);
    expect(share.path).toBe(`/tarot/s/${share.token}`);
    expect(share.includeQuestion).toBe(false);

    const row = await app.prisma.tarotReading.findUnique({ where: { shareToken: share.token } });
    expect(row).toMatchObject({ userId: null, guestKey: 'guest-key-00000009', shareQuestion: false, source: 'static' });

    const shared = await app.inject({ method: 'GET', url: `/api/v1/tarot/shares/${share.token}` });
    expect(shared.statusCode).toBe(200);
    expect(shared.json()).toMatchObject({ token: share.token, spreadId: 'three-sar', question: '', includeQuestion: false });
    expect(shared.json().cards).toHaveLength(3);
    expect(shared.json().cards[0]).toMatchObject({ cardId: 'major-17', nameKo: '별', positionLabel: '상황' });
    expect(shared.json().readingId).toBeUndefined();
    expect(shared.json().quota).toBeUndefined();
  });

  it('질문 포함으로 공유하면 질문이 보인다', async () => {
    const share = (await guestShare(true)).json();
    const shared = await app.inject({ method: 'GET', url: `/api/v1/tarot/shares/${share.token}` });
    expect(shared.json()).toMatchObject({ question: '이직할까요?', includeQuestion: true });
  });

  it('회원: readingId 로 토큰 발급, 다시 요청하면 같은 토큰, 질문 플래그만 갱신', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/tarot/readings',
      headers: { authorization: `Bearer ${token}` },
      payload: reading,
    });
    const readingId = created.json().readingId as string;
    const a = await app.inject({
      method: 'POST',
      url: '/api/v1/tarot/shares',
      headers: { authorization: `Bearer ${token}` },
      payload: { readingId, includeQuestion: false },
    });
    expect(a.statusCode).toBe(200);
    const b = await app.inject({
      method: 'POST',
      url: '/api/v1/tarot/shares',
      headers: { authorization: `Bearer ${token}` },
      payload: { readingId, includeQuestion: true },
    });
    expect(b.json().token).toBe(a.json().token);
    expect(b.json().includeQuestion).toBe(true);
    expect(await app.prisma.tarotReading.count()).toBe(1);

    // 남의 readingId·게스트의 readingId 는 404.
    const other = await app.inject({ method: 'POST', url: '/api/v1/tarot/shares', payload: { readingId, includeQuestion: false } });
    expect(other.statusCode).toBe(404);
  });

  it('없는 토큰은 404, 본문 없는 요청은 400', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/tarot/shares/nope-nope-1' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/v1/tarot/shares', payload: { includeQuestion: true } })).statusCode).toBe(400);
  });

  it('OG 프리렌더 — 살아있는 토큰은 키워드·카드명, 없는 토큰은 일반 OG', async () => {
    const share = (await guestShare(false)).json();
    const live = await app.inject({ method: 'GET', url: `/tarot/s/${share.token}` });
    expect(live.statusCode).toBe(200);
    expect(live.headers['content-type']).toContain('text/html');
    expect(live.body).toContain('og:title');
    expect(live.body).toContain('[타로]');
    expect(live.body).toContain('별');
    expect(live.body).toContain(`/tarot/s/${share.token}/image.png`);
    expect(live.body).not.toContain('이직할까요?');

    const gone = await app.inject({ method: 'GET', url: '/tarot/s/nope-nope-1' });
    expect(gone.statusCode).toBe(200);
    expect(gone.body).toContain('Life Pickr 타로');
  });

  it('공유 이미지 — og·story PNG, 없는 토큰은 404', async () => {
    const share = (await guestShare(true)).json();
    for (const q of ['', '?format=story', '?format=bogus']) {
      const img = await app.inject({ method: 'GET', url: `/tarot/s/${share.token}/image.png${q}` });
      expect(img.statusCode).toBe(200);
      expect(img.headers['content-type']).toBe('image/png');
      // PNG 시그니처.
      expect(img.rawPayload.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    expect((await app.inject({ method: 'GET', url: '/tarot/s/nope-nope-1/image.png' })).statusCode).toBe(404);
  });
});
