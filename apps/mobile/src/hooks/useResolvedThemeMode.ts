import { useColorScheme } from 'react-native';
import { useThemeStore } from '~/lib/themeStore';

// 사용자 선택(themeStore) + OS 색상 스킴(useColorScheme)을 합쳐 실제 적용할
// 'light' | 'dark' 를 돌려준다. 'system' 일 때만 OS 를 따르고, OS 변경 시
// useColorScheme 가 재렌더를 트리거해 실시간 반영된다.
//
// RN 전용 훅 — ThemeProvider(@repo/shared)는 web/native 공용 단일 파일이라
// useColorScheme(react-native)을 거기 넣으면 웹(Vite) 번들이 깨진다. 그래서
// OS 반응형 해석은 앱 레벨인 이 훅에서 처리하고, _layout 이 결과를
// ThemeProvider 의 mode prop 으로 주입한다.
export function useResolvedThemeMode(): 'light' | 'dark' {
  const mode = useThemeStore((s) => s.mode);
  const system = useColorScheme();
  if (mode === 'system') return system === 'dark' ? 'dark' : 'light';
  return mode;
}
