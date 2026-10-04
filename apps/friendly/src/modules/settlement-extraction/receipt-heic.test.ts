import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { HeicBusyError, decodeHeicToJpeg, heifDimensions } from './receipt-heic.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(here, '__fixtures__', 'sample.heic'));

const box = (type: string, payload: Buffer): Buffer => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + payload.length, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, payload]);
};

const ispe = (w: number, h: number): Buffer => {
  const p = Buffer.alloc(12);
  p.writeUInt32BE(w, 4);
  p.writeUInt32BE(h, 8);
  return box('ispe', p);
};

// 선언된 해상도만 큰 가짜 HEIF — 디코드 전 해상도 검사 대상.
const fakeHeif = (w: number, h: number, mdat: Buffer = Buffer.alloc(16)): Buffer =>
  Buffer.concat([
    box('ftyp', Buffer.from('heic\0\0\0\0mif1heic', 'latin1')),
    box('meta', Buffer.concat([Buffer.alloc(4), box('iprp', box('ipco', Buffer.concat([ispe(512, 512), ispe(w, h)])))])),
    box('mdat', mdat),
  ]);

describe('heifDimensions', () => {
  it('실제 아이폰 HEIC 픽스처의 ispe 를 읽는다', () => {
    expect(heifDimensions(fixture)).toEqual({ width: 120, height: 90 });
  });

  it('여러 ispe(타일·그리드) 중 가장 큰 것을 고른다', () => {
    expect(heifDimensions(fakeHeif(8064, 6048))).toEqual({ width: 8064, height: 6048 });
  });

  it('meta 밖(mdat 등)의 우연한 ispe 바이트는 무시한다', () => {
    const decoy = Buffer.concat([Buffer.alloc(8), ispe(50_000, 50_000)]);
    expect(heifDimensions(fakeHeif(100, 100, decoy))).toEqual({ width: 512, height: 512 });
  });

  it('HEIF 가 아니거나 meta 가 없으면 null', () => {
    expect(heifDimensions(Buffer.from('not an image at all'))).toBeNull();
    expect(heifDimensions(box('ftyp', Buffer.from('heic')))).toBeNull();
  });
});

describe('decodeHeicToJpeg (worker)', () => {
  it('워커에서 JPEG 로 변환한다', async () => {
    const out = await decodeHeicToJpeg(fixture);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(120);
  });

  it('동시 1개 + 대기 4개를 넘는 요청은 HeicBusyError, 나머지는 모두 끝난다', async () => {
    const jobs = Array.from({ length: 6 }, () => decodeHeicToJpeg(fixture));
    const settled = await Promise.allSettled(jobs);
    const busy = settled.filter((s) => s.status === 'rejected');
    expect(busy).toHaveLength(1);
    expect((busy[0] as PromiseRejectedResult).reason).toBeInstanceOf(HeicBusyError);
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(5);
  }, 30_000);

  it('디코드 실패는 오류로 끝나고 다음 작업을 막지 않는다', async () => {
    await expect(decodeHeicToJpeg(fakeHeif(10, 10))).rejects.toThrow();
    await expect(decodeHeicToJpeg(fixture)).resolves.toBeInstanceOf(Buffer);
  }, 30_000);
});
