import { afterEach, describe, expect, it, vi } from 'vitest';
import { RECEIPT_MAX_UPLOAD_BYTES, prepareReceiptImage } from './prepareReceiptImage';

// 업로드 전 영수증 사진 줄이기. 계약은 두 가지다:
//  - 줄일 수 있으면 장변 2000px JPEG 로 줄인 파일을 돌려준다(EXIF 방향은 <img> 디코드가
//    처리 — 여기선 가짜 디코더라 치수 계산과 호출 형태만 본다).
//  - 줄일 수 없거나 줄이면 안 되면(디코드 실패·canvas 없음·EXIF 방향을 적용하지 않는
//    브라우저·이미 작음) 원본을 그대로 돌려주고 throw 하지 않는다. jsdom 은
//    createObjectURL·img.decode·canvas 가 모두 없어 기본이 이 경로다.

const fileOfSize = (bytes: number, name = 'receipt.jpg', type = 'image/jpeg') =>
  new File([new Uint8Array(bytes)], name, { type });

// 브라우저의 디코드·canvas 를 흉내 낸다. decode 결과 치수와 toBlob 결과 크기를 정한다.
const installImagePipeline = (opts: {
  width: number;
  height: number;
  outBytes?: number;
  decodeFails?: boolean;
  exifAware?: boolean;
}) => {
  const drawImage = vi.fn();
  const created: HTMLCanvasElement[] = [];
  // EXIF 방향을 적용해 그리는 최신 브라우저로 가정(image-orientation: from-image 지원).
  vi.stubGlobal('CSS', { supports: () => opts.exifAware ?? true });
  // jsdom 엔 URL.createObjectURL·revokeObjectURL 도, HTMLImageElement 의 decode 도 없다 —
  // 직접 심고 테스트 뒤 되돌린다(URL 전역 자체는 바꾸지 않는다 — MSW 가 쓴다).
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: () =>
      opts.decodeFails ? Promise.reject(new DOMException('decode', 'EncodingError')) : Promise.resolve(),
  });
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(opts.width);
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(opts.height);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    created.push(this);
    return { drawImage, fillRect: vi.fn() };
  } as unknown as HTMLCanvasElement['getContext']);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb, type) => {
    cb(new Blob([new Uint8Array(opts.outBytes ?? 1000)], { type }));
  });
  return { drawImage, created };
};

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
});

describe('prepareReceiptImage', () => {
  it('디코드·canvas 가 없는 환경(jsdom 기본)에서는 원본을 그대로 돌려준다', async () => {
    const original = fileOfSize(3 * 1024 * 1024);
    expect(await prepareReceiptImage(original)).toBe(original);
  });

  it('큰 사진은 장변 2000px 로 비율을 유지해 JPEG 로 줄인다', async () => {
    const { drawImage, created } = installImagePipeline({ width: 4000, height: 3000 });
    const original = fileOfSize(4 * 1024 * 1024, 'IMG_0001.HEIC', 'image/heic');

    const out = await prepareReceiptImage(original);

    expect(out).not.toBe(original);
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('IMG_0001.jpg');
    expect(out.size).toBe(1000);
    expect(created).toHaveLength(1);
    expect([created[0]!.width, created[0]!.height]).toEqual([2000, 1500]);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2000, 1500);
    // 만든 object URL 은 끝나면 반드시 해제한다.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('세로로 긴 사진은 높이를 2000px 에 맞춘다', async () => {
    const { created } = installImagePipeline({ width: 3000, height: 6000 });

    await prepareReceiptImage(fileOfSize(4 * 1024 * 1024));

    expect([created[0]!.width, created[0]!.height]).toEqual([1000, 2000]);
  });

  it('이미 작은 사진(장변 2000px 이하·1MB 이하)은 다시 인코딩하지 않는다', async () => {
    const { created } = installImagePipeline({ width: 1600, height: 1200 });
    const original = fileOfSize(400 * 1024);

    expect(await prepareReceiptImage(original)).toBe(original);
    expect(created).toHaveLength(0);
  });

  it('치수는 작아도 용량이 크면(무압축 PNG 등) 확대 없이 JPEG 로만 바꾼다', async () => {
    const { created } = installImagePipeline({ width: 1600, height: 1200 });
    const original = fileOfSize(6 * 1024 * 1024, 'shot.png', 'image/png');

    const out = await prepareReceiptImage(original);

    expect(out.type).toBe('image/jpeg');
    expect([created[0]!.width, created[0]!.height]).toEqual([1600, 1200]);
    expect(out.size).toBeLessThanOrEqual(RECEIPT_MAX_UPLOAD_BYTES);
  });

  it('브라우저가 디코드하지 못하는 사진(크롬의 HEIC 등)은 원본으로 폴백한다', async () => {
    installImagePipeline({ width: 0, height: 0, decodeFails: true });
    const original = fileOfSize(2 * 1024 * 1024, 'IMG_0002.HEIC', 'image/heic');

    expect(await prepareReceiptImage(original)).toBe(original);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('EXIF 방향을 적용하지 않는 옛 브라우저에서는 줄이지 않는다(누운 영수증 방지)', async () => {
    const { created } = installImagePipeline({ width: 4000, height: 3000, exifAware: false });
    const original = fileOfSize(4 * 1024 * 1024);

    expect(await prepareReceiptImage(original)).toBe(original);
    expect(created).toHaveLength(0);
  });

  it('줄인 결과가 원본보다 크면 원본을 쓴다', async () => {
    installImagePipeline({ width: 4000, height: 3000, outBytes: 3 * 1024 * 1024 });
    const original = fileOfSize(2 * 1024 * 1024);

    expect(await prepareReceiptImage(original)).toBe(original);
  });
});
