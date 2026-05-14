import { StyleSheet, Text, View } from 'react-native';
import { SENTIMENT_COLORS, MIXED_BG, NEGATIVE_BG, NEUTRAL_BG, POSITIVE_BG } from '../colors';

type SentimentKey = 'positive' | 'neutral' | 'negative' | 'mixed';

const BG: Record<SentimentKey, string> = {
  positive: POSITIVE_BG,
  negative: NEGATIVE_BG,
  mixed: MIXED_BG,
  neutral: NEUTRAL_BG,
};

// 만족도 칩 — 컬러 도트 + 점수. ReviewCard 헤더에 한 곳으로 시그널 집중.
export const SatisfactionChip = ({
  sentiment,
  score,
}: {
  sentiment: SentimentKey;
  score: number;
}) => (
  <View style={[styles.chip, { backgroundColor: BG[sentiment] }]}>
    <View style={[styles.dot, { backgroundColor: SENTIMENT_COLORS[sentiment] }]} />
    <Text style={[styles.score, { color: SENTIMENT_COLORS[sentiment] }]}>{score}</Text>
  </View>
);

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  score: { fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
