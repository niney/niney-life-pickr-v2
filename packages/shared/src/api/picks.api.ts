import {
  type CreatePickInput,
  type Pick,
  type PickResult,
  type UpdatePickInput,
  Routes,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

export const picksApi = {
  list: (): Promise<Pick[]> => apiFetch(Routes.Picks.list),

  getById: (id: string): Promise<Pick> => apiFetch(Routes.Picks.byId(id)),

  create: (input: CreatePickInput): Promise<Pick> =>
    apiFetch(Routes.Picks.create, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  update: (id: string, input: UpdatePickInput): Promise<Pick> =>
    apiFetch(Routes.Picks.byId(id), {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  remove: (id: string): Promise<void> =>
    apiFetch(Routes.Picks.byId(id), { method: 'DELETE' }),

  random: (id: string): Promise<PickResult> =>
    apiFetch(`${Routes.Picks.byId(id)}/random`, { method: 'POST' }),
};
