import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import type { RestaurantInsightsType } from '@repo/api-contract';
import { SENTIMENT_COLORS } from '../colors';

interface Props {
  insights: RestaurantInsightsType;
  // 주어지면 방문 팁을 탭 가능하게 렌더해 리뷰 필터로 연결한다.
  // (홈 탭에서만 주입 — 인사이트 탭은 정적 목록 유지.)
  onSelectTip?: (term: string) => void;
}

// 통계 카드(만족도/감정점수) + sentiment 분포 막대 + 키워드 칩 + 팁 목록.
export const AiSummary = ({ insights, onSelectTip }: Props) => {
  const theme = useTheme();
  const dist = insights.sentimentDistribution;
  const total = dist.positive + dist.negative + dist.neutral + dist.mixed;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.statRow}>
        <Stat
          label="평균 만족도"
          value={
            insights.avgSatisfactionScore !== null
              ? `${insights.avgSatisfactionScore.toFixed(1)} / 5`
              : '—'
          }
        />
        <Stat
          label="평균 감정 점수"
          value={
            insights.avgSentimentScore !== null
              ? insights.avgSentimentScore.toFixed(2)
              : '—'
          }
          hint="-1(부정) ~ +1(긍정)"
        />
      </View>

      {total > 0 && (
        <View style={{ gap: 4 }}>
          <View style={[styles.bar, { backgroundColor: theme.colors.surfaceAlt }]}>
            {pct(dist.positive) > 0 && (
              <View
                style={{ flex: pct(dist.positive), backgroundColor: SENTIMENT_COLORS.positive }}
              />
            )}
            {pct(dist.neutral) > 0 && (
              <View
                style={{ flex: pct(dist.neutral), backgroundColor: SENTIMENT_COLORS.neutral }}
              />
            )}
            {pct(dist.mixed) > 0 && (
              <View style={{ flex: pct(dist.mixed), backgroundColor: SENTIMENT_COLORS.mixed }} />
            )}
            {pct(dist.negative) > 0 && (
              <View
                style={{ flex: pct(dist.negative), backgroundColor: SENTIMENT_COLORS.negative }}
              />
            )}
          </View>
          <View style={styles.countsRow}>
            <Text style={[styles.count, { color: SENTIMENT_COLORS.positive }]}>
              긍정 {dist.positive}
            </Text>
            <Text style={[styles.count, { color: theme.colors.textMuted }]}>
              중립 {dist.neutral}
            </Text>
            <Text style={[styles.count, { color: SENTIMENT_COLORS.mixed }]}>
              혼합 {dist.mixed}
            </Text>
            <Text style={[styles.count, { color: SENTIMENT_COLORS.negative }]}>
              부정 {dist.negative}
            </Text>
            <Text style={[styles.count, { color: theme.colors.textMuted }]}>· 총 {total}</Text>
          </View>
        </View>
      )}

      {insights.topKeywords.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>
            자주 언급되는 키워드
          </Text>
          <View style={styles.chipsRow}>
            {insights.topKeywords.slice(0, 12).map((k) => (
              <View
                key={k.term}
                style={[styles.kwChip, { backgroundColor: theme.colors.surfaceAlt }]}
              >
                <Text style={[styles.kwChipText, { color: theme.colors.text }]}>
                  {k.term} ·{k.count}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {insights.topTips.length > 0 && (
        <View style={{ gap: 2 }}>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>방문 팁</Text>
          {insights.topTips.slice(0, 8).map((t) =>
            onSelectTip ? (
              <Pressable
                key={t.term}
                onPress={() => onSelectTip(t.term)}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={`"${t.term}" 팁이 달린 리뷰 보기`}
              >
                {({ pressed }) => (
                  <Text
                    style={[
                      styles.tip,
                      { color: pressed ? theme.colors.textMuted : theme.colors.primary },
                    ]}
                  >
                    · {t.term}
                  </Text>
                )}
              </Pressable>
            ) : (
              <Text key={t.term} style={[styles.tip, { color: theme.colors.text }]}>
                · {t.term}
              </Text>
            ),
          )}
        </View>
      )}
    </View>
  );
};

const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.statCard,
        { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
      ]}
    >
      <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: theme.colors.text }]}>{value}</Text>
      {hint && (
        <Text style={[styles.statHint, { color: theme.colors.textMuted }]}>{hint}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  statRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 10, gap: 2 },
  statLabel: { fontSize: 11 },
  statValue: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statHint: { fontSize: 10 },
  bar: {
    flexDirection: 'row',
    height: 8,
    width: '100%',
    borderRadius: 999,
    overflow: 'hidden',
  },
  countsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  count: { fontSize: 11, fontVariant: ['tabular-nums'] },
  label: { fontSize: 12 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  kwChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  kwChipText: { fontSize: 11 },
  tip: { fontSize: 12 },
});
