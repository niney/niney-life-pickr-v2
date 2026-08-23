import { ErrorResponseSchema } from '@repo/api-contract';

export interface ApiClientConfig {
  baseUrl: string;
  getToken?: () => string | null | Promise<string | null>;
  /** 401을 받은 요청이 실제로 사용한 토큰. 현재 세션과 비교해 늦은 응답을 무시해야 한다. */
  onUnauthorized?: (requestToken: string | null) => void | Promise<void>;
}

export interface UnauthorizedSessionGuardOptions {
  requestToken: string | null;
  getCurrentToken: () => string | null;
  onCurrentSessionUnauthorized: () => void;
}

/**
 * 이전 계정의 지연된 401이 새로 로그인한 세션을 종료하지 않게 한다. 토큰이 같은 현재 세션일
 * 때만 캐시 제거와 로그아웃 같은 전환을 한 동기 콜백에서 실행한다.
 */
export const handleUnauthorizedForCurrentSession = ({
  requestToken,
  getCurrentToken,
  onCurrentSessionUnauthorized,
}: UnauthorizedSessionGuardOptions): boolean => {
  if (!requestToken || getCurrentToken() !== requestToken) return false;
  onCurrentSessionUnauthorized();
  return true;
};

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly error: string,
    message: string,
    // 응답 body 원본 — 일부 4xx 응답이 단순 에러가 아니라 기존 리소스의
    // 스냅샷을 들고 오는 경우(409 with current job snapshot 등)에 caller 가
    // 추출해 쓸 수 있게 보존. 표준 ErrorResponseSchema 가 아닐 수 있어 unknown.
    public readonly body: unknown = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let config: ApiClientConfig = { baseUrl: '' };

export const configureApi = (cfg: ApiClientConfig): void => {
  config = cfg;
};

export const getApiConfig = (): ApiClientConfig => config;

export const apiFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  // 요청 도중 configureApi가 다시 불려도 baseUrl/401 콜백이 뒤섞이지 않도록 한 요청의 설정을
  // 스냅샷으로 고정한다.
  const requestConfig = config;
  const token = (await requestConfig.getToken?.()) ?? null;
  const headers = new Headers(init.headers);
  // Only declare JSON when we actually have a body — fastify rejects POST/PUT
  // requests that say `Content-Type: application/json` but send nothing.
  // FormData 는 boundary 가 포함된 Content-Type 을 브라우저가 알아서
  // 채우게 두어야 하므로 여기서 덮어쓰지 않는다.
  if (init.body !== undefined && init.body !== null && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${requestConfig.baseUrl}${path}`, { ...init, headers });

  if (!res.ok) {
    if (res.status === 401) await requestConfig.onUnauthorized?.(token);
    const body = await res.json().catch(() => null);
    const parsed = ErrorResponseSchema.safeParse(body);
    if (parsed.success) {
      throw new ApiError(parsed.data.statusCode, parsed.data.error, parsed.data.message, body);
    }
    // body 가 표준 에러 모양이 아니어도 caller 가 활용할 수 있게 그대로 보존.
    throw new ApiError(res.status, res.statusText, res.statusText, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
};
