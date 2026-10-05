import { request as httpRequest, type ClientRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { AsyncGate } from '../../lib/async-gate.js';
import { createRestoreIntake } from './meal-restore-intake.js';

// 복원 입구 게이트 — 본문을 읽기 전에 전역 자리를 잡는지(기다리는 요청은 파싱을 시작하지 않음), 자리를 못 잡으면 본문
// 없이 503, 선언 크기 초과는 자리를 잡지 않고 413, 응답·오류·연결 끊김·멈춘 업로드 뒤에 자리가 남지 않는지를 작은
// Fastify 앱으로 고정한다. 끊김·멈춤은 실제 소켓이 있어야 해서 listen 한 서버에 직접 요청한다.

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}
const deferred = (): Deferred => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const until = async (cond: () => boolean, ms = 3_000): Promise<void> => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('조건을 기다리다 시간 초과');
    await new Promise((r) => setTimeout(r, 5));
  }
};

const MAX_BODY = 10_000;

describe('createRestoreIntake', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => {
    await app?.close();
    app = null;
  });

  // parsed: 본문 파싱 단계에 들어간 요청 이름(입구를 지난 순서). holds: 핸들러에서 붙잡아 둘 요청.
  const build = async (gate: AsyncGate, opts: { waitMs?: number; bodyDeadlineMs?: number } = {}) => {
    const parsed: string[] = [];
    const holds = new Map<string, { entered: Deferred; release: Deferred }>();
    const hold = (name: string) => {
      const h = { entered: deferred(), release: deferred() };
      holds.set(name, h);
      return h;
    };
    const intake = createRestoreIntake({
      maxBodyBytes: MAX_BODY,
      busy: () => Object.assign(new Error('다른 복원 요청을 처리하고 있습니다.'), { statusCode: 503 }),
      gate,
      waitMs: opts.waitMs ?? 2_000,
      bodyDeadlineMs: opts.bodyDeadlineMs,
    });
    const server = Fastify();
    server.post('/restore', {
      bodyLimit: MAX_BODY,
      preParsing: [
        intake.hold,
        async (req) => {
          parsed.push(String(req.headers['x-name']));
        },
      ],
      preValidation: [intake.bodyReceived],
      onResponse: [intake.done],
      handler: async (req) => {
        const name = String(req.headers['x-name']);
        const h = holds.get(name);
        if (h) {
          h.entered.resolve();
          await h.release.promise;
        }
        if (name === 'boom') throw new Error('handler failed');
        return { name, keys: Object.keys(req.body as object).length };
      },
    });
    await server.ready();
    app = server;
    const send = (name: string, payload: object = { a: 1 }) =>
      server.inject({ method: 'POST', url: '/restore', headers: { 'x-name': name }, payload });
    return { server, parsed, hold, send };
  };

  it('자리를 기다리는 요청은 본문 파싱을 시작하지 않고, 앞 요청이 끝나면 차례로 들어간다', async () => {
    const gate = new AsyncGate(1, { maxQueue: 8 });
    const { parsed, hold, send } = await build(gate);
    const a = hold('A');
    const first = send('A');
    await a.entered.promise;
    const second = send('B');
    const third = send('C');
    await until(() => gate.queued === 2);
    // A 가 응답할 때까지 B·C 는 입구에 서 있다 — 본문을 읽지 않았다.
    expect(parsed).toEqual(['A']);
    expect(gate.active).toBe(1);

    a.release.resolve();
    expect((await first).statusCode).toBe(200);
    expect((await second).json()).toEqual({ name: 'B', keys: 1 });
    expect((await third).statusCode).toBe(200);
    expect(parsed).toEqual(['A', 'B', 'C']);
    expect(gate.active).toBe(0);
    expect(gate.queued).toBe(0);
  });

  it('대기열이 가득하거나 기다려도 자리가 없으면 본문을 읽지 않고 503 — 연결을 닫게 한다', async () => {
    const gate = new AsyncGate(1, { maxQueue: 1 });
    const { parsed, hold, send } = await build(gate, { waitMs: 40 });
    const a = hold('A');
    const first = send('A');
    await a.entered.promise;
    const waiting = send('B');
    await until(() => gate.queued === 1);
    // 대기열(1)이 찼다 — 바로 거절.
    const full = await send('C');
    expect(full.statusCode).toBe(503);
    expect(full.headers.connection).toBe('close');
    expect(full.json<{ message: string }>().message).toContain('다른 복원 요청');
    // 기다리던 B 도 waitMs 뒤 거절.
    const timedOut = await waiting;
    expect(timedOut.statusCode).toBe(503);
    expect(timedOut.headers.connection).toBe('close');
    expect(parsed).toEqual(['A']);

    a.release.resolve();
    expect((await first).statusCode).toBe(200);
    expect(gate.active).toBe(0);
    // 거절된 요청이 자리를 남기지 않아 다음 요청은 바로 들어간다.
    expect((await send('D')).statusCode).toBe(200);
  });

  it('선언 크기가 한도를 넘으면 자리를 잡지 않는다 — 자리가 차 있어도 기다리지 않고 413', async () => {
    const gate = new AsyncGate(1, { maxQueue: 0 });
    const { hold, send } = await build(gate);
    const a = hold('A');
    const first = send('A');
    await a.entered.promise;
    const big = await send('BIG', { blob: 'x'.repeat(MAX_BODY) });
    expect(big.statusCode).toBe(413);
    expect(gate.queued).toBe(0);
    a.release.resolve();
    expect((await first).statusCode).toBe(200);
  });

  it('핸들러가 실패해도 자리를 돌려준다', async () => {
    const gate = new AsyncGate(1, { maxQueue: 0 });
    const { send } = await build(gate);
    expect((await send('boom')).statusCode).toBe(500);
    expect(gate.active).toBe(0);
    expect((await send('next')).statusCode).toBe(200);
  });

  describe('실제 소켓', () => {
    const listen = async (server: FastifyInstance): Promise<number> => {
      await server.listen({ port: 0, host: '127.0.0.1' });
      return (server.server.address() as AddressInfo).port;
    };
    // 본문 일부만 보내고 멈춘 요청(선언 길이는 200바이트).
    const partial = (port: number, name: string): ClientRequest => {
      const req = httpRequest({
        host: '127.0.0.1',
        port,
        path: '/restore',
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': '200', 'x-name': name },
      });
      req.on('error', () => undefined);
      req.write('{"a":');
      return req;
    };

    it('자리를 기다리다 연결을 끊은 요청은 자리를 받자마자 돌려준다', async () => {
      const gate = new AsyncGate(1, { maxQueue: 8 });
      const { server, parsed, hold, send } = await build(gate);
      const port = await listen(server);
      const a = hold('A');
      const first = send('A');
      await a.entered.promise;
      const gone = partial(port, 'GONE');
      await until(() => gate.queued === 1);
      gone.destroy();
      // 끊긴 것이 서버에 닿을 시간을 준 뒤 A 를 끝낸다 — 대기열의 자리가 끊긴 요청에 넘어간다.
      await new Promise((r) => setTimeout(r, 50));
      a.release.resolve();
      expect((await first).statusCode).toBe(200);
      await until(() => gate.active === 0 && gate.queued === 0);
      expect(parsed).toEqual(['A']);
      expect((await send('next')).statusCode).toBe(200);
    });

    it('자리를 잡고 본문을 다 보내지 않으면 기한 뒤 연결을 끊고 자리를 돌려준다 — 본문이 다 온 요청은 기한과 무관', async () => {
      const gate = new AsyncGate(1, { maxQueue: 8 });
      const { server, hold, send } = await build(gate, { bodyDeadlineMs: 80 });
      const port = await listen(server);
      const stalled = partial(port, 'STALLED');
      const closed = deferred();
      stalled.on('close', closed.resolve);
      await until(() => gate.active === 1);
      await closed.promise;
      await until(() => gate.active === 0);

      // 본문이 다 온 뒤 처리가 기한보다 오래 걸려도 끊지 않는다.
      const slow = hold('SLOW');
      const res = send('SLOW');
      await slow.entered.promise;
      await new Promise((r) => setTimeout(r, 160));
      slow.release.resolve();
      expect((await res).statusCode).toBe(200);
      expect(gate.active).toBe(0);
    });
  });
});
