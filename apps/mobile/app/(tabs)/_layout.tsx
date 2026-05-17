import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { withLayoutContext } from 'expo-router';
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
const { Navigator } = createNativeBottomTabNavigator();
const Tabs = withLayoutContext<
  NativeBottomTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  NativeBottomTabNavigationEventMap
>(Navigator);

export default function TabsLayout() {
  return (
    <Tabs>
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
