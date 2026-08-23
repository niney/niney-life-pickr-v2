import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginInput, RegisterInput } from '@repo/api-contract';
import { authApi } from '../api/auth.api.js';
import { useAuthStore } from '../stores/authStore.js';

export const useCurrentUser = () => {
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);
  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.me,
    enabled: !!token,
  });

  useEffect(() => {
    if (query.data) setUser(query.data);
  }, [query.data, setUser]);

  return query;
};

export const useLogin = () => {
  const setSession = useAuthStore((s) => s.setSession);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: (data) => {
      // query key에 사용자 id가 없는 비공개 캐시가 많다. principal 전환 전에 이전 계정의
      // 진행 쿼리를 취소하고 캐시를 제거해 새 계정 화면에 순간 노출되지 않게 한다.
      void qc.cancelQueries();
      qc.removeQueries();
      setSession(data.user, data.token);
    },
  });
};

export const useRegister = () => {
  const setSession = useAuthStore((s) => s.setSession);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: (data) => {
      void qc.cancelQueries();
      qc.removeQueries();
      setSession(data.user, data.token);
    },
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
