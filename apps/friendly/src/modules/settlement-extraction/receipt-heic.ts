import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';

// 영수증 HEIC(아이폰 앨범 원본, HEVC) → JPEG. sharp 프리빌드는 HEVC 를 못 풀어 heic-convert(libheif wasm +
// jpeg-js, 순수 JS)를 쓰는데, 요청 스레드에서 돌리면 12MP 한 장에 이벤트 루프가 ~1초 멈추고 wasm 선형
// 메모리는 줄지 않는다(작은 픽스처로도 4회에 RSS +74MB). 그래서 거부하지 않고(웹이 accept 에 image/heic 를
// 명시) 일회용 worker 에서 풀고 끝나면 종료해 wasm 메모리를 돌려준다 — 동시 1개, 대기열은 짧게.

// 아이폰 24MP(5712×4284)까지 받는다. 48MP 는 디코드 메모리가 수백 MB 라 거부한다.
export const MAX_HEIC_PIXELS = 25_000_000;
const DECODE_TIMEOUT_MS = 30_000;
const MAX_WAITING = 4;
const JPEG_QUALITY = 0.92;

export class HeicBusyError extends Error {
  constructor() {
    super('heic decode queue full');
    this.name = 'HeicBusyError';
  }
}

// 워커 본문(CommonJS eval). tsup 은 워커 파일을 따로 내보내지 않으므로 문자열로 두고, heic-convert 는
// 부모가 푼 절대 경로로 불러 빌드 산출물 위치와 무관하게 한다.
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const convert = require(workerData.modulePath);
convert({ buffer: workerData.input, format: 'JPEG', quality: workerData.quality })
  .then((out) => {
    const bytes = new Uint8Array(out.byteLength);
    bytes.set(out);
    parentPort.postMessage({ ok: true, bytes }, [bytes.buffer]);
  })
  .catch((e) => {
    parentPort.postMessage({ ok: false, error: String((e && e.message) || e) });
  });
`;

let modulePath: string | null = null;
const heicConvertPath = (): string =>
  (modulePath ??= createRequire(import.meta.url).resolve('heic-convert'));

let active = false;
const waiters: Array<() => void> = [];

const acquire = async (): Promise<void> => {
  if (!active) {
    active = true;
    return;
  }
  if (waiters.length >= MAX_WAITING) throw new HeicBusyError();
  await new Promise<void>((resolve) => waiters.push(resolve));
};

const release = (): void => {
  const next = waiters.shift();
  if (next) next();
  else active = false;
};

const runWorker = (input: Buffer, timeoutMs: number): Promise<Buffer> =>
  new Promise<Buffer>((resolve, reject) => {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: { modulePath: heicConvertPath(), input: new Uint8Array(input), quality: JPEG_QUALITY },
    });
    let settled = false;
    const finish = (err: Error | null, out?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // 결과를 받았든 실패했든 종료 — 워커 isolate 와 함께 wasm 메모리가 반환된다.
      void worker.terminate();
      if (err) reject(err);
      else resolve(out!);
    };
    const timer = setTimeout(() => finish(new Error('heic decode timeout')), timeoutMs);
    worker.once('message', (msg: { ok: boolean; bytes?: Uint8Array; error?: string }) => {
      if (msg.ok && msg.bytes) {
        finish(null, Buffer.from(msg.bytes.buffer, msg.bytes.byteOffset, msg.bytes.byteLength));
      } else {
        finish(new Error(msg.error ?? 'heic decode failed'));
      }
    });
    worker.once('error', (e) => finish(e));
    worker.once('exit', (code) => finish(new Error(`heic worker exited (${code})`)));
  });

// 동시 1개로 줄 세워 worker 에서 디코드. 대기열이 차 있으면 HeicBusyError.
export const decodeHeicToJpeg = async (
  input: Buffer,
  opts: { timeoutMs?: number } = {},
): Promise<Buffer> => {
  await acquire();
  try {
    return await runWorker(input, opts.timeoutMs ?? DECODE_TIMEOUT_MS);
  } finally {
    release();
  }
};

// HEIF 컨테이너의 이미지 크기(ispe 속성 중 가장 큰 것) — 디코드 전에 해상도를 확인한다. 최상위 meta 박스
// 안에서만 찾는다(mdat 의 우연한 바이트 오검출 방지). 못 찾으면 null.
export const heifDimensions = (buf: Buffer): { width: number; height: number } | null => {
  let off = 0;
  while (off + 8 <= buf.length) {
    let size = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    let header = 8;
    if (size === 1) {
      if (off + 16 > buf.length) return null;
      size = Number(buf.readBigUInt64BE(off + 8));
      header = 16;
    } else if (size === 0) {
      size = buf.length - off;
    }
    if (size < header) return null;
    const end = Math.min(buf.length, off + size);
    if (type === 'meta') return largestIspe(buf, off + header, end);
    off += size;
  }
  return null;
};

const largestIspe = (
  buf: Buffer,
  start: number,
  end: number,
): { width: number; height: number } | null => {
  let best: { width: number; height: number } | null = null;
  let i = buf.indexOf('ispe', start, 'latin1');
  while (i !== -1 && i + 16 <= end) {
    // [size=20][ispe][version/flags 4][width 4][height 4]
    if (i >= 4 && buf.readUInt32BE(i - 4) === 20) {
      const width = buf.readUInt32BE(i + 8);
      const height = buf.readUInt32BE(i + 12);
      if (!best || width * height > best.width * best.height) best = { width, height };
    }
    i = buf.indexOf('ispe', i + 4, 'latin1');
  }
  return best;
};
