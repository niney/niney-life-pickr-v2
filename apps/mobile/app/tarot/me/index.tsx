import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import type { TarotReadingSummaryType } from '@repo/api-contract';
import { useAuthStore, useDeleteTarotReading, useMyTarotReadingsInfinite } from '@repo/shared';
import { getTarotSpread, TAROT_TOPIC_LABEL } from '@repo/utils';
import { TarotCardFace } from '~/components/tarot/TarotCardImage';
import { Glass, Icon, Muted, OutlineButton, PrimaryButton } from '~/components/tarot/tarotUi';
import { SERIF, TR, ink } from '~/components/tarot/tarotTokens';

// 내 타로 기록 — 웹 /me/tarot 과 같은 구성. 회원 자동 저장분 목록(최신순, 커서 더 보기). 항목 → 상세. 삭제는 확인 창 뒤에.
// 게스트 리딩은 서버에 남지 않아(이 기기 기록은 타로 화면의 "최근 리딩") 로그인 안내.

const pad = (n: number) => String(n).padStart(2, '0');
const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const ReadingRow = ({ item }: { item: TarotReadingSummaryType }) => {
  const del = useDeleteTarotReading();
  const spread = getTarotSpread(item.spreadId);
  const onDelete = () =>
    Alert.alert('이 리딩을 삭제할까요?', '삭제하면 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => del.mutate(item.id) },
    ]);
  return (
    <Glass style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${item.keyword} 리딩 보기`} onPress={() => router.push(`/tarot/me/${item.id}` as never)} style={styles.rowMain}>
        <View style={styles.thumbs}>
          {item.cards.slice(0, 3).map((c, i) => (
            <TarotCardFace key={c.cardId} cardId={c.cardId} reversed={c.reversed} style={[styles.thumb, i > 0 && { marginLeft: -14 }]} />
          ))}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.titleRow}>
            <Text style={styles.keyword}>{item.keyword}</Text>
            <Text style={styles.sub}>
              {spread?.nameKo} · {TAROT_TOPIC_LABEL[item.topic]}
              {item.source === 'static' ? ' · 기본 해석' : ''}
            </Text>
          </View>
          <Text style={styles.question} numberOfLines={1}>
            {item.question || '질문 없음'}
          </Text>
          <Muted size={11} dim={0.45}>
            {fmtDate(item.createdAt)}
          </Muted>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="기록 삭제" disabled={del.isPending} onPress={onDelete} hitSlop={8} style={{ padding: 4 }}>
        <Icon name="trash-can-outline" size={19} color={ink(0.45)} />
      </Pressable>
    </Glass>
  );
};

export default function MyTarotScreen() {
  const isMember = useAuthStore((s) => !!s.token);
  const query = useMyTarotReadingsInfinite(20);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '내 타로 기록',
          headerStyle: { backgroundColor: TR.bg },
          headerTintColor: TR.cream,
          headerTitleStyle: { color: TR.cream },
          headerShadowVisible: false,
        }}
      />
      <LinearGradient colors={[TR.bg2, TR.bg]} locations={[0, 0.6]} style={StyleSheet.absoluteFill} />
      {!isMember ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>로그인하면 리딩이 자동으로 저장돼요</Text>
          <Muted size={12} dim={0.6} style={{ textAlign: 'center' }}>
            로그인 없이 본 리딩은 이 기기의 타로 화면 "최근 리딩"에 남아요.
          </Muted>
          <PrimaryButton label="로그인" icon="login" onPress={() => router.push('/(auth)/login' as never)} style={{ alignSelf: 'stretch', marginTop: 8 }} />
        </View>
      ) : query.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={TR.gold} />
          <Text style={styles.muted}>불러오는 중…</Text>
        </View>
      ) : query.isError ? (
        <View style={styles.center}>
          <Text style={[styles.muted, { color: TR.coral }]}>기록을 불러오지 못했어요.</Text>
          <OutlineButton label="다시 시도" icon="restore" onPress={() => void query.refetch()} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => <ReadingRow item={item} />}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              <Muted size={12} dim={0.6} style={{ flex: 1 }}>
                로그인 상태로 본 리딩은 자동으로 저장돼요.
              </Muted>
              <OutlineButton label="타로 보기" icon="cards-outline" onPress={() => router.push('/tarot' as never)} />
            </View>
          }
          ListEmptyComponent={<Text style={[styles.muted, { textAlign: 'center', paddingVertical: 40 }]}>아직 저장된 리딩이 없어요.</Text>}
          ListFooterComponent={
            query.hasNextPage ? (
              <OutlineButton label="더 보기" busy={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} style={{ alignSelf: 'center', marginTop: 6 }} />
            ) : null
          }
          testID="tarot-records"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: TR.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 28 },
  muted: { fontSize: 13, color: ink(0.6) },
  emptyTitle: { fontFamily: SERIF, fontSize: 17, fontWeight: '700', color: TR.cream, textAlign: 'center' },
  list: { padding: 14, gap: 8, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumbs: { flexDirection: 'row', width: 60 },
  thumb: { width: 30, borderWidth: 1, borderColor: TR.bg },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 6 },
  keyword: { fontFamily: SERIF, fontSize: 16, fontWeight: '700', color: TR.cream },
  sub: { fontSize: 11, color: ink(0.55) },
  question: { fontSize: 13, color: ink(0.7) },
});
