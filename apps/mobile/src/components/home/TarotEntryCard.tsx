import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@repo/shared';

// 홈 "타로로 골라 보기" 카드 — 웹 홈 진입 카드의 앱판. 타로는 WebView 임베드(app/tarot)로 열린다.
// 왼쪽은 일반 타로(설정 화면부터), 오른쪽은 메뉴 타로로 바로.

const GOLD = '#d9b65b';
const INK = '#ece6d6';

export const TarotEntryCard = () => {
  const theme = useTheme();
  const router = useRouter();
  return (
    <View style={[styles.card, { borderColor: `${GOLD}66` }]} accessibilityRole="summary">
      <View style={styles.header}>
        <Text style={styles.emoji} accessibilityElementsHidden>
          🔮
        </Text>
        <View style={styles.headerText}>
          <Text style={styles.title}>타로로 골라 보기</Text>
          <Text style={styles.subtitle}>오늘의 카드, 세 장 리딩, 선택 타로, 오늘 뭐 먹지 메뉴 타로. 로그인 없이 무료.</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push('/tarot' as never)}
          android_ripple={{ color: `${GOLD}33` }}
          style={({ pressed }) => [styles.action, styles.actionPrimary, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name="cards-outline" size={16} color="#1a1408" />
          <Text style={styles.actionPrimaryText}>타로 보기</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/tarot?spread=menu' as never)}
          android_ripple={{ color: `${GOLD}33` }}
          style={({ pressed }) => [styles.action, styles.actionGhost, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name="silverware-fork-knife" size={16} color={GOLD} />
          <Text style={[styles.actionGhostText, { color: theme.mode === 'dark' ? INK : INK }]}>메뉴 타로</Text>
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
    backgroundColor: '#0b1030',
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
