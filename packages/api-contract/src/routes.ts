export const API_PREFIX = '/api/v1';

export const Auth = {
  register: `${API_PREFIX}/auth/register`,
  login: `${API_PREFIX}/auth/login`,
  me: `${API_PREFIX}/auth/me`,
  logout: `${API_PREFIX}/auth/logout`,
} as const;

export const Users = {
  list: `${API_PREFIX}/users`,
  byId: (id: string) => `${API_PREFIX}/users/${id}`,
} as const;

export const Picks = {
  list: `${API_PREFIX}/picks`,
  create: `${API_PREFIX}/picks`,
  byId: (id: string) => `${API_PREFIX}/picks/${id}`,
} as const;

export const Admin = {
  listUsers: `${API_PREFIX}/admin/users`,
  setUserRole: (id: string) => `${API_PREFIX}/admin/users/${id}/role`,
} as const;

export const Health = `${API_PREFIX}/health` as const;
