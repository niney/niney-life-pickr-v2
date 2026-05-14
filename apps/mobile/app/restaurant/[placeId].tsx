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
