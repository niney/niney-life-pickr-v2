import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

// 게이트 자리는 워커가 실제로 끝난 뒤에 돌려준다 — 결과 메시지만 받고 돌려주면 다음 사진의 워커가 이전 워커의
// libheif wasm 메모리가 반환되기 전에 떠 '동시 1건' 상한이 잠깐 깨진다. 워커를 가짜로 바꿔 종료 시점을 쥔다
// (실제 변환 결과는 heic-worker.test.ts 가 본다).

const workers: FakeWorker[] = [];

class FakeWorker extends EventEmitter {
  private finishTerminate!: (code: number) => void;
  readonly terminated = new Promise<number>((resolve) => {
    this.finishTerminate = resolve;
  });
  terminateCalls = 0;

  constructor() {
    super();
    workers.push(this);
    queueMicrotask(() => this.emit('message', { ok: true, data: new Uint8Array([0xff, 0xd8]) }));
  }

  terminate(): Promise<number> {
    this.terminateCalls += 1;
    return this.terminated;
  }

  exitNow(): void {
    this.finishTerminate(1);
  }
}

vi.mock('node:worker_threads', () => ({ Worker: FakeWorker }));

const SAMPLE = new URL('../modules/settlement-extraction/__fixtures__/sample.heic', import.meta.url);

describe('heic-worker 게이트 반환 시점', () => {
  it('결과를 받아도 워커 종료가 끝나기 전에는 넘기지 않고, 다음 변환의 워커도 띄우지 않는다', async () => {
    const { convertHeicToJpeg } = await import('./heic-worker.js');
    const heic = await readFile(SAMPLE);
    let firstDone = false;
    const first = convertHeicToJpeg(heic).then((b) => {
      firstDone = true;
      return b;
    });
    const second = convertHeicToJpeg(heic);
    await vi.waitFor(() => expect(workers[0]?.terminateCalls).toBe(1)); // 결과 메시지를 받아 종료를 시작했다
    await new Promise((r) => setTimeout(r, 20));
    expect(firstDone).toBe(false);
    expect(workers).toHaveLength(1); // 두 번째 사진은 아직 자리를 기다린다

    workers[0]!.exitNow();
    expect((await first).toString('hex')).toBe('ffd8');
    await vi.waitFor(() => expect(workers).toHaveLength(2));
    await vi.waitFor(() => expect(workers[1]?.terminateCalls).toBe(1));
    workers[1]!.exitNow();
    expect((await second).toString('hex')).toBe('ffd8');
  });
});
