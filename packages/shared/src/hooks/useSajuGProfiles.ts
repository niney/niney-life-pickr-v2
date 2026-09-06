import { useEffect } from 'react';
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

export function useSajuGProfiles() {
  const principal = useAuthStore((s) => s.user?.id ?? 'guest');
  const client = useQueryClient();
  const key = ['saju-g', 'profiles', principal];
  const query = useQuery({
    queryKey: key,
    queryFn: async () =>
      principal === 'guest' ? readSajuGProfiles() : (await sajuGApi.profiles()).items,
    staleTime: 0,
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
  const refresh = () => {
    if ((useAuthStore.getState().user?.id ?? 'guest') === principal)
      return client.invalidateQueries({ queryKey: key });
  };
  return {
    ...query,
    profiles: query.isError ? [] : (query.data ?? []),
    principal,
    save: async (input: SajuGProfileInputType, previous?: SajuGProfileType) => {
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
    remove: async (id: string) => {
      if (principal === 'guest') await removeSajuGProfile(id);
      else await sajuGApi.deleteProfile(id);
      await refresh();
    },
  };
}
