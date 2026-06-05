import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { withLayoutContext } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@repo/shared';
import type { ParamListBase, TabNavigationState } from '@react-navigation/native';
import type {
  BottomTabBarProps,
  NativeBottomTabNavigationEventMap,
  NativeBottomTabNavigationOptions,
} from '@bottom-tabs/react-navigation';
import type { AppleIcon } from 'react-native-bottom-tabs';

// 하단 탭바.
//  - iOS: react-native-bottom-tabs 의 네이티브 UITabBarController (SF Symbols +
//    iOS 26 liquid glass). 그대로 둔다.
//  - Android: 네이티브 Material BottomNavigationView 는 활성 인디케이터가 "아이콘만"
//    감싸고 라벨은 그 아래 따로 둔다. "아이콘+텍스트를 함께 감싸는 pill" 과 더 낮은
//    높이를 원해서, Android 에선 tabBar 렌더 prop 으로 커스텀 JS 바(AndroidTabBar)
//    를 그린다. 커스텀 tabBar 지정 시 라이브러리가 네이티브 바를 숨기고 씬을 flex 로
//    채운 뒤 이 바를 하단에 배치한다(높이는 자동 측정 → useTabBarHeight 가 따라감).
//
// .web.tsx 형제 파일이 RN-Web 번들에서 우선 채택 — 이 파일의 native-only import 가
// web 빌드 트리에 들어가지 않게 한다.

// iOS 아이콘만 — SF Symbols. (Android 는 AndroidTabBar 가 MaterialIcons 로 직접 그림)
const tabIcon =
  (sfSymbol: AppleIcon['sfSymbol']) =>
  (): AppleIcon => ({ sfSymbol });

// Android 커스텀 바 아이콘 (MaterialIcons). 라우트 이름 → 글리프.
const ANDROID_ICON: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  home: 'home',
  restaurants: 'restaurant',
  profile: 'person',
};

// Android 전용 커스텀 탭바 — 가장 흔한 표준 하단 탭 스타일: 아이콘 위 / 라벨 아래
// 세로 배치, 활성은 색상 전환(amber)으로만 표시(배경 pill 없음). 네이티브 Material
// 바의 보라 인디케이터·elevation 보라끼를 피하면서 OS 표준 룩을 얻는다.
function AndroidTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const label = descriptors[route.key]?.options.title ?? route.name;
        const color = focused ? theme.colors.primary : theme.colors.textMuted;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={label}
            onPress={onPress}
            style={styles.item}
          >
            <MaterialIcons
              name={ANDROID_ICON[route.name] ?? 'circle'}
              size={20}
              color={color}
            />
            <Text
              style={[
                styles.label,
                { color, fontWeight: focused ? '700' : '500' },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

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
    <Tabs
      // iOS 네이티브 바 틴트(커스텀 바를 쓰는 Android 에선 무시됨).
      tabBarActiveTintColor={theme.colors.primary}
      tabBarInactiveTintColor={theme.colors.textMuted}
      // Android 만 커스텀 바. iOS 는 undefined → 네이티브 바 유지.
      tabBar={
        Platform.OS === 'android'
          ? (props) => <AndroidTabBar {...props} />
          : undefined
      }
    >
      <Tabs.Screen
        name="home"
        options={{ title: '홈', tabBarIcon: tabIcon('house') }}
      />
      <Tabs.Screen
        name="restaurants"
        options={{ title: '맛집', tabBarIcon: tabIcon('fork.knife') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: '프로필', tabBarIcon: tabIcon('person') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 3,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingVertical: 2,
  },
  label: {
    fontSize: 10,
  },
});
