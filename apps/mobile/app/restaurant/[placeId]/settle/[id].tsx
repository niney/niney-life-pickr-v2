import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type {
  ReceiptItemCategoryType,
  SettlementSessionType,
} from '@repo/api-contract';
import {
  ApiError,
  getApiConfig,
  useCreateSettlementShare,
  useDeleteSettlement,
  useSettlement,
  useTheme,
} from '@repo/shared';

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

// 정산 결과 화면 — 저장된 세션 단건 조회 후 분담 결과 카드 표시.
// 공유는 네이티브 시트(카톡/메시지/메일 등) 로 보냄 — 받는 사람은 웹의
// /share/settlements/:token (SharedSettlementPage) 에서 read-only 로 본다.
export default function SettlementResultScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id = '', placeId = '' } = useLocalSearchParams<{ id: string; placeId: string }>();
  const session = useSettlement(id || null);
  const createShare = useCreateSettlementShare();
  const deleteIt = useDeleteSettlement();
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const data = session.data;

  const subtotalMismatch =
    data?.source === 'RECEIPT' &&
    data.totalAmount != null &&
    Math.abs(data.itemsSubtotal - data.totalAmount) >= 1;

  const handleShare = async () => {
    try {
      const res = await createShare.mutateAsync(id);
      if (!res.shareUrl) {
        Alert.alert('공유 실패', '공유 링크를 만들지 못했습니다.');
        return;
      }
      const url = buildAbsoluteShareUrl(res.shareUrl);
      await Share.share({
        title: '정산 결과',
        message: data ? `${data.restaurantName} 정산 결과\n${url}` : url,
        url, // iOS 용 — Android 는 message 만 사용
      });
    } catch (e) {
      // 사용자가 시트 취소한 케이스는 throw 안 나는 게 일반적. 에러만 안내.
      const msg = e instanceof ApiError ? e.message : '공유 처리 실패';
      Alert.alert('공유 실패', msg);
    }
  };

  const handleDelete = () => {
    Alert.alert('정산 삭제', '이 정산을 삭제할까요? 되돌릴 수 없습니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteIt.mutateAsync(id);
            if (placeId) router.replace(`/restaurant/${placeId}` as never);
            else router.back();
          } catch (e) {
            const msg = e instanceof ApiError ? e.message : '삭제 실패';
            Alert.alert('삭제 실패', msg);
          }
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: data?.restaurantName ?? '정산 결과',
          headerBackTitle: '뒤로',
        }}
      />
      <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
        {session.isLoading && !data ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : session.isError || !data ? (
          <View style={styles.center}>
            <Text style={{ color: theme.colors.danger, fontSize: 13 }}>
              결과를 불러오지 못했습니다.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.head}>
              <Text style={[styles.title, { color: theme.colors.text }]}>분배 결과</Text>
              <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
                {new Date(data.createdAt).toLocaleString('ko-KR')}
                {data.source === 'RECEIPT' ? ' · 영수증' : ' · 직접 입력'}
              </Text>
            </View>

            {subtotalMismatch && (
              <View
                style={[
                  styles.warning,
                  { borderColor: '#f59e0b', backgroundColor: '#fef3c7' },
                ]}
              >
                <Text style={[styles.warningText, { color: '#92400e' }]}>
                  항목 합계 {data.itemsSubtotal.toLocaleString('ko-KR')}원 — 영수증 총액{' '}
                  {data.totalAmount?.toLocaleString('ko-KR')}원과 일치하지 않습니다.
                </Text>
              </View>
            )}

            <ShareCard data={data} />
            <BreakdownCard data={data} open={breakdownOpen} onToggle={() => setBreakdownOpen((v) => !v)} />

            <View style={styles.actions}>
              <Pressable
                onPress={handleShare}
                disabled={createShare.isPending}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: createShare.isPending
                      ? theme.colors.surfaceAlt
                      : pressed
                        ? theme.colors.primaryHover
                        : theme.colors.primary,
                  },
                ]}
              >
                {createShare.isPending ? (
                  <ActivityIndicator color={theme.colors.text} />
                ) : (
                  <Text style={[styles.primaryText, { color: theme.colors.primaryText }]}>
                    공유하기
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={handleDelete}
                disabled={deleteIt.isPending}
                style={({ pressed }) => [
                  styles.ghostBtn,
                  {
                    borderColor: theme.colors.danger,
                    backgroundColor: pressed ? theme.colors.dangerBg : 'transparent',
                    opacity: deleteIt.isPending ? 0.6 : 1,
                  },
                ]}
              >
                <Text style={[styles.ghostText, { color: theme.colors.danger }]}>
                  {deleteIt.isPending ? '삭제 중…' : '삭제'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
      </View>
    </>
  );
}

const ShareCard = ({ data }: { data: SettlementSessionType }) => {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
        참여자별 분담
      </Text>
      {data.participants.map((p, idx) => {
        const tags: string[] = [];
        if (p.excludeAlcohol) tags.push('주류 X');
        if (p.excludeNonAlcohol) tags.push('비주류 X');
        if (p.excludeSide) tags.push('안주 X');
        return (
          <View
            key={p.id}
            style={[
              styles.shareRow,
              idx > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.colors.border,
              },
            ]}
          >
            <View style={styles.shareMid}>
              <Text
                style={[styles.shareName, { color: theme.colors.text }]}
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
              {p.shareAmount.toLocaleString('ko-KR')}원
            </Text>
          </View>
        );
      })}
      <View style={[styles.subtotalRow, { borderTopColor: theme.colors.border }]}>
        <Text style={[styles.subtotalLabel, { color: theme.colors.textMuted }]}>
          총 합계
        </Text>
        <Text style={[styles.subtotalValue, { color: theme.colors.text }]}>
          {data.itemsSubtotal.toLocaleString('ko-KR')}원
        </Text>
      </View>
    </View>
  );
};

const BreakdownCard = ({
  data,
  open,
  onToggle,
}: {
  data: SettlementSessionType;
  open: boolean;
  onToggle: () => void;
}) => {
  const theme = useTheme();
  // 풀별 합계는 항목에서 직접 산출. server 가 같은 결과를 갖고 있긴 하지만
  // 단건 응답엔 풀 분해가 없어서 화면에서 다시 계산.
  const pools = useMemo(() => {
    const map: Record<ReceiptItemCategoryType, number> = {
      ALCOHOL: 0,
      NON_ALCOHOL: 0,
      SIDE: 0,
      UNCATEGORIZED: 0,
    };
    for (const it of data.items) map[it.category] += it.amount;
    return map;
  }, [data.items]);

  return (
    <Pressable
      onPress={onToggle}
      android_ripple={{ color: theme.colors.surfaceAlt }}
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <View style={styles.bdHead}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
          카테고리별 합계
        </Text>
        <Text style={[styles.chev, { color: theme.colors.textMuted }]}>
          {open ? '▴' : '▾'}
        </Text>
      </View>
      {open && (
        <View style={{ marginTop: 8, gap: 6 }}>
          {(Object.keys(pools) as ReceiptItemCategoryType[]).map((c) => {
            const v = pools[c];
            if (v === 0) return null;
            return (
              <View key={c} style={styles.bdRow}>
                <Text style={[styles.bdLabel, { color: theme.colors.text }]}>
                  {CATEGORY_LABEL[c]}
                </Text>
                <Text style={[styles.bdValue, { color: theme.colors.textMuted }]}>
                  {v.toLocaleString('ko-KR')}원
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </Pressable>
  );
};

// 서버는 /api/v1/share/settlements/<token> 같은 상대 경로를 반환. 사용자가
// 받는 링크는 *웹 SPA* 의 /share/settlements/:token 이라 두 가지 변환이 필요:
// 1) origin 부착 — EXPO_PUBLIC_WEB_URL 우선, 미지정이면 API base 의 origin 폴백
//    (대부분 운영에서 같은 도메인을 공유)
// 2) /api/v1 prefix 제거 — SPA 라우트는 /share/... 로 시작
const buildAbsoluteShareUrl = (apiPath: string): string => {
  const token = apiPath.split('/').pop() ?? '';
  const spaPath = `/share/settlements/${token}`;
  const webOrigin = (process.env.EXPO_PUBLIC_WEB_URL ?? '').trim();
  if (webOrigin) return `${webOrigin.replace(/\/$/, '')}${spaPath}`;
  const cfg = getApiConfig();
  try {
    const u = new URL(cfg.baseUrl);
    return `${u.protocol}//${u.host}${spaPath}`;
  } catch {
    // baseUrl 이 절대 URL 이 아닌 케이스 — 안전 폴백.
    return `${cfg.baseUrl.replace(/\/$/, '')}${spaPath}`;
  }
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scrollContent: { padding: 16, paddingBottom: 32, gap: 12 },
  head: { gap: 4 },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { fontSize: 12 },
  warning: { borderWidth: 1, borderRadius: 10, padding: 12 },
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
  },
  bdLabel: { fontSize: 13 },
  bdValue: { fontSize: 13 },
  actions: { gap: 8, marginTop: 4 },
  primaryBtn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  primaryText: { fontSize: 15, fontWeight: '700' },
  ghostBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ghostText: { fontSize: 14, fontWeight: '600' },
});
