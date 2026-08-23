import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginInput, RegisterInput } from '@repo/api-contract';
import { authApi } from '../api/auth.api.js';
import { useAuthStore } from '../stores/authStore.js';
import { setMealDraftPrincipal } from '../stores/mealDraftStore.js';

export const useCurrentUser = () => {
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);
  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.me,
    enabled: !!token,
  });

  useEffect(() => {
    if (!query.data || !token) return;
    const principalId = query.data.id;
    // 토큰만 복원된 부팅에서도 /me 로 확인한 principal 의 draft 만 연다. 전환 중
    // 로그아웃됐다면 지연된 /me 가 user/draft 를 되살리지 않게 현재 token 을 재확인한다.
    void setMealDraftPrincipal(principalId).then(() => {
      if (useAuthStore.getState().token === token) setUser(query.data!);
    });
  }, [query.data, setUser, token]);

  return query;
};

export const useLogin = () => {
  const setSession = useAuthStore((s) => s.setSession);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: async (data) => {
      // query key에 사용자 id가 없는 비공개 캐시가 많다. principal 전환 전에 이전 계정의
      // 진행 쿼리를 취소하고 캐시를 제거해 새 계정 화면에 순간 노출되지 않게 한다.
      await qc.cancelQueries();
      qc.removeQueries();
      await setMealDraftPrincipal(data.user.id);
      setSession(data.user, data.token);
    },
  });
};

export const useRegister = () => {
  const setSession = useAuthStore((s) => s.setSession);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: async (data) => {
      await qc.cancelQueries();
      qc.removeQueries();
      await setMealDraftPrincipal(data.user.id);
      setSession(data.user, data.token);
    },
  });
};

export const useLogout = () => {
  const clearSession = useAuthStore((s) => s.clearSession);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: async () => {
      await setMealDraftPrincipal(null);
      clearSession();
      qc.clear();
    },
  });
};
