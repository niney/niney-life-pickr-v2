import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@repo/shared';
import { formatWonPrice } from '@repo/utils';
import type {
  RestaurantInsightsType,
  RestaurantPublicDetailType,
} from '@repo/api-contract';
import { SENTIMENT_COLORS } from '../colors';

interface Props {
  menus: RestaurantPublicDetailType['menus'];
  insights: RestaurantInsightsType | undefined;
}

// 메뉴 리스트 — 이름·가격·설명·이미지 + (있으면) insights 의 긍/부 멘션 통계.
export const MenuGrid = ({ menus, insights }: Props) => {
  const theme = useTheme();
  const mentionByName = new Map<string, { positive: number; negative: number; count: number }>();
  if (insights) {
    for (const m of insights.topMenus) mentionByName.set(m.name, m);
  }

  return (
    <View style={{ gap: 8 }}>
      {menus.map((m, idx) => {
        const stats = mentionByName.get(m.name);
        return (
          <View
            key={`${m.name}-${idx}`}
            style={[
              styles.row,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
            ]}
          >
            {m.imageUrls[0] ? (
              <Image
                source={m.imageUrls[0]}
                style={styles.thumb}
                recyclingKey={m.imageUrls[0]}
                contentFit="cover"
              />
            ) : null}
            <View style={styles.body}>
              <View style={styles.titleRow}>
                <Text
                  style={[styles.name, { color: theme.colors.text }]}
                  numberOfLines={1}
                >
                  {m.name}
                </Text>
                {m.recommend ? (
                  <View
                    style={[styles.recBadge, { backgroundColor: theme.colors.surfaceAlt }]}
                  >
                    <Text style={[styles.recBadgeText, { color: theme.colors.text }]}>
                      추천
                    </Text>
                  </View>
                ) : null}
              </View>
              {m.price && (
                <Text style={[styles.price, { color: theme.colors.textMuted }]}>
                  {formatWonPrice(m.price)}
                </Text>
              )}
              {m.description && (
                <Text
                  style={[styles.desc, { color: theme.colors.textMuted }]}
                  numberOfLines={2}
                >
                  {m.description}
                </Text>
              )}
              {stats && (
                <View style={styles.statsRow}>
                  <Text style={[styles.statText, { color: SENTIMENT_COLORS.positive }]}>
                    +{stats.positive}
                  </Text>
                  <Text style={[styles.statText, { color: theme.colors.textMuted }]}>/</Text>
                  <Text style={[styles.statText, { color: SENTIMENT_COLORS.negative }]}>
                    -{stats.negative}
                  </Text>
                  <Text style={[styles.statText, { color: theme.colors.textMuted }]}>
                    · {stats.count}회 언급
                  </Text>
                </View>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  thumb: { width: 56, height: 56, borderRadius: 6, backgroundColor: '#f4f4f5' },
  body: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  recBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  recBadgeText: { fontSize: 10, fontWeight: '500' },
  price: { fontSize: 12, fontVariant: ['tabular-nums'] },
  desc: { fontSize: 12 },
  statsRow: { flexDirection: 'row', gap: 4, marginTop: 2 },
  statText: { fontSize: 11, fontVariant: ['tabular-nums'] },
});
