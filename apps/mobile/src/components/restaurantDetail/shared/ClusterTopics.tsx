import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import type {
  ClusterToneType,
  ReviewClusterAspectSummaryType,
  ReviewClusterItemType,
} from '@repo/api-contract';
import { SENTIMENT_COLORS } from '../colors';

interface Props {
  clusters: ReviewClusterItemType[];
  aspectSummary: ReviewClusterAspectSummaryType[];
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
export const ClusterTopics = ({ clusters, aspectSummary, total, clustered }: Props) => {
  const theme = useTheme();
  if (clusters.length === 0) {
    return aspectSummary.length > 0 ? (
      <AspectSummary aspects={aspectSummary} total={total} />
    ) : null;
  }
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

// 토픽 군집이 안 잡히는(전부 노이즈) 식당의 폴백 — 관점별 긍/부/중립 집계.
const AspectSummary = ({
  aspects,
  total,
}: {
  aspects: ReviewClusterAspectSummaryType[];
  total: number;
}) => {
  const theme = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.h3Row}>
        <Text style={[styles.h3, { color: theme.colors.text }]}>리뷰 관점별 평</Text>
        <Text style={[styles.h3Sub, { color: theme.colors.textMuted }]}>
          (리뷰 {total.toLocaleString()}건 · 긍정/부정)
        </Text>
      </View>
      {aspects.map((a) => {
        const sum = a.pos + a.neg + a.neu || 1;
        return (
          <View key={a.aspect} style={{ gap: 4 }}>
            <View style={styles.aspRow}>
              <Text style={[styles.aspName, { color: theme.colors.text }]}>{a.aspect}</Text>
              <View style={styles.aspStats}>
                {a.pos > 0 && (
                  <Text style={[styles.aspStat, { color: SENTIMENT_COLORS.positive }]}>👍 {a.pos}</Text>
                )}
                {a.neg > 0 && (
                  <Text style={[styles.aspStat, { color: SENTIMENT_COLORS.negative }]}>👎 {a.neg}</Text>
                )}
                {a.neu > 0 && (
                  <Text style={[styles.aspStat, { color: theme.colors.textMuted }]}>· {a.neu}</Text>
                )}
              </View>
            </View>
            <View style={[styles.bar, { backgroundColor: theme.colors.surfaceAlt }]}>
              {a.pos > 0 && <View style={{ flex: a.pos, backgroundColor: SENTIMENT_COLORS.positive }} />}
              {a.neu > 0 && <View style={{ flex: a.neu, backgroundColor: SENTIMENT_COLORS.neutral }} />}
              {a.neg > 0 && <View style={{ flex: a.neg, backgroundColor: SENTIMENT_COLORS.negative }} />}
              {sum === 0 && <View style={{ flex: 1 }} />}
            </View>
          </View>
        );
      })}
      <Text style={[styles.fine, { color: theme.colors.textMuted }]}>
        뚜렷한 주제 묶음이 형성되지 않아 관점별 집계로 보여드려요.
      </Text>
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
  aspRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  aspName: { fontSize: 13, fontWeight: '600' },
  aspStats: { flexDirection: 'row', gap: 8 },
  aspStat: { fontSize: 11, fontVariant: ['tabular-nums'] },
  fine: { fontSize: 11, lineHeight: 16 },
});
