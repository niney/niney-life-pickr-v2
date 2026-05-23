// Provider-agnostic LLM contract. Concrete adapters (ollama-cloud, openai, …)
// implement this so the service layer never imports a vendor SDK directly.
// New providers slot in by adding an adapter + extending the LlmProviderId
// enum in @repo/api-contract.

export interface LLMCompleteOptions {
  prompt: string;
  systemPrompt?: string;
  // Resolved model id (e.g. 'gpt-oss:20b'), not the alias. Alias→id mapping
  // happens in AiService before calling the adapter.
  model: string;
  // Base64-encoded image payloads attached to the user prompt. Vision
  // models read these alongside the text. Ollama 의 /api/chat 은
  // messages[i].images 로 받는다 — 'data:...' 접두는 제거하고 순수 base64
  // 만 전달. 어댑터가 vision 미지원 모델에 대해 이 필드를 무시할지 에러로
  // 다룰지는 어댑터 구현에 맡긴다.
  images?: string[];
  temperature?: number;
  maxTokens?: number;
  // 입력 컨텍스트 윈도우 토큰 수. Ollama의 num_ctx 기본값이 2048이라
  // 긴 리뷰가 잘리는 사고가 자주 난다. 분석 작업처럼 입력이 큰 경우
  // 명시해야 한다. 다른 어댑터는 무시.
  numCtx?: number;
  // JSON 출력 강제. 'json' 은 단순 JSON 모드, 객체는 JSON Schema로
  // 구조화 출력(스키마와 일치하는 토큰만 샘플링) 강제. Ollama는 둘 다
  // /api/chat 의 최상위 `format` 으로 받는다. 다른 어댑터는 무시하거나
  // 자체 매핑.
  format?: 'json' | Record<string, unknown>;
  signal?: AbortSignal;
}

export interface LLMCompleteResult {
  text: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface LLMProvider {
  complete(opts: LLMCompleteOptions): Promise<LLMCompleteResult>;
  // Optional — providers that can enumerate their model catalog return the
  // model ids; others omit this method and the route layer treats that as
  // "no list available" (clients fall back to free-text entry).
  listModels?(): Promise<string[]>;
}

// --- Errors ---------------------------------------------------------------

export class LLMTimeoutError extends Error {
  constructor(message = 'LLM request timed out') {
    super(message);
    this.name = 'LLMTimeoutError';
  }
}

export class LLMUpstreamError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'LLMUpstreamError';
  }
}

export class LLMInvalidResponseError extends Error {
  constructor(message = 'LLM returned an unexpected response shape') {
    super(message);
    this.name = 'LLMInvalidResponseError';
  }
}

export class LLMCancelledError extends Error {
  constructor(message = 'LLM request was cancelled') {
    super(message);
    this.name = 'LLMCancelledError';
  }
}
