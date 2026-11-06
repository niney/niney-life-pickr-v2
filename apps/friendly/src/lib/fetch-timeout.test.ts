import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchWithTimeout } from './fetch-timeout.js';

// 타임아웃이 응답 헤더까지가 아니라 본문 읽기까지 덮는지 — 예전엔 헤더가 오면 타이머를 풀어, 본문이 오다 멈추면
// res.text() 가 undici 기본 본문 타임아웃(300초)까지 매달렸다.
describe('fetchWithTimeout', () => {
  let server: Server;
  let base = '';

  beforeAll(async () => {
    server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      if (req.url === '/stall') {
        res.write('part'); // 헤더와 본문 일부만 보내고 멈춘다
        return;
      }
      res.end('ok');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  it('본문이 오다 멈추면 본문 읽기도 타임아웃에 끊긴다', async () => {
    const res = await fetchWithTimeout(`${base}/stall`, {}, 300);
    expect(res.status).toBe(200);
    const started = Date.now();
    await expect(res.text()).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(3_000);
  });

  it('제때 오면 그대로 읽히고, 다 읽은 뒤 울리는 타이머는 아무 일도 하지 않는다', async () => {
    const res = await fetchWithTimeout(`${base}/ok`, {}, 100);
    expect(await res.text()).toBe('ok');
    await new Promise((resolve) => setTimeout(resolve, 150));
  });

  it('연결 실패는 그대로 던진다', async () => {
    await expect(fetchWithTimeout('http://127.0.0.1:1/', {}, 1_000)).rejects.toThrow();
  });
});
