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
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${config.baseUrl}${path}`, { ...init, headers });

  if (!res.ok) {
    if (res.status === 401) config.onUnauthorized?.();
    const body = await res.json().catch(() => null);
    const parsed = ErrorResponseSchema.safeParse(body);
    if (parsed.success) {
      throw new ApiError(parsed.data.statusCode, parsed.data.error, parsed.data.message);
    }
    throw new ApiError(res.status, res.statusText, res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
};
