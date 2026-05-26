import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ApiError,
  settlementExtractionApi,
  useDeleteSettlement,
  useSettlement,
  useTheme,
  type Theme,
} from '@repo/shared';
import type {
  ReceiptItemCategoryType,
  SettlementRoundType,
  SettlementSessionType,
} from '@repo/api-contract';

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

export default function SettlementResultScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const { placeId = '', id = '' } = useLocalSearchParams<{
    placeId: string;
    id: string;
  }>();
  const session = useSettlement(id);
  const remove = useDeleteSettlement();

  const handleDelete = () => {
    Alert.alert(
      '정산 삭제',
      '이 정산 이력을 삭제할까요? 되돌릴 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await remove.mutateAsync(id);
              router.replace(`/restaurant/${placeId}`);
            } catch (e) {
              Alert.alert(
                '삭제 실패',
                e instanceof ApiError ? e.message : '알 수 없는 오류',
              );
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  if (session.isLoading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: '정산 결과' }} />
        <View style={[styles.center, { backgroundColor: theme.colors.bg }]}>
          <ActivityIndicator color={theme.colors.text} />
        </View>
      </>
    );
  }

  if (session.isError || !session.data) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: '정산 결과' }} />
        <View style={[styles.center, { backgroundColor: theme.colors.bg }]}>
          <Text style={[styles.errorText, { color: theme.colors.danger }]}>
            정산을 불러오지 못했습니다.
            {session.error instanceof ApiError
              ? `\n${session.error.message}`
              : ''}
          </Text>
        </View>
      </>
    );
  }

  const s = session.data;
  const headerLabel =
    s.rounds.length > 1
      ? `${s.restaurantName} 외 ${s.rounds.length - 1}곳`
      : s.restaurantName;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: `정산 결과 · ${headerLabel}`,
        }}
      />
      <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <SummaryCard session={s} theme={theme} />
          <ParticipantsCard session={s} theme={theme} />
          {s.rounds.map((r) => (
            <RoundCard
              key={r.id}
              round={r}
              showRoundNumber={s.rounds.length > 1}
              theme={theme}
            />
          ))}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push(`/restaurant/${placeId}/settle/${id}/edit`)
            }
            style={({ pressed }) => [
              styles.editButton,
              {
                backgroundColor: pressed
                  ? theme.colors.primaryHover
                  : theme.colors.primary,
              },
            ]}
          >
            <Text
              style={[
                styles.editButtonText,
                { color: theme.colors.primaryText },
              ]}
            >
              ✎ 수정
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={remove.isPending}
            onPress={handleDelete}
            style={({ pressed }) => [
              styles.dangerButton,
              {
                borderColor: theme.colors.danger,
                backgroundColor: pressed
                  ? theme.colors.dangerBg
                  : 'transparent',
                opacity: remove.isPending ? 0.5 : 1,
              },
            ]}
          >
            {remove.isPending ? (
              <ActivityIndicator size="small" color={theme.colors.danger} />
            ) : (
              <Text
                style={[styles.dangerButtonText, { color: theme.colors.danger }]}
              >
                🗑 삭제
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </>
  );
}

const SummaryCard = ({
  session,
  theme,
}: {
  session: SettlementSessionType;
  theme: Theme;
}) => {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const created = new Date(session.createdAt);
  const createdLabel = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')} ${String(created.getHours()).padStart(2, '0')}:${String(created.getMinutes()).padStart(2, '0')}`;
  return (
    <View style={styles.card}>
      <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
        💰 총 합계
      </Text>
      <Text style={[styles.bigAmount, { color: theme.colors.text }]}>
        {session.grandTotal.toLocaleString('ko-KR')}원
      </Text>
      <View style={styles.summaryMeta}>
        <Text style={[styles.summaryText, { color: theme.colors.textMuted }]}>
          참여 {session.participants.length}명 · {session.rounds.length}차
        </Text>
        <Text style={[styles.summaryText, { color: theme.colors.textMuted }]}>
          작성 {createdLabel}
          {session.editedAt ? ' · 수정됨' : ''}
        </Text>
      </View>
    </View>
  );
};

const ParticipantsCard = ({
  session,
  theme,
}: {
  session: SettlementSessionType;
  theme: Theme;
}) => {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.card}>
      <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
        참여자별 분담
      </Text>
      {session.participants.map((p, idx) => {
        const tags: string[] = [];
        if (p.excludeAlcohol) tags.push('주류 X');
        if (p.excludeNonAlcohol) tags.push('비주류 X');
        if (p.excludeSide) tags.push('안주 X');
        // 차수별 부분합 — round.attendees 의 shareAmount 사용. 비참석은 attended=false.
        const perRoundText =
          session.rounds.length > 1
            ? session.rounds
                .map((r, rIdx) => {
                  const att = r.attendees.find((a) => a.participantId === p.id);
                  if (!att?.attended) return `${rIdx + 1}차 불참`;
                  return `${rIdx + 1}차 ${att.shareAmount.toLocaleString('ko-KR')}`;
                })
                .join(' · ')
            : null;
        return (
          <View
            key={p.id}
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
              {perRoundText && (
                <Text
                  style={[
                    styles.perRoundText,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  {perRoundText}
                </Text>
              )}
            </View>
            <Text
              style={[styles.participantTotal, { color: theme.colors.text }]}
            >
              {p.shareAmount.toLocaleString('ko-KR')}원
            </Text>
          </View>
        );
      })}
    </View>
  );
};

const RoundCard = ({
  round,
  showRoundNumber,
  theme,
}: {
  round: SettlementRoundType;
  showRoundNumber: boolean;
  theme: Theme;
}) => {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text
          style={[styles.cardTitle, { color: theme.colors.text }]}
          numberOfLines={1}
        >
          {showRoundNumber ? `${round.orderIndex + 1}차 · ` : ''}
          {round.restaurantName}
        </Text>
        <Text style={[styles.cardSub, { color: theme.colors.textMuted }]}>
          {round.itemsSubtotal.toLocaleString('ko-KR')}원
        </Text>
      </View>

      {round.warning && (
        <View
          style={[
            styles.warnBanner,
            {
              backgroundColor: theme.colors.dangerBg,
              borderColor: theme.colors.danger,
            },
          ]}
        >
          <Text style={[styles.warnText, { color: theme.colors.text }]}>
            ⚠ {round.warning}
          </Text>
        </View>
      )}

      {round.receiptPreviewUrl && (
        <ReceiptImage url={round.receiptPreviewUrl} theme={theme} />
      )}

      <View style={{ gap: 6 }}>
        {round.items.map((it) => (
          <View
            key={it.id}
            style={[
              styles.itemRow,
              { borderTopColor: theme.colors.border },
            ]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={[styles.itemName, { color: theme.colors.text }]}
                numberOfLines={1}
              >
                {it.name}
              </Text>
              <Text
                style={[styles.itemMeta, { color: theme.colors.textMuted }]}
              >
                {CATEGORY_LABEL[it.category]}
                {it.unitPrice != null && it.quantity != null
                  ? ` · ${it.unitPrice.toLocaleString('ko-KR')}원 × ${it.quantity}`
                  : ''}
              </Text>
            </View>
            <Text style={[styles.itemAmount, { color: theme.colors.text }]}>
              {it.amount.toLocaleString('ko-KR')}원
            </Text>
          </View>
        ))}
        {round.discountAmount != null && round.discountCategory != null && (
          <View
            style={[
              styles.itemRow,
              { borderTopColor: theme.colors.border },
            ]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={[styles.itemName, { color: theme.colors.textMuted }]}
              >
                할인 ({CATEGORY_LABEL[round.discountCategory]})
              </Text>
            </View>
            <Text style={[styles.itemAmount, { color: theme.colors.danger }]}>
              −{round.discountAmount.toLocaleString('ko-KR')}원
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

// 영수증 이미지 — JWT preview 라 fetch + base64 변환 후 표시.
const ReceiptImage = ({ url, theme }: { url: string; theme: Theme }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = url.split('/').pop() ?? '';
    (async () => {
      try {
        const blob = await settlementExtractionApi.previewBlob(token);
        const reader = new FileReader();
        reader.onloadend = () => {
          if (cancelled) return;
          if (typeof reader.result === 'string') setDataUrl(reader.result);
          else setError('미리보기 변환 실패');
        };
        reader.onerror = () => {
          if (!cancelled) setError('미리보기 변환 실패');
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '미리보기 실패');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return (
      <Text style={{ fontSize: 12, color: theme.colors.danger }}>{error}</Text>
    );
  }
  if (!dataUrl) {
    return (
      <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>
        영수증 불러오는 중…
      </Text>
    );
  }
  return (
    <Image
      source={{ uri: dataUrl }}
      style={{
        width: '100%',
        height: 200,
        borderRadius: 8,
        backgroundColor: theme.colors.surfaceAlt,
      }}
      resizeMode="contain"
    />
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { padding: 16, gap: 12, paddingBottom: 24 },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    errorText: { fontSize: 14, textAlign: 'center' },
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
    cardTitle: { fontSize: 14, fontWeight: '600', flex: 1 },
    cardSub: { fontSize: 13 },
    bigAmount: { fontSize: 28, fontWeight: '800' },
    summaryMeta: { gap: 2 },
    summaryText: { fontSize: 12 },
    warnBanner: {
      padding: 10,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
    },
    warnText: { fontSize: 12, lineHeight: 18 },
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
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    itemName: { fontSize: 13, fontWeight: '500' },
    itemMeta: { fontSize: 11, marginTop: 2 },
    itemAmount: { fontSize: 13, fontWeight: '600' },
    footer: {
      flexDirection: 'row',
      gap: 8,
      padding: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.bg,
    },
    editButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
    },
    editButtonText: { fontSize: 14, fontWeight: '600' },
    dangerButton: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
    },
    dangerButtonText: { fontSize: 14, fontWeight: '600' },
  });
