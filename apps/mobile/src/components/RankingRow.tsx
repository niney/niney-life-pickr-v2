import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';

// 긍/부정 색은 토큰 외 의미 색상이라 직접 지정 — 웹 HomePage 의 emerald-500 / rose-500 / zinc-400 매칭.
const POSITIVE = '#10b981';
const NEGATIVE = '#f43f5e';
const NEUTRAL = '#a1a1aa';

export interface RankingRowItem {
  rank: number;
  placeId: string;
  name: string;
  category: string | null;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  totalMentions: number;
  score: number;
}

interface Props {
  item: RankingRowItem;
  sort: 'positive' | 'negative';
}

export const RankingRow = ({ item, sort }: Props) => {
  const theme = useTheme();
  const total = Math.max(1, item.totalMentions);
  const posPct = (item.positiveCount / total) * 100;
  const negPct = (item.negativeCount / total) * 100;
  const neuPct = Math.max(0, 100 - posPct - negPct);

  const scoreColor = sort === 'positive' ? POSITIVE : NEGATIVE;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <View style={styles.rankBox}>
        <Text style={[styles.rank, { color: theme.colors.textMuted }]}>{item.rank}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.headRow}>
          <View style={styles.headLeft}>
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
          <Text style={[styles.score, { color: scoreColor }]}>
            {Math.round(item.score * 100)}%
          </Text>
        </View>

        <View style={[styles.bar, { backgroundColor: theme.colors.surfaceAlt }]}>
          {posPct > 0 && <View style={[styles.barSeg, { flex: posPct, backgroundColor: POSITIVE }]} />}
          {neuPct > 0 && <View style={[styles.barSeg, { flex: neuPct, backgroundColor: NEUTRAL }]} />}
          {negPct > 0 && <View style={[styles.barSeg, { flex: negPct, backgroundColor: NEGATIVE }]} />}
        </View>

        <View style={styles.metaRow}>
          <Text style={[styles.meta, { color: POSITIVE }]}>긍정 {item.positiveCount}</Text>
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
            중립 {item.neutralCount}
          </Text>
          <Text style={[styles.meta, { color: NEGATIVE }]}>부정 {item.negativeCount}</Text>
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
            · 총 {item.totalMentions}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  rankBox: { width: 32, alignItems: 'center' },
  rank: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  body: { flex: 1, gap: 8, minWidth: 0 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  headLeft: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '600' },
  category: { fontSize: 12, marginTop: 2 },
  score: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  bar: {
    flexDirection: 'row',
    height: 8,
    width: '100%',
    borderRadius: 999,
    overflow: 'hidden',
  },
  barSeg: { height: '100%' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  meta: { fontSize: 12, fontVariant: ['tabular-nums'] },
});
