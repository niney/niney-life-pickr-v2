import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@repo/shared';
import { formatWonPrice } from '@repo/utils';
import type {
  RestaurantInsightsType,
  RestaurantMenuKcalItemType,
  RestaurantPublicDetailType,
} from '@repo/api-contract';
import { Lightbox } from '~/components/Lightbox';
import { thumbUrl } from '~/lib/thumbUrl';
import { SENTIMENT_COLORS } from '../colors';

interface Props {
  menus: RestaurantPublicDetailType['menus'];
  insights: RestaurantInsightsType | undefined;
  // 메뉴명 → 칼로리 판정. 없는 이름은 칩을 그리지 않는다(애매한 메뉴는 서버가 이미 뺐다).
  kcalByName?: ReadonlyMap<string, RestaurantMenuKcalItemType>;
  // 주어지면 멘션 통계가 있는 메뉴를 탭 가능하게 렌더해 리뷰 필터로 연결.
  // 멘션 없는(stats 없는) 메뉴는 결과가 비므로 정적 카드로 둔다.
  onSelectMenu?: (name: string) => void;
}

const KCAL_BASIS_LABEL: Record<RestaurantMenuKcalItemType['basis'], string> = {
  per_serving: '1인분',
  per_100g: '100g당',
  per_100ml: '100ml당',
  components: '구성',
};
// 칩 색 — 웹(shared.tsx MenuKcalChip)과 같은 구분: 카탈로그=호박색, 웹 실측=하늘색, 세트 구성=보라색.
const KCAL_CHIP_COLORS = {
  catalog: { bg: 'rgba(245,158,11,0.12)', fg: '#b45309' },
  web: { bg: 'rgba(14,165,233,0.12)', fg: '#0369a1' },
  set: { bg: 'rgba(139,92,246,0.12)', fg: '#6d28d9' },
} as const;

// 메뉴 칼로리 칩 — "1인분 약 583kcal" / "100g당 약 233kcal" / 세트는 "구성 3개 칼로리"(구성 목록은 아래 줄).
const MenuKcalChip = ({ item }: { item: RestaurantMenuKcalItemType }) => {
  if (item.basis === 'components') {
    const parts = item.parts ?? [];
    const missing = (item.partsTotal ?? parts.length) - parts.length;
    const prefix = item.partsEstimated ? 'AI 추정 ' : '';
    const label =
      item.kcal !== null
        ? `${prefix}세트 약 ${item.kcal.toLocaleString('ko-KR')}kcal`
        : `${prefix}구성 ${parts.length}${missing > 0 ? `/${item.partsTotal}` : ''}개 칼로리`;
    return (
      <View style={styles.kcalWrap}>
        <View style={[styles.kcalChip, { backgroundColor: KCAL_CHIP_COLORS.set.bg }]}>
          <Text style={[styles.kcalText, { color: KCAL_CHIP_COLORS.set.fg }]}>{label}</Text>
        </View>
        <Text style={[styles.kcalParts, { color: KCAL_CHIP_COLORS.set.fg }]} numberOfLines={2}>
          {parts.map((p) => `${p.name} ${KCAL_BASIS_LABEL[p.basis]} ${p.kcal}kcal`).join(' · ')}
        </Text>
      </View>
    );
  }
  const colors = item.matchedBy === 'web' ? KCAL_CHIP_COLORS.web : KCAL_CHIP_COLORS.catalog;
  // 숫자 하나만: 메뉴명 중량이 있으면 그 양(가정 없음), 없으면 기준 중량 환산("1인분 약 1,095kcal (500g)", 테두리 칩).
  // 100g당 값은 웹의 툴팁 대신 길게 누르면 토스트 대신 접근성 라벨로만 둔다(앱은 호버가 없다).
  const stated = item.portion?.basis === 'stated' ? item.portion : undefined;
  const typical = item.portion?.basis === 'typical' ? item.portion : undefined;
  const fmt = (n: number): string => n.toLocaleString('ko-KR');
  const main = stated
    ? `${stated.grams}${stated.unit ?? 'g'} 약 ${fmt(stated.kcal)}kcal`
    : typical
      ? `1인분 약 ${fmt(typical.kcal)}kcal (${typical.grams}${typical.unit ?? 'g'})`
      : `${KCAL_BASIS_LABEL[item.basis]} 약 ${fmt(item.kcal ?? 0)}kcal`;
  const text = `${item.matchedBy === 'web' ? '웹 추정 ' : ''}${main}`;
  const detail = `100g당 약 ${fmt(item.kcal ?? 0)}kcal${typical ? ` · 1인분 기준 중량 ${typical.grams}${typical.unit ?? 'g'}` : ''}`;
  return (
    <View style={styles.kcalWrap}>
      <View
        style={[
          styles.kcalChip,
          typical ? { borderWidth: 1, borderColor: colors.fg, backgroundColor: 'transparent' } : { backgroundColor: colors.bg },
        ]}
        accessibilityLabel={`${text} · ${detail}`}
      >
        <Text style={[styles.kcalText, { color: colors.fg }]}>{text}</Text>
      </View>
    </View>
  );
};

// 메뉴 리스트 — 이름·가격·설명·이미지 + (있으면) insights 의 긍/부 멘션 통계.
export const MenuGrid = ({ menus, insights, kcalByName, onSelectMenu }: Props) => {
  const theme = useTheme();
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(
    null,
  );
  const mentionByName = new Map<string, { positive: number; negative: number; count: number }>();
  if (insights) {
    for (const m of insights.topMenus) mentionByName.set(m.name, m);
  }

  return (
    <View>
      {menus.map((m, idx) => {
        const stats = mentionByName.get(m.name);
        const kcal = kcalByName?.get(m.name);
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
            {kcal && <MenuKcalChip item={kcal} />}
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
              idx < menus.length - 1 && {
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
              },
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
                  source={thumbUrl(m.imageUrls[0], 112)}
                  style={[styles.thumb, { backgroundColor: theme.colors.surfaceAlt }]}
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
    paddingVertical: 12,
  },
  thumbWrap: { width: 56, height: 56 },
  thumb: { width: 56, height: 56, borderRadius: 6 },
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
  kcalWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 1 },
  kcalChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  kcalText: { fontSize: 10, fontWeight: '500', fontVariant: ['tabular-nums'] },
  kcalParts: { fontSize: 10, flexShrink: 1, fontVariant: ['tabular-nums'] },
  desc: { fontSize: 12 },
  statsRow: { flexDirection: 'row', gap: 4, marginTop: 2 },
  statText: { fontSize: 11, fontVariant: ['tabular-nums'] },
});
