import { OllamaCloudAdapter } from './adapters/ollama-cloud.adapter.js';
import type { LLMProvider } from './adapters/llm-provider.js';
import type { ResolvedProviderConfig } from './ai.config.service.js';

// Shared between ai.route (admin /complete, /complete-batch) and summary.service
// (background review summarization). Sharing matters because each adapter
// owns its FIFO concurrency gate — split caches would mean two parallel gates
// of size `maxConcurrent` instead of one, doubling effective fan-out.
//
// purpose 가 chat/image/log-analysis 로 늘면서 단일 슬롯이면 용도들이 서로
// 캐시를 밀어내 어댑터가 매번 재생성된다 — FIFO 게이트가 리셋되면 실효
// 동시성이 maxConcurrent 를 초과해 429 위험. 키별 Map 으로 용도별 어댑터를
// 공존시킨다. 상한은 키 회전 등으로 죽은 엔트리가 무한히 쌓이는 것만 막는
// 안전벨트 (정상 운영에선 용도 수 ≤ 3).
const MAX_ENTRIES = 8;

export class AdapterCache {
  private readonly cached = new Map<string, OllamaCloudAdapter>();

  get(resolved: ResolvedProviderConfig): LLMProvider {
    const key = `${resolved.provider}|${resolved.purpose}|${resolved.apiKey}|${resolved.baseUrl}|${resolved.maxConcurrent}|${resolved.timeoutMs}`;
    const hit = this.cached.get(key);
    if (hit) return hit;
    const adapter = new OllamaCloudAdapter({
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl,
      timeoutMs: resolved.timeoutMs,
      maxConcurrent: resolved.maxConcurrent,
    });
    if (this.cached.size >= MAX_ENTRIES) {
      // 삽입 순서 기준 가장 오래된 엔트리 제거 (Map 순회 = 삽입 순).
      const oldest = this.cached.keys().next().value;
      if (oldest !== undefined) this.cached.delete(oldest);
    }
    this.cached.set(key, adapter);
    return adapter;
  }
}

// Module-level singleton — every importer sees the same cache instance.
export const adapterCache = new AdapterCache();
