import { OllamaCloudAdapter } from './adapters/ollama-cloud.adapter.js';
import type { LLMProvider } from './adapters/llm-provider.js';
import type { ResolvedProviderConfig } from './ai.config.service.js';
import { accountGateRegistry, type AccountGateRegistry } from './concurrency-gate.js';
import { llmTelemetry } from './llm-telemetry.js';

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

  // 테스트에서 격리된 레지스트리를 주입할 수 있게. 기본은 모듈 싱글턴 —
  // 같은 API 키를 쓰는 purpose 들이 계정 게이트 하나를 공유해야 하므로
  // 레지스트리도 프로세스에 하나여야 한다.
  constructor(private readonly gates: AccountGateRegistry = accountGateRegistry) {}

  get(resolved: ResolvedProviderConfig): LLMProvider {
    const key = `${resolved.provider}|${resolved.purpose}|${resolved.apiKey}|${resolved.baseUrl}|${resolved.maxConcurrent}|${resolved.timeoutMs}`;
    const hit = this.cached.get(key);
    if (hit) return hit;
    const adapter = new OllamaCloudAdapter({
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl,
      timeoutMs: resolved.timeoutMs,
      maxConcurrent: resolved.maxConcurrent,
      // 캐시 키 회전(설정 변경)과 무관하게 레지스트리의 게이트가 유지되므로
      // 구·신 어댑터가 겹쳐도 계정 합산 동시성은 cap 을 넘지 않는다.
      accountGate: this.gates.get(resolved.apiKey, resolved.baseUrl),
      // 모든 LLM 호출이 이 한 곳을 지나므로 여기서 purpose 를 라벨링해
      // 텔레메트리로 흘리면 호출부 수정 없이 전 지점이 계측된다.
      onEvent: (e) => llmTelemetry.record(resolved.purpose, e),
    });
    llmTelemetry.registerPurposeGate(resolved.purpose, () => adapter.gateSnapshot());
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
