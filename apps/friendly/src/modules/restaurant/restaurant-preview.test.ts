import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { NaverPlaceDataType } from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { env } from '../../config/env.js';
import { RestaurantService } from './restaurant.service.js';

// 빌드된 dist/index.html 대신 소스 템플릿을 가리켜(구조 동일) OG 주입만 검증한다.
const WEB_INDEX = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../web/index.html',
);

// 파일별 prefix — vitest 가 같은 dev.db 에 병렬로 돌므로 afterEach 정리가
// 다른 파일 행을 지우지 않도록 prefix 를 파일 로컬로 둔다.
const PLACE_PREFIX = 'rp-';
const stamp = () =>
  `${PLACE_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const placeData = (overrides: Partial<NaverPlaceDataType> = {}): NaverPlaceDataType => ({
  placeId: stamp(),
  name: '프리뷰 식당',
  category: '한식',
  address: '서울 강남구',
  roadAddress: null,
  phone: null,
  businessHours: null,
  latitude: null,
  longitude: null,
  imageUrls: [],
  rating: 4.2,
  reviewCount: 12,
  menus: [],
  reviewStats: null,
  blogReviews: [],
  visitorReviews: [],
  rawSourceUrl: 'https://m.place.naver.com/restaurant/x',
  ...overrides,
});

describe('restaurant-preview (OG)', () => {
  let app: FastifyInstance;
  let service: RestaurantService;

  beforeAll(() => {
    env.WEB_INDEX_PATH = WEB_INDEX;
  });

  beforeEach(async () => {
    app = await buildApp();
    await app.ready();
    service = new RestaurantService(app.prisma);
  });

  afterEach(async () => {
    await app.prisma.restaurant.deleteMany({
      where: { placeId: { startsWith: PLACE_PREFIX } },
    });
    await app.close();
  });

  afterAll(async () => {
    env.WEB_INDEX_PATH = undefined;
  });

  it('대표이미지가 파노라마 사본(상대경로)이면 og:image 는 프록시를 거치지 않고 그대로 절대화', async () => {
    // 네이버 갤러리 없이 파노라마만 있는 가게 — service 가 휘발성 파노라마를
    // 우리 사본 상대경로(/api/v1/media/panorama/:placeId)로 치환한 상태를 모사.
    const placeId = stamp();
    const panorama = `/api/v1/media/panorama/${placeId}`;
    await service.upsertRestaurantFromCrawl(placeData({ placeId, imageUrls: [panorama] }));

    const res = await app.inject({ method: 'GET', url: `/r/${placeId}` });
    expect(res.statusCode).toBe(200);
    // 상대경로 사본은 우리 JPEG 자산 — thumbnail 프록시(절대 URL + 네이버 호스트만
    // 허용)를 거치면 z.string().url() 검증 400 으로 깨지므로 그대로 절대화돼야 한다.
    expect(res.body).toContain(
      `property="og:image" content="${env.PUBLIC_ORIGIN}${panorama}"`,
    );
    expect(res.body).not.toContain('media/thumbnail');
  });

  it('대표이미지가 외부 CDN(http) 이면 og:image 는 thumbnail 프록시를 경유', async () => {
    const placeId = stamp();
    await service.upsertRestaurantFromCrawl(
      placeData({ placeId, imageUrls: ['https://phinf.pstatic.net/a.jpg'] }),
    );

    const res = await app.inject({ method: 'GET', url: `/r/${placeId}` });
    expect(res.statusCode).toBe(200);
    // & 는 escapeHtml 로 &amp; 가 되므로 경로 접두만 확인한다.
    expect(res.body).toContain(
      `property="og:image" content="${env.PUBLIC_ORIGIN}/api/v1/media/thumbnail?url=`,
    );
  });
});
