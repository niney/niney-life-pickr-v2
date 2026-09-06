import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SajuProfileInputType, SajuProfileType } from '@repo/api-contract';
import { sajuApi } from '../api/saju.api.js';
import { useAuthStore } from '../stores/authStore.js';
import {
  readSajuProfiles,
  removeSajuProfile,
  saveSajuProfile,
  SAJU_PROFILE_STORAGE_KEY,
} from '../stores/sajuProfileStore.js';

export function useSajuProfiles() {
  const principal = useAuthStore((s) => s.user?.id ?? 'guest');
  const client = useQueryClient();
  const key = ['saju', 'profiles', principal];
  const query = useQuery({
    queryKey: key,
    queryFn: async () =>
      principal === 'guest' ? readSajuProfiles() : (await sajuApi.profiles()).items,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: 'always',
  });
  useEffect(() => {
    if (principal !== 'guest' || typeof window === 'undefined') return;
    const changed = (event: StorageEvent) => {
      if (event.key === SAJU_PROFILE_STORAGE_KEY || event.key === null)
        void client.invalidateQueries({ queryKey: ['saju', 'profiles', 'guest'] });
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [principal, client]);
  const refresh = () => {
    if ((useAuthStore.getState().user?.id ?? 'guest') === principal)
      return client.invalidateQueries({ queryKey: key });
  };
  return {
    ...query,
    profiles: query.isError ? [] : (query.data ?? []),
    principal,
    save: async (input: SajuProfileInputType, previous?: SajuProfileType) => {
      let result: SajuProfileType;
      if (principal === 'guest') {
        await sajuApi.chart({ birth: input.birth, kind: 'natal', note: '' });
        if ((useAuthStore.getState().user?.id ?? 'guest') !== principal)
          throw new Error('계정이 변경되었어요. 다시 시도해 주세요.');
        result = await saveSajuProfile(input, previous);
      } else result = await sajuApi.saveProfile(input, previous);
      await refresh();
      return result;
    },
    remove: async (id: string) => {
      if (principal === 'guest') await removeSajuProfile(id);
      else await sajuApi.deleteProfile(id);
      await refresh();
    },
  };
}
