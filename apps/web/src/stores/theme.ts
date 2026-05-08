import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'lp:theme';

const readInitial = (): ThemeMode => {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return 'dark';
  }
  return 'light';
};

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: readInitial(),
  setMode: (mode) => {
    set({ mode });
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {}
  },
  toggle: () => get().setMode(get().mode === 'dark' ? 'light' : 'dark'),
}));
