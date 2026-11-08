import { useMemo, type ReactNode } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  MEAL_MAX_ITEMS_PER_ENTRY,
  type FrequentMealItemType,
  type MealSlotType,
} from '@repo/api-contract';
import {
  mealCatalogSub,
  mealQuickFromCatalog,
  mealQuickFromTyped,
  mealQuickSub,
  useMealFoodSheet,
  useTheme,
  type MealFoodPickResult,
  type MealFoodSheetMode,
  type Theme,
} from '@repo/shared';
import { MEAL_SLOT_LABEL } from '@repo/utils';
import { hapticSelection } from '~/lib/haptics';
import { mealFont, mealRadius } from './mealTokens';

// 음식 찾기 시트(앱, 웹 휴대폰 시트와 같은 흐름) — 줄 안 자동완성은 키보드에 가리고 두 글자부터·음식 목록만이라
// 시트 하나로 옮겼다. 검색칸·완료는 위, 치기 전엔 이 끼니에 자주 먹은 음식·최근 끼니 통째로, 치는 중엔 '그대로
// 넣기' → 내 기록(한 글자부터) → 음식 목록(두 글자부터, 1인분 열량). 줄을 누르면 넣고 다시 누르면 뺀다.
// 줄 하나를 바꾸러 열면(replace) 고르는 즉시 그 줄을 바꾸고 닫는다. 넣고 빼는 규칙·조회는 @repo/shared useMealFoodSheet.
//
// 식당 고르기 시트처럼 RN Modal(formSheet) — 감춰지면 내용이 내려가 다음에 열 때 검색어·넣은 개수가 새로 시작한다.
// iOS 는 아래로 끌어 닫을 수 있다(add 는 넣은 대로, replace 는 바꾸지 않고).

export type { MealFoodSheetMode };

const fmt = (n: number): string => Math.round(n).toLocaleString('ko-KR');

export const MealFoodSheet = ({
  open,
  mode,
  slot,
  onClose,
}: {
  open: boolean;
  mode: MealFoodSheetMode;
  slot: MealSlotType;
  onClose: () => void;
}) => (
  <Modal
    visible={open}
    onRequestClose={onClose}
    animationType="slide"
    presentationStyle="formSheet"
    allowSwipeDismissal
  >
    <SheetBody mode={mode} slot={slot} onClose={onClose} />
  </Modal>
);

const SheetBody = ({
  mode,
  slot,
  onClose,
}: {
  mode: MealFoodSheetMode;
  slot: MealSlotType;
  onClose: () => void;
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const sheet = useMealFoodSheet(mode, slot);
  const { q, typed, searching } = sheet;

  const after = (result: MealFoodPickResult | null) => {
    if (result === 'replaced') {
      hapticSelection();
      onClose();
    } else if (result === 'added' || result === 'removed') {
      hapticSelection();
    }
  };
  const pick = (quick: FrequentMealItemType) => after(sheet.pick(quick));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={18} color={theme.colors.textMuted} />
          <TextInput
            autoFocus
            value={q}
            onChangeText={sheet.setQ}
            // 키보드 완료 키는 친 이름 그대로 넣기 — 키보드는 내리지 않고 다음 음식을 바로 친다(웹은 blurOnSubmit).
            onSubmitEditing={() => after(sheet.submitTyped())}
            submitBehavior="submit"
            blurOnSubmit={false}
            returnKeyType="done"
            maxLength={60}
            autoCorrect={false}
            autoCapitalize="none"
            placeholder="음식 이름 (예: 김치찌개)"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
            accessibilityLabel={mode.kind === 'replace' ? '음식 바꾸기' : '음식 찾기'}
          />
          {q ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="지우기"
              hitSlop={10}
              onPress={() => sheet.setQ('')}
            >
              <MaterialCommunityIcons
                name="close-circle"
                size={18}
                color={theme.colors.textMuted}
              />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          hitSlop={6}
          style={({ pressed }) => [styles.doneBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text
            style={[
              styles.doneText,
              { color: mode.kind === 'add' ? theme.colors.primary : theme.colors.text },
            ]}
          >
            {mode.kind === 'replace'
              ? '닫기'
              : sheet.added > 0
                ? `${sheet.added}개 · 완료`
                : '완료'}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // iOS — 키보드에 가린 만큼 스크롤 안쪽 여백을 늘려 목록 끝까지 올릴 수 있게(시트 안에서도 맞다).
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
        {mode.kind === 'add' && sheet.full ? (
          <Text style={styles.note}>
            한 끼에 음식은 {MEAL_MAX_ITEMS_PER_ENTRY}개까지 넣을 수 있어요.
          </Text>
        ) : null}
        {searching ? (
          <>
            {typed && !sheet.exactKnown ? (
              <Group styles={styles}>
                <Row
                  styles={styles}
                  theme={theme}
                  first
                  title={`'${typed}' 그대로 넣기`}
                  sub="목록에 없어도 이 이름으로 적어요"
                  on={sheet.isIn(typed)}
                  onPress={() => pick(mealQuickFromTyped(typed))}
                />
              </Group>
            ) : null}
            {sheet.mineItems.length > 0 ? (
              <Group styles={styles} title="내 기록">
                {sheet.mineItems.map((m, i) => (
                  <Row
                    key={`m-${m.name}`}
                    styles={styles}
                    theme={theme}
                    first={i === 0}
                    title={m.name}
                    sub={mealQuickSub(m)}
                    kcal={m.kcal ?? null}
                    on={sheet.isIn(m.name)}
                    onPress={() => pick(m)}
                  />
                ))}
              </Group>
            ) : null}
            {sheet.catalogEnabled ? (
              sheet.catalogCoveredByMine ? null : sheet.catalogItems.length === 0 ? (
                <Group styles={styles} title="음식 목록">
                  <Text style={styles.empty}>
                    {sheet.catalogFetching ? '찾는 중…' : '목록에서 찾지 못했어요.'}
                  </Text>
                </Group>
              ) : (
                <Group styles={styles} title="음식 목록">
                  {sheet.catalogItems.map((f, i) => (
                    <Row
                      key={f.id}
                      styles={styles}
                      theme={theme}
                      first={i === 0}
                      title={f.name}
                      sub={mealCatalogSub(f)}
                      kcal={f.servingKcal}
                      on={sheet.isIn(f.name)}
                      onPress={() => pick(mealQuickFromCatalog(f))}
                    />
                  ))}
                </Group>
              )
            ) : (
              <Text style={styles.note}>두 글자부터 음식 목록에서도 찾아요.</Text>
            )}
          </>
        ) : (
          <>
            {sheet.frequentItems.length > 0 ? (
              <Group styles={styles} title={`${MEAL_SLOT_LABEL[slot]}에 자주 먹은 음식`}>
                {sheet.frequentItems.map((m, i) => (
                  <Row
                    key={`f-${m.name}`}
                    styles={styles}
                    theme={theme}
                    first={i === 0}
                    title={m.name}
                    sub={mealQuickSub(m)}
                    kcal={m.kcal ?? null}
                    on={sheet.isIn(m.name)}
                    onPress={() => pick(m)}
                  />
                ))}
              </Group>
            ) : null}
            {/* 최근 끼니 통째로 — 같은 차림은 한 번만, 누르면 그 끼니 음식을 모두 넣는다(이미 있는 이름은 건너뛴다). */}
            {sheet.recentMeals.length > 0 ? (
              <Group styles={styles} title="최근 끼니 통째로">
                {sheet.recentMeals.map((meal, i) => (
                  <Row
                    key={meal.entry.id}
                    styles={styles}
                    theme={theme}
                    first={i === 0}
                    title={meal.title}
                    sub={meal.sub}
                    kcal={meal.kcal}
                    on={false}
                    action="넣기"
                    onPress={() => {
                      if (sheet.addMeal(meal.entry) > 0) hapticSelection();
                    }}
                  />
                ))}
              </Group>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

type Styles = ReturnType<typeof createStyles>;

const Group = ({
  styles,
  title,
  children,
}: {
  styles: Styles;
  title?: string;
  children: ReactNode;
}) => (
  <View style={styles.group}>
    {title ? <Text style={styles.groupTitle}>{title}</Text> : null}
    <View style={styles.groupCard}>{children}</View>
  </View>
);

const Row = ({
  styles,
  theme,
  title,
  sub,
  kcal,
  on,
  action,
  first = false,
  onPress,
}: {
  styles: Styles;
  theme: Theme;
  title: string;
  sub?: string;
  kcal?: number | null;
  on: boolean;
  action?: string;
  /** 묶음의 첫 줄 — 위 구분선을 긋지 않는다. */
  first?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={[title, sub, kcal != null ? `${fmt(kcal)}킬로칼로리` : null, action]
      .filter(Boolean)
      .join(', ')}
    accessibilityState={action ? undefined : { selected: on }}
    onPress={onPress}
    style={({ pressed }) => [
      styles.row,
      first ? styles.rowFirst : null,
      pressed ? { backgroundColor: theme.colors.surfaceAlt } : null,
    ]}
  >
    <View style={styles.rowBody}>
      <Text style={styles.rowTitle} numberOfLines={2}>
        {title}
      </Text>
      {sub ? (
        <Text style={styles.rowSub} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
    {kcal != null ? <Text style={styles.rowKcal}>{fmt(kcal)}kcal</Text> : null}
    {action ? (
      <View style={styles.actionMark}>
        <Text style={styles.actionText}>{action}</Text>
      </View>
    ) : (
      <View
        style={[
          styles.mark,
          on
            ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
            : { borderColor: theme.colors.border },
        ]}
      >
        <MaterialCommunityIcons
          name={on ? 'check' : 'plus'}
          size={16}
          color={on ? theme.colors.primaryText : theme.colors.primary}
        />
      </View>
    )}
  </Pressable>
);

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bgGrouped },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.bgGrouped,
    },
    searchBox: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      borderRadius: mealRadius.control,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 10,
      fontSize: mealFont.body,
      color: theme.colors.text,
    },
    doneBtn: { paddingVertical: 8, paddingLeft: 2 },
    doneText: { fontSize: mealFont.body, fontWeight: '700' },
    scroll: { flex: 1 },
    body: { padding: 16, paddingBottom: 32, gap: 18 },
    note: { fontSize: mealFont.footnote, lineHeight: 18, color: theme.colors.textMuted },
    group: { gap: 8 },
    groupTitle: {
      fontSize: mealFont.footnote,
      fontWeight: '700',
      color: theme.colors.textMuted,
      paddingHorizontal: 4,
    },
    groupCard: {
      borderRadius: mealRadius.card,
      backgroundColor: theme.colors.surface,
      overflow: 'hidden',
    },
    empty: {
      fontSize: mealFont.callout,
      color: theme.colors.textMuted,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 56,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    rowFirst: { borderTopWidth: 0 },
    rowBody: { flex: 1, minWidth: 0, gap: 2 },
    rowTitle: { fontSize: mealFont.body, fontWeight: '600', color: theme.colors.text },
    rowSub: { fontSize: mealFont.caption, color: theme.colors.textMuted },
    rowKcal: {
      fontSize: mealFont.footnote,
      color: theme.colors.textMuted,
      fontVariant: ['tabular-nums'],
    },
    mark: {
      width: 30,
      height: 30,
      borderRadius: mealRadius.pill,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionMark: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: mealRadius.pill,
      backgroundColor: theme.colors.surfaceAlt,
    },
    actionText: { fontSize: mealFont.footnote, fontWeight: '700', color: theme.colors.primary },
  });
