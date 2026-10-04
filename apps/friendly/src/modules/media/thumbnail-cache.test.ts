import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import {
  QUALITY_BUCKETS,
  ThumbnailBusyError,
  ThumbnailService,
  WIDTH_BUCKETS,
  snapQuality,
  snapWidth,
} from './thumbnail-cache.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 외부 호출 없이 쓰는 원본 이미지.
const makeJpeg = (width = 64, height = 48) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .jpeg()
    .toBuffer();

describe('w·q 버킷 스냅', () => {
  it('클라이언트가 쓰는 폭은 그대로, 그 사이 값은 가장 가까운 상위 버킷으로', () => {
    // 웹 80·96·112·160·200·480, 앱 112·240·400·480·900, 기본 300, OG 1200 — 전부 버킷에 있어야 한다.
    for (const w of [80, 96, 112, 160, 200, 240, 300, 400, 480, 900, 1200]) {
      expect(snapWidth(w)).toBe(w);
    }
    expect(snapWidth(40)).toBe(80);
    expect(snapWidth(150)).toBe(160);
    expect(snapWidth(161)).toBe(200);
    expect(snapWidth(901)).toBe(1200);
    expect(snapWidth(1199)).toBe(1200);
  });

  it('q 는 78·80 둘로 — 정산 공유 미리보기 q=70 은 78, 79~95 는 80', () => {
    expect(snapQuality(40)).toBe(78);
    expect(snapQuality(70)).toBe(78);
    expect(snapQuality(78)).toBe(78);
    expect(snapQuality(79)).toBe(80);
    expect(snapQuality(80)).toBe(80);
    expect(snapQuality(95)).toBe(80);
  });

  it('허용 범위(w 40~1200 · q 40~95) 전체가 버킷 11×2=22 키로 접힌다', () => {
    const keys = new Set<string>();
    for (let w = 40; w <= 1200; w += 1) {
      for (let q = 40; q <= 95; q += 1) keys.add(`${snapWidth(w)}|${snapQuality(q)}`);
    }
    expect(keys.size).toBe(WIDTH_BUCKETS.length * QUALITY_BUCKETS.length);
  });
});

describe('ThumbnailService', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'thumb-cache-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('같은 키 동시 미스는 업스트림·변환을 한 번만 한다', async () => {
    const src = await makeJpeg();
    const fetchSource = vi.fn(async () => {
      await sleep(30);
      return src;
    });
    const svc = new ThumbnailService({ cacheDir: dir, fetchSource });
    const outs = await Promise.all(
      Array.from({ length: 8 }, () => svc.render('https://phinf.pstatic.net/a.jpg', 80, 78, 'k1')),
    );
    expect(fetchSource).toHaveBeenCalledTimes(1);
    expect(new Set(outs).size).toBe(1);
  });

  it('서로 다른 키 미스는 전역 동시 상한까지만 동시에 변환한다', async () => {
    let running = 0;
    let peak = 0;
    const svc = new ThumbnailService({
      cacheDir: dir,
      maxConcurrent: 2,
      fetchSource: async () => {
        running += 1;
        peak = Math.max(peak, running);
        await sleep(20);
        running -= 1;
        return Buffer.from('src');
      },
      render: async () => Buffer.from('out'),
    });
    await Promise.all(
      Array.from({ length: 7 }, (_, i) => svc.render(`https://x/${i}`, 80, 78, `key-${i}`)),
    );
    expect(peak).toBe(2);
  });

  it('대기열 상한을 넘으면 ThumbnailBusyError — 이미 대기 중인 요청은 끝까지 처리된다', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const svc = new ThumbnailService({
      cacheDir: dir,
      maxConcurrent: 1,
      maxQueue: 1,
      fetchSource: async () => {
        await gate;
        return Buffer.from('src');
      },
      render: async () => Buffer.from('out'),
    });
    const first = svc.render('https://x/1', 80, 78, 'a');
    const queued = svc.render('https://x/2', 80, 78, 'b');
    await expect(svc.render('https://x/3', 80, 78, 'c')).rejects.toBeInstanceOf(ThumbnailBusyError);
    release();
    await expect(first).resolves.toEqual(Buffer.from('out'));
    await expect(queued).resolves.toEqual(Buffer.from('out'));
  });

  it('변환 결과는 tmp → rename 으로 저장되고 임시 파일이 남지 않는다', async () => {
    const svc = new ThumbnailService({ cacheDir: dir, fetchSource: async () => makeJpeg(400, 300) });
    const out = await svc.render('https://phinf.pstatic.net/b.jpg', 160, 78, 'k2');
    await sleep(50);
    expect(readdirSync(dir)).toEqual(['k2.jpg']);
    expect(readFileSync(join(dir, 'k2.jpg')).equals(out)).toBe(true);
    expect((await sharp(out).metadata()).width).toBe(160);
    const stream = await svc.openCached('k2');
    expect(stream).not.toBeNull();
    stream!.destroy();
    expect(await svc.openCached('missing')).toBeNull();
  });

  it('히트 시 하루 넘게 지난 mtime 은 갱신해 오래된 순 정리에서 살아남게 한다', async () => {
    const file = join(dir, 'old.jpg');
    writeFileSync(file, 'x');
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
    utimesSync(file, twoDaysAgo, twoDaysAgo);
    const svc = new ThumbnailService({ cacheDir: dir });
    const stream = await svc.openCached('old');
    stream!.destroy();
    await sleep(50);
    expect(Date.now() - statSync(file).mtimeMs).toBeLessThan(60_000);
  });

  it('sweep: 상한을 넘으면 mtime 오래된 순으로 90% 까지 지우고, 오래된 tmp 도 정리한다', async () => {
    const now = Date.now();
    // 10개 × 100바이트 = 1000바이트, 상한 500 → 450 이하가 될 때까지 오래된 것부터.
    for (let i = 0; i < 10; i++) {
      const f = join(dir, `f${i}.jpg`);
      writeFileSync(f, Buffer.alloc(100));
      const t = new Date(now - (10 - i) * 60_000); // f0 가 가장 오래됨
      utimesSync(f, t, t);
    }
    const staleTmp = join(dir, 'f1.jpg.dead.tmp');
    writeFileSync(staleTmp, 'x');
    const old = new Date(now - 60 * 60_000);
    utimesSync(staleTmp, old, old);
    writeFileSync(join(dir, 'f2.jpg.live.tmp'), 'x'); // 쓰는 중일 수 있는 최근 tmp 는 남긴다

    const svc = new ThumbnailService({ cacheDir: dir, maxCacheBytes: 500 });
    const res = await svc.sweep();
    expect(res).toMatchObject({ bytesBefore: 1000, bytesAfter: 400, evicted: 6, staleTmp: 1 });
    expect(readdirSync(dir).sort()).toEqual(['f2.jpg.live.tmp', 'f6.jpg', 'f7.jpg', 'f8.jpg', 'f9.jpg']);
  });

  it('스캔 뒤에는 쓰기로 상한을 넘는 순간 정리가 당겨진다', async () => {
    const svc = new ThumbnailService({
      cacheDir: dir,
      maxCacheBytes: 250,
      fetchSource: async () => Buffer.from('src'),
      render: async () => Buffer.alloc(100),
    });
    await svc.sweep(); // 빈 디렉터리 — 추정치 0 확정
    for (let i = 0; i < 3; i++) {
      await svc.render(`https://x/${i}`, 80, 78, `w${i}`);
      await sleep(30);
    }
    await sleep(50);
    // 300 바이트 > 250 → 225 이하까지 — 가장 오래된 1~2개가 지워진다.
    const left = readdirSync(dir).filter((n) => n.endsWith('.jpg'));
    expect(left.length).toBeLessThanOrEqual(2);
    expect(left).toContain('w2.jpg');
  });
});
