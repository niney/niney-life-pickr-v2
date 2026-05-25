import { useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { PublicRestaurantDetail } from '~/components/restaurantDetail/PublicRestaurantDetail';

// 라우트 entry — 식당명은 컨테이너에서 fetch 후 콜백으로 받아 Stack 헤더 title
// 에 동적 주입. 헤더는 네이티브 Stack 그대로 (뒤로/스와이프 제스처 보존).
// 탭 전환은 컨테이너 안 로컬 state — URL/history 누적 없음 (모바일 표준).
export default function RestaurantDetailScreen() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const [name, setName] = useState<string | null>(null);

  return (
    <>
      <Stack.Screen
        options={{
          // 루트 Stack 의 screenOptions.headerShown=false 를 상세에서만 덮어쓴다.
          // 명시적으로 켜지 않으면 부모가 cascade 로 적용돼 헤더가 안 뜸 → TabBar
          // 가 노치를 침범. A안(네이티브 헤더 + sticky 탭바) 패턴 복원.
          headerShown: true,
          title: name ?? '맛집 상세',
          headerBackTitle: '뒤로',
        }}
      />
      {placeId && (
        <PublicRestaurantDetail placeId={placeId} onResolveName={setName} />
      )}
    </>
  );
}
