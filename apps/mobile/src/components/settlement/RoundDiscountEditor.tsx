import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ReceiptItemCategoryType } from '@repo/api-contract';
import {
  useSettlementDraftStore,
  useTheme,
  type DraftRound,
  type Theme,
} from '@repo/shared';

const CATEGORIES: ReceiptItemCategoryType[] = [
  'ALCOHOL',
  'NON_ALCOHOL',
  'SIDE',
  'UNCATEGORIZED',
];

const CATEGORY_LABEL: Record<ReceiptItemCategoryType, string> = {
  ALCOHOL: '술',
  NON_ALCOHOL: '음료',
  SIDE: '안주',
  UNCATEGORIZED: '기타',
};

interface Props {
  round: DraftRound;
}

// 차수 할인 입력 — 카테고리 1개를 선택하고 그 풀에서 차감. 비활성 상태에선
// "+ 할인 추가" 버튼, 활성화되면 카테고리 칩 + 금액 input + 삭제. 웹 RoundDiscountEditor
// 의 RN 포팅.
export const RoundDiscountEditor = ({ round }: Props) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const setRoundDiscount = useSettlementDraftStore((s) => s.setRoundDiscount);

  const pools = useMemo(() => {
    const p: Record<ReceiptItemCategoryType, number> = {
      ALCOHOL: 0,
      NON_ALCOHOL: 0,
      SIDE: 0,
      UNCATEGORIZED: 0,
    };
    for (const it of round.items) {
      p[it.category] += it.amount;
    }
    return p;
  }, [round.items]);

  const active = round.discountAmount != null && round.discountCategory != null;

  if (!active) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          setRoundDiscount(round.clientId, { amount: 0, category: 'SIDE' })
        }
        style={({ pressed }) => [
          styles.addBtn,
          {
            borderColor: theme.colors.border,
            backgroundColor: pressed
              ? theme.colors.surfaceAlt
              : 'transparent',
          },
        ]}
      >
        <Text style={[styles.addBtnText, { color: theme.colors.text }]}>
          + 할인 추가
        </Text>
      </Pressable>
    );
  }

  const category = round.discountCategory!;
  const amount = round.discountAmount!;
  const pool = pools[category];
  const exceeded = amount > pool;

  return (
    <View style={{ gap: 6 }}>
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>
          할인
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="할인 삭제"
          onPress={() => setRoundDiscount(round.clientId, null)}
          style={({ pressed }) => [
            styles.deleteBtn,
            {
              backgroundColor: pressed
                ? theme.colors.surfaceAlt
                : 'transparent',
            },
          ]}
        >
          <Text style={{ color: theme.colors.danger, fontSize: 16 }}>🗑</Text>
        </Pressable>
      </View>
      <View style={styles.catRow}>
        {CATEGORIES.map((c) => {
          const sel = category === c;
          return (
            <Pressable
              key={c}
              accessibilityRole="button"
              accessibilityState={{ selected: sel }}
              onPress={() =>
                setRoundDiscount(round.clientId, { amount, category: c })
              }
              style={({ pressed }) => [
                styles.catChip,
                {
                  borderColor: sel ? theme.colors.primary : theme.colors.border,
                  backgroundColor: sel
                    ? theme.colors.primary
                    : pressed
                      ? theme.colors.surfaceAlt
                      : 'transparent',
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '500',
                  color: sel ? theme.colors.primaryText : theme.colors.text,
                }}
              >
                {CATEGORY_LABEL[c]} ({pools[c].toLocaleString('ko-KR')})
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.amountRow}>
        <TextInput
          value={amount === 0 ? '' : String(amount)}
          placeholder="0"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="numeric"
          onChangeText={(v) => {
            const n = v === '' ? 0 : Math.max(0, Number(v.replace(/[^0-9]/g, '')) || 0);
            setRoundDiscount(round.clientId, { amount: n, category });
          }}
          style={[
            styles.input,
            {
              borderColor: exceeded ? theme.colors.danger : theme.colors.border,
              color: theme.colors.text,
              backgroundColor: theme.colors.bg,
            },
          ]}
        />
        <Text style={[styles.unit, { color: theme.colors.textMuted }]}>원</Text>
      </View>
      {exceeded && (
        <Text style={[styles.errText, { color: theme.colors.danger }]}>
          {CATEGORY_LABEL[category]} 풀({pool.toLocaleString('ko-KR')}원)을 초과합니다.
        </Text>
      )}
      {amount === 0 && !exceeded && (
        <Text style={[styles.hintText, { color: theme.colors.textMuted }]}>
          금액을 입력하거나 삭제하세요.
        </Text>
      )}
    </View>
  );
};

const createStyles = (_theme: Theme) =>
  StyleSheet.create({
    addBtn: {
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
    },
    addBtnText: { fontSize: 12, fontWeight: '500' },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    label: { fontSize: 12, fontWeight: '500' },
    deleteBtn: {
      width: 32,
      height: 32,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    catChip: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
    },
    amountRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    input: {
      flex: 1,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 14,
    },
    unit: { fontSize: 12 },
    errText: { fontSize: 11 },
    hintText: { fontSize: 11 },
  });
