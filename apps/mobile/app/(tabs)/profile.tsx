import { Button, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useCurrentUser, useLogout } from '@repo/shared';

export default function ProfileScreen() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>프로필</Text>
      {user && (
        <>
          <Text>이름: {user.name}</Text>
          <Text>이메일: {user.email}</Text>
        </>
      )}
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
