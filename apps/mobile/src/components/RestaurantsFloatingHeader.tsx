import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '@repo/shared';
import type { RestaurantPublicListQueryType } from '@repo/api-contract';
import { RestaurantSearchBar } from './RestaurantSearchBar';

type SortKey = NonNullable<RestaurantPublicListQueryType['sort']>;

interface Props {
  q: string;
  category: string | null;
  sort: SortKey;
  total: number;
  onChangeQ(next: string): void;
  onChangeCategory(next: string | null): void;
  onChangeSort(next: SortKey): void;
  // 0=peek, 1=half, 2=full. gorhom BottomSheet 의 animatedIndex.
  sheetIndex: SharedValue<number>;
  topInset: number;
  // 카드 콘텐츠 실측 높이. 부모가 BottomSheet 의 topInset 으로 사용.
  onMeasure?(cardHeight: number): void;
}

// 지도 위에 떠 있는 상단 검색 헤더. snap 위치에 따라 floating 카드 ↔ sticky
// 자연스럽게 보간 (그림자/마진/라운드/safe-area 배경). 보간 구간은 sheetIndex
// 1.5 → 2 (half→full 의 후반부). full 에 닿으면 wrap 의 safe-area 영역도
// 카드 색으로 차서 그 뒤로 지도가 비치지 않게 한다.
// pointerEvents='box-none' 으로 카드 바깥 영역(좌우 마진) 은 터치 통과.
//
// 주의: 이 헤더는 detail 모드에서도 그대로 노출된다 — '뒤로가기 + 식당명'
// 헤더는 BottomSheet 안 콘텐츠 상단에 sticky 로 별도로 렌더된다. detail
// 모드 + full 일 때는 시트가 z 더 높아서 이 헤더 위로 차오르며 가린다.
export const RestaurantsFloatingHeader = ({
  q,
  category,
  sort,
  total,
  onChangeQ,
  onChangeCategory,
  onChangeSort,
  sheetIndex,
  topInset,
  onMeasure,
}: Props) => {
  const theme = useTheme();

  const animatedCardStyle = useAnimatedStyle(() => {
    'worklet';
    const idx = sheetIndex.value;
    const t = Math.min(1, Math.max(0, (idx - 1.5) / 0.5));
    return {
      marginHorizontal: 16 * (1 - t),
      borderRadius: 12 * (1 - t),
      marginTop: 8 * (1 - t),
      shadowOpacity: 0.15 * (1 - t),
      elevation: 4 * (1 - t),
    };
  });

  // wrap 의 safe-area(노치) 영역 배경 — full 일 때만 surface 색으로 차서
  // 그 뒤로 지도가 비치지 않게.
  const animatedWrapStyle = useAnimatedStyle(() => {
    'worklet';
    const idx = sheetIndex.value;
    const t = Math.min(1, Math.max(0, (idx - 1.5) / 0.5));
    return {
      backgroundColor: interpolateColor(
        t,
        [0, 1],
        ['transparent', theme.colors.surface],
      ),
    };
  });

  const handleLayout = (e: LayoutChangeEvent) => {
    if (onMeasure) onMeasure(e.nativeEvent.layout.height);
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingTop: topInset }, animatedWrapStyle]}
    >
      <Animated.View
        onLayout={handleLayout}
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
          animatedCardStyle,
        ]}
      >
        <View style={styles.searchPad}>
          <RestaurantSearchBar
            q={q}
            category={category}
            sort={sort}
            total={total}
            onChangeQ={onChangeQ}
            onChangeCategory={onChangeCategory}
            onChangeSort={onChangeSort}
          />
        </View>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  card: {
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
  },
  searchPad: { paddingHorizontal: 12, paddingTop: 12 },
});
