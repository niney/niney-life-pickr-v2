/**
 * HEIC/HEIF → JPEG 변환을 worker_threads 에서 한다(식단 사진 업로드 폴백용, 영수증 경로에서도 재사용 가능).
 *
 * sharp 프리빌드는 HEVC 를 디코드하지 못해 HEIC 는 heic-convert(libheif wasm + JS JPEG 인코더)로 바꾸는데, 요청
 * 스레드에서 돌리면 12MP 한 장이 이벤트 루프를 0.6~1.1초 막고, libheif wasm 선형 메모리는 줄지 않아 큰 사진 한 장이
 * RSS 를 수백 MB 남긴다. 그래서
 *   1) 디코드 전에 컨테이너의 ispe 박스로 해상도를 읽어 maxPixels 를 넘으면 거절한다(압축 폭탄 방지).
 *   2) 작업마다 새 워커에서 변환하고 끝나면 워커를 종료한다 — wasm 메모리는 워커가 끝나야 반환된다.
 *   3) 프로세스 전역 동시 1건(대기열 8, 대기 60초)으로 피크를 한 장 수준에 묶는다.
 * 결과 바이트는 heic-convert({ format: 'JPEG', quality }) 와 같다(같은 heic-decode 첫 이미지 + jpeg-js 인코드).
 * 무거운 모듈은 워커 안에서만 불러오므로 이 파일을 import 해도 기저 메모리가 늘지 않는다.
 */
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { AsyncGate, GateBusyError } from './async-gate.js';

// 아이폰 기본(12MP·24MP) HEIC 는 받고 48MP 이상은 거절한다 — 24MP 디코드 피크가 약 +350MB 다.
export const HEIC_MAX_PIXELS = 25_000_000;
const HEIC_TIMEOUT_MS = 30_000;
const HEIC_GATE_WAIT_MS = 60_000;
const heicGate = new AsyncGate(1, { maxQueue: 8 });

export class HeicDecodeError extends Error {
  constructor(
    readonly code: 'invalid' | 'too_large' | 'busy' | 'timeout',
    message: string,
  ) {
    super(message);
    this.name = 'HeicDecodeError';
  }
}

interface Box {
  type: string;
  start: number;
  end: number;
  body: number;
}

// ISOBMFF 박스 목록 — 크기가 범위를 넘거나 깨졌으면 거기서 멈춘다(신뢰할 수 없는 입력).
const readBoxes = (buf: Buffer, start: number, end: number): Box[] => {
  const out: Box[] = [];
  let at = start;
  while (at + 8 <= end) {
    let size = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    let header = 8;
    if (size === 1) {
      if (at + 16 > end) break;
      const large = buf.readBigUInt64BE(at + 8);
      if (large > BigInt(end - at)) break;
      size = Number(large);
      header = 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < header || at + size > end) break;
    out.push({ type, start: at, end: at + size, body: at + header });
    at += size;
  }
  return out;
};

/**
 * HEIF 컨테이너가 선언한 이미지 해상도 중 가장 큰 것(meta → iprp → ipco → ispe). 주 이미지(그리드)가 보통 가장
 * 크고 타일·썸네일·보조 이미지는 작다. 박스를 못 찾으면 null — 해상도를 알 수 없는 입력은 디코드하지 않는다.
 */
export const readHeifImageSize = (buf: Buffer): { width: number; height: number } | null => {
  const meta = readBoxes(buf, 0, buf.length).find((box) => box.type === 'meta');
  if (!meta) return null;
  // meta 는 FullBox — 버전·플래그 4바이트 뒤에 자식 박스가 온다.
  const iprp = readBoxes(buf, meta.body + 4, meta.end).find((box) => box.type === 'iprp');
  if (!iprp) return null;
  const ipco = readBoxes(buf, iprp.body, iprp.end).find((box) => box.type === 'ipco');
  if (!ipco) return null;
  let best: { width: number; height: number } | null = null;
  for (const box of readBoxes(buf, ipco.body, ipco.end)) {
    if (box.type !== 'ispe' || box.body + 12 > box.end) continue;
    // ispe 도 FullBox — 버전·플래그 4바이트 뒤 width·height(u32).
    const width = buf.readUInt32BE(box.body + 4);
    const height = buf.readUInt32BE(box.body + 8);
    if (!best || width * height > best.width * best.height) best = { width, height };
  }
  return best;
};

// 워커 본문(CommonJS, eval) — 번들러·테스트 변환기와 무관하게 같은 코드가 돈다.
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const decode = require(workerData.decodePath);
const jpeg = require(workerData.jpegPath);
(async () => {
  const input = Buffer.from(workerData.input.buffer, workerData.input.byteOffset, workerData.input.byteLength);
  const images = await decode.all({ buffer: input });
  try {
    const first = images[0];
    if (!first) throw new Error('HEIF image not found');
    if (first.width * first.height > workerData.maxPixels) {
      parentPort.postMessage({ ok: false, code: 'too_large', width: first.width, height: first.height });
      return;
    }
    const image = await first.decode();
    const out = jpeg.encode({ data: image.data, width: image.width, height: image.height }, workerData.quality);
    parentPort.postMessage({ ok: true, data: out.data });
  } finally {
    images.dispose();
  }
})().catch((e) => parentPort.postMessage({ ok: false, code: 'error', message: String((e && e.message) || e) }));
`;

let modulePaths: { decodePath: string; jpegPath: string } | null = null;
const resolveModulePaths = (): { decodePath: string; jpegPath: string } => {
  if (modulePaths) return modulePaths;
  // heic-convert 와 같은 heic-decode·jpeg-js 를 쓴다(결과 바이트를 같게).
  const heicConvert = createRequire(import.meta.url).resolve('heic-convert');
  const fromConvert = createRequire(heicConvert);
  modulePaths = { decodePath: fromConvert.resolve('heic-decode'), jpegPath: fromConvert.resolve('jpeg-js') };
  return modulePaths;
};

const tooLarge = (width: number, height: number, maxPixels: number): HeicDecodeError =>
  new HeicDecodeError(
    'too_large',
    `사진 해상도가 너무 큽니다(${width}×${height}). 최대 약 ${Math.floor(maxPixels / 10_000).toLocaleString('ko-KR')}만 화소까지 받을 수 있어요.`,
  );

const runWorker = (
  input: Buffer,
  opts: { quality: number; maxPixels: number; timeoutMs: number },
): Promise<Buffer> =>
  new Promise<Buffer>((resolve, reject) => {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: {
        ...resolveModulePaths(),
        input,
        maxPixels: opts.maxPixels,
        quality: Math.floor(opts.quality * 100),
      },
      // JS 인코더 버퍼의 안전망. 픽셀·wasm 메모리는 V8 힙 밖이라 위 해상도 검사가 실제 상한이다.
      resourceLimits: { maxOldGenerationSizeMb: 512 },
    });
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
      // 끝나면 바로 종료해 libheif wasm 메모리를 돌려준다.
      void worker.terminate();
    };
    const timer = setTimeout(
      () => finish(() => reject(new HeicDecodeError('timeout', 'HEIC 변환 시간이 너무 오래 걸립니다.'))),
      opts.timeoutMs,
    );
    worker.once('message', (msg: { ok: boolean; data?: Uint8Array; code?: string; message?: string; width?: number; height?: number }) => {
      finish(() => {
        if (msg.ok && msg.data) {
          resolve(Buffer.from(msg.data.buffer, msg.data.byteOffset, msg.data.byteLength));
        } else if (msg.code === 'too_large') {
          reject(tooLarge(msg.width ?? 0, msg.height ?? 0, opts.maxPixels));
        } else {
          reject(new HeicDecodeError('invalid', msg.message ?? 'HEIC 변환 실패'));
        }
      });
    });
    worker.once('error', (err) => finish(() => reject(new HeicDecodeError('invalid', err.message))));
    worker.once('exit', (code) =>
      finish(() => reject(new HeicDecodeError('invalid', `HEIC 변환 워커가 종료됐습니다(${code}).`))),
    );
  });

/**
 * HEIC/HEIF 바이트 → JPEG(heic-convert 와 같은 결과). 해상도가 maxPixels 를 넘으면 too_large, 컨테이너에서
 * 해상도를 못 읽으면 invalid, 대기열이 가득하거나 오래 기다리면 busy.
 */
export async function convertHeicToJpeg(
  input: Buffer,
  opts: { quality?: number; maxPixels?: number; timeoutMs?: number } = {},
): Promise<Buffer> {
  const maxPixels = opts.maxPixels ?? HEIC_MAX_PIXELS;
  const size = readHeifImageSize(input);
  if (!size) throw new HeicDecodeError('invalid', 'HEIF 해상도 정보를 찾을 수 없습니다.');
  if (size.width * size.height > maxPixels) throw tooLarge(size.width, size.height, maxPixels);

  let release: () => void;
  try {
    release = await heicGate.acquire(HEIC_GATE_WAIT_MS);
  } catch (e) {
    if (e instanceof GateBusyError) {
      throw new HeicDecodeError('busy', '사진 변환 대기열이 가득 찼습니다. 잠시 뒤 다시 시도해 주세요.');
    }
    throw e;
  }
  try {
    return await runWorker(input, {
      quality: opts.quality ?? 0.92,
      maxPixels,
      timeoutMs: opts.timeoutMs ?? HEIC_TIMEOUT_MS,
    });
  } finally {
    release();
  }
}
