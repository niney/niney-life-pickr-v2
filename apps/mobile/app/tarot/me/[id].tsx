import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ApiError, useDeleteTarotReading, useMyTarotReading } from '@repo/shared';
import { TarotReadingView } from '~/components/tarot/TarotReadingView';
import { TarotShareSheet } from '~/components/tarot/TarotShareSheet';
import { Glass, Icon } from '~/components/tarot/tarotUi';
import { TR, ink } from '~/components/tarot/tarotTokens';

// 내 타로 기록 상세 — 웹 /me/tarot/:id 와 같다. 저장된 리딩을 한 장으로 다시 보고, 공유(readingId, 웹 링크)·삭제(확인 후 목록으로).
// 타로 화면의 "오늘의 카드는 이미 뽑았어요 · 오늘 카드 보기" 도 여기로 온다.

const pad = (n: number) => String(n).padStart(2, '0');
const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function MyTarotReadingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useMyTarotReading(typeof id === 'string' ? id : null);
  const del = useDeleteTarotReading();
  const [shareOpen, setShareOpen] = useState(false);
  const readingId = query.data?.readingId ?? null;

  const onDelete = () => {
    if (!readingId) return;
    Alert.alert('이 리딩을 삭제할까요?', '삭제하면 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => del.mutate(readingId, { onSuccess: () => router.back() }) },
    ]);
  };

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '타로 리딩',
          headerStyle: { backgroundColor: TR.bg },
          headerTintColor: TR.cream,
          headerTitleStyle: { color: TR.cream },
          headerShadowVisible: false,
          headerRight: readingId
            ? () => (
                <View style={styles.actions}>
                  <Pressable accessibilityRole="button" accessibilityLabel="공유" onPress={() => setShareOpen(true)} hitSlop={8}>
                    <Icon name="share-variant-outline" size={21} color={TR.cream} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="삭제" onPress={onDelete} disabled={del.isPending} hitSlop={8}>
                    <Icon name="trash-can-outline" size={21} color={ink(0.7)} />
                  </Pressable>
                </View>
              )
            : undefined,
        }}
      />
      <LinearGradient colors={[TR.bg2, TR.bg]} locations={[0, 0.6]} style={StyleSheet.absoluteFill} />
      {query.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={TR.gold} />
          <Text style={styles.muted}>불러오는 중…</Text>
        </View>
      ) : query.isError || !query.data ? (
        <View style={styles.center}>
          <Text style={[styles.muted, { color: TR.coral }]}>
            {query.error instanceof ApiError && query.error.statusCode === 404 ? '리딩을 찾을 수 없어요.' : '리딩을 불러오지 못했어요.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.date}>{fmtDate(query.data.createdAt)}</Text>
          <Glass style={{ padding: 16 }}>
            <TarotReadingView reading={query.data} />
          </Glass>
        </ScrollView>
      )}
      {readingId ? <TarotShareSheet open={shareOpen} onClose={() => setShareOpen(false)} base={{ readingId }} hasQuestion={!!query.data?.question} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: TR.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { fontSize: 13, color: ink(0.6) },
  body: { padding: 14, paddingBottom: 40, gap: 8 },
  date: { alignSelf: 'flex-end', fontSize: 11, color: ink(0.5) },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 4 },
});
