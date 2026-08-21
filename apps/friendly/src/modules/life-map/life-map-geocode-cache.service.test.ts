import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  exportGeocodeCache,
  importGeocodeCache,
  parseGeocodeCacheExport,
  readGeocodeCacheFile,
  writeGeocodeCacheFile,
} from './life-map-geocode-cache.service.js';

// 캐시 내보내기/가져오기 왕복 — 공유 dev.db 에 고유 prefix 주소로 시드하고 정리한다.

describe('life-map geocode cache export/import', () => {
  const prisma = new PrismaClient();
  const PREFIX = `지오캐시테스트-${Date.now().toString(36)}`;
  const addr = (s: string): string => `${PREFIX} ${s}`;
  const cleanup = () => prisma.lifeGeocodeCache.deleteMany({ where: { address: { startsWith: PREFIX } } });

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('내보낸 파일을 빈 DB 에 가져오면 같은 행이 복원되고, 재가져오기는 건너뛰며, --overwrite 는 갱신', async () => {
    await prisma.lifeGeocodeCache.createMany({
      data: [
        { type: 'road', address: addr('세종대로 110'), status: 'ok', lat: 37.5665, lng: 126.978, refined: '정제 1' },
        { type: 'parcel', address: addr('태평로1가 31'), status: 'ok', lat: 37.5666, lng: 126.9781, refined: null },
        { type: 'road', address: addr('없는 길 1'), status: 'notfound', lat: null, lng: null, refined: null },
      ],
    });
    const exported = await exportGeocodeCache(prisma, new Date('2026-08-21T12:00:00Z'));
    expect(exported.version).toBe(1);
    expect(exported.exportedAt).toBe('2026-08-21T12:00:00.000Z');
    const mine = exported.entries.filter((e) => e.address.startsWith(PREFIX));
    expect(mine).toHaveLength(3);
    expect(mine.find((e) => e.address === addr('없는 길 1'))).toMatchObject({ status: 'notfound', lat: null, lng: null });

    // 직렬화 → 파싱(파일 왕복) → 형식 검증.
    const parsed = parseGeocodeCacheExport(JSON.parse(JSON.stringify({ ...exported, entries: mine })));
    expect(parsed.count).toBe(3);

    await cleanup();
    const r1 = await importGeocodeCache(prisma, parsed);
    expect(r1).toEqual({ inserted: 3, updated: 0, skipped: 0 });
    const rows = await prisma.lifeGeocodeCache.findMany({ where: { address: { startsWith: PREFIX } } });
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.address === addr('세종대로 110'))).toMatchObject({ status: 'ok', lat: 37.5665, refined: '정제 1' });

    // 같은 파일 재가져오기 — 기존 키는 건너뛴다.
    const r2 = await importGeocodeCache(prisma, parsed);
    expect(r2).toEqual({ inserted: 0, updated: 0, skipped: 3 });

    // --overwrite — 파일 값으로 갱신.
    const changed = { ...parsed, entries: parsed.entries.map((e) => (e.address === addr('없는 길 1') ? { ...e, status: 'ok' as const, lat: 35.1, lng: 129.0 } : e)) };
    const r3 = await importGeocodeCache(prisma, changed, { overwrite: true });
    expect(r3).toEqual({ inserted: 0, updated: 3, skipped: 0 });
    expect(await prisma.lifeGeocodeCache.findUnique({ where: { type_address: { type: 'road', address: addr('없는 길 1') } } })).toMatchObject({
      status: 'ok',
      lat: 35.1,
    });
  });

  it('파일 왕복 — .gz 는 gzip 으로 쓰고(매직 바이트) 확장자/매직으로 풀어 읽는다, .json 은 평문', () => {
    const dir = mkdtempSync(join(tmpdir(), 'life-geocode-'));
    try {
      const data = parseGeocodeCacheExport({
        version: 1,
        exportedAt: '2026-08-21T12:00:00.000Z',
        entries: [
          { type: 'road', address: '서울특별시 중구 세종대로 110', status: 'ok', lat: 37.5665, lng: 126.978, refined: null, checkedAt: '2026-08-21T11:00:00.000Z' },
          { type: 'parcel', address: '없는 주소', status: 'notfound', lat: null, lng: null, refined: null, checkedAt: '2026-08-21T11:00:00.000Z' },
        ],
      });
      const gz = join(dir, 'cache.json.gz');
      const plain = join(dir, 'cache.json');
      const gzBytes = writeGeocodeCacheFile(gz, data);
      const plainBytes = writeGeocodeCacheFile(plain, data);
      const head = readFileSync(gz);
      expect([head[0], head[1]]).toEqual([0x1f, 0x8b]);
      expect(gzBytes).toBeLessThan(plainBytes);
      expect(readGeocodeCacheFile(gz)).toEqual(data);
      expect(readGeocodeCacheFile(plain)).toEqual(data);
      // 확장자가 .gz 가 아니어도 매직 바이트로 판별.
      const renamed = join(dir, 'cache.bin');
      writeGeocodeCacheFile(renamed, data); // 평문
      expect(readGeocodeCacheFile(renamed)).toEqual(data);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('형식이 다르면 거절', () => {
    expect(() => parseGeocodeCacheExport({ version: 2, entries: [] })).toThrow(/형식/);
    expect(() => parseGeocodeCacheExport({ version: 1, entries: [{ type: 'road', address: 'x', status: 'ok' }] })).toThrow(/좌표/);
    expect(() => parseGeocodeCacheExport({ version: 1, entries: [{ type: 'bus', address: 'x', status: 'ok', lat: 1, lng: 2 }] })).toThrow(/type/);
    expect(parseGeocodeCacheExport({ version: 1, entries: [] }).count).toBe(0);
  });
});
