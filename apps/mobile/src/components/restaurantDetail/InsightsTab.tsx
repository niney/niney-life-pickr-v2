import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRestaurantClusters, useRestaurantPublicCategoryTree, useTheme } from '@repo/shared';
import type {
  RestaurantInsightsType,
  RestaurantPublicDetailType,
} from '@repo/api-contract';
import { SENTIMENT_COLORS } from './colors';
import { AiSummary } from './shared/AiSummary';
import { CategoryTree } from './shared/CategoryTree';
import { ClusterTopics } from './shared/ClusterTopics';

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
  // 카테고리 트리는 별도 endpoint — 훅 규칙상 early return 위에서 호출. 전역
  // 머지가 닿은 식당만 roots 가 채워지므로 비면 섹션을 숨긴다.
  const categoryTree = useRestaurantPublicCategoryTree(detail.placeId);
  // 리뷰 주제 군집(배치 결과 읽기 전용) — 아직 없으면(ready=false) 섹션 숨김.
  const clusters = useRestaurantClusters(detail.placeId);

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

      {clusters.data?.ready && (
        <View style={[styles.section, { borderTopColor: theme.colors.border }]}>
          <ClusterTopics
            clusters={clusters.data.clusters}
            aspectSummary={clusters.data.aspectSummary}
            total={clusters.data.total}
            clustered={clusters.data.clustered}
          />
        </View>
      )}

      {categoryTree.data && categoryTree.data.roots.length > 0 && (
        <View style={[styles.section, { borderTopColor: theme.colors.border }]}>
          <View style={styles.h3Row}>
            <Text style={[styles.h3, { color: theme.colors.text }]}>메뉴 카테고리</Text>
            <Text style={[styles.h3Sub, { color: theme.colors.textMuted }]}>
              (언급 횟수 · 긍정/부정)
            </Text>
          </View>
          <View style={{ marginTop: 12 }}>
            <CategoryTree roots={categoryTree.data.roots} />
          </View>
        </View>
      )}

      {ranked.length > 0 && (
        <View style={[styles.section, { borderTopColor: theme.colors.border }]}>
          <View style={styles.h3Row}>
            <Text style={[styles.h3, { color: theme.colors.text }]}>인기 메뉴 순위</Text>
            <Text style={[styles.h3Sub, { color: theme.colors.textMuted }]}>
              (멘션 많은 순)
            </Text>
          </View>
          <View style={{ marginTop: 12 }}>
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
                    i < ranked.length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: theme.colors.border,
                    },
                    pressed && { backgroundColor: theme.colors.surfaceAlt },
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
    paddingVertical: 12,
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
