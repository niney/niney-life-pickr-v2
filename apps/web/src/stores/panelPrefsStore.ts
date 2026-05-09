import { create } from 'zustand';

// 지도 + 사이드 패널 페이지에서 패널이 좌/우 어느 쪽에 붙을지를 사용자별로
// 기억한다. 페이지마다 별도 — 어드민 발견 페이지와 공개 맛집 페이지의 선호가
// 다를 수 있어서 namespace 키로 분리.
export type PanelSide = 'left' | 'right';
export type PanelKey = 'admin.discover' | 'public.restaurants';

const STORAGE_KEY = 'lp:panelPrefs';

const DEFAULTS: Record<PanelKey, PanelSide> = {
  // 어드민 발견 페이지는 사용자 요청으로 우측 시작.
  'admin.discover': 'right',
  // 공개 맛집은 기존 RestaurantsPage 가 좌측이었으므로 그대로.
  'public.restaurants': 'left',
};

const readInitial = (): Record<PanelKey, PanelSide> => {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULTS };
    const merged = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS) as PanelKey[]) {
      const v = (parsed as Record<string, unknown>)[key];
      if (v === 'left' || v === 'right') merged[key] = v;
    }
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
};

interface PanelPrefsState {
  sides: Record<PanelKey, PanelSide>;
  setSide: (key: PanelKey, side: PanelSide) => void;
  toggle: (key: PanelKey) => void;
}

const writeStorage = (sides: Record<PanelKey, PanelSide>): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sides));
  } catch {
    // ignore — quota / private mode
  }
};

export const usePanelPrefsStore = create<PanelPrefsState>((set, get) => ({
  sides: readInitial(),
  setSide: (key, side) => {
    if (get().sides[key] === side) return;
    const next = { ...get().sides, [key]: side };
    set({ sides: next });
    writeStorage(next);
  },
  toggle: (key) => {
    const cur = get().sides[key];
    get().setSide(key, cur === 'left' ? 'right' : 'left');
  },
}));

// 호출자 편의 selector — useState 와 동일한 [value, setter] 모양.
//   const [side, toggle] = usePanelSide('admin.discover');
export const usePanelSide = (key: PanelKey): readonly [PanelSide, () => void] => {
  const side = usePanelPrefsStore((s) => s.sides[key]);
  const toggle = usePanelPrefsStore((s) => s.toggle);
  return [side, () => toggle(key)] as const;
};
