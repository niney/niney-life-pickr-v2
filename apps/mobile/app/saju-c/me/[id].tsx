import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useDeleteSajuReading, useMySajuReading } from '@repo/shared';
import { SajuReadingView } from '~/components/saju/SajuReadingView';
import { SajuShareSheet } from '~/components/saju/SajuShareSheet';
import { Icon } from '~/components/saju/sajuUi';
import { SJ, ink } from '~/components/saju/sajuTokens';

// 내 사주 기록 상세 — 웹 /me/saju-c/:id 와 같다. 한 장짜리 풀이 보기 + 공유(readingId, 웹 링크) + 삭제(확인 후 목록으로).

export default function MySajuReadingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useMySajuReading(typeof id === 'string' ? id : null);
  const del = useDeleteSajuReading();
  const [shareOpen, setShareOpen] = useState(false);
  const readingId = query.data?.readingId ?? null;

  const onDelete = () => {
    if (!readingId) return;
    Alert.alert('이 풀이를 삭제할까요?', '삭제하면 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => del.mutate(readingId, { onSuccess: () => router.back() }) },
    ]);
  };

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '사주 풀이',
          headerStyle: { backgroundColor: SJ.bg },
          headerTintColor: SJ.cream,
          headerTitleStyle: { color: SJ.cream },
          headerShadowVisible: false,
          headerRight: readingId
            ? () => (
                <View style={styles.actions}>
                  <Pressable accessibilityRole="button" accessibilityLabel="공유" onPress={() => setShareOpen(true)} hitSlop={8}>
                    <Icon name="share-variant-outline" size={21} color={SJ.cream} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="삭제" onPress={onDelete} disabled={del.isPending} hitSlop={8}>
                    <Icon name="trash-can-outline" size={21} color={ink(0.7)} />
                  </Pressable>
                </View>
              )
            : undefined,
        }}
      />
      <LinearGradient colors={['#1c1a22', SJ.bg]} locations={[0, 0.6]} style={StyleSheet.absoluteFill} />
      {query.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={SJ.gold} />
          <Text style={styles.muted}>불러오는 중…</Text>
        </View>
      ) : query.isError || !query.data ? (
        <View style={styles.center}>
          <Text style={[styles.muted, { color: SJ.salmon }]}>풀이를 찾을 수 없어요.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <SajuReadingView chart={query.data.chart} sections={query.data.sections} themes={query.data.themes ?? null} source={query.data.source} />
        </ScrollView>
      )}
      {readingId ? <SajuShareSheet open={shareOpen} onClose={() => setShareOpen(false)} base={{ readingId }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SJ.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { fontSize: 13, color: ink(0.6) },
  body: { padding: 14, paddingBottom: 40 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 4 },
});
