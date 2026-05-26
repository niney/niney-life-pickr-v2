import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  calculateMultiRoundShares,
  effectiveExcludes,
} from '@repo/api-contract';
import {
  ApiError,
  useCreateSettlement,
  useSettlementDraftStore,
  useTheme,
  useUpdateSettlement,
  type Theme,
} from '@repo/shared';

interface Props {
  onBack: () => void;
  editingId: string | null;
  fromDraftId: string | null;
}

const participantName = (
  p: { name: string | null; nickname: string | null },
  idx: number,
) => {
  const nm = (p.name ?? '').trim();
  const nick = (p.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || `참여자 ${idx + 1}`;
};

// Step4 — 분배 결과 확인 + 저장. 차수 예외 칩(#76), 잔여 분배(#76), 할인(#75),
// "1차와 동일" 복사(#76) 는 후속.
export const Step4Review = ({ onBack, editingId, fromDraftId }: Props) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();

  const draft = useSettlementDraftStore();
  const setAttendance = useSettlementDraftStore((s) => s.setAttendance);
  const reset = useSettlementDraftStore((s) => s.reset);
  const create = useCreateSettlement();
  const update = useUpdateSettlement();
  const [error, setError] = useState<string | null>(null);

  // 차수별 effective 계산. 분담 미리보기.
  const calc = useMemo(
    () =>
      calculateMultiRoundShares({
        participantCount: draft.participants.length,
        rounds: draft.rounds.map((r) => ({
          items: r.items.map((it) => ({
            amount: it.amount,
            category: it.category,
          })),
          attendees: r.attendances
            .filter((a) => a.attended)
            .map((a) => {
              const master = draft.participants.find(
                (p) => p.clientId === a.participantClientId,
              )!;
              const eff = effectiveExcludes(master, a);
              return {
                participantIndex: draft.participants.findIndex(
                  (p) => p.clientId === a.participantClientId,
                ),
                ...eff,
              };
            }),
          discount:
            r.discountAmount != null &&
            r.discountCategory != null &&
            r.discountAmount > 0
              ? { amount: r.discountAmount, category: r.discountCategory }
              : null,
          categoryAdjustments: r.categoryAdjustments
            ? Object.fromEntries(
                Object.entries(r.categoryAdjustments)
                  .filter(([, v]) => v != null)
                  .map(([cat, v]) => [
                    cat,
                    {
                      leftoverParticipantIndex: draft.participants.findIndex(
                        (p) => p.clientId === v!.leftoverParticipantClientId,
                      ),
                      roundUnit: v!.roundUnit,
                    },
                  ]),
              )
            : null,
        })),
      }),
    [draft.participants, draft.rounds],
  );

  const multi = draft.rounds.length > 1;
  const pending = create.isPending || update.isPending;

  const handleSave = async () => {
    setError(null);
    for (let idx = 0; idx < draft.rounds.length; idx += 1) {
      const r = draft.rounds[idx]!;
      const label = `${idx + 1}차${r.placeName ? ` (${r.placeName})` : ''}`;
      if (!r.source) {
        setError('입력 방식이 결정되지 않은 차수가 있습니다.');
        return;
      }
      if (!r.attendances.some((a) => a.attended)) {
        setError(`${label} 에 참석자가 한 명도 없습니다.`);
        return;
      }
      if (r.discountAmount != null && r.discountCategory != null) {
        if (r.discountAmount <= 0) {
          setError(`${label} 의 할인 금액을 입력하거나 삭제하세요.`);
          return;
        }
        const pool = r.items
          .filter((it) => it.category === r.discountCategory)
          .reduce((s, it) => s + it.amount, 0);
        if (r.discountAmount > pool) {
          setError(
            `${label} 의 할인이 해당 카테고리 풀(${pool.toLocaleString('ko-KR')}원)을 초과합니다.`,
          );
          return;
        }
      }
    }
    try {
      const payload = {
        rounds: draft.rounds.map((r) => ({
          restaurantPlaceId: r.placeId,
          source: r.source!,
          totalAmount: r.totalAmount,
          warning: r.warning,
          receiptImageToken: r.receiptImageToken,
          discountAmount: r.discountAmount,
          discountCategory: r.discountCategory,
          categoryAdjustments: r.categoryAdjustments,
          items: r.items.map((it) => ({
            name: it.name,
            unitPrice: it.unitPrice,
            quantity: it.quantity,
            amount: it.amount,
            category: it.category,
            matchedMenuName: it.matchedMenuName,
          })),
          attendees: r.attendances.map((a) => ({
            participantClientId: a.participantClientId,
            attended: a.attended,
            excludeAlcoholOverride: a.excludeAlcoholOverride,
            excludeNonAlcoholOverride: a.excludeNonAlcoholOverride,
            excludeSideOverride: a.excludeSideOverride,
          })),
        })),
        participants: draft.participants.map((p) => ({
          clientId: p.clientId,
          name: p.name?.trim() || null,
          nickname: p.nickname?.trim() || null,
          excludeAlcohol: p.excludeAlcohol,
          excludeNonAlcohol: p.excludeNonAlcohol,
          excludeSide: p.excludeSide,
          ...(p.contactId ? { contactId: p.contactId } : {}),
        })),
        ...(editingId ? {} : fromDraftId ? { fromDraftId } : {}),
      };
      const saved = editingId
        ? await update.mutateAsync({ id: editingId, input: payload })
        : await create.mutateAsync(payload);
      reset();
      // expo-router 의 replace — wizard 화면을 결과로 갈아끼움.
      router.replace(`/restaurant/${saved.restaurantPlaceId}/settle/${saved.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장 실패');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={{ gap: 4 }}>
          <Text style={styles.h2}>분배 결과</Text>
          <Text style={styles.body}>
            {multi
              ? '차수별 분담을 확인하고, 차수별 참석 체크가 맞는지 확인하세요. 저장하면 이력으로 남습니다.'
              : '참여자별 분담액입니다. 저장하면 이력으로 남아 나중에 다시 볼 수 있어요.'}
          </Text>
        </View>

        {/* 차수 × 참여자 참석 — multi 일 때만. 각 참여자 카드에 차수 토글. */}
        {multi && (
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              차수별 참석
            </Text>
            <View style={{ gap: 8 }}>
              {draft.participants.map((p, pIdx) => (
                <View
                  key={p.clientId}
                  style={[
                    styles.attendRow,
                    { borderColor: theme.colors.border },
                  ]}
                >
                  <Text
                    style={[styles.attendName, { color: theme.colors.text }]}
                    numberOfLines={1}
                  >
                    {participantName(p, pIdx)}
                  </Text>
                  <View style={styles.attendChips}>
                    {draft.rounds.map((r, rIdx) => {
                      const a = r.attendances.find(
                        (x) => x.participantClientId === p.clientId,
                      );
                      const attended = a?.attended ?? false;
                      return (
                        <Pressable
                          key={r.clientId}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: attended }}
                          onPress={() =>
                            setAttendance(r.clientId, p.clientId, !attended)
                          }
                          style={({ pressed }) => [
                            styles.attendChip,
                            {
                              borderColor: attended
                                ? theme.colors.primary
                                : theme.colors.border,
                              backgroundColor: attended
                                ? theme.colors.primary
                                : pressed
                                  ? theme.colors.surfaceAlt
                                  : 'transparent',
                            },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: '500',
                              color: attended
                                ? theme.colors.primaryText
                                : theme.colors.text,
                            }}
                          >
                            {rIdx + 1}차
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 참여자별 grand total */}
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
            💰 참여자별 분담
          </Text>
          <View style={{ gap: 0 }}>
            {draft.participants.map((p, idx) => {
              const tags: string[] = [];
              if (p.excludeAlcohol) tags.push('주류 X');
              if (p.excludeNonAlcohol) tags.push('비주류 X');
              if (p.excludeSide) tags.push('안주 X');
              const total = calc.perParticipant[idx] ?? 0;
              return (
                <View
                  key={p.clientId}
                  style={[
                    styles.participantRow,
                    { borderTopColor: theme.colors.border },
                    idx === 0 ? { borderTopWidth: 0 } : {},
                  ]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={[styles.participantName, { color: theme.colors.text }]}
                      numberOfLines={1}
                    >
                      {participantName(p, idx)}
                    </Text>
                    {tags.length > 0 && (
                      <View style={styles.tagRow}>
                        {tags.map((t) => (
                          <Text
                            key={t}
                            style={[
                              styles.tag,
                              {
                                color: theme.colors.textMuted,
                                backgroundColor: theme.colors.surfaceAlt,
                              },
                            ]}
                          >
                            {t}
                          </Text>
                        ))}
                      </View>
                    )}
                    {multi && (
                      <Text
                        style={[
                          styles.perRoundText,
                          { color: theme.colors.textMuted },
                        ]}
                      >
                        {calc.perRound
                          .map((rc, rIdx) => {
                            const attended =
                              draft.rounds[rIdx]?.attendances.find(
                                (a) => a.participantClientId === p.clientId,
                              )?.attended ?? false;
                            return attended
                              ? `${rIdx + 1}차 ${(rc.shareAmounts[idx] ?? 0).toLocaleString('ko-KR')}`
                              : `${rIdx + 1}차 불참`;
                          })
                          .join(' · ')}
                      </Text>
                    )}
                  </View>
                  <Text
                    style={[styles.participantTotal, { color: theme.colors.text }]}
                  >
                    {total.toLocaleString('ko-KR')}원
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={[styles.grandTotalRow, { borderTopColor: theme.colors.border }]}>
            <Text
              style={[styles.grandTotalLabel, { color: theme.colors.textMuted }]}
            >
              총 합계
            </Text>
            <Text
              style={[styles.grandTotalValue, { color: theme.colors.text }]}
            >
              {calc.grandTotal.toLocaleString('ko-KR')}원
            </Text>
          </View>
        </View>

        {/* 차수별 카드 — 식당/소계만. 디테일 에디터는 #76 에서 추가. */}
        {draft.rounds.map((r, rIdx) => {
          const rc = calc.perRound[rIdx];
          if (!rc) return null;
          return (
            <View key={r.clientId} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text
                  style={[styles.cardTitle, { color: theme.colors.text }]}
                  numberOfLines={1}
                >
                  {multi ? `${rIdx + 1}차 · ` : ''}
                  {r.placeName}
                </Text>
                <Text
                  style={[styles.cardSub, { color: theme.colors.textMuted }]}
                >
                  {rc.itemsSubtotal.toLocaleString('ko-KR')}원
                </Text>
              </View>
            </View>
          );
        })}

        {error && (
          <View
            style={[
              styles.errorBox,
              {
                backgroundColor: theme.colors.dangerBg,
                borderColor: theme.colors.danger,
              },
            ]}
          >
            <Text style={[styles.errorText, { color: theme.colors.danger }]}>
              ⚠ {error}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
        <Pressable
          accessibilityRole="button"
          disabled={pending}
          onPress={onBack}
          style={({ pressed }) => [
            styles.ghostButton,
            {
              backgroundColor: pressed
                ? theme.colors.surfaceAlt
                : 'transparent',
              opacity: pending ? 0.5 : 1,
            },
          ]}
        >
          <Text style={[styles.ghostButtonText, { color: theme.colors.text }]}>
            이전
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={pending}
          onPress={handleSave}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: pending
                ? theme.colors.surfaceAlt
                : pressed
                  ? theme.colors.primaryHover
                  : theme.colors.primary,
            },
          ]}
        >
          {pending ? (
            <ActivityIndicator size="small" color={theme.colors.text} />
          ) : (
            <Text
              style={[
                styles.primaryButtonText,
                { color: theme.colors.primaryText },
              ]}
            >
              {editingId ? '수정 저장' : '저장'}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    scrollContent: { padding: 16, gap: 12, paddingBottom: 24 },
    h2: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
    body: { fontSize: 13, lineHeight: 20, color: theme.colors.textMuted },
    card: {
      padding: 12,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      gap: 8,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    cardTitle: { fontSize: 14, fontWeight: '600' },
    cardSub: { fontSize: 13 },
    attendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingVertical: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    attendName: { fontSize: 13, flex: 1, minWidth: 0 },
    attendChips: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
    attendChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
    },
    participantRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    participantName: { fontSize: 14, fontWeight: '500' },
    participantTotal: { fontSize: 15, fontWeight: '700' },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
    tag: {
      fontSize: 10,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    perRoundText: { fontSize: 11, marginTop: 4 },
    grandTotalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 10,
      marginTop: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    grandTotalLabel: { fontSize: 13 },
    grandTotalValue: { fontSize: 15, fontWeight: '700' },
    errorBox: {
      padding: 10,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
    },
    errorText: { fontSize: 12 },
    footer: {
      flexDirection: 'row',
      gap: 8,
      padding: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.bg,
    },
    ghostButton: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 10,
    },
    ghostButtonText: { fontSize: 14, fontWeight: '500' },
    primaryButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
    },
    primaryButtonText: { fontSize: 15, fontWeight: '600' },
  });
