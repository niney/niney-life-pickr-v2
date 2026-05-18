import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  Divider,
  ErrorBanner,
  Input,
  SegmentedControl,
  Stack,
  useAuthStore,
  useLogin,
  useRegister,
  useTheme,
} from '@repo/shared';

type Mode = 'login' | 'register';

const modeOptions = [
  { value: 'login' as const, label: '로그인' },
  { value: 'register' as const, label: '회원가입' },
];

// 로그인 / 회원가입 — SegmentedControl 로 모드 토글. (auth) 스택에는 탭바가
// 없어서 상/하단 safe-area 를 직접 잡아준다. 홈/맛집과 동일한 패턴:
// useSafeAreaInsets + ScrollView contentContainerStyle.paddingTop·Bottom.
// 키보드가 올라오면 KeyboardAvoidingView 가 입력 필드를 밀어 올린다.
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const register = useRegister();
  const enterGuest = useAuthStore((s) => s.enterGuest);

  const mutation = mode === 'login' ? login : register;

  const submit = () => {
    mutation.mutate(
      { email, password },
      {
        onSuccess: () => router.replace('/(tabs)/home'),
        onError: (err) =>
          Alert.alert(mode === 'login' ? '로그인 실패' : '가입 실패', err.message),
      },
    );
  };

  const onGuest = () => {
    enterGuest();
    router.replace('/(tabs)/home');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: insets.top + 24,
              paddingBottom: insets.bottom + 24,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Text style={styles.logo}>🎲</Text>
            <Text style={[styles.title, { color: theme.colors.text }]}>Life Pickr</Text>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
              고민될 땐, 대신 골라드릴게요
            </Text>
          </View>

          <Stack gap="md">
            <Button variant="primary" size="lg" fullWidth onPress={onGuest}>
              바로 시작하기 →
            </Button>

            <Divider label="또는" />

            <SegmentedControl value={mode} options={modeOptions} onChange={setMode} />

            <Input
              value={email}
              onChangeText={setEmail}
              placeholder="이메일"
              type="email"
            />
            <Input
              value={password}
              onChangeText={setPassword}
              placeholder={mode === 'register' ? '비밀번호 (8자 이상)' : '비밀번호'}
              type="password"
              onSubmit={submit}
            />
            {mutation.isError && <ErrorBanner message={mutation.error.message} />}
            <Button
              variant="secondary"
              fullWidth
              loading={mutation.isPending}
              onPress={submit}
            >
              {mode === 'login' ? '로그인' : '가입하기'}
            </Button>
          </Stack>

          <Pressable onPress={onGuest} style={styles.skipRow} hitSlop={8}>
            <Text style={[styles.skipText, { color: theme.colors.textMuted }]}>
              계정 없이 둘러볼게요
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    gap: 24,
    justifyContent: 'center',
  },
  hero: { alignItems: 'center' },
  logo: { fontSize: 48, marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 14, marginTop: 6 },
  skipRow: { alignItems: 'center', paddingVertical: 8 },
  skipText: { fontSize: 13, textDecorationLine: 'underline' },
});
