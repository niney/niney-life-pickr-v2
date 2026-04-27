import { useState } from 'react';
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLogin } from '@repo/shared';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const router = useRouter();

  const onSubmit = () => {
    login.mutate(
      { email, password },
      {
        onSuccess: () => router.replace('/(tabs)/home'),
        onError: (err) => Alert.alert('로그인 실패', err.message),
      },
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Life Pickr</Text>
      <TextInput
        style={styles.input}
        placeholder="email"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Button
        title={login.isPending ? '로그인 중…' : '로그인'}
        onPress={onSubmit}
        disabled={login.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center', gap: 12 },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
});
