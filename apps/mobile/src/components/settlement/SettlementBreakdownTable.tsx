import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  calculateMultiRoundShares,
  effectiveExcludes,
  toGroupCalcInputs,
  type ReceiptItemCategoryType,
  type SharedSettlementSessionType,
} from '@repo/api-contract';
import { useTheme, type Theme } from '@repo/shared';

interface Props {
  session: SharedSettlementSessionType;
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

// 모바일 분배표 — 참여자 × (차수 × 사용 카테고리 + 차수 소계) + 총계.
// RN 에서 sticky column 은 라이브러리 없이 어려워 단순 horizontal scroll 로.
// 카드 안에서 가로 스크롤로 전체 매트릭스 노출.
export const SettlementBreakdownTable = ({ session }: Props) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const matrix = useMatrix(session);

  if (matrix.rounds.length === 0 || matrix.participants.length === 0) return null;

  return (
    <View style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>정산표</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          {/* 헤더 1행 — 차수 라벨 (colspan 흉내) */}
          <View style={styles.row}>
            <View style={[styles.nameCell, styles.headerCell, { borderColor: theme.colors.border }]}>
              <Text style={[styles.headerText, { color: theme.colors.textMuted }]}>
                참여자
              </Text>
            </View>
            {matrix.rounds.map((r, rIdx) => {
              const cols = r.categories.length + 1;
              return (
                <View
                  key={`hdr-${r.id}`}
                  style={[
                    styles.headerGroup,
                    {
                      width: cols * CELL_WIDTH,
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceAlt,
                    },
                  ]}
                >
                  <Text
                    style={[styles.headerText, { color: theme.colors.text }]}
                    numberOfLines={1}
                  >
                    {matrix.rounds.length > 1 ? `${rIdx + 1}차 · ` : ''}
                    {r.restaurantName}
                  </Text>
                </View>
              );
            })}
            <View
              style={[
                styles.totalCell,
                styles.headerCell,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.primary,
                },
              ]}
            >
              <Text
                style={[styles.headerText, { color: theme.colors.primaryText }]}
              >
                총계
              </Text>
            </View>
          </View>

          {/* 헤더 2행 — 차수 안의 카테고리 + 소계 */}
          <View style={styles.row}>
            <View style={[styles.nameCell, styles.headerCell, { borderColor: theme.colors.border }]} />
            {matrix.rounds.flatMap((r) => [
              ...r.categories.map((c) => (
                <View
                  key={`sub-${r.id}-${c}`}
                  style={[
                    styles.cell,
                    styles.headerCell,
                    { borderColor: theme.colors.border },
                  ]}
                >
                  <Text style={[styles.subHeaderText, { color: theme.colors.textMuted }]}>
                    {CATEGORY_LABEL[c]}
                  </Text>
                </View>
              )),
              <View
                key={`sub-${r.id}-sub`}
                style={[
                  styles.cell,
                  styles.headerCell,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceAlt,
                  },
                ]}
              >
                <Text
                  style={[styles.subHeaderText, { color: theme.colors.text, fontWeight: '600' }]}
                >
                  소계
                </Text>
              </View>,
            ])}
            <View
              style={[
                styles.totalCell,
                styles.headerCell,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.primary,
                },
              ]}
            />
          </View>

          {/* 참여자 행 */}
          {matrix.participants.map((p, pIdx) => (
            <View
              key={p.id}
              style={[
                styles.row,
                { borderTopColor: theme.colors.border, borderTopWidth: StyleSheet.hairlineWidth },
              ]}
            >
              <View style={[styles.nameCell, { borderColor: theme.colors.border }]}>
                <Text
                  style={[styles.nameText, { color: theme.colors.text }]}
                  numberOfLines={1}
                >
                  {participantLabel(p, pIdx)}
                </Text>
              </View>
              {matrix.rounds.flatMap((r) => {
                const attended = r.attendedMap[p.id] ?? false;
                return [
                  ...r.categories.map((c) => {
                    const v = r.cells[pIdx]?.[c] ?? 0;
                    return (
                      <View
                        key={`${p.id}-${r.id}-${c}`}
                        style={[styles.cell, { borderColor: theme.colors.border }]}
                      >
                        <Text
                          style={[
                            styles.cellValue,
                            {
                              color:
                                attended && v > 0
                                  ? theme.colors.text
                                  : theme.colors.textMuted,
                            },
                          ]}
                        >
                          {attended && v > 0 ? v.toLocaleString('ko-KR') : ''}
                        </Text>
                      </View>
                    );
                  }),
                  <View
                    key={`${p.id}-${r.id}-sub`}
                    style={[
                      styles.cell,
                      {
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surfaceAlt,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.cellValue,
                        {
                          fontWeight: '700',
                          color: attended
                            ? theme.colors.text
                            : theme.colors.textMuted,
                        },
                      ]}
                    >
                      {attended
                        ? (r.rowSubtotals[pIdx] ?? 0).toLocaleString('ko-KR')
                        : '—'}
                    </Text>
                  </View>,
                ];
              })}
              <View
                style={[
                  styles.totalCell,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.dangerBg,
                  },
                ]}
              >
                <Text
                  style={[styles.cellValue, { color: theme.colors.text, fontWeight: '700' }]}
                >
                  {p.shareAmount.toLocaleString('ko-KR')}
                </Text>
              </View>
            </View>
          ))}

          {/* 합계 행 */}
          <View
            style={[
              styles.row,
              {
                borderTopWidth: 2,
                borderTopColor: theme.colors.border,
                backgroundColor: theme.colors.bg,
              },
            ]}
          >
            <View style={[styles.nameCell, { borderColor: theme.colors.border }]}>
              <Text style={[styles.nameText, { color: theme.colors.text, fontWeight: '700' }]}>
                계
              </Text>
            </View>
            {matrix.rounds.flatMap((r) => [
              ...r.categories.map((c) => (
                <View
                  key={`foot-${r.id}-${c}`}
                  style={[styles.cell, { borderColor: theme.colors.border }]}
                >
                  <Text style={[styles.cellValue, { color: theme.colors.text }]}>
                    {(r.columnTotals[c] ?? 0).toLocaleString('ko-KR')}
                  </Text>
                </View>
              )),
              <View
                key={`foot-${r.id}-sub`}
                style={[
                  styles.cell,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceAlt,
                  },
                ]}
              >
                <Text style={[styles.cellValue, { color: theme.colors.text, fontWeight: '700' }]}>
                  {r.grandSubtotal.toLocaleString('ko-KR')}
                </Text>
              </View>,
            ])}
            <View
              style={[
                styles.totalCell,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.primary,
                },
              ]}
            >
              <Text
                style={[styles.cellValue, { color: theme.colors.primaryText, fontWeight: '700' }]}
              >
                {matrix.grandTotal.toLocaleString('ko-KR')}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const NAME_COL_WIDTH = 96;
const CELL_WIDTH = 72;
const TOTAL_COL_WIDTH = 88;

const participantLabel = (
  p: { name: string | null; nickname: string | null },
  idx: number,
): string => {
  const nm = (p.name ?? '').trim();
  const nick = (p.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || `참여자 ${idx + 1}`;
};

interface RoundMatrix {
  id: string;
  orderIndex: number;
  restaurantName: string;
  categories: ReceiptItemCategoryType[];
  cells: Array<Partial<Record<ReceiptItemCategoryType, number>>>;
  rowSubtotals: number[];
  columnTotals: Partial<Record<ReceiptItemCategoryType, number>>;
  grandSubtotal: number;
  attendedMap: Record<string, boolean>;
}

interface SettlementMatrix {
  participants: SharedSettlementSessionType['participants'];
  rounds: RoundMatrix[];
  grandTotal: number;
}

const useMatrix = (session: SharedSettlementSessionType): SettlementMatrix =>
  useMemo(() => {
    const pIdxById = new Map(session.participants.map((p, i) => [p.id, i]));
    const calc = calculateMultiRoundShares({
      participantCount: session.participants.length,
      rounds: session.rounds.map((r) => ({
        items: r.items.map((it) => ({
          amount: it.amount,
          category: it.category,
        })),
        attendees: r.attendees
          .filter((a) => a.attended)
          .map((a) => {
            const idx = pIdxById.get(a.participantId) ?? 0;
            const master = session.participants[idx]!;
            const eff = effectiveExcludes(master, a);
            return { participantIndex: idx, ...eff };
          }),
        discount:
          r.discountAmount != null && r.discountCategory != null
            ? { amount: r.discountAmount, category: r.discountCategory }
            : null,
        categoryAdjustments: r.categoryAdjustments
          ? Object.fromEntries(
              Object.entries(r.categoryAdjustments)
                .filter(([, v]) => v != null)
                .map(([cat, v]) => [
                  cat,
                  {
                    leftoverParticipantIndex:
                      pIdxById.get(v!.leftoverParticipantId) ?? 0,
                    roundUnit: v!.roundUnit,
                  },
                ]),
            )
          : null,
        // 세부 분배 그룹 — 빠뜨리면 셀이 저장된 분담(총계 컬럼)과 어긋난다.
        groups: toGroupCalcInputs(r.groupSplits, pIdxById),
      })),
    });

    const rounds: RoundMatrix[] = session.rounds.map((r, rIdx) => {
      const rc = calc.perRound[rIdx]!;
      const categories = CATEGORY_ORDER.filter(
        (c) => (rc.poolBreakdown[c]?.poolAmount ?? 0) > 0,
      );
      const cells = session.participants.map((_, pIdx) => {
        const row: Partial<Record<ReceiptItemCategoryType, number>> = {};
        for (const c of categories) {
          row[c] = rc.perCategoryShares[c]?.[pIdx] ?? 0;
        }
        return row;
      });
      const rowSubtotals = session.participants.map(
        (_, pIdx) => rc.shareAmounts[pIdx] ?? 0,
      );
      const columnTotals: Partial<Record<ReceiptItemCategoryType, number>> = {};
      for (const c of categories) {
        columnTotals[c] = rc.poolBreakdown[c]?.poolAmount ?? 0;
      }
      const attendedMap: Record<string, boolean> = {};
      for (const a of r.attendees) attendedMap[a.participantId] = a.attended;
      return {
        id: r.id,
        orderIndex: r.orderIndex,
        restaurantName: r.restaurantName,
        categories,
        cells,
        rowSubtotals,
        columnTotals,
        grandSubtotal: rc.itemsSubtotal,
        attendedMap,
      };
    });

    return {
      participants: session.participants,
      rounds,
      grandTotal: calc.grandTotal,
    };
  }, [session]);

const createStyles = (_theme: Theme) =>
  StyleSheet.create({
    card: {
      padding: 12,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 8,
    },
    title: { fontSize: 14, fontWeight: '600' },
    row: { flexDirection: 'row' },
    headerCell: { paddingVertical: 6 },
    headerGroup: {
      paddingHorizontal: 6,
      paddingVertical: 6,
      alignItems: 'center',
      justifyContent: 'center',
      borderLeftWidth: StyleSheet.hairlineWidth,
    },
    headerText: { fontSize: 11, fontWeight: '600' },
    subHeaderText: { fontSize: 10, fontWeight: '500' },
    nameCell: {
      width: NAME_COL_WIDTH,
      paddingHorizontal: 6,
      paddingVertical: 6,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    nameText: { fontSize: 12, fontWeight: '500' },
    cell: {
      width: CELL_WIDTH,
      paddingHorizontal: 4,
      paddingVertical: 6,
      alignItems: 'flex-end',
      justifyContent: 'center',
      borderLeftWidth: StyleSheet.hairlineWidth,
    },
    totalCell: {
      width: TOTAL_COL_WIDTH,
      paddingHorizontal: 6,
      paddingVertical: 6,
      alignItems: 'flex-end',
      justifyContent: 'center',
      borderLeftWidth: StyleSheet.hairlineWidth,
    },
    cellValue: { fontSize: 11, fontVariant: ['tabular-nums'] },
  });
