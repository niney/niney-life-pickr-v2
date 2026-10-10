import fp from 'fastify-plugin';
import { isTest } from '../config/env.js';
import { AiConfigService } from '../modules/ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../modules/ai/llm-provider-env.js';
import { CanonicalService } from '../modules/canonical/canonical.service.js';
import { ProposalService } from '../modules/canonical/proposal.service.js';
import { CrawlService } from '../modules/crawl/crawl.service.js';
import { jobRegistry } from '../modules/crawl/job-registry.js';
import { NaverMenuBoardReader } from '../modules/menu-board/menu-board.naver.js';
import { MenuBoardService } from '../modules/menu-board/menu-board.service.js';
import { RestaurantService } from '../modules/restaurant/restaurant.service.js';

// CrawlService 를 app 전역 singleton 으로 — 크롤 라우트·자동 발견·여행 시드 등록·랜덤 크롤이
// 한 인스턴스를 공유해야 결과 캐시와 actor 대기열이 하나다. 예전엔 4곳이 각자 만들어
// 대기열이 갈라졌고(다른 인스턴스 잡이 슬롯을 쓰는 동안 큐에 든 크롤이 영영 시작되지 않음),
// 랜덤 크롤·자동 발견은 요약·검색 서비스까지 따로 조립해 요약 중지·enrich 중복 가드·
// enrich 완료→군집화 체인이 앱 singleton(plugins/summaries.ts)과 끊겨 있었다.
//
// 의존: prisma, logs(operationLog — SSE seq 단일 카운터), summaries(app.summaries — 요약
// 종료 훅의 enrich 가 app.reviewSearch 로 흘러 군집화 체인까지 이어진다).
export default fp(
  async (app) => {
    const restaurants = new RestaurantService(app.prisma);
    const canonical = new CanonicalService(app.prisma);
    const crawl = new CrawlService(
      restaurants,
      app.summaries,
      jobRegistry,
      new ProposalService(app.prisma, canonical),
      canonical,
      app.operationLog,
      // 크롤 뒤 메뉴판 사진 자동 읽기(purpose menu-board) — 테스트에선 외부 사진·모델을 부르지 않게 끈다.
      isTest
        ? null
        : new NaverMenuBoardReader(
            restaurants,
            new MenuBoardService(new AiConfigService(app.prisma, buildLlmProviderEnv())),
          ),
    );
    app.decorate('crawl', crawl);
  },
  { name: 'crawl', dependencies: ['prisma', 'logs', 'summaries'] },
);

declare module 'fastify' {
  interface FastifyInstance {
    crawl: CrawlService;
  }
}
