import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import type { RestaurantPublicListItemType } from '@repo/api-contract';

// 긍/중/부 의미 색상. RankingRow 와 동일하게 직접 지정.
const POSITIVE = '#10b981';
const NEGATIVE = '#f43f5e';
const NEUTRAL = '#a1a1aa';
const STAR = '#d97706';

interface Props {
  item: RestaurantPublicListItemType;
  selected?: boolean;
}

export const PublicRestaurantCard = ({ item, selected = false }: Props) => {
  const theme = useTheme();

  const hasAi = item.analyzedCount > 0;
  const totalSent = item.positiveCount + item.negativeCount + item.neutralCount;
  const posPct = totalSent > 0 ? (item.positiveCount / totalSent) * 100 : 0;
  const negPct = totalSent > 0 ? (item.negativeCount / totalSent) * 100 : 0;
  const neuPct = Math.max(0, 100 - posPct - negPct);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
        },
      ]}
    >
      <View style={[styles.thumb, { backgroundColor: theme.colors.surfaceAlt }]}>
        {item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbImg} />
        ) : (
          <Text style={[styles.thumbPlaceholder, { color: theme.colors.textMuted }]}>
            no img
          </Text>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.headRow}>
          <Text
            style={[styles.name, { color: theme.colors.text }]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          {item.category && (
            <Text
              style={[styles.category, { color: theme.colors.textMuted }]}
              numberOfLines={1}
            >
              {item.category}
            </Text>
          )}
        </View>

        <Text
          style={[styles.address, { color: theme.colors.textMuted }]}
          numberOfLines={1}
        >
          {item.roadAddress ?? item.address ?? '주소 정보 없음'}
        </Text>

        <View style={styles.metaRow}>
          {item.rating !== null && (
            <Text style={[styles.meta, { color: STAR }]}>★ {item.rating}</Text>
          )}
          {item.reviewCount !== null && (
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
              리뷰 {item.reviewCount}
            </Text>
          )}
          {hasAi && item.avgSatisfactionScore !== null && (
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
              😊 {item.avgSatisfactionScore.toFixed(1)}/5
            </Text>
          )}
          {item.latitude === null && (
            <Text style={[styles.meta, { color: STAR }]}>좌표 없음</Text>
          )}
        </View>

        {hasAi && totalSent > 0 && (
          <View style={styles.aiBlock}>
            <View style={[styles.bar, { backgroundColor: theme.colors.surfaceAlt }]}>
              {posPct > 0 && <View style={[styles.barSeg, { flex: posPct, backgroundColor: POSITIVE }]} />}
              {neuPct > 0 && <View style={[styles.barSeg, { flex: neuPct, backgroundColor: NEUTRAL }]} />}
              {negPct > 0 && <View style={[styles.barSeg, { flex: negPct, backgroundColor: NEGATIVE }]} />}
            </View>
            <View style={styles.aiCountsRow}>
              <Text style={[styles.aiCount, { color: POSITIVE }]}>+{item.positiveCount}</Text>
              <Text style={[styles.aiCount, { color: theme.colors.textMuted }]}>·</Text>
              <Text style={[styles.aiCount, { color: NEGATIVE }]}>-{item.negativeCount}</Text>
              <Text style={[styles.aiCount, { color: theme.colors.textMuted }]}>·</Text>
              <Text style={[styles.aiCount, { color: theme.colors.textMuted }]}>
                분석 {item.analyzedCount}
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  thumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbPlaceholder: { fontSize: 12 },
  body: { flex: 1, minWidth: 0, gap: 4 },
  headRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  name: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  category: { fontSize: 12, flexShrink: 0 },
  address: { fontSize: 12 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 },
  meta: { fontSize: 12, fontVariant: ['tabular-nums'] },
  aiBlock: { marginTop: 4, gap: 4 },
  bar: {
    flexDirection: 'row',
    height: 6,
    width: '100%',
    borderRadius: 999,
    overflow: 'hidden',
  },
  barSeg: { height: '100%' },
  aiCountsRow: { flexDirection: 'row', gap: 6 },
  aiCount: { fontSize: 11, fontVariant: ['tabular-nums'] },
});
