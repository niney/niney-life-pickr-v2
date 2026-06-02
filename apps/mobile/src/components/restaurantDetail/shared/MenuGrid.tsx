import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@repo/shared';
import { formatWonPrice } from '@repo/utils';
import type {
  RestaurantInsightsType,
  RestaurantPublicDetailType,
} from '@repo/api-contract';
import { Lightbox } from '~/components/Lightbox';
import { SENTIMENT_COLORS } from '../colors';

interface Props {
  menus: RestaurantPublicDetailType['menus'];
  insights: RestaurantInsightsType | undefined;
  // 주어지면 멘션 통계가 있는 메뉴를 탭 가능하게 렌더해 리뷰 필터로 연결.
  // 멘션 없는(stats 없는) 메뉴는 결과가 비므로 정적 카드로 둔다.
  onSelectMenu?: (name: string) => void;
}

// 메뉴 리스트 — 이름·가격·설명·이미지 + (있으면) insights 의 긍/부 멘션 통계.
export const MenuGrid = ({ menus, insights, onSelectMenu }: Props) => {
  const theme = useTheme();
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(
    null,
  );
  const mentionByName = new Map<string, { positive: number; negative: number; count: number }>();
  if (insights) {
    for (const m of insights.topMenus) mentionByName.set(m.name, m);
  }

  return (
    <View style={{ gap: 8 }}>
      {menus.map((m, idx) => {
        const stats = mentionByName.get(m.name);
        const clickable = !!onSelectMenu && !!stats;
        const hasImage = !!m.imageUrls[0];
        const body = (
          <>
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
          </>
        );
        // 영역 분리: 썸네일=사진 확대(라이트박스), 텍스트=리뷰 필터.
        return (
          <View
            key={`${m.name}-${idx}`}
            style={[
              styles.row,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
            ]}
          >
            {hasImage ? (
              <Pressable
                onPress={() => setLightbox({ images: m.imageUrls, index: 0 })}
                accessibilityRole="button"
                accessibilityLabel={`"${m.name}" 메뉴 사진 크게 보기`}
                style={({ pressed }) => [styles.thumbWrap, pressed && { opacity: 0.7 }]}
              >
                <Image
                  source={m.imageUrls[0]}
                  style={styles.thumb}
                  recyclingKey={m.imageUrls[0]}
                  contentFit="cover"
                />
                {m.imageUrls.length > 1 && (
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{m.imageUrls.length}</Text>
                  </View>
                )}
              </Pressable>
            ) : null}
            {clickable ? (
              <Pressable
                onPress={() => onSelectMenu!(m.name)}
                accessibilityRole="button"
                accessibilityLabel={`"${m.name}" 메뉴가 언급된 리뷰 보기`}
                style={({ pressed }) => [styles.body, pressed && { opacity: 0.6 }]}
              >
                {body}
              </Pressable>
            ) : (
              <View style={styles.body}>{body}</View>
            )}
          </View>
        );
      })}
      {lightbox && (
        <Lightbox
          images={lightbox.images}
          index={lightbox.index}
          onChangeIndex={(i) => setLightbox((p) => (p ? { ...p, index: i } : p))}
          onClose={() => setLightbox(null)}
        />
      )}
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
  thumbWrap: { width: 56, height: 56 },
  thumb: { width: 56, height: 56, borderRadius: 6, backgroundColor: '#f4f4f5' },
  countBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  countBadgeText: { fontSize: 9, fontWeight: '600', color: '#fff', fontVariant: ['tabular-nums'] },
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
