import { ErrorResponseSchema } from '@repo/api-contract';

export interface ApiClientConfig {
  baseUrl: string;
  getToken?: () => string | null | Promise<string | null>;
  onUnauthorized?: () => void;
}

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
  const token = await config.getToken?.();
  const headers = new Headers(init.headers);
  // Only declare JSON when we actually have a body — fastify rejects POST/PUT
  // requests that say `Content-Type: application/json` but send nothing.
  // FormData 는 boundary 가 포함된 Content-Type 을 브라우저가 알아서
  // 채우게 두어야 하므로 여기서 덮어쓰지 않는다.
  if (init.body !== undefined && init.body !== null && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${config.baseUrl}${path}`, { ...init, headers });

  if (!res.ok) {
    if (res.status === 401) config.onUnauthorized?.();
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
