import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { isTest } from '../config/env.js';

// 레이트리밋 — 무인증 공개 표면(auth, 실시간 대중교통 프록시, 공개 질문/공유
// 조회)의 브루트포스·쿼터 소진·DoS 방어. 단일 인스턴스 전제(CLAUDE.md)라 기본
// in-memory 스토어로 충분 — Redis 불필요. 앞단 Cloudflare 가 광역 DDoS 를 흡수하고,
// 이 계층은 방어심층(defense-in-depth)이다.
//
// 실제 클라이언트 IP: 배포는 Cloudflare→nginx→앱(127.0.0.1:3000) 구성이라 app.ts
// 의 `trustProxy` 로 X-Forwarded-For 를 신뢰한다. nginx 가 공유링크 경로에서 이미
// 쓰는 `CF-Connecting-IP`(Cloudflare 원 클라이언트 IP)가 있으면 그걸 우선 —
// nginx 가 /api/ 에도 이 헤더를 넘기면 XFF 파싱보다 견고하다. 없으면 req.ip 폴백.
//
// ⚠️ 스푸핑 주의: :3000 을 nginx 우회로 직접 노출하면 XFF·CF-Connecting-IP 를
//    위조할 수 있으니 방화벽으로 :3000 을 loopback/nginx 로만 제한해야 한다.
const clientKey = (req: { headers: Record<string, unknown>; ip: string }): string => {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.length > 0) return cf;
  return req.ip;
};

// 라우트별 프리셋 — 각 route 파일이 `config: { rateLimit: RATE.xxx }` 로 오버라이드.
// 값은 방어심층 백스톱이며, 한국 모바일 CGNAT(한 IP 뒤 다수 사용자)를 고려해
// 정상 사용을 깨지 않는 선에서 잡았다. 계정 표적 브루트포스의 진짜 방어(이메일
// 기준 잠금)는 2차(인증 하드닝)에서 서비스 계층에 추가한다.
export const RATE = {
  // 로그인 — onRequest 단계라 body(email) 미파싱 → IP 키. CGNAT 고려 분당 20.
  authLogin: { max: 20, timeWindow: '1 minute' },
  // 가입 — 대량 계정 생성 봇 억제. CGNAT 고려 시간당 40(봇 플러드는 막고 정상 가입은 허용).
  authRegister: { max: 40, timeWindow: '1 hour' },
  // 실시간 대중교통 프록시(도착/위치/시간표) — 업스트림 일일 쿼터 보호. 30s 폴링
  // 다수 항목도 여유롭게 흡수(분당 60 = 30개 항목 동시 폴링분).
  transitRealtime: { max: 60, timeWindow: '1 minute' },
  // 공개 스마트 픽 — DB 2쿼리로 싸지만 무인증 POST. 재굴리기 연타 + CGNAT 고려 분당 60.
  publicPick: { max: 60, timeWindow: '1 minute' },
  // 공개 리뷰 질문 — 비싼 임베딩/LLM 파이프라인. 기존 인메모리 한도(15/분) 유지.
  publicAsk: { max: 15, timeWindow: '1 minute' },
  // 공개 공유 정산 조회 — 토큰 추측 억제. 기존 인메모리 한도(120/분) 유지.
  publicShare: { max: 120, timeWindow: '1 minute' },
} as const;

export default fp(async (app) => {
  // 테스트는 app.inject() 다수 요청이 같은 IP 키(127.0.0.1)로 누적돼 429 오탐을
  // 일으키므로 미등록. route 의 `config.rateLimit` 는 플러그인 부재 시 무해히 무시된다.
  // 실제 제한 동작은 실구동(dev/prod) 에서 검증한다.
  if (isTest) return;
  await app.register(rateLimit, {
    // 전역 백스톱 — 이미지 다수 로드 등 정상 버스트를 깨지 않게 관대하게(분당 1000).
    // 민감 라우트는 위 RATE 프리셋으로 route 단에서 강하게 조인다.
    global: true,
    max: 1000,
    timeWindow: '1 minute',
    keyGenerator: clientKey,
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `요청이 너무 많습니다. ${Math.ceil(context.ttl / 1000)}초 후 다시 시도해 주세요.`,
    }),
  });
});
