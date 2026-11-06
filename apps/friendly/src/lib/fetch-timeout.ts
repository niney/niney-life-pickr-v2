// AbortController 기반 타임아웃 fetch — 외부(LLM/임베딩 등) 호출이 무기한 매달려
// 요청 스레드/배치 파이프라인을 블로킹하지 않게 한다. 타임아웃 시 fetch 가
// AbortError 로 reject 되므로 호출부의 기존 try/catch 가 그대로 처리한다.
//
// 타임아웃은 응답 헤더까지가 아니라 본문까지 덮는다. 예전엔 헤더가 오면 타이머를 풀어서, 본문이 오다 멈추면
// res.text()·json() 이 undici 기본 본문 타임아웃(300초)까지 매달렸다(산불위험예보 1.7MB 등, 2026-11 검토).
// 그래서 성공해도 타이머를 그대로 둔다 — 본문을 다 읽은 뒤에 울리면 아무 일도 하지 않고, unref 라 프로세스
// 종료(적재 스크립트)를 붙잡지 않는다. 호출부는 모두 응답을 받자마자 본문을 읽는다. 본문을 한참 뒤에 읽을 일이
// 생기면 이 함수를 쓰지 말 것(그 사이 타임아웃이 지나면 본문 읽기가 AbortError 로 끊긴다).
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}
