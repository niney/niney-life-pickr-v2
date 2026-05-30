import { useContext } from 'react';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Web 전용 — 웹 탭바는 JS 구현인 @react-navigation/bottom-tabs (tabs-layout.web.tsx)
// 라 높이 context 도 그쪽 것을 읽는다. native 형제(useTabBarHeight.ts) 와 동일
// 시그니처. 폴백은 || — 측정 전 0 / 탭 밖 undefined 둘 다 홈 인디케이터 inset
// 을 바닥값으로 잡는다 (native 쪽 주석 참고).
export function useTabBarHeight(): number {
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const insets = useSafeAreaInsets();
  return tabBarHeight || insets.bottom;
}
