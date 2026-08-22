import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  useFoodSearch,
  useTheme,
  type MealDraftItem,
  type Theme,
} from '@repo/shared';
import { FOOD_DISH_TYPE_LABEL, MEAL_PORTIONS, MEAL_PORTION_LABEL } from '@repo/utils';
import { Chip, ChipRow } from './mealUi';

// 식단 항목 한 줄 — 이름(자동완성) + 인식 후보 전환 + 주식/반찬 + 양 + 삭제.
// 정산 Step3Edit 의 편집 리스트와 같은 결: 인식 결과를 확정하지 않고 사용자가 고쳐서 저장한다.
//
// 자동완성은 이름 입력이 포커스 상태이고 2자 이상일 때만 뜬다(요청 절약). 카탈로그 항목을 고르면
// foodId·분류를 함께 채워 통계가 바로 분류를 얻는다. 자유 입력도 그대로 저장된다.

export const MealItemRow = ({
  item,
  onChange,
  onRemove,
}: {
  item: MealDraftItem;
  onChange: (patch: Partial<MealDraftItem>) => void;
  onRemove: () => void;
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [focused, setFocused] = useState(false);
  const search = useFoodSearch(item.name, { limit: 6, enabled: focused && item.name.trim().length >= 2 });
  const suggestions = focused ? (search.data?.items ?? []) : [];

  // 인식이 준 대안(후보) — 첫 후보가 현재 이름과 같으면 굳이 다시 보여주지 않는다.
  const altCandidates = item.candidates.filter((c) => c.name !== item.name).slice(0, 2);
  const lowConfidence = item.confidence !== null && item.confidence < 0.4;

  return (
    <View style={styles.row}>
      <View style={styles.nameRow}>
        <TextInput
          value={item.name}
          onChangeText={(name) => onChange({ name, foodId: null })}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="음식 이름"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.nameInput}
          accessibilityLabel="음식 이름"
        />
        <Pressable accessibilityRole="button" accessibilityLabel="항목 삭제" onPress={onRemove} style={styles.removeBtn}>
          <Text style={{ color: theme.colors.danger, fontSize: 16 }}>✕</Text>
        </Pressable>
      </View>

      {suggestions.length > 0 ? (
        <View style={styles.suggestBox}>
          {suggestions.map((s) => (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              onPress={() => {
                onChange({
                  name: s.name,
                  foodId: s.id,
                  dishType: s.dishType,
                  mainIngredient: s.mainIngredient,
                  cuisine: s.cuisine,
                  source: 'catalog',
                });
                setFocused(false);
              }}
              style={styles.suggestRow}
            >
              <Text style={styles.suggestName}>{s.name}</Text>
              {s.dishType ? <Text style={styles.suggestMeta}>{FOOD_DISH_TYPE_LABEL[s.dishType]}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {altCandidates.length > 0 ? (
        <View style={styles.altRow}>
          <Text style={styles.altLabel}>다른 후보</Text>
          {altCandidates.map((c) => (
            <Chip
              key={c.name}
              label={c.name}
              onPress={() => onChange({ name: c.name, foodId: null, source: 'recognized' })}
            />
          ))}
        </View>
      ) : null}

      <ChipRow style={styles.metaRow}>
        <Chip label={item.isMain ? '주식' : '반찬'} selected={item.isMain} onPress={() => onChange({ isMain: !item.isMain })} />
        {MEAL_PORTIONS.map((p) => (
          <Chip
            key={p}
            label={MEAL_PORTION_LABEL[p]}
            selected={item.portion === p}
            onPress={() => onChange({ portion: item.portion === p ? null : p })}
          />
        ))}
        {item.dishType ? <Text style={styles.badge}>{FOOD_DISH_TYPE_LABEL[item.dishType]}</Text> : null}
        {lowConfidence ? <Text style={styles.warn}>확인 필요</Text> : null}
      </ChipRow>
    </View>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: 10,
      padding: 10,
      gap: 8,
      backgroundColor: theme.colors.surface,
    },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    nameInput: {
      flex: 1,
      fontSize: 15,
      color: theme.colors.text,
      paddingVertical: 6,
    },
    removeBtn: { padding: 6 },
    suggestBox: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: 8,
      backgroundColor: theme.colors.surfaceAlt,
      overflow: 'hidden',
    },
    suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
    suggestName: { flex: 1, fontSize: 14, color: theme.colors.text },
    suggestMeta: { fontSize: 11, color: theme.colors.textMuted },
    altRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    altLabel: { fontSize: 11, color: theme.colors.textMuted, marginRight: 2 },
    metaRow: { alignItems: 'center' },
    badge: { fontSize: 11, color: theme.colors.textMuted },
    warn: { fontSize: 11, color: theme.colors.danger },
  });
