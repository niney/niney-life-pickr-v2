import fp from 'fastify-plugin';
import { env } from '../config/env.js';
import { WeatherService } from '../modules/weather/weather.service.js';

// 기상청 날씨 서비스를 app 전역 singleton 으로 decorate — 날씨 라우트와 식단 추천(현재 기온·강수)이 같은
// 캐시·in-flight·일일 쿼터·실패 쿨다운을 공유한다. 라우트마다 따로 만들면 쿼터 카운터가 둘이라 합계가 실한도
// (서비스별 10,000)를 넘고 같은 격자를 두 번 받았다(C-5). DB 를 쓰지 않아 의존 플러그인이 없다.
export default fp(
  async (app) => {
    app.decorate('weather', new WeatherService({ serviceKey: env.DATA_GO_KR_API_KEY }));
  },
  { name: 'weather' },
);

declare module 'fastify' {
  interface FastifyInstance {
    weather: WeatherService;
  }
}
