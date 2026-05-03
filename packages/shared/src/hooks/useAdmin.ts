import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Role } from '@repo/api-contract';
import { adminApi } from '../api/admin.api.js';

export const useAdminUsers = () =>
  useQuery({
    queryKey: ['admin', 'users'],
    queryFn: adminApi.listUsers,
  });

export const useSetUserRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => adminApi.setRole(id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
};
