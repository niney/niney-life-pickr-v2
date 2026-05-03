import { Routes, type AdminUsersResponseType, type Role, type User } from '@repo/api-contract';
import { apiFetch } from './client.js';

export const adminApi = {
  listUsers: () => apiFetch<AdminUsersResponseType>(Routes.Admin.listUsers),
  setRole: (id: string, role: Role) =>
    apiFetch<User>(Routes.Admin.setUserRole(id), {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
};
