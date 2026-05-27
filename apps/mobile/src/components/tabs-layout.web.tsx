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

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" options={{ title: '홈' }} />
      <Tabs.Screen name="restaurants" options={{ title: '맛집' }} />
      <Tabs.Screen name="profile" options={{ title: '프로필' }} />
    </Tabs>
  );
}
