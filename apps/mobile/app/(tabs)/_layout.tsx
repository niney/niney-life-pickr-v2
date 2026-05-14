import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

// 하단 탭바 — 표준 RN/Expo 패턴: tabBarIcon 에 focused 분기로 outline ↔ filled.
// Ionicons 는 @expo/vector-icons 에 번들 — 추가 의존성/설정 불필요.
export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="home"
        options={{
          title: '홈',
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="restaurants"
        options={{
          title: '맛집',
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'restaurant' : 'restaurant-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '프로필',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
