import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  SegmentedControl,
  useAuthStore,
  useCurrentUser,
  useLogout,
  useTheme,
} from '@repo/shared';
import { NotchFade } from '~/components/NotchFade';
import { useTabBarHeight } from '~/hooks/useTabBarHeight';
import { useThemeStore, type ThemeMode } from '~/lib/themeStore';

const THEME_OPTIONS: ReadonlyArray<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
  { value: 'system', label: '시스템' },
];

type Row = {
  key: string;
  icon: string;
  label: string;
  hint?: string;
  onPress?: () => void;
  danger?: boolean;
};

// 프로필 탭 — 게스트/로그인 두 상태를 한 화면으로 처리. 홈/맛집과 같은
// edge-to-edge + useSafeAreaInsets + NotchFade 패턴을 따라간다. 상단은 노치,
// 하단은 탭바(네이티브 BottomTabs — scene 을 풀블리드로 깔아 인셋을 자동으로
// 안 잡아줌) 높이만큼 useTabBarHeight 로 직접 비켜준다.
export default function ProfileScreen() {
  const { data: user } = useCurrentUser();
  const isGuest = useAuthStore((s) => s.isGuest);
  const clearSession = useAuthStore((s) => s.clearSession);
  const logout = useLogout();
  const router = useRouter();
  const theme = useTheme();
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const insets = useSafeAreaInsets();
  // 콘텐츠 끝이 하단 탭바 뒤로 안 가리게 그만큼 하단 패딩을 더한다.
  const tabBarH = useTabBarHeight();

  const goLogin = () => {
    clearSession();
    router.replace('/(auth)/login');
  };

  const onLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => router.replace('/(auth)/login'),
    });
  };

  const loggedIn = !!user && !isGuest;
  const heroInitial = loggedIn ? (user!.email[0]?.toUpperCase() ?? '?') : '🎲';
  const heroTitle = loggedIn
    ? user!.email
    : isGuest
      ? '게스트로 둘러보는 중'
      : '로그인이 필요해요';
  const heroSub = loggedIn
    ? '환영합니다 👋'
    : isGuest
      ? '로그인하면 픽 기록을 저장할 수 있어요'
      : '계속하려면 로그인하세요';

  const rows: Row[] = useMemo(() => {
    if (!loggedIn) {
      return [
        { key: 'about', icon: '🎲', label: 'Life Pickr 소개', hint: '서비스를 한 눈에' },
        { key: 'help', icon: '💬', label: '도움말 / 문의' },
      ];
    }
    return [
      {
        key: 'settlements',
        icon: '🧾',
        label: '내 정산 이력',
        onPress: () => router.push('/settlement/history'),
      },
      {
        key: 'contacts',
        icon: '👥',
        label: '내 단골',
        onPress: () => router.push('/settlement/contacts'),
      },
      { key: 'picks', icon: '⭐', label: '내 즐겨찾기', hint: '아직 비어 있어요' },
      { key: 'recent', icon: '🕓', label: '최근 본 식당' },
      { key: 'noti', icon: '🔔', label: '알림 설정' },
      { key: 'help', icon: '💬', label: '도움말 / 문의' },
    ];
  }, [loggedIn, router]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 24, paddingBottom: tabBarH + 32 },
        ]}
        scrollIndicatorInsets={{ top: insets.top }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: loggedIn ? theme.colors.primary : theme.colors.surfaceAlt,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.avatarText,
                { color: loggedIn ? theme.colors.primaryText : theme.colors.text },
              ]}
            >
              {heroInitial}
            </Text>
          </View>

          <Text
            style={[styles.heroTitle, { color: theme.colors.text }]}
            numberOfLines={1}
          >
            {heroTitle}
          </Text>
          <Text style={[styles.heroSub, { color: theme.colors.textMuted }]}>
            {heroSub}
          </Text>

          {!loggedIn && (
            <Pressable
              onPress={goLogin}
              style={({ pressed }) => [
                styles.cta,
                {
                  backgroundColor: pressed
                    ? theme.colors.primaryHover
                    : theme.colors.primary,
                },
              ]}
              android_ripple={{ color: theme.colors.primaryHover }}
            >
              <Text style={[styles.ctaText, { color: theme.colors.primaryText }]}>
                로그인 / 회원가입
              </Text>
            </Pressable>
          )}
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          {rows.map((row, i) => (
            <Pressable
              key={row.key}
              onPress={row.onPress}
              android_ripple={{ color: theme.colors.surfaceAlt }}
              style={({ pressed }) => [
                styles.row,
                i > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.colors.border,
                },
                pressed && row.onPress
                  ? { backgroundColor: theme.colors.surfaceAlt }
                  : null,
              ]}
            >
              <Text style={styles.rowIcon}>{row.icon}</Text>
              <View style={styles.rowMid}>
                <Text
                  style={[
                    styles.rowLabel,
                    { color: row.danger ? theme.colors.danger : theme.colors.text },
                  ]}
                >
                  {row.label}
                </Text>
                {row.hint && (
                  <Text style={[styles.rowHint, { color: theme.colors.textMuted }]}>
                    {row.hint}
                  </Text>
                )}
              </View>
              {!row.danger && (
                <Text style={[styles.chev, { color: theme.colors.textMuted }]}>›</Text>
              )}
            </Pressable>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
            화면 모드
          </Text>
          <SegmentedControl
            value={themeMode}
            options={THEME_OPTIONS}
            onChange={setThemeMode}
            fullWidth
          />
        </View>

        {loggedIn && (
          <Pressable
            onPress={onLogout}
            disabled={logout.isPending}
            style={({ pressed }) => [
              styles.logout,
              {
                backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent',
                borderColor: theme.colors.border,
                opacity: logout.isPending ? 0.6 : 1,
              },
            ]}
            android_ripple={{ color: theme.colors.surfaceAlt }}
          >
            <Text style={[styles.logoutText, { color: theme.colors.danger }]}>
              {logout.isPending ? '로그아웃 중…' : '로그아웃'}
            </Text>
          </Pressable>
        )}

        <Text style={[styles.version, { color: theme.colors.textMuted }]}>
          Life Pickr · v0.1
        </Text>
      </ScrollView>

      <NotchFade />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 16 },
  hero: { alignItems: 'center', paddingVertical: 8 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarText: { fontSize: 36, fontWeight: '700' },
  heroTitle: { fontSize: 18, fontWeight: '700' },
  heroSub: { fontSize: 13, marginTop: 4 },
  cta: {
    marginTop: 18,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  ctaText: { fontSize: 15, fontWeight: '600' },
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  section: { gap: 8 },
  sectionLabel: { fontSize: 12, fontWeight: '600', paddingHorizontal: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  rowIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  rowMid: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  rowHint: { fontSize: 12, marginTop: 2 },
  chev: { fontSize: 22, fontWeight: '300' },
  logout: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: { fontSize: 15, fontWeight: '600' },
  version: { fontSize: 12, textAlign: 'center', marginTop: 8 },
});
