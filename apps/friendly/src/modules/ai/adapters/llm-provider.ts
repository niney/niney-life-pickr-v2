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
  temperature?: number;
  maxTokens?: number;
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
