import { HEIC_MAX_PIXELS, HeicDecodeError, convertHeicToJpeg, readHeifImageSize } from '../../lib/heic-worker.js';

// 영수증 HEIC(아이폰 앨범 원본, HEVC) → JPEG. sharp 프리빌드는 HEVC 를 못 풀어 heic-convert(libheif wasm + jpeg-js)를
// 쓰는데, 요청 스레드에서 돌리면 12MP 한 장에 이벤트 루프가 ~1초 멈추고 wasm 메모리가 남는다. 거부하지 않고(웹이 accept
// 에 image/heic 를 명시) 식단 사진과 같은 공용 워커(lib/heic-worker)에서 푼다 — 프로세스 전역 동시 1건을 식단·영수증이
// 함께 써서 디코드 피크(24MP ≈ +350MB)가 겹치지 않는다(예전엔 게이트가 따로라 두 장이 동시에 풀릴 수 있었다).

// 아이폰 24MP(5712×4284)까지 받는다. 48MP 는 디코드 메모리가 수백 MB 라 거부한다.
export const MAX_HEIC_PIXELS = HEIC_MAX_PIXELS;
const JPEG_QUALITY = 0.92;

export class HeicBusyError extends Error {
  constructor() {
    super('heic decode queue full');
    this.name = 'HeicBusyError';
  }
}

// 공용 워커로 변환. 대기열이 가득하면 HeicBusyError, 그 밖의 실패는 그대로 던진다(호출자가 invalid_image 로).
export const decodeHeicToJpeg = async (input: Buffer, opts: { timeoutMs?: number } = {}): Promise<Buffer> => {
  try {
    return await convertHeicToJpeg(input, { quality: JPEG_QUALITY, timeoutMs: opts.timeoutMs });
  } catch (e) {
    if (e instanceof HeicDecodeError && e.code === 'busy') throw new HeicBusyError();
    throw e;
  }
};

// HEIF 컨테이너가 선언한 이미지 크기(meta 의 ispe 중 가장 큰 것) — 디코드 전 해상도 확인용. 못 찾으면 null.
export const heifDimensions = readHeifImageSize;
