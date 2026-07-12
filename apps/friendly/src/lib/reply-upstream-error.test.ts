import { describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BusApiError } from '../modules/bus/bus-api.adapter.js';
import { replyUpstreamError } from './reply-upstream-error.js';

// req/reply 최소 목 — warn 캡처 + code().send() 체인 기록.
const makeReqReply = () => {
  const warn = vi.fn();
  const send = vi.fn();
  const code = vi.fn(() => ({ send }));
  const req = { log: { warn } } as unknown as FastifyRequest;
  const reply = { code } as unknown as FastifyReply;
  return { req, reply, warn, code, send };
};

describe('replyUpstreamError', () => {
  it('502 — warn 에 진단 필드(마스킹 URL·업스트림 코드·스니펫) 기록 후 응답', () => {
    const { req, reply, warn, code, send } = makeReqReply();
    const e = new BusApiError('bus api status 503', {
      requestUrl: 'http://ws.bus.go.kr/api/rest/x?serviceKey=***&arsId=02013',
      responseText: '<HTML>Service Temporarily Unavailable</HTML>',
    });

    const sent = replyUpstreamError(req, reply, e, [502, 503], '버스 도착정보 조회 실패');

    expect(sent).not.toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    const [fields, msg] = warn.mock.calls[0]!;
    expect(msg).toBe('버스 도착정보 조회 실패');
    expect(fields.err).toBe(e);
    expect(fields.upstreamUrl).toContain('serviceKey=***');
    expect(fields.responseSnippet).toContain('Service Temporarily Unavailable');
    expect(code).toHaveBeenCalledWith(502);
    expect(send).toHaveBeenCalledWith({
      statusCode: 502,
      error: 'Bad Gateway',
      message: 'bus api status 503',
    });
  });

  it('404 — 클라이언트성이라 로그 없이 응답만', () => {
    const { req, reply, warn, code } = makeReqReply();
    const e = Object.assign(new Error('없는 역'), { statusCode: 404 });

    expect(replyUpstreamError(req, reply, e, [404, 503], '조회 실패')).not.toBeNull();
    expect(warn).not.toHaveBeenCalled();
    expect(code).toHaveBeenCalledWith(404);
  });

  it('codes 밖 statusCode·비 Error 는 null — 호출측이 rethrow', () => {
    const { req, reply, warn } = makeReqReply();
    expect(replyUpstreamError(req, reply, new Error('plain'), [502], 'x')).toBeNull();
    expect(
      replyUpstreamError(req, reply, Object.assign(new Error('e'), { statusCode: 500 }), [502], 'x'),
    ).toBeNull();
    expect(replyUpstreamError(req, reply, 'not-error', [502], 'x')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('responseText 는 300자 스니펫으로 캡', () => {
    const { req, reply, warn } = makeReqReply();
    const e = new BusApiError('bus api status 503', { responseText: 'x'.repeat(1000) });

    replyUpstreamError(req, reply, e, [502], '버스 API 호출 실패');

    expect(warn.mock.calls[0]![0].responseSnippet).toHaveLength(300);
  });
});
