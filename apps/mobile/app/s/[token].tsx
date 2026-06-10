import { useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import {
  ApiError,
  useSharedSettlement,
  useTheme,
  type Theme,
} from '@repo/shared';
import type {
  ReceiptItemCategoryType,
  SharedSettlementSessionType,
} from '@repo/api-contract';
import { RoundGroupSplitNote } from '../../src/components/settlement/RoundGroupSplitNote';
import { SettlementBreakdownTable } from '../../src/components/settlement/SettlementBreakdownTable';

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

// 공유 토큰 read-only 결과 보기. 비로그인 사용자도 접근 가능 — 서버가 토큰
// 검증만 한다. 응답에서 영수증 미리보기와 소유자 id 는 제거되어 있다.
// 외부 링크(웹) 를 앱이 받았을 때 같은 도메인의 deep link 로 라우팅되면
// 이 화면이 떠야 한다 (deep link 설정은 별도).
export default function SharedSettlementScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { token = '' } = useLocalSearchParams<{ token: string }>();
  const session = useSharedSettlement(token);

  if (session.isLoading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: '공유된 정산' }} />
        <View style={[styles.center, { backgroundColor: theme.colors.bg }]}>
          <ActivityIndicator color={theme.colors.text} />
        </View>
      </>
    );
  }

  if (session.isError || !session.data) {
    const status =
      session.error instanceof ApiError ? session.error.statusCode : null;
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: '공유된 정산' }} />
        <View style={[styles.center, { backgroundColor: theme.colors.bg }]}>
          <Text style={[styles.errorTitle, { color: theme.colors.text }]}>
            {status === 410
              ? '만료된 공유 링크입니다'
              : '공유된 정산을 찾을 수 없습니다'}
          </Text>
          <Text style={[styles.errorBody, { color: theme.colors.textMuted }]}>
            {status === 410
              ? '공유 링크의 유효 기간이 지났습니다. 작성자에게 새 링크를 요청하세요.'
              : status === 404
                ? '잘못된 주소이거나 공유가 해제된 링크입니다.'
                : session.error instanceof ApiError
                  ? session.error.message
                  : '잠시 후 다시 시도해 주세요.'}
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
          title: `🎲 ${headerLabel}`,
        }}
      />
      <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View
            style={[
              styles.banner,
              {
                backgroundColor: theme.colors.surfaceAlt,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.bannerText, { color: theme.colors.textMuted }]}>
              공유 링크로 보는 read-only 결과입니다.
            </Text>
          </View>
          <SummaryCard session={s} theme={theme} />
          <ParticipantsCard session={s} theme={theme} />
          {s.rounds.map((r) => (
            <RoundCard
              key={r.id}
              round={r}
              participants={s.participants}
              showRoundNumber={s.rounds.length > 1}
              theme={theme}
            />
          ))}
          <SettlementBreakdownTable session={s} />
        </ScrollView>
      </View>
    </>
  );
}

const SummaryCard = ({
  session,
  theme,
}: {
  session: SharedSettlementSessionType;
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
      <Text style={[styles.summaryText, { color: theme.colors.textMuted }]}>
        참여 {session.participants.length}명 · {session.rounds.length}차 · 작성{' '}
        {createdLabel}
        {session.editedAt ? ' · 수정됨' : ''}
      </Text>
    </View>
  );
};

const ParticipantsCard = ({
  session,
  theme,
}: {
  session: SharedSettlementSessionType;
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
        const perRoundText =
          session.rounds.length > 1
            ? session.rounds
                .map((r, rIdx) => {
                  const att = r.attendees.find(
                    (a) => a.participantId === p.id,
                  );
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
                  style={[styles.perRoundText, { color: theme.colors.textMuted }]}
                >
                  {perRoundText}
                </Text>
              )}
            </View>
            <Text style={[styles.participantTotal, { color: theme.colors.text }]}>
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
  participants,
  showRoundNumber,
  theme,
}: {
  round: SharedSettlementSessionType['rounds'][number];
  participants: SharedSettlementSessionType['participants'];
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

      <View style={{ gap: 6 }}>
        {round.items.map((it) => (
          <View
            key={it.id}
            style={[styles.itemRow, { borderTopColor: theme.colors.border }]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={[styles.itemName, { color: theme.colors.text }]}
                numberOfLines={1}
              >
                {it.name}
              </Text>
              <Text style={[styles.itemMeta, { color: theme.colors.textMuted }]}>
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
            style={[styles.itemRow, { borderTopColor: theme.colors.border }]}
          >
            <Text style={[styles.itemName, { color: theme.colors.textMuted }]}>
              할인 ({CATEGORY_LABEL[round.discountCategory]})
            </Text>
            <Text style={[styles.itemAmount, { color: theme.colors.danger }]}>
              −{round.discountAmount.toLocaleString('ko-KR')}원
            </Text>
          </View>
        )}
      </View>

      <RoundGroupSplitNote
        round={round}
        participants={participants}
        theme={theme}
      />
    </View>
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
      gap: 8,
    },
    errorTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
    errorBody: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
    banner: {
      padding: 10,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
    },
    bannerText: { fontSize: 12, textAlign: 'center' },
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
  });
