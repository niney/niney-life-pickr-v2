import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import type { ClusterToneType, ReviewClusterItemType } from '@repo/api-contract';
import { SENTIMENT_COLORS } from '../colors';

interface Props {
  clusters: ReviewClusterItemType[];
  total: number;
  clustered: number;
}

const MIXED = '#f59e0b';
const toneColor = (tone: ClusterToneType): string =>
  tone === 'positive'
    ? SENTIMENT_COLORS.positive
    : tone === 'negative'
      ? SENTIMENT_COLORS.negative
      : tone === 'mixed'
        ? MIXED
        : SENTIMENT_COLORS.neutral;
const TONE_LABEL: Record<ClusterToneType, string> = {
  positive: '긍정',
  negative: '부정',
  mixed: '혼합',
  neutral: '중립',
};

// 군집 한 행 — 라벨·tone·카운트·상대 비중 막대·키워드 칩 + 대표리뷰 펼치기.
const ClusterRow = ({ c, max }: { c: ReviewClusterItemType; max: number }) => {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const tc = toneColor(c.tone);
  return (
    <View style={[styles.card, { borderColor: theme.colors.border }]}>
      <View style={styles.head}>
        <View style={[styles.dot, { backgroundColor: tc }]} />
        <Text style={[styles.label, { color: theme.colors.text }]} numberOfLines={1}>
          {c.label}
        </Text>
        <Text style={[styles.tone, { color: tc }]}>{TONE_LABEL[c.tone]}</Text>
        <Text style={[styles.count, { color: theme.colors.textMuted }]}>{c.size}건</Text>
      </View>

      <View style={[styles.bar, { backgroundColor: theme.colors.surfaceAlt }]}>
        <View style={{ flex: c.size, backgroundColor: tc }} />
        <View style={{ flex: Math.max(0, max - c.size) }} />
      </View>

      {c.keywords.length > 0 && (
        <View style={styles.chips}>
          {c.keywords.slice(0, 6).map((k) => (
            <View key={k} style={[styles.chip, { borderColor: theme.colors.border }]}>
              <Text style={[styles.chipText, { color: theme.colors.textMuted }]}>{k}</Text>
            </View>
          ))}
        </View>
      )}

      {c.repReviews.length > 0 && (
        <>
          <Pressable onPress={() => setOpen((v) => !v)} hitSlop={6}>
            <Text style={[styles.more, { color: theme.colors.textMuted }]}>
              대표 리뷰 {c.repReviews.length}건 {open ? '▲' : '▼'}
            </Text>
          </Pressable>
          {open &&
            c.repReviews.map((r) => (
              <View key={r.reviewId} style={[styles.rep, { borderColor: theme.colors.border }]}>
                {r.rating != null && (
                  <Text style={[styles.repRating, { color: SENTIMENT_COLORS.positive }]}>
                    ★ {r.rating}
                  </Text>
                )}
                <Text style={[styles.repBody, { color: theme.colors.text }]}>{r.body}</Text>
              </View>
            ))}
        </>
      )}
    </View>
  );
};

// 리뷰 주제 군집 — 비슷한 문맥 리뷰를 묶어 라벨·카운트·대표리뷰로. 배치 결과 읽기 전용.
export const ClusterTopics = ({ clusters, total, clustered }: Props) => {
  const theme = useTheme();
  if (clusters.length === 0) return null;
  const max = Math.max(...clusters.map((c) => c.size));
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.h3Row}>
        <Text style={[styles.h3, { color: theme.colors.text }]}>리뷰 주제</Text>
        <Text style={[styles.h3Sub, { color: theme.colors.textMuted }]}>
          ({clusters.length}개 주제 · {clustered.toLocaleString()}/{total.toLocaleString()}건)
        </Text>
      </View>
      {clusters.map((c) => (
        <ClusterRow key={c.id} c={c} max={max} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  h3Row: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  h3: { fontSize: 14, fontWeight: '600' },
  h3Sub: { fontSize: 12 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { flex: 1, fontSize: 13, fontWeight: '600' },
  tone: { fontSize: 11, fontWeight: '600' },
  count: { fontSize: 11, fontVariant: ['tabular-nums'] },
  bar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 11 },
  more: { fontSize: 12, paddingVertical: 2 },
  rep: { borderWidth: 1, borderRadius: 8, padding: 9, gap: 3 },
  repRating: { fontSize: 11, fontWeight: '600' },
  repBody: { fontSize: 12, lineHeight: 18 },
});
