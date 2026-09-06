import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { SajuBirthInputType } from '@repo/api-contract';
import { createInjectableStorage } from './injectableStorage.js';

// 게스트 사주 프로필 — 기기 로컬(나 + 가족·상대 최대 10명). 생년월일시는 개인정보라 서버에 두지 않고
// (회원은 4차의 서버 프로필을 쓴다) 오늘의 운세·궁합 상대 선택·재방문 자동 입력에 쓴다.
//
// storage 주입 패턴은 다른 persist 스토어와 동일 — 앱은 entry 에서 setSajuProfileStorage 주입.

const profileStorage = createInjectableStorage();

export const setSajuProfileStorage = (storage: StateStorage): void => {
  profileStorage.setStorage(storage);
};

export const SAJU_LOCAL_PROFILE_MAX = 10;

export interface SajuLocalProfile {
  id: string;
  label: string;
  birth: SajuBirthInputType;
  createdAt: number;
}

interface SajuProfileState {
  profiles: SajuLocalProfile[];
  /** "내 사주" 로 쓰는 프로필 id. */
  primaryId: string | null;
  upsert: (profile: Omit<SajuLocalProfile, 'id' | 'createdAt'> & { id?: string }) => SajuLocalProfile;
  remove: (id: string) => void;
  setPrimary: (id: string | null) => void;
}

const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const useSajuProfileStore = create<SajuProfileState>()(
  persist(
    (set, get) => ({
      profiles: [],
      primaryId: null,
      upsert: (input) => {
        const existing = input.id ? get().profiles.find((p) => p.id === input.id) : undefined;
        const profile: SajuLocalProfile = existing
          ? { ...existing, label: input.label, birth: input.birth }
          : { id: newId(), label: input.label, birth: input.birth, createdAt: Date.now() };
        set((s) => {
          const rest = s.profiles.filter((p) => p.id !== profile.id);
          const profiles = [profile, ...rest].slice(0, SAJU_LOCAL_PROFILE_MAX);
          return { profiles, primaryId: s.primaryId ?? profile.id };
        });
        return profile;
      },
      remove: (id) =>
        set((s) => {
          const profiles = s.profiles.filter((p) => p.id !== id);
          return { profiles, primaryId: s.primaryId === id ? (profiles[0]?.id ?? null) : s.primaryId };
        }),
      setPrimary: (id) => set({ primaryId: id }),
    }),
    {
      name: 'saju-profiles-v1',
      version: 1,
      storage: createJSONStorage(() => profileStorage.storage),
      partialize: (s) => ({ profiles: s.profiles, primaryId: s.primaryId }),
    },
  ),
);

profileStorage.bindRehydrate(() => {
  void useSajuProfileStore.persist.rehydrate();
});

export const getPrimarySajuProfile = (): SajuLocalProfile | null => {
  const s = useSajuProfileStore.getState();
  return s.profiles.find((p) => p.id === s.primaryId) ?? s.profiles[0] ?? null;
};
