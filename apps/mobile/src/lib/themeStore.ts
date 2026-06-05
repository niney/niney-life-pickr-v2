import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 앱 화면 모드 선택. 'system' 이면 OS 다크 설정을 따라간다(useResolvedThemeMode
// 에서 useColorScheme 와 결합). 'light'/'dark' 는 OS 와 무관하게 강제.
//
// 영속화는 settlementPrefsStore 와 동일한 수동 hydrate 패턴 — zustand persist
// 의 async rehydrate 타이밍 대신 bootstrapApi 에서 await 로 한 번 당겨와,
// 스플래시가 떠 있는 동안 올바른 모드를 확정한다(잘못된 테마 플래시 방지).
//
// 웹과 분리: 앱은 AsyncStorage('lp:themeMode'), 웹은 자체 localStorage 스토어
// (apps/web/src/stores/theme.ts) 를 쓴다. 물리적으로 다른 저장소라 충돌 없음.
// design 토큰(@repo/shared)만 공유한다.

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'lp:themeMode';

const isThemeMode = (v: unknown): v is ThemeMode =>
  v === 'light' || v === 'dark' || v === 'system';

interface ThemeModeState {
  mode: ThemeMode;
  hydrated: boolean;
  setMode(mode: ThemeMode): void;
  hydrate(): Promise<void>;
}

export const useThemeStore = create<ThemeModeState>((set, get) => ({
  mode: 'system',
  hydrated: false,
  setMode(mode) {
    if (get().mode === mode) return;
    set({ mode });
    void AsyncStorage.setItem(STORAGE_KEY, mode);
  },
  async hydrate() {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (isThemeMode(raw)) set({ mode: raw });
    } catch {
      // 읽기 실패는 무시 — 기본 'system' 으로 진행.
    }
    set({ hydrated: true });
  },
}));
