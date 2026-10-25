import fp from 'fastify-plugin';
import { env } from '../config/env.js';
import { AirQualityService } from '../modules/air-quality/air-quality.service.js';

// 에어코리아 대기정보 서비스를 app 전역 singleton 으로 decorate — 대기 라우트와 등산 오늘의 조건(가까운 측정소·예보)이 같은
// 캐시·in-flight·일일 쿼터·실패 쿨다운을 공유한다(날씨 plugins/weather.ts 와 같은 까닭, C-5). DB 를 쓰지 않는다.
export default fp(
  async (app) => {
    app.decorate('airQuality', new AirQualityService({ serviceKey: env.DATA_GO_KR_API_KEY }));
  },
  { name: 'air-quality' },
);

declare module 'fastify' {
  interface FastifyInstance {
    airQuality: AirQualityService;
  }
}
