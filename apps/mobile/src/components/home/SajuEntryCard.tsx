import { useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { SajuBirthInputType } from '@repo/api-contract';
import { useAuthStore, useSajuProfiles, useSajuProfileStore } from '@repo/shared';
import {
  computeSajuChart,
  dailyFortune,
  kstDayKey,
  SAJU_DAY_TAG_LABEL,
  type SajuDailyFortune,
} from '@repo/utils';

// 홈 "사주(C)로 나를 읽기" 카드 — 웹 홈 진입 카드의 앱판. 풀이 화면은 네이티브 사주 화면(app/saju-c)이다.
// 가운데 "오늘의 운세" 줄은 저장된 프로필로 앱이 utils 엔진(computeSajuChart·dailyFortune)을 직접 돌려
// 별점·태그를 기기에서 계산한다 — 네트워크·LLM·한도 소비가 없다. 프로필 출처는
//  - 회원: 서버 프로필(★ primary 우선, 없으면 첫 번째)
//  - 게스트: 사주 화면에서 "이 기기에 저장" 한 로컬 프로필(shared 스토어, AsyncStorage)
// 누르면 사주 화면의 오늘 탭(`?tool=daily`)으로 이어져 LLM 본문·조언·좋은 시간대를 본다.

const GOLD = '#d9b65b';
const INK = '#ece6d6';
const CREAM = '#f3e9c6';

interface HomeSajuProfile {
  label: string;
  birth: SajuBirthInputType;
}

// 스토어/쿼리 결과의 객체 참조를 그대로 돌려줘 아래 useMemo 의존성이 렌더마다 흔들리지 않는다.
const useHomeSajuProfile = (): { profile: HomeSajuProfile | null; loading: boolean } => {
  const loggedIn = useAuthStore((s) => !!s.token && !s.isGuest);
  const server = useSajuProfiles();
  const local = useSajuProfileStore(
    (s) => s.profiles.find((p) => p.id === s.primaryId) ?? s.profiles[0] ?? null,
  );
  if (loggedIn) {
    const items = server.data?.items ?? [];
    return { profile: items.find((p) => p.isPrimary) ?? items[0] ?? null, loading: server.isLoading };
  }
  return { profile: local, loading: false };
};

// KST 날짜 키. 앱이 다시 활성화될 때 갱신해, 자정을 넘긴 뒤 홈으로 돌아오면 새 날의 운세를 계산한다.
const useKstDayKey = (): string => {
  const [key, setKey] = useState(() => kstDayKey());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setKey(kstDayKey());
    });
    return () => sub.remove();
  }, []);
  return key;
};

const Stars = ({ n }: { n: 1 | 2 | 3 | 4 | 5 }) => (
  <View style={styles.stars} accessibilityLabel={`별 ${n}개`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <MaterialCommunityIcons key={i} name={i <= n ? 'star' : 'star-outline'} size={14} color={GOLD} />
    ))}
  </View>
);

const DailyPreview = ({ profile, dayKey }: { profile: HomeSajuProfile; dayKey: string }) => {
  const router = useRouter();
  const fortune = useMemo<SajuDailyFortune | null>(() => {
    try {
      // dayKey 의 정오(KST)를 기준일로 — 날짜가 바뀌면 다시 계산된다.
      return dailyFortune(computeSajuChart(profile.birth), new Date(`${dayKey}T12:00:00+09:00`));
    } catch {
      // 지원 범위 밖 입력 등 계산 실패 — 오늘 줄만 숨기고 진입 버튼은 그대로 둔다.
      return null;
    }
  }, [profile.birth, dayKey]);
  if (!fortune) return null;
  const { day } = fortune;
  return (
    <Pressable
      onPress={() => router.push('/saju-c?tool=daily' as never)}
      android_ripple={{ color: `${GOLD}22` }}
      style={({ pressed }) => [styles.daily, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${profile.label}의 오늘의 운세, ${fortune.headline}, 별 ${day.stars}개. 자세히 보기`}
    >
      <View style={styles.dailyTop}>
        <Text style={styles.dailyEyebrow} numberOfLines={1}>
          {profile.label}의 오늘 · {day.ko}({day.hanja})일
        </Text>
        <Stars n={day.stars} />
      </View>
      <Text style={styles.dailyHeadline} numberOfLines={1}>
        {fortune.headline}
      </Text>
      {day.tags.length > 0 && (
        <View style={styles.tagRow}>
          {day.tags.slice(0, 3).map((t) => (
            <Text key={t} style={styles.tag} numberOfLines={1}>
              {SAJU_DAY_TAG_LABEL[t]}
            </Text>
          ))}
        </View>
      )}
      <Text style={styles.dailyHint}>기기에서 바로 계산했어요 · 풀이와 조언은 눌러서 보기 →</Text>
    </Pressable>
  );
};

export const SajuEntryCard = () => {
  const router = useRouter();
  const { profile, loading } = useHomeSajuProfile();
  const dayKey = useKstDayKey();
  return (
    <View style={[styles.card, { borderColor: `${GOLD}66` }]} accessibilityRole="summary">
      <View style={styles.header}>
        <Text style={styles.emoji} accessibilityElementsHidden>
          🧧
        </Text>
        <View style={styles.headerText}>
          <Text style={styles.title}>사주(C)로 나를 읽기</Text>
          <Text style={styles.subtitle}>생년월일로 세우는 사주팔자, 인연·재물·직업 테마, "만약에" 묻기, 궁합, 오늘의 운세. 로그인 없이 무료.</Text>
        </View>
      </View>
      {profile ? (
        <DailyPreview profile={profile} dayKey={dayKey} />
      ) : loading ? null : (
        <Text style={styles.hint}>사주를 한 번 세워 두면 홈에서 오늘의 운세를 바로 볼 수 있어요.</Text>
      )}
      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push('/saju-c' as never)}
          android_ripple={{ color: `${GOLD}33` }}
          style={({ pressed }) => [styles.action, styles.actionPrimary, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name="star-four-points-outline" size={16} color="#1a1408" />
          <Text style={styles.actionPrimaryText}>사주 보기</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/saju-c?tool=daily' as never)}
          android_ripple={{ color: `${GOLD}33` }}
          style={({ pressed }) => [styles.action, styles.actionGhost, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name="weather-sunny" size={16} color={GOLD} />
          <Text style={styles.actionGhostText}>오늘의 운세</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/saju-c?tool=ask' as never)}
          android_ripple={{ color: `${GOLD}33` }}
          style={({ pressed }) => [styles.action, styles.actionGhost, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name="comment-question-outline" size={16} color={GOLD} />
          <Text style={[styles.actionGhostText, { color: INK }]}>사주에 묻기</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#15151c',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { fontSize: 28 },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '700', color: CREAM },
  subtitle: { fontSize: 12, lineHeight: 17, color: `${INK}B3` },
  daily: {
    marginTop: 12,
    padding: 12,
    gap: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${GOLD}55`,
    backgroundColor: '#0f0f16',
  },
  dailyTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dailyEyebrow: { flex: 1, fontSize: 11, color: GOLD },
  stars: { flexDirection: 'row', gap: 1 },
  dailyHeadline: { fontSize: 15, fontWeight: '700', color: CREAM },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    fontSize: 10,
    color: `${INK}B3`,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${INK}40`,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  dailyHint: { fontSize: 11, color: `${INK}8C` },
  hint: { marginTop: 12, fontSize: 11, lineHeight: 16, color: `${INK}8C` },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 10,
  },
  actionPrimary: { backgroundColor: GOLD },
  actionPrimaryText: { fontSize: 14, fontWeight: '700', color: '#1a1408' },
  actionGhost: { borderWidth: 1, borderColor: `${GOLD}80` },
  actionGhostText: { fontSize: 14, fontWeight: '600', color: INK },
  pressed: { opacity: 0.8 },
});
