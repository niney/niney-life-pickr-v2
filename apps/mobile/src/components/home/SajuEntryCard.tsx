import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@repo/shared';

// 홈 "사주로 나를 읽기" 카드 — 웹 홈 진입 카드의 앱판. 타로는 WebView 임베드(app/tarot)로 열린다.
// 왼쪽은 일반 타로(설정 화면부터), 오른쪽은 오늘의 운세로 바로.

const GOLD = '#d9b65b';
const INK = '#ece6d6';

export const SajuEntryCard = () => {
  const theme = useTheme();
  const router = useRouter();
  return (
    <View style={[styles.card, { borderColor: `${GOLD}66` }]} accessibilityRole="summary">
      <View style={styles.header}>
        <Text style={styles.emoji} accessibilityElementsHidden>
          🔮
        </Text>
        <View style={styles.headerText}>
          <Text style={styles.title}>사주(C)로 나를 읽기</Text>
          <Text style={styles.subtitle}>생년월일로 세우는 사주팔자, 오늘의 운세, 택일, 궁합, 오행 음식. 로그인 없이 무료.</Text>
        </View>
      </View>
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
          <Text style={[styles.actionGhostText, { color: theme.mode === 'dark' ? INK : INK }]}>오늘의 운세</Text>
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
  title: { fontSize: 16, fontWeight: '700', color: '#f3e9c6' },
  subtitle: { fontSize: 12, lineHeight: 17, color: `${INK}B3` },
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
  actionGhostText: { fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.8 },
});
