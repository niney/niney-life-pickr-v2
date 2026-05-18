import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRestaurantPublicReviews, useTheme } from '@repo/shared';
import type {
  PublicVisitorReviewType,
  RestaurantPublicDetailType,
  RestaurantPublicReviewSentimentType,
  RestaurantPublicReviewSortType,
} from '@repo/api-contract';
import { ReviewCard } from './shared/ReviewCard';

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
  // detail 전체가 아니라 placeId 와 첫 페이지 seed + 필터 카운트만 받음.
  placeId: string;
  detail: RestaurantPublicDetailType;
}

export const ReviewsTab = ({ placeId, detail }: Props) => {
  const theme = useTheme();
  const [filter, setFilter] = useState<RestaurantPublicReviewSentimentType>('all');
  const [sort, setSort] = useState<RestaurantPublicReviewSortType>('recent');

  const seed = useMemo(
    () => ({
      items: detail.reviewsFirstPage,
      total: detail.reviewCounts.all,
    }),
    [detail.reviewsFirstPage, detail.reviewCounts.all],
  );

  const reviewsQuery = useRestaurantPublicReviews(placeId, { sentiment: filter, sort }, seed);
  const flat: PublicVisitorReviewType[] = useMemo(
    () =>
      reviewsQuery.data ? reviewsQuery.data.pages.flatMap((p) => p.items) : [],
    [reviewsQuery.data],
  );

  // chip 카운트는 detail.reviewCounts (전체 풀 기준). 'all' chip 은 항상 전체
  // 카운트 — 현재 sentiment 필터 적용 후 total 과 별개.
  const counts = detail.reviewCounts;

  if (counts.all === 0) {
    return (
      <View style={styles.empty}>
        <Text style={{ color: theme.colors.textMuted }}>
          아직 수집된 리뷰가 없습니다.
        </Text>
      </View>
    );
  }

  const hasMore = reviewsQuery.hasNextPage ?? false;
  const isLoadingMore = reviewsQuery.isFetchingNextPage;

  return (
    <View style={styles.wrap}>
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
              onPress={() => setFilter(f.value)}
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
              onPress={() => setSort(s.value)}
              small
            />
          ))}
        </ScrollView>
      </View>

      {reviewsQuery.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : flat.length === 0 ? (
        <View
          style={[
            styles.emptyCard,
            { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
          ]}
        >
          <Text style={{ color: theme.colors.textMuted }}>
            조건에 맞는 리뷰가 없습니다.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {flat.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
          {hasMore && (
            <Pressable
              onPress={() => reviewsQuery.fetchNextPage()}
              disabled={isLoadingMore}
              style={[
                styles.loadMoreBtn,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                  opacity: isLoadingMore ? 0.6 : 1,
                },
              ]}
            >
              {isLoadingMore ? (
                <ActivityIndicator size="small" />
              ) : (
                <Text style={[styles.loadMoreText, { color: theme.colors.text }]}>
                  더 보기
                </Text>
              )}
            </Pressable>
          )}
        </View>
      )}
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
  wrap: { padding: 16, gap: 12 },
  empty: { paddingVertical: 48, alignItems: 'center' },
  emptyCard: {
    padding: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  loading: { paddingVertical: 24, alignItems: 'center' },
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
  loadMoreBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 4,
  },
  loadMoreText: { fontSize: 13, fontWeight: '500' },
});
