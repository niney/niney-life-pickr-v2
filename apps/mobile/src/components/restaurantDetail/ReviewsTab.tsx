import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import type {
  PublicVisitorReviewType,
  RestaurantPublicDetailType,
} from '@repo/api-contract';
import { ReviewCard } from './shared/ReviewCard';

type SentimentFilter = 'all' | 'positive' | 'negative';
type SortMode = 'recent' | 'rating';

const FILTERS: ReadonlyArray<{ value: SentimentFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'positive', label: '긍정' },
  { value: 'negative', label: '부정' },
];

const SORTS: ReadonlyArray<{ value: SortMode; label: string }> = [
  { value: 'recent', label: '최근 방문순' },
  { value: 'rating', label: '별점 높은순' },
];

interface Props {
  detail: RestaurantPublicDetailType;
}

export const ReviewsTab = ({ detail }: Props) => {
  const theme = useTheme();
  const [filter, setFilter] = useState<SentimentFilter>('all');
  const [sort, setSort] = useState<SortMode>('recent');

  const counts = useMemo(() => countBySentiment(detail.reviews), [detail.reviews]);

  const visible = useMemo(() => {
    let list = detail.reviews;
    if (filter !== 'all') {
      list = list.filter((r) => r.analysis?.sentiment === filter);
    }
    return [...list].sort(comparator(sort));
  }, [detail.reviews, filter, sort]);

  if (detail.reviews.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={{ color: theme.colors.textMuted }}>
          아직 수집된 리뷰가 없습니다.
        </Text>
      </View>
    );
  }

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

      {visible.length === 0 ? (
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
          {visible.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
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

const countBySentiment = (
  reviews: PublicVisitorReviewType[],
): Record<SentimentFilter, number> => {
  const out: Record<SentimentFilter, number> = {
    all: reviews.length,
    positive: 0,
    negative: 0,
  };
  for (const r of reviews) {
    if (r.analysis?.sentiment === 'positive') out.positive += 1;
    else if (r.analysis?.sentiment === 'negative') out.negative += 1;
  }
  return out;
};

const comparator = (mode: SortMode) => {
  if (mode === 'rating') {
    return (a: PublicVisitorReviewType, b: PublicVisitorReviewType) =>
      (b.rating ?? 0) - (a.rating ?? 0);
  }
  return (a: PublicVisitorReviewType, b: PublicVisitorReviewType) =>
    +new Date(a.fetchedAt) - +new Date(b.fetchedAt);
};

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12 },
  empty: { paddingVertical: 48, alignItems: 'center' },
  emptyCard: { padding: 24, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center' },
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
