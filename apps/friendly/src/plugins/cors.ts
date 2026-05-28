import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import { env, isDev } from '../config/env.js';

// RFC1918 사설 IP origin (Expo Web 을 폰/태블릿에서 LAN IP 로 볼 때 등) —
// dev 에서만 자동 허용. localhost/127.0.0.1 도 같이 매칭.
const PRIVATE_LAN_ORIGIN =
  /^https?:\/\/(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?::\d+)?$/;

export default fp(async (app) => {
  const allowList =
    env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((o) => o.trim());

  if (isDev) {
    // dev — env 명시 list + 사설 LAN IP origin 자동 허용. .env 에 IP 박지 않아도
    // 모바일 단말이 LAN IP 로 Expo Web 에 붙을 때 friendly API 가 같은 LAN IP
    // 로 호출돼 통과.
    await app.register(cors, {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowList === true) return cb(null, true);
        if (allowList.includes(origin)) return cb(null, true);
        if (PRIVATE_LAN_ORIGIN.test(origin)) return cb(null, true);
        return cb(new Error(`CORS blocked: ${origin}`), false);
      },
      credentials: true,
    });
    return;
  }

  await app.register(cors, { origin: allowList, credentials: true });
});
