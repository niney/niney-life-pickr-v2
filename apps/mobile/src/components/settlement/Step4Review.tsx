import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  calculateShares,
  type ReceiptItemCategoryType,
} from '@repo/api-contract';
import {
  ApiError,
  useCreateSettlement,
  useSettlementDraftStore,
  useTheme,
} from '@repo/shared';

interface Props {
  placeId: string;
  onBack: () => void;
}

const CATEGORY_LABEL: Record<ReceiptItemCategoryType, string> = {
  ALCOHOL: '주류',
  NON_ALCOHOL: '비주류',
  SIDE: '안주',
  UNCATEGORIZED: '미분류',
};

const participantName = (
  p: { name: string | null; nickname: string | null },
  idx: number,
) => {
  const nm = (p.name ?? '').trim();
  const nick = (p.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || `참여자 ${idx + 1}`;
};

// 4단계 — 분배 결과 미리보기 + 저장. 클라이언트도 calculateShares 로 미리
// 계산해 화면에 보여주지만, 서버가 다시 계산해 권위 있는 값을 저장한다.
export const Step4Review = ({ placeId, onBack }: Props) => {
  const theme = useTheme();
  const draft = useSettlementDraftStore();
  const create = useCreateSettlement();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const calc = useMemo(
    () =>
      calculateShares({
        items: draft.items.map((it) => ({ amount: it.amount, category: it.category })),
        participants: draft.participants.map((p) => ({
          excludeAlcohol: p.excludeAlcohol,
          excludeNonAlcohol: p.excludeNonAlcohol,
          excludeSide: p.excludeSide,
        })),
      }),
    [draft.items, draft.participants],
  );

  const subtotalMismatch =
    draft.source === 'RECEIPT' &&
    draft.totalAmount != null &&
    Math.abs(calc.itemsSubtotal - draft.totalAmount) >= 1;

  const handleSave = async () => {
    setError(null);
    if (!draft.source) {
      setError('입력 방식이 결정되지 않았습니다.');
      return;
    }
    try {
      const saved = await create.mutateAsync({
        restaurantPlaceId: placeId,
        source: draft.source,
        totalAmount: draft.totalAmount,
        warning: draft.warning,
        receiptImageToken: draft.receiptImageToken,
        items: draft.items.map((it) => ({
          name: it.name,
          unitPrice: it.unitPrice,
          quantity: it.quantity,
          amount: it.amount,
          category: it.category,
          matchedMenuName: it.matchedMenuName,
        })),
        participants: draft.participants.map((p) => ({
          name: p.name?.trim() || null,
          nickname: p.nickname?.trim() || null,
          excludeAlcohol: p.excludeAlcohol,
          excludeNonAlcohol: p.excludeNonAlcohol,
          excludeSide: p.excludeSide,
          ...(p.contactId ? { contactId: p.contactId } : {}),
        })),
      });
      draft.reset();
      router.replace(`/restaurant/${placeId}/settle/${saved.id}` as never);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장에 실패했습니다.');
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.colors.text }]}>분배 결과</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          참여자별 분담액입니다. 저장하면 이력으로 남아 나중에 다시 볼 수 있어요.
        </Text>
      </View>

      {(draft.warning || subtotalMismatch) && (
        <View style={[styles.warning, { borderColor: '#f59e0b', backgroundColor: '#fef3c7' }]}>
          {draft.warning && (
            <Text style={[styles.warningText, { color: '#92400e' }]}>{draft.warning}</Text>
          )}
          {subtotalMismatch && (
            <Text style={[styles.warningText, { color: '#92400e' }]}>
              항목 합계 {calc.itemsSubtotal.toLocaleString('ko-KR')}원 — 영수증 총액{' '}
              {draft.totalAmount?.toLocaleString('ko-KR')}원과 일치하지 않습니다.
            </Text>
          )}
        </View>
      )}

      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
          참여자별 분담
        </Text>
        {draft.participants.map((p, idx) => {
          const tags: string[] = [];
          if (p.excludeAlcohol) tags.push('주류 X');
          if (p.excludeNonAlcohol) tags.push('비주류 X');
          if (p.excludeSide) tags.push('안주 X');
          const share = calc.shareAmounts[idx] ?? 0;
          return (
            <View
              key={p.clientId}
              style={[
                styles.shareRow,
                idx > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.colors.border,
                },
              ]}
            >
              <View style={styles.shareMid}>
                <Text style={[styles.shareName, { color: theme.colors.text }]} numberOfLines={1}>
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
                            backgroundColor: theme.colors.surfaceAlt,
                            color: theme.colors.textMuted,
                          },
                        ]}
                      >
                        {t}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
              <Text style={[styles.shareAmount, { color: theme.colors.text }]}>
                {share.toLocaleString('ko-KR')}원
              </Text>
            </View>
          );
        })}

        <View
          style={[
            styles.subtotalRow,
            { borderTopColor: theme.colors.border },
          ]}
        >
          <Text style={[styles.subtotalLabel, { color: theme.colors.textMuted }]}>
            총 합계
          </Text>
          <Text style={[styles.subtotalValue, { color: theme.colors.text }]}>
            {calc.itemsSubtotal.toLocaleString('ko-KR')}원
          </Text>
        </View>
      </View>

      <Pressable
        onPress={() => setBreakdownOpen((v) => !v)}
        android_ripple={{ color: theme.colors.surfaceAlt }}
        style={[
          styles.card,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <View style={styles.bdHead}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
            카테고리별 풀 상세
          </Text>
          <Text style={[styles.chev, { color: theme.colors.textMuted }]}>
            {breakdownOpen ? '▴' : '▾'}
          </Text>
        </View>
        {breakdownOpen && (
          <View style={{ marginTop: 8, gap: 6 }}>
            {(['ALCOHOL', 'NON_ALCOHOL', 'SIDE', 'UNCATEGORIZED'] as ReceiptItemCategoryType[]).map(
              (c) => {
                const b = calc.poolBreakdown[c];
                if (b.poolAmount === 0) return null;
                return (
                  <View key={c} style={styles.bdRow}>
                    <Text style={[styles.bdLabel, { color: theme.colors.text }]}>
                      {CATEGORY_LABEL[c]}
                    </Text>
                    <Text style={[styles.bdValue, { color: theme.colors.textMuted }]}>
                      {b.poolAmount.toLocaleString('ko-KR')}원 · {b.participantCount}명 · 1인{' '}
                      {b.perParticipant.toLocaleString('ko-KR')}원
                    </Text>
                  </View>
                );
              },
            )}
            {Object.values(calc.poolBreakdown).every((b) => b.poolAmount === 0) && (
              <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
                항목이 없습니다.
              </Text>
            )}
          </View>
        )}
      </Pressable>

      {error && (
        <Text style={[styles.errText, { color: theme.colors.danger }]}>{error}</Text>
      )}

      <View style={styles.footer}>
        <Pressable
          onPress={create.isPending ? undefined : onBack}
          disabled={create.isPending}
          style={({ pressed }) => [
            styles.ghostBtn,
            {
              borderColor: theme.colors.border,
              backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent',
              opacity: create.isPending ? 0.6 : 1,
            },
          ]}
        >
          <Text style={[styles.ghostText, { color: theme.colors.text }]}>이전</Text>
        </Pressable>
        <Pressable
          onPress={handleSave}
          disabled={create.isPending}
          style={({ pressed }) => [
            styles.saveBtn,
            {
              backgroundColor: create.isPending
                ? theme.colors.surfaceAlt
                : pressed
                  ? theme.colors.primaryHover
                  : theme.colors.primary,
            },
          ]}
        >
          {create.isPending ? (
            <ActivityIndicator color={theme.colors.text} />
          ) : (
            <Text style={[styles.saveText, { color: theme.colors.primaryText }]}>
              저장
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12 },
  head: { gap: 4 },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 13, lineHeight: 18 },
  warning: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 4 },
  warningText: { fontSize: 13, lineHeight: 18 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 12,
  },
  shareMid: { flex: 1, minWidth: 0 },
  shareName: { fontSize: 14, fontWeight: '500' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  tag: {
    fontSize: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  shareAmount: { fontSize: 16, fontWeight: '700' },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  subtotalLabel: { fontSize: 13 },
  subtotalValue: { fontSize: 15, fontWeight: '700' },
  bdHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chev: { fontSize: 16 },
  bdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  bdLabel: { fontSize: 13 },
  bdValue: { fontSize: 12, textAlign: 'right', flex: 1, marginLeft: 8 },
  errText: { fontSize: 13 },
  footer: { flexDirection: 'row', gap: 8 },
  ghostBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ghostText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 2, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '700' },
});
