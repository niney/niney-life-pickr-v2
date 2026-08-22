import { env } from '../../config/env.js';
import type { LlmProviderEnv } from './ai.config.service.js';

// .env → LlmProviderEnv. AiConfigService 를 조립하는 모든 곳(라우트·플러그인·
// 스크립트·research 프로브)이 이 한 곳을 쓴다 — purpose 가 늘 때 defaultModels
// 리터럴을 파일마다 고치지 않게. 키·baseUrl·timeout·동시성은 계정(chat) 공통,
// 기본 모델만 용도별 OLLAMA_*_MODEL 로 나뉜다.
// 테스트는 .env 를 읽지 않고 가짜 LlmProviderEnv 를 직접 만든다
// (ai.config.service.test.ts 참고).
export const buildLlmProviderEnv = (): LlmProviderEnv => ({
  apiKey: env.OLLAMA_CLOUD_API_KEY,
  baseUrl: env.OLLAMA_CLOUD_BASE_URL,
  timeoutMs: env.OLLAMA_CLOUD_TIMEOUT_MS,
  maxConcurrent: env.OLLAMA_CLOUD_MAX_CONCURRENT,
  defaultModels: {
    chat: env.OLLAMA_DEFAULT_MODEL,
    image: env.OLLAMA_IMAGE_MODEL,
    'log-analysis': env.OLLAMA_LOG_ANALYSIS_MODEL,
    'meal-photo': env.OLLAMA_MEAL_PHOTO_MODEL,
    'meal-recommend': env.OLLAMA_MEAL_RECOMMEND_MODEL,
  },
});
