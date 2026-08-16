import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

// 투표 참가자(게스트) 로컬 상태 — 기기 영속 voterKey + 표시 이름 + 토큰별 내
// 찬성 기록. 서버는 voterKey 로 (후보,투표자) 유니크를 걸 뿐 "내 찬성 목록"
// 조회 API 가 없으므로, 재방문 시 체크 상태 복원은 이 store 가 담당한다.
//
// voterKey 는 추측 불가 UUID 지만 클라 선언값 — 기기 단위 식별이며 완벽한
// 중복 방지가 아님을 제품 결정으로 수용(localStorage 초기화 = 새 투표자).
//
// storage 어댑터는 busFavoriteStore 와 같은 lazy resolver — 웹 localStorage
// 자동, 앱은 entry 에서 setVoteGuestStorage(AsyncStorage) 주입.

let injectedStorage: StateStorage | null = null;

export const setVoteGuestStorage = (storage: StateStorage): void => {
  injectedStorage = storage;
};

const NO_OP_STORAGE: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const resolveStorage = (): StateStorage => {
  if (injectedStorage) return injectedStorage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return NO_OP_STORAGE;
};

// settlementDraftStore 의 newClientId 와 동일 근거 — randomUUID 미지원 구형
// 브라우저 폴백 포함. 계약(voterKey min 8)을 항상 만족한다.
const newGuestId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

interface VoteBallotEntry {
  optionIds: string[];
  votedAt: number;
}

// 오래된 투표 기록이 localStorage 를 무한히 키우지 않게 최근 N개만 유지.
const MAX_BALLOT_ENTRIES = 20;

const capEntries = (entries: Record<string, VoteBallotEntry>): Record<string, VoteBallotEntry> => {
  const keys = Object.keys(entries);
  if (keys.length <= MAX_BALLOT_ENTRIES) return entries;
  const kept = keys
    .sort((a, b) => entries[b]!.votedAt - entries[a]!.votedAt)
    .slice(0, MAX_BALLOT_ENTRIES);
  const next: Record<string, VoteBallotEntry> = {};
  for (const k of kept) next[k] = entries[k]!;
  return next;
};

interface VoteGuestState {
  // 기기 영속 투표자 식별자 — 최초 생성 후 rehydrate 가 기존 값을 유지한다.
  guestId: string;
  // 마지막으로 쓴 표시 이름 — 다음 투표방에서 seed.
  name: string;
  // 토큰별 내 찬성 기록 — 재방문 시 체크 상태 복원.
  ballots: Record<string, VoteBallotEntry>;

  setName(name: string): void;
  recordBallot(token: string, optionIds: string[]): void;
}

export const useVoteGuestStore = create<VoteGuestState>()(
  persist(
    (set) => ({
      guestId: newGuestId(),
      name: '',
      ballots: {},

      setName(name) {
        set({ name });
      },

      recordBallot(token, optionIds) {
        set((s) => ({
          ballots: capEntries({
            ...s.ballots,
            [token]: { optionIds, votedAt: Date.now() },
          }),
        }));
      },
    }),
    {
      name: 'vote-guest-v1',
      version: 1,
      partialize: (s) => ({ guestId: s.guestId, name: s.name, ballots: s.ballots }),
      storage: createJSONStorage(() => resolveStorage()),
    },
  ),
);
