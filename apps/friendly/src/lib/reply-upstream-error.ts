import type { FastifyReply, FastifyRequest } from 'fastify';

// 대중교통(버스/지하철) 라우트 공통 — 의미있는 statusCode(404/502/503)를 라우트가
// 직접 응답하는 catch 블록의 단일 구현. 전역 error-handler 는 5xx 를 일괄 500 으로
// 뭉개므로 이 경로가 필요하다(각 route 파일 상단 주석 참조).
//
// 응답만 보내고 로그를 안 남기던 기존 catch 의 공백을 메운다: 5xx 는 warn 으로
// 어댑터 에러가 물고 온 진단 필드(키 마스킹 요청 URL, 업스트림 코드, 응답 원문
// 스니펫)까지 기록한다. 운영에서 "request completed 502" 한 줄만 남아 원인
// (네트워크 실패 vs 업스트림 503 vs 인증 vs 쿼터)을 구분 못 하던 문제의 해소.
// 404 는 클라이언트성(없는 역·노선)이라 로그 없이 응답만 한다.
//
// BusApiError/SubwayApiError 의 requestUrl 은 키를 '***' 마스킹한 로깅 전용
// 값이므로 그대로 실어도 안전하다. 평문 키 URL 은 애초에 보관되지 않는다.

const RESPONSE_SNIPPET_MAX = 300;

interface UpstreamishError {
  statusCode?: unknown;
  requestUrl?: unknown; // Bus/SubwayApiError — 키 마스킹본
  headerCd?: unknown; // BusApiError — 서울시 msgHeader 코드
  code?: unknown; // SubwayApiError — swopenAPI 결과 코드
  responseText?: unknown; // 비정상 응답 본문 원문
}

const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);

// e 의 statusCode 가 codes 에 있으면 (5xx 는 warn 로깅 후) 에러 응답을 보내고
// reply 를 반환, 아니면 null — 호출측은 null 이면 rethrow 한다.
export const replyUpstreamError = (
  req: FastifyRequest,
  reply: FastifyReply,
  e: unknown,
  codes: readonly number[],
  fallbackMessage: string,
): FastifyReply | null => {
  if (!(e instanceof Error)) return null;
  const err = e as Error & UpstreamishError;
  const sc = typeof err.statusCode === 'number' ? err.statusCode : null;
  if (sc === null || !codes.includes(sc)) return null;

  if (sc >= 500) {
    req.log.warn(
      {
        err,
        upstreamUrl: strOrNull(err.requestUrl),
        upstreamCode: strOrNull(err.headerCd) ?? strOrNull(err.code),
        responseSnippet: strOrNull(err.responseText)?.slice(0, RESPONSE_SNIPPET_MAX) ?? null,
      },
      fallbackMessage,
    );
  }

  return reply.code(sc).send({
    statusCode: sc,
    error: sc === 404 ? 'Not Found' : sc === 503 ? 'Service Unavailable' : 'Bad Gateway',
    message: err.message || fallbackMessage,
  });
};
