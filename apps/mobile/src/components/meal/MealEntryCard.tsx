import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MealEntryType } from '@repo/api-contract';
import { useTheme, type Theme } from '@repo/shared';
import { MEAL_SLOT_LABEL, MEAL_TYPE_LABEL, mealNutritionLabel, summarizeMealNutrition } from '@repo/utils';
import { MealPhotoThumb } from './MealPhotoThumb';

// 기록 한 줄 — 끼니 배지·시각·음식 칩·사진 썸네일. 목록(FlatList)과 상세 상단에서 함께 쓴다.

const timeText = (iso: string): string => {
  const d = new Date(iso);
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
};

export const MealEntryCard = ({ entry, onPress }: { entry: MealEntryType; onPress?: () => void }) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const mains = entry.items.filter((i) => i.isMain);
  const sides = entry.items.filter((i) => !i.isMain);
  // 카탈로그에 영양이 없는 음식이 많아(외식 브랜드 메뉴 등) 값이 하나도 없으면 줄을 그리지 않는다.
  const kcalText = mealNutritionLabel(summarizeMealNutrition(entry.items));

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.card, { opacity: pressed && onPress ? 0.8 : 1 }]}
    >
      <View style={styles.headRow}>
        <View style={[styles.slotBadge, { backgroundColor: theme.colors.surfaceAlt }]}>
          <Text style={styles.slotText}>{MEAL_SLOT_LABEL[entry.slot]}</Text>
        </View>
        <Text style={styles.time}>{timeText(entry.eatenAt)}</Text>
        {entry.mealType ? <Text style={styles.meta}>{MEAL_TYPE_LABEL[entry.mealType]}</Text> : null}
        {entry.placeName ? (
          <Text style={styles.meta} numberOfLines={1}>
            · {entry.placeName}
          </Text>
        ) : null}
      </View>

      <Text style={styles.mains} numberOfLines={2}>
        {mains.map((i) => i.name).join(', ') || '(음식 없음)'}
      </Text>
      {sides.length > 0 ? (
        <Text style={styles.sides} numberOfLines={1}>
          곁들임 {sides.map((i) => i.name).join(', ')}
        </Text>
      ) : null}
      {kcalText ? <Text style={styles.kcal}>{kcalText}</Text> : null}
      {entry.memo ? (
        <Text style={styles.memo} numberOfLines={1}>
          {entry.memo}
        </Text>
      ) : null}

      {entry.photos.length > 0 ? (
        <View style={styles.photos}>
          {entry.photos.slice(0, 3).map((p) => (
            <MealPhotoThumb key={p.token} token={p.token} size={56} />
          ))}
          {entry.photos.length > 3 ? <Text style={styles.more}>+{entry.photos.length - 3}</Text> : null}
        </View>
      ) : null}
    </Pressable>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 12,
      gap: 6,
    },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    slotBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
    slotText: { fontSize: 11, color: theme.colors.text, fontWeight: '600' },
    kcal: { marginTop: 4, fontSize: 12, color: theme.colors.textMuted },
    time: { fontSize: 12, color: theme.colors.textMuted },
    meta: { fontSize: 12, color: theme.colors.textMuted, flexShrink: 1 },
    mains: { fontSize: 15, color: theme.colors.text, fontWeight: '600' },
    sides: { fontSize: 12, color: theme.colors.textMuted },
    memo: { fontSize: 12, color: theme.colors.textMuted, fontStyle: 'italic' },
    photos: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    more: { fontSize: 12, color: theme.colors.textMuted },
  });
