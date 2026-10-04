import { LRUCache } from 'lru-cache';
import type satori from 'satori';
import type { SatoriOptions } from 'satori';
import type * as ResvgJs from '@resvg/resvg-js';
import type { ResvgRenderOptions } from '@resvg/resvg-js';

// 공유 이미지(PNG) 렌더 공용 — satori(레이아웃→SVG) + resvg(SVG→PNG). 타로·사주·사주(G)·정산 카드가 쓴다.
//
// - satori·resvg 는 첫 렌더 때 불러온다. 정적 import 면 부팅마다 외부 메모리 +16MB(yoga wasm 등)·import +0.1초였다
//   (perf-2 X-3, 운영 번들 실측). 첫 렌더가 import 를 떠안아도 글꼴·래스터 개선으로 예전 첫 렌더보다 빠르다.
// - 래스터는 resvg 의 renderAsync — libuv 스레드풀에서 파싱·래스터한다. 동기 render() 는 미스마다 이벤트 루프를
//   0.3~0.7초 막았다(X-V1). 남는 메인 스레드 몫은 satori 레이아웃과 PNG 인코딩(asPng)뿐이다.
// - font.loadSystemFonts: false — 기본값(true)은 렌더마다 시스템 글꼴 수백 개를 읽어 생성자만 0.2~0.3초였다. satori 가
//   글자를 path 로 넣어(embedFont 기본값) SVG 에 <text> 가 없으므로 결과 픽셀은 같다(share-render.test 로 고정).
// - 렌더(satori+래스터)는 프로세스 전체에서 한 번에 하나. 스레드풀(기본 4)을 fs·sharp 와 나누고 픽스맵(story 8MB,
//   정산표 최대 16MB) 피크·잔존을 묶는다. 대기열이 넘치면 ShareRenderBusyError(라우트는 503) — 정상 트래픽은 닿지 않는다.
// - 픽스맵(RenderedImage)은 V8 이 모르는 네이티브 메모리라 GC 전까지 남는다(F-V1). 운영 Linux 에서 RSS 가 내려오지
//   않으면 할당자 설정(MALLOC_ARENA_MAX 등)을 검토한다 — 워커 스레드 할당이 스레드별 arena 에 남을 수 있다.

type Satori = typeof satori;

let satoriPromise: Promise<Satori> | null = null;
/** satori 기본 export — 첫 호출 때 불러와 프로세스 수명 동안 재사용(실패하면 다음 호출에 다시 시도). */
export function loadSatori(): Promise<Satori> {
  satoriPromise ??= import('satori').then(
    (m) => m.default,
    (err: unknown) => {
      satoriPromise = null;
      throw err;
    },
  );
  return satoriPromise;
}

/** satori 첫 인자 타입 — 카드 모듈의 { type, props } 트리를 넘길 때 쓴다. */
export type SatoriNode = Parameters<Satori>[0];
export type { SatoriOptions };

let resvgPromise: Promise<typeof ResvgJs> | null = null;
function loadResvg(): Promise<typeof ResvgJs> {
  resvgPromise ??= import('@resvg/resvg-js').catch((err: unknown) => {
    resvgPromise = null;
    throw err;
  });
  return resvgPromise;
}

/** SVG → PNG. 래스터는 스레드풀(renderAsync), 시스템 글꼴은 읽지 않는다. */
export async function svgToPng(svg: string, options: Omit<ResvgRenderOptions, 'font'> = {}): Promise<Buffer> {
  const { renderAsync } = await loadResvg();
  const image = await renderAsync(svg, { ...options, font: { loadSystemFonts: false } });
  // RenderedImage(픽스맵)는 네이티브 메모리라 참조가 끊긴 뒤 GC 가 돌아야 풀린다 — 인코딩한 PNG 만 들고 나간다.
  return image.asPng();
}

// ── 동시 상한 ──────────────────────────────────────────────────────────────────

// 동시 1 — 스레드풀에서 할당한 픽스맵은 GC 뒤에도 할당자에 남는 몫이 커서, 동시 2 면 100렌더 뒤 RSS 가 동시 1 보다
// 약 230MB 높았다(Windows 실측, 동시 1 은 예전 동기 렌더와 비슷). 대기열 16 이면 story 기준 최대 수 초 대기.
export const SHARE_RENDER_CONCURRENCY = 1;
export const SHARE_RENDER_MAX_WAITING = 16;

export class ShareRenderBusyError extends Error {
  constructor() {
    super('공유 이미지를 만드는 요청이 많아요. 잠시 후 다시 시도해 주세요.');
    this.name = 'ShareRenderBusyError';
  }
}

let active = 0;
const waiting: Array<() => void> = [];

/** 렌더 슬롯 안에서 fn 실행. 슬롯이 다 찼으면 줄을 서고, 줄도 꽉 찼으면 ShareRenderBusyError. */
export async function withShareRenderSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active < SHARE_RENDER_CONCURRENCY) {
    active += 1;
  } else {
    if (waiting.length >= SHARE_RENDER_MAX_WAITING) throw new ShareRenderBusyError();
    // 슬롯은 끝난 렌더가 직접 넘겨준다(active 그대로).
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  }
}

/** 테스트·측정용 — 지금 렌더 중인 수와 줄 선 수. */
export const shareRenderLoad = (): { active: number; waiting: number } => ({ active, waiting: waiting.length });

// ── PNG 캐시 ───────────────────────────────────────────────────────────────────

export const MB = 1024 * 1024;

/**
 * 렌더된 PNG 캐시 — 바이트 상한 LRU + TTL + 같은 키 진행 중 렌더 합류. 개수 상한이던 예전 캐시는 story PNG(1.3MB)
 * 100장이면 130MB 가 상주했다(F-3·X-4). 다섯 캐시 합계를 32MB 안팎으로 둔다.
 */
export class SharePngCache {
  private readonly lru: LRUCache<string, Buffer>;
  private readonly inflight = new Map<string, Promise<Buffer>>();

  constructor(opts: { maxBytes: number; ttlMs?: number }) {
    this.lru = new LRUCache<string, Buffer>({
      maxSize: opts.maxBytes,
      sizeCalculation: (png) => png.length,
      ...(opts.ttlMs ? { ttl: opts.ttlMs, ttlAutopurge: true } : {}),
    });
  }

  /** 캐시 히트면 그대로, 같은 키를 그리는 중이면 그 결과에 합류, 아니면 렌더 슬롯 안에서 새로 그린다. */
  get(key: string, render: () => Promise<Buffer>): Promise<Buffer> {
    const hit = this.lru.get(key);
    if (hit) return Promise.resolve(hit);
    const running = this.inflight.get(key);
    if (running) return running;
    const task: Promise<Buffer> = withShareRenderSlot(render)
      .then((png) => {
        // 그리는 사이 delete(취소 등)됐으면 캐시에 되살리지 않는다.
        if (this.inflight.get(key) === task) this.lru.set(key, png);
        return png;
      })
      .finally(() => {
        if (this.inflight.get(key) === task) this.inflight.delete(key);
      });
    this.inflight.set(key, task);
    return task;
  }

  delete(key: string): void {
    this.lru.delete(key);
    this.inflight.delete(key);
  }

  get size(): number {
    return this.lru.size;
  }

  get calculatedSize(): number {
    return this.lru.calculatedSize;
  }
}
