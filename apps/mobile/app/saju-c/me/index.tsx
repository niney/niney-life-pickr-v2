import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import type { SajuProfileType, SajuReadingSummaryType } from '@repo/api-contract';
import { useAuthStore, useDeleteSajuProfile, useDeleteSajuReading, useMySajuReadingsInfinite, useSajuProfiles, useUpsertSajuProfile } from '@repo/shared';
import { Glass, Icon, Muted, OutlineButton, Para, Pill, PrimaryButton, TextButton } from '~/components/saju/sajuUi';
import { SERIF, SJ, ink } from '~/components/saju/sajuTokens';

// 내 사주 기록 — 웹 /me/saju-c 와 같은 구성. 회원 프로필(나·가족, ★ 내 사주) + 물어본 것 + 자동 저장된 풀이
// (최신순, 커서 더 보기). 풀이 → 상세. 삭제는 확인 창 뒤에. 게스트는 로그인 안내.

const pad = (n: number) => String(n).padStart(2, '0');
const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmtBirth = (p: SajuProfileType): string =>
  `${p.birth.calendar === 'lunar' ? '음력 ' : ''}${p.birth.year}.${p.birth.month}.${p.birth.day}${p.birth.leapMonth ? '(윤)' : ''}${p.birth.hour === null ? ' 시간 모름' : ` ${pad(p.birth.hour)}:${pad(p.birth.minute ?? 0)}`} · ${p.birth.gender === 'M' ? '남' : '여'}`;

const confirmDelete = (title: string, onConfirm: () => void) =>
  Alert.alert(title, '삭제하면 되돌릴 수 없어요.', [
    { text: '취소', style: 'cancel' },
    { text: '삭제', style: 'destructive', onPress: onConfirm },
  ]);

const ProfileRow = ({ profile }: { profile: SajuProfileType }) => {
  const del = useDeleteSajuProfile();
  const upsert = useUpsertSajuProfile();
  return (
    <Glass style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={profile.isPrimary ? '내 사주' : '내 사주로 지정'}
        disabled={profile.isPrimary || upsert.isPending}
        onPress={() => upsert.mutate({ id: profile.id, input: { label: profile.label, birth: profile.birth, isPrimary: true } })}
        hitSlop={8}
      >
        <Icon name={profile.isPrimary ? 'star' : 'star-outline'} size={20} color={profile.isPrimary ? SJ.gold : ink(0.45)} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{profile.label}</Text>
        <Muted size={12}>{fmtBirth(profile)}</Muted>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="프로필 삭제" disabled={del.isPending} onPress={() => confirmDelete(`'${profile.label}' 프로필을 삭제할까요?`, () => del.mutate(profile.id))} hitSlop={8}>
        <Icon name="trash-can-outline" size={19} color={ink(0.45)} />
      </Pressable>
    </Glass>
  );
};

const AskedRow = ({ item }: { item: SajuReadingSummaryType }) => {
  const del = useDeleteSajuReading();
  const [open, setOpen] = useState(false);
  const a = item.ask;
  if (!a) return null;
  return (
    <Glass style={styles.askRow}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={{ flexDirection: 'row', gap: 10 }}>
        <Pill style={{ alignSelf: 'flex-start' }}>{a.topicKo}</Pill>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: SJ.cream }}>{a.question || `${a.topicKo} — ${a.whenKo}`}</Text>
          <Muted>
            {a.whenKo} · {a.verdictKo}
          </Muted>
          {open ? (
            <Para style={{ fontSize: 13, lineHeight: 20, color: ink(0.85) }}>{a.answer}</Para>
          ) : (
            <Text style={{ fontSize: 12, lineHeight: 17, color: ink(0.6) }} numberOfLines={1}>
              {a.answer}
            </Text>
          )}
          <Muted size={11} dim={0.45}>
            {fmtDate(item.createdAt)}
          </Muted>
        </View>
      </Pressable>
      {open ? (
        <View style={{ alignItems: 'flex-end' }}>
          <TextButton label="삭제" icon="trash-can-outline" color={ink(0.55)} disabled={del.isPending} onPress={() => confirmDelete('이 질문을 삭제할까요?', () => del.mutate(item.id))} />
        </View>
      ) : null}
    </Glass>
  );
};

const ReadingRow = ({ item }: { item: SajuReadingSummaryType }) => {
  const del = useDeleteSajuReading();
  return (
    <Glass style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${item.keyword || item.dayMaster} 풀이 보기`} onPress={() => router.push(`/saju-c/me/${item.id}` as never)} style={styles.rowMain}>
        <Text style={styles.dayGlyph}>{item.dayMaster.slice(-1)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>
            {item.keyword || item.dayMaster}
            <Text style={{ fontFamily: undefined, fontSize: 12, fontWeight: '400', color: ink(0.55) }}>
              {'  '}
              {item.signature}
              {item.source === 'static' ? ' · 기본 풀이' : ''}
            </Text>
          </Text>
          <Muted size={12}>{fmtDate(item.createdAt)}</Muted>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="기록 삭제" disabled={del.isPending} onPress={() => confirmDelete('이 풀이를 삭제할까요?', () => del.mutate(item.id))} hitSlop={8}>
        <Icon name="trash-can-outline" size={19} color={ink(0.45)} />
      </Pressable>
    </Glass>
  );
};

export default function MySajuScreen() {
  const loggedIn = useAuthStore((s) => !!s.token);
  const profiles = useSajuProfiles();
  const query = useMySajuReadingsInfinite(20);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  // 사주에 묻기 — 답까지 목록에서 바로 본다.
  const asked = useMySajuReadingsInfinite(20, 'question');
  const askedItems = asked.data?.pages.flatMap((p) => p.items) ?? [];
  const profileItems = profiles.data?.items ?? [];

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: true, title: '내 사주 기록', headerStyle: { backgroundColor: SJ.bg }, headerTintColor: SJ.cream, headerTitleStyle: { color: SJ.cream }, headerShadowVisible: false }} />
      <LinearGradient colors={['#1c1a22', SJ.bg]} locations={[0, 0.6]} style={StyleSheet.absoluteFill} />
      {!loggedIn ? (
        <View style={styles.center}>
          <Text style={styles.h1}>로그인하면 풀이가 저장돼요</Text>
          <Muted size={13} dim={0.6} style={{ textAlign: 'center' }}>
            회원은 사주 프로필과 본 풀이·물어본 것이 계정에 남아 어느 기기에서든 다시 볼 수 있어요.
          </Muted>
          <PrimaryButton label="로그인" icon="login" onPress={() => router.push('/(auth)/login' as never)} style={{ alignSelf: 'stretch' }} />
          <OutlineButton label="사주 보러 가기" icon="star-four-points-outline" onPress={() => router.dismissTo('/saju-c')} style={{ alignSelf: 'stretch' }} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} testID="saju-me">
          <View style={styles.head}>
            <Muted size={13} dim={0.6} style={{ flex: 1 }}>
              프로필과 로그인 상태로 본 풀이가 저장돼요.
            </Muted>
            <OutlineButton label="사주 보기" icon="star-four-points-outline" color={SJ.gold} onPress={() => router.dismissTo('/saju-c')} />
          </View>

          <Text style={styles.h2}>프로필</Text>
          {profiles.isLoading ? (
            <ActivityIndicator color={SJ.gold} />
          ) : profileItems.length === 0 ? (
            <Muted size={13} dim={0.55}>
              저장된 프로필이 없어요. 사주 화면에서 &quot;이 계정에 저장&quot; 을 켜면 여기 남아요.
            </Muted>
          ) : (
            profileItems.map((p) => <ProfileRow key={p.id} profile={p} />)
          )}

          {askedItems.length > 0 ? (
            <>
              <View style={[styles.h2Row, { marginTop: 14 }]}>
                <Icon name="comment-question-outline" size={15} color={ink(0.6)} />
                <Text style={[styles.h2, { marginTop: 0 }]}>물어본 것</Text>
              </View>
              {askedItems.map((item) => (
                <AskedRow key={item.id} item={item} />
              ))}
              {asked.hasNextPage ? <TextButton label="더 보기" onPress={() => void asked.fetchNextPage()} disabled={asked.isFetchingNextPage} /> : null}
            </>
          ) : null}

          <Text style={[styles.h2, { marginTop: 14 }]}>풀이 기록</Text>
          {query.isLoading ? (
            <ActivityIndicator color={SJ.gold} style={{ paddingVertical: 32 }} />
          ) : query.isError ? (
            <Text style={styles.empty}>기록을 불러오지 못했어요.</Text>
          ) : items.length === 0 ? (
            <Text style={styles.empty}>아직 저장된 풀이가 없어요.</Text>
          ) : (
            items.map((item) => <ReadingRow key={item.id} item={item} />)
          )}
          {query.hasNextPage ? <OutlineButton label="더 보기" busy={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} style={{ alignSelf: 'center', marginTop: 6 }} /> : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SJ.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28 },
  h1: { fontFamily: SERIF, fontSize: 19, fontWeight: '700', color: SJ.cream },
  body: { padding: 16, gap: 8, paddingBottom: 40 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  h2: { marginTop: 4, fontSize: 13, fontWeight: '700', color: ink(0.6) },
  h2Row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  askRow: { padding: 12, gap: 6 },
  rowTitle: { fontFamily: SERIF, fontSize: 15, fontWeight: '700', color: SJ.cream },
  dayGlyph: { fontFamily: SERIF, fontSize: 26, color: SJ.cream, width: 30, textAlign: 'center' },
  empty: { paddingVertical: 32, textAlign: 'center', fontSize: 13, color: ink(0.55) },
});

