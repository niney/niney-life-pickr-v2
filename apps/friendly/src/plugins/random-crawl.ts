import fp from 'fastify-plugin';
import { RestaurantService } from '../modules/restaurant/restaurant.service.js';
import { TelegramService } from '../modules/telegram/telegram.service.js';
import { TelegramConfigService } from '../modules/settings/telegram-config.service.js';
import { RandomCrawlService } from '../modules/random-crawl/random-crawl.service.js';
import { env } from '../config/env.js';

// 맛집 자동 발굴(random-crawl) 스케줄러. RandomCrawlService 를 app 전역 singleton
// 으로 decorate — 라우트(설정/수동실행)와 부팅 cron tick + 텔레그램 폴러가 같은
// 인스턴스를 공유한다. cron 타이머는 scheduleRegistry(모듈 singleton)에 jobType
// 'random-crawl' 로 등록되어 schedule(정규화→머지)과 키만 다르게 공존한다.
//
// 의존: prisma, logs(operationLog), crawl(app.crawl — plugins/crawl.ts 의 전역
// singleton). 크롤은 그 인스턴스를 그대로 써야 요약 중지·enrich 중복 가드·enrich 완료
// →군집화 체인이 앱 singleton 과 이어지고 결과 캐시·대기열도 하나로 유지된다.
export default fp(
  async (app) => {
    const restaurants = new RestaurantService(app.prisma);
    const crawl = app.crawl;
    const telegram = new TelegramService({
      botToken: env.TELEGRAM_BOT_TOKEN,
      chatId: env.TELEGRAM_CHAT_ID,
      logger: app.log,
    });
    // 설정 화면(설정 > 텔레그램)이 쓰는 config 서비스 — 같은 telegram 인스턴스를
    // 공유해 저장 즉시 폴러에 반영된다. env 는 DB 행 없을 때의 fallback.
    const telegramConfig = new TelegramConfigService(app.prisma, telegram, {
      envBotToken: env.TELEGRAM_BOT_TOKEN,
      envChatId: env.TELEGRAM_CHAT_ID,
      logger: app.log,
    });
    const randomCrawl = new RandomCrawlService(app.prisma, {
      restaurants,
      crawl,
      telegram,
      logger: app.log,
      operationLog: app.operationLog,
    });

    app.decorate('randomCrawl', randomCrawl);
    app.decorate('telegram', telegram);
    app.decorate('telegramConfig', telegramConfig);

    // graceful shutdown — sweep 타이머/텔레그램 폴러 정지 + cron 해제 + abort.
    app.addHook('onClose', async () => {
      randomCrawl.shutdown();
    });
  },
  { name: 'random-crawl', dependencies: ['prisma', 'logs', 'crawl'] },
);

declare module 'fastify' {
  interface FastifyInstance {
    randomCrawl: RandomCrawlService;
    telegram: TelegramService;
    telegramConfig: TelegramConfigService;
  }
}
