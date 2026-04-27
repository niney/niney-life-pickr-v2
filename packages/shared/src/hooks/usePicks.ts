import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePickInput, UpdatePickInput } from '@repo/api-contract';
import { picksApi } from '../api/picks.api.js';

const pickKeys = {
  all: ['picks'] as const,
  lists: () => [...pickKeys.all, 'list'] as const,
  detail: (id: string) => [...pickKeys.all, 'detail', id] as const,
};

export const usePicks = () =>
  useQuery({
    queryKey: pickKeys.lists(),
    queryFn: picksApi.list,
  });

export const usePick = (id: string) =>
  useQuery({
    queryKey: pickKeys.detail(id),
    queryFn: () => picksApi.getById(id),
    enabled: !!id,
  });

export const useCreatePick = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePickInput) => picksApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: pickKeys.lists() }),
  });
};

export const useUpdatePick = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePickInput) => picksApi.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pickKeys.lists() });
      qc.invalidateQueries({ queryKey: pickKeys.detail(id) });
    },
  });
};

export const useDeletePick = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => picksApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: pickKeys.lists() }),
  });
};

export const useRandomPick = () =>
  useMutation({
    mutationFn: (id: string) => picksApi.random(id),
  });
