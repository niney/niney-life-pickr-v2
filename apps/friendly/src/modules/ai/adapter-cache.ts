import { OllamaCloudAdapter } from './adapters/ollama-cloud.adapter.js';
import type { LLMProvider } from './adapters/llm-provider.js';
import type { ResolvedProviderConfig } from './ai.config.service.js';

// Shared between ai.route (admin /complete, /complete-batch) and summary.service
// (background review summarization). Sharing matters because each adapter
// owns its FIFO concurrency gate — split caches would mean two parallel gates
// of size `maxConcurrent` instead of one, doubling effective fan-out.
export class AdapterCache {
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

// Module-level singleton — every importer sees the same cache instance.
export const adapterCache = new AdapterCache();
