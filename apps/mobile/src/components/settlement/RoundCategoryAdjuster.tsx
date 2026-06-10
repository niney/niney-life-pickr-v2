import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  calculateMultiRoundShares,
  effectiveExcludes,
  type ReceiptItemCategoryType,
} from '@repo/api-contract';
import {
  draftGroupsToCalcInputs,
  useSettlementDraftStore,
  useTheme,
  type DraftParticipant,
  type DraftRound,
  type Theme,
} from '@repo/shared';

interface Props {
  round: DraftRound;
  participants: DraftParticipant[];
}

const CATEGORY_LABEL: Record<ReceiptItemCategoryType, string> = {
  ALCOHOL: '술',
  NON_ALCOHOL: '음료',
  SIDE: '안주',
  UNCATEGORIZED: '기타',
};

const CATEGORY_ORDER: ReceiptItemCategoryType[] = [
  'SIDE',
  'ALCOHOL',
  'NON_ALCOHOL',
  'UNCATEGORIZED',
];

const ROUND_UNITS = [100, 1000] as const;

const participantLabel = (p: DraftParticipant, idx: number): string => {
  const nm = (p.name ?? '').trim();
  const nick = (p.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || `참여자 ${idx + 1}`;
};

// 분담 다듬기 — 잔여가 있는 카테고리만 행 노출. "받을 사람" 칩 + 반올림 단위
// 버튼. RN 포팅이라 select 대신 horizontal scroll 칩.
export const RoundCategoryAdjuster = ({ round, participants }: Props) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const setCategoryAdjustment = useSettlementDraftStore(
    (s) => s.setCategoryAdjustment,
  );

  const info = useMemo(() => {
    const calc = calculateMultiRoundShares({
      participantCount: participants.length,
      rounds: [
        {
          items: round.items.map((it) => ({
            amount: it.amount,
            category: it.category,
          })),
          attendees: round.attendances
            .filter((a) => a.attended)
            .map((a) => {
              const master = participants.find(
                (p) => p.clientId === a.participantClientId,
              )!;
              const eff = effectiveExcludes(master, a);
              return {
                participantIndex: participants.findIndex(
                  (p) => p.clientId === a.participantClientId,
                ),
                ...eff,
              };
            }),
          discount:
            round.discountAmount != null &&
            round.discountCategory != null &&
            round.discountAmount > 0
              ? { amount: round.discountAmount, category: round.discountCategory }
              : null,
          // raw 잔여 확인용이라 보정 없이 호출.
          categoryAdjustments: null,
          // 세부 분배 그룹 반영 — 다듬기 대상은 그룹을 뺀 '나머지(균등) 풀'.
          groups: draftGroupsToCalcInputs(round, participants),
        },
      ],
    });
    return calc.perRound[0]!;
  }, [round, participants]);

  const rows = useMemo(() => {
    return CATEGORY_ORDER.flatMap((cat) => {
      const b = info.poolBreakdown[cat];
      if (!b || b.equalPoolAmount === 0 || b.participantCount === 0) return [];
      const remainder = b.equalPoolAmount - b.perParticipant * b.participantCount;
      const adj = round.categoryAdjustments?.[cat] ?? null;
      if (remainder === 0 && !adj) return [];
      return [
        {
          category: cat,
          pool: b.equalPoolAmount,
          n: b.participantCount,
          remainder,
          perBase: b.perParticipant,
          adj,
        },
      ];
    });
  }, [info, round.categoryAdjustments]);

  if (rows.length === 0) return null;

  const activeFor = (cat: ReceiptItemCategoryType): DraftParticipant[] =>
    participants.filter((p) => {
      const att = round.attendances.find(
        (a) => a.participantClientId === p.clientId,
      );
      if (!att || !att.attended) return false;
      if (cat === 'UNCATEGORIZED') return true;
      const eff = effectiveExcludes(p, att);
      if (cat === 'ALCOHOL') return !eff.excludeAlcohol;
      if (cat === 'NON_ALCOHOL') return !eff.excludeNonAlcohol;
      if (cat === 'SIDE') return !eff.excludeSide;
      return true;
    });

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surfaceAlt,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Text style={[styles.title, { color: theme.colors.textMuted }]}>
        분담 다듬기
      </Text>
      {rows.map((row) => {
        const candidates = activeFor(row.category);
        const currentLeftover =
          row.adj?.leftoverParticipantClientId ?? candidates[0]?.clientId ?? '';
        const currentUnit = row.adj?.roundUnit ?? null;

        const setLeftover = (clientId: string) => {
          setCategoryAdjustment(round.clientId, row.category, {
            leftoverParticipantClientId: clientId,
            roundUnit: currentUnit,
          });
        };
        const toggleUnit = (unit: number | null) => {
          if (currentUnit === unit && row.adj) {
            if (unit === null) {
              setCategoryAdjustment(round.clientId, row.category, null);
              return;
            }
            setCategoryAdjustment(round.clientId, row.category, {
              leftoverParticipantClientId: currentLeftover,
              roundUnit: null,
            });
            return;
          }
          setCategoryAdjustment(round.clientId, row.category, {
            leftoverParticipantClientId: currentLeftover,
            roundUnit: unit,
          });
        };

        return (
          <View key={row.category} style={styles.rowBlock}>
            <View style={styles.rowHeader}>
              <Text style={[styles.rowCategory, { color: theme.colors.text }]}>
                {CATEGORY_LABEL[row.category]}
              </Text>
              <Text style={[styles.rowMeta, { color: theme.colors.textMuted }]}>
                풀 {row.pool.toLocaleString('ko-KR')}원 / {row.n}명 · 인당{' '}
                {row.perBase.toLocaleString('ko-KR')}원 + 잔여{' '}
                {row.remainder.toLocaleString('ko-KR')}원
              </Text>
            </View>

            <Text style={[styles.subLabel, { color: theme.colors.textMuted }]}>
              잔여 받기
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6 }}
            >
              {candidates.map((p, i) => {
                const sel = currentLeftover === p.clientId;
                return (
                  <Pressable
                    key={p.clientId}
                    accessibilityRole="button"
                    onPress={() => setLeftover(p.clientId)}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        borderColor: sel
                          ? theme.colors.primary
                          : theme.colors.border,
                        backgroundColor: sel
                          ? theme.colors.primary
                          : pressed
                            ? theme.colors.surface
                            : 'transparent',
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        color: sel
                          ? theme.colors.primaryText
                          : theme.colors.text,
                      }}
                    >
                      {participantLabel(p, i)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.unitRow}>
              {ROUND_UNITS.map((unit) => {
                const rounded = Math.round(row.pool / unit) * unit;
                const fits = rounded % row.n === 0;
                const newPer = rounded / row.n;
                const diffSum =
                  Math.abs(row.perBase - newPer) * row.n + row.remainder;
                const recommended = fits && diffSum <= unit;
                const selected = currentUnit === unit && !!row.adj;
                return (
                  <Pressable
                    key={unit}
                    accessibilityRole="button"
                    disabled={!fits}
                    onPress={() => toggleUnit(unit)}
                    style={({ pressed }) => [
                      styles.unitBtn,
                      {
                        borderColor: selected
                          ? theme.colors.primary
                          : theme.colors.border,
                        backgroundColor: selected
                          ? theme.colors.primary
                          : pressed && fits
                            ? theme.colors.surface
                            : 'transparent',
                        opacity: fits ? 1 : 0.5,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '500',
                        color: selected
                          ? theme.colors.primaryText
                          : theme.colors.text,
                      }}
                    >
                      {unit.toLocaleString('ko-KR')}원 반올림
                      {recommended && !selected ? ' · 추천' : ''}
                    </Text>
                  </Pressable>
                );
              })}
              {row.adj && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    setCategoryAdjustment(round.clientId, row.category, null)
                  }
                  style={({ pressed }) => [
                    styles.unitBtn,
                    {
                      borderColor: 'transparent',
                      backgroundColor: pressed
                        ? theme.colors.surface
                        : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={{ fontSize: 11, color: theme.colors.textMuted }}
                  >
                    되돌리기
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
};

const createStyles = (_theme: Theme) =>
  StyleSheet.create({
    container: {
      padding: 10,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 8,
    },
    title: { fontSize: 12, fontWeight: '500' },
    rowBlock: { gap: 4 },
    rowHeader: { flexDirection: 'column', gap: 2 },
    rowCategory: { fontSize: 12, fontWeight: '600' },
    rowMeta: { fontSize: 11 },
    subLabel: { fontSize: 10, marginTop: 4 },
    chip: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
    },
    unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    unitBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
    },
  });
