import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 정산 입력 화면의 개인 선호. settlement draft 와는 수명이 달라(draft 는
// session 단위, prefs 는 영속) 분리한다 — 웹 settlementPrefsStore 의 RN 버전.
// AsyncStorage 어댑터로 다음 정산까지 유지.

export type NewParticipantExcludeKey =
  | 'excludeAlcohol'
  | 'excludeNonAlcohol'
  | 'excludeSide';

export type NewParticipantExcludes = Record<NewParticipantExcludeKey, boolean>;

const STORAGE_KEY = 'lp:settlementPrefs';

const DEFAULTS: NewParticipantExcludes = {
  excludeAlcohol: false,
  excludeNonAlcohol: false,
  excludeSide: false,
};

interface SettlementPrefsState {
  newParticipantExcludes: NewParticipantExcludes;
  hydrated: boolean;
  setNewParticipantExclude(key: NewParticipantExcludeKey, value: boolean): void;
  hydrate(): Promise<void>;
}

export const useSettlementPrefsStore = create<SettlementPrefsState>(
  (set, get) => ({
    newParticipantExcludes: { ...DEFAULTS },
    hydrated: false,
    setNewParticipantExclude(key, value) {
      if (get().newParticipantExcludes[key] === value) return;
      const next = { ...get().newParticipantExcludes, [key]: value };
      set({ newParticipantExcludes: next });
      void AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ newParticipantExcludes: next }),
      );
    },
    async hydrate() {
      if (get().hydrated) return;
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            newParticipantExcludes?: Partial<NewParticipantExcludes>;
          };
          const ex = parsed.newParticipantExcludes;
          if (ex && typeof ex === 'object') {
            set({
              newParticipantExcludes: {
                excludeAlcohol: !!ex.excludeAlcohol,
                excludeNonAlcohol: !!ex.excludeNonAlcohol,
                excludeSide: !!ex.excludeSide,
              },
            });
          }
        }
      } catch {
        // 파싱 실패 / 권한 등은 무시 — DEFAULTS 로 진행.
      }
      set({ hydrated: true });
    },
  }),
);
