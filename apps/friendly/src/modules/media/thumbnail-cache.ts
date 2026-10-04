import { createHash, randomUUID } from 'node:crypto';
import type { ReadStream } from 'node:fs';
import { mkdir, open, readdir, rename, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type Sharp from 'sharp';

// 썸네일 프록시의 변환·디스크 캐시. 무인증 공개 라우트라 요청이 고를 수 있는 축(w·q·동시성·디스크)을
// 모두 묶는다(PLAN-perf-2 G-1): w·q 는 버킷으로 스냅해 캐시 키 공간을 고정하고, 같은 키 동시 미스는
// 한 번만 변환하며, 서로 다른 키 미스는 전역 동시 4개로 줄 세운다(sharp 디코드 메모리·libuv 스레드풀
// 경합이 미스 동시 수에 비례 — 64건 동시에 RSS +405MB 실측). 디스크는 용량 상한을 넘으면 mtime 오래된
// 순으로 지운다.

// 클라이언트가 쓰는 폭(웹 80·96·112·160·200·480, 앱 112·240·400·480·900, 기본 300, OG 1200)을 모두 포함한다 —
// 거부하지 않고 가장 가까운 상위 버킷으로 올린다(400 이면 앱 썸네일이 깨진다).
export const WIDTH_BUCKETS = [80, 96, 112, 160, 200, 240, 300, 400, 480, 900, 1200] as const;
// 기본 78, OG 80. 그 사이·바깥 값은 상위 쪽으로(70 → 78, 79~95 → 80).
export const QUALITY_BUCKETS = [78, 80] as const;

const snapUp = (buckets: readonly number[], v: number): number =>
  buckets.find((b) => b >= v) ?? buckets[buckets.length - 1]!;

export const snapWidth = (w: number): number => snapUp(WIDTH_BUCKETS, w);
export const snapQuality = (q: number): number => snapUp(QUALITY_BUCKETS, q);

export const thumbnailCacheKey = (url: string, w: number, q: number): string =>
  createHash('sha1').update(`${url}|w=${w}|q=${q}`).digest('hex');

const FETCH_TIMEOUT_MS = 5_000;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_CONCURRENT = 4;
// 대기열 상한 — 정상 화면(목록·상세 콜드 캐시)의 동시 이미지 수십 장은 받고, 그 이상 몰리면 503.
const DEFAULT_MAX_QUEUE = 128;
const DEFAULT_MAX_CACHE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
// 상한을 넘으면 이 비율까지 내려 정리 직후 바로 다시 넘지 않게 한다.
const LOW_WATER_RATIO = 0.9;
// 쓰다 죽은 임시 파일 정리 기준.
const STALE_TMP_MS = 10 * 60_000;
// 히트 시 mtime 을 갱신하는 최소 간격 — 자주 쓰이는 썸네일이 오래된 순 정리에 걸리지 않게(대략 LRU),
// 하지만 히트마다 쓰기를 하지 않게 하루에 한 번만.
const TOUCH_INTERVAL_MS = 24 * 60 * 60_000;
// 디렉터리 스캔 stat 동시성 — sharp 와 같은 libuv 스레드풀을 쓰므로 작게.
const SCAN_STAT_CONCURRENCY = 16;

export class ThumbnailBusyError extends Error {
  constructor() {
    super('thumbnail render queue full');
    this.name = 'ThumbnailBusyError';
  }
}

export class UpstreamImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamImageError';
  }
}

export const fetchImageSource = async (url: string): Promise<Buffer> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    // 본문을 안 읽고 버리는 실패 응답은 취소해 연결을 바로 돌려준다.
    const reject = (message: string): never => {
      void res.body?.cancel().catch(() => undefined);
      throw new UpstreamImageError(message);
    };
    if (!res.ok) reject(`upstream ${res.status}`);
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) reject(`non-image content-type: ${ct}`);
    const len = Number(res.headers.get('content-length') ?? '0');
    if (len > MAX_SOURCE_BYTES) reject(`source too large: ${len}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_SOURCE_BYTES) throw new UpstreamImageError('source too large');
    return buf;
  } finally {
    clearTimeout(timer);
  }
};

// sharp 는 부팅 RSS 를 키우는 네이티브 의존성이라 첫 미스 때 불러온다(PLAN-perf-2 X-3).
let sharpModule: Promise<typeof Sharp> | null = null;
const loadSharp = (): Promise<typeof Sharp> =>
  (sharpModule ??= import('sharp').then((m) => m.default));

export const renderThumbnail = async (src: Buffer, w: number, q: number): Promise<Buffer> => {
  const sharp = await loadSharp();
  return sharp(src)
    .rotate() // honor EXIF orientation
    .resize({ width: w, withoutEnlargement: true })
    .jpeg({ quality: q, mozjpeg: true })
    .toBuffer();
};

export interface ThumbnailServiceOptions {
  cacheDir: string;
  fetchSource?: (url: string) => Promise<Buffer>;
  render?: (src: Buffer, w: number, q: number) => Promise<Buffer>;
  maxConcurrent?: number;
  maxQueue?: number;
  maxCacheBytes?: number;
  logger?: FastifyBaseLogger | null;
  now?: () => number;
}

export interface ThumbnailSweepResult {
  files: number;
  bytesBefore: number;
  bytesAfter: number;
  evicted: number;
  staleTmp: number;
}

export class ThumbnailService {
  private readonly inflight = new Map<string, Promise<Buffer>>();
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  // 디스크 사용량 추정 — 스캔 전엔 null. 쓰기마다 더해 상한을 넘으면 정리를 당긴다.
  private approxBytes: number | null = null;
  private sweeping: Promise<ThumbnailSweepResult> | null = null;
  private readonly maxConcurrent: number;
  private readonly maxQueue: number;
  private readonly maxCacheBytes: number;

  constructor(private readonly opts: ThumbnailServiceOptions) {
    this.maxConcurrent = opts.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
    this.maxQueue = opts.maxQueue ?? DEFAULT_MAX_QUEUE;
    this.maxCacheBytes = opts.maxCacheBytes ?? DEFAULT_MAX_CACHE_BYTES;
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  filePath(key: string): string {
    return join(this.opts.cacheDir, `${key}.jpg`);
  }

  async ensureDir(): Promise<void> {
    await mkdir(this.opts.cacheDir, { recursive: true });
  }

  // 캐시 히트면 열린 파일의 스트림. stat→createReadStream 사이에 정리가 지우는 경합을 피하려고
  // 먼저 연다(열린 핸들은 unlink 뒤에도 끝까지 읽힌다). 없으면 null.
  async openCached(key: string): Promise<ReadStream | null> {
    let fh;
    try {
      fh = await open(this.filePath(key), 'r');
    } catch {
      return null;
    }
    try {
      const st = await fh.stat();
      if (this.now() - st.mtimeMs > TOUCH_INTERVAL_MS) {
        const t = new Date(this.now());
        void utimes(this.filePath(key), t, t).catch(() => undefined);
      }
    } catch {
      // mtime 갱신은 정리 순서 최적화일 뿐 — 실패해도 서빙은 계속.
    }
    return fh.createReadStream();
  }

  // 미스 변환 — 같은 키는 진행 중 Promise 에 합류, 다른 키는 전역 동시성 슬롯을 기다린다.
  render(url: string, w: number, q: number, key: string): Promise<Buffer> {
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const job = this.renderSlot(url, w, q, key);
    const p = job.then((r) => r.out);
    this.inflight.set(key, p);
    // 캐시 파일이 rename 될 때까지 합류를 유지한다 — 응답은 먼저 나가지만, 그 사이 온 같은 키
    // 요청이 디스크 미스로 보고 다시 업스트림·변환을 돌지 않게.
    void job
      .then(
        (r) => r.written,
        () => undefined,
      )
      .finally(() => {
        if (this.inflight.get(key) === p) this.inflight.delete(key);
      });
    return p;
  }

  private async renderSlot(
    url: string,
    w: number,
    q: number,
    key: string,
  ): Promise<{ out: Buffer; written: Promise<void> }> {
    await this.acquire();
    try {
      const src = await (this.opts.fetchSource ?? fetchImageSource)(url);
      const out = await (this.opts.render ?? renderThumbnail)(src, w, q);
      // 캐시 쓰기는 응답을 막지 않는다 — 실패해도 이번 응답은 나간다.
      return { out, written: this.writeAtomic(key, out) };
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return;
    }
    if (this.waiters.length >= this.maxQueue) throw new ThumbnailBusyError();
    // release 가 슬롯을 그대로 넘겨준다(active 유지) — 새로 온 요청이 새치기하지 못한다.
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.active -= 1;
  }

  // tmp → rename 원자 쓰기. 같은 키 동시 미스가 같은 파일을 덮어쓰거나, 히트 경로가 반쯤 쓴 JPEG 를
  // 30일 immutable 로 내보내는 일을 막는다.
  private async writeAtomic(key: string, buf: Buffer): Promise<void> {
    const file = this.filePath(key);
    const tmp = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(tmp, buf);
      await rename(tmp, file);
      this.noteWrite(buf.byteLength);
    } catch (e) {
      this.opts.logger?.warn({ err: e, file }, 'thumbnail cache write failed');
      await unlink(tmp).catch(() => undefined);
    }
  }

  private noteWrite(bytes: number): void {
    if (this.approxBytes === null) return;
    this.approxBytes += bytes;
    if (this.approxBytes > this.maxCacheBytes) void this.sweep();
  }

  // 디스크 용량 정리(주기 작업 + 쓰기로 상한 초과 시). 동시에 한 번만 돈다.
  sweep(): Promise<ThumbnailSweepResult> {
    this.sweeping ??= this.runSweep()
      .catch((e: unknown) => {
        this.opts.logger?.warn({ err: e }, '[thumbnail] cache sweep failed');
        return { files: 0, bytesBefore: 0, bytesAfter: 0, evicted: 0, staleTmp: 0 };
      })
      .finally(() => {
        this.sweeping = null;
      });
    return this.sweeping;
  }

  private async runSweep(): Promise<ThumbnailSweepResult> {
    let names: string[];
    try {
      names = await readdir(this.opts.cacheDir);
    } catch {
      this.approxBytes = 0;
      return { files: 0, bytesBefore: 0, bytesAfter: 0, evicted: 0, staleTmp: 0 };
    }
    const entries: Array<{ name: string; size: number; mtimeMs: number }> = [];
    let staleTmp = 0;
    const now = this.now();
    for (let i = 0; i < names.length; i += SCAN_STAT_CONCURRENCY) {
      const batch = names.slice(i, i + SCAN_STAT_CONCURRENCY);
      await Promise.all(
        batch.map(async (name) => {
          const p = join(this.opts.cacheDir, name);
          try {
            const st = await stat(p);
            if (!st.isFile()) return;
            if (name.endsWith('.tmp')) {
              if (now - st.mtimeMs > STALE_TMP_MS) {
                await unlink(p).catch(() => undefined);
                staleTmp += 1;
              }
              return;
            }
            entries.push({ name, size: st.size, mtimeMs: st.mtimeMs });
          } catch {
            // 스캔 중 지워진 파일 — 무시.
          }
        }),
      );
    }
    const bytesBefore = entries.reduce((s, e) => s + e.size, 0);
    let total = bytesBefore;
    let evicted = 0;
    if (total > this.maxCacheBytes) {
      const target = Math.floor(this.maxCacheBytes * LOW_WATER_RATIO);
      entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
      for (const e of entries) {
        if (total <= target) break;
        try {
          await unlink(join(this.opts.cacheDir, e.name));
          total -= e.size;
          evicted += 1;
        } catch {
          // 이미 지워짐 — 다음으로.
        }
      }
    }
    this.approxBytes = total;
    const result = { files: entries.length - evicted, bytesBefore, bytesAfter: total, evicted, staleTmp };
    if (evicted > 0 || staleTmp > 0) {
      this.opts.logger?.info(result, '[thumbnail] cache sweep done');
    }
    return result;
  }
}
