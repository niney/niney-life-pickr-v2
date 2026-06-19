import fp from 'fastify-plugin';
import { Cron } from 'croner';
import { AiConfigService } from '../modules/ai/ai.config.service.js';
import { LogAnalysisService } from '../modules/logs/log-analysis.service.js';
import {
  OperationLogService,
  cleanupExpiredOperationLogs,
  sweepStaleOperationRuns,
} from '../modules/logs/operation-log.service.js';
import { env } from '../config/env.js';

// 범용 작업 로그 — OperationLogService(run/스텝 기록) 와 LogAnalysisService
// (실패 run LLM 분석) 를 app 전역 singleton 으로 decorate 한다. 모든 기능
// 계측과 logs.route 가 같은 인스턴스를 공유해야 seq 카운터/in-flight 가드가
// 한 곳에 모인다.
//
// 의존: prisma. dependencies 선언으로 autoload 가 prisma 를 선행 등록한다 —
// 알파벳순('logs' < 'prisma') 이라 선언이 빠지면 부팅이 깨진다.
// 자체 AiConfigService 를 만든다 (plugins/schedule.ts 관례) — app.aiConfig 는
// summaries 가 decorate 하는데 'logs' < 'summaries' 라 재사용 불가.
export default fp(
  async (app) => {
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
    const logAnalysis = new LogAnalysisService(app.prisma, aiConfig, {
      logger: app.log,
    });
    const operationLog = new OperationLogService(app.prisma, {
      logger: app.log,
      logAnalysis,
    });

    app.decorate('operationLog', operationLog);
    app.decorate('logAnalysis', logAnalysis);

    // 부팅 sweep + 보존 정리(cron + 부팅 직후 1회). 테스트에선 스킵 —
    // 공유 dev.db 의 다른 테스트 데이터를 건드리면 안 된다.
    if (process.env.NODE_ENV !== 'test') {
      await sweepStaleOperationRuns(app.prisma, app.log);

      const retentionCron = new Cron(
        '0 4 * * *',
        { timezone: 'Asia/Seoul', name: 'logs-retention', unref: true, catch: true },
        () => {
          void cleanupExpiredOperationLogs(app.prisma, app.log).catch((err) => {
            app.log.error({ err }, '[operation-log] retention cleanup failed');
          });
        },
      );
      void cleanupExpiredOperationLogs(app.prisma, app.log).catch((err) => {
        app.log.error({ err }, '[operation-log] retention cleanup failed');
      });

      app.addHook('onClose', async () => {
        retentionCron.stop();
      });
    }
  },
  { name: 'logs', dependencies: ['prisma'] },
);

declare module 'fastify' {
  interface FastifyInstance {
    operationLog: OperationLogService;
    logAnalysis: LogAnalysisService;
  }
}
