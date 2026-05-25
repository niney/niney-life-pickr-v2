import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AiCompleteBatchInput,
  AiCompleteBatchResult,
  AiCompleteInput,
  AiCompleteResult,
  LlmModelListResult,
  LlmProviderId,
  LlmProviderListResult,
  LlmProviderPurpose,
  LlmProviderConfig as LlmProviderConfigSchema,
  PreviewLlmModelsInput,
  PreviewLlmModelsResult,
  Routes,
  TestLlmProviderInput,
  TestLlmProviderResult,
  UpdateLlmProviderInput,
  type LlmProviderIdType,
  type LlmProviderPurposeType,
  type PreviewLlmModelsResultType,
  type TestLlmProviderResultType,
} from '@repo/api-contract';

const AiRoutes = Routes.Ai;
import { env } from '../../config/env.js';
import { adapterCache } from './adapter-cache.js';
import type { LLMProvider } from './adapters/llm-provider.js';
import { OllamaCloudAdapter } from './adapters/ollama-cloud.adapter.js';
import {
  AiConfigService,
  type LlmProviderEnv,
  type ResolvedProviderConfig,
} from './ai.config.service.js';
import { AiService, classifyError } from './ai.service.js';

const buildEnvBlock = (): LlmProviderEnv => ({
  apiKey: env.OLLAMA_CLOUD_API_KEY,
  baseUrl: env.OLLAMA_CLOUD_BASE_URL,
  timeoutMs: env.OLLAMA_CLOUD_TIMEOUT_MS,
  maxConcurrent: env.OLLAMA_CLOUD_MAX_CONCURRENT,
  defaultModel: env.OLLAMA_DEFAULT_MODEL,
});

const ProviderParams = z.object({ id: LlmProviderId, purpose: LlmProviderPurpose });

const aiRoutes: FastifyPluginAsync = async (app) => {
  const config = new AiConfigService(app.prisma, buildEnvBlock());
  const cache = adapterCache;

  // Lazy provider — picked per-request so config changes (incl. maxConcurrent)
  // take effect without server restart. /complete 류 admin 엔드포인트는 chat
  // purpose 만 사용한다.
  const buildService = async (): Promise<{ service: AiService; resolved: ResolvedProviderConfig | null }> => {
    const resolved = await config.getResolved('ollama-cloud', 'chat');
    if (!resolved) {
      // Sentinel provider: no key, every call should error early in AiService
      // before reaching here. We pass a stub that throws so accidental calls
      // are loud.
      const stub: LLMProvider = {
        complete: async () => {
          throw new Error('no provider configured');
        },
      };
      return { service: new AiService(stub, config), resolved: null };
    }
    return { service: new AiService(cache.get(resolved), config), resolved };
  };

  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(AiRoutes.complete, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      body: AiCompleteInput,
      response: { 200: AiCompleteResult },
    },
    handler: async (req) => {
      const { service } = await buildService();
      return service.complete(req.body, req.user.userId);
    },
  });

  typed.post(AiRoutes.completeBatch, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      body: AiCompleteBatchInput,
      response: { 200: AiCompleteBatchResult },
    },
    handler: async (req) => {
      const { service } = await buildService();
      return service.completeBatch(req.body, req.user.userId);
    },
  });

  typed.get(AiRoutes.providers, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: LlmProviderListResult },
    },
    handler: async () => ({ providers: await config.list() }),
  });

  typed.delete(AiRoutes.provider(':id', ':purpose'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: ProviderParams,
    },
    handler: async (req, reply) => {
      await config.remove(
        req.params.id as LlmProviderIdType,
        req.params.purpose as LlmProviderPurposeType,
      );
      return reply.code(204).send();
    },
  });

  typed.put(AiRoutes.provider(':id', ':purpose'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: ProviderParams,
      body: UpdateLlmProviderInput,
      response: { 200: LlmProviderConfigSchema },
    },
    handler: async (req) =>
      config.update(
        req.params.id as LlmProviderIdType,
        req.params.purpose as LlmProviderPurposeType,
        req.body,
        req.user.userId,
      ),
  });

  typed.get(AiRoutes.providerModels(':id', ':purpose'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: ProviderParams,
      response: { 200: LlmModelListResult },
    },
    handler: async (req) => {
      // Best-effort — empty list is a valid response (no key, provider
      // doesn't support listing, network blip). Clients fall back to free
      // text entry rather than treating this as an error.
      const resolved = await config.getResolved(
        req.params.id as LlmProviderIdType,
        req.params.purpose as LlmProviderPurposeType,
      );
      if (!resolved) return { models: [] };
      const provider = cache.get(resolved);
      if (typeof provider.listModels !== 'function') return { models: [] };
      try {
        const models = await provider.listModels();
        return { models };
      } catch {
        return { models: [] };
      }
    },
  });

  typed.post(AiRoutes.providerModelsPreview(':id', ':purpose'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: ProviderParams,
      body: PreviewLlmModelsInput,
      response: { 200: PreviewLlmModelsResult },
    },
    handler: async (req): Promise<PreviewLlmModelsResultType> => {
      // 저장 없이 입력 폼의 키로 직접 어댑터를 만들어 listModels 만 호출한다.
      // adapterCache 는 거치지 않는다 — 미저장 키를 캐시 키로 박으면 다른
      // 요청에서 의도치 않게 이 키를 쓰게 된다.
      const env = buildEnvBlock();
      const adapter = new OllamaCloudAdapter({
        apiKey: req.body.apiKey,
        baseUrl: req.body.baseUrl || env.baseUrl,
        timeoutMs: env.timeoutMs,
        maxConcurrent: env.maxConcurrent,
      });
      if (typeof adapter.listModels !== 'function') {
        return { ok: false, error: 'provider_unavailable', message: '이 provider 는 모델 목록을 지원하지 않습니다.' };
      }
      try {
        const models = await adapter.listModels();
        return { ok: true, models };
      } catch (e) {
        const { error, message } = classifyError(e);
        return { ok: false, error, message };
      }
    },
  });

  typed.post(AiRoutes.testProvider(':id', ':purpose'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: ProviderParams,
      body: TestLlmProviderInput,
      response: { 200: TestLlmProviderResult },
    },
    handler: async (req): Promise<TestLlmProviderResultType> => {
      const resolved = await config.getResolved(
        req.params.id as LlmProviderIdType,
        req.params.purpose as LlmProviderPurposeType,
      );
      if (!resolved) {
        return { ok: false, error: 'no_api_key', message: 'API 키가 설정되지 않았습니다.' };
      }
      // Test endpoint sends the supplied model id directly to the provider.
      // Falls back to the resolved defaultModel (DB row or env). Returns an
      // error result if neither side provided one — admin must supply a model.
      const modelId = req.body?.model?.trim() || resolved.defaultModel;
      if (!modelId) {
        return {
          ok: false,
          error: 'invalid_response',
          message: '모델이 지정되지 않았습니다. 기본 모델을 설정하거나 model 필드를 지정해 주세요.',
        };
      }
      const provider = cache.get(resolved);
      const startedAt = Date.now();
      try {
        const out = await provider.complete({ prompt: 'ping', model: modelId });
        return {
          ok: true,
          model: out.model,
          durationMs: Date.now() - startedAt,
          sample: out.text.slice(0, 200),
        };
      } catch (e) {
        const { error, message } = classifyError(e);
        return { ok: false, error, message };
      }
    },
  });
};

export default aiRoutes;
