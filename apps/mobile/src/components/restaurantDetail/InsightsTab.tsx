import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import type {
  RestaurantInsightsType,
  RestaurantPublicDetailType,
} from '@repo/api-contract';
import { SENTIMENT_COLORS } from './colors';
import { AiSummary } from './shared/AiSummary';

interface Props {
  detail: RestaurantPublicDetailType;
  insights: RestaurantInsightsType | undefined;
  insightsLoading: boolean;
  onSelectTip(term: string): void;
  onSelectMenu(name: string): void;
}

// 분석 + 메뉴 순위. 데이터는 컨테이너에서 한 번 fetch 했고 여기는 표시 전담.
export const InsightsTab = ({
  detail,
  insights,
  insightsLoading,
  onSelectTip,
  onSelectMenu,
}: Props) => {
  const theme = useTheme();

  if (insightsLoading) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator />
        <Text style={{ color: theme.colors.textMuted, marginTop: 8 }}>
          분석 정보 불러오는 중…
        </Text>
      </View>
    );
  }

  if (!insights || insights.analyzedCount === 0) {
    return (
      <View
        style={[
          styles.emptyCard,
          { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
        ]}
      >
        <Text style={{ color: theme.colors.textMuted, textAlign: 'center' }}>
          아직 분석된 리뷰가 없습니다.{'\n'}리뷰가 충분히 모이면 자동으로 표시됩니다.
        </Text>
      </View>
    );
  }

  const ranked = [...insights.topMenus]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 20);

  return (
    <View style={styles.wrap}>
      <View style={{ gap: 12 }}>
        <View style={styles.h3Row}>
          <Text style={[styles.h3, { color: theme.colors.text }]}>AI 분석 종합</Text>
          <Text style={[styles.h3Sub, { color: theme.colors.textMuted }]}>
            ({insights.analyzedCount}개 리뷰 분석)
          </Text>
        </View>
        <AiSummary insights={insights} onSelectTip={onSelectTip} />
      </View>

      {ranked.length > 0 && (
        <View style={[styles.section, { borderTopColor: theme.colors.border }]}>
          <View style={styles.h3Row}>
            <Text style={[styles.h3, { color: theme.colors.text }]}>인기 메뉴 순위</Text>
            <Text style={[styles.h3Sub, { color: theme.colors.textMuted }]}>
              (멘션 많은 순)
            </Text>
          </View>
          <View style={{ gap: 8, marginTop: 12 }}>
            {ranked.map((m, i) => {
              const total = m.positive + m.negative + m.neutral;
              const posPct = total > 0 ? (m.positive / total) * 100 : 0;
              const negPct = total > 0 ? (m.negative / total) * 100 : 0;
              const neuPct = Math.max(0, 100 - posPct - negPct);
              return (
                <Pressable
                  key={m.name}
                  onPress={() => onSelectMenu(m.name)}
                  accessibilityRole="button"
                  accessibilityLabel={`"${m.name}" 메뉴가 언급된 리뷰 보기`}
                  style={({ pressed }) => [
                    styles.menuItem,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: pressed
                        ? theme.colors.surfaceAlt
                        : theme.colors.surface,
                    },
                  ]}
                >
                  <Text style={[styles.rank, { color: theme.colors.textMuted }]}>
                    {i + 1}
                  </Text>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text
                      style={[styles.menuName, { color: theme.colors.text }]}
                      numberOfLines={1}
                    >
                      {m.name}
                    </Text>
                    {total > 0 && (
                      <>
                        <View
                          style={[styles.bar, { backgroundColor: theme.colors.surfaceAlt }]}
                        >
                          {posPct > 0 && (
                            <View
                              style={{
                                flex: posPct,
                                backgroundColor: SENTIMENT_COLORS.positive,
                              }}
                            />
                          )}
                          {neuPct > 0 && (
                            <View
                              style={{
                                flex: neuPct,
                                backgroundColor: SENTIMENT_COLORS.neutral,
                              }}
                            />
                          )}
                          {negPct > 0 && (
                            <View
                              style={{
                                flex: negPct,
                                backgroundColor: SENTIMENT_COLORS.negative,
                              }}
                            />
                          )}
                        </View>
                        <View style={styles.statsRow}>
                          <Text style={[styles.stat, { color: theme.colors.textMuted }]}>
                            {m.count}회 언급
                          </Text>
                          <Text style={[styles.stat, { color: SENTIMENT_COLORS.positive }]}>
                            · +{m.positive}
                          </Text>
                          <Text style={[styles.stat, { color: SENTIMENT_COLORS.negative }]}>
                            -{m.negative}
                          </Text>
                          {m.neutral > 0 && (
                            <Text style={[styles.stat, { color: theme.colors.textMuted }]}>
                              · 중립 {m.neutral}
                            </Text>
                          )}
                        </View>
                      </>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
          {detail.menus.length > 0 && (
            <Text
              style={[
                styles.footnote,
                { color: theme.colors.textMuted, borderTopColor: theme.colors.border },
              ]}
            >
              메뉴 가격·사진은 메뉴 탭에서 볼 수 있습니다.
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 20 },
  empty: { paddingVertical: 48, alignItems: 'center' },
  emptyCard: { margin: 16, padding: 20, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed' },
  section: { paddingTop: 16, borderTopWidth: 1 },
  h3Row: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  h3: { fontSize: 14, fontWeight: '600' },
  h3Sub: { fontSize: 11 },
  menuItem: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  rank: { width: 24, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: 'center' },
  menuName: { fontSize: 14, fontWeight: '500' },
  bar: {
    flexDirection: 'row',
    height: 6,
    width: '100%',
    borderRadius: 999,
    overflow: 'hidden',
  },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stat: { fontSize: 11, fontVariant: ['tabular-nums'] },
  footnote: { fontSize: 11, marginTop: 12, paddingTop: 8 },
});
