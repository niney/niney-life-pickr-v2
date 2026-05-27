import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { withLayoutContext } from 'expo-router';
import type { ParamListBase, TabNavigationState } from '@react-navigation/native';
import type {
  BottomTabNavigationEventMap,
  BottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs';

// Web 전용 — @bottom-tabs/react-navigation 은 react-native-bottom-tabs 의
// 네이티브 모듈(codegenNativeComponent)을 정적으로 import 해서 RN-Web 번들에
// 들어가지 못한다. 동일한 expo-router 패턴을 JS 구현인
// @react-navigation/bottom-tabs 로 대체한다.
const { Navigator } = createBottomTabNavigator();
const Tabs = withLayoutContext<
  BottomTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  BottomTabNavigationEventMap
>(Navigator);

// 단색 라인 아이콘 — 컬러 이모지에 CSS grayscale 을 걸어도 OS bitmap glyph 는
// 색이 안 빠지는 경우가 있어 inline SVG 로 직접 그린다(.web.tsx 라 RN-Web 한정).
// stroke=currentColor 로 React Navigation 이 넘기는 active/inactive 색이 자연
// 적용된다. path 는 Lucide(MIT) 의 house / utensils / user.
type IconProps = { color: string; size?: number };

const baseSvg = (size: number, color: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: color,
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

function HomeIcon({ color, size = 22 }: IconProps) {
  return (
    <svg {...baseSvg(size, color)}>
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function UtensilsIcon({ color, size = 22 }: IconProps) {
  return (
    <svg {...baseSvg(size, color)}>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </svg>
  );
}

function UserIcon({ color, size = 22 }: IconProps) {
  return (
    <svg {...baseSvg(size, color)}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" options={{ title: '홈', tabBarIcon: HomeIcon }} />
      <Tabs.Screen name="restaurants" options={{ title: '맛집', tabBarIcon: UtensilsIcon }} />
      <Tabs.Screen name="profile" options={{ title: '프로필', tabBarIcon: UserIcon }} />
    </Tabs>
  );
}
