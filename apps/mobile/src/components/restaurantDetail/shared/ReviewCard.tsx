import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@repo/shared';
import type { PublicVisitorReviewType } from '@repo/api-contract';
import { SENTIMENT_COLORS } from '../colors';
import { Lightbox } from '../Lightbox';
import { SatisfactionChip } from './SatisfactionChip';

interface Props {
  review: PublicVisitorReviewType;
}

// 리뷰 카드 — 만족도 칩 + 본문 + 가로 스크롤 이미지(탭 → Lightbox) + 분석 세부
// (메뉴 stripe / 팁 / 키워드).
export const ReviewCard = ({ review: r }: Props) => {
  const theme = useTheme();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const authorLabel = r.authorName ?? '익명';

  return (
    <View
      style={[
        styles.card,
        { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={[styles.author, { color: theme.colors.textMuted }]}>
            {authorLabel}
          </Text>
          {r.analysis && (
            <SatisfactionChip
              sentiment={r.analysis.sentiment}
              score={r.analysis.satisfactionScore}
            />
          )}
        </View>
        <Text style={[styles.date, { color: theme.colors.textMuted }]}>
          {r.visitedAt ?? r.fetchedAt.slice(0, 10)}
        </Text>
      </View>

      {r.analysis && (
        <Text style={[styles.summary, { color: theme.colors.text }]}>
          {r.analysis.text}
        </Text>
      )}
      <Text style={[styles.body, { color: theme.colors.textMuted }]}>{r.body}</Text>

      {r.imageUrls.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.imageRow}
        >
          {r.imageUrls.map((u, i) => (
            <Pressable
              key={i}
              onPress={() => setLightboxIndex(i)}
              accessibilityLabel={`${authorLabel} 리뷰 ${i + 1}번 사진 크게 보기`}
            >
              <Image source={u} style={styles.image} recyclingKey={u} contentFit="cover" />
            </Pressable>
          ))}
        </ScrollView>
      )}

      {r.analysis && r.analysis.menus.length > 0 && (
        <View style={styles.menuList}>
          {r.analysis.menus.map((m, i) => {
            const stripe =
              m.sentiment === 'positive'
                ? SENTIMENT_COLORS.positive
                : m.sentiment === 'negative'
                  ? SENTIMENT_COLORS.negative
                  : theme.colors.border;
            return (
              <View
                key={`${m.name}-${i}`}
                style={[styles.menuRow, { borderLeftColor: stripe }]}
              >
                <Text style={[styles.menuName, { color: theme.colors.text }]}>
                  {m.name}
                </Text>
                {m.traits.length > 0 && (
                  <Text style={[styles.menuTraits, { color: theme.colors.textMuted }]}>
                    {m.traits.join(' · ')}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      {r.analysis && r.analysis.tips.length > 0 && (
        <View style={[styles.tipBox, { backgroundColor: theme.colors.surfaceAlt }]}>
          {r.analysis.tips.map((t, i) => (
            <Text key={i} style={[styles.tipText, { color: theme.colors.textMuted }]}>
              💡 {t}
            </Text>
          ))}
        </View>
      )}

      {r.analysis && r.analysis.keywords.length > 0 && (
        <View style={styles.kwRow}>
          {r.analysis.keywords.slice(0, 8).map((k) => (
            <View
              key={k}
              style={[styles.kwChip, { backgroundColor: theme.colors.surfaceAlt }]}
            >
              <Text style={[styles.kwChipText, { color: theme.colors.textMuted }]}>
                {k}
              </Text>
            </View>
          ))}
        </View>
      )}

      {lightboxIndex !== null && r.imageUrls.length > 0 && (
        <Lightbox
          images={r.imageUrls}
          index={lightboxIndex}
          onChangeIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 6 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  author: { fontSize: 12 },
  date: { fontSize: 11 },
  summary: { fontSize: 14, fontWeight: '500' },
  body: { fontSize: 12, lineHeight: 18 },
  imageRow: { gap: 6, paddingVertical: 4 },
  image: { width: 160, height: 200, borderRadius: 6, backgroundColor: '#f4f4f5' },
  menuList: { gap: 4, marginTop: 4 },
  menuRow: { borderLeftWidth: 2, paddingLeft: 8, paddingVertical: 2 },
  menuName: { fontSize: 12, fontWeight: '600' },
  menuTraits: { fontSize: 11, marginTop: 1 },
  tipBox: { padding: 8, borderRadius: 6, gap: 2, marginTop: 4 },
  tipText: { fontSize: 12 },
  kwRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  kwChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  kwChipText: { fontSize: 10 },
});
