import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  useCopyMealPhoto,
  useMealDraftStore,
  useRecentMealItem,
  useTheme,
  type MealDraftItem,
  type Theme,
} from '@repo/shared';
import { MEAL_MAX_PHOTOS_PER_ENTRY } from '@repo/api-contract';
import {
  FOOD_DISH_TYPE_LABEL,
  MEAL_PORTIONS,
  MEAL_PORTION_LABEL,
  mealDateTitle,
  toLocalDateKey,
} from '@repo/utils';
import { MealPhotoThumb } from './MealPhotoThumb';
import { Chip, ChipRow } from './mealUi';
import { mealFont, mealRadius } from './mealTokens';

// 식단 항목 한 줄 — 이름(누르면 음식 찾기 시트) + 인식 후보 전환 + 주식/반찬 + 양 + 삭제.
// 정산 Step3Edit 의 편집 리스트와 같은 결: 인식 결과를 확정하지 않고 사용자가 고쳐서 저장한다.
//
// 이름은 줄 안 입력칸이 아니라 시트에서 고친다(2026-11-08, 웹 휴대폰과 같이) — 줄 안 자동완성은 키보드에 가리고 두
// 글자부터·음식 목록만이었다. 양 칩은 키우고 인분 직접 입력칸은 뺐다(값이 있으면 표시만, 양 칩을 누르면 지운다).

export const MealItemRow = ({
  item,
  onChange,
  onRemove,
  onOpenSearch,
}: {
  item: MealDraftItem;
  onChange: (patch: Partial<MealDraftItem>) => void;
  onRemove: () => void;
  /** 이름 단추 — 음식 찾기 시트를 연다(이름 있는 줄은 그 줄 바꾸기). */
  onOpenSearch: () => void;
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const name = item.name.trim();

  // "지난번엔 어떻게 먹었나" — 이름이 정해진 줄만(시트에서 고른 뒤).
  const recent = useRecentMealItem(name.length >= 2 ? name : null);
  const past = recent.data?.found ? recent.data : null;

  // 사진은 자동으로 붙이지 않는다 — 오늘 먹은 게 지난번과 같게 생겼을 리 없다. 사용자가 누를 때만.
  const draft = useMealDraftStore();
  const copyPhoto = useCopyMealPhoto();
  // 적용 표시는 그 이름에만 — 시트에서 다른 음식으로 바꾸면 새 이름의 '지난번'을 다시 고를 수 있다.
  const [appliedFor, setAppliedFor] = useState<string | null>(null);
  const applied = appliedFor === name;
  const photoFull = draft.photos.length >= MEAL_MAX_PHOTOS_PER_ENTRY;

  const applyPast = (): void => {
    if (!past || applied) return;
    if (past.servings && !item.servings) {
      onChange({ servings: past.servings, portion: null, portionSource: 'user_serving' });
    } else if (past.portion && !item.portion) {
      onChange({ portion: past.portion, portionSource: past.portionSource ?? 'vision_ordinal' });
    }
    if (past.photoToken && !photoFull) {
      copyPhoto.mutate(past.photoToken, {
        onSuccess: (photo) => draft.addPhoto({ token: photo.token, localUri: null }),
      });
    }
    setAppliedFor(name);
  };

  // 인식이 준 대안(후보) — 첫 후보가 현재 이름과 같으면 굳이 다시 보여주지 않는다.
  const altCandidates = item.candidates.filter((c) => c.name !== item.name).slice(0, 2);
  const lowConfidence = item.confidence !== null && item.confidence < 0.4;

  return (
    <View style={styles.row}>
      <View style={styles.nameRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={name ? `${item.name} 바꾸기` : '음식 찾기'}
          onPress={onOpenSearch}
          style={({ pressed }) => [styles.nameBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          {name ? (
            <Text style={styles.nameText} numberOfLines={2}>
              {item.name}
            </Text>
          ) : (
            <View style={styles.nameEmpty}>
              <MaterialCommunityIcons name="magnify" size={18} color={theme.colors.textMuted} />
              <Text style={styles.nameEmptyText}>음식 찾기</Text>
            </View>
          )}
          <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${name || '빈'} 항목 삭제`}
          onPress={onRemove}
          hitSlop={6}
          style={styles.removeBtn}
        >
          <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      {past ? (
        <View style={styles.pastRow}>
          {past.photoToken ? <MealPhotoThumb token={past.photoToken} size={36} /> : null}
          <Text style={styles.pastText} numberOfLines={1}>
            지난번 {past.lastEatenDate ? mealDateTitle(past.lastEatenDate, toLocalDateKey(new Date()), { weekday: false }) : ''}
            {past.portion ? ` · ${MEAL_PORTION_LABEL[past.portion]}` : ''}
            {past.servings ? ` · ${past.servings}인분` : ''}
          </Text>
          {applied ? (
            <Text style={styles.pastDone}>{copyPhoto.isPending ? '가져오는 중…' : '적용됨'}</Text>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="지난번대로 채우기"
              onPress={applyPast}
              disabled={copyPhoto.isPending}
              style={styles.pastBtn}
            >
              <Text style={styles.pastBtnText}>지난번대로</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {altCandidates.length > 0 ? (
        <View style={styles.altRow}>
          <Text style={styles.altLabel}>다른 후보</Text>
          {altCandidates.map((c) => (
            <Chip
              key={c.name}
              label={c.name}
              onPress={() =>
                onChange({
                  name: c.name,
                  foodId: null,
                  source: 'recognized',
                  selectedCandidateRank: item.candidates.findIndex((candidate) => candidate.name === c.name),
                  catalogMatchedBy: 'none',
                  catalogMatchScore: null,
                })
              }
            />
          ))}
        </View>
      ) : null}

      <ChipRow style={styles.metaRow}>
        <Chip label="주식" large selected={item.isMain} onPress={() => onChange({ isMain: true })} />
        <Chip label="반찬·곁들임" large selected={!item.isMain} onPress={() => onChange({ isMain: false })} />
        {item.dishType ? <Text style={styles.badge}>{FOOD_DISH_TYPE_LABEL[item.dishType]}</Text> : null}
        {lowConfidence ? <Text style={styles.warn}>확인 필요</Text> : null}
      </ChipRow>
      <ChipRow style={styles.metaRow}>
        {MEAL_PORTIONS.map((p) => (
          <Chip
            key={p}
            label={MEAL_PORTION_LABEL[p]}
            large
            selected={item.portion === p}
            onPress={() =>
              onChange({
                portion: item.portion === p ? null : p,
                servings: null,
                portionSource: item.portion === p ? null : 'vision_ordinal',
              })
            }
          />
        ))}
        {item.servings != null ? <Text style={styles.badge}>{item.servings}인분</Text> : null}
      </ChipRow>
    </View>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: mealRadius.control,
      padding: 10,
      gap: 8,
      backgroundColor: theme.colors.surface,
    },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    nameBtn: {
      flex: 1,
      minWidth: 0,
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: mealRadius.small,
      backgroundColor: theme.colors.surfaceAlt,
    },
    nameText: { flex: 1, fontSize: mealFont.body, fontWeight: '600', color: theme.colors.text },
    nameEmpty: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
    nameEmptyText: { fontSize: mealFont.body, color: theme.colors.textMuted },
    removeBtn: { padding: 6 },
    pastRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 4,
      paddingHorizontal: 6,
      borderRadius: mealRadius.small,
      backgroundColor: theme.colors.surfaceAlt,
    },
    pastText: { flex: 1, fontSize: mealFont.caption, color: theme.colors.textMuted },
    pastBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: mealRadius.small, backgroundColor: theme.colors.surface },
    pastBtnText: { fontSize: mealFont.caption, color: theme.colors.text, fontWeight: '600' },
    pastDone: { fontSize: mealFont.caption, color: theme.colors.textMuted },
    altRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    altLabel: { fontSize: mealFont.caption, color: theme.colors.textMuted, marginRight: 2 },
    metaRow: { alignItems: 'center' },
    badge: { fontSize: mealFont.caption, color: theme.colors.textMuted },
    warn: { fontSize: mealFont.caption, color: theme.colors.danger },
  });
