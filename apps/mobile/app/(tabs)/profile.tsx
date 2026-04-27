import { Button, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore, useCurrentUser, useLogout } from '@repo/shared';

export default function ProfileScreen() {
  const { data: user } = useCurrentUser();
  const isGuest = useAuthStore((s) => s.isGuest);
  const clearSession = useAuthStore((s) => s.clearSession);
  const logout = useLogout();
  const router = useRouter();

  if (isGuest) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>프로필</Text>
        <Text>게스트로 이용 중입니다.</Text>
        <Text>저장하려면 로그인 또는 회원가입하세요.</Text>
        <View style={{ marginTop: 24 }}>
          <Button
            title="로그인 / 회원가입"
            onPress={() => {
              clearSession();
              router.replace('/(auth)/login');
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>프로필</Text>
      {user && <Text>이메일: {user.email}</Text>}
      <View style={{ marginTop: 24 }}>
        <Button
          title="로그아웃"
          onPress={() =>
            logout.mutate(undefined, {
              onSuccess: () => router.replace('/(auth)/login'),
            })
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 8 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
});
