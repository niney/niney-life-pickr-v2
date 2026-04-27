import {
  type AuthResponse,
  type LoginInput,
  type RegisterInput,
  type User,
  Routes,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

export const authApi = {
  register: (input: RegisterInput): Promise<AuthResponse> =>
    apiFetch(Routes.Auth.register, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  login: (input: LoginInput): Promise<AuthResponse> =>
    apiFetch(Routes.Auth.login, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  me: (): Promise<User> => apiFetch(Routes.Auth.me),

  logout: (): Promise<void> => apiFetch(Routes.Auth.logout, { method: 'POST' }),
};
