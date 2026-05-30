import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import { env, isDev } from '../config/env.js';

// RFC1918 사설 IP origin (Expo Web 을 폰/태블릿에서 LAN IP 로 볼 때 등). dev 에선
// 모든 origin 을 허용하되, 이 패턴에 걸리는 "예상된" LAN origin 은 경고 로그를
// 생략하기 위한 분류용. localhost/127.0.0.1 포함.
const PRIVATE_LAN_ORIGIN =
  /^https?:\/\/(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?::\d+)?$/;

export default fp(async (app) => {
  const allowList =
    env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((o) => o.trim());

  if (isDev) {
    // dev — origin 을 제한하지 않는다. 개발 머신 IP 가 공인/사설/VPN/WSL 대역으로
    // 수시로 바뀌어 화이트리스트가 무의미하고, prod 는 아래 env list 로 엄격히
    // 막으므로 보안 영향도 없다. 예상 밖(비-LAN) origin 만 origin 당 1회 경고로
    // 가시화 — 오설정/오접속을 눈치챌 수 있게. (이전엔 비-LAN origin 을
    // cb(Error)로 거부 → 로그인 같은 preflight 요청이 통째로 깨졌다.)
    const warned = new Set<string>();
    await app.register(cors, {
      origin: (origin, cb) => {
        const known =
          !origin ||
          allowList === true ||
          allowList.includes(origin) ||
          PRIVATE_LAN_ORIGIN.test(origin);
        if (!known && origin && !warned.has(origin)) {
          warned.add(origin);
          app.log.warn(`CORS(dev): 비-LAN origin 반사 허용 — ${origin}`);
        }
        return cb(null, true);
      },
      credentials: true,
    });
    return;
  }

  await app.register(cors, { origin: allowList, credentials: true });
});
