import fp from 'fastify-plugin';
import cors, { type FastifyCorsOptions } from '@fastify/cors';
import { env, isDev } from '../config/env.js';

// CORS 정책 (2026-09-24 개방 — 사용자의 다른 프로젝트가 브라우저에서 이 API 를 직접 쓴다.
// 외부 사용 가이드: docs/api/README.md):
//  - 어드민(/api/v1/admin/**) 외 전부: CORS_ORIGIN='*'(기본)면 모든 origin 허용.
//    나중에 트래픽을 보고 좁히려면 CORS_ORIGIN 에 콤마 구분 목록을 넣는다(prod 에서만 적용).
//  - 어드민: prod 는 PUBLIC_ORIGIN 만. 웹은 API 와 같은 origin 이라 CORS 가 원래 불필요하고,
//    외부 origin 에 열 이유가 없다(방어심층). 어드민 라우트는 SSE 포함 전부 이 prefix 아래다.
//  - dev: 개발 머신 IP 가 LAN/VPN/WSL 로 수시로 바뀌어 목록이 무의미 — 전부 허용(어드민은 반사).
//
// credentials 는 끈다 — 인증은 Authorization: Bearer 헤더뿐이고(쿠키 세션 없음) 이 헤더는
// CORS credentials 대상이 아니다. '*' + credentials 조합은 브라우저가 거부하기도 하고,
// 나중에 쿠키가 생겨도 타 사이트가 그 쿠키로 호출하지 못하게 막아 둔다.
// Authorization·x-guest-key 등 요청 헤더는 allowedHeaders 미지정 → preflight 요청 헤더를 반사한다.

const ADMIN_PATH = /^\/api\/v1\/admin(?:\/|$)/;

// 쿼리 제거 + 퍼센트 디코딩 후 판정 — 라우터는 /api/v1/%61dmin 도 /api/v1/admin 으로 매칭하므로
// 원문 그대로 비교하면 어드민 판정이 빠질 수 있다.
export const isAdminPath = (url: string): boolean => {
  const raw = url.split('?', 1)[0] ?? '';
  let path = raw;
  try {
    path = decodeURIComponent(raw);
  } catch {
    // 잘못된 인코딩 — 원문으로 판정.
  }
  return ADMIN_PATH.test(path);
};

// 브라우저 JS 가 읽을 수 있게 노출할 응답 헤더 — 레이트리밋 잔량·재시도 시각.
const EXPOSED_HEADERS = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after'];

// preflight 캐시(초) — 정책을 좁혔을 때 10분 안에 반영되도록 짧게.
const PREFLIGHT_MAX_AGE = 600;

export const buildCorsPolicy = (opts: {
  dev: boolean;
  corsOrigin: string;
  publicOrigin: string;
}): { open: FastifyCorsOptions; admin: FastifyCorsOptions } => {
  const base = { credentials: false, exposedHeaders: EXPOSED_HEADERS, maxAge: PREFLIGHT_MAX_AGE };
  const list = opts.corsOrigin
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return {
    open: { ...base, origin: opts.dev || list.length === 0 || list.includes('*') ? '*' : list },
    admin: { ...base, origin: opts.dev ? true : [opts.publicOrigin.replace(/\/+$/, '')] },
  };
};

export default fp(async (app) => {
  const policy = buildCorsPolicy({ dev: isDev, corsOrigin: env.CORS_ORIGIN, publicOrigin: env.PUBLIC_ORIGIN });

  if (!isDev) {
    const open = policy.open.origin === '*' ? '모든 origin' : (policy.open.origin as string[]).join(', ');
    app.log.info(`CORS: 어드민 외 ${open} 허용, 어드민은 ${(policy.admin.origin as string[]).join(', ')} 만`);
  }

  await app.register(cors, {
    delegator: (req, cb) => cb(null, isAdminPath(req.url) ? policy.admin : policy.open),
  });
});
