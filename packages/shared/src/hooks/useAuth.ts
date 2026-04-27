import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginInput, RegisterInput } from '@repo/api-contract';
import { authApi } from '../api/auth.api.js';
import { useAuthStore } from '../stores/authStore.js';

export const useCurrentUser = () => {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.me,
    enabled: !!token,
  });
};

export const useLogin = () => {
  const setSession = useAuthStore((s) => s.setSession);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: (data) => {
      setSession(data.user, data.token);
      qc.invalidateQueries({ queryKey: ['auth'] });
    },
  });
};

export const useRegister = () => {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: (data) => setSession(data.user, data.token),
  });
};

export const useLogout = () => {
  const clearSession = useAuthStore((s) => s.clearSession);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      clearSession();
      qc.clear();
    },
  });
};
