import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { TarotDrawnCardType, TarotReadingResultType } from '@repo/api-contract';
import { createInjectableStorage } from './injectableStorage.js';

// 게스트 타로 기록 — 기기 로컬(최근 50건). 게스트 리딩은 서버에 저장하지 않으므로(질문이
// 사적일 수 있음, docs/PLAN-tarot.md 결정 9) 여기가 유일한 기록이다. 회원은 서버 기록을 쓰고
// 이 스토어에는 넣지 않는다(readingId 가 있으면 호출자가 건너뛴다).
//
// storage 주입 패턴은 다른 persist 스토어와 동일 — 앱은 entry 에서 setTarotHistoryStorage 주입.

const historyStorage = createInjectableStorage();

export const setTarotHistoryStorage = (storage: StateStorage): void => {
  historyStorage.setStorage(storage);
};

export const TAROT_HISTORY_MAX = 50;

export interface TarotHistoryEntry {
  // 로컬 id(랜덤). 서버 readingId 와 무관.
  id: string;
  createdAt: number;
  cards: TarotDrawnCardType[];
  result: TarotReadingResultType;
}

const newLocalId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

interface TarotHistoryState {
  entries: TarotHistoryEntry[];
  add(cards: TarotDrawnCardType[], result: TarotReadingResultType): TarotHistoryEntry;
  remove(id: string): void;
  clear(): void;
}

export const useTarotHistoryStore = create<TarotHistoryState>()(
  persist(
    (set) => ({
      entries: [],

      add(cards, result) {
        const entry: TarotHistoryEntry = { id: newLocalId(), createdAt: Date.now(), cards, result };
        set((s) => ({ entries: [entry, ...s.entries].slice(0, TAROT_HISTORY_MAX) }));
        return entry;
      },

      remove(id) {
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
      },

      clear() {
        set({ entries: [] });
      },
    }),
    {
      name: 'tarot-history-v1',
      version: 1,
      partialize: (s) => ({ entries: s.entries }),
      storage: createJSONStorage(() => historyStorage.storage),
    },
  ),
);

historyStorage.bindRehydrate(() => {
  void useTarotHistoryStore.persist.rehydrate();
});
