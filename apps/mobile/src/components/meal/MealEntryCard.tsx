import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { MealEntryType, MealSlotType } from '@repo/api-contract';
import { useTheme, type Theme } from '@repo/shared';
import { MEAL_SLOT_LABEL, MEAL_TYPE_LABEL, mealNutritionLabel, summarizeMealNutrition } from '@repo/utils';
import { MealPhotoThumb } from './MealPhotoThumb';
import { MealScalePressable, type MealIconName } from './mealUi';
import { mealFont, mealRadius } from './mealTokens';

// 기록 한 줄 — 왼쪽 사진(없으면 끼니 아이콘), 가운데 음식·곁들임·끼니 메타, 오른쪽 열량.
// variant 'card' 는 회색 바탕 위 흰 카드(목록·상세), 'row' 는 섹션 카드 안의 줄(달력 그날 기록)이다.

const THUMB = 56;

const SLOT_ICON: Record<MealSlotType, MealIconName> = {
  breakfast: 'weather-sunset-up',
  lunch: 'white-balance-sunny',
  dinner: 'weather-night',
  snack: 'cookie-outline',
  late_night: 'moon-waning-crescent',
};

const timeText = (iso: string): string => {
  const d = new Date(iso);
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
};

export const MealEntryCard = ({
  entry,
  onPress,
  variant = 'card',
}: {
  entry: MealEntryType;
  onPress?: () => void;
  variant?: 'card' | 'row';
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const mains = entry.items.filter((i) => i.isMain);
  const sides = entry.items.filter((i) => !i.isMain);
  // 주식이 없으면 곁들임을 제목으로 올린다(음료만 기록한 끼니 등).
  const titleItems = mains.length > 0 ? mains : sides;
  const subItems = mains.length > 0 ? sides : [];
  // 카탈로그에 영양이 없는 음식이 많아(외식 브랜드 메뉴 등) 값이 없거나 믿기 어려우면 열량 칸을 그리지 않는다.
  // 숨기는 기준은 mealNutritionLabel 과 같다(주식이 있는데 곁들임만 반영된 합계 등).
  const nutrition = summarizeMealNutrition(entry.items);
  const kcalLabel = mealNutritionLabel(nutrition);
  const kcal = kcalLabel !== null ? nutrition.kcal : null;
  const kcalNote =
    nutrition.counted < nutrition.total ? '일부 반영' : nutrition.hasEstimate ? '추정' : null;
  const meta = [
    timeText(entry.eatenAt),
    entry.mealType ? MEAL_TYPE_LABEL[entry.mealType] : null,
    entry.placeName,
  ].filter(Boolean);

  return (
    <MealScalePressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={[
        MEAL_SLOT_LABEL[entry.slot],
        ...meta,
        titleItems.map((i) => i.name).join(', '),
        kcalLabel,
      ]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        variant === 'card' ? styles.card : styles.row,
        { opacity: pressed && onPress ? 0.85 : 1 },
      ]}
    >
      {entry.photos.length > 0 ? (
        <View>
          <MealPhotoThumb token={entry.photos[0]!.token} size={THUMB} />
          {entry.photos.length > 1 ? (
            <View style={styles.photoCount}>
              <Text style={styles.photoCountText}>{entry.photos.length}</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={[styles.slotIcon, { backgroundColor: `${theme.colors.primary}1f` }]}>
          <MaterialCommunityIcons name={SLOT_ICON[entry.slot]} size={26} color={theme.colors.primary} />
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {titleItems.map((i) => i.name).join(', ') || '(음식 없음)'}
        </Text>
        {subItems.length > 0 ? (
          <Text style={styles.sub} numberOfLines={1}>
            + {subItems.map((i) => i.name).join(', ')}
          </Text>
        ) : null}
        <Text style={styles.meta} numberOfLines={1}>
          <Text style={styles.slot}>{MEAL_SLOT_LABEL[entry.slot]}</Text>
          {meta.length > 0 ? ` · ${meta.join(' · ')}` : ''}
        </Text>
        {entry.memo ? (
          <Text style={styles.memo} numberOfLines={1}>
            {entry.memo}
          </Text>
        ) : null}
      </View>

      {kcal !== null ? (
        <View style={styles.kcalCol}>
          <Text style={styles.kcal}>{Math.round(kcal).toLocaleString('ko-KR')}</Text>
          <Text style={styles.kcalUnit}>kcal</Text>
          {kcalNote ? <Text style={styles.kcalUnit}>{kcalNote}</Text> : null}
        </View>
      ) : null}
    </MealScalePressable>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.colors.surface,
      borderRadius: mealRadius.card,
      padding: 12,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    slotIcon: {
      width: THUMB,
      height: THUMB,
      borderRadius: mealRadius.control,
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoCount: {
      position: 'absolute',
      right: 4,
      bottom: 4,
      minWidth: 20,
      borderRadius: mealRadius.pill,
      paddingHorizontal: 5,
      paddingVertical: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
    },
    photoCountText: { color: '#fff', fontSize: mealFont.caption, fontWeight: '700' },
    body: { flex: 1, minWidth: 0, gap: 2 },
    title: { fontSize: mealFont.body, lineHeight: 20, fontWeight: '700', color: theme.colors.text },
    sub: { fontSize: mealFont.footnote, color: theme.colors.textMuted },
    meta: { fontSize: mealFont.caption, color: theme.colors.textMuted, marginTop: 1 },
    slot: { color: theme.colors.text, fontWeight: '600' },
    memo: { fontSize: mealFont.caption, color: theme.colors.textMuted },
    kcalCol: { alignItems: 'flex-end', minWidth: 52 },
    kcal: {
      fontSize: mealFont.headline,
      fontWeight: '700',
      color: theme.colors.text,
      fontVariant: ['tabular-nums'],
    },
    kcalUnit: { fontSize: mealFont.caption, color: theme.colors.textMuted },
  });
