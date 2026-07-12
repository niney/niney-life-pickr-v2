// AbortController 기반 타임아웃 fetch — 외부(LLM/임베딩 등) 호출이 무기한 매달려
// 요청 스레드/배치 파이프라인을 블로킹하지 않게 한다. 타임아웃 시 fetch 가
// AbortError 로 reject 되므로 호출부의 기존 try/catch 가 그대로 처리한다.
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
