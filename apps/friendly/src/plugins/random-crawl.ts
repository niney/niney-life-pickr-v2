import fp from 'fastify-plugin';
import { AiConfigService } from '../modules/ai/ai.config.service.js';
import { CanonicalService } from '../modules/canonical/canonical.service.js';
import { ProposalService } from '../modules/canonical/proposal.service.js';
import { CrawlService } from '../modules/crawl/crawl.service.js';
import { jobRegistry } from '../modules/crawl/job-registry.js';
import { RestaurantService } from '../modules/restaurant/restaurant.service.js';
import { SummaryService } from '../modules/summary/summary.service.js';
import { ReviewSearchService } from '../modules/review-search/review-search.service.js';
import { TelegramService } from '../modules/telegram/telegram.service.js';
import { TelegramConfigService } from '../modules/settings/telegram-config.service.js';
import { RandomCrawlService } from '../modules/random-crawl/random-crawl.service.js';
import { env } from '../config/env.js';

// 맛집 자동 발굴(random-crawl) 스케줄러. RandomCrawlService 를 app 전역 singleton
// 으로 decorate — 라우트(설정/수동실행)와 부팅 cron tick + 텔레그램 폴러가 같은
// 인스턴스를 공유한다. cron 타이머는 scheduleRegistry(모듈 singleton)에 jobType
// 'random-crawl' 로 등록되어 schedule(정규화→머지)과 키만 다르게 공존한다.
//
// 의존: prisma, logs(operationLog). CrawlService/RestaurantService 등은 여기서
// 새로 조립한다(autoload 순서에 의존하지 않게) — jobRegistry 는 모듈 singleton
// 이라 다른 곳에서 만든 CrawlService 와 in-flight/dedup 상태를 공유한다.
export default fp(
  async (app) => {
    const restaurants = new RestaurantService(app.prisma);
    const aiConfig = new AiConfigService(app.prisma, {
      apiKey: env.OLLAMA_CLOUD_API_KEY,
      baseUrl: env.OLLAMA_CLOUD_BASE_URL,
      timeoutMs: env.OLLAMA_CLOUD_TIMEOUT_MS,
      maxConcurrent: env.OLLAMA_CLOUD_MAX_CONCURRENT,
      defaultModels: {
        chat: env.OLLAMA_DEFAULT_MODEL,
        image: env.OLLAMA_IMAGE_MODEL,
        'log-analysis': env.OLLAMA_LOG_ANALYSIS_MODEL,
      },
    });
    // 요약 완료 후 자동 enrich(관점/문맥/임베딩) 훅용 — 누락 시 이 경로(스케줄/
    // 지역랜덤/텔레그램 선택 크롤)로 만든 요약이 검색 불가 상태로 남는다.
    const reviewSearch = new ReviewSearchService(app.prisma, aiConfig);
    const summaries = new SummaryService(app.prisma, aiConfig, {
      logger: app.log,
      operationLog: app.operationLog,
      reviewSearch,
    });
    const canonical = new CanonicalService(app.prisma);
    const proposals = new ProposalService(app.prisma, canonical);
    const crawl = new CrawlService(
      restaurants,
      summaries,
      jobRegistry,
      proposals,
      canonical,
      app.operationLog,
    );
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
  { name: 'random-crawl', dependencies: ['prisma', 'logs'] },
);

declare module 'fastify' {
  interface FastifyInstance {
    randomCrawl: RandomCrawlService;
    telegram: TelegramService;
    telegramConfig: TelegramConfigService;
  }
}
