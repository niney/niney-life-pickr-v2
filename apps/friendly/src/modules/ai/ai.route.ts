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
  LlmProviderConfig as LlmProviderConfigSchema,
  Routes,
  TestLlmProviderInput,
  TestLlmProviderResult,
  UpdateLlmProviderInput,
  type LlmProviderIdType,
  type TestLlmProviderResultType,
} from '@repo/api-contract';

const AiRoutes = Routes.Ai;
import { env } from '../../config/env.js';
import { OllamaCloudAdapter } from './adapters/ollama-cloud.adapter.js';
import type { LLMProvider } from './adapters/llm-provider.js';
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

// One adapter per (provider, key, baseUrl, maxConcurrent) tuple. Cached so
// multiple in-flight requests share the same FIFO concurrency gate. When
// admin updates the config, the cache key changes and a fresh adapter is
// created on the next call — old waiters simply finish on the prior gate.
class AdapterCache {
  private cached: { key: string; adapter: OllamaCloudAdapter } | null = null;

  get(resolved: ResolvedProviderConfig): LLMProvider {
    const key = `${resolved.apiKey}|${resolved.baseUrl}|${resolved.maxConcurrent}|${resolved.timeoutMs}`;
    if (this.cached?.key === key) return this.cached.adapter;
    const adapter = new OllamaCloudAdapter({
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl,
      timeoutMs: resolved.timeoutMs,
      maxConcurrent: resolved.maxConcurrent,
    });
    this.cached = { key, adapter };
    return adapter;
  }
}

const ProviderParams = z.object({ id: LlmProviderId });

const aiRoutes: FastifyPluginAsync = async (app) => {
  const config = new AiConfigService(app.prisma, buildEnvBlock());
  const cache = new AdapterCache();

  // Lazy provider — picked per-request so config changes (incl. maxConcurrent)
  // take effect without server restart.
  const buildService = async (): Promise<{ service: AiService; resolved: ResolvedProviderConfig | null }> => {
    const resolved = await config.getResolved('ollama-cloud');
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

  typed.delete(AiRoutes.provider(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: ProviderParams,
    },
    handler: async (req, reply) => {
      await config.remove(req.params.id as LlmProviderIdType);
      return reply.code(204).send();
    },
  });

  typed.put(AiRoutes.provider(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: ProviderParams,
      body: UpdateLlmProviderInput,
      response: { 200: LlmProviderConfigSchema },
    },
    handler: async (req) =>
      config.update(req.params.id as LlmProviderIdType, req.body, req.user.userId),
  });

  typed.get(AiRoutes.providerModels(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: ProviderParams,
      response: { 200: LlmModelListResult },
    },
    handler: async () => {
      // Best-effort — empty list is a valid response (no key, provider
      // doesn't support listing, network blip). Clients fall back to free
      // text entry rather than treating this as an error.
      const resolved = await config.getResolved('ollama-cloud');
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

  typed.post(AiRoutes.testProvider(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: ProviderParams,
      body: TestLlmProviderInput,
      response: { 200: TestLlmProviderResult },
    },
    handler: async (req): Promise<TestLlmProviderResultType> => {
      const resolved = await config.getResolved('ollama-cloud');
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
