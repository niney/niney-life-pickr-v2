import { create } from 'zustand';

// 정산 입력 화면의 개인 선호 — settlementDraftStore 와 분리한 이유는
// draft 는 sessionStorage(브라우저 닫으면 소멸), prefs 는 localStorage(다음
// 정산까지 유지)로 수명이 다르기 때문. panelPrefsStore 와 같은 패턴.
export type NewParticipantExcludeKey =
  | 'excludeAlcohol'
  | 'excludeNonAlcohol'
  | 'excludeSide';

export type NewParticipantExcludes = Record<NewParticipantExcludeKey, boolean>;

const STORAGE_KEY = 'lp:settlementPrefs';

// 단골 선호 없이 직접 추가하는 새 행에 적용될 기본값. 사용자가 매번
// "비주류 안 함" 같은 옵션을 반복 체크하는 부담을 줄이기 위함.
const DEFAULTS: NewParticipantExcludes = {
  excludeAlcohol: false,
  excludeNonAlcohol: false,
  excludeSide: false,
};

interface Persisted {
  newParticipantExcludes: NewParticipantExcludes;
}

const readInitial = (): NewParticipantExcludes => {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Persisted> | null;
    const ex = parsed?.newParticipantExcludes;
    if (!ex || typeof ex !== 'object') return { ...DEFAULTS };
    return {
      excludeAlcohol: !!ex.excludeAlcohol,
      excludeNonAlcohol: !!ex.excludeNonAlcohol,
      excludeSide: !!ex.excludeSide,
    };
  } catch {
    return { ...DEFAULTS };
  }
};

const writeStorage = (newParticipantExcludes: NewParticipantExcludes): void => {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ newParticipantExcludes } satisfies Persisted),
    );
  } catch {
    // quota / private mode → 무시.
  }
};

interface SettlementPrefsState {
  newParticipantExcludes: NewParticipantExcludes;
  setNewParticipantExclude(key: NewParticipantExcludeKey, value: boolean): void;
}

export const useSettlementPrefsStore = create<SettlementPrefsState>((set, get) => ({
  newParticipantExcludes: readInitial(),
  setNewParticipantExclude(key, value) {
    if (get().newParticipantExcludes[key] === value) return;
    const next = { ...get().newParticipantExcludes, [key]: value };
    set({ newParticipantExcludes: next });
    writeStorage(next);
  },
}));
