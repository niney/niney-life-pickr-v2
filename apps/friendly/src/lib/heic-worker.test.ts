import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import heicConvert from 'heic-convert';
import { HeicDecodeError, convertHeicToJpeg, readHeifImageSize } from './heic-worker.js';

// 120×90 HEIC(정산 영수증 테스트와 같은 픽스처).
const SAMPLE = new URL('../modules/settlement-extraction/__fixtures__/sample.heic', import.meta.url);

describe('heic-worker', () => {
  it('디코드 없이 컨테이너의 ispe 로 해상도를 읽고, HEIF 가 아니면 null', async () => {
    const heic = await readFile(SAMPLE);
    expect(readHeifImageSize(heic)).toEqual({ width: 120, height: 90 });
    expect(readHeifImageSize(Buffer.from('not an image at all'))).toBeNull();
    // 박스 크기가 범위를 넘는 깨진 입력도 예외 없이 null.
    const broken = Buffer.from(heic);
    broken.writeUInt32BE(0x7fffffff, 0x24); // meta 박스 크기
    expect(readHeifImageSize(broken)).toBeNull();
  });

  it('워커에서 변환한 JPEG 은 heic-convert 를 직접 부른 결과와 바이트가 같다', async () => {
    const heic = await readFile(SAMPLE);
    const viaWorker = await convertHeicToJpeg(heic, { quality: 0.92 });
    const direct = Buffer.from(await heicConvert({ buffer: heic, format: 'JPEG', quality: 0.92 }));
    expect(viaWorker.equals(direct)).toBe(true);
    expect(viaWorker.subarray(0, 2).toString('hex')).toBe('ffd8');
  });

  it('해상도 상한을 넘으면 디코드 전에 too_large, 해상도를 못 읽으면 invalid', async () => {
    const heic = await readFile(SAMPLE);
    await expect(convertHeicToJpeg(heic, { maxPixels: 100 * 80 })).rejects.toMatchObject({
      code: 'too_large',
    });
    await expect(convertHeicToJpeg(Buffer.from('....ftypheic'))).rejects.toBeInstanceOf(HeicDecodeError);
    await expect(convertHeicToJpeg(Buffer.from('....ftypheic'))).rejects.toMatchObject({ code: 'invalid' });
  });
});
