import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SajuGProfileInputType, SajuGProfileType } from '@repo/api-contract';
import { sajuGApi } from '../api/saju-g.api.js';
import { useAuthStore } from '../stores/authStore.js';
import { SAJU_G_LEGACY_STORAGE } from '../stores/sajuGStorageMigration.js';
import {
  readSajuGProfiles,
  removeSajuGProfile,
  saveSajuGProfile,
  SAJU_G_PROFILE_STORAGE_KEY,
} from '../stores/sajuGProfileStore.js';

// 프로필이 없을 때 렌더마다 새 배열을 만들지 않는다 — 받는 쪽 effect 의존값(profiles)이 흔들리지 않게.
const NO_PROFILES: SajuGProfileType[] = [];

export function useSajuGProfiles() {
  const principal = useAuthStore((s) => s.user?.id ?? 'guest');
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['saju-g', 'profiles', principal],
    queryFn: async () =>
      principal === 'guest' ? readSajuGProfiles() : (await sajuGApi.profiles()).items,
    // 페이지를 오가거나 저장 창을 열 때마다 다시 부르지 않게 잠깐 신선하게 둔다. 저장·삭제는 아래에서 직접
    // invalidate 하고, 다른 창의 변경은 창 포커스('always')와 storage 이벤트로 따라잡는다.
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: 'always',
  });
  useEffect(() => {
    if (principal !== 'guest' || typeof window === 'undefined') return;
    const changed = (event: StorageEvent) => {
      if (
        event.key === SAJU_G_PROFILE_STORAGE_KEY ||
        event.key === SAJU_G_LEGACY_STORAGE.profiles ||
        event.key === null
      )
        void client.invalidateQueries({ queryKey: ['saju-g', 'profiles', 'guest'] });
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [principal, client]);
  const refresh = useCallback(() => {
    if ((useAuthStore.getState().user?.id ?? 'guest') === principal)
      return client.invalidateQueries({ queryKey: ['saju-g', 'profiles', principal] });
  }, [client, principal]);
  const save = useCallback(
    async (input: SajuGProfileInputType, previous?: SajuGProfileType) => {
      let result: SajuGProfileType;
      if (principal === 'guest') {
        await sajuGApi.chart({ birth: input.birth, kind: 'natal', note: '' });
        if ((useAuthStore.getState().user?.id ?? 'guest') !== principal)
          throw new Error('계정이 변경되었어요. 다시 시도해 주세요.');
        result = await saveSajuGProfile(input, previous);
      } else result = await sajuGApi.saveProfile(input, previous);
      await refresh();
      return result;
    },
    [principal, refresh],
  );
  const remove = useCallback(
    async (id: string) => {
      if (principal === 'guest') await removeSajuGProfile(id);
      else await sajuGApi.deleteProfile(id);
      await refresh();
    },
    [principal, refresh],
  );
  // query 를 통째로 펼치지 않는다 — 펼치면 결과의 모든 필드를 읽은 셈이 돼(React Query 의 추적) isFetching 같은
  // 변화에도 쓰는 화면이 다시 그려진다. 화면이 실제로 보는 값만 꺼내 준다.
  return {
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    profiles: query.isError ? NO_PROFILES : (query.data ?? NO_PROFILES),
    principal,
    save,
    remove,
  };
}
