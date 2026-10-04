import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { loadShareFallbackAsset, loadShareFonts } from './share-fonts.js';
import {
  SHARE_RENDER_CONCURRENCY,
  SHARE_RENDER_MAX_WAITING,
  SharePngCache,
  ShareRenderBusyError,
  shareRenderLoad,
  svgToPng,
  withShareRenderSlot,
} from './share-render.js';

// 공유 PNG 렌더 공용(perf-2 X-V1·F-2·F-3) — 시스템 글꼴을 끈 비동기 래스터가 예전 동기 래스터와 같은 PNG 인지,
// 래스터가 이벤트 루프 밖에서 도는지, 동시 상한·캐시(바이트 상한·같은 키 합류)가 지켜지는지.

const deferred = <T = void>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

// 공유 카드와 같은 재료 — 한글·한자(대체 글꼴)·그라디언트·테두리·이미지(data URI).
async function sampleSvg(width = 1080, height = 1920): Promise<string> {
  const jpeg = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#d9b65b' } }).jpeg().toBuffer();
  const node = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width,
        height,
        padding: 60,
        fontFamily: 'Plex',
        color: '#ece6d6',
        backgroundImage: 'radial-gradient(circle at 30% 20%, #141c46 0%, #070a1e 60%)',
      },
      children: [
        { type: 'div', props: { style: { display: 'flex', fontSize: 64, fontWeight: 700 }, children: '오늘의 카드 · 정관(正官)' } },
        { type: 'div', props: { style: { display: 'flex', fontSize: 34, marginTop: 20, lineHeight: 1.5 }, children: '곧은 무쇠처럼 흔들리지 않는 하루. 1,234,567원' } },
        {
          type: 'img',
          props: {
            src: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
            width: 240,
            height: 240,
            style: { width: 240, height: 240, borderRadius: 24, borderWidth: 3, borderStyle: 'solid', borderColor: '#d9b65b' },
          },
        },
      ],
    },
  };
  return satori(node as never, { width, height, fonts: await loadShareFonts(), loadAdditionalAsset: loadShareFallbackAsset });
}

describe('share-render', () => {
  it('satori SVG 는 글자를 path 로 넣는다 — 시스템 글꼴을 끈 비동기 래스터가 예전 동기 래스터와 같은 PNG', async () => {
    const svg = await sampleSvg(600, 400);
    expect(svg).not.toContain('<text');
    const opts = { fitTo: { mode: 'width' as const, value: 900 }, background: '#070a1e' };
    // 예전 경로 — 기본값 loadSystemFonts: true + 동기 render().
    const before = new Resvg(svg, opts).render().asPng();
    const after = await svgToPng(svg, opts);
    expect(after.equals(before)).toBe(true);
  });

  it('래스터는 스레드풀에서 돈다 — 렌더가 끝나기 전에 이벤트 루프가 다른 일을 한다', async () => {
    const svg = await sampleSvg();
    await svgToPng(svg); // resvg 지연 import 를 미리 끝낸다
    const order: string[] = [];
    const png = svgToPng(svg).then(() => order.push('png'));
    setImmediate(() => order.push('immediate'));
    await png;
    // 동기 render() 였다면 PNG 가 먼저 끝나고 나서야 setImmediate 가 돌았다.
    expect(order).toEqual(['immediate', 'png']);
  });

  it(`렌더 슬롯은 동시 ${SHARE_RENDER_CONCURRENCY}개, 대기열이 넘치면 ShareRenderBusyError`, async () => {
    const gates = Array.from({ length: SHARE_RENDER_CONCURRENCY + SHARE_RENDER_MAX_WAITING }, () => deferred());
    const started: number[] = [];
    const runs = gates.map((g, i) =>
      withShareRenderSlot(async () => {
        started.push(i);
        await g.promise;
        return i;
      }),
    );
    await new Promise((r) => setImmediate(r));
    expect(shareRenderLoad()).toEqual({ active: SHARE_RENDER_CONCURRENCY, waiting: SHARE_RENDER_MAX_WAITING });
    expect(started).toEqual(Array.from({ length: SHARE_RENDER_CONCURRENCY }, (_, i) => i));
    await expect(withShareRenderSlot(async () => 'over')).rejects.toBeInstanceOf(ShareRenderBusyError);
    // 하나가 끝나면 줄 선 다음 렌더가 그 슬롯을 받는다.
    gates[0]!.resolve();
    await runs[0];
    await new Promise((r) => setImmediate(r));
    expect(started).toContain(SHARE_RENDER_CONCURRENCY);
    expect(shareRenderLoad().active).toBe(SHARE_RENDER_CONCURRENCY);
    for (const g of gates) g.resolve();
    expect(await Promise.all(runs)).toEqual(gates.map((_, i) => i));
    expect(shareRenderLoad()).toEqual({ active: 0, waiting: 0 });
  });

  it('PNG 캐시 — 같은 키 동시 요청은 렌더 1번에 합류하고, 다음부터는 히트', async () => {
    const cache = new SharePngCache({ maxBytes: 1024 });
    let renders = 0;
    const gate = deferred();
    const render = async () => {
      renders += 1;
      await gate.promise;
      return Buffer.alloc(100, 1);
    };
    const a = cache.get('t:og', render);
    const b = cache.get('t:og', render);
    gate.resolve();
    const [pa, pb] = await Promise.all([a, b]);
    expect(renders).toBe(1);
    expect(pa).toBe(pb);
    expect(await cache.get('t:og', render)).toBe(pa);
    expect(renders).toBe(1);
  });

  it('PNG 캐시 — 바이트 상한을 넘기면 오래된 것부터 밀어내고, 그리는 중에 지우면 되살리지 않는다', async () => {
    const cache = new SharePngCache({ maxBytes: 250, ttlMs: 60_000 });
    for (const k of ['a', 'b', 'c']) await cache.get(k, async () => Buffer.alloc(100));
    expect(cache.calculatedSize).toBeLessThanOrEqual(250);
    expect(cache.size).toBe(2);
    let renders = 0;
    await cache.get('a', async () => {
      renders += 1;
      return Buffer.alloc(100);
    });
    expect(renders).toBe(1); // a 는 밀려나 다시 그렸다

    const gate = deferred();
    const pending = cache.get('revoked', async () => {
      await gate.promise;
      return Buffer.alloc(10);
    });
    cache.delete('revoked');
    gate.resolve();
    await pending;
    let again = 0;
    await cache.get('revoked', async () => {
      again += 1;
      return Buffer.alloc(10);
    });
    expect(again).toBe(1);
  });

  it('렌더가 실패하면 캐시하지 않고 다음 요청이 다시 그린다', async () => {
    const cache = new SharePngCache({ maxBytes: 1024 });
    await expect(cache.get('x', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(await cache.get('x', async () => Buffer.from('ok'))).toEqual(Buffer.from('ok'));
  });
});
