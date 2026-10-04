import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildApp } from '../../app.js';
import { env } from '../../config/env.js';
import type { IsolatedDatabase } from '../../test-utils/temp-db.js';
import { useSchemaDatabase } from '../../test-utils/schema-db.js';
import { CARD_MAX_PARTICIPANT_ROWS } from './settlement-card.js';
import { SettlementService } from './settlement.service.js';

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

// perf-2 F-V2·G-2 — 큰 정산 og:image, 카드 PNG 히트 경로(경량 조회), 만료. 빈 스키마 DB 에 공유 세션을 직접 만든다.
describe('share-preview (카드 PNG·og:image)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;

  // 참여자 n명·1차 공유 세션 — 식당 사진이 없어 og:image 는 카드 또는 기본 이미지로 간다.
  const seedShared = async (token: string, n: number, expiresInMs = 86_400_000) => {
    const session = await app.prisma.settlementSession.create({
      data: {
        userId: 'card-owner',
        restaurantPlaceId: 'place-card',
        restaurantName: '카드식당',
        grandTotal: n * 10_000,
        shareToken: token,
        shareExpiresAt: new Date(Date.now() + expiresInMs),
        participants: {
          create: Array.from({ length: n }, (_, i) => ({ name: `참여자${i}`, nickname: null, shareAmount: 10_000, orderIndex: i })),
        },
      },
      include: { participants: { orderBy: { orderIndex: 'asc' } } },
    });
    await app.prisma.settlementRound.create({
      data: {
        sessionId: session.id,
        orderIndex: 0,
        restaurantPlaceId: 'place-card',
        restaurantName: '카드식당',
        source: 'MANUAL',
        totalAmount: n * 10_000,
        warning: null,
        receiptImageToken: null,
        itemsSubtotal: n * 10_000,
        items: { create: [{ name: '정식', unitPrice: 10_000, quantity: n, amount: n * 10_000, category: 'SIDE', orderIndex: 0 }] },
        attendees: { create: session.participants.map((p) => ({ participantId: p.id, attended: true, shareAmount: 10_000 })) },
      },
    });
    return session;
  };

  beforeAll(async () => {
    env.WEB_INDEX_PATH = WEB_INDEX;
    isolated = useSchemaDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await app.prisma.user.create({ data: { id: 'card-owner', email: 'card-owner@x.com', passwordHash: 'x' } });
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(`og:image — ${CARD_MAX_PARTICIPANT_ROWS}명 이하는 정산표 카드, 넘으면 기본 이미지`, async () => {
    await seedShared('card-small', 7);
    await seedShared('card-large', CARD_MAX_PARTICIPANT_ROWS + 1);
    const small = await app.inject({ method: 'GET', url: '/s/card-small' });
    expect(small.body).toContain('/share/settlements/card-small/image.png');
    const large = await app.inject({ method: 'GET', url: '/s/card-large' });
    expect(large.body).not.toContain('/share/settlements/card-large/image.png');
    const ogImage = /property="og:image" content="([^"]*)"/.exec(large.body)?.[1] ?? '';
    expect(ogImage.endsWith(env.OG_IMAGE_PATH)).toBe(true);
    expect(large.body).toContain(`${CARD_MAX_PARTICIPANT_ROWS + 1}명`);
  });

  it('카드 PNG — 히트는 풀 로우를 읽지 않고, 편집(updatedAt)하면 다시 그린다', async () => {
    const s = await seedShared('card-hit01', 3);
    const full = vi.spyOn(SettlementService.prototype, 'getBySharedToken');
    const first = await app.inject({ method: 'GET', url: '/share/settlements/card-hit01/image.png' });
    expect(first.statusCode).toBe(200);
    expect(first.headers['content-type']).toBe('image/png');
    expect(first.headers['cache-control']).toBe('public, max-age=300');
    const again = await app.inject({ method: 'GET', url: '/s/card-hit01/image.png' });
    expect(again.rawPayload.equals(first.rawPayload)).toBe(true);
    expect(full).toHaveBeenCalledTimes(1);
    await app.prisma.settlementSession.update({ where: { id: s.id }, data: { restaurantName: '카드식당2' } });
    await app.inject({ method: 'GET', url: '/share/settlements/card-hit01/image.png' });
    expect(full).toHaveBeenCalledTimes(2);
  });

  it('카드 PNG — 만료·없는 토큰은 404(풀 로드·렌더 없음)', async () => {
    await seedShared('card-exp01', 3, -1000);
    const full = vi.spyOn(SettlementService.prototype, 'getBySharedToken');
    expect((await app.inject({ method: 'GET', url: '/share/settlements/card-exp01/image.png' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/s/card-none1/image.png' })).statusCode).toBe(404);
    expect(full).not.toHaveBeenCalled();
  });
});
