import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { withLayoutContext } from 'expo-router';
import { useTheme } from '@repo/shared';
import type { ParamListBase, TabNavigationState } from '@react-navigation/native';
import type {
  NativeBottomTabNavigationEventMap,
  NativeBottomTabNavigationOptions,
} from '@bottom-tabs/react-navigation';

// 하단 탭바 — react-native-bottom-tabs 의 네이티브 구현. iOS 는
// UITabBarController, Android 는 BottomNavigationView 를 직접 띄운다.
// iOS 26+ 에선 시스템이 자동으로 liquid glass + scroll-edge effect + island
// 룩까지 적용. expo-router 의 파일 기반 라우팅과 결합하려면
// createNativeBottomTabNavigator + withLayoutContext 패턴 사용.
//
// 아이콘:
//  - iOS: SF Symbols 문자열로 지정 → 시스템 톤/굵기/색이 자동 적용
//  - Android: 같은 객체 반환 시 아이콘 비표시 (텍스트 라벨만 보임). PNG/SVG
//    asset 추가 시 ImageSourcePropType 으로 분기 필요. 추후 작업.
//
// .web.tsx 형제 파일이 RN-Web 번들에서 우선 채택 — 이 파일의 native-only
// import 가 web 빌드 트리에 들어가지 않게 한다.
const { Navigator } = createNativeBottomTabNavigator();
const Tabs = withLayoutContext<
  NativeBottomTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  NativeBottomTabNavigationEventMap
>(Navigator);

export default function TabsLayout() {
  const theme = useTheme();
  return (
    // 활성/비활성 틴트만 명시 — barTintColor(solid 배경 강제)는 의도적으로 두지
    // 않는다. 그래야 iOS 26 의 liquid glass + scroll-edge 효과가 유지되고, 바
    // 배경색은 시스템이 OS 다크/라이트에 맞춰 자동 적용한다('system' 모드 기준).
    // (라이트/다크 강제 시 바 배경은 OS 를 따르는 한계 — 실기기 검증 항목)
    <Tabs
      tabBarActiveTintColor={theme.colors.primary}
      tabBarInactiveTintColor={theme.colors.textMuted}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: '홈',
          tabBarIcon: () => ({ sfSymbol: 'house' }),
        }}
      />
      <Tabs.Screen
        name="restaurants"
        options={{
          title: '맛집',
          tabBarIcon: () => ({ sfSymbol: 'fork.knife' }),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '프로필',
          tabBarIcon: () => ({ sfSymbol: 'person' }),
        }}
      />
    </Tabs>
  );
}
