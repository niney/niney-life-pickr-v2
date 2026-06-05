import { Pressable, StyleSheet, Text, View } from 'react-native';
// gorhom BottomSheet(맛집 탭) 안에서 가로 칩 스크롤이 안드로이드 제스처 오케스트
// 레이터에 잡히도록 gesture-handler 의 ScrollView 사용. (ReviewCard 와 동일 이유)
import { ScrollView } from 'react-native-gesture-handler';
import { useTheme } from '@repo/shared';
import type {
  RestaurantPublicReviewSentimentType,
  RestaurantPublicReviewSortType,
} from '@repo/api-contract';

const FILTERS: ReadonlyArray<{
  value: RestaurantPublicReviewSentimentType;
  label: string;
}> = [
  { value: 'all', label: '전체' },
  { value: 'positive', label: '긍정' },
  { value: 'negative', label: '부정' },
];

const SORTS: ReadonlyArray<{ value: RestaurantPublicReviewSortType; label: string }> = [
  { value: 'recent', label: '최근 방문순' },
  { value: 'rating', label: '별점 높은순' },
];

interface Props {
  filter: RestaurantPublicReviewSentimentType;
  sort: RestaurantPublicReviewSortType;
  // chip 카운트는 전체 풀 기준(detail.reviewCounts). 'all' chip 은 항상 전체
  // 카운트 — 현재 sentiment 필터 적용 후 total 과 별개.
  counts: Record<RestaurantPublicReviewSentimentType, number>;
  onChangeFilter(value: RestaurantPublicReviewSentimentType): void;
  onChangeSort(value: RestaurantPublicReviewSortType): void;
}

// 리뷰 필터(sentiment) / 정렬 칩. 무한 스크롤 FlatList 의 한 행으로 렌더된다.
export const ReviewsControls = ({
  filter,
  sort,
  counts,
  onChangeFilter,
  onChangeSort,
}: Props) => {
  return (
    <View style={styles.controls}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {FILTERS.map((f) => (
          <Chip
            key={f.value}
            label={`${f.label} ${counts[f.value]}`}
            active={filter === f.value}
            onPress={() => onChangeFilter(f.value)}
          />
        ))}
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {SORTS.map((s) => (
          <Chip
            key={s.value}
            label={s.label}
            active={sort === s.value}
            onPress={() => onChangeSort(s.value)}
            small
          />
        ))}
      </ScrollView>
    </View>
  );
};

const Chip = ({
  label,
  active,
  onPress,
  small = false,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  small?: boolean;
}) => {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        small ? styles.chipSmall : styles.chip,
        {
          backgroundColor: active ? theme.colors.primary : theme.colors.surface,
          borderColor: active ? theme.colors.primary : theme.colors.border,
        },
      ]}
    >
      <Text
        style={[
          small ? styles.chipTextSmall : styles.chipText,
          { color: active ? theme.colors.primaryText : theme.colors.textMuted },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  controls: { gap: 8 },
  chipsRow: { gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '500' },
  chipSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipTextSmall: { fontSize: 11, fontWeight: '500' },
});
